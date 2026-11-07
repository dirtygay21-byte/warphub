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
  type DominatusPlayer,
  type DominatusState,
  type GameCatalog,
  type GameMode,
  type GameEvent,
  type GameState,
  type PlayerState,
  type PrimaryAt,
  type Round,
  type RollKey,
  type RollRef,
  type RollResult,
  type Seat,
} from './types';
import { commandPhasePending, drawCards, initDecks, noteCard, redrawWhenDrawn, swapCard } from './decks';
import { blockTurnOk, cardVp, primaryAtOk, primaryContext } from './scoring';
import { setupMissing } from './setup';
import { layoutPick, rollD6, rollOff } from './rng';

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
    drawn: 0,
    discarded: [],
    discardLog: [],
    scored: [],
    swapUsed: false,
    primaryScored: [],
    adjustments: [],
  };
}

/** Agenda Dominatus в игре: оба игрока решили играть Agenda (иначе — основные миссии колоды у обоих). */
export function agendasActive(state: GameState): boolean {
  const d = state.dominatus;
  return !!d && d.players.p1.attempt === true && d.players.p2.attempt === true;
}

const newDomPlayer = (): DominatusPlayer => ({ alliance: null, attempt: null, agenda: null, upgrades: [], achieved: null });

/**
 * Основная миссия места: по паре типов армий (null — пара не выбрана или не найдена);
 * в Dominatus, если оба играют Agenda, — выбранная Agenda игрока (правила Dominatus: Agenda заменяет основную миссию).
 */
export function primaryFor(state: GameState, seat: Seat, catalog: GameCatalog): string | null {
  if (agendasActive(state)) return state.dominatus!.players[seat].agenda;
  const a = state.players[seat].disposition;
  const b = state.players[other(seat)].disposition;
  if (!a || !b) return null;
  return matchupMission(catalog.matchups, a, b);
}

