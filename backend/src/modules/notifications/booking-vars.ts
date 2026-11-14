/**
 * Переменные уведомлений о записи (14.11.2026, решение владельца: «везде указывать игру и максимально подробно»).
 * Всё берётся из записи в приложении: игра (40K / AoS / Kill Team / Warcry), армия или команда, очки, опыт;
 * у покраски — фракция и модель. Пустые значения убирают свою строку шаблона (renderTemplate).
 */
import { armyLine, experienceLabel, gameLabel, paintSourceLabel } from '../../config/booking';
import { escapeHtml, formatClubDateTime, formatUserName } from '../../lib/telegram/format';
import type { ReservationDetails } from '../booking/rules';

type Brief = { firstName: string; lastName?: string | null; username?: string | null };
type Service = { title: string | null; slug: string };

/** Название игры для записи игрока («Kill Team») или '' — запись не на игру. */
export function gameOf(details: ReservationDetails | null | undefined): string {
  return details?.kind === 'wh_player' ? gameLabel(details.game) : '';
}

/** Что за запись — для заголовка: игра, а если это не игра — название услуги. */
export function whatOf(service: Service, details: ReservationDetails | null | undefined): string {
  return gameOf(details) || service.title || service.slug;
}

/** Подробности игрока: игра, армия/команда/варбанда, очки, опыт; у покраски — фракция, модель, краски. */
export function detailVars(details: ReservationDetails | null | undefined) {
  if (details?.kind === 'wh_player') {
    return {
      игра: escapeHtml(gameLabel(details.game)),
      армия: escapeHtml(armyLine(details.game, details.army)),
      очки: details.points != null ? String(details.points) : '',
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
  const parts = [details.army, details.points != null ? `${details.points} очков` : '', experienceLabel(details.experienceLevel)].filter((p) => p && p !== '—');
  return `${name} — ${escapeHtml(parts.join(', '))}`;
}

/** Все переменные записи для шаблонов игрокам и администраторам. */
export function bookingVars(input: {
  service: Service;
  details: ReservationDetails | null | undefined;
  startsAt: Date | null;
  endsAt: Date | null;
  tableName?: string | null;
}) {
  return {
    что: escapeHtml(whatOf(input.service, input.details)),
    услуга: escapeHtml(input.service.title ?? input.service.slug),
    когда: input.startsAt ? formatClubDateTime(input.startsAt, input.endsAt) : '',
    стол: input.tableName ? escapeHtml(input.tableName) : '',
    ...detailVars(input.details),
  };
}
