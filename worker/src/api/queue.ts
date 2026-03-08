// ============================================
// API для юзербота: очередь команд + данные
// ============================================

import type { Env } from '../types';
import { QueueService } from '../services/queue';
import { MessagesService } from '../services/messages';
import { PreferencesService } from '../services/preferences';
import { ContactsService } from '../services/contacts';
import { RemindersService } from '../services/reminders';
import { GroqService } from '../services/groq';
import { buildUserbotSystemPrompt, USERBOT_MODEL } from '../config';
import { safeJsonParse } from '../utils/helpers';
import { parseDateTime } from '../utils/date-parser';
import { transcribeAudio } from '../services/whisper';
import type { LLMActionResponse, GroqMessage } from '../types';

/**
 * Обрабатывает запросы от юзербота
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  // Авторизация
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.WORKER_API_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // ========================================
  // GET /api/queue/pending — получить команды
  // ========================================
  if (request.method === 'GET' && path === '/api/queue/pending') {
    const queue = new QueueService(env.DB);
    const pending = await queue.getPending(10);
    return json(pending);
  }

  // ========================================
  // POST /api/queue/complete — отметить выполненной
  // ========================================
  if (request.method === 'POST' && path === '/api/queue/complete') {
    const { id, result, error } = await request.json() as { id: number; result?: string; error?: string };
    const queue = new QueueService(env.DB);
    if (error) await queue.markError(id, error);
    else await queue.markDone(id, result);
    return json({ ok: true });
  }

  // ========================================
  // POST /api/chat — юзербот просит сгенерировать ответ
  // ========================================
  if (request.method === 'POST' && path === '/api/chat') {
    const body = await request.json() as {
      chatId: string;
      userId: string;
      userName: string;
      text: string;
      isPrivate: boolean;
      chatTitle?: string;
    };

    return await handleUserbotChat(body, env);
  }

  // ========================================
  // POST /api/transcribe — транскрибация аудио
  // ========================================
  if (request.method === 'POST' && path === '/api/transcribe') {
    const audioBuffer = await request.arrayBuffer();
    const text = await transcribeAudio(audioBuffer, env);
    return json({ text });
  }

  // ========================================
  // POST /api/messages/save — сохранить сообщение
  // ========================================
  if (request.method === 'POST' && path === '/api/messages/save') {
    const body = await request.json() as {
      chatId: string; userId: string; userName: string;
      content: string; role: string; mediaType?: string;
      mediaFileId?: string; caption?: string;
    };
    const msgs = new MessagesService(env.DB);
    await msgs.save({
      chatId: body.chatId,
      userId: body.userId,
      userName: body.userName,
      role: body.role as 'user' | 'assistant',
      content: body.content,
      mediaType: body.mediaType,
      mediaFileId: body.mediaFileId,
      caption: body.caption,
      source: 'userbot',
    });
    return json({ ok: true });
  }

  // ========================================
  // GET /api/messages/history — история чата
  // ========================================
  if (request.method === 'GET' && path === '/api/messages/history') {
    const chatId = url.searchParams.get('chatId');
    if (!chatId) return json({ error: 'chatId required' }, 400);
    const msgs = new MessagesService(env.DB);
    const history = await msgs.getHistory(chatId, 30);
    return json(history);
  }

  // ========================================
  // GET /api/preferences — все предпочтения
  // ========================================
  if (request.method === 'GET' && path === '/api/preferences') {
    const userId = url.searchParams.get('userId') || env.MY_TELEGRAM_ID;
    const prefs = new PreferencesService(env.DB);
    const all = await prefs.getAll(userId);
    return json(all);
  }

  // ========================================
  // GET /api/contacts — все контакты
  // ========================================
  if (request.method === 'GET' && path === '/api/contacts') {
    const contacts = new ContactsService(env.DB);
    const all = await contacts.getAll();
    return json(all);
  }

  // ========================================
  // GET /api/chat-settings — настройки чата
  // ========================================
  if (request.method === 'GET' && path === '/api/chat-settings') {
    const chatId = url.searchParams.get('chatId');
    if (!chatId) return json({ error: 'chatId required' }, 400);
    try {
      const r = await env.DB.prepare(
        `SELECT * FROM chat_settings WHERE chat_id = ?`
      ).bind(chatId).first();
      return json(r || { is_silent: 0, is_active: 1, ignore_users: '[]' });
    } catch {
      return json({ is_silent: 0, is_active: 1, ignore_users: '[]' });
    }
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * Генерация ответа для юзербота через LLM
 */
