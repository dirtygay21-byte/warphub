/**
 * Клубная лига (этап 3, 15.11.2026): результаты партий, подтверждение соперником, таблица Эло по игре и сезону.
 * Учитываются только игры (услуга wh_game) за столом, где сидели ровно двое и обе записи подтверждены.
 */
import { and, asc, desc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { db } from '../../db';
import { gameResultsTable, reservationsTable, servicesTable, tablesTable, usersTable } from '../../db/schema';
import { gameLabel } from '../../config/booking';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import type { ReservationDetails } from '../booking/rules';
import { buildResultCard } from './card';
import { notifyKind, notifyKindAdmins } from '../notifications/hub';
import {
  ASK_AFTER_MS,
  AUTO_CONFIRM_MS,
  computeLeague,
  isLeagueGame,
  mineOf,
  outcomeFor,
  ratingAfter,
  seasonLabel,
  seasonOf,
  type LeagueGame,
} from './elo';

const DAY = 24 * 60 * 60 * 1000;
/** Партии старше этого не спрашиваем (сервер мог быть выключен). */
const ASK_WINDOW_MS = 3 * DAY;

export class LeagueError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_STATE' | 'BAD_INPUT',
    message: string,
  ) {
    super(message);
  }
}

type Brief = { id: string; firstName: string; lastName: string | null; username: string | null; telegramId: number };
const nameOf = (u: Pick<Brief, 'firstName' | 'lastName' | 'username'>) => formatUserName(u);

async function usersByIds(ids: string[]): Promise<Map<string, Brief>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, telegramId: usersTable.telegramId })
    .from(usersTable)
    .where(inArray(usersTable.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

// ------------------------------------------------------------------ задания по расписанию

/** Создать записи результатов для сыгранных партий и спросить обоих игроков (один раз на партию). */
export async function askForResults(now = new Date()) {
  const rows = await db
    .select({
      userId: reservationsTable.userId,
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      status: reservationsTable.status,
      details: reservationsTable.details,
      partySize: reservationsTable.partySize,
      createdAt: reservationsTable.createdAt,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(servicesTable.slug, 'wh_game'),
        eq(servicesTable.hasTrainer, false),
        inArray(reservationsTable.status, ['pending', 'confirmed']),
        lte(reservationsTable.endsAt, new Date(now.getTime() - ASK_AFTER_MS)),
        gte(reservationsTable.endsAt, new Date(now.getTime() - ASK_WINDOW_MS)),
      ),
    )
    .orderBy(asc(reservationsTable.createdAt));

  const slots = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.tableId === null || !r.startsAt) continue;
    const key = `${r.serviceId}:${r.tableId}:${r.startsAt.getTime()}`;
    slots.set(key, [...(slots.get(key) ?? []), r]);
  }

  for (const players of slots.values()) {
    // ровно двое, по одному месту, обе записи подтверждены, одна и та же игра
    if (players.length !== 2 || players.some((p) => p.status !== 'confirmed' || (p.partySize ?? 1) !== 1)) continue;
    const [a, b] = players as [(typeof rows)[number], (typeof rows)[number]];
    if (a.userId === b.userId) continue;
    const gameOf = (d: ReservationDetails | null) => (d?.kind === 'wh_player' ? (d.game ?? '40k') : null);
    const game = gameOf(a.details);
    if (!game || game !== gameOf(b.details) || !isLeagueGame(game)) continue;

    const [created] = await db
      .insert(gameResultsTable)
      .values({ game, serviceId: a.serviceId, tableId: a.tableId, startsAt: a.startsAt!, endsAt: a.endsAt, playerA: a.userId, playerB: b.userId })
      .onConflictDoNothing()
      .returning();
    if (!created) continue;

    const users = await usersByIds([a.userId, b.userId]);
    const when = formatClubDateTime(created.startsAt, created.endsAt);
    for (const [me, other] of [[a.userId, b.userId], [b.userId, a.userId]] as const) {
      void notifyKind(
        'result_request',
        users.get(me)?.telegramId,
        { игра: escapeHtml(gameLabel(game)), когда: escapeHtml(when), соперник: escapeHtml(nameOf(users.get(other) ?? { firstName: 'соперник', lastName: null, username: null })) },
        { buttons: [{ text: 'Внести результат', path: '/league' }] },
      );
    }
  }
}

/** Неоспоренный результат засчитывается через 48 часов после внесения. */
export async function autoConfirmResults(now = new Date()) {
  await db
    .update(gameResultsTable)
    .set({ status: 'confirmed', confirmedAt: now, confirmedBy: 'auto' })
    .where(and(eq(gameResultsTable.status, 'reported'), lte(gameResultsTable.reportedAt, new Date(now.getTime() - AUTO_CONFIRM_MS))));
  invalidateLeague();
}

