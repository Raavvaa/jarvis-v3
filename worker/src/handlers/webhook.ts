// ============================================
// Главный обработчик вебхуков — v3
// Публичный бот: отвечает в группах всем
// Если от хозяина — пробрасывает в очередь юзербота
// ============================================

import type { Env, ProcessedMessage, LLMActionResponse, GroqMessage, TelegramMessage } from '../types';
import { TelegramService } from '../services/telegram';
import { GroqService } from '../services/groq';
import { MessagesService } from '../services/messages';
import { PreferencesService } from '../services/preferences';
import { RemindersService } from '../services/reminders';
import { ContactsService } from '../services/contacts';
import { QueueService } from '../services/queue';
import { transcribeCurrentVoice, transcribeBacklog } from './voice';
import { handleBuiltinCommand } from './command';
import { buildBotSystemPrompt } from '../config';
import { BOT_MODEL } from '../config';
import { processMessage, safeJsonParse } from '../utils/helpers';
import { parseDateTime } from '../utils/date-parser';

export async function handleWebhook(
  update: { message?: TelegramMessage; business_message?: TelegramMessage; business_connection?: unknown },
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const rawMessage = update.message || update.business_message;
  if (!rawMessage) return new Response('OK');

  ctx.waitUntil(processUpdate(rawMessage, env));
  return new Response('OK');
}

async function processUpdate(rawMessage: TelegramMessage, env: Env): Promise<void> {
  const tg = new TelegramService(env);
  const msgs = new MessagesService(env.DB);

  try {
    // Сохраняем в историю
    await msgs.saveFromTelegram(rawMessage, 'bot');

    const msg = processMessage(rawMessage, env.MY_TELEGRAM_ID);

    // ============================================
    // РАЗВИЛКА: Хозяин vs. Другие пользователи
    // ============================================

    if (msg.isFromOwner) {
      // Хозяин пишет — НЕ отвечаем через бота.
      // Его обслуживает юзербот напрямую через MTProto.
      // Бот просто сохранил сообщение и молчит.
      // (Юзербот опрашивает D1 напрямую через API)
      return;
    }

    // Не хозяин — проверяем триггер
    if (!msg.isTriggered) return;

    // В личных чатах посторонним не отвечаем
    if (!msg.isGroup) {
      await tg.sendMessage(msg.chatId, '🤖 Я работаю только в группах. Добавь меня в группу!');
      return;
    }

    // Обработка встроенных команд
    if (await handleBuiltinCommand(msg, env)) return;

    // Typing indicator
    await tg.sendChatAction(msg.chatId, 'typing');

    // Голосовое
    let voiceText = '';
    if (msg.hasVoice && msg.voiceFileId) {
      voiceText = (await transcribeCurrentVoice(msg.voiceFileId, env)) || '';
    }

    // Контекст
    let mode = 'default';
    try {
      const mr = await env.DB.prepare(`SELECT mode FROM chat_modes WHERE chat_id = ?`).bind(msg.chatId).first<{ mode: string }>();
      mode = mr?.mode || 'default';
    } catch {}

    const history = await msgs.getHistory(msg.chatId, 30);
    const groqHistory = msgs.convertToGroqMessages(history);

    let userMessage = msg.cleanedText;
    if (voiceText) userMessage = voiceText + (userMessage ? `\n(подпись: ${userMessage})` : '');
    if (!userMessage) userMessage = '[пустое сообщение]';

    const systemPrompt = buildBotSystemPrompt(mode);

    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      ...groqHistory.slice(-28),
      { role: 'user', content: `[${msg.userName}]: ${userMessage}` },
    ];

    // LLM (быстрая модель для публичного бота)
    const groq = new GroqService(env);
    const reply = await groq.getCompletion(messages, BOT_MODEL);

    // Отправляем
    await tg.sendLongMessage(msg.chatId, reply, {
      businessConnectionId: msg.businessConnectionId,
    });

    // Сохраняем ответ
    await msgs.save({
      chatId: msg.chatId,
      userId: 'bot',
      userName: 'Джарвис',
      role: 'assistant',
      content: reply,
      source: 'bot',
    });

  } catch (error) {
    console.error('[Webhook] Error:', (error as Error).message);
  }
}
