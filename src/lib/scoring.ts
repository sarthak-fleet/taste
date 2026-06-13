import type { ConfidenceLevel, DimensionScores, EvaluatorType, VariantRanking } from "./types";

export interface ScoringWeights {
  targetUser: number;
  expert: number;
  agent: number;
  taskCompletion: number;
  prediction: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  targetUser: 0.35,
  expert: 0.2,
  agent: 0.2,
  taskCompletion: 0.15,
  prediction: 0.1,
};

const ONBOARDING_WEIGHTS: ScoringWeights = {
  targetUser: 0.3,
  expert: 0.15,
  agent: 0.15,
  taskCompletion: 0.3,
  prediction: 0.1,
};

const LANDING_WEIGHTS: ScoringWeights = {
  targetUser: 0.3,
  expert: 0.2,
  agent: 0.2,
  taskCompletion: 0.1,
  prediction: 0.2,
};

/** Agent-first: no human validation yet — avoids chicken-and-egg on evaluator supply */
const AGENT_FIRST_WEIGHTS: ScoringWeights = {
  targetUser: 0.05,
  expert: 0.05,
  agent: 0.55,
  taskCompletion: 0.15,
  prediction: 0.2,
};

export function getWeightsForStudyType(studyType: string, hasHumanValidation = false): ScoringWeights {
  if (!hasHumanValidation) return AGENT_FIRST_WEIGHTS;
  if (studyType === "onboarding" || studyType === "signup_flow") return ONBOARDING_WEIGHTS;
  if (studyType === "landing_page") return LANDING_WEIGHTS;
  return DEFAULT_WEIGHTS;
}

export function averageDimensionScores(scores: Partial<DimensionScores>[]): DimensionScores {
  const keys = Object.keys({
    clarity: 0,
    relevance: 0,
    trust: 0,
    firstActionClarity: 0,
    perceivedValue: 0,
    friction: 0,
    differentiation: 0,
    completionConfidence: 0,
    conversionIntent: 0,
  }) as (keyof DimensionScores)[];

  const result = {} as DimensionScores;
  for (const key of keys) {
    const vals = scores.map((s) => s[key]).filter((v): v is number => v != null);
    result[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 3;
  }
  return result;
}

export function dimensionToOverallScore(scores: DimensionScores): number {
  const frictionInverted = 6 - scores.friction;
  const vals = [
    scores.clarity,
    scores.relevance,
    scores.trust,
    scores.firstActionClarity,
    scores.perceivedValue,
    frictionInverted,
    scores.differentiation,
    scores.completionConfidence,
    scores.conversionIntent,
  ];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export interface VariantScoreInput {
  variantId: string;
  variantLabel: string;
  variantName: string;
  targetUserScore: number;
  expertScore: number;
  agentScore: number;
  taskCompletionRate: number;
  predictionScore: number;
}

export function computeVariantRankings(
  inputs: VariantScoreInput[],
  weights: ScoringWeights,
): VariantRanking[] {
  const scored = inputs.map((v) => ({
    ...v,
    overallScore:
      v.targetUserScore * weights.targetUser +
      v.expertScore * weights.expert +
      v.agentScore * weights.agent +
      v.taskCompletionRate * weights.taskCompletion +
      v.predictionScore * weights.prediction,
  }));

  scored.sort((a, b) => b.overallScore - a.overallScore);

  const max = scored[0]?.overallScore ?? 0;
  const min = scored[scored.length - 1]?.overallScore ?? 0;
  const gap = max - min;

  return scored.map((v, i) => {
    let recommendation: VariantRanking["recommendation"] = "test";
    if (i === 0) recommendation = "ship";
    else if (i === 1 && gap < 0.5) recommendation = "borrow";
    else if (i === scored.length - 1) recommendation = "kill";
    else if (v.overallScore < max * 0.7) recommendation = "kill";
    else recommendation = "test";

    let confidence: ConfidenceLevel = "medium";
    if (gap > 1.2 && i === 0) confidence = "high";
    else if (gap > 0.8 && i === 0) confidence = "medium_high";
    else if (gap < 0.3) confidence = "low";

    return {
      variantId: v.variantId,
      variantLabel: v.variantLabel,
      variantName: v.variantName,
      rank: i + 1,
      overallScore: Math.round(v.overallScore * 100) / 100,
      recommendation,
      confidence,
      scores: {
        targetUser: v.targetUserScore,
        expert: v.expertScore,
        agent: v.agentScore,
        taskCompletion: v.taskCompletionRate,
        prediction: v.predictionScore,
      },
    };
  });
}

export function computeConfidenceLevel(params: {
  humanAgreement: number;
  agentAgreement: number;
  sampleSize: number;
  variantGap: number;
  evaluatorQuality: number;
}): { level: ConfidenceLevel; reason: string } {
  const { humanAgreement, agentAgreement, sampleSize, variantGap, evaluatorQuality } = params;
  let score = 0;
  score += humanAgreement * 0.35;
  score += agentAgreement * 0.2;
  score += Math.min(sampleSize / 10, 1) * 0.2;
  score += Math.min(variantGap / 2, 1) * 0.15;
  score += evaluatorQuality * 0.1;

  const reasons: string[] = [];
  if (humanAgreement > 0.7) reasons.push("strong human evaluator agreement");
  if (agentAgreement > 0.6) reasons.push("AI agents largely aligned");
  if (sampleSize >= 5) reasons.push(`adequate sample size (${sampleSize} evaluators)`);
  if (variantGap > 0.8) reasons.push("clear score gap between top variants");
  if (humanAgreement < 0.5) reasons.push("human evaluators disagreed on winner");
  if (agentAgreement < 0.4) reasons.push("AI agents showed mixed signals");

  let level: ConfidenceLevel = "medium";
  if (score > 0.75) level = "high";
  else if (score > 0.6) level = "medium_high";
  else if (score < 0.35) level = "low";

  return {
    level,
    reason: reasons.join("; ") || "Limited evaluation data available",
  };
}

export function evaluatorTypeWeight(type: EvaluatorType): number {
  switch (type) {
    case "target_user":
      return 1;
    case "domain_expert":
      return 0.85;
    case "buyer":
      return 0.75;
    case "power_user":
      return 0.8;
    default:
      return 0.6;
  }
}
