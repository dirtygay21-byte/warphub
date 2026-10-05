import { clubIso, dateKeyOf } from "@/utils/clubTime";

/** Начало календарного дня по времени клуба (ISO с +05:00) */
export const getDateStartsAt = (date: Date) => clubIso(dateKeyOf(date), 0, 0);

/** Дата + час по времени клуба (ISO с +05:00) */
export const getSelectDateAtHour = (date: Date, hour: number) =>
  clubIso(dateKeyOf(date), hour, 0);
