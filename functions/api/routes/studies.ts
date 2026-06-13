import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Env } from "../[[route]]";
import { badRequest, notFound } from "../_context";
import { generateStudyBrief } from "../../../src/lib/utils";
import { runAgentPipeline, runScoringAndReport } from "../services/pipeline";
import { executeSimulation, getLatestSimulation, listAgents } from "../services/simulation";

export const studiesRouter = new Hono<{ Bindings: Env }>();

studiesRouter.get("/", async (c) => {
  const db = c.get("db");
  const workspaceId = c.req.query("workspaceId");
  let query = db.select().from(schema.studies).orderBy(desc(schema.studies.createdAt));
  if (workspaceId) {
    const rows = await db
      .select()
      .from(schema.studies)
      .where(eq(schema.studies.workspaceId, workspaceId))
      .orderBy(desc(schema.studies.createdAt));
    return c.json(rows);
  }
  const rows = await query;
  return c.json(rows);
});

studiesRouter.get("/agents/list", async (c) => {
  return c.json(await listAgents());
});

studiesRouter.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  if (!study) return notFound("Study not found");

  const studyVariants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, id))
    .orderBy(schema.variants.sortOrder);

  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, id));

  const agentRuns = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.studyId, id));

  const preds = await db.select().from(schema.predictions).where(eq(schema.predictions.studyId, id));

  const [outcome] = await db.select().from(schema.outcomes).where(eq(schema.outcomes.studyId, id));

  return c.json({ study, variants: studyVariants, report, agentRuns, predictions: preds, outcome });
});

studiesRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    workspaceId: string;
    name: string;
    studyType: string;
    productName?: string;
    productUrl?: string;
    productDescription?: string;
    productStage?: string;
    targetUserRole?: string;
    targetUserDescription?: string;
    targetUserIndustry?: string;
    targetUserTechnical?: boolean;
    primaryObjective?: string;
    primaryMetric?: string;
    contextQuestions?: string;
    contextConcerns?: string;
    contextTradeoffs?: string;
    privacyLevel?: string;
    turnaroundLevel?: string;
    variants?: Array<{
      name: string;
      label: string;
      description?: string;
      hypothesis?: string;
      assetType?: string;
      assetUrl?: string;
    }>;
  }>();

  if (!body.workspaceId || !body.name || !body.studyType) {
    return badRequest("workspaceId, name, and studyType are required");
  }

  const id = crypto.randomUUID();
  const variantRows = body.variants ?? [];

  if (variantRows.length < 2) {
    return badRequest("At least 2 variants are required");
  }

  const brief = generateStudyBrief({
    name: body.name,
    productName: body.productName,
    productDescription: body.productDescription,
    targetUserRole: body.targetUserRole,
    targetUserDescription: body.targetUserDescription,
    primaryObjective: body.primaryObjective,
    primaryMetric: body.primaryMetric,
    contextQuestions: body.contextQuestions,
    contextConcerns: body.contextConcerns,
    variants: variantRows,
  });

  await db.insert(schema.studies).values({
    id,
    workspaceId: body.workspaceId,
    name: body.name,
    studyType: body.studyType,
    status: "draft",
    productName: body.productName,
    productUrl: body.productUrl,
    productDescription: body.productDescription,
    productStage: body.productStage,
    targetUserRole: body.targetUserRole,
    targetUserDescription: body.targetUserDescription,
    targetUserIndustry: body.targetUserIndustry,
    targetUserTechnical: body.targetUserTechnical,
    primaryObjective: body.primaryObjective,
    primaryMetric: body.primaryMetric,
    contextQuestions: body.contextQuestions,
    contextConcerns: body.contextConcerns,
    contextTradeoffs: body.contextTradeoffs,
    privacyLevel: body.privacyLevel ?? "private",
    turnaroundLevel: body.turnaroundLevel ?? "full_report",
    studyBrief: brief,
  });

  for (let i = 0; i < variantRows.length; i++) {
    const v = variantRows[i]!;
    await db.insert(schema.variants).values({
      id: crypto.randomUUID(),
      studyId: id,
      name: v.name,
      label: v.label,
      description: v.description,
      hypothesis: v.hypothesis,
      assetType: v.assetType ?? "url",
      assetUrl: v.assetUrl,
      sortOrder: i,
    });
  }

  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  const variants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, id))
    .orderBy(schema.variants.sortOrder);

  return c.json({ study, variants }, 201);
});

studiesRouter.post("/:id/launch", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  if (!study) return notFound("Study not found");

  const studyVariants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, id));

  if (studyVariants.length < 2) return badRequest("Need at least 2 variants");

  const now = new Date().toISOString();
  await db
    .update(schema.studies)
    .set({ status: "evaluating", launchedAt: now })
    .where(eq(schema.studies.id, id));

  for (const v of studyVariants) {
    await db.update(schema.variants).set({ lockedAt: now }).where(eq(schema.variants.id, v.id));
  }

  await runAgentPipeline(db, study, studyVariants);

  await db
    .update(schema.studies)
    .set({ status: "generating_report" })
    .where(eq(schema.studies.id, id));

  await runScoringAndReport(db, id);

  await db
    .update(schema.studies)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(schema.studies.id, id));

  const [updated] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, id));

  return c.json({ study: updated, report });
});

studiesRouter.post("/:id/simulate", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = (await c.req.json<{ mode?: "agents" | "humans" | "full" }>().catch(() => ({
    mode: "agents" as const,
  }))) as { mode?: "agents" | "humans" | "full" };
  const mode = body.mode ?? "agents";

  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  if (!study) return notFound("Study not found");

  const studyVariants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, id))
    .orderBy(schema.variants.sortOrder);

  if (studyVariants.length < 2) return badRequest("Need at least 2 variants");

  const result = await executeSimulation(db, study, studyVariants, mode);
  return c.json(result);
});

studiesRouter.get("/:id/simulation", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const result = await getLatestSimulation(db, id);
  if (!result) return notFound("No simulation run yet");
  return c.json(result);
});

studiesRouter.get("/:id/report", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, id));
  if (!report) return notFound("Report not found");
  return c.json({
    ...report,
    reportJson: report.reportJson ? JSON.parse(report.reportJson) : null,
  });
});

studiesRouter.post("/:id/outcome", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await c.req.json<{
    outcomeType?: string;
    shippedVariantId?: string;
    winningVariantId?: string;
    metricName?: string;
    baselineValue?: number;
    resultValue?: number;
    notes?: string;
  }>();

  await db.insert(schema.outcomes).values({
    id: crypto.randomUUID(),
    studyId: id,
    outcomeType: body.outcomeType ?? "soft",
    shippedVariantId: body.shippedVariantId,
    winningVariantId: body.winningVariantId,
    metricName: body.metricName,
    baselineValue: body.baselineValue,
    resultValue: body.resultValue,
    notes: body.notes,
  });

  return c.json({ ok: true });
});
