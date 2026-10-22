/**
 * Мини-игры в демо: те же правила, что на настоящем сервере
 * (код правил берётся из backend/src — алиас @wh-backend в build-demo.sh).
 * Данные живут в памяти страницы.
 */
import {
  DEFAULT_MINIGAME_SETTINGS,
  ENEMY_FIGHTERS,
  MINIGAME_INFO,
  MINIGAME_KEYS,
  PLAYER_FIGHTERS,
  SWARM_CREATURES,
  type MinigameKey,
  type MinigameSettings,
} from "@wh-backend/config/minigames";
import { CARD_CATALOG, CARD_FACTIONS, CARD_RARITIES, RARITY_LABELS, type CardDef } from "@wh-backend/config/cards";
import {
  rollPack,
  boostedEnemy,
  clubWeekKey,
  diceRewardFor,
  generateRewardCode,
  isEggScorePlausible,
  isRunnerScorePlausible,
  normalizeRewardCode,
  playDiceExchange,
  rewardLabel,
  rewardTierFor,
  secureRandom,
  sortTiers,
  startDiceBattle,
  validateSettings,
  type DiceBattleState,
} from "@wh-backend/modules/minigames/rules";

type Result = { status?: number; body: unknown };

let settings: MinigameSettings = validateSettings(DEFAULT_MINIGAME_SETTINGS);
type Session = { id: string; game: MinigameKey; startedAt: number; state: DiceBattleState | null; done: boolean; score?: number };
const sessions = new Map<string, Session>();
type Reward = {
  id: string; game: MinigameKey; weekKey: string; rank: number; score: number;
  rewardType: string; rewardValue: number; label: string; code: string;
  createdAt: string; expiresAt: string; usedAt: string | null;
};
const now = Date.now();
const rewards: Reward[] = [
  // пример уже выданной награды
  { id: "r-demo", game: "runner", weekKey: clubWeekKey(new Date()), rank: 1, score: 640, rewardType: "percent_discount", rewardValue: 2, label: "Скидка 2%", code: "WH-DEMO42", createdAt: new Date(now - 86_400_000).toISOString(), expiresAt: new Date(now + 13 * 86_400_000).toISOString(), usedAt: null },
];

const status = (r: Reward) => (r.usedAt ? "used" : Date.parse(r.expiresAt) <= Date.now() ? "expired" : "active");
const view = (r: Reward) => ({
  id: r.id, game: r.game, gameTitle: MINIGAME_INFO[r.game].title, label: r.label, rewardType: r.rewardType,
  rewardValue: r.rewardValue, code: r.code, score: r.score, status: status(r), createdAt: r.createdAt,
  expiresAt: r.expiresAt, usedAt: r.usedAt,
});
const demoUser = { id: "demo", telegramId: 1, firstName: "Демо", lastName: null, username: "demo" };
const adminView = (r: Reward) => ({ ...view(r), user: demoUser });

const fighter = (f: (typeof PLAYER_FIGHTERS)[number]) => ({ ...f });
function battleView(s: DiceBattleState) {
  return {
    player: fighter(PLAYER_FIGHTERS.find((f) => f.id === s.playerId)!),
    playerWounds: s.playerWounds,
    opponent: fighter(boostedEnemy(ENEMY_FIGHTERS.find((f) => f.id === s.opponentId)!, s.escalation, settings.games.dice.params)),
    opponentWounds: s.opponentWounds,
    wins: s.wins, clutchWins: s.clutchWins, round: s.round, finished: s.finished, lost: s.lost,
  };
}

function grant(game: MinigameKey, score: number, tier: { rewardType: string; value: number; label?: string } | null, rank: number) {
  if (!tier) return { outcome: "none", reward: null as Reward | null };
  const weekKey = clubWeekKey(new Date());
  const label = rewardLabel(tier.rewardType as never, tier.value, tier.label);
  const expiresAt = new Date(Date.now() + settings.rewardValidDays * 86_400_000).toISOString();
  const existing = rewards.find((r) => r.game === game && r.weekKey === weekKey);
  if (!existing) {
    const r: Reward = { id: crypto.randomUUID(), game, weekKey, rank, score, rewardType: tier.rewardType, rewardValue: tier.value, label, code: generateRewardCode(), createdAt: new Date().toISOString(), expiresAt, usedAt: null };
    rewards.unshift(r);
    return { outcome: "new", reward: r };
  }
  if (existing.usedAt) return { outcome: "week_used", reward: existing };
  if (existing.rank >= rank && status(existing) === "active") return { outcome: "kept", reward: existing };
  Object.assign(existing, { rank, score, rewardType: tier.rewardType, rewardValue: tier.value, label, expiresAt });
  return { outcome: "upgraded", reward: existing };
}

const best = (game: MinigameKey) => {
  const scores = [...sessions.values()].filter((s) => s.game === game && s.done && s.score !== undefined).map((s) => s.score!);
  return scores.length ? Math.max(...scores) : null;
};

