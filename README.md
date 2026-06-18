# ShipRank

**Pre-A/B testing for software teams.**

ShipRank helps teams choose which product variant to ship **agent-first** — specialized AI evaluator agents score variants in minutes. Human validation is an optional layer when matched evaluators are available.

Public wedge: **Product Arena** — predict which variant wins.

## Quick start

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed
pnpm build && pnpm dev:full
```

Open http://localhost:8788 (full stack) or run `pnpm dev` for frontend-only on :5173.

## Taste data tools

```bash
pnpm capture:taste:install
pnpm capture:taste -- --url https://example.com --label example
pnpm pair:taste -- --a captures/taste/example-a/manifest.json --b captures/taste/example-b/manifest.json --preferred a
pnpm synth:taste-degrade -- --manifest captures/taste/example/manifest.json --out captures/taste-pairs
pnpm baseline:taste -- --pair captures/taste-pairs/example.json
pnpm evidence:taste -- --study <study-id> --capture A=captures/taste/example-a/manifest.json --capture B=captures/taste/example-b/manifest.json
pnpm capture-study:taste -- --study <study-id>
pnpm export:taste-jsonl -- --in captures/taste-pairs --out datasets/taste-pairs.jsonl
pnpm split:taste-jsonl -- --in datasets/taste-pairs.jsonl --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl
pnpm eval:taste-jsonl -- --in datasets/taste-pairs.jsonl
pnpm train:taste-ranker -- --in datasets/taste-train.jsonl --out models/taste-linear-ranker.json
pnpm report:taste-model -- --train datasets/taste-train.jsonl --test datasets/taste-holdout.jsonl --model models/taste-linear-ranker.json --out reports/taste-model-report.json
pnpm smoke:taste-ranker
```

Capture output is local-only under `captures/`. Pair manifests are the first
labelable Web-TASTE training artifact between screenshots and the model. The
baseline command runs the deterministic mechanical evaluator that the real
Taste model should beat.

Set `TASTE_RANKER_MODEL_JSON` on the Pages app to route visual evidence through
the saved local linear ranker before VLM or mechanical fallback. The value is
the JSON produced by `pnpm train:taste-ranker`.

## Taste capture worker

`workers/taste-capture` is a separate Cloudflare Worker for production URL
capture. It uses Browser Rendering for Chromium and R2 for screenshots, then
posts capture manifests to `/api/studies/:id/visual-evidence`.

Configure the Pages app with `TASTE_CAPTURE_WORKER_URL` and optional
`TASTE_CAPTURE_WORKER_TOKEN` to enable `POST /api/studies/:id/capture`.
Set `TASTE_VISUAL_EVIDENCE_TOKEN` on Pages and matching `TASTE_API_TOKEN` on
the Worker to protect capture callbacks.
Set `TASTE_RANKER_MODEL_JSON` on Pages to use a trained local Taste ranker.
Set `TASTE_VLM_API_BASE`, `TASTE_VLM_API_KEY`, and `TASTE_VLM_MODEL` on Pages
to enable the VLM judge when capture artifacts expose HTTP image URLs.

```bash
pnpm capture-worker:check
```

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/dashboard` | Study list |
| `/studies/new` | Create + launch study |
| `/studies/:id` | Study detail |
| `/studies/:id/report` | Decision report |
| `/arena` | Product Arena battles |
| `/arena/:slug` | Vote on a battle |
| `/evaluators/apply` | Evaluator signup |
| `/admin` | Internal ops dashboard |

## API

Cloudflare Pages Functions at `/api/*`:

- `GET/POST /api/studies` — list/create studies
- `POST /api/studies/:id/launch` — run agents + evaluators + generate report
- `POST /api/studies/:id/capture` — ask the capture Worker to snapshot URL variants
- `POST /api/studies/:id/visual-evidence` — attach capture manifests and run Taste ranker/VLM/baseline
- `GET /api/studies/:id/report` — fetch report
- `GET/POST /api/arena/battles/:slug/vote` — arena
- `GET /api/admin/overview` — admin stats

## Deploy

```bash
pnpm deploy   # Cloudflare Pages (dist/)
```

Configure D1 binding `DB` in Cloudflare dashboard; run migrations against production D1.

## Docs

See `PROJECT_STATUS.md` for scope, shortcuts, and planned work.
See `docs/taste-capture-production.md` for the production capture Worker runbook.
See `docs/taste-model-data-loop.md` for the capture, split, train, and held-out
model report workflow.
