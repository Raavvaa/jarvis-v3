import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import { CFG } from './config.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKER = CFG.workerUrl;
const HEADERS = {
  'Authorization': `Bearer ${CFG.workerSecret}`,
  'Content-Type': 'application/json',
};
const TRIGGERS = ['джарвис', 'jarvis', 'бро', 'братан'];
const TRIGGER_CMDS = ['/j', '/ask'];

// ─── In-memory state ──────────────────────────────────────────────────────────

// Auto-reply mode: chatId → true/false
const autoReplyChats = new Map<string, boolean>();

// Allowed users: Set of userIds that can use Jarvis in DM with owner
const allowedUsers = new Set<string>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  telegram_id?: string; username?: string; first_name?: string;
  last_name?: string; role?: string; nickname?: string; notes?: string;
}
interface UserbotCmd {
  type: string;
  chatId?: string | number;
  text?: string;
  messageId?: number;
  userId?: number;
  fromChatId?: string | number;
  toChatId?: string | number;
}
interface Action {
  type: string;
  key?: string;
  value?: string;
  remind_at?: string;
  remind_text?: string;
  contact?: Contact;
  block_user_id?: string;
  chat_id?: string;
  mode?: string;
  userbot?: UserbotCmd;
}
interface LLMResponse { reply: string; actions: Action[]; }
interface HistoryItem {
  role: string; content: string; user_name?: string;
  transcription?: string; media_type?: string; caption?: string;
}

// ─── Worker API ───────────────────────────────────────────────────────────────

async function workerPost(path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${WORKER}${path}`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) { console.warn(`[API] POST ${path} → ${res.status}`); return null; }
    return res.json();
  } catch (e) { console.error(`[API] POST ${path}:`, (e as Error).message); return null; }
}

async function workerGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${WORKER}${path}`, { headers: HEADERS });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

const getHistory = (chatId: string) =>
  workerPost('/api/data/history', { chatId, limit: 30 }) as Promise<HistoryItem[]>;

const getPrefs = () =>
  workerGet(`/api/data/prefs?userId=${CFG.myId}`) as Promise<Record<string, string>>;

const getContacts = () =>
  workerGet('/api/data/contacts') as Promise<Contact[]>;

async function saveMessage(data: {
  chatId: string; userId: string; userName: string;
  content: string; role: string; mediaType?: string; source?: string;
}): Promise<void> {
  await workerPost('/api/data/save-message', data);
}

// ─── Trigger check ────────────────────────────────────────────────────────────

function checkTrigger(text: string): { hit: boolean; clean: string } {
  const lo = text.toLowerCase().trim();
  for (const c of TRIGGER_CMDS) {
    if (lo.startsWith(c + ' ') || lo === c) {
      return { hit: true, clean: text.slice(c.length).replace(/^\s+/, '') };
    }
  }
  for (const t of TRIGGERS) {
    if (lo.startsWith(t)) {
      const after = text.slice(t.length).replace(/^[,:\s]+/, '').trim();
      return { hit: true, clean: after || text };
    }
  }
  return { hit: false, clean: text };
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

async function callGroq(messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const k1 = process.env.GROQ_API_KEY || '';
  const k2 = process.env.GROQ_API_KEY_2 || '';

  const call = async (key: string, model: string): Promise<string> => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json() as any;
    return d.choices?.[0]?.message?.content || '';
  };

  // Models in priority order — fast fallbacks on rate limit
  const attempts = [
    () => call(k1, 'llama-3.3-70b-versatile'),
    () => call(k2, 'llama-3.3-70b-versatile'),
    () => call(k1, 'llama-3.1-8b-instant'),
    () => call(k2, 'llama-3.1-8b-instant'),
    () => call(k1, 'compound-beta'),
  ];

  for (const fn of attempts) {
    try { return await fn(); }
    catch (e) { console.warn('[Groq] fallback:', (e as Error).message.slice(0, 40)); }
  }
  return null;
}

