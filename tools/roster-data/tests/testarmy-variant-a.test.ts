// Test Army, вариант A (27.11.2026): нижняя панель, лист «Отряды», карточка отряда, строй и «Поставить всех в зону».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  autoDeploy,
  coherency,
  COHERENCY_40K,
  COHERENCY_AOS,
  DEFAULT_ANGLE,
  DEFAULT_GAP,
  parseBase,
  placeUnit,
  placedBases,
  rotateUnit,
  rules40k,
  rulesAos,
  rulesKt,
  rulesWarcry,
  baseToZone,
  type Pt,
  type TAUnit,
} from '../../../client/src/features/roster/testarmy';

const ui = (p: string) => readFileSync(join(import.meta.dirname, '../../../client/src/features/roster/ui', p), 'utf8');
const unit = (uid: string, n: number, mm = 32): TAUnit => ({
  uid,
  name: uid,
  leaders: [],
  datasheetIds: [],
  points: 0,
  formation: 'tight',
  angle: DEFAULT_ANGLE,
  gap: DEFAULT_GAP,
  placed: false,
  models: Array.from({ length: n }, (_, i) => ({ id: `${uid}.${i}`, profile: 'x', options: parseBase(`${mm}mm`).options, source: `${mm}mm`, pick: 0, customMm: null, at: null })),
});
const at = (u: TAUnit, pts: Pt[]): TAUnit => ({ ...u, placed: true, models: u.models.map((m, i) => ({ ...m, at: pts[i]! })) });
const r32 = 32 / 2 / 25.4;

test('строй 40K: 2″ до одной модели и 9″ до каждой (wh-rules.ru, Unit Coherency)', () => {
  assert.equal(rules40k.coherency, COHERENCY_40K);
  assert.ok(coherency(placedBases(placeUnit(unit('a', 5), [20, 20])), COHERENCY_40K).ok, 'построение по умолчанию — строй цел');
  // зазор 1,9″ между краями — в строю; 2,1″ — нет
  const step = (gap: number) => 2 * r32 + gap;
  assert.ok(coherency(placedBases(at(unit('b', 2), [[10, 10], [10 + step(1.9), 10]])), COHERENCY_40K).ok);
  const far = coherency(placedBases(at(unit('c', 3), [[10, 10], [10 + step(1), 10], [10 + step(1) + step(2.1), 10]])), COHERENCY_40K);
  assert.deepEqual(far.bad, [2]);
  // цепочка 6 моделей с зазором 1,9″: каждая рядом с соседом, но крайние дальше 9″ друг от друга
  const chain = coherency(placedBases(at(unit('d', 6), Array.from({ length: 6 }, (_, i) => [10 + i * step(1.9), 10] as Pt))), COHERENCY_40K);
  assert.ok(!chain.ok && chain.bad.includes(0) && chain.bad.includes(5));
});

test('строй AoS 4: 1/2″, при 7+ моделях — 2 соседа (Core Rules 15.1)', () => {
  assert.equal(rulesAos.coherency, COHERENCY_AOS);
  const step = 2 * r32 + 0.4;
  const line6 = Array.from({ length: 6 }, (_, i) => [10 + i * step, 10] as Pt);
  assert.ok(coherency(placedBases(at(unit('a', 6), line6)), COHERENCY_AOS).ok, '6 моделей в линию — по одному соседу достаточно');
  const line7 = Array.from({ length: 7 }, (_, i) => [10 + i * step, 10] as Pt);
  const r = coherency(placedBases(at(unit('b', 7), line7)), COHERENCY_AOS);
  assert.deepEqual(r.bad, [0, 6], 'крайние модели линии из 7 — только один сосед');
  assert.equal(rulesKt.coherency, undefined);
  assert.equal(rulesWarcry.coherency, undefined);
});

