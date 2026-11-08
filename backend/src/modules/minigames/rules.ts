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
  blocked?: boolean;
  guaranteed?: boolean;
  selfDamage?: number;
};

export function resolveAttack(
  attacker: Fighter,
  defender: Fighter,
  defenderWounds: number,
  rng: Rng,
  options: { guaranteed?: boolean; blocked?: boolean } = {},
): AttackResult {
  const guaranteed = options.guaranteed ?? false;
  const blocked = options.blocked ?? false;
  const hitRolls = blocked ? [] : Array.from({ length: attacker.attacks }, () => rollD6(rng));
  const hits = blocked ? 0 : guaranteed ? attacker.attacks : hitRolls.filter((roll) => success(roll, attacker.skill)).length;

  const wTarget = woundTarget(attacker.strength, defender.toughness);
  const woundRolls = blocked ? [] : Array.from({ length: hits }, () => rollD6(rng));
  const wounds = blocked ? 0 : guaranteed ? hits : woundRolls.filter((roll) => success(roll, wTarget)).length;

  const sTarget = saveTarget(defender.save, attacker.ap);
  const saveRolls = blocked || guaranteed || sTarget === null ? [] : Array.from({ length: wounds }, () => rollD6(rng));
  const saved = blocked || guaranteed || sTarget === null
    ? 0
    : saveRolls.filter((roll) => roll !== 1 && roll >= sTarget).length;
  const unsaved = blocked ? 0 : wounds - saved;
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
    blocked,
    guaranteed,
  };
}

export type DicePoolEntry = { value: number; used: boolean };
export type DicePools = { player: DicePoolEntry[]; enemy: DicePoolEntry[] };
export type DicePoolAction = 'attack' | 'critical' | 'defend' | 'risk' | 'ult';
export type DiceActionResolution = {
  side: 'player' | 'enemy';
  action: DicePoolAction;
  rollIndex: number | null;
  roll: number | null;
  critical: boolean;
  guaranteed: boolean;
  blocked: boolean;
  blockedByRoll: number | null;
  damage: number;
  selfDamage: number;
  defenderWoundsLeft: number;
};

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
  /** D6 инициативы; null — выбор ещё не сделан */
  initiativeRoll?: number | null;
  /** true — игрок угадал чётность и ходит первым */
  playerStarts?: boolean | null;
  /** Кто выполняет следующее действие */
  turn?: 'player' | 'enemy';
  /** Ультимативная атака уже использована */
  usedUlt?: boolean;
  /** Сторона, выбравшая защиту до следующей атаки (старый движок) */
  defense?: 'player' | 'enemy' | null;
  /** Первая гарантированная атака уже выполнена */
  firstStrikeDone?: boolean;
  /** Видимые пулы кубов текущего раунда */
  pools?: DicePools | null;
  /** Защитный куб и оставшееся число блоков */
  poolDefense?: { side: 'player' | 'enemy'; roll: number; charges: number } | null;
};

