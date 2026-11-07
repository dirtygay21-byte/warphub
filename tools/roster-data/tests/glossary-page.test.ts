// «Правила» → «Термины» (07.11.2026): все записи глоссария 40K в группах, поиск, RU/EN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { glossaryEntries, localizeGlossary, matchGlossary, type Glossary } from '../../../client/src/features/roster/glossary';

const g: Glossary = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'glossary.json'), 'utf8'));

test('все записи глоссария попадают на страницу, каждая в свою группу, с текстом', () => {
  const e = glossaryEntries(g);
  assert.equal(e.length, Object.keys(g.abilities).length + Object.keys(g.weapon).length + Object.keys(g.terms).length);
  assert.ok(e.every((x) => x.texts.length && x.texts.every((t) => t.trim().length > 0)), 'без пустых текстов');
  const byGroup = (k: string) => e.filter((x) => x.group === k).length;
  assert.ok(byGroup('unit') > 0 && byGroup('weapon') > 0 && byGroup('faction') > 0 && byGroup('terms') > 0);
  assert.equal(new Set(e.map((x) => x.id)).size, e.length, 'id без повторов');
  // порядок групп: способности, оружие, оружие фракций, термины
  const order = e.map((x) => x.group).filter((x, i, a) => a.indexOf(x) === i);
  assert.deepEqual(order, ['unit', 'weapon', 'faction', 'terms']);
});

test('поиск: по названию (без скобок и регистра) — выше, чем по тексту', () => {
  const e = glossaryEntries(g);
  const ds = e.find((x) => /deep strike/i.test(x.name))!;
  assert.equal(matchGlossary(ds, 'deep str'), 2);
  const lethal = e.find((x) => /lethal hits/i.test(x.name))!;
  assert.equal(matchGlossary(lethal, '[lethal'), 2);
  assert.equal(matchGlossary(ds, 'zzqq'), 0);
  assert.equal(matchGlossary(ds, ''), 1);
});

test('EN: тексты английские там, где они есть в снимке', () => {
  const en = glossaryEntries(localizeGlossary(g, 'en'));
  const ds = en.find((x) => /deep strike/i.test(x.name))!;
  assert.ok(/[a-z]{4}/i.test(ds.texts[0]!) && !/[а-я]{4}/i.test(ds.texts[0]!), ds.texts[0]);
});
