import type { DBMessage, GroqMessage, TelegramMessage } from '../types';
import { CONTEXT_MESSAGE_COUNT } from '../config';
import { getUserName } from '../utils/helpers';

export class MessagesService {
  constructor(private db: D1Database) {}

  async save(params: {
    chatId: string;
    userId: string | null;
    userName: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    mediaType?: string | null;
    mediaFileId?: string | null;
    caption?: string | null;
    rawData?: string | null;
    source?: string;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO messages (chat_id, user_id, user_name, role, content, media_type, media_file_id, caption, raw_data, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.chatId, params.userId, params.userName, params.role, params.content,
      params.mediaType || null, params.mediaFileId || null, params.caption || null,
      params.rawData || null, params.source || 'bot'
    ).run().catch(e => console.error('[Msg] save:', (e as Error).message));
  }

  async getHistory(chatId: string, limit: number = CONTEXT_MESSAGE_COUNT): Promise<DBMessage[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?`
      ).bind(chatId, limit).all<DBMessage>();
      return (r.results || []).reverse();
    } catch { return []; }
  }

  convertToGroqMessages(msgs: DBMessage[]): GroqMessage[] {
    return msgs.map(m => {
      let content = m.content;
      if (m.transcription) content = `[🎤 Голосовое]: ${m.transcription}`;
      else if (m.media_type === 'voice' && !m.transcribed) content = '[🎤 Голосовое — не расшифровано]';
      else if (m.media_type === 'photo') content = `[📷 Фото${m.caption ? `: ${m.caption}` : ''}]`;
      else if (m.media_type === 'sticker') content = `[Стикер: ${m.content || '🔲'}]`;
      else if (m.media_type === 'video') content = `[🎥 Видео${m.caption ? `: ${m.caption}` : ''}]`;

      if (m.role === 'user' && m.user_name) content = `[${m.user_name}]: ${content}`;

      return { role: m.role as 'user' | 'assistant', content: content || '[пусто]' };
    });
  }

  async getUntranscribedVoices(chatId: string, limit: number = 5): Promise<DBMessage[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM messages WHERE chat_id = ? AND media_type = 'voice' AND transcribed = 0 AND media_file_id IS NOT NULL ORDER BY created_at DESC LIMIT ?`
      ).bind(chatId, limit).all<DBMessage>();
      return r.results || [];
    } catch { return []; }
  }

  async updateTranscription(id: number, text: string): Promise<void> {
    await this.db.prepare(
      `UPDATE messages SET transcribed = 1, transcription = ? WHERE id = ?`
    ).bind(text, id).run().catch(() => {});
  }

  async saveFromTelegram(msg: TelegramMessage, source: string = 'bot'): Promise<void> {
    let mediaType: string | null = null;
    let mediaFileId: string | null = null;
    let content = msg.text || msg.caption || '';

    if (msg.voice) { mediaType = 'voice'; mediaFileId = msg.voice.file_id; }
    else if (msg.audio) { mediaType = 'voice'; mediaFileId = msg.audio.file_id; }
    else if (msg.photo?.length) { mediaType = 'photo'; mediaFileId = msg.photo[msg.photo.length - 1].file_id; }
    else if (msg.video) { mediaType = 'video'; mediaFileId = msg.video.file_id; }
    else if (msg.sticker) { mediaType = 'sticker'; content = msg.sticker.emoji || '🔲'; }
    else if (msg.document) { mediaType = 'document'; mediaFileId = msg.document.file_id; }

    await this.save({
      chatId: msg.chat.id.toString(),
      userId: msg.from?.id.toString() || null,
      userName: getUserName(msg),
      role: 'user',
      content,
      mediaType,
      mediaFileId,
      caption: msg.caption,
      source,
    });
  }
}
