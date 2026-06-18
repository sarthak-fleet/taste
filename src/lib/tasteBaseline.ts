import { buildPairwiseVerdicts, criteriaForStudy, dimensionToOverallScore } from "./scoring";
import type { AgentOutput, DimensionScores, PairwiseVerdict } from "./types";
import { TASTE_CRITERIA, type TasteCriterion, type TastePairManifest, type TastePairVariant } from "./tasteDataset";

export const TASTE_BASELINE_MODEL_ID = "taste-mechanical-baseline-v0";

interface VariantEvidenceFeatures {
  highestRiskScore: number;
  totalClippedTextCandidates: number;
  totalLowContrastCandidates: number;
  totalFailedImages: number;
  maxHorizontalOverflow: number;
  maxFirstSectionHeightRatio: number;
  minVisibleActionCount: number;
  mobileRiskScore: number;
  desktopRiskScore: number;
}

export interface TasteBaselineResult {
  studyId: string;
  modelId: typeof TASTE_BASELINE_MODEL_ID;
  overallWinnerVariantId: string | null;
  overallConfidence: number;
  outputs: AgentOutput[];
  pairwiseVerdicts: PairwiseVerdict[];
  criterionScoresByVariant: Record<string, Partial<Record<TasteCriterion, number>>>;
  summary: string;
}

export interface TasteBaselineVariant {
  id: string;
  label: string;
  artifacts: TastePairVariant["artifacts"];
  mechanicalSummary: TastePairVariant["mechanicalSummary"];
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value * 10) / 10));
}

function extractEvidenceFeatures(variant: TasteBaselineVariant): VariantEvidenceFeatures {
  let maxFirstSectionHeightRatio = 0;
  let minVisibleActionCount = Number.POSITIVE_INFINITY;
  let mobileRiskScore = 0;
  let desktopRiskScore = 0;

  for (const artifact of variant.artifacts) {
    const metrics = artifact.metrics;
    maxFirstSectionHeightRatio = Math.max(maxFirstSectionHeightRatio, metrics.page.firstSectionHeightRatio ?? 0);
    minVisibleActionCount = Math.min(minVisibleActionCount, metrics.page.visibleActionCount);
    if (artifact.viewport === "mobile") mobileRiskScore = Math.max(mobileRiskScore, metrics.risk.score);
    if (artifact.viewport === "desktop") desktopRiskScore = Math.max(desktopRiskScore, metrics.risk.score);
  }

  return {
    highestRiskScore: variant.mechanicalSummary.highestRiskScore,
    totalClippedTextCandidates: variant.mechanicalSummary.totalClippedTextCandidates,
    totalLowContrastCandidates: variant.mechanicalSummary.totalLowContrastCandidates,
    totalFailedImages: variant.mechanicalSummary.totalFailedImages,
    maxHorizontalOverflow: variant.mechanicalSummary.maxHorizontalOverflow,
    maxFirstSectionHeightRatio,
    minVisibleActionCount: Number.isFinite(minVisibleActionCount) ? minVisibleActionCount : 0,
    mobileRiskScore,
    desktopRiskScore,
  };
}