function parseGroq(raw: string): LLMResponse {
  // Strip markdown code fences
  let clean = raw.trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find first { to last } — handles extra text around JSON
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(clean) as LLMResponse;
    // Validate structure
    if (typeof parsed.reply === 'string') {
      if (!Array.isArray(parsed.actions)) parsed.actions = [];
      // Fix: remove placeholder chatIds from examples
      parsed.actions = parsed.actions.filter(a => {
        if (a.type === 'userbot_cmd' && a.userbot?.chatId) {
          const cid = String(a.userbot.chatId);
          if (cid === '-100xxx' || cid === 'xxx' || cid === '0') return false;
        }
        return true;
      });
      return parsed;
    }
  } catch {}

  // Fallback: treat whole response as plain text reply
  return { reply: raw.length > 500 ? raw.slice(0, 500) + '...' : raw, actions: [] };
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(opts: {
  isGroup: boolean;
  chatTitle: string;
  chatId: string;
  prefs: Record<string, string>;
  contacts: Contact[];
  isAllowedUser?: boolean;
  allowedUserName?: string;
}): string {
  const prefsStr = Object.entries(opts.prefs).length > 0
    ? '\n\nЧТО Я ЗНАЮ О ХОЗЯИНЕ:\n' + Object.entries(opts.prefs).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    : '';
  const contactsStr = opts.contacts.length > 0
    ? '\n\nКОНТАКТЫ ХОЗЯИНА:\n' + opts.contacts.map(c =>
        `• ${c.nickname || c.first_name || '?'}${c.username ? ' (@' + c.username + ')' : ''}${c.role ? ' — ' + c.role : ''}`
      ).join('\n')
    : '';

  const chatContext = opts.isGroup
    ? `Сейчас ты в групповом чате: "${opts.chatTitle}". ChatID: ${opts.chatId}`
    : opts.isAllowedUser
      ? `Сейчас с тобой общается ${opts.allowedUserName} — доверенный контакт хозяина. Отвечай ему вежливо, но не раскрывай личные данные хозяина.`
      : `Сейчас ты в Избранных (личный чат хозяина).`;

  return `Ты — Джарвис, персональный ИИ-ассистент Равиля. Как Джарвис у Тони Старка — умный, преданный, с юмором. Называй хозяина "сэр".
Ты работаешь ЧЕРЕЗ АККАУНТ хозяина в Telegram. Когда пишешь — сообщение идёт от его имени.
${chatContext}
${prefsStr}${contactsStr}

ВАЖНО: В примерах ниже chatId "-100xxx" — это ЗАГЛУШКА. Никогда не используй её в actions!
Реальный chatId текущего чата: ${opts.chatId}

═══ ДОСТУПНЫЕ ДЕЙСТВИЯ ═══

1. Написать кому-то в ЛС:
{"type":"userbot_cmd","userbot":{"type":"send_message","chatId":"@username","text":"текст"}}

2. Написать в текущий чат (от имени хозяина):
{"type":"userbot_cmd","userbot":{"type":"send_message","chatId":"${opts.chatId}","text":"текст"}}

3. Записать в Избранное:
{"type":"userbot_cmd","userbot":{"type":"send_to_saved","text":"текст"}}

4. Удалить сообщение:
{"type":"userbot_cmd","userbot":{"type":"delete_message","chatId":"${opts.chatId}","messageId":123}}

5. Кикнуть пользователя:
{"type":"userbot_cmd","userbot":{"type":"kick_user","chatId":"${opts.chatId}","userId":123456}}

6. Забанить пользователя:
{"type":"userbot_cmd","userbot":{"type":"ban_user","chatId":"${opts.chatId}","userId":123456}}

7. Назначить/снять админа:
{"type":"userbot_cmd","userbot":{"type":"promote_admin","chatId":"${opts.chatId}","userId":123456}}
{"type":"userbot_cmd","userbot":{"type":"demote_admin","chatId":"${opts.chatId}","userId":123456}}

8. Список участников:
{"type":"userbot_cmd","userbot":{"type":"get_chat_members","chatId":"${opts.chatId}"}}

9. Запомнить факт:
{"type":"save_pref","key":"ключ","value":"значение"}

10. Забыть факт:
{"type":"delete_pref","key":"ключ"}

11. Напоминание:
{"type":"set_reminder","remind_at":"ISO UTC время","remind_text":"текст"}

12. Сохранить контакт:
{"type":"save_contact","contact":{"username":"ник","first_name":"имя","role":"роль","nickname":"прозвище"}}

═══ ПРИМЕРЫ ═══

"напиши @fade привет братан"
→ {"reply":"Написал, сэр.","actions":[{"type":"userbot_cmd","userbot":{"type":"send_message","chatId":"@fade","text":"Привет братан"}}]}

"напиши ему что я задержусь" (в чате с другом)
→ {"reply":"Написал, сэр.","actions":[{"type":"userbot_cmd","userbot":{"type":"send_message","chatId":"${opts.chatId}","text":"Я задержусь"}}]}

"запиши в избранное встреча в 15:00"
→ {"reply":"Записал, сэр.","actions":[{"type":"userbot_cmd","userbot":{"type":"send_to_saved","text":"встреча в 15:00"}}]}

"запомни что мой партнёр Влад"
→ {"reply":"Запомнил, сэр.","actions":[{"type":"save_pref","key":"партнёр","value":"Влад"}]}

"напомни через час позвонить"
→ {"reply":"Напомню, сэр.","actions":[{"type":"set_reminder","remind_at":"${new Date(Date.now()+3600000).toISOString()}","remind_text":"позвонить"}]}

═══ ПРАВИЛА ═══
1. ВСЕГДА отвечай ТОЛЬКО валидным JSON: {"reply":"...","actions":[...]}
2. Кратко — 1-2 предложения в reply
3. Никогда не используй chatId "-100xxx" — это заглушка из примеров!
4. Если просят написать "ему" в текущем чате — используй chatId: "${opts.chatId}"
5. Если просят написать конкретному @username — используй этот username
6. Никому не раскрывай личные данные хозяина
7. Отвечай на языке собеседника
8. Если нет действий — "actions":[]

Время UTC: ${new Date().toISOString()}`;
}

