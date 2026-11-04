import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataIndex, Roster } from '../../engine/types';
import { currentSetupStep, setupSteps, type EventBody, type GameMode, type Seat, type SetupStepId } from '../../game';
import { pushOverlay } from '../../telegram';
import { Battlefield } from '../Battlefield';
import { Button, Icon, Sheet } from '../kit';
import { cx } from '../util';
import { GameErrorBar } from '../common/GameErrorBar';
import { GameShell } from '../common/GameShell';
import { CardSheet } from './CardSheet';
import { CardViewerContext, MySeatContext, RosterViewerContext } from './cardViewer';
import { OnlineBar, OnlineStart } from './Online';
import { SavedGames } from './SavedGames';
import { DominatusCampaign } from './DominatusCampaign';
import { rosterRefFor } from './players';
import { RosterViewer } from './RosterViewer';
import { StepAgendas, StepCampaign } from './StepDominatus';
import { StepDispositions } from './StepDispositions';
import { StepLayout } from './StepLayout';
import { StepRoles } from './StepRoles';
import { StepSecondaries } from './StepSecondaries';
import { StepStart } from './StepStart';
import { StepPlayers } from './StepPlayers';
import { Tracker } from './Tracker';
import { useGame, type GameHook } from './useGame';

/**
 * «Начать игру»: подготовка к битве по шагам правил колоды миссий, затем трекер (G3).
 * Шаги: игроки, типы армий, раскладка, роли, вторичные, первый ход и начало битвы (StepBody); после начала — трекер (Tracker).
 * initialRosterId — ростер из меню «Начать игру с этим ростером»: он сразу выбирается первому игроку.
 */
export function GameScreen({ onBack, rosters, index, initialRosterId }: { onBack: () => void; rosters: Roster[]; index: DataIndex; initialRosterId?: string }) {
  const game = useGame();
  const { data, loadError, state } = game;
  // ростер из меню «Начать игру с этим ростером» — первым событием подготовки (если в нём есть детачмент)
  const [starting, setStarting] = useState(false);
  const initialEvents = async (): Promise<EventBody[]> => {
    const r = initialRosterId ? rosters.find((x) => x.id === initialRosterId) : undefined;
    const ref = r && data ? await rosterRefFor(r, 'own', data.battlefield) : null;
    return ref && typeof ref !== 'string' ? [{ type: 'player-set', target: 'p1', patch: { roster: ref } }] : [];
  };
  const start = async (mode: GameMode) => {
    setStarting(true);
    const initial = await initialEvents();
    setStarting(false);
    game.newGame({}, initial, mode);
  };
  // два телефона (T3): создатель — игрок 1, его ростер из меню — так же первым событием
  const startOnline = async (mode: GameMode) => {
    setStarting(true);
    await game.startOnline(await initialEvents(), mode);
    setStarting(false);
  };
  // режим мастера (G2.12): ростеры игроков можно открыть для просмотра; запоминается на этом телефоне
  const [master, setMaster] = useState(readMaster);
  const toggleMaster = () => {
    writeMaster(!master);
    setMaster(!master);
  };
  const [rosterSeat, setRosterSeat] = useState<Seat | null>(null);
  const openRoster = useCallback((seat: Seat) => setRosterSeat(seat), []);
  const closeRoster = useCallback(() => setRosterSeat(null), []);
  // просмотр поля боя открывается поверх игры: игра не теряется, «Назад» Telegram закрывает просмотр
  const [viewing, setViewing] = useState(false);
  useEffect(() => (viewing ? pushOverlay(() => setViewing(false)) : undefined), [viewing]);
  // просмотр карты миссии из любого места подготовки и трекера (G3.8)
  const [card, setCard] = useState<{ id: string; seat?: Seat } | null>(null);
  const openCard = useCallback((id: string, seat?: Seat) => setCard({ id, seat }), []);
  const closeCard = useCallback(() => setCard(null), []);
  if (viewing) return <Battlefield onBack={() => setViewing(false)} />;
  const shownRoster = rosterSeat && state ? state.players[rosterSeat].roster : null;
  if (shownRoster && shownRoster.source !== 'none') return <RosterViewer rosterRef={shownRoster} rosters={rosters} index={index} onClose={closeRoster} />;

  if (loadError) {
    return (
      <GameShell onBack={onBack} kicker="Chapter Approved 2026–27" title="Начать игру" className="pb-24 lg:max-w-4xl lg:pt-8">
        <p className="mt-10 text-center text-sm text-fg-3">{loadError}</p>
      </GameShell>
    );
  }
  if (!data) {
    return (
      <GameShell onBack={onBack} kicker="Chapter Approved 2026–27" title="Начать игру" className="pb-24 lg:max-w-4xl lg:pt-8">
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </GameShell>
    );
  }

  return (
    <CardViewerContext.Provider value={openCard}>
      <RosterViewerContext.Provider value={master ? openRoster : null}>
       <MySeatContext.Provider value={game.online?.seat ?? null}>
        <GameShell
          onBack={state || game.online ? game.closeGame : onBack}
          undo={state && game.canUndo ? game.undo : undefined}
          master={master}
          onMaster={toggleMaster}
          kicker={state?.mode === 'dominatus' ? dominatusKicker(game) : 'Chapter Approved 2026–27'}
          title="Начать игру"
          className="pb-24 lg:max-w-4xl lg:pt-8"
          undoClassName="mb-0.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-fg-2 active:bg-white/10"
        >
          <OnlineBar game={game} />
          {game.online && !state ? (
            <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
          ) : !state ? (
            <StartCard game={game} onStart={start} onStartOnline={startOnline} starting={starting} />
          ) : (
            state.stage === 'setup' ? <Setup game={game} rosters={rosters} index={index} /> : <Tracker game={game} index={index} />
          )}

          {game.error && <GameErrorBar error={game.error} onClose={game.clearError} />}

          <button
            type="button"
            onClick={() => setViewing(true)}
            className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
          >
            <Icon name="map" className="size-5 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Поле боя</span>
              <span className="block text-[12px] text-fg-3">Просмотр без игры: зоны деплоя и раскладки террейна</span>
            </span>
            <Icon name="chevron" className="size-4 text-fg-3" />
          </button>
          {card && <CardSheet game={game} id={card.id} seat={card.seat} onClose={closeCard} />}
        </GameShell>
       </MySeatContext.Provider>
      </RosterViewerContext.Provider>
    </CardViewerContext.Provider>
  );
}

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
    /* приватный режим — только на этот раз */
  }
};

