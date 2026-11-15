import { Elysia, status, t } from 'elysia';
import { apiModels } from '../../lib/api-schemas';
import {
  adminFindPointPromos,
  adminFindRewards,
  adminMinigameStats,
  getMinigameSettings,
  redeemReward,
  saveMinigameSettings,
} from '../minigames/service';
import { handleMinigame } from '../minigames/http';
import { adminAdjustPoints, adminFindPlayers, getPointsHistory } from '../minigames/cards';
import { adminMiddleware } from '../../plugins/admin-middleware';
import {
  BookingError,
  confirmReservation,
  countReservations,
  extendReservation,
  getAdminWarhammerDay,
  listReservations,
  withTableGames,
  moveReservationToTable,
  parseIsoDateTime,
  rejectReservation,
  toReservationResponse,
} from '../booking/service';
import { getAdminUserProfile, searchUsersByUsername } from '../users/service';
import { notificationDiagnostics, sendTelegramMessageDetailed, testNotification } from '../notifications/service';
import { KIND_BY_ID, renderTemplate } from '../notifications/catalog';
import { getNotificationConfig, notificationLog, saveNotificationConfig } from '../notifications/hub';
import { notificationCatalog, saveTemplate } from '../notifications/admin';
import { notificationImage } from '../notifications/card';
import {
  audienceCount,
  BroadcastError,
  createBroadcast,
  deleteBroadcast,
  isNotificationOwner,
  listBroadcasts,
  pauseBroadcast,
  startBroadcast,
  testBroadcast,
  updateBroadcast,
} from '../notifications/broadcasts';

const BroadcastAudienceSchema = t.Object({
  kind: t.Union([t.Literal('all'), t.Literal('game'), t.Literal('recent'), t.Literal('events'), t.Literal('admins'), t.Literal('me')]),
  game: t.Optional(t.String()),
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
});
const BroadcastButtonSchema = t.Object({ text: t.String({ maxLength: 40 }), path: t.Optional(t.String()), url: t.Optional(t.String()) });
const BroadcastBody = t.Object({
  title: t.String({ maxLength: 120 }),
  text: t.String({ maxLength: 4000 }),
  imageUrl: t.Optional(t.Nullable(t.String())),
  buttons: t.Optional(t.Array(BroadcastButtonSchema, { maxItems: 3 })),
  audience: BroadcastAudienceSchema,
  schedule: t.Union([
    t.Object({ type: t.Literal('now') }),
    t.Object({ type: t.Literal('once'), at: t.String() }),
    t.Object({ type: t.Literal('weekly'), days: t.Array(t.Integer({ minimum: 1, maximum: 7 })), time: t.String(), until: t.Optional(t.Nullable(t.String())) }),
    t.Object({ type: t.Literal('monthly'), day: t.Integer({ minimum: 1, maximum: 31 }), time: t.String(), until: t.Optional(t.Nullable(t.String())) }),
  ]),
});

function broadcastError(error: unknown) {
  if (error instanceof BroadcastError) return status(error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400, { error: error.message });
  return status(500, { error: (error as Error).message });
}
import { addAdmin, AdminsError, listAdmins, removeAdmin } from '../admins/service';
import { isBuiltinAdmin } from '../../config/admin';
import {
  createEvent,
  deleteEvent,
  EventError,
  getEventById,
  listEmptyTables,
  listEvents,
  updateEvent,
} from '../events/service';
import {
  createNews,
  deleteNews,
  getNewsById,
  listAllNews,
  NewsError,
  updateNews,
} from '../news/service';
import {
  isAllowedUploadDestination,
  uploadImage,
} from '../../lib/storage/upload';
import {
  createGame,
  deleteGame,
  DndError,
  listAllGames,
  listGameBookings,
  listTrialRequests,
  updateGame,
  updateTrialRequest,
} from '../dnd/service';
import { mapDndError } from '../dnd/http';
import { findPlayers, listSupporters, setSupporter, SupporterError } from '../supporters/service';
import { createTableHold, deleteTableHold, HoldError, listTableHolds } from '../table-holds/service';
import { createPartnerCard, deletePartnerCard, getPartnerShowcase, PartnerError, updatePartnerCard, updatePartnerSettings } from '../partners/service';
import { fetchPartnerMetadata } from '../partners/metadata';
import {
  addReservationPayment,
  applyManualDiscount,
  applyRewardDiscount,
  applyTrainingDiscount,
  ensureReservationPricing,
  listServicePrices,
  PricingError,
  removeManualDiscount,
  upsertServicePrice,
} from '../pricing/service';
import { pricingBillingModes } from '../../db/schema/pricing';

const dndGameBody = t.Object({
  title: t.Optional(t.String({ description: 'Название' })),
  description: t.Optional(t.Nullable(t.String())),
  gameType: t.Optional(
    t.String({ description: 'Тип игры: «Пробная игра», «One-shot» …' }),
  ),
  startsAt: t.Optional(t.Nullable(t.String({ description: 'Точное начало (ISO 8601); null — время примерное' }))),
  endsAt: t.Optional(t.Nullable(t.String({ description: 'Окончание (ISO 8601)' }))),
  daysOfWeek: t.Optional(t.Array(t.Integer({ minimum: 1, maximum: 7 }), { description: 'Примерное время: дни недели, 1 — пн … 7 — вс' })),
  timesOfDay: t.Optional(t.Array(t.String(), { description: 'Примерное время: morning / afternoon / evening' })),
  capacity: t.Optional(t.Number({ minimum: 1, description: 'Мест всего' })),
  imageUrl: t.Optional(t.Nullable(t.String())),
  status: t.Optional(
    t.Union([
      t.Literal('draft'),
      t.Literal('open'),
      t.Literal('closed'),
      t.Literal('cancelled'),
    ]),
  ),
});

