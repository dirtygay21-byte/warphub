/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACTION_LABEL, applyWarcryEvent, createWarcryState, GROUP_LABEL, replayWarcry, WARCRY_GAME_SCHEMA, warcryUndoTarget, type Color, type Group, type Seat, type WcAction, type WcEvent, type WcEventBody, type WcRosterSetup, type WcState } from '../../warcrygame';
import { buildWarcryRosterSetup, warcryAbilityCatalog } from '../../warcrygame/fighters';
import { readWarcryLibrary, readWarcryLocal, rememberWarcryOnline, removeWarcrySaved, saveWarcryLocal, type WcSavedEntry } from '../../warcrygame/library';
import { newSeed } from '../../game/rng';
import { loadWarcryFaction } from '../../data';
import { usePersistentGameData } from '../skirmish/useSkirmishData';
import { autoGroups, decodeWarcryRoster, neededFactions, type WarcryRoster } from '../../warcry/roster';
import type { WarcryAbility, WarcryFaction, WarcryIndex } from '../../warcry/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, Segmented, HeroWorm } from '../kit';
import { cx } from '../util';
import { useSkirmishOnline } from '../skirmish/useSkirmishOnline';
import { OnlineBar, OnlineStart } from '../game/Online';
import { SkirmishRuleText } from '../skirmish/SkirmishLayout';
import { SavedGamesFrame } from '../common/SavedGamesFrame';
import { SetupStep } from '../common/SetupStep';
import { RoundDots } from '../common/RoundDots';
import { ScoreboardGrid } from '../common/ScoreboardGrid';
import { GameShell } from '../common/GameShell';
import { ChoiceField, GameLabel, type Choice } from '../common/GameControls';
import { DiceHead } from '../common/DiceMode';
import { useDiceMode } from '../common/useDiceMode';
import { WarcryDeploymentPanel } from '../skirmish/SkirmishMaps';

const SEATS: Seat[] = ['p1', 'p2'];
const ACTIONS: WcAction[] = ['move', 'attack', 'disengage', 'wait'];
const COST_LABEL = { double: 'Double', triple: 'Triple', quad: 'Quad', reaction: 'Reaction', passive: 'Passive' } as const;
const abilityRank = (cost: 'double' | 'triple' | 'quad' | 'reaction' | 'passive') => cost === 'double' ? 2 : cost === 'triple' ? 3 : cost === 'quad' ? 4 : null;

type FactionMap = ReadonlyMap<string, WarcryFaction>;
type EnsureFactions = (ids: string[]) => Promise<FactionMap>;

