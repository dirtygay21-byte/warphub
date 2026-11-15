import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadKtGame, loadWarcryGame } from '../../data';
import type { KtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import type { SkirmishGameData, SkirmishSystem } from '../../skirmish/types';
import type { WarcryRoster } from '../../warcry/roster';
import type { WarcryIndex } from '../../warcry/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, IconButton, Segmented, HeroWorm } from '../kit';

export type SkirmishRoster = KtRoster | WarcryRoster;
type Seat = 'p1' | 'p2';
type Stage = 'setup' | 'battle' | 'finished';
type Player = { rosterId: string; cp: number; score: number };
type SavedGame = {
  v: 1;
  system: SkirmishSystem;
  stage: Stage;
  players: Record<Seat, Player>;
  round: number;
  initiative: Seat;
  mission: string;
  killzone: string;
  map: number;
  matchedPlay: boolean;
  deployment: string;
  victory: string;
  twist: string;
  updatedAt: string;
};

const initialPlayer = (rosterId = ''): Player => ({ rosterId, cp: 2, score: 0 });
const freshGame = (system: SkirmishSystem, rosterId?: string): SavedGame => ({
  v: 1,
  system,
  stage: 'setup',
  players: { p1: initialPlayer(rosterId ?? ''), p2: initialPlayer() },
  round: 1,
  initiative: 'p1',
  mission: '',
  killzone: '',
  map: 1,
  matchedPlay: true,
  deployment: '',
  victory: '',
  twist: '',
  updatedAt: new Date().toISOString(),
});
const saveKey = (system: SkirmishSystem) => `warphub.skirmish.game.v1.${system}`;
const readGame = (system: SkirmishSystem): SavedGame | null => {
  try {
    const value = JSON.parse(localStorage.getItem(saveKey(system)) ?? 'null') as SavedGame | null;
    return value?.v === 1 && value.system === system && value.players ? value : null;
  } catch {
    return null;
  }
};

export function KtGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: KtRoster[]; index: KtIndex; initialRosterId?: string }) {
  return <SkirmishGameScreen system="kt" onBack={onBack} rosters={rosters} index={index} initialRosterId={initialRosterId} />;
}

export function WarcryGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string }) {
  return <SkirmishGameScreen system="warcry" onBack={onBack} rosters={rosters} index={index} initialRosterId={initialRosterId} />;
}

