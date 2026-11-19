/**
 * Автоматические уведомления по расписанию (14.11.2026). Раз в 5 минут сервер проверяет, что пора отправить;
 * каждое событие отправляется один раз (notification_marks). Время — клуба (UTC+5).
 *   накануне (с 19:00) · соперник не нашёлся (за сутки) · запись ждёт подтверждения > 3 ч (в игровой день) ·
 *   сводки администраторам в 12:00 и 20:00 (17.11.2026)
 *   · игры на выходных (пятница с 12:00) · новости / ивенты / D&D (после публикации) · напоминания об ивенте
 *   (за сутки и за 3 ч) · мало мест · новый ранг и «давно не заходили» (раз в день с 12:00).
 * Первый запуск помечает уже существующие новости, ивенты и ранги, чтобы не разослать старое.
 */
import { and, asc, count, eq, gt, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { bookingConfig, clubArmyLabel } from '../../config/booking';
import { db } from '../../db';
import {
  dndGamesTable,
  eventsTable,
  eventsTablesTable,
  newsTable,
  notificationPrefsTable,
  reservationsTable,
  servicesTable,
  tablesTable,
  usersEventsTable,
  usersTable,
} from '../../db/schema';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import { getPlayerProgress } from '../progress/service';
import { runLeagueJobs } from '../league/service';
import type { ReservationDetails } from '../booking/rules';
import { curatorAreasById, getAdminTelegramIds } from '../../config/admin';
import { canSeeArea, reservationArea, type AdminArea } from '../../config/admin-areas';
import { sendTelegramMessageDetailed } from './service';
import { isUrgentForAdmins, summarySlot } from './admin-schedule';
import { confirmReservation } from '../booking/service';
import {
  allRecipients,
  announce,
  clubDateKey,
  clubDayStart,
  clubHour,
  clubWeekday,
  getPrefs,
  markOnce,
  hasMark,
  notifyKind,
  notifyKindAdmins,
  recipientsOf,
  renderKind,
} from './hub';
import { bookingVars, detailVars, playerLine, whatOf } from './booking-vars';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ACTIVE = ['pending', 'confirmed'] as const;

type Brief = { firstName: string; lastName: string | null; username: string | null };
const who = (u: Brief) => escapeHtml(formatUserName(u));

/** Переменные игрока для объявлений поиска соперника. */
export function playerVars(user: Brief, details: ReservationDetails | null) {
  return { ...detailVars(details), игрок: who(user) };
}

function seatsOf(service: { seatsPerTable: number | null; tableCapacityProfile: string | null }) {
  if (service.seatsPerTable !== null) return service.seatsPerTable;
  if (service.tableCapacityProfile) return (bookingConfig.tableCapacityByProfile as Record<string, number>)[service.tableCapacityProfile] ?? 0;
  return 0;
}

/**
 * Подписчики поиска соперника по игре, кроме тех, кто уже записан на пересекающееся время
 * (и кроме exclude — сам игрок).
 */
export async function matchRecipients(game: string, startsAt: Date, endsAt: Date | null, excludeUserIds: string[]) {
  const subs = await db
    .select({ userId: notificationPrefsTable.userId })
    .from(notificationPrefsTable)
    .where(sql`${notificationPrefsTable.opponentGames} @> ${JSON.stringify([game])}::jsonb`);
  const ids = subs.map((s) => s.userId).filter((id) => !excludeUserIds.includes(id));
  if (!ids.length) return [];
  const end = endsAt ?? new Date(startsAt.getTime() + 3 * HOUR);
  const busy = await db
    .selectDistinct({ userId: reservationsTable.userId })
    .from(reservationsTable)
    .where(
      and(
        inArray(reservationsTable.userId, ids),
        inArray(reservationsTable.status, [...ACTIVE]),
        lt(reservationsTable.startsAt, end),
        gt(reservationsTable.endsAt, startsAt),
      ),
    );
  const busyIds = new Set(busy.map((b) => b.userId));
  return recipientsOf(ids.filter((id) => !busyIds.has(id)));
}

/** Объявление «ищут соперника» (из записи — сразу после неё; из проверки — за сутки). */
export async function announceMatch(
  kind: 'match_new' | 'match_still_free',
  input: { user: Brief & { id: string }; details: ReservationDetails | null; startsAt: Date; endsAt: Date | null; tableName: string | null; otherUserIds?: string[] },
) {
  const details = input.details?.kind === 'wh_player' ? input.details : null;
  if (!details) return 0;
  const game = details.game ?? '40k';
  const recipients = await matchRecipients(game, input.startsAt, input.endsAt, [input.user.id, ...(input.otherUserIds ?? [])]);
  if (!recipients.length) return 0;
  const text = await renderKind(kind, {
    ...playerVars(input.user, details),
    когда: formatClubDateTime(input.startsAt, input.endsAt),
    стол: input.tableName ? escapeHtml(input.tableName) : '',
  });
  return announce(kind, recipients, text, { game, buttons: [{ text: 'Записаться', path: '/' }] });
}

// ---------------------------------------------------------------- проходы

/** Записи за столом (2+ мест): игра, где пока один игрок. */
async function loneTableGames(from: Date, to: Date) {
  const rows = await db
    .select({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      details: reservationsTable.details,
      seatsPerTable: servicesTable.seatsPerTable,
      tableCapacityProfile: servicesTable.tableCapacityProfile,
      tableName: tablesTable.name,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
    })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(and(inArray(reservationsTable.status, [...ACTIVE]), gte(reservationsTable.startsAt, from), lt(reservationsTable.startsAt, to)))
    .orderBy(asc(reservationsTable.startsAt), asc(reservationsTable.createdAt));
  const games = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.tableId === null || !r.startsAt || seatsOf(r) < 2) continue;
    const key = `${r.serviceId}:${r.tableId}:${r.startsAt.getTime()}`;
    games.set(key, [...(games.get(key) ?? []), r]);
  }
  return [...games.entries()].filter(([, players]) => players.length < seatsOf(players[0]!)).map(([key, players]) => ({ key, players }));
}