const reservationsFilterQuery = t.Partial(
  t.Object({
    date: t.String({
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description:
        'Календарный день записи (UTC+5): клубная смена 12:00 → 10:00 след. дня',
    }),
    serviceId: t.Number({ description: 'ID услуги' }),
    tableId: t.Number({ description: 'ID стола' }),
    status: t.Union([
      t.Literal('pending'),
      t.Literal('confirmed'),
      t.Literal('cancelled'),
    ]),
    userId: t.String({
      format: 'uuid',
      description: 'ID пользователя',
    }),
    categories: t.String({
      pattern: '^(pending|confirmed|cancelled|past)(,(pending|confirmed|cancelled|past))*$',
      description: 'Категории через запятую: pending (ждут подтверждения), confirmed, cancelled, past (прошедшие)',
    }),
    startsAt: t.String({
      description: 'Нижняя граница startsAt (ISO 8601)',
    }),
    endsAt: t.String({
      description: 'Верхняя граница endsAt (ISO 8601)',
    }),
    sortBy: t.Union([
      t.Literal('startsAt'),
      t.Literal('createdAt'),
      t.Literal('status'),
    ]),
    sortOrder: t.Union([t.Literal('asc'), t.Literal('desc')]),
    limit: t.Number({
      minimum: 1,
      maximum: 100,
      description: 'Размер страницы (по умолчанию 50, максимум 100)',
    }),
    offset: t.Number({
      minimum: 0,
      description: 'Смещение от начала выборки (по умолчанию 0)',
    }),
  }),
);

function mapBookingError(error: BookingError) {
  switch (error.code) {
    case 'SERVICE_NOT_FOUND':
    case 'RESERVATION_NOT_FOUND':
      return status(404, { error: error.message });
    case 'SLOT_UNAVAILABLE':
    case 'RESERVATION_ALREADY_CANCELLED':
    case 'RESERVATION_ALREADY_CONFIRMED':
      return status(409, { error: error.message });
    case 'SERVICE_NOT_BOOKABLE':
    case 'TABLE_REQUIRED':
    case 'TABLE_NOT_ALLOWED':
    case 'TABLE_NOT_FOUND':
    case 'INVALID_PARTY_SIZE':
    case 'INVALID_TIME':
    case 'INVALID_SEAT_OPTIONS':
    case 'INVALID_BUY_ARMY_OPTIONS':
    case 'INVALID_ENDS_AT':
    case 'RESERVATION_NOT_PENDING':
    case 'DATE_NOT_ALLOWED':
    case 'INVALID_DETAILS':
    case 'RESERVATION_STARTED':
      return status(400, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected booking error' });
    }
  }
}

function mapHoldError(error: HoldError) {
  const code = error.code === 'TABLE_NOT_FOUND' || error.code === 'DND_GAME_NOT_FOUND' || error.code === 'HOLD_NOT_FOUND' ? 404 : error.code === 'INVALID_INPUT' ? 400 : 409;
  return status(code, { error: error.message, code: error.code });
}

function mapPartnerError(error: PartnerError) {
  return status(error.code === 'NOT_FOUND' ? 404 : 400, { error: error.message, code: error.code });
}

function mapPricingError(error: PricingError) {
  const notFound = ['SERVICE_NOT_FOUND', 'RESERVATION_NOT_FOUND', 'PRICING_NOT_FOUND', 'DISCOUNT_NOT_FOUND', 'REWARD_NOT_FOUND'];
  const conflict = ['REWARD_USED', 'PAYMENT_EXCEEDED', 'DISCOUNT_BELOW_PAID', 'DISCOUNT_FORBIDDEN', 'TRAINING_DISCOUNT_EXISTS', 'TRAINING_LIMIT_REACHED', 'MEMBERSHIP_DISCOUNT_EXISTS'];
  const code = notFound.includes(error.code) ? 404 : conflict.includes(error.code) ? 409 : 400;
  return status(code, { error: error.message, code: error.code });
}

function mapEventError(error: EventError) {
  switch (error.code) {
    case 'EVENT_NOT_FOUND':
      return status(404, { error: error.message });
    case 'INVALID_TIME_RANGE':
    case 'INVALID_TABLES':
    case 'INVALID_SEATS_PER_TABLE':
    case 'EVENT_CAPACITY_BELOW_REGISTRATIONS':
      return status(400, { error: error.message });
    case 'EVENT_FULL':
    case 'ALREADY_REGISTERED':
    case 'TABLES_UNAVAILABLE':
      return status(409, { error: error.message });
    case 'NOT_REGISTERED':
      return status(404, { error: error.message });
    case 'EVENT_REGISTRATION_CLOSED':
    case 'INVALID_PARTY_SIZE':
      return status(400, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected event error' });
    }
  }
}

function mapNewsError(error: NewsError) {
  switch (error.code) {
    case 'NEWS_NOT_FOUND':
      return status(404, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected news error' });
    }
  }
}

