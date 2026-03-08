import type { Env } from '../types';
import { TgSvc } from '../services/telegram';
import { transcribe } from '../services/whisper';
import { MsgSvc } from '../services/messages';

export async function transcribeVoice(fileId: string, env: Env): Promise<string | null> {
  const tg = new TgSvc(env);
  const buf = await tg.downloadById(fileId);
  if (!buf) return null;
  return transcribe(buf, env);
}

export async function transcribeBacklog(chatId: string, env: Env): Promise<number> {
  const tg = new TgSvc(env);
  const msgs = new MsgSvc(env.DB);
  const list = await msgs.untranscribed(chatId, 5);
  let count = 0;
  for (const m of list) {
    if (!m.media_file_id) continue;
    try {
      const buf = await tg.downloadById(m.media_file_id);
      if (!buf) continue;
      const t = await transcribe(buf, env);
      if (t) { await msgs.setTranscription(m.id, t); count++; }
    } catch (e) { console.error(`[Voice] ${m.id}:`, (e as Error).message); }
    await new Promise(r => setTimeout(r, 500));
  }
  return count;
}
