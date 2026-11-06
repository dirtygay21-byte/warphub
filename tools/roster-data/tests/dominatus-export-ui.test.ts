import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');
const api = readFileSync(join(root, 'client/src/features/roster/dominatus/api.ts'), 'utf8');
const screen = readFileSync(join(root, 'client/src/features/roster/ui/game/DominatusCampaign.tsx'), 'utf8');

test('Dominatus export is an explicit participant action with cross-device statuses', () => {
  assert.ok(api.includes("export type DominatusExportStatus = 'pending' | 'sending' | 'applied' | 'retry' | 'dead'"));
  assert.ok(api.includes("'/roster/dominatus/exports'"));
  assert.ok(api.includes('uploadDominatusBattle'));
  assert.ok(api.includes('retryDominatusBattle'));
  assert.ok(screen.includes('<ExportBattle battle={recorded} reload={reload} />'));
  assert.ok(screen.includes('Загрузить на Dominatus'));
  assert.ok(screen.includes('Повторить загрузку'));
  assert.ok(screen.includes('Загружено на Dominatus'));
  assert.ok(screen.includes('exportBattleId'));
});
