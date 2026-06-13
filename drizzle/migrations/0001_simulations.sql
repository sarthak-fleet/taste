CREATE TABLE `study_simulations` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `mode` text NOT NULL,
  `result_json` text NOT NULL,
  `created_at` text NOT NULL
);