export function WarcryFullGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string }) {
  const { data, error: loadError } = usePersistentGameData('warcry');
  const [events, setEvents] = useState<WcEvent[]>([]);
  const [view, setView] = useState<'start' | 'saved' | 'game'>('start');
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<WcSavedEntry[]>(readWarcryLibrary);
  const [factions, setFactions] = useState<Map<string, WarcryFaction>>(new Map());
  const onlineGame = useSkirmishOnline({ events, setEvents, replay: (list) => (data ? replayWarcry(list, data) : { ok: false as const, error: 'Данные ещё загружаются' }) });
  const replay = useMemo(() => (data ? replayWarcry(events, data) : null), [events, data]);
  const state = replay?.ok ? replay.state : null;
  const catalog = useMemo(() => warcryAbilityCatalog(factions, index.universal), [factions, index.universal]);
  const rosterName = (id: string) => {
    if (!id) return 'Не выбрана';
    const roster = rosters.find((item) => item.id === id);
    if (!roster) return 'Варбанда соперника';
    return `${roster.name} · ${index.factions.find((faction) => faction.id === roster.factionId)?.name ?? roster.factionId}`;
  };
  const deployment = data?.deployments.find((item) => item.id === state?.deploymentId);
  const victory = data && state ? [...data.victories.tableA, ...data.victories.tableB].find((item) => item.id === state.victoryId) : undefined;
  const refreshLibrary = useCallback(() => setLibrary(readWarcryLibrary()), []);
  const ensureFactions = useCallback<EnsureFactions>(async (ids) => {
    const missing = [...new Set(ids)].filter((id) => !factions.has(id));
    if (!missing.length) return factions;
    const loaded = await Promise.all(missing.map(loadWarcryFaction));
    const next = new Map(factions);
    loaded.forEach((faction) => next.set(faction.id, faction));
    setFactions(next);
    return next;
  }, [factions]);

  useEffect(() => {
    if (!state) return;
    const ids = SEATS.flatMap((seat) => Object.values(state.players[seat].fighterData).map((fighter) => fighter.factionId));
    if (ids.length) void ensureFactions(ids).catch((cause) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные бойцов'));
  }, [ensureFactions, state]);

  useEffect(() => {
    if (onlineGame.online && state) rememberWarcryOnline({ gameId: onlineGame.online.id, seat: onlineGame.online.seat, code: onlineGame.online.code }, state);
  }, [onlineGame.online, state]);

  useEffect(() => {
    if (!data || events.length) return;
    try {
      const old = JSON.parse(localStorage.getItem('warphub.skirmish.game.v1.warcry') ?? 'null');
      if (!old?.players?.p1?.rosterId || !old?.players?.p2?.rosterId) return;
      const created = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
      const rostersForSetup = Object.fromEntries(SEATS.map((seat) => {
        const oldId = old.players[seat].rosterId;
        const roster = autoGroups(rosters.find((item) => item.id === oldId)!);
        if (!roster) return [seat, null];
        return [seat, { id: roster.id, color: seat === 'p1' ? 'red' : 'blue', fighters: roster.fighters.map((fighter) => fighter.uid), groups: Object.fromEntries(roster.fighters.map((fighter) => [fighter.uid, fighter.group ?? 'dagger'])) }];
      }));
      if (!rostersForSetup.p1 || !rostersForSetup.p2) return;
      const deploymentId = data.deployments.find((item) => item.name === old.deployment)?.id ?? data.deployments[0]!.id;
      const victoryId = [...data.victories.tableA, ...data.victories.tableB].find((item) => item.name === old.victory)?.id ?? data.victories.tableA[0]!.id;
      const setup = { type: 'setup', deploymentId, victoryId, matchedPlay: old.matchedPlay ?? true, attacker: 'p1', rosters: rostersForSetup, id: crypto.randomUUID(), seq: 2, at: new Date().toISOString() } as WcEvent;
      setEvents([created, setup]);
      setView('game');
      setError('Старая игра перенесена в новую подготовку; прежний ручной счёт не переносится.');
    } catch { /* повреждённое старое сохранение игнорируем */ }
  }, [data, events.length, rosters]);

  const persist = (list: WcEvent[], nextState: WcState) => {
    if (!data) return;
    if (onlineGame.online) rememberWarcryOnline({ gameId: onlineGame.online.id, seat: onlineGame.online.seat, code: onlineGame.online.code }, nextState);
    else saveWarcryLocal(list, nextState);
    refreshLibrary();
  };
  const dispatch = (body: WcEventBody) => {
    if (!data) return false;
    if (onlineGame.online && 'seat' in body && body.seat && body.seat !== onlineGame.online.seat) { setError('Это действие доступно только месту ' + onlineGame.online.seat); return false; }
    const current = body.type === 'game-created' ? null : state;
    const event = { ...body, id: crypto.randomUUID(), seq: events.length + 1, at: new Date().toISOString() } as WcEvent;
    const result = applyWarcryEvent(current, event, data);
    if (!result.ok) { setError(result.error); haptic.error(); return false; }
    const next = [...events, event];
    setEvents(next);
    setError(null);
    persist(next, result.state);
    if (onlineGame.online) onlineGame.send(event);
    return true;
  };
  const newGame = () => {
    onlineGame.leave();
    const event = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
    setEvents([event]);
    setView('game');
    setError(null);
    saveWarcryLocal([event], createWarcryState(event as Extract<WcEventBody, { type: 'game-created' }>)!);
    refreshLibrary();
  };
  const startOnline = async () => {
    const event = { type: 'game-created', schema: WARCRY_GAME_SCHEMA, seed: newSeed(), game: 'warcry', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as WcEvent;
    if (await onlineGame.start(event)) { setView('game'); setError(null); }
  };
  const joinAndOpen = async (code: string) => {
    const joined = await onlineGame.join(code);
    if (joined) { setView('game'); setError(null); }
    return joined;
  };
  const openSaved = async (entry: WcSavedEntry) => {
    setError(null);
    if (entry.kind === 'local') {
      onlineGame.leave();
      setEvents(readWarcryLocal(entry.key));
      setView('game');
      return;
    }
    if (entry.online) await joinAndOpen(entry.online.code);
  };
  const closeGame = () => { refreshLibrary(); setView('start'); };
  const errorText = loadError ?? error ?? (replay && !replay.ok ? replay.error : null);
  const onlineLike = { online: onlineGame.online, state, sync: onlineGame.sync, joinOnline: joinAndOpen, closeGame };
  if (!data) return <Shell onBack={onBack}>{loadError ? <p className="text-sm text-danger">{loadError}</p> : <Spinner />}</Shell>;

  return (
    <Shell onBack={view === 'game' ? closeGame : onBack} undo={view === 'game' && state && warcryUndoTarget(events) ? () => dispatch({ type: 'event-reverted' }) : undefined}>
      {errorText && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorText}</p>}
      {onlineGame.online && <OnlineBar game={onlineLike} system="warcry" />}
      {view === 'start' && <StartCard library={library} game={onlineLike} onNew={newGame} onOnline={startOnline} onList={() => setView('saved')} />}
      {view === 'saved' && <WarcrySavedList entries={library} onClose={closeGame} onOpen={openSaved} onRemove={(key) => { removeWarcrySaved(key); refreshLibrary(); }} />}
      {view === 'game' && !state && <Spinner />}
      {view === 'game' && state && state.stage === 'setup' && <Setup rosters={rosters} index={index} initialRosterId={initialRosterId} data={data} ensureFactions={ensureFactions} onSetup={(body) => dispatch(body)} />}
      {view === 'game' && state && state.stage !== 'setup' && deployment && victory && (
        <>
          <RoundDots round={state.round} rounds={state.endRound ?? 4} finished={state.stage === 'finished'} />
          {onlineGame.online && state.stage === 'battle' && state.round === 1 && !state.initiativeDice && <OnlinePlayerSetup rosters={rosters} index={index} seat={onlineGame.online.seat} player={state.players[onlineGame.online.seat]} ensureFactions={ensureFactions} universal={index.universal} onRoster={(roster) => dispatch({ type: 'player-set', seat: onlineGame.online!.seat, roster })} />}
          <BattleHeader state={state} deploymentName={deployment.name} victoryName={victory.name} dispatch={dispatch} onlineSeat={onlineGame.online?.seat ?? null} />
          <ScoreboardGrid className="mb-3 text-center">
            {SEATS.map((seat) => {
              const p = state.players[seat];
              const turn = state.stage === 'battle' && state.phase === 'combat' && state.turn === seat;
              return (
                <div key={seat} className={cx('rounded-2xl border py-2', turn ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="truncate px-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">
                    {p.name}
                    {turn ? ' · ходит' : ''}
                  </p>
                  <p className="font-display text-[30px] font-semibold leading-none tabular-nums">
                    <span key={p.score} className="fx-strong fx-bump">
                      {p.score}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] capitalize text-fg-3">
                    {p.color} · активаций {p.activations.length}
                  </p>
                </div>
              );
            })}
          </ScoreboardGrid>
          <div className="space-y-3">
            {SEATS.map((seat) => <Player key={seat} state={state} seat={seat} rosterName={rosterName(state.players[seat].rosterId)} deployment={deployment} canAct={!onlineGame.online || onlineGame.online.seat === seat} catalog={catalog} dispatch={dispatch} />)}
          </div>
          {state.stage === 'battle' && state.phase === 'combat' && state.passes >= 2 && <Button variant="primary" className="mt-3 w-full" onClick={() => dispatch({ type: 'end-round' })}>Завершить battle round {state.round}</Button>}
          {state.stage === 'battle' && (state.endRound ? state.round > state.endRound : state.phase === 'combat') && <Button variant="primary" className="mt-3 w-full" onClick={() => dispatch({ type: 'finish' })}>Завершить битву</Button>}
          {state.stage === 'finished' && <Result state={state} />}
          <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">Victory condition, twist и официальная карта</summary>
            <div className="mt-2">
              <SkirmishRuleText text={victory.text} />
            </div>
            {state.twistId && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <SkirmishRuleText text={data.twists.find((twist) => twist.id === state.twistId)!.text} />
              </div>
            )}
            <div className="mt-3">
              <WarcryDeploymentPanel deployment={deployment} color={state.players.p1.color} />
            </div>
          </details>
        </>
      )}
      {data && <button type="button" onClick={() => openExternal(data.source.url)} className="mt-5 w-full rounded-xl px-2 py-2 text-left text-[12px] text-fg-3">Источник правил и карт: {data.source.name} · {data.source.checked}</button>}
    </Shell>
  );
}

function StartCard({ library, game, onNew, onOnline, onList }: { library: WcSavedEntry[]; game: Parameters<typeof OnlineStart>[0]['game']; onNew: () => void; onOnline: () => Promise<void>; onList: () => void }) {
  const unfinished = library.filter((entry) => entry.summary.stage !== 'finished').length;
  return (
    <section className="space-y-3">
      <button type="button" onClick={onList} className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left active:bg-accent/15">
        <Icon name="book" className="size-5 text-accent" />
        <span className="min-w-0 flex-1"><span className="block font-display text-lg font-semibold uppercase leading-tight">Сохранённые игры ({library.length})</span><span className="block text-[12px] text-fg-3">{unfinished ? `Незаконченных: ${unfinished}` : 'Все законченные'}</span></span>
        <Icon name="chevron" className="size-4 text-fg-3" />
      </button>
      <div className="relative overflow-hidden rounded-[20px] bg-accent p-4 text-[#111110]">
        <HeroWorm />
        <p className="relative font-display text-xl font-semibold uppercase">Новая игра</p>
        <p className="relative mt-1 pr-16 text-sm leading-snug text-[#111110]/80">Battleplan, официальная расстановка, initiative и wild dice, резервы, пошаговые активации, реальные способности бойцов и victory condition.</p>
        <Button variant="ink" className="relative mt-3 w-full" onClick={onNew}><Icon name="spark" /> Начать подготовку</Button>
      </div>
      <OnlineStart game={game} onCreate={async () => { await onOnline(); }} busy={false} />
    </section>
  );
}

function WarcrySavedList({ entries, onClose, onOpen, onRemove }: { entries: WcSavedEntry[]; onClose: () => void; onOpen: (entry: WcSavedEntry) => void; onRemove: (key: string) => void }) {
  return (
    <SavedGamesFrame count={entries.length} note="Игры хранятся на этом телефоне (до 20)." onClose={onClose}>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.key} className={cx('rounded-2xl border bg-white/[0.03]', entry.summary.stage === 'finished' ? 'border-white/10' : 'border-accent/30')}>
            <button type="button" onClick={() => onOpen(entry)} className="w-full px-3 pb-2 pt-2.5 text-left active:bg-white/5">
              <span className="block text-[12px] text-fg-3">{new Date(entry.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.summary.stage === 'setup' ? 'Подготовка' : entry.summary.stage === 'finished' ? 'Битва окончена' : `Battle round ${entry.summary.round}`} · {entry.online ? `2 телефона · ${entry.online.code}` : '1 телефон'}</span>
              <span className="mt-1 flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.summary.names.p1} — {entry.summary.names.p2}</span><span className="font-display shrink-0 text-lg font-semibold tabular-nums">{entry.summary.score.p1} : {entry.summary.score.p2}</span></span>
              <span className="mt-0.5 block text-xs text-fg-2">{entry.summary.battleplan || 'Battleplan ещё не выбран'}</span>
            </button>
            <div className="flex justify-end border-t border-white/5 px-3 py-1.5"><Button variant="danger" className="text-xs" onClick={() => onRemove(entry.key)}>Удалить</Button></div>
          </li>
        ))}
      </ul>
    </SavedGamesFrame>
  );
}

