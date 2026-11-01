import { useState } from 'react';
import { agendasActive, rollD6, type Seat } from '../../game';
import { agendasFor, upgradeLimit, type AllianceId, type CampaignPhase, type DominatusData } from '../../dominatus/types';
import { haptic } from '../../telegram';
import { Button, Field, Segmented } from '../kit';
import { ActAs } from './ActAs';
import { CampaignFill } from './DominatusCampaign';
import { useOpenCard } from './cardViewer';
import type { GameHook } from './useGame';

const SEATS: Seat[] = ['p1', 'p2'];

/** Данные Dominatus из загрузки игры (режим доступен только с ними). */
const useDominatus = (game: GameHook): DominatusData => game.data!.dominatus!;

/**
 * Dominatus (DM1), шаг «Кампания»: фаза и локация (бросок D6 — по seed игры, как остальные броски, — или выбор Warmaster),
 * правила зоны боевых действий и бонус локации (названия; текст — на карте локации); альянсы игроков (разные).
 */
export function StepCampaign({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const data = useDominatus(game);
  const state = game.state!;
  const d = state.dominatus!;
  const [phase, setPhase] = useState<CampaignPhase>(d.phase ?? 1);
  const location = data.locations.find((l) => l.id === d.locationId) ?? null;
  const attempt = d.phase === phase ? d.locationDraws : 0;

  const roll = () => {
    const value = rollD6(state.seed, `location-${phase}`, attempt);
    const loc = data.locations.find((l) => l.phase === phase && value >= l.rolls[0] && value <= l.rolls[1]);
    if (loc && game.dispatch({ type: 'dom-location-set', phase, locationId: loc.id, source: 'random', roll: { attempt } })) haptic.ok();
  };
  const choose = (id: string) => {
    if (game.dispatch({ type: 'dom-location-set', phase, locationId: id, source: 'manual' })) haptic.select();
  };
  const ready = !!location && SEATS.every((s) => d.players[s].alliance) && d.players.p1.alliance !== d.players.p2.alliance;

  return (
    <div className="mt-3 space-y-4">
      <CampaignFill game={game} onPhase={setPhase} />
      <Field label="Фаза кампании">
        <Segmented
          value={String(phase) as '1' | '2' | '3'}
          options={data.phases.map((p) => ({ value: String(p.phase) as '1' | '2' | '3', label: `${p.phase}`, hint: p.name }))}
          onChange={(v) => setPhase(Number(v) as CampaignPhase)}
        />
      </Field>

      <Field label="Локация" hint="D6: 1–2 / 3–4 / 5–6">
        <div className="space-y-1.5">
          {data.locations
            .filter((l) => l.phase === phase)
            .map((l) => {
              const on = l.id === d.locationId;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => choose(l.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10'}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{l.name}</span>
                    <span className="text-[12px] text-fg-3">
                      {l.rolls[0]}–{l.rolls[1]}
                    </span>
                  </span>
                  <span className="block text-[12px] text-fg-3">{l.nameRu}</span>
                </button>
              );
            })}
          <Button className="w-full" onClick={roll}>
            {d.locationSource === 'random' && d.phase === phase ? 'Бросить D6 ещё раз' : 'Бросить D6'}
          </Button>
        </div>
      </Field>

      {location && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
          <p className="font-semibold">
            {location.name}
            {d.locationSource === 'random' && d.locationRoll ? <span className="text-fg-3"> · выпало {d.locationRoll}</span> : null}
          </p>
          <p className="mt-1 text-fg-2">
            Бонус владельцу: <span className="font-semibold text-fg">{location.bonus}</span> — {location.bonusText}
          </p>
          <p className="mt-1 text-fg-2">Правила зоны боевых действий (текст — на карте локации): {location.warZone.join(', ')}.</p>
        </div>
      )}

      {SEATS.map((s) => (
        <ActAs key={s} game={game} seat={s}>
          <Field label={`${state.players[s].name}: альянс`}>
            <Segmented
              value={d.players[s].alliance as AllianceId | null}
              options={data.alliances.map((a) => ({ value: a.id, label: a.name, hint: a.optional ? 'по желанию' : undefined }))}
              onChange={(alliance) => game.dispatch({ type: 'dom-player-set', target: s, patch: { alliance } }) && haptic.select()}
            />
          </Field>
        </ActAs>
      ))}
      {d.players.p1.alliance && d.players.p1.alliance === d.players.p2.alliance && <p className="text-xs text-warn">Игроки должны быть из разных альянсов.</p>}

      <Button variant="primary" className="w-full" disabled={!ready} onClick={onNext}>
        Дальше
      </Button>
    </div>
  );
}

/**
 * Dominatus (DM1), шаг «Agenda и улучшения» (после раскрытия типов армий — по ним Briefing даёт Agenda):
 * каждый решает, играть ли Agenda; Agenda заменяет основную миссию, только если играют оба.
 * Выбор Agenda — из трёх Agenda альянса в фазе (таблицы Briefing в приложении пока нет — смотрите карту Briefing).
 * Улучшения: до 3 (в Titangrave — 4), по одному на отряд, без повторов карт.
 */
