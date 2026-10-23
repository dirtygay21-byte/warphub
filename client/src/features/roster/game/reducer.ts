/**
 * Ядро игры (G1.3): применение одного события к состоянию и проигрывание журнала.
 * Чистые функции: исходное состояние не меняется, ошибки возвращаются (ApplyResult), исключений нет.
 *
 * Права (основа для двух телефонов): событие с seat = null — общее (один телефон, подготовка);
 * событие с seat = p1/p2 может менять только данные своего места, а ходовые события — только активный игрок.
 */
import {
  GAME_SCHEMA,
  ROUNDS,
  SEATS,
  type ApplyResult,
  type GameCatalog,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Round,
  type Seat,
} from './types';
import { drawCards, initDecks, noteCard, redrawWhenDrawn } from './decks';

export const other = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');

function newPlayer(seat: Seat, name: string): PlayerState {
  return {
    seat,
    name,
    roster: { source: 'none' },
    disposition: null,
    role: null,
    secondaryMode: null,
    fixed: null,
    battleReady: false,
    cp: 0,
    deck: [],
    shuffles: 0,
    active: [],
    discarded: [],
    scored: [],
    swapUsed: false,
    vp: { primary: new Array(ROUNDS).fill(0), primaryEnd: 0, secondary: new Array(ROUNDS).fill(0), fixedByCard: {} },
  };
}

/** Основная миссия места по паре типов армий (null — пара не выбрана или не найдена). */
export function primaryFor(state: GameState, seat: Seat, catalog: GameCatalog): string | null {
  const a = state.players[seat].disposition;
  const b = state.players[other(seat)].disposition;
  if (!a || !b) return null;
  return catalog.matchups.find((m) => m.you === a && m.foe === b)?.mission ?? null;
}

/** Раскладки пары типов армий (в battlefield.json пара хранится отсортированной). */
export function layoutsFor(state: GameState, catalog: GameCatalog): GameCatalog['layouts'] {
  const a = state.players.p1.disposition;
  const b = state.players.p2.disposition;
  if (!a || !b) return [];
  const key = [a, b].sort().join('|');
  return catalog.layouts.filter((l) => l.pair.join('|') === key).sort((x, y) => x.variant - y.variant);
}

/** Чего не хватает для начала битвы (пусто — можно начинать). */
export function setupMissing(state: GameState): string[] {
  const miss: string[] = [];
  for (const s of SEATS) {
    const p = state.players[s];
    if (!p.disposition) miss.push(`${p.name}: тип армии`);
    if (!p.secondaryMode) miss.push(`${p.name}: режим вторичных миссий`);
  }
  if (!state.layoutId) miss.push('раскладка');
  if (!state.players.p1.role) miss.push('атакующий и защитник');
  if (!state.choicesRevealed) miss.push('раскрытие выбора');
  if (!state.firstTurn) miss.push('кто ходит первым');
  return miss;
}

const fail = (error: string): ApplyResult => ({ ok: false, error });

/** Состояние из первого события журнала (game-created). */
export function createGame(ev: GameEvent): ApplyResult {
  if (ev.type !== 'game-created') return fail('Журнал должен начинаться с создания игры');
  if (ev.schema !== GAME_SCHEMA) return fail(`Неизвестная версия игры: ${ev.schema} (ожидается ${GAME_SCHEMA})`);
  if (ev.seq !== 1) return fail('Создание игры должно быть событием №1');
  if (!ev.seed) return fail('Нет seed игры');
  return {
    ok: true,
    state: {
      schema: GAME_SCHEMA,
      id: ev.id,
      seed: ev.seed,
      createdAt: ev.at,
      stage: 'setup',
      players: { p1: newPlayer('p1', ev.names.p1 || 'Игрок 1'), p2: newPlayer('p2', ev.names.p2 || 'Игрок 2') },
      primary: { p1: null, p2: null },
      layoutId: null,
      deploymentId: null,
      choicesRevealed: false,
      firstTurn: null,
      round: 1,
      activeSeat: null,
      step: 'start',
      drawsThisPhase: 0,
      endReason: null,
      lastSeq: 1,
      reverted: [],
    },
  };
}

