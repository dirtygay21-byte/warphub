/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyKtEvent, createKtState, KT_GAME_SCHEMA, ktUndoTarget, replayKt, totalKtVp, type KtEvent, type KtEventBody, type KtState, type KtPloyType, type Op, type Seat } from '../../ktgame';
import { newSeed } from '../../game/rng';
import { usePersistentGameData } from '../skirmish/useSkirmishData';
import type { KtRoster } from '../../kt/roster';
import { decodeKtRoster } from '../../kt/roster';
import { loadKtTeam } from '../../data';
import type { KtIndex, KtTeam } from '../../kt/types';
import { haptic, openExternal, pushOverlay } from '../../telegram';
import { KtEditor } from './KtEditor';
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
import { ChoiceField, GameCounter, GameLabel, ToggleChip, type Choice } from '../common/GameControls';
import { DiceHead } from '../common/DiceMode';
import { useDiceMode } from '../common/useDiceMode';
import { readKtLibrary, readKtLocal, rememberKtOnline, removeKtSaved, saveKtLocal, type KtSavedEntry } from '../../ktgame/library';
import { injectKtSecret, readKtSecret, redactKtSetup, writeKtSecret } from '../../ktgame/secrets';
import { KtMapPanel } from '../skirmish/SkirmishMaps';

const SEATS: Seat[] = ['p1', 'p2'];

