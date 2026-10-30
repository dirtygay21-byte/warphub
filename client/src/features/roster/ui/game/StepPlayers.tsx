import { useState } from 'react';
import { decodeRoster } from '../../engine/roster';
import type { DataIndex, Roster } from '../../engine/types';
import { SEATS, type RosterRef, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button, Segmented } from '../kit';
import { cx, fmtPts } from '../util';
import { rosterRefFor } from './players';
import { useCanAct } from './cardViewer';
import { RosterButton } from './RosterViewer';
import type { GameHook } from './useGame';

type Source = 'own' | 'code';

/**
 * Шаг «Игроки и ростеры» (G2.12): у каждого игрока обязателен ростер — свой из Roster Builder или код ростера
 * соперника. Из ростера берутся детачменты и типы армий, которые они дают (из них игрок выберет тип армии).
 */
export function StepPlayers({ game, rosters, index, onNext }: { game: GameHook; rosters: Roster[]; index: DataIndex; onNext: () => void }) {
  const state = game.state!;
  const missing = SEATS.filter((s) => state.players[s].roster.source === 'none');
  return (
    <div className="mt-3 space-y-3">
      {SEATS.map((seat) => (
        <PlayerCard key={seat} seat={seat} game={game} rosters={rosters} index={index} />
      ))}
      {missing.length > 0 && <p className="text-xs text-warn">Нужен ростер: {missing.map((s) => state.players[s].name).join(', ')}</p>}
      <Button variant="primary" className="w-full" disabled={missing.length > 0} onClick={onNext}>
        Далее: типы армий
      </Button>
    </div>
  );
}

function PlayerCard({ seat, game, rosters, index }: { seat: Seat; game: GameHook; rosters: Roster[]; index: DataIndex }) {
  const p = game.state!.players[seat];
  // два телефона: чужую карточку только видно — ростер и имя выбирает сам игрок у себя
  const canAct = useCanAct(seat);
  const locked = game.state!.dispositionsRevealed || !canAct;
  const [name, setName] = useState(p.name);
  const [source, setSource] = useState<Source>(p.roster.source === 'code' || !rosters.length ? 'code' : 'own');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const factionName = (id?: string) => index.factions.find((f) => f.id === id)?.name ?? id ?? '—';
  const dName = (id: string) => game.data!.battlefield.dispositions.find((d) => d.id === id)?.nameRu ?? id;

  // ростер → снимок для игры (детачменты, типы армий, код); ошибка — под карточкой
  const pick = async (r: Roster, src: Source): Promise<boolean> => {
    setBusy(true);
    const ref = await rosterRefFor(r, src, game.data!.battlefield);
    setBusy(false);
    if (typeof ref === 'string') {
      setErr(ref);
      haptic.error();
      return false;
    }
    const ok = game.dispatch({ type: 'player-set', target: seat, patch: { roster: ref } });
    if (ok) {
      setErr(null);
      haptic.select();
    }
    return ok;
  };

  const commitName = () => {
    const n = name.trim();
    if (n && n !== p.name) game.dispatch({ type: 'player-set', target: seat, patch: { name: n } });
    else setName(p.name);
  };

  const loadCode = async () => {
    const c = code.trim();
    if (c.startsWith('AOS1.')) return setErr('Это ростер Age of Sigmar — для этих миссий нужен ростер Warhammer 40,000.');
    let r: Roster;
    try {
      r = decodeRoster(c, index.factions.map((f) => f.id));
    } catch (e) {
      const msg = e instanceof Error && e.message.startsWith('Ростер для') ? e.message : null;
      setErr(msg ?? 'Не получилось прочитать код. Скопируйте его целиком (начинается с WH1.).');
      haptic.error();
      return;
    }
    if (await pick(r, 'code')) setCode('');
  };

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <label className="block">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'}</span>
        <input
          value={name}
          disabled={!canAct}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white outline-none focus:border-accent"
        />
      </label>

      <RosterSummary roster={p.roster} seat={seat} factionName={factionName} dName={dName} />

      {locked ? (
        <p className="mt-2 text-[12px] text-fg-3">
          {canAct ? 'Типы армий раскрыты — ростер больше не меняется.' : `Ростер выбирает ${p.name} на своём телефоне.`}
        </p>
      ) : (
        <>
          <Segmented<Source>
            className="mt-2.5"
            value={source}
            onChange={setSource}
            options={[
              { value: 'own', label: 'Мой ростер', disabled: !rosters.length },
              { value: 'code', label: 'Код ростера' },
            ]}
          />

          {source === 'own' && (
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {rosters.map((r) => {
                const active = p.roster.source === 'own' && p.roster.rosterId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void pick(r, 'own')}
                      className={cx(
                        'w-full rounded-lg border px-3 py-2 text-left transition disabled:opacity-60',
                        active ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
                      )}
                    >
                      <span className="block truncate text-sm font-semibold">{r.name}</span>
                      <span className="block text-[12px] text-fg-3">
                        {factionName(r.factionId)}
                        {r.summary ? ` · ${fmtPts(r.summary.points)} очк.` : ''}
                        {r.forceDisposition ? ` · ${r.forceDisposition}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {source === 'code' && (
            <div className="mt-2">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={3}
                placeholder="WH1.eyJ2Ijox…"
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 font-mono text-xs text-white outline-none focus:border-accent"
              />
              <p className="mt-1 text-[12px] text-fg-3">Код ростера: WarpBuilder → ростер → «Экспорт» → код.</p>
              <Button className="mt-1.5 w-full" disabled={!code.trim() || busy} onClick={() => void loadCode()}>
                Загрузить ростер по коду
              </Button>
            </div>
          )}
        </>
      )}
      {err && <p className="mt-1.5 text-xs text-danger">{err}</p>}
    </section>
  );
}

/** Выбранный ростер: название, фракция, очки, детачменты, типы армий; кнопка просмотра в режиме мастера. */
function RosterSummary({ roster, seat, factionName, dName }: { roster: RosterRef; seat: Seat; factionName: (id?: string) => string; dName: (id: string) => string }) {
  if (roster.source === 'none') return <p className="mt-2 text-xs text-warn">Ростер не выбран.</p>;
  return (
    <div className="mt-2 rounded-lg border border-accent/30 bg-accent/[0.06] px-2.5 py-2 text-xs leading-relaxed">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{roster.name ?? '—'}</p>
        <RosterButton seat={seat} />
      </div>
      <p className="text-fg-2">
        {roster.source === 'own' ? 'Свой ростер' : 'Ростер по коду'} · {factionName(roster.factionId)}
        {roster.points ? ` · ${fmtPts(roster.points)} очк.` : ''}
      </p>
      {roster.detachments?.length ? <p className="text-fg-2">Детачмент: {roster.detachments.join(', ')}</p> : null}
      {roster.dispositions?.length ? <p className="text-fg-2">Типы армий: {roster.dispositions.map(dName).join(', ')}</p> : null}
    </div>
  );
}
