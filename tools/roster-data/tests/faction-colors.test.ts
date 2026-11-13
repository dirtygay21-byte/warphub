// Акцент фракции (14.11.2026): у каждой фракции 40K и AoS из данных есть свой цвет (не общий запасной).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { factionColor } from '../../../client/src/features/roster/ui/common/factionColors';

const root = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const ids = (file: string) => (JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as { factions: Array<{ id: string }> }).factions.map((f) => f.id);

test('40K: цвет у каждой фракции', () => {
  const missing = ids('index.json').filter((id) => factionColor('40k', id) === '#ecfe46');
  assert.deepEqual(missing, []);
});

test('AoS: цвет у каждой фракции', () => {
  const missing = ids('aos/index.json').filter((id) => factionColor('aos', id) === '#ecfe46');
  assert.deepEqual(missing, []);
});
