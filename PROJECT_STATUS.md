# taste (ShipRank) — PROJECT_STATUS

Last updated: 2026-06-28

## Why/What

ShipRank (repo: `taste`) is pre-A/B testing for software teams — **agent-first** variant evaluation with optional human validation. Teams create studies, run specialized evaluator agents against product variants, and receive decision-grade reports. Public wedge: **Product Arena** (predict which variant wins). Taste model v1 pipeline (capture → label → mechanical baseline → linear ranker) supports visual evidence when screenshot URLs are available.

Out of scope: open evaluator marketplace, prediction markets with money, enterprise SSO, categories beyond SaaS/devtool landing + onboarding, and supervised ranker promotion until the label gate passes.

## Dependencies

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React SPA, Tailwind v4 |
| Backend | Cloudflare Pages Functions (`/api/*`) |
| Database | Cloudflare D1 + Drizzle ORM |
| Runtime | Bun standardized for install/build/dev |
| Capture Worker | `workers/taste-capture` — Browser Rendering + R2 |
| Auth | SaaS Maker device-flow auth hub for fleet operators (2026-06-20) |
| Deploy | Cloudflare Pages + separate capture Worker |

**Local dev:** `bun install && bun db:migrate:local && bun db:seed && bun build && bun dev:full` → http://localhost:8788 (full stack) or `bun dev` frontend-only :5173

**Key checks:** `bun build` · `bun capture-worker:check` · taste capture/validate scripts per README

```
Study wizard → D1 (studies, variants, runs, reports)
        │
        ├── Agent tournament (6 mock agents, structured JSON, versioned runs)
        ├── TASTE pairwise diagnostics (criterion sets, order-checked verdicts, validity warnings)
        ├── Simulation API (human panel simulation, signal-quality section)
        └── Visual evidence path:
                taste-capture Worker (Chromium + R2)
                        → POST visual-evidence
                        → TASTE_RANKER_MODEL_JSON (optional linear ranker)
                        → VLM judge (when public screenshot URLs configured)
                        → mechanical baseline fallback

Product Arena: battles + votes (public wedge)
Admin: internal ops overview
```

**Taste data loop (CLI):** `capture:taste` → `pair:taste` → `label:taste-pair` → `export:taste-jsonl` → `split:taste-jsonl` → `train:taste-ranker` → `report:taste-model`. Promotion requires `promotionReadiness.ok` in model report (50+ real holdout labels, 0.70 accuracy, +0.05 over mechanical baseline).

| Concern | Detail |
|---------|--------|
| Hosting | Cloudflare Pages + `workers/taste-capture` Worker |
| Database | D1 binding `DB` — run migrations against prod after deploy |
| Capture env | `TASTE_CAPTURE_WORKER_URL`, `TASTE_CAPTURE_WORKER_TOKEN`, `TASTE_VISUAL_EVIDENCE_TOKEN` |
| VLM env | `TASTE_VLM_API_BASE`, `TASTE_VLM_API_KEY`, `TASTE_VLM_MODEL` |
| Ranker env | `TASTE_RANKER_MODEL_JSON` (trained JSON from `bun train:taste-ranker`) |
| Local captures | Output under `captures/` — gitignored, local-only |
| Deploy | `bun deploy` (Pages); capture Worker deployed separately |
| Smoke | `bun build` · `bun smoke:taste-ranker` · `bun capture-worker:check` |

## Timeline

| Phase | Milestone |
|-------|-----------|
| MVP v0.1 | Marketing landing, study wizard, dashboard, agent tournament, decision-grade reports, Product Arena, evaluator apply flow, admin overview, D1 schema + seed |
| Agent-first pipeline | Six mock agents, TASTE pairwise diagnostics, simulation API/UI, agent cinema + evaluation overlays |
| Taste model v1 | Capture/label/pair CLI loop, mechanical baseline, linear ranker training, promotion-gate audits, 70 real labels across seed + expansion queues |
| Production capture scaffold | `workers/taste-capture` Worker, visual-evidence callback, VLM judge path, runbooks |
| Fleet integration (2026-06-20) | SaaS Maker device-flow auth hub, Bun standardized dev/build, Cloudflare Pages deploy path |

## Products

**Primary routes:** `/` · `/dashboard` · `/studies/new` · `/studies/:id` · `/studies/:id/report` · `/arena` · `/arena/:slug` · `/evaluators/apply` · `/admin`

**Primary API:** `GET/POST /api/studies` · `POST /api/studies/:id/launch` · `POST /api/studies/:id/simulate` · `POST /api/studies/:id/capture` · `POST /api/studies/:id/visual-evidence` · `GET /api/studies/:id/report` · arena vote endpoints · `GET /api/admin/overview`

