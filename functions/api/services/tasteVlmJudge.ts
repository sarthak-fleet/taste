import { buildPairwiseVerdicts, criteriaForStudy, dimensionToOverallScore } from "../../../src/lib/scoring";
import type { AgentFinding, AgentOutput, AgentValidityFlag, DimensionScores, PairwiseVerdict } from "../../../src/lib/types";
import type { TasteBaselineVariant } from "../../../src/lib/tasteBaseline";
import type { TasteCriterion } from "../../../src/lib/tasteDataset";

export interface TasteVlmConfig {
  apiBase?: string;
  apiKey?: string;
  model?: string;
}

export interface TasteVlmResult {
  studyId: string;
  modelId: string;
  overallWinnerVariantId: string | null;
  overallConfidence: number;
  outputs: AgentOutput[];
  pairwiseVerdicts: PairwiseVerdict[];
  criterionScoresByVariant: Record<string, Partial<Record<TasteCriterion, number>>>;
  summary: string;
}

interface VlmJson {
  overallWinnerVariantId?: string | null;
  overallConfidence?: number;
  summary?: string;
  scoresByVariant?: Record<string, Partial<DimensionScores>>;
  findingsByVariant?: Record<string, AgentFinding[]>;
  validityFlagsByVariant?: Record<string, AgentValidityFlag[]>;
}

interface ChatCompletionPayload {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: unknown;
}

function imageUrlsForVariant(variant: TasteBaselineVariant): string[] {
  return variant.artifacts
    .flatMap((artifact) => [artifact.aboveFoldPath, artifact.fullPagePath])
    .filter((path) => /^https?:\/\//i.test(path))
    .slice(0, 4);
}

export function canRunTasteVlmJudge(config: TasteVlmConfig, variants: TasteBaselineVariant[]) {
  return Boolean(config.apiBase && config.apiKey && config.model) && variants.filter((variant) => imageUrlsForVariant(variant).length > 0).length >= 2;
}

function clampScore(value: unknown, fallback = 3): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(5, Math.round(numeric * 10) / 10));
}

function normalizeScores(scores?: Partial<DimensionScores>): DimensionScores {
  return {
    clarity: clampScore(scores?.clarity),
    relevance: clampScore(scores?.relevance),
    trust: clampScore(scores?.trust),
    firstActionClarity: clampScore(scores?.firstActionClarity),
    perceivedValue: clampScore(scores?.perceivedValue),
    friction: clampScore(scores?.friction),
    differentiation: clampScore(scores?.differentiation),
    completionConfidence: clampScore(scores?.completionConfidence),
    conversionIntent: clampScore(scores?.conversionIntent),
  };
}

function confidence(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0.55;
  return Math.max(0.1, Math.min(0.95, numeric));
}

function buildPrompt(params: {
  studyType?: string;
  primaryObjective?: string;
  targetUserRole?: string;
  variants: TasteBaselineVariant[];
}) {
  const context = [
    `Study type: ${params.studyType ?? "landing_page"}`,
    `Objective: ${params.primaryObjective ?? "task_completion"}`,
    `Target user: ${params.targetUserRole ?? "target user"}`,
  ].join("\n");

  const variantText = params.variants
    .map((variant) => {
      const desktop = variant.artifacts.find((artifact) => artifact.viewport === "desktop")?.metrics;
      const mobile = variant.artifacts.find((artifact) => artifact.viewport === "mobile")?.metrics;
      return [
        `Variant ${variant.label} (${variant.id})`,
        `Mechanical risk: ${variant.mechanicalSummary.highestRiskLevel}/${variant.mechanicalSummary.highestRiskScore}`,
        `Desktop: clipped=${desktop?.issues.clippedText.length ?? 0}, contrast=${desktop?.issues.lowContrastText.length ?? 0}, overflow=${desktop?.page.overflowX ?? 0}`,
        `Mobile: clipped=${mobile?.issues.clippedText.length ?? 0}, contrast=${mobile?.issues.lowContrastText.length ?? 0}, overflow=${mobile?.page.overflowX ?? 0}`,
      ].join("\n");
    })
    .join("\n\n");

  return `${context}\n\n${variantText}\n\nReturn strict JSON with keys: overallWinnerVariantId, overallConfidence, summary, scoresByVariant, findingsByVariant, validityFlagsByVariant. Score every variant on clarity, relevance, trust, firstActionClarity, perceivedValue, friction, differentiation, completionConfidence, conversionIntent from 1 to 5. Lower friction score means less friction. Cite visible evidence, not generic design language.`;
}

