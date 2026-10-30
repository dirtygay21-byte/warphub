import type { AosIndex, AosRoster } from '../aos/types';
import type { Roster } from '../engine/types';
import type { KtRoster } from '../kt/roster';
import type { WarcryRoster } from '../warcry/roster';
import { haptic } from '../telegram';
import { Icon, IconButton } from './kit';
import { cx, fmtPts } from './util';

export type GameSystem = '40k' | 'aos' | 'kt' | 'warcry';

type GameTile = { id: GameSystem; name: string; sub: string; ready: boolean };
const GAMES: GameTile[] = [
  { id: '40k', name: 'Warhammer 40,000', sub: '11-я редакция', ready: true },
  { id: 'aos', name: 'Age of Sigmar', sub: '4-я редакция · GH 2026-27', ready: true },
  { id: 'kt', name: 'Kill Team', sub: 'редакция 2024 · KTDash', ready: true },
  { id: 'warcry', name: 'Warcry', sub: 'Matched Play · warcry_data', ready: true },
];

/**
 * WarpBuilder (30.10.2026, бывший Roster Builder): одно меню на все игры — плитки игр со счётом ростеров и последние
 * ростеры всех игр. Внутри игры — её ростеры и инструменты («Начать игру», Test Army, правила).
 */
export function Home({
  onExit,
  rosters,
  aosRosters,
  ktRosters,
  wcRosters,
  aosIndex,
  onGame,
  onOpen,
}: {
  onExit: () => void;
  rosters: Roster[];
  aosRosters: AosRoster[];
  ktRosters: KtRoster[];
  wcRosters: WarcryRoster[];
  aosIndex: AosIndex | null;
  onGame: (g: GameSystem) => void;
  onOpen: (g: GameSystem, id: string) => void;
}) {
  const count = (g: GameTile['id']) => (g === '40k' ? rosters.length : g === 'aos' ? aosRosters.length : g === 'kt' ? ktRosters.length : wcRosters.length);
  const recent = [
    ...rosters.map((r) => ({ g: '40k' as const, id: r.id, name: r.name, pts: r.summary?.points, at: r.updatedAt, sub: 'Warhammer 40,000' })),
    ...ktRosters.map((r) => ({ g: 'kt' as const, id: r.id, name: r.name, pts: undefined as number | undefined, at: r.updatedAt, sub: `Kill Team · оперативников: ${r.operatives.length}` })),
    ...wcRosters.map((r) => ({ g: 'warcry' as const, id: r.id, name: r.name, pts: r.summary?.points, at: r.updatedAt, sub: `Warcry · бойцов: ${r.fighters.length}` })),
    ...aosRosters.map((r) => ({ g: 'aos' as const, id: r.id, name: r.name, pts: r.summary?.points, at: r.updatedAt, sub: aosIndex?.factions.find((f) => f.id === r.factionId)?.name ?? 'Age of Sigmar' })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-5 flex items-end gap-3">
        <IconButton icon="back" label="Назад в WarpHub" onClick={onExit} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpHub</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">WarpBuilder</h1>
        </div>
      </header>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Игры</p>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={!g.ready}
            onClick={() => g.ready && (haptic.tap(), onGame(g.id))}
            className={cx(
              'flex min-h-28 flex-col justify-between rounded-2xl border p-3.5 text-left transition',
              g.ready ? 'border-white/10 bg-white/[0.04] active:bg-white/10' : 'border-white/5 bg-white/[0.02] opacity-50',
            )}
          >
            <span className="font-display block text-lg font-semibold uppercase leading-tight">{g.name}</span>
            <span className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[11px] text-white/45">{g.sub}</span>
              {g.ready && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{count(g.id)}</span>}
            </span>
          </button>
        ))}
      </div>
      <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/40">Последние ростеры</p>
      {!recent.length ? (
        <p className="text-sm text-white/50">Ростеров пока нет — выберите игру и соберите первую армию.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((r) => (
            <li key={r.g + r.id}>
              <button type="button" onClick={() => (haptic.tap(), onOpen(r.g, r.id))} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left active:bg-white/10">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block truncate text-[11px] text-white/45">
                    {r.g === '40k' ? '40K · ' : r.g === 'aos' ? 'AoS · ' : ''}{r.sub}
                    {r.pts != null ? ` · ${fmtPts(r.pts)} очк.` : ''}
                  </span>
                </span>
                <Icon name="chevron" className="size-4 text-white/40" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
