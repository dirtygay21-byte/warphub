export const eventsConfig = {
  /** Длительность ивента по умолчанию, если endsAt не указан */
  defaultDurationHours: 6,
  /** Разрешённые папки для POST /admin/upload */
  uploadDestinations: ['events', 'news', 'dnd-games', 'notifications'] as const,
} as const;

export type UploadDestination =
  (typeof eventsConfig.uploadDestinations)[number];
