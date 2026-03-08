import type { Env } from '../types';
import { QueueSvc } from '../services/queue';

export async function handleQueueApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/queue/poll') {
    const q = new QueueSvc(env.DB);
    const items = await q.pending(10);
    return json(items);
  }

  if (req.method === 'POST' && path === '/api/queue/push') {
    const body = await req.json() as { id: number; result?: string; error?: string };
    const q = new QueueSvc(env.DB);
    if (body.error) await q.markError(body.id, body.error);
    else await q.markDone(body.id, body.result);
    return json({ ok: true });
  }

  return new Response('Not Found', { status: 404 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
