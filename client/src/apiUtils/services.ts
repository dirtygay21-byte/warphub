import { apiRequest } from "@/apiUtils/general";
import { formatClubTime } from "@/utils/clubTime";
import type { Table, TableAvailabilitySegment } from "@/types";

type ServiceAvailabilityParams = {
  serviceId: number;
  disciplineId: number;
  date: string;
};

type ServiceAvailabilityResponse =
  | Table[]
  | {
      tables?: Table[];
      data?: Table[];
      slots?: Array<{
        table: {
          id: number;
          name: string;
          seatCapacity: number;
        };
        segments: TableAvailabilitySegment[];
      }>;
    };

export const getServiceAvailability = async ({
  serviceId,
  disciplineId,
  date,
}: ServiceAvailabilityParams): Promise<Table[]> => {
  const searchParams = new URLSearchParams({
    date,
    disciplineId: String(disciplineId),
  });

  const data = await apiRequest<ServiceAvailabilityResponse>(
    `/services/${serviceId}/availability?${searchParams.toString()}`,
  );

  if (Array.isArray(data)) return data;
  if (data.slots) return data.slots.map(mapSlotToTable);

  return data.tables ?? data.data ?? [];
};

const mapSlotToTable = ({
  table,
  segments,
}: {
  table: { id: number; name: string; seatCapacity: number };
  segments: TableAvailabilitySegment[];
}): Table => {
  const maxFreeSeats = Math.max(0, ...segments.map((segment) => segment.freeSeats));
  const firstSegment = segments[0];

  return {
    id: table.id,
    name: table.name,
    is_active: maxFreeSeats > 0,
    seatCapacity: table.seatCapacity,
    segments,
    timeFrom: firstSegment ? formatTime(firstSegment.startsAt) : undefined,
    timeTo: firstSegment ? formatTime(firstSegment.endsAt) : undefined,
    playersMax: table.seatCapacity,
    playersCurrent: table.seatCapacity - maxFreeSeats,
  };
};

const formatTime = (date: string) => formatClubTime(date);
