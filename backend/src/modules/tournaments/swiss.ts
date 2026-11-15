/**
 * Турниры (этап 4, 15.11.2026, решение владельца): швейцарская система, победа 3 / ничья 1 / поражение 0,
 * дополнительные показатели — сумма VP, затем очки соперников. Чистые функции — их проверяют тесты.
 */

export type SwissGame = {
  round: number;
  playerA: string;
  /** null — бай (свободный круг): засчитывается победа, VP 0 */
  playerB: string | null;
  /** null — результат ещё не внесён */
  result: 'a' | 'b' | 'draw' | null;
  vpA: number | null;
  vpB: number | null;
};

export type Standing = {
  playerId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  vp: number;
  /** сумма очков соперников (бай не считается) */
  sos: number;
  games: number;
  byes: number;
  rank: number;
};

export const WIN = 3;
export const DRAW = 1;

/** Таблица по сыгранным (внесённым) партиям. order — порядок регистрации для полного равенства. */
export function standings(players: string[], games: SwissGame[]): Standing[] {
  const s = new Map<string, Standing>(players.map((id) => [id, { playerId: id, points: 0, wins: 0, draws: 0, losses: 0, vp: 0, sos: 0, games: 0, byes: 0, rank: 0 }]));
  const opponents = new Map<string, string[]>(players.map((id) => [id, []]));
  for (const g of games) {
    const a = s.get(g.playerA);
    if (!a) continue;
    if (g.playerB === null) {
      a.points += WIN;
      a.wins++;
      a.byes++;
      a.games++;
      continue;
    }
    const b = s.get(g.playerB);
    if (!b || g.result === null) continue;
    a.games++;
    b.games++;
    a.vp += g.vpA ?? 0;
    b.vp += g.vpB ?? 0;
    opponents.get(a.playerId)!.push(b.playerId);
    opponents.get(b.playerId)!.push(a.playerId);
    if (g.result === 'a') (a.points += WIN, a.wins++, b.losses++);
    else if (g.result === 'b') (b.points += WIN, b.wins++, a.losses++);
    else (a.points += DRAW, b.points += DRAW, a.draws++, b.draws++);
  }
  for (const row of s.values()) row.sos = opponents.get(row.playerId)!.reduce((sum, id) => sum + (s.get(id)?.points ?? 0), 0);
  const order = new Map(players.map((id, i) => [id, i]));
  const sorted = [...s.values()].sort((x, y) => y.points - x.points || y.vp - x.vp || y.sos - x.sos || order.get(x.playerId)! - order.get(y.playerId)!);
  sorted.forEach((row, i) => (row.rank = i + 1));
  return sorted;
}

/** Детерминированное перемешивание (первый раунд): одинаковый seed — одинаковые пары. */
export function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let x = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Пары следующего раунда. Первый раунд — случайно (seed). Дальше — по таблице сверху вниз без повторных встреч
 * (перебор с возвратом; если без повторов нельзя — допускаем повтор). Нечётное число — бай самому низкому в таблице,
 * у кого бая ещё не было. Возвращает [A, B | null].
 */
export function pairRound(players: string[], games: SwissGame[], seed: number): [string, string | null][] {
  const round = games.reduce((m, g) => Math.max(m, g.round), 0) + 1;
  const table = round === 1 ? shuffle(players, seed).map((playerId) => ({ playerId, byes: 0 })) : standings(players, games);
  let order = table.map((r) => r.playerId);
  const pairs: [string, string | null][] = [];

  if (order.length % 2 === 1) {
    const byeCount = new Map(table.map((r) => [r.playerId, r.byes]));
    const bye = [...order].reverse().find((id) => (byeCount.get(id) ?? 0) === 0) ?? order[order.length - 1]!;
    order = order.filter((id) => id !== bye);
    pairs.push([bye, null]);
  }

  const met = new Set<string>();
  for (const g of games) if (g.playerB) (met.add(`${g.playerA}|${g.playerB}`), met.add(`${g.playerB}|${g.playerA}`));
  const solve = (rest: string[], allowRematch: boolean): [string, string][] | null => {
    if (rest.length === 0) return [];
    const [first, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      const opp = others[i]!;
      if (!allowRematch && met.has(`${first}|${opp}`)) continue;
      const tail = solve([...others.slice(0, i), ...others.slice(i + 1)], allowRematch);
      if (tail) return [[first!, opp], ...tail];
    }
    return null;
  };
  const matched = solve(order, false) ?? solve(order, true) ?? [];
  // бай — последним столом
  return [...matched, ...pairs];
}
