import { criteriaForStudy } from './scoring';
import {
  runTasteMechanicalBaselineForVariants,
  type TasteBaselineResult,
  type TasteBaselineVariant,
} from './tasteBaseline';
import type { TasteCriterion } from './tasteDataset';
import type { AgentOutput, DimensionScores, PairwiseVerdict } from './types';

export const TASTE_RANKER_FEATURE_NAMES = [
  'risk_delta',
  'clipped_delta',
  'contrast_delta',
  'failed_images_delta',
  'overflow_delta',
  'desktop_text_density_delta',
  'mobile_text_density_delta',
  'desktop_first_section_ratio_delta',
  'mobile_first_section_ratio_delta',
  'desktop_action_count_delta',
  'mobile_action_count_delta',
  'desktop_heading_count_delta',
  'mobile_heading_count_delta',
  'desktop_scroll_depth_delta',
  'mobile_scroll_depth_delta',
] as const;

export interface TasteLinearRankerModel {
  modelId: string;
  featureNames: typeof TASTE_RANKER_FEATURE_NAMES;
  weights: number[];
  bias: number;
}

export interface TasteLinearRankerResult {
  studyId: string;
  modelId: string;
  overallWinnerVariantId: string | null;
  overallConfidence: number;
  outputs: AgentOutput[];
  pairwiseVerdicts: PairwiseVerdict[];
  criterionScoresByVariant: Record<string, Partial<Record<TasteCriterion, number>>>;
  summary: string;
}

