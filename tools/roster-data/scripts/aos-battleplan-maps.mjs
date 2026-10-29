// Карты батлпланов GH 2026-27 → backend/roster-data/aos/battlepack.json (battleplans[].map), S3 30.10.2026.
// Источник — снимок Sigdex (aos/sigdex-battleplans-2026-27.json). Зеркала раскрываются как в Sigdex:
// x → (60−x, y), y → (x, 44−y), both → (60−x, 44−y). Территории: Sigdex подписывает их attacker/defender, но по GH
// 2026-27 атакующий сам выбирает территорию («the attacker picks which territory is their territory») — поэтому A и B.
// Цель «sigmarite» в Sigdex = «Scions of the Comet» в GH (Wahapedia): 6 целей — 2 Sun Seekers, 2 Golden Lions,
// 1 Heldenhain, 1 Scions of the Comet. Размер террейна (радиус 2,5″ / 3,5″) — условное изображение Sigdex, не правило.
// Запуск: node scripts/aos-battleplan-maps.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SNAP = path.join(HERE, '../aos/sigdex-battleplans-2026-27.json');
const BP = path.join(HERE, '../../../backend/roster-data/aos/battlepack.json');
const W = 60, H = 44;
const OBJ = { sun_seekers: 'sun-seekers', golden_lions: 'golden-lions', heldenhain: 'heldenhain', sigmarite: 'scions' };
const TERRAIN = { ruin: 'ruin', obscuring: 'obscuring', place_of_power: 'place-of-power' };
const RADIUS = { small: 2.5, medium: 3.5 };
const mirror = (p, m) => (m === 'x' ? { x: W - p.x, y: p.y } : m === 'y' ? { x: p.x, y: H - p.y } : m === 'both' ? { x: W - p.x, y: H - p.y } : null);
// зеркало точки на оси (например y = 22 при mirror y) даёт ту же точку — в Sigdex она рисуется дважды, здесь одна
const expand = (list) => {
  const seen = new Set();
  return list
    .flatMap((p) => [p, ...(p.mirror ? [{ ...p, ...mirror(p, p.mirror) }] : [])])
    .filter((p) => {
      const k = `${p.type}|${p.size ?? ''}|${p.x}|${p.y}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
};

export function buildMap(src) {
  const objectives = expand(src.objectives).map((o) => {
    if (!OBJ[o.type]) throw new Error(`неизвестная цель ${o.type}`);
    return { type: OBJ[o.type], x: o.x, y: o.y };
  });
  const terrain = expand(src.terrain).map((t) => {
    if (!TERRAIN[t.type] || !RADIUS[t.size]) throw new Error(`неизвестный террейн ${t.type}/${t.size}`);
    return { type: TERRAIN[t.type], r: RADIUS[t.size], x: t.x, y: t.y };
  });
  const rect = (z) => [Math.min(z.x1, z.x2), Math.min(z.y1, z.y2), Math.abs(z.x2 - z.x1), Math.abs(z.y2 - z.y1)];
  const territories = {
    A: src.zones.filter((z) => z.type === 'attacker').map(rect),
    B: src.zones.filter((z) => z.type === 'defender').map(rect),
  };
  return { objectives, terrain, territories };
}

const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const bp = JSON.parse(fs.readFileSync(BP, 'utf8'));
const key = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map(Object.entries(snap.battleplans).map(([k, v]) => [key(k), v]));
let changed = 0;
const maps = new Map();
for (const p of bp.battleplans) {
  const src = byName.get(key(p.name));
  if (!src) throw new Error(`нет карты для «${p.name}»`);
  const map = buildMap(src.map);
  if (JSON.stringify(p.map) !== JSON.stringify(map)) changed++;
  maps.set(p.n, map);
}
if (process.argv.includes('--check')) {
  console.log(changed ? `карты устарели: ${changed}` : 'карты актуальны');
  process.exit(changed ? 1 : 0);
}
// правка текста, а не перезапись: файл оформлен вручную (короткие записи в строку)
let text = fs.readFileSync(BP, 'utf8');
const lines = text.split('\n');
for (const [n, map] of maps) {
  let i = lines.findIndex((l) => l.startsWith(`    { "n": ${n}, `));
  if (i < 0) throw new Error(`батлплан ${n}: строка не найдена`);
  while (!/\] \},?$|"map": /.test(lines[i])) i++;
  if (/^\s+"map": /.test(lines[i])) {
    lines[i] = lines[i].replace(/"map": .*?( \},?)$/, `"map": ${JSON.stringify(map)}$1`);
  } else {
    const comma = lines[i].endsWith(',');
    lines[i] = lines[i].replace(/ \},?$/, ',');
    lines.splice(i + 1, 0, `      "map": ${JSON.stringify(map)} }${comma ? ',' : ''}`);
  }
}
text = lines.join('\n');
const MAPS = `sigdex.io (данные BSData), снимок ${snap.checked}: tools/roster-data/aos/sigdex-battleplans-2026-27.json; территории A и B — атакующий выбирает свою; размер террейна условный`;
if (!text.includes('"maps": ')) text = text.replace(/(\n    "note": "[^\n]*)"\n/, (m, a) => `${a.replace(/ Положения целей и террейна на картах — отдельный этап \(S3\): в источнике только картинки\./, ' Карты батлпланов — по Sigdex (source.maps).')}",\n    "maps": ${JSON.stringify(MAPS)}\n`);
JSON.parse(text);
fs.writeFileSync(BP, text);
console.log(`карты: ${maps.size}, изменено ${changed}`);