export type DiceExchange = {
  round: number;
  playerAttack: AttackResult | null;
  enemyAttack: AttackResult | null;
  opponentDefeated: boolean;
  playerDefeated: boolean;
  /** Победа «на последнем издыхании» */
  clutch: boolean;
  /** Следующий противник, если текущий побеждён */
  nextOpponentId: string | null;
  healed: number;
  action?: 'initiative' | 'attack' | 'defend' | 'risk' | 'ult';
  blocked?: boolean;
  selfDamage?: number;
  initiativeRoll?: number;
  playerStarts?: boolean;
  pools?: DicePools | null;
  playerAction?: DiceActionResolution | null;
  enemyAction?: DiceActionResolution | null;
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
    initiativeRoll: null,
    playerStarts: null,
    turn: 'player',
    usedUlt: false,
    defense: null,
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

// ---------------------------------------------------------------------------
// Пошаговый бой: инициатива, защита, риск и ультимативная атака
// ---------------------------------------------------------------------------

export function resolveDiceInitiative(
  state: DiceBattleState,
  guess: 'even' | 'odd',
  rng: Rng,
): { state: DiceBattleState; exchange: DiceExchange } {
  if (state.initiativeRoll != null) throw new Error('Initiative is already rolled');
  const roll = rollD6(rng);
  const playerStarts = (roll % 2 === 0) === (guess === 'even');
  const next: DiceBattleState = {
    ...state,
    initiativeRoll: roll,
    playerStarts,
    turn: playerStarts ? 'player' : 'enemy',
    defense: null,
  };
  return {
    state: next,
    exchange: {
      round: next.round,
      action: 'initiative',
      initiativeRoll: roll,
      playerStarts,
      playerAttack: null,
      enemyAttack: null,
      opponentDefeated: false,
      playerDefeated: false,
      clutch: false,
      nextOpponentId: null,
      healed: 0,
    },
  };
}

export function playDiceTurn(
  state: DiceBattleState,
  action: 'attack' | 'defend' | 'risk' | 'ult',
  players: Fighter[],
  enemies: Fighter[],
  params: DiceParams,
  rng: Rng,
): { state: DiceBattleState; exchange: DiceExchange } {
  if (state.finished) throw new Error('Battle is finished');
  if (state.initiativeRoll == null) throw new Error('Roll initiative first');
  if (action === 'ult' && state.usedUlt) throw new Error('Ultimate attack is already used');

  const actor = state.turn ?? 'player';
  const player = players.find((f) => f.id === state.playerId)!;
  const opponent = boostedEnemy(enemies.find((f) => f.id === state.opponentId)!, state.escalation, params);
  const attacker = actor === 'player' ? player : opponent;
  const defender = actor === 'player' ? opponent : player;
  const defenderSide = actor === 'player' ? 'enemy' : 'player';
  const next: DiceBattleState = { ...state, defeated: [...state.defeated], round: state.round + 1 };

  if (action === 'defend') {
    next.defense = actor;
    next.turn = defenderSide;
    return {
      state: next,
      exchange: {
        round: next.round,
        action,
        playerAttack: null,
        enemyAttack: null,
        opponentDefeated: false,
        playerDefeated: false,
        clutch: false,
        nextOpponentId: null,
        healed: 0,
      },
    };
  }

  const guaranteed = state.round === 0 || action === 'ult';
  const blocked = state.defense === defenderSide && !guaranteed;
  const attack = resolveAttack(attacker, defender, actor === 'player' ? next.opponentWounds : next.playerWounds, rng, {
    guaranteed,
    blocked,
  });
  const selfDamage = action === 'risk' && !blocked && attack.hitRolls.includes(1) ? 1 : 0;
  attack.selfDamage = selfDamage;

  if (actor === 'player') {
    next.opponentWounds = attack.defenderWoundsLeft;
    next.playerWounds = Math.max(0, next.playerWounds - selfDamage);
  } else {
    next.playerWounds = attack.defenderWoundsLeft;
    next.opponentWounds = Math.max(0, next.opponentWounds - selfDamage);
  }
  next.defense = null;
  next.turn = defenderSide;
  if (action === 'ult') next.usedUlt = true;

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
      action,
      blocked,
      selfDamage,
      playerAttack: actor === 'player' ? attack : null,
      enemyAttack: actor === 'enemy' ? attack : null,
      opponentDefeated,
      playerDefeated,
      clutch,
      nextOpponentId,
      healed,
    },
  };
}

// ---------------------------------------------------------------------------
// Пулы кубов Kill Team: видимые успехи, криты и защитные блоки
// ---------------------------------------------------------------------------

const criticalDamageOf = (fighter: Fighter) => fighter.critDamage ?? fighter.damage + 1;
const clonePools = (pools: DicePools): DicePools => ({
  player: pools.player.map((entry) => ({ ...entry })),
  enemy: pools.enemy.map((entry) => ({ ...entry })),
});

