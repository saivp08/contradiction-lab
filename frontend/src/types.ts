export interface Citation {
  title: string;
  authors: string[];
  year: number;
  url: string;
  identifier: string;
  location: string;
  retrieved_at: string;
}
export interface Evidence {
  evidence_id: string;
  claim: string;
  citation: Citation;
  direction_of_effect: string;
  intervention_or_variable: string;
  outcome: string;
  experimental_conditions: Record<string, string>;
  limitations: string[];
  source: string;
}
export interface Hypothesis {
  hypothesis_id: string;
  statement: string;
  rationale: string;
  predictions: string[];
  falsification_condition: string;
  support_score: number;
  agent_generated: boolean;
}
export interface Experiment {
  experiment_id: string;
  title?: string;
  followup?: boolean;
  scientific_question: string;
  method: string;
  planning_score: number;
  expected_information_gain: number;
  data_availability: number;
  feasibility: number;
  computational_cost: number;
  discrimination: number;
  limitations: string[];
  seed: number;
  bootstrap_samples: number;
}
export interface Update {
  hypothesis_id: string;
  prior_support: number;
  updated_support: number;
  result_consistency: string;
  remaining_uncertainty: string;
}
export interface Result {
  n: number;
  pooled_slope: number;
  adjusted_slope: number;
  adjusted_ci95: number[];
  group: string;
  points: Point[];
  decomposition?: Decomposition;
  subgroups: { group: string; n: number; slope: number }[];
  sensitivity: { excluded_year: number; slope: number }[];
  limitations: string[];
  assumptions: string[];
  pooled_rmse: number;
  adjusted_rmse: number;
  seed: number;
  bootstrap_samples: number;
  provenance: { dataset_sha256: string; code_sha256: string };
  model_comparison?: ModelComparison;
  species_only_slope?: number;
  attenuation?: number;
}
export interface Point {
  x: number;
  y: number;
  species: string;
  year: number;
}
export interface Decomposition {
  group: string;
  pooled_slope: number;
  within_slope: number;
  between_slope: number;
  within_weight: number;
  within_contribution: number;
  between_contribution: number;
  group_means: { group: string; n: number; x: number; y: number }[];
  note: string;
}
export interface ModelComparison {
  pooled_bic: number;
  adjusted_bic: number;
  delta_bic: number;
  log10_bayes_factor: number;
  favored_model: string;
  note: string;
}
export interface FollowupDecision {
  hypothesis_id: string;
  prior_support: number;
  updated_support: number;
  result_consistency: string;
  summary: string;
  evidence: string;
  next_decision: string;
}
export interface Dataset {
  n_raw: number;
  n_complete: number;
  sha256: string;
}
export interface Decision {
  previous_plan: string;
  next_decision: string;
  rationale: string;
  next_evidence_search: string;
  next_experiment: string;
}
export interface LabObject {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  input_ids: string[];
  created_at: string;
}
export interface LabEvent {
  id: string;
  agent: string;
  action: string;
  tool: string;
  input_ids: string[];
  output_ids: string[];
  elapsed_seconds: number;
  timestamp: string;
  status: string;
}
export interface RecordData {
  id: string;
  objective: string;
  label?: string | null;
  followup_approval?: { experiment_id: string; approved_at: string; actor: string } | null;
  mode: string;
  status: string;
  stage: number;
  seed?: number;
  objects: Record<string, LabObject>;
  events: LabEvent[];
  error: string | null;
  selected_experiment?: string;
  selection_rationale?: string;
  metrics: Record<string, number | string>;
  display_mode?: string;
  verified_sha256?: string;
  created_at: string;
  approval: unknown;
}
export interface Summary {
  id: string;
  objective: string;
  label?: string | null;
  status: string;
  mode: string;
  stage: number;
  created_at: string;
  updated_at?: string;
  result?: {
    group: string;
    n: number;
    pooled_slope: number;
    adjusted_slope: number;
    adjusted_ci95: number[];
  };
  followup?: { adjusted_slope: number; adjusted_ci95: number[] };
  next_decision?: string;
  challenges?: Record<string, number>;
}
export function objects<T>(record: RecordData | null, kind: string): T[] {
  return Object.values(record?.objects || {})
    .filter((x) => x.kind === kind)
    .map((x) => x.data as T);
}