export async function runLeagueJobs(now = new Date()) {
  // раз в 5 минут вместе с остальными уведомлениями; создание идемпотентно (уникальный слот партии)
  await askForResults(now);
  await autoConfirmResults(now);
}

// ------------------------------------------------------------------ игрок

export type MyResultView = {
  id: string;
  game: string;
  gameLabel: string;
  startsAt: string;
  endsAt: string | null;
  tableName: string | null;
  opponent: { firstName: string; lastName: string | null; username: string | null };
  status: 'awaiting' | 'reported' | 'confirmed' | 'disputed' | 'void';
  /** исход глазами игрока */
  result: 'win' | 'loss' | 'draw' | null;
  reportedByMe: boolean;
  /** что может сделать игрок: report — внести, confirm — подтвердить/оспорить, none */
  action: 'report' | 'confirm' | 'none';
  season: string;
  /** сторона игрока в партии — для картинки результата */
  side: 'a' | 'b';
};

export async function listMyResults(userId: string, limit = 30): Promise<MyResultView[]> {
  const rows = await db
    .select({ r: gameResultsTable, tableName: tablesTable.name })
    .from(gameResultsTable)
    .leftJoin(tablesTable, eq(gameResultsTable.tableId, tablesTable.id))
    .where(or(eq(gameResultsTable.playerA, userId), eq(gameResultsTable.playerB, userId)))
    .orderBy(desc(gameResultsTable.startsAt))
    .limit(limit);
  const users = await usersByIds(rows.flatMap(({ r }) => [r.playerA, r.playerB]));
  return rows.map(({ r, tableName }) => {
    const isA = r.playerA === userId;
    const other = users.get(isA ? r.playerB : r.playerA);
    const reportedByMe = r.reportedBy === userId;
    const action = r.status === 'awaiting' || (r.status === 'reported' && reportedByMe) ? 'report' : r.status === 'reported' ? 'confirm' : 'none';
    return {
      id: r.id,
      game: r.game,
      gameLabel: gameLabel(r.game),
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      tableName: tableName ?? null,
      opponent: { firstName: other?.firstName ?? 'Игрок', lastName: other?.lastName ?? null, username: other?.username ?? null },
      status: r.status,
      result: r.outcome ? mineOf(isA, r.outcome) : null,
      reportedByMe,
      action,
      season: seasonOf(r.startsAt),
      side: isA ? 'a' : 'b',
    };
  });
}

async function loadOwn(userId: string, id: string) {
  const [r] = await db.select().from(gameResultsTable).where(eq(gameResultsTable.id, id)).limit(1);
  if (!r) throw new LeagueError('NOT_FOUND', 'Партия не найдена');
  if (r.playerA !== userId && r.playerB !== userId) throw new LeagueError('FORBIDDEN', 'Это не ваша партия');
  return r;
}

const RESULT_TEXT = { win: 'победа', loss: 'поражение', draw: 'ничья' } as const;

/** Игрок вносит результат (или меняет свой, пока соперник не подтвердил). */
export async function reportResult(userId: string, id: string, mine: unknown) {
  if (mine !== 'win' && mine !== 'loss' && mine !== 'draw') throw new LeagueError('BAD_INPUT', 'Укажите результат: победа, ничья или поражение');
  const r = await loadOwn(userId, id);
  if (!(r.status === 'awaiting' || (r.status === 'reported' && r.reportedBy === userId))) {
    throw new LeagueError('BAD_STATE', 'Результат уже внесён соперником — подтвердите или оспорьте его');
  }
  const isA = r.playerA === userId;
  await db
    .update(gameResultsTable)
    .set({ outcome: outcomeFor(isA, mine), status: 'reported', reportedBy: userId, reportedAt: new Date() })
    .where(eq(gameResultsTable.id, id));

  const users = await usersByIds([r.playerA, r.playerB]);
  const opponentId = isA ? r.playerB : r.playerA;
  const theirs = mineOf(!isA, outcomeFor(isA, mine));
  void notifyKind(
    'result_confirm',
    users.get(opponentId)?.telegramId,
    {
      игра: escapeHtml(gameLabel(r.game)),
      когда: escapeHtml(formatClubDateTime(r.startsAt, r.endsAt)),
      соперник: escapeHtml(nameOf(users.get(userId)!)),
      результат: RESULT_TEXT[theirs],
    },
    { buttons: [{ text: 'Подтвердить', path: '/league' }] },
  );
  return { ok: true };
}

