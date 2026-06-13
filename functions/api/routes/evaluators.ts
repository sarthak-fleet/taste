import { Hono } from "hono";
import { eq } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Env } from "../[[route]]";
import { badRequest, notFound } from "../_context";
import type { DimensionScores } from "../../../src/lib/types";

export const evaluatorsRouter = new Hono<{ Bindings: Env }>();

evaluatorsRouter.get("/task/:token", async (c) => {
  const db = c.get("db");
  const token = c.req.param("token");
  const [assignment] = await db
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.token, token));
  if (!assignment) return notFound("Assignment not found");

  const [study] = await db
    .select()
    .from(schema.studies)
    .where(eq(schema.studies.id, assignment.studyId));
  const variants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, assignment.studyId))
    .orderBy(schema.variants.sortOrder);

  const [evaluator] = await db
    .select()
    .from(schema.evaluatorProfiles)
    .where(eq(schema.evaluatorProfiles.id, assignment.evaluatorId));

  return c.json({
    assignment,
    study: {
      id: study?.id,
      name: study?.name,
      studyType: study?.studyType,
      productName: study?.productName,
      targetUserRole: study?.targetUserRole,
      primaryObjective: study?.primaryObjective,
      studyBrief: study?.studyBrief,
    },
    variants,
    evaluator,
  });
});

evaluatorsRouter.post("/task/:token/submit", async (c) => {
  const db = c.get("db");
  const token = c.req.param("token");
  const body = await c.req.json<{
    evaluations: Array<{
      variantId: string;
      scores: DimensionScores;
      frictionPoints?: string;
      trustBlockers?: string;
      confusionNotes?: string;
      suggestedImprovements?: string;
      taskCompleted?: boolean;
      completionTimeSec?: number;
    }>;
    prediction: {
      predictedWinnerVariantId: string;
      confidence: number;
      reasoning: string;
    };
  }>();

  const [assignment] = await db
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.token, token));
  if (!assignment) return notFound("Assignment not found");
  if (assignment.status === "submitted") return badRequest("Already submitted");

  for (const ev of body.evaluations) {
    await db.insert(schema.evaluations).values({
      id: crypto.randomUUID(),
      assignmentId: assignment.id,
      variantId: ev.variantId,
      scoresJson: JSON.stringify(ev.scores),
      frictionPoints: ev.frictionPoints,
      trustBlockers: ev.trustBlockers,
      confusionNotes: ev.confusionNotes,
      suggestedImprovements: ev.suggestedImprovements,
      taskCompleted: ev.taskCompleted,
      completionTimeSec: ev.completionTimeSec,
      qualityScore: 4,
    });
  }

  await db.insert(schema.predictions).values({
    id: crypto.randomUUID(),
    studyId: assignment.studyId,
    evaluatorId: assignment.evaluatorId,
    evaluatorType: "target_user",
    source: "human",
    predictedWinnerVariantId: body.prediction.predictedWinnerVariantId,
    confidence: body.prediction.confidence,
    reasoning: body.prediction.reasoning,
  });

  await db
    .update(schema.assignments)
    .set({ status: "submitted", submittedAt: new Date().toISOString() })
    .where(eq(schema.assignments.id, assignment.id));

  return c.json({ ok: true });
});

evaluatorsRouter.post("/apply", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    name: string;
    email: string;
    role: string;
    industry?: string;
    seniority?: string;
    evaluatorType?: string;
    skills?: string;
  }>();

  if (!body.name || !body.email || !body.role) {
    return badRequest("name, email, and role are required");
  }

  await db.insert(schema.evaluatorProfiles).values({
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    role: body.role,
    industry: body.industry,
    seniority: body.seniority,
    evaluatorType: body.evaluatorType ?? "target_user",
    skills: body.skills,
    verificationStatus: "pending",
  });

  return c.json({ ok: true }, 201);
});