const seatName = (seat: Seat) => (seat === 'p1' ? 'Игрок 1' : 'Игрок 2');
const SEAT_CHOICES: Choice<Seat>[] = [
  { value: 'p1', label: 'Игрок 1' },
  { value: 'p2', label: 'Игрок 2' },
];
const GROUP_CHOICES: Choice<Group>[] = (['dagger', 'shield', 'hammer'] as Group[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }));
type WcData = import('../../skirmish/types').WarcryGameData;
const rosterChoices = (rosters: WarcryRoster[], index: WarcryIndex): Choice<string>[] =>
  rosters.map((r) => ({ value: r.id, label: r.name, sub: `${index.factions.find((f) => f.id === r.factionId)?.name ?? r.factionId} · ${r.fighters.length} бойц.` }));

function Setup({ rosters, index, initialRosterId, data, ensureFactions, onSetup }: { rosters: WarcryRoster[]; index: WarcryIndex; initialRosterId?: string; data: WcData; ensureFactions: EnsureFactions; onSetup: (body: WcEventBody) => boolean }) {
  const [deploymentId, setDeployment] = useState(data.deployments.find((item) => item.table === 'tableA')!.id);
  const [victoryId, setVictory] = useState(data.victories.tableA[0]!.id);
  const [twistId, setTwist] = useState(data.twists[0]!.id);
  const [matchedPlay, setMatched] = useState(true);
  const [attacker, setAttacker] = useState<Seat>('p1');
  const [colors, setColors] = useState<Record<Seat, Color>>({ p1: 'red', p2: 'blue' });
  const [selected, setSelected] = useState<Record<Seat, WarcryRoster | null>>(() => {
    const initial = initialRosterId ? rosters.find((item) => item.id === initialRosterId) : null;
    return { p1: initial ? autoGroups(initial) : null, p2: null };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!selected.p1 && !!selected.p2;
  const deployment = data.deployments.find((item) => item.id === deploymentId)!;
  const tables = matchedPlay ? ['tableA'] : ['tableA', 'tableB'];
  const chooseFormat = (matched: boolean) => {
    setMatched(matched);
    setDeployment(data.deployments.find((item) => item.table === 'tableA')!.id);
    setVictory(data.victories.tableA[0]!.id);
  };
  const start = async () => {
    if (!selected.p1 || !selected.p2) return;
    setBusy(true);
    setError(null);
    try {
      const setupRosters = {} as Record<Seat, WcRosterSetup>;
      for (const seat of SEATS) {
        const roster = selected[seat]!;
        const factionData = await ensureFactions(neededFactions(roster));
        setupRosters[seat] = buildWarcryRosterSetup(roster, colors[seat], factionData, index.universal);
      }
      onSetup({ type: 'setup', deploymentId, victoryId, twistId: matchedPlay ? null : twistId, matchedPlay, attacker, rosters: setupRosters });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить варбанды');
    } finally {
      setBusy(false);
    }
  };
  const tableTag = (table: string) => (table === 'tableA' ? 'Table A' : 'Table B');
  return (
    <section className="space-y-3">
      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <SetupStep n={1} title="Battleplan и официальная карта" done={!!deploymentId && !!victoryId}>
        <ChoiceField
          label="Формат"
          value={matchedPlay ? 'matched' : 'standard'}
          onChange={(value) => chooseFormat(value === 'matched')}
          options={[
            { value: 'matched', label: 'Matched play', sub: 'Table A' },
            { value: 'standard', label: 'Стандартная', sub: 'A/B + twist' },
          ]}
        />
        <ChoiceField
          label="Deployment map"
          value={deploymentId}
          onChange={setDeployment}
          inlineMax={0}
          options={tables.flatMap((table) => data.deployments.filter((item) => item.table === table).map((item) => ({ value: item.id, label: item.name, sub: tableTag(table) })))}
        />
        <ChoiceField
          label="Victory condition"
          value={victoryId}
          onChange={setVictory}
          inlineMax={0}
          options={tables.flatMap((table) => data.victories[table as 'tableA' | 'tableB'].map((item) => ({ value: item.id, label: item.name, sub: tableTag(table) })))}
        />
        {!matchedPlay && <ChoiceField label="Twist" value={twistId} onChange={setTwist} inlineMax={0} options={data.twists.map((twist) => ({ value: twist.id, label: twist.name }))} />}
        <WarcryDeploymentPanel deployment={deployment} color={colors.p1} />
      </SetupStep>
      <SetupStep n={2} title="Игроки, варбанды и стороны" done={ready}>
        {SEATS.map((seat) => (
          <RosterChoice key={seat} seat={seat} rosters={rosters} index={index} selected={selected[seat]?.id ?? ''} color={colors[seat]} onSelect={(roster) => setSelected((current) => ({ ...current, [seat]: roster ? autoGroups(roster) : null }))} />
        ))}
        <ChoiceField label="Атакующий" value={attacker} onChange={setAttacker} options={SEAT_CHOICES} />
        <Button className="w-full" onClick={() => setColors((current) => ({ p1: current.p2, p2: current.p1 }))}>
          Сменить цвета: {colors.p1} ⇄ {colors.p2}
        </Button>
      </SetupStep>
      <SetupStep n={3} title="Dagger, Shield и Hammer" done={ready}>
        {SEATS.map((seat) => selected[seat] && <GroupEditor key={seat} seat={seat} roster={selected[seat]!} onChange={(roster) => setSelected((current) => ({ ...current, [seat]: roster }))} />)}
        <Button variant="primary" className="h-12 w-full" disabled={!ready || busy} onClick={() => void start()}>
          {busy ? 'Загрузка данных…' : 'Начать битву'}
        </Button>
      </SetupStep>
    </section>
  );
}

function RosterChoice({ seat, rosters, index, selected, color, onSelect }: { seat: Seat; rosters: WarcryRoster[]; index: WarcryIndex; selected: string; color: Color; onSelect: (roster: WarcryRoster | null) => void }) {
  const [mode, setMode] = useState<'own' | 'code'>('own');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addCode = () => {
    try {
      onSelect(decodeWarcryRoster(code.trim(), index.factions.map((faction) => faction.id)));
      setCode('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Код не распознан');
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <GameLabel>
        {seatName(seat)} · <span className="capitalize">{color}</span>
      </GameLabel>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'own', label: 'Моя варбанда' }, { value: 'code', label: 'По коду' }]} />
      {mode === 'own' ? (
        <ChoiceField placeholder="Выберите варбанду" value={selected} onChange={(id) => onSelect(rosters.find((roster) => roster.id === id) ?? null)} options={rosterChoices(rosters, index)} inlineMax={0} />
      ) : (
        <>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} rows={2} placeholder="WC1.…" className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs outline-none focus:border-accent" />
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <Button className="w-full" disabled={!code.trim()} onClick={addCode}>
            Добавить по коду
          </Button>
        </>
      )}
    </div>
  );
}