async function eveReminders(now: Date) {
  if (clubHour(now) < 19) return;
  const tomorrow = new Date(clubDayStart(now).getTime() + DAY);
  const rows = await db
    .select({
      id: reservationsTable.id,
      userId: reservationsTable.userId,
      serviceId: reservationsTable.serviceId,
      tableId: reservationsTable.tableId,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      telegramId: usersTable.telegramId,
      service: servicesTable.title,
      slug: servicesTable.slug,
      tableName: tablesTable.name,
      details: reservationsTable.details,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(and(inArray(reservationsTable.status, [...ACTIVE]), gte(reservationsTable.startsAt, tomorrow), lt(reservationsTable.startsAt, new Date(tomorrow.getTime() + DAY))));
  if (!rows.length) return;
  const prefs = await getPrefs([...new Set(rows.map((r) => r.userId))]);
  for (const r of rows) {
    if (!prefs.get(r.userId)?.eveReminder) continue;
    if (!(await markOnce(`eve:${r.id}`))) continue;
    const opponents =
      r.tableId === null || !r.startsAt
        ? []
        : await db
            .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, details: reservationsTable.details })
            .from(reservationsTable)
            .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
            .where(and(eq(reservationsTable.serviceId, r.serviceId), eq(reservationsTable.tableId, r.tableId), eq(reservationsTable.startsAt, r.startsAt), ne(reservationsTable.userId, r.userId), inArray(reservationsTable.status, [...ACTIVE])));
    await notifyKind('reminder_eve', r.telegramId, {
      ...bookingVars({ service: { title: r.service, slug: r.slug }, details: r.details as ReservationDetails | null, startsAt: r.startsAt, endsAt: r.endsAt, tableName: r.tableName }),
      соперник: opponents.map((o) => playerLine(o, o.details as ReservationDetails | null)).join('; '),
    });
  }
}

async function stillFree(now: Date) {
  // игры, до которых 23–25 часов, где место за столом свободно
  for (const game of await loneTableGames(new Date(now.getTime() + 23 * HOUR), new Date(now.getTime() + 25 * HOUR))) {
    if (!(await markOnce(`still-free:${game.key}`))) continue;
    const first = game.players[0]!;
    await announceMatch('match_still_free', {
      user: { id: first.userId, firstName: first.firstName, lastName: first.lastName, username: first.username },
      details: first.details as ReservationDetails | null,
      startsAt: first.startsAt!,
      endsAt: first.endsAt,
      tableName: first.tableName,
      otherUserIds: game.players.map((p) => p.userId),
    });
  }
}

