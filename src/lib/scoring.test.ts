import { describe, expect, it } from 'vitest';
import {
  averageDimensionScores,
  computeConfidenceLevel,
  computeVariantRankings,
  criteriaForStudy,
  dimensionToOverallScore,
  evaluatorTypeWeight,
  getWeightsForStudyType,
  type ScoringWeights,
  scoreForCriterion,
} from './scoring';

describe('getWeightsForStudyType', () => {
  it('returns agent-first weights when no human validation', () => {
    const weights = getWeightsForStudyType('landing_page', false);
    expect(weights.agent).toBeGreaterThan(weights.targetUser);
    expect(weights.agent).toBe(0.55);
  });

  it('returns onboarding weights for signup_flow with human validation', () => {
    const weights = getWeightsForStudyType('signup_flow', true);
    expect(weights.taskCompletion).toBe(0.3);
  });

  it('returns landing weights for landing_page with human validation', () => {
    const weights = getWeightsForStudyType('landing_page', true);
    expect(weights.prediction).toBe(0.2);
  });

  it('returns default weights for unknown study type with human validation', () => {
    const weights = getWeightsForStudyType('unknown_type', true);
    expect(weights.targetUser).toBe(0.35);
  });

  it('weights sum to 1 for all presets', () => {
    const sum = (w: ScoringWeights) =>
      w.targetUser + w.expert + w.agent + w.taskCompletion + w.prediction;
    expect(sum(getWeightsForStudyType('landing_page', false))).toBeCloseTo(1);
    expect(sum(getWeightsForStudyType('onboarding', true))).toBeCloseTo(1);
    expect(sum(getWeightsForStudyType('landing_page', true))).toBeCloseTo(1);
    expect(sum(getWeightsForStudyType('pricing_page', true))).toBeCloseTo(1);
  });
});

describe('criteriaForStudy', () => {
  it('returns friction-focused criteria for onboarding', () => {
    const criteria = criteriaForStudy('onboarding');
    const keys = criteria.map((c) => c.key);
    expect(keys).toContain('firstActionClarity');
    expect(keys).toContain('friction');
    expect(keys).toContain('completionConfidence');
  });

  it('returns pricing-focused criteria for pricing_page', () => {
    const criteria = criteriaForStudy('pricing_page');
    const keys = criteria.map((c) => c.key);
    expect(keys).toContain('perceivedValue');
    expect(keys).toContain('conversionIntent');
  });

  it('boosts the objective-relevant criterion weight', () => {
    const criteria = criteriaForStudy('onboarding', 'reduce_friction');
    const friction = criteria.find((c) => c.key === 'friction');
    const clarity = criteria.find((c) => c.key === 'clarity');
    expect(friction!.weight).toBeGreaterThan(clarity!.weight);
    expect(friction!.weight).toBe(1.6);
  });

  it('does not boost when objective does not map to a criterion in the set', () => {
    const criteria = criteriaForStudy('pricing_page', 'reduce_friction');
    const friction = criteria.find((c) => c.key === 'friction');
    expect(friction).toBeDefined();
    expect(friction!.weight).toBe(1.6);
  });
});

describe('averageDimensionScores', () => {
  it('averages provided scores across inputs', () => {
    const avg = averageDimensionScores([
      { clarity: 4, trust: 3 },
      { clarity: 2, trust: 5 },
    ]);
    expect(avg.clarity).toBe(3);
    expect(avg.trust).toBe(4);
  });

  it('defaults missing dimensions to 3', () => {
    const avg = averageDimensionScores([{ clarity: 5 }]);
    expect(avg.clarity).toBe(5);
    expect(avg.trust).toBe(3);
    expect(avg.friction).toBe(3);
  });

  it('defaults to 3 for empty input', () => {
    const avg = averageDimensionScores([]);
    expect(avg.clarity).toBe(3);
    expect(avg.trust).toBe(3);
  });
});

describe('dimensionToOverallScore', () => {
  it('inverts friction so lower friction raises the overall score', () => {
    const highFriction = dimensionToOverallScore({
      clarity: 4,
      relevance: 4,
      trust: 4,
      firstActionClarity: 4,
      perceivedValue: 4,
      friction: 5,
      differentiation: 4,
      completionConfidence: 4,
      conversionIntent: 4,
    });
    const lowFriction = dimensionToOverallScore({
      clarity: 4,
      relevance: 4,
      trust: 4,
      firstActionClarity: 4,
      perceivedValue: 4,
      friction: 1,
      differentiation: 4,
      completionConfidence: 4,
      conversionIntent: 4,
    });
    expect(lowFriction).toBeGreaterThan(highFriction);
  });

  it('returns the average of all nine dimensions (with friction inverted)', () => {
    const scores = {
      clarity: 5,
      relevance: 5,
      trust: 5,
      firstActionClarity: 5,
      perceivedValue: 5,
      friction: 1,
      differentiation: 5,
      completionConfidence: 5,
      conversionIntent: 5,
    };
    // friction inverted = 6 - 1 = 5, so all nine values are 5
    expect(dimensionToOverallScore(scores)).toBeCloseTo(5);
  });
});

