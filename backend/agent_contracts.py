"""Public scientific conclusions, never private chain-of-thought."""

from typing import Literal
from pydantic import Field
from backend.models import Strict, Evidence, Contradiction, Hypothesis, Experiment


class Conclusion(Strict):
    summary: str = Field(min_length=10, max_length=2000)
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]


class Literature(Conclusion):
    evidence: list[Evidence] = Field(min_length=2, max_length=12)


class Comparison(Conclusion):
    disposition: Literal['CONTRADICTION', 'COMPATIBLE', 'INCONCLUSIVE', 'INSUFFICIENT_EVIDENCE']
    classification: Literal['DIRECT', 'CONDITIONAL', 'APPARENT', 'COMPATIBLE', 'INCOMPARABLE', 'INSUFFICIENT_EVIDENCE']
    dimensions: dict[str, str]
    contradiction: Contradiction


class ModelHypothesis(Hypothesis):
    confidence: float = Field(ge=0, le=1)
    proposed_test: str = Field(min_length=10)


class Hypotheses(Conclusion):
    hypotheses: list[ModelHypothesis] = Field(min_length=1, max_length=6)


class Plan(Conclusion):
    experiments: list[Experiment] = Field(min_length=1, max_length=3)
    selected_experiment: str
    assumptions: list[str] = Field(min_length=1)
    robustness_checks: list[str] = Field(min_length=1)


class Execution(Conclusion):
    experiment_id: str


class Measurement(Strict):
    result_id: str
    path: str
    value: float


class Update(Strict):
    hypothesis_id: str
    prior_support: float = Field(ge=0, le=100)
    updated_support: float = Field(ge=0, le=100)
    result_consistency: str
    remaining_uncertainty: str
    evidence_for: str
    evidence_against: str


class Analysis(Conclusion):
    updates: list[Update] = Field(min_length=1)
    measurements: list[Measurement] = Field(min_length=1)
    statistical_evidence: str
    scientific_interpretation: str
    limitations: list[str] = Field(min_length=1)


class Challenge(Strict):
    challenge_id: str
    attack: str
    test: str
    evidence: str
    verdict: Literal['rebutted', 'stands', 'open', 'partly conceded']
    artifact_ids: list[str] = Field(min_length=1)


class Critique(Conclusion):
    challenges: list[Challenge] = Field(min_length=1)
    requested_experiments: list[str]
    measurements: list[Measurement]


class Decision(Conclusion):
    disposition: Literal['SUPPORTED', 'PARTIALLY_SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE', 'NEEDS_FOLLOW_UP']
    previous_plan: str
    next_decision: str
    rationale: str
    next_evidence_search: str
    next_experiment: str
    unresolved: list[str]
    contradiction_explained: bool
    measurements: list[Measurement]


class Verification(Conclusion):
    passed: bool
    checks: list[str] = Field(min_length=1)
    flags: list[str]
    blocking_issues: list[str]


SCHEMAS = dict(zip(
    ['LiteratureAgent', 'ContradictionAgent', 'HypothesisAgent', 'ExperimentPlanner',
     'ExperimentRunner', 'AnalysisAgent', 'CriticAgent', 'DecisionAgent', 'SafetyAgent'],
    [Literature, Comparison, Hypotheses, Plan, Execution, Analysis, Critique, Decision, Verification],
))

RESPONSIBILITIES = {
    'LiteratureAgent': 'Extract important findings from the supplied passages of both uploaded papers. '
        'Each paper evidence claim and provenance.quote must be the same exact passage, with pdf_sha256, page, '
        'section and extraction fields. Never invent metadata or citations. Select evidence from BOTH papers. '
        'Use EV1, EV2 etc as evidence_id. Unknown scientific attributes must say unknown. '
        'Copy each citation exactly from required_citations.',
    'ContradictionAgent': 'Assess research question, exposure, outcome, population, conditions, effect direction '
        'and magnitude, statistical uncertainty, model specification, covariates, selection and measurement definitions. '
        'Put every dimension in dimensions; missing information is unknown. Null significance alone does not '
        'contradict a significant effect. Distinguish direct, conditional and apparent disagreement from compatible, '
        'incomparable and insufficient evidence. Stop without manufacturing disagreement. contradiction.evidence_a/b '
        'must reference selected EV IDs; contradiction_strength is none when disposition is not CONTRADICTION.',
    'HypothesisAgent': 'Generate specific falsifiable explanations grounded in the actual disagreement. Include '
        'supporting/conflicting EV IDs, predictions and falsification criteria. Use H1 etc. agent_generated=true. '
        'support_score is a heuristic, not probability.',
    'ExperimentPlanner': 'Design bounded executable tests for the hypotheses using ONLY the supplied computation '
        'capabilities. Choose parameters, assumptions, limitations, variables, success/failure criteria and robustness '
        'checks. Do not execute or approve. Text audits test extraction stability, NOT biological truth or causal '
        'hypotheses. If data are inadequate say so in limitations; never pretend PDFs contain individual-level data. '
        'Use E1 etc and actual hypothesis IDs. selected_experiment must name one proposal.',
    'ExperimentRunner': 'Request execution of ONLY the immutable human-approved experiment ID. The submission '
        'tool invokes real Python and returns measured results. Never provide numerical results yourself. '
        'If approval is absent, stop. You cannot change parameters or select another experiment.',
    'AnalysisAgent': 'Interpret only the computed result: direction, magnitude, intervals, sensitivity and what '
        'the experiment can and cannot explain. Separate statistical_evidence from scientific_interpretation. '
        'For quantitative claims provide measurements with result artifact ID, dot-separated path and exact numeric '
        'value (array indexes supported). Update only existing hypotheses. Never invent numerical results.',
    'CriticAgent': 'Actively try to invalidate the analysis: confounding, leakage, power, multiple comparisons, '
        'selection, measurement, instability, causal overreach and analytical choices. Each challenge names actual '
        'artifact IDs. A proposed but unexecuted test is open, never rebutted. Request new experiments when needed; '
        'you cannot execute them. Use measurements for every quantitative claim and identify limitations left unresolved.',
    'DecisionAgent': 'Integrate contradiction, hypotheses, plan, real results, analysis and adversarial critique. '
        'State what was learned, unresolved issues and whether disagreement is explained. Choose a disposition '
        'and a concrete next investigation. A text robustness audit cannot establish a scientific effect. '
        'Propose follow-ups; do not approve or run them. Use measurements for quantitative claims.',
    'SafetyAgent': 'Audit source grounding, citations, missing data, plan feasibility, causal language, lineage, '
        'approval when executing, and exact agreement between narrative numerical claims and result artifacts. '
        'Before approval inspect plans; after execution inspect all conclusions. Block using passed=false and '
        'blocking_issues when substantive problems exist. Do not rubber-stamp. Do not require approval at preflight.',
}