async function pendingTooLong(now: Date) {
  const rows = await db
    .select({
      id: reservationsTable.id,
      createdAt: reservationsTable.createdAt,
      startsAt: reservationsTable.startsAt,
      endsAt: reservationsTable.endsAt,
      service: servicesTable.title,
      slug: servicesTable.slug,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      details: reservationsTable.details,
      tableName: tablesTable.name,
    })
    .from(reservationsTable)
    .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .leftJoin(tablesTable, eq(reservationsTable.tableId, tablesTable.id))
    .where(and(eq(reservationsTable.status, 'pending'), lte(reservationsTable.createdAt, new Date(now.getTime() - 3 * HOUR)), gt(reservationsTable.startsAt, now)));
  // 17.11.2026: ожидающие (услуги без автоподтверждения) — в сводках 12:00 и 20:00; отдельно — только в игровой день
  for (const r of rows) {
    if (!isUrgentForAdmins(r.startsAt, now)) continue;
    if (!(await markOnce(`pending:${r.id}`))) continue;
    await notifyKindAdmins('admin_pending', {
      ...bookingVars({ service: { title: r.service, slug: r.slug }, details: r.details as ReservationDetails | null, startsAt: r.startsAt, endsAt: r.endsAt, tableName: r.tableName }),
      часов: Math.floor((now.getTime() - r.createdAt.getTime()) / HOUR),
      игрок: who(r),
    }, reservationArea(r.slug, r.details as ReservationDetails | null));
  }
}

/**
 * Сводки администраторам в 12:00 и 20:00 (17.11.2026, вместо утренней в 10:00): новые записи и отмены с прошлой
 * сводки, ждущие подтверждения, и расписание — в 12:00 на сегодня, в 20:00 на завтра. Сводка, пропущенная из-за
 * простоя сервера, уходит в течение 3 часов. Кураторы — только свои направления (нет ничего — не пишем).
 */
