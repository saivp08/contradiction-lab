"""Rule-based ingestion of research-paper PDFs into structured, provenance-carrying evidence.

Everything here is deterministic parsing of the papers' actual contents: no language model, no
fabrication. Quotes are exact sentences from the PDF text layer; anything not found is null/unknown.
"""

import hashlib
import io
import json
import re
from datetime import date

from pypdf import PdfReader

from backend.models import Citation, Evidence

MAX_PAGES = 80
MAX_CLAIMS = 40

SECTION_HEADERS = {
    "abstract": "abstract",
    "introduction": "introduction",
    "background": "introduction",
    "methods": "methods",
    "method": "methods",
    "materials and methods": "methods",
    "study design": "methods",
    "results": "results",
    "findings": "results",
    "discussion": "discussion",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
    "limitations": "limitations",
    "references": "references",
    "bibliography": "references",
    "acknowledgements": "references",
    "acknowledgments": "references",
}
PRIORITY = {"results": 3.0, "abstract": 2.0, "conclusion": 1.6, "discussion": 1.3, "limitations": 1.0}

POSITIVE = r"increas\w+|higher|greater|improv\w+|enhanc\w+|promot\w+|positively associated|positive association|rose|larger|more likely|upregulat\w+"
NEGATIVE = r"decreas\w+|lower(ed)?|reduc\w+|fewer|inhibit\w+|suppress\w+|negatively associated|negative association|declin\w+|less likely|smaller|downregulat\w+|impair\w+"
NULL = r"no significant|not significant\w*|did not significantly|no (association|difference|effect|evidence|measurable)|did not (differ|change|affect|improve|alter)|failed to|was not supported|is not supported|similar between"
STATS = r"p\s*[<=>]\s*0?\.\d+|r\s*=\s*-?0?\.\d+|\d+(\.\d+)?\s*%\s*ci|95\s*%\s*ci|or\s*=\s*\d|hr\s*=\s*\d|β\s*=|beta\s*=\s*-?\d|mean difference|effect size|n\s*=\s*\d+"

STOPWORDS = set(
    """a an and are as at be been between both but by can compared comparison could did do does during each
    for from group groups had has have in into is it its may more most no not of on or our than that the
    their there these this those to two under using was we were which while with within without these study
    studies trial data found while however among across also after before per our its all one versus vs
    relative report reported significantly significant change changed changes effect effects relationship
    association associated findings finding results result observed measured mean point points composite baseline modestly measurable corresponding""".split()
)
DIRECTION_WORDS = set(
    re.findall(r"[a-z]+", POSITIVE + " " + NEGATIVE + " " + NULL.replace("(", " ").replace(")", " ").replace("|", " "))
)

POPULATION_TERMS = """young adults older adults adolescents children elderly women men female male patients
    participants volunteers students nurses workers mice rats humans infants athletes smokers cells plots
    soils soil forests""".split()
DESIGN_TERMS = """randomized placebo double-blind crossover parallel cohort observational survey field
    longitudinal retrospective prospective in-vitro in-vivo meta-analysis simulation""".split()

ABBREVIATIONS = ["et al.", "e.g.", "i.e.", "vs.", "Fig.", "fig.", "No.", "approx.", "ca.", "cf."]


class PaperError(ValueError):
    """User-facing ingestion failure (malformed, image-only, oversized)."""


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _pages_text(blob: bytes) -> list[str]:
    try:
        reader = PdfReader(io.BytesIO(blob))
        pages = [page.extract_text() or "" for page in reader.pages[:MAX_PAGES]]
    except Exception as error:
        raise PaperError(f"Could not parse this file as a PDF ({type(error).__name__}).") from error
    if sum(len(re.findall(r"[A-Za-z]", p)) for p in pages) < 200:
        raise PaperError(
            "This PDF has no extractable text layer (likely scanned/image-only). OCR is not supported in this build."
        )
    return pages


def _header_of(line: str) -> str | None:
    bare = re.sub(r"^\d+(\.\d+)*\.?\s*", "", line.strip()).rstrip(":").strip()
    if len(bare) > 40:
        return None
    key = bare.lower()
    if key in SECTION_HEADERS and (bare.isupper() or bare.istitle() or line.strip().isupper()):
        return SECTION_HEADERS[key]
    return None


