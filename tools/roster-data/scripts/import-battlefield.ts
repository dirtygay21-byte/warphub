/**
 * Карты «Поле боя» для Roster Builder: 45 раскладок террейна Chapter Approved 11-й редакции
 * и 6 карт деплоя из 40kdc-data → backend/roster-data/battlefield.json (готовые многоугольники в дюймах).
 *
 *   npm run battlefield -- --src <папка 40kdc-data>      (по умолчанию ./40kdc-data)
 *
 * Источник: 40kdc-data v1.4.5 (Alpaca Software и участники 40kdc), CC BY 4.0 / MIT + attribution.
 * Геометрия раскладок в 40kdc импортирована из Battlemaster (battlemaster.online) с разрешения.
 * Изменения: координаты пересчитаны в абсолютные многоугольники и округлены до 0,01″, лишние поля убраны.
 * Powered by 40kdc-data — https://40kdc.alpacasoft.dev
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLayout, type TerrainTemplate, type TerrainLayout, type Vec2 } from '../vendor/40kdc-resolve';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const SRC = path.resolve(arg('--src', path.join(here, '..', '40kdc-data')));
const OUT = path.resolve(arg('--out', path.join(here, '..', '..', '..', 'backend', 'roster-data', 'battlefield.json')));
const core = (f: string) => JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'core', f), 'utf8'));

const r2 = (n: number) => Math.round(n * 100) / 100;
const pts = (vs: Vec2[]) => vs.map((v) => [r2(v.x), r2(v.y)] as [number, number]);

/** Упрощение контура (Дуглас — Пекер): волнистые края ковриков не видны на экране телефона. */
function simplify(vs: Vec2[], tol: number): Vec2[] {
  if (vs.length <= 4) return vs;
  const keep = new Uint8Array(vs.length);
  keep[0] = keep[vs.length - 1] = 1;
  const stack: [number, number][] = [[0, vs.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = vs[a]!, B = vs[b]!;
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1e-9;
    let best = -1, far = 0;
    for (let i = a + 1; i < b; i++) {
      const P = vs[i]!;
      const d = len < 1e-6 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len;
      if (d > far) { far = d; best = i; }
    }
    if (best > 0 && far > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return vs.filter((_, i) => keep[i]);
}

type Shape = { type: string; width?: number; height?: number; points?: Vec2[] };
type Region = { player: string; shape: Shape; position: Vec2 };
const shapePoints = (s: Shape, p: Vec2): Vec2[] =>
  s.type === 'rectangle'
    ? [
        { x: p.x, y: p.y },
        { x: p.x + (s.width ?? 0), y: p.y },
        { x: p.x + (s.width ?? 0), y: p.y + (s.height ?? 0) },
        { x: p.x, y: p.y + (s.height ?? 0) },
      ]
    : (s.points ?? []).map((q) => ({ x: p.x + q.x, y: p.y + q.y }));

// Русские названия типов армии (Force Disposition); английские — как на картах GW.
const DISPOSITION_RU: Record<string, string> = {
  'take-and-hold': 'Захват и удержание',
  'purge-the-foe': 'Уничтожение врага',
  disruption: 'Дезорганизация',
  reconnaissance: 'Разведка',
  'priority-assets': 'Приоритетные цели',
};
const DEPLOYMENT_RU: Record<string, string> = {
  'tipping-point': 'Точка перелома',
  'hammer-and-anvil': 'Молот и наковальня',
  'sweeping-engagement': 'Широкий фронт',
  'dawn-of-war': 'Рассвет войны',
  'crucible-of-battle': 'Горнило битвы',
  'search-and-destroy': 'Найти и уничтожить',
};

const templates = core('terrain-templates.json') as TerrainTemplate[];
const tplById = new Map(templates.map((t) => [t.id, t]));
const layoutsRaw = (core('terrain-layouts.json') as (TerrainLayout & Record<string, any>)[]).filter((l) => l.source === 'battlemaster-11e');
const patterns = core('deployment-patterns.json') as any[];
const dispositions = core('force-dispositions.json') as { id: string; name: string }[];
const missions = core('missions.json') as { id: string; name: string }[];
const matchups = core('mission-matchups.json') as { id: string; disposition: string; opponent_disposition: string; mission_id: string }[];

const usedPatterns = new Set(layoutsRaw.map((l) => l.deployment_pattern_id));
const deployments = patterns
  .filter((p) => usedPatterns.has(p.id))
  .map((p) => ({
    id: p.id,
    name: p.name,
    nameRu: DEPLOYMENT_RU[p.id] ?? p.name,
    zones: (p.zones as Region[]).map((z) => ({ player: z.player, poly: pts(shapePoints(z.shape, z.position)) })),
    territories: ((p.territories ?? []) as Region[]).map((z) => ({ player: z.player, poly: pts(shapePoints(z.shape, z.position)) })),
  }));

const matchupById = new Map(matchups.map((m) => [m.id, m]));

const layouts = layoutsRaw.map((l) => {
  const resolved = resolveLayout(l, templates);
  // категория «плотный/лёгкий» хранится на шаблоне участка; детали (стены руин) идут следом за участком
  const pieces = resolved.map((rp) => ({
    kind: rp.piece_type,
    cat: rp.terrain_category ?? null,
    floor: rp.floor || undefined,
    poly: pts(rp.piece_type === 'area' ? simplify(rp.vertices, 0.1) : rp.vertices),
    walls: rp.walls?.length ? rp.walls.map((w) => pts(w.points)) : undefined,
  }));
  // участок (area) окрашивается по террейну внутри него: идущие следом детали шаблона дают «плотный/лёгкий»
  let i = 0;
  for (const p of l.pieces ?? []) {
    const tpl = p.template ? tplById.get(p.template) : undefined;
    const n = !p.parent_area_id && tpl?.features ? tpl.features.length : 0;
    const area = pieces[i];
    if (area && !area.cat) {
      const cats = pieces.slice(i + 1, i + 1 + n).map((f) => f.cat);
      area.cat = tpl?.terrain_category ?? (cats.includes('dense') ? 'dense' : cats.includes('light') ? 'light' : null);
    }
    i += 1 + n;
  }
  // Размеры для расстановки (keystones): от края поля до угла или грани элемента, как на картах GW.
  // Индекс вершины ссылается на полный (неупрощённый) контур, поэтому считаем по resolved.
  const guides: { edge: string; piece: number; at: [number, number]; d: number }[] = [];
  let cur = 0;
  for (const p of (l.pieces ?? []) as any[]) {
    const rp = resolved[cur]!;
    const pieceIdx = cur;
    const tpl = p.template ? tplById.get(p.template) : undefined;
    cur += 1 + (!p.parent_area_id && tpl?.features ? tpl.features.length : 0);
    for (const k of (p.keystones ?? []) as { edge: string; ref: { kind: string; index?: number; side?: string } }[]) {
      const onX = k.edge === 'left' || k.edge === 'right';
      const xs = rp.vertices.map((v) => v.x);
      const ys = rp.vertices.map((v) => v.y);
      let at: Vec2;
      if (k.ref.kind === 'vertex') {
        const v = rp.vertices[k.ref.index!];
        if (!v) throw new Error(`${l.id}: keystone вне контура (${p.id})`);
        at = v;
      } else {
        const min = k.ref.side!.startsWith('min');
        at = onX
          ? { x: min ? Math.min(...xs) : Math.max(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2 }
          : { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: min ? Math.min(...ys) : Math.max(...ys) };
      }
      const c = onX ? at.x : at.y;
      const raw = k.edge === 'left' || k.edge === 'top' ? c : (onX ? 60 : 44) - c;
      // как на карточках: у элементов, стоящих ровно по осям, — с шагом ¼″, у повёрнутых — до сотых
      const rot = ((((p.rotation_degrees ?? 0) % 360) + 360) % 360) % 90;
      const cardinal = Math.min(rot, 90 - rot) < 0.01;
      const d = cardinal ? Math.round(raw * 4) / 4 : r2(raw);
      guides.push({ edge: k.edge, piece: pieceIdx, at: [r2(at.x), r2(at.y)], d: Object.is(d, -0) ? 0 : d });
    }
  }
  // маркеры целей: по одному на link_group
  const groups = new Map<string, { at: Vec2[]; role?: string }>();
  (l.pieces ?? []).forEach((p: any, idx: number) => {
    if (!p.is_objective && !p.objective_role) return;
    const key = p.link_group ? 'g:' + p.link_group : 'p:' + (p.id ?? idx);
    const g = groups.get(key) ?? { at: [] as Vec2[] };
    g.at.push(p.objective?.position ?? p.position);
    g.role ??= p.objective_role;
    groups.set(key, g);
  });
  const objectives = [...groups.values()].map((g) => ({
    x: r2(g.at.reduce((s, v) => s + v.x, 0) / g.at.length),
    y: r2(g.at.reduce((s, v) => s + v.y, 0) / g.at.length),
    role: g.role ?? null,
  }));
  const m = matchupById.get(l.mission_matchup_id);
  if (!m) throw new Error(`Нет mission matchup для ${l.id}`);
  return {
    id: l.id,
    pair: [m.disposition, m.opponent_disposition].sort() as [string, string],
    variant: l.variant as number,
    deployment: l.deployment_pattern_id as string,
    pieces,
    objectives,
    guides,
  };
});

layouts.sort((a, b) => a.pair.join().localeCompare(b.pair.join()) || a.variant - b.variant);

const out = {
  source: {
    name: '40kdc-data',
    version: JSON.parse(fs.readFileSync(path.join(SRC, 'tools', 'package.json'), 'utf8')).version,
    credit: 'Powered by 40kdc-data',
    url: 'https://40kdc.alpacasoft.dev',
    license: 'CC BY 4.0 — Alpaca Software и участники 40kdc; геометрия раскладок — Battlemaster',
    changes: 'Пересчитано в абсолютные многоугольники для WarpHub',
  },
  board: { width: 60, height: 44 },
  dispositions: dispositions.map((d) => ({ id: d.id, name: d.name, nameRu: DISPOSITION_RU[d.id] ?? d.name })),
  missions: Object.fromEntries(missions.map((m) => [m.id, m.name])),
  matchups: matchups.map((m) => ({ you: m.disposition, foe: m.opponent_disposition, mission: m.mission_id })),
  deployments,
  layouts,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const pairs = new Set(layouts.map((l) => l.pair.join('|')));
console.log(`battlefield.json: ${layouts.length} раскладок, ${pairs.size} пар, ${deployments.length} деплоев, ${(fs.statSync(OUT).size / 1024).toFixed(0)} КБ → ${OUT}`);
