import type { DimensionScores, EvaluatorType } from "./types";
import { dimensionToOverallScore } from "./scoring";

export interface HumanEvaluatorDef {
  name: string;
  role: string;
  type: EvaluatorType;
  seniority: string;
  emailSuffix?: string;
}

export const HUMAN_EVALUATOR_POOL: HumanEvaluatorDef[] = [
  { name: "Alex Chen", role: "Backend Engineer", type: "target_user", seniority: "5 years" },
  { name: "Jordan Park", role: "Engineering Manager", type: "buyer", seniority: "8 years" },
  { name: "Sam Rivera", role: "Product Designer", type: "domain_expert", seniority: "6 years" },
  { name: "Taylor Kim", role: "Growth PM", type: "domain_expert", seniority: "4 years" },
  { name: "Morgan Lee", role: "Full-stack Developer", type: "target_user", seniority: "3 years" },
  { name: "Casey Wright", role: "DevOps Engineer", type: "power_user", seniority: "7 years" },
  { name: "Riley Adams", role: "SaaS Founder", type: "domain_expert", seniority: "10 years" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function simulateHumanScores(
  variantId: string,
  variantIndex: number,
  evaluatorIndex: number,
): DimensionScores {
  const seed = hashString(`${variantId}:${evaluatorIndex}`);
  const base = 2.5 + (variantIndex === 0 ? 0.8 : variantIndex === 1 ? 0.4 : 0);
  const jitter = (seed % 100) / 100 - 0.5;
  const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v * 10) / 10));

  return {
    clarity: clamp(base + jitter + 0.3),
    relevance: clamp(base + jitter),
    trust: clamp(base - 0.2 + jitter),
    firstActionClarity: clamp(base + 0.5 + jitter),
    perceivedValue: clamp(base + jitter * 0.5),
    friction: clamp(4 - base + jitter),
    differentiation: clamp(base - 0.3 + jitter),
    completionConfidence: clamp(base + 0.2 + jitter),
    conversionIntent: clamp(base + 0.1 + jitter),
  };
}

export interface HumanEvalResult {
  evaluator: HumanEvaluatorDef;
  evaluatorIndex: number;
  variantResults: Array<{
    variantId: string;
    variantLabel: string;
    variantName: string;
    scores: DimensionScores;
    overall: number;
    taskCompleted: boolean;
    frictionPoints?: string;
    trustBlockers?: string;
    confusionNotes?: string;
  }>;
  predictedWinnerVariantId: string;
  predictedWinnerLabel: string;
  confidence: number;
  reasoning: string;
  quote?: string;
}

export function runHumanSimulation(params: {
  variants: Array<{ id: string; label: string; name: string }>;
  studyContext: {
    primaryObjective: string;
    targetUserRole: string;
  };
  evaluatorPool?: HumanEvaluatorDef[];
}): HumanEvalResult[] {
  const pool = params.evaluatorPool ?? HUMAN_EVALUATOR_POOL;

  return pool.map((ev, ei) => {
    const variantResults = params.variants.map((v, vi) => {
      const scores = simulateHumanScores(v.id, vi, ei);
      const overall = dimensionToOverallScore(scores);
      return {
        variantId: v.id,
        variantLabel: v.label,
        variantName: v.name,
        scores,
        overall,
        taskCompleted: scores.completionConfidence >= 3.5,
        frictionPoints: scores.friction > 3 ? "Perceived setup complexity" : undefined,
        trustBlockers: scores.trust < 3 ? "Missing proof or credibility signals" : undefined,
        confusionNotes: scores.clarity < 3 ? "Unclear product purpose on first view" : undefined,
      };
    });

    const sorted = [...variantResults].sort((a, b) => b.overall - a.overall);
    const winner = sorted[0]!;
    const confidence = 0.55 + (winner.overall / 5) * 0.35;

    const quote =
      ei < 4
        ? `${winner.variantLabel} is the only one where I immediately knew what setup would involve.`
        : `${winner.variantLabel} feels clearest for a ${ev.role.toLowerCase()}.`;

    return {
      evaluator: ev,
      evaluatorIndex: ei,
      variantResults,
      predictedWinnerVariantId: winner.variantId,
      predictedWinnerLabel: winner.variantLabel,
      confidence,
      reasoning: `Based on ${ev.role} perspective, Variant ${winner.variantLabel} has the clearest path to ${params.studyContext.primaryObjective.replace(/_/g, " ")}.`,
      quote,
    };
  });
}
