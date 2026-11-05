import type { WarcryGameData } from '../skirmish/types';
import { makeRng, pickIndex, rollOff } from '../game/rng';

export const WARCRY_GAME_SCHEMA = 2;
export type Seat = 'p1' | 'p2';
export const SEATS: Seat[] = ['p1', 'p2'];
export const other = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');
export type Color = 'red' | 'blue';
export type Group = 'dagger' | 'shield' | 'hammer';
export type Rank = 2 | 3 | 4;
export type Stage = 'setup' | 'battle' | 'finished';
export type WcAction = 'move' | 'attack' | 'disengage' | 'wait';
export type WcAbilityCost = 'double' | 'triple' | 'quad' | 'reaction' | 'passive';
export type WcAbilityRef = { id: string; cost: WcAbilityCost };
export type WcFighterInfo = { name: string; factionId: string; fighterId: string; abilities: WcAbilityRef[] };
export type WcRosterSetup = { id: string; color: Color; fighters: string[]; groups: Record<string, Group>; fighterData?: Record<string, WcFighterInfo> };
export type WcAbilityDie = { value: number; rank: Rank; used: boolean };
export type WcWildImprove = { from: 1 | 2 | 3; value: number };
export type WcActivation = { actions: WcAction[]; abilityId?: string; diceIndex?: number; abilityAfter?: 0 | 1 | 2 };

export interface WcPlayer {
  name: string;
  rosterId: string;
  fighters: string[];
  fighterData: Record<string, WcFighterInfo>;
  groups: Record<string, Group>;
  color: Color;
  score: number;
  wildSaved: number;
  singles: number;
  abilityRank: Rank | null;
  dice: WcAbilityDie[];
  activations: string[];
  activationLog: Record<string, WcActivation>;
  abilities: string[];
  reactions: string[];
  reserves: string[];
}
export interface WcState {
  system: 'warcry';
  stage: Stage;
  phase: 'initiative' | 'reserve' | 'combat';
  seed: string;
  players: Record<Seat, WcPlayer>;
  deploymentId: string;
  victoryId: string;
  twistId: string | null;
  matchedPlay: boolean;
  attacker: Seat;
  round: number;
  endRound: number | null;
  initiative: Seat;
  initiativeDice: Record<Seat, number[]> | null;
  baseSingles: Record<Seat, number> | null;
  baseTie: boolean;
  wildDeclared: Record<Seat, boolean>;
  turn: Seat | null;
  sequenced: boolean;
  passes: number;
  activationSerial: number;
  lastActivation: Seat | null;
  winner: Seat | 'draw' | null;
}
export type WcEventBody =
  | { type: 'game-created'; schema: number; seed: string; game?: 'warcry'; names: Record<Seat, string> }
  | { type: 'setup'; deploymentId: string; victoryId: string; twistId?: string | null; matchedPlay: boolean; attacker: Seat; rosters: Record<Seat, WcRosterSetup> }
  | { type: 'player-set'; seat: Seat; roster: WcRosterSetup }
  | { type: 'initiative-roll' }
  | { type: 'wild-set'; seat: Seat; singles: number; save: number; improve: WcWildImprove[] }
  | { type: 'initiative'; wild?: Partial<Record<Seat, { singles?: number; improve?: number; save?: number }>> }
  | { type: 'phase-advanced'; first?: Seat }
  | { type: 'activate'; seat: Seat; fighterId: string; actions?: [WcAction, WcAction]; abilityId?: string; diceIndex?: number; abilityAfter?: 0 | 1 | 2 }
  | { type: 'ability'; seat: Seat; fighterId: string; rank: Rank; name: string }
  | { type: 'reaction'; seat: Seat; fighterId: string; abilityId: string }
  | { type: 'pass'; seat: Seat }
  | { type: 'reserve'; seat: Seat; group: Group }
  | { type: 'score'; seat: Seat; points: number; note?: string }
  | { type: 'end-round' }
  | { type: 'finish' }
  | { type: 'event-reverted' };
