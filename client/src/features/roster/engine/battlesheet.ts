/**
 * Боевой лист 40K (07.11.2026): стратагемы активного ростера с фильтрами «чей ход» и «фаза», кому из юнитов
 * ростера они доступны, и короткие строки характеристик юнитов. Чистые функции — tests/battlesheet.test.ts;
 * интерфейс — ui/BattleSheet.tsx.
 */
import type { ComputedRoster, DataLookup } from './compute';
import { visibleStratagem } from './source';
import type { Stratagem } from './types';

export type TurnFilter = 'all' | 'mine' | 'opp';
export const PHASES = ['Command', 'Movement', 'Shooting', 'Charge', 'Fight'] as const;
export type PhaseFilter = 'all' | (typeof PHASES)[number];
export const PHASE_LABEL: Record<(typeof PHASES)[number], string> = { Command: 'Командования', Movement: 'Движения', Shooting: 'Стрельбы', Charge: 'Атаки', Fight: 'Ближнего боя' };

/** Чей ход: «Either player’s turn» и пустое значение подходят обоим. */
export function inTurn(st: Pick<Stratagem, 'turn'>, f: TurnFilter): boolean {
  if (f === 'all') return true;
  const t = st.turn.toLowerCase();
  if (!t || t.includes('either')) return true;
  return f === 'opp' ? t.includes('opponent') : !t.includes('opponent');
}

/** Фаза: «Any phase» и пустое значение — любая; «Shooting or Fight phase» — обе. */
export function inPhase(st: Pick<Stratagem, 'phase'>, f: PhaseFilter): boolean {
  if (f === 'all') return true;
  const p = st.phase.toLowerCase();
  return !p || p.includes('any phase') || p.includes(f.toLowerCase());
}

export type SheetStratagem = { st: Stratagem; core: boolean; det: string | null; targets: string[] };

/**
 * Стратагемы ростера: основные, армии и выбранных детачментов (устаревшие — только у выбранного детачмента).
 * targets — юниты ростера, у инфолиста которых эта стратагема в списке (названия, без повторов, по порядку ростера).
 */
export function rosterStratagems(cr: ComputedRoster, L: DataLookup, detachmentIds: string[]): SheetStratagem[] {
  const det = new Set(detachmentIds);
  const units = cr.units.filter((u) => u.ds);
  return L.faction.stratagems
    .filter((st) => (!st.detachment || det.has(st.detachment)) && visibleStratagem(st, L.det))
    .map((st) => ({
      st,
      core: !st.detachment && !st.army,
      det: st.detachment ? (L.det.get(st.detachment)?.name ?? null) : null,
      targets: [...new Set(units.filter((u) => u.ds!.stratagems.includes(st.id)).map((u) => u.ds!.name))],
    }));
}

/** Поиск по названию и тексту (и русскому, если передан). */
export function matchStratagem(s: SheetStratagem, q: string, ru?: { name?: string; text?: string } | null): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [s.st.name, s.st.text, ru?.name ?? '', ru?.text ?? ''].some((x) => x.toLowerCase().includes(n));
}
