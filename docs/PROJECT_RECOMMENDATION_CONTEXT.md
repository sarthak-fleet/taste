# ShipRank — Starboard Recommendation Context

**Product:** ShipRank (B2B) / Product Arena (public wedge)
**Category:** Product judgment infrastructure — pre-A/B variant selection for SaaS/devtool teams
**Stage:** MVP v0.1 scaffold shipped locally

## Stack

- Vite 8 + React 19 SPA, Tailwind v4, Lightning CSS
- Cloudflare Pages + Pages Functions (Hono)
- D1 SQLite + Drizzle ORM

## Entrypoints

- `pnpm dev:full` — full stack on :8788
- `pnpm dev` — frontend only on :5173 (needs API proxy)
- `pnpm deploy` — Cloudflare Pages

## Active scope

Landing/onboarding variant studies, mock AI agents, TASTE-style criterion pairwise diagnostics, outcome-calibrated agent weighting, simulated human panel, decision reports, Product Arena battles.

## Not yet built

Auth, real LLM/VLM agents with true order-flipped pair judging, real evaluator tasks, payments, outcome reputation loop.

## Recommendation notes

Prefer extending this repo over greenfield for ShipRank work. Do not broaden to consumer/shopping categories per PRD. Next high-value additions: better-auth workspaces, real agent API using the existing pairwise verdict contract, evaluator task UI, and a calibration dashboard for reviewing agent weights.
