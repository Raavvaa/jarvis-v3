import type { Env } from './types';
import { TelegramService } from './services/telegram';
import { RemindersService } from './services/reminders';
import { formatDateTime } from './utils/date-parser';

export async function handleCron(env: Env): Promise<void> {
  const reminders = new RemindersService(env.DB);
  const tg = new TelegramService(env);
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);

  const due = await reminders.getDue();
  if (due.length === 0) return;

  console.log(`[Cron] ${due.length} reminders due`);

  for (const r of due) {
    try {
      await tg.sendMessage(r.chat_id,
        `⏰ Напоминание!\n\n${r.text}\n\n🕐 ${formatDateTime(r.remind_at, tz)}`
      );
      await reminders.markSent(r.id);
    } catch (e) {
      console.error(`[Cron] Reminder ${r.id}:`, (e as Error).message);
      // Fallback: отправляем хозяину в личку
      try {
        await tg.sendMessage(env.MY_TELEGRAM_ID, `⏰ ${r.text}`);
        await reminders.markSent(r.id);
      } catch {}
    }
  }
}