function scoreVariant(features: VariantEvidenceFeatures): DimensionScores {
  const riskPenalty = features.highestRiskScore / 100;
  const clippedPenalty = Math.min(1.3, features.totalClippedTextCandidates * 0.11);
  const contrastPenalty = Math.min(1, features.totalLowContrastCandidates * 0.12);
  const failedImagePenalty = Math.min(1, features.totalFailedImages * 0.35);
  const overflowPenalty = features.maxHorizontalOverflow > 2 ? 0.8 : 0;
  const heroPenalty = Math.max(0, features.maxFirstSectionHeightRatio - 1.35) * 0.35;
  const missingActionPenalty = features.minVisibleActionCount === 0 ? 0.7 : 0;
  const mobilePenalty = features.mobileRiskScore / 100;
  const desktopPenalty = features.desktopRiskScore / 100;

  return {
    clarity: clampScore(4.4 - riskPenalty - clippedPenalty * 0.5 - heroPenalty),
    relevance: clampScore(3.4 - failedImagePenalty * 0.25),
    trust: clampScore(4.0 - failedImagePenalty - contrastPenalty * 0.3),
    firstActionClarity: clampScore(4.2 - missingActionPenalty - heroPenalty - clippedPenalty * 0.15),
    perceivedValue: clampScore(4.1 - riskPenalty - failedImagePenalty * 0.6 - desktopPenalty * 0.4),
    friction: clampScore(1.6 + riskPenalty * 2.1 + overflowPenalty + mobilePenalty + clippedPenalty * 0.4),
    differentiation: clampScore(3.2 - riskPenalty * 0.25),
    completionConfidence: clampScore(4.1 - mobilePenalty - failedImagePenalty - overflowPenalty * 0.5),
    conversionIntent: clampScore(4.0 - missingActionPenalty - heroPenalty * 0.5 - riskPenalty * 0.7),
  };
}

function scoreTasteCriteria(scores: DimensionScores, features: VariantEvidenceFeatures): Partial<Record<TasteCriterion, number>> {
  const readability = clampScore(scores.clarity - Math.min(0.8, features.totalClippedTextCandidates * 0.08));

  return {
    typography: readability,
    layoutHierarchy: clampScore((scores.clarity + scores.firstActionClarity + scores.perceivedValue) / 3),
    spacing: clampScore(5 - Math.min(4, features.highestRiskScore / 22 + features.totalClippedTextCandidates * 0.08)),
    colorHarmony: clampScore(4.2 - Math.min(2, features.totalLowContrastCandidates * 0.16)),
    visualPolish: clampScore((scores.perceivedValue + scores.trust + (6 - scores.friction)) / 3),
    brandTone: scores.differentiation,
    readability,
    mobileFit: clampScore(5 - Math.min(4, features.mobileRiskScore / 20 + (features.maxHorizontalOverflow > 2 ? 0.7 : 0))),
    conversionClarity: scores.conversionIntent,
    trustSignals: scores.trust,
  };
}

function buildFindings(variant: TasteBaselineVariant, features: VariantEvidenceFeatures): AgentOutput["findings"] {
  const findings: AgentOutput["findings"] = [];

  if (features.totalClippedTextCandidates > 0) {
    findings.push({
      severity: features.totalClippedTextCandidates > 4 ? "high" : "medium",
      type: "clipped_text",
      description: `${variant.label}: ${features.totalClippedTextCandidates} clipped text candidates reduce readability.`,
    });
  }

  if (features.maxFirstSectionHeightRatio > 1.35) {
    findings.push({
      severity: features.maxFirstSectionHeightRatio > 2 ? "high" : "medium",
      type: "hero_density",
      description: `${variant.label}: First section is ${features.maxFirstSectionHeightRatio.toFixed(1)}x the viewport height.`,
    });
  }

  if (features.minVisibleActionCount === 0) {
    findings.push({
      severity: "high",
      type: "cta_visibility",
      description: `${variant.label}: No above-fold action was detected.`,
    });
  }

  if (features.totalLowContrastCandidates > 0) {
    findings.push({
      severity: "medium",
      type: "contrast",
      description: `${variant.label}: ${features.totalLowContrastCandidates} text candidates may have weak contrast.`,
    });
  }

  return findings.length
    ? findings
    : [
        {
          severity: "low",
          type: "mechanical_fit",
          description: `${variant.label}: No major mechanical visual failures were detected.`,
        },
      ];
}

function buildValidityFlags(variant: TasteBaselineVariant, features: VariantEvidenceFeatures): AgentOutput["validityFlags"] {
  const flags: AgentOutput["validityFlags"] = [];

  if (!variant.artifacts.length) {
    flags.push({
      level: "major",
      type: "missing_asset",
      description: `${variant.label}: No screenshot artifacts were attached.`,
    });
  }

  if (features.totalFailedImages > 0) {
    flags.push({
      level: "major",
      type: "quality_warning",
      description: `${variant.label}: ${features.totalFailedImages} images failed to load during capture.`,
    });
  }

  if (features.highestRiskScore >= 45) {
    flags.push({
      level: "minor",
      type: "quality_warning",
      description: `${variant.label}: Mechanical risk is high enough to lower model confidence.`,
    });
  }

  return flags;
}

