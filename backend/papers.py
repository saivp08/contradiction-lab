"""Rule-based ingestion of research-paper PDFs into structured, provenance-carrying evidence.

Everything here is deterministic parsing of the papers' actual contents: no language model, no
fabrication. Quotes are exact sentences from the PDF text layer; anything not found is null/unknown.
Real journal PDFs carry layout noise — running headers/footers, hyphenated line breaks, small-caps
headers that extract mangled ("AbstrAct", "resul ts"), glued words from two-column text — so the
pipeline cleans pages before any claim is extracted, and drops text it cannot read rather than
guessing at it.
"""

import hashlib
import io
import json
import re
from collections import Counter
from datetime import date

from pypdf import PdfReader

from backend.models import Citation, Evidence

MAX_PAGES = 80
MAX_CLAIMS = 40
COMPARABLE_SIMILARITY = 0.18
MIN_SHARED_TERMS = 3

SECTION_HEADERS = {
    "abstract": "abstract",
    "summary": "abstract",
    "introduction": "introduction",
    "background": "introduction",
    "methods": "methods",
    "method": "methods",
    "materials and methods": "methods",
    "study design": "methods",
    "statistical methods": "methods",
    "statistical analysis": "methods",
    "statistical analyses": "methods",
    "results": "results",
    "findings": "results",
    "discussion": "discussion",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
    "limitations": "limitations",
    "strengths and limitations": "limitations",
    "strengths and limitations of this study": "limitations",
    "references": "references",
    "bibliography": "references",
    "acknowledgements": "references",
    "acknowledgments": "references",
}
# Letters-only keys so mangled extractions ("AbstrAct", "resul ts", "RESULTS:") still match.
SECTION_KEYS = {re.sub(r"[^a-z]", "", k): v for k, v in SECTION_HEADERS.items()}
# Structured-abstract labels (JAMA style): "RESULTS This analysis included…" on one line.
ABSTRACT_LABELS = re.compile(r"^(RESULTS|FINDINGS|CONCLUSIONS?)(?:\s+AND\s+[A-Z]+)*\s+(?=[A-Z0-9])")
GLUED_HEADER = re.compile(
    r"^(Abstract|Introduction|Background|Methods|Results|Findings|Discussion|Conclusions?|Limitations)(?=[A-Z])"
)
PRIORITY = {"results": 3.0, "abstract": 2.0, "conclusion": 1.6, "discussion": 1.3, "limitations": 1.0}

