import type { Env, Parsed, LLMResponse, LLMAction, GroqMsg, TgMessage } from '../types';
import { TgSvc } from '../services/telegram';
import { GroqSvc } from '../services/groq';
import { MsgSvc } from '../services/messages';
import { PrefSvc } from '../services/preferences';
import { RemSvc } from '../services/reminders';
import { ContactSvc } from '../services/contacts';
import { QueueSvc } from '../services/queue';
import { transcribeVoice, transcribeBacklog } from './voice';
import { builtinCmd } from './command';
import { ownerSystemPrompt, groupSystemPrompt, MODEL_PRIMARY } from '../config';
import { parse, jsonParse } from '../utils/helpers';
import { parseDateTime } from '../utils/date-parser';

export async function handleWebhook(update: { message?: TgMessage; business_message?: TgMessage; business_connection?: unknown }, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = update.message || update.business_message;
  if (!raw) return new Response('OK');
  ctx.waitUntil(process(raw, env));
  return new Response('OK');
}

async function process(raw: TgMessage, env: Env): Promise<void> {
  const tg = new TgSvc(env);
  const msgs = new MsgSvc(env.DB);

  try {
    await msgs.saveFromTg(raw, 'bot');
    const msg = parse(raw, env.MY_TELEGRAM_ID);

    // Check if user is blocked in this chat
    if (!msg.isOwner && msg.isGroup) {
      try {
        const blocked = await env.DB.prepare('SELECT id FROM blocked_users WHERE chat_id=? AND user_id=?').bind(msg.chatId, msg.userId).first();
        if (blocked) return;
      } catch {}
    }

    // OWNER in private chat: always respond, no trigger needed
    if (msg.isOwner && !msg.isGroup) {
      await handleOwner(msg, env, tg, msgs);
      return;
    }

    // OWNER in group with trigger
    if (msg.isOwner && msg.isGroup && msg.triggered) {
      await handleOwner(msg, env, tg, msgs);
      return;
    }

    // NON-OWNER in group with trigger
    if (!msg.isOwner && msg.isGroup && msg.triggered) {
      await handleGroupUser(msg, env, tg, msgs);
      return;
    }

    // NON-OWNER in private: politely decline
    if (!msg.isOwner && !msg.isGroup && msg.triggered) {
      await tg.send(msg.chatId, '🤖 Я работаю только в группах. Добавьте меня в группу!');
      return;
    }

    // Everything else: silent, just saved to history already
  } catch (e) {
    console.error('[Webhook]', (e as Error).message);
  }
}

