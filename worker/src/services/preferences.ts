export class PreferencesService {
  constructor(private db: D1Database) {}

  async set(userId: string, key: string, value: string, category: string = 'general'): Promise<void> {
    await this.db.prepare(
      `INSERT INTO preferences (user_id, key, value, category, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, key) DO UPDATE SET value = ?, category = ?, updated_at = datetime('now')`
    ).bind(userId, key, value, category, value, category).run()
      .catch(e => console.error('[Prefs] set:', (e as Error).message));
  }

  async getAll(userId: string): Promise<Record<string, string>> {
    try {
      const r = await this.db.prepare(
        `SELECT key, value FROM preferences WHERE user_id = ? ORDER BY updated_at DESC`
      ).bind(userId).all<{ key: string; value: string }>();
      const prefs: Record<string, string> = {};
      for (const row of r.results || []) prefs[row.key] = row.value;
      return prefs;
    } catch { return {}; }
  }
}
