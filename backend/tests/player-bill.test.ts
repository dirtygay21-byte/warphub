/** Подписи доли в счёте игрока (21.11.2026). */
import { expect, test } from 'bun:test';
import { shareNote } from '../src/modules/pricing/rules';

test('доля: стол на двоих, делится на троих, целиком — без подписи', () => {
  expect(shareNote('table', 0.5)).toBe('Стол на двоих — ваша доля');
  expect(shareNote('service', 1 / 3)).toBe('Делится на троих — ваша доля');
  expect(shareNote('table', 1)).toBeNull();
  expect(shareNote('service', 2)).toBe('2 места');
});
