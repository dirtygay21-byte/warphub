// Симулятор боя 40K, этап S1 (08.11.2026): точный расчёт против ручных примеров, способностей и проверки бросками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { diceDist, keywordsMatch, mean, parseWeaponKeywords, simulate, woundTarget, type Situation, type Target, type WeaponInput } from '../../../client/src/features/roster/testarmy/combat';

const near = (a: number, b: number, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);
const MEQ: Target = { models: 5, T: 4, Sv: 3, inv: null, W: 2, fnp: null, keywords: ['INFANTRY', 'IMPERIUM'] };
const W = (o: Partial<WeaponInput>): WeaponInput => ({ name: 'test', melee: false, A: '1', skill: '3', S: '4', AP: '0', D: '1', keywords: '', count: 1, ...o });

test('кубы: D3 — половина D6 с округлением вверх; 2D6, D6+1, число', () => {
  assert.deepEqual(diceDist('D3')!.map((p) => +p.toFixed(6)), [0, 1 / 3, 1 / 3, 1 / 3].map((p) => +p.toFixed(6)));
  near(mean(diceDist('2D6')!), 7);
  near(mean(diceDist('D6+1')!), 4.5);
  near(mean(diceDist('4')!), 4);
  assert.equal(diceDist('X'), null);
});

test('таблица ранений 05.02 и условия ключевых слов', () => {
  assert.deepEqual([woundTarget(8, 4), woundTarget(5, 4), woundTarget(4, 4), woundTarget(3, 4), woundTarget(2, 4), woundTarget(3, 7)], [2, 3, 4, 5, 6, 6]);
  assert.equal(keywordsMatch('non-monster/vehicle', ['INFANTRY']), true);
  assert.equal(keywordsMatch('non-monster/vehicle', ['VEHICLE']), false);
  assert.equal(keywordsMatch('monster/vehicle', ['Monster']), true);
});

test('ручной пример: 10 болтеров (BS3+, S4, AP0, D1) по 5 Marines (T4, Sv3+, W2) — средние по шагам', () => {
  const r = simulate([W({ count: 10 })], MEQ);
  const m = r.weapons[0]!;
  near(m.pHit, 4 / 6);
  near(m.pWound, 3 / 6);
  near(m.pUnsaved, 2 / 6);
  near(m.expected.hits, 10 * 4 / 6);
  near(m.expected.unsaved, 10 * (4 / 6) * (1 / 2) * (1 / 3));
  near(r.expectedDamage, 10 * (4 / 6) * (1 / 2) * (1 / 3), 1e-9, 'D1 без лишнего урона');
  near(r.slain.reduce((a, b) => a + b, 0), 1, 1e-9, 'сумма вероятностей');
});

test('лишний урон теряется: D3 по W1 убивает не больше одной модели за удар', () => {
  const r = simulate([W({ A: '1', skill: '2', S: '10', AP: '-5', D: '3', count: 1 })], { ...MEQ, W: 1, Sv: 6 });
  assert.ok(r.slain[2]! === 0 && r.slain[1]! > 0);
});