def _sections(pages: list[str]) -> tuple[list[dict], list[str]]:
    """Split lines into (section, page, paragraph) chunks; also return figure/table captions."""
    chunks: list[dict] = []
    captions: list[str] = []
    current = "front"
    for page_number, text in enumerate(pages, start=1):
        buffer: list[str] = []

        def flush():
            if buffer:
                chunks.append({"section": current, "page": page_number, "text": " ".join(buffer)})
                buffer.clear()

        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                flush()
                continue
            if re.match(r"^(Table|Figure|Fig\.?)\s*\d+", stripped):
                captions.append(stripped)
            header = _header_of(stripped)
            if header:
                flush()
                current = header
                continue
            if current == "references":
                continue
            buffer.append(stripped)
        flush()
    return chunks, captions


def _sentences(paragraph: str) -> list[str]:
    masked = paragraph
    for i, abbreviation in enumerate(ABBREVIATIONS):
        masked = masked.replace(abbreviation, f"\x00{i}\x00")
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", masked)
    out = []
    for part in parts:
        for i, abbreviation in enumerate(ABBREVIATIONS):
            part = part.replace(f"\x00{i}\x00", abbreviation)
        part = part.strip()
        if 25 <= len(part) <= 500:
            out.append(part)
    return out


def _direction(sentence: str) -> str:
    lowered = sentence.lower()
    if re.search(NULL, lowered):
        return "null"
    positive = bool(re.search(POSITIVE, lowered))
    negative = bool(re.search(NEGATIVE, lowered))
    if positive and negative:
        return "mixed"
    if positive:
        return "positive"
    if negative:
        return "negative"
    return "none"


def _terms(sentence: str) -> list[str]:
    tokens = re.findall(r"[a-z][a-z-]{2,}", sentence.lower())
    out = []
    for token in tokens:
        if token in STOPWORDS or token in DIRECTION_WORDS:
            continue
        if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
            token = token[:-1]
        out.append(token)
    return sorted(set(out))


def _metadata(pages: list[str], reader_meta: dict) -> dict:
    first = [line.strip() for line in pages[0].splitlines() if line.strip()][:12]
    title = next((line for line in first if len(line) >= 15 and not line.isupper()), None)
    if not title and reader_meta.get("title"):
        title = str(reader_meta["title"])
    authors_line = None
    if title and title in first:
        index = first.index(title)
        for candidate in first[index + 1 : index + 3]:
            if re.search(r"\d{4}|DOI|@", candidate):
                continue
            if "," in candidate or " and " in candidate:
                authors_line = candidate
                break
    authors = [a.strip() for a in re.split(r",| and ", authors_line) if a.strip()] if authors_line else []
    head = "\n".join(first)
    year_match = re.search(r"\b(19|20)\d{2}\b", head)
    doi_match = re.search(r"\b10\.\d{4,9}/[^\s,;]+", head) or re.search(r"\b10\.\d{4,9}/[^\s,;]+", pages[0])
    arxiv = re.search(r"arXiv:\s*(\d{4}\.\d{4,5})", pages[0], re.IGNORECASE)
    journal = None
    for line in first:
        if re.search(r"\b(19|20)\d{2}\b", line) and ("," in line):
            journal = line.split(",")[0].strip()
            break
    return {
        "title": title or "Title not extracted",
        "authors": authors,
        "year": int(year_match.group()) if year_match else None,
        "journal": journal,
        "doi": doi_match.group().rstrip(".") if doi_match else None,
        "arxiv": arxiv.group(1) if arxiv else None,
    }


def ingest(blob: bytes, filename: str = "paper.pdf") -> dict:
    """Parse one PDF into metadata, sections, and provenance-carrying claim candidates."""
    if len(blob) > 25 * 1024 * 1024:
        raise PaperError("PDF is larger than the 25 MB limit.")
    pages = _pages_text(blob)
    try:
        info = PdfReader(io.BytesIO(blob)).metadata or {}
        reader_meta = {"title": info.get("/Title")}
    except Exception:
        reader_meta = {}
    chunks, captions = _sections(pages)
    meta = _metadata(pages, reader_meta)
    sample = None
    for chunk in chunks:
        if chunk["section"] in {"methods", "abstract", "front"}:
            for match in re.findall(r"n\s*=\s*(\d{1,7})", chunk["text"], re.IGNORECASE):
                sample = max(sample or 0, int(match))
    claims = []
    for chunk in chunks:
        if chunk["section"] in {"front", "references", "introduction"}:
            continue
        for sentence in _sentences(chunk["text"]):
            direction = _direction(sentence)
            if direction == "none":
                continue
            stats = [match.group() for match in re.finditer(STATS, sentence, re.IGNORECASE)]
            score = PRIORITY.get(chunk["section"], 0.6) * (1.6 if stats else 1.0)
            claims.append(
                {
                    "text": sentence,
                    "section": chunk["section"],
                    "page": chunk["page"],
                    "direction": direction,
                    "stats": stats[:6],
                    "terms": _terms(sentence),
                    "score": round(score, 3),
                }
            )
    claims.sort(key=lambda c: -c["score"])
    sections_found = sorted({c["section"] for c in chunks if c["section"] != "front"})
    warnings = []
    if meta["title"] == "Title not extracted":
        warnings.append("Title could not be extracted; please verify.")
    if not meta["doi"]:
        warnings.append("No DOI found in the document.")
    if not claims:
        warnings.append("No directional claim sentences were detected.")
    return {
        "id": sha256(blob),
        "filename": filename,
        "pages": len(pages),
        "meta": meta,
        "sample_size": sample,
        "sections": sections_found,
        "captions": captions[:10],
        "methods_excerpt": next((c["text"][:400] for c in chunks if c["section"] == "methods"), None),
        "limitations": [s for c in chunks if c["section"] == "limitations" for s in _sentences(c["text"])][:3],
        "claims": claims[:MAX_CLAIMS],
        "warnings": warnings,
    }


