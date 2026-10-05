export const DEFAULT_LIMIT = 50;

export const LIMIT_OPTIONS = [20, 50, 100];

export const STATUS_OPTIONS = [
  { value: "", label: "Все статусы" },
  { value: "pending", label: "Ожидает" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
];

export const SERVICE_NAMES: Record<number, string> = {
  1: "Бронирование стола",
  2: "Обычная игра",
  3: "Групповая тренировка",
  4: "Инд. тренировка",
  5: "Покупка миниатюр",
  6: "Покраска миниатюр",
  7: "Посещение клуба",
};
