import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../../../client/src/components/booking/tableCategory.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../backend/src/modules/booking/rules.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../../backend/src/modules/booking/service.ts', import.meta.url), 'utf8');

test('booking table categories are Russian in both clients and backend errors', () => {
  for (const source of [client, backend]) {
    assert.ok(source.includes('Полномасштабный варгейм'));
    assert.ok(source.includes('Тактические игры'));
  }
  assert.ok(service.includes('Этот стол предназначен для категории'));
  assert.ok(!client.includes('wh: "Full-scale Wargaming"'));
  assert.ok(!client.includes('small: "Tactical Games"'));
  assert.ok(!backend.includes("wh: 'Full-scale Wargaming'"));
  assert.ok(!backend.includes("small: 'Tactical Games'"));
});
