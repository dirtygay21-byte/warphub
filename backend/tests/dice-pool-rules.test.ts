import { describe, expect, test } from 'bun:test';
import {
  createDicePools,
  playDicePoolTurn,
  type DiceBattleState,
  type DicePoolEntry,
} from '../src/modules/minigames/rules';
import type { DiceParams, Fighter } from '../src/config/minigames';

const player: Fighter = { id: 'player', name: 'Игрок', wounds: 6, attacks: 2, skill: 3, strength: 4, toughness: 4, ap: 1, damage: 1, critDamage: 2, save: 3, sprite: 'player', faction: 'imperium' };
const enemy: Fighter = { id: 'enemy', name: 'Враг', wounds: 6, attacks: 2, skill: 3, strength: 4, toughness: 4, ap: 1, damage: 1, critDamage: 2, save: 3, sprite: 'enemy', faction: 'chaos' };
const params: DiceParams = { clutchBonusPercent: 0, clutchThreshold: 0.25, healAfterWin: 1, enemyWoundsPerWin: 0, enemyAttacksPerWin: 0 };
const entries = (...values: number[]): DicePoolEntry[] => values.map((value) => ({ value, used: false }));
const sequence = (...values: number[]) => () => values.length ? values.shift()! : 0.999;
const base = (): DiceBattleState => ({
  playerId: 'player', playerWounds: 6, opponentId: 'enemy', opponentWounds: 6,
  wins: 0, clutchWins: 0, defeated: [], round: 0, escalation: 0, finished: false, lost: false,
  initiativeRoll: 6, playerStarts: true, turn: 'player', usedUlt: false, defense: null,
  firstStrikeDone: true, pools: null, poolDefense: null,
});

describe('dice pools: видимые кубы, криты и защита', () => {
  test('пулы создаются по числу атак и содержат серверные D6', () => {
    const pools = createDicePools(base(), [player], [enemy], params, sequence(0, 0.99, 0.49, 0.5));
    expect(pools.player.map((entry) => entry.value)).toEqual([1, 6]);
    expect(pools.enemy.map((entry) => entry.value)).toEqual([3, 4]);
    expect(pools.player.every((entry) => !entry.used)).toBe(true);
  });

  test('первая обычная атака гарантирована даже при неудачных кубах', () => {
    const state = { ...base(), firstStrikeDone: false };
    const played = playDicePoolTurn(state, 'attack', [player], [enemy], params, sequence(0));
    expect(played.exchange.playerAction).toMatchObject({ guaranteed: true, blocked: false, damage: 1, roll: 1 });
    expect(played.state.opponentWounds).toBe(5);
  });

  test('обычная атака расходует выбранный куб, крит наносит critDamage', () => {
    const normal = playDicePoolTurn({ ...base(), pools: { player: entries(4, 1), enemy: entries(1, 1) } }, 'attack', [player], [enemy], params, sequence(0));
    expect(normal.exchange.playerAction).toMatchObject({ rollIndex: 0, roll: 4, critical: false, damage: 1 });
    expect(normal.exchange.pools?.player[0].used).toBe(true);

    const critical = playDicePoolTurn({ ...base(), pools: { player: entries(6), enemy: entries(1) } }, 'critical', [player], [enemy], params, sequence(0));
    expect(critical.exchange.playerAction).toMatchObject({ roll: 6, critical: true, damage: 2 });
    expect(critical.state.opponentWounds).toBe(5);
  });

  test('защита на 6 снимает два обычных успеха подряд', () => {
    const defended = playDicePoolTurn({ ...base(), pools: { player: entries(6), enemy: entries(4, 4) } }, 'defend', [player], [enemy], params, sequence(0));
    expect(defended.state.poolDefense).toMatchObject({ side: 'player', roll: 6, charges: 2 });
    const first = playDicePoolTurn(defended.state, 'attack', [player], [enemy], params, sequence(0));
    expect(first.exchange.enemyAction).toMatchObject({ blocked: true, blockedByRoll: 6, damage: 0 });
    expect(first.state.poolDefense).toMatchObject({ charges: 1 });
    const skipped = playDicePoolTurn(first.state, 'defend', [player], [enemy], params, sequence(0));
    const second = playDicePoolTurn(skipped.state, 'attack', [player], [enemy], params, sequence(0));
    expect(second.exchange.enemyAction?.blocked).toBe(true);
    expect(second.state.poolDefense).toBeNull();
    expect(second.state.playerWounds).toBe(7);
  });

  test('обычная защита не останавливает критический успех', () => {
    const defended = playDicePoolTurn({ ...base(), pools: { player: entries(4), enemy: entries(6) } }, 'defend', [player], [enemy], params, sequence(0));
    const critical = playDicePoolTurn(defended.state, 'critical', [player], [enemy], params, sequence(0));
    expect(critical.exchange.enemyAction).toMatchObject({ blocked: false, damage: 2 });
    expect(critical.state.poolDefense).toBeNull();
  });

  test('риск добавляет куб и ранит атакующего при естественной единице', () => {
    const played = playDicePoolTurn({ ...base(), pools: { player: entries(), enemy: entries(6) } }, 'risk', [player], [enemy], params, sequence(0));
    expect(played.exchange.playerAction).toMatchObject({ roll: 1, selfDamage: 1, damage: 0 });
    expect(played.state.playerWounds).toBe(5);
  });

  test('ульта гарантирована, критична и доступна один раз за попытку', () => {
    const played = playDicePoolTurn({ ...base(), pools: { player: entries(1), enemy: entries(6) } }, 'ult', [player], [enemy], params, sequence(0));
    expect(played.exchange.playerAction).toMatchObject({ guaranteed: true, critical: true, blocked: false, damage: 2 });
    expect(played.state.usedUlt).toBe(true);
    expect(() => playDicePoolTurn(played.state, 'ult', [player], [enemy], params, sequence(0))).toThrow('already used');
  });

  test('новый круг добавляет по одной ране каждому бойцу', () => {
    const played = playDicePoolTurn({ ...base(), pools: { player: entries(4), enemy: entries(1) } }, 'attack', [player], [enemy], params, sequence(0));
    expect(played.state.round).toBe(1);
    expect(played.state.playerWounds).toBe(7);
    expect(played.state.opponentWounds).toBe(6);
  });
});