export function StepAgendas({ game, onNext }: { game: GameHook; onNext: () => void }) {
  const data = useDominatus(game);
  const state = game.state!;
  const d = state.dominatus!;
  const openCard = useOpenCard();
  const both = d.players.p1.attempt === true && d.players.p2.attempt === true;
  const ready = SEATS.every((s) => d.players[s].attempt !== null) && (!both || SEATS.every((s) => d.players[s].agenda));

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm leading-snug text-fg-2">
        Agenda заменяет основную миссию колоды, только если её играют <b>оба</b> игрока. Какая Agenda — по карте Briefing вашего альянса
        (ваш тип армии + тип армии противника).
      </p>
      {SEATS.map((s) => {
        const p = d.players[s];
        const list = p.alliance && d.phase ? agendasFor(data, p.alliance as AllianceId, d.phase) : [];
        return (
          <ActAs key={s} game={game} seat={s}>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-semibold">{state.players[s].name}</p>
              <Segmented
                value={p.attempt === null ? null : p.attempt ? 'yes' : 'no'}
                options={[
                  { value: 'yes', label: 'Играю Agenda' },
                  { value: 'no', label: 'Обычная основная' },
                ]}
                onChange={(v) => game.dispatch({ type: 'dom-player-set', target: s, patch: { attempt: v === 'yes' } }) && haptic.select()}
              />
              {p.attempt && (
                <div className="space-y-1.5">
                  {list.map((c) => (
                    <div key={c.id} className="flex items-stretch gap-1.5">
                      <button
                        type="button"
                        onClick={() => game.dispatch({ type: 'dom-player-set', target: s, patch: { agenda: c.id } }) && haptic.select()}
                        className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-left ${p.agenda === c.id ? 'border-accent bg-accent/10' : 'border-white/10 active:bg-white/10'}`}
                      >
                        <span className="block text-sm font-semibold">{c.name}</span>
                        <span className="block text-[12px] text-fg-3">{c.nameRu}</span>
                      </button>
                      <Button className="shrink-0" onClick={() => openCard?.(c.id, s)}>
                        Карта
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Upgrades game={game} seat={s} data={data} />
            </div>
          </ActAs>
        );
      })}
      {!both && SEATS.every((s) => d.players[s].attempt !== null) && (
        <p className="text-xs text-fg-3">Agenda не играют: у обоих основные миссии из колоды миссий.</p>
      )}
      {agendasActive(state) && <p className="text-xs text-fg-3">Agenda — основные миссии обоих игроков.</p>}
      <Button variant="primary" className="w-full" disabled={!ready} onClick={onNext}>
        Дальше
      </Button>
    </div>
  );
}

/** Улучшения игрока: карта (из колод Battle Honour, Battle Skill, Relic) → отряд. */
function Upgrades({ game, seat, data }: { game: GameHook; seat: Seat; data: DominatusData }) {
  const d = game.state!.dominatus!;
  const list = d.players[seat].upgrades;
  const limit = upgradeLimit(data, d.locationId);
  const [card, setCard] = useState('');
  const [unit, setUnit] = useState('');
  const u = data.upgrades;
  const alliance = d.players[seat].alliance as AllianceId | null;
  const groups: { label: string; cards: string[] }[] = [
    { label: 'Battle Honour', cards: [...u.honours['1'], ...u.honours['2'], ...u.honours['3']] },
    { label: 'Battle Skill', cards: u.skills },
    { label: 'Relic', cards: alliance ? u.relics[alliance] : Object.values(u.relics).flat() },
  ];
  const save = (next: { card: string; unit: string }[]) => game.dispatch({ type: 'dom-player-set', target: seat, patch: { upgrades: next } });
  const add = () => {
    if (save([...list, { card, unit }])) {
      haptic.ok();
      setCard('');
      setUnit('');
    }
  };
  return (
    <div className="space-y-1.5 border-t border-white/10 pt-2">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">
        Улучшения · {list.length} из {limit}
      </p>
      {list.map((x) => (
        <div key={x.card} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{x.card}</span> <span className="text-fg-3">→ {x.unit}</span>
          </span>
          <Button className="shrink-0" onClick={() => save(list.filter((y) => y.card !== x.card))}>
            Убрать
          </Button>
        </div>
      ))}
      {list.length < limit && (
        <div className="grid grid-cols-1 gap-1.5">
          <select value={card} onChange={(e) => setCard(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none focus:border-accent" aria-label="Карта улучшения">
            <option value="">Карта улучшения…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.cards
                  .filter((c) => !list.some((x) => x.card === c))
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            maxLength={80}
            placeholder="Отряд (персонаж), например: Captain"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-accent"
          />
          <Button disabled={!card || !unit.trim()} onClick={add}>
            Добавить улучшение
          </Button>
        </div>
      )}
    </div>
  );
}
