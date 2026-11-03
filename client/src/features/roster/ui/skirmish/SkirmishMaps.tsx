import type { ReactNode } from 'react';
import type { KtMapData, WarcryDeployment } from '../../skirmish/types';
import type { Pt } from '../../testarmy';

const disp = ([x, y]: Pt): Pt => [22 - y, x];
const points = (poly: Pt[]) => poly.map((p) => disp(p).join(',')).join(' ');
const polygonArea = (poly: Pt[]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const validTerrain = (poly: Pt[]) => poly.length >= 3 && poly.length <= 64 && polygonArea(poly) >= 0.45;

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="select-none">
      <svg viewBox="-1.5 -1.5 25 33" className="w-full rounded-xl border border-white/10 bg-[#1b1d22]" role="img" aria-label={label}>
        <rect x={0} y={0} width={22} height={30} fill="#1b1d22" />
        {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={i * 2} y1={0} x2={i * 2} y2={30} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
        {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 3} x2={22} y2={i * 3} stroke="rgba(255,255,255,0.055)" strokeWidth={0.06} />)}
        {children}
        <rect x={0} y={0} width={22} height={30} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={0.2} pointerEvents="none" />
      </svg>
    </figure>
  );
}

export function KtMapPanel({ map }: { map: KtMapData }) {
  return (
    <Frame label={`${map.killzone}, карта ${map.map}`}>
      {map.zones.p1.map((poly, i) => <polygon key={`p1-${i}`} points={points(poly)} fill="rgba(96,165,250,0.15)" stroke="rgba(96,165,250,0.7)" strokeWidth={0.12} />)}
      {map.zones.p2.map((poly, i) => <polygon key={`p2-${i}`} points={points(poly)} fill="rgba(251,146,60,0.14)" stroke="rgba(251,146,60,0.7)" strokeWidth={0.12} />)}
      {map.terrain.filter(validTerrain).map((poly, i) => <polygon key={`terrain-${i}`} points={points(poly)} fill="rgba(92,112,96,0.8)" stroke="rgba(170,190,175,0.35)" strokeWidth={0.1} />)}
      <line x1={11} y1={0} x2={11} y2={30} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      <line x1={0} y1={15} x2={22} y2={15} stroke="rgba(255,255,255,0.18)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      {map.objectives.map((objective) => {
        const [x, y] = disp([objective.x, objective.y]);
        const color = objective.id === 'centre' ? '#facc15' : objective.id === 'home' ? '#60a5fa' : '#fb923c';
        const short = objective.id === 'centre' ? 'C' : objective.id === 'home' ? 'H' : 'E';
        return (
          <g key={objective.id} pointerEvents="none">
            <circle cx={x} cy={y} r={0.79} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={0.12} />
            <circle cx={x} cy={y} r={0.38} fill={color} />
            <text x={x} y={y + 0.25} fontSize={0.62} fontWeight={700} textAnchor="middle" fill="#16181c">{short}</text>
          </g>
        );
      })}
    </Frame>
  );
}

export function WarcryDeploymentPanel({ deployment, color }: { deployment: WarcryDeployment; color: string }) {
  const labels = { dagger: 'D', shield: 'S', hammer: 'H' } as const;
  return (
    <Frame label={`${deployment.name}, ${color === 'red' ? 'красные' : 'синие'}`}>
      {deployment.points.map((point, index) => {
        const [x, y] = disp([point.x, point.y]);
        const own = point.side === color;
        const tone = own ? '#f87171' : '#60a5fa';
        return (
          <g key={`${point.side}-${point.group}-${index}`} pointerEvents="none">
            <circle cx={x} cy={y} r={3} fill={tone} fillOpacity={0.07} stroke={tone} strokeOpacity={0.55} strokeWidth={0.1} strokeDasharray="0.45 0.35" />
            <circle cx={x} cy={y} r={0.48} fill={tone} stroke="#1b1d22" strokeWidth={0.12} />
            <text x={x} y={y + 0.28} fontSize={0.68} fontWeight={700} textAnchor="middle" fill="#16181c">{labels[point.group]}</text>
            {point.reserve && <text x={x > 20 ? x - 0.75 : x + 0.75} y={y - 0.65} fontSize={0.68} fontWeight={700} textAnchor={x > 20 ? 'end' : 'start'} fill={tone}>RND{point.reserve}</text>}
          </g>
        );
      })}
    </Frame>
  );
}
