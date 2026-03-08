import type { Env, TgUpdate } from './types';
import { handleWebhook } from './handlers/webhook';
import { handleQueueApi } from './api/queue';
import { handleDataApi } from './api/data';
import { handleCron } from './cron';
import { TgSvc } from './services/telegram';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Webhook
    if (req.method === 'POST' && path === '/webhook') {
      const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });
      try {
        const update = (await req.json()) as TgUpdate;
        return handleWebhook(update, env, ctx);
      } catch { return new Response('Bad Request', { status: 400 }); }
    }

    // API (protected)
    if (path.startsWith('/api/')) {
      const auth = req.headers.get('Authorization');
      if (auth !== `Bearer ${env.WORKER_API_SECRET}`) return new Response('Unauthorized', { status: 401 });
      if (path.startsWith('/api/queue/')) return handleQueueApi(req, env);
      if (path.startsWith('/api/data/')) return handleDataApi(req, env);
      return new Response('Not Found', { status: 404 });
    }

    // Setup webhook
    if (path === '/setup') {
      const tg = new TgSvc(env);
      const ok = await tg.setWebhook(`${url.origin}/webhook`, env.WEBHOOK_SECRET);
      const me = await tg.getMe();
      return Response.json({ ok, webhook: `${url.origin}/webhook`, bot: me });
    }

    // Health
    if (path === '/health') {
      let db = false;
      try { await env.DB.prepare('SELECT 1').run(); db = true; } catch {}
      return Response.json({ status: 'alive', db, v: '4.0.0', t: new Date().toISOString() });
    }

    return Response.json({ name: 'JARVIS v4', endpoints: ['/webhook', '/api/*', '/setup', '/health'] });
  },

  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};