POSITIVE = r"increas\w+|higher|greater|improv\w+|enhanc\w+|promot\w+|positively associated|positive association|rose|larger|more likely|upregulat\w+"
NEGATIVE = r"decreas\w+|lower(ed)?|reduc\w+|fewer|inhibit\w+|suppress\w+|negatively associated|negative association|declin\w+|less likely|smaller|downregulat\w+|impair\w+"
NULL = (
    r"no significant|not significant\w*|did not significantly|no (association|difference|effect|evidence|measurable)"
    r"|not\s+(significantly\s+)?(associated|related|linked)|did not (differ|change|affect|improve|alter)"
    r"|failed to|was not supported|is not supported|similar between"
)
STATS = (
    r"p\s*[<=>]\s*0?\.\d+|r\s*=\s*-?0?\.\d+|\d+(\.\d+)?\s*%\s*ci|95\s*%\s*ci|confidence interval"
    r"|(hazard|odds|risk) ratios?|relative risks?|\b(a?hr|rr|aor)\s*[,=:]\s*\d|or\s*=\s*\d|hr\s*=\s*\d"
    r"|β\s*=|beta\s*=\s*-?\d|mean difference|effect size|n\s*=\s*\d+"
)
# A ratio estimate whose 95% interval crosses 1 is a null finding, whatever verbs surround it
# ("per day increase was 0.98 (95% confidence interval 0.93 to 1.03)" is not a positive effect).
RATIO_CI = re.compile(
    r"(?:hazard ratios?|odds ratios?|risk ratios?|relative risks?|\b(?:a?hr|rr|aor|or)\b)"
    r"[^.;()\[\]]{0,100}?(\d+\.\d+)\s*[(\[]\s*95\s*%\s*(?:ci|confidence interval)[,:]?\s*"
    r"(\d+\.\d+)\s*(?:to|–|—|,|-)\s*(\d+\.\d+)",
    re.IGNORECASE,
)
RATIO_CI_BARE = re.compile(
    r"(?:hazard ratios?|odds ratios?|risk ratios?|relative risks?)\s+(\d+\.\d+)\s*,\s*"
    r"95\s*%\s*(?:ci|confidence interval)[,:]?\s*(\d+\.\d+)\s*(?:to|–|—|-)\s*(\d+\.\d+)",
    re.IGNORECASE,
)
# Methods-speak describes the analysis, not a finding ("We used statistical models to estimate…").
PROCEDURAL = re.compile(
    r"^(?:we|the authors)\s+(?:also\s+|then\s+|further\s+)?"
    r"(?:used|use|computed|calculated|defined|considered|adjusted|applied|performed|conducted|estimated"
    r"|assessed|collected|obtained|excluded|included|categori[sz]ed|classified|modell?ed|examined|evaluated"
    r"|measured|analy[sz]ed|pooled|harmoni[sz]ed|updated|repeated|tested|imputed|derived|fitted|constructed"
    r"|created|recorded|reviewed|searched|extracted|calibrated)\b"
    r"|^statistical analys|^analyses were|^data were (?:collected|analy[sz]ed|pooled|harmoni[sz]ed)",
    re.IGNORECASE,
)
BOILER = re.compile(
    r"downloaded from|all rights reserved|this content downloaded|creative\s?commons|for personal use only",
    re.IGNORECASE,
)

STOPWORDS = set(
    """a an and are as at be been between both but by can compared comparison could did do does during each
    for from group groups had has have in into is it its may more most no not of on or our than that the
    their there these this those to two under using was we were which while with within without these study
    studies trial data found while however among across also after before per our its all one versus vs
    relative report reported significantly significant change changed changes effect effects relationship
    association associated findings finding results result observed measured mean point points composite baseline modestly measurable corresponding
    ratio ratios interval confidence hazard odds adjusted pooled model models analysis analyses cohort cohorts incident total""".split()
)
DIRECTION_WORDS = set(
    re.findall(r"[a-z]+", POSITIVE + " " + NEGATIVE + " " + NULL.replace("(", " ").replace(")", " ").replace("|", " "))
)

POPULATION_TERMS = """young adults older adults adolescents children elderly women men female male patients
    participants volunteers students nurses workers mice rats humans infants athletes smokers cells plots
    soils soil forests""".split()
DESIGN_TERMS = """randomized placebo double-blind crossover parallel cohort observational survey field
    longitudinal retrospective prospective in-vitro in-vivo meta-analysis simulation""".split()
DEGREES = r"(?:PhD|MD|MSc|MS|MPH|MBBS|ScM|ScD|DrPH|DPhil|DO|RD|RN|MBA|FRCP|BSc|BSN|BA|MA)"

ABBREVIATIONS = ["et al.", "e.g.", "i.e.", "vs.", "Fig.", "fig.", "No.", "approx.", "ca.", "cf."]


class PaperError(ValueError):
    """User-facing ingestion failure (malformed, image-only, oversized)."""


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _normalize(text: str) -> str:
    text = re.sub(r"[​‌‍﻿­]", "", text)
    text = re.sub(r"[  -   ]", " ", text)
    # Rejoin words hyphenated at line breaks ("supplemen-\ntation", "assoc- iated"); keep real
    # suspended hyphens like "age- and sex-adjusted" intact.
    text = re.sub(r"([a-z])-\s*\n\s*(?!(?:and|or|to|the|an?|but|nor|by|of|in|for)\b)([a-z])", r"\1\2", text)
    text = re.sub(r"([a-z])- (?!(?:and|or|to|the|an?|but|nor|by|of|in|for)\b)([a-z])", r"\1\2", text)
    return text