def _similarity(a: dict, b: dict) -> float:
    sa, sb = set(a["terms"]), set(b["terms"])
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _pair_kind(da: str, db: str) -> str:
    directions = {da, db}
    if directions == {"positive", "negative"}:
        return "opposed"
    if "null" in directions and directions & {"positive", "negative"}:
        return "tension"
    if da == db and da in {"positive", "negative"}:
        return "aligned"
    return "unclear"


PAIR_WEIGHT = {"opposed": 1.0, "tension": 0.85, "aligned": 0.25, "unclear": 0.1}


def rank_pairs(claims_a: list[dict], claims_b: list[dict], limit: int = 12) -> list[dict]:
    pairs = []
    for ia, a in enumerate(claims_a):
        for ib, b in enumerate(claims_b):
            similarity = _similarity(a, b)
            if similarity <= 0:
                continue
            kind = _pair_kind(a["direction"], b["direction"])
            stats_bonus = 1 + 0.15 * (bool(a["stats"]) + bool(b["stats"]))
            pairs.append(
                {
                    "a": ia,
                    "b": ib,
                    "similarity": round(similarity, 4),
                    "kind": kind,
                    "shared_terms": sorted(set(a["terms"]) & set(b["terms"])),
                    "rank_score": round(similarity * PAIR_WEIGHT[kind] * stats_bonus, 4),
                }
            )
    pairs.sort(key=lambda p: -p["rank_score"])
    return pairs[:limit]


def _condition_differences(paper_a: dict, paper_b: dict) -> list[dict]:
    def profile(paper: dict) -> dict:
        text = " ".join(c["text"] for c in paper["claims"]) + " " + (paper.get("methods_excerpt") or "")
        lowered = text.lower()
        populations = sorted({t for t in POPULATION_TERMS if re.search(rf"\b{t}\b", lowered)})
        designs = sorted({t for t in DESIGN_TERMS if t.replace("-", " ") in lowered or t in lowered})
        dose = sorted(set(re.findall(r"\b\d+\s*mg\b", lowered)))
        ages = sorted(set(re.findall(r"\bages?\s*\d+\s*[-–]\s*\d+\b", lowered)))
        return {
            "population": ", ".join(populations) or None,
            "age range": ", ".join(ages) or None,
            "design": ", ".join(designs) or None,
            "dose": ", ".join(dose) or None,
            "sample size": f"n = {paper['sample_size']}" if paper.get("sample_size") else None,
        }

    pa, pb = profile(paper_a), profile(paper_b)
    differences = []
    for field in pa:
        if pa[field] != pb[field]:
            differences.append({"field": field, "a": pa[field] or "not extracted", "b": pb[field] or "not extracted"})
    return differences


RELATIONSHIPS = {
    "direct": "direct contradiction",
    "context": "context-dependent disagreement",
    "complementary": "complementary findings",
    "incomparable": "insufficiently comparable",
    "none": "no meaningful contradiction",
}


