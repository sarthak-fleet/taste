# ShipRank — Project Status

**Product:** Pre-A/B testing for software teams (B2B: ShipRank, public wedge: Product Arena)
**Stack:** Vite + React SPA, Cloudflare Pages Functions, D1 (SQLite), Drizzle ORM, Tailwind v4  
**Last updated:** 2026-06-20

## Shipped (MVP v0.1)

- Marketing landing page with positioning and how-it-works
- Study creation wizard (product context, decision objective, 2–5 variants, launch)
- Customer dashboard (studies by status)
- Study detail view with brief and variant list
- AI agent evaluation pipeline (6 mock agents, structured JSON output, versioned runs)
- **Agent-first** evaluation: launch runs 6 AI agents only (no human cold-start)
- Optional human validation layer — add when matched evaluators exist
- Agent tournament matrix (agents × variants scores) with consensus and disagreement detection
- TASTE-style multi-dimensional preference diagnostics:
  - study-type criterion sets with objective-aware weighting
  - order-checked pairwise agent verdicts for every variant pair
  - criterion-level agreement, majority strength, and Condorcet-cycle detection
  - agent validity warnings for missing/weak evidence and cannot-judge cases
  - report calibration status against submitted outcomes when available
  - outcome-calibrated agent weighting across repeated studies
- Taste model v1 planning and data scaffolding:
  - screenshot capture CLI for desktop/mobile above-fold and full-page evidence
  - Web-TASTE capture queue runner that materializes repeatable A/B capture and pair commands
  - curated 10-pair SaaS/devtool seed queue, validated 20-pair expansion queue, plus queue structure/URL validator
  - 40-pair promotion queue captured and labeled locally, moving the curated set from 30 to 70 real labels
  - mechanical visual evidence manifest with overflow, clipped text, contrast, and image-load signals
  - pairwise dataset manifest builder for labelable Web-TASTE training examples
  - synthetic degradation pair generator for bootstrapping non-tie preference data
  - local pair review queue plus post-capture pair label applicator
  - pair-manifest collection audit for unlabeled, synthetic, and real label counts before export
  - deterministic mechanical Taste baseline that emits model-compatible `AgentOutput` / `PairwiseVerdict` data
  - JSONL exporter for labeled Taste pair manifests used by supervised training/eval
  - offline mechanical-risk pairwise accuracy eval for exported Taste JSONL
  - first local supervised linear pairwise ranker over exported mechanical features
  - deterministic train/holdout JSONL split and model-vs-baseline report workflow
  - explicit minimum heldout count support for promotion-gate splits
  - real-label readiness audit that blocks promotion on synthetic-only holdout data
  - optional runtime local ranker path via `TASTE_RANKER_MODEL_JSON`, with VLM and mechanical fallback
  - API storage for capture manifests plus launch-time baseline injection when visual evidence exists
  - separate Browser Rendering + R2 capture Worker scaffold for production URL capture
  - API trigger that asks the capture Worker to snapshot a study's URL variants
  - production capture Worker runbook with preflight, env vars, deploy, and smoke commands
  - VLM-ready visual judge integration that runs when configured with public screenshot URLs, otherwise falls back to the mechanical baseline
- Human evaluator panel simulation with weighted consensus
- Simulation API: `POST /studies/:id/simulate` (agents | humans | full), `GET /studies/:id/simulation`
- Study detail UI: simulation panel with agent matrix and human panel
- Weighted variant ranking and confidence scoring
- Decision-grade report generation (executive rec, rankings, evidence, next test, decision memory)
- Report signal-quality section with strongest/weakest criteria, low-confidence pairs, and validity warnings
- Product Arena: public battles, vote/predict, AI critique after vote, leaderboard
- Evaluator application form
- Admin overview dashboard
- D1 schema + seed data (demo workspace, agents, sample arena battle)
- **SaaS Maker auth hub (2026-06-20):** device-flow helper for fleet Cockpit auth (`connect` / token storage); replaces demo-only workspace assumption for fleet operators.

## Run locally

```bash
bun install
bun run db:migrate:local
bun run db:seed
bun run build
bun run dev:full   # API on :8788, Vite proxies /api
# Or: bun run dev (frontend only, API needs dev:full)
```

## Planned next

- Real LLM agent integration (OpenAI-compatible via env `AI_API_KEY`)
- Manual evaluator task UI with assignment tokens
- Admin report editing UI
- Outcome submission flow + reputation updates
- Stripe per-study pricing
- Deploy/configure production capture Worker bindings and callback auth
- UI trigger/status for study capture runs
- Public screenshot URL configuration for VLM judging, or signed image delivery if screenshots stay private
- Expand real held-out labels beyond the 70-pair promotion queue toward 100-300 pairs
- Add screenshot-aware features/modeling; DOM/mechanical features alone reached only 0.58 holdout accuracy on the 50-record promotion holdout
- Keep `taste-linear-evidence-ranker-v0` comparison-only; latest local report is 0.58 holdout accuracy vs 0.34 mechanical baseline on 50 heldout labels
- Email notifications

## Deferred / parked

- Open evaluator marketplace
- Prediction market with money
- Enterprise SSO
- Analytics integrations for outcome verification
- Mobile SDK, video interviews
- Categories beyond SaaS/devtool landing + onboarding

## Known shortcuts (intentional MVP)

- Human evaluations are simulated on launch (not real recruited panel)
- AI agents use deterministic mock scoring (structure matches production schema)
- Pairwise order-bias checks are simulated; real LLM/VLM integration should run both display orders and count order-inconsistent judgments as ties/low confidence
- Fleet auth via SaaS Maker device flow for operators; product workspaces/team members still planned
- No payments
