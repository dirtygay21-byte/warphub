import { useEffect, useMemo, useState } from 'react';
import { agendasActive, battleResult, type Seat } from '../../game';
import { ALLIANCE_RU, claimCampaignCard, deckFor, hasCampaign, KIND_RU, recordCampaignBattle, useCampaign, type CampaignCard, type CampaignView } from '../../dominatus/api';
import type { AllianceId, CampaignPhase } from '../../dominatus/types';
import { haptic, pushOverlay } from '../../telegram';
import { Button, IconButton, Tag } from '../kit';
import { useMySeat } from './cardViewer';
import type { GameHook } from './useGame';

const SEATS: Seat[] = ['p1', 'p2'];
const ALLIANCES: AllianceId[] = ['liberators', 'oppressors', 'raiders'];
const SELECT = 'h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none focus:border-accent';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/**
 * Кампания Dominatus (DM2): фазы и локации, счёт альянсов, мои карты (награды ждут выбора: «тяните N, оставьте одну» —
 * отметьте, какую оставили), битвы. Кампанию ведёт Warmaster в админ-панели.
 */
export function DominatusCampaign({ onClose }: { onClose: () => void }) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  const { view, error, reload, loading } = useCampaign();
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Назад" onClick={onClose} className="size-8" />
        <p className="font-display min-w-0 flex-1 text-xl font-semibold uppercase">Кампания Dominatus</p>
      </div>
      {loading && <div className="mx-auto mt-10 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />}
      {error && <p className="py-6 text-center text-sm text-fg-3">{error}</p>}
      {view && !hasCampaign(view) && <p className="py-6 text-center text-sm text-fg-3">Активной кампании нет. Кампанию создаёт Warmaster (администратор клуба).</p>}
      {hasCampaign(view) && <CampaignBody view={view} reload={reload} />}
    </section>
  );
}

function CampaignBody({ view, reload }: { view: CampaignView; reload: () => Promise<unknown> }) {
  const open = view.phases.find((p) => p.status === 'open');
  return (
    <>
      <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-3">
        <p className="font-display text-lg font-semibold uppercase leading-tight">{view.campaign.name}</p>
        <p className="mt-0.5 text-sm text-fg-2">
          {open ? `Фаза ${open.phase} · ${open.location?.name ?? '—'}${open.location ? ` (бонус ${open.location.bonus})` : ''}` : 'Фаза не начата — ждём Warmaster'}
        </p>
        {view.me ? (
          <p className="mt-1 text-[12px] text-fg-3">Ваш альянс: {ALLIANCE_RU[view.me.alliance]}</p>
        ) : (
          <p className="mt-1 text-[12px] text-warn">Вы не в кампании — попросите Warmaster добавить вас.</p>
        )}
      </div>

      <Standings view={view} />
      {view.me && <MyCards view={view} reload={reload} />}
      <Phases view={view} />
      <Battles view={view} />
    </>
  );
}

function Standings({ view }: { view: CampaignView }) {
  const rows = ALLIANCES.filter((a) => view.players.some((p) => p.alliance === a));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Альянсы</p>
      <table className="w-full text-sm">
        <thead className="text-[11px] text-fg-3">
          <tr>
            <th className="text-left font-normal" />
            <th className="font-normal">NP</th>
            <th className="font-normal">Битвы</th>
            <th className="font-normal">Победы</th>
            <th className="font-normal">Honour</th>
            <th className="font-normal">Agenda</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const s = view.standings[a];
            return (
              <tr key={a} className="text-center">
                <td className="py-1 text-left font-semibold">{ALLIANCE_RU[a]}</td>
                <td className="font-semibold text-accent">{s.narrative}</td>
                <td>{s.battles}</td>
                <td>{s.wins}</td>
                <td>
                  {s.honours}
                  {view.currentPhase ? <span className="text-fg-3"> ({s.phaseHonours})</span> : null}
                </td>
                <td>{s.agendas}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-fg-3">
        NP — Narrative Points. Honour — Battle Honour за кампанию (в скобках — за текущую фазу: по ним контроль локации). Agenda — карты Agenda Achieved на
        руках (по ним Ascendancy; сбрасываются в конце фазы).
      </p>
    </div>
  );
}

