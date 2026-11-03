import type { KtGameData } from '../skirmish/types';
import { makeRng, pickIndex } from '../game/rng';

export const KT_GAME_SCHEMA = 2;
export type Seat = 'p1' | 'p2';
export const SEATS: Seat[] = ['p1', 'p2'];
export const other = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');
export type Op = 'crit' | 'kill' | 'tac';
export type Stage = 'setup' | 'battle' | 'finished';

export interface KtPlayer {
  name: string;
  rosterId: string;
  startingOperatives: number;
  tacOp: string;
  primaryOp: Op | null;
  cp: number;
  critVp: number;
  killVp: number;
  tacVp: number;
  killGrade: number;
  incapacitated: number;
  rerollCard: boolean;
  initiativeCards: number[];
  bonusVp: number;
}

export interface KtState {
  system: 'kt';
  stage: Stage;
  seed: string;
  players: Record<Seat, KtPlayer>;
  missionId: string;
  killzone: string;
  map: number;
  round: number;
  initiative: Seat;
  initiativeRolls: Record<Seat, number> | null;
  secured: Record<string, Seat>;
  transmitting: Record<string, Seat>;
  looted: Record<string, number>;
  downloaded: string[];
  orbMarker: string;
  data: Record<string, number>;
  compiled: Record<Seat, number>;
  inert: string | null;
  claimsUsed: Record<Seat, string[]>;
  carrying: Record<string, Seat>;
  routVp: Record<Seat, number>;
  genericTacVp: Record<Seat, number>;
  winner: Seat | 'draw' | null;
}

export type KtEventBody =
  | { type: 'game-created'; schema: number; seed: string; game?: 'kt'; names: Record<Seat, string> }
  | { type: 'setup'; missionId: string; killzone: string; map: number; dropZoneLoser: Seat; rosters: Record<Seat, { id: string; operatives: number; tacOp: string }> }
  | { type: 'initiative'; round: number; attempt: number; cards?: Partial<Record<Seat, { reroll?: boolean; modifier?: number }>> }
  | { type: 'crit-action'; seat: Seat; action: string; marker?: string; target?: string }
  | { type: 'incapacitated'; seat: Seat; wounds: number; within6: boolean; marker?: string }
  | { type: 'tac-score'; seat: Seat; points: 1 | 2 }
  | { type: 'primary-op'; seat: Seat; op: Op }
  | { type: 'cp-adjust'; seat: Seat; delta: number }
  | { type: 'end-round'; controls: Record<string, Seat | null>; carrying?: Record<string, Seat>; claims?: Partial<Record<Seat, { marker: string; control: boolean; uncontested: boolean }>> }
  | { type: 'finish' }
  | { type: 'event-reverted' };
export type KtEvent = KtEventBody & { id: string; seq: number; at: string; seat?: Seat | null };
export type ApplyResult = { ok: true; state: KtState } | { ok: false; error: string; state: KtState | null };

const cap = (n: number) => Math.min(6, Math.max(0, n));
const add = (p: KtPlayer, op: Op, n: number) => {
  if (op === 'crit') p.critVp = cap(p.critVp + n);
  else if (op === 'kill') p.killVp = cap(p.killVp + n);
  else p.tacVp = cap(p.tacVp + n);
};
const count = (controls: Record<string, Seat | null>, seat: Seat, ignore: (id: string) => boolean = () => false) => Object.entries(controls).filter(([id, s]) => s === seat && !ignore(id)).length;
const grade = (data: KtGameData, starting: number, dead: number) => {
  const rows = data.killOp.thresholds;
  const row = rows[String(Math.min(14, Math.max(5, starting)))] ?? rows['5']!;
  let result = 0;
  row.forEach((threshold, i) => { if (dead >= threshold) result = i + 1; });
  return result;
};
const initPlayer = (name: string): KtPlayer => ({ name, rosterId: '', startingOperatives: 0, tacOp: '', primaryOp: null, cp: 2, critVp: 0, killVp: 0, tacVp: 0, killGrade: 0, incapacitated: 0, rerollCard: false, initiativeCards: [], bonusVp: 0 });
const fail = (state: KtState, error: string): ApplyResult => ({ ok: false, error, state });
const roll = (seed: string, round: number, attempt: number, seat: Seat) => pickIndex(makeRng(seed, 'kt-initiative', round, attempt, seat), 6) + 1;

