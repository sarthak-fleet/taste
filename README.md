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
