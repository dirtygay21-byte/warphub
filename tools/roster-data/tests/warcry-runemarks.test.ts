import { expect, test } from 'bun:test';
import { runemarkHint } from '../../../client/src/features/roster/warcry/runemarks';

const ab = (name: string, cost: string, runemarks: string[]) => ({ id: name, name, cost, text: `${name} text`, runemarks }) as never;

test('Warcry: рунмарка показывает способности, которые она открывает', () => {
  const list = [ab('Ju-ju', 'double', ['mystic']), ab('Charge!', 'double', []), ab('Hex', 'triple', ['mystic', 'hero'])];
  const h = runemarkHint('mystic', list);
  expect(h.count).toBe(2);
  expect(h.title).toBe('Mystic');
  expect(h.text).toContain('Ju-ju · Double\nJu-ju text');
  expect(h.text).toContain('Hex · Triple');
  expect(h.text).not.toContain('Charge!');
  expect(runemarkHint('agile', list).count).toBe(0);
});