async function adminSummary(now: Date) {
  const slot = summarySlot(now);
  if (now.getTime() - slot.at.getTime() > 3 * HOUR) return;
  if (!(await markOnce(`summary:${clubDateKey(slot.at)}:${slot.hour}`))) return;
  const scheduleDay = slot.hour === 12 ? clubDayStart(slot.at) : new Date(clubDayStart(slot.at).getTime() + DAY);
  const base = {
    id: reservationsTable.id,
    status: reservationsTable.status,
    startsAt: reservationsTable.startsAt,
    createdAt: reservationsTable.createdAt,
    cancelledAt: reservationsTable.cancelledAt,
    service: servicesTable.title,
    slug: servicesTable.slug,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    username: usersTable.username,
    details: reservationsTable.details,
    clubArmy: reservationsTable.seatClubArmyOptions,
  };
  const query = () =>
    db
      .select(base)
      .from(reservationsTable)
      .innerJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id));
  const schedule = await query()
    .where(and(inArray(reservationsTable.status, [...ACTIVE]), gte(reservationsTable.startsAt, scheduleDay), lt(reservationsTable.startsAt, new Date(scheduleDay.getTime() + DAY))))
    .orderBy(asc(reservationsTable.startsAt));
  const changes = await query()
    .where(
      sql`(${reservationsTable.createdAt} >= ${slot.previous} and ${reservationsTable.createdAt} < ${slot.at}) or (${reservationsTable.cancelledAt} >= ${slot.previous} and ${reservationsTable.cancelledAt} < ${slot.at})`,
    )
    .orderBy(asc(reservationsTable.startsAt));
  const waiting = await query()
    .where(and(eq(reservationsTable.status, 'pending'), gt(reservationsTable.startsAt, now)))
    .orderBy(asc(reservationsTable.startsAt));
  type Row = (typeof schedule)[number];
  const inWindow = (d: Date | null) => !!d && d >= slot.previous && d < slot.at;
  const time = (d: Date | null) => (d ? formatClubDateTime(d).split(', ').pop() : '—');
  const when = (d: Date | null) => (d ? formatClubDateTime(d) : '—');
  // армия / команда / варбанда клуба (15.11.2026): сколько записей её просят — подготовить заранее
  const wantsArmy = (r: Row) => (r.clubArmy ?? []).some(Boolean);
  const areaOf = (r: Row) => reservationArea(r.slug, r.details as ReservationDetails | null);
  const line = (r: Row, at: string) => {
    const d = r.details as ReservationDetails | null;
    const army = wantsArmy(r) ? ` · ${d?.kind === 'wh_player' ? clubArmyLabel(d.game).toLowerCase() : 'армия клуба'}` : '';
    return `• ${at} <b>${escapeHtml(whatOf({ title: r.service, slug: r.slug }, d))}</b> — ${playerLine(r, d)}${army}${r.status === 'pending' ? ' ⏳' : ''}`;
  };
  const block = (title: string, list: string[]) => (list.length ? `<b>${title} (${list.length}):</b>\n${list.slice(0, 25).join('\n')}${list.length > 25 ? `\n… и ещё ${list.length - 25}` : ''}` : '');
  const vars = (areas: AdminArea[] | null) => {
    const mine = (r: Row) => !areas || canSeeArea(areas, areaOf(r));
    const day = schedule.filter(mine);
    const created = changes.filter((r) => mine(r) && inWindow(r.createdAt) && !(r.status === 'cancelled' && inWindow(r.cancelledAt)));
    const cancelled = changes.filter((r) => mine(r) && r.status === 'cancelled' && inWindow(r.cancelledAt) && !inWindow(r.createdAt));
    const pending = waiting.filter(mine);
    const armies = day.filter(wantsArmy).length;
    return {
      empty: !day.length && !created.length && !cancelled.length && !pending.length,
      vars: {
        сводка: `${String(slot.hour).padStart(2, '0')}:00`,
        новых: created.length,
        отмен: cancelled.length,
        новые: block('🆕 Новые записи', created.map((r) => line(r, when(r.startsAt)))),
        отмены: block('❌ Отмены', cancelled.map((r) => line(r, when(r.startsAt)))),
        ждут_список: block('⏳ Ждут подтверждения', pending.map((r) => line(r, when(r.startsAt)))),
        день: slot.hour === 12 ? 'Сегодня' : `Завтра, ${formatClubDateTime(scheduleDay).split(', ').slice(0, 2).join(', ')}`,
        всего: day.length,
        ждут: pending.length,
        армия: armies > 0 ? armies : '',
        список: day.length ? day.slice(0, 25).map((r) => line(r, time(r.startsAt) ?? '—')).join('\n') : 'Записей нет.',
      },
    };
  };
  const groups = new Map<string, string[]>();
  for (const id of getAdminTelegramIds()) {
    const key = (curatorAreasById(id) ?? []).join(',');
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  for (const [key, ids] of groups) {
    const areas = key ? (key.split(',') as AdminArea[]) : null;
    const built = vars(areas);
    if (areas && built.empty) continue;
    const text = await renderKind('admin_digest', built.vars);
    if (!text) continue;
    for (const id of ids) void sendTelegramMessageDetailed(id, text, 'admin_digest');
  }
}

/**
 * Автоподтверждение (17.11.2026): один раз после обновления — подтвердить будущие записи, которые ждут подтверждения,
 * у услуг с автоподтверждением; игроку уходит обычное «Запись подтверждена».
 */
async function confirmWaitingOnce(now: Date) {
  if (!(await markOnce('auto-confirm:backfill:2026-11-17'))) return;
  const rows = await db
    .select({ id: reservationsTable.id })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(and(eq(reservationsTable.status, 'pending'), eq(servicesTable.autoConfirm, true), gt(reservationsTable.startsAt, now)));
  for (const r of rows) {
    try {
      await confirmReservation(r.id);
    } catch (error) {
      console.warn('[auto-confirm] backfill failed', r.id, (error as Error).message);
    }
  }
  if (rows.length) console.info(`[auto-confirm] confirmed ${rows.length} waiting reservations`);
}

async function weeklyDigest(now: Date) {
  if (clubWeekday(now) !== 5 || clubHour(now) < 12) return;
  if (!(await markOnce(`weekly:${clubDateKey(now)}`))) return;
  const games = await loneTableGames(now, new Date(clubDayStart(now).getTime() + 3 * DAY));
  if (!games.length) return;
  const list = games.slice(0, 15).map(({ players }) => {
    const p = players[0]!;
    const d = p.details as ReservationDetails | null;
    const v = detailVars(d);
    return `• ${formatClubDateTime(p.startsAt)} — <b>${v.игра}</b>: ${playerLine(p, d)} (ищет соперника)`;
  });
  const text = await renderKind('weekly_digest', { список: list.join('\n') });
  // тем, у кого включены ивенты (категория типа) — подписчикам поиска тоже, если ивенты не выключены
  await announce('weekly_digest', await allRecipients(), text, { buttons: [{ text: 'Открыть запись', path: '/' }] });
}

