/**
 * Клуб закрыт на игру D&D (решение владельца 31.10.2026). Игра D&D с точным временем (открыта или закрыта для записи)
 * и бронь стола с целью «Игра D&D» закрывают весь клуб — оба острова, покраску и посещение — от начала
 * до конца + bookingConfig.dndClosureBufferMinutes. Поставить D&D поверх записей, ивентов и других броней нельзя.
 * Правила без БД — rules.ts; сквозная проверка — tests/club-closure-e2e.test.ts.
 */
import { and, asc, eq, gt, inArray, isNotNull, lt, ne, or } from 'drizzle-orm';
import { db } from '../../db';
import {
  dndGamesTable,
  eventsTable,
  reservationsTable,
  servicesTable,
  tableHoldsTable,
  usersTable,
} from '../../db/schema';
import { formatLocalIso } from '../booking/rules';
import { closureEnd, closureSearchFrom, overlaps, type ClubClosure } from './rules';

export { closuresAsPoolBookings, closuresAsTableBlocks, type ClubClosure } from './rules';

const CLOSING_GAME_STATUSES = ['open', 'closed'] as const;

/** Закрытия клуба, пересекающие интервал rangeStart–rangeEnd (с учётом часа после игры). */
export async function getClubClosures(rangeStart: Date, rangeEnd: Date): Promise<ClubClosure[]> {
  const from = closureSearchFrom(rangeStart);
  const [games, holds] = await Promise.all([
    db
      .select({ id: dndGamesTable.id, title: dndGamesTable.title, startsAt: dndGamesTable.startsAt, endsAt: dndGamesTable.endsAt })
      .from(dndGamesTable)
      .where(
        and(
          isNotNull(dndGamesTable.startsAt),
          isNotNull(dndGamesTable.endsAt),
          inArray(dndGamesTable.status, [...CLOSING_GAME_STATUSES]),
          lt(dndGamesTable.startsAt, rangeEnd),
          gt(dndGamesTable.endsAt, from),
        ),
      ),
    db
      .select({ id: tableHoldsTable.id, title: tableHoldsTable.title, startsAt: tableHoldsTable.startsAt, endsAt: tableHoldsTable.endsAt })
      .from(tableHoldsTable)
      .where(and(eq(tableHoldsTable.purpose, 'dnd'), lt(tableHoldsTable.startsAt, rangeEnd), gt(tableHoldsTable.endsAt, from))),
  ]);
  const closures: ClubClosure[] = [
    ...games.map((g) => ({ source: 'dnd_game' as const, id: g.id, title: g.title, startsAt: g.startsAt!, endsAt: closureEnd(g.endsAt!) })),
    ...holds.map((h) => ({ source: 'dnd_hold' as const, id: h.id, title: h.title, startsAt: h.startsAt, endsAt: closureEnd(h.endsAt) })),
  ];
  return closures.filter((c) => overlaps(c, { startsAt: rangeStart, endsAt: rangeEnd }));
}

export class ClubClosureError extends Error {
  constructor(
    public code: 'CLUB_BUSY',
    message: string,
  ) {
    super(message);
  }
}

const hhmm = (d: Date) => formatLocalIso(d).slice(11, 16);

/**
 * Можно ли закрыть клуб на D&D с gameStartsAt по gameEndsAt (+ час после). Иначе — ошибка со списком того, что мешает:
 * записи игроков (любая услуга), ивенты, другие брони столов и другие игры D&D.
 * Игра и её бронь стола (table_holds.dnd_game_id) друг другу не мешают.
 */
