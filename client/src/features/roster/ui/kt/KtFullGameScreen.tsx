/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyKtEvent, createKtState, KT_GAME_SCHEMA, ktUndoTarget, replayKt, totalKtVp, type KtEvent, type KtEventBody, type KtState, type Op, type Seat } from '../../ktgame';
import { newSeed } from '../../game/rng';
import { usePersistentGameData } from '../skirmish/useSkirmishData';
import type { KtRoster } from '../../kt/roster';
import { decodeKtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, Segmented } from '../kit';
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
import { readKtLibrary, readKtLocal, rememberKtOnline, removeKtSaved, saveKtLocal, type KtSavedEntry } from '../../ktgame/library';
import { injectKtSecret, readKtSecret, redactKtSetup, writeKtSecret } from '../../ktgame/secrets';
import { KtMapPanel } from '../skirmish/SkirmishMaps';

const SEATS: Seat[] = ['p1', 'p2'];

export function KtFullGameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: KtRoster[]; index: KtIndex; initialRosterId?: string }) {
  const { data, error: loadError } = usePersistentGameData('kt');
  const [events, setEvents] = useState<KtEvent[]>([]);
  const [view, setView] = useState<'start' | 'saved' | 'game'>('start');
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
  if (!data) return <Shell onBack={onBack}>{loadError ? <p className="text-sm text-danger">{loadError}</p> : <Spinner />}</Shell>;

  return (
    <Shell onBack={view === 'game' ? closeGame : onBack} undo={view === 'game' && state && ktUndoTarget(events) ? () => dispatch({ type: 'event-reverted' }) : undefined}>
      {errorText && <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorText}</p>}
      {onlineGame.online && <OnlineBar game={onlineLike} system="kt" />}
      {view === 'start' && <StartCard library={library} game={onlineLike} onNew={newGame} onOnline={startOnline} onList={() => setView('saved')} />}
      {view === 'saved' && <KtSavedList entries={library} onClose={closeGame} onOpen={openSaved} onRemove={(key) => { removeKtSaved(key); refreshLibrary(); }} />}
      {view === 'game' && !state && <Spinner />}
      {view === 'game' && state && state.stage === 'setup' && <Setup rosters={rosters} index={index} initialRosterId={initialRosterId} data={data} online={onlineGame.online} onSetup={(body) => dispatch(body)} />}
      {view === 'game' && state && state.stage !== 'setup' && (
        <>
          <RoundDots round={state.round} rounds={data.game.turningPoints} finished={state.stage === 'finished'} />
          {onlineGame.online && state.stage === 'battle' && state.round === 1 && !state.initiativeRolls && <OnlinePlayerSetup rosters={rosters} index={index} data={data} onlineSeat={onlineGame.online.seat} onRoster={(rosterId, operatives) => dispatch({ type: 'player-set', seat: onlineGame.online!.seat, rosterId, operatives })} onTac={(tacOp) => dispatch({ type: 'tac-set', seat: onlineGame.online!.seat, tacOp })} />}
          <BattleHeader state={state} data={data} onInitiative={(cards) => dispatch({ type: 'initiative', round: state.round, attempt: 0, cards })} onPhase={() => dispatch({ type: 'phase-advanced' })} />
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
            {SEATS.map((seat) => <Player key={seat} state={state} seat={seat} rosterName={rosterName(state.players[seat].rosterId)} tacOpName={data.tacOps.find((t) => t.id === state.players[seat].tacOp)?.name ?? state.players[seat].tacOp} reveal={state.stage === 'finished' || !onlineGame.online || onlineGame.online.seat === seat} dispatch={dispatch} />)}
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
          <Rules state={state} data={data} onlineSeat={onlineGame.online?.seat ?? 'p1'} />
        </>
      )}
      {data && <button type="button" onClick={() => openExternal(data.source.url)} className="mt-5 w-full rounded-xl px-2 py-2 text-left text-[12px] text-fg-3">Источник правил и карт: {data.source.name} · {data.source.checked}</button>}
    </Shell>
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-display text-xl font-semibold uppercase">Новая игра</p>
        <p className="mt-1 text-sm leading-snug text-fg-2">Crit Op, Kill Op, Tac Op, primary op, initiative cards и четыре turning points. Подготовка по Approved Ops 2025, затем компактный tracker с сохранением после каждого действия.</p>
        <Button variant="primary" className="mt-3 w-full" onClick={onNew}><Icon name="spark" /> Начать подготовку</Button>
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
      <GameLabel>{seatName(seat)}</GameLabel>
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

function BattleHeader({ state, data, onInitiative, onPhase }: { state: KtState; data: KtData; onInitiative: (cards: Cards) => boolean; onPhase: () => boolean }) {
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
          Инициатива: {seatName(state.initiative)} · броски {state.initiativeRolls.p1} : {state.initiativeRolls.p2}
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

function InitiativePanel({ state, onRoll }: { state: KtState; onRoll: (cards: Cards) => boolean }) {
  const [cards, setCards] = useState<Cards>({});
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/25 p-3">
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
      <Button variant="primary" className="w-full" onClick={() => onRoll(cards)}>
        <Icon name="spark" /> Бросить инициативу
      </Button>
    </div>
  );
}

function Player({ state, seat, rosterName, tacOpName, reveal, dispatch }: { state: KtState; seat: Seat; rosterName: string; tacOpName: string; reveal: boolean; dispatch: (body: KtEventBody) => boolean }) {
  const p = state.players[seat];
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="truncate text-[13px] font-semibold text-white/90">
        {seatName(seat)} · {rosterName}
      </p>
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

function Shell({ onBack, undo, children }: { onBack: () => void; undo?: () => void; children: ReactNode }) {
  return (
    <GameShell onBack={onBack} undo={undo} kicker="Kill Team · Approved Ops" title="Полная игра" className="pb-24">
      {children}
    </GameShell>
  );
}

function Spinner() {
  return <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
}
