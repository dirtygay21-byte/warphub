import { describe, expect, test } from 'bun:test';
import { newWorld, speedAt, step } from '../../client/src/components/games/runnerScene';

describe('runner: скорость и воздушные препятствия', () => {
  test('ускорение растёт и ограничено серверным пределом', () => {
    expect(speedAt(0)).toBe(10);
    expect(speedAt(10)).toBeGreaterThan(speedAt(0));
    expect(speedAt(50)).toBe(22);
    expect(speedAt(1000)).toBe(28);
  });

  test('высокая спора: можно пробежать под ней, но прыжок в неё смертелен', () => {
    const ground = newWorld();
    ground.obstacles = [{ x: 30, kind: 'air_mine' }];
    step(ground, 0.016);
    expect(ground.dead).toBe(false);

    const jump = newWorld();
    jump.obstacles = [{ x: 30, kind: 'air_mine' }];
    jump.heroY -= 30;
    step(jump, 0.016);
    expect(jump.dead).toBe(true);
  });

  test('низкая летучая цель: на земле смертельна, высокий прыжок спасает', () => {
    const ground = newWorld();
    ground.obstacles = [{ x: 30, kind: 'air_bat' }];
    step(ground, 0.016);
    expect(ground.dead).toBe(true);

    const jump = newWorld();
    jump.obstacles = [{ x: 30, kind: 'air_bat' }];
    jump.heroY -= 50;
    step(jump, 0.016);
    expect(jump.dead).toBe(false);
  });
});
