/**
 * Клубная лига (этап 3, 15.11.2026, решение владельца): рейтинг Эло, отдельно по каждой игре, сезоны — кварталы.
 * Чистые функции без базы — их проверяют тесты. Рейтинг считается заново по всем подтверждённым партиям сезона
 * в порядке времени игры, поэтому позднее подтверждение не ломает порядок.
 */

export const ELO_START = 1000;
export const ELO_K = 32;
/** Время клуба: UTC+5. */
const OFFSET_MS = 5 * 60 * 60 * 1000;

export const LEAGUE_GAMES = ['40k', 'aos', 'kt', 'warcry'] as const;
export type LeagueGame = (typeof LEAGUE_GAMES)[number];
export const isLeagueGame = (v: unknown): v is LeagueGame => typeof v === 'string' && (LEAGUE_GAMES as readonly string[]).includes(v);

/** Сезон — календарный квартал по времени клуба: «2026-Q4» (октябрь–декабрь). */
export function seasonOf(date: Date): string {
  const d = new Date(date.getTime() + OFFSET_MS);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** Подпись сезона: «IV квартал 2026 · окт–дек». */
export function seasonLabel(season: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(season);
  if (!m) return season;
  const q = Number(m[2]);
  const months = ['янв–мар', 'апр–июн', 'июл–сен', 'окт–дек'][q - 1];
  return `${['I', 'II', 'III', 'IV'][q - 1]} квартал ${m[1]} · ${months}`;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Новые рейтинги после партии. scoreA: 1 — победа A, 0.5 — ничья, 0 — победа B. */
export function eloUpdate(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, k = ELO_K): [number, number] {
  const ea = expectedScore(ratingA, ratingB);
  const delta = k * (scoreA - ea);
  return [ratingA + delta, ratingB - delta];
}

export type LeagueResult = {
  id: string;
  playerA: string;
  playerB: string;
  /** 'a' — победил A, 'b' — победил B, 'draw' — ничья */
  outcome: 'a' | 'b' | 'draw';
  startsAt: Date;
};

export type LeagueRow = {
  userId: string;
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** изменение рейтинга за последнюю партию */
  lastDelta: number;
};

/** Таблица лиги по партиям (одна игра, один сезон): по убыванию рейтинга, при равенстве — больше партий выше. */
export function computeLeague(results: LeagueResult[]): LeagueRow[] {
  const rows = new Map<string, LeagueRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { userId: id, rating: ELO_START, games: 0, wins: 0, draws: 0, losses: 0, lastDelta: 0 }));
    return r;
  };
  const ordered = [...results].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime() || x.id.localeCompare(y.id));
  for (const g of ordered) {
    if (g.playerA === g.playerB) continue;
    const a = row(g.playerA);
    const b = row(g.playerB);
    const score = g.outcome === 'a' ? 1 : g.outcome === 'b' ? 0 : 0.5;
    const [na, nb] = eloUpdate(a.rating, b.rating, score);
    a.lastDelta = na - a.rating;
    b.lastDelta = nb - b.rating;
    a.rating = na;
    b.rating = nb;
    a.games++;
    b.games++;
    if (score === 1) (a.wins++, b.losses++);
    else if (score === 0) (b.wins++, a.losses++);
    else (a.draws++, b.draws++);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, rating: Math.round(r.rating), lastDelta: Math.round(r.lastDelta) }))
    .sort((x, y) => y.rating - x.rating || y.games - x.games || x.userId.localeCompare(y.userId));
}

/** Результат с точки зрения игрока: 'win' | 'loss' | 'draw' → исход партии для пары (A, B). */
export function outcomeFor(isA: boolean, mine: 'win' | 'loss' | 'draw'): 'a' | 'b' | 'draw' {
  if (mine === 'draw') return 'draw';
  return (mine === 'win') === isA ? 'a' : 'b';
}

/** Исход партии глазами игрока. */
export function mineOf(isA: boolean, outcome: 'a' | 'b' | 'draw'): 'win' | 'loss' | 'draw' {
  if (outcome === 'draw') return 'draw';
  return (outcome === 'a') === isA ? 'win' : 'loss';
}

/** Через сколько после конца игры спрашивать результат и когда неоспоренный результат засчитывается. */
export const ASK_AFTER_MS = 60 * 60 * 1000;
export const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000;
