import { computeConfidenceLevel } from './scoring';
import type {
  AgentCalibrationSummary,
  AgentOutput,
  ConfidenceLevel,
  PairwiseVerdict,
  ReportContent,
  SignalQualitySummary,
  VariantRanking,
} from './types';

interface ReportInput {
  study: {
    id: string;
    name: string;
    studyType: string;
    productName: string;
    targetUserRole: string;
    primaryObjective: string;
    primaryMetric: string;
    contextConcerns?: string;
  };
  variants: Array<{ id: string; label: string; name: string; description?: string }>;
  rankings: VariantRanking[];
  agentOutputs: AgentOutput[];
  humanQuotes: Array<{ role: string; quote: string; variantLabel?: string }>;
  humanAgreement: number;
  agentAgreement: number;
  signalQuality: SignalQualitySummary;
  pairwiseVerdicts: PairwiseVerdict[];
  sampleSize: number;
  evaluatorQuality: number;
  validationMode?: 'agent_first' | 'agent_plus_human';
  outcome?: {
    winningVariantId?: string | null;
  } | null;
  calibrationHistory?: {
    outcomeSamples: number;
    historicalAccuracy?: number;
  };
}

export function generateReport(input: ReportInput): ReportContent {
  const winner = input.rankings[0];
  const runnerUp = input.rankings[1];
  const losers = input.rankings.filter((r) => r.recommendation === 'kill');

  const variantGap =
    input.rankings.length > 1
      ? (input.rankings[0]?.overallScore ?? 0) - (input.rankings[1]?.overallScore ?? 0)
      : 0;

  const agentFirst = input.validationMode !== 'agent_plus_human';

  let { level: confidence, reason: confidenceReason } = computeConfidenceLevel({
    humanAgreement: input.humanAgreement,
    agentAgreement: input.agentAgreement,
    sampleSize: input.sampleSize,
    variantGap,
    evaluatorQuality: input.evaluatorQuality,
  });

  if (agentFirst) {
    confidenceReason =
      `${confidenceReason}; agent-first evaluation — human validation not yet run`.replace(
        /^; /,
        ''
      );
    if (confidence === 'high') confidence = 'medium_high';
  }
  if (
    input.signalQuality.meanMajorityVoteProbability < 0.58 ||
    input.signalQuality.criteriaWithCycles.length > 0
  ) {
    confidence = downgradeConfidence(confidence);
    const caveat =
      input.signalQuality.criteriaWithCycles.length > 0
        ? `preference cycle detected in ${input.signalQuality.criteriaWithCycles.join(', ')}`
        : 'weak pairwise majority signal';
    confidenceReason = `${confidenceReason}; ${caveat}`.replace(/^; /, '');
  }

  const whyWinnerWon = buildWhyWinnerWon(winner, runnerUp, input);
  const winnerWeaknesses = buildWinnerWeaknesses(winner, runnerUp, input);
  const borrowFrom = buildBorrowFrom(input.rankings);
  const agentFindings = buildAgentFindings(input.agentOutputs, input.variants);
  const calibration = buildCalibration(winner, input);

  const doNotShip = losers.map((l) => `Variant ${l.variantLabel}`);

  return {
    executiveRecommendation: {
      variantId: winner.variantId,
      variantLabel: winner.variantLabel,
      action: `Ship Variant ${winner.variantLabel}`,
      reason:
        whyWinnerWon[0] ?? `Highest overall score (${winner.overallScore}) across evaluators.`,
      modification: runnerUp
        ? `Borrow key elements from Variant ${runnerUp.variantLabel}, especially trust and proof sections.`
        : 'No modifications suggested from runner-up.',
      doNotShip,
      confidence,
      confidenceReason,
    },
    rankings: input.rankings,
    whyWinnerWon,
    winnerWeaknesses,
    borrowFrom,
    humanEvidence: agentFirst
      ? [
          {
            role: 'ShipRank (agent-first)',
            quote:
              'Recommendation based on specialized AI agent panel. Add human validation when you have matched evaluators — not required to ship a decision.',
          },
        ]
      : input.humanQuotes,
    agentFindings,
    signalQuality: input.signalQuality,
    pairwiseVerdicts: input.pairwiseVerdicts.slice(0, 60),
    calibration,
    predictionSummary: {
      predictedWinner: `Variant ${winner.variantLabel}`,
      predictedImpact: mapObjectiveToImpact(input.study.primaryObjective),
      expectedTradeoff: buildTradeoff(winner, runnerUp),
    },
    nextTest: {
      description: `A/B test Variant ${winner.variantLabel} (with modifications) vs current baseline.`,
      modification: runnerUp
        ? `Use ${winner.variantLabel}'s core flow with ${runnerUp.variantLabel}'s trust/proof elements.`
        : `Ship Variant ${winner.variantLabel} as-is.`,
      primaryMetric: input.study.primaryMetric || 'task_completion',
      secondaryMetrics: ['signup-to-activation rate', 'time to first success', 'demo-request rate'],
    },
    decisionMemory: {
      decision: `Ship Variant ${winner.variantLabel} — ${input.variants.find((v) => v.id === winner.variantId)?.name ?? ''}`,
      assumption:
        input.study.contextConcerns ||
        `Variant ${winner.variantLabel} best matches ${input.study.targetUserRole} needs.`,
      expectedOutcome: mapObjectiveToImpact(input.study.primaryObjective),
      reviewDate: '14 days after launch',
    },
  };
}