function SkirmishGameScreen({ system, onBack, rosters, index, initialRosterId }: { system: SkirmishSystem; onBack: () => void; rosters: SkirmishRoster[]; index: KtIndex | WarcryIndex; initialRosterId?: string }) {
  const [data, setData] = useState<SkirmishGameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SavedGame | null>(() => readGame(system));
  const [starting, setStarting] = useState(!!state);
  useEffect(() => {
    (system === 'kt' ? loadKtGame() : loadWarcryGame()).then(setData, (e) => setError(String(e?.message ?? e)));
  }, [system]);
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(saveKey(system), JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
    } catch {
      /* игра остаётся на экране */
    }
  }, [state, system]);

  const rosterName = (id: string) => rosters.find((r) => r.id === id)?.name ?? 'Не выбран';
  const detail = (id: string) => {
    const r = rosters.find((x) => x.id === id);
    if (!r) return '';
    if (r.system === 'kt' && 'teams' in index) return index.teams.find((t) => t.id === r.teamId)?.name ?? r.teamId;
    if (r.system === 'warcry' && 'factions' in index) return index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId;
    return '';
  };
  const missionTitle = useMemo(() => {
    if (!state || !data) return '';
    if (data.system === 'kt') return [state.mission || 'Миссия не выбрана', state.killzone, `Карта ${state.map}`].filter(Boolean).join(' · ');
    return [state.deployment || 'Deployment не выбран', state.victory || 'Victory не выбрано', state.matchedPlay ? 'Matched play' : state.twist].filter(Boolean).join(' · ');
  }, [state, data]);

  const newGame = () => {
    setState(freshGame(system, initialRosterId));
    setStarting(false);
    haptic.tap();
  };
  const patch = (p: Partial<SavedGame>) => setState((s) => (s ? { ...s, ...p } : s));
  const patchPlayer = (seat: Seat, p: Partial<Player>) => setState((s) => (s ? { ...s, players: { ...s.players, [seat]: { ...s.players[seat], ...p } } } : s));
  const nextRound = () => {
    if (!state || !data) return;
    const players = { ...state.players };
    if (data.system === 'kt') {
      players.p1 = { ...players.p1, cp: players.p1.cp + 1 };
      players.p2 = { ...players.p2, cp: players.p2.cp + 1 };
      players[state.initiative === 'p1' ? 'p2' : 'p1'].cp += 1;
    }
    patch({ round: state.round + 1, players });
    haptic.tap();
  };
  const ready = state && data && (data.system === 'kt' ? state.mission && state.killzone : state.deployment && state.victory) && state.players.p1.rosterId && state.players.p2.rosterId;

  return (
    <Shell onBack={onBack} title={system === 'kt' ? 'Kill Team' : 'Warcry'}>
      {error && <p className="mt-10 text-center text-sm text-fg-3">{error}</p>}
      {!error && !data && <Spinner />}
      {data && !state && (
        <section className="relative overflow-hidden rounded-[20px] bg-accent p-4 text-[#111110]">
          <HeroWorm />
          <p className="relative font-display text-xl font-semibold uppercase">Новая игра</p>
          <p className="relative mt-1 pr-6 text-sm leading-snug text-[#111110]/80">Ростеры, официальная последовательность подготовки, инициатива и раунды. Игра сохраняется на этом устройстве.</p>
          <Button variant="ink" className="relative mt-3 w-full" onClick={newGame}><Icon name="spark" /> Начать подготовку</Button>
        </section>
      )}
      {data && state && (
        <>
          {starting && (
            <section className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
              <p className="text-sm font-semibold">Есть сохранённая игра</p>
              <p className="mt-0.5 text-[12px] text-fg-3">{state.stage === 'setup' ? 'Подготовка' : state.stage === 'finished' ? 'Завершена' : `${roundName(data, state.round)}`} · {missionTitle}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => setStarting(false)}>Продолжить</Button>
                <Button onClick={newGame}>Новая игра</Button>
              </div>
            </section>
          )}
          {!starting && state.stage === 'setup' && (
            <Setup state={state} data={data} rosters={rosters} detail={detail} patch={patch} patchPlayer={patchPlayer} onStart={() => ready && patch({ stage: 'battle' })} ready={!!ready} />
          )}
          {!starting && state.stage !== 'setup' && (
            <section className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">{state.stage === 'finished' ? 'Битва окончена' : roundName(data, state.round)}</p>
                <p className="mt-1 text-sm leading-snug text-fg-2">{missionTitle}</p>
                <p className="mt-1 text-[12px] text-fg-3">{data.game.end}</p>
              </div>
              {(['p1', 'p2'] as Seat[]).map((seat) => (
                <PlayerCard key={seat} seat={seat} player={state.players[seat]} name={rosterName(state.players[seat].rosterId)} detail={detail(state.players[seat].rosterId)} system={system} initiative={state.initiative === seat} onInitiative={() => patch({ initiative: seat })} onPatch={(p) => patchPlayer(seat, p)} />
              ))}
              {state.stage === 'battle' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => patch({ stage: 'setup' })}>Подготовка</Button>
                  <Button variant="primary" onClick={nextRound}>Следующий раунд</Button>
                  <Button className="col-span-2" onClick={() => patch({ stage: 'finished' })}>Завершить битву</Button>
                </div>
              ) : (
                <Button variant="primary" className="w-full" onClick={() => patch({ stage: 'battle' })}>Вернуться к битве</Button>
              )}
            </section>
          )}
          {!starting && <SourceLink data={data} />}
        </>
      )}
    </Shell>
  );
}

