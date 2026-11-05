import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { WARCRY_TERRAIN_CARDS, generateAlternativeTerrain, validateAlternativeTerrain, warcryTerrainCard, type WarcryTerrainFeature, type WarcryTerrainFeatureType, type WarcryTerrainMode, type WarcryTerrainSetup } from '../../skirmish/terrain';
import { newSeed } from '../../game/rng';
import { confirmAsk } from '../../telegram';
import { Button, Segmented } from '../kit';
import { cx } from '../util';
import { OfficialImage, SkirmishMapPanel } from './SkirmishMaps';

const TYPES: Record<WarcryTerrainFeatureType, { label: string; short: string; fill: string }> = {
  ruin: { label: 'Руины', short: 'Р', fill: 'rgba(168,140,110,0.65)' },
  obscuring: { label: 'Укрывающий', short: 'У', fill: 'rgba(110,150,110,0.65)' },
  'place-of-power': { label: 'Место силы', short: 'М', fill: 'rgba(150,120,200,0.65)' },
};

function FeatureShape({ feature, selected = false }: { feature: WarcryTerrainFeature; selected?: boolean }) {
  const style = TYPES[feature.type];
  return (
    <g transform={`rotate(${feature.angle} ${feature.x} ${feature.y})`}>
      <rect x={feature.x - feature.w / 2} y={feature.y - feature.h / 2} width={feature.w} height={feature.h} rx={0.2} fill={style.fill} stroke={selected ? '#ECFE46' : 'rgba(255,255,255,0.55)'} strokeWidth={selected ? 0.22 : 0.1} />
      <text x={feature.x} y={feature.y + 0.3} textAnchor="middle" fontSize={0.8} fontWeight={700} fill="#f4f4f0" pointerEvents="none">{style.short}</text>
    </g>
  );
}

function BoardGrid() {
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={30} height={22} fill="#1b1d22" />
      {Array.from({ length: 14 }, (_, i) => <line key={`v${i}`} x1={i * 2 + 2} y1={0} x2={i * 2 + 2} y2={22} stroke="rgba(255,255,255,0.06)" strokeWidth={0.06} />)}
      {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 2 + 2} x2={30} y2={i * 2 + 2} stroke="rgba(255,255,255,0.06)" strokeWidth={0.06} />)}
      <line x1={15} y1={0} x2={15} y2={22} stroke="rgba(255,255,255,0.24)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      <line x1={0} y1={11} x2={30} y2={11} stroke="rgba(255,255,255,0.24)" strokeWidth={0.12} strokeDasharray="0.45 0.35" />
      <text x={1} y={1.4} fontSize={0.8} fill="rgba(255,255,255,0.45)">СЗ</text>
      <text x={29} y={1.4} textAnchor="end" fontSize={0.8} fill="rgba(255,255,255,0.45)">СВ</text>
      <text x={1} y={21} fontSize={0.8} fill="rgba(255,255,255,0.45)">ЮЗ</text>
      <text x={29} y={21} textAnchor="end" fontSize={0.8} fill="rgba(255,255,255,0.45)">ЮВ</text>
    </g>
  );
}