function buildWhyWinnerWon(
  winner: VariantRanking,
  runnerUp: VariantRanking | undefined,
  input: ReportInput
): string[] {
  const reasons: string[] = [];

  if (winner.scores.targetUser >= 4) {
    reasons.push(
      `Target users (${input.study.targetUserRole}) ranked Variant ${winner.variantLabel} highest for clarity and intent.`
    );
  }
  if (winner.scores.taskCompletion >= 3.5) {
    reasons.push(`Highest task completion rate among evaluated variants.`);
  }
  if (winner.scores.agent >= 4) {
    reasons.push(
      `AI agent panel consistently flagged ${winner.variantLabel} for strong first-action clarity.`
    );
  }
  if (input.humanQuotes.length === 0 && winner.scores.agent >= 3.5) {
    reasons.push(
      `Agent-first ranking: ${winner.variantLabel} led across specialized evaluator agents.`
    );
  }
  if (winner.scores.prediction >= 4) {
    reasons.push(
      `Majority of evaluators predicted Variant ${winner.variantLabel} would outperform in live testing.`
    );
  }
  for (const criterion of input.signalQuality.strongestCriteria.slice(0, 2)) {
    const signal = input.signalQuality.criteria.find((c) => c.criterionLabel === criterion);
    if (signal?.consensusVariantId === winner.variantId) {
      reasons.push(
        `Strongest criterion signal: ${criterion} favored Variant ${winner.variantLabel}.`
      );
    }
  }
  if (reasons.length === 0) {
    reasons.push(
      `Variant ${winner.variantLabel} achieved the highest composite score (${winner.overallScore}).`
    );
  }
  if (runnerUp && winner.overallScore - runnerUp.overallScore < 0.5) {
    reasons.push(`Note: Variant ${runnerUp.variantLabel} was close — consider a hybrid approach.`);
  }
  return reasons;
}

function buildWinnerWeaknesses(
  winner: VariantRanking,
  runnerUp: VariantRanking | undefined,
  input: ReportInput
): string[] {
  const weaknesses: string[] = [];
  if (
    winner.scores.targetUser < 4 &&
    runnerUp &&
    runnerUp.scores.targetUser > winner.scores.targetUser
  ) {
    weaknesses.push(`Weaker target-user preference than Variant ${runnerUp.variantLabel}.`);
  }
  if (winner.scores.agent < 3.5) {
    weaknesses.push('AI agents flagged trust or clarity gaps that should be addressed.');
  }

  const trustFindings = input.agentOutputs
    .filter((a) => a.variantId === winner.variantId)
    .flatMap((a) => a.findings)
    .filter((f) => f.type === 'trust' && f.severity !== 'low');

  if (trustFindings.length) weaknesses.push(trustFindings[0]!.description);
  const weakWinnerCriteria = input.signalQuality.criteria
    .filter((c) => c.consensusVariantId && c.consensusVariantId !== winner.variantId)
    .slice(0, 2);
  for (const criterion of weakWinnerCriteria) {
    weaknesses.push(
      `${criterion.criterionLabel} leaned toward Variant ${criterion.consensusVariantLabel}; borrow or retest that element.`
    );
  }

  const majorFlags = input.signalQuality.invalidityFlags.filter((f) => f.level === 'major');
  if (majorFlags.length) weaknesses.push(`Major judgment warning: ${majorFlags[0]!.description}`);

  if (weaknesses.length === 0) {
    weaknesses.push(
      'No critical weaknesses identified, but live A/B testing is still recommended.'
    );
  }
  return weaknesses;
}

function buildBorrowFrom(rankings: VariantRanking[]): ReportContent['borrowFrom'] {
  const nonWinners = rankings.slice(1).filter((r) => r.recommendation !== 'kill');
  return nonWinners.slice(0, 2).map((r) => {
    const elements: string[] = [];
    if (r.scores.targetUser >= 4) elements.push('target-user preferred messaging');
    if (r.scores.agent >= 4) elements.push('strong trust/proof signals');
    if (r.scores.taskCompletion >= 4) elements.push('low-friction task flow');
    if (elements.length === 0) elements.push('visual polish', 'supporting copy elements');
    return { variantLabel: r.variantLabel, elements };
  });
}