| Surface | Role |
|---------|------|
| Study wizard | Create and launch variant evaluation studies |
| Dashboard | Study list and management |
| Study detail | Agent tournament matrix, weighted ranking, overlays |
| Report | Decision-grade output with signal-quality diagnostics |
| Product Arena | Public battles + vote wedge |
| Evaluator apply | Manual evaluator onboarding |
| Admin | Internal ops overview |

## Features (shipped)

### MVP v0.1 product surfaces
- Marketing landing page with Product Arena positioning.
- Study creation wizard and customer dashboard (study list).
- Study detail with agent tournament matrix and weighted ranking.
- Decision-grade reports with signal-quality diagnostics.
- Product Arena battles (`/arena`, `/arena/:slug`) with vote API.
- Evaluator application flow (`/evaluators/apply`).
- Admin overview dashboard (`/admin`, `/api/admin/overview`).
- D1 schema + seed data; Drizzle migrations (`bun db:migrate:local`).

### Agent-first evaluation pipeline
- Six mock agents with structured JSON output and versioned runs.
- TASTE-style pairwise diagnostics: criterion sets, order-checked verdicts, validity warnings, outcome calibration.
- Simulation API and UI: `POST /api/studies/:id/simulate`, human panel simulation, report signal-quality section.
- Agent cinema overlay and evaluation overlay components for study detail UX.
- Scoring and report generation libraries (`src/lib/scoring.ts`, `src/lib/report.ts`).

### Taste model v1 pipeline (shipped)
- Screenshot capture CLI (`bun capture:taste`).
- Web-TASTE queue runner and curated queues (70 real labels across seed + expansion queues).
- Pair manifest tooling (`pair:taste`, `synth:taste-degrade`, `baseline:taste`, `evidence:taste`).
- Mechanical baseline evaluator (deterministic DOM/mechanical features).
- Linear ranker training (`train:taste-ranker`) with optional runtime routing via `TASTE_RANKER_MODEL_JSON`.
- Promotion-gate audits (`audit:taste-pairs`, `audit:taste-jsonl`, `report:taste-model`).
- Mobile/desktop risk asymmetry penalty in mechanical baseline.
- Label review HTML queue (`review:taste-pairs`).

### Production capture scaffold
- `workers/taste-capture` Cloudflare Worker: Browser Rendering + R2 storage.
- API trigger: `POST /api/studies/:id/capture` when `TASTE_CAPTURE_WORKER_URL` configured.
- Callback path: `POST /api/studies/:id/visual-evidence` with token auth (`TASTE_VISUAL_EVIDENCE_TOKEN` / `TASTE_API_TOKEN`).
- VLM judge path when `TASTE_VLM_API_BASE`, `TASTE_VLM_API_KEY`, `TASTE_VLM_MODEL` set and captures expose HTTP image URLs.
- Runbook: `docs/taste-capture-production.md`; data loop: `docs/taste-model-data-loop.md`.
- `bun capture-worker:check` validation script.

### Platform and fleet integration
- SaaS Maker device-flow auth hub for fleet operators (2026-06-20).
- Bun standardized for install, build, and `dev:full` orchestration.
- Cloudflare Pages deploy path (`bun deploy`).

## Todo / Planned / Deferred / Blocked

### Planned
1. **Real LLM agent integration** — OpenAI-compatible agents via `AI_API_KEY` replacing mock agents for production studies.
2. **Manual evaluator task UI** — assignment tokens, outcome submission, reputation updates.
3. **Admin report editing** — post-launch report corrections without re-running full tournament.
4. **Production capture Worker deploy** — configure bindings (R2, Browser Rendering), callback auth, UI trigger/status for study capture runs.
5. **Public screenshot delivery** — configure public screenshot URLs or signed delivery so VLM judging works outside local captures.
6. **Stripe per-study pricing** and email notifications for study completion.

### Deferred
- Open evaluator marketplace and prediction market with real money.
- Enterprise SSO and analytics integrations for outcome verification.
- Mobile SDK and video-interview evaluation modalities.
- Categories beyond SaaS/devtool landing + onboarding flows.
- Supervised ranker promotion until label volume and screenshot-aware training clear the gate.

### Blocked
- **Taste model promotion gate** — expand real held-out labels toward 100–300 pairs; current DOM/mechanical features reached ~0.58 on 50-record holdout; keep `taste-linear-evidence-ranker-v0` comparison-only until gate passes (50+ holdout labels, 0.70 accuracy, +0.05 over mechanical baseline).

### Known gaps
- Promotion gate blocked on label volume and screenshot-aware training — pipeline code is shipped; model promotion is not.
- Mock agents only in production path — real LLM integration is the highest-impact product gap.
- Capture Worker is scaffold-complete but production bindings and end-to-end capture→VLM loop need operator configuration.
- `TASTE_RANKER_MODEL_JSON` should not be treated as promoted model until `promotionReadiness.ok` is true.
