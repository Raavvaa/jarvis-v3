// ============================================
// Обработчик сообщений юзербота
// ============================================

import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import { CONFIG, TRIGGER_WORDS, TRIGGER_COMMANDS } from './config.js';
import * as workerApi from './worker-api.js';
import * as actions from './actions.js';

/**
 * Проверяет, является ли сообщение от хозяина
 */
function isFromOwner(event: NewMessageEvent): boolean {
  const senderId = event.message.senderId?.toString();
  return senderId === CONFIG.myTelegramId;
}

/**
 * Проверяет триггер в тексте
 */
function checkTrigger(text: string): { triggered: boolean; cleanText: string } {
  const lower = text.toLowerCase().trim();

  for (const cmd of TRIGGER_COMMANDS) {
    if (lower.startsWith(cmd.trim())) {
      return { triggered: true, cleanText: text.slice(cmd.length).trim() };
    }
  }

  for (const word of TRIGGER_WORDS) {
    if (lower.startsWith(word)) {
      return {
        triggered: true,
        cleanText: text.slice(word.length).replace(/^[,:\s]+/, '').trim() || text,
      };
    }
  }

  return { triggered: false, cleanText: text };
}

/**
 * Скачивает медиа из сообщения
 */
async function downloadMedia(client: TelegramClient, message: Api.Message): Promise<Buffer | null> {
  try {
    const buffer = await client.downloadMedia(message, {});
    return buffer as Buffer;
  } catch {
    return null;
  }
}

/**
 * Основной обработчик сообщений
 */
export function setupHandlers(client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleMessage(client, event);
    } catch (error) {
      console.error('[Handler] Error:', (error as Error).message);
    }
  }, new NewMessage({}));

  console.log('✅ Message handlers registered');
}

async function handleMessage(client: TelegramClient, event: NewMessageEvent): Promise<void> {
  const message = event.message;
  const text = message.text || '';
  const chatId = message.chatId?.toString() || '';
  const senderId = message.senderId?.toString() || '';
  const isOwner = isFromOwner(event);

  // Определяем тип чата
  const chat = await message.getChat();
  const isPrivate = message.isPrivate;
  const isGroup = !isPrivate;
  const chatTitle = (chat as Api.Chat | Api.Channel)?.title || '';

  // Получаем имя отправителя
  let senderName = 'Unknown';
  try {
    const sender = await message.getSender();
    if (sender instanceof Api.User) {
      senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
    }
  } catch {}

  // ========================================
  // 1. Сохраняем ВСЕ сообщения в историю
  // ========================================
  const hasVoice = !!(message.voice || message.audio);
  const hasPhoto = !!message.photo;

  await workerApi.saveMessage({
    chatId,
    userId: senderId,
    userName: senderName,
    content: text || (hasVoice ? '' : message.message || ''),
    role: 'user',
    mediaType: hasVoice ? 'voice' : hasPhoto ? 'photo' : undefined,
    caption: text && hasVoice ? text : undefined,
  });

  // ========================================
  // 2. Проверяем, нужно ли реагировать
  // ========================================

  // Только хозяин может активировать юзербота
  if (!isOwner) return;

  // В Saved Messages (чат с самим собой) — отвечаем на всё
  const isSavedMessages = isPrivate && senderId === CONFIG.myTelegramId;

  // Проверяем триггер
  const { triggered, cleanText } = checkTrigger(text);

  // Не активирован и не Saved Messages — выходим
  if (!triggered && !isSavedMessages) return;

  // ========================================
  // 3. Проверяем настройки чата
  // ========================================
  if (isGroup) {
    const settings = await workerApi.getChatSettings(chatId);
    if (settings.is_silent) {
      console.log(`[Handler] Chat ${chatId} is silenced, skipping`);
      return;
    }
  }

  // ========================================
  // 4. Обрабатываем голосовое (если есть)
  // ========================================
  let processedText = isSavedMessages ? text : cleanText;

  if (hasVoice) {
    console.log('[Handler] Processing voice message...');
    const mediaBuffer = await downloadMedia(client, message);
    if (mediaBuffer) {
      const transcription = await workerApi.transcribeAudio(mediaBuffer);
      if (transcription) {
        processedText = transcription + (processedText ? `\n(подпись: ${processedText})` : '');
        console.log(`[Handler] Transcribed: "${transcription.slice(0, 80)}..."`);
      }
    }
  }

  if (!processedText || processedText.length === 0) {
    processedText = '[пустое сообщение]';
  }

  // ========================================
  // 5. Проверяем, просит ли расшифровать бэклог
  // ========================================
  const wantsTranscription = processedText.match(
    /прослушай|расшифруй|послушай|транскрибируй|что.в.голосов/i
  );

  if (wantsTranscription) {
    await actions.sendMessage(client, chatId, '🎤 Расшифровываю голосовые...');
    // TODO: тут нужно найти голосовые через Worker API и расшифровать
    // Пока заглушка
    await actions.sendMessage(client, chatId, '✅ Готово! Задай вопрос, и я отвечу с учётом расшифровок.');
    return;
  }

  // ========================================
  // 6. Отправляем "typing..."
  // ========================================
  try {
    await client.invoke(new Api.messages.SetTyping({
      peer: await client.getInputEntity(chatId),
      action: new Api.SendMessageTypingAction(),
    }));
  } catch {}

  // ========================================
  // 7. Запрашиваем ответ от LLM через Worker
  // ========================================
  console.log(`[Handler] Requesting LLM for chat ${chatId}: "${processedText.slice(0, 80)}..."`);

  const response = await workerApi.requestChat({
    chatId,
    userId: senderId,
    userName: senderName,
    text: processedText,
    isPrivate,
    chatTitle: chatTitle || undefined,
  });

  // ========================================
  // 8. Отправляем ответ от имени хозяина
  // ========================================
  if (response.reply) {
    // Разбиваем длинные сообщения
    const maxLen = 4096;
    const reply = response.reply;

    if (reply.length <= maxLen) {
      await actions.sendMessage(client, chatId, reply);
    } else {
      // Разбиваем по абзацам
      const parts: string[] = [];
      let cur = '';
      for (const p of reply.split('\n\n')) {
        if ((cur + '\n\n' + p).length > maxLen) {
          if (cur) parts.push(cur.trim());
          cur = p;
        } else {
          cur = cur ? cur + '\n\n' + p : p;
        }
      }
      if (cur) parts.push(cur.trim());

      for (const part of parts) {
        await actions.sendMessage(client, chatId, part);
        await sleep(300);
      }
    }

    // Сохраняем ответ в историю
    await workerApi.saveMessage({
      chatId,
      userId: CONFIG.myTelegramId,
      userName: 'Джарвис (от моего имени)',
      content: response.reply,
      role: 'assistant',
    });
  }

  // ========================================
  // 9. Выводим подсказку (в Saved Messages)
  // ========================================
  if (response.suggestion && !isSavedMessages) {
    try {
      // Отправляем подсказку себе в Saved Messages
      await actions.sendMessage(client, 'me', `💡 Подсказка (чат: ${chatTitle || chatId}):\n${response.suggestion}`);
    } catch {}
  }

  if (response.mood && response.mood !== 'neutral' && !isSavedMessages) {
    const moodEmoji: Record<string, string> = {
      happy: '😊', sad: '😢', angry: '😡', anxious: '😰', excited: '🔥'
    };
    try {
      await actions.sendMessage(
        client,
        'me',
        `${moodEmoji[response.mood] || '🤔'} Настроение собеседника: ${response.mood} (чат: ${chatTitle || chatId})`
      );
    } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
