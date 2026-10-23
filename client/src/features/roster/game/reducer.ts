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
  type RollKey,
  type RollRef,
  type RollResult,
  type Seat,
} from './types';
import { drawCards, initDecks, noteCard, redrawWhenDrawn, swapCard } from './decks';
import { cardVp } from './scoring';
import { setupMissing } from './setup';
import { layoutPick, rollOff } from './rng';

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
    primaryScored: [],
    adjustments: [],
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
      dispositionsRevealed: false,
      secondariesRevealed: false,
      rolls: {},
      rollCount: { roles: 0, 'first-turn': 0 },
      layoutDraws: 0,
      rolesSource: null,
      firstTurnSource: null,
      firstTurn: null,
      round: 1,
      activeSeat: null,
      step: 'start',
      drawsThisPhase: 0,
      discardCpTaken: false,
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
  // после битвы — только итоги: «Конец битвы» основной миссии, поправки ПО, имя и Battle Ready
  if (state.stage === 'finished' && !['player-set', 'primary-scored', 'vp-adjusted'].includes(ev.type)) return fail('Битва уже закончена');

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
      if (disposition !== undefined && s.dispositionsRevealed) return fail('Тип армии уже раскрыт');
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
      if (!s.players.p1.role) return fail('Сначала определите атакующего и защитника');
      if (s.secondariesRevealed) return fail('Выбор вторичных уже раскрыт');
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
    case 'dispositions-revealed': {
      if (!inSetup) return fail('Типы армий раскрываются до начала битвы');
      if (ev.seat !== null) return fail('Раскрытие — общее событие');
      if (s.dispositionsRevealed) return fail('Типы армий уже раскрыты');
      for (const p of Object.values(s.players)) if (!p.disposition) return fail(`${p.name}: не выбран тип армии`);
      s.dispositionsRevealed = true;
      break;
    }
    case 'layout-set': {
      if (!inSetup) return fail('Раскладка выбирается до начала битвы');
      if (!s.dispositionsRevealed) return fail('Сначала раскройте типы армий');
      if (s.players.p1.role) return fail('Атакующий и защитник уже определены — раскладку не поменять');
      const opts = layoutsFor(s, catalog);
      const l = opts.find((x) => x.id === ev.layoutId);
      if (!l) return fail('Эта раскладка не подходит к паре типов армий');
      if (ev.source === 'random') {
        if (!ev.roll || !Number.isInteger(ev.roll.attempt)) return fail('Для случайной раскладки нужен номер выбора');
        if (ev.roll.attempt !== s.layoutDraws) return fail(`Ожидался случайный выбор №${s.layoutDraws + 1}`);
        if (opts[layoutPick(s.seed, ev.roll.attempt, opts.length)]!.id !== l.id) return fail('Случайная раскладка не совпадает с жребием');
        s.layoutDraws += 1;
      } else if (ev.roll) return fail('Жребий указан, а выбор отмечен как ручной');
      s.layoutId = l.id;
      s.deploymentId = l.deployment;
      break;
    }
    case 'roles-set': {
      if (!inSetup) return fail('Атакующий и защитник определяются до начала битвы');
      if (!s.layoutId) return fail('Сначала выберите раскладку');
      if (s.secondariesRevealed) return fail('Вторичные уже раскрыты — атакующего и защитника не поменять');
      if (!SEATS.includes(ev.attacker)) return fail('Неизвестное место игрока');
      if (ev.source === 'random') {
        const r = applyRoll(s, 'roles', ev.roll);
        if (typeof r === 'string') return fail(r);
        // правило: победитель броска решает, кто атакующий, а кто защитник
        if (ev.seat !== null && ev.seat !== r.winner) return fail('Атакующего и защитника выбирает победитель броска');
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      s.players[ev.attacker].role = 'attacker';
      s.players[other(ev.attacker)].role = 'defender';
      s.rolesSource = ev.source;
      break;
    }
    case 'secondaries-revealed': {
      if (!inSetup) return fail('Вторичные раскрываются до начала битвы');
      if (ev.seat !== null) return fail('Раскрытие — общее событие');
      if (s.secondariesRevealed) return fail('Вторичные уже раскрыты');
      for (const p of Object.values(s.players)) if (!p.secondaryMode) return fail(`${p.name}: не выбран режим вторичных миссий`);
      s.secondariesRevealed = true;
      break;
    }
    case 'first-turn-set': {
      if (!inSetup) return fail('Первый ход определяется до начала битвы');
      if (!s.secondariesRevealed) return fail('Сначала раскройте вторичные миссии');
      if (!SEATS.includes(ev.first)) return fail('Неизвестное место игрока');
      if (ev.source === 'random') {
        const r = applyRoll(s, 'first-turn', ev.roll);
        if (typeof r === 'string') return fail(r);
        // правило: победитель броска ходит первым
        if (ev.first !== r.winner) return fail('Первым ходит победитель броска');
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      s.firstTurn = ev.first;
      s.firstTurnSource = ev.source;
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
      // Core Rules 08.02 «Получение базовых CP»: в каждую фазу командования оба игрока получают 1 CP
      for (const seat of SEATS) s.players[seat].cp += 1;
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
      s.discardCpTaken = false;
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
      const e =
        ev.reason === 'swap'
          ? swapCard(s, ev.target, ev.card, ev.replacement, ev.shuffleBack, ev.source)
          : ev.reason === 'when-drawn'
            ? redrawWhenDrawn(s, ev.target, ev.card, ev.replacement, ev.shuffleBack, ev.source, catalog)
            : 'Неизвестная причина замены';
      if (e) return fail(e);
      break;
    }
    case 'card-scored': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Засчитывать можно только свои карты');
      if (s.stage !== 'battle' || s.step !== 'main') return fail('Вторичные миссии засчитываются в конце хода');
      const p = s.players[ev.target];
      if (!p.active.some((a) => a.id === ev.card)) return fail('Этой карты нет среди активных');
      if (p.scored.some((x) => x.id === ev.card && x.round === s.round && x.turn === s.activeSeat)) return fail('Эта карта уже засчитана в этот ход');
      const card = catalog.cards.find((c) => c.id === ev.card);
      if (!card) return fail(`Нет карты ${ev.card}`);
      const r = cardVp({ card, picks: ev.picks, round: s.round, mode: p.secondaryMode });
      if ('error' in r) return fail(r.error);
      p.scored.push({ id: ev.card, round: s.round, turn: s.activeSeat!, vp: r.vp, picks: ev.picks.map((x) => ({ ...x })) });
      // тактическая карта выполнена и уходит из игры; фиксированная остаётся активной всю битву
      if (p.secondaryMode === 'tactical') p.active = p.active.filter((a) => a.id !== ev.card);
      break;
    }
    case 'card-discarded': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Сбрасывать можно только свои карты');
      const p = s.players[ev.target];
      if (p.secondaryMode !== 'tactical') return fail('Фиксированные вторичные миссии не сбрасываются');
      if (s.stage !== 'battle' || s.activeSeat !== ev.target || s.step !== 'main') return fail('Сбросить карты можно в конце своего хода');
      if (!p.active.some((a) => a.id === ev.card)) return fail('Этой карты нет среди активных');
      if (ev.forCp) {
        if (s.discardCpTaken) return fail('1 CP за сброс в этот ход уже получен');
        p.cp += 1;
        s.discardCpTaken = true;
      }
      p.active = p.active.filter((a) => a.id !== ev.card);
      p.discarded.push(ev.card);
      break;
    }
    case 'cp-changed': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('CP можно менять только себе');
      if (ev.reason === 'discard' || ev.reason === 'swap') return fail('CP за сброс и замену карты начисляются автоматически');
      if (!['base', 'stratagem', 'other'].includes(ev.reason)) return fail('Неизвестная причина изменения CP');
      if (!Number.isInteger(ev.delta) || ev.delta === 0 || Math.abs(ev.delta) > 10) return fail('Изменение CP — целое число от −10 до 10, не ноль');
      const p = s.players[ev.target];
      if (p.cp + ev.delta < 0) return fail(`Не хватает CP: есть ${p.cp}`);
      p.cp += ev.delta;
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
    case 'primary-scored': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Засчитывать можно только свою основную миссию');
      const end = s.stage === 'finished';
      if (!end && (s.stage !== 'battle' || s.step === 'start')) return fail('Основная миссия засчитывается в фазе командования, в конце хода или в конце битвы');
      const id = s.primary[ev.target];
      const card = id ? catalog.cards.find((c) => c.id === id) : undefined;
      if (!card) return fail('Основная миссия не определена');
      const round: Round = end ? (ROUNDS as Round) : s.round;
      const r = cardVp({ card, picks: ev.picks, round, endOfBattle: end });
      if ('error' in r) return fail(r.error);
      const turn = end ? null : s.activeSeat;
      const p = s.players[ev.target];
      const same = p.primaryScored.filter((x) => x.round === round && x.turn === turn && x.end === end);
      if (ev.picks.some((k) => same.some((x) => x.picks.some((y) => y.block === k.block && y.row === k.row))))
        return fail(end ? 'Эта строка уже засчитана в конце битвы' : 'Эта строка уже засчитана в этот ход');
      p.primaryScored.push({ round, turn, end, vp: r.vp, picks: ev.picks.map((x) => ({ ...x })) });
      break;
    }
    case 'vp-adjusted': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Поправлять можно только свои ПО');
      if (s.stage === 'setup') return fail('ПО поправляются во время или после битвы');
      if (ev.kind !== 'primary' && ev.kind !== 'secondary') return fail('Неизвестный вид ПО');
      if (!Number.isInteger(ev.delta) || ev.delta === 0 || Math.abs(ev.delta) > 50) return fail('Поправка — целое число от −50 до 50, не ноль');
      const note = ev.note.trim();
      if (!note || note.length > 200) return fail('Укажите причину поправки (до 200 символов)');
      s.players[ev.target].adjustments.push({ round: s.stage === 'finished' ? (ROUNDS as Round) : s.round, kind: ev.kind, delta: ev.delta, note });
      break;
    }
    case 'event-reverted':
      // отмене нужна история состояний — её применяет replay (см. ниже)
      return fail('Отмена применяется только при проигрывании журнала');
    default:
      return fail(`Неизвестное событие «${(ev as { type: string }).type}»`);
  }
  return { ok: true, state: s };
}

