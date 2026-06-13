import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());

export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerEmail: text("owner_email").notNull(),
  createdAt: ts(),
});

export const studies = sqliteTable("studies", {
  id: id(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  studyType: text("study_type").notNull(),
  status: text("status").notNull().default("draft"),
  productName: text("product_name"),
  productUrl: text("product_url"),
  productDescription: text("product_description"),
  productStage: text("product_stage"),
  targetUserRole: text("target_user_role"),
  targetUserDescription: text("target_user_description"),
  targetUserIndustry: text("target_user_industry"),
  targetUserTechnical: integer("target_user_technical", { mode: "boolean" }),
  primaryObjective: text("primary_objective"),
  primaryMetric: text("primary_metric"),
  contextQuestions: text("context_questions"),
  contextConcerns: text("context_concerns"),
  contextTradeoffs: text("context_tradeoffs"),
  privacyLevel: text("privacy_level").default("private"),
  turnaroundLevel: text("turnaround_level").default("full_report"),
  studyBrief: text("study_brief"),
  createdAt: ts(),
  launchedAt: text("launched_at"),
  completedAt: text("completed_at"),
});

export const variants = sqliteTable("variants", {
  id: id(),
  studyId: text("study_id").notNull(),
  name: text("name").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  hypothesis: text("hypothesis"),
  assetType: text("asset_type").notNull().default("url"),
  assetUrl: text("asset_url"),
  snapshotUrl: text("snapshot_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  lockedAt: text("locked_at"),
  createdAt: ts(),
});

export const agentProfiles = sqliteTable("agent_profiles", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  agentType: text("agent_type").notNull(),
  promptVersion: text("prompt_version").notNull().default("v1"),
  status: text("status").notNull().default("active"),
  createdAt: ts(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: id(),
  studyId: text("study_id").notNull(),
  variantId: text("variant_id").notNull(),
  agentId: text("agent_id").notNull(),
  outputJson: text("output_json"),
  status: text("status").notNull().default("pending"),
  modelUsed: text("model_used"),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: ts(),
});

export const evaluatorProfiles = sqliteTable("evaluator_profiles", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  industry: text("industry"),
  seniority: text("seniority"),
  evaluatorType: text("evaluator_type").notNull().default("target_user"),
  skills: text("skills"),
  verificationStatus: text("verification_status").default("pending"),
  reputationScore: real("reputation_score").default(50),
  createdAt: ts(),
});

export const assignments = sqliteTable("assignments", {
  id: id(),
  studyId: text("study_id").notNull(),
  evaluatorId: text("evaluator_id").notNull(),
  status: text("status").notNull().default("assigned"),
  token: text("token").notNull().unique(),
  assignedAt: text("assigned_at").notNull().$defaultFn(() => new Date().toISOString()),
  submittedAt: text("submitted_at"),
});

export const evaluations = sqliteTable("evaluations", {
  id: id(),
  assignmentId: text("assignment_id").notNull(),
  variantId: text("variant_id").notNull(),
  scoresJson: text("scores_json").notNull(),
  frictionPoints: text("friction_points"),
  trustBlockers: text("trust_blockers"),
  confusionNotes: text("confusion_notes"),
  suggestedImprovements: text("suggested_improvements"),
  taskCompleted: integer("task_completed", { mode: "boolean" }),
  completionTimeSec: integer("completion_time_sec"),
  qualityScore: real("quality_score"),
  submittedAt: text("submitted_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const predictions = sqliteTable("predictions", {
  id: id(),
  studyId: text("study_id").notNull(),
  evaluatorId: text("evaluator_id"),
  evaluatorType: text("evaluator_type").notNull(),
  source: text("source").notNull().default("human"),
  predictedWinnerVariantId: text("predicted_winner_variant_id"),
  variantProbabilitiesJson: text("variant_probabilities_json"),
  confidence: real("confidence"),
  reasoning: text("reasoning"),
  createdAt: ts(),
});

export const reports = sqliteTable("reports", {
  id: id(),
  studyId: text("study_id").notNull().unique(),
  status: text("status").notNull().default("draft"),
  recommendationVariantId: text("recommendation_variant_id"),
  confidenceLevel: text("confidence_level"),
  summary: text("summary"),
  reportJson: text("report_json"),
  createdAt: ts(),
  deliveredAt: text("delivered_at"),
});

export const outcomes = sqliteTable("outcomes", {
  id: id(),
  studyId: text("study_id").notNull(),
  outcomeType: text("outcome_type").notNull().default("soft"),
  shippedVariantId: text("shipped_variant_id"),
  winningVariantId: text("winning_variant_id"),
  metricName: text("metric_name"),
  baselineValue: real("baseline_value"),
  resultValue: real("result_value"),
  notes: text("notes"),
  verificationLevel: integer("verification_level").default(1),
  submittedAt: text("submitted_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const arenaBattles = sqliteTable("arena_battles", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  goal: text("goal").notNull(),
  variantAId: text("variant_a_id").notNull(),
  variantBId: text("variant_b_id").notNull(),
  variantAJson: text("variant_a_json").notNull(),
  variantBJson: text("variant_b_json").notNull(),
  winningVariantId: text("winning_variant_id"),
  status: text("status").notNull().default("open"),
  revealAt: text("reveal_at"),
  createdAt: ts(),
});

export const studySimulations = sqliteTable("study_simulations", {
  id: id(),
  studyId: text("study_id").notNull(),
  mode: text("mode").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: ts(),
});

export const arenaVotes = sqliteTable("arena_votes", {
  id: id(),
  battleId: text("battle_id").notNull(),
  voterName: text("voter_name"),
  predictedVariantId: text("predicted_variant_id").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale"),
  createdAt: ts(),
});
