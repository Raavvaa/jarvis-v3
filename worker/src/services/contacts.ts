import type { DBContact } from '../types';

export class ContactSvc {
  constructor(private db: D1Database) {}

  async upsert(c: Partial<DBContact>): Promise<void> {
    const tid = c.telegram_id || (c.username ? 'u:' + c.username : null);
    if (!tid) return;
    await this.db.prepare('INSERT INTO contacts (telegram_id,username,first_name,last_name,role,nickname,notes,updated_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\')) ON CONFLICT(telegram_id) DO UPDATE SET username=COALESCE(?,username),first_name=COALESCE(?,first_name),last_name=COALESCE(?,last_name),role=COALESCE(?,role),nickname=COALESCE(?,nickname),notes=COALESCE(?,notes),updated_at=datetime(\'now\')').bind(tid, c.username || null, c.first_name || null, c.last_name || null, c.role || null, c.nickname || null, c.notes || null, c.username || null, c.first_name || null, c.last_name || null, c.role || null, c.nickname || null, c.notes || null).run().catch(e => console.error('[Contact]', (e as Error).message));
  }

  async getAll(): Promise<DBContact[]> {
    try { const r = await this.db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC').all<DBContact>(); return r.results || []; } catch { return []; }
  }

  async findByUsername(u: string): Promise<DBContact | null> {
    try { return await this.db.prepare('SELECT * FROM contacts WHERE username=? LIMIT 1').bind(u.replace('@', '')).first<DBContact>(); } catch { return null; }
  }
}
