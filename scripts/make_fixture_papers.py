"""Generate committed fixture PDFs for the paper-comparison tests. Synthetic text, realistic structure."""

import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "fixtures"


def paper(filename: str, lines: list[tuple[str, bool]]) -> None:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    for text, heading in lines:
        if text == "<pagebreak>":
            pdf.add_page()
            continue
        pdf.set_font("helvetica", style="B" if heading else "", size=13 if heading else 11)
        pdf.multi_cell(0, 7 if heading else 6, text)
        pdf.ln(2 if heading else 1)
    pdf.output(str(OUT / filename))


CAFFEINE_RCT = [
    ("Caffeine improves sustained attention in young adults: a randomized controlled trial", True),
    ("Maria Keller, Daniel Osei, Priya Raman", False),
    ("Journal of Cognitive Performance, 2021. DOI: 10.9999/jcp.2021.0042", False),
    ("ABSTRACT", True),
    (
        "Caffeine is the most widely consumed psychoactive substance. In this randomized placebo-controlled "
        "trial we examined whether a 200 mg dose of caffeine improves sustained attention in healthy young "
        "adults. Caffeine significantly increased sustained attention scores relative to placebo. These "
        "findings support a robust short-term attentional benefit of moderate caffeine intake in young adults.",
        False,
    ),
    ("INTRODUCTION", True),
    (
        "Sustained attention underpins performance in safety-critical occupations. Prior work has reported "
        "mixed effects of caffeine across populations and doses, motivating a controlled evaluation.",
        False,
    ),
    ("METHODS", True),
    (
        "We randomized n = 120 healthy young adults (ages 18-30, 61 female) to 200 mg caffeine or matched "
        "placebo in a double-blind parallel design. Sustained attention was measured with the Psychomotor "
        "Vigilance Task (PVT) 45 minutes after administration. The prespecified primary outcome was the "
        "sustained attention composite score.",
        False,
    ),
    ("<pagebreak>", False),
    ("RESULTS", True),
    (
        "Caffeine significantly increased sustained attention scores compared with placebo (mean difference "
        "4.2 points, 95% CI 1.5 to 6.9, p = 0.003). Reaction-time lapses decreased in the caffeine group "
        "(p = 0.01). No serious adverse events were observed.",
        False,
    ),
    ("Table 1. Sustained attention scores by treatment group.", False),
    ("DISCUSSION", True),
    (
        "A moderate caffeine dose produced a reliable improvement in sustained attention among young adults. "
        "Effects in other age groups were not assessed and may differ with habitual intake.",
        False,
    ),
    ("LIMITATIONS", True),
    ("Single dose, single session, young-adult sample only; generalization to older adults is unknown.", False),
]

CAFFEINE_NULL = [
    ("No significant effect of caffeine on sustained attention in older adults", True),
    ("Thomas Lindqvist, Amara Diallo", False),
    ("Gerontology and Cognition, 2023. DOI: 10.9999/gercog.2023.0117", False),
    ("ABSTRACT", True),
    (
        "Whether caffeine benefits attention in later life is unclear. We tested a 200 mg caffeine dose "
        "against placebo in community-dwelling older adults. Caffeine did not significantly change sustained "
        "attention scores relative to placebo. Routine caffeine supplementation to support attention in "
        "older adults is not supported by these data.",
        False,
    ),
    ("METHODS", True),
    (
        "A double-blind crossover design enrolled n = 85 older adults (ages 65-82, 47 female). Sustained "
        "attention was measured with the Psychomotor Vigilance Task (PVT) 45 minutes after each "
        "administration, one week apart.",
        False,
    ),
    ("<pagebreak>", False),
    ("RESULTS", True),
    (
        "Caffeine did not significantly change sustained attention scores compared with placebo (mean "
        "difference 0.6 points, 95% CI -1.1 to 2.3, p = 0.41). Self-reported alertness increased modestly "
        "(p = 0.04) without a corresponding performance change.",
        False,
    ),
    ("DISCUSSION", True),
    (
        "In contrast with reports in younger samples, caffeine produced no measurable sustained-attention "
        "benefit in older adults. Age-related differences in adenosine signalling or habitual intake may "
        "explain the discrepancy.",
        False,
    ),
    ("LIMITATIONS", True),
    ("Crossover design with a single dose; habitual caffeine intake was self-reported.", False),
]

SOIL_PAPER = [
    ("Nitrogen fixation rates in temperate forest soil microbial communities", True),
    ("Elena Petrova, Johan Brink", False),
    ("Soil Biology Letters, 2020. DOI: 10.9999/sbl.2020.0210", False),
    ("ABSTRACT", True),
    (
        "We quantified nitrogen fixation in temperate forest soils. Fixation rates increased with soil "
        "moisture across all sampled plots. Microbial community composition shifted seasonally.",
        False,
    ),
    ("METHODS", True),
    ("Soil cores (n = 48) were collected across four plots and assayed by acetylene reduction.", False),
    ("RESULTS", True),
    (
        "Nitrogen fixation rates increased significantly with soil moisture (r = 0.62, p = 0.001). "
        "Diazotroph abundance was higher in autumn samples.",
        False,
    ),
]

CAFFEINE_AGREE = [
    ("Caffeine and vigilance in shift workers: a field study", True),
    ("Rosa Mendes, Yuki Tanaka", False),
    ("Occupational Sleep Research, 2022. DOI: 10.9999/osr.2022.0301", False),
    ("ABSTRACT", True),
    (
        "In a field study of night-shift nurses, caffeine increased sustained attention scores during the "
        "final hours of the shift. Benefits were largest for non-habitual consumers.",
        False,
    ),
    ("METHODS", True),
    ("n = 64 night-shift nurses completed the Psychomotor Vigilance Task with and without 150 mg caffeine.", False),
    ("RESULTS", True),
    (
        "Caffeine significantly increased sustained attention scores at 5 a.m. (mean difference 3.1 points, "
        "p = 0.008).",
        False,
    ),
]


def image_only(filename: str) -> None:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_fill_color(40, 60, 55)
    pdf.rect(20, 20, 170, 240, style="F")
    pdf.output(str(OUT / filename))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    paper("caffeine-rct-young.pdf", CAFFEINE_RCT)
    paper("caffeine-null-older.pdf", CAFFEINE_NULL)
    paper("soil-nitrogen.pdf", SOIL_PAPER)
    paper("caffeine-agree-shift.pdf", CAFFEINE_AGREE)
    image_only("image-only.pdf")
    (OUT / "malformed.pdf").write_bytes(b"%PDF-1.4 truncated nonsense \x00\x01\x02")
    print("Wrote fixtures:", sorted(p.name for p in OUT.glob("*.pdf")), file=sys.stderr)
