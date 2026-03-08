export function parseDateTime(text: string, tzOffset: number = 3): string | null {
  const now = new Date();
  const userNow = new Date(now.getTime() + tzOffset * 3600000);

  // "через X минут/часов/дней"
  const relMatch = text.match(/через\s+(\d+)\s*(минут[уы]?|мин|час[аов]*|дн[яей]*|день|неделю|недел[иь])/i);
  if (relMatch) {
    const amt = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const r = new Date(userNow);

    if (unit.startsWith('мин')) r.setMinutes(r.getMinutes() + amt);
    else if (unit.startsWith('час')) r.setHours(r.getHours() + amt);
    else if (unit.startsWith('дн') || unit === 'день') r.setDate(r.getDate() + amt);
    else if (unit.startsWith('недел')) r.setDate(r.getDate() + amt * 7);

    return new Date(r.getTime() - tzOffset * 3600000).toISOString();
  }

  // "в HH:MM"
  const absMatch = text.match(/(?:в|на)\s+(\d{1,2})[:\.](\d{2})/i);
  if (absMatch) {
    const h = parseInt(absMatch[1], 10);
    const m = parseInt(absMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const r = new Date(userNow);
      if (text.match(/послезавтра/i)) r.setDate(r.getDate() + 2);
      else if (text.match(/завтра/i)) r.setDate(r.getDate() + 1);
      else if (h < userNow.getHours() || (h === userNow.getHours() && m <= userNow.getMinutes())) {
        r.setDate(r.getDate() + 1);
      }
      r.setHours(h, m, 0, 0);
      return new Date(r.getTime() - tzOffset * 3600000).toISOString();
    }
  }

  // "завтра" без времени
  if (text.match(/завтра/i) && !absMatch) {
    const r = new Date(userNow);
    r.setDate(r.getDate() + 1);
    r.setHours(9, 0, 0, 0);
    return new Date(r.getTime() - tzOffset * 3600000).toISOString();
  }

  return null;
}

export function formatDateTime(iso: string, tzOffset: number = 3): string {
  const d = new Date(new Date(iso).getTime() + tzOffset * 3600000);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')} в ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
