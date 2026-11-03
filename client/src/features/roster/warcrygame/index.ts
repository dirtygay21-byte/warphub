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

export interface WcPlayer {
  name: string;
  rosterId: string;
  fighters: string[];
  groups: Record<string, Group>;
  color: Color;
  score: number;
  wildSaved: number;
  singles: number;
  abilityRank: Rank | null;
  activations: string[];
  abilities: string[];
  reserves: string[];
}
export interface WcState {
  system: 'warcry';
  stage: Stage;
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
  winner: Seat | 'draw' | null;
}
export type WcEventBody =
  | { type: 'game-created'; schema: number; seed: string; game?: 'warcry'; names: Record<Seat, string> }
  | { type: 'setup'; deploymentId: string; victoryId: string; twistId?: string | null; matchedPlay: boolean; attacker: Seat; rosters: Record<Seat, { id: string; color: Color; fighters: string[]; groups: Record<string, Group> }> }
  | { type: 'initiative'; wild?: Partial<Record<Seat, { singles?: number; improve?: number; save?: number }>> }
  | { type: 'activate'; seat: Seat; fighterId: string }
  | { type: 'ability'; seat: Seat; fighterId: string; rank: Rank; name: string }
  | { type: 'reserve'; seat: Seat; group: Group }
  | { type: 'score'; seat: Seat; points: number }
  | { type: 'end-round' }
  | { type: 'finish' }
  | { type: 'event-reverted' };
export type WcEvent = WcEventBody & { id: string; seq: number; at: string; seat?: Seat | null };
export type ApplyResult = { ok: true; state: WcState } | { ok: false; error: string; state: WcState | null };

const fail = (state: WcState, error: string): ApplyResult => ({ ok: false, error, state });
const player = (name: string): WcPlayer => ({ name, rosterId: '', fighters: [], groups: {}, color: 'red', score: 0, wildSaved: 0, singles: 0, abilityRank: null, activations: [], abilities: [], reserves: [] });
const singlesOf = (dice: number[]) => dice.filter((value, i, all) => all.indexOf(value) === i && all.lastIndexOf(value) === i).length;
const abilityOf = (dice: number[]): Rank | null => {
  const counts = new Map<number, number>();
  dice.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const countsWithoutSingles = [...counts.values()].filter((n) => n > 1);
  if (!countsWithoutSingles.length) return null;
  return Math.min(4, Math.max(...countsWithoutSingles)) as Rank;
};
const deploymentOf = (data: WarcryGameData, id: string) => data.deployments.find((d) => d.id === id);
const victoryOf = (data: WarcryGameData, id: string) => [...data.victories.tableA, ...data.victories.tableB].find((v) => v.id === id);

