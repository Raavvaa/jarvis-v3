import type { Env, ProcessedMessage } from '../types';
import { TelegramService } from '../services/telegram';
import { PreferencesService } from '../services/preferences';
import { RemindersService } from '../services/reminders';
import { ContactsService } from '../services/contacts';
import { formatDateTime } from '../utils/date-parser';

export async function handleBuiltinCommand(msg: ProcessedMessage, env: Env): Promise<boolean> {
  const tg = new TelegramService(env);
  const lower = msg.cleanedText.toLowerCase().trim();
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);
  const opts = { businessConnectionId: msg.businessConnectionId };

  if (lower === '/start' || lower === 'start') {
    await tg.sendMessage(msg.chatId, `🤖 Привет! Я Джарвис — твой ИИ-ассистент.

Напиши "Джарвис, ..." или "/ask ..." чтобы начать.
/help — справка по командам`, opts);
    return true;
  }

  if (lower === '/help') {
    await tg.sendMessage(msg.chatId, `📚 Команды Джарвиса:

• "Джарвис, ..." — задать вопрос
• "Запомни, что ..." — сохранить информацию  
• "Напомни в 15:00 ..." — создать напоминание
• "Включи режим флирта/делового/юмора"
• /memory — что я знаю
• /reminders — напоминания
• /contacts — контакты
• /stats — статистика`, opts);
    return true;
  }

  if (lower === '/memory') {
    const all = await new PreferencesService(env.DB).getAll(msg.userId);
    const entries = Object.entries(all);
    const text = entries.length === 0
      ? '🧠 Пока ничего не запомнил.'
      : `🧠 Что я знаю:\n\n${entries.map(([k, v]) => `• ${k}: ${v}`).join('\n')}`;
    await tg.sendMessage(msg.chatId, text, opts);
    return true;
  }

  if (lower === '/reminders') {
    const upcoming = await new RemindersService(env.DB).getUpcoming(msg.userId);
    const text = upcoming.length === 0
      ? '⏰ Нет активных напоминаний.'
      : `⏰ Напоминания:\n\n${upcoming.map((r, i) => `${i + 1}. ${r.text} — ${formatDateTime(r.remind_at, tz)}`).join('\n')}`;
    await tg.sendMessage(msg.chatId, text, opts);
    return true;
  }

  if (lower === '/contacts') {
    if (!msg.isFromOwner) return false;
    const contacts = await new ContactsService(env.DB).getAll();
    const text = contacts.length === 0
      ? '👥 Контакты пусты.'
      : `👥 Контакты:\n\n${contacts.map(c => 
          `• ${c.nickname || c.first_name || '?'} (${c.role || '?'}${c.username ? `, @${c.username}` : ''})`
        ).join('\n')}`;
    await tg.sendMessage(msg.chatId, text, opts);
    return true;
  }

  if (lower === '/stats') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const s = await env.DB.prepare(
        `SELECT COUNT(*) as c, SUM(tokens_in+tokens_out) as t, AVG(latency_ms) as l FROM request_logs WHERE created_at >= ?`
      ).bind(today).first<{ c: number; t: number; l: number }>();
      const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM request_logs`).first<{ c: number }>();
      await tg.sendMessage(msg.chatId,
        `📊 Сегодня: ${s?.c || 0} запросов, ${s?.t || 0} токенов, ~${Math.round(s?.l || 0)}ms\nВсего: ${total?.c || 0}`, opts);
    } catch {
      await tg.sendMessage(msg.chatId, '📊 Нет статистики.', opts);
    }
    return true;
  }

  return false;
}