export function createDicePools(
  state: DiceBattleState,
  players: Fighter[],
  enemies: Fighter[],
  params: DiceParams,
  rng: Rng,
): DicePools {
  const player = players.find((fighter) => fighter.id === state.playerId)!;
  const opponent = boostedEnemy(enemies.find((fighter) => fighter.id === state.opponentId)!, state.escalation, params);
  const rollPool = (count: number): DicePoolEntry[] => Array.from({ length: count }, () => ({ value: rollD6(rng), used: false }));
  return { player: rollPool(player.attacks), enemy: rollPool(opponent.attacks) };
}

function attackIndex(pool: DicePoolEntry[], fighter: Fighter, critical: boolean) {
  return pool.findIndex((entry) => !entry.used && (critical ? entry.value === 6 : entry.value !== 6 && success(entry.value, fighter.skill)));
}

function hasAttack(pool: DicePoolEntry[], fighter: Fighter) {
  return attackIndex(pool, fighter, false) >= 0 || attackIndex(pool, fighter, true) >= 0;
}

function defenseIndex(pool: DicePoolEntry[], fighter: Fighter) {
  const candidates = pool
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.used && success(entry.value, fighter.save))
    .sort((a, b) => b.entry.value - a.entry.value);
  return candidates[0]?.index ?? pool.findIndex((entry) => !entry.used);
}

export function chooseEnemyPoolAction(state: DiceBattleState, players: Fighter[], enemies: Fighter[], params: DiceParams): DicePoolAction {
  const opponent = boostedEnemy(enemies.find((fighter) => fighter.id === state.opponentId)!, state.escalation, params);
  const pool = state.pools?.enemy ?? [];
  if (!state.firstStrikeDone) return 'attack';
  if (attackIndex(pool, opponent, true) >= 0) return 'critical';
  if (attackIndex(pool, opponent, false) >= 0) return 'attack';
  return 'defend';
}

