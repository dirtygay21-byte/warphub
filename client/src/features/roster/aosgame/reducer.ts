/**
 * Ядро игры AoS: применение событий и проигрывание журнала (как game/reducer.ts у 40K, но правила General's Handbook
 * 2026-27). Права: событие с seat = null — общее (один телефон); со своим seat — только свои данные, ходовые — только
 * активный игрок. Ошибка — строкой, состояние не меняется.
 */
import { battleplanRoll, priorityRoll, rolesRoll } from './rolls';
import { aosTotals, nextTier, otherSeat, planRowsFor, roundCp, underdogOf } from './scoring';
import { AOS_GAME_SCHEMA, SEATS, type AosCatalog, type AosGameEvent, type AosGameState, type AosPlayerState, type ApplyResult, type Seat } from './types';

const fail = (error: string): ApplyResult => ({ ok: false, error });

function newPlayer(seat: Seat, name: string): AosPlayerState {
  return { seat, name, roster: { source: 'none' }, role: null, tacticCards: [], cp: 0, rage: 0, fury: 0, tacticsDone: [], planScored: [], vpAdjust: [] };
}

export function createAosGame(ev: AosGameEvent): ApplyResult {
  if (ev.type !== 'game-created') return fail('Журнал должен начинаться с создания игры');
  if (ev.schema !== AOS_GAME_SCHEMA) return fail(`Версия журнала ${ev.schema} не поддерживается (нужна ${AOS_GAME_SCHEMA})`);
  if (!ev.seed) return fail('Нет seed игры');
  return {
    ok: true,
    state: {
      schema: ev.schema,
      seed: ev.seed,
      stage: 'setup',
      players: { p1: newPlayer('p1', ev.names.p1 || 'Игрок 1'), p2: newPlayer('p2', ev.names.p2 || 'Игрок 2') },
      battleplan: null,
      battleplanSource: null,
      battleplanDraws: 0,
      territory: null,
      tacticsRevealed: false,
      rolesSource: null,
      rolesRoll: null,
      rollCount: { roles: 0, priority: 0 },
      round: 1,
      step: 'priority',
      first: null,
      prevFirst: null,
      activeSeat: null,
      turnIndex: 0,
      seized: null,
      underdog: null,
      priority: null,
      endReason: null,
      concededBy: null,
      lastSeq: ev.seq,
      reverted: [],
    },
  };
}

/** Что ещё не готово к началу битвы (пусто — можно начинать). */
export function aosSetupMissing(s: AosGameState): string[] {
  const out: string[] = [];
  for (const seat of SEATS) if (s.players[seat].roster.source === 'none') out.push(`ростер: ${s.players[seat].name}`);
  if (!s.battleplan) out.push('батлплан');
  if (!s.players.p1.role) out.push('атакующий и защитник');
  if (!s.territory) out.push('территория атакующего');
  if (!s.tacticsRevealed) out.push('карты боевых тактик');
  return out;
}

