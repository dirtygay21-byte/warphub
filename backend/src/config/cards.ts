/**
 * «Легенды Warp Hub» — оригинальный набор коллекционных карт.
 * Фэнтези-мир клуба: свои фракции, имена и характеристики (упрощённые,
 * собственная система — не повторяет правила ни одной настольной игры).
 *
 * Картинки карт рисует клиент по id карты (src/components/games/pixel/fantasy.ts).
 */

export const CARD_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type CardRarity = (typeof CARD_RARITIES)[number];

export const RARITY_LABELS: Record<CardRarity, string> = {
  common: 'Обычная',
  uncommon: 'Необычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export const CARD_FACTIONS = {
  dawn: 'Орден Рассвета',
  clans: 'Каменные кланы',
  grove: 'Духи Чащи',
  restless: 'Неупокоенные',
  bog: 'Болотная орда',
  ash: 'Пепельные рыцари',
  wild: 'Древние чудища',
} as const;
export type CardFaction = keyof typeof CARD_FACTIONS;

export type CardDef = {
  id: string;
  name: string;
  faction: CardFaction;
  rarity: CardRarity;
  /** Раны */
  wounds: number;
  /** Движение, дюймы */
  move: number;
  /** Атаки */
  attack: number;
  /** Защита X+ */
  defence: number;
  /** Сила */
  strength: number;
  /** Урон */
  damage: number;
  ability: { name: string; text: string };
};

const c = (
  id: string, name: string, faction: CardFaction, rarity: CardRarity,
  [wounds, move, attack, defence, strength, damage]: [number, number, number, number, number, number],
  abilityName: string, abilityText: string,
): CardDef => ({ id, name, faction, rarity, wounds, move, attack, defence, strength, damage, ability: { name: abilityName, text: abilityText } });

