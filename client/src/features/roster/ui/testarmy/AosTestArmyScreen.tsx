import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { findUnit, makeAosLookup, type AosLookup } from '../../aos/engine';
import { AOS_CODE_PREFIX, decodeAosRoster } from '../../aos/roster';
import type { AosBattlepack, AosBattleplanMap, AosIndex, AosRoster, AosTerritory } from '../../aos/types';
import { loadAosBattlepack, loadAosFaction } from '../../data';
import { pushOverlay, tg } from '../../telegram';
import { buildAosUnits, FOE_PREFIX, objectiveRadius, otherSide, parseInches, parseSave, rectsUnionPolys, restoreUnits, rulesAos, type ArmyKey, type Pt, type Side, type TAArmy, type TASave, type TAUnit } from '../../testarmy';
import { Warscroll } from '../aos/AosUnitCard';
import { BattleplanMap } from '../aosgame/BattleplanMap';
import { Button, IconButton, Segmented, Sheet, FullscreenButton } from '../kit';
import { cx, fmtPts } from '../util';
import { Board, type BoardArmy, type BoardField } from './Board';

// расстановка AoS — свой ключ (40K и AoS не смешиваются): аккаунт Telegram + ростер
const saveKey = (rosterId: string) => `warphub.testarmy.aos.v1${tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : ''}.${rosterId}`;
const readSave = (rosterId: string): TASave | null => {
  try {
    return parseSave(localStorage.getItem(saveKey(rosterId)));
  } catch {
    return null;
  }
};
const writeSave = (s: TASave) => {
  try {
    localStorage.setItem(saveKey(s.rosterId), JSON.stringify(s));
  } catch {
    /* хранилище недоступно — расстановка живёт до закрытия экрана */
  }
};
const dropSave = (rosterId: string) => {
  try {
    localStorage.removeItem(saveKey(rosterId));
  } catch {
    /* хранилище недоступно */
  }
};
/** Поле AoS в сохранении: «bp:<номер батлплана>:<территория атакующего>». */
const fieldId = (n: number, t: AosTerritory) => `bp:${n}:${t}`;
const parseField = (id: string): { n: number; t: AosTerritory } | null => {
  const m = id.match(/^bp:(\d+):([AB])$/);
  return m ? { n: Number(m[1]), t: m[2] as AosTerritory } : null;
};

type FoeSpec = { kind: 'none' } | { kind: 'own'; rosterId: string } | { kind: 'code'; code: string };
type AosArmy = TAArmy & { roster: AosRoster; L: AosLookup };

/**
 * Test Army для Age of Sigmar (S4, 30.10.2026): ростер AoS → батлплан GH 2026-27 (карта Sigdex), сторона и территория
 * атакующего → тот же стол, что у 40K (Board): базы в настоящем размере, строи, линейка, зона контроля целей 3″,
 * армия соперника. Территория атакующего — зона деплоя атакующего, вторая — защитника.
 */