function contentForVariants(prompt: string, variants: TasteBaselineVariant[]) {
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: prompt },
  ];

  for (const variant of variants) {
    content.push({ type: "text", text: `Images for Variant ${variant.label} (${variant.id})` });
    for (const url of imageUrlsForVariant(variant)) {
      content.push({ type: "image_url", image_url: { url } });
    }
  }

  return content;
}

function parseModelJson(raw: unknown): VlmJson {
  if (typeof raw !== "string") throw new Error("VLM response did not include text content");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced ?? raw) as VlmJson;
}

function outputsFromVlm(params: {
  modelId: string;
  variants: TasteBaselineVariant[];
  json: VlmJson;
}): AgentOutput[] {
  const rankedVariantIds = [...params.variants]
    .sort((a, b) => {
      const aScores = normalizeScores(params.json.scoresByVariant?.[a.id]);
      const bScores = normalizeScores(params.json.scoresByVariant?.[b.id]);
      return dimensionToOverallScore(bScores) - dimensionToOverallScore(aScores);
    })
    .map((variant) => variant.id);

  return params.variants.map((variant) => ({
    variantId: variant.id,
    variantLabel: variant.label,
    variantName: variant.label,
    agentId: params.modelId,
    agentSlug: params.modelId,
    agentName: "Taste VLM Judge",
    scores: normalizeScores(params.json.scoresByVariant?.[variant.id]),
    prediction: {
      predictedRank: rankedVariantIds.indexOf(variant.id) + 1 || 99,
      predictedMetric: "visual_preference",
      confidence: confidence(params.json.overallConfidence),
    },
    findings: params.json.findingsByVariant?.[variant.id]?.slice(0, 4) ?? [
      {
        severity: "medium",
        type: "visual_preference",
        description: `${variant.label}: VLM returned scores without detailed findings.`,
      },
    ],
    validityFlags: params.json.validityFlagsByVariant?.[variant.id]?.slice(0, 4) ?? [],
    recommendation:
      params.json.overallWinnerVariantId === variant.id
        ? `${variant.label} is the VLM-preferred variant for the stated objective.`
        : `${variant.label} was evaluated by the VLM judge but was not the top pick.`,
  }));
}

export async function runTasteVlmJudgeForVariants(params: {
  config: TasteVlmConfig;
  studyId: string;
  studyType?: string;
  primaryObjective?: string;
  targetUserRole?: string;
  variants: TasteBaselineVariant[];
}): Promise<TasteVlmResult | null> {
  if (!canRunTasteVlmJudge(params.config, params.variants)) return null;

  const modelId = `taste-vlm-${params.config.model}`;
  const prompt = buildPrompt(params);
  const response = await fetch(`${params.config.apiBase!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.config.apiKey}`,
    },
    body: JSON.stringify({
      model: params.config.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are Taste, a strict website/product design preference judge. Return only JSON.",
        },
        {
          role: "user",
          content: contentForVariants(prompt, params.variants),
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as ChatCompletionPayload | null;
  if (!response.ok) {
    const message =
      payload?.error
        ? JSON.stringify(payload.error)
        : `VLM request failed with ${response.status}`;
    throw new Error(message);
  }

  const rawContent = payload?.choices?.[0]?.message?.content;
  const json = parseModelJson(rawContent);
  const outputs = outputsFromVlm({ modelId, variants: params.variants, json });
  const criteria = criteriaForStudy(params.studyType ?? "landing_page", params.primaryObjective);
  const pairwiseVerdicts = buildPairwiseVerdicts({
    agentSlug: modelId,
    agentName: "Taste VLM Judge",
    outputs,
    criteria,
  });

  const overallWinnerVariantId =
    json.overallWinnerVariantId && params.variants.some((variant) => variant.id === json.overallWinnerVariantId)
      ? json.overallWinnerVariantId
      : outputs.find((output) => output.prediction.predictedRank === 1)?.variantId ?? null;

  return {
    studyId: params.studyId,
    modelId,
    overallWinnerVariantId,
    overallConfidence: confidence(json.overallConfidence),
    outputs,
    pairwiseVerdicts,
    criterionScoresByVariant: {},
    summary: json.summary ?? "Taste VLM judge completed visual preference evaluation.",
  };
}
