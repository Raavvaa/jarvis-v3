import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import { CFG } from './config.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const WORKER = CFG.workerUrl;
const HEADERS = {
  'Authorization': `Bearer ${CFG.workerSecret}`,
  'Content-Type': 'application/json',
};
const TRIGGERS = ['джарвис', 'jarvis', 'бро', 'братан'];
const TRIGGER_CMDS = ['/j', '/ask'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pref { key: string; value: string; }
interface Contact { telegram_id?: string; username?: string; first_name?: string; last_name?: string; role?: string; nickname?: string; notes?: string; }
interface Reminder { remind_at: string; remind_text: string; }
interface UserbotCmd {
  type: 'send_message' | 'send_to_saved' | 'delete_message' | 'kick_user' | 'ban_user' |
        'promote_admin' | 'demote_admin' | 'get_chat_members' | 'forward_message' | 'read_messages';
  chatId?: string | number;
  text?: string;
  messageId?: number;
  userId?: number;
  fromChatId?: string | number;
  toChatId?: string | number;
}
interface Action {
  type: 'save_pref' | 'delete_pref' | 'set_reminder' | 'save_contact' |
        'block_user' | 'unblock_user' | 'userbot_cmd' | 'change_mode';
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
interface HistoryItem { role: string; content: string; user_name?: string; transcription?: string; media_type?: string; caption?: string; }

// ─── Worker API ───────────────────────────────────────────────────────────────

async function workerPost(path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${WORKER}${path}`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function workerGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${WORKER}${path}`, { headers: HEADERS });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function saveMessage(data: {
  chatId: string; userId: string; userName: string;
  content: string; role: string; mediaType?: string; source?: string;
}): Promise<void> {
  await workerPost('/api/data/save-message', data);
}

async function getHistory(chatId: string): Promise<HistoryItem[]> {
  return (await workerPost('/api/data/history', { chatId, limit: 30 })) || [];
}

async function getPrefs(): Promise<Record<string, string>> {
  return (await workerGet(`/api/data/prefs?userId=${CFG.myId}`)) || {};
}

async function getContacts(): Promise<Contact[]> {
  return (await workerGet('/api/data/contacts')) || [];
}

async function savePref(key: string, value: string): Promise<void> {
  await workerPost('/api/data/set-pref', { userId: CFG.myId, key, value });
}

async function deletePref(key: string): Promise<void> {
  await workerPost('/api/data/delete-pref', { userId: CFG.myId, key });
}

async function createReminder(chatId: string, remindAt: string, remindText: string): Promise<void> {
  await workerPost('/api/data/create-reminder', { userId: CFG.myId, chatId, remindAt, remindText });
}

async function saveContact(contact: Contact): Promise<void> {
  await workerPost('/api/data/save-contact', contact);
}

async function blockUser(chatId: string, userId: string): Promise<void> {
  await workerPost('/api/data/block-user', { chatId, userId, blockedBy: CFG.myId });
}

async function unblockUser(chatId: string, userId: string): Promise<void> {
  await workerPost('/api/data/unblock-user', { chatId, userId });
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
  const key1 = process.env.GROQ_API_KEY || '';
  const key2 = process.env.GROQ_API_KEY_2 || '';

  const call = async (key: string, model: string): Promise<string> => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 100)}`);
    const d = await res.json() as any;
    return d.choices?.[0]?.message?.content || '';
  };

  const attempts = [
    () => call(key1, 'compound-beta'),
    () => call(key2, 'llama-3.3-70b-versatile'),
    () => call(key1, 'llama-3.3-70b-versatile'),
  ];

  for (const attempt of attempts) {
    try { return await attempt(); }
    catch (e) { console.warn('[Groq] attempt failed:', (e as Error).message.slice(0, 60)); }
  }
  return null;
}

function parseGroq(raw: string): LLMResponse {
  try {
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(clean) as LLMResponse;
  } catch {
    return { reply: raw, actions: [] };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(opts: {
  isGroup: boolean;
  chatTitle: string;
  prefs: Record<string, string>;
  contacts: Contact[];
}): string {
  const prefsStr = Object.entries(opts.prefs).length > 0
    ? '\n\nЧТО Я ЗНАЮ О ХОЗЯИНЕ:\n' + Object.entries(opts.prefs).map(([k, v]) => `• ${k}: ${v}`).join('\n')
    : '';

  const contactsStr = opts.contacts.length > 0
    ? '\n\nКОНТАКТЫ ХОЗЯИНА:\n' + opts.contacts.map(c =>
        `• ${c.nickname || c.first_name || '?'}${c.username ? ' (@' + c.username + ')' : ''}${c.role ? ' — ' + c.role : ''}${c.notes ? ' | ' + c.notes : ''}`
      ).join('\n')
    : '';

  return `Ты — Джарвис, персональный ИИ-ассистент Равиля. Ты как Джарвис у Тони Старка — умный, преданный, с юмором. Называй хозяина "сэр".
Ты работаешь ЧЕРЕЗ АККАУНТ хозяина в Telegram. Когда пишешь — сообщение идёт от его имени.
${opts.isGroup ? `Сейчас ты в групповом чате: "${opts.chatTitle}".` : 'Сейчас ты в личном чате хозяина (Избранное).'}
${prefsStr}${contactsStr}

═══════════════════════════════════════════
ДОСТУПНЫЕ ДЕЙСТВИЯ (ОБЯЗАТЕЛЬНО используй их когда нужно):
═══════════════════════════════════════════

1. НАПИСАТЬ СООБЩЕНИЕ кому-то:
   {"type": "userbot_cmd", "userbot": {"type": "send_message", "chatId": "@username", "text": "текст"}}
   
2. ЗАПИСАТЬ В ИЗБРАННОЕ:
   {"type": "userbot_cmd", "userbot": {"type": "send_to_saved", "text": "текст"}}

3. УДАЛИТЬ СООБЩЕНИЕ:
   {"type": "userbot_cmd", "userbot": {"type": "delete_message", "chatId": "-100xxx", "messageId": 123}}

4. КИКНУТЬ ПОЛЬЗОВАТЕЛЯ:
   {"type": "userbot_cmd", "userbot": {"type": "kick_user", "chatId": "-100xxx", "userId": 123456}}

5. ЗАБАНИТЬ ПОЛЬЗОВАТЕЛЯ:
   {"type": "userbot_cmd", "userbot": {"type": "ban_user", "chatId": "-100xxx", "userId": 123456}}

6. НАЗНАЧИТЬ АДМИНА:
   {"type": "userbot_cmd", "userbot": {"type": "promote_admin", "chatId": "-100xxx", "userId": 123456}}

7. СНЯТЬ АДМИНА:
   {"type": "userbot_cmd", "userbot": {"type": "demote_admin", "chatId": "-100xxx", "userId": 123456}}

8. СПИСОК УЧАСТНИКОВ:
   {"type": "userbot_cmd", "userbot": {"type": "get_chat_members", "chatId": "-100xxx"}}

9. ЗАПОМНИТЬ ФАКТ:
   {"type": "save_pref", "key": "ключ", "value": "значение"}

10. ЗАБЫТЬ ФАКТ:
    {"type": "delete_pref", "key": "ключ"}

11. СОЗДАТЬ НАПОМИНАНИЕ:
    {"type": "set_reminder", "remind_at": "2026-03-09T15:00:00.000Z", "remind_text": "текст"}

12. СОХРАНИТЬ КОНТАКТ:
    {"type": "save_contact", "contact": {"username": "...", "first_name": "...", "role": "...", "nickname": "...", "notes": "..."}}

13. ЗАБЛОКИРОВАТЬ ЮЗЕРА В ЧАТЕ (бот не будет отвечать):
    {"type": "block_user", "block_user_id": "12345", "chat_id": "-100xxx"}

═══════════════════════════════════════════
ПРИМЕРЫ:
═══════════════════════════════════════════

Запрос: "напиши @lelooonnn что как ты"
Ответ: {"reply": "Написал, сэр.", "actions": [{"type": "userbot_cmd", "userbot": {"type": "send_message", "chatId": "@lelooonnn", "text": "Как ты?"}}]}

Запрос: "напиши fade привет братан"
Ответ: {"reply": "Написал fade, сэр.", "actions": [{"type": "userbot_cmd", "userbot": {"type": "send_message", "chatId": "@fade", "text": "Привет братан"}}]}

Запрос: "запиши в избранное купить молоко"
Ответ: {"reply": "Записал, сэр.", "actions": [{"type": "userbot_cmd", "userbot": {"type": "send_to_saved", "text": "купить молоко"}}]}

Запрос: "запомни что моя девушка Аня"
Ответ: {"reply": "Запомнил, сэр.", "actions": [{"type": "save_pref", "key": "девушка", "value": "Аня"}]}

Запрос: "напомни через 30 минут позвонить маме"
Ответ: {"reply": "Напомню через 30 минут, сэр.", "actions": [{"type": "set_reminder", "remind_at": "${new Date(Date.now() + 30*60000).toISOString()}", "remind_text": "позвонить маме"}]}

Запрос: "кто такой Аня?"
Ответ: {"reply": "Аня — ваша девушка, сэр.", "actions": []}

═══════════════════════════════════════════
ПРАВИЛА:
═══════════════════════════════════════════
1. ВСЕГДА отвечай ТОЛЬКО валидным JSON: {"reply": "...", "actions": [...]}
2. Отвечай кратко — 1-2 предложения в reply, если не просят подробно
3. Если хозяин просит написать кому-то — ОБЯЗАТЕЛЬНО добавляй userbot_cmd send_message
4. Если не знаешь username — напиши в reply что нужно уточнить
5. Никому кроме хозяина не раскрывай его личные данные
6. Отвечай на языке хозяина
7. Если нет действий — "actions": []

Текущее время UTC: ${new Date().toISOString()}`;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

async function executeAction(client: TelegramClient, chatId: string, action: Action): Promise<void> {
  console.log(`[Action] ${action.type}`, JSON.stringify(action).slice(0, 100));

  switch (action.type) {
    case 'save_pref':
      if (action.key && action.value) await savePref(action.key, action.value);
      break;

    case 'delete_pref':
      if (action.key) await deletePref(action.key);
      break;

    case 'set_reminder':
      if (action.remind_at && action.remind_text) {
        await createReminder(chatId, action.remind_at, action.remind_text);
      }
      break;

    case 'save_contact':
      if (action.contact) await saveContact(action.contact);
      break;

    case 'block_user':
      if (action.block_user_id) await blockUser(action.chat_id || chatId, action.block_user_id);
      break;

    case 'unblock_user':
      if (action.block_user_id) await unblockUser(action.chat_id || chatId, action.block_user_id);
      break;

    case 'userbot_cmd':
      if (action.userbot) {
        const { execute } = await import('./executor.js');
        const result = await execute(client, action.userbot.type, action.userbot as Record<string, unknown>);
        console.log(`[Action] userbot result: ${result.slice(0, 100)}`);
      }
      break;
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
    if ((cur + '\n\n' + p).length > 4000) {
      if (cur) parts.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) parts.push(cur.trim());
  for (const part of parts) {
    await client.sendMessage(chatId, { message: part });
    await new Promise(r => setTimeout(r, 300));
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export function setupHandlers(client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try { await handleMsg(client, event); }
    catch (e) { console.error('[Handler] unhandled:', (e as Error).message); }
  }, new NewMessage({}));
  console.log('✅ Message handlers registered');
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
  try {
    const sender = await msg.getSender();
    if (sender instanceof Api.User) {
      senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || 'Unknown';
    }
  } catch {}

  // Get chat title
  let chatTitle = '';
  try {
    const chat = await msg.getChat();
    if (chat && 'title' in chat) chatTitle = (chat as any).title || '';
  } catch {}

  const hasVoice = !!(msg.voice || msg.audio);

  // Save all messages for context
  await saveMessage({
    chatId, userId: senderId, userName: senderName,
    content: text, role: 'user',
    mediaType: hasVoice ? 'voice' : msg.photo ? 'photo' : undefined,
    source: 'userbot',
  });

  // Only owner triggers Jarvis
  if (!isOwner) return;

  // isSelf = Saved Messages (chatId equals owner's own ID)
  const isSelf = chatId === CFG.myId;
  const { hit, clean } = checkTrigger(text);

  // In Saved Messages — always respond
  // In other chats — only on trigger
  if (!hit && !isSelf) return;

  const inputText = isSelf ? text : clean;
  if (!inputText.trim()) return;

  console.log(`[Handler] triggered | chat=${chatId} isSelf=${isSelf} isGroup=${isGroup} text="${inputText.slice(0, 80)}"`);

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
          if (data.text) {
            finalText = data.text;
            console.log(`[Handler] transcribed: "${data.text.slice(0, 80)}"`);
          }
        }
      }
    } catch (e) { console.error('[Handler] voice error:', (e as Error).message); }
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

  // Build messages for LLM
  const systemPrompt = buildSystemPrompt({ isGroup, chatTitle, prefs, contacts });
  const groqMsgs: Array<{ role: string; content: string }> = [{ role: 'system', content: systemPrompt }];

  for (const h of history.slice(-25)) {
    let content = h.content || '[пусто]';
    if (h.transcription) content = `[🎤 Голосовое]: ${h.transcription}`;
    else if (h.media_type === 'photo') content = `[📷 Фото${h.caption ? ': ' + h.caption : ''}]`;
    if (h.role === 'user' && h.user_name) content = `[${h.user_name}]: ${content}`;
    groqMsgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content });
  }

  groqMsgs.push({ role: 'user', content: finalText });

  // Call LLM
  const raw = await callGroq(groqMsgs);
  if (!raw) {
    console.error('[Handler] No Groq response');
    await client.sendMessage(chatId, { message: 'Извините, сэр — проблема с нейросетью. Попробуйте ещё раз.' });
    return;
  }

  console.log(`[Handler] Groq response: ${raw.slice(0, 200)}`);

  const parsed = parseGroq(raw);
  console.log(`[Handler] reply="${parsed.reply?.slice(0, 80)}" actions=${parsed.actions?.length || 0}`);

  // Send reply
  if (parsed.reply) {
    await sendLong(client, chatId, parsed.reply);
    await saveMessage({
      chatId, userId: CFG.myId, userName: 'Джарвис',
      content: parsed.reply, role: 'assistant', source: 'userbot',
    });
  }

  // Execute actions
  for (const action of (parsed.actions || [])) {
    try {
      await executeAction(client, chatId, action);
    } catch (e) {
      console.error(`[Handler] action ${action.type} failed:`, (e as Error).message);
    }
  }
}