export const adminModule = new Elysia({ prefix: '/admin', tags: ['Admin'] })
  .model(apiModels)
  .use(adminMiddleware)
  .guard({
    detail: {
      security: [{ bearerAuth: [] }],
    },
  })
  .get(
    '/reservations/count',
    async ({ query }) => {
      try {
        const total = await countReservations(query);
        return { count: total };
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      query: reservationsFilterQuery,
      detail: {
        summary: 'Количество бронирований по фильтрам',
        description:
          'Возвращает `{ count }` — число записей, соответствующих тем же фильтрам, что и GET /admin/reservations.',
      },
    },
  )
  .get(
    '/reservations',
    async ({ query }) => {
      try {
        return await withTableGames(await listReservations(query));
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      query: reservationsFilterQuery,
      detail: {
        summary: 'Список бронирований по фильтрам',
        description:
          'Все заявки с фильтрами, сортировкой (sortBy, sortOrder) и пагинацией. Доступно только администратору.',
      },
    },
  )
  .get('/pricing/services', async () => listServicePrices(), {
    detail: { tags: ['Admin'], summary: 'Тарифы всех услуг' },
  })
  .put('/pricing/services/:serviceId', async ({ params, body, user }) => {
    try {
      return await upsertServicePrice({
        serviceId: params.serviceId,
        billingMode: body.billingMode,
        unitPrice: body.unitPrice,
        armyRentalPricePer1000: body.armyRentalPricePer1000,
        ownMaterialsPrice: body.ownMaterialsPrice,
        clubMaterialsPrice: body.clubMaterialsPrice,
        thirdGameDiscountPercent: body.thirdGameDiscountPercent,
        createdBy: user.id,
      });
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ serviceId: t.Number() }),
    body: t.Object({
      billingMode: t.Union([
        t.Literal(pricingBillingModes[0]),
        t.Literal(pricingBillingModes[1]),
        t.Literal(pricingBillingModes[2]),
      ]),
      unitPrice: t.Number({ minimum: 0 }),
      armyRentalPricePer1000: t.Optional(t.Number({ minimum: 0 })),
      ownMaterialsPrice: t.Optional(t.Number({ minimum: 0 })),
      clubMaterialsPrice: t.Optional(t.Number({ minimum: 0 })),
      thirdGameDiscountPercent: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    }),
    detail: { tags: ['Admin'], summary: 'Сохранить новый тариф услуги; старые записи не пересчитываются' },
  })
  .get('/reservations/:id/pricing', async ({ params }) => {
    try {
      return await ensureReservationPricing(params.id);
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    detail: { tags: ['Admin'], summary: 'Стоимость записи, скидки, оплаты и остаток' },
  })
  .post('/reservations/:id/discounts', async ({ params, body, user }) => {
    try {
      return await applyManualDiscount(params.id, { ...body, createdBy: user.id });
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({
      kind: t.Union([t.Literal('membership'), t.Literal('manual')]),
      percent: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
      amount: t.Optional(t.Number({ minimum: 0 })),
      note: t.String({ minLength: 1 }),
    }),
    detail: { tags: ['Admin'], summary: 'Добавить последовательную скидку за членство или ручную скидку' },
  })
  .post('/reservations/:id/training-game', async ({ params, user }) => {
    try {
      return await applyTrainingDiscount(params.id, user.id);
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    detail: { tags: ['Admin'], summary: 'Применить скидку 50% на обучающую игру; не больше трёх на игрока' },
  })
  .post('/reservations/:id/reward', async ({ params, body, user }) => {
    try {
      return await applyRewardDiscount(params.id, body.code, user.id);
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({ code: t.String({ minLength: 1 }) }),
    detail: { tags: ['Admin'], summary: 'Применить одноразовый код скидки за мини-игру владельца записи' },
  })
  .delete('/reservations/discounts/:discountId', async ({ params }) => {
    try {
      return await removeManualDiscount(params.discountId);
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ discountId: t.String({ format: 'uuid' }) }),
    detail: { tags: ['Admin'], summary: 'Удалить ручную скидку или скидку за членство' },
  })
  .post('/reservations/:id/payments', async ({ params, body, user }) => {
    try {
      return await addReservationPayment({
        reservationId: params.id,
        amount: body.amount,
        method: body.method,
        note: body.note,
        createdBy: user.id,
      });
    } catch (error) {
      if (error instanceof PricingError) return mapPricingError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({
      amount: t.Number({ exclusiveMinimum: 0 }),
      method: t.Union([t.Literal('cash'), t.Literal('card'), t.Literal('transfer'), t.Literal('other')]),
      note: t.Optional(t.String()),
    }),
    detail: { tags: ['Admin'], summary: 'Зафиксировать ручную оплату без превышения остатка' },
  })
  .patch(
    '/reservations/:id/confirm',
    async ({ params }) => {
      try {
        const reservation = await confirmReservation(params.id);
        return toReservationResponse(reservation);
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID бронирования' }),
      }),
      detail: {
        summary: 'Подтвердить бронирование',
        description: 'Переводит заявку из pending в confirmed.',
      },
    },
  )
  .patch(
    '/reservations/:id/reject',
    async ({ params }) => {
      try {
        const reservation = await rejectReservation(params.id);

        return {
          ...toReservationResponse(reservation),
          status: 'cancelled' as const,
          cancelledAt: reservation.cancelledAt!.toISOString(),
        };
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID бронирования' }),
      }),
      detail: {
        summary: 'Отклонить бронирование',
        description: 'Отменяет заявку (status = cancelled).',
      },
    },
  )
  .patch(
    '/reservations/:id/extend',
    async ({ params, body }) => {
      try {
        const reservation = await extendReservation(
          params.id,
          parseIsoDateTime(body.endsAt),
        );
        return toReservationResponse(reservation);
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID бронирования' }),
      }),
      body: t.Object({
        endsAt: t.String({
          description:
            'Новое время окончания (ISO 8601), не позже закрытия клуба',
        }),
      }),
      detail: {
        summary: 'Продлить бронирование',
        description:
          'Изменяет reservations.endsAt. Новое время должно быть позже startsAt и не позже закрытия клуба (10:00 след. дня UTC+5).',
      },
    },
  )
  .get(
    '/warhammer/day',
    async ({ query }) => {
      try {
        return await getAdminWarhammerDay(query.date);
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);
        return status(400, { error: (error as Error).message });
      }
    },
    {
      query: t.Object({
        date: t.String({
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Дата (YYYY-MM-DD, время клуба)',
        }),
      }),
      detail: {
        tags: ['Admin'],
        summary: 'Столы Warhammer и покраска за день',
        description:
          'Все игры и тренировки по столам (с занятостью 1/2, 2/2 и данными игроков) и записи на покраску с формой.',
      },
    },
  )
  .get('/supporters', async () => listSupporters(), { detail: { tags: ['Admin'], summary: 'Поддержка клуба: игроки со званием' } })
  .get('/supporters/search', async ({ query }) => findPlayers(query.q ?? ''), {
    query: t.Object({ q: t.Optional(t.String({ description: '@username или Telegram ID' })) }),
    detail: { tags: ['Admin'], summary: 'Поддержка клуба: поиск игрока' },
  })
  .put(
    '/supporters/:userId',
    async ({ params, body, user }) => {
      try {
        return await setSupporter(params.userId, body.title, Number(user.telegramId));
      } catch (error) {
        if (error instanceof SupporterError) return status(error.code === 'USER_NOT_FOUND' ? 404 : 400, { error: error.message, code: error.code });
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
      body: t.Object({ title: t.Nullable(t.String({ description: 'flame | crown | banner; null — снять звание' })) }),
      detail: { tags: ['Admin'], summary: 'Поддержка клуба: назначить или снять звание' },
    },
  )
  .get(
    '/table-holds',
    async ({ query }) => listTableHolds({ from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined }),
    {
      query: t.Object({
        from: t.Optional(t.String({ description: 'С какого момента (ISO 8601), по умолчанию — сейчас' })),
        to: t.Optional(t.String({ description: 'До какого момента (ISO 8601)' })),
      }),
      detail: { tags: ['Admin'], summary: 'Брони столов администратором (ещё не закончившиеся)' },
    },
  )
  .post(
    '/table-holds',
    async ({ body, user }) => {
      try {
        return await createTableHold(body, Number(user.telegramId));
      } catch (error) {
        if (error instanceof HoldError) return mapHoldError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: t.Object({
        tableId: t.Number(),
        startsAt: t.String({ description: 'Начало (ISO 8601)' }),
        endsAt: t.String({ description: 'Конец (ISO 8601)' }),
        purpose: t.String({ description: 'tournament | club_event | private_game | dnd | other' }),
        title: t.String(),
        description: t.Optional(t.Nullable(t.String())),
        reservedBy: t.Optional(t.Nullable(t.String({ description: 'Кто бронирует (мастер, организатор)' }))),
        dndGameId: t.Optional(t.Nullable(t.Number())),
      }),
      detail: {
        tags: ['Admin'],
        summary: 'Забронировать стол',
        description: 'Стол закрывается для записи игроков на интервал (одна смена клуба). Отказ, если за столом есть записи, ивент или другая бронь.',
      },
    },
  )
  .delete(
    '/table-holds/:id',
    async ({ params }) => {
      try {
        return await deleteTableHold(params.id);
      } catch (error) {
        if (error instanceof HoldError) return mapHoldError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    { params: t.Object({ id: t.Number() }), detail: { tags: ['Admin'], summary: 'Снять бронь стола' } },
  )
  .patch(
    '/reservations/:id/move',
    async ({ params, body }) => {
      try {
        const reservation = await moveReservationToTable(params.id, body.tableId);
        return toReservationResponse(reservation);
      } catch (error) {
        if (error instanceof BookingError) return mapBookingError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID бронирования' }),
      }),
      body: t.Object({
        tableId: t.Number({ minimum: 1, description: 'Новый стол' }),
      }),
      detail: {
        tags: ['Admin'],
        summary: 'Пересадить игрока за другой стол',
        description:
          'Время не меняется. Целевой стол должен быть свободен или содержать игру той же услуги с тем же временем начала и свободным местом. Игрок получает уведомление.',
      },
    },
  )
  .get('/dnd/games', async () => listAllGames(), {
    detail: { tags: ['D&D'], summary: 'Все игры D&D (включая черновики)' },
  })
  .post(
    '/dnd/games',
    async ({ body }) => {
      try {
        return await createGame(body);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: dndGameBody,
      detail: {
        tags: ['D&D'],
        summary: 'Создать игру D&D',
        description:
          'Обязательны title, gameType, startsAt, capacity. status по умолчанию open.',
      },
    },
  )
  .patch(
    '/dnd/games/:id',
    async ({ params, body }) => {
      try {
        return await updateGame(params.id, body);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.Number() }),
      body: dndGameBody,
      detail: {
        tags: ['D&D'],
        summary: 'Изменить игру D&D',
        description:
          'Вместимость нельзя сделать меньше уже занятых мест. При переносе или отмене записавшиеся получают уведомление.',
      },
    },
  )
  .delete(
    '/dnd/games/:id',
    async ({ params }) => {
      try {
        return await deleteGame(params.id);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.Number() }),
      detail: {
        tags: ['D&D'],
        summary: 'Удалить игру D&D без записей',
      },
    },
  )
  .get(
    '/dnd/games/:id/bookings',
    async ({ params }) => listGameBookings(params.id),
    {
      params: t.Object({ id: t.Number() }),
      detail: { tags: ['D&D'], summary: 'Записи на игру D&D' },
    },
  )
  .get(
    '/dnd/trial-requests',
    async ({ query }) => listTrialRequests(query.status),
    {
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal('new'),
            t.Literal('grouped'),
            t.Literal('cancelled'),
          ]),
        ),
      }),
      detail: { tags: ['D&D'], summary: 'Заявки «Хочу попробовать»' },
    },
  )
  .patch(
    '/dnd/trial-requests/:id',
    async ({ params, body }) => {
      try {
        return await updateTrialRequest(params.id, body);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        status: t.Union([
          t.Literal('new'),
          t.Literal('grouped'),
          t.Literal('cancelled'),
        ]),
        gameId: t.Optional(t.Number()),
      }),
      detail: {
        tags: ['D&D'],
        summary: 'Изменить статус заявки',
        description:
          'grouped + gameId: заявка объединена в игру, пользователь получает приглашение записаться.',
      },
    },
  )
  .get(
    '/users',
    async ({ query }) => {
      try {
        return await searchUsersByUsername(query.username, query.limit);
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      query: t.Object({
        username: t.String({
          minLength: 1,
          description:
            'Поиск по username (частичное совпадение, @ необязателен)',
        }),
        limit: t.Optional(
          t.Number({
            minimum: 1,
            maximum: 50,
            description: 'Максимум результатов (по умолчанию 20)',
          }),
        ),
      }),
      detail: {
        summary: 'Поиск пользователей по username',
        description:
          'Возвращает список пользователей с количеством их бронирований.',
      },
    },
  )
  .get(
    '/users/:id',
    async ({ params }) => {
      try {
        const user = await getAdminUserProfile(params.id);
        if (!user) {
          return status(404, { error: 'User not found' });
        }

        return user;
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID пользователя' }),
      }),
      detail: {
        summary: 'Профиль пользователя',
        description:
          'Информация о пользователе и общее количество его бронирований.',
      },
    },
  )
  .post(
    '/upload',
    async ({ body }) => {
      try {
        if (!isAllowedUploadDestination(body.dest)) {
          return status(400, { error: 'Invalid dest folder' });
        }

        return await uploadImage(body.dest, body.file);
      } catch (error) {
        return status(400, { error: (error as Error).message });
      }
    },
    {
      body: t.Object({
        dest: t.String({
          minLength: 1,
          description: 'Папка назначения (например events)',
        }),
        file: t.File({ description: 'Изображение (jpeg, png, webp, gif)' }),
      }),
      type: 'multipart/form-data',
      detail: {
        summary: 'Загрузить изображение в S3/MinIO',
        description:
          'FormData: dest — папка (events | news | dnd-games), file — файл. Возвращает публичный url и key.',
      },
    },
  )
  .get('/partners', async () => getPartnerShowcase(true), { detail: { tags: ['Partners'], summary: 'Partner settings and all cards, including hidden' } })
  .put('/partners/settings', async ({ body }) => updatePartnerSettings(body), {
    body: t.Object({ partner1Title: t.String(), partner2Title: t.String(), footerText: t.String() }),
    detail: { tags: ['Partners'], summary: 'Update lane titles and editable footer' },
  })
  .post('/partners/cards', async ({ body }) => {
    try {
      return await createPartnerCard(body);
    } catch (error) {
      if (error instanceof PartnerError) return mapPartnerError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    body: t.Object({
      lane: t.Union([t.Literal(1), t.Literal(2)]),
      title: t.String(),
      text: t.Optional(t.String()),
      url: t.String(),
      imageUrl: t.Optional(t.String()),
      sortOrder: t.Optional(t.Number({ minimum: 0 })),
      isActive: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Partners'], summary: 'Create an unlimited partner card' },
  })
  .patch('/partners/cards/:id', async ({ params, body }) => {
    try {
      return await updatePartnerCard(params.id, body);
    } catch (error) {
      if (error instanceof PartnerError) return mapPartnerError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.Number() }),
    body: t.Partial(t.Object({
      lane: t.Union([t.Literal(1), t.Literal(2)]),
      title: t.String(),
      text: t.String(),
      url: t.String(),
      imageUrl: t.String(),
      sortOrder: t.Number({ minimum: 0 }),
      isActive: t.Boolean(),
    })),
    detail: { tags: ['Partners'], summary: 'Edit, move, reorder, hide or show a partner card' },
  })
  .delete('/partners/cards/:id', async ({ params }) => {
    try {
      return await deletePartnerCard(params.id);
    } catch (error) {
      if (error instanceof PartnerError) return mapPartnerError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ id: t.Number() }),
    detail: { tags: ['Partners'], summary: 'Delete a partner card' },
  })
  .post('/partners/metadata', async ({ body }) => {
    try {
      return await fetchPartnerMetadata(body.url);
    } catch (error) {
      if (error instanceof PartnerError) return mapPartnerError(error);
      return status(500, { error: (error as Error).message });
    }
  }, {
    body: t.Object({ url: t.String() }),
    detail: { tags: ['Partners'], summary: 'Safely fetch Open Graph title, description and image for manual review' },
  })
  .get(
    '/news',
    async () => {
      try {
        return await listAllNews();
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['News'],
        summary: 'Все новости',
        description:
          'Список всех новостей, включая ещё не опубликованные (publishedAt в будущем). От новых к старым.',
      },
    },
  )
  .get(
    '/news/:id',
    async ({ params }) => {
      try {
        const news = await getNewsById(params.id);
        if (!news) {
          return status(404, { error: 'News not found' });
        }

        return news;
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID новости' }),
      }),
      detail: {
        tags: ['News'],
        summary: 'Новость по ID',
      },
    },
  )
  .post(
    '/news',
    async ({ body }) => {
      try {
        return await createNews({
          coverUrl: body.coverUrl,
          coverCrop: body.coverCrop,
          title: body.title,
          text: body.text,
          publishedAt:
            body.publishedAt !== undefined
              ? parseIsoDateTime(body.publishedAt)
              : undefined,
        });
      } catch (error) {
        if (error instanceof NewsError) return mapNewsError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: apiModels.CreateNewsBody,
      detail: {
        tags: ['News'],
        summary: 'Создать новость',
        description:
          'publishedAt в будущем — отложенная публикация (пользователи её не видят). По умолчанию публикуется сразу.',
      },
    },
  )
  .patch(
    '/news/:id',
    async ({ params, body }) => {
      try {
        return await updateNews(params.id, {
          coverUrl: body.coverUrl,
          coverCrop: body.coverCrop,
          title: body.title,
          text: body.text,
          publishedAt:
            body.publishedAt !== undefined
              ? parseIsoDateTime(body.publishedAt)
              : undefined,
        });
      } catch (error) {
        if (error instanceof NewsError) return mapNewsError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID новости' }),
      }),
      body: apiModels.UpdateNewsBody,
      detail: {
        tags: ['News'],
        summary: 'Редактировать новость',
      },
    },
  )
  .delete(
    '/news/:id',
    async ({ params }) => {
      try {
        return await deleteNews(params.id);
      } catch (error) {
        if (error instanceof NewsError) return mapNewsError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID новости' }),
      }),
      detail: {
        tags: ['News'],
        summary: 'Удалить новость',
      },
    },
  )
  .get(
    '/events',
    async () => {
      try {
        return await listEvents();
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['Events'],
        summary: 'Список всех ивентов',
      },
    },
  )
  .get(
    '/events/empty-tables',
    async ({ query }) => {
      try {
        return await listEmptyTables(
          parseIsoDateTime(query.startsAt),
          query.endsAt !== undefined
            ? parseIsoDateTime(query.endsAt)
            : undefined,
          {
            excludeEventId: query.excludeEventId,
          },
        );
      } catch (error) {
        if (error instanceof EventError) return mapEventError(error);
        if (error instanceof BookingError) return mapBookingError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      query: t.Object({
        startsAt: t.String({
          description: 'Начало интервала ивента (ISO 8601)',
        }),
        endsAt: t.Optional(
          t.String({
            description:
              'Окончание интервала (ISO 8601). По умолчанию startsAt + 6 часов',
          }),
        ),
        excludeEventId: t.Optional(
          t.Number({
            description:
              'ID ивента, чьи столы не считать занятыми (при редактировании)',
          }),
        ),
      }),
      detail: {
        tags: ['Events'],
        summary: 'Свободные столы для ивента',
        description:
          'Возвращает активные столы без пересекающихся бронирований и без резерва другими ивентами на указанный интервал.',
      },
    },
  )
  .get(
    '/events/:id',
    async ({ params }) => {
      try {
        const event = await getEventById(params.id);
        if (!event) {
          return status(404, { error: 'Event not found' });
        }

        return event;
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID ивента' }),
      }),
      detail: {
        tags: ['Events'],
        summary: 'Ивент по ID',
      },
    },
  )
  .post(
    '/events',
    async ({ body }) => {
      try {
        return await createEvent({
          title: body.title,
          description: body.description,
          startsAt: parseIsoDateTime(body.startsAt),
          endsAt:
            body.endsAt !== undefined
              ? parseIsoDateTime(body.endsAt)
              : undefined,
          seatsPerTable: body.seatsPerTable,
          bannerUrl: body.bannerUrl,
          bannerCrop: body.bannerCrop,
          tableIds: body.tableIds,
        });
      } catch (error) {
        if (error instanceof EventError) return mapEventError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: apiModels.CreateEventBody,
      detail: {
        tags: ['Events'],
        summary: 'Создать ивент',
        description:
          'endsAt по умолчанию = startsAt + 6 часов. capacity = seatsPerTable × число столов. Столы проверяются на занятость бронированиями и другими ивентами.',
      },
    },
  )
  .patch(
    '/events/:id',
    async ({ params, body }) => {
      try {
        return await updateEvent(params.id, {
          title: body.title,
          description: body.description,
          startsAt:
            body.startsAt !== undefined
              ? parseIsoDateTime(body.startsAt)
              : undefined,
          endsAt:
            body.endsAt !== undefined
              ? parseIsoDateTime(body.endsAt)
              : undefined,
          seatsPerTable: body.seatsPerTable,
          bannerUrl: body.bannerUrl,
          bannerCrop: body.bannerCrop,
          tableIds: body.tableIds,
        });
      } catch (error) {
        if (error instanceof EventError) return mapEventError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID ивента' }),
      }),
      body: apiModels.UpdateEventBody,
      detail: {
        tags: ['Events'],
        summary: 'Редактировать ивент',
        description:
          'Можно изменить название, описание, даты, seatsPerTable, bannerUrl и tableIds. Столы проверяются на занятость.',
      },
    },
  )
  .delete(
    '/events/:id',
    async ({ params }) => {
      try {
        return await deleteEvent(params.id);
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID ивента' }),
      }),
    },
  )
  .get('/point-promos', async ({ query }) => adminFindPointPromos({ code: query.code, status: query.status }), {
    query: t.Object({
      code: t.Optional(t.String()),
      status: t.Optional(t.Union([t.Literal('active'), t.Literal('used'), t.Literal('expired')])),
    }),
    detail: { tags: ['Mini-games'], summary: 'Одноразовые промокоды за каждые 25 000 накопленных очков' },
  })
  .get(
    '/minigames/rewards',
    async ({ query }) => adminFindRewards({ code: query.code, status: query.status }),
    {
      query: t.Object({
        code: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal('active'), t.Literal('used'), t.Literal('expired')]),
        ),
      }),
      detail: {
        tags: ['Mini-games'],
        summary: 'Награды мини-игр: поиск по коду и статусу',
      },
    },
  )
  .post(
    '/minigames/rewards/:id/redeem',
    async ({ params, user }) => handleMinigame(() => redeemReward(params.id, user.id)),
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['Mini-games'],
        summary: 'Отметить награду использованной',
        description: 'Награду можно использовать один раз и только до окончания срока.',
      },
    },
  )
  .get('/minigames/stats', async () => adminMinigameStats(), {
    detail: { tags: ['Mini-games'], summary: 'Статистика мини-игр за неделю' },
  })
  .get('/minigames/settings', async () => getMinigameSettings(), {
    detail: { tags: ['Mini-games'], summary: 'Настройки мини-игр и таблицы наград' },
  })
  .put(
    '/minigames/settings',
    async ({ body, user }) => handleMinigame(() => saveMinigameSettings(body, user.id)),
    {
      body: t.Unknown(),
      detail: {
        tags: ['Mini-games'],
        summary: 'Сохранить настройки мини-игр',
        description:
          'Пороговые значения и награды по уровням. Значения проверяются сервером (скидка не больше 50%, пороги не повторяются).',
      },
    },
  )
  .get('/minigames/points', async ({ query }) => adminFindPlayers(query.q ?? ''), {
    query: t.Object({ q: t.Optional(t.String()) }),
    detail: {
      tags: ['Mini-games'],
      summary: 'Очки игроков: поиск по username или Telegram ID',
    },
  })
  .get('/minigames/points/:userId', async ({ params }) => getPointsHistory(params.userId, 50), {
    params: t.Object({ userId: t.String({ format: 'uuid' }) }),
    detail: { tags: ['Mini-games'], summary: 'Счёт и история очков игрока' },
  })
  .post(
    '/minigames/points/:userId/adjust',
    async ({ params, body, user }) =>
      handleMinigame(() => adminAdjustPoints(user.id, params.userId, body.delta, body.note)),
    {
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
      body: t.Object({ delta: t.Number(), note: t.Optional(t.String()) }),
      detail: {
        tags: ['Mini-games'],
        summary: 'Списать (отрицательное число) или начислить очки',
        description: 'Счёт не может уйти в минус. Игрок получает сообщение от бота.',
      },
    },
  )
  // ---- Уведомления (14.11.2026): каталог, тексты, настройки, журнал, рассылки. Менять — только владелец.
  .get('/notifications/catalog', async ({ user }) => notificationCatalog(user), {
    detail: { tags: ['Admin'], summary: 'Уведомления: каталог, тексты, настройки' },
  })
  .put(
    '/notifications/templates/:kind',
    async ({ user, params, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Уведомления меняет только владелец' });
      if (!KIND_BY_ID.has(params.kind)) return status(404, { error: 'Нет такого уведомления' });
      return saveTemplate(params.kind, body);
    },
    {
      body: t.Object({ enabled: t.Optional(t.Boolean()), text: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))) }),
      detail: { tags: ['Admin'], summary: 'Уведомления: включить / выключить, свой текст (null — стандартный)' },
    },
  )
  .post(
    '/notifications/templates/:kind/preview',
    async ({ params, body }) => {
      // картинка уведомления с примерами переменных — чтобы видеть результат до отправки (14.11.2026)
      const kind = KIND_BY_ID.get(params.kind);
      if (!kind) return status(404, { error: 'Нет такого уведомления' });
      const text = renderTemplate(body.text?.trim() ? body.text : kind.defaultText, kind.vars) || '—';
      const card = await notificationImage(kind.id, text, (await getNotificationConfig()).animated);
      if (!card) return status(500, { error: 'Не удалось нарисовать картинку' });
      const type = card.format === 'mp4' ? 'video/mp4' : card.format === 'gif' ? 'image/gif' : 'image/png';
      return { image: `data:${type};base64,${Buffer.from(card.data).toString('base64')}`, caption: card.caption, animated: card.animated, format: card.format };
    },
    {
      body: t.Object({ text: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))) }),
      detail: { tags: ['Admin'], summary: 'Уведомления: картинка с примерами переменных' },
    },
  )
  .post(
    '/notifications/templates/:kind/test',
    async ({ user, params, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      const kind = KIND_BY_ID.get(params.kind);
      if (!kind) return status(404, { error: 'Нет такого уведомления' });
      const text = renderTemplate(body.text?.trim() ? body.text : kind.defaultText, kind.vars);
      const result = await sendTelegramMessageDetailed(user.telegramId, text || '—', `test:${kind.id}`);
      return result.ok ? { ok: true } : { ok: false, error: result.description ?? result.reason };
    },
    {
      body: t.Object({ text: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))) }),
      detail: { tags: ['Admin'], summary: 'Уведомления: тест типа себе (с примерами переменных)' },
    },
  )
  .put(
    '/notifications/config',
    async ({ user, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      const config = { ...body, images: body.images ?? true, animated: body.animated ?? true };
      await saveNotificationConfig(config);
      return config;
    },
    {
      body: t.Object({
        quietFrom: t.Integer({ minimum: 0, maximum: 23 }),
        quietTo: t.Integer({ minimum: 0, maximum: 23 }),
        dailyLimit: t.Integer({ minimum: 0, maximum: 20 }),
        images: t.Optional(t.Boolean()),
        animated: t.Optional(t.Boolean()),
      }),
      detail: { tags: ['Admin'], summary: 'Уведомления: тихие часы и дневной лимит объявлений' },
    },
  )
  .get('/notifications/log', ({ query }) => notificationLog({ kind: query.kind, limit: query.limit }), {
    query: t.Object({ kind: t.Optional(t.String()), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 300 })) }),
    detail: { tags: ['Admin'], summary: 'Уведомления: журнал отправок' },
  })
  .get('/broadcasts', () => listBroadcasts(), { detail: { tags: ['Admin'], summary: 'Рассылки' } })
  .post(
    '/broadcasts',
    async ({ user, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Рассылки делает только владелец' });
      try {
        return await createBroadcast(body, user);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { body: BroadcastBody, detail: { tags: ['Admin'], summary: 'Создать рассылку (черновик)' } },
  )
  .put(
    '/broadcasts/:id',
    async ({ user, params, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      try {
        return await updateBroadcast(params.id, body);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { params: t.Object({ id: t.Numeric() }), body: BroadcastBody, detail: { tags: ['Admin'], summary: 'Изменить рассылку' } },
  )
  .delete(
    '/broadcasts/:id',
    async ({ user, params }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      try {
        return await deleteBroadcast(params.id);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Admin'], summary: 'Удалить рассылку' } },
  )
  .post(
    '/broadcasts/:id/start',
    async ({ user, params }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      try {
        return await startBroadcast(params.id, user);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Admin'], summary: 'Запустить: сейчас или по расписанию' } },
  )
  .post(
    '/broadcasts/:id/pause',
    async ({ user, params }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      try {
        return await pauseBroadcast(params.id);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Admin'], summary: 'Приостановить рассылку' } },
  )
  .post(
    '/broadcasts/test',
    async ({ user, body }) => {
      if (!isNotificationOwner(user)) return status(403, { error: 'Только владелец' });
      try {
        return await testBroadcast(body, user);
      } catch (error) {
        return broadcastError(error);
      }
    },
    { body: BroadcastBody, detail: { tags: ['Admin'], summary: 'Тест рассылки себе' } },
  )
  .post(
    '/broadcasts/audience',
    async ({ user, body }) => audienceCount(body.audience, user),
    { body: t.Object({ audience: BroadcastAudienceSchema }), detail: { tags: ['Admin'], summary: 'Сколько человек в аудитории' } },
  )
  .get('/notifications/diagnostics', () => notificationDiagnostics(), {
    detail: {
      tags: ['Admin'],
      summary: 'Диагностика уведомлений',
      description: 'Включены ли уведомления, отвечает ли Telegram (getMe), получатели-администраторы и последние отправки. Ничего не отправляет.',
    },
  })
  .post('/notifications/test', ({ user }) => testNotification(user), {
    detail: {
      tags: ['Admin'],
      summary: 'Проверить уведомления: тестовое сообщение от бота себе',
      description: 'Возвращает, доставлено ли сообщение, а если нет — причину (не нажат «Старт», неверный токен, уведомления выключены, нет связи).',
    },
  })
  .get('/admins', async ({ user }) => ({ ...(await listAdmins()), canManage: isBuiltinAdmin(user) }), {
    detail: { tags: ['Admin'], summary: 'Администраторы: основные и добавленные по Telegram ID' },
  })
  .post('/admins', ({ user, body }) => adminsGuard(() => addAdmin(user, body.telegramId, body.note)), {
    body: t.Object({ telegramId: t.Union([t.String({ maxLength: 20 }), t.Number()]), note: t.Optional(t.String({ maxLength: 200 })) }),
    detail: { tags: ['Admin'], summary: 'Добавить администратора по Telegram ID (только основные администраторы)' },
  })
  .delete('/admins/:telegramId', ({ user, params }) => adminsGuard(() => removeAdmin(user, params.telegramId)), {
    detail: { tags: ['Admin'], summary: 'Удалить добавленного администратора (только основные администраторы)' },
  });

async function adminsGuard<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof AdminsError)) throw error;
    const code = { FORBIDDEN: 403, BAD_ID: 400, BUILTIN: 400, EXISTS: 409, NOT_FOUND: 404 }[error.code] as 400 | 403 | 404 | 409;
    return status(code, { error: error.message });
  }
}