async function handleOwner(msg: Parsed, env: Env, tg: TgSvc, msgs: MsgSvc): Promise<void> {
  if (await builtinCmd(msg, env)) return;

  await tg.typing(msg.chatId, msg.bizConnId);

  // Voice
  let voiceText = '';
  if (msg.hasVoice && msg.voiceFileId) {
    voiceText = (await transcribeVoice(msg.voiceFileId, env)) || '';
    if (voiceText) {
      const hist = await msgs.history(msg.chatId, 1);
      if (hist.length > 0) await msgs.setTranscription(hist[hist.length - 1].id, voiceText);
    }
  }

  // Transcription request
  const wantsTx = msg.cleanText.match(/прослушай|расшифруй|послушай|что.в.голосов/i);
  if (wantsTx) {
    await tg.send(msg.chatId, '🎤 Расшифровываю, сэр...', { biz: msg.bizConnId });
    const n = await transcribeBacklog(msg.chatId, env);
    await tg.send(msg.chatId, n === 0 ? '✅ Все голосовые уже расшифрованы, сэр.' : `✅ Расшифровал ${n} голосовых, сэр.`, { biz: msg.bizConnId });
    return;
  }

  // Build context
  const prefs = new PrefSvc(env.DB);
  const contacts = new ContactSvc(env.DB);
  const userPrefs = await prefs.all(env.MY_TELEGRAM_ID);
  const allContacts = await contacts.getAll();

  let mode = 'default';
  try { const mr = await env.DB.prepare('SELECT mode FROM chat_modes WHERE chat_id=?').bind(msg.chatId).first<{ mode: string }>(); mode = mr?.mode || 'default'; } catch {}

  const dbHist = await msgs.history(msg.chatId, 30);
  const groqHist = msgs.toGroq(dbHist);

  let userMsg = msg.isGroup ? msg.cleanText : (msg.text || '');
  if (voiceText) userMsg = voiceText + (userMsg ? `\n(подпись: ${userMsg})` : '');
  if (!userMsg) userMsg = '[пустое сообщение]';

  const sys = ownerSystemPrompt(userPrefs, allContacts.map(c => ({ nickname: c.nickname || undefined, role: c.role || undefined, username: c.username || undefined, first_name: c.first_name || undefined })), mode);
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);

  const messages: GroqMsg[] = [{ role: 'system', content: sys }, ...groqHist.slice(-28), { role: 'user', content: userMsg }];

  const groq = new GroqSvc(env);
  const rawResp = await groq.complete(messages);

  let parsed = jsonParse<LLMResponse>(rawResp);
  if (!parsed) parsed = { reply: rawResp, actions: [] };

  // Execute actions
  if (parsed.actions && parsed.actions.length > 0) {
    const queue = new QueueSvc(env.DB);
    const rem = new RemSvc(env.DB);

    for (const a of parsed.actions) {
      try {
        switch (a.type) {
          case 'save_pref':
            if (a.key && a.value) await prefs.set(env.MY_TELEGRAM_ID, a.key, a.value);
            break;
          case 'delete_pref':
            if (a.key) await prefs.del(env.MY_TELEGRAM_ID, a.key);
            break;
          case 'set_reminder': {
            let at = a.remind_at;
            if (!at || !at.includes('T')) at = parseDateTime(a.remind_text || userMsg, tz) || undefined;
            if (at && a.remind_text) await rem.create({ userId: env.MY_TELEGRAM_ID, chatId: msg.chatId, text: a.remind_text, remindAt: at });
            break;
          }
          case 'save_contact':
            if (a.contact) await contacts.upsert({ telegram_id: a.contact.telegram_id || undefined, username: a.contact.username || undefined, first_name: a.contact.first_name || undefined, role: a.contact.role || undefined, nickname: a.contact.nickname || undefined, notes: a.contact.notes || undefined });
            break;
          case 'block_user':
            if (a.block_user_id) await env.DB.prepare('INSERT OR IGNORE INTO blocked_users (chat_id,user_id,blocked_by) VALUES (?,?,?)').bind(msg.chatId, a.block_user_id, env.MY_TELEGRAM_ID).run().catch(() => {});
            break;
          case 'unblock_user':
            if (a.block_user_id) await env.DB.prepare('DELETE FROM blocked_users WHERE chat_id=? AND user_id=?').bind(msg.chatId, a.block_user_id).run().catch(() => {});
            break;
          case 'change_mode':
            if (a.mode) await env.DB.prepare("INSERT INTO chat_modes (chat_id,mode,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(chat_id) DO UPDATE SET mode=?,updated_at=datetime('now')").bind(msg.chatId, a.mode, a.mode).run().catch(() => {});
            break;
          case 'userbot_cmd':
            if (a.userbot) await queue.push(a.userbot.type, (a.userbot.chatId?.toString()) || null, a.userbot as Record<string, unknown>);
            break;
        }
      } catch (e) { console.error(`[Action] ${a.type}:`, (e as Error).message); }
    }
  }

  // Send reply
  if (parsed.reply) {
    await tg.sendLong(msg.chatId, parsed.reply, { biz: msg.bizConnId });
    await msgs.save({ chatId: msg.chatId, userId: 'assistant', userName: 'Джарвис', role: 'assistant', content: parsed.reply, source: 'bot' });
  }
}

async function handleGroupUser(msg: Parsed, env: Env, tg: TgSvc, msgs: MsgSvc): Promise<void> {
  await tg.typing(msg.chatId);

  let mode = 'default';
  try { const mr = await env.DB.prepare('SELECT mode FROM chat_modes WHERE chat_id=?').bind(msg.chatId).first<{ mode: string }>(); mode = mr?.mode || 'default'; } catch {}

  const dbHist = await msgs.history(msg.chatId, 20);
  const groqHist = msgs.toGroq(dbHist);

  let userMsg = msg.cleanText || msg.text || '[пустое]';

  // Voice in group
  if (msg.hasVoice && msg.voiceFileId) {
    const t = await transcribeVoice(msg.voiceFileId, env);
    if (t) userMsg = t + (userMsg !== msg.text ? ` (подпись: ${userMsg})` : '');
  }

  const sys = groupSystemPrompt(mode);
  const messages: GroqMsg[] = [{ role: 'system', content: sys }, ...groqHist.slice(-18), { role: 'user', content: `[${msg.userName}]: ${userMsg}` }];

  const groq = new GroqSvc(env);
  const reply = await groq.complete(messages, 'llama-3.3-70b-versatile');

  if (reply) {
    await tg.sendLong(msg.chatId, reply, { biz: msg.bizConnId });
    await msgs.save({ chatId: msg.chatId, userId: 'bot', userName: 'Джарвис', role: 'assistant', content: reply, source: 'bot' });
  }
}
