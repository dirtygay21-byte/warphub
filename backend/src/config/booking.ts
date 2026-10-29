export const bookingConfig = {
  /** UTC+5, без перехода на летнее время */
  timezoneOffsetMinutes: 5 * 60,
  /** IANA-зона клуба (для клиента и уведомлений) */
  timeZone: 'Asia/Yekaterinburg',
  /** Открытие клуба (локальное время даты записи) */
  openHour: 12,
  /**
   * Закрытие клуба на следующие сутки (локально).
   * Базовый endsAt при создании не должен выходить за этот момент;
   * позже endsAt может быть продлён через админку.
   */
  closeHourNextDay: 10,
  /**
   * Верхняя граница startsAt (локально на следующие сутки).
   * Запись доступна с openHour до этого часа (не включая).
   */
  bookingUntilHourNextDay: 0,
  defaultDurationMinutes: 60,
  slotStepMinutes: 30,
  /**
   * Короче полной длительности (B1, решение владельца 24.10.2026): если до следующей записи (или до занятых мест)
   * свободно меньше полной длительности, но не меньше этого — запись возможна с укороченным концом.
   */
  minShortenedMinutes: 120,
  /**
   * Запасной вариант, если у услуги не задан services.seats_per_table.
   * small — 2 человека на стол, large — 6.
   */
  tableCapacityByProfile: {
    small: 2,
    large: 6,
  },
  /** Запасной вариант, если у club_visit не задан services.pool_capacity */
  clubSpectatorCapacity: 25,
  /**
   * Дни недели (ISO: 1 = пн, 7 = вс), в которые разрешены все активности,
   * кроме D&D. Проверяется на сервере при каждой записи.
   */
  allowedWeekdays: [5, 6, 7] as number[],
} as const;

export type TableCapacityProfile =
  keyof typeof bookingConfig.tableCapacityByProfile;

/**
 * Справочники для форм записи. Тексты можно менять здесь —
 * клиент получает их через GET /booking-options.
 */
export const bookingOptions = {
  experienceLevels: [
    { value: 'beginner', label: 'Новичок', hint: '1–5 игр' },
    { value: 'player', label: 'Игрок', hint: '5–15 игр' },
    { value: 'experienced', label: 'Опытный', hint: '15–30 игр' },
    { value: 'veteran', label: 'Ветеран', hint: '30–60 игр' },
  ],
  /** Фракции Warhammer 40,000 — для поля «Армия» и формы покраски */
  factions: [
    'Adepta Sororitas',
    'Adeptus Custodes',
    'Adeptus Mechanicus',
    'Aeldari',
    'Agents of the Imperium',
    'Astra Militarum',
    'Black Templars',
    'Blood Angels',
    'Chaos Daemons',
    'Chaos Knights',
    'Chaos Space Marines',
    'Dark Angels',
    'Death Guard',
    'Deathwatch',
    'Drukhari',
    "Emperor's Children",
    'Genestealer Cults',
    'Grey Knights',
    'Imperial Knights',
    'Leagues of Votann',
    'Necrons',
    'Orks',
    'Space Marines',
    'Space Wolves',
    "T'au Empire",
    'Thousand Sons',
    'Tyranids',
    'World Eaters',
  ],
  /** Игра в записи на Warhammer (24.10.2026) */
  games: [
    { value: '40k', label: 'Warhammer 40,000' },
    { value: 'aos', label: 'Age of Sigmar' },
    { value: 'kt', label: 'Kill Team' },
  ],
  /**
   * Команды Kill Team для поля «Команда» (плюс «Другая…»). Источники (решение владельца 1B, 24.10.2026):
   * Warhammer Community «Kill Team: managing the range of kill teams in the new edition» (06.09.2024) — 33 команды;
   * команды, вышедшие позже, — по списку «Kill Team Tier List Q3 2026» (canyourollacrit.com, 08.10.2026), написание —
   * как у Warhammer Community («Legionaries», «Tempestus Aquilons»). Новые команды добавлять сюда.
   */
  killTeams: [
    'Angels of Death',
    'Battleclade',
    'Blades of Khaine',
    'Blooded',
    'Brood Brothers',
    'Canoptek Circle',
    'Celestian Insidiants',
    'Chaos Cult',
    'Corsair Voidscarred',
    'Death Korps',
    'Deathwatch',
    'Elucidian Starstriders',
    'Exaction Squad',
    'Exodite Dragon Masters',
    'Farstalker Kinband',
    'Fellgor Ravagers',
    'Gellerpox Infected',
    'Goremongers',
    'Hand of the Archon',
    'Hearthkyn Salvagers',
    'Hernkyn Yaegirs',
    'Hierotek Circle',
    'Hunter Clade',
    'Imperial Navy Breachers',
    'Inquisitorial Agents',
    'Kasrkin',
    'Kommandos',
    'Legionaries',
    'Mandrakes',
    'Murderwing',
    'Nemesis Claw',
    'Novitiates',
    'Pathfinders',
    'Phobos Strike Team',
    'Plague Marines',
    'Ratlings',
    'Raveners',
    'Sanctifiers',
    'Scout Squad',
    'Spectre Squad',
    'Tempestus Aquilons',
    'Vespid Stingwings',
    'Void-dancer Troupe',
    'Warpcoven',
    'Wolf Scouts',
    'Wrecka Krew',
    'Wyrmblade',
    'XV26 Stealth Battlesuits',
  ],
  paintSources: [
    { value: 'own', label: 'Свои краски' },
    { value: 'club', label: 'Краски клуба' },
  ],
  dndTimePreferences: [
    { value: 'morning', label: 'Утро' },
    { value: 'afternoon', label: 'День' },
    { value: 'evening', label: 'Вечер' },
  ],
  /** Максимум игроков в одной заявке/записи на D&D */
  dndMaxPlayersPerRequest: 6,
  /** Подсказки для поля «Очки» */
  pointsPresets: [500, 1000, 1500, 2000],
  maxPoints: 10000,
} as const;

export type ExperienceLevel =
  (typeof bookingOptions.experienceLevels)[number]['value'];
export type PaintSource = (typeof bookingOptions.paintSources)[number]['value'];
export type WhGame = (typeof bookingOptions.games)[number]['value'];

export function isWhGame(value: unknown): value is WhGame {
  return bookingOptions.games.some((g) => g.value === value);
}

/** «Warhammer 40,000» / «Age of Sigmar» / «Kill Team»; старые записи без игры — 40K */
export function gameLabel(value: string | null | undefined): string {
  return bookingOptions.games.find((g) => g.value === (value ?? '40k'))?.label ?? bookingOptions.games[0].label;
}
export type DndTimePreference =
  (typeof bookingOptions.dndTimePreferences)[number]['value'];

export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return bookingOptions.experienceLevels.some((level) => level.value === value);
}

export function experienceLabel(value: string | null | undefined): string {
  return (
    bookingOptions.experienceLevels.find((level) => level.value === value)
      ?.label ?? '—'
  );
}

export function isPaintSource(value: unknown): value is PaintSource {
  return bookingOptions.paintSources.some((source) => source.value === value);
}

export function paintSourceLabel(value: string | null | undefined): string {
  return (
    bookingOptions.paintSources.find((source) => source.value === value)
      ?.label ?? '—'
  );
}

export function isDndTimePreference(
  value: unknown,
): value is DndTimePreference {
  return bookingOptions.dndTimePreferences.some(
    (option) => option.value === value,
  );
}

export function dndTimePreferenceLabel(value: string): string {
  return (
    bookingOptions.dndTimePreferences.find((option) => option.value === value)
      ?.label ?? value
  );
}
