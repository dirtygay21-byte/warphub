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
  // Nobz on Warbikes и Skorchas у Warmind — Warhammer Legends, на сайте и у нас их нет (связь некуда добавить)
  'ORK/leads': ['Warboss on Warbike'],
  // Space Marines и Imperial Agents (995, 07.11.2026) — у wh-rules 981 и 995 одинаково; на проверку владельцем.
  // Aquila Kill Team: у сайта другой набор профилей (Knives and Fists, Infernus Heavy Bolter – bolt/infernus, T5),
  // у Warmind и Wahapedia — прежний (T4, Bolt Pistol S4 AP0) — похоже на новую версию инфолиста у сайта, значения сайта оставлены
  'AoI/stats': ['Aquila Kill Team'],
  'AoI/weapons': ['Aquila Kill Team'],
  // Thunderhawk Gunship M14" у сайта, 20" у Warmind и Wahapedia; Master-crafted bolt carbine (Lieutenant in Phobos Armour)
  // S4 AP0 у сайта и Wahapedia, S5 AP-1 у Warmind; Suboden Khan AP0 и Bjorn BS2+ — как у Wahapedia
  'SM/stats': ['Thunderhawk Gunship'],
  'SM/weapons': ['Lieutenant in Phobos Armour', 'Suboden Khan', 'Bjorn the Fell-handed'],
};
test('армии, сконвертированные из wh-rules 995, по цифрам совпадают с Warmind (кроме известных расхождений)', () => {
  execFileSync('bun', [path.join(ROOT, 'scripts', 'warmind-compare.mjs')], { cwd: ROOT, stdio: 'ignore' });
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, '40k', 'warmind-compare.json'), 'utf8'));
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, '40k', 'curated.json'), 'utf8'));
  type U = { kind: string; enabled: boolean; army?: string; scope?: string[]; snapshot?: string };
  const items: U[] = curated.updates.items.filter((u: U) => u.enabled);
  const converted = [...items.filter((u) => u.kind === 'whrules-faction-convert').map((u) => u.army!), ...items.filter((u) => u.kind === 'whrules-faction' && /995/.test(u.snapshot ?? '')).flatMap((u) => u.scope ?? [])];
  const bad: string[] = [];
  for (const a of r.armies.filter((x: { army: string }) => converted.includes(x.army)))
    for (const k of ['points', 'copies', 'stats', 'weapons', 'leads', 'detachments', 'enhancements'])
      for (const x of a[k]) if (!(KNOWN[`${a.army}/${k}`] ?? []).includes(x.unit)) bad.push(`${a.army}/${k}: ${x.unit} ${x.weapon ?? x.profile ?? ''}`);
  assert.deepEqual(bad, []);
});
