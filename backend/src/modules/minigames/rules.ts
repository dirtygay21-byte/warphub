/**
 * Чистые правила мини-игр (без БД) — покрыты тестами в tests/minigames-rules.test.ts.
 */
import { bookingConfig } from '../../config/booking';
import { CARD_RARITIES, DEFAULT_CARD_PARAMS, type CardDef, type CardParams, type CardRarity } from '../../config/cards';
import {
  DEFAULT_MINIGAME_SETTINGS,
  MINIGAME_KEYS,
  REWARD_TYPES,
  type DiceParams,
  type EggParams,
  type Fighter,
  type MinigameKey,
  type MinigameSettings,
  type RewardTier,
  type RewardType,
  type RunnerParams,
} from '../../config/minigames';

export type Rng = () => number;

/** Криптостойкий генератор [0, 1) для боевого режима */
export const secureRandom: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 0x1_0000_0000;
};

/** Предсказуемый генератор для тестов */
export function seededRandom(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

export const rollD6 = (rng: Rng) => 1 + Math.floor(rng() * 6);

// ---------------------------------------------------------------------------
// Награды
// ---------------------------------------------------------------------------

export function sortTiers(tiers: RewardTier[]): RewardTier[] {
  return [...tiers].sort((a, b) => a.minScore - b.minScore);
}

/** Лучший уровень награды для результата; rank — номер уровня (1 = самый низкий) */
export function rewardTierFor(
  tiers: RewardTier[],
  score: number,
): { tier: RewardTier; rank: number } | null {
  const sorted = sortTiers(tiers);
  let found: { tier: RewardTier; rank: number } | null = null;
  sorted.forEach((tier, index) => {
    if (score >= tier.minScore) found = { tier, rank: index + 1 };
  });
  return found;
}

export function rewardLabel(type: RewardType, value: number, label?: string) {
  if (label && label.trim()) return label.trim();
  switch (type) {
    case 'percent_discount':
      return `Скидка ${value}%`;
    case 'fixed_discount':
      return `Скидка ${value} ₽`;
    case 'bonus_points':
      return `${value} бонусных баллов`;
    case 'badge':
      return 'Значок клуба';
  }
}

// ---------------------------------------------------------------------------
// Проверка правдоподобности результата (игры, которые идут на телефоне)
// ---------------------------------------------------------------------------

export function maxRunnerDistance(elapsedMs: number, params: RunnerParams) {
  return Math.floor((elapsedMs / 1000) * params.maxSpeedMps + params.toleranceMeters);
}

export function isRunnerScorePlausible(
  distance: number,
  elapsedMs: number,
  params: RunnerParams,
) {
  return (
    Number.isInteger(distance) &&
    distance >= 0 &&
    distance <= maxRunnerDistance(elapsedMs, params)
  );
}

export function maxEggTaps(elapsedMs: number, params: EggParams) {
  const seconds = Math.min(elapsedMs / 1000, params.durationSec + 3);
  return Math.floor(seconds * params.maxTapsPerSec);
}

export function isEggScorePlausible(taps: number, elapsedMs: number, params: EggParams) {
  return Number.isInteger(taps) && taps >= 0 && taps <= maxEggTaps(elapsedMs, params);
}

// ---------------------------------------------------------------------------
// Бой на кубиках: Атака → Попадание → Ранение → Спасбросок/AP → Урон
// ---------------------------------------------------------------------------

/** Значение на кубике для ранения: сравнение Силы и Стойкости */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

/** Нужный спасбросок с учётом пробития; null — спасброска нет */
export function saveTarget(save: number, ap: number): number | null {
  const needed = save + ap;
  return needed > 6 ? null : needed;
}

const success = (roll: number, target: number) =>
  roll !== 1 && (roll === 6 || roll >= target);

export type AttackResult = {
  attacker: string;
  defender: string;
  hitTarget: number;
  hitRolls: number[];
  hits: number;
  woundTarget: number;
  woundRolls: number[];
  wounds: number;
  saveTarget: number | null;
  saveRolls: number[];
  unsaved: number;
  damage: number;
  defenderWoundsLeft: number;
};

export function resolveAttack(
  attacker: Fighter,
  defender: Fighter,
  defenderWounds: number,
  rng: Rng,
): AttackResult {
  const hitRolls = Array.from({ length: attacker.attacks }, () => rollD6(rng));
  const hits = hitRolls.filter((roll) => success(roll, attacker.skill)).length;

  const wTarget = woundTarget(attacker.strength, defender.toughness);
  const woundRolls = Array.from({ length: hits }, () => rollD6(rng));
  const wounds = woundRolls.filter((roll) => success(roll, wTarget)).length;

  const sTarget = saveTarget(defender.save, attacker.ap);
  const saveRolls =
    sTarget === null ? [] : Array.from({ length: wounds }, () => rollD6(rng));
  const saved =
    sTarget === null
      ? 0
      : saveRolls.filter((roll) => roll !== 1 && roll >= sTarget).length;
  const unsaved = wounds - saved;
  const damage = Math.min(defenderWounds, unsaved * attacker.damage);

  return {
    attacker: attacker.id,
    defender: defender.id,
    hitTarget: attacker.skill,
    hitRolls,
    hits,
    woundTarget: wTarget,
    woundRolls,
    wounds,
    saveTarget: sTarget,
    saveRolls,
    unsaved,
    damage,
    defenderWoundsLeft: defenderWounds - damage,
  };
}

export type DiceBattleState = {
  playerId: string;
  playerWounds: number;
  opponentId: string;
  opponentWounds: number;
  wins: number;
  clutchWins: number;
  defeated: string[];
  round: number;
  /** Усиление текущего противника (растёт с каждой победой) */
  escalation: number;
  finished: boolean;
  /** Игрок погиб */
  lost: boolean;
};

export type DiceExchange = {
  round: number;
  playerAttack: AttackResult;
  enemyAttack: AttackResult | null;
  opponentDefeated: boolean;
  playerDefeated: boolean;
  /** Победа «на последнем издыхании» */
  clutch: boolean;
  /** Следующий противник, если текущий побеждён */
  nextOpponentId: string | null;
  healed: number;
};

/** Противник с учётом усиления: +ран и +атак за каждые одержанные победы */
export function boostedEnemy(base: Fighter, escalation: number, params: DiceParams): Fighter {
  return {
    ...base,
    wounds: base.wounds + Math.floor(escalation * params.enemyWoundsPerWin),
    attacks: base.attacks + Math.floor(escalation * params.enemyAttacksPerWin),
  };
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function startDiceBattle(
  players: Fighter[],
  enemies: Fighter[],
  rng: Rng,
): DiceBattleState {
  const player = pickRandom(players, rng);
  const opponent = pickRandom(enemies, rng);
  return {
    playerId: player.id,
    playerWounds: player.wounds,
    opponentId: opponent.id,
    opponentWounds: opponent.wounds,
    wins: 0,
    clutchWins: 0,
    defeated: [],
    round: 0,
    escalation: 0,
    finished: false,
    lost: false,
  };
}

/** Один обмен ударами: игрок атакует, затем противник (если выжил) */
export function playDiceExchange(
  state: DiceBattleState,
  players: Fighter[],
  enemies: Fighter[],
  params: DiceParams,
  rng: Rng,
): { state: DiceBattleState; exchange: DiceExchange } {
  if (state.finished) throw new Error('Battle is finished');
  const player = players.find((f) => f.id === state.playerId)!;
  const opponent = boostedEnemy(
    enemies.find((f) => f.id === state.opponentId)!,
    state.escalation,
    params,
  );
  const next: DiceBattleState = { ...state, defeated: [...state.defeated], round: state.round + 1 };

  const playerAttack = resolveAttack(player, opponent, next.opponentWounds, rng);
  next.opponentWounds = playerAttack.defenderWoundsLeft;

  let enemyAttack: AttackResult | null = null;
  if (next.opponentWounds > 0) {
    enemyAttack = resolveAttack(opponent, player, next.playerWounds, rng);
    next.playerWounds = enemyAttack.defenderWoundsLeft;
  }

  const opponentDefeated = next.opponentWounds <= 0;
  const playerDefeated = next.playerWounds <= 0;
  let clutch = false;
  let nextOpponentId: string | null = null;
  let healed = 0;

  if (opponentDefeated) {
    next.wins += 1;
    next.defeated.push(opponent.id);
    clutch = next.playerWounds <= Math.ceil(player.wounds * params.clutchThreshold);
    if (clutch) next.clutchWins += 1;

    const remaining = enemies.filter((f) => !next.defeated.includes(f.id));
    const pool = remaining.length > 0 ? remaining : enemies;
    const nextOpponent = pickRandom(pool, rng);
    next.escalation = next.wins;
    nextOpponentId = nextOpponent.id;
    next.opponentId = nextOpponent.id;
    next.opponentWounds = boostedEnemy(nextOpponent, next.escalation, params).wounds;

    healed = Math.min(params.healAfterWin, player.wounds - next.playerWounds);
    next.playerWounds += healed;
  }

  if (playerDefeated) {
    next.finished = true;
    next.lost = true;
  }

  return {
    state: next,
    exchange: {
      round: next.round,
      playerAttack,
      enemyAttack,
      opponentDefeated,
      playerDefeated,
      clutch,
      nextOpponentId,
      healed,
    },
  };
}

/** Итоговая награда за бой: по числу побед + бонус за «клатч» */
export function diceRewardFor(
  tiers: RewardTier[],
  wins: number,
  clutchWins: number,
  params: DiceParams,
) {
  const found = rewardTierFor(tiers, wins);
  if (!found) return null;
  if (clutchWins > 0 && found.tier.rewardType === 'percent_discount' && params.clutchBonusPercent > 0) {
    return {
      rank: found.rank,
      tier: {
        ...found.tier,
        value: found.tier.value + params.clutchBonusPercent,
        label: undefined,
      },
      clutchBonus: params.clutchBonusPercent,
    };
  }
  return { ...found, clutchBonus: 0 };
}

// ---------------------------------------------------------------------------
// Неделя (лимит «1 награда в неделю на игру»), коды наград
// ---------------------------------------------------------------------------

/** ISO-неделя по времени клуба, например «2026-W41» */
export function clubWeekKey(date: Date): string {
  const local = new Date(date.getTime() + bookingConfig.timezoneOffsetMinutes * 60_000);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const d = new Date(day);
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRewardCode(rng: Rng = secureRandom): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return `WH-${code}`;
}

export function normalizeRewardCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = clean.startsWith('WH') ? clean.slice(2) : clean;
  return `WH-${body}`;
}

// ---------------------------------------------------------------------------
// Проверка настроек из админки
// ---------------------------------------------------------------------------

export class SettingsValidationError extends Error {}

function num(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new SettingsValidationError(`${field} must be between ${min} and ${max}`);
  }
  return n;
}

