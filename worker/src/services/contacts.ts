import type { DBContact } from '../types';

export class ContactsService {
  constructor(private db: D1Database) {}

  async upsert(contact: Partial<DBContact> & { telegram_id?: string; username?: string }): Promise<void> {
    if (!contact.telegram_id && !contact.username) return;

    // Уникальность по telegram_id
    const key = contact.telegram_id || `username:${contact.username}`;

    await this.db.prepare(
      `INSERT INTO contacts (telegram_id, username, first_name, last_name, role, nickname, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = COALESCE(?, username),
         first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         role = COALESCE(?, role),
         nickname = COALESCE(?, nickname),
         notes = COALESCE(?, notes),
         updated_at = datetime('now')`
    ).bind(
      contact.telegram_id || key,
      contact.username || null,
      contact.first_name || null,
      contact.last_name || null,
      contact.role || null,
      contact.nickname || null,
      contact.notes || null,
      contact.username || null,
      contact.first_name || null,
      contact.last_name || null,
      contact.role || null,
      contact.nickname || null,
      contact.notes || null,
    ).run().catch(e => console.error('[Contacts] upsert:', (e as Error).message));
  }

  async getAll(): Promise<DBContact[]> {
    try {
      const r = await this.db.prepare(
        `SELECT * FROM contacts ORDER BY updated_at DESC`
      ).all<DBContact>();
      return r.results || [];
    } catch { return []; }
  }

  async findByUsername(username: string): Promise<DBContact | null> {
    try {
      return await this.db.prepare(
        `SELECT * FROM contacts WHERE username = ? LIMIT 1`
      ).bind(username.replace('@', '')).first<DBContact>();
    } catch { return null; }
  }
}
