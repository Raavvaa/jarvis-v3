import type { DBMessage, GroqMsg, TgMessage } from '../types';
import { CTX_LIMIT } from '../config';
import { userName } from '../utils/helpers';

export class MsgSvc {
  constructor(private db: D1Database) {}

  async save(p: { chatId: string; userId: string | null; userName: string | null; role: string; content: string; mediaType?: string | null; mediaFileId?: string | null; caption?: string | null; source?: string }): Promise<void> {
    await this.db.prepare('INSERT INTO messages (chat_id,user_id,user_name,role,content,media_type,media_file_id,caption,source) VALUES (?,?,?,?,?,?,?,?,?)').bind(p.chatId, p.userId, p.userName, p.role, p.content, p.mediaType || null, p.mediaFileId || null, p.caption || null, p.source || 'bot').run().catch(e => console.error('[Msg] save:', (e as Error).message));
  }

  async history(chatId: string, limit = CTX_LIMIT): Promise<DBMessage[]> {
    try {
      const r = await this.db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT ?').bind(chatId, limit).all<DBMessage>();
      return (r.results || []).reverse();
    } catch { return []; }
  }

  toGroq(msgs: DBMessage[]): GroqMsg[] {
    return msgs.map(m => {
      let c = m.content;
      if (m.transcription) c = `[🎤 Голосовое]: ${m.transcription}`;
      else if (m.media_type === 'voice' && !m.transcribed) c = '[🎤 Голосовое — не расшифровано]';
      else if (m.media_type === 'photo') c = `[📷 Фото${m.caption ? ': ' + m.caption : ''}]`;
      else if (m.media_type === 'sticker') c = `[Стикер: ${m.content || '🔲'}]`;
      else if (m.media_type === 'video') c = `[🎥 Видео${m.caption ? ': ' + m.caption : ''}]`;
      if (m.role === 'user' && m.user_name) c = `[${m.user_name}]: ${c}`;
      return { role: m.role as 'user' | 'assistant', content: c || '[пусто]' };
    });
  }

  async untranscribed(chatId: string, limit = 5): Promise<DBMessage[]> {
    try {
      const r = await this.db.prepare("SELECT * FROM messages WHERE chat_id=? AND media_type='voice' AND transcribed=0 AND media_file_id IS NOT NULL ORDER BY created_at DESC LIMIT ?").bind(chatId, limit).all<DBMessage>();
      return r.results || [];
    } catch { return []; }
  }

  async setTranscription(id: number, text: string): Promise<void> {
    await this.db.prepare('UPDATE messages SET transcribed=1, transcription=? WHERE id=?').bind(text, id).run().catch(() => {});
  }

  async saveFromTg(m: TgMessage, src = 'bot'): Promise<void> {
    let mt: string | null = null, mf: string | null = null, content = m.text || m.caption || '';
    if (m.voice) { mt = 'voice'; mf = m.voice.file_id; }
    else if (m.audio) { mt = 'voice'; mf = m.audio.file_id; }
    else if (m.photo?.length) { mt = 'photo'; mf = m.photo[m.photo.length - 1].file_id; }
    else if (m.video) { mt = 'video'; mf = m.video.file_id; }
    else if (m.sticker) { mt = 'sticker'; content = m.sticker.emoji || '🔲'; }
    else if (m.document) { mt = 'document'; mf = m.document.file_id; }
    await this.save({ chatId: m.chat.id.toString(), userId: m.from?.id.toString() || null, userName: userName(m), role: 'user', content, mediaType: mt, mediaFileId: mf, caption: m.caption, source: src });
  }
}
