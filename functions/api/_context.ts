import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../../src/db/schema";

export type Db = DrizzleD1Database<typeof schema>;

declare module "hono" {
  interface ContextVariableMap {
    db: Db;
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return json({ error: message }, { status: 404 });
}
