import { TRIGGERS, TRIGGER_CMDS } from '../config';
import type { TgMessage, Parsed } from '../types';

export function userName(m: TgMessage): string {
  if (!m.from) return 'Unknown';
  return [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
}

export function checkTrigger(text: string, botUser?: string): { hit: boolean; clean: string } {
  const lo = text.toLowerCase().trim();
  for (const c of TRIGGER_CMDS) {
    if (lo.startsWith(c)) return { hit: true, clean: text.slice(c.length).trim() };
  }
  for (const t of TRIGGERS) {
    if (lo.startsWith(t)) return { hit: true, clean: text.slice(t.length).replace(/^[,:\s]+/, '').trim() || text };
  }
  if (botUser && lo.includes(`@${botUser.toLowerCase()}`)) {
    return { hit: true, clean: text.replace(new RegExp(`@${botUser}`, 'gi'), '').trim() };
  }
  return { hit: false, clean: text };
}

export function parse(m: TgMessage, ownerId: string, botUser?: string): Parsed {
  const text = m.text || m.caption || '';
  const { hit, clean } = checkTrigger(text, botUser);
  return {
    chatId: m.chat.id.toString(),
    userId: m.from?.id.toString() || '0',
    userName: userName(m),
    text,
    triggered: hit,
    cleanText: clean,
    hasVoice: !!(m.voice || m.audio),
    hasPhoto: !!(m.photo && m.photo.length > 0),
    voiceFileId: m.voice?.file_id || m.audio?.file_id,
    photoFileId: m.photo ? m.photo[m.photo.length - 1]?.file_id : undefined,
    isGroup: m.chat.type === 'group' || m.chat.type === 'supergroup',
    isOwner: m.from?.id.toString() === ownerId,
    raw: m,
    bizConnId: m.business_connection_id,
  };
}

export function jsonParse<T>(text: string): T | null {
  try {
    const c = text.replace(/^