function buildOutput(variant: TasteBaselineVariant): AgentOutput {
  const features = extractEvidenceFeatures(variant);
  const scores = scoreVariant(features);

  return {
    variantId: variant.id,
    variantLabel: variant.label,
    variantName: variant.label,
    agentId: TASTE_BASELINE_MODEL_ID,
    agentSlug: TASTE_BASELINE_MODEL_ID,
    agentName: "Taste Mechanical Baseline",
    scores,
    prediction: {
      predictedRank: 1,
      predictedMetric: "mechanical_visual_quality",
      confidence: Math.max(0.35, 0.8 - features.highestRiskScore / 180),
    },
    findings: buildFindings(variant, features),
    validityFlags: buildValidityFlags(variant, features),
    recommendation:
      features.highestRiskScore >= 45
        ? `${variant.label} needs visual cleanup before it should anchor a model preference.`
        : `${variant.label} is mechanically judgeable by the Taste baseline.`,
  };
}

export function runTasteMechanicalBaseline(pair: TastePairManifest): TasteBaselineResult {
  return runTasteMechanicalBaselineForVariants({
    studyId: pair.pairId,
    studyType: pair.context.studyType,
    primaryObjective: pair.context.primaryObjective,
    variants: pair.variants,
  });
}

export function runTasteMechanicalBaselineForVariants(params: {
  studyId: string;
  studyType?: string;
  primaryObjective?: string;
  variants: TasteBaselineVariant[];
}): TasteBaselineResult {
  const initialOutputs = params.variants.map(buildOutput);
  const ranked = [...initialOutputs].sort(
    (a, b) => dimensionToOverallScore(b.scores as DimensionScores) - dimensionToOverallScore(a.scores as DimensionScores),
  );
  const rankByVariant = new Map(ranked.map((output, index) => [output.variantId, index + 1]));
  const outputs = initialOutputs.map((output) => ({
    ...output,
    prediction: {
      ...output.prediction,
      predictedRank: rankByVariant.get(output.variantId) ?? output.prediction.predictedRank,
    },
  }));
  const top = ranked[0];
  const second = ranked[1];
  const topScore = top ? dimensionToOverallScore(top.scores as DimensionScores) : 0;
  const secondScore = second ? dimensionToOverallScore(second.scores as DimensionScores) : topScore;
  const gap = topScore - secondScore;
  const overallWinnerVariantId = top && gap >= 0.15 ? top.variantId : null;
  const criteria = criteriaForStudy(params.studyType ?? "landing_page", params.primaryObjective);
  const pairwiseVerdicts = buildPairwiseVerdicts({
    agentSlug: TASTE_BASELINE_MODEL_ID,
    agentName: "Taste Mechanical Baseline",
    outputs,
    criteria,
  });

  const criterionScoresByVariant = Object.fromEntries(
    params.variants.map((variant) => {
      const features = extractEvidenceFeatures(variant);
      return [variant.id, scoreTasteCriteria(scoreVariant(features), features)];
    }),
  ) as Record<string, Partial<Record<TasteCriterion, number>>>;

  return {
    studyId: params.studyId,
    modelId: TASTE_BASELINE_MODEL_ID,
    overallWinnerVariantId,
    overallConfidence: Math.min(0.85, Math.max(0.35, 0.45 + gap * 0.18)),
    outputs,
    pairwiseVerdicts,
    criterionScoresByVariant,
    summary:
      overallWinnerVariantId == null
        ? "Mechanical baseline found no clear winner; collect human or VLM preference labels."
        : `Mechanical baseline prefers ${outputs.find((output) => output.variantId === overallWinnerVariantId)?.variantLabel}.`,
  };
}

export const TASTE_BASELINE_CRITERIA = TASTE_CRITERIA;
