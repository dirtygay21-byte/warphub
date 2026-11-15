/**
 * Турниры (этап 4, 15.11.2026): ивент → турнир по швейцарской системе. Администратор создаёт турнир, ведёт список
 * участников, запускает раунды (пары считает swiss.ts) и вносит результаты с VP. Игроки видят пары и таблицу.
 * Партия двух пользователей приложения сразу идёт в клубную лигу как подтверждённый результат.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { eventsTable, gameResultsTable, tournamentGamesTable, tournamentPlayersTable, tournamentsTable, usersEventsTable, usersTable } from '../../db/schema';
import { gameLabel } from '../../config/booking';
import { escapeHtml, formatUserName } from '../../lib/telegram/format';
import { notifyKind } from '../notifications/hub';
import { isLeagueGame } from '../league/elo';
import { invalidateLeagueCache } from '../league/service';
import { pairRound, standings, type SwissGame } from './swiss';

export class TournamentError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'BAD_STATE' | 'BAD_INPUT',
    message: string,
  ) {
    super(message);
  }
}

type Tournament = typeof tournamentsTable.$inferSelect;
type Player = typeof tournamentPlayersTable.$inferSelect;
type Game = typeof tournamentGamesTable.$inferSelect;

async function load(eventId: number) {
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.eventId, eventId)).limit(1);
  if (!t) return null;
  const players = await db.select().from(tournamentPlayersTable).where(eq(tournamentPlayersTable.tournamentId, t.id)).orderBy(asc(tournamentPlayersTable.createdAt), asc(tournamentPlayersTable.id));
  const games = await db.select().from(tournamentGamesTable).where(eq(tournamentGamesTable.tournamentId, t.id)).orderBy(asc(tournamentGamesTable.round), asc(tournamentGamesTable.tableNo));
  return { t, players, games };
}

async function mustLoad(eventId: number) {
  const data = await load(eventId);
  if (!data) throw new TournamentError('NOT_FOUND', 'Турнир не найден');
  return data;
}

const swissGames = (games: Game[]): SwissGame[] =>
  games.map((g) => ({ round: g.round, playerA: g.playerA, playerB: g.playerB, result: g.result, vpA: g.vpA, vpB: g.vpB }));

const currentRound = (games: Game[]) => games.reduce((m, g) => Math.max(m, g.round), 0);

export type TournamentView = {
  eventId: number;
  eventTitle: string;
  startsAt: string;
  game: string;
  gameLabel: string;
  rounds: number;
  currentRound: number;
  status: Tournament['status'];
  /** все партии текущего раунда внесены — можно запускать следующий */
  roundComplete: boolean;
  players: { id: string; name: string; army: string | null; userId: string | null; dropped: boolean; me: boolean }[];
  pairings: { round: number; games: { id: string; tableNo: number; playerA: string; playerB: string | null; result: Game['result']; vpA: number | null; vpB: number | null }[] }[];
  standings: { rank: number; playerId: string; name: string; points: number; wins: number; draws: number; losses: number; vp: number; sos: number; me: boolean; dropped: boolean }[];
};

function view(data: NonNullable<Awaited<ReturnType<typeof load>>>, event: { title: string; startsAt: Date }, userId: string | null): TournamentView {
  const { t, players, games } = data;
  const round = currentRound(games);
  const byId = new Map(players.map((p) => [p.id, p]));
  const table = standings(players.map((p) => p.id), swissGames(games));
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => b - a);
  return {
    eventId: t.eventId,
    eventTitle: event.title,
    startsAt: event.startsAt.toISOString(),
    game: t.game,
    gameLabel: gameLabel(t.game),
    rounds: t.rounds,
    currentRound: round,
    status: t.status,
    roundComplete: games.filter((g) => g.round === round).every((g) => g.playerB === null || g.result !== null),
    players: players.map((p) => ({ id: p.id, name: p.name, army: p.army, userId: p.userId, dropped: p.dropped, me: !!userId && p.userId === userId })),
    pairings: rounds.map((r) => ({
      round: r,
      games: games.filter((g) => g.round === r).map((g) => ({ id: g.id, tableNo: g.tableNo, playerA: g.playerA, playerB: g.playerB, result: g.result, vpA: g.vpA, vpB: g.vpB })),
    })),
    standings: table.map((r) => {
      const p = byId.get(r.playerId)!;
      return { rank: r.rank, playerId: r.playerId, name: p.name, points: r.points, wins: r.wins, draws: r.draws, losses: r.losses, vp: r.vp, sos: r.sos, me: !!userId && p.userId === userId, dropped: p.dropped };
    }),
  };
}

