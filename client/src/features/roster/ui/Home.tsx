import type { AosIndex, AosRoster } from '../aos/types';
import type { Roster } from '../engine/types';
import type { KtRoster } from '../kt/roster';
import type { WarcryRoster } from '../warcry/roster';
import { haptic } from '../telegram';
import { Icon, IconButton } from './kit';
import { cx, fmtPts, plural } from './util';
import { LimeHero, Worm } from '@/components/ui/ds/Lime';
import { BATTLE_SIZES } from '../engine/rules';
import { WARCRY_LIMITS } from '../warcry/roster';

export type GameSystem = '40k' | 'aos' | 'kt' | 'warcry';

type GameTile = { id: GameSystem; code: string; name: string; sub: string; ready: boolean; noun: [string, string, string]; tint: string };
// плитки игр по концепту (D4b): крупный код игры, название, счёт ростеров; у каждой игры свой оттенок
const GAMES: GameTile[] = [
  { id: '40k', code: '40K', name: 'Warhammer 40,000', sub: '11-я редакция', ready: true, noun: ['ростер', 'ростера', 'ростеров'], tint: 'from-[#26281A]' },
  { id: 'aos', code: 'AoS', name: 'Age of Sigmar', sub: '4-я редакция · GH 2026-27', ready: true, noun: ['ростер', 'ростера', 'ростеров'], tint: 'from-[#1D2626]' },
  { id: 'kt', code: 'KT', name: 'Kill Team', sub: 'редакция 2024', ready: true, noun: ['команда', 'команды', 'команд'], tint: 'from-[#26201D]' },
  { id: 'warcry', code: 'WC', name: 'Warcry', sub: 'Matched Play', ready: true, noun: ['варбанда', 'варбанды', 'варбанд'], tint: 'from-[#241D26]' },
];
const CODE: Record<GameSystem, string> = { '40k': '40K', aos: 'AoS', kt: 'KT', warcry: 'WC' };

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
  resume,
}: {
  onExit: () => void;
  rosters: Roster[];
  aosRosters: AosRoster[];
  ktRosters: KtRoster[];
  wcRosters: WarcryRoster[];
  aosIndex: AosIndex | null;
  onGame: (g: GameSystem) => void;
  onOpen: (g: GameSystem, id: string) => void;
  /** «Продолжить» (14.11.2026): последняя игра или Test Army */
  resume?: { title: string; sub: string; onClick: () => void } | null;
}) {
  const count = (g: GameTile['id']) => (g === '40k' ? rosters.length : g === 'aos' ? aosRosters.length : g === 'kt' ? ktRosters.length : wcRosters.length);
  const recent = [
    ...rosters.map((r) => ({ g: '40k' as const, id: r.id, name: r.name, pts: r.summary?.points, limit: BATTLE_SIZES[r.battleSize]?.points as number | undefined, draft: false, at: r.updatedAt, sub: `Warhammer 40,000 · ${BATTLE_SIZES[r.battleSize]?.label ?? ''}` })),
    ...ktRosters.map((r) => ({ g: 'kt' as const, id: r.id, name: r.name, pts: undefined as number | undefined, limit: undefined as number | undefined, draft: r.operatives.length === 0, at: r.updatedAt, sub: r.operatives.length ? `Kill Team · ${r.operatives.length} ${plural(r.operatives.length, ['оперативник', 'оперативника', 'оперативников'])}` : 'Пусто — добавьте оперативников' })),
    ...wcRosters.map((r) => ({ g: 'warcry' as const, id: r.id, name: r.name, pts: r.summary?.points, limit: WARCRY_LIMITS.points as number | undefined, draft: false, at: r.updatedAt, sub: `Warcry · ${r.fighters.length} ${plural(r.fighters.length, ['боец', 'бойца', 'бойцов'])}` })),
    ...aosRosters.map((r) => ({ g: 'aos' as const, id: r.id, name: r.name, pts: r.summary?.points, limit: r.pointsLimit as number | undefined, draft: false, at: r.updatedAt, sub: aosIndex?.factions.find((f) => f.id === r.factionId)?.name ?? 'Age of Sigmar' })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);
  return (
    <div className="ds-enter mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 text-fg lg:max-w-4xl lg:pt-8">
      <header className="mb-5 flex items-end gap-3">
        <IconButton icon="back" label="Назад в WarpHub" onClick={onExit} className="mb-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Ростеры и игры</p>
          <h1 className="font-display mt-1 text-[32px] font-bold uppercase leading-none">Warp<span className="text-accent">Builder</span></h1>
        </div>
      </header>
      {resume && (
        <button
          type="button"
          onClick={() => (haptic.tap(), resume.onClick())}
          className="ds-press relative mb-3 flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-2xl bg-accent px-3.5 py-3 text-left text-[#111110]"
        >
          {/* лаймовый концепт (15.11.2026): «Продолжить» — главный блок экрана, лаймовый с червяком */}
          <svg aria-hidden="true" width="110" height="80" viewBox="0 0 110 80" className="pointer-events-none absolute right-0 top-0">
            <Worm x={104} y={0} angle={50} period={120} amp={13} width={16} seconds={5} />
          </svg>
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#111110] text-accent">
            <Icon name="play" className="size-5" />
          </span>
          <span className="relative min-w-0 flex-1 pr-10">
            <span className="font-display block text-[13px] font-semibold uppercase tracking-[0.1em]">Продолжить</span>
            <span className="block truncate text-base font-bold">{resume.title}</span>
            <span className="block truncate text-[13px] text-[#111110]/75">{resume.sub}</span>
          </span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {GAMES.map((g, i) => {
          const n = count(g.id);
          return (
            <button
              key={g.id}
              type="button"
              disabled={!g.ready}
              onClick={() => g.ready && (haptic.tap(), onGame(g.id))}
              className={cx(
                'flex h-32 flex-col justify-between rounded-[18px] border bg-gradient-to-br to-[#1A1A18] to-70% p-3.5 text-left',
                g.tint,
                g.ready ? 'ds-press' : 'opacity-50',
                i === 0 ? 'border-accent/[0.18]' : 'border-white/10',
              )}
            >
              <span className="font-display text-[26px] font-bold leading-none text-accent">{g.code}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold leading-tight">{g.name}</span>
                <span className="text-[13px] text-fg-2">{n === 0 ? 'Пока пусто' : `${n} ${plural(n, g.noun)}`}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mb-2.5 mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Недавние</p>
      {!recent.length ? (
        resume ? (
          <p className="text-sm text-fg-2">Ростеров пока нет — выберите игру и соберите первую армию.</p>
        ) : (
          <LimeHero kicker="Ростеров пока нет" title="Соберите первую армию" size="sm">
            <p className="text-[14px] leading-snug">Выберите игру выше — ростер появится здесь.</p>
          </LimeHero>
        )
      ) : (
        <ul className="ds-stagger space-y-2.5">
          {recent.map((r) => {
            const over = r.pts != null && r.limit != null && r.pts > r.limit;
            return (
              <li key={r.g + r.id}>
                <button type="button" onClick={() => (haptic.tap(), onOpen(r.g, r.id))} className="ds-press flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-app-elevated px-3.5 py-3 text-left">
                  <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/[0.12] text-sm font-bold text-accent">{CODE[r.g]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{r.name}</span>
                    <span className="block truncate text-sm text-fg-2">{r.sub}</span>
                  </span>
                  {r.draft ? (
                    <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-lg bg-warn/15 px-2.5 text-[12px] font-semibold text-warn">Черновик</span>
                  ) : r.pts != null ? (
                    <span className="flex shrink-0 flex-col items-end">
                      <span className={cx('text-base font-bold tabular-nums', over ? 'text-danger' : 'text-fg')}>{fmtPts(r.pts)}</span>
                      {r.limit != null && <span className="whitespace-nowrap text-[12px] text-fg-3">из {fmtPts(r.limit)}</span>}
                    </span>
                  ) : (
                    <Icon name="chevron" className="size-4 shrink-0 text-fg-3" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