def _pages_text(blob: bytes) -> list[str]:
    try:
        reader = PdfReader(io.BytesIO(blob))
        pages = [_normalize(page.extract_text() or "") for page in reader.pages[:MAX_PAGES]]
    except Exception as error:
        raise PaperError(f"Could not parse this file as a PDF ({type(error).__name__}).") from error
    if sum(len(re.findall(r"[A-Za-z]", p)) for p in pages) < 200:
        raise PaperError(
            "This PDF has no extractable text layer (likely scanned/image-only). OCR is not supported in this build."
        )
    return pages


def _boiler_key(line: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", line)).strip().lower()


def _strip_boilerplate(pages: list[str]) -> list[str]:
    """Remove running headers/footers (same line, digits aside, on many pages) and page numbers."""
    page_lines = [p.splitlines() for p in pages]
    counts: Counter[str] = Counter()
    for lines in page_lines:
        for key in {_boiler_key(line) for line in lines if line.strip()}:
            counts[key] += 1
    threshold = max(3, round(len(pages) * 0.4)) if len(pages) >= 3 else len(pages) + 1
    repeated = {k for k, c in counts.items() if c >= threshold and len(k) >= 2}
    cleaned = []
    for lines in page_lines:
        kept = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                kept.append(line)
                continue
            if re.fullmatch(r"\d{1,4}", stripped):
                continue
            if len(stripped) <= 120 and (_boiler_key(line) in repeated or BOILER.search(stripped)):
                continue
            kept.append(line)
        cleaned.append("\n".join(kept))
    return cleaned


def _header_of(line: str) -> str | None:
    bare = re.sub(r"^\d+(\.\d+)*\.?\s*", "", line.strip()).rstrip(":").strip()
    if len(bare) > 44 or re.search(r"\d", bare):
        return None
    return SECTION_KEYS.get(re.sub(r"[^a-z]", "", bare.lower()))


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
            label = ABSTRACT_LABELS.match(stripped) or GLUED_HEADER.match(stripped)
            if label:
                flush()
                current = SECTION_KEYS[re.sub(r"[^a-z]", "", label.group(1).lower())]
                stripped = stripped[label.end() :].strip()
                if not stripped:
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
        if not 25 <= len(part) <= 500:
            continue
        # Two-column extraction sometimes glues words together; drop garbled text, never quote it.
        if max((len(t) for t in re.findall(r"[A-Za-z]+", part)), default=0) > 25:
            continue
        out.append(part)
    return out


def _ci_crosses_null(sentence: str) -> bool:
    for pattern in (RATIO_CI, RATIO_CI_BARE):
        for match in pattern.finditer(sentence):
            low, high = float(match.group(2)), float(match.group(3))
            if low < 1.0 <= high or low <= 1.0 < high:
                return True
    return False


def _direction(sentence: str) -> str:
    lowered = sentence.lower()
    if re.search(NULL, lowered) or _ci_crosses_null(sentence):
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


def _authorish(line: str) -> bool:
    if re.search(rf"\b{DEGREES}\b", line):
        return True
    if re.search(r"[A-Za-z],\d", line) or re.search(r"^[A-Z][a-z]+(?: [A-Z][\w.\-']+)+\d", line):
        return True  # affiliation superscripts: "Siyu Chen,1" / "Shilpa N Bhupathiraju1,3"
    names = r"[A-Z][\w.\-']+(?: [A-Z][\w.\-']+){1,3}"
    return bool(re.fullmatch(rf"{names}(?:,? (?:and )?{names})+,?", line.strip()))


def _parse_authors(raw: str) -> list[str]:
    raw = re.sub(rf"\b{DEGREES}\b\.?", "", raw)
    raw = re.sub(r"(?<=[A-Za-z])\s*,\s*\d+(?:\s*,\s*\d+)*", ";", raw)  # "Chen,1,2 " → "Chen; "
    raw = re.sub(r"(?<=[a-z])\d+(?:,\d+)*", "", raw)
    parts = re.split(r";", raw) if ";" in raw else re.split(r",| and ", raw)
    names = []
    for part in parts:
        part = re.sub(r"[\d*†‡§¶#]+", "", part).strip(" ,;.")
        part = re.sub(r",\s*[A-Z]{1,4}$", "", part)  # truncated trailing degree ("…, M")
        part = re.sub(r"\s+\.", ".", re.sub(r"\s{2,}", " ", part)).strip(" ,;")
        if 3 <= len(part) <= 60 and re.match(r"^[A-Z]", part) and not re.search(r"@|University|Department", part):
            names.append(part)
    return names[:12]


def _skip_as_title(line: str) -> bool:
    if len(line) < 12 or _header_of(line) or _authorish(line):
        return True
    if re.search(r"10\.\d{4,9}/|https?://|@|©|\bISSN\b|\d{4}\s*;\s*\d|\|", line, re.IGNORECASE):
        return True
    return line.isupper() and len(line) < 16  # journal labels like "RESEARCH"


def _find_year(first_page_raw: str, doi: str | None) -> int | None:
    candidates = [
        r"\b((?:19|20)\d{2})\s*;\s*\w?\d",  # citation line: "JAMA. 2019;321(11)…", "BMJ 2020;368:m513"
        r"©\s*((?:19|20)\d{2})",
        r"(?:published|accepted|received|posted|online first)[^.\n]{0,50}?\b((?:19|20)\d{2})\b",
    ]
    for pattern in candidates:
        match = re.search(pattern, first_page_raw, re.IGNORECASE)
        if match:
            return int(match.group(1))
    if doi:
        match = re.search(r"(?:19|20)\d{2}", doi)
        if match:
            return int(match.group())
    return None


def _metadata(cleaned_pages: list[str], raw_pages: list[str], reader_meta: dict) -> dict:
    first = [line.strip() for line in cleaned_pages[0].splitlines() if line.strip()][:16]
    title_lines: list[str] = []
    start = next((i for i, line in enumerate(first) if not _skip_as_title(line)), None)
    if start is not None:
        title_lines.append(first[start])
        for line in first[start + 1 : start + 4]:
            if _skip_as_title(line) and not (line[:1].islower() and len(line) >= 8):
                break
            if line[:1].isupper() and title_lines[-1].rstrip().endswith((".", "!", "?")):
                break
            if sum(len(t) for t in title_lines) + len(line) > 240:
                break
            title_lines.append(line)
    title = re.sub(r"\s+", " ", " ".join(title_lines)).strip() or None
    if not title and reader_meta.get("title"):
        title = str(reader_meta["title"])
    authors: list[str] = []
    if title_lines:
        end = first.index(title_lines[0]) + len(title_lines)
        for line in first[end : end + 4]:
            legacy = ("," in line or " and " in line) and not re.search(r"\d{4}|DOI|@", line, re.IGNORECASE)
            if _authorish(line) or (not authors and legacy):
                authors.extend(_parse_authors(line))
            elif authors:
                break
    head = "\n".join(first)
    doi_match = re.search(r"\b10\.\d{4,9}/[^\s,;]+", head) or re.search(r"\b10\.\d{4,9}/[^\s,;]+", raw_pages[0])
    doi = doi_match.group().rstrip(".") if doi_match else None
    year = _find_year(raw_pages[0], doi)
    if year is None:
        year_match = re.search(r"\b(19|20)\d{2}\b", head)
        year = int(year_match.group()) if year_match else None
    if year is not None and not 1900 <= year <= 2035:
        year = None
    journal = None
    citation = re.search(r"\b([A-Z][A-Za-z]*(?:\s+[A-Za-z&]+){0,5}?)[.,]?\s+(?:19|20)\d{2}\s*;", raw_pages[0])
    if citation:
        journal = citation.group(1).strip()
    else:
        for line in first:
            match = re.match(r"^([A-Z][A-Za-z .&:]{2,60}?)\s*[,·]\s*(?:19|20)\d{2}\b", line)
            if (
                match
                and len(match.group(1).split()) <= 7
                and not re.search(r"\b(using|between|were|data|collected|from|with)\b", match.group(1), re.IGNORECASE)
            ):
                journal = match.group(1).strip()
                break
    return {
        "title": title or "Title not extracted",
        "authors": authors[:12],
        "year": year,
        "journal": journal,
        "doi": doi,
        "arxiv": (re.search(r"arXiv:\s*(\d{4}\.\d{4,5})", raw_pages[0], re.IGNORECASE) or [None, None])[1],
    }


COUNT_NOUN = re.compile(
    r"\b(\d{1,3}(?:[ , ]\d{3})+|\d{2,7})\s+"
    r"(?:participants|patients|subjects|individuals|adults|women|men|infants|respondents|volunteers)\b",
    re.IGNORECASE,
)


def ingest(blob: bytes, filename: str = "paper.pdf") -> dict:
    """Parse one PDF into metadata, sections, and provenance-carrying claim candidates."""
    if len(blob) > 25 * 1024 * 1024:
        raise PaperError("PDF is larger than the 25 MB limit.")
    raw_pages = _pages_text(blob)
    try:
        info = PdfReader(io.BytesIO(blob)).metadata or {}
        reader_meta = {"title": info.get("/Title")}
    except Exception:
        reader_meta = {}
    pages = _strip_boilerplate(raw_pages)
    chunks, captions = _sections(pages)
    meta = _metadata(pages, raw_pages, reader_meta)
    sample = None
    for chunk in chunks:
        if chunk["section"] in {"methods", "abstract", "front"}:
            for match in re.findall(r"n\s*=\s*(\d{1,7})", chunk["text"], re.IGNORECASE):
                sample = max(sample or 0, int(match))
        if chunk["section"] in {"methods", "abstract", "front", "results"}:
            for match in COUNT_NOUN.findall(chunk["text"]):
                value = int(re.sub(r"\D", "", match))
                if value <= 50_000_000:
                    sample = max(sample or 0, value)
    claims = []
    for chunk in chunks:
        if chunk["section"] in {"front", "references", "introduction"}:
            continue
        for sentence in _sentences(chunk["text"]):
            if PROCEDURAL.match(sentence):
                continue
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
    seen: set[str] = set()
    unique = []
    for claim in claims:
        key = re.sub(r"[^a-z0-9]", "", claim["text"].lower())[:120]
        if key in seen:
            continue
        seen.add(key)
        unique.append(claim)
    claims = unique
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
        "methods_excerpt": " ".join(
            [s for c in chunks if c["section"] == "methods" for s in _sentences(c["text"])][:3]
        )[:400]
        or None,
        "limitations": [s for c in chunks if c["section"] == "limitations" for s in _sentences(c["text"])][:3],
        "claims": claims[:MAX_CLAIMS],
        "warnings": warnings,
    }