/** Первый запуск: всё уже опубликованное считаем разосланным. */
async function initContentMarks() {
  if (await hasMark('init:content')) return;
  for (const n of await db.select({ id: newsTable.id }).from(newsTable)) await markOnce(`news:${n.id}`);
  for (const e of await db.select({ id: eventsTable.id }).from(eventsTable)) await markOnce(`event:${e.id}`);
  for (const g of await db.select({ id: dndGamesTable.id }).from(dndGamesTable)) await markOnce(`dnd:${g.id}`);
  await markOnce('init:content');
}

const preview = (text: string, max = 600) => {
  const plain = text.replace(/\s+\n/g, '\n').trim();
  return escapeHtml(plain.length > max ? `${plain.slice(0, max - 1)}…` : plain);
};

async function contentAnnouncements(now: Date) {
  await initContentMarks();
  const since = new Date(now.getTime() - 2 * DAY);

  const news = await db.select().from(newsTable).where(and(lte(newsTable.publishedAt, now), gte(newsTable.publishedAt, since)));
  for (const n of news) {
    if (!(await markOnce(`news:${n.id}`))) continue;
    const text = await renderKind('news_new', { заголовок: escapeHtml(n.title), текст: preview(n.text) });
    await announce('news_new', await allRecipients(), text, { imageUrl: n.coverUrl || null, buttons: [{ text: 'Читать', path: '/news' }] });
  }

  const events = await db.select().from(eventsTable).where(and(gte(eventsTable.createdAt, since), gt(eventsTable.startsAt, now)));
  for (const e of events) {
    if (!(await markOnce(`event:${e.id}`))) continue;
    const text = await renderKind('event_new', {
      название: escapeHtml(e.title),
      когда: formatClubDateTime(e.startsAt, e.endsAt),
      описание: e.description ? preview(e.description, 500) : '',
    });
    await announce('event_new', await allRecipients(), text, { imageUrl: e.bannerUrl, buttons: [{ text: 'Записаться', path: '/' }] });
  }

  const dnd = await db
    .select()
    .from(dndGamesTable)
    .where(and(eq(dndGamesTable.status, 'open'), gte(dndGamesTable.createdAt, since)));
  for (const g of dnd) {
    if (!(await markOnce(`dnd:${g.id}`))) continue;
    const text = await renderKind('dnd_new', {
      название: escapeHtml(g.title),
      когда: g.startsAt ? formatClubDateTime(g.startsAt, g.endsAt) : 'время уточняется',
      места: g.capacity,
    });
    await announce('dnd_new', await allRecipients(), text, { imageUrl: g.imageUrl, buttons: [{ text: 'Записаться', path: '/' }] });
  }
}

async function eventReminders(now: Date) {
  const windows: Array<{ from: number; to: number; tag: string; label: string }> = [
    { from: 23 * HOUR, to: 25 * HOUR, tag: 'ev24', label: 'Завтра' },
    { from: 2.5 * HOUR, to: 3.5 * HOUR, tag: 'ev3', label: 'Через 3 часа' },
  ];
  for (const w of windows) {
    const events = await db
      .select()
      .from(eventsTable)
      .where(and(gte(eventsTable.startsAt, new Date(now.getTime() + w.from)), lt(eventsTable.startsAt, new Date(now.getTime() + w.to))));
    for (const e of events) {
      const people = await db
        .select({ userId: usersEventsTable.userId, telegramId: usersTable.telegramId })
        .from(usersEventsTable)
        .innerJoin(usersTable, eq(usersEventsTable.userId, usersTable.id))
        .where(eq(usersEventsTable.eventId, e.id));
      for (const p of people) {
        if (!(await markOnce(`${w.tag}:${e.id}:${p.userId}`))) continue;
        await notifyKind('event_reminder', p.telegramId, { через: w.label, название: escapeHtml(e.title), когда: formatClubDateTime(e.startsAt, e.endsAt) });
      }
    }
  }
}

