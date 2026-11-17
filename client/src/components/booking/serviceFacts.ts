/**
 * Часы и люди услуги для корешка билета (17.11.2026): берутся из настроек услуги (длительность, мест за столом,
 * тренер, вместимость), ничего не придумывается — нет данных, нет строки.
 */
import { pluralizeRu } from "../../utils/plural";

export type ServiceFactsInput = {
  duration?: number | null;
  seatsPerTable?: number | null;
  hasTrainer?: boolean | null;
  visitorsCapacity?: number | null;
  poolCapacity?: number | null;
};

/** 180 → «3 ч», 90 → «1,5 ч», 45 → «45 мин» */
export function shortHours(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  if (minutes % 30 === 0) return `${String(minutes / 60).replace(".", ",")} ч`;
  return `${minutes} мин`;
}

export function serviceFacts(s: ServiceFactsInput): {
  hours: { value: string; note: string } | null;
  people: { value: string; note: string } | null;
} {
  const seats = s.seatsPerTable ?? null;
  const hours =
    s.duration && s.duration > 0
      ? { value: shortHours(s.duration), note: s.hasTrainer ? "занятие" : seats && seats >= 2 ? "игра" : "время" }
      : null;
  let people: { value: string; note: string } | null = null;
  if (seats && seats > 0) {
    people = s.hasTrainer
      ? { value: `${seats}+1`, note: "с тренером" }
      : { value: String(seats), note: pluralizeRu(seats, { one: "игрок", few: "игрока", many: "игроков" }) };
  } else {
    const cap = s.visitorsCapacity ?? s.poolCapacity ?? null;
    if (cap && cap > 0) people = { value: `до ${cap}`, note: pluralizeRu(cap, { one: "человек", few: "человек", many: "человек" }) };
  }
  return { hours, people };
}
