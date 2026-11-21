import type { KtKeyColour, KtMapData, KtMapKey, KtMapKeyFeature, KtMapKeyZone } from '../../skirmish/types';
import { openExternal } from '../../telegram';
import { cx } from '../util';

/**
 * Kill Team map: the official Approved Ops card with WarpHub markup on top (drop zones, depth, objective markers,
 * lettered terrain) and the Wahapedia map key. Positions come from game.json (scripts/kt-map-fix.py: board frame,
 * re-measured drop zones, every label box on the card). The card itself is never redrawn — markup can be hidden.
 */

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function ktColours(key: KtMapKey | undefined, killzone: string): Record<KtKeyColour, string> | null {
  if (!key) return null;
  return key.colours[killzone] ?? key.colours.default ?? null;
}

/** Strong outline colour of a Universal Map Key player on this killzone. */
function playerStroke(colours: Record<KtKeyColour, string> | null, player: 'p1' | 'p2', killzone: string) {
  if (player === 'p1') return colours?.p1Objective ?? '#f15d22';
  return killzone === 'Octarius' ? '#1f7f93' : '#3f4046';
}

const bbox = (poly: [number, number][]) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const OBJ_NAME: Record<string, (p: { home: string; enemy: string }) => string> = {
  home: (p) => p.home,
  enemy: (p) => p.enemy,
  centre: () => 'Центр',
};

