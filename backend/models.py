"""Validated scientific contracts. No model-generated executable code."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Citation(Strict):
    title: str = Field(min_length=5)
    authors: list[str] = Field(min_length=1)
    year: int = Field(ge=1900, le=2100)
    identifier: str = Field(min_length=3)
    url: HttpUrl
    location: str = Field(min_length=3)
    retrieved_at: str


class Evidence(Strict):
    evidence_id: str
    source: str
    citation: Citation
    claim: str
    direction_of_effect: Literal["negative", "positive", "mixed", "unknown"]
    population_or_system: str
    intervention_or_variable: str
    outcome: str
    sample_size_if_known: int | None = None
    experimental_conditions: dict[str, str]
    methodology: str
    limitations: list[str]
    confidence: Literal["high", "moderate", "low"]
    provenance: dict[str, str]


class Contradiction(Strict):
    contradiction_id: str
    evidence_a: str
    evidence_b: str
    conflicting_claim: str
    shared_context: str
    differing_conditions: list[str]
    contradiction_strength: Literal["contextual reversal", "unresolved", "none"]
    uncertainty: str
    explanation: str


class Hypothesis(Strict):
    hypothesis_id: str
    statement: str
    rationale: str
    supporting_evidence: list[str]
    conflicting_evidence: list[str]
    predictions: list[str] = Field(min_length=1)
    falsification_condition: str
    uncertainty: str
    agent_generated: bool
    support_score: float = Field(ge=0, le=100)


class Experiment(Strict):
    experiment_id: str
    hypothesis_targets: list[str] = Field(min_length=1)
    scientific_question: str
    method: Literal["species_adjustment", "year_sensitivity"]
    required_data: str
    variables: list[str]
    expected_information_gain: float = Field(ge=0, le=1)
    feasibility: float = Field(ge=0, le=1)
    data_availability: float = Field(ge=0, le=1)
    computational_cost: float = Field(ge=0, le=1)
    discrimination: float = Field(ge=0, le=1)
    limitations: list[str]
    success_criterion: str
    failure_criterion: str
    seed: int = Field(ge=0, le=2**32 - 1)
    bootstrap_samples: int = Field(ge=100, le=2000)


class NewInvestigation(Strict):
    objective: str = Field(default="Why does the relationship between penguin bill length and depth reverse when species are separated?", min_length=10, max_length=600)
    mode: Literal["local", "omnigent"] = "local"
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


class Approval(Strict):
    experiment_id: str
    approved: Literal[True]


class AgentAnnotation(Strict):
    rationale: str = Field(min_length=10, max_length=1500)