export function playDicePoolTurn(
  state: DiceBattleState,
  action: DicePoolAction,
  players: Fighter[],
  enemies: Fighter[],
  params: DiceParams,
  rng: Rng,
): { state: DiceBattleState; exchange: DiceExchange } {
  if (state.finished) throw new Error('Battle is finished');
  if (state.initiativeRoll == null) throw new Error('Roll initiative first');
  if (action === 'ult' && state.usedUlt) throw new Error('Ultimate attack is already used');

  const actor = state.turn ?? 'player';
  const defenderSide = actor === 'player' ? 'enemy' : 'player';
  const player = players.find((fighter) => fighter.id === state.playerId)!;
  const opponent = boostedEnemy(enemies.find((fighter) => fighter.id === state.opponentId)!, state.escalation, params);
  const attacker = actor === 'player' ? player : opponent;
  const defender = actor === 'player' ? opponent : player;
  const next: DiceBattleState = {
    ...state,
    defeated: [...state.defeated],
    pools: state.pools ? clonePools(state.pools) : createDicePools(state, players, enemies, params, rng),
    poolDefense: state.poolDefense ? { ...state.poolDefense } : null,
    firstStrikeDone: state.firstStrikeDone ?? false,
  };
  const pools = next.pools!;
  const actorPool = actor === 'player' ? pools.player : pools.enemy;
  let resolution: DiceActionResolution = {
    side: actor,
    action,
    rollIndex: null,
    roll: null,
    critical: false,
    guaranteed: false,
    blocked: false,
    blockedByRoll: null,
    damage: 0,
    selfDamage: 0,
    defenderWoundsLeft: actor === 'player' ? next.opponentWounds : next.playerWounds,
  };

  if (action === 'defend') {
    const index = defenseIndex(actorPool, defender);
    const entry = index >= 0 ? actorPool[index] : undefined;
    if (entry) entry.used = true;
    const roll = entry?.value ?? null;
    const successful = roll !== null && success(roll, defender.save);
    if (successful) next.poolDefense = { side: actor, roll: roll!, charges: roll === 6 ? 2 : 1 };
    resolution = { ...resolution, rollIndex: index >= 0 ? index : null, roll, blockedByRoll: successful ? roll : null };
    next.turn = defenderSide;
  } else {
    if (action === 'risk') {
      const extra = { value: rollD6(rng), used: false };
      actorPool.push(extra);
      resolution = { ...resolution, rollIndex: actorPool.length - 1, roll: extra.value, selfDamage: extra.value === 1 ? 1 : 0 };
    }
    const critical = action === 'critical' || action === 'ult';
    const guaranteed = !next.firstStrikeDone || action === 'ult';
    let index = attackIndex(actorPool, attacker, critical);
    if (index < 0 && action === 'risk') index = resolution.rollIndex;
    if (index < 0 && guaranteed && action !== 'critical') index = actorPool.findIndex((entry) => !entry.used);
    if (index < 0 && action === 'ult') index = attackIndex(actorPool, attacker, false);
    if (index < 0 && action === 'ult') {
      actorPool.push({ value: 6, used: false });
      index = actorPool.length - 1;
    }
    if (index < 0) throw new Error(critical ? 'No critical dice available' : 'No normal dice available');

    const entry = actorPool[index]!;
    entry.used = true;
    const roll = entry.value;
    const attackSucceeded = guaranteed || success(roll, attacker.skill);
    let blocked = false;
    let blockedByRoll: number | null = null;
    if (attackSucceeded && next.poolDefense && next.poolDefense.side === defenderSide && !guaranteed) {
      blocked = critical ? next.poolDefense.roll === 6 : next.poolDefense.charges > 0;
      if (blocked) {
        blockedByRoll = next.poolDefense.roll;
        next.poolDefense.charges -= 1;
        if (next.poolDefense.charges <= 0) next.poolDefense = null;
      }
    }
    if (action === 'ult') next.poolDefense = null;

    const defenderWounds = actor === 'player' ? next.opponentWounds : next.playerWounds;
    const damage = !attackSucceeded || blocked ? 0 : Math.min(defenderWounds, critical ? criticalDamageOf(attacker) : attacker.damage);
    const selfDamage = blocked ? 0 : resolution.selfDamage;
    if (actor === 'player') {
      next.opponentWounds = Math.max(0, defenderWounds - damage);
      next.playerWounds = Math.max(0, next.playerWounds - selfDamage);
    } else {
      next.playerWounds = Math.max(0, defenderWounds - damage);
      next.opponentWounds = Math.max(0, next.opponentWounds - selfDamage);
    }
    next.firstStrikeDone = true;
    if (action === 'ult') next.usedUlt = true;
    next.turn = defenderSide;
    resolution = {
      ...resolution,
      rollIndex: index,
      roll,
      critical,
      guaranteed,
      blocked,
      blockedByRoll,
      damage,
      selfDamage,
      defenderWoundsLeft: Math.max(0, defenderWounds - damage),
    };
  }

  const finalPools = clonePools(pools);
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
    const remaining = enemies.filter((fighter) => !next.defeated.includes(fighter.id));
    const nextOpponent = pickRandom(remaining.length > 0 ? remaining : enemies, rng);
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

  if (opponentDefeated || playerDefeated) {
    next.pools = null;
    next.poolDefense = null;
    next.turn = 'player';
  } else if (!hasAttack(pools.player, player) && !hasAttack(pools.enemy, opponent)) {
    next.round += 1;
    next.pools = null;
    next.poolDefense = null;
    next.turn = 'player';
  }

  return {
    state: next,
    exchange: {
      round: next.round,
      action,
      blocked: resolution.blocked,
      selfDamage: resolution.selfDamage,
      pools: finalPools,
      playerAction: actor === 'player' ? resolution : null,
      enemyAction: actor === 'enemy' ? resolution : null,
      playerAttack: null,
      enemyAttack: null,
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
