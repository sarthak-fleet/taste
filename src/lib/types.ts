export type StudyStatus =
  | 'draft'
  | 'pending_review'
  | 'evaluating'
  | 'generating_report'
  | 'completed'
  | 'cancelled';

export type StudyType =
  | 'landing_page'
  | 'onboarding'
  | 'signup_flow'
  | 'pricing_page'
  | 'copy_messaging'
  | 'ux_flow';

export type PrivacyLevel = 'private' | 'private_benchmark' | 'arena' | 'public';

export type TurnaroundLevel = 'agent_only' | 'human_lite' | 'full_report';

export type EvaluatorType = 'target_user' | 'domain_expert' | 'buyer' | 'power_user' | 'general';

export type ConfidenceLevel = 'low' | 'medium' | 'medium_high' | 'high';

export interface DimensionScores {
  clarity: number;
  relevance: number;
  trust: number;
  firstActionClarity: number;
  perceivedValue: number;
  friction: number;
  differentiation: number;
  completionConfidence: number;
  conversionIntent: number;
}

export type SignalStrength = 'noise' | 'weak' | 'moderate' | 'strong';
export type ValidityFlagLevel = 'none' | 'minor' | 'major';

export interface CriterionDefinition {
  key: keyof DimensionScores;
  label: string;
  weight: number;
  kind: 'preference' | 'fidelity' | 'friction' | 'trust';
}

export interface AgentFinding {
  severity: 'low' | 'medium' | 'high';
  type: string;
  description: string;
}

export interface AgentValidityFlag {
  level: ValidityFlagLevel;
  type:
    | 'missing_asset'
    | 'irrelevant_rationale'
    | 'fabricated_evidence'
    | 'cannot_judge'
    | 'quality_warning';
  description: string;
}

export interface AgentOutput {
  variantId: string;
  variantLabel: string;
  variantName: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  scores: Partial<DimensionScores>;
  prediction: {
    predictedRank: number;
    predictedMetric: string;
    confidence: number;
  };
  findings: AgentFinding[];
  validityFlags: AgentValidityFlag[];
  recommendation: string;
}

export interface PairwiseVerdict {
  agentSlug: string;
  agentName: string;
  criterion: keyof DimensionScores;
  criterionLabel: string;
  variantAId: string;
  variantALabel: string;
  variantBId: string;
  variantBLabel: string;
  preferredVariantId: string | null;
  preferredLabel: string | null;
  firstOrderPreferredVariantId: string | null;
  reverseOrderPreferredVariantId: string | null;
  orderConsistent: boolean;
  confidence: number;
  rationale: string;
}

export interface CriterionSignal {
  criterion: keyof DimensionScores;
  criterionLabel: string;
  weight: number;
  signalStrength: SignalStrength;
  meanKendallTau: number;
  majorityVoteProbability: number;
  cycleDetected: boolean;
  consensusVariantId: string | null;
  consensusVariantLabel: string | null;
  lowConfidencePairs: number;
  orderInconsistentPairs: number;
}

export interface SignalQualitySummary {
  criteria: CriterionSignal[];
  meanKendallTau: number;
  meanMajorityVoteProbability: number;
  criteriaWithCycles: string[];
  strongestCriteria: string[];
  weakestCriteria: string[];
  invalidityFlags: AgentValidityFlag[];
}

export interface AgentCalibrationSummary {
  status: 'uncalibrated' | 'outcome_matched' | 'outcome_missed';
  outcomeSamples: number;
  historicalAccuracy?: number;
  predictedVariantLabel?: string;
  outcomeVariantLabel?: string;
  note: string;
}

export interface VariantRanking {
  variantId: string;
  variantLabel: string;
  variantName: string;
  rank: number;
  overallScore: number;
  recommendation: 'ship' | 'borrow' | 'test' | 'kill';
  confidence: ConfidenceLevel;
  scores: {
    targetUser: number;
    expert: number;
    agent: number;
    taskCompletion: number;
    prediction: number;
  };
}

export interface ReportContent {
  executiveRecommendation: {
    variantId: string;
    variantLabel: string;
    action: string;
    reason: string;
    modification: string;
    doNotShip: string[];
    confidence: ConfidenceLevel;
    confidenceReason: string;
  };
  rankings: VariantRanking[];
  whyWinnerWon: string[];
  winnerWeaknesses: string[];
  borrowFrom: Array<{ variantLabel: string; elements: string[] }>;
  humanEvidence: Array<{ role: string; quote: string }>;
  agentFindings: {
    consensus: string[];
    disagreement: string[];
  };
  signalQuality: SignalQualitySummary;
  pairwiseVerdicts: PairwiseVerdict[];
  calibration: AgentCalibrationSummary;
  predictionSummary: {
    predictedWinner: string;
    predictedImpact: string;
    expectedTradeoff: string;
  };
  nextTest: {
    description: string;
    modification: string;
    primaryMetric: string;
    secondaryMetrics: string[];
  };
  decisionMemory: {
    decision: string;
    assumption: string;
    expectedOutcome: string;
    reviewDate: string;
  };
}

export const STUDY_TYPES: { value: StudyType; label: string }[] = [
  { value: 'landing_page', label: 'Landing page comparison' },
  { value: 'onboarding', label: 'Onboarding flow comparison' },
  { value: 'signup_flow', label: 'Signup flow comparison' },
  { value: 'pricing_page', label: 'Pricing page comparison' },
  { value: 'copy_messaging', label: 'Copy / messaging comparison' },
  { value: 'ux_flow', label: 'UX flow comparison' },
];

export const OBJECTIVES = [
  { value: 'maximize_signup', label: 'Maximize signup conversion' },
  { value: 'increase_activation', label: 'Increase activation' },
  { value: 'reduce_confusion', label: 'Reduce confusion' },
  { value: 'increase_trust', label: 'Increase trust' },
  { value: 'improve_value', label: 'Improve perceived value' },
  { value: 'task_completion', label: 'Increase task completion' },
  { value: 'reduce_friction', label: 'Reduce friction' },
];

export const METRICS = [
  { value: 'task_completion', label: 'Task completion' },
  { value: 'comprehension', label: 'Comprehension' },
  { value: 'conversion_intent', label: 'Conversion intent' },
  { value: 'trust_score', label: 'Trust score' },
  { value: 'setup_confidence', label: 'Setup confidence' },
  { value: 'willingness_to_continue', label: 'Willingness to continue' },
];

export const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  clarity: 'Clarity',
  relevance: 'Relevance',
  trust: 'Trust',
  firstActionClarity: 'First-action clarity',
  perceivedValue: 'Perceived value',
  friction: 'Friction (lower is better)',
  differentiation: 'Differentiation',
  completionConfidence: 'Completion confidence',
  conversionIntent: 'Conversion intent',
};
