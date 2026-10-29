/**
 * Текст уведомления администраторам о записи (N1, 24.10.2026): одно полное сообщение на каждую новую запись —
 * что забронировано, когда, кто (имя, @username, Telegram ID) и все выбранные варианты.
 * Чистая функция без БД и окружения — покрыта tests/booking-notify.test.ts.
 */
import { armyLine, experienceLabel, gameLabel, paintSourceLabel } from '../../config/booking';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import type { ReservationDetails } from './rules';

export type BookingNotice = {
  /** created — новая запись; help-requested — в записи на покраску позже отметили «нужна помощь» */
  reason: 'created' | 'help-requested';
  serviceTitle: string;
  startsAt: Date | null;
  endsAt: Date | null;
  /** когда запись оформлена */
  createdAt: Date;
  tableName?: string | null;
  user: { telegramId: number; firstName: string; lastName?: string | null; username?: string | null };
  partySize: number | null;
  seatClubArmyOptions?: boolean[] | null;
  buyArmyOptions?: boolean[] | null;
  details: ReservationDetails | null;
  /** для игр за столом: сколько мест занято и сколько всего */
  table?: { occupied: number; seats: number } | null;
  /** полная длительность услуги, минут: если запись короче — в сообщении «ограниченное время» (B1) */
  fullMinutes?: number | null;
};

/** «3 ч», «2 ч 30 мин» */
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} ч` : '', m ? `${m} мин` : ''].filter(Boolean).join(' ') || '0 мин';
}

const seatsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест');

/** «2 из 3 мест» — сколько мест с отмеченным вариантом; null — вариант не отмечен ни для одного места. */
function seatsWith(options: boolean[] | null | undefined): string | null {
  if (!options?.length) return null;
  const n = options.filter(Boolean).length;
  return n ? `${n} из ${options.length} ${seatsWord(options.length)}` : null;
}

export function bookingNoticeText(n: BookingNotice): string {
  const title = escapeHtml(n.serviceTitle);
  let head: string;
  if (n.reason === 'help-requested') head = `🎨 <b>${title}: нужна помощь</b>`;
  else if (n.table && n.table.seats >= 2)
    head =
      n.table.occupied >= n.table.seats
        ? `✅ <b>Новая запись: ${title} — стол собран (${n.table.occupied}/${n.table.seats})</b>`
        : `♟ <b>Новая запись: ${title} — стол ждёт соперника (${n.table.occupied}/${n.table.seats})</b>`;
  else head = `📅 <b>Новая запись: ${title}</b>`;

  const lines = [
    head,
    `Когда: ${formatClubDateTime(n.startsAt, n.endsAt)}`,
    limitedLine(n),
    n.tableName ? `Стол: ${escapeHtml(n.tableName)}` : '',
    `Кто: ${escapeHtml(formatUserName(n.user))} · Telegram ID: ${n.user.telegramId}`,
    n.partySize && n.partySize > 1 ? `Мест: ${n.partySize}` : '',
  ];
  const d = n.details;
  if (d?.kind === 'wh_player') {
    lines.push(
      `Игра: ${escapeHtml(gameLabel(d.game))}`,
      escapeHtml(armyLine(d.game, d.army)),
      d.points != null ? `Очки: ${d.points}` : '',
      `Опыт: ${escapeHtml(experienceLabel(d.experienceLevel))}`,
    );
  } else if (d?.kind === 'painting') {
    lines.push(
      `Фракция: ${escapeHtml(d.faction)}`,
      `Модель: ${escapeHtml(d.model)}`,
      `Краски: ${escapeHtml(paintSourceLabel(d.paintSource))}`,
      `Нужна помощь: ${d.needsHelp ? 'да' : 'нет'}`,
      d.comment ? `Комментарий: ${escapeHtml(d.comment)}` : '',
    );
  }
  const clubArmy = seatsWith(n.seatClubArmyOptions);
  if (clubArmy) lines.push(`Армия клуба: ${clubArmy}`);
  const buyArmy = seatsWith(n.buyArmyOptions);
  if (buyArmy) lines.push(`Покупка армии: ${buyArmy}`);
  lines.push(`Оформлено: ${formatClubDateTime(n.createdAt)}`);
  return lines.filter(Boolean).join('\n');
}

/** «⚠️ Ограниченное время: 3 ч вместо 4 ч» — если запись короче полной длительности (B1). */
function limitedLine(n: BookingNotice): string {
  if (!n.fullMinutes || !n.startsAt || !n.endsAt) return '';
  const minutes = Math.round((n.endsAt.getTime() - n.startsAt.getTime()) / 60_000);
  return minutes < n.fullMinutes ? `⚠️ <b>Ограниченное время: ${hoursLabel(minutes)} вместо ${hoursLabel(n.fullMinutes)}</b> — дальше стол или места заняты` : '';
}
