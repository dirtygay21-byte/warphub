import { and, count, desc, eq, gte, isNotNull, isNull, lt, max, sum, type SQL } from 'drizzle-orm';
import { CARD_RARITIES, RARITY_LABELS } from '../../config/cards';
import {
  ENEMY_FIGHTERS,
  MINIGAME_INFO,
  MINIGAME_KEYS,
  PLAYER_FIGHTERS,
  SWARM_CREATURES,
  type MinigameKey,
  type MinigameSettings,
  type RewardTier,
} from '../../config/minigames';
import { db } from '../../db';
import {
  cardPacksTable,
  minigameRewardsTable,
  minigameSessionsTable,
  minigameSettingsTable,
  pointPromoCodesTable,
  usersTable,
} from '../../db/schema';
import { localDateTimeToUtc, toLocalDateParts } from '../booking/rules';
import {
  escapeHtml,
  formatClubDateTime,
  notifyUser,
} from '../notifications/service';
import {
  boostedEnemy,
  clubWeekKey,
  diceRewardFor,
  generateRewardCode,
  isEggScorePlausible,
  isRunnerScorePlausible,
  normalizeRewardCode,
  createDicePools,
  chooseEnemyPoolAction,
  playDicePoolTurn,
  resolveDiceInitiative,
  rewardLabel,
  rewardTierFor,
  secureRandom,
  SettingsValidationError,
  sortTiers,
  startDiceBattle,
  validateSettings,
  type DiceBattleState,
  type DiceExchange,
} from './rules';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MinigameErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_DISABLED'
  | 'DAILY_LIMIT'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_FINISHED'
  | 'WRONG_GAME'
  | 'INVALID_SCORE'
  | 'REWARD_NOT_FOUND'
  | 'REWARD_USED'
  | 'REWARD_EXPIRED'
  | 'INVALID_SETTINGS'
  | 'PACK_LIMIT'
  | 'NOT_ENOUGH_POINTS'
  | 'USER_NOT_FOUND'
  | 'INVALID_INPUT';

export class MinigameError extends Error {
  readonly code: MinigameErrorCode;
  constructor(code: MinigameErrorCode, message: string) {
    super(message);
    this.name = 'MinigameError';
    this.code = code;
  }
}

const SETTINGS_ID = 'global';

