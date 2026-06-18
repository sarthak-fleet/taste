import { and, desc, eq } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Db } from "../_context";
import type { TasteCaptureManifest } from "../../../src/lib/visualEvidence";
import { summarizeCaptureArtifactRisk } from "../../../src/lib/tasteDataset";
import {
  runTasteMechanicalBaselineForVariants,
  TASTE_BASELINE_MODEL_ID,
  type TasteBaselineResult,
  type TasteBaselineVariant,
} from "../../../src/lib/tasteBaseline";

type Study = typeof schema.studies.$inferSelect;
type Variant = typeof schema.variants.$inferSelect;
type VisualEvaluation = typeof schema.visualEvaluations.$inferSelect;

export interface VisualEvidenceInput {
  variantId?: string;
  variantLabel?: string;
  manifest: TasteCaptureManifest;
}

function assertCaptureManifest(value: TasteCaptureManifest): asserts value is TasteCaptureManifest {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    throw new Error("Each visual evidence item needs a v1 capture manifest with artifacts");
  }
}

function findVariant(variants: Variant[], evidence: VisualEvidenceInput): Variant | null {
  if (evidence.variantId) {
    return variants.find((variant) => variant.id === evidence.variantId) ?? null;
  }
  if (evidence.variantLabel) {
    return variants.find((variant) => variant.label === evidence.variantLabel) ?? null;
  }
  return null;
}

function latestEvaluationByVariant(rows: VisualEvaluation[]): Map<string, VisualEvaluation> {
  const latest = new Map<string, VisualEvaluation>();
  for (const row of rows) {
    if (!latest.has(row.variantId)) latest.set(row.variantId, row);
  }
  return latest;
}

function buildBaselineVariant(variant: Variant, evaluation: VisualEvaluation): TasteBaselineVariant {
  const manifest = JSON.parse(evaluation.captureManifestJson) as TasteCaptureManifest;
  return {
    id: variant.id,
    label: variant.label,
    artifacts: manifest.artifacts,
    mechanicalSummary: summarizeCaptureArtifactRisk(manifest.artifacts),
  };
}

async function replaceTasteBaselineRuns(db: Db, studyId: string, result: TasteBaselineResult) {
  await db
    .delete(schema.agentRuns)
    .where(and(eq(schema.agentRuns.studyId, studyId), eq(schema.agentRuns.agentId, TASTE_BASELINE_MODEL_ID)));
  await db
    .delete(schema.predictions)
    .where(and(eq(schema.predictions.studyId, studyId), eq(schema.predictions.evaluatorId, TASTE_BASELINE_MODEL_ID)));

  const now = new Date().toISOString();
  for (const output of result.outputs) {
    await db.insert(schema.agentRuns).values({
      id: crypto.randomUUID(),
      studyId,
      variantId: output.variantId,
      agentId: TASTE_BASELINE_MODEL_ID,
      outputJson: JSON.stringify(output),
      status: "completed",
      modelUsed: result.modelId,
      startedAt: now,
      completedAt: now,
    });
  }

  if (result.overallWinnerVariantId) {
    await db.insert(schema.predictions).values({
      id: crypto.randomUUID(),
      studyId,
      evaluatorId: TASTE_BASELINE_MODEL_ID,
      evaluatorType: TASTE_BASELINE_MODEL_ID,
      source: "agent",
      predictedWinnerVariantId: result.overallWinnerVariantId,
      confidence: result.overallConfidence,
      reasoning: result.summary,
    });
  }
}

export async function persistVisualEvidence(db: Db, study: Study, variants: Variant[], evidence: VisualEvidenceInput[]) {
  const persisted: VisualEvaluation[] = [];
  const now = new Date().toISOString();

  for (const item of evidence) {
    assertCaptureManifest(item.manifest);
    const variant = findVariant(variants, item);
    if (!variant) {
      throw new Error(`No variant matched visual evidence item ${item.variantId ?? item.variantLabel ?? "(missing id)"}`);
    }

    const id = crypto.randomUUID();
    await db.insert(schema.visualEvaluations).values({
      id,
      studyId: study.id,
      variantId: variant.id,
      sourceType: "capture_manifest",
      sourceUrl: item.manifest.source.url,
      captureManifestJson: JSON.stringify(item.manifest),
      status: "completed",
      completedAt: now,
    });

    const [row] = await db.select().from(schema.visualEvaluations).where(eq(schema.visualEvaluations.id, id));
    if (row) persisted.push(row);
  }

  return persisted;
}

export async function runTasteBaselineFromLatestEvidence(
  db: Db,
  study: Study,
  variants: Variant[],
): Promise<TasteBaselineResult | null> {
  const rows = await db
    .select()
    .from(schema.visualEvaluations)
    .where(eq(schema.visualEvaluations.studyId, study.id))
    .orderBy(desc(schema.visualEvaluations.createdAt));
  const latest = latestEvaluationByVariant(rows);
  const baselineVariants = variants
    .filter((variant) => latest.has(variant.id))
    .map((variant) => buildBaselineVariant(variant, latest.get(variant.id)!));

  if (baselineVariants.length < 2) return null;

  const result = runTasteMechanicalBaselineForVariants({
    studyId: study.id,
    studyType: study.studyType,
    primaryObjective: study.primaryObjective ?? undefined,
    variants: baselineVariants,
  });

  await replaceTasteBaselineRuns(db, study.id, result);
  await db
    .update(schema.visualEvaluations)
    .set({
      modelId: result.modelId,
      baselineResultJson: JSON.stringify(result),
    })
    .where(eq(schema.visualEvaluations.studyId, study.id));

  return result;
}

export async function attachVisualEvidenceAndRunBaseline(params: {
  db: Db;
  study: Study;
  variants: Variant[];
  evidence: VisualEvidenceInput[];
  runBaseline: boolean;
}) {
  const persisted = await persistVisualEvidence(params.db, params.study, params.variants, params.evidence);
  const baseline = params.runBaseline
    ? await runTasteBaselineFromLatestEvidence(params.db, params.study, params.variants)
    : null;

  return { persisted, baseline };
}
