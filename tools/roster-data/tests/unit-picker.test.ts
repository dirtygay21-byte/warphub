// Выбор юнита 40K (Добавить юнит, 07.11.2026): поиск по ключевым словам и способностям, «Помещается», сортировка, цены размеров.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cheapest, fitsPoints, pickerMatch, sizePriceLine, sortPicker } from '../../../client/src/features/roster/engine/picker';
import type { FactionData } from '../../../client/src/features/roster/engine/types';
import type { RuOverlay } from '../../../client/src/features/roster/ru';

const DATA = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data');
const fac = (id: string): FactionData => JSON.parse(fs.readFileSync(path.join(DATA, 'f', `${id}.json`), 'utf8'));
const ru = (id: string): RuOverlay => JSON.parse(fs.readFileSync(path.join(DATA, 'ru', `${id}.json`), 'utf8'));
const NEC = fac('NEC');
const own = NEC.datasheets.filter((d) => d.group === 'own' && !d.outdated);
const sheet = (n: string) => own.find((d) => d.name === n)!;

test('поиск: часть названия, часть ключевого слова, часть названия способности (английского и русского)', () => {
  const names = (q: string, o: RuOverlay | null = null) => own.filter((d) => pickerMatch(d, q, o)).map((d) => d.name);
  assert.ok(names('warrior').includes('Necron Warriors'));
  // ключевое слово целиком и частью, без учёта регистра
  const fly = names('fly');
  assert.ok(fly.length > 0 && fly.every((n) => sheet(n).keywords.some((k) => k.toLowerCase().includes('fly')) || n.toLowerCase().includes('fly') || sheet(n).abilities.some((a) => a.name.toLowerCase().includes('fly'))));
  assert.ok(names('CHARACTER').includes('Overlord'));
  // способность
  const withAbility = own.find((d) => d.abilities.some((a) => a.name.length > 6 && !d.name.toLowerCase().includes(a.name.toLowerCase())))!;
  const ab = withAbility.abilities.find((a) => a.name.length > 6)!.name;
  assert.ok(names(ab.slice(0, 6)).includes(withAbility.name), ab);
  // русское название способности из оверлея
  const o = ru('NEC');
  const [dsId, entry] = Object.entries(o.datasheets ?? {}).find(([id, x]) => own.some((d) => d.id === id) && Object.values(x.abilities ?? {}).some((a) => a?.name && /[а-я]{5}/i.test(a.name)))!;
  const ruAb = Object.values(entry.abilities!).find((a) => a?.name && /[а-я]{5}/i.test(a.name))!.name!;
  assert.ok(names(ruAb.slice(0, 5).toLowerCase(), o).includes(own.find((d) => d.id === dsId)!.name), ruAb);
  assert.equal(names('').length, own.length);
  assert.deepEqual(names('zzzzqqq'), []);
});

test('«Помещается» и цена следующей копии: Necron Warriors 85 (10) / 190 (20)', () => {
  const w = sheet('Necron Warriors');
  assert.equal(cheapest(w, 0, null), 85);
  assert.equal(fitsPoints(w, 0, null, 85), true);
  assert.equal(fitsPoints(w, 0, null, 84), false);
  assert.equal(sizePriceLine(w, 0, null), '10: 85 · 20: 190');
  // один размер — строки цен нет (цена справа)
  assert.equal(sizePriceLine(sheet('Overlord'), 0, null), '');
});

test('цены размеров без числа моделей (Crusader Squad) — только очки', () => {
  const ct = fac('SM').datasheets.find((d) => d.name === 'Crusader Squad' && d.group === 'own')!;
  assert.equal(sizePriceLine(ct, 0, 'Black Templars'), '160 · 305');
});

test('сортировка: А–Я и по очкам (без цены — в конце)', () => {
  const pick = [sheet('Overlord'), sheet('Necron Warriors'), sheet('Monolith')];
  assert.deepEqual(sortPicker(pick, 'az', () => 0).map((d) => d.name), ['Monolith', 'Necron Warriors', 'Overlord']);
  const price = (d: (typeof pick)[number]) => cheapest(d, 0, null);
  assert.deepEqual(sortPicker(pick, 'points', price).map((d) => d.name), ['Necron Warriors', 'Overlord', 'Monolith']);
  assert.deepEqual(sortPicker(pick, 'points', (d) => (d.name === 'Necron Warriors' ? null : price(d))).map((d) => d.name), ['Overlord', 'Monolith', 'Necron Warriors']);
});
