import { eq, desc } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Db } from "../_context";
import { runFullSimulation, type SimulationResult } from "../../../src/lib/simulation";
import { AGENT_DEFINITIONS } from "../../../src/lib/agents";

type Study = typeof schema.studies.$inferSelect;
type Variant = typeof schema.variants.$inferSelect;

function studyContext(study: Study) {
  return {
    productName: study.productName ?? study.name,
    studyType: study.studyType,
    targetUserRole: study.targetUserRole ?? "target user",
    primaryObjective: study.primaryObjective ?? "task_completion",
  };
}

export async function persistAgentRuns(
  db: Db,
  studyId: string,
  agentPanel: SimulationResult["agentPanel"],
) {
  for (const agent of agentPanel) {
    for (const output of agent.outputs) {
      await db.insert(schema.agentRuns).values({
        id: crypto.randomUUID(),
        studyId,
        variantId: output.variantId,
        agentId: output.agentSlug,
        outputJson: JSON.stringify(output),
        status: "completed",
        modelUsed: "simulation-v1",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      if (output.prediction.predictedRank === 1) {
        await db.insert(schema.predictions).values({
          id: crypto.randomUUID(),
          studyId,
          evaluatorId: output.agentSlug,
          evaluatorType: output.agentSlug,
          source: "agent",
          predictedWinnerVariantId: output.variantId,
          confidence: output.prediction.confidence,
          reasoning: output.recommendation,
        });
      }
    }
  }
}

export async function persistHumanEvaluations(
  db: Db,
  studyId: string,
  humanPanel: SimulationResult["humanPanel"],
) {
  for (const human of humanPanel) {
    const email = `${human.evaluator.name.toLowerCase().replace(/\s/g, ".")}@eval.shiprank.dev`;

    let [evaluator] = await db
      .select()
      .from(schema.evaluatorProfiles)
      .where(eq(schema.evaluatorProfiles.email, email));

    if (!evaluator) {
      const eid = crypto.randomUUID();
      await db.insert(schema.evaluatorProfiles).values({
        id: eid,
        name: human.evaluator.name,
        email,
        role: human.evaluator.role,
        evaluatorType: human.evaluator.type,
        seniority: human.evaluator.seniority,
        verificationStatus: "verified",
        reputationScore: 70,
      });
      [evaluator] = await db
        .select()
        .from(schema.evaluatorProfiles)
        .where(eq(schema.evaluatorProfiles.email, email));
    }

    const assignmentId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await db.insert(schema.assignments).values({
      id: assignmentId,
      studyId,
      evaluatorId: evaluator!.id,
      status: "submitted",
      token,
      submittedAt: new Date().toISOString(),
    });

    for (const vr of human.variantResults) {
      await db.insert(schema.evaluations).values({
        id: crypto.randomUUID(),
        assignmentId,
        variantId: vr.variantId,
        scoresJson: JSON.stringify(vr.scores),
        frictionPoints: vr.frictionPoints ?? null,
        trustBlockers: vr.trustBlockers ?? null,
        confusionNotes: vr.confusionNotes ?? null,
        taskCompleted: vr.taskCompleted,
        completionTimeSec: 45 + human.evaluatorIndex * 10,
        qualityScore: 4.2,
      });
    }

    await db.insert(schema.predictions).values({
      id: crypto.randomUUID(),
      studyId,
      evaluatorId: evaluator!.id,
      evaluatorType: human.evaluator.type,
      source: "human",
      predictedWinnerVariantId: human.predictedWinnerVariantId,
      confidence: human.confidence,
      reasoning: human.reasoning,
    });
  }
}

export async function saveSimulation(db: Db, result: SimulationResult) {
  await db.insert(schema.studySimulations).values({
    id: crypto.randomUUID(),
    studyId: result.studyId,
    mode: result.mode,
    resultJson: JSON.stringify(result),
  });
}

export async function getLatestSimulation(db: Db, studyId: string) {
  const [row] = await db
    .select()
    .from(schema.studySimulations)
    .where(eq(schema.studySimulations.studyId, studyId))
    .orderBy(desc(schema.studySimulations.createdAt))
    .limit(1);

  if (!row) return null;
  return JSON.parse(row.resultJson) as SimulationResult;
}

export async function executeSimulation(
  db: Db,
  study: Study,
  variants: Variant[],
  mode: "agents" | "humans" | "full",
): Promise<SimulationResult> {
  const variantInputs = variants.map((v) => ({
    id: v.id,
    label: v.label,
    name: v.name,
    description: v.description ?? undefined,
  }));

  const result = runFullSimulation({
    studyId: study.id,
    mode,
    variants: variantInputs,
    studyContext: studyContext(study),
  });

  if (mode === "agents" || mode === "full") {
    await persistAgentRuns(db, study.id, result.agentPanel);
  }
  if (mode === "humans" || mode === "full") {
    await persistHumanEvaluations(db, study.id, result.humanPanel);
  }

  await saveSimulation(db, result);
  return result;
}

export async function listAgents() {
  return AGENT_DEFINITIONS.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
    agentType: a.agentType,
    focusAreas: a.focusAreas,
  }));
}