export async function assertClubFreeForDnd(
  gameStartsAt: Date,
  gameEndsAt: Date,
  exclude: { gameId?: number | null; holdId?: number | null } = {},
): Promise<void> {
  const startsAt = gameStartsAt;
  const endsAt = closureEnd(gameEndsAt);
  const linkedGameId = exclude.gameId ?? null;

  const [bookings, events, holds, games] = await Promise.all([
    db
      .select({
        startsAt: reservationsTable.startsAt,
        endsAt: reservationsTable.endsAt,
        firstName: usersTable.firstName,
        username: usersTable.username,
        service: servicesTable.title,
      })
      .from(reservationsTable)
      .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
      .where(
        and(
          inArray(reservationsTable.status, ['pending', 'confirmed']),
          lt(reservationsTable.startsAt, endsAt),
          gt(reservationsTable.endsAt, startsAt),
        ),
      )
      .orderBy(asc(reservationsTable.startsAt))
      .limit(10),
    db
      .select({ title: eventsTable.title, startsAt: eventsTable.startsAt, endsAt: eventsTable.endsAt })
      .from(eventsTable)
      .where(and(lt(eventsTable.startsAt, endsAt), gt(eventsTable.endsAt, startsAt)))
      .limit(5),
    db
      .select({ id: tableHoldsTable.id, title: tableHoldsTable.title, purpose: tableHoldsTable.purpose, dndGameId: tableHoldsTable.dndGameId, startsAt: tableHoldsTable.startsAt, endsAt: tableHoldsTable.endsAt })
      .from(tableHoldsTable)
      .where(
        and(
          lt(tableHoldsTable.startsAt, endsAt),
          // бронь D&D закрывает клуб ещё на час после своего конца
          or(gt(tableHoldsTable.endsAt, startsAt), and(eq(tableHoldsTable.purpose, 'dnd'), gt(tableHoldsTable.endsAt, closureSearchFrom(startsAt)))),
          ...(exclude.holdId ? [ne(tableHoldsTable.id, exclude.holdId)] : []),
        ),
      ),
    db
      .select({ id: dndGamesTable.id, title: dndGamesTable.title, startsAt: dndGamesTable.startsAt, endsAt: dndGamesTable.endsAt })
      .from(dndGamesTable)
      .where(
        and(
          isNotNull(dndGamesTable.startsAt),
          isNotNull(dndGamesTable.endsAt),
          inArray(dndGamesTable.status, [...CLOSING_GAME_STATUSES]),
          lt(dndGamesTable.startsAt, endsAt),
          gt(dndGamesTable.endsAt, closureSearchFrom(startsAt)),
          ...(exclude.gameId ? [ne(dndGamesTable.id, exclude.gameId)] : []),
        ),
      ),
  ]);

  const window = { startsAt, endsAt };
  const problems: string[] = [];
  const playerBookings = bookings.filter((b) => b.startsAt && b.endsAt);
  if (playerBookings.length > 0) {
    problems.push(
      'записи игроков: ' +
        playerBookings
          .map((b) => `${b.firstName}${b.username ? ` @${b.username}` : ''} (${b.service ?? 'запись'}) ${hhmm(b.startsAt!)}–${hhmm(b.endsAt!)}`)
          .join('; '),
    );
  }
  if (events.length > 0) problems.push('ивенты: ' + events.map((e) => `«${e.title}» ${hhmm(e.startsAt)}–${hhmm(e.endsAt)}`).join('; '));

  const otherHolds = holds.filter((h) => {
    if (linkedGameId !== null && h.dndGameId === linkedGameId) return false; // бронь стола этой же игры
    const holdEnd = h.purpose === 'dnd' ? closureEnd(h.endsAt) : h.endsAt;
    return overlaps({ startsAt: h.startsAt, endsAt: holdEnd }, window);
  });
  if (otherHolds.length > 0) problems.push('брони столов: ' + otherHolds.map((h) => `«${h.title}» ${hhmm(h.startsAt)}–${hhmm(h.endsAt)}`).join('; '));

  const otherGames = games.filter((g) => overlaps({ startsAt: g.startsAt!, endsAt: closureEnd(g.endsAt!) }, window));
  if (otherGames.length > 0) problems.push('игры D&D: ' + otherGames.map((g) => `«${g.title}» ${hhmm(g.startsAt!)}–${hhmm(g.endsAt!)}`).join('; '));

  if (problems.length > 0) {
    throw new ClubClosureError(
      'CLUB_BUSY',
      `На время игры D&D (${hhmm(startsAt)}–${hhmm(endsAt)}, с часом после игры) клуб уже занят — ${problems.join('. ')}. Перенесите или отмените их.`,
    );
  }
}