export const CARD_CATALOG: CardDef[] = [
  // ---- Орден Рассвета
  c('dawn_spear', 'Рассветный копейщик', 'dawn', 'common', [2, 5, 2, 4, 3, 1], 'Стена копий', 'Враг, атакующий первым, получает −1 к попаданию.'),
  c('dawn_crossbow', 'Арбалетчик Ордена', 'dawn', 'common', [1, 5, 2, 5, 4, 1], 'Тяжёлый болт', 'Выстрел пробивает щит: защита врага хуже на 1.'),
  c('dawn_shield', 'Рыцарь Солнечного Щита', 'dawn', 'uncommon', [3, 5, 3, 3, 4, 1], 'Отражённый свет', 'Раз за бой отменяет одну рану.'),
  c('dawn_sister', 'Сестра Света', 'dawn', 'uncommon', [2, 5, 1, 5, 2, 1], 'Молитва зари', 'Лечит союзника на 1 рану в начале хода.'),
  c('dawn_paladin', 'Паладин Зари', 'dawn', 'rare', [4, 5, 4, 3, 5, 2], 'Клинок полудня', 'Против нежити урон удваивается.'),
  c('dawn_gryphon', 'Грифоний всадник', 'dawn', 'epic', [7, 12, 5, 3, 5, 2], 'Пикирование', 'В первый раунд атакует до врага.'),
  c('dawn_aurel', 'Верховный магистр Аурелий', 'dawn', 'legendary', [8, 5, 6, 2, 6, 3], 'Восход', 'Все союзники получают +1 к защите, пока магистр стоит.'),
  // ---- Каменные кланы
  c('clan_gate', 'Хранитель врат клана', 'clans', 'common', [2, 4, 2, 3, 3, 1], 'Каменная стойка', 'Не отступает ни на шаг.'),
  c('clan_miner', 'Рудокоп-воитель', 'clans', 'common', [2, 4, 2, 4, 4, 1], 'Подкоп', 'Может появиться у края поля боя.'),
  c('clan_gunner', 'Огнестрел клана', 'clans', 'uncommon', [2, 4, 2, 4, 4, 2], 'Залп с колена', 'Стоя на месте, стреляет дважды.'),
  c('clan_runesmith', 'Рунный кузнец', 'clans', 'rare', [4, 4, 3, 3, 5, 2], 'Руна закалки', 'Оружие союзника +1 к силе на весь бой.'),
  c('clan_bombard', 'Мастер-бомбардир', 'clans', 'epic', [5, 3, 1, 4, 8, 4], 'Раскат пушки', 'Выстрел задевает всех рядом с целью.'),
  c('clan_brunnar', 'Король Подгорья Бруннар', 'clans', 'legendary', [8, 4, 6, 2, 7, 3], 'Наковальня предков', 'Удар молота оглушает врага на раунд.'),
  // ---- Духи Чащи
  c('grove_thorn', 'Шиповник-плетельщик', 'grove', 'common', [1, 6, 2, 5, 2, 1], 'Колючая поросль', 'Враг рядом теряет 1 движение.'),
  c('grove_wolf', 'Сумеречный волк', 'grove', 'common', [2, 9, 3, 5, 3, 1], 'Стая', '+1 атака, если рядом ещё один волк.'),
  c('grove_dryad', 'Дриада-охотница', 'grove', 'uncommon', [2, 7, 2, 4, 3, 1], 'Стрела из тени', 'Стреляет, оставаясь невидимой в лесу.'),
  c('grove_treant', 'Древень-страж', 'grove', 'rare', [7, 4, 3, 3, 6, 2], 'Корни', 'Опутанный враг не может двигаться.'),
  // ---- Неупокоенные
  c('dead_skeleton', 'Костяной воин', 'restless', 'common', [1, 4, 2, 5, 3, 1], 'Восстань', 'Павший встаёт снова на 1 бросок кубика из шести.'),
  c('dead_archer', 'Могильный лучник', 'restless', 'common', [1, 4, 2, 6, 3, 1], 'Стрела тлена', 'Рана не лечится до конца боя.'),
  c('dead_wraith', 'Призрачный страж', 'restless', 'uncommon', [3, 8, 2, 4, 4, 1], 'Бесплотный', 'Обычное оружие ранит лишь на 5+.'),
  c('dead_ghoul', 'Рыцарь-упырь', 'restless', 'rare', [5, 6, 4, 3, 5, 2], 'Жажда', 'Каждая нанесённая рана лечит его на 1.'),
  c('dead_bonedrake', 'Костяной дракон', 'restless', 'epic', [10, 10, 5, 4, 6, 3], 'Мёртвое пламя', 'Дыхание игнорирует броню.'),
  c('dead_morven', 'Лич-король Морвен', 'restless', 'legendary', [7, 5, 4, 3, 5, 3], 'Повелитель могил', 'Раз за бой поднимает отряд павших воинов.'),
  // ---- Болотная орда
  c('bog_goblin', 'Болотный гоблин', 'bog', 'common', [1, 6, 2, 6, 2, 1], 'Подлый удар', '+1 к атаке в спину.'),
  c('bog_shaman', 'Гоблин-шаман', 'bog', 'uncommon', [2, 5, 1, 5, 2, 1], 'Грибной туман', 'Враги рядом получают −1 к попаданию.'),
  c('bog_boar', 'Бронированный вепрь', 'bog', 'uncommon', [4, 9, 3, 4, 4, 1], 'Таран', 'Натиск сбивает врага с ног.'),
  c('bog_troll', 'Каменный тролль', 'bog', 'rare', [7, 5, 3, 4, 6, 2], 'Регенерация', 'В начале хода лечит 1 рану.'),
  c('bog_ogre', 'Огр-вожак', 'bog', 'epic', [9, 6, 5, 4, 7, 3], 'Брюхо-таран', 'Атакуя первым, наносит +2 урона.'),
  // ---- Пепельные рыцари
  c('ash_levy', 'Пепельный ратник', 'ash', 'common', [2, 5, 2, 4, 3, 1], 'Без страха', 'Не бежит с поля боя.'),
  c('ash_cultist', 'Пепельный культист', 'ash', 'uncommon', [2, 5, 3, 5, 3, 1], 'Жертва', 'Падая, даёт союзнику +1 атаку.'),
  c('ash_knight', 'Рыцарь Пепла', 'ash', 'rare', [5, 5, 4, 3, 5, 2], 'Тлеющий доспех', 'Ударивший его получает 1 рану.'),
  c('ash_colossus', 'Пепельный колосс', 'ash', 'epic', [11, 5, 4, 3, 8, 3], 'Шаг колосса', 'Растаптывает мелких врагов на пути.'),
  // ---- Древние чудища
  c('wild_manticore', 'Мантикора', 'wild', 'rare', [7, 10, 4, 4, 5, 2], 'Жало', 'Яд: −1 рана врагу каждый ход.'),
  c('wild_hydra', 'Гидра трясин', 'wild', 'epic', [10, 6, 6, 4, 5, 2], 'Пять голов', 'Атак столько, сколько у неё осталось ран, но не больше 6.'),
  c('wild_ignarr', 'Древний дракон Игнарр', 'wild', 'legendary', [14, 12, 6, 3, 8, 4], 'Огненный шторм', 'Дыхание поджигает всех врагов разом.'),
];

export type RarityConfig = { weight: number; points: number };

export type CardParams = {
  /** Сколько бесплатных пакетов в день */
  packsPerDay: number;
  /** Карт в пакете */
  cardsPerPack: number;
  /** В каждом пакете хотя бы одна карта «Необычная» или выше */
  guaranteeUncommon: boolean;
  /** Шанс (вес) и очки за каждую редкость */
  rarities: Record<CardRarity, RarityConfig>;
};

export const DEFAULT_CARD_PARAMS: CardParams = {
  packsPerDay: 1,
  cardsPerPack: 5,
  guaranteeUncommon: true,
  rarities: {
    common: { weight: 60, points: 100 },
    uncommon: { weight: 25, points: 300 },
    rare: { weight: 10, points: 500 },
    epic: { weight: 4, points: 750 },
    legendary: { weight: 1, points: 1000 },
  },
};