function validateTiers(raw: unknown, game: string): RewardTier[] {
  if (!Array.isArray(raw) || raw.length > 20) {
    throw new SettingsValidationError(`${game}: tiers must be a list (max 20)`);
  }
  const tiers = raw.map((item, index) => {
    const t = item as Record<string, unknown>;
    if (!(REWARD_TYPES as readonly unknown[]).includes(t.rewardType)) {
      throw new SettingsValidationError(`${game}: tier ${index + 1} has an invalid reward type`);
    }
    const label = typeof t.label === 'string' ? t.label.trim().slice(0, 60) : undefined;
    return {
      minScore: Math.floor(num(t.minScore, `${game}: tier ${index + 1} minScore`, 0, 1_000_000)),
      rewardType: t.rewardType as RewardType,
      value: num(t.value, `${game}: tier ${index + 1} value`, 0, 100_000),
      ...(label ? { label } : {}),
    };
  });
  const sorted = sortTiers(tiers);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minScore === sorted[i - 1]!.minScore) {
      throw new SettingsValidationError(`${game}: two tiers have the same threshold`);
    }
  }
  for (const tier of sorted) {
    if (tier.rewardType === 'percent_discount' && tier.value > 50) {
      throw new SettingsValidationError(`${game}: a percent discount cannot exceed 50%`);
    }
  }
  return sorted;
}

