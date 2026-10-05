import { apiRequest } from "@/apiUtils/general";
import type { Discipline, Service } from "@/types";

type DisciplineApi = Discipline & {
  schedule_weekdays?: number[];
};

const mapDiscipline = (discipline: DisciplineApi): Discipline => ({
  ...discipline,
  scheduleWeekdays:
    discipline.scheduleWeekdays ?? discipline.schedule_weekdays,
});

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) =>
  a.sortOrder - b.sortOrder;

export const getDisciplines = async (): Promise<Discipline[]> => {
  const data = await apiRequest<DisciplineApi[]>("/disciplines");
  return data
    .filter((d) => d.isActive)
    .map(mapDiscipline)
    .sort(bySortOrder);
};

export const isWarhammerDiscipline = (discipline?: Discipline | null) => {
  if (!discipline) return false;

  const slug = discipline.slug.toLowerCase();
  const title = discipline.title.toLowerCase();

  return slug.includes("warhammer") || title.includes("warhammer");
};

// Игровые режимы Warhammer, для которых доступен выбор армии клуба.
// TODO: заменить на поле с бэкенда, когда появится.
export const WARHAMMER_CAN_SELECT_ARMY = [3, 2, 4];

// Услуги Warhammer с опцией «Купить фигурку» (покраска миниатюр).
// TODO: заменить на поле с бэкенда, когда появится.
export const WARHAMMER_CAN_BUY_FIGURE = [6];

export const canSelectClubArmy = (
  serviceId: number | null,
  discipline?: Discipline | null,
) =>
  serviceId != null &&
  isWarhammerDiscipline(discipline) &&
  WARHAMMER_CAN_SELECT_ARMY.includes(serviceId);

export const canBuyFigure = (
  serviceId: number | null,
  discipline?: Discipline | null,
) =>
  serviceId != null &&
  isWarhammerDiscipline(discipline) &&
  WARHAMMER_CAN_BUY_FIGURE.includes(serviceId);

export const getServices = async (
  disciplineId: number | null = null,
): Promise<Service[]> => {
  const path = disciplineId
    ? `/services?disciplineId=${disciplineId}`
    : "/services";

  const data = await apiRequest<Service[]>(path);
  return data.filter((s) => s.isActive).sort(bySortOrder);
};

export const getServiceById = (id: number) =>
  apiRequest<Service>(`/services/${id}`);