/** Применить событие. Порядок, права и этап проверяются здесь; логика колод и очков — в G1.4–G1.6. */
export function applyEvent(state: GameState, ev: GameEvent, catalog: GameCatalog): ApplyResult {
  if (ev.type === 'game-created') return fail('Игра уже создана');
  if (ev.seq !== state.lastSeq + 1) return fail(`Нарушен порядок журнала: ожидалось событие №${state.lastSeq + 1}, пришло №${ev.seq}`);
  if (ev.seat !== null && !SEATS.includes(ev.seat)) return fail('Неизвестное место игрока');
  if (state.stage === 'finished' && ev.type !== 'player-set') return fail('Битва уже закончена');

  const s = structuredClone(state) as GameState;
  s.lastSeq = ev.seq;
  const own = (target: Seat) => ev.seat === null || ev.seat === target;
  const inSetup = s.stage === 'setup';
  const refreshPrimary = () => {
    s.primary = { p1: primaryFor(s, 'p1', catalog), p2: primaryFor(s, 'p2', catalog) };
    // раскладка относится к паре типов армий: другая пара — раскладку нужно выбрать заново
    if (s.layoutId && !layoutsFor(s, catalog).some((l) => l.id === s.layoutId)) {
      s.layoutId = null;
      s.deploymentId = null;
    }
  };

  switch (ev.type) {
    case 'player-set': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Можно менять только свои данные');
      const p = s.players[ev.target];
      const { name, roster, disposition, battleReady } = ev.patch;
      if ((roster !== undefined || disposition !== undefined) && !inSetup) return fail('Ростер и тип армии меняются только до начала битвы');
      if (disposition !== undefined && s.choicesRevealed) return fail('Тип армии уже раскрыт');
      if (disposition != null && !catalog.matchups.some((m) => m.you === disposition)) return fail(`Неизвестный тип армии: ${disposition}`);
      if (name !== undefined) p.name = name.trim() || p.name;
      if (roster !== undefined) p.roster = roster;
      if (battleReady !== undefined) p.battleReady = battleReady;
      if (disposition !== undefined) {
        p.disposition = disposition;
        refreshPrimary();
      }
      break;
    }
    case 'secondary-chosen': {
      if (!inSetup) return fail('Вторичные миссии выбираются до начала битвы');
      if (!own(ev.target)) return fail('Можно выбрать только свои вторичные миссии');
      if (s.choicesRevealed) return fail('Выбор вторичных уже раскрыт');
      const p = s.players[ev.target];
      if (ev.mode === 'fixed') {
        const f = ev.fixed;
        if (!f || f.length !== 2 || f[0] === f[1]) return fail('Для фиксированного режима выберите две разные карты');
        for (const id of f) {
          const c = catalog.cards.find((x) => x.id === id);
          if (!c || c.type !== 'secondary') return fail(`Нет вторичной миссии ${id}`);
          if (!c.modes?.includes('fixed')) return fail(`${c.name} нельзя взять фиксированной`);
        }
        p.fixed = [f[0], f[1]];
      } else if (ev.mode === 'tactical') {
        if (ev.fixed) return fail('В тактическом режиме фиксированные карты не выбираются');
        p.fixed = null;
      } else return fail('Неизвестный режим вторичных миссий');
      p.secondaryMode = ev.mode;
      break;
    }
    case 'choices-revealed': {
      if (!inSetup) return fail('Выбор раскрывается до начала битвы');
      if (ev.seat !== null) return fail('Раскрытие выбора — общее событие');
      if (s.choicesRevealed) return fail('Выбор уже раскрыт');
      for (const p of Object.values(s.players)) {
        if (!p.disposition) return fail(`${p.name}: не выбран тип армии`);
        if (!p.secondaryMode) return fail(`${p.name}: не выбран режим вторичных миссий`);
      }
      s.choicesRevealed = true;
      break;
    }
    case 'layout-set': {
      if (!inSetup) return fail('Раскладка выбирается до начала битвы');
      const opts = layoutsFor(s, catalog);
      if (!opts.length) return fail('Сначала выберите типы армий обоих игроков');
      const l = opts.find((x) => x.id === ev.layoutId);
      if (!l) return fail('Эта раскладка не подходит к паре типов армий');
      s.layoutId = l.id;
      s.deploymentId = l.deployment;
      break;
    }
    case 'roles-set': {
      if (!inSetup) return fail('Атакующий и защитник определяются до начала битвы');
      if (!SEATS.includes(ev.attacker)) return fail('Неизвестное место игрока');
      s.players[ev.attacker].role = 'attacker';
      s.players[other(ev.attacker)].role = 'defender';
      break;
    }
    case 'first-turn-set': {
      if (!inSetup) return fail('Первый ход определяется до начала битвы');
      if (!SEATS.includes(ev.first)) return fail('Неизвестное место игрока');
      s.firstTurn = ev.first;
      break;
    }
    case 'battle-started': {
      if (!inSetup) return fail('Битва уже идёт');
      if (ev.seat !== null) return fail('Начало битвы — общее событие');
      const miss = setupMissing(s);
      if (miss.length) return fail(`Не готово: ${miss.join(', ')}`);
      s.stage = 'battle';
      s.round = 1;
      s.activeSeat = s.firstTurn;
      s.step = 'start';
      initDecks(s, catalog);
      break;
    }
    case 'command-phase-started': {
      const e = turnCheck(s, ev.seat, 'start');
      if (e) return fail(e);
      s.step = 'command';
      s.drawsThisPhase = 0;
      break;
    }
    case 'command-phase-ended': {
      const e = turnCheck(s, ev.seat, 'command');
      if (e) return fail(e);
      s.step = 'main';
      break;
    }
    case 'turn-ended': {
      const e = turnCheck(s, ev.seat, 'main');
      if (e) return fail(e);
      const second = s.activeSeat !== s.firstTurn;
      if (!second) s.activeSeat = other(s.activeSeat!);
      else if (s.round < ROUNDS) {
        s.round = (s.round + 1) as Round;
        s.activeSeat = s.firstTurn;
      } else {
        s.stage = 'finished';
        s.endReason = 'rounds';
        s.activeSeat = null;
      }
      s.step = 'start';
      break;
    }
    case 'battle-ended': {
      if (s.stage !== 'battle') return fail('Битва не идёт');
      if (ev.reason === 'rounds') return fail('Битва по раундам заканчивается сама после пятого раунда');
      if (ev.reason !== 'concede' && ev.reason !== 'manual') return fail('Неизвестная причина окончания');
      s.stage = 'finished';
      s.endReason = ev.reason;
      s.activeSeat = null;
      s.step = 'start';
      break;
    }
    case 'cards-drawn': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Тянуть карты можно только себе');
      const e = drawCards(s, ev.target, ev.cards, ev.source);
      if (e) return fail(e);
      break;
    }
    case 'card-redrawn': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Менять можно только свои карты');
      if (ev.reason !== 'when-drawn') return fail(`Событие «${ev.type}» (${ev.reason}) ещё не поддерживается`);
      const e = redrawWhenDrawn(s, ev.target, ev.card, ev.replacement, ev.shuffleBack, ev.source, catalog);
      if (e) return fail(e);
      break;
    }
    case 'card-noted': {
      if (s.stage !== 'battle') return fail('Битва не идёт');
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Заметки — только к своим картам');
      const e = noteCard(s, ev.target, ev.card, ev.note);
      if (e) return fail(e);
      break;
    }
    case 'card-scored':
    case 'card-discarded':
    case 'primary-scored':
    case 'vp-adjusted':
    case 'cp-changed':
    case 'event-reverted':
      return fail(`Событие «${ev.type}» ещё не поддерживается`);
    default:
      return fail(`Неизвестное событие «${(ev as { type: string }).type}»`);
  }
  return { ok: true, state: s };
}

