/**
 * Направления кураторов (17.11.2026, решение владельца): администратор, добавленный в админке, может курировать
 * одно или несколько направлений — от них зависят доступ в админке и уведомления. Пустой список — полный доступ.
 * Встроенные администраторы (config/admin.ts) — всегда полный доступ. Чистые функции — tests/admin-areas.test.ts.
 */
export const ADMIN_AREAS = ['40k', 'aos', 'kt', 'warcry', 'painting', 'dnd', 'club'] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

export const AREA_LABELS: Record<AdminArea, string> = {
  '40k': 'Warhammer 40K',
  aos: 'Age of Sigmar',
  kt: 'Kill Team',
  warcry: 'Warcry',
  painting: 'Покраска',
  dnd: 'D&D',
  club: 'Посещение клуба',
};

/** Игры за столами: масштабные (40K, AoS) и тактические (Kill Team, Warcry). */
export const GAME_AREAS: AdminArea[] = ['40k', 'aos', 'kt', 'warcry'];
const WH_PLAYER_SLUGS = new Set(['wh_game', 'wh_group_training', 'wh_solo_training']);

export function cleanAreas(input: unknown): AdminArea[] {
  if (!Array.isArray(input)) return [];
  return ADMIN_AREAS.filter((a) => input.includes(a));
}

/** Направление записи: игра записи игрока, покраска, клуб, D&D; неизвестная услуга — null (только полный доступ). */
export function reservationArea(slug: string, details: { kind?: string; game?: string | null } | null | undefined): AdminArea | null {
  if (WH_PLAYER_SLUGS.has(slug)) {
    const game = details?.kind === 'wh_player' ? (details.game ?? '40k') : '40k';
    return (GAME_AREAS as string[]).includes(game) ? (game as AdminArea) : '40k';
  }
  if (slug === 'wh_painting') return 'painting';
  if (slug.startsWith('club')) return 'club';
  if (slug.startsWith('dnd')) return 'dnd';
  return null;
}

/** Куратор видит запись: направление записи — среди его направлений. areas = null — полный доступ. */
export function canSeeArea(areas: readonly AdminArea[] | null, area: AdminArea | null): boolean {
  if (areas === null) return true;
  return area !== null && areas.includes(area);
}

export type CuratorRule =
  | { kind: 'allow' }
  | { kind: 'deny' }
  | { kind: 'any'; areas: AdminArea[] }
  | { kind: 'reservation'; id: string }
  | { kind: 'discount'; id: string };

const UUID = '[0-9a-fA-F-]{36}';
const RESERVATION_ACTION = new RegExp(`^/admin/reservations/(${UUID})/(pricing|discounts|training-game|reward|payments|confirm|reject|extend|move)$`);
const DISCOUNT = new RegExp(`^/admin/reservations/discounts/(${UUID})$`);

/**
 * Что куратору можно в админке (всё остальное — только полный доступ): записи своих направлений и действия с ними,
 * столы и брони столов (игры), покраска в дне столов, D&D, карточка игрока, проверка своих уведомлений, «кто я».
 * Списки записей и день столов фильтруются по направлениям в обработчиках.
 */
export function curatorRule(method: string, path: string): CuratorRule {
  const p = path.replace(/\/+$/, '');
  const m = method.toUpperCase();
  if (m === 'GET' && p === '/admin/me') return { kind: 'allow' };
  if (m === 'POST' && p === '/admin/notifications/test') return { kind: 'allow' };
  if (m === 'GET' && (p === '/admin/reservations' || p === '/admin/reservations/count')) return { kind: 'allow' };
  const discount = p.match(DISCOUNT);
  if (discount && m === 'DELETE') return { kind: 'discount', id: discount[1]! };
  const action = p.match(RESERVATION_ACTION);
  if (action) return { kind: 'reservation', id: action[1]! };
  // карточка игрока из списка записей (только просмотр)
  if (m === 'GET' && new RegExp(`^/admin/users/${UUID}$`).test(p)) return { kind: 'allow' };
  if (m === 'GET' && p === '/admin/warhammer/day') return { kind: 'any', areas: [...GAME_AREAS, 'painting'] };
  if (m === 'GET' && p === '/admin/club-armies') return { kind: 'any', areas: GAME_AREAS };
  if (p === '/admin/table-holds' || p.startsWith('/admin/table-holds/')) return { kind: 'any', areas: GAME_AREAS };
  if (p === '/admin/dnd' || p.startsWith('/admin/dnd/')) return { kind: 'any', areas: ['dnd'] };
  return { kind: 'deny' };
}
