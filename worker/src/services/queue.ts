import type { DBQueueItem } from '../types';

export class QueueSvc {
  constructor(private db: D1Database) {}

  async push(type: string, chatId: string | null, payload: Record<string, unknown>): Promise<number | null> {
    try {
      const r = await this.db.prepare('INSERT INTO userbot_queue (command_type,chat_id,payload) VALUES (?,?,?)').bind(type, chatId, JSON.stringify(payload)).run();
      console.log(`[Q] pushed: ${type}`);
      return r.meta?.last_row_id || null;
    } catch (e) { console.error('[Q]', (e as Error).message); return null; }
  }

  async pending(limit = 10): Promise<DBQueueItem[]> {
    try {
      const r = await this.db.prepare("SELECT * FROM userbot_queue WHERE status='pending' ORDER BY created_at ASC LIMIT ?").bind(limit).all<DBQueueItem>();
      return r.results || [];
    } catch { return []; }
  }

  async markDone(id: number, result?: string): Promise<void> {
    await this.db.prepare("UPDATE userbot_queue SET status='done',result=?,processed_at=datetime('now') WHERE id=?").bind(result || null, id).run().catch(() => {});
  }

  async markError(id: number, err: string): Promise<void> {
    await this.db.prepare("UPDATE userbot_queue SET status='error',error=?,processed_at=datetime('now') WHERE id=?").bind(err, id).run().catch(() => {});
  }
}
