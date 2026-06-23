import type {
  AgentOutput,
  ConfidenceLevel,
  CriterionDefinition,
  CriterionSignal,
  DimensionScores,
  EvaluatorType,
  PairwiseVerdict,
  SignalQualitySummary,
  SignalStrength,
  VariantRanking,
} from './types';

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

const DEFAULT_CRITERIA: CriterionDefinition[] = [
  { key: 'clarity', label: 'Clarity', weight: 1, kind: 'preference' },
  { key: 'relevance', label: 'Target-user relevance', weight: 1, kind: 'preference' },
  { key: 'trust', label: 'Trust evidence', weight: 1, kind: 'trust' },
  { key: 'firstActionClarity', label: 'First-action clarity', weight: 1, kind: 'fidelity' },
  { key: 'perceivedValue', label: 'Perceived value', weight: 1, kind: 'preference' },
  { key: 'friction', label: 'Low friction', weight: 1, kind: 'friction' },
  { key: 'differentiation', label: 'Differentiation', weight: 1, kind: 'preference' },
  { key: 'completionConfidence', label: 'Completion confidence', weight: 1, kind: 'fidelity' },
  { key: 'conversionIntent', label: 'Conversion intent', weight: 1, kind: 'preference' },
];

export function getWeightsForStudyType(
  studyType: string,
  hasHumanValidation = false
): ScoringWeights {
  if (!hasHumanValidation) return AGENT_FIRST_WEIGHTS;
  if (studyType === 'onboarding' || studyType === 'signup_flow') return ONBOARDING_WEIGHTS;
  if (studyType === 'landing_page') return LANDING_WEIGHTS;
  return DEFAULT_WEIGHTS;
}

export function criteriaForStudy(studyType: string, objective?: string): CriterionDefinition[] {
  const byKey = new Map(DEFAULT_CRITERIA.map((c) => [c.key, c]));
  const keys: (keyof DimensionScores)[] =
    studyType === 'onboarding' || studyType === 'signup_flow'
      ? ['firstActionClarity', 'friction', 'completionConfidence', 'clarity', 'trust']
      : studyType === 'pricing_page'
        ? ['perceivedValue', 'trust', 'friction', 'conversionIntent', 'differentiation']
        : studyType === 'copy_messaging'
          ? ['clarity', 'differentiation', 'perceivedValue', 'relevance', 'trust']
          : studyType === 'ux_flow'
            ? ['firstActionClarity', 'friction', 'completionConfidence', 'clarity', 'relevance']
            : [
                'clarity',
                'relevance',
                'trust',
                'firstActionClarity',
                'perceivedValue',
                'conversionIntent',
              ];

  const objectiveBoosts: Partial<Record<string, keyof DimensionScores>> = {
    maximize_signup: 'conversionIntent',
    increase_activation: 'completionConfidence',
    reduce_confusion: 'clarity',
    increase_trust: 'trust',
    improve_value: 'perceivedValue',
    task_completion: 'completionConfidence',
    reduce_friction: 'friction',
  };
  const boosted = objective ? objectiveBoosts[objective] : undefined;

  return keys.map((key) => {
    const criterion = byKey.get(key)!;
    return {
      ...criterion,
      weight: criterion.weight + (boosted === key ? 0.6 : 0),
    };
  });
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
  weights: ScoringWeights
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
    let recommendation: VariantRanking['recommendation'] = 'test';
    if (i === 0) recommendation = 'ship';
    else if (i === 1 && gap < 0.5) recommendation = 'borrow';
    else if (i === scored.length - 1) recommendation = 'kill';
    else if (v.overallScore < max * 0.7) recommendation = 'kill';
    else recommendation = 'test';

    let confidence: ConfidenceLevel = 'medium';
    if (gap > 1.2 && i === 0) confidence = 'high';
    else if (gap > 0.8 && i === 0) confidence = 'medium_high';
    else if (gap < 0.3) confidence = 'low';

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
  if (humanAgreement > 0.7) reasons.push('strong human evaluator agreement');
  if (agentAgreement > 0.6) reasons.push('AI agents largely aligned');
  if (sampleSize >= 5) reasons.push(`adequate sample size (${sampleSize} evaluators)`);
  if (variantGap > 0.8) reasons.push('clear score gap between top variants');
  if (humanAgreement < 0.5) reasons.push('human evaluators disagreed on winner');
  if (agentAgreement < 0.4) reasons.push('AI agents showed mixed signals');

  let level: ConfidenceLevel = 'medium';
  if (score > 0.75) level = 'high';
  else if (score > 0.6) level = 'medium_high';
  else if (score < 0.35) level = 'low';

  return {
    level,
    reason: reasons.join('; ') || 'Limited evaluation data available',
  };
}

