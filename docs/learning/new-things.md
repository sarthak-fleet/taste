# New things to learn — taste (ShipRank)

Multi-AI-evaluator architecture, Hono on CF Pages Functions, and Drizzle on D1 — all novel here.

---

## Multi-evaluator agent panel with weighted agreement synthesis
- What: Multiple persona-agents (UX Clarity, Skeptical Buyer, Conversion Funnel, etc.) each score variants independently on a shared `DimensionScores` schema, then a separate synthesis step resolves their ranked picks into a final `agentAgreement` ratio.
- Why here: TBD
- Gotcha (from code): `focusAreas` on each `AgentDefinition` is persona metadata used for recommendation copy (`agents.ts:203`) — every agent scores all 9 dimensions (`agents.ts:90–100`); the `Partial<DimensionScores>` type is cosmetic. The synthesis in `simulation.ts:108` averages over a full 9-key vector for every agent.
- Source: TBD (no standard paper; closest reference is LLM-as-judge literature — https://arxiv.org/abs/2306.05685)

---

## Multi-dimensional preference signal diagnostics
- What: Pairwise/ranking preference data can be checked with Kendall-style rater agreement, majority-vote strength, and Condorcet-cycle detection before treating it as learnable signal.
- Why here: TBD
- Gotcha (from code): ShipRank now stores order-checked pairwise verdicts in simulation/report JSON; weak majority strength or criterion cycles downgrade report confidence instead of only changing the final score.
- Source: https://arxiv.org/abs/2605.20731

---

## Dynamic scoring weights by study type + validation mode
- What: Weight vector (targetUser / expert / agent / taskCompletion / prediction) shifts based on both `studyType` and whether human validation has been collected yet.
- Why here: TBD
- Gotcha (from code): `AGENT_FIRST_WEIGHTS` assigns agent `0.55` (`scoring.ts:39`); the switch trigger is `humanPreds.length > 0` (`pipeline.ts:46`) — a single human `predictions` row (source=`"human"`) flips the entire weight set and can reorder all variant rankings.
- Source: TBD

---

## Hono on Cloudflare Pages Functions (not Workers)
- What: Hono app mounted inside a CF Pages `functions/api/[[route]].ts` catch-all, exported as `onRequest` via `hono/cloudflare-pages` `handle()`.
- Why here: TBD
- Gotcha (from code): CF Pages does NOT strip the `/api` prefix — the function receives the full path. The dual-mount (`[[route]].ts:38–40`) at both `/` and `/api` is required because the wrangler local runtime and the Vite proxy hit different path shapes; the comment at line 37 explains the intent.
- Source: https://hono.dev/docs/getting-started/cloudflare-pages

---

## Drizzle ORM on Cloudflare D1
- What: Drizzle wraps D1's SQLite-compatible binding (`drizzle(c.env.DB)`) using `drizzle-orm/d1`; schema is defined with `sqliteTable`.
- Why here: TBD
- Gotcha (from code): D1 does support transactions via `db.batch()` (transactional by spec), but the study-create persist loop (`studies.ts:134–147`) uses sequential `await db.insert(...)` calls instead — so a mid-loop failure leaves the study row without variants. No code here uses `batch()`.
- Source: https://orm.drizzle.team/docs/get-started/d1-new

---

## Vite proxy + wrangler pages dev for full-stack local dev
- What: Vite runs on :5173 and proxies `/api` to wrangler's local Pages runtime on :8788 which serves the built `dist/` with real D1 bindings.
- Why here: TBD
- Gotcha (from code): `vite.config.ts:11–14` proxies without `rewrite`, so `/api/studies` reaches wrangler as `/api/studies` — matching the `/api` mount in `[[route]].ts:40`. Running `vite` alone (no wrangler) means all API calls return 502.
- Source: https://developers.cloudflare.com/pages/functions/local-development/

---

## TanStack Query v5 for server-state in a Hono/CF-Pages app
- What: `useQuery` / `useMutation` from `@tanstack/react-query` manage all async API state — no Redux, no hand-rolled loading flags. Mutations invalidate query keys to trigger re-fetches.
- Why here: TBD
- Gotcha (from code): TanStack Query v5 dropped the `onSuccess`/`onError` callbacks on `useQuery`; side-effects must move to `useMutation.onSuccess` or `useEffect` watching `data`. `ArenaBattle.tsx:41` uses the v5 mutation API correctly.
- Source: https://tanstack.com/query/v5/docs/framework/react/guides/mutations

---

## React 19 with @vitejs/plugin-react-swc
- What: React 19 compiled via SWC (not Babel) — faster HMR, native React 19 compiler support possible.
- Why here: TBD
- Source: https://react.dev/blog/2024/12/05/react-19

---

## Tailwind CSS v4 as a Vite plugin with LightningCSS
- What: Tailwind v4 ships as a first-party Vite plugin (`@tailwindcss/vite`) and delegates CSS minification entirely to LightningCSS — no `tailwind.config.js` needed.
- Why here: TBD
- Source: https://tailwindcss.com/blog/tailwindcss-v4
