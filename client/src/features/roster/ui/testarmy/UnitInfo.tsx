import { useState } from 'react';
import type { ComputedRoster, DataLookup } from '../../engine/compute';
import type { Roster } from '../../engine/types';
import type { TAUnit } from '../../testarmy';
import { Sheet } from '../kit';
import { UnitCard } from '../UnitCard';
import { fmtPts } from '../util';

const STATS = ['M', 'T', 'Sv', 'inv', 'W', 'Ld', 'OC'] as const;

/**
 * Карточка отряда в Test Army (этап 5): характеристики профилей (M, T, Sv, непробиваемый, W, Ld, OC, база), очки и модели
 * из ростера, затем полный инфолист из Roster Builder (оружие, способности, выбранное снаряжение) — только просмотр.
 */
export function UnitInfo({ unit, cr, roster, L, onClose }: { unit: TAUnit; cr: ComputedRoster; roster: Roster; L: DataLookup; onClose: () => void }) {
  const main = cr.byUid.get(unit.uid);
  const parts = main ? [...main.attached.map((u) => cr.byUid.get(u.uid)).filter((x): x is NonNullable<typeof x> => !!x), main] : [];
  const [open, setOpen] = useState<string | null>(main?.unit.uid ?? null);
  return (
    <Sheet open onClose={onClose} title={unit.name} tall>
      <div className="space-y-3 pb-3">
        <p className="text-xs text-white/55">
          {fmtPts(unit.points)} очк. · моделей: {unit.models.length}
          {unit.leaders.length > 0 && ` · с персонажами: ${unit.leaders.join(', ')}`}
        </p>
        {parts.map((p) =>
          p.ds ? (
            <div key={p.unit.uid} className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{p.ds.name}</p>
              <table className="w-full text-center text-[12px] tabular-nums">
                <thead>
                  <tr className="text-white/45">
                    <th className="text-left font-semibold">Профиль</th>
                    {STATS.map((k) => (
                      <th key={k} className="px-1 font-semibold">
                        {k === 'inv' ? 'Инв.' : k}
                      </th>
                    ))}
                    <th className="px-1 font-semibold">База</th>
                  </tr>
                </thead>
                <tbody>
                  {p.ds.stats.map((st, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="max-w-[7rem] truncate py-1 text-left">{st.name}</td>
                      {STATS.map((k) => (
                        <td key={k} className="px-1 py-1 font-semibold">
                          {st[k] ? (k === 'inv' ? `${st[k].replace(/\+/g, '')}++` : st[k]) : '—'}
                        </td>
                      ))}
                      <td className="px-1 py-1 text-[11px] text-white/60">{st.base || 'нет данных'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null,
        )}
        {parts.map((p) => (
          <UnitCard
            key={p.unit.uid}
            c={p}
            cr={cr}
            roster={roster}
            L={L}
            nested={p !== main}
            issues={[]}
            expanded={open === p.unit.uid}
            onToggle={() => setOpen(open === p.unit.uid ? null : p.unit.uid)}
            onPatch={() => {}}
            onWarlord={() => {}}
            onDuplicate={() => {}}
            onRemove={() => {}}
            readOnly
          />
        ))}
        {!parts.length && <p className="text-sm text-white/50">Отряда нет в текущих данных ростера.</p>}
      </div>
    </Sheet>
  );
}
