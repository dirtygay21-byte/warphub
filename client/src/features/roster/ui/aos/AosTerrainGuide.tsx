import type { AosLookup } from '../../aos/engine';
import { terrainPlacementOf } from '../../aos/refs';
import { BATTLEFIELD_TERRAIN_GH, FACTION_TERRAIN_CORE, type PlacementBlock } from '../../aos/terrain';
import type { AosWarscroll } from '../../aos/types';
import { openExternal } from '../../telegram';
import { Sheet, Tag } from '../kit';
import { AosRuleCard } from './AosPanels';
import { Warscroll } from './AosUnitCard';

/*
 * «Как ставить террейн фракции»: обязательное правило Core Rules, правила самой фракции (из данных),
 * расстановка обычного террейна в батлпаке и схема-иллюстрация. Официальных схем в данных нет —
 * схема рисуется по тексту правила и подписана как иллюстрация.
 */

function Block({ b }: { b: PlacementBlock }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
      <p className="text-[14px] font-semibold">{b.title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-fg-3">{b.context}</p>
      <ul className="mt-2 space-y-1.5">
        {b.rules.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
            <span className={r.kind === 'mandatory' ? 'mt-0.5 shrink-0 rounded bg-accent/15 px-1 text-[12px] font-semibold uppercase text-accent' : 'mt-0.5 shrink-0 rounded bg-white/[0.08] px-1 text-[12px] font-semibold uppercase text-fg-3'}>
              {r.kind === 'mandatory' ? 'обяз.' : 'можно'}
            </span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      {b.source.url && (
        <button type="button" onClick={() => openExternal(b.source.url!)} className="mt-2 text-[12px] font-semibold text-accent/90 underline underline-offset-2">
          Источник: {b.source.label}
        </button>
      )}
    </section>
  );
}

/**
 * Схема правила 10.1 на поле 60" × 44": своя территория (здесь — нижняя половина), объективы с зоной 3",
 * обычный террейн с зоной 3", террейн фракции — целиком в своей территории и вне этих зон.
 * Масштаб: 1" = 10 единиц. Расположение объективов и форма территорий — пример, в каждом плане свои.
 */
export function TerrainDiagram({ name }: { name: string }) {
  const W = 600;
  const H = 440;
  const objectives = [
    [150, 110],
    [450, 110],
    [150, 330],
    [450, 330],
  ];
  return (
    <figure className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <svg viewBox={`-10 -10 ${W + 20} ${H + 40}`} className="h-auto w-full" role="img" aria-label={`Пример размещения: ${name}`}>
        <rect x="0" y="0" width={W} height={H} rx="6" fill="rgb(255 255 255 / 0.03)" stroke="rgb(255 255 255 / 0.25)" />
        <rect x="0" y={H / 2} width={W} height={H / 2} fill="rgb(56 189 248 / 0.10)" />
        <rect x="0" y="0" width={W} height={H / 2} fill="rgb(248 113 113 / 0.07)" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgb(255 255 255 / 0.3)" strokeDasharray="6 6" />
        <text x="12" y="28" fill="rgb(252 165 165 / 0.8)" fontSize="22">Территория противника</text>
        <text x="12" y={H - 12} fill="rgb(125 211 252 / 0.9)" fontSize="22">Ваша территория</text>
        {objectives.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="30" fill="none" stroke="rgb(251 191 36 / 0.6)" strokeDasharray="4 4" />
            <circle cx={x} cy={y} r="8" fill="rgb(251 191 36 / 0.9)" />
          </g>
        ))}
        {/* обычный террейн и его зона 3" */}
        <rect x="280" y="240" width="60" height="40" rx="4" fill="rgb(255 255 255 / 0.15)" />
        <rect x="250" y="210" width="120" height="100" rx="18" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeDasharray="4 4" />
        {/* террейн фракции — целиком в своей территории, дальше 3" от объективов и террейна */}
        <rect x="430" y="380" width="70" height="40" rx="6" fill="rgb(167 139 250 / 0.55)" stroke="rgb(196 181 253)" />
        <line x1="450" y1="338" x2="450" y2="380" stroke="rgb(196 181 253)" strokeDasharray="2 3" />
        <text x="458" y="366" fill="rgb(196 181 253)" fontSize="17">&gt; 3"</text>
        <text x={W} y={H + 26} textAnchor="end" fill="rgb(196 181 253)" fontSize="20">
          {name.length > 22 ? name.slice(0, 21) + '…' : name}
        </text>
      </svg>
      <ul className="mt-2 grid grid-cols-1 gap-1 text-[12px] text-fg-2 min-[400px]:grid-cols-2">
        <li><span className="text-amber-300">●</span> объектив, пунктир — 3" вокруг</li>
        <li><span className="text-fg-2">■</span> обычный террейн, пунктир — 3"</li>
        <li><span className="text-violet-300">■</span> террейн фракции — вне пунктиров</li>
        <li><span className="text-sky-300">■</span> ваша территория</li>
      </ul>
      <figcaption className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] leading-snug text-fg-3">
        Иллюстрация правила, не официальная схема. Форма территорий и места объективов зависят от битвенного плана — смотрите его карту. Поле 60" × 44", масштаб приблизительный.
      </figcaption>
    </figure>
  );
}

export function AosTerrainGuide({ ws, L, onClose }: { ws: AosWarscroll | null; L: AosLookup; onClose: () => void }) {
  const p = ws ? terrainPlacementOf(ws, L) : null;
  return (
    <Sheet open={!!ws} onClose={onClose} title="Как ставить террейн" tall>
      {ws && p && (
        <div className="space-y-3 pb-2">
          <div>
            <p className="font-display text-lg font-semibold uppercase leading-tight">{ws.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Tag tone="accent">{ws.cost == null ? 'нет очков' : `${ws.cost} очк.`}</Tag>
              {ws.bases && <Tag>Подставка: {ws.bases}</Tag>}
              {ws.legends && <Tag tone="warn">Warhammer Legends</Tag>}
            </div>
          </div>
          <Block b={FACTION_TERRAIN_CORE} />
          <section className="space-y-1.5 rounded-2xl border border-violet-300/25 bg-violet-400/[0.04] px-3.5 py-3">
            <p className="text-[14px] font-semibold">Правила фракции</p>
            {p.rules.length ? (
              <>
                <p className="text-[12px] leading-snug text-fg-3">Особые правила {L.faction.name}, которые ставят этот террейн или работают от него при расстановке. Обязательны, если вы их используете.</p>
                {p.measures.length > 0 && (
                  <div className="flex flex-wrap gap-1 py-1">
                    {p.measures.map((m) => (
                      <span key={m} className="rounded-md border border-violet-300/30 bg-violet-300/10 px-1.5 py-0.5 text-[12px] text-violet-100">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                {p.rules.map((r, i) => (
                  <AosRuleCard key={i} rule={r.rule} L={L} extraSub={r.from} link={r.from === 'Варскролл террейна' ? ws.link : undefined} />
                ))}
              </>
            ) : (
              <p className="text-[12px] leading-snug text-fg-3">В правилах фракции нет особых правил размещения этого террейна — действует только правило Core Rules выше.</p>
            )}
          </section>
          <TerrainDiagram name={ws.name} />
          <Block b={BATTLEFIELD_TERRAIN_GH} />
          <section className="space-y-1.5">
            <p className="px-1 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Варскролл террейна</p>
            <Warscroll ws={ws} L={L} />
          </section>
        </div>
      )}
    </Sheet>
  );
}