// ─── Auto-reply prompt ────────────────────────────────────────────────────────

function buildAutoReplyPrompt(prefs: Record<string, string>, chatTitle: string): string {
  const prefsStr = Object.entries(prefs).length > 0
    ? '\nФакты о хозяине: ' + Object.entries(prefs).map(([k, v]) => `${k}=${v}`).join(', ')
    : '';
  return `Ты — Джарвис. Ты отвечаешь от имени Равиля в его стиле.
Равиль — молодой парень, общается неформально, кратко, по делу. Иногда использует "бро", "братан".
Чат: "${chatTitle}". ${prefsStr}
Отвечай ТОЛЬКО обычным текстом (не JSON), как ответил бы Равиль — кратко и по-дружески.
Время: ${new Date().toISOString()}`;
}

// ─── Execute actions ──────────────────────────────────────────────────────────

async function executeAction(client: TelegramClient, chatId: string, action: Action): Promise<void> {
  console.log(`[Action] ${action.type}`, JSON.stringify(action).slice(0, 120));

  switch (action.type) {
    case 'save_pref':
      if (action.key && action.value) {
        await workerPost('/api/data/set-pref', { userId: CFG.myId, key: action.key, value: action.value });
      }
      break;

    case 'delete_pref':
      if (action.key) {
        await workerPost('/api/data/delete-pref', { userId: CFG.myId, key: action.key });
      }
      break;

    case 'set_reminder':
      if (action.remind_at && action.remind_text) {
        await workerPost('/api/data/create-reminder', {
          userId: CFG.myId, chatId: action.chat_id || chatId,
          remindAt: action.remind_at, remindText: action.remind_text,
        });
      }
      break;

    case 'save_contact':
      if (action.contact) {
        await workerPost('/api/data/save-contact', action.contact);
      }
      break;

    case 'block_user':
      if (action.block_user_id) {
        await workerPost('/api/data/block-user', {
          chatId: action.chat_id || chatId,
          userId: action.block_user_id,
          blockedBy: CFG.myId,
        });
      }
      break;

    case 'unblock_user':
      if (action.block_user_id) {
        await workerPost('/api/data/unblock-user', {
          chatId: action.chat_id || chatId,
          userId: action.block_user_id,
        });
      }
      break;

    case 'userbot_cmd':
      if (action.userbot) {
        const { execute } = await import('./executor.js');
        const result = await execute(client, action.userbot.type, action.userbot as unknown as Record<string, unknown>);
        console.log(`[Action] result: ${result.slice(0, 100)}`);
      }
      break;

    default:
      console.warn(`[Action] unknown type: ${action.type}`);
  }
}