export function KtFullGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: KtRoster[]; index: KtIndex; initialRosterId?: string }) {
  const { data, error: loadError } = usePersistentGameData('kt');
  const [events, setEvents] = useState<KtEvent[]>([]);
  const [view, setView] = useState<'start' | 'saved' | 'game' | 'field'>('start');
  // режим мастера (как в 40K, тот же ключ на телефоне): ростеры игроков открываются для просмотра
  const [master, setMaster] = useState(readMaster);
  const toggleMaster = () => {
    writeMaster(!master);
    setMaster(!master);
  };
  const [shownRoster, setShownRoster] = useState<string | null>(null);
  useEffect(() => (shownRoster ? pushOverlay(() => setShownRoster(null)) : undefined), [shownRoster]);
  const rosterCtx = useMemo<RosterCtx | null>(() => (master ? { open: setShownRoster, has: (id) => rosters.some((r) => r.id === id) } : null), [master, rosters]);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<KtSavedEntry[]>(readKtLibrary);
  const onlineGame = useSkirmishOnline({ events, setEvents, replay: (list) => (data ? replayKt(list, data) : { ok: false as const, error: 'Данные ещё загружаются' }) });
  const replay = useMemo(() => (data ? replayKt(events, data) : null), [events, data]);
  const state = replay?.ok && replay.state && onlineGame.online ? injectKtSecret(replay.state, onlineGame.online.code, onlineGame.online.seat) : replay?.ok ? replay.state : null;
  const teamName = (id: string) => index.teams.find((t) => t.id === id)?.name ?? id;
  const rosterName = (id: string) => {
    if (!id) return 'Не выбран';
    const roster = rosters.find((item) => item.id === id);
    return roster ? `${roster.name} · ${teamName(roster.teamId)}` : 'Ростер соперника';
  };
  const refreshLibrary = useCallback(() => setLibrary(readKtLibrary()), []);
  useEffect(() => {
    if (onlineGame.online && state) rememberKtOnline({ gameId: onlineGame.online.id, seat: onlineGame.online.seat, code: onlineGame.online.code }, state);
  }, [onlineGame.online, state]);

  useEffect(() => {
    if (!data || events.length) return;
    try {
      const old = JSON.parse(localStorage.getItem('warphub.skirmish.game.v1.kt') ?? 'null');
      if (!old?.players?.p1?.rosterId || !old?.players?.p2?.rosterId) return;
      const created = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
      const setup = { type: 'setup', missionId: old.mission, killzone: old.killzone, map: old.map ?? 1, dropZoneLoser: 'p2', rosters: { p1: { id: old.players.p1.rosterId, operatives: rosters.find((r) => r.id === old.players.p1.rosterId)?.operatives.length ?? 0, tacOp: data.tacOps[0]!.id }, p2: { id: old.players.p2.rosterId, operatives: rosters.find((r) => r.id === old.players.p2.rosterId)?.operatives.length ?? 0, tacOp: data.tacOps[0]!.id } }, id: crypto.randomUUID(), seq: 2, at: new Date().toISOString() } as KtEvent;
      setEvents([created, setup]);
      setView('game');
      setError('Старая игра перенесена в новую подготовку; прежний ручной счёт не переносится.');
    } catch { /* повреждённое старое сохранение игнорируем */ }
  }, [data, events.length, rosters]);

  const persist = (list: KtEvent[], nextState: KtState) => {
    if (!data) return;
    if (onlineGame.online) rememberKtOnline({ gameId: onlineGame.online.id, seat: onlineGame.online.seat, code: onlineGame.online.code }, nextState);
    else saveKtLocal(list, nextState);
    refreshLibrary();
  };
  const dispatch = (body: KtEventBody) => {
    if (!data) return false;
    if (onlineGame.online && body.type !== 'secret-revealed' && 'seat' in body && body.seat && body.seat !== onlineGame.online.seat) { setError('Это действие доступно только месту ' + onlineGame.online.seat); return false; }
    const current = body.type === 'game-created' ? null : state;
    const event = { ...body, id: crypto.randomUUID(), seq: events.length + 1, at: new Date().toISOString() } as KtEvent;
    const result = applyKtEvent(current, event, data);
    if (!result.ok) { setError(result.error); haptic.error(); return false; }
    const next = [...events, event];
    setEvents(next);
    setError(null);
    persist(next, result.state);
    if (body.type === 'setup') {
      for (const seat of SEATS) writeKtSecret('local', seat, { tacOp: body.rosters[seat].tacOp, primaryOp: readKtSecret('local', seat)?.primaryOp ?? null });
    } else if (body.type === 'primary-op') {
      writeKtSecret('local', body.seat, { tacOp: result.state.players[body.seat].tacOp, primaryOp: body.op });
    }
    if (onlineGame.online) {
      const seat = onlineGame.online.seat;
      const code = onlineGame.online.code;
      if (body.type === 'tac-set') {
        writeKtSecret(code, seat, { tacOp: body.tacOp, primaryOp: readKtSecret(code, seat)?.primaryOp ?? null });
        onlineGame.send({ ...event, tacOp: data.tacOps[0]!.id } as KtEvent);
      } else if (body.type === 'setup') {
        const selected = body.rosters[seat];
        writeKtSecret(code, seat, { tacOp: selected.tacOp, primaryOp: readKtSecret(code, seat)?.primaryOp ?? null });
        onlineGame.send({ ...event, ...redactKtSetup(body, data.tacOps[0]!.id) } as KtEvent);
      } else if (body.type === 'primary-op') {
        writeKtSecret(code, seat, { tacOp: state?.players[seat].tacOp ?? body.seat, primaryOp: body.op });
        onlineGame.send({ ...event, type: 'primary-op', seat: body.seat, op: 'crit' as Op });
      } else onlineGame.send(event);
    }
    return true;
  };
  const newGame = () => {
    onlineGame.leave();
    const event = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
    setEvents([event]);
    setView('game');
    setError(null);
    saveKtLocal([event], createKtState(event as Extract<KtEventBody, { type: 'game-created' }>)!);
    refreshLibrary();
  };
  const startOnline = async () => {
    const event = { type: 'game-created', schema: KT_GAME_SCHEMA, seed: newSeed(), game: 'kt', names: { p1: 'Игрок 1', p2: 'Игрок 2' }, id: crypto.randomUUID(), seq: 1, at: new Date().toISOString() } as KtEvent;
    if (await onlineGame.start(event)) {
      setView('game');
      setError(null);
    }
  };
  const joinAndOpen = async (code: string) => {
    const joined = await onlineGame.join(code);
    if (joined) {
      setView('game');
      setError(null);
    }
    return joined;
  };
  const openSaved = async (entry: KtSavedEntry) => {
    setError(null);
    if (entry.kind === 'local') {
      onlineGame.leave();
      setEvents(readKtLocal(entry.key));
      setView('game');
      return;
    }
    if (entry.online) await joinAndOpen(entry.online.code);
  };
  const closeGame = () => {
    refreshLibrary();
    setView('start');
  };
  const finishLocalBattle = () => {
    if (!state || !data || onlineGame.online) return;
    const bodies: KtEventBody[] = SEATS.map((seat) => {
      const secret = readKtSecret('local', seat);
      return { type: 'secret-revealed', seat, tacOp: secret?.tacOp ?? state.players[seat].tacOp, op: secret?.primaryOp ?? state.players[seat].primaryOp ?? 'crit' };
    });
    bodies.push({ type: 'finish' });
    let current = state;
    const next = [...events];
    for (const body of bodies) {
      const event = { ...body, id: crypto.randomUUID(), seq: next.length + 1, at: new Date().toISOString() } as KtEvent;
      const result = applyKtEvent(current, event, data);
      if (!result.ok) { setError(result.error); haptic.error(); return; }
      next.push(event);
      current = result.state;
    }
    setEvents(next);
    setError(null);
    persist(next, current);
  };
  const revealOnlineSecret = () => {
    if (!state || !onlineGame.online) return;
    const { code, seat } = onlineGame.online;
    const secret = readKtSecret(code, seat);
    dispatch({ type: 'secret-revealed', seat, tacOp: secret?.tacOp ?? state.players[seat].tacOp, op: secret?.primaryOp ?? state.players[seat].primaryOp ?? 'crit' });
  };
  const errorText = loadError ?? error ?? (replay && !replay.ok ? replay.error : null);
  const revealedSeats = new Set<Seat>(events.flatMap((event) => event.type === 'secret-revealed' ? [event.seat] : []));
  const onlineLike = { online: onlineGame.online, state, sync: onlineGame.sync, joinOnline: joinAndOpen, closeGame };
  const viewed = shownRoster ? rosters.find((r) => r.id === shownRoster) : undefined;
  if (viewed) {
    const noop = () => undefined;
    return <KtEditor roster={viewed} index={index} viewOnly onBack={() => setShownRoster(null)} onStartGame={noop} onTestArmy={noop} onChange={noop} onDuplicate={noop} onDelete={noop} />;
  }
  if (!data) return <Shell onBack={onBack}>{loadError ? <p className="text-sm text-danger">{loadError}</p> : <Spinner />}</Shell>;

  return (
    <RosterContext.Provider value={rosterCtx}>
    <Shell
      onBack={view === 'game' || view === 'field' ? closeGame : onBack}
      undo={view === 'game' && state && ktUndoTarget(events) ? () => dispatch({ type: 'event-reverted' }) : undefined}
      master={master}
      onMaster={toggleMaster}
    >
      {errorText && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorText}</p>}
      {onlineGame.online && <OnlineBar game={onlineLike} system="kt" />}
      {view === 'start' && <StartCard library={library} game={onlineLike} onNew={newGame} onOnline={startOnline} onList={() => setView('saved')} />}
      {view === 'start' && (
        <button
          type="button"
          onClick={() => setView('field')}
          className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
        >
          <Icon name="map" className="size-5 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Поле боя</span>
            <span className="block text-[12px] text-fg-3">Просмотр без игры: официальные карты killzone</span>
          </span>
          <Icon name="chevron" className="size-4 text-fg-3" />
        </button>
      )}
      {view === 'field' && <FieldView data={data} />}
      {view === 'saved' && <KtSavedList entries={library} onClose={closeGame} onOpen={openSaved} onRemove={(key) => { removeKtSaved(key); refreshLibrary(); }} />}
      {view === 'game' && !state && <Spinner />}
      {view === 'game' && state && state.stage === 'setup' && <Setup rosters={rosters} index={index} initialRosterId={initialRosterId} data={data} online={onlineGame.online} onSetup={(body) => dispatch(body)} />}
      {view === 'game' && state && state.stage !== 'setup' && (
        <>
          <RoundDots round={state.round} rounds={data.game.turningPoints} finished={state.stage === 'finished'} />
          {onlineGame.online && state.stage === 'battle' && state.round === 1 && !state.initiativeRolls && <OnlinePlayerSetup rosters={rosters} index={index} data={data} onlineSeat={onlineGame.online.seat} onRoster={(rosterId, operatives) => dispatch({ type: 'player-set', seat: onlineGame.online!.seat, rosterId, operatives })} onTac={(tacOp) => dispatch({ type: 'tac-set', seat: onlineGame.online!.seat, tacOp })} />}
          <BattleHeader state={state} data={data} onInitiative={(cards, manual) => dispatch({ type: 'initiative', round: state.round, attempt: 0, cards, ...(manual ? { manual } : {}) })} onPhase={() => dispatch({ type: 'phase-advanced' })} />
          <ScoreboardGrid className="mb-3 text-center">
            {SEATS.map((seat) => {
              const p = state.players[seat];
              return (
                <div key={seat} className={cx('rounded-2xl border py-2', state.initiative === seat && state.stage === 'battle' ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="truncate px-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">
                    {p.name}
                    {state.initiative === seat && state.stage === 'battle' ? ' · инициатива' : ''}
                  </p>
                  <p className="font-display text-[30px] font-semibold leading-none tabular-nums">
                    <span key={totalKtVp(state, seat)} className="fx-strong fx-bump">
                      {totalKtVp(state, seat)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-fg-3">
                    Crit {p.critVp} · Kill {p.killVp} · Tac {p.tacVp}
                    {p.bonusVp > 0 ? ` · +${p.bonusVp}` : ''}
                  </p>
                </div>
              );
            })}
          </ScoreboardGrid>
          <div className="space-y-3">
            {SEATS.map((seat) => <Player key={seat} roster={rosters.find((r) => r.id === state.players[seat].rosterId)} state={state} seat={seat} rosterName={rosterName(state.players[seat].rosterId)} tacOpName={data.tacOps.find((t) => t.id === state.players[seat].tacOp)?.name ?? state.players[seat].tacOp} reveal={state.stage === 'finished' || !onlineGame.online || onlineGame.online.seat === seat} dispatch={dispatch} />)}
          </div>
          <div className="mt-3">
            <BattleMap state={state} data={data} />
          </div>
          {state.stage === 'battle' && (
            <>
              {state.phase === 'firefight' && <InitiativeAndActions state={state} dispatch={dispatch} />}
              {state.phase === 'firefight' && <EndRound key={`${state.round}-${state.missionId}`} state={state} dispatch={dispatch} />}
              {state.round > data.game.turningPoints && (onlineGame.online ? (
                !revealedSeats.has(onlineGame.online.seat) ? <Button variant="primary" className="mt-3 w-full" onClick={revealOnlineSecret}>Раскрыть мой секрет</Button>
                  : !SEATS.every((seat) => revealedSeats.has(seat)) ? <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center text-sm text-fg-2">Ваш секрет раскрыт. Ждём соперника.</p>
                    : <Button variant="primary" className="mt-3 w-full" onClick={() => dispatch({ type: 'finish' })}>Завершить битву</Button>
              ) : <Button variant="primary" className="mt-3 w-full" onClick={finishLocalBattle}>Завершить битву и раскрыть primary ops</Button>)}
            </>
          )}
          {state.stage === 'finished' && <Result state={state} />}
          {state.stage === 'finished' && rosterCtx && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SEATS.map((seat) => (
                <RosterButton key={seat} rosterId={state.players[seat].rosterId} label={`Ростер: ${seatName(seat)}`} />
              ))}
            </div>
          )}
          <Rules state={state} data={data} onlineSeat={onlineGame.online?.seat ?? 'p1'} />
        </>
      )}
      {data && <button type="button" onClick={() => openExternal(data.source.url)} className="mt-5 w-full rounded-xl px-2 py-2 text-left text-[12px] text-fg-3">Источник правил и карт: {data.source.name} · {data.source.checked}</button>}
    </Shell>
    </RosterContext.Provider>
  );
}

