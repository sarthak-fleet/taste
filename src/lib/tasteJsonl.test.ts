import { describe, expect, it } from 'vitest';
import {
  evaluateTasteJsonl,
  evaluateTasteJsonlReadiness,
  isTasteJsonlLabeled,
  isTasteJsonlRealLabel,
  predictTasteJsonlMechanically,
  summarizeTasteJsonlDataset,
  type TasteJsonlRecord,
  tasteJsonlSourceKind,
} from './tasteJsonl';

function makeMechanicalSummary(overrides: Partial<Record<string, number>> = {}) {
  const highestRiskScore = overrides.highestRiskScore ?? 0;
  const highestRiskLevel: 'low' | 'medium' | 'high' =
    highestRiskScore >= 45 ? 'high' : highestRiskScore >= 20 ? 'medium' : 'low';
  return {
    highestRiskLevel,
    highestRiskScore: 0,
    totalClippedTextCandidates: 0,
    totalLowContrastCandidates: 0,
    totalFailedImages: 0,
    maxHorizontalOverflow: 0,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<TasteJsonlRecord> = {}): TasteJsonlRecord {
  return {
    id: 'r1',
    variants: [
      { id: 'a', mechanicalSummary: makeMechanicalSummary() },
      { id: 'b', mechanicalSummary: makeMechanicalSummary() },
    ],
    label: null,
    ...overrides,
  };
}

describe('tasteJsonlSourceKind', () => {
  it('returns the source kind when present', () => {
    expect(tasteJsonlSourceKind(makeRecord({ source: { kind: 'real' } }))).toBe('real');
  });

  it('defaults to unknown when source is missing', () => {
    expect(tasteJsonlSourceKind(makeRecord())).toBe('unknown');
  });
});

describe('isTasteJsonlLabeled', () => {
  it('is false when label is null', () => {
    expect(isTasteJsonlLabeled(makeRecord({ label: null }))).toBe(false);
  });

  it('is false when label is unknown', () => {
    expect(isTasteJsonlLabeled(makeRecord({ label: { preferredVariantId: 'unknown' } }))).toBe(
      false
    );
  });

  it('is true when label is a, b, or tie', () => {
    expect(isTasteJsonlLabeled(makeRecord({ label: { preferredVariantId: 'a' } }))).toBe(true);
    expect(isTasteJsonlLabeled(makeRecord({ label: { preferredVariantId: 'b' } }))).toBe(true);
    expect(isTasteJsonlLabeled(makeRecord({ label: { preferredVariantId: 'tie' } }))).toBe(true);
  });
});

describe('isTasteJsonlRealLabel', () => {
  it('is false for synthetic_degradation source', () => {
    expect(
      isTasteJsonlRealLabel(
        makeRecord({
          source: { kind: 'synthetic_degradation' },
          label: { preferredVariantId: 'a' },
        })
      )
    ).toBe(false);
  });

  it('is true for real source with a label', () => {
    expect(
      isTasteJsonlRealLabel(
        makeRecord({ source: { kind: 'real' }, label: { preferredVariantId: 'a' } })
      )
    ).toBe(true);
  });

  it('is false when unlabeled', () => {
    expect(isTasteJsonlRealLabel(makeRecord({ source: { kind: 'real' } }))).toBe(false);
  });
});

describe('predictTasteJsonlMechanically', () => {
  it('returns unknown when a variant is missing', () => {
    expect(
      predictTasteJsonlMechanically(makeRecord({ variants: [makeRecord().variants[0]!] }), 5)
    ).toBe('unknown');
  });

  it('returns tie when risk scores are within the margin', () => {
    const record = makeRecord({
      variants: [
        { id: 'a', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 10 }) },
        { id: 'b', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 12 }) },
      ],
    });
    expect(predictTasteJsonlMechanically(record, 5)).toBe('tie');
  });

  it('prefers the lower-risk variant (a)', () => {
    const record = makeRecord({
      variants: [
        { id: 'a', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 5 }) },
        { id: 'b', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 50 }) },
      ],
    });
    expect(predictTasteJsonlMechanically(record, 5)).toBe('a');
  });

  it('prefers the lower-risk variant (b)', () => {
    const record = makeRecord({
      variants: [
        { id: 'a', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 50 }) },
        { id: 'b', mechanicalSummary: makeMechanicalSummary({ highestRiskScore: 5 }) },
      ],
    });
    expect(predictTasteJsonlMechanically(record, 5)).toBe('b');
  });
});

