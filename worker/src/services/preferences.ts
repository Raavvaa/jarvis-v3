export class PrefSvc {
  constructor(private db: D1Database) {}

  async set(userId: string, key: string, value: string, cat = 'general'): Promise<void> {
    await this.db.prepare('INSERT INTO preferences (user_id,pkey,pvalue,category,updated_at) VALUES (?,?,?,?,datetime(\'now\')) ON CONFLICT(user_id,pkey) DO UPDATE SET pvalue=?,category=?,updated_at=datetime(\'now\')').bind(userId, key, value, cat, value, cat).run().catch(e => console.error('[Pref]', (e as Error).message));
  }

  async del(userId: string, key: string): Promise<boolean> {
    try {
      const r = await this.db.prepare('DELETE FROM preferences WHERE user_id=? AND pkey=?').bind(userId, key).run();
      return (r.meta?.changes || 0) > 0;
    } catch { return false; }
  }

  async all(userId: string): Promise<Record<string, string>> {
    try {
      const r = await this.db.prepare('SELECT pkey,pvalue FROM preferences WHERE user_id=? ORDER BY updated_at DESC').bind(userId).all<{ pkey: string; pvalue: string }>();
      const o: Record<string, string> = {};
      for (const x of r.results || []) o[x.pkey] = x.pvalue;
      return o;
    } catch { return {}; }
  }
}
