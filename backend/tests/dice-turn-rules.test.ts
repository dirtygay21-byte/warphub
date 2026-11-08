import { describe, expect, test } from 'bun:test';
import { startDiceBattle, playDiceTurn, resolveDiceInitiative } from '../src/modules/minigames/rules';
import type { DiceParams, Fighter } from '../src/config/minigames';

const player: Fighter = { id: 'player', name: 'Игрок', wounds: 6, attacks: 2, skill: 3, strength: 4, toughness: 4, ap: 1, damage: 1, save: 3, sprite: 'player', faction: 'order' };
const enemy: Fighter = { id: 'enemy', name: 'Враг', wounds: 6, attacks: 2, skill: 3, strength: 4, toughness: 4, ap: 1, damage: 1, save: 3, sprite: 'enemy', faction: 'swarm' };
const params: DiceParams = { clutchBonusPercent: 0, clutchThreshold: 0.25, healAfterWin: 1, enemyWoundsPerWin: 0, enemyAttacksPerWin: 0 };
const sequence = (...values: number[]) => () => values.length ? values.shift()! : 6;
const base = () => startDiceBattle([player], [enemy], () => 0.5);

describe('dice: инициатива', () => {
  test('D6 и выбранная чётность определяют первую сторону', () => {
    expect(resolveDiceInitiative(base(), 'even', () => 0.999).state).toMatchObject({ initiativeRoll: 6, playerStarts: true, turn: 'player' });
    expect(resolveDiceInitiative(base(), 'even', () => 0.49).state).toMatchObject({ initiativeRoll: 3, playerStarts: false, turn: 'enemy' });
    expect(resolveDiceInitiative(base(), 'odd', () => 0.49).state).toMatchObject({ initiativeRoll: 3, playerStarts: true, turn: 'player' });
    expect(resolveDiceInitiative(base(), 'odd', () => 0.5).state).toMatchObject({ initiativeRoll: 4, playerStarts: false, turn: 'enemy' });
  });

  test('повторная инициатива запрещена', () => {
    const state = resolveDiceInitiative(base(), 'even', () => 0.999).state;
    expect(() => resolveDiceInitiative(state, 'odd', () => 0.5)).toThrow('already rolled');
  });
});

describe('dice: атака, защита, риск и ульта', () => {
  test('первая атака всегда наносит урон и не блокируется', () => {
    const state = { ...base(), initiativeRoll: 6, playerStarts: true, turn: 'player' as const, defense: 'enemy' as const };
    const played = playDiceTurn(state, 'attack', [player], [enemy], params, sequence(1, 1, 1));
    expect(played.exchange.blocked).toBe(false);
    expect(played.exchange.playerAttack?.guaranteed).toBe(true);
    expect(played.exchange.playerAttack?.damage).toBeGreaterThan(0);
    expect(played.state.opponentWounds).toBeLessThan(6);
    expect(played.state.turn).toBe('enemy');
    expect(played.state.defense).toBeNull();
  });

  test('защита полностью блокирует следующую атаку и снимается', () => {
    const defended = playDiceTurn({ ...base(), initiativeRoll: 6, playerStarts: true, turn: 'player' as const }, 'defend', [player], [enemy], params, sequence(6));
    expect(defended.state.defense).toBe('player');
    expect(defended.state.turn).toBe('enemy');
    const attack = playDiceTurn(defended.state, 'attack', [player], [enemy], params, sequence(6));
    expect(attack.exchange.blocked).toBe(true);
    expect(attack.exchange.enemyAttack?.damage).toBe(0);
    expect(attack.state.playerWounds).toBe(6);
    expect(attack.state.defense).toBeNull();
  });

  test('риск добавляет куб и ранит атакующего при выпадении 1', () => {
    const state = { ...base(), initiativeRoll: 6, playerStarts: true, turn: 'player' as const };
    const played = playDiceTurn(state, 'risk', [player], [enemy], params, sequence(0, 0.99, 0.99, 0.99));
    expect(played.exchange.selfDamage).toBe(1);
    expect(played.exchange.playerAttack?.selfDamage).toBe(1);
    expect(played.state.playerWounds).toBe(5);
  });

  test('ульта гарантирована и доступна только раз', () => {
    const state = { ...base(), initiativeRoll: 6, playerStarts: true, turn: 'player' as const };
    const played = playDiceTurn(state, 'ult', [player], [enemy], params, sequence(6));
    expect(played.exchange.playerAttack?.guaranteed).toBe(true);
    expect(played.exchange.playerAttack?.damage).toBeGreaterThan(0);
    expect(played.state.usedUlt).toBe(true);
    expect(() => playDiceTurn(played.state, 'ult', [player], [enemy], params, sequence(6))).toThrow('already used');
  });
});