function StartCard({ library, game, onNew, onOnline, onList }: { library: KtSavedEntry[]; game: Parameters<typeof OnlineStart>[0]['game']; onNew: () => void; onOnline: () => Promise<void>; onList: () => void }) {
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
        <p className="relative mt-1 pr-6 text-sm leading-snug text-[#111110]/80">Crit Op, Kill Op, Tac Op, primary op, initiative cards и четыре turning points. Подготовка по Approved Ops 2025, затем компактный tracker с сохранением после каждого действия.</p>
        <Button variant="ink" className="relative mt-3 w-full" onClick={onNew}><Icon name="spark" /> Начать подготовку</Button>
      </div>
      <OnlineStart game={game} onCreate={async () => { await onOnline(); }} busy={false} />
    </section>
  );
}

function KtSavedList({ entries, onClose, onOpen, onRemove }: { entries: KtSavedEntry[]; onClose: () => void; onOpen: (entry: KtSavedEntry) => void; onRemove: (key: string) => void }) {
  return (
    <SavedGamesFrame count={entries.length} note="Игры хранятся на этом телефоне (до 20)." onClose={onClose}>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.key} className={cx('rounded-2xl border bg-white/[0.03]', entry.summary.stage === 'finished' ? 'border-white/10' : 'border-accent/30')}>
            <button type="button" onClick={() => onOpen(entry)} className="w-full px-3 pb-2 pt-2.5 text-left active:bg-white/5">
              <span className="block text-[12px] text-fg-3">{new Date(entry.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.summary.stage === 'setup' ? 'Подготовка' : entry.summary.stage === 'finished' ? 'Битва окончена' : `Turning point ${entry.summary.round}`} · {entry.online ? `2 телефона · ${entry.online.code}` : '1 телефон'}</span>
              <span className="mt-1 flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.summary.names.p1} — {entry.summary.names.p2}</span><span className="font-display shrink-0 text-lg font-semibold tabular-nums">{entry.summary.score.p1} : {entry.summary.score.p2}</span></span>
              <span className="mt-0.5 block text-xs text-fg-2">{entry.summary.mission || 'Миссия ещё не выбрана'}</span>
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
const MARKERS: Choice<string>[] = [
  { value: 'home', label: 'Home' },
  { value: 'centre', label: 'Centre' },
  { value: 'enemy', label: 'Enemy' },
];
type KtData = import('../../skirmish/types').KtGameData;
const rosterChoices = (rosters: KtRoster[], index: KtIndex): Choice<string>[] =>
  rosters.map((r) => ({ value: r.id, label: r.name, sub: `${index.teams.find((team) => team.id === r.teamId)?.name ?? r.teamId} · ${r.operatives.length} опер.` }));
const tacChoices = (data: KtData): Choice<string>[] => data.tacOps.map((t) => ({ value: t.id, label: t.name, sub: t.archetype }));

function Setup({ rosters, index, initialRosterId, data, online, onSetup }: { rosters: KtRoster[]; index: KtIndex; initialRosterId?: string; data: KtData; online: ReturnType<typeof useSkirmishOnline>['online']; onSetup: (body: KtEventBody) => boolean }) {
  const [missionId, setMission] = useState(data.critOps[0]!.id);
  const [killzone, setKillzone] = useState(data.missionPack.killzones[0]!);
  const [map, setMap] = useState(1);
  const [dropZoneLoser, setLoser] = useState<Seat>('p2');
  const [selection, setSelection] = useState<Record<Seat, { id: string; operatives: number; tacOp: string }>>({
    // ростер, с которого начали игру (меню редактора): число оперативников сразу — иначе «ростер не выбран» до повторного выбора
    p1: { id: initialRosterId ?? '', operatives: rosters.find((r) => r.id === initialRosterId)?.operatives.length ?? 0, tacOp: data.tacOps[0]!.id },
    p2: { id: '', operatives: 0, tacOp: data.tacOps[0]!.id },
  });
  const chooseRoster = (seat: Seat, id: string) => {
    const r = rosters.find((x) => x.id === id);
    setSelection((s) => ({ ...s, [seat]: { ...s[seat], id, operatives: r?.operatives.length ?? 0 } }));
  };
  const chooseCode = (seat: Seat, code: string) => {
    try {
      const r = decodeKtRoster(code.trim(), index.teams.map((team) => team.id));
      setSelection((s) => ({ ...s, [seat]: { ...s[seat], id: r.id, operatives: r.operatives.length } }));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Код не распознан';
    }
  };
  const ready = selection.p1.id && selection.p2.id && selection.p1.tacOp && selection.p2.tacOp;
  const mapData = data.maps.find((item) => item.killzone === killzone && item.map === map) ?? null;
  return (
    <section className="space-y-3">
      <SetupStep n={1} title="Игроки и ростеры" done={!!selection.p1.id && !!selection.p2.id}>
        {SEATS.map((seat) => (
          <RosterChoice key={seat} seat={seat} rosters={rosters} index={index} selected={selection[seat].id} onSelect={(id) => chooseRoster(seat, id)} onCode={(code) => chooseCode(seat, code)} />
        ))}
      </SetupStep>
      <SetupStep n={2} title="Crit Op и официальная карта" done={!!missionId && !!killzone && !!mapData}>
        <ChoiceField label="Crit Op" value={missionId} onChange={setMission} options={data.critOps.map((m) => ({ value: m.id, label: m.name }))} />
        <ChoiceField
          label="Killzone"
          value={killzone}
          onChange={(k) => (setKillzone(k), setMap(1))}
          options={data.missionPack.killzones.map((k) => ({ value: k, label: k }))}
        />
        <ChoiceField label="Карта" value={map} onChange={setMap} inlineMax={6} options={Array.from({ length: 6 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
        {mapData && <KtMapPanel map={mapData} />}
      </SetupStep>
      <SetupStep n={3} title="Секретные Tac Ops" done={!!ready}>
        {SEATS.map((seat) =>
          online && online.seat !== seat ? (
            <p key={seat} className="rounded-xl border border-white/10 bg-black/20 p-3 text-[12px] text-fg-3">
              {seatName(seat)} · секрет выбирается на телефоне соперника.
            </p>
          ) : (
            <ChoiceField
              key={seat}
              label={`${seatName(seat)} · ваш секрет`}
              value={selection[seat].tacOp}
              onChange={(tacOp) => setSelection((s) => ({ ...s, [seat]: { ...s[seat], tacOp } }))}
              options={tacChoices(data)}
            />
          ),
        )}
      </SetupStep>
      <SetupStep n={4} title="Drop zone и начало" done={false}>
        <ChoiceField label="Проиграл roll-off и получил Re-roll initiative" value={dropZoneLoser} onChange={setLoser} options={SEAT_CHOICES} />
        <Button variant="primary" className="h-12 w-full" disabled={!ready} onClick={() => onSetup({ type: 'setup', missionId, killzone, map, dropZoneLoser, rosters: selection })}>
          Начать битву
        </Button>
      </SetupStep>
    </section>
  );
}

function OnlinePlayerSetup({ rosters, index, data, onlineSeat, onRoster, onTac }: { rosters: KtRoster[]; index: KtIndex; data: KtData; onlineSeat: Seat; onRoster: (id: string, operatives: number) => boolean; onTac: (tacOp: string) => boolean }) {
  const [rosterId, setRosterId] = useState('');
  const [tacOp, setTacOp] = useState(data.tacOps[0]!.id);
  const [saved, setSaved] = useState(false);
  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-accent/30 bg-accent/10 p-3">
      <p className="text-sm font-semibold">{seatName(onlineSeat)} · ваш ростер и секрет</p>
      <ChoiceField label="Kill team" placeholder="Выберите kill team" value={rosterId} onChange={(id) => (setRosterId(id), setSaved(false))} options={rosterChoices(rosters, index)} inlineMax={0} />
      <ChoiceField label="Tac Op" value={tacOp} onChange={(id) => (setTacOp(id), setSaved(false))} options={tacChoices(data)} />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={!rosterId} onClick={() => onRoster(rosterId, rosters.find((r) => r.id === rosterId)?.operatives.length ?? 0)}>
          Сохранить ростер
        </Button>
        <Button variant="primary" onClick={() => {
            if (onTac(tacOp)) setSaved(true);
          }}>
          {saved ? 'Tac Op сохранён ✓' : 'Подтвердить Tac Op'}
        </Button>
      </div>
    </div>
  );
}

function RosterChoice({ seat, rosters, index, selected, onSelect, onCode }: { seat: Seat; rosters: KtRoster[]; index: KtIndex; selected: string; onSelect: (id: string) => void; onCode: (code: string) => string | null }) {
  const [mode, setMode] = useState<'own' | 'code'>('own');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <GameLabel>{seatName(seat)}</GameLabel>
        </span>
        {selected && <RosterButton rosterId={selected} />}
      </div>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'own', label: 'Мой ростер' }, { value: 'code', label: 'По коду' }]} />
      {mode === 'own' ? (
        <ChoiceField placeholder="Выберите kill team" value={selected} onChange={onSelect} options={rosterChoices(rosters, index)} inlineMax={0} />
      ) : (
        <>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={2} placeholder="KT1.…" className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs outline-none focus:border-accent" />
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <Button
            className="w-full"
            disabled={!code.trim()}
            onClick={() => {
              const result = onCode(code);
              setError(result);
              if (!result) setCode('');
            }}
          >
            Добавить по коду
          </Button>
        </>
      )}
    </div>
  );
}

