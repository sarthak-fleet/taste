import { eq } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Db } from "../_context";
import {
  computeVariantRankings,
  dimensionToOverallScore,
  evaluatorTypeWeight,
  getWeightsForStudyType,
} from "../../../src/lib/scoring";
import { generateReport } from "../../../src/lib/report";
import { executeSimulation } from "./simulation";
import { simulateHumanScores, HUMAN_EVALUATOR_POOL } from "../../../src/lib/evaluators";

type Study = typeof schema.studies.$inferSelect;
type Variant = typeof schema.variants.$inferSelect;

export async function runAgentPipeline(db: Db, study: Study, variants: Variant[]) {
  await executeSimulation(db, study, variants, "agents");
}

export async function runHumanPipeline(db: Db, study: Study, variants: Variant[]) {
  await executeSimulation(db, study, variants, "humans");
}

export async function runScoringAndReport(db: Db, studyId: string) {
  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, studyId));
  if (!study) return;

  const variants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, studyId))
    .orderBy(schema.variants.sortOrder);

  const agentRuns = await db
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.studyId, studyId));

  const predictions = await db
    .select()
    .from(schema.predictions)
    .where(eq(schema.predictions.studyId, studyId));

  const humanPreds = predictions.filter((p) => p.source === "human");
  const hasHumanValidation = humanPreds.length > 0;
  const weights = getWeightsForStudyType(study.studyType, hasHumanValidation);

  const agentScoresByVariant = new Map<string, number[]>();
  const agentTaskSignal = new Map<string, number[]>();

  for (const run of agentRuns) {
    if (!run.outputJson) continue;
    const output = JSON.parse(run.outputJson);
    const dimScores = Object.values(output.scores ?? {}) as number[];
    const avg = dimScores.length ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 3;
    const list = agentScoresByVariant.get(run.variantId) ?? [];
    list.push(avg);
    agentScoresByVariant.set(run.variantId, list);

    const completion = output.scores?.completionConfidence ?? 3;
    const tasks = agentTaskSignal.get(run.variantId) ?? [];
    tasks.push(completion >= 3.5 ? 1 : 0);
    agentTaskSignal.set(run.variantId, tasks);
  }

  const humanQuotes: Array<{ role: string; quote: string; variantLabel?: string }> = [];
  const predictionsByVariant = new Map<string, number>();
  let totalPredictions = 0;

  if (hasHumanValidation) {
    for (const pred of humanPreds) {
      if (!pred.predictedWinnerVariantId) continue;
      const [evaluator] = pred.evaluatorId
        ? await db
            .select()
            .from(schema.evaluatorProfiles)
            .where(eq(schema.evaluatorProfiles.id, pred.evaluatorId))
        : [];
      const w = evaluatorTypeWeight((pred.evaluatorType as "target_user") ?? "target_user");
      predictionsByVariant.set(
        pred.predictedWinnerVariantId,
        (predictionsByVariant.get(pred.predictedWinnerVariantId) ?? 0) + w,
      );
      totalPredictions += w;

      if (evaluator && humanQuotes.length < 5) {
        const winnerLabel = variants.find((v) => v.id === pred.predictedWinnerVariantId)?.label;
        humanQuotes.push({
          role: `${evaluator.role}, ${evaluator.seniority ?? ""}`,
          quote: pred.reasoning ?? `Variant ${winnerLabel} is strongest from my perspective.`,
          variantLabel: winnerLabel,
        });
      }
    }
  } else {
    const agentPreds = predictions.filter((p) => p.source === "agent");
    for (const pred of agentPreds) {
      if (!pred.predictedWinnerVariantId) continue;
      predictionsByVariant.set(
        pred.predictedWinnerVariantId,
        (predictionsByVariant.get(pred.predictedWinnerVariantId) ?? 0) + 1,
      );
      totalPredictions += 1;
    }
  }

  const winnerVariantId = [...predictionsByVariant.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const humanAgreement = hasHumanValidation && winnerVariantId
    ? (predictionsByVariant.get(winnerVariantId) ?? 0) / Math.max(totalPredictions, 1)
    : 0;

  const agentAgreement = computeAgentAgreement(agentRuns);

  const scoreInputs = variants.map((v, vi) => {
    const agentAvgs = agentScoresByVariant.get(v.id) ?? [3];
    const agentScore = agentAvgs.reduce((a, b) => a + b, 0) / agentAvgs.length;

    let targetUserScore = agentScore;
    let expertScore = agentScore;
    let taskCompletionRate = 2.5;

    if (hasHumanValidation) {
      const targetScores: number[] = [];
      const expertScores: number[] = [];
      const taskCompletions: number[] = [];

      for (let ei = 0; ei < HUMAN_EVALUATOR_POOL.length; ei++) {
        const ev = HUMAN_EVALUATOR_POOL[ei]!;
        const scores = simulateHumanScores(v.id, vi, ei);
        const overall = dimensionToOverallScore(scores);
        if (ev.type === "target_user" || ev.type === "power_user") targetScores.push(overall);
        else expertScores.push(overall);
        if (scores.completionConfidence >= 3.5) taskCompletions.push(1);
        else taskCompletions.push(0);
      }

      targetUserScore = targetScores.length
        ? targetScores.reduce((a, b) => a + b, 0) / targetScores.length
        : agentScore;
      expertScore = expertScores.length
        ? expertScores.reduce((a, b) => a + b, 0) / expertScores.length
        : agentScore;
      taskCompletionRate = taskCompletions.length
        ? (taskCompletions.reduce((a, b) => a + b, 0) / taskCompletions.length) * 5
        : 2.5;
    } else {
      const tasks = agentTaskSignal.get(v.id) ?? [];
      taskCompletionRate = tasks.length
        ? (tasks.reduce((a, b) => a + b, 0) / tasks.length) * 5
        : agentScore;
    }

    const predScore =
      ((predictionsByVariant.get(v.id) ?? 0) / Math.max(totalPredictions, 1)) * 5;

    return {
      variantId: v.id,
      variantLabel: v.label,
      variantName: v.name,
      targetUserScore,
      expertScore,
      agentScore,
      taskCompletionRate,
      predictionScore: predScore,
    };
  });

  const rankings = computeVariantRankings(scoreInputs, weights);

  const agentOutputs = agentRuns
    .filter((r) => r.outputJson)
    .map((r) => JSON.parse(r.outputJson!));

  const agentCount = new Set(agentRuns.map((r) => r.agentId)).size;

  const reportContent = generateReport({
    study: {
      id: study.id,
      name: study.name,
      studyType: study.studyType,
      productName: study.productName ?? study.name,
      targetUserRole: study.targetUserRole ?? "target user",
      primaryObjective: study.primaryObjective ?? "task_completion",
      primaryMetric: study.primaryMetric ?? "task_completion",
      contextConcerns: study.contextConcerns ?? undefined,
    },
    variants: variants.map((v) => ({
      id: v.id,
      label: v.label,
      name: v.name,
      description: v.description ?? undefined,
    })),
    rankings,
    agentOutputs,
    humanQuotes,
    humanAgreement: hasHumanValidation ? humanAgreement : agentAgreement,
    agentAgreement,
    sampleSize: hasHumanValidation ? humanPreds.length : agentCount,
    evaluatorQuality: hasHumanValidation ? 0.75 : 0.65,
    validationMode: hasHumanValidation ? "agent_plus_human" : "agent_first",
  });

  const winner = rankings[0]!;

  const [existingReport] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, studyId));

  const reportPayload = {
    status: "delivered" as const,
    recommendationVariantId: winner.variantId,
    confidenceLevel: reportContent.executiveRecommendation.confidence,
    summary: reportContent.executiveRecommendation.reason,
    reportJson: JSON.stringify(reportContent),
    deliveredAt: new Date().toISOString(),
  };

  if (existingReport) {
    await db.update(schema.reports).set(reportPayload).where(eq(schema.reports.studyId, studyId));
  } else {
    await db.insert(schema.reports).values({
      id: crypto.randomUUID(),
      studyId,
      ...reportPayload,
    });
  }
}

function computeAgentAgreement(
  agentRuns: Array<{ variantId: string; outputJson: string | null; agentId?: string }>,
): number {
  const winnerCounts = new Map<string, number>();
  const byAgent = new Map<string, Array<{ variantId: string; rank: number }>>();

  for (const run of agentRuns) {
    if (!run.outputJson) continue;
    const output = JSON.parse(run.outputJson);
    const agentKey = output.agentSlug ?? run.agentId ?? "unknown";
    const list = byAgent.get(agentKey) ?? [];
    list.push({ variantId: run.variantId, rank: output.prediction?.predictedRank ?? 99 });
    byAgent.set(agentKey, list);
  }

  for (const picks of byAgent.values()) {
    const best = picks.reduce((a, b) => (a.rank < b.rank ? a : b));
    winnerCounts.set(best.variantId, (winnerCounts.get(best.variantId) ?? 0) + 1);
  }

  const top = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const agentCount = byAgent.size || 1;
  return top ? top[1] / agentCount : 0.5;
}