export function createKtState(ev: Extract<KtEventBody, { type: 'game-created' }>): KtState | null {
  if (ev.schema !== KT_GAME_SCHEMA || (ev.game && ev.game !== 'kt')) return null;
  return {
    system: 'kt', stage: 'setup', seed: ev.seed,
    players: { p1: initPlayer(ev.names.p1), p2: initPlayer(ev.names.p2) },
    missionId: '', killzone: '', map: 1, round: 1, initiative: 'p1', initiativeRolls: null, secured: {}, transmitting: {}, looted: {}, downloaded: [], orbMarker: 'centre', data: {}, compiled: { p1: 0, p2: 0 }, inert: null, claimsUsed: { p1: [], p2: [] }, carrying: {}, routVp: { p1: 0, p2: 0 }, genericTacVp: { p1: 0, p2: 0 }, winner: null,
  };
}

export function applyKtEvent(current: KtState | null, ev: KtEvent, data: KtGameData): ApplyResult {
  if (ev.type === 'game-created') {
    const state = createKtState(ev);
    return state ? { ok: true, state } : { ok: false, error: 'Несовместимая версия журнала Kill Team', state: null };
  }
  if (!current) return { ok: false, error: 'Партия ещё не создана', state: null };
  const s = structuredClone(current);
  if (ev.type === 'event-reverted') return fail(s, 'Отмена обрабатывается при проигрывании журнала');

  switch (ev.type) {
    case 'setup': {
      if (s.stage !== 'setup') return fail(s, 'Подготовка уже завершена');
      if (!data.critOps.some((m) => m.id === ev.missionId)) return fail(s, 'Неизвестная миссия');
      if (!data.missionPack.killzones.includes(ev.killzone) || ev.map < 1 || ev.map > data.missionPack.mapsPerKillzone) return fail(s, 'Неверная killzone или карта');
      for (const seat of SEATS) {
        const r = ev.rosters[seat];
        if (!r.id || r.operatives < 1 || !data.tacOps.some((t) => t.id === r.tacOp)) return fail(s, `Игрок ${seat}: ростер или Tac Op не выбран`);
        const p = s.players[seat];
        p.rosterId = r.id; p.startingOperatives = r.operatives; p.tacOp = r.tacOp;
      }
      s.players[ev.dropZoneLoser].rerollCard = true;
      s.missionId = ev.missionId; s.killzone = ev.killzone; s.map = ev.map; s.stage = 'battle';
      return { ok: true, state: s };
    }
    case 'initiative': {
      if (s.stage !== 'battle' || ev.round !== s.round || s.initiativeRolls) return fail(s, 'Инициатива в этом turning point уже определена');
      const rolls: Partial<Record<Seat, number>> = {};
      for (const seat of SEATS) {
        const p = s.players[seat];
        const card = ev.cards?.[seat];
        let value = roll(s.seed, ev.round, ev.attempt, seat);
        if (card?.modifier) {
          if (!p.initiativeCards.includes(Math.abs(card.modifier))) return fail(s, `${p.name}: нет initiative card ${card.modifier}`);
          p.initiativeCards.splice(p.initiativeCards.indexOf(Math.abs(card.modifier)), 1);
          value += card.modifier;
        }
        if (card?.reroll) {
          if (!p.rerollCard) return fail(s, `${p.name}: Re-roll initiative card уже использована`);
          p.rerollCard = false;
          value = roll(s.seed, ev.round, ev.attempt + 1, seat);
        }
        rolls[seat] = value;
      }
      const loser = rolls.p1 === rolls.p2 ? s.initiative : rolls.p1! > rolls.p2! ? 'p2' : 'p1';
      const winner = other(loser);
      s.initiative = winner;
      if (s.round < data.game.turningPoints) s.players[loser].initiativeCards.push(s.round);
      s.initiativeRolls = { p1: rolls.p1!, p2: rolls.p2! };
      return { ok: true, state: s };
    }
    case 'primary-op': {
      if (s.stage !== 'battle' || s.round !== 1) return fail(s, 'Primary op выбирается в первом turning point');
      s.players[ev.seat].primaryOp = ev.op;
      return { ok: true, state: s };
    }
    case 'cp-adjust': {
      if (s.stage !== 'battle' || !Number.isInteger(ev.delta)) return fail(s, 'CP сейчас изменить нельзя');
      const p = s.players[ev.seat];
      if (p.cp + ev.delta < 0) return fail(s, 'Недостаточно CP');
      p.cp += ev.delta;
      return { ok: true, state: s };
    }
    case 'crit-action': {
      if (s.stage !== 'battle') return fail(s, 'Действие сейчас недоступно');
      const p = s.players[ev.seat];
      const marker = ev.marker ?? 'centre';
      if (s.round === 1 && ev.action !== 'reboot-select') return fail(s, 'Это mission action нельзя выполнить в первом turning point');
      switch (ev.action) {
        case 'secure': if (s.missionId !== 'secure') return fail(s, 'Secure не используется в этой миссии'); s.secured[marker] = ev.seat; break;
        case 'loot': {
          if (s.missionId !== 'loot' || s.round === 1) return fail(s, 'Loot сейчас недоступен');
          const key = `${ev.seat}:${s.round}:${marker}`;
          if (s.looted[key]) return fail(s, 'Этот маркер уже looted в этом turning point');
          if ((s.looted[`${ev.seat}:${s.round}:count`] ?? 0) >= 2) return fail(s, 'Не больше 2VP от Loot за turning point');
          s.looted[key] = 1; s.looted[`${ev.seat}:${s.round}:count`] = (s.looted[`${ev.seat}:${s.round}:count`] ?? 0) + 1; add(p, 'crit', 1); break;
        }
        case 'transmit': if (s.missionId !== 'transmission' || s.round === 1) return fail(s, 'Transmission сейчас недоступен'); s.transmitting[marker] = ev.seat; break;
        case 'orb': if (s.missionId !== 'orb' || s.round === 1 || marker !== s.orbMarker || !ev.target) return fail(s, 'Move Orb сейчас недоступен'); s.orbMarker = ev.target; break;
        case 'download': {
          if (s.missionId !== 'download' || s.round < 3 || s.downloaded.includes(marker)) return fail(s, 'Download сейчас недоступен');
          s.downloaded.push(marker); add(p, 'crit', s.round === 4 ? 2 : 1); break;
        }
        case 'compile': {
          if (s.missionId !== 'data' || s.round === 1) return fail(s, 'Compile Data сейчас недоступен');
          const key = `${s.round}:${marker}`;
          if (s.data[key]) return fail(s, 'Этот маркер уже получил Data point в этом turning point');
          s.data[key] = 1; s.data[marker] = (s.data[marker] ?? 0) + 1; s.compiled[ev.seat]++; break;
        }
        case 'send': {
          if (s.missionId !== 'data' || s.round < 4 || !s.data[marker]) return fail(s, 'Send Data сейчас недоступен');
          add(p, 'crit', s.data[marker]!); s.data[marker] = 0; break;
        }
        case 'reboot': if (s.missionId !== 'reboot' || s.round === 1 || s.inert !== marker) return fail(s, 'Reboot доступен только для inert маркера'); s.inert = null; break;
        case 'reboot-select': {
          if (s.missionId !== 'reboot' || !ev.target) return fail(s, 'Выбор inert недоступен');
          const selected = [marker, ev.target];
          s.inert = selected[0] === selected[1] ? marker : (['1', '2', '3'].find((id) => !selected.includes(id)) ?? null);
          break;
        }
        default: return fail(s, 'Неизвестное mission action');
      }
      return { ok: true, state: s };
    }
    case 'incapacitated': {
      if (s.stage !== 'battle') return fail(s, 'Битва не идёт');
      const p = s.players[ev.seat];
      p.incapacitated++;
      const nextGrade = grade(data, s.players[other(ev.seat)].startingOperatives, p.incapacitated);
      if (nextGrade > p.killGrade) { add(p, 'kill', nextGrade - p.killGrade); p.killGrade = nextGrade; }
      if (p.tacOp === 'rout' && ev.within6 && s.routVp[ev.seat] < 2) {
        const vp = ev.wounds >= 12 ? 2 : 1;
        const actual = Math.min(vp, 2 - s.routVp[ev.seat]);
        s.routVp[ev.seat] += actual; add(p, 'tac', actual);
      }
      return { ok: true, state: s };
    }
    case 'tac-score': {
      if (s.stage !== 'battle' || ev.points < 1 || ev.points > 2) return fail(s, 'Некорректные VP Tac Op');
      if (s.genericTacVp[ev.seat] + ev.points > 2) return fail(s, 'Не больше 2VP от Tac Op за turning point');
      s.genericTacVp[ev.seat] += ev.points; add(s.players[ev.seat], 'tac', ev.points);
      return { ok: true, state: s };
    }
    case 'end-round': {
      if (s.stage !== 'battle') return fail(s, 'Битва не идёт');
      for (const seat of SEATS) {
        const p = s.players[seat], foe = other(seat);
        p.cp += 1;
        if (s.round > 1 && s.initiative !== seat) p.cp += 1;
        if (s.round > 1) {
          if (s.missionId === 'secure') {
            const mine = Object.values(s.secured).filter((x) => x === seat).length, otherCount = Object.values(s.secured).filter((x) => x === foe).length;
            if (mine) add(p, 'crit', 1); if (mine > otherCount) add(p, 'crit', 1);
          } else if (s.missionId === 'transmission') {
            const mine = Object.values(s.transmitting).filter((x) => x === seat).length, otherCount = Object.values(s.transmitting).filter((x) => x === foe).length;
            if (mine) add(p, 'crit', 1); if (mine > otherCount) add(p, 'crit', 1);
          } else if (s.missionId === 'orb') add(p, 'crit', count(ev.controls, seat, (id) => id === s.orbMarker));
          else if (s.missionId === 'stake-claim') {
            if (count(ev.controls, seat) > count(ev.controls, foe)) add(p, 'crit', 1);
            const claim = ev.claims?.[seat];
            if (!claim) return fail(s, `${p.name}: выберите objective marker и claim`);
            if (claim.control === claim.uncontested) return fail(s, `${p.name}: выберите один из двух claims`);
            if (s.claimsUsed[seat].includes(claim.marker)) return fail(s, `${p.name}: этот маркер уже выбирался для claim`);
            s.claimsUsed[seat].push(claim.marker);
            if (claim.control && ev.controls[claim.marker] === seat) add(p, 'crit', 1);
            if (claim.uncontested && ev.controls[claim.marker] !== foe) add(p, 'crit', 1);
          } else if (s.missionId === 'energy-cells' || s.missionId === 'download') {
            const ignore = s.missionId === 'download' ? (id: string) => s.downloaded.includes(id) : () => false;
            if (count(ev.controls, seat, ignore) > count(ev.controls, foe, ignore)) add(p, 'crit', 1);
          } else if (s.missionId === 'data' && (s.round === 2 || s.round === 3) && s.compiled[seat] > s.compiled[foe]) add(p, 'crit', 1);
          else if (s.missionId === 'reboot') add(p, 'crit', count(ev.controls, seat, (id) => id === s.inert));
        }
        s.compiled[seat] = 0; s.genericTacVp[seat] = 0; s.routVp[seat] = 0;
      }
      s.transmitting = {}; s.carrying = ev.carrying ?? {}; s.initiativeRolls = null;
      if (s.round < data.game.turningPoints) s.round++;
      else s.round = data.game.turningPoints + 1;
      return { ok: true, state: s };
    }
    case 'finish': {
      if (s.stage !== 'battle' || s.round <= data.game.turningPoints) return fail(s, 'Сначала завершите четвёртый turning point');
      for (const seat of SEATS) {
        const p = s.players[seat];
        if (s.missionId === 'energy-cells') add(p, 'crit', Object.values(s.carrying).filter((x) => x === seat).length);
        if (p.killGrade > s.players[other(seat)].killGrade) add(p, 'kill', 1);
        if (p.primaryOp) p.bonusVp = Math.ceil((p.primaryOp === 'crit' ? p.critVp : p.primaryOp === 'kill' ? p.killVp : p.tacVp) / 2);
      }
      const p1 = totalKtVp(s, 'p1'), p2 = totalKtVp(s, 'p2');
      s.winner = p1 === p2 ? 'draw' : p1 > p2 ? 'p1' : 'p2'; s.stage = 'finished';
      return { ok: true, state: s };
    }
  }
}

export const totalKtVp = (s: KtState, seat: Seat) => { const p = s.players[seat]; return p.critVp + p.killVp + p.tacVp + p.bonusVp; };
export function replayKt(events: KtEvent[], data: KtGameData): { ok: true; state: KtState | null } | { ok: false; error: string; seq: number } {
  let state: KtState | null = null;
  const undo: { seq: number; state: KtState | null }[] = [];
  for (const ev of events) {
    if (ev.type === 'event-reverted') {
      const previous = undo.pop();
      if (!previous) return { ok: false, error: 'Нет действия для отмены', seq: ev.seq };
      state = previous.state;
      continue;
    }
    undo.push({ seq: ev.seq, state: state ? structuredClone(state) : null });
    const applied = applyKtEvent(state, ev, data);
    if (!applied.ok) return { ok: false, error: applied.error, seq: ev.seq };
    state = applied.state;
  }
  return { ok: true, state };
}
export function ktUndoTarget(events: KtEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.type !== 'event-reverted' && events[i]!.type !== 'game-created') return events[i]!.seq;
  return null;
}