function Setup({ state, data, rosters, detail, patch, patchPlayer, onStart, ready }: { state: SavedGame; data: SkirmishGameData; rosters: SkirmishRoster[]; detail: (id: string) => string; patch: (p: Partial<SavedGame>) => void; patchPlayer: (seat: Seat, p: Partial<Player>) => void; onStart: () => void; ready: boolean }) {
  return (
    <section className="space-y-3">
      {(['p1', 'p2'] as Seat[]).map((seat, i) => (
        <label key={seat} className="block rounded-2xl border border-white/10 bg-app-elevated p-3">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Игрок {i + 1} · ростер</span>
          <select value={state.players[seat].rosterId} onChange={(e) => patchPlayer(seat, { rosterId: e.target.value })} className={selectClass}>
            <option value="">Выберите ростер</option>
            {rosters.map((r) => <option key={r.id} value={r.id}>{r.name} · {detail(r.id)}</option>)}
          </select>
        </label>
      ))}
      {data.system === 'kt' ? (
        <>
          <label className={labelClass}>Миссия · Approved Ops 2025
            <select value={state.mission} onChange={(e) => patch({ mission: e.target.value })} className={selectClass}>
              <option value="">Выберите миссию</option>
              {data.missionPack.missions.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className={labelClass}>Killzone
            <select value={state.killzone} onChange={(e) => patch({ killzone: e.target.value })} className={selectClass}>
              <option value="">Выберите killzone</option>
              {data.missionPack.killzones.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className={labelClass}>Карта миссии
            <select value={state.map} onChange={(e) => patch({ map: Number(e.target.value) })} className={selectClass}>
              {Array.from({ length: data.missionPack.mapsPerKillzone }, (_, i) => <option key={i + 1} value={i + 1}>Карта {i + 1}</option>)}
            </select>
          </label>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-app-elevated p-3">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Формат</p>
            <Segmented value={state.matchedPlay ? 'matched' : 'standard'} onChange={(v) => patch({ matchedPlay: v === 'matched', deployment: '', victory: '', twist: '' })} options={[{ value: 'matched', label: 'Matched play' }, { value: 'standard', label: 'Стандартная' }]} />
          </div>
          <OptionTable label="Deployment map" matched={state.matchedPlay} options={data.deploymentOptions} value={state.deployment} onChange={(deployment) => patch({ deployment })} />
          <OptionTable label="Victory condition" matched={state.matchedPlay} options={data.victoryOptions} value={state.victory} onChange={(victory) => patch({ victory })} />
          {!state.matchedPlay && <label className={labelClass}>Twist (по карте)<input value={state.twist} onChange={(e) => patch({ twist: e.target.value })} className={selectClass} placeholder="Название twist" /></label>}
        </>
      )}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
        <p className="font-display text-lg font-semibold uppercase">Подготовка по правилам</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-snug text-fg-2">{data.setup.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </div>
      <Button variant="primary" className="h-12 w-full" disabled={!ready} onClick={onStart}>Начать битву</Button>
    </section>
  );
}

function OptionTable({ label, matched, options, value, onChange }: { label: string; matched: boolean; options: { tableA: string[]; tableB: string[] }; value: string; onChange: (v: string) => void }) {
  return (
    <label className={labelClass}>{label}{matched ? ' · Table A' : ' · Table A / B'}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">Выберите вариант</option>
        {(['tableA', ...(matched ? [] : ['tableB'])] as ('tableA' | 'tableB')[]).flatMap((table) => options[table].map((name) => <option key={`${table}-${name}`} value={name}>{matched ? name : `${table === 'tableA' ? 'A' : 'B'} · ${name}`}</option>))}
      </select>
    </label>
  );
}

function PlayerCard({ seat, player, name, detail, system, initiative, onInitiative, onPatch }: { seat: Seat; player: Player; name: string; detail: string; system: SkirmishSystem; initiative: boolean; onInitiative: () => void; onPatch: (p: Partial<Player>) => void }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · {name}</p><p className="truncate text-[12px] text-fg-3">{detail}</p></div>
        <Button className={initiative ? 'border-accent/50 bg-accent/15 text-accent' : ''} onClick={onInitiative}>{initiative ? 'Инициатива ✓' : 'Инициатива'}</Button>
      </div>
      <div className={system === 'kt' ? 'mt-3 grid grid-cols-2 gap-2' : 'mt-3'}>
        {system === 'kt' && <Counter label="CP" value={player.cp} onChange={(cp) => onPatch({ cp })} />}
        <Counter label={system === 'kt' ? 'VP' : 'Счёт по victory'} value={player.score} onChange={(score) => onPatch({ score })} />
      </div>
    </article>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-black/25 px-2.5 py-2">
      <span className="text-[12px] font-semibold uppercase text-fg-3">{label}</span>
      <span className="flex items-center gap-2"><button type="button" aria-label={`Уменьшить ${label}`} onClick={() => onChange(Math.max(0, value - 1))} className="size-8 rounded-lg border border-white/10">−</button><b className="min-w-6 text-center font-display text-xl">{value}</b><button type="button" aria-label={`Увеличить ${label}`} onClick={() => onChange(value + 1)} className="size-8 rounded-lg border border-white/10">+</button></span>
    </div>
  );
}

const roundName = (data: SkirmishGameData, n: number) => `${data.game.roundLabel} ${n}`;
const selectClass = 'mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-app-surface px-3 text-sm text-fg outline-none focus:border-accent';
const labelClass = 'block rounded-2xl border border-white/10 bg-app-elevated p-3 text-[12px] font-semibold uppercase tracking-wider text-fg-3';
function SourceLink({ data }: { data: SkirmishGameData }) {
  return <button type="button" onClick={() => openExternal(data.system === 'kt' ? data.missionPack.url : data.source.url)} className="mt-5 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px] text-fg-3 active:bg-white/5"><Icon name="book" className="size-4 shrink-0 text-accent" /><span className="flex-1">Источник: {data.source.name} · проверено {data.source.checked}. Официальный генератор и карты.</span><Icon name="chevron" className="size-4" /></button>;
}
function Shell({ onBack, title, children }: { onBack: () => void; title: string; children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5"><header className="mb-4 flex items-end gap-3"><IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" /><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder</p><h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">{title} · игра</h1></div></header>{children}</div>;
}
function Spinner() { return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />; }
