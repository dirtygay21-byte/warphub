import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadBattlefield, loadMissions, type BattlefieldData, type BfDeployment, type BfLayout, type MissionsData, type Pt } from '../data';
import { CapsNote, MissionCardView, SecondaryList } from './MissionCard';
import { openExternal, pushOverlay } from '../telegram';
import { Icon, IconButton } from './kit';
import { cx } from './util';

const LETTERS = ['A', 'B', 'C'];
const MISSIONS_URL = 'https://wahapedia.ru/wh40k11ed/the-rules/mission-deck-2026-27/';

// Цвета карты. Поле в дюймах: 60″ × 44″, на экране повёрнуто «портретом» (44 в ширину, 60 в высоту).
const C = {
  board: '#26261f',
  grid: 'rgba(255,255,255,0.06)',
  dense: '#4ade80',
  light: '#facc15',
  attacker: '#f87171',
  defender: '#60a5fa',
  wall: 'rgba(255,255,255,0.92)',
};

/** Точка поля (x вдоль 60″, y вдоль 44″) → экран: поворот на 90°, 44 по ширине. */
const disp = ([x, y]: Pt, h = 44): Pt => [h - y, x];
const ptsAttr = (poly: Pt[]) => poly.map((p) => disp(p).join(',')).join(' ');

/** Общая граница территорий защитника и атакующего — линия раздела поля. */
function divider(dep: BfDeployment): [Pt, Pt] | null {
  const d = dep.territories.find((t) => t.player === 'defender');
  const a = dep.territories.find((t) => t.player === 'attacker');
  if (!d || !a) return null;
  const shared = d.poly.filter((p) => a.poly.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01));
  return shared.length >= 2 ? [shared[0]!, shared[shared.length - 1]!] : null;
}

type Guide = BfLayout['guides'][number];

/** Край поля на экране (карта повёрнута): левый край поля — сверху, правый — снизу, верхний — справа, нижний — слева. */
const SCREEN_EDGE: Record<Guide['edge'], 'top' | 'bottom' | 'right' | 'left'> = { left: 'top', right: 'bottom', top: 'right', bottom: 'left' };
const EDGE_RU: Record<'top' | 'bottom' | 'right' | 'left', string> = {
  top: 'от верхнего края',
  bottom: 'от нижнего края',
  left: 'от левого края',
  right: 'от правого края',
};

/** 17.5 → «17½″», 16.25 → «16¼″», 12.34 → «12,34″». */
function inches(d: number): string {
  const whole = Math.floor(d + 1e-9);
  const frac = Math.round((d - whole) * 100) / 100;
  const q: Record<string, string> = { '0': '', '0.25': '¼', '0.5': '½', '0.75': '¾' };
  if (String(frac) in q) return `${whole || (frac ? '' : '0')}${q[String(frac)]}″`;
  return `${d.toFixed(2).replace('.', ',')}″`;
}

/** Линия «от края до элемента» в экранных координатах. */
function guideLine(g: Guide): { from: Pt; to: Pt; screen: 'top' | 'bottom' | 'right' | 'left' } {
  const to = disp(g.at);
  const screen = SCREEN_EDGE[g.edge];
  const from: Pt = screen === 'top' ? [to[0], 0] : screen === 'bottom' ? [to[0], 60] : screen === 'right' ? [44, to[1]] : [0, to[1]];
  return { from, to, screen };
}