async function eventOf(eventId: number) {
  const [e] = await db.select({ id: eventsTable.id, title: eventsTable.title, startsAt: eventsTable.startsAt }).from(eventsTable).where(eq(eventsTable.id, eventId)).limit(1);
  if (!e) throw new TournamentError('NOT_FOUND', 'Ивент не найден');
  return e;
}

export async function getTournament(eventId: number, userId: string | null): Promise<TournamentView | null> {
  const data = await load(eventId);
  if (!data) return null;
  return view(data, await eventOf(eventId), userId);
}

// ------------------------------------------------------------------ администратор

/** Создать турнир из ивента: участники — все записавшиеся пользователи (по одному месту на пользователя). */
export async function createTournament(eventId: number, gameRaw: unknown, roundsRaw: unknown) {
  if (!isLeagueGame(gameRaw)) throw new TournamentError('BAD_INPUT', 'Выберите игру: 40K, AoS, Kill Team или Warcry');
  const rounds = Number(roundsRaw);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new TournamentError('BAD_INPUT', 'Раундов — от 1 до 10');
  const event = await eventOf(eventId);
  if (await load(eventId)) throw new TournamentError('BAD_STATE', 'У ивента уже есть турнир');
  const [t] = await db.insert(tournamentsTable).values({ eventId, game: gameRaw, rounds, seed: Math.floor(Math.random() * 2 ** 31) }).returning();
  const regs = await db
    .select({ userId: usersEventsTable.userId, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username })
    .from(usersEventsTable)
    .innerJoin(usersTable, eq(usersTable.id, usersEventsTable.userId))
    .where(eq(usersEventsTable.eventId, eventId))
    .orderBy(asc(usersEventsTable.createdAt));
  if (regs.length) {
    await db.insert(tournamentPlayersTable).values(regs.map((r) => ({ tournamentId: t!.id, userId: r.userId, name: formatUserName({ firstName: r.firstName, lastName: r.lastName, username: null }).slice(0, 80) })));
  }
  return view((await load(eventId))!, event, null);
}

export async function addPlayer(eventId: number, nameRaw: unknown, armyRaw: unknown) {
  const { t } = await mustLoad(eventId);
  if (t.status === 'finished') throw new TournamentError('BAD_STATE', 'Турнир завершён');
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 80) : '';
  if (!name) throw new TournamentError('BAD_INPUT', 'Укажите имя участника');
  const army = typeof armyRaw === 'string' && armyRaw.trim() ? armyRaw.trim().slice(0, 80) : null;
  await db.insert(tournamentPlayersTable).values({ tournamentId: t.id, name, army });
  return getTournament(eventId, null);
}

export async function updatePlayer(eventId: number, playerId: string, patch: { army?: unknown; dropped?: unknown }) {
  const { t, players, games } = await mustLoad(eventId);
  const p = players.find((x) => x.id === playerId);
  if (!p) throw new TournamentError('NOT_FOUND', 'Участник не найден');
  const set: Partial<Player> = {};
  if (typeof patch.army === 'string') set.army = patch.army.trim().slice(0, 80) || null;
  if (typeof patch.dropped === 'boolean') {
    // до первого раунда — просто удалить из списка; дальше — снять с турнира (результаты остаются)
    if (patch.dropped && t.status === 'setup' && !games.some((g) => g.playerA === p.id || g.playerB === p.id)) {
      await db.delete(tournamentPlayersTable).where(eq(tournamentPlayersTable.id, p.id));
      return getTournament(eventId, null);
    }
    set.dropped = patch.dropped;
  }
  if (Object.keys(set).length) await db.update(tournamentPlayersTable).set(set).where(eq(tournamentPlayersTable.id, p.id));
  return getTournament(eventId, null);
}