describe('computeVariantRankings', () => {
  const weights: ScoringWeights = {
    targetUser: 0.35,
    expert: 0.2,
    agent: 0.2,
    taskCompletion: 0.15,
    prediction: 0.1,
  };

  it('ranks variants by overall score descending', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 3,
          expertScore: 3,
          agentScore: 3,
          taskCompletionRate: 3,
          predictionScore: 3,
        },
        {
          variantId: 'b',
          variantLabel: 'B',
          variantName: 'Beta',
          targetUserScore: 5,
          expertScore: 5,
          agentScore: 5,
          taskCompletionRate: 5,
          predictionScore: 5,
        },
      ],
      weights
    );
    expect(rankings[0]!.variantId).toBe('b');
    expect(rankings[0]!.rank).toBe(1);
    expect(rankings[1]!.variantId).toBe('a');
    expect(rankings[1]!.rank).toBe(2);
  });

  it('recommends ship for the top variant', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 5,
          expertScore: 5,
          agentScore: 5,
          taskCompletionRate: 5,
          predictionScore: 5,
        },
        {
          variantId: 'b',
          variantLabel: 'B',
          variantName: 'Beta',
          targetUserScore: 1,
          expertScore: 1,
          agentScore: 1,
          taskCompletionRate: 1,
          predictionScore: 1,
        },
      ],
      weights
    );
    expect(rankings[0]!.recommendation).toBe('ship');
  });

  it('recommends kill for the last variant when the gap is large', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 5,
          expertScore: 5,
          agentScore: 5,
          taskCompletionRate: 5,
          predictionScore: 5,
        },
        {
          variantId: 'b',
          variantLabel: 'B',
          variantName: 'Beta',
          targetUserScore: 1,
          expertScore: 1,
          agentScore: 1,
          taskCompletionRate: 1,
          predictionScore: 1,
        },
      ],
      weights
    );
    expect(rankings[1]!.recommendation).toBe('kill');
  });

  it('recommends borrow for the second variant when the gap is small', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 4,
          expertScore: 4,
          agentScore: 4,
          taskCompletionRate: 4,
          predictionScore: 4,
        },
        {
          variantId: 'b',
          variantLabel: 'B',
          variantName: 'Beta',
          targetUserScore: 3.8,
          expertScore: 3.8,
          agentScore: 3.8,
          taskCompletionRate: 3.8,
          predictionScore: 3.8,
        },
      ],
      weights
    );
    expect(rankings[1]!.recommendation).toBe('borrow');
  });

  it('assigns high confidence when the gap is large', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 5,
          expertScore: 5,
          agentScore: 5,
          taskCompletionRate: 5,
          predictionScore: 5,
        },
        {
          variantId: 'b',
          variantLabel: 'B',
          variantName: 'Beta',
          targetUserScore: 1,
          expertScore: 1,
          agentScore: 1,
          taskCompletionRate: 1,
          predictionScore: 1,
        },
      ],
      weights
    );
    expect(rankings[0]!.confidence).toBe('high');
  });

  it('handles a single variant', () => {
    const rankings = computeVariantRankings(
      [
        {
          variantId: 'a',
          variantLabel: 'A',
          variantName: 'Alpha',
          targetUserScore: 4,
          expertScore: 4,
          agentScore: 4,
          taskCompletionRate: 4,
          predictionScore: 4,
        },
      ],
      weights
    );
    expect(rankings).toHaveLength(1);
    expect(rankings[0]!.recommendation).toBe('ship');
  });
});

describe('computeConfidenceLevel', () => {
  it('returns high when all signals are strong', () => {
    const result = computeConfidenceLevel({
      humanAgreement: 0.9,
      agentAgreement: 0.8,
      sampleSize: 10,
      variantGap: 1.5,
      evaluatorQuality: 0.9,
    });
    expect(result.level).toBe('high');
    expect(result.reason).toContain('human evaluator agreement');
  });

  it('returns low when all signals are weak', () => {
    const result = computeConfidenceLevel({
      humanAgreement: 0.2,
      agentAgreement: 0.2,
      sampleSize: 1,
      variantGap: 0.1,
      evaluatorQuality: 0.2,
    });
    expect(result.level).toBe('low');
  });

  it('includes disagreement reasons when agreement is low', () => {
    const result = computeConfidenceLevel({
      humanAgreement: 0.3,
      agentAgreement: 0.3,
      sampleSize: 5,
      variantGap: 1,
      evaluatorQuality: 0.5,
    });
    expect(result.reason).toContain('disagreed');
  });
});

describe('evaluatorTypeWeight', () => {
  it('weights target_user highest', () => {
    expect(evaluatorTypeWeight('target_user')).toBe(1);
  });

  it('weights general lowest', () => {
    expect(evaluatorTypeWeight('general')).toBe(0.6);
  });

  it('weights domain_expert above buyer', () => {
    expect(evaluatorTypeWeight('domain_expert')).toBeGreaterThan(evaluatorTypeWeight('buyer'));
  });
});

describe('scoreForCriterion', () => {
  it('inverts friction scores', () => {
    expect(scoreForCriterion({ friction: 5 }, 'friction')).toBe(1);
    expect(scoreForCriterion({ friction: 1 }, 'friction')).toBe(5);
  });

  it('returns raw value for non-friction criteria', () => {
    expect(scoreForCriterion({ clarity: 4 }, 'clarity')).toBe(4);
  });

  it('defaults to 3 when the dimension is missing', () => {
    expect(scoreForCriterion({}, 'clarity')).toBe(3);
    expect(scoreForCriterion({}, 'friction')).toBe(3);
  });
});