/**
 * Начало: новая игра на одном телефоне, игра на двух телефонах и кнопка «Сохранённые игры» — список с датой,
 * игроками и миссиями (новая игра старые не затирает).
 */
function StartCard({ game, onStart, onStartOnline, starting }: { game: GameHook; onStart: (mode: GameMode) => void; onStartOnline: (mode: GameMode) => Promise<void>; starting: boolean }) {
  const [list, setList] = useState(false);
  const closeList = useCallback(() => setList(false), []);
  const [campaign, setCampaign] = useState(false);
  const closeCampaign = useCallback(() => setCampaign(false), []);
  // DM1 (решение владельца 31.10.2026): «Начать подготовку» открывает выбор режима — обычная игра или Dominatus
  const [picking, setPicking] = useState<'local' | 'online' | null>(null);
  const resolveOnline = useRef<(() => void) | null>(null);
  const pick = (mode: GameMode) => {
    const where = picking;
    setPicking(null);
    if (where === 'local') onStart(mode);
    else if (where === 'online') void onStartOnline(mode).finally(() => resolveOnline.current?.());
  };
  if (list) return <SavedGames game={game} onClose={closeList} />;
  if (campaign) return <DominatusCampaign onClose={closeCampaign} />;
  const count = game.library?.length ?? 0;
  const unfinished = game.library?.filter((e) => e.summary?.stage !== 'finished').length ?? 0;
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setList(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left active:bg-accent/15"
      >
        <Icon name="book" className="size-5 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold uppercase leading-tight">Сохранённые игры{count ? ` (${count})` : ''}</span>
          <span className="block text-[12px] text-fg-3">{count ? (unfinished ? `Незаконченных: ${unfinished}` : 'Все законченные') : 'Пока нет — начните новую игру'}</span>
        </span>
        <Icon name="chevron" className="size-4 text-fg-3" />
      </button>
      {game.data?.dominatus && (
        <button
          type="button"
          onClick={() => setCampaign(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left active:bg-white/10"
        >
          <Icon name="map" className="size-5 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold uppercase leading-tight">Кампания Dominatus</span>
            <span className="block text-[12px] text-fg-3">Фазы, альянсы, мои карты, битвы</span>
          </span>
          <Icon name="chevron" className="size-4 text-fg-3" />
        </button>
      )}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="font-display text-xl font-semibold uppercase">Новая игра</p>
        <p className="mt-1 text-sm leading-snug text-fg-2">
          Сначала выберите режим: обычная партия 11-й редакции (Chapter Approved 2026–27) или битва кампании Dominatus. Дальше — подготовка по шагам правил: игроки и ростеры, типы армий, раскладка, атакующий и защитник, вторичные миссии, первый ход.
          Затем — трекер партии. Игра сохраняется на этом телефоне после каждого действия и появляется в «Сохранённых играх».
        </p>
        <Button variant="primary" className="mt-3 w-full" disabled={starting} onClick={() => setPicking('local')}>
          Начать подготовку
        </Button>
      </div>
      <OnlineStart
        game={game}
        busy={starting}
        onCreate={() =>
          new Promise<void>((resolve) => {
            resolveOnline.current = resolve;
            setPicking('online');
          })
        }
      />
      <ModeSheet
        open={picking !== null}
        dominatus={!!game.data?.dominatus}
        onClose={() => {
          setPicking(null);
          resolveOnline.current?.();
        }}
        onPick={pick}
      />
    </section>
  );
}

/** Выбор режима игры (DM1): обычная партия 11-й редакции или битва кампании Dominatus — дальше правила ветвятся. */
function ModeSheet({ open, dominatus, onClose, onPick }: { open: boolean; dominatus: boolean; onClose: () => void; onPick: (mode: GameMode) => void }) {
  const option = (mode: GameMode, title: string, text: string, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(mode)}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left active:bg-white/10 disabled:opacity-50"
    >
      <span className="font-display block text-lg font-semibold uppercase leading-tight">{title}</span>
      <span className="mt-0.5 block text-[13px] leading-snug text-fg-2">{text}</span>
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Режим игры">
      <div className="space-y-2">
        {option('standard', 'Warhammer 40,000 · 11-я редакция', 'Обычная партия по колоде миссий Chapter Approved 2026–27.')}
        {option(
          'dominatus',
          'Dominatus',
          dominatus
            ? 'Битва нарративной кампании: фаза и локация, альянсы, Agenda вместо основной миссии, улучшения и награды после битвы.'
            : 'Данные Dominatus не загрузились — попробуйте позже.',
          !dominatus,
        )}
      </div>
    </Sheet>
  );
}

/** Подпись в шапке для битвы Dominatus: фаза и локация. */
function dominatusKicker(game: GameHook): string {
  const d = game.state!.dominatus!;
  const loc = game.data?.dominatus?.locations.find((l) => l.id === d.locationId);
  return ['Dominatus', d.phase ? `фаза ${d.phase}` : null, loc?.name].filter(Boolean).join(' · ');
}

function Setup({ game, rosters, index }: { game: GameHook; rosters: Roster[]; index: DataIndex }) {
  const state = game.state!;
  const steps = setupSteps(state);
  const current = currentSetupStep(state);
  // открытый шаг: сначала «Игроки» (он не блокирует движок), дальше — первый несделанный
  const [open, setOpen] = useState<SetupStepId>('players');
  const reachable = (id: SetupStepId) => id === 'players' || steps.find((x) => x.id === id)!.done || id === current;
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Подготовка к битве</p>
        <p className="text-[12px] text-fg-3">
          {doneCount} из {steps.length}
        </p>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const active = s.id === open;
          return (
            <li
              key={s.id}
              className={cx('rounded-2xl border px-3 py-2.5', active ? 'border-accent/60 bg-accent/[0.07]' : 'border-white/10 bg-white/[0.03]')}
            >
              <button
                type="button"
                disabled={!reachable(s.id) || active}
                onClick={() => setOpen(s.id)}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    s.done ? 'bg-accent text-black' : active ? 'border border-accent text-accent' : 'border border-white/20 text-fg-3',
                  )}
                >
                  {s.done ? <Icon name="check" className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cx('min-w-0 flex-1 text-sm font-semibold', !s.done && !active && 'text-fg-2')}>{s.title}</span>
              </button>
              {active && <StepBody id={s.id} game={game} rosters={rosters} index={index} onNext={() => setOpen(currentSetupStep(state) ?? 'first-turn')} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Содержимое открытого шага. */
function StepBody({ id, game, rosters, index, onNext }: { id: SetupStepId; game: GameHook; rosters: Roster[]; index: DataIndex; onNext: () => void }) {
  if (id === 'players') return <StepPlayers game={game} rosters={rosters} index={index} onNext={onNext} />;
  if (id === 'campaign') return <StepCampaign game={game} onNext={onNext} />;
  if (id === 'dispositions') return <StepDispositions game={game} onNext={onNext} />;
  if (id === 'agendas') return <StepAgendas game={game} onNext={onNext} />;
  if (id === 'layout') return <StepLayout game={game} onNext={onNext} />;
  if (id === 'roles') return <StepRoles game={game} onNext={onNext} />;
  if (id === 'secondaries') return <StepSecondaries game={game} onNext={onNext} />;
  return <StepStart game={game} index={index} />;
}