type Cards = Partial<Record<Seat, { reroll?: boolean; modifier?: number }>>;
type ManualInitiative = { winner: Seat; rolls?: Partial<Record<Seat, number>> };

function BattleHeader({ state, data, onInitiative, onPhase }: { state: KtState; data: KtData; onInitiative: (cards: Cards, manual?: ManualInitiative) => boolean; onPhase: () => boolean }) {
  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">
        {state.stage === 'finished' ? 'Битва окончена' : `Turning point ${Math.min(state.round, 4)} / ${data.game.turningPoints} · ${state.phase === 'strategy' ? 'Strategy' : 'Firefight'}`}
      </p>
      <p className="mt-1 text-sm text-fg-2">
        {data.critOps.find((m) => m.id === state.missionId)?.name} · {state.killzone} · Карта {state.map}
      </p>
      {state.stage === 'battle' && !state.initiativeRolls && state.round <= 4 && <InitiativePanel state={state} onRoll={onInitiative} />}
      {state.initiativeRolls && (
        <p className="mt-1 text-[12px] text-fg-3">
          Инициатива: {seatName(state.initiative)}
          {state.initiativeManual
            ? state.initiativeRolls.p1 || state.initiativeRolls.p2
              ? ` · вручную, броски ${state.initiativeRolls.p1} : ${state.initiativeRolls.p2}`
              : ' · вручную'
            : ` · броски ${state.initiativeRolls.p1} : ${state.initiativeRolls.p2}`}
        </p>
      )}
      {state.phase === 'strategy' && state.initiativeRolls && (
        <Button variant="primary" className="mt-3 w-full" onClick={onPhase} disabled={state.round === 1 && (!state.players.p1.primaryOp || !state.players.p2.primaryOp)}>
          Перейти к Firefight
        </Button>
      )}
    </div>
  );
}

