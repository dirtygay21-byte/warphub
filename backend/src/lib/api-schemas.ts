import { t } from 'elysia';

const eventSchema = t.Object({
  id: t.Number(),
  title: t.String(),
  description: t.Nullable(t.String()),
  startsAt: t.String({ format: 'date-time' }),
  endsAt: t.String({ format: 'date-time' }),
  seatsPerTable: t.Number({
    description: 'Количество мест за одним столом',
  }),
  capacity: t.Number({
    description: 'Общее количество мест: seatsPerTable × число столов',
  }),
  bannerUrl: t.Nullable(t.String()),
  tableIds: t.Array(t.Number()),
  createdAt: t.String({ format: 'date-time' }),
  updatedAt: t.String({ format: 'date-time' }),
});

const userReservationSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  userId: t.String({ format: 'uuid' }),
  serviceId: t.Number(),
  serviceSlug: t.String(),
  tableId: t.Nullable(t.Number()),
  tableName: t.Nullable(t.String()),
  partySize: t.Nullable(t.Number()),
  seatClubArmyOptions: t.Nullable(t.Array(t.Boolean())),
  buyArmyOptions: t.Nullable(t.Array(t.Boolean())),
  startsAt: t.Nullable(t.String({ format: 'date-time' })),
  endsAt: t.Nullable(t.String({ format: 'date-time' })),
  status: t.Union([
    t.Literal('pending'),
    t.Literal('confirmed'),
    t.Literal('cancelled'),
  ]),
  cancelledAt: t.Nullable(t.String({ format: 'date-time' })),
  createdAt: t.String({ format: 'date-time' }),
});

const userUpcomingEventSchema = t.Composite([
  eventSchema,
  t.Object({
    registeredCount: t.Number(),
    freeSeats: t.Number(),
    isRegistered: t.Boolean({
      description: 'Записан ли текущий пользователь на ивент',
    }),
    partySize: t.Nullable(t.Number(), {
      description: 'Размер группы пользователя, если он записан',
    }),
  }),
]);

