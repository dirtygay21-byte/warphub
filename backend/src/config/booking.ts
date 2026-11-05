export const bookingConfig = {
  /** UTC+5, без перехода на летнее время */
  timezoneOffsetMinutes: 5 * 60,
  /** IANA-зона клуба (для клиента и уведомлений) */
  timeZone: 'Asia/Yekaterinburg',
  /** Открытие клуба (локальное время даты записи) */
  openHour: 12,
  /**
   * Открытие клуба по дням недели (ISO: 5 = пт), если отличается от openHour.
   * Пятница: записи — только с 20:00 (решение владельца 05.11.2026).
   * Сетка слотов и серверная проверка берут час отсюда через getClubSessionBounds.
   */
  openHourByWeekday: { 5: 20 } as Record<number, number>,
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
   * Игра D&D закрывает весь клуб (решение владельца 31.10.2026): оба острова, покраску и посещение — на время игры
   * и ещё на столько минут после конца (сборы, уборка). Следующая запись — не раньше конца + это время.
   */
  dndClosureBufferMinutes: 60,
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
    // Warcry (W6 30.10.2026): варбанды — из данных WarpBuilder (roster-data/warcry)
    { value: 'warcry', label: 'Warcry' },
  ],
  /**
   * Команды Kill Team (3-я редакция) для поля «Команда» — по фракциям, как в меню Wahapedia (решение владельца, 29.10.2026).
   * Источник: wahapedia.ru/kill-team3 — меню команд (страница NPO); пять команд, которых нет в меню, но есть свои страницы
   * (Celestian Insidiants, Spectre Squad, Wolf Scouts, Murderwing, XV26 Stealth Battlesuits), — по ключевым словам фракции
   * на их страницах. Названия — как на Wahapedia. Exodite Dragon Masters (август 2026) на Wahapedia ещё нет — «Другая…».
   * Новые команды добавлять сюда.
   */
  killTeamGroups: [
    {
      group: 'Imperium',
      factions: [
        { faction: 'Adepta Sororitas', teams: ['Celestian Insidiants', 'Novitiates'] },
        { faction: 'Adeptus Mechanicus', teams: ['Battleclade', 'Hunter Clade'] },
        { faction: 'Agents of the Imperium', teams: ['Elucidian Starstrider', 'Exaction Squad', 'Imperial Navy Breacher', 'Inquisitorial Agent', 'Sanctifiers'] },
        { faction: 'Astra Militarum', teams: ['Death Korps', 'Kasrkin', 'Ratlings', 'Spectre Squad', 'Tempestus Aquilons'] },
        { faction: 'Space Marines', teams: ['Angel of Death', 'Deathwatch', 'Phobos Strike Team', 'Scout Squad', 'Wolf Scouts'] },
      ],
    },
    {
      group: 'Chaos',
      factions: [
        { faction: 'Chaos Daemons', teams: ['Gellerpox Infected'] },
        { faction: 'Chaos Space Marines', teams: ['Legionary', 'Murderwing', 'Nemesis Claw'] },
        { faction: 'Cultists', teams: ['Blooded', 'Chaos Cult', 'Fellgor Ravager'] },
        { faction: 'Death Guard', teams: ['Plague Marines'] },
        { faction: 'Thousand Sons', teams: ['Warpcoven'] },
        { faction: 'World Eaters', teams: ['Goremonger'] },
      ],
    },
    {
      group: 'Aeldari',
      factions: [
        { faction: 'Corsairs', teams: ['Corsair Voidscarred'] },
        { faction: 'Craftworlds', teams: ['Blades of Khaine'] },
        { faction: 'Drukhari', teams: ['Hand of the Archon', 'Mandrakes'] },
        { faction: 'Harlequins', teams: ['Void-dancer Troupe'] },
      ],
    },
    {
      group: 'Xenos',
      factions: [
        { faction: 'Genestealer Cults', teams: ['Brood Brother', 'Wyrmblade'] },
        { faction: 'Kroot', teams: ['Farstalker Kinband'] },
        { faction: 'Leagues of Votann', teams: ['Hearthkyn Salvager', 'Hernkyn Yaegir'] },
        { faction: 'Necrons', teams: ['Canoptek Circle', 'Hierotek Circle'] },
        { faction: 'Orks', teams: ['Kommandos', 'Wrecka Krew'] },
        { faction: "T'au Empire", teams: ['Pathfinders', 'Vespid Stingwings', 'XV26 Stealth Battlesuits'] },
      ],
    },
    {
      group: 'Tyranids',
      factions: [
        { faction: 'Tyranids', teams: ['Raveners'] },
      ],
    },
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

/** Все команды Kill Team списком (для справочника клиента и проверок). */
export const killTeams: string[] = bookingOptions.killTeamGroups.flatMap((g) => g.factions.flatMap((f) => [...f.teams]));

/** «Армия: Orks» / «Команда: Pathfinders (T'au Empire)» — строка уведомления (без HTML-экранирования). */
export function armyLine(game: string | null | undefined, army: string): string {
  if (game === 'warcry') return `Варбанда: ${army}`;
  if (game !== 'kt') return `Армия: ${army}`;
  const f = killTeamFaction(army);
  return `Команда: ${army}${f ? ` (${f})` : ''}`;
}

/** Фракция команды Kill Team («T'au Empire») или null — команды нет в списке («Другая…»). */
export function killTeamFaction(team: string): string | null {
  for (const g of bookingOptions.killTeamGroups) for (const f of g.factions) if ((f.teams as readonly string[]).includes(team)) return f.faction;
  return null;
}

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
