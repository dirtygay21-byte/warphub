/**
 * Правила журнала игры на двух телефонах (T1). Чистые функции — tests/online-games-rules.test.ts.
 * Сервер не разбирает правила игры (их проверяет движок на телефонах): он следит за порядком, местом автора и размером.
 */
export type Seat = 'p1' | 'p2';

/** Символы кода: без похожих (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
/** Лимиты: событие (с кодом ростера) и длина журнала одной игры. */
export const MAX_EVENT_BYTES = 32 * 1024;
export const MAX_EVENTS = 5000;

export function generateCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return s;
}

/** Ввод кода: регистр и пробелы не важны; null — не похоже на код. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  return s.length === CODE_LENGTH && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

export type AppendError = { code: 'CONFLICT' | 'BAD_EVENT' | 'SEAT' | 'TOO_LARGE' | 'FULL'; message: string };

/**
 * Можно ли добавить событие: номер — следующий после lastSeq (иначе конфликт: телефон отстал и должен взять
 * свежий журнал), место события — места автора или общее (null), первое событие — создание игры, размер и длина
 * журнала в пределах лимитов.
 */
export function checkAppend(input: { lastSeq: number; expectedSeq: number; authorSeat: Seat; event: unknown }): AppendError | null {
  const { lastSeq, expectedSeq, authorSeat, event } = input;
  if (expectedSeq !== lastSeq) return { code: 'CONFLICT', message: `Журнал ушёл вперёд: последнее событие №${lastSeq}` };
  if (lastSeq >= MAX_EVENTS) return { code: 'FULL', message: `В игре уже ${MAX_EVENTS} событий` };
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { code: 'BAD_EVENT', message: 'Событие — объект' };
  const e = event as { seq?: unknown; seat?: unknown; type?: unknown; id?: unknown };
  if (typeof e.type !== 'string' || typeof e.id !== 'string') return { code: 'BAD_EVENT', message: 'У события нет type или id' };
  if (e.seq !== lastSeq + 1) return { code: 'BAD_EVENT', message: `Номер события должен быть ${lastSeq + 1}` };
  if (lastSeq === 0 && e.type !== 'game-created') return { code: 'BAD_EVENT', message: 'Первое событие — создание игры' };
  if (lastSeq > 0 && e.type === 'game-created') return { code: 'BAD_EVENT', message: 'Игра уже создана' };
  if (e.seat !== null && e.seat !== undefined && e.seat !== authorSeat) return { code: 'SEAT', message: 'Событие за чужое место' };
  if (new TextEncoder().encode(JSON.stringify(event)).length > MAX_EVENT_BYTES) return { code: 'TOO_LARGE', message: 'Событие больше 32 КБ' };
  return null;
}
