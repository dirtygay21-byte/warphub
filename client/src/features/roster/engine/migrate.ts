/**
 * Перевод сохранённого ростера на обновлённые данные: id инфолистов, детачментов и улучшений, которых больше нет,
 * заменяются по таблице FactionData.migrations (её строят скрипты tools/roster-data из сопоставления с источником).
 *
 * Правила:
 *  - совместимые выборы переносятся: размер отряда, платные добавки и снаряжение — если такие же есть у нового инфолиста;
 *    выбранные замены снаряжения — только если таблица подтверждает, что варианты не изменились (keepPicks);
 *  - несовместимые выборы не удаляются молча: они откладываются в unit.migration.dropped, юнит получает предупреждение
 *    (computeRoster), игрок видит, что было выбрано, и выбирает заново;
 *  - записи без замены не трогаются (computeRoster сообщит, что инфолист/детачмент не найден);
 *  - инфолист с тем же id, но с изменёнными вариантами снаряжения (migrations.options): совместимые по смыслу выборы
 *    переводятся на новые варианты, остальные откладываются с пояснением — один раз: источник обновления
 *    запоминается в roster.appliedMigrations, повторное открытие и сохранение выборы не сбрасывает;
 *  - устаревшие детачменты и улучшения, которые есть в ростере, запоминаются в roster.legacyKept — после случайного
 *    удаления их можно вернуть (только в этом ростере);
 *  - повторный запуск ничего не меняет.
 */
import type { DataLookup } from './compute';
import { remapPicks } from './options-remap';
import type { CostBand, Datasheet, IdMigration, Roster, RosterUnit, UnitMigration } from './types';

const MAX_CHAIN = 10;

/** Конечная замена id по таблице (цепочки A→B→C), только если цель есть в данных. */
export function resolveId(id: string, table: Record<string, IdMigration> | undefined, exists: (id: string) => boolean): IdMigration | null {
  if (!table || exists(id)) return null;
  let cur = id;
  let first: IdMigration | null = null;
  let keep = true;
  for (let i = 0; i < MAX_CHAIN; i++) {
    const m = table[cur];
    if (!m || m.to === id) return null;
    first ??= m;
    keep &&= !!m.keepPicks;
    cur = m.to;
    if (exists(cur)) return { ...first, to: cur, keepPicks: keep };
  }
  return null;
}

const bandsOf = (ds: Datasheet): CostBand[] => [...ds.costs, ...(ds.costVariants ?? []).flatMap((v) => v.costs)];
const split = (counts: Record<string, number>, ok: Set<string>) => {
  const keep: Record<string, number> = {};
  const drop: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts)) (ok.has(k) ? keep : drop)[k] = n;
  return { keep, drop };
};
const nonEmpty = <T extends object>(o: T | null | undefined): o is T => !!o && Object.keys(o).length > 0;

/** Перевод одного юнита на новый инфолист. */
export function migrateUnit(unit: RosterUnit, m: IdMigration, ds: Datasheet): RosterUnit {
  const bands = bandsOf(ds);
  const sizes = new Set(bands.flatMap((b) => b.options.map((o) => o.label)));
  const dropped: UnitMigration['dropped'] = {};
  let size = unit.size;
  if (!sizes.has(size)) {
    if (size) dropped.size = size;
    size = ds.costs[0]?.options[0]?.label ?? '';
  }
  const addons = split(unit.addons, new Set(bands.flatMap((b) => b.addons.map((a) => a.label))));
  const wargear = split(unit.wargear, new Set(bands.flatMap((b) => b.wargear.map((a) => a.label))));
  if (nonEmpty(addons.drop)) dropped.addons = addons.drop;
  if (nonEmpty(wargear.drop)) dropped.wargear = wargear.drop;
  let picks = unit.picks ?? null;
  let weapons = unit.weapons ?? null;
  if (!m.keepPicks) {
    if (nonEmpty(picks)) dropped.picks = picks;
    if (nonEmpty(weapons)) dropped.weapons = weapons;
    picks = null;
    weapons = null;
  }
  return {
    ...unit,
    datasheetId: ds.id,
    size,
    addons: addons.keep,
    wargear: wargear.keep,
    picks,
    weapons,
    migration: { from: unit.datasheetId, reason: m.reason, note: m.note, dropped },
  };
}

export interface MigrationResult {
  roster: Roster;
  changed: boolean;
}

