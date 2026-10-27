/**
 * Fields this UI reads from petro-rag-agent.
 * The upstream shapes live in that repo's api_server.py (`done`, sync, review).
 * Extra keys are kept so a newer backend does not get stripped in transit.
 */

export type PetroChart = {
  rel_path?: string;
  path?: string;
  summary?: string;
  verdict?: string;
};

export type PhysicsCheckItem = {
  code?: string;
  ok?: boolean;
  detail?: string;
};

export type PhysicsCheck = {
  status?: string;
  blocking?: boolean;
  verdict?: string;
  summary?: string;
  rules_version?: string;
  params?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  violations?: unknown[];
  checks?: PhysicsCheckItem[];
};

export type QualityGate = {
  status?: string;
  reason?: string;
  quarantined?: boolean;
};

export type RiskDecision = {
  level?: string;
  level_label?: string;
  triggered?: boolean;
  resolved?: boolean;
  label?: string;
  p?: number;
  p_ci?: number[];
  n?: number;
  text?: string;
  notes?: string[];
  rule?: string;
};

export type HumanReview = {
  required?: boolean;
  approved?: boolean | null;
  auto?: boolean;
  reviewer?: string;
  comment?: string;
  rejections?: number;
  max_rejections?: number;
};

export type PetroResult = {
  status?: string;
  gate_status?: string;
  thread_id?: string;
  report?: string;
  score?: number | null;
  extracted_params?: string;
  model_routing?: Record<string, string>;
  chart?: PetroChart;
  physics_check?: PhysicsCheck;
  quality_gate?: QualityGate;
  human_review?: HumanReview;
  risk_decision?: RiskDecision;
  uq?: Record<string, unknown>;
  injection_plan?: Record<string, unknown>;
  temporal?: Record<string, unknown>;
  cost_estimation?: { caption?: string; total_cny?: number; currency?: string };
  elapsed_s?: number;
  history_entry?: string;
  note?: string;
  message?: string;
};

export type PetroSseEvent = {
  type: string;
  node?: string;
  label?: string;
  status?: string;
  t?: number;
  text?: string;
  stage?: string;
  chart?: PetroChart;
  uq?: Record<string, unknown>;
  message?: string;
  report?: string;
} & PetroResult;

export type HealthCheck = {
  ok?: boolean;
  detail?: string;
  latency_ms?: number;
};

export type PetroHealth = {
  reachable: boolean;
  mock: boolean;
  status: "ok" | "degraded" | "offline" | "mock";
  baseUrl: string;
  authConfigured: boolean;
  probedPath?: string;
  message: string;
  recovery?: string[];
  auth?: string;
  service?: string;
  checks?: Record<string, HealthCheck> | null;
};