def _similarity(a: dict, b: dict) -> float:
    """Shared-term overlap against the smaller claim, floored so tiny claims cannot inflate it.

    Real-paper sentences are long, which makes plain Jaccard punish genuine matches; the overlap
    coefficient stays comparable across sentence lengths.
    """
    sa, sb = set(a["terms"]), set(b["terms"])
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(min(len(sa), len(sb)), 6)


def is_comparable(pair: dict) -> bool:
    return pair["similarity"] >= COMPARABLE_SIMILARITY and len(pair["shared_terms"]) >= MIN_SHARED_TERMS


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


def focus_terms(paper_a: dict, paper_b: dict) -> list[str]:
    """Terms both papers put in their titles: the shared topic their central claims are about."""
    ta = set(_terms(paper_a["meta"].get("title") or ""))
    tb = set(_terms(paper_b["meta"].get("title") or ""))
    return sorted(ta & tb)


def topic_phrase(title: str, focus: list[str], fallback: list[str]) -> str:
    """Runs of title words both papers share ("egg consumption and cardiovascular disease")."""
    focus_set = set(focus)
    if focus_set:
        runs: list[list[str]] = [[]]
        for word in re.findall(r"[A-Za-z][A-Za-z-]+", title):
            if set(_terms(word)) & focus_set:
                runs[-1].append(word.lower())
            elif runs[-1]:
                runs.append([])
        phrases = list(dict.fromkeys(" ".join(run) for run in runs if run))
        if phrases:
            return phrases[0] if len(phrases) == 1 else ", ".join(phrases[:-1]) + " and " + phrases[-1]
    return " ".join(fallback[:3]) if fallback else "the shared outcome"


