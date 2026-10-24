/**
 * Игра на двух телефонах (T1, 24.10.2026, вариант A владельца): сервер хранит журнал событий игры и задаёт порядок
 * (seq). Телефон отправляет событие с ожидаемым номером; если журнал ушёл вперёд — конфликт, телефон берёт свежий
 * журнал, проигрывает его движком и повторяет. Содержимое событий сервер не разбирает — правила проверяет движок
 * на каждом телефоне. Ограничение варианта A: тайный выбор и seed лежат в журнале, их можно увидеть в сырых данных.
 */
import { and, asc, desc, eq, gt, or } from 'drizzle-orm';
import { db } from '../../db';
import { gameEventsTable, gameSessionsTable, usersTable } from '../../db/schema';
import type { User } from '../users/service';
import { checkAppend, generateCode, normalizeCode, type Seat } from './rules';

export class OnlineGameError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'FORBIDDEN' | 'FULL_GAME' | 'BAD_CODE' | 'CONFLICT' | 'BAD_EVENT' | 'SEAT' | 'TOO_LARGE' | 'FULL',
    message: string,
    public lastSeq?: number,
  ) {
    super(message);
  }
}

type Session = typeof gameSessionsTable.$inferSelect;

const seatOf = (s: Session, user: User): Seat | null => (s.p1UserId === user.id ? 'p1' : s.p2UserId === user.id ? 'p2' : null);

async function playerInfo(userId: string | null) {
  if (!userId) return null;
  const [u] = await db
    .select({ telegramId: usersTable.telegramId, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return u ? { name: [u.firstName, u.lastName].filter(Boolean).join(' '), username: u.username } : null;
}

async function view(s: Session, user: User) {
  return {
    id: s.id,
    code: s.code,
    seat: seatOf(s, user),
    lastSeq: s.lastSeq,
    players: { p1: await playerInfo(s.p1UserId), p2: await playerInfo(s.p2UserId) },
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Новая игра: создатель — первый игрок; код для второго. */
export async function createOnlineGame(user: User) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await db.insert(gameSessionsTable).values({ code: generateCode(), p1UserId: user.id }).onConflictDoNothing().returning();
    if (rows[0]) return view(rows[0], user);
  }
  throw new Error('Не удалось подобрать свободный код игры');
}

/** Войти по коду вторым игроком; повторный вход — то же место. */
export async function joinOnlineGame(user: User, rawCode: unknown) {
  const code = normalizeCode(rawCode);
  if (!code) throw new OnlineGameError('BAD_CODE', 'Код игры — 5 символов');
  const [s] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.code, code)).limit(1);
  if (!s) throw new OnlineGameError('NOT_FOUND', 'Игра с таким кодом не найдена');
  if (seatOf(s, user)) return view(s, user);
  if (s.p2UserId) throw new OnlineGameError('FULL_GAME', 'В этой игре уже два игрока');
  const [joined] = await db
    .update(gameSessionsTable)
    .set({ p2UserId: user.id, updatedAt: new Date() })
    .where(and(eq(gameSessionsTable.id, s.id), eq(gameSessionsTable.p1UserId, s.p1UserId)))
    .returning();
  return view(joined!, user);
}

async function memberSession(user: User, id: string) {
  const [s] = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, id)).limit(1);
  if (!s) throw new OnlineGameError('NOT_FOUND', 'Игра не найдена');
  if (!seatOf(s, user)) throw new OnlineGameError('FORBIDDEN', 'Вы не участник этой игры');
  return s;
}

/** События после номера after (0 — весь журнал) и сведения об игре. */
export async function getOnlineEvents(user: User, id: string, after: number) {
  const s = await memberSession(user, id);
  const rows = await db
    .select({ event: gameEventsTable.event })
    .from(gameEventsTable)
    .where(and(eq(gameEventsTable.gameId, id), gt(gameEventsTable.seq, Math.max(0, after))))
    .orderBy(asc(gameEventsTable.seq));
  return { game: await view(s, user), events: rows.map((r) => r.event) };
}

/** Добавить событие с ожидаемым номером; один писатель за раз (блокировка строки игры). */
export async function appendOnlineEvent(user: User, id: string, expectedSeq: number, event: unknown) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, id)).for('update').limit(1);
    if (!s) throw new OnlineGameError('NOT_FOUND', 'Игра не найдена');
    const seat = seatOf(s, user);
    if (!seat) throw new OnlineGameError('FORBIDDEN', 'Вы не участник этой игры');
    const err = checkAppend({ lastSeq: s.lastSeq, expectedSeq, authorSeat: seat, event });
    if (err) throw new OnlineGameError(err.code, err.message, s.lastSeq);
    const seq = s.lastSeq + 1;
    const e = event as { seat?: Seat | null };
    await tx.insert(gameEventsTable).values({ gameId: id, seq, authorUserId: user.id, seat: e.seat ?? null, event: event as object });
    await tx.update(gameSessionsTable).set({ lastSeq: seq, updatedAt: new Date() }).where(eq(gameSessionsTable.id, id));
    return { lastSeq: seq };
  });
}

/** Мои игры на двух телефонах — последние 20. */
export async function listOnlineGames(user: User) {
  const rows = await db
    .select()
    .from(gameSessionsTable)
    .where(or(eq(gameSessionsTable.p1UserId, user.id), eq(gameSessionsTable.p2UserId, user.id)))
    .orderBy(desc(gameSessionsTable.updatedAt))
    .limit(20);
  return { games: await Promise.all(rows.map((s) => view(s, user))) };
}