export async function confirmResult(userId: string, id: string) {
  const r = await loadOwn(userId, id);
  if (r.status !== 'reported' || r.reportedBy === userId) throw new LeagueError('BAD_STATE', 'Подтвердить можно только результат, который внёс соперник');
  await db.update(gameResultsTable).set({ status: 'confirmed', confirmedAt: new Date(), confirmedBy: 'opponent' }).where(eq(gameResultsTable.id, id));
  invalidateLeague();
  return { ok: true };
}

export async function disputeResult(userId: string, id: string, note: unknown) {
  const r = await loadOwn(userId, id);
  if (r.status !== 'reported' || r.reportedBy === userId) throw new LeagueError('BAD_STATE', 'Оспорить можно только результат, который внёс соперник');
  const text = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  await db.update(gameResultsTable).set({ status: 'disputed', note: text || null }).where(eq(gameResultsTable.id, id));
  const users = await usersByIds([r.playerA, r.playerB]);
  void notifyKindAdmins('admin_result_dispute', {
    игра: escapeHtml(gameLabel(r.game)),
    когда: escapeHtml(formatClubDateTime(r.startsAt, r.endsAt)),
    игроки: escapeHtml(`${nameOf(users.get(r.playerA)!)} — ${nameOf(users.get(r.playerB)!)}`),
    комментарий: escapeHtml(text),
  });
  return { ok: true };
}

// ------------------------------------------------------------------ таблица

let cache: { at: number; rows: (typeof gameResultsTable.$inferSelect)[] } | null = null;
function invalidateLeague() {
  cache = null;
  cardCache.clear();
}
async function confirmedResults() {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const rows = await db.select().from(gameResultsTable).where(and(eq(gameResultsTable.status, 'confirmed'), inArray(gameResultsTable.outcome, ['a', 'b', 'draw'])));
  cache = { at: Date.now(), rows };
  return rows;
}

export type LeagueTableView = {
  game: LeagueGame;
  season: string;
  seasonLabel: string;
  /** сезоны, где есть партии этой игры, плюс текущий — новые сверху */
  seasons: { id: string; label: string }[];
  rows: {
    rank: number;
    userId: string;
    name: string;
    username: string | null;
    rating: number;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    lastDelta: number;
    me: boolean;
  }[];
};

export async function getLeagueTable(userId: string | null, gameRaw: unknown, seasonRaw: unknown, now = new Date()): Promise<LeagueTableView> {
  const game: LeagueGame = isLeagueGame(gameRaw) ? gameRaw : '40k';
  const current = seasonOf(now);
  const season = typeof seasonRaw === 'string' && /^\d{4}-Q[1-4]$/.test(seasonRaw) ? seasonRaw : current;
  const all = (await confirmedResults()).filter((r) => r.game === game);
  const seasons = [...new Set([current, ...all.map((r) => seasonOf(r.startsAt))])].sort().reverse();
  const table = computeLeague(
    all.filter((r) => seasonOf(r.startsAt) === season).map((r) => ({ id: r.id, playerA: r.playerA, playerB: r.playerB, outcome: r.outcome!, startsAt: r.startsAt })),
  );
  const users = await usersByIds(table.map((r) => r.userId));
  return {
    game,
    season,
    seasonLabel: seasonLabel(season),
    seasons: seasons.map((id) => ({ id, label: seasonLabel(id) })),
    rows: table.map((r, i) => {
      const u = users.get(r.userId);
      return {
        rank: i + 1,
        userId: r.userId,
        name: u ? nameOf({ firstName: u.firstName, lastName: u.lastName, username: null }) : 'Игрок',
        username: u?.username ?? null,
        rating: r.rating,
        games: r.games,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        lastDelta: r.lastDelta,
        me: r.userId === userId,
      };
    }),
  };
}

/** Статистика игрока по играм: всё время + рейтинг и место в текущем сезоне. */
export async function myLeagueStats(userId: string, now = new Date()) {
  const current = seasonOf(now);
  const all = (await confirmedResults()).filter((r) => r.playerA === userId || r.playerB === userId);
  const out: { game: LeagueGame; gameLabel: string; games: number; wins: number; draws: number; losses: number; rating: number | null; rank: number | null; players: number }[] = [];
  const everything = await confirmedResults();
  for (const game of new Set(all.map((r) => r.game))) {
    if (!isLeagueGame(game)) continue;
    const mine = all.filter((r) => r.game === game);
    let wins = 0, draws = 0, losses = 0;
    for (const r of mine) {
      const res = mineOf(r.playerA === userId, r.outcome!);
      if (res === 'win') wins++;
      else if (res === 'loss') losses++;
      else draws++;
    }
    const season = computeLeague(
      everything.filter((r) => r.game === game && seasonOf(r.startsAt) === current).map((r) => ({ id: r.id, playerA: r.playerA, playerB: r.playerB, outcome: r.outcome!, startsAt: r.startsAt })),
    );
    const idx = season.findIndex((r) => r.userId === userId);
    out.push({ game, gameLabel: gameLabel(game), games: mine.length, wins, draws, losses, rating: idx >= 0 ? season[idx]!.rating : null, rank: idx >= 0 ? idx + 1 : null, players: season.length });
  }
  return { season: current, seasonLabel: seasonLabel(current), games: out.sort((a, b) => b.games - a.games) };
}

