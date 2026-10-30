import { computeAos, rorUnitsOf, unitTotal, type AosLookup } from './engine';
import { auxiliarySurcharge } from './rules';
import type { AosRoster, AosUnit } from './types';

const pts = (n: number) => `${n} pts`;

function unitLines(u: AosUnit, L: AosLookup, isGeneral: boolean): string[] {
  const ws = L.ws.get(u.warscrollId);
  if (!ws) return [`${u.warscrollId} (?)`];
  const out = [`${ws.name} (${pts(unitTotal(u, L))})`];
  if (isGeneral) out.push('• General');
  if (u.reinforced) out.push(`• Reinforced (${ws.unitSize * 2} models)`);
  for (const id of Object.values(u.enhancements)) {
    const ref = L.enh.get(id);
    if (!ref) continue;
    const label = ref.type.key === 'heroic' ? 'Heroic Trait' : ref.type.key === 'artefact' ? 'Artefact' : ref.table.name;
    out.push(`• ${label}: ${ref.item.name}${ref.item.points ? ` (${pts(ref.item.points)})` : ''}`);
  }
  return out;
}

/** Формат в духе официального приложения Warhammer Age of Sigmar. */
export function exportAos(r: AosRoster, L: AosLookup): string {
  const c = computeAos(r, L);
  const out: string[] = [];
  out.push(`${r.name} ${c.points.total}/${r.pointsLimit} pts`, '');
  out.push(L.faction.name);
  const f = r.formationId ? L.formation.get(r.formationId) : null;
  if (f) out.push(`Battle Formation: ${f.name}${f.points ? ` (${pts(f.points)})` : ''}`);
  out.push("General's Handbook 2026-27");
  out.push(`Drops: ${c.drops}`);
  const lore = (kind: 'spell' | 'prayer' | 'manifestation', label: string) => {
    const l = r.lores[kind] ? L.lore.get(r.lores[kind]!) : null;
    if (l) out.push(`${label} - ${l.name}${l.points ? ` (${pts(l.points)})` : ''}`);
  };
  lore('spell', 'Spell Lore');
  lore('prayer', 'Prayer Lore');
  lore('manifestation', 'Manifestation Lore');
  out.push('');
  const regs = [...r.regiments].sort((a, b) => (a.leader.uid === r.generalUid ? -1 : b.leader.uid === r.generalUid ? 1 : 0));
  let n = 0;
  for (const g of regs) {
    const general = g.leader.uid === r.generalUid;
    out.push(general ? "General's Regiment" : `Regiment ${++n}`);
    out.push(...unitLines(g.leader, L, general));
    for (const u of g.units) out.push(...unitLines(u, L, false));
    out.push('');
  }
  if (r.auxiliaries.length) {
    out.push('Auxiliary Units');
    for (const u of r.auxiliaries) out.push(...unitLines(u, L, false));
    const s = auxiliarySurcharge(r.auxiliaries.length);
    if (s) out.push(`• Auxiliary surcharge: +${pts(s)}`);
    out.push('');
  }
  if (r.ror) {
    const ror = L.ror.get(r.ror.id);
    if (ror) {
      out.push('Regiment of Renown', `${ror.name} (${pts(c.points.ror)})`);
      for (const u of rorUnitsOf(r, L)) out.push(`• ${u.count > 1 ? u.count + 'x ' : ''}${u.ws.name}`);
      out.push('');
    }
  }
  if (r.terrainId) {
    const t = L.ws.get(r.terrainId);
    if (t) out.push('Faction Terrain', `${t.name} (${pts(t.cost ?? 0)})`, '');
  }
  out.push(`Created with WarpHub WarpBuilder (data: Wahapedia, ${r.dataVersion ?? '?'})`);
  return out.join('\n');
}

/** Короткий формат для чата Telegram. */
export function exportAosCompact(r: AosRoster, L: AosLookup): string {
  const c = computeAos(r, L);
  const out: string[] = [];
  const f = r.formationId ? L.formation.get(r.formationId)?.name : null;
  out.push(`⚔️ ${r.name} — ${c.points.total}/${r.pointsLimit}`);
  out.push([L.faction.name, f].filter(Boolean).join(' · '), '');
  const line = (u: AosUnit, prefix: string) => {
    const ws = L.ws.get(u.warscrollId);
    const bits: string[] = [];
    if (u.uid === r.generalUid) bits.push('General');
    if (u.reinforced) bits.push('Reinforced');
    for (const id of Object.values(u.enhancements)) {
      const e = L.enh.get(id);
      if (e) bits.push(e.item.name);
    }
    return `${prefix}${ws?.name ?? '?'}${bits.length ? ` (${bits.join(', ')})` : ''} — ${unitTotal(u, L)}`;
  };
  for (const g of r.regiments) {
    out.push(line(g.leader, '• '));
    for (const u of g.units) out.push(line(u, '   ↳ '));
  }
  for (const u of r.auxiliaries) out.push(line(u, '◦ '));
  if (r.ror) {
    const ror = L.ror.get(r.ror.id);
    if (ror) out.push(`★ ${ror.name} — ${c.points.ror}`);
  }
  return out.join('\n');
}
