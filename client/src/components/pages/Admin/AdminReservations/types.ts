export type Filters = {
  date: string;
  serviceId: string;
  tableId: string;
  status: string;
  telegramId: string;
  startsAt: string;
  endsAt: string;
};

export type SortKey =
  | "id"
  | "startsAt"
  | "telegramId"
  | "serviceId"
  | "tableId"
  | "status"
  | "partySize"
  | "createdAt";

export type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
};