def analyze(paper_a: dict, paper_b: dict) -> dict:
    """Full comparison report: aligned claims, relationship class, differences, and evidence pair."""
    pairs = rank_pairs(paper_a["claims"], paper_b["claims"])
    differences = _condition_differences(paper_a, paper_b)
    comparable = [p for p in pairs if p["similarity"] >= 0.18]
    best = next((p for p in comparable if p["kind"] in {"opposed", "tension"}), None)
    best_aligned = next((p for p in comparable if p["kind"] == "aligned"), None)
    if not comparable:
        relationship, defensible = RELATIONSHIPS["incomparable"], False
    elif best is None:
        relationship = RELATIONSHIPS["complementary"] if best_aligned else RELATIONSHIPS["none"]
        defensible = False
    elif best["similarity"] >= 0.5 and not differences:
        relationship, defensible = RELATIONSHIPS["direct"], True
    elif best["similarity"] >= 0.25:
        relationship, defensible = RELATIONSHIPS["context"], True
    else:
        relationship, defensible = RELATIONSHIPS["none"], False
    report = {
        "analysis_id": "analysis-" + sha256((paper_a["id"] + paper_b["id"]).encode())[:12],
        "created_at": date.today().isoformat(),
        "engine": "rule-based parser (no LLM); exact quotes with page provenance",
        "papers": [
            {k: paper[k] for k in ("id", "filename", "pages", "meta", "sample_size", "sections", "warnings")}
            for paper in (paper_a, paper_b)
        ],
        "claims_a": paper_a["claims"],
        "claims_b": paper_b["claims"],
        "methods": {"a": paper_a.get("methods_excerpt"), "b": paper_b.get("methods_excerpt")},
        "limitations": {"a": paper_a.get("limitations", []), "b": paper_b.get("limitations", [])},
        "pairs": pairs,
        "best_pair": best,
        "condition_differences": differences,
        "relationship": relationship,
        "defensible_contradiction": defensible,
        "caveats": [
            "Claims are extracted by deterministic text rules; verify quotes against the PDFs.",
            "Comparability is judged from terminology overlap, not deep semantics.",
        ],
    }
    if defensible and best is not None:
        report["evidence"] = [
            _to_evidence(paper_a, paper_a["claims"][best["a"]], best, "EV1").model_dump(mode="json"),
            _to_evidence(paper_b, paper_b["claims"][best["b"]], best, "EV2").model_dump(mode="json"),
        ]
    return report


def _to_evidence(paper: dict, claim: dict, pair: dict, evidence_id: str) -> Evidence:
    meta = paper["meta"]
    # Order shared terms by where they appear in the sentence so derived labels read naturally.
    lowered_claim = claim["text"].lower()
    shared = sorted(pair["shared_terms"], key=lambda t: (lowered_claim.find(t) < 0, lowered_claim.find(t)))
    outcome = " ".join(shared[:3]) if shared else "reported outcome (terms unclear)"
    population = None
    lowered = claim["text"].lower() + " " + (paper.get("methods_excerpt") or "").lower()
    populations = [t for t in POPULATION_TERMS if re.search(rf"\b{t}\b", lowered)]
    if populations:
        population = ", ".join(populations[:3])
    direction = {"positive": "positive", "negative": "negative", "mixed": "mixed"}.get(claim["direction"], "unknown")
    conditions = {
        "section": claim["section"],
        "page": str(claim["page"]),
    }
    if claim["direction"] == "null":
        conditions["reported_effect"] = "null result (no significant effect reported)"
    if claim["stats"]:
        conditions["statistics"] = "; ".join(claim["stats"])[:160]
    citation = Citation(
        title=meta["title"][:300],
        authors=meta["authors"] or ["Author not extracted"],
        year=meta["year"],
        identifier=meta["doi"] or f"sha256:{paper['id'][:16]}",
        url=f"https://doi.org/{meta['doi']}" if meta["doi"] else None,
        location=f"p. {claim['page']}, {claim['section']} section",
        retrieved_at=date.today().isoformat(),
    )
    return Evidence(
        evidence_id=evidence_id,
        source=f"Uploaded PDF: {paper['filename']}",
        citation=citation,
        claim=claim["text"],
        direction_of_effect=direction,
        population_or_system=population or "population not extracted",
        intervention_or_variable=(shared[0] if shared else "shared variable not identified"),
        outcome=outcome,
        sample_size_if_known=paper.get("sample_size"),
        experimental_conditions=conditions,
        methodology=(paper.get("methods_excerpt") or "Methods section not extracted")[:400],
        limitations=paper.get("limitations") or ["Limitations not extracted from the paper."],
        confidence=(
            "high"
            if claim["section"] == "results" and claim["stats"]
            else "moderate"
            if claim["stats"] or claim["section"] == "results"
            else "low"
        ),
        provenance={
            "pdf_sha256": paper["id"],
            "page": str(claim["page"]),
            "section": claim["section"],
            "quote": claim["text"][:400],
            "extraction": "rule-based parser; exact sentence from the PDF text layer",
        },
    )


def dumps(report: dict) -> str:
    return json.dumps(report, allow_nan=False)