/** Перевести ростер на текущие данные. Без изменений — возвращает тот же объект. */
export function migrateRoster(roster: Roster, L: DataLookup): MigrationResult {
  const mig = L.faction.migrations;
  let changed = false;
  let next = roster;
  if (mig) {
    const notes = [...(roster.migrationNotes ?? [])];
    // перевод выборов снаряжения — только для ростеров, собранных до этого обновления
    const optionsDue = !!mig.options && !(roster.appliedMigrations ?? []).includes(mig.source);
    const units = roster.units.map((u) => {
      let unit = u;
      const m = resolveId(u.datasheetId, mig.datasheets, (id) => L.ds.has(id));
      if (m) {
        unit = migrateUnit(u, m, L.ds.get(m.to)!);
        changed = true;
      } else if (optionsDue && mig.options![u.datasheetId] && nonEmpty(u.picks)) {
        const remap = mig.options![u.datasheetId]!;
        const r = remapPicks(u.picks, remap);
        const dropped = nonEmpty(r.dropped) ? r.dropped : null;
        unit = {
          ...u,
          picks: nonEmpty(r.picks) ? r.picks : null,
          ...(dropped ? { migration: { from: u.datasheetId, reason: 'options' as const, note: remap.note, dropped: { picks: dropped } } } : {}),
        };
        changed = true;
      }
      if (unit.enhancementId) {
        const e = resolveId(unit.enhancementId, mig.enhancements, (id) => L.enh.has(id));
        if (e) {
          notes.push({ from: unit.enhancementId, to: e.to, kind: 'enhancement', note: e.note });
          unit = { ...unit, enhancementId: e.to };
          changed = true;
        }
      }
      return unit;
    });

    const detachmentIds: string[] = [];
    for (const id of roster.detachmentIds) {
      const d = resolveId(id, mig.detachments, (x) => L.det.has(x));
      if (d) {
        notes.push({ from: id, to: d.to, kind: 'detachment', note: d.note });
        changed = true;
      }
      const to = d?.to ?? id;
      if (!detachmentIds.includes(to)) detachmentIds.push(to);
      else changed = true;
    }
    const applied = mig.options && optionsDue ? [...(roster.appliedMigrations ?? []), mig.source] : roster.appliedMigrations;
    if (applied !== roster.appliedMigrations) changed = true;
    if (changed) next = { ...roster, units, detachmentIds, migrationNotes: notes, ...(applied ? { appliedMigrations: applied } : {}) };
  }
  const kept = rememberLegacy(next, L);
  if (kept) {
    next = { ...next, legacyKept: kept };
    changed = true;
  }
  return changed ? { roster: next, changed: true } : { roster, changed: false };
}

/** Устаревшие детачменты и улучшения ростера, которых ещё нет в legacyKept; null — добавлять нечего. */
export function rememberLegacy(roster: Roster, L: DataLookup): NonNullable<Roster['legacyKept']> | null {
  const prev = roster.legacyKept ?? { detachments: [], enhancements: [] };
  const dets = roster.detachmentIds.filter((id) => L.det.get(id)?.outdated && !prev.detachments.includes(id));
  const enhs = [...new Set(roster.units.map((u) => u.enhancementId).filter((id): id is string => !!id && !!L.enh.get(id)?.outdated && !prev.enhancements.includes(id)))];
  if (!dets.length && !enhs.length) return null;
  return { detachments: [...prev.detachments, ...dets], enhancements: [...prev.enhancements, ...enhs] };
}

/** id устаревших записей, которые этот ростер может выбрать снова (уже выбранные + запомненные). */
export const legacyIds = (roster: Pick<Roster, 'detachmentIds' | 'legacyKept'>): { detachments: string[]; enhancements: string[] } => ({
  detachments: [...new Set([...roster.detachmentIds, ...(roster.legacyKept?.detachments ?? [])])],
  enhancements: roster.legacyKept?.enhancements ?? [],
});

/** Краткое описание отложенных выборов для предупреждения. */
export function droppedSummary(d: UnitMigration['dropped']): string[] {
  const out: string[] = [];
  if (d.size) out.push(`размер «${d.size}»`);
  for (const [k, n] of Object.entries({ ...(d.addons ?? {}), ...(d.wargear ?? {}) })) out.push(`${k} ×${n}`);
  if (nonEmpty(d.picks) || nonEmpty(d.weapons)) out.push('выбранные замены снаряжения');
  return out;
}