export type WcEvent = WcEventBody & { id: string; seq: number; at: string; seat?: Seat | null };
export type ApplyResult = { ok: true; state: WcState } | { ok: false; error: string; state: WcState | null };

const fail = (state: WcState, error: string): ApplyResult => ({ ok: false, error, state });
const player = (name: string): WcPlayer => ({ name, rosterId: '', fighters: [], fighterData: {}, groups: {}, color: 'red', score: 0, wildSaved: 0, singles: 0, abilityRank: null, dice: [], activations: [], activationLog: {}, abilities: [], reactions: [], reserves: [] });
const singlesOf = (dice: number[]) => dice.filter((value, i, all) => all.indexOf(value) === i && all.lastIndexOf(value) === i).length;
const abilityOf = (dice: number[]): Rank | null => {
  const counts = new Map<number, number>();
  dice.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const ranks = [...counts.values()].filter((n) => n > 1);
  return ranks.length ? Math.min(4, Math.max(...ranks)) as Rank : null;
};
const groupedDice = (dice: number[]): WcAbilityDie[] => {
  const counts = new Map<number, number>();
  dice.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, rank: Math.min(4, count) as Rank, used: false }));
};
const maxRank = (dice: WcAbilityDie[]): Rank | null => dice.length ? Math.max(...dice.map((die) => die.rank)) as Rank : null;
const costRank = (cost: WcAbilityCost): Rank | null => cost === 'double' ? 2 : cost === 'triple' ? 3 : cost === 'quad' ? 4 : null;
const deploymentOf = (data: WarcryGameData, id: string) => data.deployments.find((d) => d.id === id);
const victoryOf = (data: WarcryGameData, id: string) => [...data.victories.tableA, ...data.victories.tableB].find((v) => v.id === id);
const reserveFighters = (deployment: WarcryGameData['deployments'][number], roster: WcRosterSetup) => deployment.points.filter((point) => point.side === roster.color && point.reserve != null).flatMap((point) => roster.fighters.filter((fighterId) => roster.groups[fighterId] === point.group));
const validateRoster = (roster: WcRosterSetup): string | null => {
  if (!roster.id || !roster.fighters.length) return 'ростер не выбран или пуст';
  if (new Set(roster.fighters).size !== roster.fighters.length) return 'один и тот же боец добавлен дважды';
  if (roster.fighters.some((id) => !roster.groups[id])) return 'не все бойцы распределены по группам';
  if (roster.fighterData && roster.fighters.some((id) => !roster.fighterData?.[id])) return 'не все данные бойцов загружены';
  return null;
};
const setRoster = (p: WcPlayer, roster: WcRosterSetup, deployment: WarcryGameData['deployments'][number]) => {
  p.rosterId = roster.id;
  p.fighters = [...roster.fighters];
  p.fighterData = roster.fighterData ? structuredClone(roster.fighterData) : {};
  p.groups = { ...roster.groups };
  p.color = roster.color;
  p.reserves = reserveFighters(deployment, roster);
};
const rollDice = (state: WcState): Record<Seat, number[]> => Object.fromEntries(SEATS.map((seat) => [seat, Array.from({ length: 6 }, (_, i) => pickIndex(makeRng(state.seed, 'warcry-initiative', state.round, seat, i), 6) + 1)])) as Record<Seat, number[]>;

export function createWarcryState(ev: Extract<WcEventBody, { type: 'game-created' }>): WcState | null {
  if (ev.schema !== WARCRY_GAME_SCHEMA || (ev.game && ev.game !== 'warcry')) return null;
  return { system: 'warcry', stage: 'setup', phase: 'initiative', seed: ev.seed, players: { p1: player(ev.names.p1), p2: player(ev.names.p2) }, deploymentId: '', victoryId: '', twistId: null, matchedPlay: true, attacker: 'p1', round: 1, endRound: null, initiative: 'p1', initiativeDice: null, baseSingles: null, baseTie: false, wildDeclared: { p1: false, p2: false }, turn: null, sequenced: false, passes: 0, activationSerial: 0, lastActivation: null, winner: null };
}