function buildAgentFindings(
  outputs: AgentOutput[],
  variants: Array<{ id: string; label: string }>
): ReportContent['agentFindings'] {
  const byVariant = new Map<string, AgentOutput[]>();
  for (const o of outputs) {
    const list = byVariant.get(o.variantId) ?? [];
    list.push(o);
    byVariant.set(o.variantId, list);
  }

  const consensus: string[] = [];
  const disagreement: string[] = [];

  for (const v of variants) {
    const runs = byVariant.get(v.id) ?? [];
    const avgRank =
      runs.length > 0 ? runs.reduce((s, r) => s + r.prediction.predictedRank, 0) / runs.length : 99;
    if (avgRank <= 2) {
      const topFinding = runs.flatMap((r) => r.findings).find((f) => f.severity !== 'high');
      consensus.push(`Variant ${v.label} is strong for ${topFinding?.type ?? 'overall quality'}.`);
    }
  }

  const agentWinners = new Map<string, string>();
  for (const o of outputs) {
    if (o.prediction.predictedRank === 1) {
      agentWinners.set(o.agentSlug, o.variantId);
    }
  }
  const winnerIds = [...new Set(agentWinners.values())];
  if (winnerIds.length > 1) {
    disagreement.push(
      'Different AI agents preferred different variants — pairwise signal should drive confidence more than a raw vote.'
    );
  }
  const inconsistentPairs = outputs
    .flatMap((o) => o.validityFlags ?? [])
    .filter((f) => f.level !== 'none');
  if (inconsistentPairs.length) {
    disagreement.push(
      `${inconsistentPairs.length} agent validity warnings need review before treating this as outcome-grade.`
    );
  }

  if (consensus.length === 0) {
    consensus.push(
      'AI agents did not reach strong consensus — rely on pairwise criteria and human validation.'
    );
  }

  return { consensus: consensus.slice(0, 4), disagreement: disagreement.slice(0, 2) };
}

function mapObjectiveToImpact(objective: string): string {
  const map: Record<string, string> = {
    maximize_signup: 'Higher signup conversion among target users',
    increase_activation: 'Improved activation and setup completion',
    reduce_confusion: 'Reduced user confusion and faster comprehension',
    increase_trust: 'Stronger trust signals and willingness to proceed',
    improve_value: 'Higher perceived value and conversion intent',
    task_completion: 'Higher task completion rate',
    reduce_friction: 'Lower friction in core user flow',
  };
  return map[objective] ?? 'Improved performance on primary metric';
}

function buildTradeoff(winner: VariantRanking, runnerUp: VariantRanking | undefined): string {
  if (!runnerUp) return 'Insufficient runner-up data for tradeoff analysis.';
  if (
    winner.scores.targetUser > runnerUp.scores.targetUser &&
    runnerUp.scores.agent > winner.scores.agent
  ) {
    return `May improve self-serve activation but could reduce enterprise buyer confidence unless trust proof is added from Variant ${runnerUp.variantLabel}.`;
  }
  return `Variant ${winner.variantLabel} optimizes for the stated objective; monitor secondary metrics after launch.`;
}

function buildCalibration(winner: VariantRanking, input: ReportInput): AgentCalibrationSummary {
  const outcomeVariantId = input.outcome?.winningVariantId;
  if (!outcomeVariantId) {
    if ((input.calibrationHistory?.outcomeSamples ?? 0) > 0) {
      const accuracy = input.calibrationHistory?.historicalAccuracy ?? 0;
      return {
        status: 'uncalibrated',
        outcomeSamples: input.calibrationHistory?.outcomeSamples ?? 0,
        historicalAccuracy: accuracy,
        predictedVariantLabel: winner.variantLabel,
        note: `No outcome is submitted for this study yet. Agent weights used ${input.calibrationHistory?.outcomeSamples} prior outcome-labeled predictions with ${Math.round(accuracy * 100)}% historical accuracy.`,
      };
    }
    return {
      status: 'uncalibrated',
      outcomeSamples: 0,
      predictedVariantLabel: winner.variantLabel,
      note: 'No submitted outcome yet. Treat agent confidence as pre-A/B guidance until the outcome loop records whether the shipped variant actually won.',
    };
  }

  const outcomeLabel = input.variants.find((v) => v.id === outcomeVariantId)?.label;
  const matched = outcomeVariantId === winner.variantId;
  return {
    status: matched ? 'outcome_matched' : 'outcome_missed',
    outcomeSamples: Math.max(1, input.calibrationHistory?.outcomeSamples ?? 0),
    historicalAccuracy: input.calibrationHistory?.historicalAccuracy,
    predictedVariantLabel: winner.variantLabel,
    outcomeVariantLabel: outcomeLabel,
    note: matched
      ? `Submitted outcome matched the agent recommendation for Variant ${winner.variantLabel}.`
      : `Submitted outcome favored Variant ${outcomeLabel ?? outcomeVariantId}, so future agent weighting should discount this panel shape.`,
  };
}

function downgradeConfidence(level: ConfidenceLevel): ConfidenceLevel {
  if (level === 'high') return 'medium_high';
  if (level === 'medium_high') return 'medium';
  if (level === 'medium') return 'low';
  return 'low';
}

export function confidenceLabel(level: ConfidenceLevel): string {
  const labels: Record<ConfidenceLevel, string> = {
    low: 'Low',
    medium: 'Medium',
    medium_high: 'Medium-high',
    high: 'High',
  };
  return labels[level];
}
