import { useState } from 'react';
import { aosResult, aosTotals, nextTier, otherSeat, planRowsFor, priorityRoll, SEATS, type Seat } from '../../aosgame';
import { Dice } from '../game/Dice';
import { Button, IconButton } from '../kit';
import { cx } from '../util';
import { BattleplanInfo, TacticCards } from './AosSetup';
import { territoryLabel, TIER_LABEL } from './refs';
import type { AosGameHook } from './useAosGame';
import { DiceModeSwitch, useDiceMode } from '../common/DiceMode';
import { ScoreboardGrid } from '../common/ScoreboardGrid';

/** Трекер битвы AoS: счёт, priority в начале раунда, ресурсы игроков, конец хода (батлплан и тактики), итог. */
export function AosTracker({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const names = { p1: s.players.p1.name, p2: s.players.p2.name };
  return (
    <section className="space-y-3">
      <ScoreboardGrid className="text-center">
        {SEATS.map((seat) => {
          const t = aosTotals(s, seat, bp);
          return (
            <div key={seat} className={cx('rounded-2xl border py-2', s.activeSeat === seat ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}>
              <p className="truncate px-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">
                {names[seat]} · {s.players[seat].role === 'attacker' ? 'атака' : 'защита'}
              </p>
              <p className="font-display text-[30px] font-semibold leading-none tabular-nums">{t.total}</p>
              <p className="mt-0.5 text-[12px] text-fg-3">
                план {t.plan} · тактики {t.tactics}
                {t.adjust ? ` · ±${t.adjust}` : ''}
              </p>
            </div>
          );
        })}
      </ScoreboardGrid>
      {s.stage === 'finished' ? (
        <Result game={game} />
      ) : (
        <>
          <p className="text-center text-sm text-fg-2">
            Раунд {s.round} из {bp.rounds}
            {s.activeSeat ? ` · ход: ${names[s.activeSeat]}${s.turnIndex === 0 ? ' (первый)' : ' (второй)'}` : ' · начало раунда'}
            {s.seized && s.turnIndex === 0 ? ' · перехват инициативы' : ''}
          </p>
          {s.step === 'priority' ? <Priority game={game} /> : <Turn key={`${s.round}-${s.turnIndex}`} game={game} />}
          <Resources game={game} />
          <EndEarly game={game} />
        </>
      )}
      <details className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Батлплан и карты тактик</summary>
        <div className="mt-2 space-y-2">
          {s.battleplan && <BattleplanInfo bp={bp} n={s.battleplan} round={s.round} territory={s.territory} showMap />}
          {s.territory && <p className="text-[12px] text-fg-3">Территория атакующего: {territoryLabel(s.territory)}</p>}
          {SEATS.map((seat) => (
            <div key={seat}>
              <p className="text-[12px] font-semibold text-fg-2">{names[seat]}</p>
              <TacticCards bp={bp} ids={s.players[seat].tacticCards} done={(c, t) => s.players[seat].tacticsDone.some((x) => x.card === c && x.tier === t)} />
            </div>
          ))}
          <SeasonRules game={game} />
        </div>
      </details>
      <RoundTable game={game} />
    </section>
  );
}

function Priority({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const names = { p1: s.players.p1.name, p2: s.players.p2.name };
  const [rolled, setRolled] = useState(false);
  const dice = useDiceMode((m) => m.mode);
  const r = priorityRoll(s.seed, s.round, s.rollCount.priority, s.prevFirst);
  const second = s.prevFirst ? otherSeat(s.prevFirst) : null;
  // перехват: ходивший вторым решает ходить первым; запрещён, если соперник впереди на seizeBlockedLead+ ПО
  const lead = second ? aosTotals(s, otherSeat(second), bp).total - aosTotals(s, second, bp).total : 0;
  const seizeBlocked = !!second && lead >= bp.priority.seizeBlockedLead;
  const pick = (first: Seat, source: 'random' | 'manual') => {
    if (game.dispatch(source === 'random' ? { type: 'round-started', first, source, roll: { attempt: s.rollCount.priority } } : { type: 'round-started', first, source })) setRolled(false);
  };
  const firstBtn = (seat: Seat, source: 'random' | 'manual', label: string) => {
    const blocked = (seizeBlocked && seat === second && (source === 'manual' || r.decider === second)) || (source === 'random' && !game.mine(r.decider));
    return (
      <Button key={seat + source} variant={source === 'random' ? 'primary' : 'outline'} className="text-xs" disabled={blocked} onClick={() => pick(seat, source)}>
        {label}
      </Button>
    );
  };
  return (
    <div className="rounded-2xl border border-accent/30 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <p className="font-display min-w-0 flex-1 text-lg font-semibold uppercase">Priority · раунд {s.round}</p>
        <DiceModeSwitch />
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-fg-2">{bp.priority.roll}</p>
      {s.underdog === null && s.round > 1 && <p className="mt-1 text-[12px] text-fg-3">Очки равны — underdog нет.</p>}
      {dice === 'manual' ? (
        <div className="mt-3 space-y-2">
          <p className="text-[12.5px] text-fg-2">Бросьте priority сами. Кто ходит первым?</p>
          <div className="grid grid-cols-2 gap-2">{SEATS.map((x) => firstBtn(x, 'manual', `Первым — ${names[x]}`))}</div>
        </div>
      ) : !rolled ? (
        <Button variant="primary" className="mt-3 w-full" onClick={() => setRolled(true)}>
          Бросить priority
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          {r.winner ? (
            <Dice rolls={[{ p1: r.p1, p2: r.p2 }]} winner={r.winner} names={names} />
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-center text-sm">
              {names.p1} {r.p1} : {r.p2} {names.p2} — ничья, решает {names[r.decider]} (ходил первым в прошлом раунде).
            </p>
          )}
          <p className="text-[12.5px] text-fg-2">{game.mine(r.decider) ? `${names[r.decider]}, кто ходит первым?` : `Кто ходит первым, решает ${names[r.decider]} на своём телефоне.`}</p>
          <div className="grid grid-cols-2 gap-2">
            {firstBtn(r.decider, 'random', 'Я хожу первым')}
            {firstBtn(otherSeat(r.decider), 'random', 'Соперник первым')}
          </div>
        </div>
      )}
      {seizeBlocked && (
        <p className="mt-2 text-[12px] text-warn">
          {names[second!]} отстаёт на {lead} ПО: перехват инициативы недоступен ({bp.priority.seize})
        </p>
      )}
      {second && !seizeBlocked && <p className="mt-2 text-[12px] text-fg-3">Если первым пойдёт {names[second]} — это перехват инициативы: {bp.priority.seize}</p>}
    </div>
  );
}

/** Конец хода активного игрока: строки батлплана, тактики с его карт, поправка ПО, «Закончить ход». */
function Turn({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const seat = s.activeSeat!;
  const p = s.players[seat];
  const plan = bp.battleplans.find((b) => b.n === s.battleplan);
  const rows = planRowsFor(bp, s.battleplan!, s.round);
  const scored = new Set(p.planScored.filter((x) => x.round === s.round).map((x) => x.row));
  const [picked, setPicked] = useState<number[]>([]);
  const seizedTurn = s.seized === seat && s.turnIndex === 0;
  const score = () => game.dispatch({ type: 'plan-scored', target: seat, rows: picked }) && setPicked([]);
  if (!game.mine(seat))
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
        <p className="font-display text-lg font-semibold uppercase">Ход соперника</p>
        <p className="mt-1 text-[12.5px] text-fg-3">{p.name} ходит и в конце хода отмечает батлплан и тактики на своём телефоне; счёт обновится здесь.</p>
      </div>
    );
  return (
    <div className="rounded-2xl border border-accent/30 bg-white/[0.03] p-4">
      <p className="font-display text-lg font-semibold uppercase">Конец хода · {p.name}</p>
      <p className="mt-2 text-[12px] font-semibold text-fg-3">Батлплан{plan ? `: ${plan.name}` : ''}</p>
      <ul className="mt-1 space-y-1">
        {rows.map((i) => {
          const r = plan!.scoring[i]!;
          const done = scored.has(i);
          const on = picked.includes(i);
          return (
            <li key={i}>
              <label className={cx('flex items-start gap-2.5 rounded-xl px-3 py-2', done ? 'bg-accent/10' : 'bg-white/[0.03]')}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-accent"
                  checked={done || on}
                  disabled={done}
                  onChange={() => setPicked((l) => (on ? l.filter((x) => x !== i) : [...l, i]))}
                />
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">{r.text}</span>
                <span className="font-display shrink-0 font-semibold text-accent">{r.vp}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button variant="primary" className="mt-2 w-full" disabled={!picked.length} onClick={score}>
        Засчитать отмеченное
      </Button>

      <p className="mt-3 text-[12px] font-semibold text-fg-3">Боевые тактики (+{bp.tactics.vp} ПО)</p>
      {seizedTurn && <p className="text-[12px] text-warn">Ход перехвата инициативы: боевые тактики не выполняются.</p>}
      <ul className="mt-1 space-y-1.5">
        {p.tacticCards.map((id) => {
          const c = bp.tactics.cards.find((x) => x.id === id);
          const tier = nextTier(s, seat, id, bp);
          const t = tier ? c?.tactics.find((x) => x.tier === tier) : null;
          const doneNow = p.tacticsDone.some((x) => x.card === id && x.round === s.round);
          return (
            <li key={id} className="rounded-xl bg-white/[0.03] px-3 py-2">
              <p className="text-[12.5px] font-semibold">{c?.name ?? id}</p>
              {t ? (
                <>
                  <p className="text-[12px] leading-snug text-fg-2">
                    <b className="text-white/85">{TIER_LABEL[t.tier]}</b> · {t.name}: {t.text}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-1.5 min-h-8 w-full text-xs"
                    disabled={doneNow || seizedTurn}
                    onClick={() => game.dispatch({ type: 'tactic-completed', target: seat, card: id, tier: t.tier })}
                  >
                    {doneNow ? 'С этой карты в этот ход уже выполнена' : 'Выполнена'}
                  </Button>
                </>
              ) : (
                <p className="text-[12px] text-fg-3">Все тактики карты выполнены.</p>
              )}
            </li>
          );
        })}
      </ul>
      <Adjust game={game} seat={seat} />
      <Button variant="primary" className="mt-3 w-full" onClick={() => game.dispatch({ type: 'turn-ended' })}>
        {s.turnIndex === 0 ? `Закончить ход → ${s.players[otherSeat(seat)].name}` : s.round >= bp.rounds ? 'Закончить ход и битву' : `Закончить ход → раунд ${s.round + 1}`}
      </Button>
    </div>
  );
}

function Adjust({ game, seat }: { game: AosGameHook; seat: Seat }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[12px] font-semibold text-fg-3">
        Поправить ПО вручную…
      </button>
    );
  const save = () => {
    if (game.dispatch({ type: 'vp-adjusted', target: seat, delta, note })) {
      setOpen(false);
      setDelta(0);
      setNote('');
    }
  };
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <IconButton icon="minus" label="Меньше" onClick={() => setDelta((d) => d - 1)} className="size-8" />
        <span className="font-display w-10 text-center text-lg font-semibold tabular-nums">{delta > 0 ? `+${delta}` : delta}</span>
        <IconButton icon="plus" label="Больше" onClick={() => setDelta((d) => d + 1)} className="size-8" />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={60}
          placeholder="Причина"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1 text-xs" disabled={!delta || !note.trim()} onClick={save}>
          Записать
        </Button>
        <Button className="text-xs" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

/** CP и кубы ярости обоих игроков: тратятся в любой ход, поэтому доступны всегда. */
function Resources({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  if (s.step !== 'turn') return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS.map((seat) => {
        const p = s.players[seat];
        return (
          <div key={seat} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="truncate text-[12px] font-semibold text-fg-2">
              {p.name}
              {s.underdog === seat ? ' · underdog' : ''}
            </p>
            <Counter readOnly={!game.mine(seat)} label="CP" value={p.cp} onMinus={() => game.dispatch({ type: 'cp-changed', target: seat, delta: -1, reason: 'spent' })} onPlus={() => game.dispatch({ type: 'cp-changed', target: seat, delta: 1, reason: 'gained' })} />
            <Counter readOnly={!game.mine(seat)} label="Кубы ярости" value={p.rage} onMinus={() => game.dispatch({ type: 'rage-changed', target: seat, dice: -1 })} onPlus={() => game.dispatch({ type: 'rage-changed', target: seat, dice: 1 })} />
            <Counter readOnly={!game.mine(seat)} label="Уровень ярости" value={p.fury} onMinus={() => game.dispatch({ type: 'rage-changed', target: seat, fury: -1 })} onPlus={() => game.dispatch({ type: 'rage-changed', target: seat, fury: 1 })} />
          </div>
        );
      })}
      <p className="col-span-2 text-[12px] leading-snug text-fg-3">
        В начале раунда: {bp.cp.perRound} CP, +{bp.cp.underdog} underdog, +{bp.cp.fewerAuxiliaries} у кого меньше вспомогательных отрядов; неистраченные CP сгорают. Кубы ярости — по уровню ярости.
      </p>
    </div>
  );
}

function Counter({ label, value, onMinus, onPlus, readOnly }: { label: string; value: number; onMinus: () => void; onPlus: () => void; readOnly?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="min-w-0 flex-1 text-[12px] text-fg-3">{label}</span>
      {!readOnly && <IconButton icon="minus" label={`${label}: меньше`} onClick={onMinus} className="size-7" />}
      <span className="font-display w-6 text-center font-semibold tabular-nums">{value}</span>
      {!readOnly && <IconButton icon="plus" label={`${label}: больше`} onClick={onPlus} className="size-7" />}
    </div>
  );
}

function SeasonRules({ game }: { game: AosGameHook }) {
  const bp = game.bp!;
  return (
    <div>
      <p className="text-[12px] font-semibold text-fg-2">Сезон: {bp.season.name}</p>
      {bp.season.rules.map((r) => (
        <p key={r.name} className="mt-1 text-[12px] leading-snug text-fg-2">
          <b className="text-white/85">{r.name}</b> ({r.when}): {r.text}
        </p>
      ))}
    </div>
  );
}

function RoundTable({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const totals = { p1: aosTotals(s, 'p1', bp), p2: aosTotals(s, 'p2', bp) };
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <table className="w-full text-center text-[12px] tabular-nums">
        <thead>
          <tr className="text-fg-3">
            <th className="text-left font-semibold">ПО по раундам</th>
            {totals.p1.byRound.map((_, i) => (
              <th key={i} className={cx('font-semibold', i + 1 === s.round && 'text-accent')}>
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEATS.map((seat) => (
            <tr key={seat}>
              <td className="max-w-24 truncate text-left text-fg-2">{s.players[seat].name}</td>
              {totals[seat].byRound.map((v, i) => (
                <td key={i} className="text-white/80">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndEarly({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full text-center text-[12px] font-semibold text-fg-3">
        Закончить битву досрочно…
      </button>
    );
  return (
    <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-3">
      <p className="text-[12.5px] text-fg-2">Сдавшийся проигрывает независимо от ПО. По договорённости — итог по текущим ПО.</p>
      <div className="grid grid-cols-2 gap-2">
        {SEATS.filter((x) => game.mine(x)).map((x) => (
          <Button key={x} variant="danger" className="text-xs" onClick={() => game.dispatch({ type: 'battle-ended', reason: 'concede', by: x })}>
            Сдаётся {s.players[x].name}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-xs" onClick={() => game.dispatch({ type: 'battle-ended', reason: 'manual' })}>
          По договорённости
        </Button>
        <Button className="text-xs" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

function Result({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const r = aosResult(s, game.bp!);
  if (!r) return null;
  const name = (x: Seat) => s.players[x].name;
  const title =
    r.kind === 'draw' ? 'Ничья' : r.kind === 'concede' ? `Победа: ${name(r.winner!)} (соперник сдался)` : `${r.kind === 'major' ? 'Крупная' : 'Малая'} победа: ${name(r.winner!)}`;
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Битва окончена</p>
      <p className="font-display mt-1 text-2xl font-semibold uppercase">{title}</p>
      <p className="mt-1 text-sm text-fg-2">
        {r.totals.p1} : {r.totals.p2}
        {r.by === 'tactics' ? ' · ПО поровну, больше выполненных тактик' : ''}
        {s.endReason === 'manual' ? ' · окончена по договорённости' : ''}
      </p>
      <Button className="mt-3" onClick={game.closeGame}>
        К списку игр
      </Button>
    </div>
  );
}
