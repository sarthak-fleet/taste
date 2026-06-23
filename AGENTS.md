# AGENTS.md — taste (ShipRank)

## Shared Fleet Standard

Also read and follow the shared fleet-level agent standard at `../AGENTS.md`. Treat this repository as owned product code: protect production stability, keep changes scoped, verify work, and record durable follow-up tasks when something remains incomplete or blocked.

## Project

- **Stack**: React 19, Vite, Hono, Drizzle, Cloudflare Pages/Workers/D1, AI evaluator agents.
- **Local dev**: `bun install` · `bun db:migrate:local` · `bun build && bun dev:full` (http://localhost:8788)
- **Active PRD**: archived at `docs/archive/taste-model-v1.md` (pipeline proof shipped; promotion blocked on label volume + screenshot-aware training).
- **Do not** touch D1 prod or taste capture queues with real user data without explicit approval.
