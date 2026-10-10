/**
 * Мини-игры: значения по умолчанию.
 *
 * Таблицы наград и параметры игр можно менять в админке (Админ → Награды →
 * Настройки) — тогда значения из базы заменяют эти. Здесь — стартовые значения
 * и справочники (бойцы, существа), которые используют и сервер, и клиент.
 */

import { DEFAULT_CARD_PARAMS, type CardParams } from './cards';

export const MINIGAME_KEYS = ['runner', 'dice', 'egg', 'cards'] as const;
export type MinigameKey = (typeof MINIGAME_KEYS)[number];

export const REWARD_TYPES = [
  /** Скидка в процентах (value = 5 → 5%) */
  'percent_discount',
  /** Скидка в рублях (value = 100 → 100 ₽) */
  'fixed_discount',
  /** Бонусные баллы */
  'bonus_points',
  /** Значок/статус в клубе (value не используется, смысл — в label) */
  'badge',
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export type RewardTier = {
  /** Минимальный результат (метры, победы, нажатия), начиная с которого даётся награда */
  minScore: number;
  rewardType: RewardType;
  value: number;
  /** Подпись, например «Скидка 3%» (если пусто — формируется автоматически) */
  label?: string;
};

export type RunnerParams = {
  /** Максимальная скорость бега, м/с — для проверки результата */
  maxSpeedMps: number;
  /** Допуск к проверке, метров */
  toleranceMeters: number;
};

export type DiceParams = {
  /** Бонус к процентной скидке за победу «на последнем издыхании» */
  clutchBonusPercent: number;
  /** «Почти без здоровья» — осталось не больше этой доли ран */
  clutchThreshold: number;
  /** Сколько ран восстанавливается после каждой победы */
  healAfterWin: number;
  /** Каждый следующий противник получает столько дополнительных ран за победу игрока */
  enemyWoundsPerWin: number;
  /** …и столько дополнительных атак (дробное — например 0.5 = +1 атака каждые 2 победы) */
  enemyAttacksPerWin: number;
};

export type EggParams = {
  /** Сколько секунд даётся на нажатия */
  durationSec: number;
  /** Максимум нажатий в секунду (несколько пальцев) — для проверки результата */
  maxTapsPerSec: number;
};

export type GameSettings<P> = {
  enabled: boolean;
  tiers: RewardTier[];
  params: P;
};

export type MinigameSettings = {
  /** Сколько дней действует награда */
  rewardValidDays: number;
  /** Сколько попыток в день на одну игру (защита от перебора) */
  maxSessionsPerDay: number;
  /** Сколько минут живёт начатая попытка */
  sessionTtlMinutes: number;
  games: {
    runner: GameSettings<RunnerParams>;
    dice: GameSettings<DiceParams>;
    egg: GameSettings<EggParams>;
    cards: GameSettings<CardParams>;
  };
};

export const DEFAULT_MINIGAME_SETTINGS: MinigameSettings = {
  rewardValidDays: 14,
  maxSessionsPerDay: 50,
  sessionTtlMinutes: 30,
  games: {
    runner: {
      enabled: true,
      tiers: [
        { minScore: 500, rewardType: 'percent_discount', value: 2 },
        { minScore: 1000, rewardType: 'percent_discount', value: 3 },
        { minScore: 2000, rewardType: 'percent_discount', value: 5 },
      ],
      params: { maxSpeedMps: 32, toleranceMeters: 40 },
    },
    dice: {
      enabled: true,
      tiers: [
        { minScore: 1, rewardType: 'percent_discount', value: 5 },
        { minScore: 3, rewardType: 'percent_discount', value: 7 },
        { minScore: 5, rewardType: 'percent_discount', value: 10 },
      ],
      params: { clutchBonusPercent: 1, clutchThreshold: 0.25, healAfterWin: 1, enemyWoundsPerWin: 1, enemyAttacksPerWin: 0.25 },
    },
    egg: {
      enabled: true,
      tiers: [
        { minScore: 10, rewardType: 'percent_discount', value: 1 },
        { minScore: 50, rewardType: 'percent_discount', value: 2 },
        { minScore: 100, rewardType: 'percent_discount', value: 3 },
        { minScore: 500, rewardType: 'percent_discount', value: 5 },
      ],
      params: { durationSec: 30, maxTapsPerSec: 25 },
    },
    cards: {
      enabled: true,
      tiers: [],
      params: DEFAULT_CARD_PARAMS,
    },
  },
};

export const MINIGAME_INFO: Record<
  MinigameKey,
  { title: string; description: string; scoreUnit: string }
> = {
  runner: {
    title: 'Зелёный рывок',
    description:
      'Громила Ржавой Орды несётся через горящие руины. Нажимайте на экран, чтобы перепрыгивать заграждения. Чем дальше забег — тем лучше награда.',
    scoreUnit: 'м',
  },
  dice: {
    title: 'Кости войны',
    description:
      'Воин Ордена Стальной Клятвы против Ржавой Орды и Роя. Попадание, ранение, спасбросок, урон — побеждайте врагов одного за другим и вовремя забирайте награду: при поражении она сгорает.',
    scoreUnit: 'побед',
  },
  egg: {
    title: 'Рой: инкубатор',
    description:
      'В инкубаторе Роя зреет кладка. Стучите по яйцу, пока идёт время: чем больше ударов, тем опаснее тварь, что вылупится.',
    scoreUnit: 'нажатий',
  },
  cards: {
    title: 'Легенды Warp Hub',
    description:
      'Открывайте пакеты коллекционных карт: рыцари, гномьи кланы, духи леса, нежить и древние чудища. Каждая карта приносит очки на ваш счёт, легендарная — 1000.',
    scoreUnit: 'очков',
  },
};

// ---------------------------------------------------------------------------
// Бойцы для «Костей войны» (оригинальные персонажи клуба)
// ---------------------------------------------------------------------------

export type Fighter = {
  id: string;
  name: string;
  /** Раны (здоровье) */
  wounds: number;
  /** Число атак за ход */
  attacks: number;
  /** Попадание на X+ */
  skill: number;
  /** Сила */
  strength: number;
  /** Стойкость */
  toughness: number;
  /** Пробитие брони (уменьшает спасбросок противника) */
  ap: number;
  /** Урон за непрощённое ранение */
  damage: number;
  /** Спасбросок X+ */
  save: number;
  /** Ключ спрайта на клиенте */
  sprite: string;
  /** Фракция: Орден Стальной Клятвы, Ржавая Орда или Рой */
  faction: 'order' | 'horde' | 'swarm';
};

export const PLAYER_FIGHTERS: Fighter[] = [
  { id: 'iron_captain', name: 'Капитан Ордена', wounds: 6, attacks: 4, skill: 3, strength: 4, toughness: 4, ap: 1, damage: 1, save: 3, sprite: 'iron_captain', faction: 'order' },
  { id: 'storm_huntress', name: 'Стрелок Ордена', wounds: 5, attacks: 5, skill: 3, strength: 4, toughness: 3, ap: 1, damage: 1, save: 4, sprite: 'storm_huntress', faction: 'order' },
  { id: 'scrap_brute', name: 'Молотобоец Ордена', wounds: 7, attacks: 4, skill: 4, strength: 6, toughness: 5, ap: 1, damage: 2, save: 5, sprite: 'scrap_brute', faction: 'order' },
  { id: 'gear_sage', name: 'Оружейник Ордена', wounds: 5, attacks: 3, skill: 3, strength: 6, toughness: 4, ap: 2, damage: 2, save: 4, sprite: 'gear_sage', faction: 'order' },
  { id: 'ember_witch', name: 'Огненная провидица', wounds: 4, attacks: 3, skill: 2, strength: 5, toughness: 3, ap: 2, damage: 2, save: 5, sprite: 'ember_witch', faction: 'order' },
  { id: 'gate_warden', name: 'Страж Врат', wounds: 7, attacks: 3, skill: 3, strength: 5, toughness: 5, ap: 1, damage: 1, save: 2, sprite: 'gate_warden', faction: 'order' },
];

export const ENEMY_FIGHTERS: Fighter[] = [
  { id: 'hive_reaper', name: 'Жнец Роя', wounds: 5, attacks: 5, skill: 4, strength: 4, toughness: 4, ap: 1, damage: 1, save: 5, sprite: 'hive_reaper', faction: 'swarm' },
  { id: 'fallen_knight', name: 'Панцирный страж Роя', wounds: 6, attacks: 4, skill: 3, strength: 5, toughness: 4, ap: 1, damage: 1, save: 3, sprite: 'fallen_knight', faction: 'swarm' },
  { id: 'war_drone', name: 'Пилорук Орды', wounds: 5, attacks: 3, skill: 4, strength: 6, toughness: 5, ap: 2, damage: 2, save: 4, sprite: 'war_drone', faction: 'horde' },
  { id: 'fang_chief', name: 'Вожак Ржавой Орды', wounds: 6, attacks: 5, skill: 4, strength: 5, toughness: 4, ap: 0, damage: 1, save: 5, sprite: 'fang_chief', faction: 'horde' },
  { id: 'ash_cultist', name: 'Налётчик Орды', wounds: 4, attacks: 4, skill: 4, strength: 3, toughness: 3, ap: 0, damage: 1, save: 6, sprite: 'ash_cultist', faction: 'horde' },
  { id: 'plague_hulk', name: 'Титан Роя', wounds: 7, attacks: 4, skill: 4, strength: 5, toughness: 6, ap: 1, damage: 1, save: 5, sprite: 'plague_hulk', faction: 'swarm' },
];

// ---------------------------------------------------------------------------
// Существа «Роя» — кто вылупится из яйца (только внешний вид, награда — по таблице)
// ---------------------------------------------------------------------------

export const SWARM_CREATURES = [
  { minTaps: 0, id: 'dud', name: 'Пустая скорлупа', rarity: 'Ничего' },
  { minTaps: 10, id: 'larva', name: 'Личинка', rarity: 'Обычное' },
  { minTaps: 25, id: 'skitter', name: 'Шнырь', rarity: 'Обычное' },
  { minTaps: 50, id: 'spiker', name: 'Шипохвост', rarity: 'Необычное' },
  { minTaps: 100, id: 'horned_guard', name: 'Рогатый страж', rarity: 'Редкое' },
  { minTaps: 250, id: 'void_stalker', name: 'Пустотный охотник', rarity: 'Эпическое' },
  { minTaps: 500, id: 'brood_queen', name: 'Королева выводка', rarity: 'Легендарное' },
] as const;