function InitiativePanel({ state, onRoll }: { state: KtState; onRoll: (cards: Cards, manual?: ManualInitiative) => boolean }) {
  const [cards, setCards] = useState<Cards>({});
  const dice = useDiceMode((s) => s.mode);
  const [winner, setWinner] = useState<Seat | ''>('');
  const [rolls, setRolls] = useState<Partial<Record<Seat, number>>>({});
  const D6: Choice<number>[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }));
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
      <DiceHead title="Инициатива" hint="кто выиграл (значения — по желанию)" />
      {SEATS.map(
        (seat) =>
          state.players[seat].initiativeCards.length > 0 && (
            <ChoiceField
              key={seat}
              label={`${seatName(seat)} · карты ${state.players[seat].initiativeCards.join(', ')}`}
              value={cards[seat]?.modifier ?? 0}
              onChange={(modifier) => setCards((c) => ({ ...c, [seat]: { ...c[seat], modifier } }))}
              inlineMax={5}
              options={[{ value: 0, label: 'Без' }, ...state.players[seat].initiativeCards.flatMap((n) => [{ value: n, label: `+${n}` }, { value: -n, label: `−${n}` }])]}
            />
          ),
      )}
      {SEATS.map(
        (seat) =>
          state.players[seat].rerollCard && (
            <ToggleChip key={`reroll${seat}`} checked={!!cards[seat]?.reroll} onChange={(reroll) => setCards((c) => ({ ...c, [seat]: { ...c[seat], reroll } }))}>
              Re-roll: {seatName(seat)}
            </ToggleChip>
          ),
      )}
      {dice === 'manual' ? (
        <>
          {SEATS.map((seat) => (
            <ChoiceField
              key={`roll${seat}`}
              label={`${seatName(seat)}: выпало (по желанию)`}
              value={rolls[seat] ?? ''}
              onChange={(v) => setRolls((r) => ({ ...r, [seat]: v }))}
              inlineMax={6}
              options={D6}
            />
          ))}
          <ChoiceField label="Инициативу выиграл" value={winner} onChange={setWinner} options={SEAT_CHOICES} />
          <Button variant="primary" className="w-full" disabled={!winner} onClick={() => winner && onRoll(cards, { winner, rolls })}>
            Записать инициативу
          </Button>
        </>
      ) : (
        <Button variant="primary" className="w-full" onClick={() => onRoll(cards)}>
          <Icon name="spark" /> Бросить инициативу
        </Button>
      )}
    </div>
  );
}

