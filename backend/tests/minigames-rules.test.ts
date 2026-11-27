import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_MINIGAME_SETTINGS,
  ENEMY_FIGHTERS,
  PLAYER_FIGHTERS,
} from '../src/config/minigames';
import { CARD_CATALOG, CARD_RARITIES, DEFAULT_CARD_PARAMS } from '../src/config/cards';
import {
  rollPack,
  rollRarity,
  clubWeekKey,
  diceRewardFor,
  generateRewardCode,
  isEggScorePlausible,
  isRunnerScorePlausible,
  normalizeRewardCode,
  playDiceExchange,
  resolveAttack,
  rewardTierFor,
  saveTarget,
  seededRandom,
  SettingsValidationError,
  startDiceBattle,
  validateSettings,
  woundTarget,
} from '../src/modules/minigames/rules';

const S = DEFAULT_MINIGAME_SETTINGS;

describe('reward tiers', () => {
  test('runner table from the spec', () => {
    const t = S.games.runner.tiers;
    expect(rewardTierFor(t, 0)).toBeNull();
    expect(rewardTierFor(t, 499)).toBeNull();
    expect(rewardTierFor(t, 500)!.tier.value).toBe(2);
    expect(rewardTierFor(t, 1999)!.tier.value).toBe(3);
    expect(rewardTierFor(t, 2000)).toMatchObject({ rank: 3, tier: { value: 5 } });
  });
  test('egg table from the spec', () => {
    const t = S.games.egg.tiers;
    expect(rewardTierFor(t, 9)).toBeNull();
    expect(rewardTierFor(t, 10)!.tier.value).toBe(1);
    expect(rewardTierFor(t, 99)!.tier.value).toBe(2);
    expect(rewardTierFor(t, 499)!.tier.value).toBe(3);
    expect(rewardTierFor(t, 5000)!.tier.value).toBe(5);
  });
  test('dice: loss → none, 1 win → 5%, 3 → 7%, 5 → 10%, clutch adds 1%', () => {
    const t = S.games.dice.tiers;
    const p = S.games.dice.params;
    expect(diceRewardFor(t, 0, 0, p)).toBeNull();
    expect(diceRewardFor(t, 1, 0, p)!.tier.value).toBe(5);
    expect(diceRewardFor(t, 3, 0, p)!.tier.value).toBe(7);
    expect(diceRewardFor(t, 7, 0, p)!.tier.value).toBe(10);
    expect(diceRewardFor(t, 1, 1, p)!.tier.value).toBe(6);
  });
});

describe('anti-cheat plausibility', () => {
  const rp = S.games.runner.params;
  test('runner: 2000 m needs time', () => {
    expect(isRunnerScorePlausible(2000, 10_000, rp)).toBe(false);
    expect(isRunnerScorePlausible(2000, 70_000, rp)).toBe(true);
    expect(isRunnerScorePlausible(-5, 70_000, rp)).toBe(false);
    expect(isRunnerScorePlausible(10.5, 70_000, rp)).toBe(false);
  });
  const ep = S.games.egg.params;
  test('egg: taps limited by time and speed; waiting longer does not help', () => {
    expect(isEggScorePlausible(1000, 30_000, ep)).toBe(false);
    expect(isEggScorePlausible(300, 30_000, ep)).toBe(true);
    expect(isEggScorePlausible(900, 600_000, ep)).toBe(false);
    expect(isEggScorePlausible(100, 2_000, ep)).toBe(false);
  });
});

