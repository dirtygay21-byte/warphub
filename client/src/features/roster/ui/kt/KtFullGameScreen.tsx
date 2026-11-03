/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyKtEvent, KT_GAME_SCHEMA, ktUndoTarget, replayKt, totalKtVp, type KtEvent, type KtEventBody, type KtState, type Op, type Seat } from '../../ktgame';
import { newSeed } from '../../game/rng';
import { usePersistentGameData } from '../skirmish/useSkirmishData';
import type { KtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, IconButton, Segmented } from '../kit';
import { cx } from '../util';
import { useSkirmishOnline } from '../skirmish/useSkirmishOnline';
import { SkirmishOnlineControls } from '../skirmish/SkirmishOnlineControls';

const SEATS: Seat[] = ['p1', 'p2'];
const SAVE_KEY = 'warphub.kt.game.v2';
const readEvents = (): KtEvent[] => { try { const value = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };

export function KtFullGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: KtRoster[]; index: KtIndex; initialRosterId?: string }) {
  const { data, error: loadError } = usePersistentGameData('kt');
  const [events, setEvents] = useState<KtEvent[]>(readEvents);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState(events.length > 0);
  const replay = useMemo(() => (data ? replayKt(events, data) : null), [events, data]);
  const replayEvents = useCallback((list: KtEvent[]) => (data ? replayKt(list, data) : { ok: false as const, error: 'Данные ещё загружаются' }), [data]);
  const onlineGame = useSkirmishOnline({ events, setEvents, replay: replayEvents });
  const state = replay?.ok ? replay.state : null;
  const teamName = (id: string) => index.teams.find((t) => t.id === id)?.name ?? id;
  const rosterName = (id: string) => { const r = rosters.find((x) => x.id === id); return r ? `${r.name} · ${teamName(r.teamId)}` : 'Не выбран'; };
  useEffect(() => {
    if (!data || events.length) return;
    try {
      const old = JSON.parse(localStorage.getItem('warphub.skirmish.game.v1.kt') ?? 'null');
      if (!old?.players?.p1?.rosterId || !old?.players?.p2?.rosterId) return;
      const created = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
      const setup = { type: 'setup', missionId: old.mission, killzone: old.killzone, map: old.map ?? 1, dropZoneLoser: 'p2', rosters: { p1: { id: old.players.p1.rosterId, operatives: rosters.find((r) => r.id === old.players.p1.rosterId)?.operatives.length ?? 0, tacOp: data.tacOps[0]!.id }, p2: { id: old.players.p2.rosterId, operatives: rosters.find((r) => r.id === old.players.p2.rosterId)?.operatives.length ?? 0, tacOp: data.tacOps[0]!.id } }, id: crypto.randomUUID(), seq: 2, at: new Date().toISOString() } as KtEvent;
      setEvents([created, setup]); setResume(true); setError('Старая игра перенесена в новую подготовку; прежний ручной счёт не переносится.');
    } catch { /* повреждённое старое сохранение игнорируем */ }
  }, [data, events.length, rosters]);

  const dispatch = (body: KtEventBody) => {
    if (!data) return false;
    if (onlineGame.online && 'seat' in body && body.seat && body.seat !== onlineGame.online.seat) { setError('Это действие доступно только месту ' + onlineGame.online.seat); return false; }
    const current = body.type === 'game-created' ? null : state;
    const event = { ...body, id: crypto.randomUUID(), seq: events.length + 1, at: new Date().toISOString() } as KtEvent;
    const result = applyKtEvent(current, event, data);
    if (!result.ok) { setError(result.error); haptic.error(); return false; }
    const next = [...events, event];
    setEvents(next); setError(null);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* offline memory only */ }
    onlineGame.send(event);
    return true;
  };
  const newGame = () => {
    const body: KtEventBody = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' } };
    const event = { ...body, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
    const next = [event]; setEvents(next); setResume(false); setError(null);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const startOnline = async () => {
    const body: KtEventBody = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' } };
    const event = { ...body, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
    return onlineGame.start(event);
  };
  const undo = () => dispatch({ type: 'event-reverted' });
  const errorText = loadError ?? error ?? (replay && !replay.ok ? replay.error : null);

  return (
    <Shell onBack={onBack} undo={state && ktUndoTarget(events) ? undo : undefined}>
      {errorText && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorText}</p>}
      {data && <SkirmishOnlineControls game={onlineGame} onStart={startOnline} />}
      {!data && !loadError && <Spinner />}
      {data && !state && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-display text-xl font-semibold uppercase">Approved Ops 2025</p>
          <p className="mt-1 text-sm leading-snug text-fg-2">Полная партия: Crit Op, Kill Op, Tac Op, primary op, initiative cards и четыре turning points.</p>
          <Button variant="primary" className="mt-3 w-full" onClick={newGame}><Icon name="spark" /> Новая игра</Button>
        </section>
      )}
      {data && state && resume && (
        <section className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
          <p className="text-sm font-semibold">Сохранённая игра</p>
          <p className="mt-0.5 text-[12px] text-fg-3">{state.missionId || 'Подготовка'} · {state.stage === 'finished' ? 'Завершена' : `Turning point ${Math.min(state.round, 4)}`}</p>
          <div className="mt-2 grid grid-cols-2 gap-2"><Button variant="primary" onClick={() => setResume(false)}>Продолжить</Button><Button onClick={newGame}>Новая игра</Button></div>
        </section>
      )}
      {data && state && !resume && state.stage === 'setup' && <Setup rosters={rosters} teamName={teamName} initialRosterId={initialRosterId} data={data} onSetup={(body) => dispatch(body)} />}
      {data && state && !resume && state.stage !== 'setup' && (
        <>
          <BattleHeader state={state} data={data} onInitiative={(cards) => dispatch({ type: 'initiative', round: state.round, attempt: 0, cards })} />
          <div className="space-y-3">
            {SEATS.map((seat) => <Player key={seat} state={state} seat={seat} rosterName={rosterName(state.players[seat].rosterId)} tacOpName={data.tacOps.find((t) => t.id === state.players[seat].tacOp)?.name ?? state.players[seat].tacOp} dispatch={dispatch} />)}
          </div>
          {state.stage === 'battle' && (
            <>
              <InitiativeAndActions state={state} dispatch={dispatch} />
              <EndRound key={`${state.round}-${state.missionId}`} state={state} dispatch={dispatch} />
              {state.round > data.game.turningPoints && <Button variant="primary" className="mt-3 w-full" onClick={() => dispatch({ type: 'finish' })}>Завершить битву и раскрыть primary ops</Button>}
            </>
          )}
          {state.stage === 'finished' && <Result state={state} />}
          <Rules state={state} data={data} />
        </>
      )}
      {data && <button type="button" onClick={() => openExternal(data.source.url)} className="mt-5 w-full rounded-xl px-2 py-2 text-left text-[12px] text-fg-3">Источник правил и карт: {data.source.name} · {data.source.checked}</button>}
    </Shell>
  );
}