/** Основная миссия игрока с типом армии you против foe (таблица пар battlefield.json; «Поле боя» и игра — одна функция). */
export function matchupMission(matchups: GameCatalog['matchups'], you: string, foe: string): string | null {
  return matchups.find((m) => m.you === you && m.foe === foe)?.mission ?? null;
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
  const mode: GameMode = ev.mode ?? 'standard';
  if (mode !== 'standard' && mode !== 'dominatus') return fail('Неизвестный режим игры');
  const dominatus: DominatusState | null =
    mode === 'dominatus'
      ? { phase: null, locationId: null, locationSource: null, locationRoll: null, locationDraws: 0, players: { p1: newDomPlayer(), p2: newDomPlayer() } }
      : null;
  return {
    ok: true,
    state: {
      schema: GAME_SCHEMA,
      mode,
      dominatus,
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
      concededBy: null,
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
  if (state.stage === 'finished' && !['player-set', 'primary-scored', 'vp-adjusted', 'dom-achieved'].includes(ev.type)) return fail('Битва уже закончена');

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
      if ((roster !== undefined || disposition !== undefined) && s.dispositionsRevealed) return fail('Типы армий уже раскрыты — ростер и тип армии не меняются');
      if (disposition != null && !catalog.matchups.some((m) => m.you === disposition)) return fail(`Неизвестный тип армии: ${disposition}`);
      // G2.12: ростер обязателен; типы армий — только те, что дают его детачменты
      if (roster !== undefined && roster.source !== 'none') {
        if (!roster.dispositions?.length) return fail('В ростере нет детачмента с типом армии (Force Disposition)');
        const bad = roster.dispositions.find((d) => !catalog.matchups.some((m) => m.you === d));
        if (bad) return fail(`Неизвестный тип армии в ростере: ${bad}`);
      }
      const nextRoster = roster ?? p.roster;
      if (disposition != null) {
        if (nextRoster.source === 'none') return fail('Сначала выберите ростер игрока');
        if (!nextRoster.dispositions?.includes(disposition)) return fail('Этот тип армии не даёт ни один детачмент ростера');
      }
      if (name !== undefined) p.name = name.trim() || p.name;
      if (roster !== undefined) {
        p.roster = roster;
        // прежний тип армии, которого новый ростер не даёт, сбрасывается
        if (disposition === undefined && p.disposition && !roster.dispositions?.includes(p.disposition)) {
          p.disposition = null;
          refreshPrimary();
        }
      }
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
    case 'dom-location-set': {
      const d = s.dominatus;
      if (!d || !catalog.dominatus) return fail('Это не битва Dominatus');
      if (!inSetup) return fail('Локация выбирается до начала битвы');
      if (ev.seat !== null) return fail('Фазу и локацию задаёт Warmaster — общее событие');
      if (![1, 2, 3].includes(ev.phase)) return fail('Фаза кампании — 1, 2 или 3');
      const loc = catalog.dominatus.locations.find((l) => l.id === ev.locationId);
      if (!loc) return fail('Неизвестная локация');
      if (loc.phase !== ev.phase) return fail('Эта локация из другой фазы кампании');
      let roll: number | null = null;
      if (ev.source === 'random') {
        if (!ev.roll || ev.roll.attempt !== d.locationDraws) return fail(`Ожидался бросок №${d.locationDraws + 1}`);
        roll = rollD6(s.seed, `location-${ev.phase}`, ev.roll.attempt);
        if (roll < loc.rolls[0] || roll > loc.rolls[1]) return fail('Локация не совпадает с броском D6');
        d.locationDraws += 1;
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      // другая фаза — выбранные Agenda больше не подходят
      if (d.phase !== ev.phase) for (const seat of SEATS) d.players[seat].agenda = null;
      d.phase = ev.phase;
      d.locationId = loc.id;
      d.locationSource = ev.source;
      d.locationRoll = roll;
      refreshPrimary();
      break;
    }
    case 'dom-player-set': {
      const d = s.dominatus;
      if (!d || !catalog.dominatus) return fail('Это не битва Dominatus');
      if (!inSetup) return fail('Альянс, Agenda и улучшения выбираются до начала битвы');
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Менять можно только свои данные');
      const p = d.players[ev.target];
      const patch = ev.patch;
      if ('achieved' in patch) return fail('Agenda Achieved отмечается после битвы');
      if (patch.alliance !== undefined) {
        if (patch.alliance !== null && !catalog.dominatus.alliances.includes(patch.alliance)) return fail('Неизвестный альянс');
        if (patch.alliance !== p.alliance) p.agenda = null;
        p.alliance = patch.alliance;
      }
      if (patch.attempt !== undefined) {
        if (patch.attempt !== null && typeof patch.attempt !== 'boolean') return fail('Решение по Agenda — да или нет');
        p.attempt = patch.attempt;
        if (patch.attempt === false) p.agenda = null;
      }
      if (patch.agenda !== undefined) {
        if (patch.agenda !== null) {
          if (!s.dispositionsRevealed) return fail('Agenda выбирается после раскрытия типов армий (Briefing)');
          if (p.attempt !== true) return fail('Сначала решите играть Agenda');
          const card = catalog.cards.find((c) => c.id === patch.agenda);
          if (!card?.agenda) return fail('Неизвестная Agenda');
          if (card.alliance !== p.alliance) return fail('Agenda другого альянса');
          if (card.phase !== d.phase) return fail('Agenda другой фазы кампании');
        }
        p.agenda = patch.agenda;
      }
      if (patch.upgrades !== undefined) {
        const list = patch.upgrades;
        if (!Array.isArray(list)) return fail('Неверный список улучшений');
        const limit = d.locationId === 'titangrave' ? catalog.dominatus.limits.upgradesTitangrave : catalog.dominatus.limits.upgradesPerBattle;
        if (list.length > limit) return fail(`Не больше ${limit} улучшений в битве`);
        const cards = new Set<string>();
        const units = new Set<string>();
        for (const u of list) {
          if (!u || typeof u.card !== 'string' || typeof u.unit !== 'string' || !u.unit.trim()) return fail('У улучшения нужны карта и отряд');
          if (!catalog.dominatus.upgrades.includes(u.card)) return fail(`Неизвестная карта улучшения: ${u.card}`);
          if (cards.has(u.card)) return fail('Одну карту нельзя назначить дважды');
          if (units.has(u.unit.trim())) return fail('У отряда может быть только одно улучшение');
          cards.add(u.card);
          units.add(u.unit.trim());
        }
        p.upgrades = list.map((u) => ({ card: u.card, unit: u.unit.trim() }));
      }
      refreshPrimary();
      break;
    }
    case 'dom-achieved': {
      const d = s.dominatus;
      if (!d) return fail('Это не битва Dominatus');
      if (s.stage !== 'finished') return fail('Agenda Achieved отмечается после битвы');
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Отмечать можно только свою Agenda');
      if (!agendasActive(s)) return fail('В этой битве Agenda не играли');
      if (![0, 1, 2].includes(ev.cards)) return fail('Карт Agenda Achieved — 0, 1 или 2');
      d.players[ev.target].achieved = ev.cards;
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
      const pending = commandPhasePending(s, s.activeSeat!, catalog);
      if (pending) return fail(pending);
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
      if (ev.reason === 'concede' && (!ev.by || !SEATS.includes(ev.by))) return fail('Укажите, кто сдался');
      // два телефона: сдаться можно только за себя (общий телефон — за любого)
      if (ev.reason === 'concede' && ev.seat !== null && ev.seat !== ev.by) return fail('Сдаться можно только за себя');
      if (ev.reason === 'manual' && ev.by) return fail('Окончание по договорённости — без сдавшегося');
      s.concededBy = ev.reason === 'concede' ? ev.by! : null;
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
      // чей ход: карта указывает, в конце чьего хода засчитывается блок
      const ownTurn = s.activeSeat === ev.target;
      const lastTurn = s.round === ROUNDS && s.activeSeat !== s.firstTurn;
      for (const pk of ev.picks) {
        const t = card.blocks[pk.block]!.turn;
        if (!blockTurnOk(t, ownTurn, lastTurn))
          return fail(t === 'own' ? 'Этот блок засчитывается в конце вашего хода' : 'Этот блок засчитывается в конце хода противника (или в конце 5-го раунда)');
      }
      const n = p.active.find((a) => a.id === ev.card)!.n;
      p.scored.push({ id: ev.card, round: s.round, turn: s.activeSeat!, ...(n != null ? { n } : {}), vp: r.vp, picks: ev.picks.map((x) => ({ ...x })) });
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
      const gone = p.active.find((a) => a.id === ev.card);
      if (!gone) return fail('Этой карты нет среди активных');
      if (ev.forCp) {
        if (s.discardCpTaken) return fail('1 CP за сброс в этот ход уже получен');
        p.cp += 1;
        s.discardCpTaken = true;
      }
      p.active = p.active.filter((a) => a.id !== ev.card);
      p.discarded.push(ev.card);
      p.discardLog.push({ id: ev.card, round: s.round, ...(gone.n != null ? { n: gone.n } : {}), why: 'discard', cp: ev.forCp ? 1 : 0 });
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
      // когда: конец вашего хода, фазы командования, любого хода, конца раунда (Agenda Dominatus), конец битвы
      const ctx = primaryContext(s, ev.target, end);
      for (const pk of ev.picks) {
        const at = card.blocks[pk.block]!.at;
        if (!primaryAtOk(at, ctx)) return fail(`Этот блок засчитывается: ${AT_RU[at!]}`);
      }
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

const AT_RU: Record<PrimaryAt, string> = {
  'own-turn': 'в конце вашего хода',
  'own-command': 'в конце вашей фазы командования',
  'own-command-r5-turn': 'в конце вашей фазы командования (в 5-м раунде — в конце вашего хода)',
  'any-turn': 'в конце любого хода',
  'round-end': 'в конце раунда (после хода второго игрока)',
  'battle-end': 'в конце битвы',
};

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
