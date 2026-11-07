// Сверка с Warmind (решение владельца 07.11.2026: вторая проверка цифр 40K). Полностью сконвертированные из wh-rules 995 армии
// по очкам, характеристикам и оружию совпадают с Warmind; известные расхождения источников перечислены здесь с объяснением.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(import.meta.dirname, '..');
const KNOWN: Record<string, string[]> = {
  // у wh-rules и прежних данных (Wahapedia) — вариант «1 модель» за 30 очков, у Warmind его нет
  'AE/points': ['Shadow Spectres'],
  // Venomcrest Spit: навык «N/A» у нас, «-» у Warmind (одно и то же); Gaping maw: AP 0 у нас, «-» у Warmind
  'AE/weapons': ['Stonesinger'],
  'TYR/weapons': ['The Red Terror'],
};
test('армии, сконвертированные из wh-rules 995, по цифрам совпадают с Warmind (кроме известных расхождений)', () => {
  execFileSync('bun', [path.join(ROOT, 'scripts', 'warmind-compare.mjs')], { cwd: ROOT, stdio: 'ignore' });
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, '40k', 'warmind-compare.json'), 'utf8'));
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, '40k', 'curated.json'), 'utf8'));
  const converted = curated.updates.items.filter((u: { kind: string; enabled: boolean }) => u.kind === 'whrules-faction-convert' && u.enabled).map((u: { army: string }) => u.army);
  const bad: string[] = [];
  for (const a of r.armies.filter((x: { army: string }) => converted.includes(x.army)))
    for (const k of ['points', 'stats', 'weapons'])
      for (const x of a[k]) if (!(KNOWN[`${a.army}/${k}`] ?? []).includes(x.unit)) bad.push(`${a.army}/${k}: ${x.unit} ${x.weapon ?? x.profile ?? ''}`);
  assert.deepEqual(bad, []);
});
