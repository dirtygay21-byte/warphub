import { useEffect, useState, type ReactNode } from 'react';
import type { KtMapData, WarcryDeployment } from '../../skirmish/types';
import type { Pt } from '../../testarmy';
import { openExternal, pushOverlay } from '../../telegram';
import { IconButton } from '../kit';
import { cx } from '../util';

const disp = ([x, y]: Pt): Pt => [22 - y, x];
const points = (poly: Pt[]) => poly.map((p) => disp(p).join(',')).join(' ');
const polygonArea = (poly: Pt[]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const validTerrain = (poly: Pt[]) => poly.length >= 3 && polygonArea(poly) >= 0.2;
const P1 = '#60a5fa';
const P2 = '#fb923c';
const ACCENT = '#eaff44';
const BOARD = '#1b1d22';

function GuideLine({ from, to, label }: { from: Pt; to: Pt; label: string }) {
  const [x1, y1] = disp(from);
  const [x2, y2] = disp(to);
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={0.1} strokeDasharray="0.45 0.3" />
      <circle cx={x2} cy={y2} r={0.2} fill={ACCENT} />
      <text x={x2 + 0.35} y={y2 + 0.35} fontSize={0.95} fontWeight={700} fill={ACCENT} stroke="#111110" strokeWidth={0.28} paintOrder="stroke">{label}</text>
    </g>
  );
}

function edgeGuide(edge: 'left' | 'right' | 'top' | 'bottom', at: Pt, d: number) {
  const [x, y] = at;
  const from = edge === 'left' ? [0, y] : edge === 'right' ? [30, y] : edge === 'top' ? [x, 0] : [x, 30];
  return <GuideLine from={from as Pt} to={at} label={`${d}″`} />;
}

type PanelOptions = { showGuides: boolean; large: boolean; onSelect: (id: string) => void; selected: string | null };

function SkirmishMapPanel({
  title,
  subtitle,
  sourceName,
  sourceUrl,
  legend,
  details,
  children,
  interactive = true,
}: {
  title: string;
  subtitle?: string;
  sourceName: string;
  sourceUrl: string;
  legend: ReactNode;
  details: (selected: string) => ReactNode;
  children: (options: PanelOptions) => ReactNode;
  interactive?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => (zoom ? pushOverlay(() => (setZoom(false), setSelected(null))) : undefined), [zoom]);
  const onSelect = (id: string) => setSelected((current) => (current === id ? null : id));
  if (!interactive) return children({ showGuides: true, large: false, onSelect: () => undefined, selected: null });
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold uppercase leading-none">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowGuides((value) => !value)}
          className={cx('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition', showGuides ? 'border-accent bg-accent/15 text-accent' : 'border-white/15 text-fg-2 active:bg-white/10')}
        >
          {showGuides ? 'Размеры: вкл' : 'Размеры: выкл'}
        </button>
      </div>
      <button type="button" onClick={() => setZoom(true)} className="mt-2 block w-full rounded-2xl border border-white/10 bg-black/30 p-2 text-left" aria-label="Открыть карту крупно">
        {children({ showGuides, large: false, onSelect, selected })}
      </button>
      <p className="mt-1.5 text-center text-[12px] leading-relaxed text-fg-3">Нажмите на карту, чтобы увеличить. На большой карте нажмите на элемент — останутся его размеры и исходная позиция.</p>
      {legend}
      {zoom && (
        <div className="fade-enter fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <p className="font-display min-w-0 flex-1 truncate text-lg font-semibold uppercase">{title}</p>
            <IconButton icon="close" label="Закрыть" onClick={() => (setZoom(false), setSelected(null))} className="size-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-6">{children({ showGuides, large: true, onSelect, selected })}</div>
          {selected && <div className="sheet-enter border-t border-white/10 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{details(selected)}</div>}
        </div>
      )}
      <p className="mt-3 text-center text-[12px] leading-relaxed text-fg-3">
        Источник геометрии: <button type="button" className="font-semibold text-fg-3 underline" onClick={() => openExternal(sourceUrl)}>{sourceName}</button>
      </p>
    </div>
  );
}