export function KtMapImage({
  map,
  mapKey,
  src,
  alt,
  large,
  markup,
  selected,
  onSelect,
}: {
  map: KtMapData;
  mapKey?: KtMapKey;
  src: string;
  alt: string;
  large: boolean;
  markup: boolean;
  selected: string | null;
  onSelect?: (label: string | null) => void;
}) {
  const [l, t, r, b] = map.frame.px;
  const [w, h] = map.frame.size;
  const colours = ktColours(mapKey, map.killzone);
  const keyPlayer = map.keyPlayer ?? { p1: 'p2', p2: 'p1' };
  const playerNo = (side: 'p1' | 'p2') => (keyPlayer[side] === 'p1' ? 1 : 2);
  const objNames = { home: `Цель игрока ${playerNo('p1')}`, enemy: `Цель игрока ${playerNo('p2')}` };
  const tag = 'pointer-events-none absolute whitespace-nowrap rounded px-1 font-semibold leading-tight text-white shadow';
  const txt = large ? 'text-[12px]' : 'text-[9px]';
  return (
    <div className={cx('relative select-none', large ? 'w-[200%] max-w-none' : 'w-full')}>
      <img src={src} alt={alt} className="block w-full rounded-xl border border-white/10 bg-[#1b1d22]" draggable={false} />
      {markup && (
        <div className="absolute" style={{ left: pct(l, w), top: pct(t, h), width: pct(r - l, w), height: pct(b - t, h) }} aria-hidden={!onSelect}>
          {(['p1', 'p2'] as const).map((side) =>
            map.dropZones[side].map((poly, i) => {
              const z = bbox(poly);
              const stroke = playerStroke(colours, keyPlayer[side], map.killzone);
              const guide = map.guides.find((g) => g.side === side);
              const top = z.y < 0.5;
              return (
                <div key={`${side}${i}`} className="pointer-events-none absolute" style={{ left: pct(z.x, 30), top: pct(z.y, 22), width: pct(z.w, 30), height: pct(z.h, 22), border: `2px solid ${stroke}`, boxShadow: `inset 0 0 0 1px rgba(255,255,255,.55)` }}>
                  <span className={cx(tag, txt, top ? 'bottom-0.5' : 'top-0.5', 'left-0.5')} style={{ background: stroke }}>
                    Drop zone · игрок {playerNo(side)}
                    {guide && guide.toScale !== false ? ` · ${guide.d}″` : ''}
                  </span>
                </div>
              );
            }),
          )}
          {map.objectives.map((o) => {
            const player = o.id === 'home' ? keyPlayer.p1 : o.id === 'enemy' ? keyPlayer.p2 : null;
            const ring = player ? playerStroke(colours, player, map.killzone) : '#111';
            return (
              <div key={o.id} className="pointer-events-none absolute" style={{ left: pct(o.x, 30), top: pct(o.y, 22) }}>
                <span className={cx('absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2', large ? 'size-9' : 'size-[18px]')} style={{ borderColor: ring, boxShadow: '0 0 0 2px rgba(255,255,255,.8)' }} />
                <span className={cx(tag, txt, '-translate-x-1/2', large ? 'top-5' : 'top-2.5')} style={{ background: ring }}>
                  {(OBJ_NAME[o.id] ?? (() => o.id))(objNames)}
                </span>
              </div>
            );
          })}
          {map.features.map((f, i) => {
            const on = selected === f.label;
            const size = large ? 'size-9' : 'size-[18px]';
            const cls = cx('absolute -translate-x-1/2 -translate-y-1/2 rounded-md', size, on ? 'border-2 border-accent bg-accent/25 shadow-[0_0_0_3px_rgba(0,0,0,.6)]' : onSelect ? 'border border-white/0' : 'hidden');
            const style = { left: pct(f.x, 30), top: pct(f.y, 22) };
            return onSelect ? (
              <button key={i} type="button" className={cls} style={style} aria-label={`Элемент ${f.label}`} onClick={() => onSelect(on ? null : f.label)} />
            ) : (
              <span key={i} className={cx(cls, 'pointer-events-none')} style={style} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Swatch({ kind, colour }: { kind: KtMapKey['universal'][number]['swatch']; colour: string }) {
  switch (kind) {
    case 'zone':
      return <span className="h-3 w-5 shrink-0 rounded-[3px] border border-black/30" style={{ background: colour }} />;
    case 'edge':
      return <span className="flex h-3 w-5 shrink-0 flex-col justify-center gap-[2px]"><span className="h-[2px]" style={{ background: colour }} /><span className="h-[2px]" style={{ background: colour }} /></span>;
    case 'objective':
      return <span className="size-3.5 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: colour }} />;
    case 'dots':
      return <span className="h-0 w-5 shrink-0 border-t-[3px] border-dotted" style={{ borderColor: colour }} />;
    case 'centre':
      return <span className="relative size-3.5 shrink-0"><span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: colour }} /><span className="absolute inset-0 rounded-full border border-dashed" style={{ borderColor: colour }} /></span>;
    case 'dashed':
      return <span className="h-0 w-5 shrink-0 border-t-2 border-dashed" style={{ borderColor: colour }} />;
  }
}

const typeName = (key: KtMapKey, id: string) => {
  const t = key.terrainTypes.find((x) => x.id === id);
  return t ? `${t.id} (${t.ru})` : id;
};

function FeatureRow({ f, mapKey, on, present, onSelect, extra }: { f: KtMapKeyFeature; mapKey: KtMapKey; on: boolean; present: string[]; onSelect: (label: string | null) => void; extra?: string[] }) {
  const shown = f.labels.filter((x) => present.includes(x));
  const first = shown[0] ?? f.labels[0]!;
  return (
    <li className={cx('rounded-xl border p-2.5', on ? 'border-accent/60 bg-accent/10' : 'border-white/10 bg-white/[0.03]')}>
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => onSelect(on ? null : first)} aria-expanded={on}>
        <span className="flex shrink-0 flex-wrap gap-1">
          {f.labels.map((x) => (
            <span key={x} className={cx('min-w-6 rounded bg-[#4f555a] px-1 text-center text-[12px] font-bold leading-5 text-white', !present.includes(x) && 'opacity-40')}>{x}</span>
          ))}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5">
          {f.en}
          {f.ru && <span className="font-normal text-fg-3"> ({f.ru})</span>}
        </span>
      </button>
      {on && (
        <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-fg-2">
          {shown.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {shown.map((x) => (
                <button key={x} type="button" onClick={() => onSelect(x)} className="rounded-md border border-white/15 px-2 py-0.5 text-[12px]">Показать {x}</button>
              ))}
            </div>
          )}
          {f.types.length > 0 && <p className="flex flex-wrap gap-1">{f.types.map((t) => <span key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">{typeName(mapKey, t)}</span>)}</p>}
          {f.note && <p className="text-fg-3">{f.note}</p>}
          {[...(f.rules ?? []), ...(extra ?? [])].map((x, i) => <p key={i}>{x}</p>)}
        </div>
      )}
    </li>
  );
}

export function KtMapLegend({ map, mapKey, selected, onSelect, markup, onMarkup }: { map: KtMapData; mapKey: KtMapKey; selected: string | null; onSelect: (label: string | null) => void; markup: boolean; onMarkup: (v: boolean) => void }) {
  const colours = ktColours(mapKey, map.killzone)!;
  const zone: KtMapKeyZone = mapKey.killzones[map.killzone] ?? {};
  const present = [...new Set(map.features.map((f) => f.label))];
  const known = new Set((zone.features ?? []).flatMap((f) => f.labels));
  const unknown = present.filter((x) => !known.has(x)).sort();
  const extraFor = (f: KtMapKeyFeature) => [
    ...(zone.rules?.wall && f.types.includes('Wall') ? [zone.rules.wall] : []),
    ...(f.hatchway ? zone.rules?.hatchway ?? [] : []),
    ...(f.breachPoint ? zone.rules?.breachPoint ?? [] : []),
  ];
  return (
    <div className="mt-3 space-y-3 text-fg-2">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px]">
        <span>
          Разметка WarpHub
          <span className="block text-[11px] text-fg-3">Drop zones, глубина, цели и буквы поверх карты</span>
        </span>
        <input type="checkbox" className="size-5 accent-accent" checked={markup} onChange={(e) => onMarkup(e.target.checked)} />
      </label>
      {map.frame && !map.frame.toScale && (
        <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] leading-relaxed">
          Карта {map.killzone} нарисована не в масштабе (сетка плиток): drop zones и расстояния считайте по плиткам карты, а не по дюймам.
        </p>
      )}
      <section>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Обозначения · Universal Map Key</p>
        <ul className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-[12px] min-[380px]:grid-cols-2">
          {mapKey.universal.map((u) => (
            <li key={u.id} className="flex min-w-0 items-center gap-2">
              <Swatch kind={u.swatch} colour={colours[u.colour]} />
              <span className="min-w-0">{u.ru}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-fg-3">
          {mapKey.lines.map((x) => <li key={x.id}>{x.ru}</li>)}
          {zone.note && <li>{zone.note}</li>}
        </ul>
      </section>
      {(zone.features?.length || zone.areas?.length || unknown.length) ? (
        <section>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">Террейн · {map.killzone}</p>
          {zone.intro && <p className="mb-1.5 text-[12px] text-fg-3">{zone.intro}</p>}
          <p className="mb-1.5 text-[12px] text-fg-3">Нажмите на элемент — буквы подсветятся на карте; на большой карте можно нажать прямо на букву.</p>
          <ul className="space-y-1.5">
            {(zone.features ?? []).filter((f) => f.labels.some((x) => present.includes(x))).map((f) => (
              <FeatureRow key={f.id} f={f} mapKey={mapKey} on={!!selected && f.labels.includes(selected)} present={present} onSelect={onSelect} extra={extraFor(f)} />
            ))}
            {unknown.map((x) => (
              <li key={x} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[13px]">
                <span className="mr-2 rounded bg-[#4f555a] px-1 text-[12px] font-bold text-white">{x}</span>нет данных в ключе карты
              </li>
            ))}
            {(zone.areas ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[12px] leading-relaxed">
                <p className="flex items-center gap-2 text-[13px] font-semibold"><span className="h-3 w-5 rounded-[3px] border border-black/30" style={{ background: a.colour }} />{a.en} <span className="font-normal text-fg-3">({a.ru})</span></p>
                {a.rules.map((x, i) => <p key={i} className="mt-1">{x}</p>)}
              </li>
            ))}
          </ul>
          {zone.symbols && (
            <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-fg-3">{zone.symbols.map((s) => <li key={s.id}>{s.ru}</li>)}</ul>
          )}
        </section>
      ) : null}
      <details className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold">Типы террейна</summary>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed">
          {mapKey.terrainTypes.map((t) => (
            <li key={t.id}>
              <span className="font-semibold">{t.id} ({t.ru}).</span> {t.en}
            </li>
          ))}
        </ul>
      </details>
      <p className="text-[11px] leading-relaxed text-fg-3">
        Ключ карты и типы террейна —{' '}
        <button type="button" className="underline" onClick={() => openExternal(mapKey.source.approvedOpsUrl)}>Wahapedia, Approved Ops 2025</button> и{' '}
        <button type="button" className="underline" onClick={() => openExternal(mapKey.source.killzonesUrl)}>Killzones</button>, проверено {mapKey.source.checked.split('-').reverse().join('.')}. Разметка WarpHub снята с официальной карты; Approved Ops оговаривает, что карты не точный обмер террейна.
      </p>
    </div>
  );
}
