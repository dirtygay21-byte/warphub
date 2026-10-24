/** Журнал игры на двух телефонах (T1): код игры и правила добавления событий. */
import { describe, expect, test } from 'bun:test';
import { checkAppend, CODE_LENGTH, generateCode, MAX_EVENT_BYTES, MAX_EVENTS, normalizeCode } from '../src/modules/online-games/rules';

const ev = (seq: number, extra: Record<string, unknown> = {}) => ({ id: `e${seq}`, seq, type: seq === 1 ? 'game-created' : 'player-set', seat: null, ...extra });

describe('код игры', () => {
  test('5 символов без похожих; ввод без учёта регистра, пробелов и дефисов', () => {
    const c = generateCode();
    expect(c).toHaveLength(CODE_LENGTH);
    expect(c).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    expect(normalizeCode(' k7m-2q ')).toBe('K7M2Q');
    for (const bad of ['K7M2', 'K7M2QX', 'K0M2Q', 'KIM2Q', 5, null]) expect(normalizeCode(bad)).toBeNull();
  });
});

describe('checkAppend', () => {
  test('по порядку: первое — создание игры, дальше следующий номер', () => {
    expect(checkAppend({ lastSeq: 0, expectedSeq: 0, authorSeat: 'p1', event: ev(1) })).toBeNull();
    expect(checkAppend({ lastSeq: 0, expectedSeq: 0, authorSeat: 'p1', event: ev(1, { type: 'player-set' }) })?.code).toBe('BAD_EVENT');
    expect(checkAppend({ lastSeq: 3, expectedSeq: 3, authorSeat: 'p2', event: ev(4) })).toBeNull();
    expect(checkAppend({ lastSeq: 3, expectedSeq: 3, authorSeat: 'p2', event: ev(4, { type: 'game-created' }) })?.code).toBe('BAD_EVENT');
    expect(checkAppend({ lastSeq: 3, expectedSeq: 3, authorSeat: 'p2', event: ev(5) })?.code).toBe('BAD_EVENT');
  });
  test('отставший телефон — конфликт', () => {
    expect(checkAppend({ lastSeq: 5, expectedSeq: 4, authorSeat: 'p1', event: ev(5) })?.code).toBe('CONFLICT');
  });
  test('своё место или общее событие; чужое — нельзя', () => {
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p2', event: ev(2, { seat: 'p2' }) })).toBeNull();
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p2', event: ev(2, { seat: null }) })).toBeNull();
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p2', event: ev(2, { seat: 'p1' }) })?.code).toBe('SEAT');
  });
  test('размер события и длина журнала ограничены; событие — объект с type и id', () => {
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p1', event: ev(2, { code: 'x'.repeat(MAX_EVENT_BYTES) }) })?.code).toBe('TOO_LARGE');
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p1', event: ev(2, { code: 'x'.repeat(20_000) }) })).toBeNull();
    expect(checkAppend({ lastSeq: MAX_EVENTS, expectedSeq: MAX_EVENTS, authorSeat: 'p1', event: ev(MAX_EVENTS + 1) })?.code).toBe('FULL');
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p1', event: [] })?.code).toBe('BAD_EVENT');
    expect(checkAppend({ lastSeq: 1, expectedSeq: 1, authorSeat: 'p1', event: { seq: 2 } })?.code).toBe('BAD_EVENT');
  });
});