interface PairPrediction {
  variantA: TasteBaselineVariant;
  variantB: TasteBaselineVariant;
  probA: number;
  preferredVariantId: string | null;
  confidence: number;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function dot(weights: number[], x: number[]) {
  return weights.reduce((sum, weight, index) => sum + weight * (x[index] ?? 0), 0);
}

function assertRankerModel(value: TasteLinearRankerModel): asserts value is TasteLinearRankerModel {
  if (!value || typeof value.modelId !== 'string' || !value.modelId) {
    throw new Error('Taste ranker model needs a modelId');
  }
  if (
    !Array.isArray(value.featureNames) ||
    value.featureNames.join('|') !== TASTE_RANKER_FEATURE_NAMES.join('|')
  ) {
    throw new Error(
      `Taste ranker model featureNames must be ${TASTE_RANKER_FEATURE_NAMES.join(',')}`
    );
  }
  if (!Array.isArray(value.weights) || value.weights.length !== TASTE_RANKER_FEATURE_NAMES.length) {
    throw new Error(`Taste ranker model needs ${TASTE_RANKER_FEATURE_NAMES.length} weights`);
  }
  if (!value.weights.every((weight) => Number.isFinite(weight)) || !Number.isFinite(value.bias)) {
    throw new Error('Taste ranker model weights and bias must be finite numbers');
  }
}

export function parseTasteLinearRankerModelJson(json: string): TasteLinearRankerModel {
  const model = JSON.parse(json) as TasteLinearRankerModel;
  assertRankerModel(model);
  return model;
}

export function tasteRankerFeatureVector(
  a: TasteBaselineVariant,
  b: TasteBaselineVariant
): number[] {
  const av = a.mechanicalSummary;
  const bv = b.mechanicalSummary;
  const desktopA = artifactMetrics(a, 'desktop');
  const desktopB = artifactMetrics(b, 'desktop');
  const mobileA = artifactMetrics(a, 'mobile');
  const mobileB = artifactMetrics(b, 'mobile');
  return [
    (bv.highestRiskScore - av.highestRiskScore) / 100,
    (bv.totalClippedTextCandidates - av.totalClippedTextCandidates) / 20,
    (bv.totalLowContrastCandidates - av.totalLowContrastCandidates) / 20,
    (bv.totalFailedImages - av.totalFailedImages) / 10,
    (bv.maxHorizontalOverflow - av.maxHorizontalOverflow) / 500,
    delta(desktopB?.page.aboveFoldTextDensity, desktopA?.page.aboveFoldTextDensity, 0.02),
    delta(mobileB?.page.aboveFoldTextDensity, mobileA?.page.aboveFoldTextDensity, 0.04),
    delta(desktopB?.page.firstSectionHeightRatio, desktopA?.page.firstSectionHeightRatio, 5),
    delta(mobileB?.page.firstSectionHeightRatio, mobileA?.page.firstSectionHeightRatio, 8),
    delta(desktopB?.page.visibleActionCount, desktopA?.page.visibleActionCount, 30),
    delta(mobileB?.page.visibleActionCount, mobileA?.page.visibleActionCount, 30),
    delta(desktopB?.page.visibleHeadingCount, desktopA?.page.visibleHeadingCount, 12),
    delta(mobileB?.page.visibleHeadingCount, mobileA?.page.visibleHeadingCount, 12),
    delta(scrollDepth(desktopB), scrollDepth(desktopA), 10),
    delta(scrollDepth(mobileB), scrollDepth(mobileA), 12),
  ];
}

function artifactMetrics(variant: TasteBaselineVariant, viewport: 'desktop' | 'mobile') {
  return variant.artifacts.find((artifact) => artifact.viewport === viewport)?.metrics;
}

function delta(b: number | null | undefined, a: number | null | undefined, scale: number) {
  return ((b ?? 0) - (a ?? 0)) / scale;
}

function scrollDepth(metrics: ReturnType<typeof artifactMetrics>) {
  if (!metrics) return 0;
  return metrics.page.scrollHeight / Math.max(1, metrics.page.viewportHeight);
}

export function predictTasteRankerProbFromFeatures(
  model: TasteLinearRankerModel,
  features: number[]
) {
  return sigmoid(dot(model.weights, features) + model.bias);
}

export function predictTasteRankerProbA(
  model: TasteLinearRankerModel,
  a: TasteBaselineVariant,
  b: TasteBaselineVariant
) {
  return predictTasteRankerProbFromFeatures(model, tasteRankerFeatureVector(a, b));
}

function pairConfidence(probA: number) {
  return Math.min(0.95, Math.max(0.5, 0.5 + Math.abs(probA - 0.5) * 0.9));
}

function predictPairs(params: {
  model: TasteLinearRankerModel;
  variants: TasteBaselineVariant[];
  tieLow: number;
  tieHigh: number;
}): PairPrediction[] {
  const pairs: PairPrediction[] = [];
  for (let i = 0; i < params.variants.length; i++) {
    for (let j = i + 1; j < params.variants.length; j++) {
      const variantA = params.variants[i]!;
      const variantB = params.variants[j]!;
      const probA = predictTasteRankerProbA(params.model, variantA, variantB);
      pairs.push({
        variantA,
        variantB,
        probA,
        preferredVariantId:
          probA > params.tieHigh ? variantA.id : probA < params.tieLow ? variantB.id : null,
        confidence: pairConfidence(probA),
      });
    }
  }
  return pairs;
}

function rankVariants(variants: TasteBaselineVariant[], pairs: PairPrediction[]) {
  const scores = new Map(variants.map((variant) => [variant.id, 0]));
  for (const pair of pairs) {
    scores.set(pair.variantA.id, (scores.get(pair.variantA.id) ?? 0) + pair.probA);
    scores.set(pair.variantB.id, (scores.get(pair.variantB.id) ?? 0) + (1 - pair.probA));
  }
  return variants
    .map((variant) => ({ variant, score: scores.get(variant.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

function rankByVariant(ranked: ReturnType<typeof rankVariants>) {
  return new Map(ranked.map((row, index) => [row.variant.id, index + 1]));
}

function scoreAdjustmentForRank(rank: number, total: number) {
  if (total <= 1) return 0;
  return ((total - rank) / (total - 1) - 0.5) * 0.35;
}

function rewriteOutput(params: {
  output: AgentOutput;
  modelId: string;
  rank: number;
  total: number;
  confidence: number;
}): AgentOutput {
  const adjustment = scoreAdjustmentForRank(params.rank, params.total);
  const scores = Object.fromEntries(
    Object.entries(params.output.scores).map(([key, value]) => [
      key,
      key === 'friction'
        ? Math.max(1, Math.min(5, (value ?? 3) - adjustment))
        : Math.max(1, Math.min(5, (value ?? 3) + adjustment)),
    ])
  ) as Partial<DimensionScores>;

  return {
    ...params.output,
    agentId: params.modelId,
    agentSlug: params.modelId,
    agentName: 'Taste Linear Ranker',
    scores,
    prediction: {
      predictedRank: params.rank,
      predictedMetric: 'taste_linear_mechanical_preference',
      confidence: params.confidence,
    },
    recommendation:
      params.rank === 1
        ? `${params.output.variantLabel} is preferred by the local Taste ranker.`
        : `${params.output.variantLabel} trails the local Taste ranker winner.`,
  };
}

function buildRankerVerdicts(params: {
  modelId: string;
  pairs: PairPrediction[];
  studyType?: string;
  primaryObjective?: string;
}): PairwiseVerdict[] {
  const criteria = criteriaForStudy(params.studyType ?? 'landing_page', params.primaryObjective);
  return criteria.flatMap((criterion) =>
    params.pairs.map((pair) => ({
      agentSlug: params.modelId,
      agentName: 'Taste Linear Ranker',
      criterion: criterion.key,
      criterionLabel: criterion.label,
      variantAId: pair.variantA.id,
      variantALabel: pair.variantA.label,
      variantBId: pair.variantB.id,
      variantBLabel: pair.variantB.label,
      preferredVariantId: pair.preferredVariantId,
      preferredLabel:
        pair.preferredVariantId === pair.variantA.id
          ? pair.variantA.label
          : pair.preferredVariantId === pair.variantB.id
            ? pair.variantB.label
            : null,
      firstOrderPreferredVariantId: pair.preferredVariantId,
      reverseOrderPreferredVariantId: pair.preferredVariantId,
      orderConsistent: true,
      confidence: pair.confidence,
      rationale:
        pair.preferredVariantId == null
          ? `Local ranker found no clear preference on ${criterion.label.toLowerCase()}.`
          : `Local ranker preferred ${
              pair.preferredVariantId === pair.variantA.id
                ? pair.variantA.label
                : pair.variantB.label
            } using learned evidence weights.`,
    }))
  );
}

function topPairConfidence(
  pairs: PairPrediction[],
  winnerId: string | null,
  secondId: string | null
) {
  if (!winnerId || !secondId) return 0.5;
  const pair = pairs.find(
    (candidate) =>
      (candidate.variantA.id === winnerId && candidate.variantB.id === secondId) ||
      (candidate.variantA.id === secondId && candidate.variantB.id === winnerId)
  );
  return pair?.confidence ?? 0.5;
}

export function runTasteLinearRankerForVariants(params: {
  studyId: string;
  studyType?: string;
  primaryObjective?: string;
  variants: TasteBaselineVariant[];
  model: TasteLinearRankerModel;
  tieLow?: number;
  tieHigh?: number;
}): TasteLinearRankerResult {
  assertRankerModel(params.model);
  const baseline: TasteBaselineResult = runTasteMechanicalBaselineForVariants({
    studyId: params.studyId,
    studyType: params.studyType,
    primaryObjective: params.primaryObjective,
    variants: params.variants,
  });
  const tieLow = params.tieLow ?? 0.45;
  const tieHigh = params.tieHigh ?? 0.55;
  const pairs = predictPairs({ model: params.model, variants: params.variants, tieLow, tieHigh });
  const ranked = rankVariants(params.variants, pairs);
  const ranks = rankByVariant(ranked);
  const top = ranked[0];
  const second = ranked[1];
  const topGap = top && second ? top.score - second.score : 0;
  const directTopConfidence = topPairConfidence(
    pairs,
    top?.variant.id ?? null,
    second?.variant.id ?? null
  );
  const overallWinnerVariantId =
    top && topGap >= 0.08 && directTopConfidence > 0.54 ? top.variant.id : null;
  const outputs = baseline.outputs.map((output) =>
    rewriteOutput({
      output,
      modelId: params.model.modelId,
      rank: ranks.get(output.variantId) ?? output.prediction.predictedRank,
      total: baseline.outputs.length,
      confidence:
        output.variantId === overallWinnerVariantId
          ? directTopConfidence
          : Math.max(0.45, directTopConfidence - 0.08),
    })
  );

  return {
    studyId: params.studyId,
    modelId: params.model.modelId,
    overallWinnerVariantId,
    overallConfidence: overallWinnerVariantId ? directTopConfidence : 0.5,
    outputs,
    pairwiseVerdicts: buildRankerVerdicts({
      modelId: params.model.modelId,
      pairs,
      studyType: params.studyType,
      primaryObjective: params.primaryObjective,
    }),
    criterionScoresByVariant: baseline.criterionScoresByVariant,
    summary:
      overallWinnerVariantId == null
        ? 'Local Taste ranker found no clear winner; use VLM, human, or more labels.'
        : `Local Taste ranker prefers ${outputs.find((output) => output.variantId === overallWinnerVariantId)?.variantLabel}.`,
  };
}
