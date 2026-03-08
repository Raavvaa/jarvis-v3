import type { Env } from './types';
import { TgSvc } from './services/telegram';
import { RemSvc } from './services/reminders';
import { fmtDt } from './utils/date-parser';

export async function handleCron(env: Env): Promise<void> {
  const rem = new RemSvc(env.DB);
  const tg = new TgSvc(env);
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);
  const list = await rem.due();
  if (list.length === 0) return;
  console.log(`[Cron] ${list.length} reminders due`);
  for (const r of list) {
    try {
      await tg.send(r.chat_id, `⏰ Напоминание, сэр!\n\n${r.remind_text}\n\n🕐 ${fmtDt(r.remind_at, tz)}`);
      await rem.markSent(r.id);
    } catch (e) {
      console.error(`[Cron] ${r.id}:`, (e as Error).message);
      try { await tg.send(env.MY_TELEGRAM_ID, `⏰ ${r.remind_text}`); await rem.markSent(r.id); } catch {}
    }
  }
}
