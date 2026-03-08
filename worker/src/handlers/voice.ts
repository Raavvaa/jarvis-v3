import type { Env } from '../types';
import { TelegramService } from '../services/telegram';
import { transcribeAudio } from '../services/whisper';
import { MessagesService } from '../services/messages';

export async function transcribeCurrentVoice(fileId: string, env: Env): Promise<string | null> {
  const tg = new TelegramService(env);
  const buf = await tg.downloadFileById(fileId);
  if (!buf) return null;
  return transcribeAudio(buf, env);
}

export async function transcribeBacklog(chatId: string, env: Env): Promise<number> {
  const tg = new TelegramService(env);
  const msgs = new MessagesService(env.DB);
  const untranscribed = await msgs.getUntranscribedVoices(chatId, 5);
  let count = 0;

  for (const m of untranscribed) {
    if (!m.media_file_id) continue;
    try {
      const buf = await tg.downloadFileById(m.media_file_id);
      if (!buf) continue;
      const text = await transcribeAudio(buf, env);
      if (text) {
        await msgs.updateTranscription(m.id, text);
        count++;
      }
    } catch (e) {
      console.error(`[Voice] Transcribe ${m.id}:`, (e as Error).message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return count;
}
