import { apiRequest } from "@/apiUtils/general";

export type MinigameKey = "runner" | "dice" | "egg" | "cards";
export type RewardType =
  | "percent_discount"
  | "fixed_discount"
  | "bonus_points"
  | "badge";

export type RewardTier = {
  minScore: number;
  rewardType: RewardType;
  value: number;
  label?: string;
};

export type RewardStatus = "active" | "used" | "expired";

export type Reward = {
  id: string;
  game: MinigameKey;
  gameTitle: string;
  label: string;
  rewardType: RewardType;
  rewardValue: number;
  code: string;
  score: number;
  status: RewardStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

export type MinigameInfo = {
  key: MinigameKey;
  title: string;
  description: string;
  scoreUnit: string;
  tiers: Array<RewardTier & { label: string }>;
  bestScore: number | null;
  plays: number;
  weekReward: Reward | null;
  cards?: {
    packsPerDay: number;
    cardsPerPack: number;
    rarities: RarityInfo[];
  };
};

// -------------------------- «Легенды Warp Hub» --------------------------

export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type RarityInfo = { rarity: CardRarity; label: string; points: number; chance: number };

export type CardDef = {
  id: string;
  name: string;
  faction: string;
  factionLabel: string;
  rarity: CardRarity;
  rarityLabel: string;
  wounds: number;
  move: number;
  attack: number;
  defence: number;
  strength: number;
  damage: number;
  ability: { name: string; text: string };
};

export type PackCard = CardDef & { points: number; isNew?: boolean };

export type CardsState = {
  enabled: boolean;
  catalog: CardDef[];
  collection: Record<string, number>;
  rarities: RarityInfo[];
  cardsPerPack: number;
  packsPerDay: number;
  packsLeft: number;
  nextPackAt: string | null;
  balance: number;
  packsOpened: number;
  lastPack: { id: string; openedAt: string; points: number; cards: PackCard[] } | null;
};

export type OpenedPack = {
  packId: string;
  points: number;
  cards: PackCard[];
  packsLeft: number;
  balance: number;
  nextPackAt: string | null;
};

export type PointsHistory = {
  balance: number;
  history: Array<{ id: string; delta: number; reason: string; note: string | null; createdAt: string }>;
};

export const getCardsState = () => apiRequest<CardsState>("/minigames/cards");
export const openCardPack = () => apiRequest<OpenedPack>("/minigames/cards/open", { method: "POST" });
export const getMyPoints = () => apiRequest<PointsHistory>("/minigames/points/my");

export type AdminPlayerPoints = {
  id: string;
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  balance: number;
  uniqueCards: number;
  totalCards: number;
};

export const findPlayersPoints = (q: string) =>
  apiRequest<AdminPlayerPoints[]>(`/admin/minigames/points?q=${encodeURIComponent(q)}`);
export const getPlayerPoints = (userId: string) =>
  apiRequest<PointsHistory>(`/admin/minigames/points/${userId}`);
export const adjustPlayerPoints = (userId: string, delta: number, note: string) =>
  apiRequest<{ userId: string; balance: number }>(`/admin/minigames/points/${userId}/adjust`, {
    method: "POST",
    body: JSON.stringify({ delta, note }),
  });

export type Fighter = {
  id: string;
  name: string;
  wounds: number;
  attacks: number;
  skill: number;
  strength: number;
  toughness: number;
  ap: number;
  damage: number;
  save: number;
  sprite: string;
  faction?: "order" | "horde" | "swarm";
};

export type BattleView = {
  player: Fighter;
  playerWounds: number;
  opponent: Fighter;
  opponentWounds: number;
  wins: number;
  clutchWins: number;
  round: number;
  finished: boolean;
  lost: boolean;
};

export type SwarmCreature = {
  minTaps: number;
  id: string;
  name: string;
  rarity: string;
};

export type StartedSession = {
  sessionId: string;
  game: MinigameKey;
  startedAt: string;
  params: { durationSec?: number; creatures?: SwarmCreature[] };
  battle: BattleView | null;
};

export type RewardOutcome = "none" | "new" | "upgraded" | "kept" | "week_used";

export type FinishResult = {
  game: MinigameKey;
  score: number;
  accepted: boolean;
  bestScore: number | null;
  rewardOutcome: RewardOutcome;
  reward: Reward | null;
  earnedLabel: string | null;
};

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

export type DiceExchange = {
  round: number;
  playerAttack: AttackResult;
  enemyAttack: AttackResult | null;
  opponentDefeated: boolean;
  playerDefeated: boolean;
  clutch: boolean;
  nextOpponentId: string | null;
  healed: number;
};

export type DiceActionResult = {
  exchange: DiceExchange | null;
  battle: BattleView;
  result: FinishResult | null;
};

// -------------------------- Игрок --------------------------

export const getMinigames = () => apiRequest<MinigameInfo[]>("/minigames");

export const getMyRewards = () => apiRequest<Reward[]>("/minigames/rewards/my");

export const startMinigame = (game: MinigameKey) =>
  apiRequest<StartedSession>(`/minigames/${game}/sessions`, { method: "POST" });

export const finishMinigame = (sessionId: string, score: number) =>
  apiRequest<FinishResult>(`/minigames/sessions/${sessionId}/finish`, {
    method: "POST",
    body: JSON.stringify({ score }),
  });

export const diceAction = (sessionId: string, action: "roll" | "stop") =>
  apiRequest<DiceActionResult>(
    `/minigames/sessions/${sessionId}/dice/${action}`,
    { method: "POST" },
  );

// -------------------------- Администратор --------------------------

export type AdminReward = Reward & {
  user: {
    id: string;
    telegramId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
  };
};

export type GameSettings<P> = {
  enabled: boolean;
  tiers: RewardTier[];
  params: P;
};

export type MinigameSettings = {
  rewardValidDays: number;
  maxSessionsPerDay: number;
  sessionTtlMinutes: number;
  games: {
    runner: GameSettings<{ maxSpeedMps: number; toleranceMeters: number }>;
    dice: GameSettings<{
      clutchBonusPercent: number;
      clutchThreshold: number;
      healAfterWin: number;
      enemyWoundsPerWin: number;
      enemyAttacksPerWin: number;
    }>;
    egg: GameSettings<{ durationSec: number; maxTapsPerSec: number }>;
    cards: GameSettings<{
      packsPerDay: number;
      cardsPerPack: number;
      guaranteeUncommon: boolean;
      rarities: Record<CardRarity, { weight: number; points: number }>;
    }>;
  };
};

export type MinigameStats = {
  weekKey: string;
  cardPointsLast7Days?: number;
  games: Array<{
    key: MinigameKey;
    title: string;
    playsLast7Days: number;
    rewardsThisWeek: number;
  }>;
  rejectedLast7Days: number;
};

export const findAdminRewards = (filters: {
  code?: string;
  status?: RewardStatus;
}) => {
  const params = new URLSearchParams();
  if (filters.code) params.set("code", filters.code);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return apiRequest<AdminReward[]>(
    `/admin/minigames/rewards${query ? `?${query}` : ""}`,
  );
};

export const redeemAdminReward = (id: string) =>
  apiRequest<AdminReward>(`/admin/minigames/rewards/${id}/redeem`, {
    method: "POST",
  });

export const getMinigameStats = () =>
  apiRequest<MinigameStats>("/admin/minigames/stats");

export const getMinigameSettings = () =>
  apiRequest<MinigameSettings>("/admin/minigames/settings");

export const saveMinigameSettings = (settings: MinigameSettings) =>
  apiRequest<MinigameSettings>("/admin/minigames/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });

// -------------------------- Подписи --------------------------

export const REWARD_STATUS_LABELS: Record<RewardStatus, string> = {
  active: "Активна",
  used: "Использована",
  expired: "Срок истёк",
};

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  percent_discount: "Скидка, %",
  fixed_discount: "Скидка, ₽",
  bonus_points: "Бонусные баллы",
  badge: "Значок",
};

export const GAME_TITLES: Record<MinigameKey, string> = {
  runner: "Зелёный рывок",
  dice: "Кости войны",
  egg: "Рой: инкубатор",
  cards: "Легенды Warp Hub",
};

export const OUTCOME_TEXT: Record<RewardOutcome, string> = {
  none: "",
  new: "Новая награда!",
  upgraded: "Награда этой недели улучшена!",
  kept: "У вас уже есть награда этой недели не хуже — она сохранена.",
  week_used:
    "Награду этой недели вы уже использовали. Новую можно получить со следующего понедельника.",
};