function MyCards({ view, reload }: { view: CampaignView; reload: () => Promise<unknown> }) {
  const me = view.me!;
  const pending = me.cards.filter((c) => c.pending);
  const kept = me.cards.filter((c) => !c.pending && c.kind !== 'agenda');
  const agendas = me.cards.filter((c) => c.kind === 'agenda').length;
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Мои карты</p>
      {pending.map((c) => (
        <ClaimRow key={c.id} view={view} card={c} reload={reload} />
      ))}
      {kept.length ? (
        <ul className="space-y-1 text-sm">
          {kept.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{c.name}</span>
              <span className="text-[12px] text-fg-3">
                {KIND_RU[c.kind]}
                {c.kind === 'honour' ? ` · фаза ${c.phase}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        !pending.length && <p className="text-sm text-fg-3">Карт пока нет.</p>
      )}
      <p className="text-[12px] text-fg-3">Agenda Achieved на руках: {agendas} из 3</p>
    </div>
  );
}

/** Награда ждёт выбора: игрок тянет карты из физической колоды и отмечает, какую оставил. */
function ClaimRow({ view, card, reload }: { view: CampaignView; card: CampaignCard; reload: () => Promise<unknown> }) {
  const me = view.me!;
  const owned = new Set(me.cards.map((c) => c.name).filter(Boolean));
  const deck = deckFor(view, card, me.alliance).filter((n) => !owned.has(n));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!deck.length)
    return (
      <p className="rounded-xl border border-white/10 p-2.5 text-sm text-fg-3">
        {KIND_RU[card.kind]}: все карты колоды уже у вас — выбрать нечего. Скажите Warmaster.
      </p>
    );
  const save = async () => {
    setBusy(true);
    const r = await claimCampaignCard(card.id, name);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    haptic.ok();
    await reload();
  };
  return (
    <div className="space-y-1.5 rounded-xl border border-accent/30 bg-accent/[0.05] p-2.5">
      <p className="text-sm">
        <Tag tone="accent">ждёт выбора</Tag> <b>{KIND_RU[card.kind]}</b>
        {card.kind === 'honour' ? ` (фаза ${card.phase})` : ''} —{' '}
        {card.draw > 1 ? `тяните ${card.draw} карты, оставьте одну` : 'тяните 1 карту'}
        {card.source === 'relic' ? ' (конец фазы, по Agenda Achieved)' : ''}
      </p>
      <select value={name} onChange={(e) => setName(e.target.value)} className={SELECT} aria-label="Какую карту оставили">
        <option value="">Какую карту оставили…</option>
        {deck.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-warn">{error}</p>}
      <Button className="w-full" disabled={!name || busy} onClick={() => void save()}>
        Оставить карту
      </Button>
    </div>
  );
}

function Phases({ view }: { view: CampaignView }) {
  if (!view.phases.length) return null;
  return (
    <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Фазы</p>
      {view.phases.map((p) => (
        <div key={p.phase} className="text-sm">
          <p>
            <b>Фаза {p.phase}</b> · {p.location?.name ?? '—'}
            {p.locationRoll ? <span className="text-fg-3"> · D6 {p.locationRoll}</span> : null}
            {p.status === 'open' && (
              <>
                {' '}
                <Tag tone="accent">идёт</Tag>
              </>
            )}
          </p>
          {p.status === 'resolved' && (
            <p className="text-[12px] text-fg-3">
              Контроль: {p.controller ? ALLIANCE_RU[p.controller] : 'никто'} · Ascendancy: {p.ascendant.length ? p.ascendant.map((a) => ALLIANCE_RU[a]).join(', ') : 'никто'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Battles({ view }: { view: CampaignView }) {
  if (!view.battles.length) return null;
  return (
    <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Битвы</p>
      {view.battles.map((b) => (
        <div key={b.id} className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0">
            <span className={b.result === 'p1' ? 'font-semibold' : ''}>{b.player1}</span> {b.vp1} : {b.vp2}{' '}
            <span className={b.result === 'p2' ? 'font-semibold' : ''}>{b.player2}</span>
          </span>
          <span className="shrink-0 text-[12px] text-fg-3">
            ф.{b.phase} · {fmtDate(b.playedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- «Начать игру»: подстановка из кампании и запись битвы ----------

/** Шаг «Кампания»: фаза и локация открытой фазы кампании (одной кнопкой). */
export function CampaignFill({ game, onPhase }: { game: GameHook; onPhase: (p: CampaignPhase) => void }) {
  const { view } = useCampaign();
  const d = game.state!.dominatus!;
  if (!hasCampaign(view) || !view.currentPhase) return null;
  const open = view.phases.find((p) => p.phase === view.currentPhase);
  if (!open?.location) return null;
  const same = d.phase === open.phase && d.locationId === open.location.id;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3 text-sm">
      <p>
        Кампания «{view.campaign.name}»: фаза {open.phase}, <b>{open.location.name}</b>
        {view.me ? ` · ваш альянс ${ALLIANCE_RU[view.me.alliance]}` : ''}
      </p>
      {!same && (
        <Button
          className="mt-2 w-full"
          onClick={() => {
            onPhase(open.phase as CampaignPhase);
            if (game.dispatch({ type: 'dom-location-set', phase: open.phase as CampaignPhase, locationId: open.location!.id, source: 'manual' })) haptic.ok();
          }}
        >
          Взять из кампании
        </Button>
      )}
    </div>
  );
}

/**
 * Итог битвы: «Записать битву в кампанию» — участник кампании выбирает, кто из игроков кампании сидел на каждом месте;
 * ПО, итог, Agenda и Agenda Achieved берутся из игры. Повторная запись той же игры обновляет битву (пока карты не выбраны).
 */
export function RecordBattle({ game }: { game: GameHook }) {
  const { view, reload } = useCampaign();
  const state = game.state!;
  const d = state.dominatus!;
  const mySeat = useMySeat();
  const result = battleResult(state, game.data!.catalog);
  const active = agendasActive(state);
  const [seats, setSeats] = useState<Record<Seat, number | null>>({ p1: null, p2: null });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaign = hasCampaign(view) ? view : null;
  // по умолчанию: имя игрока совпадает с именем в кампании; иначе я — на своём месте (два телефона) или на месте моего альянса
  const defaults = useMemo(() => {
    const out: Record<Seat, number | null> = { p1: null, p2: null };
    if (!campaign) return out;
    for (const s of SEATS) {
      const byName = campaign.players.filter((p) => p.name.toLowerCase() === state.players[s].name.trim().toLowerCase());
      if (byName.length === 1) out[s] = byName[0]!.id;
    }
    const me = campaign.me;
    if (me && !SEATS.some((s) => out[s] === me.playerId)) {
      const seat = mySeat ?? SEATS.find((s) => d.players[s].alliance === me.alliance && out[s] === null) ?? null;
      if (seat && out[seat] === null) out[seat] = me.playerId;
    }
    return out;
  }, [campaign, state.players, d.players, mySeat]);
  useEffect(() => setSeats(defaults), [defaults]);

  if (!campaign || !result || !d.phase) return null;
  if (!campaign.me) return <p className="text-[12px] text-fg-3">Кампания «{campaign.campaign.name}»: вы не в кампании — записать битву может только участник.</p>;
  if (campaign.currentPhase !== d.phase)
    return (
      <p className="text-[12px] text-fg-3">
        Кампания «{campaign.campaign.name}»: {campaign.currentPhase ? `идёт фаза ${campaign.currentPhase}` : 'фаза не начата'} — битву фазы {d.phase} не записать.
      </p>
    );

  const player = (id: number | null) => campaign.players.find((p) => p.id === id) ?? null;
  const recorded = campaign.battles.find((b) => b.gameKey === state.id) ?? null;
  // предел Agenda Achieved (3 на руках): видно только свои карты
  const mine = SEATS.find((s) => seats[s] === campaign.me!.playerId) ?? null;
  const held = campaign.me.cards.filter((c) => c.kind === 'agenda').length;
  const gaining = mine && active && !recorded ? d.players[mine].achieved ?? 0 : 0;
  const overLimit = gaining > 0 && held + gaining > 3 ? held + gaining - 3 : 0;
  const p1 = player(seats.p1);
  const p2 = player(seats.p2);
  const achievedMissing = active && SEATS.some((s) => d.players[s].achieved === null);
  const problem = !p1 || !p2
    ? 'Выберите игроков кампании'
    : p1.id === p2.id
      ? 'Игроки должны быть разными'
      : p1.alliance === p2.alliance
        ? 'Игроки должны быть из разных альянсов'
        : ![p1.id, p2.id].includes(campaign.me.playerId)
          ? 'Записать битву может только её участник'
          : achievedMissing
            ? 'Отметьте Agenda Achieved у обоих игроков'
            : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await recordCampaignBattle({
      gameKey: state.id,
      player1Id: p1!.id,
      player2Id: p2!.id,
      vp1: result.totals.p1,
      vp2: result.totals.p2,
      result: result.winner ?? 'draw',
      agenda1: active ? d.players.p1.agenda : null,
      agenda2: active ? d.players.p2.agenda : null,
      achieved1: active ? d.players.p1.achieved ?? 0 : 0,
      achieved2: active ? d.players.p2.achieved ?? 0 : 0,
      details: {
        mode: 'dominatus',
        phase: d.phase,
        locationId: d.locationId,
        names: { p1: state.players.p1.name, p2: state.players.p2.name },
        alliances: { p1: d.players.p1.alliance, p2: d.players.p2.alliance },
        upgrades: { p1: d.players.p1.upgrades, p2: d.players.p2.upgrades },
        by: result.by,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    haptic.ok();
    const lost = r.data.agendaLimitReached.length ? ` Предел Agenda Achieved (3): лишние карты не добавлены — ${r.data.agendaLimitReached.join(', ')}.` : '';
    setDone(`${r.data.updated ? 'Запись обновлена' : 'Битва записана'}. Выбор карт — в «Кампания Dominatus».${lost}`);
    await reload();
  };

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-sm font-semibold">Кампания «{campaign.campaign.name}»</p>
      {SEATS.map((s) => (
        <label key={s} className="block space-y-1">
          <span className="text-[12px] text-fg-3">
            {state.players[s].name}
            {d.players[s].alliance ? ` · ${ALLIANCE_RU[d.players[s].alliance as AllianceId]}` : ''} — игрок кампании
          </span>
          <select value={seats[s] ?? ''} onChange={(e) => setSeats({ ...seats, [s]: e.target.value ? Number(e.target.value) : null })} className={SELECT}>
            <option value="">—</option>
            {campaign.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.username ? ` (@${p.username})` : ''} · {ALLIANCE_RU[p.alliance]}
              </option>
            ))}
          </select>
        </label>
      ))}
      {recorded && !done && (
        <p className="text-xs text-accent">
          Битва уже записана: {recorded.player1} {recorded.vp1} : {recorded.vp2} {recorded.player2}. Записать ещё раз — обновить запись (пока никто не выбрал карту).
        </p>
      )}
      {overLimit > 0 && <p className="text-xs text-warn">У вас {held} Agenda Achieved из 3 — {overLimit === 1 ? 'одна новая карта пропадёт' : `${overLimit} новые карты пропадут`}.</p>}
      {problem && <p className="text-xs text-warn">{problem}</p>}
      {error && <p className="text-xs text-warn">{error}</p>}
      {done && <p className="text-xs text-accent">{done}</p>}
      <Button variant="primary" className="w-full" disabled={!!problem || busy} onClick={() => void submit()}>
        {done || recorded ? 'Обновить запись' : 'Записать битву в кампанию'}
      </Button>
    </div>
  );
}
