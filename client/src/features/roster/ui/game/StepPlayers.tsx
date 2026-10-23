import { useState } from 'react';
import { decodeRoster } from '../../engine/roster';
import type { DataIndex, Roster } from '../../engine/types';
import { SEATS, type RosterRef, type Seat } from '../../game';
import { haptic } from '../../telegram';
import { Button, Segmented } from '../kit';
import { cx, fmtPts } from '../util';
import { rosterRef } from './players';
import type { GameHook } from './useGame';

type Source = RosterRef['source'];

/** Шаг «Игроки»: имена и ростеры (свой из Roster Builder, код ростера соперника или только фракция). */
export function StepPlayers({ game, rosters, index, onNext }: { game: GameHook; rosters: Roster[]; index: DataIndex; onNext: () => void }) {
  return (
    <div className="mt-3 space-y-3">
      {SEATS.map((seat) => (
        <PlayerCard key={seat} seat={seat} game={game} rosters={rosters} index={index} />
      ))}
      <Button variant="primary" className="w-full" onClick={onNext}>
        Далее: типы армий
      </Button>
    </div>
  );
}

function PlayerCard({ seat, game, rosters, index }: { seat: Seat; game: GameHook; rosters: Roster[]; index: DataIndex }) {
  const p = game.state!.players[seat];
  const [name, setName] = useState(p.name);
  const [source, setSource] = useState<Source>(p.roster.source);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const factionName = (id?: string) => index.factions.find((f) => f.id === id)?.name ?? id ?? '—';
  const setRoster = (roster: RosterRef): boolean => {
    const ok = game.dispatch({ type: 'player-set', target: seat, patch: { roster } });
    if (ok) haptic.select();
    return ok;
  };

  const commitName = () => {
    const n = name.trim();
    if (n && n !== p.name) game.dispatch({ type: 'player-set', target: seat, patch: { name: n } });
    else setName(p.name);
  };

  const loadCode = () => {
    const c = code.trim();
    if (c.startsWith('AOS1.')) return setCodeErr('Это ростер Age of Sigmar — для этих миссий нужен ростер Warhammer 40,000.');
    try {
      const r = decodeRoster(c, index.factions.map((f) => f.id));
      if (setRoster(rosterRef(r, 'code'))) {
        setCode('');
        setCodeErr(null);
      }
    } catch (e) {
      const msg = e instanceof Error && e.message.startsWith('Ростер для') ? e.message : null;
      setCodeErr(msg ?? 'Не получилось прочитать код. Скопируйте его целиком (начинается с WH1.).');
      haptic.error();
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-3">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{seat === 'p1' ? 'Игрок 1' : 'Игрок 2'}</span>
        <input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white outline-none focus:border-accent"
        />
      </label>

      <Segmented<Source>
        className="mt-2.5"
        value={source}
        onChange={setSource}
        options={[
          { value: 'own', label: 'Мой ростер', disabled: !rosters.length },
          { value: 'code', label: 'Код ростера' },
          { value: 'none', label: 'Без ростера' },
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
                  onClick={() => setRoster(rosterRef(r, 'own'))}
                  className={cx(
                    'w-full rounded-lg border px-3 py-2 text-left transition',
                    active ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
                  )}
                >
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-[11px] text-white/45">
                    {factionName(r.factionId)}
                    {r.summary ? ` · ${fmtPts(r.summary.points)} очк.` : ''}
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
          {codeErr && <p className="mt-1.5 text-xs text-danger">{codeErr}</p>}
          <Button className="mt-1.5 w-full" disabled={!code.trim()} onClick={loadCode}>
            Загрузить ростер соперника
          </Button>
        </div>
      )}

      {source === 'none' && (
        <select
          value={p.roster.source === 'none' ? (p.roster.factionId ?? '') : ''}
          onChange={(e) => setRoster({ source: 'none', factionId: e.target.value || undefined })}
          className="mt-2 w-full rounded-lg border border-white/10 bg-app-elevated px-3 py-2 text-sm text-white outline-none focus:border-accent"
        >
          <option value="">Фракция не указана</option>
          {index.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}

      <p className="mt-2 text-xs text-white/55">
        {p.roster.source === 'none'
          ? p.roster.factionId
            ? `Без ростера · ${factionName(p.roster.factionId)}`
            : 'Без ростера'
          : `${p.roster.source === 'own' ? 'Ростер' : 'Ростер по коду'}: ${p.roster.name ?? '—'} · ${factionName(p.roster.factionId)}${p.roster.points ? ` · ${fmtPts(p.roster.points)} очк.` : ''}`}
      </p>
    </section>
  );
}
