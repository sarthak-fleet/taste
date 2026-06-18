# Taste capture production runbook

Purpose: wire automatic URL screenshot capture into Taste without running
Chromium inside Pages Functions.

## Architecture

- Pages app owns studies, D1, reports, and `/api/studies/:id/visual-evidence`.
- `workers/taste-capture` owns Browser Rendering, screenshots, and R2 writes.
- Pages calls the Worker through `POST /api/studies/:id/capture`.
- Worker captures each URL variant, writes screenshots + manifest to R2, then
  posts the manifest back to Pages.

## Required Cloudflare resources

- R2 bucket: `taste-captures`
- Worker: `taste-capture`
- Pages env vars:
  - `TASTE_CAPTURE_WORKER_URL`
  - `TASTE_CAPTURE_WORKER_TOKEN` optional but recommended
  - `TASTE_VISUAL_EVIDENCE_TOKEN` optional but recommended
- Worker secret:
  - `CAPTURE_WORKER_TOKEN` must match `TASTE_CAPTURE_WORKER_TOKEN`
  - `TASTE_API_TOKEN` must match `TASTE_VISUAL_EVIDENCE_TOKEN`
- Worker var:
  - `TASTE_API_BASE`, for example `https://<taste-domain>/api`
  - `R2_PUBLIC_BASE_URL`, optional; required for VLM judging because image
    artifacts must be HTTP URLs rather than private `r2://` keys
- Pages VLM env vars, optional:
  - `TASTE_VLM_API_BASE`, OpenAI-compatible base URL
  - `TASTE_VLM_API_KEY`
  - `TASTE_VLM_MODEL`

## Preflight

```bash
pnpm build
pnpm capture-worker:check
pnpm exec wrangler deploy --config workers/taste-capture/wrangler.toml --dry-run --outdir /tmp/taste-capture-worker
```

## Configure

Create the R2 bucket if it does not already exist:

```bash
pnpm exec wrangler r2 bucket create taste-captures
```

Set Worker secrets:

```bash
pnpm exec wrangler secret put CAPTURE_WORKER_TOKEN --config workers/taste-capture/wrangler.toml
pnpm exec wrangler secret put TASTE_API_TOKEN --config workers/taste-capture/wrangler.toml
```

Set Pages environment variables in Cloudflare Pages:

```text
TASTE_CAPTURE_WORKER_URL=https://taste-capture.<account-subdomain>.workers.dev
TASTE_CAPTURE_WORKER_TOKEN=<same value as CAPTURE_WORKER_TOKEN>
TASTE_VISUAL_EVIDENCE_TOKEN=<same value as TASTE_API_TOKEN>
TASTE_VLM_API_BASE=https://<openai-compatible-host>/v1
TASTE_VLM_API_KEY=<provider key>
TASTE_VLM_MODEL=<vision-capable-model>
```

If VLM judging should run, configure a public R2 custom domain or equivalent
image delivery base and set `R2_PUBLIC_BASE_URL` on `taste-capture`. Without
HTTP image artifact URLs, the app intentionally falls back to
`taste-mechanical-baseline-v0`.

## Deploy

```bash
pnpm exec wrangler deploy --config workers/taste-capture/wrangler.toml
```

Deploy the Pages app through the existing project deploy path after setting the
Pages env vars.

## Smoke test

After a study has at least two URL variants:

```bash
pnpm capture-study:taste -- --api https://<taste-domain>/api --study <study-id>
```

Expected result:

- Worker returns one capture manifest per URL variant.
- Study detail shows captured badges.
- `/api/studies/:id` returns `visualEvaluations`.
- Launch/report generation includes either the configured `taste-vlm-*` agent
  output or the `taste-mechanical-baseline-v0` fallback when visual evidence
  exists.