/** Ход идёт, шаг подходящий, событие от активного игрока (или общее). */
function turnCheck(s: GameState, seat: Seat | null, step: GameState['step']): string | null {
  if (s.stage !== 'battle') return 'Битва не идёт';
  if (seat !== null && seat !== s.activeSeat) return 'Сейчас ход другого игрока';
  if (s.step !== step) {
    const now = { start: 'фаза командования ещё не начата', command: 'идёт фаза командования', main: 'фаза командования уже закончилась' }[s.step];
    return `Не по порядку: ${now}`;
  }
  return null;
}

/** Проиграть журнал целиком. Ошибка — с номером события, на котором журнал не применился. */
export function replay(events: readonly GameEvent[], catalog: GameCatalog): ApplyResult & { seq?: number } {
  if (!events.length) return fail('Журнал пуст');
  const ids = new Set<string>();
  let res = createGame(events[0]!);
  if (!res.ok) return { ...res, seq: events[0]!.seq };
  ids.add(events[0]!.id);
  for (const ev of events.slice(1)) {
    if (ids.has(ev.id)) return { ok: false, error: `Повтор события ${ev.id}`, seq: ev.seq };
    ids.add(ev.id);
    res = applyEvent(res.state, ev, catalog);
    if (!res.ok) return { ...res, seq: ev.seq };
  }
  return res;
}
