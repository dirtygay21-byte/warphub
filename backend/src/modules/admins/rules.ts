/** Проверка Telegram ID из формы админки (N2). Чистая функция — tests/admins-rules.test.ts. */
export function parseTelegramId(input: unknown): number | null {
  const s = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
  // Telegram ID пользователя — положительное целое (у ранних аккаунтов бывает короче 5 цифр, сейчас до 10–11);
  // берём с запасом, но в пределах точных чисел JS
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Пометка к администратору: обрезка пробелов, до 100 символов, пустая — null. */
export function cleanNote(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim().slice(0, 100);
  return t || null;
}