function finishResult(game: MinigameKey, score: number, g: { outcome: string; reward: Reward | null }, earned: string | null) {
  return { game, score, accepted: true, bestScore: best(game), rewardOutcome: g.outcome, reward: g.reward ? view(g.reward) : null, earnedLabel: earned };
}

// ---- «Легенды Warp Hub» в демо: пакеты, коллекция, очки (в памяти) ----
const cardView = (c: CardDef) => ({ ...c, factionLabel: CARD_FACTIONS[c.faction], rarityLabel: RARITY_LABELS[c.rarity] });
const CARD_BY_ID = new Map(CARD_CATALOG.map((c) => [c.id, c]));
const DEMO_PACKS_PER_DAY = 3; // в демо можно открыть побольше
const collection: Record<string, number> = { dawn_spear: 1, clan_gate: 2, grove_wolf: 1 };
const ledger: Array<{ id: string; delta: number; reason: string; note: string | null; createdAt: string }> = [
  { id: "l0", delta: 1200, reason: "card_pack", note: "Пакет карт: 5 шт.", createdAt: new Date(Date.now() - 86_400_000).toISOString() },
];
let packsToday = 0;
let packsOpened = 1;
const balance = () => ledger.reduce((s, l) => s + l.delta, 0);
const nextMidnight = () => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
};
function rarityTable() {
  const params = settings.games.cards.params;
  const total = CARD_RARITIES.reduce((s, r) => s + params.rarities[r].weight, 0) || 1;
  return CARD_RARITIES.map((r) => ({
    rarity: r, label: RARITY_LABELS[r], points: params.rarities[r].points,
    chance: Math.round((params.rarities[r].weight / total) * 1000) / 10,
  }));
}
function cardsState() {
  const left = Math.max(0, DEMO_PACKS_PER_DAY - packsToday);
  const params = settings.games.cards.params;
  return {
    enabled: settings.games.cards.enabled, catalog: CARD_CATALOG.map(cardView), collection: { ...collection },
    rarities: rarityTable(), cardsPerPack: params.cardsPerPack, packsPerDay: DEMO_PACKS_PER_DAY,
    packsLeft: left, nextPackAt: left > 0 ? null : nextMidnight(), balance: balance(), packsOpened, lastPack: null,
  };
}

