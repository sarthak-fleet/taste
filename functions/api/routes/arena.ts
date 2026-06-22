import { Hono } from "hono";
import { eq, desc, and, isNotNull, inArray } from "drizzle-orm";
import * as schema from "../../../src/db/schema";
import type { Env } from "../[[route]]";
import { notFound } from "../_context";
import { runMockAgentEvaluation } from "../../../src/lib/agents";

export const arenaRouter = new Hono<{ Bindings: Env }>();

arenaRouter.get("/battles", async (c) => {
  const db = c.get("db");
  const battles = await db
    .select()
    .from(schema.arenaBattles)
    .orderBy(desc(schema.arenaBattles.createdAt));
  return c.json(battles);
});

arenaRouter.get("/battles/:slug", async (c) => {
  const db = c.get("db");
  const slug = c.req.param("slug");
  const [battle] = await db
    .select()
    .from(schema.arenaBattles)
    .where(eq(schema.arenaBattles.slug, slug));
  if (!battle) return notFound("Battle not found");

  const votes = await db
    .select()
    .from(schema.arenaVotes)
    .where(eq(schema.arenaVotes.battleId, battle.id));

  const variantA = JSON.parse(battle.variantAJson);
  const variantB = JSON.parse(battle.variantBJson);

  const voteCounts = { a: 0, b: 0 };
  for (const v of votes) {
    if (v.predictedVariantId === "a") voteCounts.a++;
    else voteCounts.b++;
  }

  return c.json({
    battle: {
      ...battle,
      variantA,
      variantB,
    },
    votes: votes.length,
    voteCounts,
    communityPrediction: votes.length
      ? voteCounts.a > voteCounts.b
        ? "a"
        : voteCounts.b > voteCounts.a
          ? "b"
          : "tie"
      : null,
  });
});

arenaRouter.post("/battles/:slug/vote", async (c) => {
  const db = c.get("db");
  const slug = c.req.param("slug");
  const body = await c.req.json<{
    predictedVariantId: "a" | "b";
    confidence: number;
    rationale?: string;
    voterName?: string;
  }>();

  const [battle] = await db
    .select()
    .from(schema.arenaBattles)
    .where(eq(schema.arenaBattles.slug, slug));
  if (!battle) return notFound("Battle not found");

  await db.insert(schema.arenaVotes).values({
    id: crypto.randomUUID(),
    battleId: battle.id,
    voterName: body.voterName,
    predictedVariantId: body.predictedVariantId,
    confidence: body.confidence,
    rationale: body.rationale,
  });

  const variantA = JSON.parse(battle.variantAJson);
  const variantB = JSON.parse(battle.variantBJson);

  const agentCritiques = ["ux_clarity", "skeptical_buyer", "conversion_funnel"].map((slug) => {
    const outA = runMockAgentEvaluation({
      agentSlug: slug,
      variantId: "a",
      variantLabel: "A",
      variantName: variantA.name,
      variantDescription: variantA.description,
      studyContext: {
        productName: battle.title,
        studyType: "landing_page",
        targetUserRole: "developer",
        primaryObjective: battle.goal,
      },
      variantIndex: 0,
      totalVariants: 2,
    });
    const outB = runMockAgentEvaluation({
      agentSlug: slug,
      variantId: "b",
      variantLabel: "B",
      variantName: variantB.name,
      variantDescription: variantB.description,
      studyContext: {
        productName: battle.title,
        studyType: "landing_page",
        targetUserRole: "developer",
        primaryObjective: battle.goal,
      },
      variantIndex: 1,
      totalVariants: 2,
    });
    return {
      agent: slug,
      preferred: outA.prediction.predictedRank < outB.prediction.predictedRank ? "a" : "b",
      summaryA: outA.recommendation,
      summaryB: outB.recommendation,
    };
  });

  return c.json({ ok: true, agentCritiques });
});

arenaRouter.get("/leaderboard", async (c) => {
  const db = c.get("db");

  // Only load revealed battles that have a winning variant
  const revealedBattles = await db
    .select()
    .from(schema.arenaBattles)
    .where(and(eq(schema.arenaBattles.status, "revealed"), isNotNull(schema.arenaBattles.winningVariantId)));

  if (revealedBattles.length === 0) return c.json([]);

  const battleMap = new Map(revealedBattles.map((b) => [b.id, b]));
  const battleIds = revealedBattles.map((b) => b.id);

  // Only load votes for those revealed battles
  const votes = await db
    .select()
    .from(schema.arenaVotes)
    .where(inArray(schema.arenaVotes.battleId, battleIds));

  const scores = new Map<string, { correct: number; total: number; name: string }>();

  for (const vote of votes) {
    const battle = battleMap.get(vote.battleId);
    if (!battle) continue;

    const key = vote.voterName ?? "Anonymous";
    const entry = scores.get(key) ?? { correct: 0, total: 0, name: key };
    entry.total++;
    if (vote.predictedVariantId === battle.winningVariantId) entry.correct++;
    scores.set(key, entry);
  }

  const leaderboard = [...scores.values()]
    .map((s) => ({
      name: s.name,
      accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0,
      predictions: s.total,
    }))
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 20);

  return c.json(leaderboard);
});
