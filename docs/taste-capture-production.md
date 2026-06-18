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
```

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
- Launch/report generation includes the `taste-mechanical-baseline-v0` agent
  output when visual evidence exists.
