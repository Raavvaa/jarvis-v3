import type { QueueCommand, DBCommandQueue } from '../types';

export class QueueService {
  constructor(private db: D1Database) {}

  async enqueue(cmd: QueueCommand): Promise<number | null> {
    try {
      const r = await this.db.prepare(
        `INSERT INTO command_queue (command_type, chat_id, payload) VALUES (?, ?, ?)`
      ).bind(cmd.type, cmd.chatId || null, JSON.stringify(cmd.payload)).run();
      console.log(`[Queue] Enqueued: ${cmd.type}`);
      return r.meta?.last_row_id || null;
    } catch (e) {
      console.error('[Queue] enqueue:', (e as Error).message);
      return null;
    }
  }

  async getPending(limit: number = 10): Promise<DBCommandQueue[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM command_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
      ).bind(limit).all<DBCommandQueue>();
      return r.results || [];
    } catch { return []; }
  }

  async markProcessing(id: number): Promise<void> {
    await this.db.prepare(
      `UPDATE command_queue SET status = 'processing' WHERE id = ?`
    ).bind(id).run().catch(() => {});
  }

  async markDone(id: number, result?: string): Promise<void> {
    await this.db.prepare(
      `UPDATE command_queue SET status = 'done', result = ?, processed_at = datetime('now') WHERE id = ?`
    ).bind(result || null, id).run().catch(() => {});
  }

  async markError(id: number, error: string): Promise<void> {
    await this.db.prepare(
      `UPDATE command_queue SET status = 'error', error = ?, processed_at = datetime('now') WHERE id = ?`
    ).bind(error, id).run().catch(() => {});
  }
}
