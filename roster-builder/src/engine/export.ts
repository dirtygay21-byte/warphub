import { BATTLE_SIZES } from './rules';
import { roleGroup, type ComputedRoster, type ComputedUnit, type DataLookup } from './compute';
import type { Roster } from './types';

const pts = (n: number) => n.toLocaleString('en-US');

function joinAnd(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

function unitLines(c: ComputedUnit, roster: Roster, extra: string[] = []): string[] {
  const ds = c.ds!;
  const lines = [`${ds.name} (${pts(c.total)} Points)`];
  for (const e of extra) lines.push(`• ${e}`);
  if (roster.warlordUid === c.unit.uid) lines.push('• Warlord');
  const opt = c.band?.options.find((o) => o.label === c.unit.size);
  if (opt && (c.band!.options.length > 1 || opt.models > 1)) lines.push(`• ${opt.label}`);
  for (const [label, n] of Object.entries(c.unit.addons)) if (n > 0) lines.push(`• ${n}x ${label}`);
  for (const [label, n] of Object.entries(c.unit.wargear)) if (n > 0) lines.push(`• ${n}x ${label}`);
  if (c.enhancement) lines.push(`• Enhancement: ${c.enhancement.name}${c.enhancement.upgrade ? ' (Upgrade)' : ''}`);
  return lines;
}

const roleLabel = (c: ComputedUnit) => {
  const g = roleGroup(c);
  return g === 'characters' ? 'Character' : g === 'battleline' ? 'Battleline' : g === 'transports' ? 'Dedicated Transport' : g === 'allies' ? 'Allied' : 'Other';
};

/** Формат, близкий к экспорту официального приложения Warhammer 40,000. */
export function exportGw(roster: Roster, L: DataLookup, cr: ComputedRoster, dataVersion: string | null): string {
  const size = BATTLE_SIZES[roster.battleSize];
  const out: string[] = [];
  out.push(`${roster.name} (${pts(cr.points)} Points)`, '');
  out.push(L.faction.name);
  if (cr.chapter) out.push(cr.chapter);
  if (cr.detachments.length) out.push(`${joinAnd(cr.detachments.map((d) => d.name))} (${cr.dp} Detachment Point${cr.dp === 1 ? '' : 's'})`);
  if (roster.forceDisposition) out.push(roster.forceDisposition);
  out.push(`${size.label} (${pts(size.points)} Points)`, '');

  const valid = cr.units.filter((c) => c.ds);
  const inAttach = new Set<string>();
  const blocks: string[][] = [];
  for (const c of valid) {
    if (!c.attached.length || c.unit.attachedTo) continue;
    const block: string[] = [`Attached unit ${blocks.length + 1}`];
    for (const a of c.attached) {
      const ac = cr.byUid.get(a.uid);
      if (!ac?.ds) continue;
      block.push(...unitLines(ac, roster, [`Attached as: ${ac.ds.support ? 'Support' : 'Leader'} (Character)`]));
      inAttach.add(a.uid);
    }
    block.push(...unitLines(c, roster, [`Attached as: Bodyguard (${roleLabel(c)})`]));
    inAttach.add(c.unit.uid);
    blocks.push(block);
  }
  if (blocks.length) {
    out.push('ATTACHED UNITS');
    for (const b of blocks) out.push(...b, '');
  }
  const sections: [string, ReturnType<typeof roleGroup>][] = [
    ['CHARACTERS', 'characters'],
    ['BATTLELINE', 'battleline'],
    ['DEDICATED TRANSPORTS', 'transports'],
    ['OTHER DATASHEETS', 'other'],
    ['ALLIED UNITS', 'allies'],
  ];
  for (const [title, g] of sections) {
    const list = valid.filter((c) => !inAttach.has(c.unit.uid) && roleGroup(c) === g);
    if (!list.length) continue;
    out.push(title);
    for (const c of list) out.push(...unitLines(c, roster), '');
  }
  out.push(`Exported with WarpHub Roster Builder (data: Wahapedia ${dataVersion ?? '?'})`);
  return out.join('\n');
}

/** Короткий формат для чата Telegram. */
export function exportCompact(roster: Roster, L: DataLookup, cr: ComputedRoster): string {
  const size = BATTLE_SIZES[roster.battleSize];
  const out: string[] = [];
  out.push(`⚔️ ${roster.name} — ${cr.points}/${size.points}`);
  const head = [L.faction.name + (cr.chapter ? ` (${cr.chapter})` : ''), cr.detachments.map((d) => d.name).join(' + ') + ` [${cr.dp} DP]`];
  if (roster.forceDisposition) head.push(roster.forceDisposition);
  out.push(head.join(' · '), '');
  for (const c of cr.units) {
    if (!c.ds || c.unit.attachedTo) continue;
    const line = (x: ComputedUnit, prefix: string) => {
      const bits: string[] = [];
      const opt = x.band?.options.find((o) => o.label === x.unit.size);
      if (opt && opt.models > 1) bits.push(String(opt.models));
      if (roster.warlordUid === x.unit.uid) bits.push('Warlord');
      if (x.enhancement) bits.push(x.enhancement.name);
      for (const [label, n] of [...Object.entries(x.unit.addons), ...Object.entries(x.unit.wargear)]) if (n > 0) bits.push(`${n}× ${label}`);
      return `${prefix}${x.ds!.name}${bits.length ? ` (${bits.join(', ')})` : ''} — ${x.total}`;
    };
    out.push(line(c, '• '));
    for (const a of c.attached) {
      const ac = cr.byUid.get(a.uid);
      if (ac?.ds) out.push(line(ac, '   ↳ '));
    }
  }
  return out.join('\n');
}
