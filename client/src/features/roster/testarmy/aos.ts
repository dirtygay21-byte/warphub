/**
 * Test Army для Age of Sigmar (S4, 30.10.2026): отряды из ростера AoS. Каждый юнит AoS — свой отряд на столе
 * (герои не присоединяются, как в 40K). Моделей — размер юнита (Battle Profile), у усиленного — вдвое больше;
 * база — из Battle Profile (`bases`): «40mm», «90 × 52mm», «Use model» / пусто — размера нет (игрок задаёт сам),
 * у составных юнитов — «Имя: 40mm, 2 x Имя: 28.5mm, Остальные: 25mm» (модели по порядку, последний размер — остальным).
 * Полк славы — его юниты с числом моделей из записи полка. Террейн фракции ростера и манифестации его лора манифестаций
 * (30.10.2026) — тоже на стол, с пометкой; у большинства манифестаций и террейна база «Use model» — размер задаёт игрок.
 */
import { AOS_RULES } from '../aos/rules';
import { placedUnits, rorUnitsOf, unitTotal, type AosLookup } from '../aos/engine';
import type { AosRoster, AosWarscroll } from '../aos/types';
import { parseBase, type BaseInfo } from './bases';
import { DEFAULT_ANGLE, DEFAULT_GAP, type TAModel, type TAUnit } from './state';

export type AosModelSpec = { profile: string; base: BaseInfo };

/** Сколько моделей названо в части строки баз: «2 x A», «1x A, 2x B», «A, B and C» → 3; без перечня — null. */
function countOf(label: string): number | null {
  const explicit = [...label.matchAll(/(\d+)\s*[xх×]\s/gi)].map((m) => Number(m[1]));
  if (explicit.length) return explicit.reduce((a, b) => a + b, 0);
  const names = label.split(/,\s*|\s+and\s+/i).filter((s) => s.trim());
  return names.length > 1 ? names.length : null;
}

/** Базы моделей юнита из строки Battle Profile; n — число моделей. */
export function aosModelSpecs(bases: string | null | undefined, n: number, unitName: string): AosModelSpec[] {
  const text = (bases ?? '').replace(/,?\s*\bOR:.*$/, '').trim();
  const single = parseBase(text);
  // простая строка («40mm», «90 × 52mm») или нет размера — у всех моделей одна база
  if (!/:/.test(text) || !single.options.length) return Array.from({ length: n }, () => ({ profile: unitName, base: single }));
  const parts = [...text.matchAll(/([^:]+?):\s*([\d.,]+\s*(?:[x×]\s*[\d.,]+\s*)?mm[^,]*)(?:,|$)/gi)].map((m) => ({ label: m[1]!.replace(/^[,\s]+/, '').trim(), base: parseBase(m[2]) }));
  if (!parts.length) return Array.from({ length: n }, () => ({ profile: unitName, base: single }));
  const out: AosModelSpec[] = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const k = countOf(p.label) ?? (last ? Math.max(1, n - out.length) : 1);
    for (let j = 0; j < k && out.length < n; j++) out.push({ profile: p.label, base: p.base });
  });
  const tail = parts[parts.length - 1]!;
  while (out.length < n) out.push({ profile: tail.label, base: tail.base });
  return out;
}

function unitOf(uid: string, ws: AosWarscroll, models: number, points: number, tags: string[]): TAUnit {
  let i = 0;
  const specs = aosModelSpecs(ws.bases, models, ws.name);
  const list: TAModel[] = specs.map((m) => ({ id: `${uid}.${i++}`, profile: m.profile, options: m.base.options, source: m.base.source, pick: 0, customMm: null, at: null }));
  return { uid, name: ws.name, leaders: [], ...(tags.length ? { tags } : {}), datasheetIds: [ws.id], points, models: list, formation: 'tight', angle: DEFAULT_ANGLE, gap: DEFAULT_GAP, placed: false };
}

/** Отряды на стол из ростера AoS. prefix — к id отрядов (армия соперника). */
export function buildAosUnits(r: AosRoster, L: AosLookup, prefix = ''): TAUnit[] {
  const out: TAUnit[] = [];
  for (const p of placedUnits(r, L)) {
    if (!p.ws || p.ws.kind !== 'unit') continue;
    const n = p.ws.unitSize * (p.unit.reinforced && p.ws.reinforceable ? AOS_RULES.reinforceMultiplier : 1);
    out.push(unitOf(prefix + p.unit.uid, p.ws, n, unitTotal(p.unit, L), p.unit.reinforced ? ['усилен'] : []));
  }
  rorUnitsOf(r, L).forEach((x, k) => {
    for (let c = 0; c < x.count; c++) out.push(unitOf(`${prefix}ror.${k}.${c}`, x.ws, x.models || x.ws.unitSize, x.points ?? 0, ['полк славы']));
  });
  const terrain = r.terrainId ? L.ws.get(r.terrainId) : undefined;
  if (terrain) out.push(unitOf(`${prefix}terrain.${terrain.id}`, terrain, terrain.unitSize || 1, terrain.cost ?? 0, ['террейн фракции']));
  // манифестации выбранного лора: очки платятся за лор, на столе — призванные заклинанием
  const lore = r.lores.manifestation ? L.lore.get(r.lores.manifestation) : undefined;
  for (const id of lore?.summons ?? []) {
    const ws = L.ws.get(id);
    if (ws) out.push(unitOf(`${prefix}manif.${id}`, ws, ws.unitSize || 1, 0, [`манифестация · ${lore!.name}`]));
  }
  return out;
}
