import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadBattlefield, loadFaction, type BattlefieldData } from '../../data';
import { computeRoster, makeLookup, type ComputedRoster, type DataLookup } from '../../engine/compute';
import type { DataIndex, Roster } from '../../engine/types';
import { pushOverlay, tg } from '../../telegram';
import { buildUnits, parseSave, restoreUnits, type Side, type TASave, type TAUnit } from '../../testarmy';
import { BattleMap } from '../Battlefield';
import { Button, IconButton, Segmented } from '../kit';
import { cx, fmtPts } from '../util';
import { Board } from './Board';

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
const dropSave = (rosterId: string) => {
  try {
    localStorage.removeItem(saveKey(rosterId));
  } catch {
    /* хранилище недоступно */
  }
};

/**
 * Test Army (24.10.2026): ростер → поле боя (пара типов армий и раскладка A/B/C) и сторона → стол, где модели ростера —
 * базы в настоящем размере. Только 40K. Армия соперника — позже (состояние уже хранит сторону армии).
 */
export function TestArmyScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: Roster[]; index: DataIndex; initialRosterId?: string }) {
  const [bf, setBf] = useState<BattlefieldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(initialRosterId ?? null);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('attacker');
  const [units, setUnits] = useState<TAUnit[] | null>(null);
  const [ctx, setCtx] = useState<{ cr: ComputedRoster; L: DataLookup } | null>(null);
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

  // saved — продолжить сохранённую расстановку; иначе новая (сохранение этого ростера заменяется)
  const deploy = (id: string, s: Side, saved?: TASave) => {
    if (!roster) return;
    setLayoutId(id);
    setSide(s);
    setUnits(null);
    setStep('board');
    if (!saved) dropSave(roster.id);
    loadFaction(roster.factionId).then(
      (f) => {
        const L = makeLookup(f);
        const cr = computeRoster(roster, L);
        const fresh = buildUnits(cr);
        setCtx({ cr, L });
        setUnits(saved ? restoreUnits(fresh, saved.units) : fresh);
      },
      (e) => setError(String(e?.message ?? e)),
    );
  };

  // автосохранение после каждого изменения расстановки
  useEffect(() => {
    if (step === 'board' && roster && layoutId && units) writeSave({ v: 1, rosterId: roster.id, layoutId, side, savedAt: new Date().toISOString(), units });
  }, [step, roster, layoutId, side, units]);

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
    if (!units || !ctx) return <Spinner full />;
    return <Board roster={roster} cr={ctx.cr} L={ctx.L} layout={layout} dep={dep} side={side} units={units} onUnits={setUnits} onBack={() => setStep('field')} />;
  }

  if (step === 'field' && roster)
    return (
      <Shell onBack={initialRosterId ? onBack : () => setStep('roster')}>
        <SavedCard bf={bf} rosterId={roster.id} onContinue={(s) => deploy(s.layoutId, s.side, s)} />
        <FieldPicker
          bf={bf}
          roster={roster}
          layoutId={layoutId}
          onLayout={setLayoutId}
          side={side}
          onSide={setSide}
          onDeploy={(id) => deploy(id, side)}
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
function SavedCard({ bf, rosterId, onContinue }: { bf: BattlefieldData; rosterId: string; onContinue: (s: TASave) => void }) {
  const [saved] = useState(() => readSave(rosterId));
  if (!saved) return null;
  const layout = bf.layouts.find((l) => l.id === saved.layoutId);
  if (!layout) return null;
  const dep = bf.deployments.find((d) => d.id === layout.deployment);
  const placed = saved.units.filter((u) => u.placed).length;
  const when = new Date(saved.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Сохранённая расстановка · {when}</p>
      <p className="mt-1 text-sm">
        {dep?.nameRu ?? '—'} · раскладка {LETTERS[layout.variant - 1] ?? layout.variant} · {saved.side === 'attacker' ? 'атакующий' : 'защитник'} · на столе {placed} из {saved.units.length}
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
  layoutId,
  onLayout,
  side,
  onSide,
  onDeploy,
}: {
  bf: BattlefieldData;
  roster: Roster;
  layoutId: string | null;
  onLayout: (id: string) => void;
  side: Side;
  onSide: (s: Side) => void;
  onDeploy: (layoutId: string) => void;
}) {
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
      {layout && dep && <BattleMap layout={layout} dep={dep} guides="none" className="mx-auto block w-full max-w-[360px] rounded-xl" />}
      <Button variant="primary" className="h-12 w-full" disabled={!layout} onClick={() => layout && onDeploy(layout.id)}>
        Расставить армию
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