export function createWarcryState(ev: Extract<WcEventBody, { type: 'game-created' }>): WcState | null {
  if (ev.schema !== WARCRY_GAME_SCHEMA || (ev.game && ev.game !== 'warcry')) return null;
  return { system: 'warcry', stage: 'setup', seed: ev.seed, players: { p1: player(ev.names.p1), p2: player(ev.names.p2) }, deploymentId: '', victoryId: '', twistId: null, matchedPlay: true, attacker: 'p1', round: 1, endRound: null, initiative: 'p1', initiativeDice: null, winner: null };
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
      if (!deploymentOf(data, ev.deploymentId) || !victory) return fail(s, 'Неверный battleplan');
      if (!ev.matchedPlay && ev.twistId && !data.twists.some((t) => t.id === ev.twistId)) return fail(s, 'Неизвестный twist');
      for (const seat of SEATS) {
        const r = ev.rosters[seat];
        if (!r.id || !r.fighters.length) return fail(s, `${seat}: ростер не выбран или пуст`);
        const p = s.players[seat];
        p.rosterId = r.id; p.fighters = [...new Set(r.fighters)]; p.groups = { ...r.groups }; p.color = r.color;
        const deployment = deploymentOf(data, ev.deploymentId)!;
        p.reserves = deployment.points.filter((point) => point.side === p.color && point.reserve != null).flatMap((point) => p.fighters.filter((fighterId) => r.groups[fighterId] === point.group));
      }
      if (s.players.p1.color === s.players.p2.color) return fail(s, 'Игроки должны выбрать разные цвета');
      s.deploymentId = ev.deploymentId; s.victoryId = ev.victoryId; s.twistId = ev.matchedPlay ? null : (ev.twistId ?? null); s.matchedPlay = ev.matchedPlay; s.attacker = ev.attacker; s.endRound = victory.endRound; s.stage = 'battle';
      return { ok: true, state: s };
    }
    case 'initiative': {
      if (s.stage !== 'battle' || s.initiativeDice) return fail(s, 'Инициатива в этом раунде уже определена');
      const dice: Record<Seat, number[]> = { p1: [], p2: [] };
      const baseSingles: Record<Seat, number> = { p1: 0, p2: 0 };
      const baseWinner = rollOff(s.seed, `warcry-initiative-tie-${s.round}`, 0).winner;
      for (const seat of SEATS) {
        dice[seat] = Array.from({ length: 6 }, (_, i) => pickIndex(makeRng(s.seed, 'warcry-initiative', s.round, seat, i), 6) + 1);
        baseSingles[seat] = singlesOf(dice[seat]);
      }
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
      s.initiative = winner; s.initiativeDice = dice;
      return { ok: true, state: s };
    }
    case 'activate': {
      if (s.stage !== 'battle' || !s.initiativeDice) return fail(s, 'Сначала определите инициативу');
      const p = s.players[ev.seat];
      if (!p.fighters.includes(ev.fighterId)) return fail(s, 'Этого бойца нет в варбанде');
      if (p.activations.includes(ev.fighterId)) return fail(s, 'Боец уже активирован в этом раунде');
      if (p.reserves.includes(ev.fighterId)) return fail(s, 'Боец ещё в резерве');
      p.activations.push(ev.fighterId);
      return { ok: true, state: s };
    }
    case 'ability': {
      if (s.stage !== 'battle') return fail(s, 'Битва не идёт');
      const p = s.players[ev.seat];
      if (!p.fighters.includes(ev.fighterId)) return fail(s, 'Этого бойца нет в варбанде');
      if (!p.abilityRank || p.abilityRank > ev.rank) return fail(s, `Нужен ability dice ${ev.rank}`);
      if (p.abilities.includes(ev.fighterId)) return fail(s, 'Боец уже использовал способность в этой активации');
      p.abilities.push(ev.fighterId);
      return { ok: true, state: s };
    }
    case 'reserve': {
      if (s.stage !== 'battle' || s.round < 2) return fail(s, 'Резервы прибывают после первого раунда');
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
      if (s.stage !== 'battle' || !Number.isInteger(ev.points) || ev.points < 0 || ev.points > 100) return fail(s, 'Некорректный счёт');
      s.players[ev.seat].score += ev.points;
      return { ok: true, state: s };
    }
    case 'end-round': {
      if (s.stage !== 'battle') return fail(s, 'Битва не идёт');
      for (const seat of SEATS) {
        const p = s.players[seat]; p.activations = []; p.abilities = []; p.singles = 0; p.abilityRank = null;
      }
      s.initiativeDice = null;
      s.round++;
      return { ok: true, state: s };
    }
    case 'finish': {
      if (s.stage !== 'battle') return fail(s, 'Битва уже завершена');
      const p1 = s.players.p1.score, p2 = s.players.p2.score;
      s.winner = p1 === p2 ? 'draw' : p1 > p2 ? 'p1' : 'p2'; s.stage = 'finished';
      return { ok: true, state: s };
    }
  }
}
export const GROUP_LABEL: Record<Group, string> = { dagger: 'Dagger', shield: 'Shield', hammer: 'Hammer' };
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
