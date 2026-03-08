import type { Env } from '../types';
import { MsgSvc } from '../services/messages';
import { PrefSvc } from '../services/preferences';
import { ContactSvc } from '../services/contacts';
import { RemSvc } from '../services/reminders';
import { transcribe } from '../services/whisper';

export async function handleDataApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // ── History ──────────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/data/history') {
    const body = await req.json() as { chatId: string; limit?: number };
    const msgs = new MsgSvc(env.DB);
    return ok(await msgs.history(body.chatId, body.limit || 30));
  }

  // ── Prefs ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/data/prefs') {
    const uid = url.searchParams.get('userId') || env.MY_TELEGRAM_ID;
    return ok(await new PrefSvc(env.DB).all(uid));
  }

  if (req.method === 'POST' && path === '/api/data/set-pref') {
    const body = await req.json() as { userId: string; key: string; value: string };
    await new PrefSvc(env.DB).set(body.userId || env.MY_TELEGRAM_ID, body.key, body.value);
    return ok({ ok: true });
  }

  if (req.method === 'POST' && path === '/api/data/delete-pref') {
    const body = await req.json() as { userId: string; key: string };
    const deleted = await new PrefSvc(env.DB).del(body.userId || env.MY_TELEGRAM_ID, body.key);
    return ok({ ok: true, deleted });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/data/contacts') {
    return ok(await new ContactSvc(env.DB).getAll());
  }

  if (req.method === 'POST' && path === '/api/data/save-contact') {
    const body = await req.json() as Record<string, string>;
    await new ContactSvc(env.DB).upsert(body);
    return ok({ ok: true });
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/data/create-reminder') {
    const body = await req.json() as { userId: string; chatId: string; remindAt: string; remindText: string };
    await new RemSvc(env.DB).create({
      userId: body.userId || env.MY_TELEGRAM_ID,
      chatId: body.chatId,
      text: body.remindText,
      remindAt: body.remindAt,
      source: 'userbot',
    });
    return ok({ ok: true });
  }

  // ── Block / Unblock ───────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/data/block-user') {
    const body = await req.json() as { chatId: string; userId: string; blockedBy: string };
    await env.DB.prepare(
      'INSERT OR IGNORE INTO blocked_users (chat_id, user_id, blocked_by) VALUES (?,?,?)'
    ).bind(body.chatId, body.userId, body.blockedBy || env.MY_TELEGRAM_ID).run().catch(() => {});
    return ok({ ok: true });
  }

  if (req.method === 'POST' && path === '/api/data/unblock-user') {
    const body = await req.json() as { chatId: string; userId: string };
    await env.DB.prepare(
      'DELETE FROM blocked_users WHERE chat_id=? AND user_id=?'
    ).bind(body.chatId, body.userId).run().catch(() => {});
    return ok({ ok: true });
  }

  // ── Save message ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/data/save-message') {
    const body = await req.json() as {
      chatId: string; userId: string; userName: string;
      content: string; role: string; mediaType?: string; source?: string;
    };
    const msgs = new MsgSvc(env.DB);
    await msgs.save({
      chatId: body.chatId,
      userId: body.userId,
      userName: body.userName,
      role: body.role,
      content: body.content,
      mediaType: body.mediaType,
      source: body.source || 'userbot',
    });
    return ok({ ok: true });
  }

  // ── Transcribe ────────────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/api/data/transcribe') {
    const buf = await req.arrayBuffer();
    const text = await transcribe(buf, env);
    return ok({ text });
  }

  return new Response('Not Found', { status: 404 });
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