describe('dice combat', () => {
  test('wound table (Strength vs Toughness)', () => {
    expect(woundTarget(8, 4)).toBe(2);
    expect(woundTarget(5, 4)).toBe(3);
    expect(woundTarget(4, 4)).toBe(4);
    expect(woundTarget(3, 4)).toBe(5);
    expect(woundTarget(2, 4)).toBe(6);
  });
  test('AP worsens the save; no save above 6+', () => {
    expect(saveTarget(3, 1)).toBe(4);
    expect(saveTarget(5, 2)).toBeNull();
  });
  test('attack sequence is consistent', () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      const a = PLAYER_FIGHTERS[i % PLAYER_FIGHTERS.length]!;
      const d = ENEMY_FIGHTERS[i % ENEMY_FIGHTERS.length]!;
      const r = resolveAttack(a, d, d.wounds, rng);
      expect(r.hitRolls.length).toBe(a.attacks);
      expect(r.woundRolls.length).toBe(r.hits);
      expect(r.unsaved).toBeLessThanOrEqual(r.wounds);
      expect(r.damage).toBeLessThanOrEqual(d.wounds);
      expect(r.defenderWoundsLeft).toBe(d.wounds - r.damage);
    }
  });
  test('stats matter: strong attacker beats weak defender more often', () => {
    const rng = seededRandom(7);
    const strong = PLAYER_FIGHTERS.find((f) => f.id === 'gear_sage')!;
    const weak = ENEMY_FIGHTERS.find((f) => f.id === 'ash_cultist')!;
    const tough = ENEMY_FIGHTERS.find((f) => f.id === 'plague_hulk')!;
    let vsWeak = 0;
    let vsTough = 0;
    for (let i = 0; i < 2000; i++) {
      vsWeak += resolveAttack(strong, weak, 99, rng).damage;
      vsTough += resolveAttack(strong, tough, 99, rng).damage;
    }
    expect(vsWeak).toBeGreaterThan(vsTough * 1.3);
  });
  test('full battles: balanced and always terminate', () => {
    const rng = seededRandom(123);
    const p = S.games.dice.params;
    let firstWins = 0;
    const winsHistogram: Record<number, number> = {};
    const N = 3000;
    for (let i = 0; i < N; i++) {
      let state = startDiceBattle(PLAYER_FIGHTERS, ENEMY_FIGHTERS, rng);
      let guard = 0;
      while (!state.finished && guard++ < 500) {
        state = playDiceExchange(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, p, rng).state;
      }
      expect(state.finished).toBe(true);
      if (state.wins >= 1) firstWins++;
      winsHistogram[Math.min(state.wins, 5)] = (winsHistogram[Math.min(state.wins, 5)] ?? 0) + 1;
    }
    const firstWinRate = firstWins / N;
    // Старый режим «обмена ударами» (playDiceExchange) в игре больше не используется — здесь только
    // проверка, что бой всегда завершается. Баланс проверяется в режиме пулов кубов (тест ниже).
    expect(firstWinRate).toBeGreaterThan(0.6);
    expect(firstWinRate).toBeLessThan(0.95);
    console.log('legacy dice: P(≥1 win)=', firstWinRate.toFixed(2), 'histogram', winsHistogram);
  });

  test('режим пулов кубов (как в игре): разброс бойцов небольшой, 5 побед — редкость', async () => {
    const { createDicePools, playDicePoolTurn, resolveDiceInitiative, chooseEnemyPoolAction } = await import('../src/modules/minigames/rules');
    const p = S.games.dice.params;
    const rng = seededRandom(321);
    const avg: number[] = [];
    let five = 0;
    let total = 0;
    for (const fighter of PLAYER_FIGHTERS) {
      let wins = 0;
      const N = 800;
      for (let i = 0; i < N; i++) {
        let state = resolveDiceInitiative(startDiceBattle([fighter], ENEMY_FIGHTERS, rng), rng() < 0.5 ? 'even' : 'odd', rng).state;
        state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, p, rng);
        let guard = 0;
        while (!state.finished && guard++ < 2000) {
          let action: 'ult' | 'critical' | 'attack' | 'defend';
          if (state.turn === 'enemy') action = chooseEnemyPoolAction(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, p);
          else {
            const pool = state.pools?.player ?? [];
            action = !state.usedUlt ? 'ult'
              : pool.some((e) => !e.used && e.value === 6) ? 'critical'
              : pool.some((e) => !e.used && e.value !== 6 && e.value >= fighter.skill) ? 'attack' : 'defend';
          }
          try {
            state = playDicePoolTurn(state, action, PLAYER_FIGHTERS, ENEMY_FIGHTERS, p, rng).state;
          } catch {
            state = playDicePoolTurn(state, 'defend', PLAYER_FIGHTERS, ENEMY_FIGHTERS, p, rng).state;
          }
          if (!state.finished && state.pools === null) state.pools = createDicePools(state, PLAYER_FIGHTERS, ENEMY_FIGHTERS, p, rng);
        }
        expect(state.finished).toBe(true);
        wins += state.wins;
        if (state.wins >= 5) five++;
        total++;
      }
      avg.push(wins / N);
    }
    // до баланса 28.11.2026: 0,64–2,49 средних побед; теперь ≈1,15–1,9
    expect(Math.max(...avg) - Math.min(...avg)).toBeLessThan(1.1);
    expect(Math.min(...avg)).toBeGreaterThan(0.8);
    expect(five / total).toBeLessThan(0.05);
  });
});

describe('weeks and codes', () => {
  test('club week runs Monday–Sunday in UTC+5', () => {
    // Sunday 23:30 club time = Sunday 18:30 UTC
    expect(clubWeekKey(new Date('2026-10-11T18:30:00Z'))).toBe('2026-W41');
    // Monday 00:30 club time = Sunday 19:30 UTC → next week
    expect(clubWeekKey(new Date('2026-10-11T19:30:00Z'))).toBe('2026-W42');
  });
  test('codes are readable and normalizable', () => {
    const code = generateRewardCode(seededRandom(1));
    expect(code).toMatch(/^WH-[A-HJ-NP-Z2-9]{6}$/);
    expect(normalizeRewardCode(' wh-ab2c3d ')).toBe('WH-AB2C3D');
    expect(normalizeRewardCode('ab2c3d')).toBe('WH-AB2C3D');
  });
});