def rank_pairs(
    claims_a: list[dict], claims_b: list[dict], limit: int = 12, focus: list[str] | None = None
) -> list[dict]:
    focus_set = set(focus or [])
    pairs = []
    for ia, a in enumerate(claims_a):
        for ib, b in enumerate(claims_b):
            similarity = _similarity(a, b)
            if similarity <= 0:
                continue
            kind = _pair_kind(a["direction"], b["direction"])
            stats_bonus = 1 + 0.15 * (bool(a["stats"]) + bool(b["stats"]))
            shared = set(a["terms"]) & set(b["terms"])
            topic_bonus = 1 + 0.5 * (len(shared & focus_set) / len(focus_set)) if focus_set else 1.0
            pairs.append(
                {
                    "a": ia,
                    "b": ib,
                    "similarity": round(similarity, 4),
                    "kind": kind,
                    "shared_terms": sorted(shared),
                    "rank_score": round(similarity * PAIR_WEIGHT[kind] * stats_bonus * topic_bonus, 4),
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
        dose = sorted(set(re.findall(r"\b\d+\s*(?:mg|iu|µg|mcg)\b", lowered)))
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
    focus = focus_terms(paper_a, paper_b)
    pairs = rank_pairs(paper_a["claims"], paper_b["claims"], focus=focus)
    differences = _condition_differences(paper_a, paper_b)
    comparable = [p for p in pairs if is_comparable(p)]
    best = next((p for p in comparable if p["kind"] in {"opposed", "tension"}), None)
    best_aligned = next((p for p in comparable if p["kind"] == "aligned"), None)
    if not comparable:
        relationship, defensible = RELATIONSHIPS["incomparable"], False
    elif best is None:
        relationship = RELATIONSHIPS["complementary"] if best_aligned else RELATIONSHIPS["none"]
        defensible = False
    elif best["similarity"] >= 0.5 and len(best["shared_terms"]) >= 4 and not differences:
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
        "focus_terms": focus,
        "topic": topic_phrase(paper_a["meta"].get("title") or "", focus, (best or {}).get("shared_terms") or []),
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
        # Both records must name the same outcome, so the label is ordered by paper A's sentence.
        anchor = paper_a["claims"][best["a"]]["text"]
        topic = report["topic"]
        report["evidence"] = [
            _to_evidence(paper_a, paper_a["claims"][best["a"]], best, "EV1", anchor, topic).model_dump(mode="json"),
            _to_evidence(paper_b, paper_b["claims"][best["b"]], best, "EV2", anchor, topic).model_dump(mode="json"),
        ]
    return report


def _to_evidence(paper: dict, claim: dict, pair: dict, evidence_id: str, anchor: str, topic: str) -> Evidence:
    meta = paper["meta"]
    lowered_anchor = anchor.lower()
    shared = sorted(pair["shared_terms"], key=lambda t: (lowered_anchor.find(t) < 0, lowered_anchor.find(t), t))
    outcome = topic if topic != "the shared outcome" else (" ".join(shared[:3]) or "reported outcome (terms unclear)")
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
