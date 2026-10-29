import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadBattlefield, loadFaction, type BattlefieldData } from '../../data';
import { computeRoster, makeLookup, type ComputedRoster, type DataLookup } from '../../engine/compute';
import { decodeRoster } from '../../engine/roster';
import type { DataIndex, Roster } from '../../engine/types';
import { pushOverlay, tg } from '../../telegram';
import { buildUnits, FOE_PREFIX, OBJECTIVE_RULE_SOURCE, otherSide, parseSave, restoreUnits, type ArmyKey, type Pt, type Side, type TAArmy, type TASave, type TAUnit } from '../../testarmy';
import { BattleMap } from '../Battlefield';
import { Button, IconButton, Segmented } from '../kit';
import { cx, fmtPts } from '../util';
import { Board, type BoardArmy as BoardArmyView, type BoardField } from './Board';
import { UnitInfo } from './UnitInfo';

const LETTERS = ['A', 'B', 'C'];

// расстановка сохраняется на телефоне: своя у аккаунта Telegram и ростера (этап 6)
const saveKey = (rosterId: string) => `warphub.testarmy.v1${tg?.initDataUnsafe.user?.id ? `.${tg.initDataUnsafe.user.id}` : ''}.${rosterId}`;
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
/** Армия соперника в настройке: нет, свой ростер или ростер по коду (WH1.…). */
type FoeSpec = { kind: 'none' } | { kind: 'own'; rosterId: string } | { kind: 'code'; code: string };

/** Армия на столе со всем, что нужно экрану: ростер, данные фракции, расчёт ростера. */
export type BoardArmy = TAArmy & { roster: Roster; cr: ComputedRoster; L: DataLookup };

/** Армия 40K для стола: имя, строка характеристик (первый профиль инфолиста) и карточка отряда. */
const view40k = (a: BoardArmy): BoardArmyView => ({
  ...a,
  name: a.roster.name,
  stats: (u) => {
    const st = a.cr.byUid.get(u.uid.startsWith(FOE_PREFIX) ? u.uid.slice(FOE_PREFIX.length) : u.uid)?.ds?.stats[0];
    return st ? `M ${st.M} · T ${st.T} · Sv ${st.Sv}${st.inv ? ` (${st.inv.replace(/\+/g, '')}++)` : ''} · W ${st.W} · Ld ${st.Ld} · OC ${st.OC}` : null;
  },
  info: (u, onClose) => <UnitInfo unit={u} cr={a.cr} roster={a.roster} L={a.L} onClose={onClose} />,
});

const dropSave = (rosterId: string) => {
  try {
    localStorage.removeItem(saveKey(rosterId));
  } catch {
    /* хранилище недоступно */
  }
};

/**
 * Test Army (24.10.2026): ростер → поле боя (пара типов армий и раскладка A/B/C) и сторона → стол, где модели ростера —
 * базы в настоящем размере. Только 40K. Армия соперника (30.10.2026) — свой ростер или код, за другую сторону.
 */