export function isMinigameKey(value: string): value is MinigameKey {
  return (MINIGAME_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Настройки
// ---------------------------------------------------------------------------

export async function getMinigameSettings(): Promise<MinigameSettings> {
  const [row] = await db
    .select({ settings: minigameSettingsTable.settings })
    .from(minigameSettingsTable)
    .where(eq(minigameSettingsTable.id, SETTINGS_ID))
    .limit(1);

  if (!row) return validateSettings({});
  try {
    return validateSettings(JSON.parse(row.settings));
  } catch (error) {
    console.warn('[minigames] stored settings are invalid, using defaults', error);
    return validateSettings({});
  }
}

export async function saveMinigameSettings(
  raw: unknown,
  adminUserId: string,
): Promise<MinigameSettings> {
  let settings: MinigameSettings;
  try {
    settings = validateSettings(raw);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      throw new MinigameError('INVALID_SETTINGS', error.message);
    }
    throw error;
  }

  const json = JSON.stringify(settings);
  await db
    .insert(minigameSettingsTable)
    .values({ id: SETTINGS_ID, settings: json, updatedBy: adminUserId })
    .onConflictDoUpdate({
      target: minigameSettingsTable.id,
      set: { settings: json, updatedBy: adminUserId, updatedAt: new Date() },
    });

  return settings;
}

const tierView = (tier: RewardTier) => ({
  minScore: tier.minScore,
  rewardType: tier.rewardType,
  value: tier.value,
  label: rewardLabel(tier.rewardType, tier.value, tier.label),
});

// ---------------------------------------------------------------------------
// Награды
// ---------------------------------------------------------------------------

type RewardRow = typeof minigameRewardsTable.$inferSelect;

export type RewardView = {
  id: string;
  game: MinigameKey;
  gameTitle: string;
  label: string;
  rewardType: string;
  rewardValue: number;
  code: string;
  score: number;
  status: 'active' | 'used' | 'expired';
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

function rewardStatus(row: Pick<RewardRow, 'usedAt' | 'expiresAt'>, now = Date.now()): RewardView['status'] {
  if (row.usedAt) return 'used';
  if (row.expiresAt.getTime() <= now) return 'expired';
  return 'active';
}

export function toRewardView(row: RewardRow): RewardView {
  const game = row.game as MinigameKey;
  return {
    id: row.id,
    game,
    gameTitle: MINIGAME_INFO[game]?.title ?? row.game,
    label: row.label,
    rewardType: row.rewardType,
    rewardValue: row.rewardValue,
    code: row.code,
    score: row.score,
    status: rewardStatus(row),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
  };
}

export type RewardOutcome =
  /** Нет награды за этот результат */
  | 'none'
  /** Новая награда этой недели */
  | 'new'
  /** Награда этой недели улучшена */
  | 'upgraded'
  /** На этой неделе уже есть награда не хуже */
  | 'kept'
  /** Награда этой недели уже использована — новая будет на следующей неделе */
  | 'week_used';

async function grantReward(
  tx: Tx,
  params: {
    userId: string;
    game: MinigameKey;
    sessionId: string;
    score: number;
    tier: RewardTier | null;
    rank: number;
    settings: MinigameSettings;
  },
): Promise<{ outcome: RewardOutcome; reward: RewardRow | null }> {
  if (!params.tier) return { outcome: 'none', reward: null };

  const now = new Date();
  const weekKey = clubWeekKey(now);
  const expiresAt = new Date(now.getTime() + params.settings.rewardValidDays * 86_400_000);
  const label = rewardLabel(params.tier.rewardType, params.tier.value, params.tier.label);

  const [existing] = await tx
    .select()
    .from(minigameRewardsTable)
    .where(
      and(
        eq(minigameRewardsTable.userId, params.userId),
        eq(minigameRewardsTable.game, params.game),
        eq(minigameRewardsTable.weekKey, weekKey),
      ),
    )
    .limit(1)
    .for('update');

  if (!existing) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRewardCode();
      const [created] = await tx
        .insert(minigameRewardsTable)
        .values({
          userId: params.userId,
          game: params.game,
          sessionId: params.sessionId,
          weekKey,
          tierRank: params.rank,
          score: params.score,
          rewardType: params.tier.rewardType,
          rewardValue: params.tier.value,
          label,
          code,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return { outcome: 'new', reward: created };

      // Конфликт: либо совпал код, либо параллельно создана награда недели
      const [raced] = await tx
        .select()
        .from(minigameRewardsTable)
        .where(
          and(
            eq(minigameRewardsTable.userId, params.userId),
            eq(minigameRewardsTable.game, params.game),
            eq(minigameRewardsTable.weekKey, weekKey),
          ),
        )
        .limit(1);
      if (raced) return { outcome: 'kept', reward: raced };
    }
    throw new Error('Could not generate a unique reward code');
  }

  if (existing.usedAt) return { outcome: 'week_used', reward: existing };

  const expired = existing.expiresAt.getTime() <= now.getTime();
  if (existing.tierRank >= params.rank && !expired) {
    return { outcome: 'kept', reward: existing };
  }

  const [updated] = await tx
    .update(minigameRewardsTable)
    .set({
      sessionId: params.sessionId,
      tierRank: params.rank,
      score: params.score,
      rewardType: params.tier.rewardType,
      rewardValue: params.tier.value,
      label,
      expiresAt,
    })
    .where(eq(minigameRewardsTable.id, existing.id))
    .returning();

  return { outcome: 'upgraded', reward: updated! };
}

async function notifyReward(
  userId: string,
  outcome: RewardOutcome,
  reward: RewardRow | null,
) {
  if (!reward || (outcome !== 'new' && outcome !== 'upgraded')) return;
  try {
    const [user] = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const game = reward.game as MinigameKey;
    notifyUser(
      user?.telegramId,
      [
        outcome === 'new'
          ? '🎁 <b>Награда за мини-игру!</b>'
          : '⬆️ <b>Ваша награда улучшена!</b>',
        `${escapeHtml(MINIGAME_INFO[game]?.title ?? game)}: ${escapeHtml(reward.label)}`,
        `Код: <code>${escapeHtml(reward.code)}</code>`,
        `Действует до: ${formatClubDateTime(reward.expiresAt)}`,
        'Покажите код администратору в клубе.',
      ].join('\n'),
    );
  } catch (error) {
    console.warn('[notify] reward notification failed', error);
  }
}

export async function listUserRewards(userId: string): Promise<RewardView[]> {
  const [rows, promos] = await Promise.all([
    db.select().from(minigameRewardsTable).where(eq(minigameRewardsTable.userId, userId)).orderBy(desc(minigameRewardsTable.createdAt)).limit(50),
    db.select().from(pointPromoCodesTable).where(eq(pointPromoCodesTable.userId, userId)).orderBy(desc(pointPromoCodesTable.createdAt)).limit(50),
  ]);
  const promoViews: RewardView[] = promos.map((promo) => ({
    id: promo.id,
    game: 'cards',
    gameTitle: 'Промокод 25K',
    label: promo.label,
    rewardType: 'percent_discount',
    rewardValue: promo.percent,
    code: promo.code,
    score: promo.milestone,
    status: rewardStatus(promo),
    createdAt: promo.createdAt.toISOString(),
    expiresAt: promo.expiresAt.toISOString(),
    usedAt: promo.usedAt?.toISOString() ?? null,
  }));
  return [...rows.map(toRewardView), ...promoViews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Список игр для пользователя
// ---------------------------------------------------------------------------

function clubDayStart(now = new Date()) {
  return localDateTimeToUtc(toLocalDateParts(now), 0, 0);
}

export async function listGamesForUser(userId: string) {
  const settings = await getMinigameSettings();
  const weekKey = clubWeekKey(new Date());

  const stats = await db
    .select({
      game: minigameSessionsTable.game,
      best: max(minigameSessionsTable.score),
      plays: count(),
    })
    .from(minigameSessionsTable)
    .where(
      and(
        eq(minigameSessionsTable.userId, userId),
        eq(minigameSessionsTable.status, 'finished'),
      ),
    )
    .groupBy(minigameSessionsTable.game);

  const weekRewards = await db
    .select()
    .from(minigameRewardsTable)
    .where(
      and(
        eq(minigameRewardsTable.userId, userId),
        eq(minigameRewardsTable.weekKey, weekKey),
      ),
    );

  return MINIGAME_KEYS.filter((key) => settings.games[key].enabled).map((key) => {
    const s = stats.find((row) => row.game === key);
    const reward = weekRewards.find((row) => row.game === key);
    return {
      key,
      ...MINIGAME_INFO[key],
      tiers: sortTiers(settings.games[key].tiers).map(tierView),
      bestScore: s?.best ?? null,
      plays: Number(s?.plays ?? 0),
      weekReward: reward ? toRewardView(reward) : null,
      ...(key === 'cards' ? { cards: cardsSummary(settings) } : {}),
    };
  });
}

/** Для карточки игры в списке: очки и шансы по редкостям */
function cardsSummary(settings: MinigameSettings) {
  const params = settings.games.cards.params;
  const total = CARD_RARITIES.reduce((s, r) => s + params.rarities[r].weight, 0) || 1;
  return {
    packsPerDay: params.packsPerDay,
    cardsPerPack: params.cardsPerPack,
    rarities: CARD_RARITIES.map((r) => ({
      rarity: r,
      label: RARITY_LABELS[r],
      points: params.rarities[r].points,
      chance: Math.round((params.rarities[r].weight / total) * 1000) / 10,
    })),
  };
}

// ---------------------------------------------------------------------------
// Попытки
// ---------------------------------------------------------------------------

function fighterView(fighter: (typeof PLAYER_FIGHTERS)[number]) {
  return {
    id: fighter.id,
    name: fighter.name,
    wounds: fighter.wounds,
    attacks: fighter.attacks,
    skill: fighter.skill,
    strength: fighter.strength,
    toughness: fighter.toughness,
    ap: fighter.ap,
    damage: fighter.damage,
    save: fighter.save,
    sprite: fighter.sprite,
    faction: fighter.faction,
  };
}

function battleView(state: DiceBattleState, settings: MinigameSettings) {
  const player = PLAYER_FIGHTERS.find((f) => f.id === state.playerId)!;
  const opponent = boostedEnemy(
    ENEMY_FIGHTERS.find((f) => f.id === state.opponentId)!,
    state.escalation,
    settings.games.dice.params,
  );
  return {
    player: fighterView(player),
    playerWounds: state.playerWounds,
    opponent: fighterView(opponent),
    opponentWounds: state.opponentWounds,
    wins: state.wins,
    clutchWins: state.clutchWins,
    round: state.round,
    finished: state.finished,
    lost: state.lost,
    initiativeRoll: state.initiativeRoll ?? null,
    playerStarts: state.playerStarts ?? null,
    turn: state.turn ?? 'player',
    usedUlt: state.usedUlt ?? false,
    firstStrikeDone: state.firstStrikeDone ?? false,
    pools: state.pools ?? null,
  };
}

export async function startSession(userId: string, game: string) {
  if (!isMinigameKey(game)) {
    throw new MinigameError('GAME_NOT_FOUND', 'Game not found');
  }
  if (game === 'cards') {
    throw new MinigameError('WRONG_GAME', 'Card packs are opened with /minigames/cards/open');
  }
  const settings = await getMinigameSettings();
  if (!settings.games[game].enabled) {
    throw new MinigameError('GAME_DISABLED', 'This game is turned off');
  }

  const [today] = await db
    .select({ value: count() })
    .from(minigameSessionsTable)
    .where(
      and(
        eq(minigameSessionsTable.userId, userId),
        eq(minigameSessionsTable.game, game),
        gte(minigameSessionsTable.startedAt, clubDayStart()),
      ),
    );
  if (Number(today?.value ?? 0) >= settings.maxSessionsPerDay) {
    throw new MinigameError('DAILY_LIMIT', 'Daily attempt limit reached');
  }

  const state =
    game === 'dice'
      ? startDiceBattle(PLAYER_FIGHTERS, ENEMY_FIGHTERS, secureRandom)
      : null;

  const [session] = await db
    .insert(minigameSessionsTable)
    .values({
      userId,
      game,
      state: state ? JSON.stringify(state) : null,
    })
    .returning();

  return {
    sessionId: session!.id,
    game,
    startedAt: session!.startedAt.toISOString(),
    params:
      game === 'egg'
        ? {
            durationSec: settings.games.egg.params.durationSec,
            creatures: SWARM_CREATURES,
          }
        : {},
    battle: state ? battleView(state, settings) : null,
  };
}

type SessionRow = typeof minigameSessionsTable.$inferSelect;

async function lockOpenSession(
  tx: Tx,
  userId: string,
  sessionId: string,
  game: MinigameKey | MinigameKey[],
  settings: MinigameSettings,
): Promise<SessionRow> {
  const [session] = await tx
    .select()
    .from(minigameSessionsTable)
    .where(
      and(
        eq(minigameSessionsTable.id, sessionId),
        eq(minigameSessionsTable.userId, userId),
      ),
    )
    .limit(1)
    .for('update');

  if (!session) throw new MinigameError('SESSION_NOT_FOUND', 'Attempt not found');
  const games = Array.isArray(game) ? game : [game];
  if (!games.includes(session.game as MinigameKey)) {
    throw new MinigameError('WRONG_GAME', 'This attempt belongs to another game');
  }
  if (session.status !== 'started') {
    throw new MinigameError('SESSION_FINISHED', 'This attempt is already finished');
  }
  const ttlMs = settings.sessionTtlMinutes * 60_000;
  if (Date.now() - session.startedAt.getTime() > ttlMs) {
    await tx
      .update(minigameSessionsTable)
      .set({ status: 'rejected', rejectReason: 'expired', finishedAt: new Date() })
      .where(eq(minigameSessionsTable.id, session.id));
    throw new MinigameError('SESSION_EXPIRED', 'This attempt has expired');
  }
  return session;
}

export type FinishResult = {
  game: MinigameKey;
  score: number;
  accepted: boolean;
  bestScore: number | null;
  rewardOutcome: RewardOutcome;
  reward: RewardView | null;
  /** Какой уровень награды дал бы этот результат (для экрана итогов) */
  earnedLabel: string | null;
};

async function bestScore(userId: string, game: MinigameKey) {
  const [row] = await db
    .select({ best: max(minigameSessionsTable.score) })
    .from(minigameSessionsTable)
    .where(
      and(
        eq(minigameSessionsTable.userId, userId),
        eq(minigameSessionsTable.game, game),
        eq(minigameSessionsTable.status, 'finished'),
      ),
    );
  return row?.best ?? null;
}

/** «Зелёный рывок» и «Рой»: телефон присылает результат, сервер проверяет */
export async function finishScoreSession(
  userId: string,
  sessionId: string,
  rawScore: unknown,
): Promise<FinishResult> {
  const settings = await getMinigameSettings();
  const score = Number(rawScore);

  const result = await db.transaction(async (tx) => {
    const session = await lockOpenSession(tx, userId, sessionId, ['runner', 'egg'], settings);
    const game = session.game as 'runner' | 'egg';
    const elapsedMs = Date.now() - session.startedAt.getTime();

    const plausible =
      game === 'runner'
        ? isRunnerScorePlausible(score, elapsedMs, settings.games.runner.params)
        : isEggScorePlausible(score, elapsedMs, settings.games.egg.params);

    if (!plausible) {
      await tx
        .update(minigameSessionsTable)
        .set({
          status: 'rejected',
          rejectReason: 'implausible',
          score: Number.isFinite(score) ? Math.trunc(score) : null,
          finishedAt: new Date(),
        })
        .where(eq(minigameSessionsTable.id, session.id));
      return { game, accepted: false as const };
    }

    const found = rewardTierFor(settings.games[game].tiers, score);
    const granted = await grantReward(tx, {
      userId,
      game,
      sessionId: session.id,
      score,
      tier: found?.tier ?? null,
      rank: found?.rank ?? 0,
      settings,
    });

    await tx
      .update(minigameSessionsTable)
      .set({
        status: 'finished',
        score,
        finishedAt: new Date(),
        rewardId: granted.reward?.id ?? null,
      })
      .where(eq(minigameSessionsTable.id, session.id));

    return {
      game,
      accepted: true as const,
      granted,
      earnedLabel: found
        ? rewardLabel(found.tier.rewardType, found.tier.value, found.tier.label)
        : null,
    };
  });

  if (!result.accepted) {
    throw new MinigameError(
      'INVALID_SCORE',
      'The result does not match the time played and was not counted',
    );
  }

  void notifyReward(userId, result.granted.outcome, result.granted.reward);

  return {
    game: result.game,
    score,
    accepted: true,
    bestScore: await bestScore(userId, result.game),
    rewardOutcome: result.granted.outcome,
    reward: result.granted.reward ? toRewardView(result.granted.reward) : null,
    earnedLabel: result.earnedLabel,
  };
}

/** «Кости войны»: все броски делает сервер */
export async function diceAction(
  userId: string,
  sessionId: string,
  action: 'initiative_even' | 'initiative_odd' | 'attack' | 'critical' | 'defend' | 'risk' | 'ult' | 'roll' | 'stop',
): Promise<{
  exchange: DiceExchange | null;
  battle: ReturnType<typeof battleView>;
  result: FinishResult | null;
}> {
  const settings = await getMinigameSettings();
  const params = settings.games.dice.params;

  const outcome = await db.transaction(async (tx) => {
    const session = await lockOpenSession(tx, userId, sessionId, 'dice', settings);
    let state = JSON.parse(session.state ?? 'null') as DiceBattleState;
    let exchange: DiceExchange | null = null;

    if (action === 'roll' && state.initiativeRoll == null) {
      const legacyInitiative = resolveDiceInitiative(state, 'even', secureRandom);
      state = legacyInitiative.state;
      state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, secureRandom);
      exchange = legacyInitiative.exchange;
    }

    if (action === 'initiative_even' || action === 'initiative_odd') {
      const played = resolveDiceInitiative(state, action === 'initiative_even' ? 'even' : 'odd', secureRandom);
      state = played.state;
      state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, secureRandom);
      exchange = played.exchange;
    } else if (action !== 'stop') {
      const played = playDicePoolTurn(state, action === 'roll' ? 'attack' : action, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, secureRandom);
      state = played.state;
      exchange = played.exchange;
    } else {
      state = { ...state, finished: true };
    }

    if (action !== 'stop' && !state.finished && state.turn === 'enemy') {
      const enemyAction = chooseEnemyPoolAction(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params);
      const enemyTurn = playDicePoolTurn(state, enemyAction, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, secureRandom);
      state = enemyTurn.state;
      if (exchange) {
        exchange = {
          ...enemyTurn.exchange,
          action: exchange.action,
          initiativeRoll: exchange.initiativeRoll ?? enemyTurn.exchange.initiativeRoll,
          playerStarts: exchange.playerStarts ?? enemyTurn.exchange.playerStarts,
          playerAction: exchange.playerAction ?? enemyTurn.exchange.playerAction,
          enemyAction: enemyTurn.exchange.enemyAction ?? exchange.enemyAction,
          pools: enemyTurn.exchange.pools ?? exchange.pools ?? null,
          opponentDefeated: exchange.opponentDefeated || enemyTurn.exchange.opponentDefeated,
          playerDefeated: exchange.playerDefeated || enemyTurn.exchange.playerDefeated,
          clutch: exchange.clutch || enemyTurn.exchange.clutch,
          nextOpponentId: enemyTurn.exchange.nextOpponentId ?? exchange.nextOpponentId,
          healed: exchange.healed + enemyTurn.exchange.healed,
          selfDamage: (exchange.selfDamage ?? 0) + (enemyTurn.exchange.selfDamage ?? 0),
        };
      }
    }
    if (!state.finished && state.pools === null) {
      state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, params, secureRandom);
    }

    if (!state.finished) {
      await tx
        .update(minigameSessionsTable)
        .set({ state: JSON.stringify(state) })
        .where(eq(minigameSessionsTable.id, session.id));
      return { state, exchange, granted: null, earnedLabel: null };
    }

    // Поражение = награды за эту попытку нет («рискнуть или забрать»)
    const found = state.lost
      ? null
      : diceRewardFor(settings.games.dice.tiers, state.wins, state.clutchWins, params);
    const granted = await grantReward(tx, {
      userId,
      game: 'dice',
      sessionId: session.id,
      score: state.wins,
      tier: found?.tier ?? null,
      rank: found ? found.rank * 10 + (found.clutchBonus > 0 ? 1 : 0) : 0,
      settings,
    });

    await tx
      .update(minigameSessionsTable)
      .set({
        status: 'finished',
        state: JSON.stringify(state),
        score: state.wins,
        finishedAt: new Date(),
        rewardId: granted.reward?.id ?? null,
      })
      .where(eq(minigameSessionsTable.id, session.id));

    return {
      state,
      exchange,
      granted,
      earnedLabel: found
        ? rewardLabel(found.tier.rewardType, found.tier.value, found.tier.label)
        : null,
    };
  });

  let result: FinishResult | null = null;
  if (outcome.granted) {
    void notifyReward(userId, outcome.granted.outcome, outcome.granted.reward);
    result = {
      game: 'dice',
      score: outcome.state.wins,
      accepted: true,
      bestScore: await bestScore(userId, 'dice'),
      rewardOutcome: outcome.granted.outcome,
      reward: outcome.granted.reward ? toRewardView(outcome.granted.reward) : null,
      earnedLabel: outcome.earnedLabel,
    };
  }

  return { exchange: outcome.exchange, battle: battleView(outcome.state, settings), result };
}

// ---------------------------------------------------------------------------
// Администратор
// ---------------------------------------------------------------------------

export type AdminRewardView = RewardView & {
  user: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
};

async function adminRewardRows(where: SQL | undefined, limit = 100) {
  const rows = await db
    .select({ reward: minigameRewardsTable, user: usersTable })
    .from(minigameRewardsTable)
    .innerJoin(usersTable, eq(minigameRewardsTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(minigameRewardsTable.updatedAt))
    .limit(limit);

  return rows.map(
    (row): AdminRewardView => ({
      ...toRewardView(row.reward),
      user: {
        id: row.user.id,
        telegramId: row.user.telegramId,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        username: row.user.username,
      },
    }),
  );
}

export async function adminFindRewards(filters: {
  code?: string;
  status?: 'active' | 'used' | 'expired';
}) {
  const now = new Date();
  const conditions: SQL[] = [];
  if (filters.code) {
    conditions.push(eq(minigameRewardsTable.code, normalizeRewardCode(filters.code)));
  }
  if (filters.status === 'used') conditions.push(isNotNull(minigameRewardsTable.usedAt));
  if (filters.status === 'active') {
    conditions.push(isNull(minigameRewardsTable.usedAt), gte(minigameRewardsTable.expiresAt, now));
  }
  if (filters.status === 'expired') {
    conditions.push(isNull(minigameRewardsTable.usedAt), lt(minigameRewardsTable.expiresAt, now));
  }
  return adminRewardRows(conditions.length ? and(...conditions) : undefined);
}

export async function adminFindPointPromos(filters: { code?: string; status?: 'active' | 'used' | 'expired' }) {
  const now = new Date();
  const conditions: SQL[] = [];
  if (filters.code) conditions.push(eq(pointPromoCodesTable.code, normalizeRewardCode(filters.code)));
  if (filters.status === 'used') conditions.push(isNotNull(pointPromoCodesTable.usedAt));
  if (filters.status === 'active') conditions.push(isNull(pointPromoCodesTable.usedAt), gte(pointPromoCodesTable.expiresAt, now));
  if (filters.status === 'expired') conditions.push(isNull(pointPromoCodesTable.usedAt), lt(pointPromoCodesTable.expiresAt, now));
  const rows = await db
    .select({ promo: pointPromoCodesTable, user: usersTable })
    .from(pointPromoCodesTable)
    .innerJoin(usersTable, eq(pointPromoCodesTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(pointPromoCodesTable.createdAt))
    .limit(100);
  return rows.map((row): AdminRewardView => ({
    id: row.promo.id,
    game: 'cards',
    gameTitle: 'Промокод 25K',
    label: row.promo.label,
    rewardType: 'percent_discount',
    rewardValue: row.promo.percent,
    code: row.promo.code,
    score: row.promo.milestone,
    status: rewardStatus(row.promo),
    createdAt: row.promo.createdAt.toISOString(),
    expiresAt: row.promo.expiresAt.toISOString(),
    usedAt: row.promo.usedAt?.toISOString() ?? null,
    user: {
      id: row.user.id,
      telegramId: row.user.telegramId,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      username: row.user.username,
    },
  }));
}

export async function redeemReward(rewardId: string, adminUserId: string) {
  const [row] = await db
    .select()
    .from(minigameRewardsTable)
    .where(eq(minigameRewardsTable.id, rewardId))
    .limit(1);

  if (!row) throw new MinigameError('REWARD_NOT_FOUND', 'Reward not found');
  if (row.usedAt) throw new MinigameError('REWARD_USED', 'This reward has already been used');
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new MinigameError('REWARD_EXPIRED', 'This reward has expired');
  }

  const [updated] = await db
    .update(minigameRewardsTable)
    .set({ usedAt: new Date(), usedBy: adminUserId })
    .where(and(eq(minigameRewardsTable.id, rewardId), isNull(minigameRewardsTable.usedAt)))
    .returning();
  if (!updated) throw new MinigameError('REWARD_USED', 'This reward has already been used');

  void (async () => {
    const [user] = await db
      .select({ telegramId: usersTable.telegramId })
      .from(usersTable)
      .where(eq(usersTable.id, updated.userId))
      .limit(1);
    notifyUser(
      user?.telegramId,
      `✅ Награда <b>${escapeHtml(updated.label)}</b> (код ${escapeHtml(updated.code)}) использована. Спасибо, что играете!`,
    );
  })().catch((error) => console.warn('[notify] redeem notification failed', error));

  return (await adminRewardRows(eq(minigameRewardsTable.id, rewardId), 1))[0]!;
}

export async function adminMinigameStats() {
  const weekKey = clubWeekKey(new Date());
  const plays = await db
    .select({ game: minigameSessionsTable.game, value: count() })
    .from(minigameSessionsTable)
    .where(gte(minigameSessionsTable.startedAt, new Date(Date.now() - 7 * 86_400_000)))
    .groupBy(minigameSessionsTable.game);
  const rewards = await db
    .select({ game: minigameRewardsTable.game, value: count() })
    .from(minigameRewardsTable)
    .where(eq(minigameRewardsTable.weekKey, weekKey))
    .groupBy(minigameRewardsTable.game);
  const rejected = await db
    .select({ value: count() })
    .from(minigameSessionsTable)
    .where(
      and(
        eq(minigameSessionsTable.status, 'rejected'),
        eq(minigameSessionsTable.rejectReason, 'implausible'),
        gte(minigameSessionsTable.startedAt, new Date(Date.now() - 7 * 86_400_000)),
      ),
    );

  const [packs] = await db
    .select({ value: count(), points: sum(cardPacksTable.points) })
    .from(cardPacksTable)
    .where(gte(cardPacksTable.openedAt, new Date(Date.now() - 7 * 86_400_000)));

  return {
    weekKey,
    cardPointsLast7Days: Number(packs?.points ?? 0),
    games: MINIGAME_KEYS.map((key) => ({
      key,
      title: MINIGAME_INFO[key].title,
      playsLast7Days:
        key === 'cards' ? Number(packs?.value ?? 0) : Number(plays.find((p) => p.game === key)?.value ?? 0),
      rewardsThisWeek: Number(rewards.find((r) => r.game === key)?.value ?? 0),
    })),
    rejectedLast7Days: Number(rejected[0]?.value ?? 0),
  };
}

