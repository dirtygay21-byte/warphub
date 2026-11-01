/**
 * Детерминированная случайность игры (G1.2): одинаковый seed и одинаковые «части» → одинаковый результат на любом
 * устройстве. Math.random в игре не используется — иначе отмена, перезагрузка и второй телефон дали бы другие карты.
 */
import type { Seat } from './types';

/** 32-битный хеш строки (cyrb53, младшие 32 бита) — для смешивания seed с местом игрока и номером перемешивания. */
export function hashSeed(...parts: (string | number)[]): number {
  const str = parts.join('\u0001');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

/** Генератор [0, 1) — mulberry32 от хеша seed и частей. */
export function makeRng(seed: string, ...parts: (string | number)[]): () => number {
  let a = hashSeed(seed, ...parts);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое от 0 до n − 1. */
export function pickIndex(rng: () => number, n: number): number {
  if (!(n > 0)) throw new RangeError('pickIndex: n должно быть больше 0');
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** Перемешивание Фишера — Йетса; исходный массив не меняется. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Порядок колоды вторичных игрока: зависит от seed игры, места и номера перемешивания (0 — первое).
 * Колода атакующего и защитника — одни и те же 18 карт, но перемешаны независимо.
 */
export function deckOrder(seed: string, seat: Seat, shuffles: number, cards: readonly string[]): string[] {
  return shuffle(cards, makeRng(seed, 'deck', seat, shuffles));
}

/**
 * Бросок кубиков «кто выше» (по D6 каждому, ничья — переброс). key различает броски одной игры
 * ('roles', 'first-turn' …). attempt — номер повторного броска того же key (по умолчанию 0).
 */
export function rollOff(seed: string, key: string, attempt = 0): { rolls: { p1: number; p2: number }[]; winner: Seat } {
  const rng = makeRng(seed, 'roll-off', key, attempt);
  const rolls: { p1: number; p2: number }[] = [];
  for (;;) {
    const r = { p1: pickIndex(rng, 6) + 1, p2: pickIndex(rng, 6) + 1 };
    rolls.push(r);
    if (r.p1 !== r.p2) return { rolls, winner: r.p1 > r.p2 ? 'p1' : 'p2' };
  }
}

/** Бросок одного D6 по seed (Dominatus: выбор локации фазы). attempt — номер повторного броска. */
export function rollD6(seed: string, key: string, attempt = 0): number {
  return pickIndex(makeRng(seed, 'd6', key, attempt), 6) + 1;
}

/**
 * Случайная раскладка: индекс среди раскладок пары (в порядке A, B, C) по seed и номеру выбора.
 * Отмена возвращает номер — повторный случайный выбор даёт ту же раскладку.
 */
export function layoutPick(seed: string, attempt: number, count: number): number {
  return pickIndex(makeRng(seed, 'layout', attempt), count);
}

/** Новый seed игры: 128 бит из криптографического генератора (браузер, Telegram WebView, Bun, Node). */
export function newSeed(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
