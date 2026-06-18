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
pnpm baseline:taste -- --pair captures/taste-pairs/example.json
pnpm evidence:taste -- --study <study-id> --capture A=captures/taste/example-a/manifest.json --capture B=captures/taste/example-b/manifest.json
```

Capture output is local-only under `captures/`. Pair manifests are the first
labelable Web-TASTE training artifact between screenshots and the model. The
baseline command runs the deterministic mechanical evaluator that the real
Taste model should beat.

## Taste capture worker

`workers/taste-capture` is a separate Cloudflare Worker for production URL
capture. It uses Browser Rendering for Chromium and R2 for screenshots, then
posts capture manifests to `/api/studies/:id/visual-evidence`.

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
- `POST /api/studies/:id/visual-evidence` — attach capture manifests and run Taste baseline
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
