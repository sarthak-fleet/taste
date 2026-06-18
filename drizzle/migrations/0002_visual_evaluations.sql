CREATE TABLE `visual_evaluations` (
  `id` text PRIMARY KEY NOT NULL,
  `study_id` text NOT NULL,
  `variant_id` text NOT NULL,
  `source_type` text DEFAULT 'capture_manifest' NOT NULL,
  `source_url` text,
  `capture_manifest_json` text NOT NULL,
  `model_id` text,
  `baseline_result_json` text,
  `status` text DEFAULT 'completed' NOT NULL,
  `error_message` text,
  `completed_at` text,
  `created_at` text NOT NULL
);