describe('evaluateTasteJsonl', () => {
  it('counts only labeled records and computes accuracy', () => {
    const records: TasteJsonlRecord[] = [
      makeRecord({ id: 'r1', label: { preferredVariantId: 'a' } }),
      makeRecord({ id: 'r2', label: { preferredVariantId: 'b' } }),
      makeRecord({ id: 'r3', label: { preferredVariantId: 'unknown' } }),
      makeRecord({ id: 'r4', label: null }),
    ];
    const result = evaluateTasteJsonl(records, () => 'a');
    expect(result.records).toBe(4);
    expect(result.labeled).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.accuracy).toBeCloseTo(0.5);
    expect(result.misses).toHaveLength(1);
    expect(result.misses[0]?.id).toBe('r2');
  });

  it('returns accuracy 0 with no labeled records', () => {
    const records: TasteJsonlRecord[] = [makeRecord({ label: null })];
    const result = evaluateTasteJsonl(records, () => 'a');
    expect(result.labeled).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.misses).toHaveLength(0);
  });
});

describe('summarizeTasteJsonlDataset', () => {
  it('counts sources, labels, and real vs synthetic', () => {
    const records: TasteJsonlRecord[] = [
      makeRecord({ id: 'r1', source: { kind: 'real' }, label: { preferredVariantId: 'a' } }),
      makeRecord({
        id: 'r2',
        source: { kind: 'synthetic_degradation' },
        label: { preferredVariantId: 'b' },
      }),
      makeRecord({ id: 'r3', label: { preferredVariantId: 'tie' } }),
      makeRecord({ id: 'r4', label: null }),
    ];
    const summary = summarizeTasteJsonlDataset(records);
    expect(summary.records).toBe(4);
    expect(summary.labeled).toBe(3);
    expect(summary.realLabeled).toBe(1);
    expect(summary.syntheticLabeled).toBe(1);
    expect(summary.unknownSourceLabeled).toBe(1);
    expect(summary.sourceCounts.real).toBe(1);
    expect(summary.sourceCounts.synthetic_degradation).toBe(1);
    expect(summary.labelCounts.a).toBe(1);
    expect(summary.labelCounts.b).toBe(1);
    expect(summary.labelCounts.tie).toBe(1);
    expect(summary.labelCounts.unknown).toBe(1);
  });
});

describe('evaluateTasteJsonlReadiness', () => {
  it('is ok when minimums are met', () => {
    const summary = summarizeTasteJsonlDataset([
      makeRecord({ source: { kind: 'real' }, label: { preferredVariantId: 'a' } }),
    ]);
    const gate = evaluateTasteJsonlReadiness(summary, { minRealLabeled: 1, minTotalLabeled: 1 });
    expect(gate.ok).toBe(true);
    expect(gate.reasons).toHaveLength(0);
  });

  it('reports a reason when total labeled is below the minimum', () => {
    const summary = summarizeTasteJsonlDataset([makeRecord({ label: null })]);
    const gate = evaluateTasteJsonlReadiness(summary, { minRealLabeled: 1, minTotalLabeled: 5 });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('total labeled'))).toBe(true);
  });

  it('reports a reason when real labeled is below the minimum', () => {
    const summary = summarizeTasteJsonlDataset([
      makeRecord({ source: { kind: 'synthetic_degradation' }, label: { preferredVariantId: 'a' } }),
    ]);
    const gate = evaluateTasteJsonlReadiness(summary, { minRealLabeled: 5, minTotalLabeled: 1 });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('real non-synthetic'))).toBe(true);
  });

  it('flags synthetic-only datasets with no real labels', () => {
    const summary = summarizeTasteJsonlDataset([
      makeRecord({ source: { kind: 'synthetic_degradation' }, label: { preferredVariantId: 'a' } }),
    ]);
    const gate = evaluateTasteJsonlReadiness(summary, { minRealLabeled: 0, minTotalLabeled: 1 });
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('synthetic labels but no real'))).toBe(true);
  });
});