/** Следующий раунд: пары по швейцарской системе среди не снятых участников; бот пишет игрокам их стол. */
export async function startNextRound(eventId: number) {
  const data = await mustLoad(eventId);
  const { t, players, games } = data;
  if (t.status === 'finished') throw new TournamentError('BAD_STATE', 'Турнир завершён');
  const round = currentRound(games);
  if (round >= t.rounds) throw new TournamentError('BAD_STATE', `Все ${t.rounds} раунда сыграны — завершите турнир`);
  if (round > 0 && !view(data, { title: '', startsAt: new Date() }, null).roundComplete) throw new TournamentError('BAD_STATE', 'Сначала внесите все результаты текущего раунда');
  const active = players.filter((p) => !p.dropped);
  if (active.length < 2) throw new TournamentError('BAD_STATE', 'Нужно хотя бы два участника');
  const pairs = pairRound(active.map((p) => p.id), swissGames(games.filter((g) => active.some((p) => p.id === g.playerA || p.id === g.playerB))), t.seed + round);
  const next = round + 1;
  await db.transaction(async (tx) => {
    await tx.insert(tournamentGamesTable).values(pairs.map(([a, b], i) => ({ tournamentId: t.id, round: next, tableNo: i + 1, playerA: a, playerB: b })));
    if (t.status === 'setup') await tx.update(tournamentsTable).set({ status: 'running' }).where(eq(tournamentsTable.id, t.id));
  });

  // бот: «Раунд N: стол, соперник»
  const event = await eventOf(eventId);
  const byId = new Map(players.map((p) => [p.id, p]));
  const userIds = players.map((p) => p.userId).filter((x): x is string => !!x);
  const tg = new Map(
    userIds.length ? (await db.select({ id: usersTable.id, telegramId: usersTable.telegramId }).from(usersTable).where(inArray(usersTable.id, userIds))).map((u) => [u.id, u.telegramId]) : [],
  );
  pairs.forEach(([a, b], i) => {
    for (const [me, other] of [[a, b], [b, a]] as const) {
      const p = me ? byId.get(me) : null;
      if (!p?.userId) continue;
      void notifyKind(
        'tournament_round',
        tg.get(p.userId),
        {
          турнир: escapeHtml(event.title),
          раунд: String(next),
          стол: b === null ? 'свободный круг (бай)' : String(i + 1),
          соперник: other ? escapeHtml(byId.get(other)?.name ?? '') : 'нет — засчитана победа',
        },
        { buttons: [{ text: 'Пары и таблица', path: `/tournament/${eventId}` }] },
      );
    }
  });
  return getTournament(eventId, null);
}

/** Результат партии с VP. Партия двух пользователей одной лиговой игры — в лигу (подтверждённой). */
export async function setGameResult(eventId: number, gameId: string, body: { result?: unknown; vpA?: unknown; vpB?: unknown }) {
  const { t, players, games } = await mustLoad(eventId);
  const g = games.find((x) => x.id === gameId);
  if (!g) throw new TournamentError('NOT_FOUND', 'Партия не найдена');
  if (g.playerB === null) throw new TournamentError('BAD_STATE', 'Бай засчитывается автоматически');
  if (t.status === 'finished') throw new TournamentError('BAD_STATE', 'Турнир завершён');
  const result = body.result === 'a' || body.result === 'b' || body.result === 'draw' ? body.result : null;
  const vp = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 999 ? Number(v) : NaN);
  const vpA = vp(body.vpA);
  const vpB = vp(body.vpB);
  if (Number.isNaN(vpA) || Number.isNaN(vpB)) throw new TournamentError('BAD_INPUT', 'VP — целое число от 0 до 999');
  await db.update(tournamentGamesTable).set({ result, vpA, vpB, reportedAt: result ? new Date() : null }).where(eq(tournamentGamesTable.id, g.id));

  // лига: только партии двух пользователей
  const a = players.find((p) => p.id === g.playerA);
  const b = players.find((p) => p.id === g.playerB);
  await db.delete(gameResultsTable).where(eq(gameResultsTable.tournamentGameId, g.id));
  if (result && a?.userId && b?.userId && a.userId !== b.userId && isLeagueGame(t.game)) {
    const event = await eventOf(eventId);
    await db.insert(gameResultsTable).values({
      game: t.game,
      serviceId: null,
      tableId: null,
      startsAt: new Date(event.startsAt.getTime() + (g.round - 1) * 60_000 + g.tableNo * 1000),
      playerA: a.userId,
      playerB: b.userId,
      outcome: result,
      status: 'confirmed',
      confirmedAt: new Date(),
      confirmedBy: 'admin',
      note: 'Турнир',
      tournamentGameId: g.id,
    });
  }
  invalidateLeagueCache();
  return getTournament(eventId, null);
}

export async function finishTournament(eventId: number) {
  const data = await mustLoad(eventId);
  if (!view(data, { title: '', startsAt: new Date() }, null).roundComplete) throw new TournamentError('BAD_STATE', 'Сначала внесите все результаты текущего раунда');
  await db.update(tournamentsTable).set({ status: 'finished' }).where(eq(tournamentsTable.id, data.t.id));
  return getTournament(eventId, null);
}

/** Удалить турнир (только пока не начат) — ивент остаётся. */
export async function deleteTournament(eventId: number) {
  const { t } = await mustLoad(eventId);
  if (t.status !== 'setup') throw new TournamentError('BAD_STATE', 'Турнир уже начат — его можно только завершить');
  await db.delete(tournamentsTable).where(and(eq(tournamentsTable.id, t.id), eq(tournamentsTable.status, 'setup')));
  return { ok: true };
}
