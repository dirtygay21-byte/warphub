import { describe, expect, test } from 'bun:test';
import { pairRound, standings, type SwissGame } from '../src/modules/tournaments/swiss';

const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const play = (round: number, pairs: [string, string | null][], winner: 'a' | 'b' | 'draw' = 'a'): SwissGame[] =>
  pairs.map(([a, b]) => ({ round, playerA: a, playerB: b, result: b ? winner : null, vpA: b ? 60 : null, vpB: b ? 40 : null }));

describe('турнир: швейцарская система (этап 4)', () => {
  test('первый раунд: все игроки ровно по одному разу, детерминированно по seed', () => {
    const r1 = pairRound(P, [], 42);
    expect(r1).toHaveLength(3);
    expect(r1.flat().sort()).toEqual([...P].sort());
    expect(pairRound(P, [], 42)).toEqual(r1);
  });

  test('без повторных встреч за 5 раундов при 6 игроках', () => {
    let games: SwissGame[] = [];
    for (let round = 1; round <= 5; round++) {
      const pairs = pairRound(P, games, 7);
      games = [...games, ...play(round, pairs)];
    }
    const seen = new Set<string>();
    for (const g of games) {
      const key = [g.playerA, g.playerB].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('нечётное число: бай самому низкому без бая, каждый получает не больше одного', () => {
    const five = P.slice(0, 5);
    let games: SwissGame[] = [];
    for (let round = 1; round <= 5; round++) {
      const pairs = pairRound(five, games, 3);
      const byes = pairs.filter(([, b]) => b === null);
      expect(byes).toHaveLength(1);
      games = [...games, ...play(round, pairs)];
    }
    const byeCount = new Map<string, number>();
    for (const g of games) if (g.playerB === null) byeCount.set(g.playerA, (byeCount.get(g.playerA) ?? 0) + 1);
    expect([...byeCount.values()].every((n) => n === 1)).toBe(true);
  });

  test('таблица: 3/1/0, бай — победа без VP, равенство очков решают VP, затем очки соперников', () => {
    const games: SwissGame[] = [
      { round: 1, playerA: 'p1', playerB: 'p2', result: 'a', vpA: 70, vpB: 50 },
      { round: 1, playerA: 'p3', playerB: 'p4', result: 'draw', vpA: 55, vpB: 55 },
      { round: 1, playerA: 'p5', playerB: null, result: null, vpA: null, vpB: null },
    ];
    const t = standings(['p1', 'p2', 'p3', 'p4', 'p5'], games);
    expect(t.map((r) => r.playerId)).toEqual(['p1', 'p5', 'p3', 'p4', 'p2']);
    expect(t.find((r) => r.playerId === 'p5')).toMatchObject({ points: 3, byes: 1, vp: 0 });
    expect(t.find((r) => r.playerId === 'p3')).toMatchObject({ points: 1, draws: 1, vp: 55 });
  });

  test('второй раунд: лидеры играют друг с другом', () => {
    const games: SwissGame[] = [
      { round: 1, playerA: 'p1', playerB: 'p2', result: 'a', vpA: 80, vpB: 20 },
      { round: 1, playerA: 'p3', playerB: 'p4', result: 'a', vpA: 70, vpB: 30 },
    ];
    const r2 = pairRound(['p1', 'p2', 'p3', 'p4'], games, 1);
    expect(r2).toContainEqual(['p1', 'p3']);
    expect(r2).toContainEqual(['p4', 'p2']);
  });
});