export function handleMinigames(method: string, path: string, q: URLSearchParams, body: any): Result | null {
  let m: RegExpMatchArray | null;
  if (method === "GET" && path === "/minigames/cards") return { body: cardsState() };
  if (method === "POST" && path === "/minigames/cards/open") {
    if (packsToday >= DEMO_PACKS_PER_DAY) return { status: 409, body: { error: "No packs left today" } };
    const cards = rollPack(settings.games.cards.params, CARD_CATALOG, secureRandom);
    const points = cards.reduce((s, c) => s + c.points, 0);
    const seen = new Set<string>();
    const view = cards.map((c) => {
      const isNew = !collection[c.cardId] && !seen.has(c.cardId);
      seen.add(c.cardId);
      return { ...cardView(CARD_BY_ID.get(c.cardId)!), points: c.points, isNew };
    });
    for (const c of cards) collection[c.cardId] = (collection[c.cardId] ?? 0) + 1;
    ledger.unshift({ id: crypto.randomUUID(), delta: points, reason: "card_pack", note: `Пакет карт: ${cards.length} шт.`, createdAt: new Date().toISOString() });
    packsToday += 1;
    packsOpened += 1;
    const left = DEMO_PACKS_PER_DAY - packsToday;
    return { body: { packId: crypto.randomUUID(), points, cards: view, packsLeft: left, balance: balance(), nextPackAt: left > 0 ? null : nextMidnight() } };
  }
  if (method === "GET" && path === "/minigames/points/my") return { body: { balance: balance(), history: ledger } };
  if (method === "GET" && path === "/admin/minigames/points") {
    return { body: [{ ...demoUser, balance: balance(), uniqueCards: Object.keys(collection).length, totalCards: Object.values(collection).reduce((a, b) => a + b, 0) }] };
  }
  if (method === "GET" && (m = path.match(/^\/admin\/minigames\/points\/([^/]+)$/))) return { body: { balance: balance(), history: ledger } };
  if (method === "POST" && (m = path.match(/^\/admin\/minigames\/points\/([^/]+)\/adjust$/))) {
    const delta = Math.trunc(Number(body.delta));
    if (!delta) return { status: 400, body: { error: "Invalid input" } };
    if (balance() + delta < 0) return { status: 400, body: { error: "Not enough points" } };
    ledger.unshift({ id: crypto.randomUUID(), delta, reason: delta < 0 ? "admin_spend" : "admin_add", note: body.note || null, createdAt: new Date().toISOString() });
    return { body: { userId: m[1], balance: balance() } };
  }
  if (method === "GET" && path === "/minigames") {
    return {
      body: MINIGAME_KEYS.filter((k) => settings.games[k].enabled).map((k) => ({
        key: k, ...MINIGAME_INFO[k],
        tiers: sortTiers(settings.games[k].tiers).map((t) => ({ ...t, label: rewardLabel(t.rewardType, t.value, t.label) })),
        bestScore: best(k), plays: [...sessions.values()].filter((s) => s.game === k && s.done).length,
        weekReward: (() => { const r = rewards.find((x) => x.game === k && x.weekKey === clubWeekKey(new Date())); return r ? view(r) : null; })(),
        ...(k === "cards" ? { cards: { packsPerDay: DEMO_PACKS_PER_DAY, cardsPerPack: settings.games.cards.params.cardsPerPack, rarities: rarityTable() } } : {}),
      })),
    };
  }
  if (method === "GET" && path === "/minigames/rewards/my") return { body: rewards.map(view) };
  if (method === "POST" && (m = path.match(/^\/minigames\/(runner|dice|egg)\/sessions$/))) {
    const game = m[1] as MinigameKey;
    const state = game === "dice" ? startDiceBattle(PLAYER_FIGHTERS, ENEMY_FIGHTERS, secureRandom) : null;
    const s: Session = { id: crypto.randomUUID(), game, startedAt: Date.now(), state, done: false };
    sessions.set(s.id, s);
    return {
      body: {
        sessionId: s.id, game, startedAt: new Date(s.startedAt).toISOString(),
        params: game === "egg" ? { durationSec: settings.games.egg.params.durationSec, creatures: SWARM_CREATURES } : {},
        battle: state ? battleView(state) : null,
      },
    };
  }
  if (method === "POST" && (m = path.match(/^\/minigames\/sessions\/([^/]+)\/finish$/))) {
    const s = sessions.get(m[1]!);
    if (!s || s.done || s.game === "dice") return { status: 409, body: { error: "This attempt is already finished" } };
    const score = Number(body.score);
    const elapsed = Date.now() - s.startedAt;
    const ok = s.game === "runner" ? isRunnerScorePlausible(score, elapsed, settings.games.runner.params) : isEggScorePlausible(score, elapsed, settings.games.egg.params);
    s.done = true;
    if (!ok) return { status: 400, body: { error: "The result does not match the time played and was not counted" } };
    s.score = score;
    const found = rewardTierFor(settings.games[s.game].tiers, score);
    const g = grant(s.game, score, found?.tier ?? null, found?.rank ?? 0);
    return { body: finishResult(s.game, score, g, found ? rewardLabel(found.tier.rewardType, found.tier.value, found.tier.label) : null) };
  }
  if (method === "POST" && (m = path.match(/^\/minigames\/sessions\/([^/]+)\/dice\/(roll|stop)$/))) {
    const s = sessions.get(m[1]!);
    if (!s || s.done || !s.state) return { status: 409, body: { error: "This attempt is already finished" } };
    let exchange = null;
    if (m[2] === "roll") {
      const played = playDiceExchange(s.state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, settings.games.dice.params, secureRandom);
      s.state = played.state;
      exchange = played.exchange;
    } else {
      s.state = { ...s.state, finished: true };
    }
    let result = null;
    if (s.state.finished) {
      s.done = true;
      s.score = s.state.wins;
      const found = s.state.lost ? null : diceRewardFor(settings.games.dice.tiers, s.state.wins, s.state.clutchWins, settings.games.dice.params);
      const g = grant("dice", s.state.wins, found?.tier ?? null, found ? found.rank * 10 + (found.clutchBonus > 0 ? 1 : 0) : 0);
      result = finishResult("dice", s.state.wins, g, found ? rewardLabel(found.tier.rewardType, found.tier.value, found.tier.label) : null);
    }
    return { body: { exchange, battle: battleView(s.state), result } };
  }
  if (method === "GET" && path === "/admin/minigames/rewards") {
    const code = q.get("code");
    const st = q.get("status");
    return { body: rewards.filter((r) => (!code || r.code === normalizeRewardCode(code)) && (!st || status(r) === st)).map(adminView) };
  }
  if (method === "POST" && (m = path.match(/^\/admin\/minigames\/rewards\/([^/]+)\/redeem$/))) {
    const r = rewards.find((x) => x.id === m![1]);
    if (!r) return { status: 404, body: { error: "Reward not found" } };
    if (r.usedAt) return { status: 409, body: { error: "This reward has already been used" } };
    r.usedAt = new Date().toISOString();
    return { body: adminView(r) };
  }
  if (method === "GET" && path === "/admin/minigames/stats") {
    return {
      body: {
        weekKey: clubWeekKey(new Date()),
        games: MINIGAME_KEYS.map((k) => ({ key: k, title: MINIGAME_INFO[k].title, playsLast7Days: [...sessions.values()].filter((s) => s.game === k).length, rewardsThisWeek: rewards.filter((r) => r.game === k).length })),
        rejectedLast7Days: 0,
      },
    };
  }
  if (method === "GET" && path === "/admin/minigames/settings") return { body: settings };
  if (method === "PUT" && path === "/admin/minigames/settings") {
    try {
      settings = validateSettings(body);
      return { body: settings };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }
  return null;
}
