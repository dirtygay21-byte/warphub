import type { AosBattlepack, AosBattleplanMap, AosTerritory } from '../../aos/types';
import { cx } from '../util';

const OBJ_SHORT: Record<string, string> = { 'sun-seekers': 'SS', 'golden-lions': 'GL', heldenhain: 'H', scions: 'SC' };
const TERRAIN: Record<AosBattleplanMap['terrain'][number]['type'], { label: string; short: string; fill: string }> = {
  ruin: { label: 'Руины', short: 'Р', fill: 'rgba(168,140,110,0.55)' },
  obscuring: { label: 'Укрывающий', short: 'У', fill: 'rgba(110,150,110,0.55)' },
  'place-of-power': { label: 'Место силы', short: 'М', fill: 'rgba(150,120,200,0.55)' },
};
const ZONE = { A: 'rgba(96,165,250,0.18)', B: 'rgba(248,113,113,0.16)' } as const;

/**
 * Карта батлплана (S3): поле 60×44″, территории A и B, цели с зоной контроля 3″, террейн (условные круги, как в Sigdex).
 * attacker — какую территорию взял атакующий (подписи «Атакующий/Защитник»); onPick — выбор территории касанием.
 */
export function BattleplanMap({ bp, map, attacker, onPick }: { bp: AosBattlepack; map: AosBattleplanMap; attacker?: AosTerritory | null; onPick?: (t: AosTerritory) => void }) {
  const { width: W, height: H, objectiveRange, objectiveMarkerMm } = bp.battlefield;
  const marker = objectiveMarkerMm / 25.4 / 2;
  const label = (t: AosTerritory) => (attacker ? (t === attacker ? 'Атакующий' : 'Защитник') : `Территория ${t}`);
  const centre = (t: AosTerritory) => {
    // подпись — в самом большом прямоугольнике территории
    const [x, y, w, h] = [...map.territories[t]].sort((a, b) => b[2] * b[3] - a[2] * a[3])[0]!;
    return { x: x + w / 2, y: y + h / 2 };
  };
  const types = [...new Set(map.objectives.map((o) => o.type))];
  return (
    <figure className="select-none">
      <svg viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`} className="w-full rounded-xl border border-white/10 bg-[#1b1d22]" role="img" aria-label="Карта батлплана">
        {(['A', 'B'] as const).map((t) =>
          map.territories[t].map(([x, y, w, h], i) => (
            <rect
              key={t + i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={ZONE[t]}
              stroke={attacker === t ? 'rgba(250,204,21,0.9)' : 'none'}
              strokeWidth={attacker === t ? 0.35 : 0}
              className={cx(onPick && 'cursor-pointer')}
              onClick={onPick ? () => onPick(t) : undefined}
            />
          )),
        )}
        {[15, 45].map((x) => <line key={'x' + x} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.08)" strokeWidth={0.15} />)}
        {[11, 33].map((y) => <line key={'y' + y} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={0.15} />)}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth={0.2} />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.18)" strokeWidth={0.2} />
        {map.terrain.map((t, i) => (
          <g key={'t' + i} pointerEvents="none">
            <circle cx={t.x} cy={t.y} r={t.r} fill={TERRAIN[t.type].fill} stroke="rgba(255,255,255,0.25)" strokeWidth={0.15} />
            <text x={t.x} y={t.y} fontSize={1.8} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.8)">
              {TERRAIN[t.type].short}
            </text>
          </g>
        ))}
        {map.objectives.map((o, i) => (
          <g key={'o' + i} pointerEvents="none">
            <circle cx={o.x} cy={o.y} r={objectiveRange + marker} fill="rgba(250,204,21,0.06)" stroke="rgba(250,204,21,0.55)" strokeWidth={0.15} strokeDasharray="0.6 0.4" />
            <circle cx={o.x} cy={o.y} r={marker} fill="rgba(250,204,21,0.95)" />
            <text x={o.x} y={o.y + marker + 1.3} fontSize={1.5} textAnchor="middle" fill="rgba(250,204,21,0.95)" fontWeight={700}>
              {OBJ_SHORT[o.type] ?? o.type}
            </text>
          </g>
        ))}
        {(['A', 'B'] as const).map((t) => {
          const c = centre(t);
          return (
            <text key={'l' + t} x={c.x} y={c.y} fontSize={2} textAnchor="middle" dominantBaseline="central" fill="rgba(255,255,255,0.75)" fontWeight={700} pointerEvents="none">
              {label(t)}
            </text>
          );
        })}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.25} pointerEvents="none" />
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-white/45">
        {types.map((t) => (
          <span key={t}>
            <b className="text-amber-300/90">{OBJ_SHORT[t] ?? t}</b> {bp.objectiveTypes.find((x) => x.id === t)?.name ?? t}
          </span>
        ))}
        {[...new Set(map.terrain.map((t) => t.type))].map((t) => (
          <span key={t}>
            <b className="text-white/70">{TERRAIN[t].short}</b> {TERRAIN[t].label}
          </span>
        ))}
        <span>пунктир — зона контроля {objectiveRange}″; клетка 15×11″; террейн — условно</span>
      </figcaption>
    </figure>
  );
}
