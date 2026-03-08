import type { Env, Parsed } from '../types';
import { TgSvc } from '../services/telegram';
import { PrefSvc } from '../services/preferences';
import { RemSvc } from '../services/reminders';
import { ContactSvc } from '../services/contacts';
import { fmtDt } from '../utils/date-parser';

export async function builtinCmd(msg: Parsed, env: Env): Promise<boolean> {
  const tg = new TgSvc(env);
  const lo = msg.cleanText.toLowerCase().trim();
  const tz = parseInt(env.TIMEZONE_OFFSET || '3', 10);
  const o = { biz: msg.bizConnId };

  if (lo === '/start') {
    await tg.send(msg.chatId, '🤖 Привет, сэр! Джарвис к вашим услугам. Пишите что угодно — я на связи 24/7.', o);
    return true;
  }

  if (lo === '/help') {
    await tg.send(msg.chatId, `📚 Команды:\n• Просто напиши мне — отвечу\n• "запомни X = Y" — сохраню\n• "забудь X" — удалю\n• "что ты помнишь" — покажу\n• "напомни в 15:00 текст" — напоминание\n• "запиши в избранное текст" — в Saved\n• "не отвечай @user" — блокирую\n• /contacts — контакты\n• /reminders — напоминания\n• /stats — статистика`, o);
    return true;
  }

  if (lo === '/memory' || lo === 'что ты помнишь' || lo === 'что ты помнишь?') {
    if (!msg.isOwner) { await tg.send(msg.chatId, 'Конфиденциальная информация, сэр бы не одобрил.', o); return true; }
    const all = await new PrefSvc(env.DB).all(msg.userId);
    const e = Object.entries(all);
    await tg.send(msg.chatId, e.length === 0 ? '🧠 Пока ничего не запомнил, сэр.' : `🧠 Вот что я знаю, сэр:\n\n${e.map(([k, v]) => `• ${k}: ${v}`).join('\n')}`, o);
    return true;
  }

  if (lo === '/reminders' || lo === 'напоминания') {
    if (!msg.isOwner) return false;
    const up = await new RemSvc(env.DB).upcoming(msg.userId);
    await tg.send(msg.chatId, up.length === 0 ? '⏰ Нет активных напоминаний, сэр.' : `⏰ Напоминания:\n\n${up.map((r, i) => `${i + 1}. ${r.remind_text} — ${fmtDt(r.remind_at, tz)}`).join('\n')}`, o);
    return true;
  }

  if (lo === '/contacts' || lo === 'список контактов') {
    if (!msg.isOwner) return false;
    const c = await new ContactSvc(env.DB).getAll();
    await tg.send(msg.chatId, c.length === 0 ? '👥 Контактов пока нет, сэр.' : `👥 Контакты:\n\n${c.map(x => `• ${x.nickname || x.first_name || '?'} (${x.role || '?'}${x.username ? ', @' + x.username : ''})`).join('\n')}`, o);
    return true;
  }

  if (lo === '/stats') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const s = await env.DB.prepare('SELECT COUNT(*) as c, SUM(tokens_in+tokens_out) as t, AVG(latency_ms) as l FROM request_logs WHERE created_at>=?').bind(today).first<{ c: number; t: number; l: number }>();
      const tot = await env.DB.prepare('SELECT COUNT(*) as c FROM request_logs').first<{ c: number }>();
      await tg.send(msg.chatId, `📊 Сегодня: ${s?.c || 0} запросов, ${s?.t || 0} токенов, ~${Math.round(s?.l || 0)}ms\nВсего: ${tot?.c || 0}`, o);
    } catch { await tg.send(msg.chatId, '📊 Статистика пока пуста.', o); }
    return true;
  }

  return false;
}