export function evaluatorTypeWeight(type: EvaluatorType): number {
  switch (type) {
    case 'target_user':
      return 1;
    case 'domain_expert':
      return 0.85;
    case 'buyer':
      return 0.75;
    case 'power_user':
      return 0.8;
    default:
      return 0.6;
  }
}

export function scoreForCriterion(
  scores: Partial<DimensionScores>,
  criterion: keyof DimensionScores
): number {
  const raw = scores[criterion] ?? 3;
  return criterion === 'friction' ? 6 - raw : raw;
}

export function buildPairwiseVerdicts(params: {
  agentSlug: string;
  agentName: string;
  outputs: AgentOutput[];
  criteria: CriterionDefinition[];
}): PairwiseVerdict[] {
  const verdicts: PairwiseVerdict[] = [];
  const outputs = params.outputs;

  for (const criterion of params.criteria) {
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const a = outputs[i]!;
        const b = outputs[j]!;
        const first = orderAwareChoice(params.agentSlug, criterion.key, a, b, 'forward');
        const reverse = orderAwareChoice(params.agentSlug, criterion.key, a, b, 'reverse');
        const orderConsistent = first.preferredVariantId === reverse.preferredVariantId;
        const preferredVariantId = orderConsistent ? first.preferredVariantId : null;
        const confidence = orderConsistent ? Math.max(first.confidence, reverse.confidence) : 0.5;

        verdicts.push({
          agentSlug: params.agentSlug,
          agentName: params.agentName,
          criterion: criterion.key,
          criterionLabel: criterion.label,
          variantAId: a.variantId,
          variantALabel: labelFromOutput(a),
          variantBId: b.variantId,
          variantBLabel: labelFromOutput(b),
          preferredVariantId,
          preferredLabel:
            preferredVariantId === a.variantId
              ? labelFromOutput(a)
              : preferredVariantId === b.variantId
                ? labelFromOutput(b)
                : null,
          firstOrderPreferredVariantId: first.preferredVariantId,
          reverseOrderPreferredVariantId: reverse.preferredVariantId,
          orderConsistent,
          confidence,
          rationale: orderConsistent
            ? `${preferredVariantId === a.variantId ? labelFromOutput(a) : labelFromOutput(b)} led on ${criterion.label.toLowerCase()}.`
            : `Order check disagreed on ${criterion.label.toLowerCase()}, so this pair is treated as low confidence.`,
        });
      }
    }
  }

  return verdicts;
}

function orderAwareChoice(
  agentSlug: string,
  criterion: keyof DimensionScores,
  a: AgentOutput,
  b: AgentOutput,
  direction: 'forward' | 'reverse'
): { preferredVariantId: string | null; confidence: number } {
  const aScore = scoreForCriterion(a.scores, criterion);
  const bScore = scoreForCriterion(b.scores, criterion);
  const seed = hashString(`${agentSlug}:${criterion}:${a.variantId}:${b.variantId}:${direction}`);
  const displayedFirstId = direction === 'forward' ? a.variantId : b.variantId;
  const orderBias = ((seed % 100) / 100 - 0.5) * 0.18;
  const diff = aScore - bScore + (displayedFirstId === a.variantId ? orderBias : -orderBias);

  if (Math.abs(diff) < 0.12) return { preferredVariantId: null, confidence: 0.5 };
  return {
    preferredVariantId: diff > 0 ? a.variantId : b.variantId,
    confidence: Math.min(0.95, 0.55 + Math.abs(diff) / 5),
  };
}