test('«Поставить всех в зону»: базы целиком в зоне, без наложений; не поместились — вне стола', () => {
  const zone: Pt[][] = [[[0, 0], [60, 0], [60, 12], [0, 12]]];
  const placedBefore = placeUnit(unit('x', 5), [30, 6]);
  const others = placedBases(placedBefore).filter((b) => !!b) as NonNullable<ReturnType<typeof placedBases>[number]>[];
  const r = autoDeploy([unit('a', 10), unit('b', 5, 40), placedBefore, unit('c', 1, 100)], zone, others);
  assert.deepEqual(r.placed, ['a', 'b', 'c']);
  assert.equal(r.units[2], placedBefore, 'выставленный отряд не трогается');
  const all = r.units.flatMap((u) => placedBases(u)).filter((b) => !!b) as NonNullable<ReturnType<typeof placedBases>[number]>[];
  for (const b of all) assert.ok(baseToZone(b, zone[0]!).whollyInside, 'база целиком в зоне');
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.rx + b.rx - 1e-6, 'базы не накладываются');
    }
  // слишком много отрядов для зоны: остаток вне стола
  const many = autoDeploy(Array.from({ length: 30 }, (_, i) => unit(`m${i}`, 10)), zone, []);
  assert.ok(many.placed.length > 0 && many.failed.length > 0);
  assert.equal(many.placed.length + many.failed.length, 30);
  assert.ok(many.units.filter((u) => many.failed.includes(u.uid)).every((u) => !u.placed));
  // без зоны — никто не ставится
  assert.equal(autoDeploy([unit('z', 3)], [], []).placed.length, 0);
});

test('поворот стрелками: ±15° вокруг центра, строй сохраняется', () => {
  const u = placeUnit(unit('a', 5), [20, 20]);
  const r = rotateUnit(rotateUnit(u, (15 * Math.PI) / 180), (-15 * Math.PI) / 180);
  u.models.forEach((m, i) => {
    assert.ok(Math.abs(m.at![0] - r.models[i]!.at![0]) < 1e-9 && Math.abs(m.at![1] - r.models[i]!.at![1]) < 1e-9);
  });
});

test('интерфейс варианта A: нижняя панель вместо колонки справа, без зазора, стрелки поворота, карточка с вкладками', () => {
  const board = ui('testarmy/Board.tsx');
  const sheets = ui('testarmy/BoardSheets.tsx');
  for (const t of ['<BottomBar', '<UnitsSheet', '<MoreMenu', '<UnitCard', '<QuickBar', '<FormTab', '<ProfileTab', '<ActionPanel', 'embedded', 'autoDeploy(a.units, zone', 'coherency(placedBases(u), cohRule)', 'centerOn(c)']) assert.ok(board.includes(t), t);
  for (const t of ['RailButton', 'Зазор между базами', 'onGap', 'GAPS', 'w-14 shrink-0 flex-col']) assert.ok(!board.includes(t), `убрано: ${t}`);
  for (const t of ['Повернуть влево', 'Повернуть вправо', 'Действия', 'Строй', 'Профиль', 'Поставить всех в зону', 'Вне стола', 'На столе', 'Модели по одной', 'Убрать со стола', 'из ростера']) assert.ok(sheets.includes(t), t);
  assert.ok(ui('testarmy/GamePanel.tsx').includes('embedded?: boolean'));
});

test('быстрые кнопки и строка строя — внутри карточки, над полем ничего не висит (27.11.2026)', () => {
  const board = ui('testarmy/Board.tsx');
  const sheets = ui('testarmy/BoardSheets.tsx');
  assert.ok(board.includes('tools={'), 'QuickBar передаётся в карточку');
  assert.ok(board.includes('subTone='), 'строка зоны/строя — подпись карточки');
  assert.ok(!board.includes('pointer-events-none absolute inset-x-0 bottom-0'), 'нет плавающего слоя над полем');
  assert.ok(sheets.includes('{!open && tools}'));
  assert.ok(!sheets.includes('aria-label="Готово"'), '✓ убрана — закрывает ✕');
});
