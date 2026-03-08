// ============================================
// JARVIS Worker v3 — Точка входа
// ============================================

import type { Env, TelegramUpdate } from './types';
import { handleWebhook } from './handlers/webhook';
import { handleApiRequest } from './api/queue';
import { handleCron } from './cron';
import { TelegramService } from './services/telegram';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ========================================
    // /webhook — Telegram Bot Webhook
    // ========================================
    if (request.method === 'POST' && path === '/webhook') {
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      try {
        const update = (await request.json()) as TelegramUpdate;
        return handleWebhook(update, env, ctx);
      } catch {
        return new Response('Bad Request', { status: 400 });
      }
    }

    // ========================================
    // /api/* — API для юзербота
    // ========================================
    if (path.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // ========================================
    // /setup — Установка вебхука
    // ========================================
    if (path === '/setup') {
      const tg = new TelegramService(env);
      const ok = await tg.setWebhook(`${url.origin}/webhook`, env.WEBHOOK_SECRET);
      const me = await tg.getMe();
      return Response.json({ ok, webhook: `${url.origin}/webhook`, bot: me });
    }

    // ========================================
    // /health
    // ========================================
    if (path === '/health') {
      let dbOk = false;
      try { await env.DB.prepare('SELECT 1').run(); dbOk = true; } catch {}
      return Response.json({ status: 'alive', db: dbOk, v: '3.0.0', t: new Date().toISOString() });
    }

    return Response.json({
      name: 'JARVIS v3',
      endpoints: ['/webhook', '/api/*', '/setup', '/health'],
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};
