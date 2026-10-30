import { useState, type ReactNode } from 'react';
import { AOS_CODE_PREFIX, decodeAosRoster } from '../../aos/roster';
import type { AosBattlepack, AosIndex, AosRoster } from '../../aos/types';
import { aosSetupMissing, battleplanRoll, otherSeat, rolesRoll, SEATS, type AosRosterRef, type Seat } from '../../aosgame';
import { Dice } from '../game/Dice';
import { Button, Icon, Segmented } from '../kit';
import { cx, fmtPts } from '../util';
import { BattleplanMap } from './BattleplanMap';
import { isMapTerritory, rosterRefOf, territoryLabel, TIER_LABEL } from './refs';
import type { AosGameHook } from './useAosGame';

/** Подготовка: шаги по порядку General's Handbook; каждый шаг — отдельная карточка, готовые отмечены. */
export function AosSetup({ game, rosters, index }: { game: AosGameHook; rosters: AosRoster[]; index: AosIndex }) {
  const s = game.state!;
  const bp = game.bp!;
  const missing = aosSetupMissing(s);
  const atk = SEATS.find((x) => s.players[x].role === 'attacker') ?? null;
  return (
    <section className="space-y-3">
      <Step n={1} title="Игроки и ростеры" done={SEATS.every((x) => s.players[x].roster.source !== 'none')}>
        {SEATS.map((seat) => (
          <PlayerRow key={seat} game={game} seat={seat} rosters={rosters} index={index} />
        ))}
        <p className="text-[11px] text-white/40">Число вспомогательных отрядов берётся из ростера: у кого их меньше, получает +{bp.cp.fewerAuxiliaries} CP в каждом раунде.</p>
      </Step>
      <Step n={2} title="Батлплан" done={!!s.battleplan}>
        <StepBattleplan game={game} />
      </Step>
      <Step n={3} title="Атакующий и защитник" done={!!atk}>
        <StepRoles game={game} />
      </Step>
      <Step n={4} title="Территория атакующего" done={!!s.territory}>
        {atk ? <StepTerritory game={game} attacker={atk} /> : <p className="text-sm text-white/50">Сначала определите атакующего.</p>}
      </Step>
      <Step n={5} title="Боевые тактики" done={s.tacticsRevealed}>
        <StepTactics game={game} />
      </Step>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        {missing.length ? <p className="text-sm text-white/55">Не готово: {missing.join(', ')}.</p> : <p className="text-sm text-white/70">Всё готово. Расставьте армии по правилам батлплана и начинайте.</p>}
        <Button variant="primary" className="mt-3 w-full" disabled={!!missing.length} onClick={() => game.dispatch({ type: 'battle-started' })}>
          Начать битву
        </Button>
      </div>
      <details className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Порядок подготовки (GH 2026-27)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-white/65">
          {bp.setup.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border bg-white/[0.03] p-4', done ? 'border-white/10' : 'border-accent/30')}>
      <p className="mb-2 flex items-center gap-2">
        <span className={cx('flex size-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-accent text-black' : 'bg-white/10 text-white/70')}>
          {done ? <Icon name="check" className="size-3.5" /> : n}
        </span>
        <span className="font-display text-lg font-semibold uppercase">{title}</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PlayerRow({ game, seat, rosters, index }: { game: AosGameHook; seat: Seat; rosters: AosRoster[]; index: AosIndex }) {
  const s = game.state!;
  const p = s.players[seat];
  const own = game.mine(seat);
  const locked = s.tacticsRevealed || !own;
  const [name, setName] = useState(p.name);
  const [mode, setMode] = useState<'own' | 'code'>(p.roster.source === 'code' ? 'code' : 'own');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const setRoster = (roster: AosRosterRef) => game.dispatch({ type: 'player-set', target: seat, patch: { roster } });
  const saveName = () => name.trim() !== p.name && game.dispatch({ type: 'player-set', target: seat, patch: { name } });
  const fromCode = () => {
    try {
      setRoster(rosterRefOf(decodeAosRoster(code.trim(), index.factions.map((f) => f.id)), 'code', index));
      setCode('');
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Код не распознан');
    }
  };
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <input
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        disabled={!own}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold outline-none focus:border-accent"
        aria-label={`Имя игрока ${seat === 'p1' ? 1 : 2}`}
      />
      {p.roster.source !== 'none' ? (
        <div className="mt-2 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-white/75">
            {p.roster.name}
            <span className="block text-[11px] text-white/45">
              {p.roster.points != null ? `${fmtPts(p.roster.points)} очк.` : 'очки не посчитаны'} · вспомогательных: {p.roster.auxiliaries ?? '—'}
              {p.roster.source === 'code' ? ' · по коду' : ''}
            </span>
          </p>
          {!locked && (
            <button type="button" onClick={() => setRoster({ source: 'none' })} className="text-[11px] font-semibold text-white/45">
              Сменить
            </button>
          )}
        </div>
      ) : !own ? (
        <p className="mt-2 text-[12px] text-white/50">Соперник ещё выбирает ростер на своём телефоне.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'own', label: 'Мой ростер' }, { value: 'code', label: 'По коду' }]} />
          {mode === 'own' ? (
            rosters.length ? (
              <select
                value=""
                onChange={(e) => {
                  const r = rosters.find((x) => x.id === e.target.value);
                  if (r) setRoster(rosterRefOf(r, 'own', index));
                }}
                className="w-full rounded-lg border border-white/10 bg-app-elevated px-3 py-2 text-sm outline-none"
              >
                <option value="">Выберите ростер…</option>
                {rosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[12px] text-white/50">На этом телефоне нет ростеров AoS — вставьте код соперника.</p>
            )
          ) : (
            <>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={3}
                placeholder={`${AOS_CODE_PREFIX}…`}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2 font-mono text-xs outline-none focus:border-accent"
              />
              {err && <p className="text-[12px] text-danger">{err}</p>}
              <Button className="w-full" disabled={!code.trim()} onClick={fromCode}>
                Добавить по коду
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BattleplanInfo({ bp, n, round, territory, showMap }: { bp: AosBattlepack; n: number; round?: number; territory?: string | null; showMap?: boolean }) {
  const plan = bp.battleplans.find((b) => b.n === n);
  if (!plan) return <p className="text-sm text-white/50">Нет данных о батлплане №{n}.</p>;
  const label = { all: 'каждый раунд', '1': 'раунд 1', '2+': 'раунды 2+' } as const;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-sm font-semibold">
        {plan.n}. {plan.name} <span className="text-[11px] font-normal text-white/45">· таблица {plan.table}</span>
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-white/70">{plan.rules}</p>
      <ul className="mt-2 space-y-1">
        {plan.scoring.map((r, i) => {
          const active = round == null || r.rounds === 'all' || (r.rounds === '1' ? round === 1 : round >= 2);
          return (
            <li key={i} className={cx('flex gap-2 text-[12px] leading-snug', active ? 'text-white/75' : 'text-white/30')}>
              <span className="font-display w-9 shrink-0 text-right font-semibold text-accent">{r.vp} ПО</span>
              <span className="min-w-0 flex-1">
                {r.text} <span className="text-white/40">({label[r.rounds]})</span>
              </span>
            </li>
          );
        })}
      </ul>
      {showMap && plan.map && (
        <div className="mt-2">
          <BattleplanMap bp={bp} map={plan.map} attacker={isMapTerritory(territory) ? territory : null} />
        </div>
      )}
    </div>
  );
}

function StepBattleplan({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const [manual, setManual] = useState(false);
  const last = s.battleplanSource === 'random' && s.battleplanDraws ? battleplanRoll(s.seed, s.battleplanDraws - 1) : null;
  const roll = () => {
    const r = battleplanRoll(s.seed, s.battleplanDraws);
    game.dispatch({ type: 'battleplan-set', n: r.n, source: 'random', roll: { attempt: s.battleplanDraws } });
  };
  return (
    <>
      {s.battleplan && <BattleplanInfo bp={bp} n={s.battleplan} showMap />}
      {last && (
        <p className="text-[11.5px] text-white/50">
          Бросок: D6 таблицы — {last.tableDie} (таблица {last.table}), D6 батлплана — {last.planDie}.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant={s.battleplan ? 'ghost' : 'primary'} className="flex-1" onClick={roll}>
          {s.battleplan ? 'Перебросить' : 'Бросить D6 + D6'}
        </Button>
        <Button variant="outline" onClick={() => setManual((v) => !v)}>
          Выбрать
        </Button>
      </div>
      {manual && (
        <select
          value={s.battleplan ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n && game.dispatch({ type: 'battleplan-set', n, source: 'manual' })) setManual(false);
          }}
          className="w-full rounded-lg border border-white/10 bg-app-elevated px-3 py-2 text-sm outline-none"
        >
          <option value="">Батлплан по договорённости…</option>
          {bp.battleplans.map((b) => (
            <option key={b.n} value={b.n}>
              {b.n}. {b.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

function StepRoles({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const names = { p1: s.players.p1.name, p2: s.players.p2.name };
  // бросок «кто выше» показывается до выбора; засчитывается вместе с выбором победителя (как priority)
  const [rolled, setRolled] = useState(false);
  const r = rolesRoll(s.seed, s.rollCount.roles);
  const atk = SEATS.find((x) => s.players[x].role === 'attacker');
  const choose = (attacker: Seat, source: 'random' | 'manual') => {
    if (game.dispatch(source === 'random' ? { type: 'roles-set', attacker, source, roll: { attempt: s.rollCount.roles } } : { type: 'roles-set', attacker, source })) setRolled(false);
  };
  return (
    <>
      {atk && (
        <p className="text-sm text-white/75">
          Атакующий — <b>{names[atk]}</b>, защитник — <b>{names[otherSeat(atk)]}</b>
          {s.rolesSource === 'manual' ? ' (по договорённости)' : ''}.
        </p>
      )}
      {s.rolesRoll && atk && !rolled && <p className="text-[11.5px] text-white/45">Бросок: {s.rolesRoll.map((x) => `${x.p1}:${x.p2}`).join(', ')}</p>}
      {!rolled ? (
        <div className="flex gap-2">
          <Button variant={atk ? 'ghost' : 'primary'} className="flex-1" onClick={() => setRolled(true)}>
            {atk ? 'Перебросить' : 'Бросок «кто выше»'}
          </Button>
        </div>
      ) : (
        <>
          <Dice rolls={r.rolls} winner={r.winner} names={names} />
          <p className="text-[12.5px] text-white/65">{names[r.winner]} решает, кто атакующий{game.mine(r.winner) ? ':' : ' — ждём выбор на его телефоне.'}</p>
          <div className={cx('grid grid-cols-2 gap-2', !game.mine(r.winner) && 'hidden')}>
            <Button variant="primary" onClick={() => choose(r.winner, 'random')}>
              Я атакую
            </Button>
            <Button variant="outline" onClick={() => choose(otherSeat(r.winner), 'random')}>
              Я защищаюсь
            </Button>
          </div>
        </>
      )}
      <details>
        <summary className="cursor-pointer text-[12px] text-white/45">Без броска, по договорённости</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SEATS.map((x) => (
            <Button key={x} variant="outline" className="text-xs" onClick={() => choose(x, 'manual')}>
              Атакует {names[x]}
            </Button>
          ))}
        </div>
      </details>
    </>
  );
}

function StepTerritory({ game, attacker }: { game: AosGameHook; attacker: Seat }) {
  const s = game.state!;
  const bp = game.bp!;
  const map = bp.battleplans.find((b) => b.n === s.battleplan)?.map;
  const [t, setT] = useState(s.territory && !isMapTerritory(s.territory) ? s.territory : '');
  const canPick = game.mine(attacker);
  const pick = (v: string) => canPick && v !== s.territory && game.dispatch({ type: 'territory-set', territory: v });
  return (
    <>
      <p className="text-[12.5px] leading-snug text-white/65">
        Защитник ставит цели и террейн по карте, затем {s.players[attacker].name} (атакующий) выбирает свою территорию; вторая достаётся защитнику.
        {map ? ' Нажмите на территорию на карте.' : ' Карты этого батлплана нет — запишите выбор словами.'}
      </p>
      {map && (
        <>
          <BattleplanMap bp={bp} map={map} attacker={isMapTerritory(s.territory) ? s.territory : null} onPick={canPick ? pick : undefined} />
          {!canPick && <p className="text-[12px] text-white/50">Территорию выбирает {s.players[attacker].name} на своём телефоне.</p>}
          <div className={cx('grid grid-cols-2 gap-2', !canPick && 'hidden')}>
            {(['A', 'B'] as const).map((x) => (
              <Button key={x} variant={s.territory === x ? 'primary' : 'outline'} onClick={() => pick(x)}>
                Атакую из {x}
              </Button>
            ))}
          </div>
        </>
      )}
      {canPick && (!map || (s.territory && !isMapTerritory(s.territory))) && (
        <div className="flex gap-2">
          <input
            value={t}
            maxLength={40}
            onChange={(e) => setT(e.target.value)}
            placeholder="Например: северная половина"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <Button variant={s.territory ? 'ghost' : 'primary'} disabled={!t.trim() || t.trim() === s.territory} onClick={() => pick(t.trim())}>
            ОК
          </Button>
        </div>
      )}
      {s.territory && <p className="text-[12px] text-white/55">Территория атакующего: {territoryLabel(s.territory)}</p>}
    </>
  );
}

/** Тайный выбор: карты видны только тому, кто открыл свой выбор; раскрытие — общее, после него карты не меняются. */
function StepTactics({ game }: { game: AosGameHook }) {
  const s = game.state!;
  const bp = game.bp!;
  const [open, setOpen] = useState<Seat | null>(null);
  if (s.tacticsRevealed) {
    return (
      <>
        {SEATS.map((seat) => (
          <div key={seat} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-sm font-semibold">{s.players[seat].name}</p>
            <TacticCards bp={bp} ids={s.players[seat].tacticCards} />
          </div>
        ))}
      </>
    );
  }
  const toggle = (seat: Seat, id: string) => {
    const cur = s.players[seat].tacticCards;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    game.dispatch({ type: 'player-set', target: seat, patch: { tacticCards: next } });
  };
  return (
    <>
      <p className="text-[12.5px] leading-snug text-white/65">{bp.tactics.rule}</p>
      {SEATS.map((seat) => {
        const p = s.players[seat];
        const shown = open === seat;
        return (
          <div key={seat} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold">
                {p.name} <span className="text-[11px] font-normal text-white/45">· выбрано {p.tacticCards.length} из {bp.tactics.pick}</span>
              </p>
              {game.mine(seat) ? (
                <Button variant="outline" className="min-h-8 px-3 text-xs" onClick={() => setOpen(shown ? null : seat)}>
                  {shown ? 'Скрыть' : 'Выбрать тайно'}
                </Button>
              ) : (
                <span className="text-[11px] text-white/45">{p.tacticCards.length ? 'выбрал' : 'выбирает…'}</span>
              )}
            </div>
            {shown && (
              <ul className="mt-2 space-y-1.5">
                {bp.tactics.cards.map((c) => {
                  const on = p.tacticCards.includes(c.id);
                  const full = !on && p.tacticCards.length >= bp.tactics.pick;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={full}
                        onClick={() => toggle(seat, c.id)}
                        className={cx('w-full rounded-lg border px-3 py-2 text-left disabled:opacity-40', on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}
                      >
                        <span className="text-[13px] font-semibold">{c.name}</span>
                        <span className="block text-[11px] leading-snug text-white/50">{c.tactics.map((t) => t.name).join(' → ')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <Button
        variant="primary"
        className="w-full"
        disabled={SEATS.some((x) => !s.players[x].tacticCards.length)}
        onClick={() => (setOpen(null), game.dispatch({ type: 'tactics-revealed' }))}
      >
        Раскрыть карты обоих
      </Button>
      <p className="text-[11px] text-white/40">{game.online ? 'Каждый выбирает карты на своём телефоне; раскрыть может любой, когда выбрали оба.' : 'Передайте телефон: каждый выбирает свои карты и нажимает «Скрыть».'} После раскрытия карты не меняются.</p>
    </>
  );
}

export function TacticCards({ bp, ids, done }: { bp: AosBattlepack; ids: string[]; done?: (card: string, tier: string) => boolean }) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {ids.map((id) => {
        const c = bp.tactics.cards.find((x) => x.id === id);
        if (!c) return <li key={id} className="text-[12px] text-danger">Нет данных о карте {id}</li>;
        return (
          <li key={id} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <p className="text-[13px] font-semibold">{c.name}</p>
            {c.setup && <p className="text-[11.5px] leading-snug text-white/50">Подготовка: {c.setup}</p>}
            {c.tactics.map((t) => (
              <p key={t.tier} className={cx('mt-1 text-[12px] leading-snug', done?.(id, t.tier) ? 'text-white/35 line-through' : 'text-white/70')}>
                <b className="text-white/85">{TIER_LABEL[t.tier]}</b> · {t.name}: {t.text}
              </p>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