async function handleUserbotChat(
  body: {
    chatId: string;
    userId: string;
    userName: string;
    text: string;
    isPrivate: boolean;
    chatTitle?: string;
  },
  env: Env
): Promise<Response> {
  const msgs = new MessagesService(env.DB);
  const prefs = new PreferencesService(env.DB);
  const contacts = new ContactsService(env.DB);
  const queue = new QueueService(env.DB);
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);

  // Собираем контекст
  const userPrefs = await prefs.getAll(env.MY_TELEGRAM_ID);
  const allContacts = await contacts.getAll();

  let mode = 'default';
  try {
    const mr = await env.DB.prepare(`SELECT mode FROM chat_modes WHERE chat_id = ?`)
      .bind(body.chatId).first<{ mode: string }>();
    mode = mr?.mode || 'default';
  } catch {}

  const history = await msgs.getHistory(body.chatId, 30);
  const groqHistory = msgs.convertToGroqMessages(history);

  const systemPrompt = buildUserbotSystemPrompt(
    userPrefs,
    allContacts.map(c => ({
      nickname: c.nickname || undefined,
      role: c.role || undefined,
      username: c.username || undefined,
      first_name: c.first_name || undefined,
    })),
    mode,
    body.isPrivate,
    body.chatTitle
  );

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    ...groqHistory.slice(-28),
    { role: 'user', content: body.text },
  ];

  const groq = new GroqService(env);
  const rawResponse = await groq.getCompletion(messages, USERBOT_MODEL);

  let parsed = safeJsonParse<LLMActionResponse>(rawResponse);
  if (!parsed) {
    parsed = { reply: rawResponse, actions: [] };
  }

  // Выполняем действия
  if (parsed.actions) {
    for (const action of parsed.actions) {
      switch (action.type) {
        case 'save_preference':
          if (action.key && action.value) {
            await prefs.set(env.MY_TELEGRAM_ID, action.key, action.value);
          }
          break;

        case 'set_reminder': {
          let remindAt = action.remind_at;
          if (!remindAt || !remindAt.includes('T')) {
            remindAt = parseDateTime(action.text || body.text, tz) || undefined;
          }
          if (remindAt && action.text) {
            const reminders = new RemindersService(env.DB);
            await reminders.create({
              userId: env.MY_TELEGRAM_ID,
              chatId: body.chatId,
              text: action.text,
              remindAt,
              source: 'userbot',
            });
          }
          break;
        }

        case 'change_mode':
          if (action.mode) {
            await env.DB.prepare(
              `INSERT INTO chat_modes (chat_id, mode, updated_at) VALUES (?, ?, datetime('now'))
               ON CONFLICT(chat_id) DO UPDATE SET mode = ?, updated_at = datetime('now')`
            ).bind(body.chatId, action.mode, action.mode).run().catch(() => {});
          }
          break;

        case 'save_contact':
          if (action.contact) {
            await contacts.upsert({
              telegram_id: action.contact.telegram_id || undefined,
              username: action.contact.username || undefined,
              first_name: action.contact.first_name || undefined,
              role: action.contact.role || undefined,
              nickname: action.contact.nickname || undefined,
              notes: action.contact.notes || undefined,
            });
          }
          break;

        case 'queue_command':
          if (action.command) {
            await queue.enqueue(action.command);
          }
          break;

        case 'set_silent': {
          const silent = action.silent ? 1 : 0;
          await env.DB.prepare(
            `INSERT INTO chat_settings (chat_id, is_silent, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(chat_id) DO UPDATE SET is_silent = ?, updated_at = datetime('now')`
          ).bind(body.chatId, silent, silent).run().catch(() => {});
          break;
        }

        case 'ignore_user':
          if (action.ignore_user_id) {
            try {
              const existing = await env.DB.prepare(
                `SELECT ignore_users FROM chat_settings WHERE chat_id = ?`
              ).bind(body.chatId).first<{ ignore_users: string }>();

              const list: string[] = existing?.ignore_users
                ? JSON.parse(existing.ignore_users)
                : [];

              if (!list.includes(action.ignore_user_id)) {
                list.push(action.ignore_user_id);
              }

              await env.DB.prepare(
                `INSERT INTO chat_settings (chat_id, ignore_users, updated_at) VALUES (?, ?, datetime('now'))
                 ON CONFLICT(chat_id) DO UPDATE SET ignore_users = ?, updated_at = datetime('now')`
              ).bind(body.chatId, JSON.stringify(list), JSON.stringify(list)).run();
            } catch {}
          }
          break;
      }
    }
  }

  return json({
    reply: parsed.reply,
    mood: parsed.mood,
    suggestion: parsed.suggestion,
    actions: parsed.actions,
  });
}

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
