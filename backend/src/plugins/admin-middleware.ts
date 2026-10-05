import { bearer } from '@elysiajs/bearer';
import { Elysia } from 'elysia';
import { isAdminUser } from '../config/admin';
import { findUserFromBearer } from './auth-middleware';
import { jwtPlugin } from './jwt-plugin';

/**
 * JWT + проверка админа на одном инстансе.
 * authMiddleware внутрь не вкладываем: scoped resolve не доходит
 * через вложенный plugin до роутов родительского модуля.
 */
export const adminMiddleware = new Elysia({ name: 'admin-middleware' })
  .use(jwtPlugin)
  .use(bearer())
  .resolve({ as: 'scoped' }, async ({ bearer, jwt, status: statusFn }) => {
    const user = await findUserFromBearer(bearer, jwt);
    if (!user) {
      return statusFn(401, { error: 'Unauthorized' });
    }

    return { user };
  })
  .onBeforeHandle({ as: 'scoped' }, ({ user, status: statusFn }) => {
    if (!isAdminUser(user)) {
      return statusFn(403, { error: 'Forbidden' });
    }
  });