/** Группы бойцов перед битвой: строка бойца и три кнопки Dagger / Shield / Hammer (как в редакторе). */
function GroupEditor({ seat, roster, onChange }: { seat: Seat; roster: WarcryRoster; onChange: (roster: WarcryRoster) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <GameLabel>{seatName(seat)} · группы</GameLabel>
      {roster.fighters.map((fighter) => (
        <div key={fighter.uid} className="space-y-1">
          <p className="truncate text-[13px] font-semibold text-white/85">
            <FighterLabel fighter={fighter} />
          </p>
          <ChoiceField
            value={fighter.group ?? 'dagger'}
            onChange={(group) => onChange({ ...roster, fighters: roster.fighters.map((item) => (item.uid === fighter.uid ? { ...item, group } : item)) })}
            options={GROUP_CHOICES}
          />
        </div>
      ))}
    </div>
  );
}

function FighterLabel({ fighter }: { fighter: WarcryRoster['fighters'][number] }) {
  const [name, setName] = useState(fighter.name || fighter.fighterId);
  useEffect(() => {
    let active = true;
    void loadWarcryFaction(fighter.factionId).then((faction) => {
      if (active) setName(fighter.name || faction.fighters.find((item) => item.id === fighter.fighterId)?.name || fighter.fighterId);
    });
    return () => {
      active = false;
    };
  }, [fighter.factionId, fighter.fighterId, fighter.name]);
  return name;
}

