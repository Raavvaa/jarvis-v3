import type { Env } from '../types';
import { MsgSvc } from '../services/messages';
import { PrefSvc } from '../services/preferences';
import { ContactSvc } from '../services/contacts';

export async function handleDataApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'POST' && path === '/api/data/history') {
    const body = await req.json() as { chatId: string; limit?: number };
    const msgs = new MsgSvc(env.DB);
    const h = await msgs.history(body.chatId, body.limit || 30);
    return json(h);
  }

  if (req.method === 'GET' && path === '/api/data/prefs') {
    const uid = url.searchParams.get('userId') || env.MY_TELEGRAM_ID;
    const prefs = new PrefSvc(env.DB);
    return json(await prefs.all(uid));
  }

  if (req.method === 'GET' && path === '/api/data/contacts') {
    return json(await new ContactSvc(env.DB).getAll());
  }

  if (req.method === 'POST' && path === '/api/data/save-message') {
    const body = await req.json() as { chatId: string; userId: string; userName: string; content: string; role: string; mediaType?: string; source?: string };
    const msgs = new MsgSvc(env.DB);
    await msgs.save({ chatId: body.chatId, userId: body.userId, userName: body.userName, role: body.role, content: body.content, mediaType: body.mediaType, source: body.source || 'userbot' });
    return json({ ok: true });
  }

  if (req.method === 'POST' && path === '/api/data/transcribe') {
    const buf = await req.arrayBuffer();
    const { transcribe } = await import('../services/whisper');
    const text = await transcribe(buf, env);
    return json({ text });
  }

  return new Response('Not Found', { status: 404 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
