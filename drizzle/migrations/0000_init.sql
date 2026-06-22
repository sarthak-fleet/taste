CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `owner_email` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);

CREATE TABLE `studies` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `name` text NOT NULL,
  `study_type` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `product_name` text,
  `product_url` text,
  `product_description` text,
  `product_stage` text,
  `target_user_role` text,
  `target_user_description` text,
  `target_user_industry` text,
  `target_user_technical` integer,
  `primary_objective` text,
  `primary_metric` text,
  `context_questions` text,
  `context_concerns` text,
  `context_tradeoffs` text,
  `privacy_level` text DEFAULT 'private',
  `turnaround_level` text DEFAULT 'full_report',
  `study_brief` text,
  `created_at` text NOT NULL,
  `launched_at` text,
  `completed_at` text
);

CREATE TABLE `variants` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `name` text NOT NULL,
  `label` text NOT NULL,
  `description` text,
  `hypothesis` text,
  `asset_type` text DEFAULT 'url' NOT NULL,
  `asset_url` text,
  `snapshot_url` text,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `locked_at` text,
  `created_at` text NOT NULL
);

CREATE TABLE `agent_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL,
  `agent_type` text NOT NULL,
  `prompt_version` text DEFAULT 'v1' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `agent_profiles_slug_unique` ON `agent_profiles` (`slug`);

CREATE TABLE `agent_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `output_json` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `model_used` text,
  `error_message` text,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL
);

CREATE TABLE `evaluator_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `industry` text,
  `seniority` text,
  `evaluator_type` text DEFAULT 'target_user' NOT NULL,
  `skills` text,
  `verification_status` text DEFAULT 'pending',
  `reputation_score` real DEFAULT 50,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `evaluator_profiles_email_unique` ON `evaluator_profiles` (`email`);

CREATE TABLE `assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `evaluator_id` text NOT NULL,
  `status` text DEFAULT 'assigned' NOT NULL,
  `token` text NOT NULL,
  `assigned_at` text NOT NULL,
  `submitted_at` text
);
CREATE UNIQUE INDEX `assignments_token_unique` ON `assignments` (`token`);

CREATE TABLE `evaluations` (
  `id` text PRIMARY KEY NOT NULL,
  `assignment_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `scores_json` text NOT NULL,
  `friction_points` text,
  `trust_blockers` text,
  `confusion_notes` text,
  `suggested_improvements` text,
  `task_completed` integer,
  `completion_time_sec` integer,
  `quality_score` real,
  `submitted_at` text NOT NULL
);

CREATE TABLE `predictions` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `evaluator_id` text,
  `evaluator_type` text NOT NULL,
  `source` text DEFAULT 'human' NOT NULL,
  `predicted_winner_variant_id` text,
  `variant_probabilities_json` text,
  `confidence` real,
  `reasoning` text,
  `created_at` text NOT NULL
);

CREATE TABLE `reports` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `recommendation_variant_id` text,
  `confidence_level` text,
  `summary` text,
  `report_json` text,
  `created_at` text NOT NULL,
  `delivered_at` text
);
CREATE UNIQUE INDEX `reports_study_id_unique` ON `reports` (`study_id`);

CREATE TABLE `outcomes` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `outcome_type` text DEFAULT 'soft' NOT NULL,
  `shipped_variant_id` text,
  `winning_variant_id` text,
  `metric_name` text,
  `baseline_value` real,
  `result_value` real,
  `notes` text,
  `verification_level` integer DEFAULT 1,
  `submitted_at` text NOT NULL
);

CREATE TABLE `arena_battles` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `goal` text NOT NULL,
  `variant_a_id` text NOT NULL,
  `variant_b_id` text NOT NULL,
  `variant_a_json` text NOT NULL,
  `variant_b_json` text NOT NULL,
  `winning_variant_id` text,
  `status` text DEFAULT 'open' NOT NULL,
  `reveal_at` text,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `arena_battles_slug_unique` ON `arena_battles` (`slug`);

CREATE TABLE `arena_votes` (
  `id` text PRIMARY KEY NOT NULL,
  `battle_id` text NOT NULL,
  `voter_name` text,
  `predicted_variant_id` text NOT NULL,
  `confidence` real NOT NULL,
  `rationale` text,
  `created_at` text NOT NULL
);

-- Foreign-key indexes for query performance
CREATE INDEX IF NOT EXISTS `studies_workspace_id_idx` ON `studies` (`workspace_id`);
CREATE INDEX IF NOT EXISTS `variants_study_id_idx` ON `variants` (`study_id`);
CREATE INDEX IF NOT EXISTS `agent_runs_study_id_idx` ON `agent_runs` (`study_id`);
CREATE INDEX IF NOT EXISTS `agent_runs_variant_id_idx` ON `agent_runs` (`variant_id`);
CREATE INDEX IF NOT EXISTS `predictions_study_id_idx` ON `predictions` (`study_id`);
CREATE INDEX IF NOT EXISTS `predictions_evaluator_id_idx` ON `predictions` (`evaluator_id`);
CREATE INDEX IF NOT EXISTS `assignments_study_id_idx` ON `assignments` (`study_id`);
CREATE INDEX IF NOT EXISTS `evaluations_assignment_id_idx` ON `evaluations` (`assignment_id`);
CREATE INDEX IF NOT EXISTS `arena_votes_battle_id_idx` ON `arena_votes` (`battle_id`);
CREATE INDEX IF NOT EXISTS `visual_evaluations_study_id_idx` ON `visual_evaluations` (`study_id`);
CREATE INDEX IF NOT EXISTS `visual_evaluations_variant_id_idx` ON `visual_evaluations` (`variant_id`);
