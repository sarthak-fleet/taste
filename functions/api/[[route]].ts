import { Hono } from "hono";
import { cors } from "hono/cors";
import { handle } from "hono/cloudflare-pages";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../src/db/schema";
import { studiesRouter } from "./routes/studies";
import { arenaRouter } from "./routes/arena";
import { adminRouter } from "./routes/admin";
import { evaluatorsRouter } from "./routes/evaluators";

export interface Env {
  DB: D1Database;
}

function createApi() {
  const api = new Hono<{ Bindings: Env }>();

  api.use("*", cors());
  api.get("/health", (c) => c.json({ ok: true, service: "shiprank" }));

  api.use("*", async (c, next) => {
    const db = drizzle(c.env.DB, { schema });
    c.set("db", db);
    await next();
  });

  api.route("/studies", studiesRouter);
  api.route("/arena", arenaRouter);
  api.route("/admin", adminRouter);
  api.route("/evaluators", evaluatorsRouter);

  return api;
}

const app = new Hono<{ Bindings: Env }>();
const api = createApi();
// Cloudflare Pages strips /api from functions/api/* — mount at root
app.route("/", api);
// Also mount at /api for vite proxy and direct /api/* requests
app.route("/api", api);

export const onRequest = handle(app);