async function fewSeats(now: Date) {
  const events = await db.select().from(eventsTable).where(gt(eventsTable.startsAt, now));
  for (const e of events) {
    const [tables] = await db.select({ n: count() }).from(eventsTablesTable).where(eq(eventsTablesTable.eventId, e.id));
    const [taken] = await db.select({ n: count() }).from(usersEventsTable).where(eq(usersEventsTable.eventId, e.id));
    const left = e.seatsPerTable * Number(tables?.n ?? 0) - Number(taken?.n ?? 0);
    if (left <= 0 || left > 2) continue;
    if (!(await markOnce(`few:${e.id}`))) continue;
    const registered = new Set(
      (await db.select({ userId: usersEventsTable.userId }).from(usersEventsTable).where(eq(usersEventsTable.eventId, e.id))).map((r) => r.userId),
    );
    const text = await renderKind('event_few_seats', { места: left, название: escapeHtml(e.title), когда: formatClubDateTime(e.startsAt, e.endsAt) });
    await announce(
      'event_few_seats',
      (await allRecipients()).filter((r) => !r.userId || !registered.has(r.userId)),
      text,
      { imageUrl: e.bannerUrl, buttons: [{ text: 'Записаться', path: '/' }] },
    );
  }
}

const CATEGORY_LABEL: Record<string, string> = { warhammer: 'Warhammer', dnd: 'D&D', painting: 'Покраска', visits: 'Посещения клуба' };

async function ranksAndInactive(now: Date) {
  if (clubHour(now) < 12) return;
  if (!(await markOnce(`daily:${clubDateKey(now)}`))) return;
  const firstRun = await markOnce('init:ranks');

  // новый ранг: у кого за 3 дня закончились подтверждённые записи
  const recent = await db
    .selectDistinct({ userId: reservationsTable.userId })
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.status, 'confirmed'),
        gte(reservationsTable.endsAt, firstRun ? new Date(0) : new Date(now.getTime() - 3 * DAY)),
        lte(reservationsTable.endsAt, now),
      ),
    );
  const people = await recipientsOf(recent.map((r) => r.userId));
  for (const p of people) {
    const progress = await getPlayerProgress(p.userId!, now);
    for (const c of progress.categories) {
      if (c.rank === 'beginner') continue;
      if (!(await markOnce(`rank:${p.userId}:${c.category}:${c.rank}`)) || firstRun) continue;
      const text = await renderKind('rank_up', { ранг: c.rankLabel, категория: CATEGORY_LABEL[c.category] ?? c.category, игры: c.games });
      await announce('rank_up', [p], text, { buttons: [{ text: 'Мой профиль', path: '/profile' }] });
    }
  }

  // давно не заходили: последняя запись закончилась 30–60 дней назад, впереди записей нет; раз в месяц
  const last = await db
    .select({ userId: reservationsTable.userId, lastEnd: sql<Date>`max(${reservationsTable.endsAt})` })
    .from(reservationsTable)
    .where(inArray(reservationsTable.status, ['confirmed', 'pending']))
    .groupBy(reservationsTable.userId);
  const month = clubDateKey(now).slice(0, 7);
  const idle = last
    .filter((r) => {
      const t = r.lastEnd ? new Date(r.lastEnd).getTime() : 0;
      return t > 0 && now.getTime() - t >= 30 * DAY && now.getTime() - t <= 60 * DAY;
    })
    .map((r) => r.userId);
  if (!idle.length || firstRun) return;
  const text = await renderKind('inactive', {});
  const recipients: Awaited<ReturnType<typeof recipientsOf>> = [];
  for (const r of await recipientsOf(idle)) if (await markOnce(`inactive:${r.userId}:${month}`)) recipients.push(r);
  await announce('inactive', recipients, text, { buttons: [{ text: 'Открыть WarpHub', path: '/' }] });
}

/** Все проверки по расписанию; ошибка одной не мешает остальным. */
export async function runScheduledJobs(now = new Date()) {
  const jobs: Array<[string, (now: Date) => Promise<unknown>]> = [
    ['eve', eveReminders],
    ['still-free', stillFree],
    ['pending', pendingTooLong],
    ['summary', adminSummary],
    ['auto-confirm', confirmWaitingOnce],
    ['weekly', weeklyDigest],
    ['content', contentAnnouncements],
    ['event-reminders', eventReminders],
    ['few-seats', fewSeats],
    ['daily', ranksAndInactive],
    ['league', runLeagueJobs],
  ];
  for (const [name, job] of jobs) {
    try {
      await job(now);
    } catch (error) {
      console.warn(`[notify-jobs] ${name} failed:`, (error as Error).message);
    }
  }
}

