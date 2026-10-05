import type { ReservationDetails } from "@/apiUtils/booking";

// Типы основных страниц в навигации
export type PageTypes = "Home" | "Reservations" | "News" | "Profile" | "Admin";

export type AdminSectionTypes = "Reservations" | "ContentManagement";

// Типы этапов регистрации (Домашний экран -> Выбор услуги -> Выбор даты и стола -> Детали -> Подтверждение )
export type RegistrationStageTypes =
  | "Home"
  | "ServiceSelection"
  | "TableSelection"
  | "ServiceDetails"
  | "Confirmation";

// Блок с новостью на главной
export type NewsData = {
  title: string;
  description: string;
  date: string;
  img: string;
  mainBtnText: string;
  secondaryBtnText: string;
};

// -------------------------- Услуги --------------------------

// Тип услуг
export type ServiceType = "Warhammer" | "D&D" | "Посещение клуба";

// Дисциплина (приходит с сервера)
export type Discipline = {
  id: number;
  slug: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  scheduleWeekdays?: number[];
};

// Услуга (приходит с сервера)
export type Service = {
  id: number;
  disciplineId: number;
  slug: string;
  title: string;
  duration: number | null;
  visitorsCapacity: number | null;
  isActive: boolean;
  sortOrder: number;
  tableCapacityProfile?: string | null;
  /** Игроков за одним столом (WH) */
  seatsPerTable?: number | null;
  /** Общая вместимость без столов (покраска, клуб) */
  poolCapacity?: number | null;
  /** На записи присутствует тренер */
  hasTrainer?: boolean;
  description: string | null;
};

// Описание услуги в списке
export type ServiceItem = {
  serviceId: number;
  disciplineId: number;
  title: string;
  description: string;
  img: string;
  durationHours: number | null;
  maxOccupation: number | null;
};

export type ServiceOption = {
  Warhammer: [
    "Бронирование стола",
    "Аренда армии",
    "Покраска миниатюр",
    "Покупка миниатюр",
    "Инд. тренировка",
    "Групповая тренировка",
  ];
  "D&D": ["Бронирование стола"];
  "Посещение клуба": ["Посещение клуба"];
};

export type ServiceActivity = ServiceOption[ServiceType][number];

// -------------------------- Столы --------------------------

// Стол для бронирования
export type TableAvailabilitySegment = {
  startsAt: string;
  endsAt: string;
  freeSeats: number;
};

export type Table = {
  id: number;
  name: string;
  is_active?: boolean;
  seatCapacity?: number;
  segments?: TableAvailabilitySegment[];
  description?: string;
  discipline?: ServiceType;
  activity?: ServiceActivity;
  date?: string;
  timeFrom?: string;
  timeTo?: string;
  playersMax?: number;
  playersCurrent?: number;
};

// API Types
export type TelegramUser = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string;
  username: string;
  photoUrl: string;
};

export type TelegramAuthResponse = {
  token: string;
  user: TelegramUser;
};

// -------------------------- Записи --------------------------

export type Reservation = {
  id: string;
  serviceSlug?: string;
  serviceTitle?: string | null;
  /** Данные игрока (армия, очки, опыт) или формы покраски */
  details?: ReservationDetails | null;
  userId: string;
  telegramId: number | null;
  tableId: number | null;
  startsAt: string;
  endsAt: string;
  status: string;
  remindAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  serviceId: number;
  partySize: number;
  seatClubArmyOptions: boolean[];
  buyArmyOptions: boolean[];
};

export type ReservationTable = {
  id: number;
  name: string;
};

export type AdminReservation = Reservation & {
  user?: TelegramUser | null;
  service?: Service | null;
  table?: ReservationTable | null;
};

export type AdminReservationsQuery = {
  date?: string;
  serviceId?: number;
  tableId?: number;
  status?: string;
  userId?: string;
  startsAt?: string;
  endsAt?: string;
  limit: number;
  offset: number;
};

export type AdminReservationsPage = {
  items: AdminReservation[];
  total: number | null;
};

// -------------------------- Ивенты --------------------------

export type Event = {
  id: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  seatsPerTable: number;
  capacity: number;
  bannerUrl: string;
  tableIds: number[];
  createdAt: string;
  updatedAt: string;
  freeSeats?: number;
};

export type RegisteredEvent = Event & {
  registeredCount: number;
  isRegistered: boolean;
  partySize: number;
};

export type MyReservations = {
  reservations: Reservation[];
  event: RegisteredEvent | null;
};

export type EventUpdatePayload = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  seatsPerTable: number;
  bannerUrl: string;
  tableIds: number[];
};

export type AdminUploadResponse = {
  key: string;
  url: string;
};

// -------------------------- Новости --------------------------

export type NewsItem = {
  id: number;
  coverUrl: string;
  title: string;
  text: string;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NewsPayload = {
  coverUrl: string;
  title: string;
  text: string;
};
