import { Elysia, status, t } from 'elysia';
import { apiModels } from '../../lib/api-schemas';
import {
  BookingError,
  cancelReservation,
  createReservation,
  getServiceAvailability,
  getUserReservations,
  listOpenGamesCached,
  parseIsoDateTime,
  toReservationResponse,
  updateReservationDetails,
} from '../booking/service';
import { bookingConfig, bookingOptions, killTeams } from '../../config/booking';
import { aosFactionNames, warcryFactionNames } from '../roster/data';
import { mapDndError } from '../dnd/http';
import {
  bookDndGame,
  cancelDndBooking,
  cancelTrialRequest,
  createTrialRequest,
  DndError,
  getMyDnd,
  getPublicGame,
  listPublicGames,
} from '../dnd/service';
import {
  getEventById,
  getNearestUpcomingEvent,
  listEvents,
  registerForEvent,
  cancelEventRegistration,
  EventError,
} from '../events/service';
import {
  diceAction,
  finishScoreSession,
  listGamesForUser,
  listUserRewards,
  startSession,
} from '../minigames/service';
import { handleMinigame } from '../minigames/http';
import { testUserNotification } from '../notifications/service';
import { joinWaitlist, leaveWaitlist, myWaitlist, WaitlistError } from '../booking/waitlist';
import { getTournament } from '../tournaments/service';
import { confirmResult, disputeResult, getLeagueTable, LeagueError, listMyResults, myLeagueStats, reportResult, resultCardPng } from '../league/service';

function mapLeagueError(error: unknown) {
  if (error instanceof LeagueError) {
    const code = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'BAD_STATE' ? 409 : 400;
    return status(code, { error: error.message });
  }
  throw error;
}
import { getUserPrefs, saveUserPrefs } from '../notifications/hub';
import { getPlayerProgress } from '../progress/service';
import { getCardsState, getPointsHistory, openPack } from '../minigames/cards';
import { getNewsById, listPublishedNews } from '../news/service';
import { getPartnerShowcase } from '../partners/service';
import { reservationIcs } from '../booking/calendar';
import { currentServicePrice } from '../pricing/service';
import { servicePricingDefaults } from '../pricing/rules';
import { jwtPlugin } from '../../plugins/jwt-plugin';
import { authMiddleware, findUserFromBearer } from '../../plugins/auth-middleware';
import { db } from '../../db';
import { disciplinesTable, servicesTable } from '../../db/schema';
import { asc, eq } from 'drizzle-orm';

function mapBookingError(error: BookingError) {
  switch (error.code) {
    case 'SERVICE_NOT_FOUND':
      return status(404, { error: error.message });
    case 'SLOT_UNAVAILABLE':
      return status(409, { error: error.message });
    case 'SERVICE_NOT_BOOKABLE':
    case 'TABLE_REQUIRED':
    case 'TABLE_NOT_ALLOWED':
    case 'TABLE_NOT_FOUND':
    case 'INVALID_PARTY_SIZE':
    case 'INVALID_TIME':
    case 'INVALID_SEAT_OPTIONS':
    case 'INVALID_BUY_ARMY_OPTIONS':
    case 'DATE_NOT_ALLOWED':
    case 'INVALID_DETAILS':
    case 'RESERVATION_STARTED':
      return status(400, { error: error.message });
    case 'RESERVATION_NOT_FOUND':
      return status(404, { error: error.message });
    case 'RESERVATION_ALREADY_CANCELLED':
    case 'RESERVATION_ALREADY_CONFIRMED':
      return status(409, { error: error.message });
    case 'RESERVATION_NOT_PENDING':
    case 'INVALID_ENDS_AT':
      return status(400, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected booking error' });
    }
  }
}

function mapEventError(error: EventError) {
  switch (error.code) {
    case 'EVENT_NOT_FOUND':
      return status(404, { error: error.message });
    case 'EVENT_FULL':
    case 'ALREADY_REGISTERED':
    case 'TABLES_UNAVAILABLE':
      return status(409, { error: error.message });
    case 'NOT_REGISTERED':
      return status(404, { error: error.message });
    case 'INVALID_TIME_RANGE':
    case 'INVALID_TABLES':
    case 'INVALID_SEATS_PER_TABLE':
    case 'EVENT_REGISTRATION_CLOSED':
    case 'INVALID_PARTY_SIZE':
    case 'EVENT_CAPACITY_BELOW_REGISTRATIONS':
      return status(400, { error: error.message });
    default: {
      const _exhaustive: never = error.code;
      return status(500, { error: 'Unexpected event error' });
    }
  }
}

