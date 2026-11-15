/**
 * Язык сообщений движка 40K (переключатель RU/EN, 16.11.2026): движок — чистые функции, поэтому язык передаётся
 * явно (computeRoster(…, lang)) и действует только на время синхронного расчёта. По умолчанию — русский.
 */
export type EngineLang = 'ru' | 'en';
let current: EngineLang = 'ru';

/** Выполнить fn с языком сообщений lang (вложенные вызовы восстанавливают прежний язык). */
export function withLang<T>(lang: EngineLang, fn: () => T): T {
  const prev = current;
  current = lang;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/** Русская или английская строка — по текущему языку расчёта. */
export const tr = (ru: string, en: string): string => (current === 'en' ? en : ru);
export const engineLang = (): EngineLang => current;
