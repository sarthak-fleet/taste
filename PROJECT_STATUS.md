# ShipRank — Project Status

**Product:** Pre-A/B testing for software teams (B2B: ShipRank, public wedge: Product Arena)
**Stack:** Vite + React SPA, Cloudflare Pages Functions, D1 (SQLite), Drizzle ORM, Tailwind v4

## Shipped (MVP v0.1)

- Marketing landing page with positioning and how-it-works
- Study creation wizard (product context, decision objective, 2–5 variants, launch)
- Customer dashboard (studies by status)
- Study detail view with brief and variant list
- AI agent evaluation pipeline (6 mock agents, structured JSON output, versioned runs)
- **Agent-first** evaluation: launch runs 6 AI agents only (no human cold-start)
- Optional human validation layer — add when matched evaluators exist
- Agent tournament matrix (agents × variants scores) with consensus and disagreement detection
- Human evaluator panel simulation with weighted consensus
- Simulation API: `POST /studies/:id/simulate` (agents | humans | full), `GET /studies/:id/simulation`
- Study detail UI: simulation panel with agent matrix and human panel
- Weighted variant ranking and confidence scoring
- Decision-grade report generation (executive rec, rankings, evidence, next test, decision memory)
- Product Arena: public battles, vote/predict, AI critique after vote, leaderboard
- Evaluator application form
- Admin overview dashboard
- D1 schema + seed data (demo workspace, agents, sample arena battle)

## Run locally

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed
pnpm build
pnpm dev:full   # API on :8788, Vite proxies /api
# Or: pnpm dev (frontend only, API needs dev:full)
```

## Planned next

- Real LLM agent integration (OpenAI-compatible via env `AI_API_KEY`)
- Auth (workspaces, team members) via better-auth
- Manual evaluator task UI with assignment tokens
- Admin report editing UI
- Outcome submission flow + reputation updates
- Stripe per-study pricing
- Variant screenshot/URL snapshotting
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
- No auth — single demo workspace (`ws-demo-001`)
- No payments
