// ============================================
// Клиент API Cloudflare Worker
// ============================================

import { CONFIG } from './config.js';

const headers = {
  'Authorization': `Bearer ${CONFIG.workerApiSecret}`,
  'Content-Type': 'application/json',
};

/**
 * Запрашивает генерацию ответа от LLM через Worker
 */
export async function requestChat(params: {
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  isPrivate: boolean;
  chatTitle?: string;
}): Promise<{
  reply: string;
  mood?: string;
  suggestion?: string;
  actions?: Array<Record<string, unknown>>;
}> {
  const res = await fetch(`${CONFIG.workerUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Worker API /chat failed ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Сохраняет сообщение в БД через Worker
 */
export async function saveMessage(params: {
  chatId: string;
  userId: string;
  userName: string;
  content: string;
  role: string;
  mediaType?: string;
  mediaFileId?: string;
  caption?: string;
}): Promise<void> {
  await fetch(`${CONFIG.workerUrl}/api/messages/save`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  }).catch(e => console.error('[API] saveMessage:', e.message));
}

/**
 * Транскрибирует аудио через Worker (Whisper)
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  try {
    const res = await fetch(`${CONFIG.workerUrl}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.workerApiSecret}`,
        'Content-Type': 'application/octet-stream',
      },
      body: audioBuffer,
    });

    if (!res.ok) return null;
    const data = await res.json() as { text?: string };
    return data.text || null;
  } catch {
    return null;
  }
}

/**
 * Получает настройки чата
 */
export async function getChatSettings(chatId: string): Promise<{
  is_silent: number;
  is_active: number;
  ignore_users: string;
}> {
  try {
    const res = await fetch(`${CONFIG.workerUrl}/api/chat-settings?chatId=${chatId}`, { headers });
    if (!res.ok) return { is_silent: 0, is_active: 1, ignore_users: '[]' };
    return res.json();
  } catch {
    return { is_silent: 0, is_active: 1, ignore_users: '[]' };
  }
}

/**
 * Получает pending команды из очереди
 */
export async function getPendingCommands(): Promise<Array<{
  id: number;
  command_type: string;
  chat_id: string | null;
  payload: string;
}>> {
  try {
    const res = await fetch(`${CONFIG.workerUrl}/api/queue/pending`, { headers });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Отмечает команду как выполненную
 */
export async function completeCommand(id: number, result?: string, error?: string): Promise<void> {
  await fetch(`${CONFIG.workerUrl}/api/queue/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, result, error }),
  }).catch(() => {});
}
