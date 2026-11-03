/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyWarcryEvent, GROUP_LABEL, replayWarcry, WARCRY_GAME_SCHEMA, warcryUndoTarget, type Color, type Group, type Seat, type WcEvent, type WcEventBody, type WcState } from '../../warcrygame';
import { newSeed } from '../../game/rng';
import { usePersistentGameData } from '../skirmish/useSkirmishData';
import { autoGroups, type WarcryRoster } from '../../warcry/roster';
import type { WarcryIndex } from '../../warcry/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, IconButton, Segmented } from '../kit';
import { useSkirmishOnline } from '../skirmish/useSkirmishOnline';
import { SkirmishOnlineControls } from '../skirmish/SkirmishOnlineControls';
import { SkirmishRuleText, SkirmishStep } from '../skirmish/SkirmishLayout';

const SEATS: Seat[] = ['p1', 'p2'];
const SAVE_KEY = 'warphub.warcry.game.v2';
const readEvents = (): WcEvent[] => { try { const value = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };

export function WarcryFullGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string }) {
  const { data, error: loadError } = usePersistentGameData('warcry');
  const [events, setEvents] = useState<WcEvent[]>(readEvents);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState(events.length > 0);
  const replay = useMemo(() => (data ? replayWarcry(events, data) : null), [events, data]);
  const replayEvents = useCallback((list: WcEvent[]) => (data ? replayWarcry(list, data) : { ok: false as const, error: 'Данные ещё загружаются' }), [data]);
  const onlineGame = useSkirmishOnline({ events, setEvents, replay: replayEvents });
  const state = replay?.ok ? replay.state : null;
  const rosterName = (id: string) => { const r = rosters.find((x) => x.id === id); if (!r) return 'Не выбран'; const faction = index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId; return `${r.name} · ${faction}`; };
  const deployment = data?.deployments.find((d) => d.id === state?.deploymentId);
  const victory = data && state ? [...data.victories.tableA, ...data.victories.tableB].find((v) => v.id === state.victoryId) : undefined;
  useEffect(() => {
    if (!data || events.length) return;
    try {
      const old = JSON.parse(localStorage.getItem('warphub.skirmish.game.v1.warcry') ?? 'null');
      if (!old?.players?.p1?.rosterId || !old?.players?.p2?.rosterId) return;
      const created = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
      const rostersForSetup = Object.fromEntries(SEATS.map((seat) => {
        const oldId = old.players[seat].rosterId;
        const roster = autoGroups(rosters.find((r) => r.id === oldId)!);
        if (!roster) return [seat, null];
        return [seat, { id: roster.id, color: seat === 'p1' ? 'red' : 'blue', fighters: roster.fighters.map((f) => f.uid), groups: Object.fromEntries(roster.fighters.map((f) => [f.uid, f.group ?? 'dagger'])) }];
      }));
      if (!rostersForSetup.p1 || !rostersForSetup.p2) return;
      const deploymentId = data.deployments.find((d) => d.name === old.deployment)?.id ?? data.deployments[0]!.id;
      const victoryId = [...data.victories.tableA, ...data.victories.tableB].find((v) => v.name === old.victory)?.id ?? data.victories.tableA[0]!.id;
      const setup = { type: 'setup', deploymentId, victoryId, matchedPlay: old.matchedPlay ?? true, attacker: 'p1', rosters: rostersForSetup, id: crypto.randomUUID(), seq: 2, at: new Date().toISOString() } as WcEvent;
      setEvents([created, setup]); setResume(true); setError('Старая игра перенесена в новую подготовку; прежний ручной счёт не переносится.');
    } catch { /* повреждённое старое сохранение игнорируем */ }
  }, [data, events.length, rosters]);

  const dispatch = (body: WcEventBody) => {
    if (!data) return false;
    if (onlineGame.online && 'seat' in body && body.seat && body.seat !== onlineGame.online.seat) { setError('Это действие доступно только месту ' + onlineGame.online.seat); return false; }
    const current = body.type === 'game-created' ? null : state;
    const event = { ...body, id: crypto.randomUUID(), seq: events.length + 1, at: new Date().toISOString() } as WcEvent;
    const result = applyWarcryEvent(current, event, data);
    if (!result.ok) { setError(result.error); haptic.error(); return false; }
    const next = [...events, event]; setEvents(next); setError(null);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* memory only */ }
    onlineGame.send(event);
    return true;
  };
  const newGame = () => {
    const event = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
    const next = [event]; setEvents(next); setResume(false); setError(null);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const startOnline = async () => {
    const body: WcEventBody = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' } };
    const event = { ...body, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
    return onlineGame.start(event);
  };
  const errorText = loadError ?? error ?? (replay && !replay.ok ? replay.error : null);

  return (
    <Shell onBack={onBack} undo={state && warcryUndoTarget(events) ? () => dispatch({ type: 'event-reverted' }) : undefined}>
      {errorText && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorText}</p>}
      {data && <SkirmishOnlineControls game={onlineGame} onStart={startOnline} />}
      {!data && !loadError && <Spinner />}
      {data && !state && <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="font-display text-xl font-semibold uppercase">Warcry · полная битва</p><p className="mt-1 text-sm leading-snug text-fg-2">Battleplan, инициативные и wild dice, активации, способности, резервы и victory condition.</p><Button variant="primary" className="mt-3 w-full" onClick={newGame}><Icon name="spark" /> Новая игра</Button></section>}
      {data && state && resume && <section className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 p-3"><p className="text-sm font-semibold">Сохранённая игра</p><p className="mt-0.5 text-[12px] text-fg-3">{deployment?.name ?? 'Подготовка'} · {state.stage === 'finished' ? 'Завершена' : `Battle round ${state.round}`}</p><div className="mt-2 grid grid-cols-2 gap-2"><Button variant="primary" onClick={() => setResume(false)}>Продолжить</Button><Button onClick={newGame}>Новая игра</Button></div></section>}
      {data && state && !resume && state.stage === 'setup' && <Setup rosters={rosters} index={index} initialRosterId={initialRosterId} data={data} onSetup={(body) => dispatch(body)} />}
      {data && state && !resume && state.stage !== 'setup' && (
        <>
          <div className="mb-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">{state.stage === 'finished' ? 'Битва окончена' : `Battle round ${state.round}${state.endRound ? ` / ${state.endRound}` : ''}`}</p>
            <p className="mt-1 text-sm text-fg-2">{deployment?.name} · {victory?.name}</p>
            <p className="mt-1 text-[12px] text-fg-3">Атакующий: {state.attacker === 'p1' ? 'Игрок 1' : 'Игрок 2'} · Инициатива: {state.initiative === 'p1' ? 'Игрок 1' : 'Игрок 2'}</p>
            {state.stage === 'battle' && !state.initiativeDice && <WildPanel state={state} onRoll={(wild) => dispatch({ type: 'initiative', wild })} />}
            {state.initiativeDice && <div className="mt-2 text-[12px] text-fg-3">{SEATS.map((seat) => <p key={seat}>{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'}: {state.initiativeDice![seat].join(', ')} · singles {state.players[seat].singles} · ability {state.players[seat].abilityRank ?? '—'} · wild saved {state.players[seat].wildSaved}</p>)}</div>}
            {state.phase === 'reserve' && state.initiativeDice && <Button variant="primary" className="mt-2 w-full" onClick={() => dispatch({ type: 'phase-advanced' })}>Перейти к Combat phase</Button>}
          </div>
          <div className="space-y-3">{SEATS.map((seat) => <Player key={seat} state={state} seat={seat} rosterName={rosterName(state.players[seat].rosterId)} deployment={deployment} dispatch={dispatch} />)}</div>
          {state.stage === 'battle' && <div className="mt-3 grid grid-cols-2 gap-2">{state.phase === 'combat' && <Button onClick={() => dispatch({ type: 'end-round' })}>Завершить раунд</Button>}{(state.phase === 'combat' || state.round > (state.endRound ?? 0)) && <Button variant="primary" onClick={() => dispatch({ type: 'finish' })}>Завершить битву</Button>}</div>}
          {state.stage === 'finished' && <Result state={state} />}
          {victory && <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><summary className="cursor-pointer text-sm font-semibold">Victory condition и battleplan</summary><div className="mt-2"><SkirmishRuleText text={victory.text} /></div>{state.twistId && <div className="mt-2 border-t border-white/10 pt-2"><SkirmishRuleText text={data.twists.find((t) => t.id === state.twistId)!.text} /></div>}</details>}
        </>
      )}
      {data && <button type="button" onClick={() => openExternal(data.source.url)} className="mt-5 w-full rounded-xl px-2 py-2 text-left text-[12px] text-fg-3">Источник: {data.source.name} · {data.source.checked}</button>}
    </Shell>
  );
}

function Setup({ rosters, index, initialRosterId, data, onSetup }: { rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string; data: import('../../skirmish/types').WarcryGameData; onSetup: (body: WcEventBody) => boolean }) {
  const [deploymentId, setDeployment] = useState(data.deployments[0]!.id);
  const [victoryId, setVictory] = useState(data.victories.tableA[0]!.id);
  const [twistId, setTwist] = useState(data.twists[0]!.id);
  const [matchedPlay, setMatched] = useState(true);
  const [attacker, setAttacker] = useState<Seat>('p1');
  const [colors, setColors] = useState<Record<Seat, Color>>({ p1: 'red', p2: 'blue' });
  const [ids, setIds] = useState<Record<Seat, string>>({ p1: initialRosterId ?? '', p2: '' });
  const ready = ids.p1 && ids.p2;
  const swap = () => setColors((c) => ({ p1: c.p2, p2: c.p1 }));
  return (
    <section className="space-y-3">
      <SkirmishStep n={1} title="Battleplan" done={!!deploymentId && !!victoryId}>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="mb-2 text-[12px] font-semibold uppercase text-fg-3">Формат</p><Segmented value={matchedPlay ? 'matched' : 'standard'} onChange={(v) => setMatched(v === 'matched')} options={[{ value: 'matched', label: 'Matched play · Table A' }, { value: 'standard', label: 'Стандартная · A/B + twist' }]} /></div>
        <label className={labelClass}>Deployment map<select value={deploymentId} onChange={(e) => setDeployment(e.target.value)} className={selectClass}>{(['tableA', ...(matchedPlay ? [] : ['tableB'])] as ('tableA' | 'tableB')[]).flatMap((table) => data.deployments.filter((d) => d.table === table).map((d) => <option key={d.id} value={d.id}>{table === 'tableA' ? 'A' : 'B'} · {d.name}</option>))}</select></label>
        <label className={labelClass}>Victory condition<select value={victoryId} onChange={(e) => setVictory(e.target.value)} className={selectClass}>{(['tableA', ...(matchedPlay ? [] : ['tableB'])] as ('tableA' | 'tableB')[]).flatMap((table) => data.victories[table].map((v) => <option key={v.id} value={v.id}>{table === 'tableA' ? 'A' : 'B'} · {v.name}</option>))}</select></label>
        {!matchedPlay && <label className={labelClass}>Twist<select value={twistId} onChange={(e) => setTwist(e.target.value)} className={selectClass}>{data.twists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      </SkirmishStep>
      <SkirmishStep n={2} title="Игроки и стороны" done={!!ready}>
        {SEATS.map((seat) => <div key={seat} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[12px] font-semibold uppercase text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · {colors[seat]}</p><select value={ids[seat]} onChange={(e) => setIds((ids) => ({ ...ids, [seat]: e.target.value }))} className={selectClass}><option value="">Выберите варбанду</option>{rosters.map((r) => <option key={r.id} value={r.id}>{r.name} · {index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId} · {r.fighters.length} бойц.</option>)}</select></div>)}
        <div className="grid grid-cols-2 gap-2"><Button onClick={swap}>Сменить цвета</Button><Button onClick={() => setAttacker((a) => a === 'p1' ? 'p2' : 'p1')}>Атакующий: {attacker === 'p1' ? 'P1' : 'P2'}</Button></div>
      </SkirmishStep>
      <SkirmishStep n={3} title="Начало битвы" done={false}>
        <Button variant="primary" className="h-12 w-full" disabled={!ready} onClick={() => {
          const selected: Record<Seat, { id: string; color: Color; fighters: string[]; groups: Record<string, Group> }> = { p1: null!, p2: null! };
          for (const seat of SEATS) {
            const roster = autoGroups(rosters.find((r) => r.id === ids[seat])!);
            selected[seat] = { id: roster.id, color: colors[seat], fighters: roster.fighters.map((f) => f.uid), groups: Object.fromEntries(roster.fighters.map((f) => [f.uid, f.group ?? 'dagger'])) };
          }
          onSetup({ type: 'setup', deploymentId, victoryId, twistId: matchedPlay ? null : twistId, matchedPlay, attacker, rosters: selected });
        }}>Начать битву</Button>
      </SkirmishStep>
    </section>
  );
}

function WildPanel({ state, onRoll }: { state: WcState; onRoll: (wild: Partial<Record<Seat, { singles?: number; improve?: number; save?: number }>>) => boolean }) {
  const [wild, setWild] = useState<Partial<Record<Seat, { singles?: number; improve?: number; save?: number }>>>({});
  return (
    <div className="mt-2 rounded-xl bg-black/25 p-2.5">
      <p className="mb-2 text-[12px] text-fg-3">Wild dice: добавить singles, улучшить ability dice или сохранить.</p>
      {SEATS.map((seat) => <div key={seat} className="mb-1 grid grid-cols-3 gap-1 text-[12px]"><span className="text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · доступно {1 + state.players[seat].wildSaved}</span>{(['singles', 'improve', 'save'] as const).map((key) => <select key={key} value={wild[seat]?.[key] ?? 0} onChange={(e) => setWild((w) => ({ ...w, [seat]: { ...w[seat], [key]: Number(e.target.value) } }))} className="rounded bg-app-surface px-1 py-1"><option value={0}>{key} 0</option><option value={1}>{key} 1</option><option value={2}>{key} 2</option></select>)}</div>)}
      <Button variant="primary" className="mt-2 w-full" onClick={() => onRoll(wild)}>Бросить 6D6 и применить wild</Button>
    </div>
  );
}

function Player({ state, seat, rosterName, deployment, dispatch }: { state: WcState; seat: Seat; rosterName: string; deployment?: import('../../skirmish/types').WarcryDeployment; dispatch: (body: WcEventBody) => boolean }) {
  const p = state.players[seat];
  const [fighterId, setFighter] = useState('');
  const arrived = (group: Group) => p.reserves.includes(`${p.color}:${group}`);
  return (
    <article className="rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'} · {rosterName}</p><p className="text-[12px] capitalize text-fg-3">{p.color} · активаций {p.activations.length}</p></div><b className="font-display text-xl">{p.score}</b></div>
      {state.phase === 'combat' && <div className="mt-2 flex gap-1.5"><Button className="text-xs" onClick={() => dispatch({ type: 'score', seat, points: 1 })}>+1 победное</Button><Button className="text-xs" onClick={() => dispatch({ type: 'score', seat, points: 3 })}>+3</Button></div>}
      {deployment && state.phase === 'reserve' && <div className="mt-2 flex flex-wrap gap-1">{(['dagger', 'shield', 'hammer'] as Group[]).map((group) => { const point = deployment.points.find((x) => x.side === p.color && x.group === group); return point?.reserve === state.round && !arrived(group) ? <Button key={group} className="text-xs" onClick={() => dispatch({ type: 'reserve', seat, group })}>Резерв: {GROUP_LABEL[group]}</Button> : null; })}</div>}
      {state.phase === 'combat' && <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2"><select value={fighterId} onChange={(e) => setFighter(e.target.value)} className={selectClass}><option value="">Боец</option>{p.fighters.map((id) => <option key={id} value={id}>{id}{p.reserves.includes(id) ? ' · резерв' : ''}</option>)}</select><Button onClick={() => fighterId && dispatch({ type: 'activate', seat, fighterId })}>Активировать</Button></div>}
      {state.phase === 'combat' && p.abilityRank && <Button className="mt-2 w-full" onClick={() => fighterId && dispatch({ type: 'ability', seat, fighterId, rank: p.abilityRank!, name: `Ability ${p.abilityRank}` })}>Способность · {p.abilityRank}</Button>}
    </article>
  );
}

function Result({ state }: { state: WcState }) { return <section className="my-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center"><p className="font-display text-2xl font-semibold uppercase">{state.winner === 'draw' ? 'Ничья' : `Победа: ${state.winner === 'p1' ? 'Игрок 1' : 'Игрок 2'}`}</p><p className="mt-1 text-lg">{state.players.p1.score} : {state.players.p2.score}</p></section>; }
const selectClass = 'mt-1 h-10 w-full rounded-xl border border-white/10 bg-app-surface px-2 text-[13px] text-fg outline-none';
const labelClass = 'block rounded-2xl border border-white/10 bg-app-elevated p-3 text-[12px] font-semibold uppercase tracking-wider text-fg-3';
function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) { return <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-5"><header className="mb-4 flex items-end gap-3"><IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Warcry · Battleplan</p><h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Полная игра</h1></div>{undo && <button type="button" onClick={undo} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold">Отменить</button>}</header>{children}</div>; }
function Spinner() { return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />; }
