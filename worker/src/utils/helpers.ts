import { TRIGGER_WORDS, TRIGGER_COMMANDS } from '../config';
import type { TelegramMessage, ProcessedMessage } from '../types';

export function getUserName(msg: TelegramMessage): string {
  if (!msg.from) return 'Unknown';
  return [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    // Иногда LLM оборачивает JSON в markdown code block
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

  for (const trigger of TRIGGER_WORDS) {
    if (lower.startsWith(trigger)) {
      return {
        triggered: true,
        type: 'name',
        cleanText: text.slice(trigger.length).replace(/^[,:\s]+/, '').trim() || text,
      };
    }
  }

  if (botUsername && lower.includes(`@${botUsername.toLowerCase()}`)) {
    return {
      triggered: true,
      type: 'mention',
      cleanText: text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim(),
    };
  }

  return { triggered: false, cleanText: text };
}

export function processMessage(msg: TelegramMessage, ownerId: string, botUsername?: string): ProcessedMessage {
  const text = msg.text || msg.caption || '';
  const { triggered, type, cleanText } = checkTrigger(text, botUsername);

  return {
    chatId: msg.chat.id.toString(),
    userId: msg.from?.id.toString() || '0',
    userName: getUserName(msg),
    text,
    isTriggered: triggered,
    triggerType: type,
    cleanedText: cleanText,
    hasVoice: !!(msg.voice || msg.audio),
    hasPhoto: !!(msg.photo && msg.photo.length > 0),
    voiceFileId: msg.voice?.file_id || msg.audio?.file_id,
    photoFileId: msg.photo ? msg.photo[msg.photo.length - 1]?.file_id : undefined,
    mediaCaption: msg.caption,
    isGroup: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
    isFromOwner: msg.from?.id.toString() === ownerId,
    rawMessage: msg,
    businessConnectionId: msg.business_connection_id,
  };
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/^