export function applyAosEvent(state: AosGameState, ev: AosGameEvent, cat: AosCatalog): ApplyResult {
  if (ev.seq !== state.lastSeq + 1) return fail(`Нарушен порядок журнала: ожидалось событие №${state.lastSeq + 1}, пришло №${ev.seq}`);
  if (ev.seat !== null && !SEATS.includes(ev.seat)) return fail('Неизвестное место игрока');
  const s: AosGameState = structuredClone(state);
  s.lastSeq = ev.seq;
  const own = (t: Seat) => ev.seat === null || ev.seat === t;
  const inSetup = s.stage === 'setup';
  const turn = (target?: Seat): string | null => {
    if (s.stage !== 'battle') return 'Битва не идёт';
    if (s.step !== 'turn' || !s.activeSeat) return 'Раунд ещё не начат: сначала priority';
    if (ev.seat !== null && ev.seat !== s.activeSeat) return 'Сейчас ход другого игрока';
    if (target && target !== s.activeSeat) return 'Засчитывается в конце своего хода';
    return null;
  };

  switch (ev.type) {
    case 'game-created':
      return fail('Игра уже создана');

    case 'player-set': {
      if (!SEATS.includes(ev.target)) return fail('Неизвестное место игрока');
      if (!own(ev.target)) return fail('Можно менять только свои данные');
      const p = s.players[ev.target];
      const { name, roster, tacticCards } = ev.patch;
      if (name !== undefined) {
        const n = name.trim();
        if (!n || n.length > 24) return fail('Имя — от 1 до 24 символов');
        p.name = n;
      }
      if (roster !== undefined) {
        if (!inSetup || s.tacticsRevealed) return fail('Ростер меняется только до раскрытия тактик');
        p.roster = roster;
      }
      if (tacticCards !== undefined) {
        if (s.tacticsRevealed) return fail('Карты тактик уже раскрыты');
        if (tacticCards.length > cat.tactics.pick) return fail(`Не больше ${cat.tactics.pick} карт тактик`);
        if (new Set(tacticCards).size !== tacticCards.length) return fail('Карта выбрана дважды');
        if (!tacticCards.every((c) => cat.tactics.cards.some((x) => x.id === c))) return fail('Неизвестная карта тактик');
        p.tacticCards = [...tacticCards];
      }
      break;
    }

    case 'battleplan-set': {
      if (!inSetup) return fail('Батлплан выбирается до начала битвы');
      if (!cat.battleplans.some((b) => b.n === ev.n)) return fail('Нет такого батлплана');
      if (ev.source === 'random') {
        if (!ev.roll || ev.roll.attempt !== s.battleplanDraws) return fail(`Ожидался бросок №${s.battleplanDraws + 1}`);
        if (battleplanRoll(s.seed, ev.roll.attempt).n !== ev.n) return fail('Батлплан не совпадает с броском');
        s.battleplanDraws += 1;
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      s.battleplan = ev.n;
      s.battleplanSource = ev.source;
      break;
    }

    case 'roles-set': {
      if (!inSetup) return fail('Роли определяются до начала битвы');
      if (!SEATS.includes(ev.attacker)) return fail('Неизвестное место игрока');
      if (ev.source === 'random') {
        if (!ev.roll || ev.roll.attempt !== s.rollCount.roles) return fail(`Ожидался бросок №${s.rollCount.roles + 1}`);
        const r = rolesRoll(s.seed, ev.roll.attempt);
        if (ev.seat !== null && ev.seat !== r.winner) return fail('Атакующего и защитника выбирает победитель броска');
        s.rolesRoll = r.rolls;
        s.rollCount.roles += 1;
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      s.players[ev.attacker].role = 'attacker';
      s.players[otherSeat(ev.attacker)].role = 'defender';
      s.rolesSource = ev.source;
      s.territory = null;
      break;
    }

    case 'territory-set': {
      if (!inSetup) return fail('Территория выбирается до начала битвы');
      const atk = SEATS.find((x) => s.players[x].role === 'attacker');
      if (!atk) return fail('Сначала определите атакующего');
      if (ev.seat !== null && ev.seat !== atk) return fail('Территорию выбирает атакующий');
      if (!ev.territory.trim()) return fail('Укажите территорию');
      s.territory = ev.territory.trim();
      break;
    }

    case 'tactics-revealed': {
      if (!inSetup) return fail('Тактики раскрываются до начала битвы');
      if (ev.seat !== null) return fail('Раскрытие — общее событие');
      if (s.tacticsRevealed) return fail('Тактики уже раскрыты');
      s.tacticsRevealed = true;
      break;
    }

    case 'battle-started': {
      if (!inSetup) return fail('Битва уже идёт');
      if (ev.seat !== null) return fail('Начало битвы — общее событие');
      const miss = aosSetupMissing(s);
      if (miss.length) return fail(`Не готово: ${miss.join(', ')}`);
      // Raising the Heat: уровень ярости — атакующий 1, защитник 2
      for (const seat of SEATS) s.players[seat].fury = s.players[seat].role === 'attacker' ? 1 : 2;
      s.stage = 'battle';
      s.round = 1;
      s.step = 'priority';
      break;
    }

    case 'round-started': {
      if (s.stage !== 'battle' || s.step !== 'priority') return fail('Раунд уже начат');
      if (!SEATS.includes(ev.first)) return fail('Неизвестное место игрока');
      let decider: Seat | null = null;
      if (ev.source === 'random') {
        if (!ev.roll || ev.roll.attempt !== s.rollCount.priority) return fail(`Ожидался бросок №${s.rollCount.priority + 1}`);
        const r = priorityRoll(s.seed, s.round, ev.roll.attempt, s.prevFirst);
        decider = r.decider;
        if (ev.seat !== null && ev.seat !== decider) return fail('Кто ходит первым, решает победитель броска priority');
        s.priority = { round: s.round, attempt: ev.roll.attempt, p1: r.p1, p2: r.p2, winner: r.winner, decider };
        s.rollCount.priority += 1;
      } else if (ev.roll) return fail('Бросок указан, а выбор отмечен как ручной');
      else s.priority = null;
      // перехват инициативы: ходивший вторым в прошлом раунде сам решил ходить первым
      const second = s.prevFirst ? otherSeat(s.prevFirst) : null;
      const seizing = !!second && ev.first === second && (ev.source === 'manual' || decider === second);
      if (seizing) {
        const lead = aosTotals(s, otherSeat(second), cat).total - aosTotals(s, second, cat).total;
        if (lead >= cat.priority.seizeBlockedLead) return fail(`Перехват инициативы нельзя: соперник впереди на ${lead} ПО (нужно меньше ${cat.priority.seizeBlockedLead})`);
      }
      s.seized = seizing ? second : null;
      s.underdog = underdogOf(s, cat);
      for (const seat of SEATS) {
        const p = s.players[seat];
        p.cp = roundCp(s, seat, s.underdog, cat); // неистраченные CP прошлого раунда сгорают
        p.rage = p.fury; // Simmering Rage: кубы ярости по уровню ярости, прошлые сгорают
      }
      s.first = ev.first;
      s.activeSeat = ev.first;
      s.turnIndex = 0;
      s.step = 'turn';
      break;
    }

    case 'plan-scored': {
      const e = turn(ev.target);
      if (e) return fail(e);
      if (!own(ev.target)) return fail('Засчитывать можно только свои ПО');
      const allowed = planRowsFor(cat, s.battleplan!, s.round);
      const p = s.players[ev.target];
      const bp = cat.battleplans.find((b) => b.n === s.battleplan)!;
      if (!ev.rows.length) return fail('Отметьте выполненные строки');
      for (const row of ev.rows) {
        if (!allowed.includes(row)) return fail('Эта строка не засчитывается в этом раунде');
        if (p.planScored.some((x) => x.round === s.round && x.row === row)) return fail('Эта строка уже засчитана в этом ходу');
      }
      if (new Set(ev.rows).size !== ev.rows.length) return fail('Строка указана дважды');
      for (const row of ev.rows) p.planScored.push({ round: s.round, row, vp: bp.scoring[row]!.vp });
      break;
    }

    case 'tactic-completed': {
      const e = turn(ev.target);
      if (e) return fail(e);
      if (!own(ev.target)) return fail('Тактики — только свои');
      const p = s.players[ev.target];
      if (s.seized === ev.target && s.turnIndex === 0) return fail('В ход перехвата инициативы боевые тактики не выполняются');
      if (!p.tacticCards.includes(ev.card)) return fail('Этой карты нет среди ваших тактик');
      if (p.tacticsDone.some((t) => t.card === ev.card && t.round === s.round)) return fail('С этой карты в этот ход тактика уже выполнена');
      const next = nextTier(s, ev.target, ev.card, cat);
      if (!next) return fail('Все тактики этой карты выполнены');
      if (next !== ev.tier) return fail('Тактики карты — по порядку: Affray → Strike → Domination');
      p.tacticsDone.push({ card: ev.card, tier: ev.tier, round: s.round });
      break;
    }

    case 'cp-changed': {
      if (s.stage !== 'battle') return fail('CP меняются во время битвы');
      if (!own(ev.target)) return fail('CP можно менять только себе');
      if (!Number.isInteger(ev.delta) || !ev.delta) return fail('Изменение CP — целое число');
      const p = s.players[ev.target];
      if (p.cp + ev.delta < 0) return fail('CP не может стать меньше нуля');
      p.cp += ev.delta;
      break;
    }

    case 'rage-changed': {
      if (s.stage !== 'battle') return fail('Кубы ярости — во время битвы');
      if (!own(ev.target)) return fail('Кубы ярости — только свои');
      const p = s.players[ev.target];
      const dice = p.rage + (ev.dice ?? 0);
      const fury = p.fury + (ev.fury ?? 0);
      if (dice < 0 || fury < 0) return fail('Не может стать меньше нуля');
      p.rage = dice;
      p.fury = fury;
      break;
    }

    case 'vp-adjusted': {
      if (s.stage === 'setup') return fail('ПО поправляются во время битвы');
      if (!own(ev.target)) return fail('Поправлять можно только свои ПО');
      if (!Number.isInteger(ev.delta) || !ev.delta) return fail('Поправка — целое число');
      if (!ev.note.trim()) return fail('Укажите причину поправки');
      s.players[ev.target].vpAdjust.push({ delta: ev.delta, note: ev.note.trim(), round: s.round });
      break;
    }

    case 'turn-ended': {
      const e = turn();
      if (e) return fail(e);
      if (s.turnIndex === 0) {
        s.activeSeat = otherSeat(s.activeSeat!);
        s.turnIndex = 1;
        break;
      }
      if (s.round >= cat.rounds) {
        s.stage = 'finished';
        s.endReason = 'rounds';
        s.activeSeat = null;
        break;
      }
      s.prevFirst = s.first;
      s.first = null;
      s.activeSeat = null;
      s.seized = null;
      s.round += 1;
      s.step = 'priority';
      s.turnIndex = 0;
      break;
    }

    case 'battle-ended': {
      if (s.stage !== 'battle') return fail('Битва не идёт');
      if (ev.reason === 'concede' && (!ev.by || !SEATS.includes(ev.by))) return fail('Укажите, кто сдался');
      if (ev.reason === 'concede' && ev.seat !== null && ev.seat !== ev.by) return fail('Сдаться можно только за себя');
      if (ev.reason === 'manual' && ev.by) return fail('Окончание по договорённости — без сдавшегося');
      s.stage = 'finished';
      s.endReason = ev.reason;
      s.concededBy = ev.reason === 'concede' ? ev.by! : null;
      s.activeSeat = null;
      break;
    }

    case 'event-reverted':
      return fail('Отмена обрабатывается при проигрывании журнала');
  }
  return { ok: true, state: s };
}

/** Проиграть журнал; отмена — стек (как у 40K): снимается последнее действующее событие, своё или общее. */
export function replayAos(events: readonly AosGameEvent[], cat: AosCatalog): ApplyResult & { seq?: number } {
  if (!events.length) return fail('Журнал пуст');
  const first = createAosGame(events[0]!);
  if (!first.ok) return { ...first, seq: events[0]!.seq };
  const ids = new Set([events[0]!.id]);
  const stack: { ev: AosGameEvent; state: AosGameState }[] = [{ ev: events[0]!, state: first.state }];
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
    const res = applyAosEvent(state, ev, cat);
    if (!res.ok) return { ...res, seq: ev.seq };
    state = res.state;
    stack.push({ ev, state });
  }
  return { ok: true, state };
}

/** Что снимет следующая отмена (null — нечего). */
export function aosUndoTarget(events: readonly AosGameEvent[], seat: Seat | null = null): AosGameEvent | null {
  const active: AosGameEvent[] = [];
  for (const ev of events) {
    if (ev.type === 'event-reverted') active.pop();
    else active.push(ev);
  }
  const top = active.length > 1 ? active.at(-1)! : null;
  if (!top) return null;
  return seat === null || top.seat === null || top.seat === seat ? top : null;
}