describe('settings validation', () => {
  test('defaults are valid; partial input is completed', () => {
    expect(validateSettings({})).toEqual(validateSettings(S));
    const s = validateSettings({ games: { egg: { enabled: false } } });
    expect(s.games.egg.enabled).toBe(false);
    expect(s.games.egg.tiers.length).toBe(4);
  });
  test('rejects bad tiers', () => {
    expect(() => validateSettings({ games: { runner: { tiers: [{ minScore: 10, rewardType: 'free_money', value: 1 }] } } })).toThrow(SettingsValidationError);
    expect(() => validateSettings({ games: { runner: { tiers: [{ minScore: 10, rewardType: 'percent_discount', value: 90 }] } } })).toThrow(SettingsValidationError);
    expect(() => validateSettings({ games: { runner: { tiers: [{ minScore: 10, rewardType: 'percent_discount', value: 1 }, { minScore: 10, rewardType: 'percent_discount', value: 2 }] } } })).toThrow(SettingsValidationError);
  });
});

describe('card packs', () => {
  test('catalog: unique ids, every rarity present, legendary is worth 1000', () => {
    expect(new Set(CARD_CATALOG.map((c) => c.id)).size).toBe(CARD_CATALOG.length);
    for (const r of CARD_RARITIES) expect(CARD_CATALOG.some((c) => c.rarity === r)).toBe(true);
    expect(DEFAULT_CARD_PARAMS.rarities.legendary.points).toBe(1000);
  });
  test('drop rates follow the weights', () => {
    const rng = seededRandom(99);
    const hist: Record<string, number> = {};
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = rollRarity(DEFAULT_CARD_PARAMS, rng);
      hist[r] = (hist[r] ?? 0) + 1;
    }
    expect(hist.common! / N).toBeCloseTo(0.6, 1);
    expect(hist.uncommon! / N).toBeCloseTo(0.25, 1);
    expect(hist.legendary! / N).toBeGreaterThan(0.007);
    expect(hist.legendary! / N).toBeLessThan(0.013);
  });
  test('pack: 5 cards, points match the table, at least one uncommon+', () => {
    const rng = seededRandom(5);
    for (let i = 0; i < 2000; i++) {
      const pack = rollPack(DEFAULT_CARD_PARAMS, CARD_CATALOG, rng);
      expect(pack.length).toBe(5);
      expect(pack.some((c) => c.rarity !== 'common')).toBe(true);
      for (const c of pack) {
        expect(c.points).toBe(DEFAULT_CARD_PARAMS.rarities[c.rarity].points);
        expect(CARD_CATALOG.find((x) => x.id === c.cardId)!.rarity).toBe(c.rarity);
      }
    }
  });
  test('settings: rarity table is configurable and validated', () => {
    const s = validateSettings({ games: { cards: { params: { cardsPerPack: 3, rarities: { legendary: { points: 2000 } } } } } });
    expect(s.games.cards.params.cardsPerPack).toBe(3);
    expect(s.games.cards.params.rarities.legendary.points).toBe(2000);
    expect(s.games.cards.params.rarities.common.points).toBe(100);
    expect(() => validateSettings({ games: { cards: { params: { cardsPerPack: 50 } } } })).toThrow(SettingsValidationError);
    const allZero = Object.fromEntries(CARD_RARITIES.map((r) => [r, { weight: 0 }]));
    expect(() => validateSettings({ games: { cards: { params: { rarities: allZero } } } })).toThrow(SettingsValidationError);
  });
});

describe('Кости войны: выбор бойца игрока по весу', () => {
  test('сильные бойцы (weight < 1) выпадают реже', async () => {
    const { pickPlayerFighter, seededRandom } = await import('../src/modules/minigames/rules');
    const { PLAYER_FIGHTERS } = await import('../src/config/minigames');
    const rng = seededRandom(7);
    const counts = new Map<string, number>();
    const N = 60000;
    for (let i = 0; i < N; i++) {
      const f = pickPlayerFighter(PLAYER_FIGHTERS, rng);
      counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    }
    const total = PLAYER_FIGHTERS.reduce((s, f) => s + (f.weight ?? 1), 0);
    for (const f of PLAYER_FIGHTERS) {
      const share = (counts.get(f.id) ?? 0) / N;
      expect(Math.abs(share - (f.weight ?? 1) / total)).toBeLessThan(0.01);
    }
    expect((counts.get('iron_captain') ?? 0) / N).toBeLessThan(0.1);
  });
});