function Player({ state, seat, roster, rosterName, tacOpName, reveal, dispatch }: { state: KtState; seat: Seat; roster?: KtRoster; rosterName: string; tacOpName: string; reveal: boolean; dispatch: (body: KtEventBody) => boolean }) {
  const p = state.players[seat];
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">
          {seatName(seat)} · {rosterName}
        </p>
        <RosterButton rosterId={p.rosterId} />
      </div>
      <p className="truncate text-[12px] text-fg-3">
        {reveal ? `Tac Op: ${tacOpName} · Primary: ${p.primaryOp ?? '—'}` : 'Секреты соперника скрыты'} · Kill Grade {p.killGrade}
      </p>
      {state.stage === 'battle' && state.initiativeRolls && (
        <>
          <GameCounter label="CP" value={p.cp} onMinus={() => dispatch({ type: 'cp-adjust', seat, delta: -1 })} onPlus={() => dispatch({ type: 'cp-adjust', seat, delta: 1 })} />
          {state.round === 1 && (
            <div className="mt-2">
              <ChoiceField
                label="Primary op"
                value={p.primaryOp ?? ''}
                onChange={(op) => dispatch({ type: 'primary-op', seat, op })}
                options={(['crit', 'kill', 'tac'] as Op[]).map((op) => ({ value: op, label: op === 'crit' ? 'Crit' : op === 'kill' ? 'Kill' : 'Tac' }))}
              />
            </div>
          )}
        </>
      )}
      {state.stage === 'battle' && state.initiativeRolls && <PloysPanel state={state} seat={seat} roster={roster} dispatch={dispatch} />}
    </article>
  );
}

const ACTIONS: Record<string, { action: string; label: string }[]> = {
  secure: [{ action: 'secure', label: 'Secure 1AP' }],
  loot: [{ action: 'loot', label: 'Loot 1AP' }],
  transmission: [{ action: 'transmit', label: 'Initiate Transmission 1AP' }],
  orb: [{ action: 'orb', label: 'Move Orb 1AP' }],
  download: [{ action: 'download', label: 'Download 1AP' }],
  data: [
    { action: 'compile', label: 'Compile Data 1AP' },
    { action: 'send', label: 'Send Data 1AP' },
  ],
  reboot: [{ action: 'reboot', label: 'Reboot 2AP' }],
};

function InitiativeAndActions({ state, dispatch }: { state: KtState; dispatch: (body: KtEventBody) => boolean }) {
  const [seat, setSeat] = useState<Seat>('p1');
  const [marker, setMarker] = useState('home');
  const [target, setTarget] = useState('centre');
  const [wounds, setWounds] = useState(8);
  const [within6, setWithin6] = useState(true);
  const actions = ACTIONS[state.missionId] ?? [];
  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <Segmented<Seat> value={seat} onChange={setSeat} options={[{ value: 'p1', label: 'Действует игрок 1' }, { value: 'p2', label: 'Действует игрок 2' }]} />
      {actions.length > 0 && (
        <div className="space-y-2">
          <GameLabel>Действие миссии</GameLabel>
          <ChoiceField label="Маркер" value={marker} onChange={setMarker} options={MARKERS} />
          <ChoiceField label="Цель" value={target} onChange={setTarget} options={MARKERS} />
          {actions.map((a) => (
            <Button key={a.action} className="w-full" onClick={() => dispatch({ type: 'crit-action', seat, action: a.action, marker, target })}>
              {a.label}
            </Button>
          ))}
          {state.missionId === 'reboot' && (
            <Button className="w-full" onClick={() => dispatch({ type: 'crit-action', seat, action: 'reboot-select', marker, target })}>
              Выбрать inert: P1={marker}, P2={target}
            </Button>
          )}
        </div>
      )}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <GameLabel>Вражеский оперативник incapacitated</GameLabel>
        <ChoiceField label="Wounds" value={wounds} onChange={setWounds} inlineMax={4} options={[4, 8, 12, 16].map((n) => ({ value: n, label: String(n) }))} />
        <ToggleChip checked={within6} onChange={setWithin6}>
          В 6″ от drop zone
        </ToggleChip>
        <Button className="w-full" onClick={() => dispatch({ type: 'incapacitated', seat, wounds, within6, marker, manualTacOp: true })}>
          Записать incapacitation
        </Button>
      </div>
      <div className="space-y-2 border-t border-white/10 pt-3">
        <GameLabel>Tac Op</GameLabel>
        <p className="text-[12px] leading-snug text-fg-3">Включая Rout: подтвердите результат по тексту карты (не больше 2VP за turning point).</p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => dispatch({ type: 'tac-score', seat, points: 1 })}>+1 Tac VP</Button>
          <Button onClick={() => dispatch({ type: 'tac-score', seat, points: 2 })}>+2 Tac VP</Button>
        </div>
      </div>
    </section>
  );
}