export function TestArmyScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: Roster[]; index: DataIndex; initialRosterId?: string }) {
  const [bf, setBf] = useState<BattlefieldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(initialRosterId ?? null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('attacker');
  const [armies, setArmies] = useState<BoardArmy[] | null>(null);
  const [step, setStep] = useState<'roster' | 'field' | 'board'>(initialRosterId ? 'field' : 'roster');

  useEffect(() => {
    loadBattlefield().then(setBf, (e) => setError(String(e?.message ?? e)));
  }, []);

  const roster = rosters.find((r) => r.id === rosterId) ?? null;

  // «Назад» Telegram — на шаг назад
  useEffect(() => {
    if (step === 'board') return pushOverlay(() => setStep('field'));
    if (step === 'field' && !initialRosterId) return pushOverlay(() => setStep('roster'));
    return undefined;
  }, [step, initialRosterId]);

  // ростер соперника: свой — текущая версия из Roster Builder, по коду — из кода; null — не открыть
  const foeRoster = (f: FoeSpec): Roster | null => {
    if (f.kind === 'own') return rosters.find((r) => r.id === f.rosterId) ?? null;
    if (f.kind === 'code') {
      try {
        return decodeRoster(f.code, index.factions.map((x) => x.id));
      } catch {
        return null;
      }
    }
    return null;
  };

  // saved — продолжить сохранённую расстановку; иначе новая (сохранение этого ростера заменяется)
  const deploy = (id: string, s: Side, foe: FoeSpec, saved?: TASave) => {
    if (!roster) return;
    setLayoutId(id);
    setSide(s);
    setArmies(null);
    setStep('board');
    if (!saved) dropSave(roster.id);
    const parts: { key: ArmyKey; roster: Roster; side: Side; spec?: FoeSpec }[] = [{ key: 'me', roster, side: s }];
    const fr = foeRoster(foe);
    if (fr) parts.push({ key: 'foe', roster: fr, side: otherSide(s), spec: foe });
    Promise.all(parts.map((p) => loadFaction(p.roster.factionId))).then(
      (factions) => {
        setArmies(
          parts.map((p, i) => {
            const L = makeLookup(factions[i]!);
            const cr = computeRoster(p.roster, L);
            const fresh = buildUnits(cr, p.key === 'foe' ? FOE_PREFIX : '');
            const old = saved?.armies.find((a) => a.key === p.key)?.units;
            return {
              key: p.key,
              side: p.side,
              ...(p.spec?.kind === 'own' ? { rosterId: p.spec.rosterId } : p.spec?.kind === 'code' ? { code: p.spec.code } : { rosterId: p.roster.id }),
              units: old ? restoreUnits(fresh, old) : fresh,
              roster: p.roster,
              cr,
              L,
            };
          }),
        );
      },
      (e) => setError(String(e?.message ?? e)),
    );
  };
  const continueSaved = (sv: TASave) => {
    const f = sv.armies.find((a) => a.key === 'foe');
    deploy(sv.layoutId, sv.side, f?.code ? { kind: 'code', code: f.code } : f?.rosterId ? { kind: 'own', rosterId: f.rosterId } : { kind: 'none' }, sv);
  };

  // автосохранение после каждого изменения расстановки (обе армии)
  useEffect(() => {
    if (step === 'board' && roster && layoutId && armies)
      writeSave({
        v: 2,
        rosterId: roster.id,
        layoutId,
        side,
        savedAt: new Date().toISOString(),
        armies: armies.map(({ key, side: sd, rosterId: rid, code, units }) => ({ key, side: sd, ...(rid ? { rosterId: rid } : {}), ...(code ? { code } : {}), units })),
      });
  }, [step, roster, layoutId, side, armies]);
  const setArmyUnits = (key: ArmyKey, units: TAUnit[]) => setArmies((list) => list && list.map((a) => (a.key === key ? { ...a, units } : a)));

  if (error)
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-sm text-white/50">{error}</p>
      </Shell>
    );
  if (!bf)
    return (
      <Shell onBack={onBack}>
        <Spinner />
      </Shell>
    );

  const layout = bf.layouts.find((l) => l.id === layoutId) ?? null;
  if (step === 'board' && roster && layout) {
    const dep = bf.deployments.find((d) => d.id === layout.deployment)!;
    if (!armies) return <Spinner full />;
    const field: BoardField = {
      title: dep.nameRu,
      background: <BattleMap layout={layout} dep={dep} guides="none" className="block h-full w-full" />,
      objectives: layout.objectives,
      snapPoints: [...layout.objectives.map((o) => [o.x, o.y] as Pt), ...layout.pieces.filter((pc) => pc.kind === 'area').flatMap((pc) => pc.poly as Pt[])],
      zones: Object.fromEntries(dep.zones.map((z) => [z.player, [z.poly as Pt[]]])),
      objectiveNote: `${OBJECTIVE_RULE_SOURCE}. Для целей в участке террейна правило другое; высота на карте не учитывается.`,
    };
    return <Board armies={armies.map(view40k)} field={field} onArmy={setArmyUnits} onBack={() => setStep('field')} />;
  }

  if (step === 'field' && roster)
    return (
      <Shell onBack={initialRosterId ? onBack : () => setStep('roster')}>
        <SavedCard bf={bf} rosterId={roster.id} rosters={rosters} onContinue={continueSaved} />
        <FieldPicker
          bf={bf}
          roster={roster}
          rosters={rosters}
          factionIds={index.factions.map((f) => f.id)}
          layoutId={layoutId}
          onLayout={setLayoutId}
          side={side}
          onSide={setSide}
          onDeploy={(id, foe) => deploy(id, side, foe)}
        />
      </Shell>
    );

  return (
    <Shell onBack={onBack}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Ростер</p>
      {!rosters.length && <p className="text-sm text-white/55">Сначала соберите ростер Warhammer 40,000.</p>}
      <ul className="space-y-1.5">
        {rosters.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => (setRosterId(r.id), setLayoutId(null), setStep('field'))}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
            >
              <span className="block truncate text-sm font-semibold">{r.name}</span>
              <span className="block text-[11px] text-white/45">
                {index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId}
                {r.summary ? ` · ${fmtPts(r.summary.points)} очк.` : ''} · юнитов: {r.units.length}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** Сохранённая расстановка ростера: раскладка, сторона, сколько отрядов на столе, когда — «Продолжить». */
function SavedCard({ bf, rosterId, rosters, onContinue }: { bf: BattlefieldData; rosterId: string; rosters: Roster[]; onContinue: (s: TASave) => void }) {
  const [saved] = useState(() => readSave(rosterId));
  if (!saved) return null;
  const layout = bf.layouts.find((l) => l.id === saved.layoutId);
  if (!layout) return null;
  const dep = bf.deployments.find((d) => d.id === layout.deployment);
  const mineUnits = saved.armies.find((a) => a.key === 'me')?.units ?? [];
  const placed = mineUnits.filter((u) => u.placed).length;
  const foe = saved.armies.find((a) => a.key === 'foe');
  const foeName = foe ? (foe.rosterId ? (rosters.find((r) => r.id === foe.rosterId)?.name ?? 'ростер удалён') : 'ростер по коду') : null;
  const when = new Date(saved.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Сохранённая расстановка · {when}</p>
      <p className="mt-1 text-sm">
        {dep?.nameRu ?? '—'} · раскладка {LETTERS[layout.variant - 1] ?? layout.variant} · {saved.side === 'attacker' ? 'атакующий' : 'защитник'} · на столе {placed} из {mineUnits.length}
        {foeName && ` · соперник: ${foeName}`}
      </p>
      <Button variant="primary" className="mt-2 w-full" onClick={() => onContinue(saved)}>
        Продолжить расстановку
      </Button>
      <p className="mt-1.5 text-[11px] text-white/45">Новая расстановка ниже заменит сохранённую.</p>
    </div>
  );
}

/** Поле боя: свой тип армии (из ростера), тип соперника, раскладка A/B/C, сторона. */
function FieldPicker({
  bf,
  roster,
  rosters,
  factionIds,
  layoutId,
  onLayout,
  side,
  onSide,
  onDeploy,
}: {
  bf: BattlefieldData;
  roster: Roster;
  rosters: Roster[];
  factionIds: string[];
  layoutId: string | null;
  onLayout: (id: string) => void;
  side: Side;
  onSide: (s: Side) => void;
  onDeploy: (layoutId: string, foe: FoeSpec) => void;
}) {
  const [foeKind, setFoeKind] = useState<FoeSpec['kind']>('none');
  const [foeId, setFoeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // код ростера соперника: только 40K (WH1.…), фракция должна быть в данных
  const codeError = useMemo(() => {
    const c = code.trim();
    if (!c) return null;
    if (c.startsWith('AOS1.')) return 'Это ростер Age of Sigmar — в Test Army только Warhammer 40,000.';
    try {
      decodeRoster(c, factionIds);
      return null;
    } catch (e) {
      return e instanceof Error && e.message.startsWith('Ростер для') ? e.message : 'Не получилось прочитать код. Скопируйте его целиком (начинается с WH1.).';
    }
  }, [code, factionIds]);
  const foeSpec: FoeSpec | null =
    foeKind === 'none' ? { kind: 'none' } : foeKind === 'own' ? (foeId ? { kind: 'own', rosterId: foeId } : null) : code.trim() && !codeError ? { kind: 'code', code: code.trim() } : null;
  const mine = bf.dispositions.find((d) => d.name === roster.forceDisposition || d.id === roster.forceDisposition)?.id ?? bf.dispositions[0]!.id;
  const [you, setYou] = useState(mine);
  const [foe, setFoe] = useState(mine);
  const pair = useMemo(() => {
    const key = [you, foe].sort().join('|');
    return bf.layouts.filter((l) => l.pair.join('|') === key).sort((a, b) => a.variant - b.variant);
  }, [bf, you, foe]);
  const layout = pair.find((l) => l.id === layoutId) ?? pair[0];
  const dep = layout ? bf.deployments.find((d) => d.id === layout.deployment) : undefined;

  const chips = (value: string, set: (v: string) => void) => (
    <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-3">
      {bf.dispositions.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => set(d.id)}
          className={cx('rounded-xl border px-2.5 py-2 text-left text-sm font-semibold', value === d.id ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
        >
          {d.nameRu}
          <span className="block text-[10.5px] font-normal text-white/40">{d.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <section className="space-y-3">
      <p className="truncate text-sm">
        Ростер: <b>{roster.name}</b>
      </p>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Ваш тип армии</p>
        {chips(you, setYou)}
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Противник</p>
        {chips(foe, setFoe)}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {pair.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLayout(l.id)}
            className={cx('min-w-0 rounded-xl border px-2.5 py-2 text-left', layout?.id === l.id ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
          >
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">Раскладка</span>
            <span className="font-display block text-2xl font-semibold leading-none">{LETTERS[i]}</span>
            <span className="mt-1 block break-words text-[11px] leading-tight text-white/55">{bf.deployments.find((d) => d.id === l.deployment)?.nameRu}</span>
          </button>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Ваша сторона</p>
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
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Армия соперника</p>
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
                <button
                  type="button"
                  onClick={() => setFoeId(r.id)}
                  className={cx('w-full rounded-lg border px-3 py-2 text-left', foeId === r.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10')}
                >
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-[11px] text-white/45">{r.summary ? `${fmtPts(r.summary.points)} очк.` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {foeKind === 'code' && (
          <div className="mt-2">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={3}
              placeholder="WH1.eyJ2Ijox…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs text-white outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-white/45">Код ростера: Roster Builder → ростер → «Экспорт» → код.</p>
            {codeError && <p className="mt-1 text-xs text-danger">{codeError}</p>}
          </div>
        )}
        {foeKind !== 'none' && <p className="mt-1 text-[11px] text-white/45">Соперник встаёт за другую сторону — {side === 'attacker' ? 'защитник' : 'атакующий'}.</p>}
      </div>
      {layout && dep && <BattleMap layout={layout} dep={dep} guides="none" className="mx-auto block w-full max-w-[360px] rounded-xl" />}
      <Button variant="primary" className="h-12 w-full" disabled={!layout || !foeSpec} onClick={() => layout && foeSpec && onDeploy(layout.id, foeSpec)}>
        {foeKind === 'none' ? 'Расставить армию' : 'Расставить армии'}
      </Button>
    </section>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Roster Builder · 40K</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Test Army</h1>
        </div>
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
