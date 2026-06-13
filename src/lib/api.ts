const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export interface Study {
  id: string;
  workspaceId: string;
  name: string;
  studyType: string;
  status: string;
  productName?: string;
  productUrl?: string;
  productDescription?: string;
  productStage?: string;
  targetUserRole?: string;
  targetUserDescription?: string;
  targetUserIndustry?: string;
  targetUserTechnical?: boolean;
  primaryObjective?: string;
  primaryMetric?: string;
  contextQuestions?: string;
  contextConcerns?: string;
  contextTradeoffs?: string;
  privacyLevel?: string;
  turnaroundLevel?: string;
  studyBrief?: string;
  createdAt: string;
  launchedAt?: string;
  completedAt?: string;
}

export interface Variant {
  id: string;
  studyId: string;
  name: string;
  label: string;
  description?: string;
  hypothesis?: string;
  assetType: string;
  assetUrl?: string;
  snapshotUrl?: string;
  sortOrder: number;
  lockedAt?: string;
}

export interface Report {
  id: string;
  studyId: string;
  status: string;
  recommendationVariantId?: string;
  confidenceLevel?: string;
  summary?: string;
  reportJson?: import("./types").ReportContent;
  deliveredAt?: string;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  getStudies: (workspaceId?: string) =>
    request<Study[]>(`/studies${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),

  getStudy: (id: string) =>
    request<{
      study: Study;
      variants: Variant[];
      report?: Report;
      agentRuns: unknown[];
      predictions: unknown[];
      outcome?: unknown;
    }>(`/studies/${id}`),

  createStudy: (data: Record<string, unknown>) =>
    request<{ study: Study; variants: Variant[] }>("/studies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  launchStudy: (id: string) =>
    request<{ study: Study; report?: Report }>(`/studies/${id}/launch`, { method: "POST" }),

  getReport: (studyId: string) => request<Report>(`/studies/${studyId}/report`),

  submitOutcome: (studyId: string, data: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/studies/${studyId}/outcome`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  runSimulation: (studyId: string, mode: "agents" | "humans" | "full") =>
    request<import("./simulation").SimulationResult>(`/studies/${studyId}/simulate`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),

  getSimulation: (studyId: string) =>
    request<import("./simulation").SimulationResult>(`/studies/${studyId}/simulation`),

  listAgents: () =>
    request<Array<{ slug: string; name: string; description: string; agentType: string }>>(
      "/studies/agents/list",
    ),

  getArenaBattles: () => request<unknown[]>("/arena/battles"),

  getArenaBattle: (slug: string) => request<{
    battle: Record<string, unknown>;
    votes: number;
    voteCounts: { a: number; b: number };
    communityPrediction: string | null;
  }>(`/arena/battles/${slug}`),

  voteArena: (slug: string, data: Record<string, unknown>) =>
    request<{ ok: boolean; agentCritiques: unknown[] }>(`/arena/battles/${slug}/vote`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getLeaderboard: () => request<Array<{ name: string; accuracy: number; predictions: number }>>("/arena/leaderboard"),

  getAdminOverview: () =>
    request<{
      stats: Record<string, number>;
      recentStudies: Study[];
    }>("/admin/overview"),

  applyEvaluator: (data: Record<string, unknown>) =>
    request<{ ok: boolean }>("/evaluators/apply", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const DEMO_WORKSPACE_ID = "ws-demo-001";