function OnlinePlayerSetup({ rosters, index, seat, player, ensureFactions, universal, onRoster }: { rosters: WarcryRoster[]; index: WarcryIndex; seat: Seat; player: WcState['players'][Seat]; ensureFactions: EnsureFactions; universal: WarcryAbility[]; onRoster: (roster: WcRosterSetup) => boolean }) {
  const [selected, setSelected] = useState<WarcryRoster | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const factionData = await ensureFactions(neededFactions(selected));
      if (onRoster(buildWarcryRosterSetup(selected, player.color, factionData, universal))) setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить варбанду');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-accent/30 bg-accent/10 p-3">
      <p className="text-sm font-semibold">{player.name} · ваша варбанда и группы</p>
      <ChoiceField
        placeholder="Выберите варбанду"
        value={selected?.id ?? ''}
        onChange={(id) => {
          setSelected(autoGroups(rosters.find((roster) => roster.id === id)!));
          setSaved(false);
        }}
        options={rosterChoices(rosters, index)}
        inlineMax={0}
      />
      {selected && (
        <GroupEditor
          seat={seat}
          roster={selected}
          onChange={(roster) => {
            setSelected(roster);
            setSaved(false);
          }}
        />
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <Button variant="primary" className="w-full" disabled={!selected || busy} onClick={() => void save()}>
        {busy ? 'Загрузка…' : saved ? 'Варбанда сохранена ✓' : 'Сохранить варбанду'}
      </Button>
    </div>
  );
}

function BattleHeader({ state, deploymentName, victoryName, dispatch, onlineSeat }: { state: WcState; deploymentName: string; victoryName: string; dispatch: (body: WcEventBody) => boolean; onlineSeat: Seat | null }) {
  const [first, setFirst] = useState<Seat>(state.initiative);
  useEffect(() => setFirst(state.initiative), [state.initiative, state.round]);
  const wildSeat = state.wildDeclared.p1 || state.wildDeclared.p2 ? (state.wildDeclared.p1 && state.wildDeclared.p2 ? null : state.initiative === 'p1' ? 'p2' : 'p1') : state.initiative;
  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">
        {state.stage === 'finished' ? 'Битва окончена' : `Battle round ${state.round}${state.endRound ? ` / ${state.endRound}` : ''} · ${state.phase === 'initiative' ? 'Initiative' : state.phase === 'reserve' ? 'Reserve' : 'Combat'}`}
      </p>
      <p className="mt-1 text-sm text-fg-2">
        {deploymentName} · {victoryName}
      </p>
      <p className="mt-1 text-[12px] text-fg-3">
        Атакующий: {seatName(state.attacker)} · Инициатива: {seatName(state.initiative)}
      </p>
      {state.stage === 'battle' && !state.initiativeDice && <InitiativeRoll dispatch={dispatch} />}
      {state.abilityDiceManual && state.stage === 'battle' && <p className="mt-1 text-[12px] text-fg-3">Инициатива записана итогом — ability dice отслеживаете сами.</p>}
      {state.initiativeDice && (
        <div className="mt-2 space-y-1">
          {SEATS.map((seat) => (
            <div key={seat} className="rounded-xl bg-black/25 px-3 py-2 text-[12px] text-fg-3">
              <p className="font-semibold text-fg-2">
                {seatName(seat)}: <span className="tabular-nums">{state.initiativeDice![seat].join(' · ')}</span>
              </p>
              <p>
                singles {state.players[seat].singles} · ability {state.players[seat].abilityRank ?? '—'} · wild saved {state.players[seat].wildSaved}
              </p>
            </div>
          ))}
        </div>
      )}
      {state.phase === 'initiative' && state.initiativeDice && wildSeat && (!onlineSeat || onlineSeat === wildSeat) && <WildPanel key={`${state.round}-${wildSeat}`} state={state} seat={wildSeat} onDeclare={(body) => dispatch(body)} />}
      {state.stage === 'battle' && state.phase === 'initiative' && state.initiativeDice && onlineSeat && wildSeat && onlineSeat !== wildSeat && <p className="mt-2 text-[12px] text-fg-3">Соперник объявляет wild dice.</p>}
      {state.phase === 'reserve' && state.initiativeDice && (
        <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
          <p className="text-[12px] text-fg-3">Инициативный игрок выбирает, кто активируется первым.</p>
          <ChoiceField label="Первым активируется" value={first} onChange={setFirst} options={SEAT_CHOICES} />
          <Button variant="primary" className="w-full" onClick={() => dispatch({ type: 'phase-advanced', first })}>
            Перейти к Combat phase
          </Button>
        </div>
      )}
      {state.phase === 'combat' && (
        <p className="mt-2 text-[12px] text-fg-3">
          Очередь: {state.turn === 'p1' || state.turn === 'p2' ? seatName(state.turn) : 'по свободному журналу'} · пасы {state.passes} / 2
        </p>
      )}
    </div>
  );
}