/** Проверяет и дополняет настройки значениями по умолчанию */
export function validateSettings(raw: unknown): MinigameSettings {
  const d = DEFAULT_MINIGAME_SETTINGS;
  const s = (raw ?? {}) as Record<string, any>;
  const games = (s.games ?? {}) as Record<string, any>;
  const pick = <T>(game: MinigameKey) => (games[game] ?? {}) as Partial<{ enabled: boolean; tiers: unknown; params: Record<string, unknown> }> & T;

  const runner = pick(MINIGAME_KEYS[0]);
  const dice = pick(MINIGAME_KEYS[1]);
  const egg = pick(MINIGAME_KEYS[2]);
  const cards = pick(MINIGAME_KEYS[3]);

  return {
    rewardValidDays: Math.floor(num(s.rewardValidDays ?? d.rewardValidDays, 'rewardValidDays', 1, 365)),
    maxSessionsPerDay: Math.floor(num(s.maxSessionsPerDay ?? d.maxSessionsPerDay, 'maxSessionsPerDay', 1, 1000)),
    sessionTtlMinutes: Math.floor(num(s.sessionTtlMinutes ?? d.sessionTtlMinutes, 'sessionTtlMinutes', 5, 240)),
    games: {
      runner: {
        enabled: runner.enabled ?? d.games.runner.enabled,
        tiers: validateTiers(runner.tiers ?? d.games.runner.tiers, 'runner'),
        params: {
          maxSpeedMps: num(runner.params?.maxSpeedMps ?? d.games.runner.params.maxSpeedMps, 'runner.maxSpeedMps', 5, 200),
          toleranceMeters: num(runner.params?.toleranceMeters ?? d.games.runner.params.toleranceMeters, 'runner.toleranceMeters', 0, 1000),
        },
      },
      dice: {
        enabled: dice.enabled ?? d.games.dice.enabled,
        tiers: validateTiers(dice.tiers ?? d.games.dice.tiers, 'dice'),
        params: {
          clutchBonusPercent: num(dice.params?.clutchBonusPercent ?? d.games.dice.params.clutchBonusPercent, 'dice.clutchBonusPercent', 0, 20),
          clutchThreshold: num(dice.params?.clutchThreshold ?? d.games.dice.params.clutchThreshold, 'dice.clutchThreshold', 0, 1),
          healAfterWin: Math.floor(num(dice.params?.healAfterWin ?? d.games.dice.params.healAfterWin, 'dice.healAfterWin', 0, 10)),
          enemyWoundsPerWin: num(dice.params?.enemyWoundsPerWin ?? d.games.dice.params.enemyWoundsPerWin, 'dice.enemyWoundsPerWin', 0, 10),
          enemyAttacksPerWin: num(dice.params?.enemyAttacksPerWin ?? d.games.dice.params.enemyAttacksPerWin, 'dice.enemyAttacksPerWin', 0, 5),
        },
      },
      egg: {
        enabled: egg.enabled ?? d.games.egg.enabled,
        tiers: validateTiers(egg.tiers ?? d.games.egg.tiers, 'egg'),
        params: {
          durationSec: Math.floor(num(egg.params?.durationSec ?? d.games.egg.params.durationSec, 'egg.durationSec', 5, 120)),
          maxTapsPerSec: num(egg.params?.maxTapsPerSec ?? d.games.egg.params.maxTapsPerSec, 'egg.maxTapsPerSec', 5, 60),
        },
      },
      cards: {
        enabled: cards.enabled ?? d.games.cards.enabled,
        tiers: [],
        params: validateCardParams(cards.params ?? {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// «Легенды Warp Hub»: пакеты карт
// ---------------------------------------------------------------------------

function validateCardParams(raw: Record<string, any>): CardParams {
  const d = DEFAULT_CARD_PARAMS;
  const rarities = {} as CardParams['rarities'];
  for (const r of CARD_RARITIES) {
    const item = (raw.rarities?.[r] ?? {}) as Record<string, unknown>;
    rarities[r] = {
      weight: num(item.weight ?? d.rarities[r].weight, `cards.${r}.weight`, 0, 1000),
      points: Math.floor(num(item.points ?? d.rarities[r].points, `cards.${r}.points`, 0, 100_000)),
    };
  }
  if (CARD_RARITIES.every((r) => rarities[r].weight === 0)) {
    throw new SettingsValidationError('cards: at least one rarity must have a chance above 0');
  }
  return {
    packsPerDay: Math.floor(num(raw.packsPerDay ?? d.packsPerDay, 'cards.packsPerDay', 0, 20)),
    cardsPerPack: Math.floor(num(raw.cardsPerPack ?? d.cardsPerPack, 'cards.cardsPerPack', 1, 10)),
    guaranteeUncommon: typeof raw.guaranteeUncommon === 'boolean' ? raw.guaranteeUncommon : d.guaranteeUncommon,
    rarities,
  };
}

/** Выбор редкости по весам */
export function rollRarity(params: CardParams, rng: Rng, minIndex = 0): CardRarity {
  const pool = CARD_RARITIES.slice(minIndex).filter((r) => params.rarities[r].weight > 0);
  const list = pool.length ? pool : CARD_RARITIES.filter((r) => params.rarities[r].weight > 0);
  const total = list.reduce((sum, r) => sum + params.rarities[r].weight, 0);
  let x = rng() * total;
  for (const r of list) {
    x -= params.rarities[r].weight;
    if (x < 0) return r;
  }
  return list[list.length - 1]!;
}

export type PackCard = { cardId: string; rarity: CardRarity; points: number };

/**
 * Содержимое пакета: редкость по весам, затем случайная карта этой редкости.
 * Если включена гарантия, последняя карта — «Необычная» или выше, когда
 * среди остальных такой не оказалось.
 */
export function rollPack(params: CardParams, catalog: CardDef[], rng: Rng): PackCard[] {
  const byRarity = new Map<CardRarity, CardDef[]>();
  for (const card of catalog) {
    const list = byRarity.get(card.rarity) ?? [];
    list.push(card);
    byRarity.set(card.rarity, list);
  }
  const available = (r: CardRarity) => (byRarity.get(r)?.length ?? 0) > 0;
  const result: PackCard[] = [];
  for (let i = 0; i < params.cardsPerPack; i++) {
    const last = i === params.cardsPerPack - 1;
    const needGuarantee =
      last && params.guaranteeUncommon && params.cardsPerPack > 1 && result.every((c) => c.rarity === 'common');
    let rarity = rollRarity(params, rng, needGuarantee ? 1 : 0);
    if (!available(rarity)) rarity = CARD_RARITIES.find(available)!;
    const options = byRarity.get(rarity)!;
    const card = options[Math.floor(rng() * options.length)]!;
    result.push({ cardId: card.id, rarity, points: params.rarities[rarity].points });
  }
  return result;
}
