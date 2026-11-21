/**
 * Переменные уведомлений о записи (14.11.2026, решение владельца: «везде указывать игру и максимально подробно»).
 * Всё берётся из записи в приложении: игра (40K / AoS / Kill Team / Warcry), армия или команда, очки, опыт;
 * у покраски — фракция и модель. Пустые значения убирают свою строку шаблона (renderTemplate).
 */
import { armyLine, experienceLabel, gameHasPoints, gameLabel, paintSourceLabel } from '../../config/booking';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import type { ReservationDetails } from '../booking/rules';

type Brief = { firstName: string; lastName?: string | null; username?: string | null };
type Service = { title: string | null; slug: string };

/** Название игры для записи игрока («Kill Team») или '' — запись не на игру. */
export function gameOf(details: ReservationDetails | null | undefined): string {
  return details?.kind === 'wh_player' ? gameLabel(details.game) : '';
}

/**
 * Тип записи (20.11.2026, решение владельца: «обычная игра, групповая или индивидуальная тренировка — во всех уведомлениях»).
 * Неизвестная услуга — её название.
 */
const BOOKING_TYPE: Record<string, string> = {
  wh_game: 'Игра',
  wh_group_training: 'Групповая тренировка',
  wh_solo_training: 'Индивидуальная тренировка',
  wh_painting: 'Покраска',
  club_visit: 'Посещение клуба',
  dnd_game: 'D&D',
};
export function bookingTypeOf(service: Service): string {
  return BOOKING_TYPE[service.slug] ?? service.title ?? service.slug;
}

/** Что за запись — для заголовка: «Игра · Kill Team», «Групповая тренировка · Warhammer 40,000», «Покраска». */
export function whatOf(service: Service, details: ReservationDetails | null | undefined): string {
  return [bookingTypeOf(service), gameOf(details)].filter(Boolean).join(' · ');
}

/** Тип стола (как в приложении, client/src/components/booking/tableCategory.ts). */
const TABLE_CATEGORY: Record<string, string> = { wh: 'полномасштабный варгейм', small: 'тактические игры' };

/** «Стол 1 · полномасштабный варгейм»; без категории — имя стола; без стола — ''. */
export function tableLabel(name: string | null | undefined, category?: string | null): string {
  if (!name) return '';
  const kind = category ? TABLE_CATEGORY[category] : undefined;
  return kind ? `${name} · ${kind}` : name;
}

/** Подробности игрока: игра, армия/команда/варбанда, очки, опыт; у покраски — фракция, модель, краски. */
export function detailVars(details: ReservationDetails | null | undefined) {
  if (details?.kind === 'wh_player') {
    return {
      игра: escapeHtml(gameLabel(details.game)),
      армия: escapeHtml(armyLine(details.game, details.army)),
      очки: details.points != null && gameHasPoints(details.game) ? String(details.points) : '',
      опыт: escapeHtml(experienceLabel(details.experienceLevel)),
      покраска: '',
    };
  }
  if (details?.kind === 'painting') {
    return {
      игра: '',
      армия: '',
      очки: '',
      опыт: '',
      покраска: escapeHtml(`Фракция: ${details.faction}\nМодель: ${details.model}\nКраски: ${paintSourceLabel(details.paintSource)}`),
    };
  }
  return { игра: '', армия: '', очки: '', опыт: '', покраска: '' };
}

/** «Иван Петров (@ivan) — Orks, 2000 очков» — соперник одной строкой. */
export function playerLine(user: Brief, details: ReservationDetails | null | undefined): string {
  const name = escapeHtml(formatUserName({ firstName: user.firstName, lastName: user.lastName ?? null, username: user.username ?? null }));
  if (details?.kind !== 'wh_player') return name;
  const parts = [details.army || (details.comment ? `хочет: ${details.comment}` : ''), details.points != null && gameHasPoints(details.game) ? `${details.points} очков` : '', experienceLabel(details.experienceLevel)].filter((p) => p && p !== '—');
  return `${name} — ${escapeHtml(parts.join(', '))}`;
}

/** Все переменные записи для шаблонов игрокам и администраторам. */
export function bookingVars(input: {
  service: Service;
  details: ReservationDetails | null | undefined;
  startsAt: Date | null;
  endsAt: Date | null;
  tableName?: string | null;
  /** категория стола (wh / small) — в подписи стола */
  tableCategory?: string | null;
}) {
  return {
    что: escapeHtml(whatOf(input.service, input.details)),
    услуга: escapeHtml(input.service.title ?? input.service.slug),
    когда: input.startsAt ? formatClubDateTime(input.startsAt, input.endsAt) : '',
    стол: escapeHtml(tableLabel(input.tableName, input.tableCategory)),
    ...detailVars(input.details),
  };
}

/**
 * Состояние стола или группы (20.11.2026): «стол ждёт соперника (1/2)», «стол собран (2/2)»,
 * у тренировок — «есть места (1/2 + тренер)», «группа собрана (2/2 + тренер)», индивидуальная — «1 + тренер».
 * seats < 1 — не за столом, ''.
 */
export function tableState(occupied: number, seats: number, hasTrainer = false): string {
  if (seats < 1) return '';
  if (occupied <= 0) return `стол свободен (0/${seats}${hasTrainer ? ' + тренер' : ''})`;
  if (seats === 1) return hasTrainer ? `${occupied}/1 + тренер` : '';
  const full = occupied >= seats;
  if (hasTrainer) return full ? `группа собрана (${occupied}/${seats} + тренер)` : `есть места (${occupied}/${seats} + тренер)`;
  return full ? `стол собран (${occupied}/${seats})` : `стол ждёт соперника (${occupied}/${seats})`;
}
