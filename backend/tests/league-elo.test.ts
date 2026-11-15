import { describe, expect, test } from 'bun:test';
import { computeLeague, eloUpdate, mineOf, outcomeFor, seasonLabel, seasonOf } from '../src/modules/league/elo';

const at = (iso: string) => new Date(iso);

describe('лига: Эло (этап 3, 15.11.2026)', () => {
  test('равные игроки: победа +16 / −16 при K=32', () => {
    const [a, b] = eloUpdate(1000, 1000, 1);
    expect(a).toBeCloseTo(1016);
    expect(b).toBeCloseTo(984);
  });
  test('ничья с более сильным поднимает слабого', () => {
    const [weak, strong] = eloUpdate(1000, 1200, 0.5);
    expect(weak).toBeGreaterThan(1000);
    expect(strong).toBeLessThan(1200);
  });
  test('таблица: порядок партий — по времени игры, а не по порядку подтверждения', () => {
    const games = [
      { id: '2', playerA: 'u1', playerB: 'u3', outcome: 'a' as const, startsAt: at('2026-11-14T15:00:00Z') },
      { id: '1', playerA: 'u1', playerB: 'u2', outcome: 'b' as const, startsAt: at('2026-11-13T15:00:00Z') },
    ];
    const t1 = computeLeague(games);
    const t2 = computeLeague([...games].reverse());
    expect(t1).toEqual(t2);
    const u1 = t1.find((r) => r.userId === 'u1')!;
    expect(u1).toMatchObject({ games: 2, wins: 1, losses: 1, draws: 0 });
    expect(t1[0]!.rating).toBeGreaterThanOrEqual(t1[1]!.rating);
  });
  test('сумма рейтингов сохраняется', () => {
    const t = computeLeague([
      { id: 'a', playerA: 'x', playerB: 'y', outcome: 'draw', startsAt: at('2026-11-01T10:00:00Z') },
      { id: 'b', playerA: 'y', playerB: 'z', outcome: 'a', startsAt: at('2026-11-02T10:00:00Z') },
    ]);
    const sum = t.reduce((s, r) => s + r.rating, 0);
    expect(Math.abs(sum - 3000)).toBeLessThanOrEqual(1);
  });
});

describe('лига: сезоны — кварталы по времени клуба', () => {
  test('граница квартала по UTC+5', () => {
    expect(seasonOf(at('2026-09-30T18:59:00Z'))).toBe('2026-Q3');
    expect(seasonOf(at('2026-09-30T19:00:00Z'))).toBe('2026-Q4');
    expect(seasonOf(at('2026-12-31T19:00:00Z'))).toBe('2027-Q1');
  });
  test('подпись сезона', () => {
    expect(seasonLabel('2026-Q4')).toBe('IV квартал 2026 · окт–дек');
  });
});

describe('лига: результат глазами игрока', () => {
  test('outcomeFor / mineOf — обратные', () => {
    for (const isA of [true, false]) for (const m of ['win', 'loss', 'draw'] as const) expect(mineOf(isA, outcomeFor(isA, m))).toBe(m);
    expect(outcomeFor(false, 'win')).toBe('b');
  });
});
