import type { DBReminder } from '../types';

export class RemindersService {
  constructor(private db: D1Database) {}

  async create(p: { userId: string; chatId: string; text: string; remindAt: string; source?: string }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO reminders (user_id, chat_id, text, remind_at, source) VALUES (?, ?, ?, ?, ?)`
    ).bind(p.userId, p.chatId, p.text, p.remindAt, p.source || 'bot').run()
      .catch(e => console.error('[Remind] create:', (e as Error).message));
  }

  async getDue(): Promise<DBReminder[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM reminders WHERE sent = 0 AND remind_at <= ? ORDER BY remind_at LIMIT 50`
      ).bind(new Date().toISOString()).all<DBReminder>();
      return r.results || [];
    } catch { return []; }
  }

  async markSent(id: number): Promise<void> {
    await this.db.prepare(`UPDATE reminders SET sent = 1 WHERE id = ?`).bind(id).run().catch(() => {});
  }

  async getUpcoming(userId: string, limit: number = 5): Promise<DBReminder[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at LIMIT ?`
      ).bind(userId, limit).all<DBReminder>();
      return r.results || [];
    } catch { return []; }
  }
}