export const apiModule = new Elysia({ tags: ['Booking'] })
  .model(apiModels)
  .use(jwtPlugin)
  .get('/partners', async () => getPartnerShowcase(), {
    detail: { tags: ['Partners'], summary: 'Public partner showcase for Profile' },
  })
  .get(
    '/services/:serviceId/availability',
    async ({ params, query, headers, jwt }) => {
      try {
        const availability = await getServiceAvailability(
          params.serviceId,
          query.date,
        );
        if (!availability) {
          return status(404, { error: 'Service not found' });
        }

        // ники Telegram игроков — только вошедшим пользователям Mini App (31.10.2026); без входа — без ников
        const bearer = headers.authorization?.replace(/^Bearer\s+/i, '');
        if (!(await findUserFromBearer(bearer, jwt))) {
          for (const session of availability.sessions) {
            for (const player of session.players) player.username = null;
          }
        }

        return availability;
      } catch {
        return status(400, { error: 'Invalid date' });
      }
    },
    {
      params: t.Object({
        serviceId: t.Number({ description: 'ID услуги' }),
      }),
      query: t.Object({
        date: t.String({
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Дата в формате YYYY-MM-DD',
        }),
      }),
      detail: {
        tags: ['Booking'],
        summary: 'Доступность услуги по столам',
        description:
          'Возвращает занятость за клубную смену (12:00 → 10:00 следующего дня). Запись на слот доступна до 00:00. Публичный эндпоинт.',
      },
    },
  )
  .get(
    '/booking-options',
    () => ({
      ...bookingOptions,
      aosFactions: aosFactionNames(),
      warcryFactions: warcryFactionNames(),
      killTeams,
      allowedWeekdays: bookingConfig.allowedWeekdays,
      timeZone: bookingConfig.timeZone,
      timezoneOffsetMinutes: bookingConfig.timezoneOffsetMinutes,
    }),
    {
      detail: {
        tags: ['Booking'],
        summary: 'Справочники для форм записи',
        description:
          'Уровни опыта, игры (40K, AoS, Kill Team), фракции 40K и AoS (из данных Roster Builder), команды Kill Team, варианты красок, время для D&D, разрешённые дни недели (ISO) и часовой пояс клуба. Публичный эндпоинт.',
      },
    },
  )
  .get(
    '/dnd/games',
    async () => {
      try {
        return await listPublicGames();
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['D&D'],
        summary: 'Предстоящие игры D&D',
        description:
          'Игры со статусом open или closed, которые ещё не начались. occupied/available считаются по активным записям.',
      },
    },
  )
  .get(
    '/dnd/games/:id',
    async ({ params }) => {
      try {
        const game = await getPublicGame(params.id);
        if (!game) return status(404, { error: 'Game not found' });
        return game;
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.Number({ description: 'ID игры' }) }),
      detail: { tags: ['D&D'], summary: 'Игра D&D по ID' },
    },
  )
  .get(
    '/disciplines',
    async () => {
      try {
        return await db.query.disciplinesTable.findMany({
          orderBy: asc(disciplinesTable.sortOrder),
        });
      } catch (error) {
        console.log(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['Booking'],
        summary: 'Список дисциплин',
        description:
          'Возвращает список всех дисциплин. scheduleWeekdays — дни недели по ISO (1 = понедельник, 7 = воскресенье), когда дисциплина доступна.',
      },
    },
  )
  .get(
    '/services',
    async ({ query: { disciplineId } }) => {
      try {
        return await db.query.servicesTable.findMany({
          where: disciplineId === undefined ? undefined : eq(servicesTable.disciplineId, disciplineId),
          orderBy: asc(servicesTable.sortOrder),
        });
      } catch (error) {
        console.log(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      query: t.Object({
        disciplineId: t.Optional(t.Number({ description: 'ID дисциплины; без него — все услуги' })),
      }),
    },
  )
  .get('/services/:serviceId/pricing', async ({ params: { serviceId } }) => {
    try {
      const [service] = await db.select({ id: servicesTable.id, slug: servicesTable.slug }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
      if (!service) return status(404, { error: 'Service not found' });
      const [price, defaults] = await Promise.all([currentServicePrice(serviceId), Promise.resolve(servicePricingDefaults(service.slug))]);
      return {
        serviceId,
        billingMode: price?.billingMode ?? defaults.billingMode,
        unitPrice: price?.unitPrice ?? defaults.unitPrice,
        armyRentalPricePer1000: price?.armyRentalPricePer1000 ?? defaults.armyRentalPricePer1000,
        ownMaterialsPrice: price?.ownMaterialsPrice ?? defaults.ownMaterialsPrice,
        clubMaterialsPrice: price?.clubMaterialsPrice ?? defaults.clubMaterialsPrice,
        thirdGameDiscountPercent: price?.thirdGameDiscountPercent ?? defaults.thirdGameDiscountPercent,
      };
    } catch (error) {
      return status(500, { error: (error as Error).message });
    }
  }, {
    params: t.Object({ serviceId: t.Number({ description: 'ID услуги' }) }),
    detail: { tags: ['Booking'], summary: 'Публичный тариф услуги и аренды армии за 1000 очков' },
  })
  .get(
    '/services/:serviceId',
    async ({ params: { serviceId } }) => {
      try {
        return await db.query.servicesTable.findFirst({
          where: eq(servicesTable.id, serviceId),
        });
      } catch (error) {
        console.log(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        serviceId: t.Number({ description: 'ID услуги' }),
      }),
    },
  )
  .get(
    '/news',
    async () => {
      try {
        return await listPublishedNews();
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['News'],
        summary: 'Опубликованные новости',
        description:
          'Только новости с publishedAt <= сейчас, от новых к старым. Публичный эндпоинт.',
      },
    },
  )
  .get(
    '/news/:id',
    async ({ params }) => {
      try {
        const news = await getNewsById(params.id, { publishedOnly: true });
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
        summary: 'Опубликованная новость по ID',
        description:
          'Возвращает новость только если она уже опубликована (publishedAt <= сейчас).',
      },
    },
  )
  .get(
    '/events',
    async () => {
      try {
        return await listEvents({ upcomingOnly: true });
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['Events'],
        summary: 'Предстоящие ивенты',
        description: 'Публичный список ивентов, которые ещё не завершились.',
      },
    },
  )
  .get(
    '/events/nearest',
    async () => {
      try {
        const event = await getNearestUpcomingEvent();
        if (!event) {
          return status(404, { error: 'No upcoming events' });
        }

        return event;
      } catch (error) {
        return status(500, { error: (error as Error).message });
      }
    },
    {
      detail: {
        tags: ['Events'],
        summary: 'Ближайший предстоящий ивент',
        description:
          'Ивент с минимальным startsAt в будущем. Включает registeredCount и freeSeats.',
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
  // «Добавить в календарь» (15.11.2026): файл .ics по id записи — без входа, Telegram открывает файл без авторизации
  .get(
    '/reservations/:id/calendar.ics',
    async ({ params, set }) => {
      const ics = await reservationIcs(params.id);
      if (!ics) return status(404, { error: 'Reservation not found' });
      set.headers['content-type'] = 'text/calendar; charset=utf-8';
      set.headers['content-disposition'] = 'attachment; filename="warphub.ics"';
      return ics;
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: { summary: 'Файл календаря для записи (.ics)' },
    },
  )
  // картинка результата лиги (этап 3b, 15.11.2026): для истории Telegram и «скачать» — без входа, по id партии
  .get(
    '/results/:id/card.png',
    async ({ params, query }) => {
      try {
        const png = await resultCardPng(params.id, query.side);
        return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' } });
      } catch (error) {
        if (error instanceof LeagueError) return status(404, { error: error.message });
        throw error;
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Object({ side: t.Optional(t.String()) }),
      detail: { summary: 'Картинка результата партии лиги (PNG)' },
    },
  )
  .use(authMiddleware)
  .guard({
    detail: {
      security: [{ bearerAuth: [] }],
    },
  })
  .get('/me', ({ user }) => user, {
    detail: {
      tags: ['Users'],
      summary: 'Текущий пользователь',
      description: 'Возвращает профиль авторизованного пользователя.',
    },
  })
  .post('/me/notifications/test', ({ user }) => testUserNotification(user), {
    detail: {
      tags: ['Users'],
      summary: 'Проверка уведомлений',
      description: 'Бот отправляет пользователю тестовое сообщение; ответ говорит, дошло ли оно.',
    },
  })
  .get('/me/notifications/prefs', ({ user }) => getUserPrefs(user.id), {
    detail: { tags: ['Users'], summary: 'Мои настройки уведомлений' },
  })
  .put('/me/notifications/prefs', ({ user, body }) => saveUserPrefs(user.id, body), {
    body: t.Partial(
      t.Object({
        opponentGames: t.Array(t.String(), { maxItems: 4 }),
        news: t.Boolean(),
        events: t.Boolean(),
        promos: t.Boolean(),
        eveReminder: t.Boolean(),
      }),
    ),
    detail: { tags: ['Users'], summary: 'Сохранить настройки уведомлений', description: 'Поиск соперника — игры 40k, aos, kt, warcry.' },
  })
  .get('/me/progress', async ({ user }) => getPlayerProgress(user.id), {
    detail: {
      tags: ['Users'],
      summary: 'Прогресс игрока',
      description: 'Сыгранные игры и ранг по категориям (Warhammer, D&D, покраска, посещение): только подтверждённые и прошедшие записи.',
    },
  })
  .get('/open-games', async () => listOpenGamesCached(), {
    detail: { summary: 'Игры, где ждут соперника, на 7 дней (доска «Ищут соперника»)' },
  })
  // турнир ивента (этап 4, 15.11.2026): пары и таблица; null — у ивента нет турнира
  .get('/events/:id/tournament', async ({ user, params }) => (await getTournament(params.id, user.id)) ?? null, {
    params: t.Object({ id: t.Numeric() }),
    detail: { tags: ['Events'], summary: 'Турнир ивента: участники, пары по раундам, таблица' },
  })
  // клубная лига (этап 3, 15.11.2026): результаты партий и таблица Эло
  .get('/league', async ({ user, query }) => getLeagueTable(user.id, query.game, query.season), {
    query: t.Object({ game: t.Optional(t.String()), season: t.Optional(t.String()) }),
    detail: { tags: ['League'], summary: 'Таблица лиги (Эло) по игре и сезону' },
  })
  .get('/league/my-stats', async ({ user }) => myLeagueStats(user.id), { detail: { tags: ['League'], summary: 'Статистика игрока по играм' } })
  .get('/results/my', async ({ user }) => listMyResults(user.id), { detail: { tags: ['League'], summary: 'Мои партии и их результаты' } })
  .post('/results/:id/report', async ({ user, params, body }) => reportResult(user.id, params.id, body.result).catch(mapLeagueError), {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({ result: t.String() }),
    detail: { tags: ['League'], summary: 'Внести результат партии (win / loss / draw)' },
  })
  .post('/results/:id/confirm', async ({ user, params }) => confirmResult(user.id, params.id).catch(mapLeagueError), {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    detail: { tags: ['League'], summary: 'Подтвердить результат, внесённый соперником' },
  })
  .post('/results/:id/dispute', async ({ user, params, body }) => disputeResult(user.id, params.id, body?.note).catch(mapLeagueError), {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Optional(t.Object({ note: t.Optional(t.String()) })),
    detail: { tags: ['League'], summary: 'Оспорить результат — решит администратор' },
  })
  // лист ожидания (этап 2, 15.11.2026): «напишите, если на этот день освободится место»
  .get('/waitlist/my', async ({ user }) => myWaitlist(user.id), { detail: { tags: ['Booking'], summary: 'Мои подписки на освободившееся место' } })
  .post(
    '/waitlist',
    async ({ user, body }) => {
      try {
        return await joinWaitlist(user.id, body.serviceId, body.date);
      } catch (error) {
        if (error instanceof WaitlistError) return status(400, { error: error.message });
        throw error;
      }
    },
    { body: t.Object({ serviceId: t.Integer(), date: t.String() }), detail: { tags: ['Booking'], summary: 'Встать в лист ожидания на день' } },
  )
  .delete('/waitlist', async ({ user, query }) => leaveWaitlist(user.id, query.serviceId, query.date), {
    query: t.Object({ serviceId: t.Numeric(), date: t.String() }),
    detail: { tags: ['Booking'], summary: 'Выйти из листа ожидания' },
  })
  .get('/reservations/my', async ({ user }) => getUserReservations(user.id), {
    detail: {
      tags: ['Booking'],
      summary: 'Мои бронирования',
      description:
        'Бронирования пользователя и ближайший предстоящий ивент, если пользователь на него записан.',
    },
  })
  .get('/dnd/my', async ({ user }) => getMyDnd(user.id), {
    detail: {
      tags: ['D&D'],
      summary: 'Мои записи и заявки D&D',
    },
  })
  .post(
    '/dnd/games/:id/bookings',
    async ({ user, params, body }) => {
      try {
        return await bookDndGame(user.id, params.id, body);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.Number({ description: 'ID игры' }) }),
      body: t.Object({
        quantity: t.Number({
          minimum: 1,
          description: 'Сколько мест бронируем (для себя и друзей)',
        }),
        timeIsConvenient: t.Boolean({ description: 'Время игры удобно' }),
        experienceLevel: t.String({ description: 'Уровень опыта' }),
      }),
      detail: {
        tags: ['D&D'],
        summary: 'Записаться на игру D&D',
        description:
          'Проверяет свободные места на сервере. Нельзя записаться дважды на одну игру.',
      },
    },
  )
  .delete(
    '/dnd/bookings/:id',
    async ({ user, params }) => {
      try {
        return await cancelDndBooking(user.id, params.id);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: { tags: ['D&D'], summary: 'Отменить запись на игру D&D' },
    },
  )
  .post(
    '/dnd/trial-requests',
    async ({ user, body }) => {
      try {
        return await createTrialRequest(user.id, body);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: t.Object({
        playersCount: t.Number({ minimum: 1, description: 'Сколько человек' }),
        preferredTimes: t.Optional(
          t.Array(t.String(), {
            description: 'morning | afternoon | evening',
          }),
        ),
        experienceLevel: t.Optional(t.Nullable(t.String())),
        isPrivate: t.Optional(
          t.Boolean({ description: 'Отдельная игра для своей компании' }),
        ),
        notes: t.Optional(t.Nullable(t.String())),
      }),
      detail: {
        tags: ['D&D'],
        summary: 'Заявка «Хочу попробовать»',
        description:
          'Заявка без даты. Администраторы объединяют заявки в игру и приглашают участников.',
      },
    },
  )
  .delete(
    '/dnd/trial-requests/:id',
    async ({ user, params }) => {
      try {
        return await cancelTrialRequest(user.id, params.id);
      } catch (error) {
        if (error instanceof DndError) return mapDndError(error);
        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: { tags: ['D&D'], summary: 'Отменить заявку «Хочу попробовать»' },
    },
  )
  .post(
    '/events/:id/register',
    async ({ user, params, body }) => {
      try {
        return await registerForEvent(user.id, params.id, body.partySize ?? 1);
      } catch (error) {
        if (error instanceof EventError) return mapEventError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID ивента' }),
      }),
      body: apiModels.RegisterEventBody,
      detail: {
        tags: ['Events'],
        summary: 'Записаться на ивент',
        description:
          'Регистрация авторизованного пользователя. partySize — количество человек (по умолчанию 1).',
      },
    },
  )
  .delete(
    '/events/:id/register',
    async ({ user, params }) => {
      try {
        return await cancelEventRegistration(user.id, params.id);
      } catch (error) {
        if (error instanceof EventError) return mapEventError(error);

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.Number({ description: 'ID ивента' }),
      }),
      detail: {
        tags: ['Events'],
        summary: 'Отменить запись на ивент',
        description:
          'Снимает регистрацию текущего пользователя на ивент. Доступно до начала ивента.',
      },
    },
  )
  .post(
    '/reservations',
    async ({ user, body }) => {
      try {
        const reservation = await createReservation({
          userId: user.id,
          serviceId: body.serviceId,
          startsAt:
            body.startsAt !== undefined
              ? parseIsoDateTime(body.startsAt)
              : undefined,
          tableId: body.tableId,
          partySize: body.partySize,
          seatClubArmyOptions: body.seatClubArmyOptions,
          buyArmyOptions: body.buyArmyOptions,
          details: body.details,
        });

        return {
          ...toReservationResponse(reservation),
          joinedSession: reservation.joinedSession,
        };
      } catch (error) {
        if (error instanceof BookingError) {
          return mapBookingError(error);
        }

        return status(500, { error: (error as Error).message });
      }
    },
    {
      body: apiModels.CreateReservationBody,
      detail: {
        tags: ['Booking'],
        summary: 'Создать бронирование',
        description:
          'Создаёт запись. WH-игра и тренировки: tableId, startsAt и details { army, points, experienceLevel }; чтобы присоединиться к игре 1/2, передайте tableId и startsAt этой игры. Покраска: details { faction, model, paintSource, needsHelp, comment? }, без tableId. Разрешены только пт–вс; прошедшее время отклоняется.',
      },
    },
  )
  .delete(
    '/reservations/:id/cancel',
    async ({ user, params }) => {
      try {
        const reservation = await cancelReservation(user.id, params.id);

        return {
          ...toReservationResponse(reservation),
          status: 'cancelled' as const,
          cancelledAt: reservation.cancelledAt!.toISOString(),
        };
      } catch (error) {
        if (error instanceof BookingError) {
          return mapBookingError(error);
        }

        return status(500, { error: (error as Error).message });
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid', description: 'ID бронирования' }),
      }),
      detail: {
        tags: ['Booking'],
        summary: 'Отменить бронирование',
        description:
          'Отменяет своё бронирование со статусом pending или confirmed. Повторная отмена вернёт 409.',
      },
    },
  )
  .patch(
    '/reservations/:id/details',
    async ({ user, params, body }) => {
      try {
        const reservation = await updateReservationDetails(
          user.id,
          params.id,
          body.details,
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
        details: t.Any({ description: 'Новые данные игрока или покраски' }),
      }),
      detail: {
        tags: ['Booking'],
        summary: 'Изменить армию/очки/опыт или данные покраски',
        description: 'Доступно владельцу записи до её начала.',
      },
    },
  )
  .get('/minigames', async ({ user }) => listGamesForUser(user.id), {
    detail: {
      tags: ['Mini-games'],
      summary: 'Список мини-игр, таблицы наград, лучший результат и награда этой недели',
    },
  })
  .get('/minigames/rewards/my', async ({ user }) => listUserRewards(user.id), {
    detail: { tags: ['Mini-games'], summary: 'Мои награды (коды для администратора)' },
  })
  .post(
    '/minigames/:game/sessions',
    async ({ user, params }) => handleMinigame(() => startSession(user.id, params.game)),
    {
      params: t.Object({ game: t.String() }),
      detail: {
        tags: ['Mini-games'],
        summary: 'Начать попытку',
        description:
          'Сервер запоминает время начала. Для «Костей войны» сервер сразу выбирает бойцов; все броски делает сервер.',
      },
    },
  )
  .post(
    '/minigames/sessions/:id/finish',
    async ({ user, params, body }) =>
      handleMinigame(() => finishScoreSession(user.id, params.id, body.score)),
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ score: t.Number() }),
      detail: {
        tags: ['Mini-games'],
        summary: 'Завершить попытку (бег, яйцо) и получить награду',
        description:
          'Результат проверяется по времени, прошедшему с начала попытки. Неправдоподобный результат не засчитывается.',
      },
    },
  )
  .post(
    '/minigames/sessions/:id/dice/:action',
    async ({ user, params }) =>
      handleMinigame(() => diceAction(user.id, params.id, params.action)),
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
        action: t.Union([
          t.Literal('initiative_even'),
          t.Literal('initiative_odd'),
          t.Literal('attack'),
          t.Literal('critical'),
          t.Literal('defend'),
          t.Literal('risk'),
          t.Literal('ult'),
          t.Literal('roll'),
          t.Literal('stop'),
        ]),
      }),
      detail: {
        tags: ['Mini-games'],
        summary: '«Кости войны»: бросок (roll) или забрать награду (stop)',
      },
    },
  )
  .get('/minigames/cards', async ({ user }) => getCardsState(user.id), {
    detail: {
      tags: ['Mini-games'],
      summary: '«Легенды Warp Hub»: каталог карт, моя коллекция, пакеты на сегодня, счёт очков',
    },
  })
  .post('/minigames/cards/open', async ({ user }) => handleMinigame(() => openPack(user.id)), {
    detail: {
      tags: ['Mini-games'],
      summary: 'Открыть пакет карт',
      description:
        'Содержимое пакета генерирует сервер; очки за карты сразу зачисляются на счёт, карты — в коллекцию.',
    },
  })
  .get('/minigames/points/my', async ({ user }) => getPointsHistory(user.id), {
    detail: { tags: ['Mini-games'], summary: 'Мой счёт очков и история' },
  });