export function AosTestArmyScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: AosRoster[]; index: AosIndex; initialRosterId?: string }) {
  const [bp, setBp] = useState<AosBattlepack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(initialRosterId ?? null);
  const [plan, setPlan] = useState(1);
  const [territory, setTerritory] = useState<AosTerritory>('A');
  const [side, setSide] = useState<Side>('attacker');
  const [armies, setArmies] = useState<AosArmy[] | null>(null);
  const [step, setStep] = useState<'roster' | 'field' | 'board'>(initialRosterId ? 'field' : 'roster');
  const factionIds = useMemo(() => index.factions.map((f) => f.id), [index]);

  useEffect(() => {
    loadAosBattlepack().then(setBp, (e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    if (step === 'board') return pushOverlay(() => setStep('field'));
    if (step === 'field' && !initialRosterId) return pushOverlay(() => setStep('roster'));
    return undefined;
  }, [step, initialRosterId]);

  const roster = rosters.find((r) => r.id === rosterId) ?? null;
  const foeRoster = (f: FoeSpec): AosRoster | null => {
    if (f.kind === 'own') return rosters.find((r) => r.id === f.rosterId) ?? null;
    if (f.kind === 'code') {
      try {
        return decodeAosRoster(f.code, factionIds);
      } catch {
        return null;
      }
    }
    return null;
  };

  const deploy = (n: number, t: AosTerritory, s: Side, foe: FoeSpec, saved?: TASave) => {
    if (!roster) return;
    setPlan(n);
    setTerritory(t);
    setSide(s);
    setArmies(null);
    setStep('board');
    if (!saved) dropSave(roster.id);
    const parts: { key: ArmyKey; roster: AosRoster; side: Side; spec?: FoeSpec }[] = [{ key: 'me', roster, side: s }];
    const fr = foeRoster(foe);
    if (fr) parts.push({ key: 'foe', roster: fr, side: otherSide(s), spec: foe });
    Promise.all(parts.map((p) => loadAosFaction(p.roster.factionId))).then(
      (factions) =>
        setArmies(
          parts.map((p, i) => {
            const L = makeAosLookup(factions[i]!);
            const fresh = buildAosUnits(p.roster, L, p.key === 'foe' ? FOE_PREFIX : '');
            const old = saved?.armies.find((a) => a.key === p.key)?.units;
            return {
              key: p.key,
              side: p.side,
              ...(p.spec?.kind === 'own' ? { rosterId: p.spec.rosterId } : p.spec?.kind === 'code' ? { code: p.spec.code } : { rosterId: p.roster.id }),
              units: old ? restoreUnits(fresh, old) : fresh,
              roster: p.roster,
              L,
            };
          }),
        ),
      (e) => setError(String(e?.message ?? e)),
    );
  };
  const continueSaved = (sv: TASave) => {
    const f = parseField(sv.layoutId);
    if (!f) return;
    const foe = sv.armies.find((a) => a.key === 'foe');
    deploy(f.n, f.t, sv.side, foe?.code ? { kind: 'code', code: foe.code } : foe?.rosterId ? { kind: 'own', rosterId: foe.rosterId } : { kind: 'none' }, sv);
  };

  useEffect(() => {
    if (step === 'board' && roster && armies)
      writeSave({
        v: 2,
        rosterId: roster.id,
        layoutId: fieldId(plan, territory),
        side,
        savedAt: new Date().toISOString(),
        armies: armies.map(({ key, side: sd, rosterId: rid, code, units }) => ({ key, side: sd, ...(rid ? { rosterId: rid } : {}), ...(code ? { code } : {}), units })),
      });
  }, [step, roster, plan, territory, side, armies]);
  const setArmyUnits = (key: ArmyKey, units: TAUnit[]) => setArmies((list) => list && list.map((a) => (a.key === key ? { ...a, units } : a)));
  const setArmyColor = (key: ArmyKey, color: string) => setArmies((list) => list && list.map((a) => (a.key === key ? { ...a, color } : a)));

  if (error)
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-sm text-fg-3">{error}</p>
      </Shell>
    );
  if (!bp)
    return (
      <Shell onBack={onBack}>
        <Spinner />
      </Shell>
    );

  const bplan = bp.battleplans.find((b) => b.n === plan);
  if (step === 'board' && roster && bplan?.map) {
    if (!armies) return <Spinner full />;
    return <Board armies={armies.map(viewAos)} field={aosField(bp, bplan.name, bplan.map, territory)} onArmy={setArmyUnits}
        onArmyColor={setArmyColor}
        rules={rulesAos} onBack={() => setStep('field')} />;
  }

  if (step === 'field' && roster)
    return (
      <Shell onBack={initialRosterId ? onBack : () => setStep('roster')}>
        <SavedCard bp={bp} rosterId={roster.id} rosters={rosters} onContinue={continueSaved} />
        <FieldPicker bp={bp} roster={roster} rosters={rosters} factionIds={factionIds} plan={plan} onPlan={setPlan} territory={territory} onTerritory={setTerritory} side={side} onSide={setSide} onDeploy={(foe) => deploy(plan, territory, side, foe)} />
      </Shell>
    );

  return (
    <Shell onBack={onBack}>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Ростер</p>
      {!rosters.length && <p className="text-sm text-fg-3">Сначала соберите ростер Age of Sigmar.</p>}
      <ul className="space-y-1.5">
        {rosters.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => (setRosterId(r.id), setStep('field'))} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10">
              <span className="block truncate text-sm font-semibold">{r.name}</span>
              <span className="block text-[12px] text-fg-3">
                {index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId}
                {r.summary ? ` · ${fmtPts(r.summary.points)} очк.` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** Армия AoS для стола: имя, строка характеристик варскролла и карточка (варскролл с улучшениями своего юнита). */
function viewAos(a: AosArmy): BoardArmy {
  const wsOf = (u: TAUnit) => a.L.ws.get(u.datasheetIds[0] ?? '');
  return {
    ...a,
    name: a.roster.name,
    stats: (u) => {
      const st = wsOf(u)?.stats;
      return st ? `Move ${st.move || '—'} · Health ${st.health || '—'} · Save ${st.save || '—'}${st.ward ? ` · Ward ${st.ward}` : ''} · Control ${st.control || '—'}` : null;
    },
    sim: {
      // AoS: Move варскролла у всех моделей юнита; Ld нет; дальность — стрелковое оружие варскролла
      moves: (u) => u.models.map(() => parseInches(wsOf(u)?.stats.move)),
      leadership: () => null,
      ranges: (u) => (wsOf(u)?.weapons ?? []).filter((w) => w.type === 'ranged' && parseInches(w.range) != null).map((w) => ({ name: w.name, max: parseInches(w.range)! })),
    },
    info: (u, onClose) => {
      const ws = wsOf(u);
      const own = findUnit(a.roster, u.uid.startsWith(FOE_PREFIX) ? u.uid.slice(FOE_PREFIX.length) : u.uid);
      return (
        <Sheet open onClose={onClose} title={u.name} tall>
          <div className="space-y-3 pb-3">
            <p className="text-xs text-fg-3">
              {fmtPts(u.points)} очк. · моделей: {u.models.length}
              {u.tags?.length ? ` · ${u.tags.join(' · ')}` : ''}
            </p>
            {ws ? <Warscroll ws={ws} unit={own} L={a.L} embedded /> : <p className="text-sm text-fg-3">Нет данных варскролла.</p>}
          </div>
        </Sheet>
      );
    },
  };
}

/** Поле AoS для стола: территория атакующего — зона деплоя атакующего, вторая — защитника. */
function aosField(bp: AosBattlepack, name: string, map: AosBattleplanMap, attackerTerritory: AosTerritory): BoardField {
  const def: AosTerritory = attackerTerritory === 'A' ? 'B' : 'A';
  const zones = { attacker: rectsUnionPolys(map.territories[attackerTerritory]), defender: rectsUnionPolys(map.territories[def]) };
  return {
    title: `${name} · атакующий — ${attackerTerritory}`,
    background: <AosBoardMap map={map} zones={zones} />,
    objectives: map.objectives.map((o) => ({ x: o.x, y: o.y, role: null })),
    snapPoints: [...map.objectives.map((o) => [o.x, o.y] as Pt), ...map.terrain.map((t) => [t.x, t.y] as Pt)],
    zones,
    objectiveNote: `GH 2026-27: цель — круг ${bp.battlefield.objectiveMarkerMm} мм, зона контроля — ${bp.battlefield.objectiveRange}″ от него. Террейн на карте условный (центр и примерный размер, Sigdex).`,
  };
}

const SIDE_FILL: Record<Side, string> = { attacker: 'rgba(248,113,113,0.16)', defender: 'rgba(96,165,250,0.16)' };
const TERRAIN_FILL = { ruin: 'rgba(168,140,110,0.5)', obscuring: 'rgba(110,150,110,0.5)', 'place-of-power': 'rgba(150,120,200,0.5)' } as const;
const TERRAIN_SHORT = { ruin: 'Р', obscuring: 'У', 'place-of-power': 'М' } as const;
/** Поле → экран, как в BattleMap: поворот на 90°, 44″ по ширине. */
const disp = ([x, y]: Pt): Pt => [44 - y, x];

/** Фон стола: поле 60×44 в том же повороте и viewBox, что у 40K (BattleMap), территории, террейн, цели. */
function AosBoardMap({ map, zones }: { map: AosBattleplanMap; zones: Record<Side, Pt[][]> }) {
  const poly = (pts: Pt[]) => pts.map((p) => disp(p).join(',')).join(' ');
  return (
    <svg viewBox="-1.5 -1.5 47 63" className="block h-full w-full" role="img" aria-label="Карта батлплана">
      <rect x={0} y={0} width={44} height={60} fill="#1b1d22" />
      {(['attacker', 'defender'] as const).flatMap((s) =>
        zones[s].map((pts, i) => <polygon key={s + i} points={poly(pts)} fill={SIDE_FILL[s]} stroke={s === 'attacker' ? 'rgba(248,113,113,0.6)' : 'rgba(96,165,250,0.6)'} strokeWidth={0.15} />),
      )}
      <line x1={22} y1={0} x2={22} y2={60} stroke="rgba(255,255,255,0.15)" strokeWidth={0.12} />
      <line x1={0} y1={30} x2={44} y2={30} stroke="rgba(255,255,255,0.15)" strokeWidth={0.12} />
      {map.terrain.map((t, i) => {
        const [x, y] = disp([t.x, t.y]);
        return (
          <g key={'t' + i}>
            <circle cx={x} cy={y} r={t.r} fill={TERRAIN_FILL[t.type]} stroke="rgba(255,255,255,0.2)" strokeWidth={0.12} />
            <text x={x} y={y} fontSize={1.6} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.7)">
              {TERRAIN_SHORT[t.type]}
            </text>
          </g>
        );
      })}
      {map.objectives.map((o, i) => {
        const [x, y] = disp([o.x, o.y]);
        return <circle key={'o' + i} cx={x} cy={y} r={objectiveRadius} fill="#facc15" />;
      })}
      <rect x={0} y={0} width={44} height={60} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.2} />
    </svg>
  );
}

function SavedCard({ bp, rosterId, rosters, onContinue }: { bp: AosBattlepack; rosterId: string; rosters: AosRoster[]; onContinue: (s: TASave) => void }) {
  const [saved] = useState(() => readSave(rosterId));
  const f = saved ? parseField(saved.layoutId) : null;
  const plan = f ? bp.battleplans.find((b) => b.n === f.n) : null;
  if (!saved || !f || !plan) return null;
  const mine = saved.armies.find((a) => a.key === 'me')?.units ?? [];
  const foe = saved.armies.find((a) => a.key === 'foe');
  const foeName = foe ? (foe.rosterId ? (rosters.find((r) => r.id === foe.rosterId)?.name ?? 'ростер удалён') : 'ростер по коду') : null;
  const when = new Date(saved.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">Сохранённая расстановка · {when}</p>
      <p className="mt-1 text-sm">
        {plan.n}. {plan.name} · атакующий — {f.t} · {saved.side === 'attacker' ? 'вы атакующий' : 'вы защитник'} · на столе {mine.filter((u) => u.placed).length} из {mine.length}
        {foeName && ` · соперник: ${foeName}`}
      </p>
      <Button variant="primary" className="mt-2 w-full" onClick={() => onContinue(saved)}>
        Продолжить расстановку
      </Button>
      <p className="mt-1.5 text-[12px] text-fg-3">Новая расстановка ниже заменит сохранённую.</p>
    </div>
  );
}

function FieldPicker({
  bp,
  roster,
  rosters,
  factionIds,
  plan,
  onPlan,
  territory,
  onTerritory,
  side,
  onSide,
  onDeploy,
}: {
  bp: AosBattlepack;
  roster: AosRoster;
  rosters: AosRoster[];
  factionIds: string[];
  plan: number;
  onPlan: (n: number) => void;
  territory: AosTerritory;
  onTerritory: (t: AosTerritory) => void;
  side: Side;
  onSide: (s: Side) => void;
  onDeploy: (foe: FoeSpec) => void;
}) {
  const [foeKind, setFoeKind] = useState<FoeSpec['kind']>('none');
  const [foeId, setFoeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const codeError = useMemo(() => {
    const c = code.trim();
    if (!c) return null;
    if (!c.startsWith(AOS_CODE_PREFIX)) return 'Нужен код ростера Age of Sigmar (начинается с AOS1.).';
    try {
      decodeAosRoster(c, factionIds);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Не получилось прочитать код.';
    }
  }, [code, factionIds]);
  const foeSpec: FoeSpec | null = foeKind === 'none' ? { kind: 'none' } : foeKind === 'own' ? (foeId ? { kind: 'own', rosterId: foeId } : null) : code.trim() && !codeError ? { kind: 'code', code: code.trim() } : null;
  const current = bp.battleplans.find((b) => b.n === plan);
  return (
    <section className="space-y-3">
      <p className="truncate text-sm">
        Ростер: <b>{roster.name}</b>
      </p>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Батлплан · GH 2026-27</p>
        <select value={plan} onChange={(e) => onPlan(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-app-elevated px-3 py-2 text-sm outline-none">
          {bp.battleplans.map((b) => (
            <option key={b.n} value={b.n} disabled={!b.map}>
              {b.n}. {b.name}
            </option>
          ))}
        </select>
      </div>
      {current?.map && <BattleplanMap bp={bp} map={current.map} attacker={territory} onPick={onTerritory} />}
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Территория атакующего (нажмите на карте)</p>
        <Segmented<AosTerritory>
          value={territory}
          onChange={onTerritory}
          options={[
            { value: 'A', label: 'A' },
            { value: 'B', label: 'B' },
          ]}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Ваша сторона</p>
        <Segmented<Side>
          value={side}
          onChange={onSide}
          options={[
            { value: 'attacker', label: 'Атакующий' },
            { value: 'defender', label: 'Защитник' },
          ]}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Армия соперника</p>
        <Segmented<FoeSpec['kind']>
          value={foeKind}
          onChange={setFoeKind}
          options={[
            { value: 'none', label: 'Без соперника' },
            { value: 'own', label: 'Мой ростер' },
            { value: 'code', label: 'Код ростера' },
          ]}
        />
        {foeKind === 'own' && (
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {rosters.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setFoeId(r.id)} className={cx('w-full rounded-lg border px-3 py-2 text-left', foeId === r.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}>
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-[12px] text-fg-3">{r.summary ? `${fmtPts(r.summary.points)} очк.` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {foeKind === 'code' && (
          <div className="mt-2">
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder={`${AOS_CODE_PREFIX}eyJ2Ijox…`} className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs text-white outline-none focus:border-accent" />
            {codeError && <p className="mt-1 text-xs text-danger">{codeError}</p>}
          </div>
        )}
        {foeKind !== 'none' && <p className="mt-1 text-[12px] text-fg-3">Соперник встаёт за другую сторону — {side === 'attacker' ? 'защитник' : 'атакующий'}.</p>}
      </div>
      <Button variant="primary" className="h-12 w-full" disabled={!current?.map || !foeSpec} onClick={() => foeSpec && onDeploy(foeSpec)}>
        {foeKind === 'none' ? 'Расставить армию' : 'Расставить армии'}
      </Button>
    </section>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="tg-safe-top mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder · Age of Sigmar</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Test Army</h1>
        </div>
        <FullscreenButton className="mb-0.5" />
      </header>
      {children}
    </div>
  );
}

function Spinner({ full }: { full?: boolean }) {
  return (
    <div className={cx(full && 'flex min-h-dvh items-center justify-center')}>
      <div className={cx('mx-auto size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent', !full && 'mt-16')} />
    </div>
  );
}
