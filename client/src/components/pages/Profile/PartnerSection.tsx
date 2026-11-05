import { getPartners, type PartnerCard, type PartnerLane } from "@/apiUtils/partners";
import { haptic } from "@/utils/haptic";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, ChevronRight, ImageOff, LoaderCircle, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

function openPartnerUrl(url: string) {
  const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  if (webApp && typeof webApp.openLink === "function") {
    webApp.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function PartnerSection() {
  const query = useQuery({ queryKey: ["partners"], queryFn: getPartners });
  const settings = query.data?.settings;
  return (
    <section className="mt-6 lg:col-span-2" aria-labelledby="partner-showcase-title">
      <div className="text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-3" id="partner-showcase-title">Миниатюры наших партнёров</p>
        <p className="mt-1 text-sm text-fg-2">Можете заказать миниатюры у наших партнёров</p>
      </div>
      {query.isLoading ? (
        <div className="mt-4 flex justify-center"><LoaderCircle className="size-6 animate-spin text-accent" /></div>
      ) : query.isError ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-app-elevated p-4 text-center">
          <p className="text-sm text-fg-2">Не удалось загрузить миниатюры партнёров.</p>
          <button type="button" onClick={() => query.refetch()} className="ds-press mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"><RefreshCw className="size-4" />Повторить</button>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <PartnerLane title={settings?.partner1Title ?? "Партнёр 1"} lane={1} cards={query.data?.cards ?? []} />
          <PartnerLane title={settings?.partner2Title ?? "Партнёр 2"} lane={2} cards={query.data?.cards ?? []} />
        </div>
      )}
      {settings?.footerText.trim() && <p className="mt-4 whitespace-pre-line text-center text-sm font-medium text-fg-2">{settings.footerText}</p>}
    </section>
  );
}

function PartnerLane({ title, lane, cards }: { title: string; lane: PartnerLane; cards: PartnerCard[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const items = cards.filter((card) => card.lane === lane);
  const scroll = (direction: -1 | 1) => {
    haptic.tap();
    scroller.current?.scrollBy({ left: direction * Math.max(220, scroller.current.clientWidth * 0.82), behavior: "smooth" });
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        {items.length > 1 && (
          <div className="flex gap-1">
            <button type="button" onClick={() => scroll(-1)} aria-label={`${title}: предыдущие миниатюры`} className="ds-press flex size-10 items-center justify-center rounded-xl border border-white/10 text-fg-2 active:bg-white/[0.06]"><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => scroll(1)} aria-label={`${title}: следующие миниатюры`} className="ds-press flex size-10 items-center justify-center rounded-xl border border-white/10 text-fg-2 active:bg-white/[0.06]"><ChevronRight className="size-5" /></button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-fg-3">Скоро появятся новые миниатюры</div>
      ) : (
        <div ref={scroller} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((card) => <PartnerCardView key={card.id} card={card} />)}
        </div>
      )}
    </div>
  );
}

function PartnerCardView({ card }: { card: PartnerCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={card.url}
      onClick={(event) => {
        event.preventDefault();
        haptic.tap();
        openPartnerUrl(card.url);
      }}
      aria-label={`${card.title} — открыть сайт партнёра`}
      className="ds-press group block w-[78%] min-w-[210px] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-left sm:w-[240px]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white/[0.04]">
        {card.imageUrl && !failed ? (
          <img src={card.imageUrl} alt={card.title} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover transition-transform duration-300 group-active:scale-[1.03]" />
        ) : (
          <div className="flex size-full items-center justify-center text-fg-3"><ImageOff className="size-8" /></div>
        )}
        <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"><ArrowUpRight className="size-4" /></span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{card.title}</p>
        {card.text.trim() && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-fg-2">{card.text}</p>}
      </div>
    </a>
  );
}