export function summarizeSignalQuality(params: {
  variants: Array<{ id: string; label: string }>;
  agentPanel: Array<{
    agentSlug: string;
    agentName: string;
    outputs: AgentOutput[];
    pairwiseVerdicts?: PairwiseVerdict[];
  }>;
  criteria: CriterionDefinition[];
}): SignalQualitySummary {
  const allVerdicts = params.agentPanel.flatMap((a) => a.pairwiseVerdicts ?? []);
  const criteria = params.criteria.map((criterion) =>
    summarizeCriterionSignal(criterion, params.variants, params.agentPanel, allVerdicts)
  );
  const meanKendallTau = average(criteria.map((c) => c.meanKendallTau));
  const meanMajorityVoteProbability = average(criteria.map((c) => c.majorityVoteProbability));
  const sortedBySignal = [...criteria].sort((a, b) => b.meanKendallTau - a.meanKendallTau);
  const invalidityFlags = params.agentPanel.flatMap((a) =>
    a.outputs.flatMap((o) => o.validityFlags ?? [])
  );

  return {
    criteria,
    meanKendallTau,
    meanMajorityVoteProbability,
    criteriaWithCycles: criteria.filter((c) => c.cycleDetected).map((c) => c.criterionLabel),
    strongestCriteria: sortedBySignal.slice(0, 3).map((c) => c.criterionLabel),
    weakestCriteria: sortedBySignal
      .slice(-3)
      .reverse()
      .map((c) => c.criterionLabel),
    invalidityFlags,
  };
}

function summarizeCriterionSignal(
  criterion: CriterionDefinition,
  variants: Array<{ id: string; label: string }>,
  agentPanel: Array<{ agentSlug: string; outputs: AgentOutput[] }>,
  allVerdicts: PairwiseVerdict[]
): CriterionSignal {
  if (!agentPanel.length) {
    return {
      criterion: criterion.key,
      criterionLabel: criterion.label,
      weight: criterion.weight,
      signalStrength: 'noise',
      meanKendallTau: 0,
      majorityVoteProbability: 0,
      cycleDetected: false,
      consensusVariantId: null,
      consensusVariantLabel: null,
      lowConfidencePairs: 0,
      orderInconsistentPairs: 0,
    };
  }

  const rankings = agentPanel.map((agent) =>
    agent.outputs
      .map((output) => ({
        variantId: output.variantId,
        score: scoreForCriterion(output.scores, criterion.key),
      }))
      .sort((a, b) => b.score - a.score)
      .map((v) => v.variantId)
  );

  const taus: number[] = [];
  for (let i = 0; i < rankings.length; i++) {
    for (let j = i + 1; j < rankings.length; j++) {
      taus.push(kendallTau(rankings[i]!, rankings[j]!));
    }
  }

  const criterionVerdicts = allVerdicts.filter((v) => v.criterion === criterion.key);
  const majorityPrefs = new Map<string, string>();
  let majorityProbabilitySum = 0;
  let majorityPairs = 0;
  let lowConfidencePairs = 0;
  let orderInconsistentPairs = 0;
  const variantScores = new Map(variants.map((v) => [v.id, 0]));

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const a = variants[i]!;
      const b = variants[j]!;
      const verdicts = criterionVerdicts.filter(
        (v) => v.variantAId === a.id && v.variantBId === b.id
      );
      const decisive = verdicts.filter((v) => v.preferredVariantId);
      const aVotes = decisive.filter((v) => v.preferredVariantId === a.id).length;
      const bVotes = decisive.filter((v) => v.preferredVariantId === b.id).length;
      const pairTotal = Math.max(decisive.length, 1);
      const majorityVoteProbability = Math.max(aVotes, bVotes) / pairTotal;
      majorityProbabilitySum += majorityVoteProbability;
      majorityPairs++;
      lowConfidencePairs += verdicts.filter((v) => v.confidence < 0.58).length;
      orderInconsistentPairs += verdicts.filter((v) => !v.orderConsistent).length;

      if (aVotes === bVotes) continue;
      const preferred = aVotes > bVotes ? a.id : b.id;
      majorityPrefs.set(pairKey(a.id, b.id), preferred);
      variantScores.set(preferred, (variantScores.get(preferred) ?? 0) + 1);
    }
  }

  const consensusVariantId =
    [...variantScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const meanKendallTau = average(taus);
  const majorityVoteProbability = majorityPairs ? majorityProbabilitySum / majorityPairs : 0;

  return {
    criterion: criterion.key,
    criterionLabel: criterion.label,
    weight: criterion.weight,
    signalStrength: classifySignal(meanKendallTau, majorityVoteProbability),
    meanKendallTau,
    majorityVoteProbability,
    cycleDetected: hasCondorcetCycle(
      variants.map((v) => v.id),
      majorityPrefs
    ),
    consensusVariantId,
    consensusVariantLabel: variants.find((v) => v.id === consensusVariantId)?.label ?? null,
    lowConfidencePairs,
    orderInconsistentPairs,
  };
}

