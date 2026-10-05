import { serviceDetailsDescriptions } from "@/serviceDetailsDescriptions";
import { formatCalendarDate } from "@/utils/date";
import { getClubTimeParts } from "@/utils/clubTime";
import type { Service, ServiceActivity, ServiceType, Table } from "@/types";

export const getDisciplineNameById = (id: number): string => {
  const titles: Record<number, string> = {
    1: "D&D",
    2: "Warhammer",
    3: "Посещение клуба",
  };
  return titles[id] ;
};

export const formatDate = formatCalendarDate;

export { getDateStartsAt } from "@/utils/dateTime";

export const getTimeParts = (date: string) => getClubTimeParts(date);

export const padTimePart = (value: string) => {
  if (!value) return value;

  return value.padStart(2, "0");
};

export const getFreeSeats = (selectedTable: Table | null) =>
  selectedTable?.playersMax != null && selectedTable?.playersCurrent != null
    ? Math.max(selectedTable.playersMax - selectedTable.playersCurrent, 0)
    : null;

export const getServiceDetailsMeta = ({
  disciplineId,
  apiService,
  selectedTable,
}: {
  disciplineId: number | null;
  apiService?: Service | null;
  selectedTable: Table | null;
}) => {
  const discipline = disciplineId ? getDisciplineNameById(disciplineId) : null;
  const activity = apiService?.title ?? selectedTable?.activity;
  const description =
    apiService?.description ??
    (discipline && activity
      ? serviceDetailsDescriptions[discipline as ServiceType]?.[
          activity as ServiceActivity
        ]
      : undefined) ??
    selectedTable?.description;

  return { discipline: discipline ?? undefined, activity, description };
};