function EndRound({ state, dispatch }: { state: KtState; dispatch: (body: KtEventBody) => boolean }) {
  const [controls, setControls] = useState<Record<string, Seat | null>>({ home: null, centre: null, enemy: null });
  const [carrying, setCarrying] = useState<Record<string, Seat>>({});
  const [claims, setClaims] = useState<Partial<Record<Seat, { marker: string; control: boolean; uncontested: boolean }>>>({});
  if (state.round > 4) return null;
  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-app-elevated p-3.5">
      <p className="font-display text-lg font-semibold uppercase">Конец turning point {state.round}</p>
      <GameLabel>Контроль маркеров</GameLabel>
      {Object.keys(controls).map((marker) => (
        <div key={marker} className="space-y-1.5">
          <ChoiceField
            label={marker[0]!.toUpperCase() + marker.slice(1)}
            value={controls[marker] ?? 'none'}
            onChange={(v) => setControls((c) => ({ ...c, [marker]: v === 'none' ? null : (v as Seat) }))}
            options={[{ value: 'none', label: 'Никто' }, ...SEAT_CHOICES]}
          />
          {state.missionId === 'energy-cells' && (
            <ChoiceField
              value={carrying[marker] ?? 'none'}
              onChange={(v) =>
                setCarrying((c) => {
                  const next = { ...c };
                  if (v === 'none') delete next[marker];
                  else next[marker] = v as Seat;
                  return next;
                })
              }
              options={[
                { value: 'none', label: 'Не несут' },
                { value: 'p1', label: 'Несёт P1' },
                { value: 'p2', label: 'Несёт P2' },
              ]}
            />
          )}
        </div>
      ))}
      {state.missionId === 'stake-claim' &&
        SEATS.map((seat) => (
          <div key={seat} className="space-y-1.5 rounded-xl bg-black/25 p-3">
            <GameLabel>{seatName(seat)} · claim</GameLabel>
            <ChoiceField
              value={claims[seat]?.marker ?? 'home'}
              onChange={(m) => setClaims((c) => ({ ...c, [seat]: { marker: m, control: c[seat]?.control ?? true, uncontested: false } }))}
              options={MARKERS}
            />
            <ChoiceField
              value={claims[seat]?.control === false ? 'uncontested' : 'control'}
              onChange={(v) => setClaims((c) => ({ ...c, [seat]: { marker: c[seat]?.marker ?? 'home', control: v === 'control', uncontested: v !== 'control' } }))}
              options={[
                { value: 'control', label: 'Буду контролировать' },
                { value: 'uncontested', label: 'Враг не будет contest' },
              ]}
            />
          </div>
        ))}
      <Button variant="primary" className="w-full" onClick={() => dispatch({ type: 'end-round', controls, carrying, claims: state.missionId === 'stake-claim' ? claims : undefined })}>
        Завершить turning point
      </Button>
    </section>
  );
}

function Result({ state }: { state: KtState }) {
  return (
    <section className="my-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
      <p className="font-display text-2xl font-semibold uppercase">{state.winner === 'draw' ? 'Ничья' : `Победа: ${seatName(state.winner as Seat)}`}</p>
      <p className="mt-1 text-lg">
        {totalKtVp(state, 'p1')} : {totalKtVp(state, 'p2')}
      </p>
    </section>
  );
}

function Rules({ state, data, onlineSeat }: { state: KtState; data: KtData; onlineSeat: Seat }) {
  const mission = data.critOps.find((m) => m.id === state.missionId);
  return (
    <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Правила миссии и Tac Ops</summary>
      {mission && (
        <div className="mt-2">
          <SkirmishRuleText text={mission.text} />
        </div>
      )}
      {SEATS.map((seat) => {
        const p = state.players[seat];
        const tac = data.tacOps.find((t) => t.id === p.tacOp);
        if (state.stage !== 'finished' && seat !== onlineSeat)
          return (
            <p key={seat} className="mt-3 border-t border-white/10 pt-2 text-[12px] text-fg-3">
              {seatName(seat)} · секрет соперника скрыт до конца игры
            </p>
          );
        return tac ? (
          <div key={seat} className="mt-3 border-t border-white/10 pt-2 text-[12px] leading-relaxed text-fg-2">
            <p className="font-semibold">
              {seatName(seat)} · {tac.name}
            </p>
            <SkirmishRuleText text={tac.text} />
          </div>
        ) : null;
      })}
      <p className="mt-3 border-t border-white/10 pt-2 text-[12px] text-fg-3">
        {data.killOp.text}
        <br />
        {data.game.primaryOpBonus}
      </p>
    </details>
  );
}

function Shell({ onBack, undo, master, onMaster, children }: { onBack: () => void; undo?: () => void; master?: boolean; onMaster?: () => void; children: ReactNode }) {
  return (
    <GameShell onBack={onBack} undo={undo} master={master} onMaster={onMaster} kicker="Kill Team · Approved Ops" title="Полная игра" className="pb-24">
      {children}
    </GameShell>
  );
}

function Spinner() {
  return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
}

// ---------- режим мастера и карта (07.11.2026) ----------

const MASTER_KEY = 'warphub.game.master';
const readMaster = () => {
  try {
    return localStorage.getItem(MASTER_KEY) === '1';
  } catch {
    return false;
  }
};
const writeMaster = (on: boolean) => {
  try {
    localStorage.setItem(MASTER_KEY, on ? '1' : '0');
  } catch {
    // нет доступа к хранилищу — режим действует до перезапуска
  }
};
type RosterCtx = { open: (id: string) => void; has: (id: string) => boolean };
const RosterContext = createContext<RosterCtx | null>(null);

