/**
 * Симулятор боя S2 (08.11.2026): атака отряда по цели на столе Test Army — оружие из ростера, дистанция со стола,
 * обстановка переключателями; результат точного расчёта (testarmy/combat.ts): шанс уничтожить, убитые модели, урон,
 * распределение и «Как считали».
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { ComputedRoster } from '../../engine/compute';
import { fmtInches, isCloseQuarters, sampleDist, weaponRule, type ShotContext } from '../../testarmy';
import { simulate, type Situation } from '../../testarmy/combat';
import { attackRows, inHalfRange, inRange, targetFrom, toWeaponInput } from '../../testarmy/combatInput';
import { Button, Segmented, Sheet } from '../kit';
import { cx } from '../util';
import { haptic } from '../../telegram';

type Side = { name: string; cr: ComputedRoster; uid: string };
const pct = (p: number) => (p >= 0.995 && p < 1 ? '>99' : p > 0 && p < 0.005 ? '<1' : String(Math.round(p * 100)));
const fix = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

/**
 * onRoll (27.11.2026): «Бросить» — одно случайное значение из рассчитанного распределения убитых моделей;
 * лист закрывается, результат — баннером на столе.
 */
export function CombatSheet({ attacker, target, distance, onClose, onRoll, melee: meleeAtStart, shot }: { attacker: Side; target: Side; distance: number | null; onClose: () => void; onRoll?: (killed: number, models: number) => void; melee?: boolean; shot?: ShotContext }) {
  const [melee, setMelee] = useState(!!meleeAtStart);
  const rows = useMemo(() => attackRows(attacker.cr, attacker.uid, melee), [attacker.cr, attacker.uid, melee]);
  // 40K со стола (27.11.2026): какое оружие можно выбрать в этой стрельбе и −1 к попаданию (shooting40k.ts)
  const ruleOf = (r: (typeof rows)[number]) => (shot ? weaponRule({ keywords: r.profile.keywords, melee: r.melee }, shot) : { allowed: true, hitMod: 0 });
  // выбор оружия: по умолчанию — первый профиль каждого оружия, которое достаёт до цели
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const isOn = (id: string, primary: boolean, reach: boolean) => pick[id] ?? (primary && reach);
  const tgt0 = useMemo(() => targetFrom(target.cr, target.uid), [target.cr, target.uid]);
  // Stealth цели — укрытие включено сразу (можно выключить)
  // HEAVY и LANCE — по режиму «Игра», если он знает, как отряд двигался (можно переключить)
  const [sit, setSit] = useState<Situation>(() => ({ ...(tgt0?.stealth || shot?.cover ? { cover: true } : {}), ...(shot?.notVisible ? { indirect: true } : {}), ...(shot?.heavy ? { heavy: true } : {}), ...(shot?.charged ? { charged: true } : {}) }));
  // правки цели (13.11.2026): модификаторы от правил цели и оставшиеся модели
  const [tm, setTm] = useState<{ hit: number; inv: number | null; fnp: number | null; models: number | null }>({ hit: 0, inv: null, fnp: null, models: null });
  const tgt = useMemo(() => {
    if (!tgt0) return null;
    const t = tgt0.target;
    const best = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
    return { ...tgt0, target: { ...t, inv: best(t.inv, tm.inv), fnp: best(t.fnp, tm.fnp), models: Math.min(t.models, Math.max(1, tm.models ?? t.models)) } };
  }, [tgt0, tm]);
  const sitAll = useMemo<Situation>(() => ({ ...sit, hitMod: (sit.hitMod ?? 0) + tm.hit }), [sit, tm.hit]);
  const changed = (o: object) => Object.values(o).filter((v) => v !== undefined && v !== null && v !== false && v !== 0 && v !== 'none' && v !== 6).length;
  const chosen = rows.filter((r) => ruleOf(r).allowed && isOn(r.id, r.primary, inRange(r, distance)));
  // 24.07: при обычной/штурмовой стрельбе модель (не MONSTER/VEHICLE) — либо [CLOSE-QUARTERS], либо остальное оружие
  const mixCQ = !melee && shot && shot.mode !== 'close' && !shot.attackerMV && chosen.some((r) => isCloseQuarters(r.profile.keywords)) && chosen.some((r) => !isCloseQuarters(r.profile.keywords));
  const key = chosen.map((r) => r.id).join('|');
  // половина дальности — у каждого оружия своя (RAPID FIRE, MELTA)
  const result = useMemo(
    () => (tgt && chosen.length ? simulate(chosen.map((r) => toWeaponInput(r, distance, ruleOf(r).hitMod)), tgt.target, sitAll) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chosen меняется вместе с key
    [key, tgt, sitAll, distance],
  );
  const flip = (id: string, cur: boolean) => (haptic.select(), setPick((o) => ({ ...o, [id]: !cur })));
  const toggle = (k: keyof Situation) => (haptic.select(), setSit((s) => ({ ...s, [k]: !s[k] })));
  const grant = (g: NonNullable<Situation['grant']>) => (haptic.select(), setSit((s) => ({ ...s, grant: { ...s.grant, ...g } })));

  return (
    <Sheet open onClose={onClose} title="Атака" tall>
      <div className="space-y-3 pb-3">
        <p className="text-sm leading-snug">
          <b>{attacker.name}</b> → <b>{target.name}</b>
          <span className="block text-[12px] text-fg-3">{distance != null ? `Дистанция: ${fmtInches(distance)} (ближайшие базы)` : 'Отряды не на столе — дистанция не учитывается'}</span>
          {shot && !melee && shot.mode !== 'normal' && (
            <span className="block text-[12px] text-warn">{shot.mode === 'assault' ? 'Штурмовая стрельба (10.05): после продвижения — только оружие [ASSAULT].' : shot.attackerMV ? 'Стрельба в ближнем бою (10.06): MONSTER/VEHICLE — −1 к попаданию, кроме [CLOSE-QUARTERS] по противнику в бою.' : 'Стрельба в ближнем бою (10.06): только [CLOSE-QUARTERS] / [PISTOL].'}</span>
          )}
          {shot && !melee && shot.mode === 'normal' && shot.ruleNote && <span className="block text-[12px] text-fg-3">Продвигался — обычная стрельба по правилу «{shot.ruleNote}».</span>}
          {shot && !melee && shot.notVisible && <span className="block text-[12px] text-warn">Цель не видна — стреляет только оружие [INDIRECT FIRE] (10.07).</span>}
          {shot && !melee && shot.sightNotes?.length ? <span className="block text-[12px] text-fg-3">По карте: {shot.sightNotes.join(' · ')}. Высота и окна не учитываются — укрытие можно переключить.</span> : null}
          {shot && !melee && shot.engagedMV && <span className="block text-[12px] text-warn">Цель — MONSTER/VEHICLE в бою (17.03): −1 к попаданию, [BLAST] нельзя.</span>}
        </p>
        <Segmented value={melee ? 'melee' : 'ranged'} onChange={(v) => (setMelee(v === 'melee'), setPick({}))} options={[{ value: 'ranged', label: 'Стрельба' }, { value: 'melee', label: 'Ближний бой' }]} />

        <section>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Оружие</p>
          {rows.length ? (
            <ul className="overflow-hidden rounded-xl border border-white/10">
              {rows.map((r) => {
                const rule = ruleOf(r);
                const reach = inRange(r, distance);
                const checked = rule.allowed && isOn(r.id, r.primary, reach);
                const p = r.profile;
                return (
                  <li key={r.id} className="border-b border-white/[0.06] last:border-b-0">
                    <button type="button" role="checkbox" aria-checked={checked} disabled={!rule.allowed} onClick={() => flip(r.id, checked)} className={cx('flex w-full items-start gap-2 px-3 py-2 text-left', (!reach || !rule.allowed) && 'opacity-50')}>
                      <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px]', checked ? 'border-accent bg-accent text-accent-foreground' : 'border-white/30')}>{checked ? '✓' : ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-snug">
                          {p.name || r.weapon} ×{r.count}
                          {r.unit !== attacker.name && <span className="font-normal text-fg-3"> · {r.unit}</span>}
                        </span>
                        <span className="block text-[11.5px] tabular-nums text-fg-3">
                          {[r.melee ? 'Melee' : `${p.range}″`, `A${p.A}`, `${r.melee ? 'WS' : 'BS'} ${p.skill === 'N/A' ? 'N/A' : p.skill.replace(/\+?$/, '+')}`, `S${p.S}`, `AP${p.AP}`, `D${p.D}`].join(' · ')}
                          {p.keywords ? ` · ${p.keywords}` : ''}
                          {!rule.allowed && ` · ${rule.why}`}
                          {rule.allowed && rule.hitMod < 0 && ' · −1 к попаданию'}
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
          {mixCQ && <p className="mt-1 text-[12px] text-warn">24.07: каждая модель (кроме MONSTER/VEHICLE) стреляет либо [CLOSE-QUARTERS] / [PISTOL], либо остальным оружием — выберите одно.</p>}
        </section>

        <section className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Обстановка</p>
          <div className="flex flex-wrap gap-1.5">
            {!melee && <Chip on={!!sit.cover} onClick={() => toggle('cover')}>Цель в укрытии</Chip>}
            {!melee && <Chip on={!!sit.heavy} onClick={() => toggle('heavy')}>Heavy: не в бою, никто не прошёл больше 3″</Chip>}
            {!melee && <Chip on={!!sit.snap} onClick={() => toggle('snap')}>Навскидку (Overwatch)</Chip>}
            {!melee && <Chip on={!!sit.indirect} onClick={() => toggle('indirect')}>Непрямая стрельба</Chip>}
            {!melee && sit.indirect && <Chip on={!!sit.indirectStationaryVisible} onClick={() => toggle('indirectStationaryVisible')}>Стоял, цель видна своим</Chip>}
            {melee && <Chip on={!!sit.charged} onClick={() => toggle('charged')}>Нападал в этом ходу (Lance)</Chip>}
          </div>

          {/* модификаторы от правил детачмента, стратагем и способностей — вручную (13.11.2026) */}
          <Fold title="Модификаторы атакующего" count={changed({ ...sit, cover: 0, heavy: 0, snap: 0, indirect: 0, indirectStationaryVisible: 0, charged: 0, halveD: 0, grant: 0, dMod: Math.max(0, sit.dMod ?? 0), woundMod: Math.max(0, sit.woundMod ?? 0) }) + changed(sit.grant ?? {})}>
            <Row label="Переброс попаданий">
              <Segmented value={sit.rerollHit ?? 'none'} onChange={(v) => setSit((s) => ({ ...s, rerollHit: v }))} options={[{ value: 'none', label: 'Нет' }, { value: 'ones', label: 'Единицы' }, { value: 'fails', label: 'Проваленные' }]} />
            </Row>
            <Row label="Переброс ранений">
              <Segmented value={sit.rerollWound ?? 'none'} onChange={(v) => setSit((s) => ({ ...s, rerollWound: v }))} options={[{ value: 'none', label: 'Нет' }, { value: 'ones', label: 'Единицы' }, { value: 'fails', label: 'Проваленные' }]} />
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <Row label="К попаданию">
                <Segmented value={String(sit.hitMod ?? 0)} onChange={(v) => setSit((s) => ({ ...s, hitMod: Number(v) }))} options={[{ value: '-1', label: '−1' }, { value: '0', label: '0' }, { value: '1', label: '+1' }]} />
              </Row>
              <Row label="К ранению">
                <Segmented value={String(Math.max(0, sit.woundMod ?? 0))} onChange={(v) => setSit((s) => ({ ...s, woundMod: Number(v) + Math.min(0, s.woundMod ?? 0) }))} options={[{ value: '0', label: '0' }, { value: '1', label: '+1' }]} />
              </Row>
              <Row label="Сила (S)">
                <Segmented value={String(sit.sMod ?? 0)} onChange={(v) => setSit((s) => ({ ...s, sMod: Number(v) }))} options={[{ value: '0', label: '0' }, { value: '1', label: '+1' }, { value: '2', label: '+2' }]} />
              </Row>
              <Row label="Пробивание (AP)">
                <Segmented value={String(sit.apMod ?? 0)} onChange={(v) => setSit((s) => ({ ...s, apMod: Number(v) }))} options={[{ value: '1', label: 'хуже' }, { value: '0', label: '0' }, { value: '-1', label: '−1' }]} />
              </Row>
              <Row label="Урон (D)">
                <Segmented value={String(Math.max(0, sit.dMod ?? 0))} onChange={(v) => setSit((s) => ({ ...s, dMod: Number(v) + Math.min(0, s.dMod ?? 0) }))} options={[{ value: '0', label: '0' }, { value: '1', label: '+1' }]} />
              </Row>
              <Row label="Крит. попадание">
                <Segmented value={String(sit.critHit ?? 6)} onChange={(v) => setSit((s) => ({ ...s, critHit: Number(v) }))} options={[{ value: '6', label: '6' }, { value: '5', label: '5+' }]} />
              </Row>
              <Row label="Крит. ранение">
                <Segmented value={String(sit.critWound ?? 6)} onChange={(v) => setSit((s) => ({ ...s, critWound: Number(v) }))} options={[{ value: '6', label: '6' }, { value: '5', label: '5+' }, { value: '4', label: '4+' }]} />
              </Row>
            </div>
            <Row label="Способности от правил — всему выбранному оружию">
              <div className="flex flex-wrap gap-1.5">
                <Chip on={sit.grant?.sustained === 1} onClick={() => grant({ sustained: sit.grant?.sustained === 1 ? undefined : 1 })}>Sustained Hits 1</Chip>
                <Chip on={!!sit.grant?.lethal} onClick={() => grant({ lethal: !sit.grant?.lethal })}>Lethal Hits</Chip>
                <Chip on={!!sit.grant?.dev} onClick={() => grant({ dev: !sit.grant?.dev })}>Devastating Wounds</Chip>
                <Chip on={!!sit.grant?.twin} onClick={() => grant({ twin: !sit.grant?.twin })}>Twin-linked</Chip>
                {!melee && <Chip on={!!sit.grant?.ignoresCover} onClick={() => grant({ ignoresCover: !sit.grant?.ignoresCover })}>Ignores Cover</Chip>}
                {melee && <Chip on={!!sit.grant?.lance} onClick={() => grant({ lance: !sit.grant?.lance })}>Lance</Chip>}
              </div>
            </Row>
          </Fold>

          <Fold title="Модификаторы цели" count={changed({ ...tm, models: tm.models != null && tgt0 && tm.models < tgt0.target.models ? 1 : 0 }) + (sit.halveD ? 1 : 0) + ((sit.dMod ?? 0) < 0 ? 1 : 0) + ((sit.woundMod ?? 0) < 0 ? 1 : 0)}>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={tm.hit === -1} onClick={() => (haptic.select(), setTm((t) => ({ ...t, hit: t.hit === -1 ? 0 : -1 })))}>−1 к попаданию по цели</Chip>
              <Chip on={(sit.woundMod ?? 0) < 0} onClick={() => (haptic.select(), setSit((s) => ({ ...s, woundMod: (s.woundMod ?? 0) < 0 ? (s.woundMod ?? 0) + 1 : (s.woundMod ?? 0) - 1 })))}>−1 к ранению по цели</Chip>
              <Chip on={(sit.dMod ?? 0) < 0} onClick={() => (haptic.select(), setSit((s) => ({ ...s, dMod: (s.dMod ?? 0) < 0 ? (s.dMod ?? 0) + 1 : (s.dMod ?? 0) - 1 })))}>−1 урон</Chip>
              <Chip on={!!sit.halveD} onClick={() => toggle('halveD')}>Урон пополам</Chip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Row label={`Непробиваемый${tgt0?.target.inv ? ` (в профиле ${tgt0.target.inv}+)` : ''}`}>
                <Segmented value={String(tm.inv ?? 0)} onChange={(v) => setTm((t) => ({ ...t, inv: Number(v) || null }))} options={[{ value: '0', label: '—' }, { value: '6', label: '6+' }, { value: '5', label: '5+' }, { value: '4', label: '4+' }]} />
              </Row>
              <Row label={`Feel No Pain${tgt0?.target.fnp ? ` (в профиле ${tgt0.target.fnp}+)` : ''}`}>
                <Segmented value={String(tm.fnp ?? 0)} onChange={(v) => setTm((t) => ({ ...t, fnp: Number(v) || null }))} options={[{ value: '0', label: '—' }, { value: '6', label: '6+' }, { value: '5', label: '5+' }, { value: '4', label: '4+' }]} />
              </Row>
            </div>
            {tgt0 && tgt0.target.models > 1 && (
              <Row label={`Моделей в цели сейчас (в ростере ${tgt0.target.models})`}>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Меньше моделей" className="size-9 rounded-lg bg-white/[0.08] text-lg font-semibold active:bg-white/15" onClick={() => (haptic.select(), setTm((t) => ({ ...t, models: Math.max(1, (t.models ?? tgt0.target.models) - 1) })))}>
                    −
                  </button>
                  <span className="w-10 text-center text-base font-semibold tabular-nums">{tgt?.target.models}</span>
                  <button type="button" aria-label="Больше моделей" className="size-9 rounded-lg bg-white/[0.08] text-lg font-semibold active:bg-white/15" onClick={() => (haptic.select(), setTm((t) => ({ ...t, models: Math.min(tgt0.target.models, (t.models ?? tgt0.target.models) + 1) })))}>
                    +
                  </button>
                </div>
              </Row>
            )}
          </Fold>
        </section>

        {!tgt ? (
          <p className="text-sm text-fg-3">У цели нет характеристик в данных — расчёт невозможен.</p>
        ) : !result ? (
          <p className="text-sm text-fg-3">Выберите оружие.</p>
        ) : result.error ? (
          <p className="text-sm text-fg-3">{result.error}</p>
        ) : (
          <section className="space-y-2.5">
            {onRoll && (
              <Button className="w-full" onClick={() => (haptic.select(), onRoll(sampleDist(result.slain), tgt.target.models), onClose())}>
                Бросить кубы — результат на столе
              </Button>
            )}
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
/** Сворачиваемая группа модификаторов; count — сколько изменено (видно в свёрнутом виде). */
function Fold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold">
        <span className="min-w-0 flex-1">{title}</span>
        {count > 0 && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">{count}</span>}
        <span aria-hidden className="text-fg-3">▾</span>
      </summary>
      <div className="space-y-2.5 px-3 pb-3">{children}</div>
    </details>
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
