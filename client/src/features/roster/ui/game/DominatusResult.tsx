import { agendasActive, type Seat } from '../../game';
import { AGENDA_ACHIEVED_VP, dominatusRewards } from '../../dominatus/rewards';
import { haptic } from '../../telegram';
import { Segmented } from '../kit';
import { ActAs } from './ActAs';
import { RecordBattle } from './DominatusCampaign';
import type { GameHook } from './useGame';

const SEATS: Seat[] = ['p1', 'p2'];
const KIND_RU = { honour: 'Battle Honour', skill: 'Battle Skill', 'path-to-conquest': 'Path to Conquest' } as const;

/**
 * Итог битвы Dominatus (DM1): Agenda Achieved (отмечает игрок; подсказка — 35+ ПО по Agenda), какие карты тянуть
 * за итог битвы (с Agenda Achieved — на одну больше, оставить одну) и напоминание о локации. Карты физические.
 */
export function DominatusResult({ game }: { game: GameHook }) {
  const state = game.state!;
  const { catalog, dominatus } = game.data!;
  const rewards = dominatusRewards(state, catalog);
  const d = state.dominatus!;
  if (!rewards || !dominatus) return null;
  const location = dominatus.locations.find((l) => l.id === d.locationId);
  const agendaName = (id: string | null) => dominatus.cards.find((c) => c.id === id);
  const active = agendasActive(state);
  return (
    <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">Dominatus · фаза {d.phase}</p>
      {SEATS.map((s) => {
        const r = rewards[s];
        const agenda = agendaName(r.agenda);
        return (
          <div key={s} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
            <p className="font-semibold">
              {state.players[s].name} · {r.outcome === 'win' ? 'победа' : r.outcome === 'loss' ? 'поражение' : 'ничья'}
            </p>
            {active && agenda && (
              <ActAs game={game} seat={s}>
                <div className="mt-2 space-y-1.5">
                  <p className="text-fg-2">
                    Agenda «{agenda.name}»: {r.primaryVp} ПО
                    {r.suggestedAchieved ? ` — ${AGENDA_ACHIEVED_VP}+, Agenda Achieved заработана` : ''}
                  </p>
                  <p className="text-[12px] text-fg-3">Или условие карты: {agenda.achieved.slice(1).join(' / ') || '—'}</p>
                  {agenda.achievedExtra && <p className="text-[12px] text-fg-3">Вторая карта: {agenda.achievedExtra.join(' / ')}</p>}
                  <Segmented
                    value={r.achieved === null ? null : (String(r.achieved) as '0' | '1' | '2')}
                    options={[
                      { value: '0', label: 'Нет' },
                      { value: '1', label: '1 карта' },
                      ...(agenda.achievedExtra ? [{ value: '2' as const, label: '2 карты' }] : []),
                    ]}
                    onChange={(v) => game.dispatch({ type: 'dom-achieved', target: s, cards: Number(v) as 0 | 1 | 2 }) && haptic.select()}
                  />
                </div>
              </ActAs>
            )}
            <p className="mt-2">
              {r.reward ? (
                <>
                  Тянуть: <b>{r.reward.kind === 'path-to-conquest' ? KIND_RU[r.reward.kind] : `${KIND_RU[r.reward.kind]}${r.reward.kind === 'honour' ? ` (фаза ${r.reward.phase})` : ''}`}</b>
                  {r.reward.draw > 1 ? ` — ${r.reward.draw} карты, оставить одну (Agenda Achieved)` : ''}
                </>
              ) : (
                <span className="text-fg-3">Карт за итог битвы нет.</span>
              )}
            </p>
          </div>
        );
      })}
      <p className="text-[12px] leading-snug text-fg-3">
        Карты Agenda Achieved — держать не больше 3. Контроль локации{location ? ` «${location.name}» (бонус ${location.bonus})` : ''}, Ascendancy и Relics — в
        конце фазы кампании.
      </p>
      <RecordBattle game={game} />
    </div>
  );
}