test('способности: TORRENT, SUSTAINED, LETHAL, DEVASTATING (не больше модели), TWIN-LINKED, ANTI, MELTA, RAPID FIRE, BLAST, LANCE, HEAVY, укрытие', () => {
  const t = (o: Partial<WeaponInput>, sit: Situation = {}, tg: Target = MEQ) => simulate([W(o)], tg, sit).weapons[0]!;
  near(t({ keywords: 'torrent', skill: 'N/A' }).pHit, 1);
  near(t({ keywords: 'sustained hits 2' }).expected.hits, 4 / 6 - 1 / 6 + (1 / 6) * 3);
  near(t({ keywords: 'lethal hits' }).expected.wounds, (3 / 6) * (1 / 2) + 1 / 6);
  near(t({ keywords: 'lethal hits: vehicle' }).expected.wounds, (4 / 6) * (1 / 2), 1e-9, 'условие не выполнено');
  near(t({ keywords: 'devastating wounds' }).expected.mortalCrits, (4 / 6) * (1 / 6));
  near(t({ keywords: 'twin-linked' }).pWound, 1 / 2 + (1 / 2) * (1 / 2));
  near(t({ keywords: 'anti-infantry 4+', S: '1' }).pCritWound, 3 / 6);
  near(t({ keywords: 'rapid fire 1' }, { halfRange: true }).attacks, 2);
  near(t({ keywords: 'rapid fire 1' }).attacks, 1);
  near(t({ keywords: 'blast' }, {}, { ...MEQ, models: 10 }).attacks, 3);
  near(t({ keywords: 'lance' }, { charged: true }).pWound, 4 / 6);
  near(t({ keywords: 'heavy' }, { heavy: true }).pHit, 5 / 6);
  near(t({}, { cover: true }).pHit, 3 / 6, 1e-9, 'укрытие ухудшает BS на 1 (13.08)');
  near(t({ keywords: 'ignores cover' }, { cover: true }).pHit, 4 / 6);
  near(t({ melee: true }, { cover: true }).pHit, 4 / 6, 1e-9, 'укрытие — только дальнобойные');
  // MELTA 2 на половине дальности: D1 → D3, по W3 одна непройденная рана убивает модель
  const melta = simulate([W({ keywords: 'melta 2', skill: '2', S: '9', AP: '-4', count: 1 })], { ...MEQ, W: 3 }, { halfRange: true });
  near(melta.slain[1]!, (5 / 6) * (5 / 6), 1e-9, 'попадание 2+, ранение 2+, спасброска нет (3+ с AP-4)');
  // DEVASTATING WOUNDS: смертельные раны одного крита — не больше одной модели (D3 по W1)
  const dev = simulate([W({ keywords: 'devastating wounds', skill: '2', S: '1', D: '3', count: 1 })], { ...MEQ, W: 1, Sv: 2, inv: 2 });
  near(dev.slain[1]!, (5 / 6) * (1 / 6));
  assert.equal(dev.slain[2], 0);
  // неизвестное — в notCounted
  assert.deepEqual(t({ keywords: 'hazardous, precision, assault' }).notCounted, ['hazardous', 'precision']);
});

test('спасбросок: лучший из Sv с AP и InSv; Feel No Pain', () => {
  const t = (o: Partial<WeaponInput>, tg: Target) => simulate([W(o)], tg).weapons[0]!;
  near(t({ AP: '-3' }, { ...MEQ, inv: 4 }).pUnsaved, 3 / 6);
  near(t({ AP: '-1' }, { ...MEQ, inv: 4 }).pUnsaved, 3 / 6, 1e-9, '3+ с AP-1 → 4+, как InSv');
  near(t({ AP: '0' }, { ...MEQ, Sv: 2, inv: 4 }).pUnsaved, 1 / 6);
  const fnp = simulate([W({ skill: '2', S: '8', AP: '-6', D: '1' })], { ...MEQ, W: 1, fnp: 5 });
  near(fnp.slain[1]!, (5 / 6) * (5 / 6) * 1 * (4 / 6));
});