// ------------------------------------------------------------------ администратор

export async function adminListResults(status: unknown) {
  const filter = status === 'all' ? undefined : eq(gameResultsTable.status, status === 'reported' ? 'reported' : 'disputed');
  const rows = await db.select().from(gameResultsTable).where(filter).orderBy(desc(gameResultsTable.startsAt)).limit(100);
  const users = await usersByIds(rows.flatMap((r) => [r.playerA, r.playerB, ...(r.reportedBy ? [r.reportedBy] : [])]));
  const brief = (id: string | null) => {
    const u = id ? users.get(id) : null;
    return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username } : null;
  };
  return rows.map((r) => ({
    id: r.id,
    game: r.game,
    gameLabel: gameLabel(r.game),
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    playerA: brief(r.playerA),
    playerB: brief(r.playerB),
    outcome: r.outcome,
    status: r.status,
    reportedBy: brief(r.reportedBy),
    note: r.note,
  }));
}

/** Администратор решает спор: a / b / draw — засчитать, void — не учитывать партию. */
export async function adminResolveResult(id: string, outcome: unknown) {
  if (outcome !== 'a' && outcome !== 'b' && outcome !== 'draw' && outcome !== 'void') throw new LeagueError('BAD_INPUT', 'Неверный исход');
  const [r] = await db.select().from(gameResultsTable).where(eq(gameResultsTable.id, id)).limit(1);
  if (!r) throw new LeagueError('NOT_FOUND', 'Партия не найдена');
  await db
    .update(gameResultsTable)
    .set(outcome === 'void' ? { status: 'void', confirmedAt: new Date(), confirmedBy: 'admin' } : { outcome, status: 'confirmed', confirmedAt: new Date(), confirmedBy: 'admin' })
    .where(eq(gameResultsTable.id, id));
  invalidateLeague();
  return { ok: true };
}

/** Сколько партий ждут действия игрока (внести или подтвердить результат) — для бейджа. */
export async function pendingResultsCount(userId: string) {
  const list = await listMyResults(userId, 20);
  return list.filter((r) => r.action !== 'none').length;
}


// ------------------------------------------------------------------ карточка результата (этап 3b, 15.11.2026)

const cardCache = new Map<string, Uint8Array>();

/**
 * Картинка результата для «поделиться» (история Telegram, чат, файл): тот же стиль, что у карточек уведомлений.
 * Только подтверждённые партии; side — чьими глазами (a / b). Ссылка открывается без входа (по неугадываемому id).
 */
export async function resultCardPng(id: string, sideRaw: unknown): Promise<Uint8Array> {
  const side = sideRaw === 'b' ? 'b' : 'a';
  const key = `${id}:${side}`;
  const cached = cardCache.get(key);
  if (cached) return cached;
  const [r] = await db.select().from(gameResultsTable).where(eq(gameResultsTable.id, id)).limit(1);
  if (!r || r.status !== 'confirmed' || !r.outcome) throw new LeagueError('NOT_FOUND', 'Результат не найден или ещё не подтверждён');
  const isA = side === 'a';
  const me = isA ? r.playerA : r.playerB;
  const users = await usersByIds([r.playerA, r.playerB]);
  const other = users.get(isA ? r.playerB : r.playerA);
  const result = mineOf(isA, r.outcome);
  const season = seasonOf(r.startsAt);
  const seasonResults = (await confirmedResults())
    .filter((x) => x.game === r.game && seasonOf(x.startsAt) === season)
    .map((x) => ({ id: x.id, playerA: x.playerA, playerB: x.playerB, outcome: x.outcome!, startsAt: x.startsAt }));
  const after = ratingAfter(seasonResults, r.id, me);
  const { renderCardPng } = await import('../notifications/card/render');
  const png = await renderCardPng(
    buildResultCard({
      result,
      gameLabel: gameLabel(r.game),
      when: formatClubDateTime(r.startsAt).split(', ').slice(0, 2).join(', '),
      opponent: other ? nameOf({ firstName: other.firstName, lastName: other.lastName, username: null }) : 'Игрок',
      season,
      rating: after,
    }),
  );
  if (cardCache.size > 200) cardCache.clear();
  cardCache.set(key, png);
  return png;
}
