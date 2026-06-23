import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import * as schema from '../../src/db/schema';
import { adminRouter } from './routes/admin';
import { arenaRouter } from './routes/arena';
import { evaluatorsRouter } from './routes/evaluators';
import { studiesRouter } from './routes/studies';
import { withTiming } from '../_lib/timing';

export interface Env {
  DB: D1Database;
  TASTE_CAPTURE_WORKER_URL?: string;
  TASTE_CAPTURE_WORKER_TOKEN?: string;
  TASTE_VISUAL_EVIDENCE_TOKEN?: string;
  TASTE_VLM_API_BASE?: string;
  TASTE_VLM_API_KEY?: string;
  TASTE_VLM_MODEL?: string;
  TASTE_RANKER_MODEL_JSON?: string;
}

function createApi() {
  const api = new Hono<{ Bindings: Env }>();

  api.use('*', cors());
  api.get('/health', (c) => c.json({ ok: true, service: 'shiprank' }));

  api.use('*', async (c, next) => {
    const db = drizzle(c.env.DB, { schema });
    c.set('db', db);
    await next();
  });

  api.route('/studies', studiesRouter);
  api.route('/arena', arenaRouter);
  api.route('/admin', adminRouter);
  api.route('/evaluators', evaluatorsRouter);

  return api;
}

const app = new Hono<{ Bindings: Env }>();
const api = createApi();
// Cloudflare Pages strips /api from functions/api/* — mount at root
app.route('/', api);
// Also mount at /api for vite proxy and direct /api/* requests
app.route('/api', api);

export const onRequest = withTiming(handle(app));