export const apiModels = {
  Error: t.Object({
    error: t.String({ description: 'Описание ошибки' }),
  }),
  Health: t.Object({
    ok: t.Boolean(),
  }),
  User: t.Object({
    id: t.String({ format: 'uuid' }),
    telegramId: t.Number(),
    firstName: t.String(),
    lastName: t.Nullable(t.String()),
    username: t.Nullable(t.String()),
    photoUrl: t.Nullable(t.String()),
  }),
  AuthTelegramBody: t.Object({
    initData: t.String({
      minLength: 1,
      description: 'Строка initData из Telegram Web App',
    }),
  }),
  AuthTelegramResponse: t.Object({
    token: t.String({
      description: 'JWT для заголовка Authorization: Bearer …',
    }),
    user: t.Object({
      id: t.String({ format: 'uuid' }),
      telegramId: t.Number(),
      firstName: t.String(),
      lastName: t.Nullable(t.String()),
      username: t.Nullable(t.String()),
      photoUrl: t.Nullable(t.String()),
    }),
  }),
  TableAvailabilitySegment: t.Object({
    startsAt: t.String({ description: 'Начало интервала (ISO 8601, UTC+5)' }),
    endsAt: t.String({ description: 'Конец интервала (ISO 8601, UTC+5)' }),
    freeSeats: t.Number({
      description: 'Свободных мест в этом интервале',
    }),
  }),
  TableAvailabilityEntry: t.Object({
    table: t.Object({
      id: t.Number(),
      name: t.String(),
      seatCapacity: t.Number({ description: 'Вместимость стола или клуба' }),
    }),
    segments: t.Array(
      t.Object({
        startsAt: t.String(),
        endsAt: t.String(),
        freeSeats: t.Number(),
      }),
      {
        description:
          'Интервалы дня с одинаковой доступностью (соседние с одним freeSeats объединены)',
      },
    ),
  }),
  ServiceAvailability: t.Object({
    date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    service: t.Object({
      id: t.Number(),
      slug: t.String(),
      duration: t.Number({
        description: 'Длительность бронирования в минутах',
      }),
      visitorsCapacity: t.Nullable(t.Number()),
      tableCapacityProfile: t.Nullable(
        t.Union([t.Literal('small'), t.Literal('large')]),
      ),
      clubSpectatorCapacity: t.Optional(
        t.Number({ description: 'Макс. зрителей в клубе (25)' }),
      ),
    }),
    slots: t.Array(
      t.Object({
        table: t.Object({
          id: t.Number(),
          name: t.String(),
          seatCapacity: t.Number(),
        }),
        segments: t.Array(
          t.Object({
            startsAt: t.String(),
            endsAt: t.String(),
            freeSeats: t.Number(),
          }),
        ),
      }),
      { description: 'Доступность по столам за день' },
    ),
  }),
  CreateReservationBody: t.Object({
    serviceId: t.Number({ minimum: 1 }),
    startsAt: t.Optional(
      t.String({
        description: 'Начало слота (ISO 8601)',
      }),
    ),
    tableId: t.Optional(
      t.Number({
        minimum: 1,
        description: 'Обязателен для услуг со столом (WH-игра и тренировки)',
      }),
    ),
    partySize: t.Optional(
      t.Number({
        minimum: 1,
        description: 'Количество мест; по умолчанию — visitors_capacity услуги',
      }),
    ),
    seatClubArmyOptions: t.Optional(
      t.Array(t.Boolean(), {
        description:
          'Для WH-игр/тренировок: аренда армии клуба на каждое место. Длина = partySize',
      }),
    ),
    buyArmyOptions: t.Optional(
      t.Array(t.Boolean(), {
        description:
          'Для wh_painting: покупка покрашенной армии на каждое место. Длина = partySize',
      }),
    ),
    details: t.Optional(
      t.Any({
        description:
          'WH: { army, points, experienceLevel }. Покраска: { faction, model, paintSource, needsHelp, comment? }',
      }),
    ),
  }),
  Reservation: t.Object({
    id: t.String({ format: 'uuid' }),
    serviceId: t.Number(),
    tableId: t.Nullable(t.Number()),
    partySize: t.Nullable(t.Number()),
    seatClubArmyOptions: t.Nullable(t.Array(t.Boolean())),
    buyArmyOptions: t.Nullable(t.Array(t.Boolean())),
    startsAt: t.Nullable(t.String({ format: 'date-time' })),
    endsAt: t.Nullable(t.String({ format: 'date-time' })),
    status: t.Union([
      t.Literal('pending'),
      t.Literal('confirmed'),
      t.Literal('cancelled'),
    ]),
  }),
  UserReservation: userReservationSchema,
  UserMyReservationsResponse: t.Object({
    reservations: t.Array(userReservationSchema),
    event: t.Nullable(userUpcomingEventSchema, {
      description:
        'Ближайший предстоящий ивент, если пользователь подал на него заявку',
    }),
  }),
  CancelledReservation: t.Object({
    id: t.String({ format: 'uuid' }),
    serviceId: t.Number(),
    tableId: t.Nullable(t.Number()),
    partySize: t.Nullable(t.Number()),
    seatClubArmyOptions: t.Nullable(t.Array(t.Boolean())),
    buyArmyOptions: t.Nullable(t.Array(t.Boolean())),
    startsAt: t.Nullable(t.String({ format: 'date-time' })),
    endsAt: t.Nullable(t.String({ format: 'date-time' })),
    status: t.Literal('cancelled'),
    cancelledAt: t.String({ format: 'date-time' }),
  }),
  AdminUser: t.Object({
    id: t.String({ format: 'uuid' }),
    telegramId: t.Number(),
    firstName: t.String(),
    lastName: t.Nullable(t.String()),
    username: t.Nullable(t.String()),
    photoUrl: t.Nullable(t.String()),
    reservationsCount: t.Number(),
  }),
  AdminUsersList: t.Array(
    t.Object({
      id: t.String({ format: 'uuid' }),
      telegramId: t.Number(),
      firstName: t.String(),
      lastName: t.Nullable(t.String()),
      username: t.Nullable(t.String()),
      photoUrl: t.Nullable(t.String()),
      reservationsCount: t.Number(),
    }),
  ),
  Event: eventSchema,
  EventsList: t.Array(eventSchema),
  PublicEvent: t.Composite([
    eventSchema,
    t.Object({
      registeredCount: t.Number(),
      freeSeats: t.Number(),
    }),
  ]),
  UserEventRegistration: t.Object({
    eventId: t.Number(),
    userId: t.String({ format: 'uuid' }),
    partySize: t.Number(),
    createdAt: t.String({ format: 'date-time' }),
  }),
  RegisterEventBody: t.Object({
    partySize: t.Optional(
      t.Number({
        minimum: 1,
        description: 'Количество человек (по умолчанию 1)',
      }),
    ),
  }),
  CreateEventBody: t.Object({
    title: t.String({ minLength: 1 }),
    description: t.Optional(t.String()),
    startsAt: t.String({ description: 'Начало ивента (ISO 8601)' }),
    endsAt: t.Optional(
      t.String({
        description:
          'Окончание ивента (ISO 8601). По умолчанию startsAt + 6 часов',
      }),
    ),
    seatsPerTable: t.Number({
      minimum: 1,
      description: 'Количество мест за одним столом',
    }),
    bannerUrl: t.Optional(t.String()),
    tableIds: t.Array(t.Number({ minimum: 1 }), {
      minItems: 1,
      description: 'ID столов для резерва на время ивента',
    }),
  }),
  UpdateEventBody: t.Object({
    title: t.Optional(t.String({ minLength: 1 })),
    description: t.Optional(t.Nullable(t.String())),
    startsAt: t.Optional(t.String()),
    endsAt: t.Optional(t.String()),
    seatsPerTable: t.Optional(
      t.Number({
        minimum: 1,
        description: 'Количество мест за одним столом',
      }),
    ),
    bannerUrl: t.Optional(t.Nullable(t.String())),
    tableIds: t.Optional(
      t.Array(t.Number({ minimum: 1 }), {
        minItems: 1,
        description: 'Столы для резерва на время ивента',
      }),
    ),
  }),
  UploadResponse: t.Object({
    url: t.String({ description: 'Публичный URL загруженного файла' }),
    key: t.String({ description: 'Ключ объекта в S3/MinIO' }),
  }),
  News: t.Object({
    id: t.Number(),
    coverUrl: t.String(),
    title: t.String(),
    text: t.String(),
    publishedAt: t.String({ format: 'date-time' }),
    createdAt: t.String({ format: 'date-time' }),
    updatedAt: t.String({ format: 'date-time' }),
  }),
  CreateNewsBody: t.Object({
    coverUrl: t.String({ minLength: 1, description: 'URL обложки' }),
    title: t.String({ minLength: 1 }),
    text: t.String({ minLength: 1 }),
    publishedAt: t.Optional(
      t.String({
        description:
          'Дата публикации (ISO 8601). В будущем — черновик/отложенная. По умолчанию — сейчас',
      }),
    ),
  }),
  UpdateNewsBody: t.Object({
    coverUrl: t.Optional(t.String({ minLength: 1 })),
    title: t.Optional(t.String({ minLength: 1 })),
    text: t.Optional(t.String({ minLength: 1 })),
    publishedAt: t.Optional(
      t.String({
        description: 'Дата публикации (ISO 8601)',
      }),
    ),
  }),
};