/**
 * Бросок инициативы 6D6: в приложении или вручную (07.11.2026). Вручную — ввести по 6 значений каждого игрока (дальше всё
 * как при броске: singles, ability dice, wild dice) или записать только итог (ability dice не отслеживаются).
 */
function InitiativeRoll({ dispatch }: { dispatch: (body: WcEventBody) => boolean }) {
  const dice = useDiceMode((s) => s.mode);
  const [kind, setKind] = useState<'dice' | 'winner'>('dice');
  const [text, setText] = useState<Record<Seat, string>>({ p1: '', p2: '' });
  const [winner, setWinner] = useState<Seat | ''>('');
  const parse = (v: string) => v.replace(/[^1-6]/g, '').split('').map(Number);
  const values = { p1: parse(text.p1), p2: parse(text.p2) };
  const singles = (list: number[]) => list.filter((v) => list.filter((x) => x === v).length === 1).length;
  const tie = values.p1.length === 6 && values.p2.length === 6 && singles(values.p1) === singles(values.p2);
  const okDice = values.p1.length === 6 && values.p2.length === 6 && (!tie || !!winner);
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
      <DiceHead title="Инициатива · 6D6" hint="результат" />
      {dice === 'app' ? (
        <Button variant="primary" className="w-full" onClick={() => dispatch({ type: 'initiative-roll' })}>
          <Icon name="spark" /> Бросить 6D6 на инициативу
        </Button>
      ) : (
        <>
          <ChoiceField
            value={kind}
            onChange={setKind}
            options={[
              { value: 'dice', label: 'Ввести кубики', sub: 'ability и wild dice считаются' },
              { value: 'winner', label: 'Только итог', sub: 'кто получил инициативу' },
            ]}
          />
          {kind === 'dice' ? (
            <>
              {SEATS.map((seat) => (
                <label key={seat} className="block">
                  <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-fg-3">
                    {seatName(seat)}: 6 кубиков · {values[seat].length}/6
                  </span>
                  <input
                    inputMode="numeric"
                    value={values[seat].join(' ')}
                    onChange={(e) => setText((t) => ({ ...t, [seat]: e.target.value.slice(0, 20) }))}
                    placeholder="например 3 3 5 1 6 2"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 font-mono text-[15px] tracking-widest outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-fg-3 focus:border-accent"
                  />
                </label>
              ))}
              {tie && <ChoiceField label="Singles поровну — roll-off выиграл" value={winner} onChange={setWinner} options={SEAT_CHOICES} />}
              <Button variant="primary" className="w-full" disabled={!okDice} onClick={() => dispatch({ type: 'initiative-roll', manual: { dice: { p1: values.p1.slice(0, 6), p2: values.p2.slice(0, 6) }, ...(tie && winner ? { winner } : {}) } })}>
                Записать кубики
              </Button>
            </>
          ) : (
            <>
              <ChoiceField label="Инициативу получил" value={winner} onChange={setWinner} options={SEAT_CHOICES} />
              <Button variant="primary" className="w-full" disabled={!winner} onClick={() => winner && dispatch({ type: 'initiative-roll', manual: { winner } })}>
                Записать итог
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function WildPanel({ state, seat, onDeclare }: { state: WcState; seat: Seat; onDeclare: (body: WcEventBody) => boolean }) {
  const total = 1 + state.players[seat].wildSaved;
  const [singles, setSingles] = useState(0);
  const [improve, setImprove] = useState<{ from: 1 | 2 | 3; value: number }[]>([]);
  const save = total - singles - improve.length;
  const p = state.players[seat];
  const targets = useMemo(() => {
    const out: { from: 1 | 2 | 3; value: number; label: string }[] = [];
    for (const value of new Set(state.initiativeDice![seat])) {
      const count = state.initiativeDice![seat].filter((item) => item === value).length;
      if (count === 1) out.push({ from: 1, value, label: `Single ${value} → Double` });
      if (count === 2) out.push({ from: 2, value, label: `Double ${value} → Triple` });
      if (count === 3) out.push({ from: 3, value, label: `Triple ${value} → Quad` });
    }
    return out;
  }, [state.initiativeDice, seat]);
  const toggle = (from: 1 | 2 | 3, value: number) => {
    const next = improve.some((item) => item.from === from && item.value === value) ? improve.filter((item) => !(item.from === from && item.value === value)) : [...improve, { from, value }];
    setImprove(next);
    setSingles(Math.min(singles, total - next.length));
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
      <GameLabel>{seatName(seat)} · wild dice</GameLabel>
      <p className="text-[12px] leading-snug text-fg-3">Доступно {total}. Добавьте singles, улучшите разные ability dice или сохраните остаток.</p>
      {targets.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {targets.map((target) => {
            const on = improve.some((item) => item.from === target.from && item.value === target.value);
            return (
              <button
                type="button"
                key={`${target.from}:${target.value}`}
                aria-pressed={on}
                onClick={() => toggle(target.from, target.value)}
                className={cx('min-h-11 rounded-xl border px-2 py-1.5 text-[12.5px] font-semibold transition', on ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-2 active:bg-white/5')}
              >
                {target.label}
              </button>
            );
          })}
        </div>
      )}
      <ChoiceField
        label={`Добавить singles · сохранить ${save}`}
        value={Math.min(singles, save + singles)}
        onChange={setSingles}
        inlineMax={5}
        options={Array.from({ length: total - improve.length + 1 }, (_, value) => ({ value, label: String(value) }))}
      />
      <Button variant="primary" className="w-full" onClick={() => onDeclare({ type: 'wild-set', seat, singles, save, improve })}>
        Подтвердить wild dice
      </Button>
      {p.abilityRank && <p className="text-[12px] text-fg-3">Текущий максимум ability dice: {p.abilityRank}</p>}
    </div>
  );
}

function Player({ state, seat, rosterName, deployment, canAct, catalog, dispatch }: { state: WcState; seat: Seat; rosterName: string; deployment: import('../../skirmish/types').WarcryDeployment; canAct: boolean; catalog: Map<string, WarcryAbility>; dispatch: (body: WcEventBody) => boolean }) {
  const p = state.players[seat];
  const arrived = (group: Group) => p.reserves.includes(`${p.color}:${group}`);
  const currentTurn = state.turn === seat && state.passes < 2;
  const mustActivate = p.fighters.some((fighterId) => !p.activations.includes(fighterId) && !p.reserves.includes(fighterId));
  const reserveGroups = deployment && state.phase === 'reserve' && canAct ? (['dagger', 'shield', 'hammer'] as Group[]).filter((group) => deployment.points.find((item) => item.side === p.color && item.group === group)?.reserve === state.round && !arrived(group)) : [];
  return (
    <article className={cx('rounded-2xl border bg-white/[0.03] p-3', currentTurn && state.phase === 'combat' ? 'border-accent/40' : 'border-white/10')}>
      <p className="truncate text-[13px] font-semibold text-white/90">
        {seatName(seat)} · {rosterName}
      </p>
      <p className="text-[12px] capitalize text-fg-3">
        {p.color} · активаций {p.activations.length}
      </p>
      {state.stage === 'battle' && state.phase === 'combat' && canAct && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button className="text-xs" onClick={() => dispatch({ type: 'score', seat, points: 1, note: 'victory condition' })}>
            +1 VP
          </Button>
          <Button className="text-xs" onClick={() => dispatch({ type: 'score', seat, points: 3, note: 'victory condition' })}>
            +3 VP
          </Button>
        </div>
      )}
      {reserveGroups.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {reserveGroups.map((group) => (
            <Button key={group} className="text-xs" onClick={() => dispatch({ type: 'reserve', seat, group })}>
              Резерв: {GROUP_LABEL[group]}
            </Button>
          ))}
        </div>
      )}
      {state.phase === 'combat' && canAct && currentTurn && <ActivationPanel state={state} seat={seat} catalog={catalog} dispatch={dispatch} />}
      {state.phase === 'combat' && canAct && currentTurn && (
        <Button className="mt-2 w-full" disabled={mustActivate} onClick={() => dispatch({ type: 'pass', seat })}>
          {mustActivate ? 'Сначала активируйте бойца' : 'Пас'}
        </Button>
      )}
      {state.phase === 'combat' && canAct && currentTurn && state.lastActivation && state.lastActivation !== seat && <ReactionPanel state={state} seat={seat} catalog={catalog} dispatch={dispatch} />}
      {!canAct && state.phase === 'combat' && <p className="mt-2 text-[12px] text-fg-3">Действия выполняются на телефоне владельца варбанды.</p>}
      {p.activations.length > 0 && (
        <div className="mt-2 space-y-1">
          {p.activations.map((fighterId) => {
            const log = p.activationLog[fighterId];
            const ability = log?.abilityId ? catalog.get(log.abilityId) : null;
            return (
              <p key={fighterId} className="text-[12px] text-fg-3">
                ✓ {p.fighterData[fighterId]?.name ?? fighterId}
                {log ? ` · ${log.actions.map((action) => ACTION_LABEL[action]).join(' + ')}` : ''}
                {ability ? ` · ${ability.name}` : ''}
              </p>
            );
          })}
        </div>
      )}
    </article>
  );
}

function ActivationPanel({ state, seat, catalog, dispatch }: { state: WcState; seat: Seat; catalog: Map<string, WarcryAbility>; dispatch: (body: WcEventBody) => boolean }) {
  const p = state.players[seat];
  const [fighterId, setFighter] = useState('');
  const [actions, setActions] = useState<[WcAction, WcAction]>(['move', 'attack']);
  const [abilityId, setAbility] = useState('');
  const [diceIndex, setDice] = useState<number | null>(null);
  const [after, setAfter] = useState<0 | 1 | 2>(0);
  const available = p.fighters.filter((id) => !p.activations.includes(id) && !p.reserves.includes(id));
  const info = p.fighterData[fighterId];
  const abilities = info?.abilities.filter((ability) => abilityRank(ability.cost) !== null) ?? [];
  const selectedAbility = abilities.find((ability) => ability.id === abilityId);
  const required = selectedAbility ? abilityRank(selectedAbility.cost)! : null;
  // инициатива записана итогом: кубик для способности не выбирается
  const manualDice = !!state.abilityDiceManual;
  const dice = required ? p.dice.map((die, index) => ({ die, index })).filter(({ die }) => !die.used && die.rank >= required) : [];
  const activate = () => {
    if (!fighterId) return;
    if (dispatch({ type: 'activate', seat, fighterId, actions, abilityId: abilityId || undefined, diceIndex: abilityId && !manualDice ? (diceIndex ?? undefined) : undefined, abilityAfter: abilityId ? after : undefined })) {
      setFighter('');
      setAbility('');
      setDice(null);
      setAfter(0);
      setActions(['move', 'attack']);
    }
  };
  const actionChoices = ACTIONS.map((action) => ({ value: action, label: ACTION_LABEL[action] }));
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
      <GameLabel>Активация</GameLabel>
      <ChoiceField
        label="Боец"
        placeholder="Выберите бойца"
        value={fighterId}
        onChange={(id) => {
          setFighter(id);
          setAbility('');
          setDice(null);
        }}
        inlineMax={0}
        options={available.map((id) => ({ value: id, label: p.fighterData[id]?.name ?? id }))}
      />
      <ChoiceField label="Действие 1" value={actions[0]} onChange={(a) => setActions((current) => [a, current[1]])} inlineMax={4} options={actionChoices} />
      <ChoiceField label="Действие 2" value={actions[1]} onChange={(a) => setActions((current) => [current[0], a])} inlineMax={4} options={actionChoices} />
      {fighterId && abilities.length > 0 && (
        <ChoiceField
          label="Способность"
          value={abilityId || 'none'}
          onChange={(id) => {
            setAbility(id === 'none' ? '' : id);
            setDice(null);
          }}
          inlineMax={0}
          options={[{ value: 'none', label: 'Без способности' }, ...abilities.map((ability) => ({ value: ability.id, label: catalog.get(ability.id)?.name ?? ability.id, sub: COST_LABEL[ability.cost] }))]}
        />
      )}
      {abilityId && (
        <>
          {!manualDice && (
          <ChoiceField
            label="Ability dice"
            placeholder="Выберите кубик"
            value={diceIndex ?? ''}
            onChange={setDice}
            inlineMax={4}
            options={dice.map(({ die, index }) => ({ value: index, label: `${COST_LABEL[({ 2: 'double', 3: 'triple', 4: 'quad' } as const)[die.rank as 2 | 3 | 4]]} ${die.value}` }))}
          />
          )}
          <ChoiceField
            label="Когда"
            value={after}
            onChange={setAfter}
            options={[
              { value: 0 as const, label: 'Перед' },
              { value: 1 as const, label: 'После 1-го' },
              { value: 2 as const, label: 'После 2-го' },
            ]}
          />
        </>
      )}
      {selectedAbility && catalog.get(selectedAbility.id)?.text && <p className="max-h-28 overflow-y-auto whitespace-pre-line text-[12px] leading-relaxed text-fg-3">{catalog.get(selectedAbility.id)!.text}</p>}
      <Button variant="primary" className="w-full" disabled={!fighterId || (!!abilityId && !manualDice && diceIndex === null)} onClick={activate}>
        Активировать
      </Button>
    </div>
  );
}

function ReactionPanel({ state, seat, catalog, dispatch }: { state: WcState; seat: Seat; catalog: Map<string, WarcryAbility>; dispatch: (body: WcEventBody) => boolean }) {
  const p = state.players[seat];
  const [fighterId, setFighter] = useState('');
  const [abilityId, setAbility] = useState('');
  const fighters = p.fighters.filter((id) => !p.reserves.includes(id) && p.fighterData[id]?.abilities.some((ability) => ability.cost === 'reaction') && !p.reactions.includes(`${state.activationSerial}:${id}`));
  const abilities = p.fighterData[fighterId]?.abilities.filter((ability) => ability.cost === 'reaction') ?? [];
  const react = () => {
    if (dispatch({ type: 'reaction', seat, fighterId, abilityId })) {
      setFighter('');
      setAbility('');
    }
  };
  if (!fighters.length) return null;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-white/10 p-3">
      <GameLabel>Реакция на активацию соперника</GameLabel>
      <ChoiceField
        label="Боец"
        placeholder="Выберите бойца"
        value={fighterId}
        onChange={(id) => {
          setFighter(id);
          setAbility('');
        }}
        inlineMax={0}
        options={fighters.map((id) => ({ value: id, label: p.fighterData[id]?.name ?? id }))}
      />
      {fighterId && <ChoiceField label="Реакция" placeholder="Выберите реакцию" value={abilityId} onChange={setAbility} inlineMax={0} options={abilities.map((ability) => ({ value: ability.id, label: catalog.get(ability.id)?.name ?? ability.id }))} />}
      <Button className="w-full" disabled={!fighterId || !abilityId} onClick={react}>
        Использовать реакцию
      </Button>
    </div>
  );
}

function Result({ state }: { state: WcState }) {
  return (
    <section className="my-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
      <p className="font-display text-2xl font-semibold uppercase">{state.winner === 'draw' ? 'Ничья' : `Победа: ${seatName(state.winner as Seat)}`}</p>
      <p className="mt-1 text-lg">
        {state.players.p1.score} : {state.players.p2.score}
      </p>
    </section>
  );
}

function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) {
  return (
    <GameShell onBack={onBack} undo={undo} kicker="Warcry · Battleplan" title="Полная игра" className="pb-24">
      {children}
    </GameShell>
  );
}

function Spinner() {
  return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
}