function Setup({ rosters, teamName, initialRosterId, data, onSetup }: { rosters: KtRoster[]; teamName: (id: string) => string; initialRosterId?: string; data: import('../../skirmish/types').KtGameData; onSetup: (body: KtEventBody) => boolean }) {
  const [missionId, setMission] = useState(data.critOps[0]!.id);
  const [killzone, setKillzone] = useState(data.missionPack.killzones[0]!);
  const [map, setMap] = useState(1);
  const [dropZoneLoser, setLoser] = useState<Seat>('p2');
  const [selection, setSelection] = useState<Record<Seat, { id: string; operatives: number; tacOp: string }>>({
    p1: { id: initialRosterId ?? '', operatives: 0, tacOp: data.tacOps[0]!.id },
    p2: { id: '', operatives: 0, tacOp: data.tacOps[0]!.id },
  });
  const chooseRoster = (seat: Seat, id: string) => { const r = rosters.find((x) => x.id === id); setSelection((s) => ({ ...s, [seat]: { ...s[seat], id, operatives: r?.operatives.length ?? 0 } })); };
  const ready = selection.p1.id && selection.p2.id && selection.p1.tacOp && selection.p2.tacOp;
  return (
    <section className="space-y-3">
      <label className={labelClass}>Crit Op<select value={missionId} onChange={(e) => setMission(e.target.value)} className={selectClass}>{data.critOps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="grid grid-cols-[1fr_5rem] gap-2"><label className={labelClass}>Killzone<select value={killzone} onChange={(e) => setKillzone(e.target.value)} className={selectClass}>{data.missionPack.killzones.map((k) => <option key={k}>{k}</option>)}</select></label><label className={labelClass}>Карта<select value={map} onChange={(e) => setMap(Number(e.target.value))} className={selectClass}>{Array.from({ length: 6 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label></div>
      <div className="rounded-2xl border border-white/10 bg-app-elevated p-3"><p className="mb-2 text-[12px] font-semibold uppercase text-fg-3">Кто проиграл roll-off и получил Re-roll initiative</p><Segmented<Seat> value={dropZoneLoser} onChange={setLoser} options={[{ value: 'p1', label: 'Игрок 1' }, { value: 'p2', label: 'Игрок 2' }]} /></div>
      {SEATS.map((seat) => (
        <div key={seat} className="space-y-2 rounded-2xl border border-white/10 bg-app-elevated p-3">
          <p className="text-[12px] font-semibold uppercase text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'}</p>
          <select value={selection[seat].id} onChange={(e) => chooseRoster(seat, e.target.value)} className={selectClass}><option value="">Выберите kill team</option>{rosters.map((r) => <option key={r.id} value={r.id}>{r.name} · {teamName(r.teamId)} · {r.operatives.length} опер.</option>)}</select>
          <select value={selection[seat].tacOp} onChange={(e) => setSelection((s) => ({ ...s, [seat]: { ...s[seat], tacOp: e.target.value } }))} className={selectClass}>{data.tacOps.map((t) => <option key={t.id} value={t.id}>{t.archetype} · {t.name}</option>)}</select>
        </div>
      ))}
      <Button variant="primary" className="h-12 w-full" disabled={!ready} onClick={() => onSetup({ type: 'setup', missionId, killzone, map, dropZoneLoser, rosters: selection })}>Начать битву</Button>
    </section>
  );
}

function BattleHeader({ state, data, onInitiative }: { state: KtState; data: import('../../skirmish/types').KtGameData; onInitiative: (cards: Partial<Record<Seat, { reroll?: boolean; modifier?: number }>>) => boolean }) {
  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">{state.stage === 'finished' ? 'Битва окончена' : `Turning point ${Math.min(state.round, 4)} / ${data.game.turningPoints}`}</p>
      <p className="mt-1 text-sm text-fg-2">{data.critOps.find((m) => m.id === state.missionId)?.name} · {state.killzone} · Карта {state.map}</p>
      {state.stage === 'battle' && !state.initiativeRolls && state.round <= 4 && <InitiativePanel state={state} onRoll={onInitiative} />}
      {state.initiativeRolls && <p className="mt-1 text-[12px] text-fg-3">Инициатива: {state.initiative === 'p1' ? 'Игрок 1' : 'Игрок 2'} · броски {state.initiativeRolls.p1} : {state.initiativeRolls.p2}</p>}
    </div>
  );
}

function InitiativePanel({ state, onRoll }: { state: KtState; onRoll: (cards: Partial<Record<Seat, { reroll?: boolean; modifier?: number }>>) => boolean }) {
  const [cards, setCards] = useState<Partial<Record<Seat, { reroll?: boolean; modifier?: number }>>>({});
  return (
    <div className="mt-2 rounded-xl bg-black/25 p-2.5">
      {SEATS.map((seat) => state.players[seat].initiativeCards.length > 0 && (
        <label key={seat} className="mb-1 flex items-center gap-2 text-[12px] text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · карты {state.players[seat].initiativeCards.join(', ')}
          <select value={cards[seat]?.modifier ?? 0} onChange={(e) => setCards((c) => ({ ...c, [seat]: { ...c[seat], modifier: Number(e.target.value) } }))} className="rounded bg-app-surface px-2 py-1"><option value={0}>Без модификатора</option>{state.players[seat].initiativeCards.flatMap((n) => <><option key={`plus${n}`} value={n}>+{n}</option><option key={`minus${n}`} value={-n}>−{n}</option></>)}</select>
        </label>
      ))}
      {SEATS.map((seat) => state.players[seat].rerollCard && <label key={`reroll${seat}`} className="flex items-center gap-2 text-[12px] text-fg-3"><input type="checkbox" checked={!!cards[seat]?.reroll} onChange={(e) => setCards((c) => ({ ...c, [seat]: { ...c[seat], reroll: e.target.checked } }))} /> Re-roll: {seat === 'p1' ? 'Игрок 1' : 'Игрок 2'}</label>)}
      <Button variant="primary" className="mt-2 w-full" onClick={() => onRoll(cards)}>Бросить инициативу</Button>
    </div>
  );
}

function Player({ state, seat, rosterName, tacOpName, dispatch }: { state: KtState; seat: Seat; rosterName: string; tacOpName: string; dispatch: (body: KtEventBody) => boolean }) {
  const p = state.players[seat];
  return (
    <article className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · {rosterName}</p><p className="truncate text-[12px] text-fg-3">Tac Op: {tacOpName} · Kill Grade {p.killGrade}</p></div><b className="font-display text-xl">{totalKtVp(state, seat)} VP</b></div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]"><span className="rounded bg-black/25 px-2 py-1">Crit {p.critVp}</span><span className="rounded bg-black/25 px-2 py-1">Kill {p.killVp}</span><span className="rounded bg-black/25 px-2 py-1">Tac {p.tacVp}</span>{p.bonusVp > 0 && <span className="rounded bg-accent/15 px-2 py-1 text-accent">Primary +{p.bonusVp}</span>}</div>
      {state.stage === 'battle' && <div className="mt-2 flex items-center gap-2 text-[12px]"><span className="text-fg-3">CP</span><button type="button" aria-label={`CP минус ${seat}`} onClick={() => dispatch({ type: 'cp-adjust', seat, delta: -1 })} className="size-7 rounded border border-white/10">−</button><b>{p.cp}</b><button type="button" aria-label={`CP плюс ${seat}`} onClick={() => dispatch({ type: 'cp-adjust', seat, delta: 1 })} className="size-7 rounded border border-white/10">+</button>{state.round === 1 && <span className="ml-auto flex gap-1">{(['crit', 'kill', 'tac'] as Op[]).map((op) => <button key={op} type="button" onClick={() => dispatch({ type: 'primary-op', seat, op })} className={cx('rounded border px-2 py-1', p.primaryOp === op ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-3')}>{op}</button>)}</span>}</div>}
    </article>
  );
}

const ACTIONS: Record<string, { action: string; label: string }[]> = {
  secure: [{ action: 'secure', label: 'Secure 1AP' }], loot: [{ action: 'loot', label: 'Loot 1AP' }], transmission: [{ action: 'transmit', label: 'Initiate Transmission 1AP' }], orb: [{ action: 'orb', label: 'Move Orb 1AP' }], download: [{ action: 'download', label: 'Download 1AP' }], data: [{ action: 'compile', label: 'Compile Data 1AP' }, { action: 'send', label: 'Send Data 1AP' }], reboot: [{ action: 'reboot', label: 'Reboot 2AP' }],
};
function InitiativeAndActions({ state, dispatch }: { state: KtState; dispatch: (body: KtEventBody) => boolean }) {
  const [seat, setSeat] = useState<Seat>('p1');
  const [marker, setMarker] = useState('home');
  const [target, setTarget] = useState('centre');
  const [wounds, setWounds] = useState(8);
  const [within6, setWithin6] = useState(true);
  const actions = ACTIONS[state.missionId] ?? [];
  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-app-elevated p-3">
      <Segmented<Seat> value={seat} onChange={setSeat} options={[{ value: 'p1', label: 'Действует игрок 1' }, { value: 'p2', label: 'Действует игрок 2' }]} />
      {actions.length > 0 && <div className="grid grid-cols-[1fr_1fr] gap-2"><select value={marker} onChange={(e) => setMarker(e.target.value)} className={selectClass}><option value="home">Home</option><option value="centre">Centre</option><option value="enemy">Enemy</option></select><select value={target} onChange={(e) => setTarget(e.target.value)} className={selectClass}><option value="home">Target: Home</option><option value="centre">Target: Centre</option><option value="enemy">Target: Enemy</option></select></div>}
      {actions.map((a) => <Button key={a.action} className="w-full" onClick={() => dispatch({ type: 'crit-action', seat, action: a.action, marker, target })}>{a.label}</Button>)}
      {state.missionId === 'reboot' && <Button className="w-full" onClick={() => dispatch({ type: 'crit-action', seat, action: 'reboot-select', marker, target })}>Выбрать inert: P1={marker}, P2={target}</Button>}
      <div className="border-t border-white/10 pt-2">
        <p className="mb-2 text-[12px] font-semibold uppercase text-fg-3">Вражеский оперативник incapacitated</p>
        <div className="flex items-center gap-2"><select value={wounds} onChange={(e) => setWounds(Number(e.target.value))} className={selectClass}>{[4, 8, 12, 16].map((n) => <option key={n} value={n}>Wounds {n}</option>)}</select><label className="flex items-center gap-1 text-[12px] text-fg-3"><input type="checkbox" checked={within6} onChange={(e) => setWithin6(e.target.checked)} /> в 6″ drop zone</label></div>
        <Button className="mt-2 w-full" onClick={() => dispatch({ type: 'incapacitated', seat, wounds, within6, marker })}>Записать incapacitation</Button>
      </div>
      <div className="border-t border-white/10 pt-2"><p className="mb-1 text-[12px] text-fg-3">Tac Op: подтвердите результат по тексту карты (не больше 2VP за turning point)</p><div className="grid grid-cols-2 gap-2"><Button onClick={() => dispatch({ type: 'tac-score', seat, points: 1 })}>+1 Tac VP</Button><Button onClick={() => dispatch({ type: 'tac-score', seat, points: 2 })}>+2 Tac VP</Button></div></div>
    </section>
  );
}

function EndRound({ state, dispatch }: { state: KtState; dispatch: (body: KtEventBody) => boolean }) {
  const [controls, setControls] = useState<Record<string, Seat | null>>({ home: null, centre: null, enemy: null });
  const [carrying, setCarrying] = useState<Record<string, Seat>>({});
  const [claims, setClaims] = useState<Partial<Record<Seat, { marker: string; control: boolean; uncontested: boolean }>>>({});
  if (state.round > 4) return null;
  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-app-elevated p-3">
      <p className="text-sm font-semibold">Конец turning point {state.round}: контроль маркеров</p>
      {Object.keys(controls).map((marker) => <label key={marker} className="mt-2 flex items-center gap-2 text-[12px] capitalize text-fg-3">{marker}<select value={controls[marker] ?? ''} onChange={(e) => setControls((c) => ({ ...c, [marker]: (e.target.value || null) as Seat | null }))} className={selectClass}><option value="">Никто / спорно</option><option value="p1">Игрок 1</option><option value="p2">Игрок 2</option></select>{state.missionId === 'energy-cells' && <select value={carrying[marker] ?? ''} onChange={(e) => setCarrying((c) => ({ ...c, [marker]: e.target.value as Seat }))} className={selectClass}><option value="">Не несут</option><option value="p1">Несёт P1</option><option value="p2">Несёт P2</option></select>}</label>)}
      {state.missionId === 'stake-claim' && SEATS.map((seat) => <div key={seat} className="mt-2 rounded-xl bg-black/25 p-2 text-[12px] text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · claim<select value={claims[seat]?.marker ?? 'home'} onChange={(e) => setClaims((c) => ({ ...c, [seat]: { marker: e.target.value, control: c[seat]?.control ?? true, uncontested: false } }))} className={selectClass}><option value="home">Home</option><option value="centre">Centre</option><option value="enemy">Enemy</option></select><select value={claims[seat]?.control === false ? 'uncontested' : 'control'} onChange={(e) => setClaims((c) => ({ ...c, [seat]: { marker: c[seat]?.marker ?? 'home', control: e.target.value === 'control', uncontested: e.target.value !== 'control' } }))} className={selectClass}><option value="control">Буду контролировать</option><option value="uncontested">Враг не будет contest</option></select></div>)}
      <Button variant="primary" className="mt-3 w-full" onClick={() => dispatch({ type: 'end-round', controls, carrying, claims: state.missionId === 'stake-claim' ? claims : undefined })}>Завершить turning point</Button>
    </section>
  );
}

function Result({ state }: { state: KtState }) {
  return <section className="my-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center"><p className="font-display text-2xl font-semibold uppercase">{state.winner === 'draw' ? 'Ничья' : `Победа: ${state.winner === 'p1' ? 'Игрок 1' : 'Игрок 2'}`}</p><p className="mt-1 text-lg">{totalKtVp(state, 'p1')} : {totalKtVp(state, 'p2')}</p></section>;
}
function Rules({ state, data }: { state: KtState; data: import('../../skirmish/types').KtGameData }) {
  const mission = data.critOps.find((m) => m.id === state.missionId);
  return <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><summary className="cursor-pointer text-sm font-semibold">Правила миссии и Tac Ops</summary>{mission && <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-fg-2">{mission.text}</p>}{SEATS.map((seat) => { const p = state.players[seat], tac = data.tacOps.find((t) => t.id === p.tacOp); return tac ? <p key={seat} className="mt-3 whitespace-pre-line border-t border-white/10 pt-2 text-[12px] leading-relaxed text-fg-2"><b>{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · {tac.name}</b><br />{tac.text}</p> : null; })}<p className="mt-3 border-t border-white/10 pt-2 text-[12px] text-fg-3">{data.killOp.text}<br />{data.game.primaryOpBonus}</p></details>;
}
const selectClass = 'mt-1 h-10 w-full rounded-xl border border-white/10 bg-app-surface px-2 text-[13px] text-fg outline-none';
const labelClass = 'block rounded-2xl border border-white/10 bg-app-elevated p-3 text-[12px] font-semibold uppercase tracking-wider text-fg-3';
function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) { return <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5"><header className="mb-4 flex items-end gap-3"><IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Kill Team · Approved Ops 2025</p><h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Полная игра</h1></div>{undo && <button type="button" onClick={undo} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold">Отменить</button>}</header>{children}</div>; }
function Spinner() { return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />; }
