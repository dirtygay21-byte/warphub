import { useEffect, useState, type ReactNode } from 'react';
import type { KtMapData, WarcryDeployment } from '../../skirmish/types';
import { openExternal, pushOverlay } from '../../telegram';
import { IconButton } from '../kit';
import { cx } from '../util';

export function OfficialImage({ src, alt, large }: { src: string; alt: string; large: boolean }) {
  return (
    <img
      src={src}
      alt={alt}
      className={cx('block select-none rounded-xl border border-white/10 bg-[#1b1d22]', large ? 'w-[200%] max-w-none' : 'w-full')}
      draggable={false}
    />
  );
}

export function SkirmishMapPanel({
  title,
  subtitle,
  sourceName,
  sourceUrl,
  legend,
  children,
  interactive = true,
}: {
  title: string;
  subtitle: string;
  sourceName: string;
  sourceUrl: string;
  legend: ReactNode;
  children: (large: boolean) => ReactNode;
  interactive?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => (zoom ? pushOverlay(() => setZoom(false)) : undefined), [zoom]);
  if (!interactive) return children(false);
  return (
    <div>
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold uppercase leading-none">{title}</p>
        <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p>
      </div>
      <button type="button" onClick={() => setZoom(true)} className="mt-2 block w-full rounded-2xl border border-white/10 bg-black/30 p-2 text-left" aria-label="Открыть карту крупно">
        {children(false)}
      </button>
      <p className="mt-1.5 text-center text-[12px] leading-relaxed text-fg-3">Нажмите на карту, чтобы увеличить. Все подписи и размеры — непосредственно с официальной карты.</p>
      {legend}
      {zoom && (
        <div className="fade-enter fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <p className="font-display min-w-0 flex-1 truncate text-lg font-semibold uppercase">{title}</p>
            <IconButton icon="close" label="Закрыть" onClick={() => setZoom(false)} className="size-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children(true)}</div>
        </div>
      )}
      <p className="mt-3 text-center text-[12px] leading-relaxed text-fg-3">
        Источник изображения: <button type="button" className="font-semibold text-fg-3 underline" onClick={() => openExternal(sourceUrl)}>{sourceName}</button>
      </p>
    </div>
  );
}

function OfficialNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 space-y-1 text-[12px] leading-relaxed text-fg-2">
      <p>{children}</p>
      <p className="text-fg-3">Изображение показано без реконструкции: приложение не вычисляет геометрию, подписи или размеры.</p>
    </div>
  );
}

const officialKtMapPath = (map: Pick<KtMapData, 'killzone' | 'map'>) => `/roster-maps/kt/${map.killzone.replaceAll(' ', '-')}-${map.map}.png`;
const officialWarcryMapPath = (deployment: Pick<WarcryDeployment, 'id'>) => `/roster-maps/warcry/${deployment.id}.png`;

export function KtMapPanel({ map, interactive = true }: { map: KtMapData; interactive?: boolean }) {
  return (
    <SkirmishMapPanel
      title={`${map.killzone} · Map ${map.map}`}
      subtitle="Официальная карта Approved Ops 2025 · поле 30×22″"
      sourceName="Wahapedia"
      sourceUrl={map.sourceImage}
      legend={<OfficialNote>Drop zones, стены, террейн и objective markers — непосредственно с карты Wahapedia.</OfficialNote>}
      interactive={interactive}
    >
      {(large) => <OfficialImage src={officialKtMapPath(map)} alt={`${map.killzone}, карта ${map.map} — официальная карта Approved Ops 2025`} large={large} />}
    </SkirmishMapPanel>
  );
}

export function WarcryDeploymentPanel({ deployment, color, interactive = true }: { deployment: WarcryDeployment; color: string; interactive?: boolean }) {
  const side = color === 'red' ? 'красные' : 'синие';
  return (
    <SkirmishMapPanel
      title={deployment.name}
      subtitle="Официальная расстановка Warcry · поле 30×22″"
      sourceName="Warcrier"
      sourceUrl={deployment.image}
      legend={<OfficialNote>Dagger / Shield / Hammer, резервы RND и размеры — непосредственно с карты Warcrier.</OfficialNote>}
      interactive={interactive}
    >
      {(large) => <OfficialImage src={officialWarcryMapPath(deployment)} alt={`${deployment.name} — официальная расстановка Warcry; выбрана сторона ${side}`} large={large} />}
    </SkirmishMapPanel>
  );
}