// ─── Send long message ────────────────────────────────────────────────────────

async function sendLong(client: TelegramClient, chatId: string, text: string): Promise<void> {
  if (text.length <= 4096) {
    await client.sendMessage(chatId, { message: text });
    return;
  }
  const parts: string[] = [];
  let cur = '';
  for (const p of text.split('\n\n')) {
    if ((cur + '\n\n' + p).length > 4000) { if (cur) parts.push(cur.trim()); cur = p; }
    else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) parts.push(cur.trim());
  for (const part of parts) {
    await client.sendMessage(chatId, { message: part });
    await new Promise(r => setTimeout(r, 300));
  }
}

// ─── Special owner commands ───────────────────────────────────────────────────

async function handleSpecialCommands(
  client: TelegramClient,
  chatId: string,
  text: string,
  senderId: string,
): Promise<boolean> {
  const lo = text.toLowerCase().trim();

  // "отвечай вместо меня" — включить автоответ в этом чате
  if (lo.includes('отвечай вместо меня') || lo.includes('отвечай за меня')) {
    autoReplyChats.set(chatId, true);
    await client.sendMessage(chatId, { message: '✅ Включил режим автоответа, сэр. Пишу вместо вас. Скажите "остановись" чтобы выключить.' });
    return true;
  }

  // "остановись" — выключить автоответ
  if (lo === 'остановись' || lo === 'стоп' || lo === 'хватит' || lo === 'выключись') {
    if (autoReplyChats.get(chatId)) {
      autoReplyChats.delete(chatId);
      await client.sendMessage(chatId, { message: '✅ Остановил автоответ, сэр.' });
      return true;
    }
  }

  // "отвечай этому пользователю" / "дай доступ" — разрешить юзеру общаться с Джарвисом
  const grantMatch = text.match(/(?:отвечай|дай доступ|разреши|добавь).*?@(\w+)/i);
  if (grantMatch) {
    const username = grantMatch[1].toLowerCase();
    allowedUsers.add(username);
    await workerPost('/api/data/set-pref', {
      userId: CFG.myId,
      key: `allowed_user_${username}`,
      value: 'true',
    });
    await client.sendMessage(chatId, { message: `✅ Разрешил @${username} общаться со мной в ЛС, сэр.` });
    return true;
  }

  // "запрети" / "отзови доступ"
  const revokeMatch = text.match(/(?:запрети|отзови доступ|убери доступ).*?@(\w+)/i);
  if (revokeMatch) {
    const username = revokeMatch[1].toLowerCase();
    allowedUsers.delete(username);
    await workerPost('/api/data/delete-pref', {
      userId: CFG.myId,
      key: `allowed_user_${username}`,
    });
    await client.sendMessage(chatId, { message: `✅ Запретил @${username} общаться со мной, сэр.` });
    return true;
  }

  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export function setupHandlers(client: TelegramClient): void {
  // Load allowed users from worker on startup
  loadAllowedUsers();

  client.addEventHandler(async (event: NewMessageEvent) => {
    try { await handleMsg(client, event); }
    catch (e) { console.error('[Handler] unhandled:', (e as Error).message); }
  }, new NewMessage({}));

  console.log('✅ Message handlers registered');
}

async function loadAllowedUsers(): Promise<void> {
  try {
    const prefs = await getPrefs();
    for (const [key, val] of Object.entries(prefs || {})) {
      if (key.startsWith('allowed_user_') && val === 'true') {
        const username = key.replace('allowed_user_', '');
        allowedUsers.add(username);
      }
    }
    if (allowedUsers.size > 0) {
      console.log(`[Handler] Loaded ${allowedUsers.size} allowed users:`, [...allowedUsers]);
    }
  } catch {}
}

async function handleMsg(client: TelegramClient, event: NewMessageEvent): Promise<void> {
  const msg = event.message;
  const text = msg.text || '';
  const chatId = msg.chatId?.toString() || '';
  const senderId = msg.senderId?.toString() || '';
  const isOwner = senderId === CFG.myId;
  const isPrivate = msg.isPrivate;
  const isGroup = !isPrivate;

  // Get sender info
  let senderName = 'Unknown';
  let senderUsername = '';
  try {
    const sender = await msg.getSender();
    if (sender instanceof Api.User) {
      senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || 'Unknown';
      senderUsername = sender.username?.toLowerCase() || '';
    }
  } catch {}

  // Get chat title
  let chatTitle = '';
  try {
    const chat = await msg.getChat();
    if (chat && 'title' in chat) chatTitle = (chat as any).title || '';
    else if (chat && 'firstName' in chat) chatTitle = (chat as any).firstName || '';
  } catch {}

  const hasVoice = !!(msg.voice || msg.audio);

  // Save for context
  await saveMessage({
    chatId, userId: senderId, userName: senderName,
    content: text, role: 'user',
    mediaType: hasVoice ? 'voice' : msg.photo ? 'photo' : undefined,
    source: 'userbot',
  });

  // ── AUTO-REPLY MODE ────────────────────────────────────────────────────────
  // If this chat is in auto-reply mode and message is NOT from owner
  if (!isOwner && autoReplyChats.get(chatId)) {
    console.log(`[AutoReply] responding in chat ${chatId} to ${senderName}`);
    try {
      const [history, prefs] = await Promise.all([getHistory(chatId), getPrefs()]);
      const sysPrompt = buildAutoReplyPrompt(prefs || {}, chatTitle);
      const groqMsgs: any[] = [{ role: 'system', content: sysPrompt }];
      for (const h of (history || []).slice(-15)) {
        const c = h.transcription ? `[🎤]: ${h.transcription}` : h.content || '[пусто]';
        groqMsgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: c });
      }
      groqMsgs.push({ role: 'user', content: text });
      const reply = await callGroq(groqMsgs);
      if (reply) {
        // In auto-reply mode, respond as plain text (not JSON)
        const clean = reply.replace(/^\{.*\}$/s, '').trim() || reply;
        await client.sendMessage(chatId, { message: clean.slice(0, 4096) });
        await saveMessage({ chatId, userId: CFG.myId, userName: 'Джарвис', content: clean, role: 'assistant', source: 'userbot' });
      }
    } catch (e) { console.error('[AutoReply]', (e as Error).message); }
    return;
  }

  // ── ALLOWED USER in private DM with owner ─────────────────────────────────
  // If non-owner writes to owner's DM and they're in allowed list
  if (!isOwner && isPrivate && senderUsername && allowedUsers.has(senderUsername)) {
    const { hit, clean } = checkTrigger(text);
    if (!hit) return; // Allowed users still need trigger
    console.log(`[AllowedUser] @${senderUsername} triggered Jarvis: "${clean.slice(0, 60)}"`);
    try {
      const [history, prefs, contacts] = await Promise.all([getHistory(chatId), getPrefs(), getContacts()]);
      const sysPrompt = `Ты — Джарвис. Сейчас с тобой общается ${senderName} (@${senderUsername}) — доверенный контакт хозяина Равиля.
Отвечай вежливо и полезно, но не раскрывай личные данные хозяина.
Отвечай обычным текстом (не JSON).
Время: ${new Date().toISOString()}`;
      const groqMsgs: any[] = [{ role: 'system', content: sysPrompt }];
      for (const h of (history || []).slice(-15)) {
        const c = h.transcription ? `[🎤]: ${h.transcription}` : h.content || '[пусто]';
        groqMsgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: c });
      }
      groqMsgs.push({ role: 'user', content: clean });
      const reply = await callGroq(groqMsgs);
      if (reply) {
        await client.sendMessage(chatId, { message: reply.slice(0, 4096) });
        await saveMessage({ chatId, userId: 'bot', userName: 'Джарвис', content: reply, role: 'assistant', source: 'userbot' });
      }
    } catch (e) { console.error('[AllowedUser]', (e as Error).message); }
    return;
  }

  // ── OWNER ONLY from here ──────────────────────────────────────────────────
  if (!isOwner) return;

  // isSelf = Saved Messages
  const isSelf = chatId === CFG.myId;
  const { hit, clean } = checkTrigger(text);

  if (!hit && !isSelf) return;

  const inputText = isSelf ? text : clean;
  if (!inputText.trim()) return;

  console.log(`[Handler] owner | chat=${chatId} isSelf=${isSelf} isGroup=${isGroup} text="${inputText.slice(0, 80)}"`);

  // Check special commands first
  if (await handleSpecialCommands(client, chatId, inputText, senderId)) return;

  // Transcribe voice
  let finalText = inputText;
  if (hasVoice) {
    try {
      const buf = await client.downloadMedia(msg, {}) as Buffer;
      if (buf) {
        const res = await fetch(`${WORKER}/api/data/transcribe`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CFG.workerSecret}`, 'Content-Type': 'application/octet-stream' },
          body: buf,
        });
        if (res.ok) {
          const data = await res.json() as { text?: string };
          if (data.text) { finalText = data.text; console.log(`[Handler] transcribed: "${data.text.slice(0, 80)}"`); }
        }
      }
    } catch (e) { console.error('[Handler] voice:', (e as Error).message); }
  }

  // Show typing
  try {
    await client.invoke(new Api.messages.SetTyping({
      peer: await client.getInputEntity(chatId),
      action: new Api.SendMessageTypingAction(),
    }));
  } catch {}

  // Fetch context
  const [history, prefs, contacts] = await Promise.all([
    getHistory(chatId),
    getPrefs(),
    getContacts(),
  ]);

  // Build LLM messages
  const systemPrompt = buildSystemPrompt({
    isGroup, chatTitle, chatId,
    prefs: prefs || {},
    contacts: contacts || [],
  });

  const groqMsgs: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];

  for (const h of (history || []).slice(-25)) {
    let content = h.content || '[пусто]';
    if (h.transcription) content = `[🎤]: ${h.transcription}`;
    else if (h.media_type === 'photo') content = `[📷${h.caption ? ': ' + h.caption : ''}]`;
    if (h.role === 'user' && h.user_name) content = `[${h.user_name}]: ${content}`;
    groqMsgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content });
  }
  groqMsgs.push({ role: 'user', content: finalText });

  // Call LLM
  const raw = await callGroq(groqMsgs);
  if (!raw) {
    console.error('[Handler] No Groq response');
    await client.sendMessage(chatId, { message: 'Извините, сэр — нейросеть не отвечает. Попробуйте ещё раз.' });
    return;
  }

  console.log(`[Handler] raw: ${raw.slice(0, 200)}`);

  const parsed = parseGroq(raw);
  console.log(`[Handler] reply="${parsed.reply?.slice(0, 80)}" actions=${parsed.actions?.length || 0}`);

  // Send reply
  if (parsed.reply) {
    await sendLong(client, chatId, parsed.reply);
    await saveMessage({ chatId, userId: CFG.myId, userName: 'Джарвис', content: parsed.reply, role: 'assistant', source: 'userbot' });
  }

  // Execute actions
  for (const action of (parsed.actions || [])) {
    try { await executeAction(client, chatId, action); }
    catch (e) { console.error(`[Action] ${action.type} failed:`, (e as Error).message); }
  }
}