/** «Ростер» игрока — только в режиме мастера; ростера нет на этом телефоне (по коду, соперника) — неактивная кнопка. */
function RosterButton({ rosterId, label = 'Ростер' }: { rosterId: string; label?: string }) {
  const ctx = useContext(RosterContext);
  if (!ctx || !rosterId) return null;
  const has = ctx.has(rosterId);
  return (
    <button
      type="button"
      disabled={!has}
      title={has ? 'Открыть ростер' : 'Ростер не сохранён на этом телефоне'}
      onClick={() => (haptic.tap(), ctx.open(rosterId))}
      className="ds-hit shrink-0 rounded-lg border border-accent/40 px-2.5 py-1 text-[12px] font-semibold text-accent active:bg-accent/10 disabled:border-white/10 disabled:text-fg-3"
    >
      {has ? label : 'Нет на телефоне'}
    </button>
  );
}

/** Официальная карта партии (killzone и номер из подготовки) — свёрнута, раскрывается во время битвы. */
function BattleMap({ state, data }: { state: KtState; data: KtData }) {
  const map = data.maps.find((item) => item.killzone === state.killzone && item.map === state.map);
  if (!map) return null;
  return (
    <details className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <Icon name="map" className="size-4 text-accent" />
        <span className="min-w-0 flex-1">
          Карта · {state.killzone} · Map {state.map}
        </span>
      </summary>
      <div className="mt-3">
        <KtMapPanel map={map} />
      </div>
    </details>
  );
}

/** «Поле боя» без игры: любая официальная карта killzone (как «Поле боя» в 40K). */
function FieldView({ data }: { data: KtData }) {
  const [killzone, setKillzone] = useState(data.missionPack.killzones[0]!);
  const [map, setMap] = useState(1);
  const shown = data.maps.find((item) => item.killzone === killzone && item.map === map) ?? null;
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-display text-xl font-semibold uppercase">Поле боя</p>
      <ChoiceField label="Killzone" value={killzone} onChange={(k) => (setKillzone(k), setMap(1))} options={data.missionPack.killzones.map((k) => ({ value: k, label: k }))} />
      <ChoiceField label="Карта" value={map} onChange={setMap} inlineMax={6} options={Array.from({ length: data.missionPack.mapsPerKillzone }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
      {shown ? <KtMapPanel map={shown} /> : <p className="text-sm text-fg-3">Этой карты нет в данных.</p>}
    </section>
  );
}

// ---------- уловки (07.11.2026) ----------

/** Команда ростера с этого телефона (для уловок); нет ростера — null. */
function useKtTeam(teamId: string | undefined) {
  const [team, setTeam] = useState<{ id: string; team: KtTeam } | null>(null);
  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    loadKtTeam(teamId).then(
      (t) => alive && setTeam({ id: teamId, team: t }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [teamId]);
  return team && team.id === teamId ? team.team : null;
}

/**
 * Уловки игрока в текущей фазе: стратегические — в Strategy phase, боевые — в Firefight. Текст раскрывается,
 * «Использовать» — выбрать стоимость (в данных источника её нет: 0–3 CP по карте уловки) и списать CP.
 * Одна и та же уловка — раз за turning point. Ростера нет на телефоне — список недоступен.
 */
function PloysPanel({ state, seat, roster, dispatch }: { state: KtState; seat: Seat; roster?: KtRoster; dispatch: (body: KtEventBody) => boolean }) {
  const team = useKtTeam(roster?.teamId);
  const [open, setOpen] = useState<string | null>(null);
  const [cost, setCost] = useState<number | ''>('');
  const type: KtPloyType = state.phase === 'strategy' ? 'strategy' : 'firefight';
  const p = state.players[seat];
  const usedNow = (p.ploys ?? []).filter((x) => x.round === state.round);
  const title = type === 'strategy' ? 'Стратегические уловки' : 'Боевые уловки';
  if (!roster)
    return (
      <p className="mt-2 text-[12px] text-fg-3">
        {title}: ростер не сохранён на этом телефоне.{usedNow.length ? ` Использовано: ${usedNow.map((x) => x.name).join(', ')}.` : ''}
      </p>
    );
  const list = team?.ploys.filter((x) => x.type === type) ?? [];
  return (
    <div className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-2.5">
      <GameLabel>
        {title} · {state.phase === 'strategy' ? 'Strategy' : 'Firefight'} phase
      </GameLabel>
      {!team && <p className="text-[12px] text-fg-3">Загрузка уловок…</p>}
      {team && !list.length && <p className="text-[12px] text-fg-3">В данных команды нет таких уловок.</p>}
      {list.map((ploy) => {
        const used = usedNow.find((x) => x.ployId === ploy.id);
        const isOpen = open === ploy.id;
        return (
          <div key={ploy.id} className={cx('rounded-xl border', used ? 'border-accent/30 bg-accent/[0.05]' : 'border-white/10 bg-white/[0.02]')}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? null : ploy.id);
                setCost('');
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-white/90">{ploy.name}</span>
              {used && <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[12px] font-semibold text-accent">использована · {used.cp} CP</span>}
              <Icon name="down" className={cx('size-4 shrink-0 text-fg-3 transition', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-white/[0.06] px-3 pb-3 pt-2">
                <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg-2">{ploy.text}</p>
                {!used && (
                  <>
                    <ChoiceField label="Стоимость по карте уловки" value={cost} onChange={setCost} inlineMax={4} options={[0, 1, 2, 3].map((n) => ({ value: n, label: `${n} CP` }))} />
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={cost === '' || cost > p.cp}
                      onClick={() => {
                        if (cost !== '' && dispatch({ type: 'ploy-used', seat, ployId: ploy.id, name: ploy.name, ployType: type, cp: cost })) {
                          haptic.ok();
                          setOpen(null);
                          setCost('');
                        }
                      }}
                    >
                      {cost === '' ? 'Выберите стоимость' : cost > p.cp ? `Недостаточно CP (есть ${p.cp})` : `Использовать за ${cost} CP`}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