function kendallTau(aRanking: string[], bRanking: string[]): number {
  const aRank = new Map(aRanking.map((id, i) => [id, i]));
  const bRank = new Map(bRanking.map((id, i) => [id, i]));
  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < aRanking.length; i++) {
    for (let j = i + 1; j < aRanking.length; j++) {
      const left = aRanking[i]!;
      const right = aRanking[j]!;
      const aOrder = (aRank.get(left) ?? 0) - (aRank.get(right) ?? 0);
      const bOrder = (bRank.get(left) ?? 0) - (bRank.get(right) ?? 0);
      if (aOrder * bOrder > 0) concordant++;
      else if (aOrder * bOrder < 0) discordant++;
    }
  }

  const total = concordant + discordant;
  return total ? (concordant - discordant) / total : 0;
}

function hasCondorcetCycle(variantIds: string[], majorityPrefs: Map<string, string>): boolean {
  for (let i = 0; i < variantIds.length; i++) {
    for (let j = 0; j < variantIds.length; j++) {
      for (let k = 0; k < variantIds.length; k++) {
        if (i === j || j === k || i === k) continue;
        const a = variantIds[i]!;
        const b = variantIds[j]!;
        const c = variantIds[k]!;
        if (
          majorityPrefers(majorityPrefs, a, b) &&
          majorityPrefers(majorityPrefs, b, c) &&
          majorityPrefers(majorityPrefs, c, a)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function majorityPrefers(majorityPrefs: Map<string, string>, left: string, right: string): boolean {
  return majorityPrefs.get(pairKey(left, right)) === left;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function classifySignal(meanKendallTau: number, majorityVoteProbability: number): SignalStrength {
  if (meanKendallTau >= 0.55 && majorityVoteProbability >= 0.78) return 'strong';
  if (meanKendallTau >= 0.25 && majorityVoteProbability >= 0.68) return 'moderate';
  if (meanKendallTau >= 0.05 || majorityVoteProbability >= 0.58) return 'weak';
  return 'noise';
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}

function labelFromOutput(output: AgentOutput): string {
  return (
    output.variantLabel ??
    output.findings[0]?.description.match(/^(.*?):/)?.[1]?.replace(/^Variant\s*/i, '') ??
    output.variantId
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
