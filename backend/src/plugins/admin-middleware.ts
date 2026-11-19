import { bearer } from '@elysiajs/bearer';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { adminAreasOf, isAdminUser } from '../config/admin';
import { canSeeArea, curatorRule, reservationArea } from '../config/admin-areas';
import { db } from '../db';
import { reservationDiscountsTable, reservationsTable, servicesTable } from '../db/schema';
import { findUserFromBearer } from './auth-middleware';
import { jwtPlugin } from './jwt-plugin';

const CURATOR_DENIED = { error: 'Этот раздел — для администраторов с полным доступом', code: 'AREA_FORBIDDEN' };

/** Направление записи по её id (для проверки куратора); нет записи — null. */
async function areaOfReservation(id: string) {
  const [row] = await db
    .select({ slug: servicesTable.slug, details: reservationsTable.details })
    .from(reservationsTable)
    .innerJoin(servicesTable, eq(reservationsTable.serviceId, servicesTable.id))
    .where(eq(reservationsTable.id, id));
  return row ? { found: true as const, area: reservationArea(row.slug, row.details as { kind?: string; game?: string } | null) } : { found: false as const, area: null };
}

/**
 * JWT + проверка админа на одном инстансе.
 * authMiddleware внутрь не вкладываем: scoped resolve не доходит
 * через вложенный plugin до роутов родительского модуля.
 * Кураторы направлений (17.11.2026): только разделы и записи своих направлений (config/admin-areas.ts → curatorRule).
 */
export const adminMiddleware = new Elysia({ name: 'admin-middleware' })
  .use(jwtPlugin)
  .use(bearer())
  .resolve({ as: 'scoped' }, async ({ bearer, jwt, status: statusFn }) => {
    const user = await findUserFromBearer(bearer, jwt);
    if (!user) {
      return statusFn(401, { error: 'Unauthorized' });
    }

    return { user, adminAreas: isAdminUser(user) ? adminAreasOf(user) : null };
  })
  .onBeforeHandle({ as: 'scoped' }, async ({ user, adminAreas, request, status: statusFn }) => {
    if (!isAdminUser(user)) {
      return statusFn(403, { error: 'Forbidden' });
    }
    if (adminAreas === null) return;
    const rule = curatorRule(request.method, new URL(request.url).pathname);
    if (rule.kind === 'allow') return;
    if (rule.kind === 'deny') return statusFn(403, CURATOR_DENIED);
    if (rule.kind === 'any') {
      if (rule.areas.some((a) => adminAreas.includes(a))) return;
      return statusFn(403, CURATOR_DENIED);
    }
    let reservationId = rule.id;
    if (rule.kind === 'discount') {
      const [d] = await db.select({ reservationId: reservationDiscountsTable.reservationId }).from(reservationDiscountsTable).where(eq(reservationDiscountsTable.id, rule.id));
      if (!d) return; // обработчик ответит «не найдено»
      reservationId = d.reservationId;
    }
    const target = await areaOfReservation(reservationId);
    if (!target.found) return;
    if (!canSeeArea(adminAreas, target.area)) return statusFn(403, { error: 'Запись другого направления', code: 'AREA_FORBIDDEN' });
  });
