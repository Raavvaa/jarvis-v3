import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import { CFG } from './config.js';

const workerHeaders = {
  'Authorization': `Bearer ${CFG.workerSecret}`,
  'Content-Type': 'application/json',
};

const TRIGGERS = ['джарвис', 'jarvis', 'бро', 'братан'];
const TRIGGER_CMDS = ['/j ', '/ask '];

function checkTrigger(text: string): { hit: boolean; clean: string } {
  const lo = text.toLowerCase().trim();
  for (const c of TRIGGER_CMDS) {
    if (lo.startsWith(c.trim())) return { hit: true, clean: text.slice(c.length).trim() };
  }
  for (const t of TRIGGERS) {
    if (lo.startsWith(t)) return { hit: true, clean: text.slice(t.length).replace(/^[,:\s]+/, '').trim() || text };
  }
  return { hit: false, clean: text };
}

export function setupHandlers(client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleMsg(client, event);
    } catch (e) {
      console.error('[Handler]', (e as Error).message);
    }
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

  // Get sender name
  let senderName = 'Unknown';
  try {
    const sender = await msg.getSender();
    if (sender instanceof Api.User) {
      senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
    }
  } catch {}

  // Get chat title for groups
  let chatTitle = '';
  try {
    const chat = await msg.getChat();
    if (chat && 'title' in chat) chatTitle = (chat as any).title || '';
  } catch {}

  // Save ALL messages to worker DB for context
  const hasVoice = !!(msg.voice || msg.audio);
  await saveToWorker({
    chatId,
    userId: senderId,
    userName: senderName,
    content: text,
    role: 'user',
    mediaType: hasVoice ? 'voice' : msg.photo ? 'photo' : undefined,
    source: 'userbot',
  });

  // Only respond to owner
  if (!isOwner) return;

  // Saved Messages (self chat): always respond
  const isSelf = isPrivate && senderId === CFG.myId;

  const { hit, clean } = checkTrigger(text);

  // Not triggered and not self-chat: skip
  if (!hit && !isSelf) return;

  const processedText = isSelf ? text : clean;
  if (!processedText) return;

  // Voice handling
  let finalText = processedText;
  if (hasVoice) {
    console.log('[Handler] Transcribing voice...');
    try {
      const mediaBuf = await client.downloadMedia(msg, {}) as Buffer;
      if (mediaBuf) {
        const txRes = await fetch(`${CFG.workerUrl}/api/data/transcribe`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CFG.workerSecret}`, 'Content-Type': 'application/octet-stream' },
          body: mediaBuf,
        });
        if (txRes.ok) {
          const txData = await txRes.json() as { text?: string };
          if (txData.text) {
            finalText = txData.text + (processedText ? `\n(подпись: ${processedText})` : '');
            console.log(`[Handler] Transcribed: "${txData.text.slice(0, 80)}"`);
          }
        }
      }
    } catch (e) { console.error('[Handler] Voice tx:', (e as Error).message); }
  }

  // Show typing
  try {
    await client.invoke(new Api.messages.SetTyping({
      peer: await client.getInputEntity(chatId),
      action: new Api.SendMessageTypingAction(),
    }));
  } catch {}

  // Request LLM response from worker
  console.log(`[Handler] LLM request for "${finalText.slice(0, 80)}..."`);

  try {
    // Get history + prefs + contacts from worker, build messages, call groq... 
    // Actually, we'll use the worker's /api/data endpoints to get context, 
    // then call Groq directly or via worker. Let's build a dedicated chat endpoint.

    const chatRes = await fetch(`${CFG.workerUrl}/api/data/history`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({ chatId, limit: 30 }),
    });
    const history = chatRes.ok ? await chatRes.json() as Array<{ role: string; content: string; user_name?: string; transcription?: string; media_type?: string; caption?: string }> : [];

    const prefsRes = await fetch(`${CFG.workerUrl}/api/data/prefs?userId=${CFG.myId}`, { headers: workerHeaders });
    const prefs = prefsRes.ok ? await prefsRes.json() as Record<string, string> : {};

    const contactsRes = await fetch(`${CFG.workerUrl}/api/data/contacts`, { headers: workerHeaders });
    const contacts = contactsRes.ok ? await contactsRes.json() as Array<{ nickname?: string; role?: string; username?: string; first_name?: string }> : [];

    // Build system prompt (same logic as worker ownerSystemPrompt)
    const prefsStr = Object.entries(prefs).length > 0 ? '\n\nФакты о хозяине:\n' + Object.entries(prefs).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '';
    const contactsStr = contacts.length > 0 ? '\n\nКонтакты:\n' + contacts.map((x: any) => `- ${x.nickname || x.first_name || '?'} (${x.role || '?'}${x.username ? ', @' + x.username : ''})`).join('\n') : '';

    const sysPrompt = `Ты — Джарвис, персональный ИИ-ассистент Равиля.
Как Джарвис у Тони Старка — умный, преданный, с юмором, называешь его "сэр".
Равиль — твой хозяин. ID: 1344488824. Город: Москва.
Ты пишешь ОТ ИМЕНИ хозяина — сообщения идут от его аккаунта.
${isGroup ? `Ты в групповом чате "${chatTitle}".` : 'Ты в личном чате с хозяином.'}

ПРАВИЛА:
1. Кратко — 1-3 предложения.
2. НИКОМУ кроме хозяина не раскрывай его данные.
3. Можешь выполнять действия через userbot_cmd.
4. Отвечай на языке вопроса.
${prefsStr}${contactsStr}

ФОРМАТ (СТРОГО JSON):
{
  "reply": "текст",
  "actions": [
    {"type": "save_pref", "key": "...", "value": "..."},
    {"type": "set_reminder", "remind_at": "ISO UTC", "remind_text": "..."},
    {"type": "save_contact", "contact": {"username": "...", "first_name": "...", "role": "...", "nickname": "..."}},
    {"type": "userbot_cmd", "userbot": {"type": "send_message", "chatId": "@user", "text": "..."}},
    {"type": "userbot_cmd", "userbot": {"type": "send_to_saved", "text": "..."}}
  ]
}
Если действий нет: "actions": [].
Время UTC: ${new Date().toISOString()}`;

    // Convert history to messages
    const groqMsgs: Array<{ role: string; content: string }> = [{ role: 'system', content: sysPrompt }];
    const histSlice = history.slice(-28);
    for (const h of histSlice) {
      let c = h.content;
      if (h.transcription) c = `[🎤 Голосовое]: ${h.transcription}`;
      else if (h.media_type === 'voice') c = '[🎤 Голосовое]';
      else if (h.media_type === 'photo') c = `[📷 Фото${h.caption ? ': ' + h.caption : ''}]`;
      if (h.role === 'user' && h.user_name) c = `[${h.user_name}]: ${c}`;
      groqMsgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: c || '[пусто]' });
    }
    groqMsgs.push({ role: 'user', content: finalText });

    // Call Groq directly (userbot has its own connection)
    const groqRes = await callGroq(groqMsgs);

    if (!groqRes) {
      console.error('[Handler] Empty Groq response');
      return;
    }

    // Parse response
    let parsed: { reply: string; actions?: Array<Record<string, any>> };
    try {
      const cleaned = groqRes.replace(/^