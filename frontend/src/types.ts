export interface Citation {
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
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
  population_or_system?: string;
  provenance?: Record<string, string>;
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
  scientific_question: string;
  required_data?: string;
  hypothesis_targets?: string[];
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
export interface AgentExecution {
  id: string; role: string; status: string; started_at: string; completed_at?: string;
  provider: string; model: string; input_summary: string; input_ids: string[];
  output: Record<string, unknown> | null; output_ids?: string[]; confidence?: number; error: string | null;
}
export interface RecordData {
  agent_executions?: AgentExecution[];
  id: string;
  objective: string;
  label?: string | null;
  source?: PapersSource | null;
  scope?: string;
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
  next_decision?: string;
  challenges?: Record<string, number>;
  papers?: { titles: string[]; relationship: string };
  paper_result?: { disagreement_rate: number; similarity_ci95: number[]; robust_disagreement: boolean };
}
export function objects<T>(record: RecordData | null, kind: string): T[] {
  return Object.values(record?.objects || {})
    .filter((x) => x.kind === kind)
    .map((x) => x.data as T);
}

export interface Contradiction {
  contradiction_id: string;
  conflicting_claim: string;
  shared_context: string;
  differing_conditions: string[];
  contradiction_strength: string;
  uncertainty: string;
  explanation: string;
}
export interface PaperMeta {
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
}
export interface PaperClaim {
  text: string;
  section: string;
  page: number;
  direction: string;
  stats: string[];
}
export interface PaperSummary {
  id: string;
  filename: string;
  pages: number;
  meta: PaperMeta;
  sample_size: number | null;
  sections: string[];
  warnings: string[];
  n_claims: number;
  top_claims: PaperClaim[];
  engine: string;
}
export interface AlignedPair {
  a: number;
  b: number;
  similarity: number;
  kind: string;
  shared_terms: string[];
  rank_score: number;
}
export interface ConditionDifference {
  field: string;
  a: string;
  b: string;
}
export interface AnalysisReport {
  analysis_id: string;
  engine: string;
  papers: (Omit<PaperSummary, 'n_claims' | 'top_claims' | 'engine'> & { sample_size: number | null })[];
  claims_a: PaperClaim[];
  claims_b: PaperClaim[];
  methods: { a: string | null; b: string | null };
  limitations: { a: string[]; b: string[] };
  pairs: AlignedPair[];
  best_pair: AlignedPair | null;
  condition_differences: ConditionDifference[];
  relationship: string;
  defensible_contradiction: boolean;
  caveats: string[];
  evidence?: Evidence[];
}
export interface PapersResult {
  method: string;
  unit: string;
  n_claims: { a: number; b: number };
  top_pair: {
    quote_a: string;
    quote_b: string;
    location_a: string;
    location_b: string;
    directions: string[];
    similarity: number;
    kind: string;
    shared_terms: string[];
  };
  similarity_ci95: number[];
  disagreement_rate: number;
  opposed_pairs: number;
  tension_pairs: number;
  aligned_pairs: number;
  comparable_pairs: number;
  section_sensitivity: { excluded_section: string; holds: boolean; similarity: number; kind: string }[];
  stats_coverage: { a: number; b: number };
  sample_sizes: { a: number | null; b: number | null };
  condition_differences: ConditionDifference[];
  robust_disagreement: boolean;
  relationship: string;
  bootstrap_samples: number;
  seed: number;
  assumptions: string[];
  limitations: string[];
  provenance: { dataset_sha256: string; code_sha256: string };
}
export interface PapersSource {
  kind: 'papers';
  analysis_id: string;
  engine: string;
  papers: {
    id: string;
    filename: string;
    pages: number;
    meta: PaperMeta;
    sections: string[];
    sample_size: number | null;
  }[];
  relationship: string;
  analysis: AnalysisReport;
  evidence: Evidence[];
}