export function applyWarcryEvent(current: WcState | null, ev: WcEvent, data: WarcryGameData): ApplyResult {
  if (ev.type === 'game-created') {
    const state = createWarcryState(ev);
    return state ? { ok: true, state } : { ok: false, error: 'Несовместимая версия журнала Warcry', state: null };
  }
  if (!current) return { ok: false, error: 'Партия ещё не создана', state: null };
  const s = structuredClone(current);
  if (ev.type === 'event-reverted') return fail(s, 'Отмена обрабатывается при проигрывании журнала');
  switch (ev.type) {
    case 'setup': {
      if (s.stage !== 'setup') return fail(s, 'Подготовка уже завершена');
      const victory = victoryOf(data, ev.victoryId);
      const deployment = deploymentOf(data, ev.deploymentId);
      if (!deployment || !victory) return fail(s, 'Неверный battleplan');
      if (!ev.matchedPlay && ev.twistId && !data.twists.some((t) => t.id === ev.twistId)) return fail(s, 'Неизвестный twist');
      for (const seat of SEATS) {
        const error = validateRoster(ev.rosters[seat]);
        if (error) return fail(s, `${seat}: ${error}`);
        setRoster(s.players[seat], ev.rosters[seat], deployment);
      }
      if (s.players.p1.color === s.players.p2.color) return fail(s, 'Игроки должны выбрать разные цвета');
      s.deploymentId = ev.deploymentId; s.victoryId = ev.victoryId; s.twistId = ev.matchedPlay ? null : (ev.twistId ?? null); s.matchedPlay = ev.matchedPlay; s.attacker = ev.attacker; s.endRound = victory.endRound; s.stage = 'battle';
      return { ok: true, state: s };
    }
    case 'player-set': {
      if (s.stage !== 'battle' || s.round !== 1 || s.phase !== 'initiative' || s.initiativeDice) return fail(s, 'Ростер меняется только до первой инициативы');
      const error = validateRoster(ev.roster);
      if (error) return fail(s, error);
      const p = s.players[ev.seat];
      if (ev.roster.color !== p.color) return fail(s, 'Цвет стороны выбирается в общей подготовке');
      setRoster(p, ev.roster, deploymentOf(data, s.deploymentId)!);
      return { ok: true, state: s };
    }
    case 'initiative-roll': {
      if (s.stage !== 'battle' || s.phase !== 'initiative' || s.initiativeDice) return fail(s, 'Инициатива в этом раунде уже определена');
      const dice = rollDice(s);
      const baseSingles = { p1: singlesOf(dice.p1), p2: singlesOf(dice.p2) };
      const baseTie = baseSingles.p1 === baseSingles.p2;
      const baseWinner = rollOff(s.seed, `warcry-initiative-tie-${s.round}`, 0).winner;
      for (const seat of SEATS) {
        const p = s.players[seat];
        p.singles = baseSingles[seat];
        p.dice = groupedDice(dice[seat]);
        p.abilityRank = maxRank(p.dice);
        s.wildDeclared[seat] = false;
      }
      s.initiativeDice = dice;
      s.baseSingles = baseSingles;
      s.baseTie = baseTie;
      s.initiative = baseTie ? baseWinner : baseSingles.p1 > baseSingles.p2 ? 'p1' : 'p2';
      return { ok: true, state: s };
    }
    case 'wild-set': {
      if (s.stage !== 'battle' || s.phase !== 'initiative' || !s.initiativeDice || !s.baseSingles) return fail(s, 'Сначала бросьте initiative dice');
      const expected = !s.wildDeclared.p1 && !s.wildDeclared.p2 ? s.initiative : other(s.initiative);
      if (ev.seat !== expected || s.wildDeclared[ev.seat]) return fail(s, `${expected === 'p1' ? 'Игрок 1' : 'Игрок 2'} должен объявить wild dice следующим`);
      const p = s.players[ev.seat];
      const total = 1 + p.wildSaved;
      const targets = new Set<string>();
      if (!Number.isInteger(ev.singles) || !Number.isInteger(ev.save) || ev.singles < 0 || ev.save < 0 || ev.singles + ev.save + ev.improve.length !== total) return fail(s, `${p.name}: распределите все ${total} wild dice`);
      for (const improvement of ev.improve) {
        if (!Number.isInteger(improvement.value) || improvement.value < 1 || improvement.value > 6) return fail(s, 'Неверное значение ability dice');
        const key = `${improvement.from}:${improvement.value}`;
        if (targets.has(key)) return fail(s, 'Один и тот же кубик нельзя улучшать дважды');
        targets.add(key);
        if (improvement.from === 1) {
          if (s.initiativeDice[ev.seat].filter((value) => value === improvement.value).length !== 1 || p.singles < 1) return fail(s, `Single ${improvement.value} недоступен`);
          p.singles -= 1;
          p.dice.push({ value: improvement.value, rank: 2, used: false });
        } else {
          const die = p.dice.find((item) => item.value === improvement.value && item.rank === improvement.from);
          if (!die) return fail(s, `${improvement.from === 2 ? 'Double' : 'Triple'} ${improvement.value} недоступен`);
          die.rank = (die.rank + 1) as Rank;
        }
      }
      p.singles += ev.singles;
      p.wildSaved = ev.save;
      p.abilityRank = maxRank(p.dice);
      s.wildDeclared[ev.seat] = true;
      if (s.wildDeclared.p1 && s.wildDeclared.p2) {
        if (s.players.p1.singles === s.players.p2.singles) s.initiative = s.baseTie ? s.initiative : rollOff(s.seed, `warcry-wild-tie-${s.round}`, 0).winner;
        else s.initiative = s.players.p1.singles > s.players.p2.singles ? 'p1' : 'p2';
        s.phase = 'reserve';
      }
      return { ok: true, state: s };
    }
    case 'initiative': {
      // Журналы первой версии: бросок и простое распределение wild dice одним событием.
      if (s.stage !== 'battle' || s.initiativeDice) return fail(s, 'Инициатива в этом раунде уже определена');
      const dice = rollDice(s);
      const baseSingles: Record<Seat, number> = { p1: 0, p2: 0 };
      const baseWinner = rollOff(s.seed, `warcry-initiative-tie-${s.round}`, 0).winner;
      for (const seat of SEATS) baseSingles[seat] = singlesOf(dice[seat]);
      let winner: Seat = baseSingles.p1 === baseSingles.p2 ? baseWinner : baseSingles.p1 > baseSingles.p2 ? 'p1' : 'p2';
      for (const seat of SEATS) {
        const p = s.players[seat];
        const wild = ev.wild?.[seat] ?? {};
        const total = 1 + p.wildSaved;
        const save = wild.save ?? 0, singles = wild.singles ?? 0, improve = wild.improve ?? 0;
        if (save < 0 || singles < 0 || improve < 0 || improve > 3 || save + singles + improve > total) return fail(s, `${p.name}: неправильное число wild dice`);
        let rank = abilityOf(dice[seat]);
        if (improve > 0) rank = Math.min(4, (rank ?? 1) + improve) as Rank;
        p.abilityRank = rank;
        p.singles = baseSingles[seat] + singles;
        p.wildSaved = save;
      }
      if (s.players.p1.singles !== s.players.p2.singles) winner = s.players.p1.singles > s.players.p2.singles ? 'p1' : 'p2';
      s.initiative = winner; s.initiativeDice = dice; s.baseSingles = baseSingles; s.baseTie = baseSingles.p1 === baseSingles.p2; s.wildDeclared = { p1: true, p2: true }; s.phase = 'reserve';
      return { ok: true, state: s };
    }
    case 'phase-advanced': {
      if (s.stage !== 'battle' || !s.initiativeDice) return fail(s, 'Сначала определите инициативу');
      if (s.phase !== 'reserve') return fail(s, 'Combat phase уже началась');
      s.phase = 'combat';
      s.turn = ev.first ?? null;
      if (ev.first) s.sequenced = true;
      s.passes = 0;
      s.lastActivation = null;
      return { ok: true, state: s };
    }
    case 'activate': {
      if (s.stage !== 'battle' || !s.initiativeDice || s.phase !== 'combat') return fail(s, 'Активации выполняются в Combat phase');
      if (s.turn && ev.seat !== s.turn) return fail(s, `Сейчас очередь ${s.turn === 'p1' ? 'игрока 1' : 'игрока 2'}`);
      const p = s.players[ev.seat];
      if (!p.fighters.includes(ev.fighterId)) return fail(s, 'Этого бойца нет в варбанде');
      if (p.activations.includes(ev.fighterId)) return fail(s, 'Боец уже активирован в этом раунде');
      if (p.reserves.includes(ev.fighterId)) return fail(s, 'Боец ещё в резерве');
      if (ev.actions) {
        const info = p.fighterData[ev.fighterId];
        if (!info) return fail(s, 'Данные бойца не загружены');
        const log: WcActivation = { actions: [...ev.actions] };
        if (ev.abilityId) {
          const ability = info.abilities.find((item) => item.id === ev.abilityId);
          const required = ability ? costRank(ability.cost) : null;
          if (!ability || !required) return fail(s, 'Эта способность недоступна во время активации');
          if (ev.diceIndex == null || !Number.isInteger(ev.diceIndex)) return fail(s, 'Выберите ability dice');
          const die = p.dice[ev.diceIndex];
          if (!die || die.used) return fail(s, 'Ability dice уже использован');
          if (die.rank < required) return fail(s, `Нужен ability dice ${required}`);
          if (ev.abilityAfter != null && ![0, 1, 2].includes(ev.abilityAfter)) return fail(s, 'Неверный момент способности');
          die.used = true;
          log.abilityId = ev.abilityId; log.diceIndex = ev.diceIndex; log.abilityAfter = ev.abilityAfter ?? 0;
          p.abilityRank = maxRank(p.dice.filter((item) => !item.used));
        }
        p.activationLog[ev.fighterId] = log;
      }
      p.activations.push(ev.fighterId);
      s.activationSerial += 1;
      s.lastActivation = ev.seat;
      if (s.turn) { s.turn = other(ev.seat); s.passes = 0; }
      return { ok: true, state: s };
    }
    case 'ability': {
      if (s.stage !== 'battle' || s.phase !== 'combat') return fail(s, 'Способности используются в Combat phase');
      if (s.turn && ev.seat !== s.turn) return fail(s, 'Способность используется во время своей активации');
      const p = s.players[ev.seat];
      if (!p.fighters.includes(ev.fighterId)) return fail(s, 'Этого бойца нет в варбанде');
      if (!p.abilityRank || p.abilityRank > ev.rank) return fail(s, `Нужен ability dice ${ev.rank}`);
      if (p.abilities.includes(ev.fighterId)) return fail(s, 'Боец уже использовал способность в этой активации');
      p.abilities.push(ev.fighterId);
      return { ok: true, state: s };
    }
    case 'reaction': {
      if (s.stage !== 'battle' || s.phase !== 'combat' || !s.lastActivation || !s.turn) return fail(s, 'Реакция доступна только во время активации соперника');
      if (ev.seat !== s.turn || ev.seat === s.lastActivation) return fail(s, 'Реакция выполняется соперником активного бойца');
      const p = s.players[ev.seat];
      const info = p.fighterData[ev.fighterId];
      if (!p.fighters.includes(ev.fighterId) || !info) return fail(s, 'Этого бойца нет в варбанде');
      if (p.reserves.includes(ev.fighterId)) return fail(s, 'Боец ещё в резерве');
      if (!info.abilities.some((ability) => ability.id === ev.abilityId && ability.cost === 'reaction')) return fail(s, 'Эта реакция недоступна бойцу');
      const key = `${s.activationSerial}:${ev.fighterId}`;
      if (p.reactions.includes(key)) return fail(s, 'Боец уже использовал реакцию в этой активации соперника');
      p.reactions.push(key);
      return { ok: true, state: s };
    }
    case 'pass': {
      if (s.stage !== 'battle' || s.phase !== 'combat' || !s.turn) return fail(s, 'Пас доступен только в пошаговой Combat phase');
      if (ev.seat !== s.turn) return fail(s, `Сейчас очередь ${s.turn === 'p1' ? 'игрока 1' : 'игрока 2'}`);
      const p = s.players[ev.seat];
      if (p.fighters.some((fighterId) => !p.activations.includes(fighterId) && !p.reserves.includes(fighterId))) return fail(s, 'Сначала активируйте доступного бойца — пас возможен только когда активировать некого');
      s.passes += 1;
      s.turn = other(ev.seat);
      s.lastActivation = null;
      return { ok: true, state: s };
    }
    case 'reserve': {
      if (s.stage !== 'battle' || s.round < 2 || s.phase !== 'reserve') return fail(s, 'Резервы прибывают в Reserve phase после первого раунда');
      const p = s.players[ev.seat];
      const deployment = deploymentOf(data, s.deploymentId)!;
      const point = deployment.points.find((x) => x.side === p.color && x.group === ev.group);
      if (!point || point.reserve !== s.round) return fail(s, `${GROUP_LABEL[ev.group]} не прибывает в этом раунде`);
      const key = `${p.color}:${ev.group}`;
      if (p.reserves.includes(key)) return fail(s, 'Эта группа уже прибыла');
      p.reserves = p.reserves.filter((fighterId) => p.groups[fighterId] !== ev.group);
      p.reserves.push(key);
      return { ok: true, state: s };
    }
    case 'score': {
      if (s.stage !== 'battle' || s.phase !== 'combat' || !Number.isInteger(ev.points) || ev.points < 0 || ev.points > 100) return fail(s, 'Счёт записывается в Combat phase');
      s.players[ev.seat].score += ev.points;
      return { ok: true, state: s };
    }
    case 'end-round': {
      if (s.stage !== 'battle' || s.phase !== 'combat') return fail(s, 'Сначала завершите Combat phase');
      if (s.turn && s.passes < 2) return fail(s, 'Combat phase заканчивается после двух последовательных пасов');
      for (const seat of SEATS) {
        const p = s.players[seat];
        p.activations = []; p.activationLog = {}; p.abilities = []; p.reactions = []; p.singles = 0; p.abilityRank = null; p.dice = [];
        s.wildDeclared[seat] = false;
      }
      s.initiativeDice = null; s.baseSingles = null; s.baseTie = false; s.turn = null; s.passes = 0; s.activationSerial = 0; s.lastActivation = null;
      s.phase = 'initiative';
      s.round++;
      return { ok: true, state: s };
    }
    case 'finish': {
      if (s.stage !== 'battle' || (s.endRound ? s.sequenced && s.round <= s.endRound : s.phase !== 'combat')) return fail(s, 'Завершение определяется выбранным victory condition');
      const p1 = s.players.p1.score, p2 = s.players.p2.score;
      s.winner = p1 === p2 ? 'draw' : p1 > p2 ? 'p1' : 'p2'; s.stage = 'finished';
      return { ok: true, state: s };
    }
  }
}
export const GROUP_LABEL: Record<Group, string> = { dagger: 'Dagger', shield: 'Shield', hammer: 'Hammer' };
export const ACTION_LABEL: Record<WcAction, string> = { move: 'Move', attack: 'Attack', disengage: 'Disengage', wait: 'Wait' };
export function replayWarcry(events: WcEvent[], data: WarcryGameData): { ok: true; state: WcState | null } | { ok: false; error: string; seq: number } {
  let state: WcState | null = null;
  const undo: { state: WcState | null }[] = [];
  for (const ev of events) {
    if (ev.type === 'event-reverted') {
      const previous = undo.pop();
      if (!previous) return { ok: false, error: 'Нет действия для отмены', seq: ev.seq };
      state = previous.state;
      continue;
    }
    undo.push({ state: state ? structuredClone(state) : null });
    const applied = applyWarcryEvent(state, ev, data);
    if (!applied.ok) return { ok: false, error: applied.error, seq: ev.seq };
    state = applied.state;
  }
  return { ok: true, state };
}
export function warcryUndoTarget(events: WcEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.type !== 'event-reverted' && events[i]!.type !== 'game-created') return events[i]!.seq;
  return null;
}
