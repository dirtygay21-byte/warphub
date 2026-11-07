/**
 * Симулятор боя S2 (08.11.2026): атака отряда по цели на столе Test Army — оружие из ростера, дистанция со стола,
 * обстановка переключателями; результат точного расчёта (testarmy/combat.ts): шанс уничтожить, убитые модели, урон,
 * распределение и «Как считали».
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { ComputedRoster } from '../../engine/compute';
import { fmtInches } from '../../testarmy';
import { simulate, type Situation } from '../../testarmy/combat';
import { attackRows, inHalfRange, inRange, targetFrom, toWeaponInput } from '../../testarmy/combatInput';
import { Segmented, Sheet } from '../kit';
import { cx } from '../util';
import { haptic } from '../../telegram';

type Side = { name: string; cr: ComputedRoster; uid: string };
const pct = (p: number) => (p >= 0.995 && p < 1 ? '>99' : p > 0 && p < 0.005 ? '<1' : String(Math.round(p * 100)));
const fix = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

export function CombatSheet({ attacker, target, distance, onClose }: { attacker: Side; target: Side; distance: number | null; onClose: () => void }) {
  const [melee, setMelee] = useState(false);
  const rows = useMemo(() => attackRows(attacker.cr, attacker.uid, melee), [attacker.cr, attacker.uid, melee]);
  // выбор оружия: по умолчанию — первый профиль каждого оружия, которое достаёт до цели
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const isOn = (id: string, primary: boolean, reach: boolean) => pick[id] ?? (primary && reach);
  const [sit, setSit] = useState<Situation>({});
  const tgt = useMemo(() => targetFrom(target.cr, target.uid), [target.cr, target.uid]);
  const chosen = rows.filter((r) => isOn(r.id, r.primary, inRange(r, distance)));
  const key = chosen.map((r) => r.id).join('|');
  // половина дальности — у каждого оружия своя (RAPID FIRE, MELTA)
  const result = useMemo(
    () => (tgt && chosen.length ? simulate(chosen.map((r) => toWeaponInput(r, distance)), tgt.target, sit) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chosen меняется вместе с key
    [key, tgt, sit, distance],
  );
  const flip = (id: string, cur: boolean) => (haptic.select(), setPick((o) => ({ ...o, [id]: !cur })));
  const toggle = (k: keyof Situation) => (haptic.select(), setSit((s) => ({ ...s, [k]: !s[k] })));

  return (
    <Sheet open onClose={onClose} title="Атака" tall>
      <div className="space-y-3 pb-3">
        <p className="text-sm leading-snug">
          <b>{attacker.name}</b> → <b>{target.name}</b>
          <span className="block text-[12px] text-fg-3">{distance != null ? `Дистанция: ${fmtInches(distance)} (ближайшие базы)` : 'Отряды не на столе — дистанция не учитывается'}</span>
        </p>
        <Segmented value={melee ? 'melee' : 'ranged'} onChange={(v) => (setMelee(v === 'melee'), setPick({}))} options={[{ value: 'ranged', label: 'Стрельба' }, { value: 'melee', label: 'Ближний бой' }]} />

        <section>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Оружие</p>
          {rows.length ? (
            <ul className="overflow-hidden rounded-xl border border-white/10">
              {rows.map((r) => {
                const reach = inRange(r, distance);
                const checked = isOn(r.id, r.primary, reach);
                const p = r.profile;
                return (
                  <li key={r.id} className="border-b border-white/[0.06] last:border-b-0">
                    <button type="button" role="checkbox" aria-checked={checked} onClick={() => flip(r.id, checked)} className={cx('flex w-full items-start gap-2 px-3 py-2 text-left', !reach && 'opacity-50')}>
                      <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px]', checked ? 'border-accent bg-accent text-accent-foreground' : 'border-white/30')}>{checked ? '✓' : ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-snug">
                          {p.name || r.weapon} ×{r.count}
                          {r.unit !== attacker.name && <span className="font-normal text-fg-3"> · {r.unit}</span>}
                        </span>
                        <span className="block text-[11.5px] tabular-nums text-fg-3">
                          {[r.melee ? 'Melee' : `${p.range}″`, `A${p.A}`, `${r.melee ? 'WS' : 'BS'} ${p.skill === 'N/A' ? 'N/A' : p.skill.replace(/\+?$/, '+')}`, `S${p.S}`, `AP${p.AP}`, `D${p.D}`].join(' · ')}
                          {p.keywords ? ` · ${p.keywords}` : ''}
                          {!reach && ' · не достаёт'}
                          {inHalfRange(r, distance) && ' · половина дальности'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-fg-3">{melee ? 'Нет оружия ближнего боя в снаряжении.' : 'Нет дальнобойного оружия в снаряжении.'}</p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Обстановка</p>
          <div className="flex flex-wrap gap-1.5">
            {!melee && <Chip on={!!sit.cover} onClick={() => toggle('cover')}>Цель в укрытии</Chip>}
            {!melee && <Chip on={!!sit.heavy} onClick={() => toggle('heavy')}>Стоял (Heavy)</Chip>}
            {!melee && <Chip on={!!sit.indirect} onClick={() => toggle('indirect')}>Непрямая стрельба</Chip>}
            {!melee && sit.indirect && <Chip on={!!sit.indirectStationaryVisible} onClick={() => toggle('indirectStationaryVisible')}>Стоял, цель видна своим</Chip>}
            {melee && <Chip on={!!sit.charged} onClick={() => toggle('charged')}>Атаковал (Lance)</Chip>}
            <Chip on={sit.critHit === 5} onClick={() => (haptic.select(), setSit((s) => ({ ...s, critHit: s.critHit === 5 ? 6 : 5 })))}>Крит на 5+</Chip>
          </div>
          <Row label="Переброс попаданий">
            <Segmented value={sit.rerollHit ?? 'none'} onChange={(v) => setSit((s) => ({ ...s, rerollHit: v }))} options={[{ value: 'none', label: 'Нет' }, { value: 'ones', label: 'Единицы' }, { value: 'fails', label: 'Проваленные' }]} />
          </Row>
          <Row label="Переброс ранений">
            <Segmented value={sit.rerollWound ?? 'none'} onChange={(v) => setSit((s) => ({ ...s, rerollWound: v }))} options={[{ value: 'none', label: 'Нет' }, { value: 'ones', label: 'Единицы' }, { value: 'fails', label: 'Проваленные' }]} />
          </Row>
          <Row label="К попаданию">
            <Segmented value={String(sit.hitMod ?? 0)} onChange={(v) => setSit((s) => ({ ...s, hitMod: Number(v) }))} options={[{ value: '-1', label: '−1' }, { value: '0', label: '0' }, { value: '1', label: '+1' }]} />
          </Row>
          <Row label="К ранению">
            <Segmented value={String(sit.woundMod ?? 0)} onChange={(v) => setSit((s) => ({ ...s, woundMod: Number(v) }))} options={[{ value: '-1', label: '−1' }, { value: '0', label: '0' }, { value: '1', label: '+1' }]} />
          </Row>
        </section>

        {!tgt ? (
          <p className="text-sm text-fg-3">У цели нет характеристик в данных — расчёт невозможен.</p>
        ) : !result ? (
          <p className="text-sm text-fg-3">Выберите оружие.</p>
        ) : result.error ? (
          <p className="text-sm text-fg-3">{result.error}</p>
        ) : (
          <section className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <Big label="Уничтожить" value={`${pct(result.wipe)}%`} />
              <Big label={`Убито из ${tgt.target.models}`} value={fix(result.expectedSlain)} />
              <Big label="Урон (ран)" value={fix(result.expectedDamage)} />
            </div>
            <div aria-label="Распределение убитых моделей" className="flex h-24 items-end gap-0.5 rounded-xl border border-white/10 bg-black/20 px-2 pb-5 pt-2">
              {result.slain.map((p, k) => (
                <div key={k} className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div className={cx('w-full rounded-t', k === result.slain.length - 1 ? 'bg-accent' : 'bg-white/40')} style={{ height: `${Math.max(p > 0.0005 ? 3 : 0, (p / Math.max(...result.slain)) * 100)}%` }} title={`${k}: ${pct(p)}%`} />
                  <span className="absolute -bottom-4 left-0 right-0 text-center text-[10px] tabular-nums text-fg-3">{result.slain.length <= 12 || k % Math.ceil(result.slain.length / 10) === 0 ? k : ''}</span>
                </div>
              ))}
            </div>
            <details className="rounded-xl border border-white/10 bg-white/[0.03]">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold">Как считали</summary>
              <div className="space-y-2.5 px-3 pb-3 text-[12.5px] leading-snug text-fg-2">
                {result.weapons.map((m, i) => (
                  <div key={i}>
                    <p className="font-semibold text-white">{m.weapon}</p>
                    <p className="tabular-nums">
                      Атак {fix(m.attacks)} · {m.skill == null ? 'попадает всегда' : `попадание ${m.skill}+ (${pct(m.pHit)}%, крит ${pct(m.pCritHit)}%)`} · ранение {m.woundOn}+ ({pct(m.pWound)}%, крит {pct(m.pCritWound)}%) ·{' '}
                      {m.save.kind === 'none' ? 'без спасброска' : `${m.save.kind === 'InSv' ? 'непробиваемый' : 'спасбросок'} ${m.save.on}+`} (не спасает {pct(m.pUnsaved)}%)
                    </p>
                    <p className="tabular-nums text-fg-3">
                      В среднем: попаданий {fix(m.expected.hits)}, ранений {fix(m.expected.wounds)}, не спасено {fix(m.expected.unsaved)}
                      {m.expected.mortalCrits > 0 && `, смертельных (Devastating) ${fix(m.expected.mortalCrits)}`}
                    </p>
                    {m.notes.length > 0 && <p className="text-fg-3">{m.notes.join(' · ')}</p>}
                    {m.notCounted.length > 0 && <p className="text-amber-300/90">Не учтено: {m.notCounted.join(', ')}</p>}
                  </div>
                ))}
                {tgt.notes.map((n) => (
                  <p key={n} className="text-fg-3">
                    Цель: {n}
                  </p>
                ))}
                <p className="text-fg-3">
                  Цель: T{tgt.target.T}, Sv {tgt.target.Sv}+{tgt.target.inv ? `, InSv ${tgt.target.inv}+` : ''}, W{tgt.target.W}
                  {tgt.target.fnp ? `, Feel No Pain ${tgt.target.fnp}+` : ''}. Правила детачментов, стратагем и способностей юнитов не разбираются — используйте переключатели выше.
                  Расчёт точный, по Core Rules 11-й редакции.
                </p>
              </div>
            </details>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', on ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-fg-2')}>
      {children}
    </button>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-fg-3">{label}</p>
      {children}
    </div>
  );
}
function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2 py-2">
      <p className="font-display text-2xl font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-fg-3">{label}</p>
    </div>
  );
}
