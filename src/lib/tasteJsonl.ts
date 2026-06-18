import type { TasteBaselineVariant } from "./tasteBaseline";
import {
  predictTasteRankerProbFromFeatures,
  tasteRankerFeatureVector,
  type TasteLinearRankerModel,
} from "./tasteRanker";

export type TasteJsonlPreference = "a" | "b" | "tie" | "unknown";

export interface TasteJsonlRecord {
  id: string;
  source?: {
    kind?: string;
    notes?: string;
  };
  variants: Array<{
    id: string;
    label?: string;
    artifacts?: TasteBaselineVariant["artifacts"];
    mechanicalSummary: TasteBaselineVariant["mechanicalSummary"];
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

export function tasteJsonlToBaselineVariant(
  variant: TasteJsonlRecord["variants"][number],
  index: number,
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
  return tasteRankerFeatureVector(tasteJsonlToBaselineVariant(a, 0), tasteJsonlToBaselineVariant(b, 1));
}

export function predictTasteJsonlWithModel(
  record: TasteJsonlRecord,
  model: TasteLinearRankerModel,
): TasteJsonlPreference {
  const x = tasteJsonlFeatureVector(record);
  if (!x) return "unknown";
  const probA = predictTasteRankerProbFromFeatures(model, x);
  if (probA > 0.55) return "a";
  if (probA < 0.45) return "b";
  return "tie";
}

export function predictTasteJsonlMechanically(record: TasteJsonlRecord, tieMargin: number): TasteJsonlPreference {
  const [a, b] = record.variants;
  if (!a || !b) return "unknown";
  const aRisk = a.mechanicalSummary.highestRiskScore;
  const bRisk = b.mechanicalSummary.highestRiskScore;
  if (Math.abs(aRisk - bRisk) <= tieMargin) return "tie";
  return aRisk < bRisk ? "a" : "b";
}

export function evaluateTasteJsonl(
  records: TasteJsonlRecord[],
  predict: (record: TasteJsonlRecord) => TasteJsonlPreference,
): TasteJsonlEvaluation {
  const labeled = records.filter((record) => record.label && record.label.preferredVariantId !== "unknown");
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