// ---------- проверка бросками: независимая простая реализация ----------
function rng(seed: number) {
  // mulberry32 — равномерный D6 (младшие биты простого LCG для % 6 не годятся)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6) + 1;
  };
}
function rollDice(expr: string, d6: () => number): number {
  const m = expr.toUpperCase().match(/^(\d*)D(3|6)(?:\+(\d+))?$/);
  if (!m) return Number(expr);
  let s = Number(m[3] ?? 0);
  for (let i = 0; i < Number(m[1] || 1); i++) s += m[2] === '3' ? Math.ceil(d6() / 2) : d6();
  return s;
}
function rollOnce(w: WeaponInput, tg: Target, sit: Situation, d6: () => number): number {
  const k = parseWeaponKeywords(w.keywords, tg);
  const skill = Math.min(6, Number(w.skill) + (sit.cover && !w.melee && !k.ignoresCover ? 1 : 0));
  let models = tg.models;
  let wl = tg.W;
  let dev = 0;
  const hitWound = () => {
    let f = d6();
    if (f === 1 || (f < 6 && f < Number(woundTarget(Number(w.S), tg.T)))) if (k.twin) f = d6();
    if (f === 1) return 'fail';
    if (f >= (k.anti ?? 6)) return 'crit';
    return f >= woundTarget(Number(w.S), tg.T) ? 'wound' : 'fail';
  };
  const damage = (d: number) => {
    if (models <= 0) return;
    let lost = 0;
    for (let i = 0; i < d; i++) if (tg.fnp == null || d6() < tg.fnp) lost++;
    if (lost >= wl) (models--, (wl = tg.W));
    else wl -= lost;
  };
  const saveFails = () => {
    const f = d6();
    if (f === 1) return true;
    return !((tg.inv != null && f >= tg.inv) || f + Number(w.AP) >= tg.Sv);
  };
  const D = () => rollDice(w.D, d6);
  for (let m = 0; m < w.count; m++) {
    let n = rollDice(w.A, d6) + (k.rapid && sit.halfRange ? 1 : 0) + k.blast * Math.floor(tg.models / 5);
    while (n-- > 0) {
      const f = k.torrent ? 2 : d6();
      const crit = !k.torrent && f === 6;
      const hit = k.torrent || (f !== 1 && (crit || f >= skill));
      if (!hit) continue;
      const hits: ('roll' | 'auto')[] = [crit && k.lethal ? 'auto' : 'roll'];
      if (crit && k.sustained) for (let i = 0; i < rollDice(String(k.sustained.length - 1), d6); i++) hits.push('roll');
      for (const h of hits) {
        const r = h === 'auto' ? 'wound' : hitWound();
        if (r === 'fail') continue;
        if (r === 'crit' && k.dev) {
          dev++;
          continue;
        }
        if (saveFails()) damage(D());
      }
    }
  }
  for (let i = 0; i < dev; i++) damage(D());
  return tg.models - models;
}

test('проверка бросками: 200 000 атак независимой реализацией совпадают с точным расчётом (±0,5%)', () => {
  const cases: [WeaponInput, Target, Situation][] = [
    [W({ A: '2', count: 5, keywords: 'sustained hits 1, lethal hits', D: '2', AP: '-1' }), MEQ, {}],
    [W({ A: 'D6', count: 2, skill: '4', S: '5', keywords: 'devastating wounds, twin-linked', D: '1' }), { ...MEQ, models: 10, W: 1, Sv: 4, fnp: 6 }, { cover: true }],
    [W({ A: '3', count: 3, skill: '3', S: '6', AP: '-2', D: 'D3', keywords: 'anti-infantry 4+, blast' }), { ...MEQ, models: 6, W: 3, inv: 5 }, {}],
  ];
  for (const [w, tg, sit] of cases) {
    const exact = simulate([w], tg, sit);
    const d6 = rng(12345);
    const N = 200_000;
    const hist = Array(tg.models + 1).fill(0);
    for (let i = 0; i < N; i++) hist[rollOnce(w, tg, sit, d6)]++;
    hist.forEach((c, k) => near(c / N, exact.slain[k]!, 0.005, `${w.keywords} k=${k}`));
  }
});

test('все профили оружия всех армий считаются без ошибок (цель — 5 Marines)', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', 'backend', 'roster-data', 'f');
  const bad: string[] = [];
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const F = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const d of F.datasheets) {
      if (d.group !== 'own') continue;
      for (const w of d.weapons)
        for (const p of w.profiles) {
          n++;
          const r = simulate([{ name: p.name, melee: p.type === 'Melee', A: p.A, skill: p.skill, S: p.S, AP: p.AP, D: p.D, keywords: p.keywords, count: 1 }], MEQ, { halfRange: true });
          const sum = r.slain.reduce((a, b) => a + b, 0);
          if (r.error || Math.abs(sum - 1) > 1e-6) bad.push(`${f} ${d.name} / ${p.name}: ${r.error ?? 'сумма ' + sum} (A ${p.A}, S ${p.S}, AP ${p.AP}, D ${p.D})`);
        }
    }
  }
  assert.ok(n > 5000, String(n));
  assert.deepEqual(bad.slice(0, 20), []);
});
