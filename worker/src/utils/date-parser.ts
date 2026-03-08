export function parseDateTime(text: string, tz = 3): string | null {
  const now = new Date();
  const user = new Date(now.getTime() + tz * 3600000);

  const rel = text.match(/через\s+(\d+)\s*(минут[уы]?|мин|час[аов]*|дн[яей]*|день|неделю|недел[иь])/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const u = rel[2].toLowerCase();
    const r = new Date(user);
    if (u.startsWith('мин')) r.setMinutes(r.getMinutes() + n);
    else if (u.startsWith('час')) r.setHours(r.getHours() + n);
    else if (u.startsWith('дн') || u === 'день') r.setDate(r.getDate() + n);
    else if (u.startsWith('недел')) r.setDate(r.getDate() + n * 7);
    return new Date(r.getTime() - tz * 3600000).toISOString();
  }

  const abs = text.match(/(?:в|на)\s+(\d{1,2})[:\.](\d{2})/i);
  if (abs) {
    const h = parseInt(abs[1], 10);
    const m = parseInt(abs[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const r = new Date(user);
      if (text.match(/послезавтра/i)) r.setDate(r.getDate() + 2);
      else if (text.match(/завтра/i)) r.setDate(r.getDate() + 1);
      else if (h < user.getHours() || (h === user.getHours() && m <= user.getMinutes())) r.setDate(r.getDate() + 1);
      r.setHours(h, m, 0, 0);
      return new Date(r.getTime() - tz * 3600000).toISOString();
    }
  }

  if (text.match(/завтра/i) && !abs) {
    const r = new Date(user);
    r.setDate(r.getDate() + 1);
    r.setHours(9, 0, 0, 0);
    return new Date(r.getTime() - tz * 3600000).toISOString();
  }

  return null;
}

export function fmtDt(iso: string, tz = 3): string {
  const d = new Date(new Date(iso).getTime() + tz * 3600000);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')} в ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