/**
 * Бросок «кто выше» по seed: номер броска должен быть следующим для этого вида (отмена возвращает счётчик —
 * повторный бросок после отмены даёт те же кубики). Результат записывается в состояние.
 */
function applyRoll(s: GameState, key: RollKey, roll: RollRef | undefined): RollResult | string {
  if (!roll || !Number.isInteger(roll.attempt)) return 'Для случайного выбора нужен бросок';
  if (roll.attempt !== s.rollCount[key]) return `Ожидался бросок №${s.rollCount[key] + 1}`;
  const r = rollOff(s.seed, key, roll.attempt);
  const result: RollResult = { attempt: roll.attempt, rolls: r.rolls, winner: r.winner };
  s.rolls[key] = result;
  s.rollCount[key] += 1;
  return result;
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

/**
 * Проиграть журнал целиком. Ошибка — с номером события, на котором журнал не применился.
 *
 * Отмена (event-reverted) — как стек: отменяется только последнее действующее событие (не отменённое и не
 * создание игры); повторная отмена снимает следующее. Отменить можно своё событие или общее (seat = null).
 * Журнал не переписывается: отменённое событие остаётся в нём, а состояние возвращается к снимку до него —
 * поэтому повторное взятие карты после отмены даёт те же карты (колода из того же снимка).
 */
export function replay(events: readonly GameEvent[], catalog: GameCatalog): ApplyResult & { seq?: number } {
  if (!events.length) return fail('Журнал пуст');
  const ids = new Set<string>();
  const first = createGame(events[0]!);
  if (!first.ok) return { ...first, seq: events[0]!.seq };
  ids.add(events[0]!.id);
  // стек действующих событий: снимок состояния после каждого
  const stack: { ev: GameEvent; state: GameState }[] = [{ ev: events[0]!, state: first.state }];
  let state = first.state;
  for (const ev of events.slice(1)) {
    if (ids.has(ev.id)) return { ok: false, error: `Повтор события ${ev.id}`, seq: ev.seq };
    ids.add(ev.id);
    if (ev.type === 'event-reverted') {
      if (ev.seq !== state.lastSeq + 1) return { ok: false, error: `Нарушен порядок журнала: ожидалось событие №${state.lastSeq + 1}, пришло №${ev.seq}`, seq: ev.seq };
      const top = stack.at(-1)!;
      if (stack.length < 2) return { ok: false, error: 'Отменять нечего', seq: ev.seq };
      if (top.ev.id !== ev.target) return { ok: false, error: 'Отменить можно только последнее действие', seq: ev.seq };
      if (ev.seat !== null && top.ev.seat !== null && top.ev.seat !== ev.seat) return { ok: false, error: 'Отменить можно только своё действие', seq: ev.seq };
      stack.pop();
      state = { ...structuredClone(stack.at(-1)!.state), lastSeq: ev.seq, reverted: [...state.reverted, ev.target] };
      continue;
    }
    const res = applyEvent(state, ev, catalog);
    if (!res.ok) return { ...res, seq: ev.seq };
    state = res.state;
    stack.push({ ev, state });
  }
  return { ok: true, state };
}

/** Какое событие снимет следующая отмена (null — отменять нечего). seat — кто отменяет (null — общий телефон). */
export function undoTarget(events: readonly GameEvent[], seat: Seat | null = null): GameEvent | null {
  const active: GameEvent[] = [];
  for (const ev of events) {
    if (ev.type === 'event-reverted') active.pop();
    else active.push(ev);
  }
  const top = active.length > 1 ? active.at(-1)! : null;
  if (!top) return null;
  return seat === null || top.seat === null || top.seat === seat ? top : null;
}