function Guides({ guides }: { guides: Guide[] }) {
  return (
    <g>
      {guides.map((g, i) => {
        const { from, to, screen } = guideLine(g);
        const vertical = screen === 'top' || screen === 'bottom';
        // подпись — у середины линии, чуть сбоку; на коротких линиях — у края
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        const lx = vertical ? mx + 0.35 : mx;
        const ly = vertical ? my + 0.35 : my - 0.4;
        return (
          <g key={i}>
            <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#eaff44" strokeWidth={0.1} strokeDasharray="0.45 0.3" />
            <circle cx={to[0]} cy={to[1]} r={0.2} fill="#eaff44" />
            <text
              x={lx}
              y={ly}
              textAnchor={vertical ? 'start' : 'middle'}
              fontSize={1.05}
              fontWeight={700}
              fill="#eaff44"
              stroke="#111110"
              strokeWidth={0.32}
              paintOrder="stroke"
              fontFamily="Inter Tight, sans-serif"
            >
              {inches(g.d)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BattleMap({
  layout,
  dep,
  className,
  guides,
  selected,
  onSelect,
}: {
  layout: BfLayout;
  dep: BfDeployment;
  className?: string;
  /** какие размеры рисовать: все, ничего или только у выбранного элемента */
  guides?: 'all' | 'none' | 'selected';
  selected?: number | null;
  onSelect?: (piece: number | null) => void;
}) {
  const div = divider(dep);
  const shownGuides =
    guides === 'all' ? layout.guides : guides === 'selected' && selected != null ? layout.guides.filter((g) => g.piece === selected) : [];
  const ticks = Array.from({ length: 11 }, (_, i) => i * 6).filter((v) => v > 0 && v < 60);
  const ticksX = Array.from({ length: 8 }, (_, i) => i * 6).filter((v) => v > 0 && v < 44);
  return (
    <svg viewBox="-1.5 -1.5 47 63" className={className} role="img" aria-label={`Раскладка: ${dep.nameRu}`} onClick={onSelect ? () => onSelect(null) : undefined}>
      <rect x={0} y={0} width={44} height={60} rx={0.4} fill={C.board} />
      {/* сетка через 6″ */}
      <g stroke={C.grid} strokeWidth={0.08}>
        {ticks.map((v) => (
          <line key={'h' + v} x1={0} x2={44} y1={v} y2={v} />
        ))}
        {ticksX.map((v) => (
          <line key={'v' + v} y1={0} y2={60} x1={v} x2={v} />
        ))}
      </g>
      {/* зоны деплоя */}
      {dep.zones.map((z) => (
        <polygon key={z.player} points={ptsAttr(z.poly)} fill={C[z.player]} fillOpacity={0.16} stroke={C[z.player]} strokeWidth={0.22} strokeOpacity={0.85} />
      ))}
      {div && (
        <line x1={disp(div[0])[0]} y1={disp(div[0])[1]} x2={disp(div[1])[0]} y2={disp(div[1])[1]} stroke="rgba(255,255,255,0.45)" strokeWidth={0.16} strokeDasharray="0.8 0.6" />
      )}
      {/* участки террейна: плотный — зелёный, лёгкий — жёлтый */}
      {layout.pieces.map((p, i) => {
        if (p.kind !== 'area') return null;
        const c = p.cat === 'light' ? C.light : C.dense;
        const on = selected === i;
        return (
          <polygon
            key={'a' + i}
            points={ptsAttr(p.poly)}
            fill={c}
            fillOpacity={on ? 0.55 : selected != null ? 0.18 : 0.3}
            stroke={on ? '#fff' : c}
            strokeWidth={on ? 0.3 : 0.12}
            strokeLinejoin="round"
            onClick={onSelect ? (e) => (e.stopPropagation(), onSelect(on ? null : i)) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          />
        );
      })}
      {/* стены руин и прочие детали */}
      {layout.pieces
        .filter((p) => p.kind === 'feature')
        .map((p, i) =>
          p.walls?.length ? (
            <g key={'f' + i} pointerEvents="none" stroke={C.wall} strokeWidth={0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={p.floor ? 0.5 : 1}>
              {p.walls.map((w, j) => (
                <polyline key={j} points={ptsAttr(w)} strokeDasharray={p.floor ? '0.5 0.4' : undefined} />
              ))}
            </g>
          ) : (
            <polygon key={'f' + i} pointerEvents="none" points={ptsAttr(p.poly)} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.7)" strokeWidth={0.1} />
          ),
        )}
      {/* размеры для расстановки */}
      {shownGuides.length > 0 && <Guides guides={shownGuides} />}
      {/* маркеры целей (40 мм ≈ 1,6″) */}
      {layout.objectives.map((o, i) => {
        const [x, y] = disp([o.x, o.y]);
        return (
          <g key={'o' + i} pointerEvents="none">
            <circle cx={x} cy={y} r={0.79} fill="#111110" stroke="#fff" strokeWidth={0.22} />
            <circle cx={x} cy={y} r={0.25} fill={o.role === 'center' ? '#eaff44' : '#fff'} />
          </g>
        );
      })}
      {/* линейка по краям: каждые 6″ */}
      <g fill="rgba(255,255,255,0.45)" fontSize={1.05} fontFamily="Inter Tight, sans-serif">
        {ticks.map((v) => (
          <text key={'ty' + v} x={-0.35} y={v + 0.35} textAnchor="end">
            {v}
          </text>
        ))}
        {ticksX.map((v) => (
          <text key={'tx' + v} x={v} y={61.2} textAnchor="middle">
            {v}
          </text>
        ))}
      </g>
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-xl border px-2.5 py-2 text-left text-[13px] font-semibold leading-tight transition',
        active ? 'border-accent bg-accent/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/70 active:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

/** «Поле боя»: зоны деплоя и раскладки террейна Chapter Approved 2026–27 по паре типов армий. */
export function Battlefield({ onBack, initialDisposition }: { onBack: () => void; initialDisposition?: string | null }) {
  const [data, setData] = useState<BattlefieldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [foe, setFoe] = useState<string | null>(null);
  const [variant, setVariant] = useState(1);
  const [zoom, setZoom] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  // карты миссий грузятся отдельно; без них остаются названия миссий и ссылка на правила
  const [missions, setMissions] = useState<MissionsData | null>(null);
  const [side, setSide] = useState<'you' | 'foe'>('you');
  const [showSecondary, setShowSecondary] = useState(false);

  useEffect(() => {
    loadMissions().then(setMissions, () => setMissions(null));
  }, []);

  // открытая крупная карта закрывается кнопкой «Назад» Telegram
  useEffect(() => (zoom ? pushOverlay(() => (setZoom(false), setSelected(null))) : undefined), [zoom]);

  useEffect(() => {
    loadBattlefield().then((d) => {
      setData(d);
      // тип армии из ростера приходит английским названием («Take and Hold»)
      const mine = d.dispositions.find((x) => x.name === initialDisposition || x.id === initialDisposition)?.id ?? d.dispositions[0]!.id;
      setYou(mine);
      setFoe(mine);
    }, (e) => setError(String(e.message ?? e)));
  }, [initialDisposition]);

  const pairLayouts = useMemo(() => {
    if (!data || !you || !foe) return [];
    const key = [you, foe].sort().join('|');
    return data.layouts.filter((l) => l.pair.join('|') === key).sort((a, b) => a.variant - b.variant);
  }, [data, you, foe]);

  if (error) {
    return (
      <Shell onBack={onBack}>
        <p className="mt-10 text-center text-sm text-white/50">{error}</p>
      </Shell>
    );
  }
  if (!data || !you || !foe) {
    return (
      <Shell onBack={onBack}>
        <div className="mx-auto mt-16 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </Shell>
    );
  }

  const layout = pairLayouts.find((l) => l.variant === variant) ?? pairLayouts[0];
  const pick = (v: number) => (setVariant(v), setSelected(null));
  const dep = layout ? data.deployments.find((d) => d.id === layout.deployment) : undefined;
  const mission = (a: string, b: string) => {
    const m = data.matchups.find((x) => x.you === a && x.foe === b);
    return m ? data.missions[m.mission] ?? m.mission : '—';
  };
  const dName = (id: string) => data.dispositions.find((d) => d.id === id)!;
  const primaryId = (side === 'you' ? data.matchups.find((x) => x.you === you && x.foe === foe) : data.matchups.find((x) => x.you === foe && x.foe === you))?.mission;
  const primary = missions?.cards.find((c) => c.id === primaryId);

  return (
    <Shell onBack={onBack}>
      <section className="space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Ваш тип армии</p>
          <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-3">
            {data.dispositions.map((d) => (
              <Chip key={d.id} active={you === d.id} onClick={() => setYou(d.id)}>
                {d.nameRu}
                <span className="block text-[10.5px] font-normal text-white/40">{d.name}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Противник</p>
          <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-3">
            {data.dispositions.map((d) => (
              <Chip key={d.id} active={foe === d.id} onClick={() => setFoe(d.id)}>
                {d.nameRu}
                <span className="block text-[10.5px] font-normal text-white/40">{d.name}</span>
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Основная миссия</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(['you', 'foe'] as const).map((s) => {
            const [a, b] = s === 'you' ? ([you, foe] as const) : ([foe, you] as const);
            const active = missions != null && side === s;
            return (
              <button
                key={s}
                type="button"
                disabled={!missions}
                onClick={() => setSide(s)}
                className={cx('min-w-0 rounded-xl border px-2.5 py-2 text-left transition', active ? 'border-accent bg-accent/15' : 'border-transparent', missions && !active && 'active:bg-white/10')}
              >
                <span className="block text-[11px] text-white/45">
                  {s === 'you' ? 'Вы' : 'Противник'} · {dName(a).nameRu}
                </span>
                <span className={cx('block font-semibold', s === 'you' ? 'text-accent' : 'text-white/85')}>{mission(a, b)}</span>
              </button>
            );
          })}
        </div>
        {missions && primary && <MissionCardView card={primary} foeName={dName(side === 'you' ? foe : you).nameRu} className="mt-2.5" />}
        {missions && <CapsNote caps={missions.caps} />}
        <button type="button" onClick={() => openExternal(MISSIONS_URL)} className="mt-2 text-xs font-semibold text-accent/90 underline-offset-2 active:underline">
          Карты миссий на Wahapedia →
        </button>
      </section>

      {missions && (
        <section className="mt-3">
          <button
            type="button"
            onClick={() => setShowSecondary((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/40">Вторичные миссии</span>
              <span className="block text-sm font-semibold">{missions.cards.filter((c) => c.type === 'secondary').length} карт · одинаковы для атакующего и защитника</span>
            </span>
            <Icon name="down" className={cx('size-5 text-white/50 transition', showSecondary && 'rotate-180')} />
          </button>
          {showSecondary && (
            <div className="mt-2">
              <SecondaryList cards={missions.cards.filter((c) => c.type === 'secondary')} />
            </div>
          )}
        </section>
      )}

      {/* раскладки A / B / C */}
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {pairLayouts.map((l, i) => {
          const d = data.deployments.find((x) => x.id === l.deployment);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => pick(l.variant)}
              className={cx(
                'min-w-0 rounded-xl border px-2.5 py-2 text-left transition',
                layout?.id === l.id ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
              )}
            >
              <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">Раскладка</span>
              <span className="font-display block text-2xl font-semibold leading-none">{LETTERS[i]}</span>
              <span className="mt-1 block break-words text-[11px] leading-tight text-white/55">{d?.nameRu}</span>
            </button>
          );
        })}
      </div>

      {layout && dep && (
        <>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold uppercase leading-none">{dep.nameRu}</p>
              <p className="mt-0.5 text-xs text-white/45">{dep.name}</p>
            </div>
            <GuidesToggle on={showGuides} onChange={setShowGuides} />
          </div>
          <button type="button" onClick={() => setZoom(true)} className="mt-2 block w-full rounded-2xl border border-white/10 bg-black/30 p-2" aria-label="Открыть карту крупно">
            <BattleMap layout={layout} dep={dep} guides={showGuides ? 'all' : 'none'} className="mx-auto block w-full max-w-[420px]" />
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-white/40">
            Нажмите на карту, чтобы увеличить. На большой карте нажмите на элемент — останутся только его размеры.
            <br />
            Размеры — от края стола до отмеченной точки элемента · сетка 6″ · стол 44″ × 60″
          </p>
          <Legend />
        </>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-white/35">
        Раскладки Chapter Approved 2026–27 (Games Workshop), перерисованы по размерам.
        <br />
        Геометрия: Battlemaster ·{' '}
        <button type="button" className="font-semibold text-white/55 underline" onClick={() => openExternal(data.source.url)}>
          {data.source.credit}
        </button>{' '}
        v{data.source.version} (CC BY 4.0)
        {missions && (
          <>
            <br />
            Карты миссий: пересказ WarpHub на русском, структура и пары — {missions.source.name} v{missions.source.version}; сверено с картами GDM и wh-rules.ru.
          </>
        )}
      </p>

      {zoom && layout && dep && (
        <div className="fade-enter fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <p className="font-display min-w-0 flex-1 truncate text-lg font-semibold uppercase">
              Раскладка {LETTERS[layout.variant - 1]} · {dep.nameRu}
            </p>
            <GuidesToggle on={showGuides} onChange={(v) => (setShowGuides(v), setSelected(null))} />
            <IconButton icon="close" label="Закрыть" onClick={() => (setZoom(false), setSelected(null))} className="size-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-6">
            <BattleMap
              layout={layout}
              dep={dep}
              guides={selected != null ? 'selected' : showGuides ? 'all' : 'none'}
              selected={selected}
              onSelect={setSelected}
              className="block w-[200%] max-w-none"
            />
          </div>
          {selected != null && <PieceInfo layout={layout} index={selected} onClose={() => setSelected(null)} />}
        </div>
      )}
    </Shell>
  );
}

function GuidesToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cx(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        on ? 'border-accent bg-accent/15 text-accent' : 'border-white/15 text-white/60 active:bg-white/10',
      )}
    >
      {on ? 'Размеры: вкл' : 'Размеры: выкл'}
    </button>
  );
}

/** Карточка выбранного элемента: его размеры словами, по краям экрана. */
function PieceInfo({ layout, index, onClose }: { layout: BfLayout; index: number; onClose: () => void }) {
  const piece = layout.pieces[index];
  const gs = layout.guides.filter((g) => g.piece === index);
  return (
    <div className="sheet-enter border-t border-white/10 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{piece?.cat === 'light' ? 'Лёгкий террейн' : 'Плотный террейн'}</p>
        <IconButton icon="close" label="Показать все размеры" onClick={onClose} className="size-8" />
      </div>
      {gs.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {gs.map((g, i) => (
            <li key={i} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
              <span className="font-display block text-xl font-semibold leading-none text-accent">{inches(g.d)}</span>
              <span className="mt-1 block text-[11px] text-white/60">{EDGE_RU[SCREEN_EDGE[g.edge]]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-white/50">Для этого элемента размеров на карте нет.</p>
      )}
      <p className="mt-2 text-[11px] text-white/40">Меряйте от края стола до точки, отмеченной на карте. Ориентация — как на экране.</p>
    </div>
  );
}

export function Legend() {
  const item = (swatch: ReactNode, label: string) => (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
  const box = (c: string) => <span className="size-3 rounded-[3px] border" style={{ background: c + '4d', borderColor: c }} />;
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-white/65">
      {item(box(C.dense), 'Плотный террейн')}
      {item(box(C.light), 'Лёгкий террейн')}
      {item(box(C.defender), 'Зона защитника')}
      {item(box(C.attacker), 'Зона атакующего')}
      {item(<span className="h-0.5 w-3 rounded bg-white" />, 'Стены руин')}
      {item(<span className="h-0 w-3 border-t border-dashed border-accent" />, 'Размер от края, дюймы')}
      {item(
        <span className="flex size-3 items-center justify-center rounded-full border-2 border-white bg-black">
          <span className="size-1 rounded-full bg-accent" />
        </span>,
        'Цель (жёлтая — центр)',
      )}
    </div>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label="Назад" onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Chapter Approved 2026–27</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Поле боя</h1>
        </div>
      </header>
      {children}
    </div>
  );
}
