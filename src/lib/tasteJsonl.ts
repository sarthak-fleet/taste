import type { TasteBaselineVariant } from './tasteBaseline';
import {
  predictTasteRankerProbFromFeatures,
  type TasteLinearRankerModel,
  tasteRankerFeatureVector,
} from './tasteRanker';

export type TasteJsonlPreference = 'a' | 'b' | 'tie' | 'unknown';

export interface TasteJsonlRecord {
  id: string;
  source?: {
    kind?: string;
    notes?: string;
  };
  variants: Array<{
    id: string;
    label?: string;
    artifacts?: TasteBaselineVariant['artifacts'];
    mechanicalSummary: TasteBaselineVariant['mechanicalSummary'];
  }>;
  label: {
    preferredVariantId: TasteJsonlPreference;
  } | null;
}

export interface TasteJsonlEvaluationRow {
  id: string;
  predicted: TasteJsonlPreference;
  actual: TasteJsonlPreference;
}

export interface TasteJsonlEvaluation {
  records: number;
  labeled: number;
  correct: number;
  accuracy: number;
  misses: TasteJsonlEvaluationRow[];
}

export interface TasteJsonlDatasetSummary {
  records: number;
  labeled: number;
  realLabeled: number;
  syntheticLabeled: number;
  unknownSourceLabeled: number;
  sourceCounts: Record<string, number>;
  labelCounts: Record<TasteJsonlPreference, number>;
}

export interface TasteJsonlReadinessGate {
  ok: boolean;
  minRealLabeled: number;
  minTotalLabeled: number;
  reasons: string[];
}

export function tasteJsonlSourceKind(record: TasteJsonlRecord) {
  return record.source?.kind ?? 'unknown';
}

export function isTasteJsonlLabeled(record: TasteJsonlRecord) {
  return Boolean(record.label && record.label.preferredVariantId !== 'unknown');
}

export function isTasteJsonlRealLabel(record: TasteJsonlRecord) {
  return isTasteJsonlLabeled(record) && tasteJsonlSourceKind(record) !== 'synthetic_degradation';
}

export function tasteJsonlToBaselineVariant(
  variant: TasteJsonlRecord['variants'][number],
  index: number
): TasteBaselineVariant {
  return {
    id: variant.id,
    label: variant.label ?? `Variant ${index + 1}`,
    artifacts: variant.artifacts ?? [],
    mechanicalSummary: variant.mechanicalSummary,
  };
}

export function tasteJsonlFeatureVector(record: TasteJsonlRecord): number[] | null {
  const [a, b] = record.variants;
  if (!a || !b) return null;
  return tasteRankerFeatureVector(
    tasteJsonlToBaselineVariant(a, 0),
    tasteJsonlToBaselineVariant(b, 1)
  );
}

export function predictTasteJsonlWithModel(
  record: TasteJsonlRecord,
  model: TasteLinearRankerModel
): TasteJsonlPreference {
  const x = tasteJsonlFeatureVector(record);
  if (!x) return 'unknown';
  const probA = predictTasteRankerProbFromFeatures(model, x);
  if (probA > 0.55) return 'a';
  if (probA < 0.45) return 'b';
  return 'tie';
}

export function predictTasteJsonlMechanically(
  record: TasteJsonlRecord,
  tieMargin: number
): TasteJsonlPreference {
  const [a, b] = record.variants;
  if (!a || !b) return 'unknown';
  const aRisk = a.mechanicalSummary.highestRiskScore;
  const bRisk = b.mechanicalSummary.highestRiskScore;
  if (Math.abs(aRisk - bRisk) <= tieMargin) return 'tie';
  return aRisk < bRisk ? 'a' : 'b';
}

export function evaluateTasteJsonl(
  records: TasteJsonlRecord[],
  predict: (record: TasteJsonlRecord) => TasteJsonlPreference
): TasteJsonlEvaluation {
  const labeled = records.filter(
    (record) => record.label && record.label.preferredVariantId !== 'unknown'
  );
  const scored = labeled.map((record) => ({
    id: record.id,
    predicted: predict(record),
    actual: record.label!.preferredVariantId,
  }));
  const correct = scored.filter((row) => row.predicted === row.actual).length;

  return {
    records: records.length,
    labeled: labeled.length,
    correct,
    accuracy: scored.length ? correct / scored.length : 0,
    misses: scored.filter((row) => row.predicted !== row.actual),
  };
}

export function summarizeTasteJsonlDataset(records: TasteJsonlRecord[]): TasteJsonlDatasetSummary {
  const sourceCounts: Record<string, number> = {};
  const labelCounts = {
    a: 0,
    b: 0,
    tie: 0,
    unknown: 0,
  } satisfies Record<TasteJsonlPreference, number>;
  let labeled = 0;
  let realLabeled = 0;
  let syntheticLabeled = 0;
  let unknownSourceLabeled = 0;

  for (const record of records) {
    const sourceKind = tasteJsonlSourceKind(record);
    sourceCounts[sourceKind] = (sourceCounts[sourceKind] ?? 0) + 1;
    const preference = record.label?.preferredVariantId ?? 'unknown';
    labelCounts[preference] += 1;
    if (!isTasteJsonlLabeled(record)) continue;

    labeled += 1;
    if (sourceKind === 'synthetic_degradation') {
      syntheticLabeled += 1;
    } else if (sourceKind === 'unknown') {
      unknownSourceLabeled += 1;
    } else {
      realLabeled += 1;
    }
  }

  return {
    records: records.length,
    labeled,
    realLabeled,
    syntheticLabeled,
    unknownSourceLabeled,
    sourceCounts,
    labelCounts,
  };
}

export function evaluateTasteJsonlReadiness(
  summary: TasteJsonlDatasetSummary,
  params: { minRealLabeled: number; minTotalLabeled: number }
): TasteJsonlReadinessGate {
  const reasons: string[] = [];
  if (summary.labeled < params.minTotalLabeled) {
    reasons.push(
      `Need at least ${params.minTotalLabeled} total labeled records; found ${summary.labeled}.`
    );
  }
  if (summary.realLabeled < params.minRealLabeled) {
    reasons.push(
      `Need at least ${params.minRealLabeled} real non-synthetic labels; found ${summary.realLabeled}.`
    );
  }
  if (summary.syntheticLabeled > 0 && summary.realLabeled === 0) {
    reasons.push('Dataset has synthetic labels but no real labels.');
  }

  return {
    ok: reasons.length === 0,
    minRealLabeled: params.minRealLabeled,
    minTotalLabeled: params.minTotalLabeled,
    reasons,
  };
}
