/**
 * Сводка администраторам 12:00 / 20:00 (20.11.2026, решение владельца): расписание — по столам и времени,
 * у каждой записи тип (игра / групповая / индивидуальная тренировка / покраска / посещение), игра, стол с типом,
 * время, состояние стола (1/2 ждёт соперника, 2/2 собран, + тренер) и кто за столом.
 * Чистые функции без БД — покрыты tests/summary-format.test.ts.
 */
import { clubArmyLabel } from '../../config/booking';
import { escapeHtml, formatClubDateTime } from '../../lib/telegram/format';
import type { ReservationDetails } from '../booking/rules';
import { playerLine, tableLabel, tableState, whatOf } from './booking-vars';

export type SummaryRow = {
  id: string | number;
  serviceId: number;
  slug: string;
  service: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  tableId: number | null;
  tableName: string | null;
  tableCategory: string | null;
  partySize: number | null;
  /** мест за столом у услуги (0 — не за столом) */
  seats: number;
  hasTrainer: boolean;
  firstName: string;
  lastName: string | null;
  username: string | null;
  details: unknown;
  clubArmy: boolean[] | null;
};

const peopleWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'человека' : 'человек');
const timeOf = (d: Date | null) => (d ? formatClubDateTime(d).split(', ').pop()! : '—');
const range = (from: Date | null, to: Date | null) => (to ? `${timeOf(from)}–${timeOf(to)}` : timeOf(from));
const seatsTaken = (rows: SummaryRow[]) => rows.reduce((sum, r) => sum + Math.max(1, r.partySize ?? 1), 0);
const atTable = (r: SummaryRow) => r.tableId !== null && r.seats >= 1;

/** Одна игра за столом / одна сессия услуги без стола: та же услуга, стол и начало. */
export function sessionKey(r: SummaryRow): string {
  return `${r.serviceId}:${atTable(r) ? r.tableId : 'pool'}:${r.startsAt?.getTime() ?? 0}`;
}

function extras(r: SummaryRow): string {
  const d = r.details as ReservationDetails | null;
  const parts: string[] = [];
  if ((r.partySize ?? 1) > 1) parts.push(`${r.partySize} мест`);
  if ((r.clubArmy ?? []).some(Boolean)) parts.push(d?.kind === 'wh_player' ? clubArmyLabel(d.game).toLowerCase() : 'армия клуба');
  if (d?.kind === 'painting') parts.push(`${escapeHtml(d.faction)}: ${escapeHtml(d.model)}`, ...(d.needsHelp ? ['нужна помощь'] : []));
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/** Состояние сессии: стол — «стол собран (2/2)»; без стола — «3 человека». */
export function sessionState(rows: SummaryRow[]): string {
  const first = rows[0]!;
  const taken = seatsTaken(rows);
  if (atTable(first)) return tableState(taken, first.seats, first.hasTrainer);
  return `${taken} ${peopleWord(taken)}`;
}

function groupSessions(rows: SummaryRow[]): SummaryRow[][] {
  const map = new Map<string, SummaryRow[]>();
  for (const r of rows) map.set(sessionKey(r), [...(map.get(sessionKey(r)) ?? []), r]);
  return [...map.values()].sort(
    (a, b) => (a[0]!.startsAt?.getTime() ?? 0) - (b[0]!.startsAt?.getTime() ?? 0) || (a[0]!.tableName ?? '').localeCompare(b[0]!.tableName ?? '', 'ru'),
  );
}

/**
 * Расписание дня по столам и времени:
 *   🎲 <b>18:00–21:00 · Стол 1 · полномасштабный варгейм</b>
 *   Игра · Warhammer 40,000 — стол собран (2/2)
 *   • Иван Петров (@ivan) — Orks, 2000 очков, Игрок
 */
export function scheduleText(rows: SummaryRow[], limit = 25): string {
  if (!rows.length) return 'Записей нет.';
  const sessions = groupSessions(rows);
  const blocks = sessions.slice(0, limit).map((s) => {
    const first = s[0]!;
    const end = s.reduce<Date | null>((max, r) => (r.endsAt && (!max || r.endsAt > max) ? r.endsAt : max), null);
    const where = atTable(first) ? tableLabel(first.tableName, first.tableCategory) : '';
    const head = `${atTable(first) ? '🎲' : '👥'} <b>${[range(first.startsAt, end), escapeHtml(where)].filter(Boolean).join(' · ')}</b>`;
    const what = `${escapeHtml(whatOf({ title: first.service, slug: first.slug }, first.details as ReservationDetails | null))} — ${sessionState(s)}`;
    const players = s.map((r) => `• ${playerLine(r, r.details as ReservationDetails | null)}${extras(r)}`);
    return [head, what, ...players].join('\n');
  });
  const more = sessions.length > limit ? `\n\n… и ещё ${sessions.length - limit}` : '';
  return blocks.join('\n\n') + more;
}

/** Итог дня: «5 · столов: 3, без стола: 1». */
export function dayTotal(rows: SummaryRow[]): string {
  if (!rows.length) return '0';
  const sessions = groupSessions(rows);
  const tables = sessions.filter((s) => atTable(s[0]!)).length;
  const pool = sessions.length - tables;
  const parts = [tables ? `столов: ${tables}` : '', pool ? `без стола: ${pool}` : ''].filter(Boolean);
  return `${rows.length}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
}

/**
 * Строка новой записи или отмены: дата и время, тип · игра, стол с типом, кто; состояние стола сейчас и кто ещё за ним.
 * session — активные записи той же сессии (без этой записи для отмены, с ней для новой).
 */
export function changeLine(r: SummaryRow, session: SummaryRow[]): string {
  const d = r.details as ReservationDetails | null;
  const where = atTable(r) ? ` · ${escapeHtml(tableLabel(r.tableName, r.tableCategory))}` : '';
  const head = `• ${formatClubDateTime(r.startsAt, r.endsAt)} <b>${escapeHtml(whatOf({ title: r.service, slug: r.slug }, d))}</b>${where}`;
  const mates = session.filter((m) => m.id !== r.id);
  const state = session.length ? sessionState(session) : atTable(r) ? tableState(0, r.seats, r.hasTrainer) : '';
  return [
    `${head} — ${playerLine(r, d)}${extras(r)}`,
    state || mates.length ? `   ${[state ? `сейчас: ${state}` : '', mates.length ? `${atTable(r) ? 'за столом' : 'также'}: ${mates.map((m) => playerLine(m, m.details as ReservationDetails | null)).join('; ')}` : ''].filter(Boolean).join(' · ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