function AlternativeEditor({ features, onChange, onRandomize }: { features: WarcryTerrainFeature[]; onChange: (features: WarcryTerrainFeature[]) => void; onRandomize: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState<WarcryTerrainFeatureType>('ruin');
  const selected = features.find((feature) => feature.id === selectedId) ?? null;
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(30, Math.max(0, ((event.clientX - rect.left) / rect.width) * 30)),
      y: Math.min(22, Math.max(0, ((event.clientY - rect.top) / rect.height) * 22)),
    };
  };
  const update = (id: string, patch: Partial<WarcryTerrainFeature>) => onChange(features.map((feature) => (feature.id === id ? { ...feature, ...patch } : feature)));
  return (
    <div>
      <p className="text-[12px] leading-relaxed text-fg-3">Выберите тип и нажмите на поле. Контур и размеры задаются по вашей физической модели, не по выдуманному шаблону.</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(TYPES) as WarcryTerrainFeatureType[]).map((type) => (
          <button key={type} type="button" onClick={() => setNewType(type)} className={cx('rounded-xl border px-2 py-2 text-[12px] font-semibold', newType === type ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-2')}>
          {TYPES[type].label}
          </button>
        ))}
      </div>
      <Button className="mt-2 w-full" onClick={onRandomize}>Случайная играбельная расстановка</Button>
      <svg
        ref={svg}
        viewBox="0 0 30 22"
        className="mt-2 block w-full touch-none rounded-xl border border-white/10 bg-[#1b1d22]"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const at = point(event);
          const id = `terrain-${Date.now().toString(36)}`;
          onChange([...features, { id, type: newType, x: at.x, y: at.y, w: 2, h: 2, angle: 0 }]);
          setSelectedId(id);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          update(dragging.current, point(event));
        }}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        <BoardGrid />
        {features.map((feature) => (
          <g
            key={feature.id}
            onPointerDown={(event) => {
              event.stopPropagation();
              setSelectedId(feature.id);
              dragging.current = feature.id;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            style={{ cursor: 'grab' }}
          >
            <FeatureShape feature={feature} selected={selectedId === feature.id} />
          </g>
        ))}
      </svg>
      {selected && (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-sm font-semibold">{TYPES[selected.type].label} · размер контура в дюймах</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-fg-3">Ширина<input type="number" min={0.5} step={0.5} value={selected.w} onChange={(event) => update(selected.id, { w: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-app-elevated px-3 text-sm" /></label>
            <label className="text-[12px] text-fg-3">Глубина<input type="number" min={0.5} step={0.5} value={selected.h} onChange={(event) => update(selected.id, { h: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-app-elevated px-3 text-sm" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => update(selected.id, { angle: (selected.angle + 90) % 360 })}>Повернуть 90°</Button>
            <Button variant="danger" onClick={() => { onChange(features.filter((feature) => feature.id !== selected.id)); setSelectedId(null); }}>Удалить</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WarcryTerrainBackground({ setup }: { setup: WarcryTerrainSetup }) {
  if (setup.mode === 'card') {
    const card = warcryTerrainCard(setup.cardId);
    return <OfficialImage src={card.image} alt={`${card.name} — официальная terrain card`} large={false} />;
  }
  return (
    <svg viewBox="0 0 30 22" className="block h-full w-full" role="img" aria-label="Пользовательская расстановка террейна Warcry">
      <BoardGrid />
      {setup.features.map((feature) => <FeatureShape key={feature.id} feature={feature} />)}
    </svg>
  );
}

export function WarcryTerrainSetup({ setup, onChange, onContinue }: { setup: WarcryTerrainSetup; onChange: (setup: WarcryTerrainSetup) => void; onContinue: () => void }) {
  const issues = useMemo(() => (setup.mode === 'alternative' ? validateAlternativeTerrain(setup.features) : []), [setup]);
  const card = warcryTerrainCard(setup.cardId);
  const randomize = async () => {
    if (setup.features.length > 0 && !(await confirmAsk('Заменить текущие контуры новой случайной расстановкой?'))) return;
    const seed = newSeed();
    onChange({ ...setup, mode: 'alternative', seed, features: generateAlternativeTerrain(seed) });
  };
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">Шаг 1 из 2 · Terrain setup</p>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-3">Сначала террейн, затем deployment groups. Правила — Warcrier.</p>
      </div>
      <Segmented<WarcryTerrainMode> value={setup.mode} onChange={(mode) => onChange({ ...setup, mode })} options={[{ value: 'card', label: 'Terrain card' }, { value: 'alternative', label: 'Alternative rules' }]} />
      {setup.mode === 'card' ? (
        <>
          <select value={setup.cardId} onChange={(event) => onChange({ ...setup, cardId: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-app-elevated px-3 text-sm">
            {WARCRY_TERRAIN_CARDS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <SkirmishMapPanel title={card.name} subtitle="Официальная terrain card · Heart of Ghur" sourceName="Warcrier" sourceUrl={card.sourceImage} legend={<p className="text-[12px] leading-relaxed text-fg-3">Расположение terrain features — непосредственно с официальной карты. Deployment следует следующим шагом.</p>}>
            {(large) => <OfficialImage src={card.image} alt={`${card.name} — официальная terrain card`} large={large} />}
          </SkirmishMapPanel>
        </>
      ) : (
        <>
          <AlternativeEditor key={setup.seed ?? 'manual'} features={setup.features} onChange={(features) => onChange({ ...setup, features })} onRandomize={() => void randomize()} />
          {setup.seed && <p className="text-center text-xs text-fg-3">Seed: {setup.seed}</p>}
          {issues.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : (
            <p className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12px] text-accent">Правила альтернативной расстановки выполнены.</p>
          )}
        </>
      )}
      <Button variant="primary" className="h-12 w-full" disabled={setup.mode === 'alternative' && issues.length > 0} onClick={onContinue}>Перейти к deployment</Button>
    </section>
  );
}
