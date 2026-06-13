import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Env } from "../[[route]]";
import { notFound } from "../_context";

export const adminRouter = new Hono<{ Bindings: Env }>();

adminRouter.get("/overview", async (c) => {
  const db = c.get("db");
  const allStudies = await db.select().from(schema.studies).orderBy(desc(schema.studies.createdAt));
  const evaluators = await db.select().from(schema.evaluatorProfiles);
  const battles = await db.select().from(schema.arenaBattles);

  const stats = {
    totalStudies: allStudies.length,
    draft: allStudies.filter((s) => s.status === "draft").length,
    evaluating: allStudies.filter((s) => s.status === "evaluating").length,
    completed: allStudies.filter((s) => s.status === "completed").length,
    evaluators: evaluators.length,
    arenaBattles: battles.length,
  };

  return c.json({ stats, recentStudies: allStudies.slice(0, 10) });
});

adminRouter.get("/studies/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, id));
  if (!study) return notFound();

  const studyVariants = await db
    .select()
    .from(schema.variants)
    .where(eq(schema.variants.studyId, id));
  const agentRuns = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.studyId, id));
  const assignments = await db.select().from(schema.assignments).where(eq(schema.assignments.studyId, id));
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, id));

  return c.json({ study, variants: studyVariants, agentRuns, assignments, report });
});

adminRouter.patch("/reports/:studyId", async (c) => {
  const db = c.get("db");
  const studyId = c.req.param("studyId");
  const body = await c.req.json<{ summary?: string; reportJson?: unknown }>();

  const [existing] = await db.select().from(schema.reports).where(eq(schema.reports.studyId, studyId));
  if (!existing) return notFound("Report not found");

  await db
    .update(schema.reports)
    .set({
      summary: body.summary ?? existing.summary,
      reportJson: body.reportJson ? JSON.stringify(body.reportJson) : existing.reportJson,
    })
    .where(eq(schema.reports.studyId, studyId));

  return c.json({ ok: true });
});