function KtMapSvg({ map, showGuides, large, onSelect, selected }: PanelOptions & { map: KtMapData }) {
  const select = (id: string) => onSelect(id);
  return (
    <svg viewBox="-1.5 -1.5 25 33" className={cx('w-full rounded-xl border border-white/10 bg-[#1b1d22]', large && 'w-[200%] max-w-none')} role="img" aria-label={`${map.killzone}, карта ${map.map}`}>
      <rect x={0} y={0} width={22} height={30} fill={BOARD} />
      {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={i * 2 + 2} y1={0} x2={i * 2 + 2} y2={30} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
      {Array.from({ length: 15 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 2 + 2} x2={22} y2={i * 2 + 2} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
      {(['p1', 'p2'] as const).map((side) => (
        <g key={`territory-${side}`} pointerEvents="none">
          {map.territories[side].map((poly, i) => <polygon key={i} points={points(poly)} fill={side === 'p1' ? P1 : P2} fillOpacity={0.06} stroke="none" />)}
        </g>
      ))}
      {(['p1', 'p2'] as const).map((side) => (
        <g key={`drop-${side}`}>
          {map.zones[side].map((poly, i) => {
            const id = `drop-${side}-${i}`;
            return <polygon key={id} points={points(poly)} fill={side === 'p1' ? P1 : P2} fillOpacity={selected === id ? 0.32 : 0.16} stroke={side === 'p1' ? P1 : P2} strokeWidth={selected === id ? 0.3 : 0.14} strokeOpacity={0.85} onClick={() => select(id)} style={{ cursor: 'pointer' }} />;
          })}
        </g>
      ))}
      {map.features.map((feature, i) => {
        const id = `feature-${i}`;
        const hasPoly = validTerrain(feature.poly);
        return (
          <g key={id} onClick={() => select(id)} style={{ cursor: 'pointer' }}>
            {hasPoly && <polygon points={points(feature.poly)} fill="rgba(92,112,96,0.8)" stroke={selected === id ? ACCENT : 'rgba(170,190,175,0.45)'} strokeWidth={selected === id ? 0.3 : 0.1} />}
            <circle data-feature-id={id} cx={disp([feature.x, feature.y])[0]} cy={disp([feature.x, feature.y])[1]} r={0.9} fill="transparent" stroke="none" style={{ cursor: 'pointer' }} />
            <text x={disp([feature.x, feature.y])[0]} y={disp([feature.x, feature.y])[1] + 0.25} fontSize={0.78} fontWeight={700} textAnchor="middle" fill="#f4f4f0" stroke="#111110" strokeWidth={0.22} paintOrder="stroke" pointerEvents="none">{feature.label}</text>
          </g>
        );
      })}
      {map.walls.map((line, i) => <polyline key={`wall-${i}`} points={points(line)} fill="none" stroke="rgba(255,255,255,0.78)" strokeWidth={0.26} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />)}
      {map.doors.map((line, i) => <polyline key={`door-${i}`} points={points(line)} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={0.28} strokeDasharray="0.5 0.4" strokeLinecap="round" pointerEvents="none" />)}
      <line x1={11} y1={0} x2={11} y2={30} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      <line x1={0} y1={15} x2={22} y2={15} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      {showGuides && map.guides.map((guide, i) => <g key={`guide-${i}`}>{edgeGuide(guide.edge, guide.at, guide.d)}</g>)}
      {map.objectives.map((objective) => {
        const [x, y] = disp([objective.x, objective.y]);
        const color = objective.id === 'centre' ? '#facc15' : objective.id === 'home' ? P1 : P2;
        const short = objective.id === 'centre' ? 'C' : objective.id === 'home' ? 'H' : 'E';
        return (
          <g key={objective.id} pointerEvents="none">
            <circle cx={x} cy={y} r={0.79} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={0.12} />
            <circle cx={x} cy={y} r={0.38} fill={color} />
            <text x={x} y={y + 0.25} fontSize={0.62} fontWeight={700} textAnchor="middle" fill="#16181c">{short}</text>
          </g>
        );
      })}
      <rect x={0} y={0} width={22} height={30} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={0.2} pointerEvents="none" />
    </svg>
  );
}

function KtLegend() {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-fg-2">
      <span><b className="text-[#60a5fa]">■</b> P1: drop zone и территория</span>
      <span><b className="text-[#fb923c]">■</b> P2: drop zone и территория</span>
      <span><b className="text-[#5c7060]">■</b> Террейн и подписи элементов</span>
      <span><b className="text-[#facc15]">C</b> Centre · <b className="text-[#60a5fa]">H</b> Home · <b className="text-[#fb923c]">E</b> Enemy</span>
      <span><b className="text-white/80">━</b> Стены и двери</span>
      <span><b className="text-[#eaff44]">┄</b> Размер drop zone, дюймы</span>
    </div>
  );
}

export function KtMapPanel({ map, interactive = true }: { map: KtMapData; interactive?: boolean }) {
  const details = (selected: string) => {
    if (selected.startsWith('drop-')) {
      const side = selected.split('-')[1] as 'p1' | 'p2';
      const guides = map.guides.filter((g) => g.side === side);
      return (
        <div>
          <p className="text-sm font-semibold">{side === 'p1' ? 'Player 1' : 'Player 2'} · Drop zone</p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {guides.map((g, i) => <li key={i} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2"><span className="font-display block text-xl font-semibold text-accent">{g.d}″</span><span className="text-[12px] text-fg-2">Ширина drop zone от края {g.edge}</span></li>)}
          </ul>
        </div>
      );
    }
    const index = Number(selected.split('-')[1]);
    const feature = map.features[index];
    if (!feature) return null;
    return <p className="text-sm"><b>Элемент {feature.label}</b> · позиция на исходной карте: {feature.x}″, {feature.y}″. Подпись и контур получены из Wahapedia.</p>;
  };
  return (
    <SkirmishMapPanel title={`${map.killzone} · Map ${map.map}`} subtitle="Approved Ops 2025 · поле 30×22″" sourceName="Wahapedia" sourceUrl={map.sourceImage} legend={<KtLegend />} details={details} interactive={interactive}>
      {(options) => <KtMapSvg map={map} {...options} />}
    </SkirmishMapPanel>
  );
}

function pointPosition(point: { sourceX: number; sourceY: number }) {
  return [point.sourceX, point.sourceY] as Pt;
}

function WarcryDeploymentSvg({ deployment, color, showGuides, large, onSelect, selected }: PanelOptions & { deployment: WarcryDeployment; color: string }) {
  const labels = { dagger: 'D', shield: 'S', hammer: 'H' } as const;
  const offboardX = deployment.points.map((p) => p.sourceX);
  const offboardY = deployment.points.map((p) => p.sourceY);
  const minX = Math.min(-1.5, ...offboardX, deployment.orientation.at[0]);
  const maxX = Math.max(23.5, ...offboardX);
  const minY = Math.min(-1.5, ...offboardY, deployment.orientation.at[1]);
  const maxY = Math.max(31.5, ...offboardY);
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className={cx('w-full rounded-xl border border-white/10 bg-[#1b1d22]', large && 'w-[200%] max-w-none')} role="img" aria-label={`${deployment.name}, ${color === 'red' ? 'красные' : 'синие'}`}>
      <rect x={0} y={0} width={22} height={30} fill={BOARD} />
      {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={i * 2 + 2} y1={0} x2={i * 2 + 2} y2={30} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
      {Array.from({ length: 15 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 2 + 2} x2={22} y2={i * 2 + 2} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
      <line x1={11} y1={0} x2={11} y2={30} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      <line x1={0} y1={15} x2={22} y2={15} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      {showGuides && deployment.guides.map((guide, i) => <GuideLine key={`guide-${i}`} from={guide.from} to={guide.to} label={`${guide.d}″`} />)}
      {deployment.points.map((point, index) => {
        const [x, y] = disp(pointPosition(point));
        const own = point.side === color;
        const tone = own ? '#f87171' : '#60a5fa';
        const id = `point-${index}`;
        return (
          <g key={id} onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
            {!point.reserve && <circle cx={x} cy={y} r={3} fill={tone} fillOpacity={selected === id ? 0.18 : 0.07} stroke={tone} strokeOpacity={0.55} strokeWidth={0.1} strokeDasharray="0.45 0.35" />}
            <circle data-point-id={id} cx={x} cy={y} r={0.9} fill="transparent" stroke="none" style={{ cursor: 'pointer' }} />
            <circle cx={x} cy={y} r={0.48} fill={tone} stroke={selected === id ? ACCENT : BOARD} strokeWidth={selected === id ? 0.3 : 0.12} pointerEvents="none" />
            <text x={x} y={y + 0.28} fontSize={0.68} fontWeight={700} textAnchor="middle" fill="#16181c" pointerEvents="none">{labels[point.group]}</text>
            {point.reserve && <text x={x > 20 ? x - 0.75 : x + 0.75} y={y - 0.65} fontSize={0.68} fontWeight={700} textAnchor={x > 20 ? 'end' : 'start'} fill={tone} pointerEvents="none">RND{point.reserve}</text>}
          </g>
        );
      })}
      <g pointerEvents="none">
        <line x1={deployment.orientation.at[0]} y1={deployment.orientation.at[1] - 1} x2={deployment.orientation.at[0]} y2={deployment.orientation.at[1] + 1} stroke={ACCENT} strokeWidth={0.18} />
        <text x={deployment.orientation.at[0]} y={deployment.orientation.at[1] - 1.25} fontSize={0.72} fontWeight={700} textAnchor="middle" fill={ACCENT}>↕</text>
      </g>
      <rect x={0} y={0} width={22} height={30} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={0.2} pointerEvents="none" />
    </svg>
  );
}

function WarcryLegend() {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-fg-2">
      <span><b className="text-[#f87171]">■</b> Свои deployment points</span>
      <span><b className="text-[#60a5fa]">■</b> Точки соперника</span>
      <span><b className="text-[#eaff44]">D/S/H</b> Dagger · Shield · Hammer</span>
      <span><b className="text-[#eaff44]">RND</b> Резерв без начальной зоны</span>
      <span><b className="text-[#eaff44]">┄</b> Направляющие, дюймы</span>
      <span><b className="text-[#eaff44]">↕</b> Ориентация карты</span>
    </div>
  );
}

export function WarcryDeploymentPanel({ deployment, color, interactive = true }: { deployment: WarcryDeployment; color: string; interactive?: boolean }) {
  const details = (selected: string) => {
    const index = Number(selected.split('-')[1]);
    const point = deployment.points[index];
    if (!point) return null;
    const guides = deployment.guides.filter((g) => g.side === point.side && g.group === point.group);
    return (
      <div>
        <p className="text-sm font-semibold">{point.side} · {point.group}{point.reserve ? ` · резерв RND${point.reserve}` : ''}</p>
        <p className="mt-1 text-[12px] text-fg-3">Исходная позиция: {point.sourceX}″, {point.sourceY}″{point.offboard ? ' · вне игрового поля' : ''}</p>
        {guides.length > 0 && <ul className="mt-2 grid grid-cols-2 gap-1.5">{guides.map((g, i) => <li key={i} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2"><span className="font-display block text-xl font-semibold text-accent">{g.d}″</span><span className="text-[12px] text-fg-2">До центральной линии</span></li>)}</ul>}
      </div>
    );
  };
  return (
    <SkirmishMapPanel title={deployment.name} subtitle="Warcry · поле 30×22″" sourceName="Warcrier" sourceUrl={deployment.image} legend={<WarcryLegend />} details={details} interactive={interactive}>
      {(options) => <WarcryDeploymentSvg deployment={deployment} color={color} {...options} />}
    </SkirmishMapPanel>
  );
}
