import {
  getCardsState,
  openCardPack,
  type CardDef,
  type CardRarity,
  type OpenedPack,
  type PackCard,
} from "@/apiUtils/minigames";
import { s3Url } from "@/utils/s3utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Clock, Layers, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardBack, CardFace } from "./cards/CardFace";
import { RARITY_ORDER, RARITY_STYLE } from "./cards/rarity";
import { ErrorNote, GameTopBar, PixelButton } from "./common";
import { errorText, oswald } from "./helpers";
import { Skeleton } from "@/components/ui/ds";

const useCards = () => useQuery({ queryKey: ["minigames", "cards"], queryFn: getCardsState });
const CARDS_MAINTENANCE = true;
const ART_REWORK_NOTE = "Изображения карт скоро будут обновлены — мини-игра временно недоступна.";

function CardsMaintenance({ back }: { back?: string }) {
  return (
    <div className="min-h-full pb-10 text-white">
      <GameTopBar title="Легенды Warp Hub" back={back} />
      <div className="px-4 pt-6">
        <div className="rounded-2xl border border-accent/30 bg-app-elevated p-5 text-center">
          <p className={`text-xl uppercase text-accent ${oswald}`}>Временно не работаем</p>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">
            Обновляем изображения карт. Открытие паков, коллекция и предпросмотр будут доступны после обновления.
          </p>
        </div>
      </div>
    </div>
  );
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = Math.max(0, Date.parse(target) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PointsChip({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent">
      <Sparkles className="size-3.5" /> {value.toLocaleString("ru-RU")}
    </span>
  );
}

/** Модальное окно с картой в полный размер */
function CardModal({ card, points, onClose }: { card: CardDef | null; points?: number; onClose: () => void }) {
  if (!card) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="w-full max-w-[580px]" style={{ animation: "float-up 0.25s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <CardFace card={card} points={points} />
        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80"
        >
          <X className="size-4" /> Закрыть
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Пакет
// ---------------------------------------------------------------------------

function Pack({ state, onClick, disabled }: { state: "idle" | "shake" | "tear"; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative mx-auto block h-[300px] w-[210px] select-none disabled:cursor-default"
      style={{
        animation:
          state === "shake" ? "pack-shake 0.6s ease-in-out infinite" : state === "tear" ? "pack-fade 0.5s 0.25s ease-in forwards" : undefined,
      }}
      aria-label="Открыть пакет"
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-[18px] border border-accent/40"
        style={{
          background:
            "linear-gradient(155deg,#2a2b27 0%,#121211 35%,#1d1e1a 55%,#0b0b0a 100%)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.6), 0 0 40px rgba(236,254,70,0.12)",
        }}
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(236,254,70,0.05) 0 3px, transparent 3px 14px)",
          }}
        />
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ animation: "legend-shine 3.2s ease-in-out infinite" }}
        />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(90deg,#ecfe46_0_6px,#0b0b0a_6px_12px)] opacity-70" />
        <div className="relative flex h-full flex-col items-center justify-center gap-3 px-4">
          <img src={s3Url("logo.png")} alt="" className="w-24 [image-rendering:pixelated]" />
          <p className={`text-center text-2xl uppercase leading-none text-white ${oswald}`}>
            Легенды
            <br />
            <span className="text-accent">Warp Hub</span>
          </p>
          <div className="flex gap-1.5">
            {RARITY_ORDER.map((r) => (
              <span key={r} className="size-2 rotate-45" style={{ background: RARITY_STYLE[r].gem }} />
            ))}
          </div>
        </div>
      </div>
      {/* верхняя полоска отрывается */}
      <div
        className="absolute inset-x-0 top-0 h-7 overflow-hidden rounded-t-[18px] border-x border-t border-accent/40 bg-[#1f201c]"
        style={{ animation: state === "tear" ? "pack-tear 0.45s ease-in forwards" : undefined }}
      >
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[repeating-linear-gradient(90deg,transparent_0_5px,#0b0b0a_5px_8px)]" />
        <p className="pt-1 text-center text-[12px] uppercase tracking-[0.2em] text-accent/80">тянуть здесь</p>
      </div>
    </button>
  );
}

function FlipCard({
  card,
  revealed,
  index,
  onReveal,
  onOpen,
}: {
  card: PackCard;
  revealed: boolean;
  index: number;
  onReveal: () => void;
  onOpen: () => void;
}) {
  const big = card.rarity === "epic" || card.rarity === "legendary";
  return (
    <button
      type="button"
      onClick={revealed ? (!CARDS_MAINTENANCE ? onOpen : undefined) : onReveal}
      disabled={revealed && !!CARDS_MAINTENANCE}
      className="relative aspect-[5/7] w-full [perspective:900px] disabled:cursor-default"
      style={{ animation: `card-deal 0.45s ${index * 0.09}s ease-out both` }}
      aria-label={revealed ? (!CARDS_MAINTENANCE ? card.name : ART_REWORK_NOTE) : "Перевернуть карту"}
    >
      <div
        className="relative size-full transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: revealed ? "rotateY(180deg)" : "none" }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <CardBack rarity={card.rarity} />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardFace card={card} points={card.points} size="sm" isNew={card.isNew} />
        </div>
      </div>
      {revealed && big && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${RARITY_STYLE[card.rarity].color}aa 0%, transparent 65%)`,
            animation: "reveal-burst 0.9s ease-out forwards",
          }}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------

type Phase = "idle" | "opening" | "tearing" | "reveal";

export default function CardsGame() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cards = useCards();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pack, setPack] = useState<OpenedPack | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [modal, setModal] = useState<PackCard | null>(null);
  const [flash, setFlash] = useState<CardRarity | null>(null);
  const [error, setError] = useState("");
  const countdown = useCountdown(pack?.nextPackAt ?? cards.data?.nextPackAt ?? null);

  const open = async () => {
    setError("");
    setPhase("opening");
    try {
      const [res] = await Promise.all([openCardPack(), new Promise((r) => setTimeout(r, 900))]);
      setPack(res);
      setRevealed(res.cards.map(() => false));
      setPhase("tearing");
      setTimeout(() => setPhase("reveal"), 700);
      queryClient.invalidateQueries({ queryKey: ["minigames"] });
    } catch (e) {
      setError(errorText(e));
      setPhase("idle");
    }
  };

  const reveal = (i: number) => {
    if (!pack || revealed[i]) return;
    setRevealed((r) => r.map((v, k) => (k === i ? true : v)));
    const rarity = pack.cards[i]!.rarity;
    if (rarity === "epic" || rarity === "legendary") {
      setFlash(rarity);
      setTimeout(() => setFlash(null), 600);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
    } else {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    }
  };

  const revealAll = () => {
    if (!pack) return;
    pack.cards.forEach((_, i) => setTimeout(() => reveal(i), i * 260));
  };

  const allRevealed = revealed.length > 0 && revealed.every(Boolean);
  const state = cards.data;
  const owned = state ? Object.keys(state.collection).length : 0;
  const balance = pack?.balance ?? state?.balance ?? 0;
  const packsLeft = pack ? pack.packsLeft : (state?.packsLeft ?? 0);
  const newCount = pack?.cards.filter((c) => c.isNew).length ?? 0;
  const promoRemaining = state ? Math.max(0, state.nextPromoMilestone - state.lifetimePoints) : 0;
  const promoProgress = state ? ((state.lifetimePoints % 25_000) / 25_000) * 100 : 0;

  if (CARDS_MAINTENANCE) return <CardsMaintenance />;

  return (
    <div className="min-h-full pb-10 text-white">
      <GameTopBar title="Легенды Warp Hub" right={<div className="pr-2"><PointsChip value={balance} /></div>} />

      {flash && (
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{ background: `radial-gradient(circle, ${RARITY_STYLE[flash].color}66, transparent 70%)`, animation: "pack-fade 0.6s ease-out forwards" }}
        />
      )}

      <div className="px-4">
        {cards.isLoading && (
          <div className="space-y-3 py-4" aria-busy="true" aria-label="Загружаем карты">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        )}
        {cards.isError && <ErrorNote message={errorText(cards.error)} onRetry={() => cards.refetch()} />}

        {state && (
          <>
            <button
              type="button"
              onClick={() => navigate("/games/cards/collection")}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-app-elevated px-4 py-3 text-left"
            >
              <Layers className="size-5 text-accent" />
              <div className="flex-1">
                <p className={`uppercase ${oswald}`}>Коллекция</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(owned / state.catalog.length) * 100}%` }} />
                </div>
              </div>
              <span className="text-sm text-fg-2">
                {owned} / {state.catalog.length}
              </span>
            </button>

            <div className="mb-4 rounded-2xl border border-accent/25 bg-accent/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className={`uppercase text-accent ${oswald}`}>Промокод 25% за 25K</p>
                <span className="shrink-0 text-xs text-fg-2">до {state.nextPromoMilestone.toLocaleString("ru-RU")}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${promoProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-fg-2">
                {promoRemaining > 0
                  ? `Ещё ${promoRemaining.toLocaleString("ru-RU")} очков до нового промокода. Считаются все заработанные очки, даже уже потраченные.`
                  : "Новый промокод уже выдан и доступен в ваших наградах."}
              </p>
            </div>

            {(phase === "idle" || phase === "opening" || phase === "tearing") && (
              <div className="py-4">
                {packsLeft > 0 ? (
                  <>
                    <Pack
                      state={phase === "opening" ? "shake" : phase === "tearing" ? "tear" : "idle"}
                      onClick={phase === "idle" ? open : undefined}
                      disabled={phase !== "idle"}
                    />
                    <p className="mt-5 text-center text-sm text-fg-2">
                      {phase === "idle" ? `Нажмите на пакет, чтобы открыть · ${state.cardsPerPack} карт` : "Открываем…"}
                    </p>
                    <p className="mt-1 text-center text-xs text-fg-3">
                      Пакетов сегодня: {packsLeft} из {state.packsPerDay}
                    </p>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <div className="opacity-40 grayscale">
                      <Pack state="idle" disabled />
                    </div>
                    <p className="mt-5 inline-flex items-center gap-2 text-sm text-fg-2">
                      <Clock className="size-4 text-accent" /> Новый пакет через {countdown ?? "—"}
                    </p>
                  </div>
                )}
                {error && (
                  <div className="-mx-4 mt-4">
                    <ErrorNote message={error} />
                  </div>
                )}
              </div>
            )}

            {phase === "reveal" && pack && (
              <div>
                <p className="mb-3 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-center text-xs text-fg-3">{ART_REWORK_NOTE}</p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {pack.cards.map((card, i) => (
                    <div key={i} className={clsx(pack.cards.length % 2 === 1 && i === pack.cards.length - 1 && "col-span-2 mx-auto w-1/2")}>
                      <FlipCard
                        card={card}
                        index={i}
                        revealed={revealed[i] ?? false}
                        onReveal={() => reveal(i)}
                        onOpen={() => setModal(card)}
                      />
                    </div>
                  ))}
                </div>

                {!allRevealed ? (
                  <div className="mt-5 text-center">
                    <p className="text-sm text-fg-3">Нажимайте на карты, чтобы перевернуть</p>
                    <button type="button" onClick={revealAll} className="mt-2 text-sm text-accent underline underline-offset-4">
                      Открыть все
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center" style={{ animation: "float-up 0.35s ease-out" }}>
                    <p className="text-xs uppercase tracking-widest text-fg-3">Получено</p>
                    <p className={`text-5xl text-accent ${oswald}`}>+{pack.points.toLocaleString("ru-RU")}</p>
                    <p className="text-sm text-fg-2">
                      очков · на счёте {pack.balance.toLocaleString("ru-RU")}
                      {newCount > 0 ? ` · новых карт: ${newCount}` : ""}
                    </p>
                    {pack.promos.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {pack.promos.map((promo) => (
                          <div key={promo.id} className="rounded-xl border border-accent/40 bg-black/30 p-3">
                            <p className="text-xs uppercase tracking-widest text-accent">Промокод за {promo.milestone.toLocaleString("ru-RU")} очков</p>
                            <p className={`mt-1 select-all text-2xl tracking-wider text-white ${oswald}`}>{promo.code}</p>
                            <p className="text-xs text-fg-2">Скидка {promo.percent}% на счёт записи · одно применение</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {pack.packsLeft > 0 ? (
                        <PixelButton
                          onClick={() => {
                            setPack(null);
                            setPhase("idle");
                            void cards.refetch();
                          }}
                        >
                          Ещё пакет
                        </PixelButton>
                      ) : (
                        <PixelButton variant="dark" onClick={() => navigate("/games")}>
                          К играм
                        </PixelButton>
                      )}
                      <PixelButton variant="dark" onClick={() => navigate("/games/cards/collection")}>
                        Коллекция
                      </PixelButton>
                    </div>
                    {pack.packsLeft === 0 && (
                      <p className="mt-3 text-xs text-fg-3">Следующий пакет через {countdown ?? "—"}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-8">
              <p className={`mb-2 text-sm uppercase tracking-widest text-fg-3 ${oswald}`}>Очки за карты</p>
              <div className="space-y-1.5">
                {state.rarities.map((r) => (
                  <div key={r.rarity} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/3 px-3 py-2 text-xs">
                    <span className={clsx("flex items-center gap-2", RARITY_STYLE[r.rarity].text)}>
                      <span className="size-2 rotate-45" style={{ background: RARITY_STYLE[r.rarity].gem }} />
                      {r.label}
                      <span className="text-fg-3">· {r.chance}%</span>
                    </span>
                    <span className="font-semibold text-white">{r.points} очков</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-fg-3">
                Очки копятся на вашем счёте — администратор клуба может списать их в счёт скидок и призов.
              </p>
            </div>
          </>
        )}
      </div>

      <CardModal card={modal} points={modal?.points} onClose={() => setModal(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Коллекция
// ---------------------------------------------------------------------------

export function CardCollection() {
  const cards = useCards();
  const [filter, setFilter] = useState<CardRarity | "all" | "owned">("all");
  const [visibleCount, setVisibleCount] = useState(60);
  const [modal, setModal] = useState<CardDef | null>(null);
  const state = cards.data;

  const list = useMemo(() => {
    if (!state) return [];
    const order = (c: CardDef) => RARITY_ORDER.indexOf(c.rarity);
    return [...state.catalog]
      .filter((c) => (filter === "all" ? true : filter === "owned" ? state.collection[c.id] : c.rarity === filter))
      .sort(
        (a, b) =>
          // сначала свои карты, затем по редкости (от легендарных) и фракции
          Number(!!state.collection[b.id]) - Number(!!state.collection[a.id]) ||
          order(b) - order(a) ||
          a.faction.localeCompare(b.faction),
      );
  }, [state, filter]);

  const visibleList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);
  const owned = state ? Object.keys(state.collection).length : 0;
  const pointsOf = (r: CardRarity) => state?.rarities.find((x) => x.rarity === r)?.points;

  if (CARDS_MAINTENANCE) return <CardsMaintenance back="/games/cards" />;

  return (
    <div className="min-h-full pb-10 text-white">
      <GameTopBar title="Коллекция" back="/games/cards" right={state ? <div className="pr-2"><PointsChip value={state.balance} /></div> : undefined} />
      <div className="px-4">
        {cards.isLoading && (
          <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3" aria-busy="true" aria-label="Загружаем коллекцию">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        )}
        {state && (
          <>
            <div className="rounded-2xl border border-white/10 bg-app-elevated p-4">
              <div className="flex items-end justify-between">
                <p className={`text-3xl text-accent ${oswald}`}>
                  {owned}
                  <span className="text-lg text-fg-3"> / {state.catalog.length}</span>
                </p>
                <p className="text-xs text-fg-3">пакетов открыто: {state.packsOpened}</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(owned / state.catalog.length) * 100}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                {RARITY_ORDER.map((r) => {
                  const total = state.catalog.filter((c) => c.rarity === r).length;
                  const have = state.catalog.filter((c) => c.rarity === r && state.collection[c.id]).length;
                  return (
                    <div key={r}>
                      <p className="text-sm font-semibold" style={{ color: RARITY_STYLE[r].color }}>
                        {have}/{total}
                      </p>
                      <p lang="ru" className="hyphens-auto break-words text-[12px] leading-tight text-fg-3">{state.rarities.find((x) => x.rarity === r)?.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {([["all", "Все"], ["owned", "Мои"], ...RARITY_ORDER.map((r) => [r, state.rarities.find((x) => x.rarity === r)?.label ?? r])] as Array<[typeof filter, string]>).map(
                ([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setFilter(id);
                      setVisibleCount(60);
                    }}
                    className={clsx(
                      "ds-press min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-semibold",
                      filter === id ? "bg-accent text-accent-foreground" : "border border-white/[0.14] bg-app-elevated text-fg-2",
                    )}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            <p className="mt-4 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-center text-xs text-fg-3">{ART_REWORK_NOTE}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleList.map((card) => {
                const count = state.collection[card.id];
                return count ? (
                  <button key={card.id} type="button" disabled={!!CARDS_MAINTENANCE} aria-disabled={!!CARDS_MAINTENANCE} onClick={!CARDS_MAINTENANCE ? () => setModal(card) : undefined} className="text-left disabled:cursor-default">
                    <CardFace card={card} size="sm" count={count} points={pointsOf(card.rarity)} />
                  </button>
                ) : (
                  <div
                    key={card.id}
                    className="flex aspect-[5/7] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center"
                    style={{ borderColor: `${RARITY_STYLE[card.rarity].color}55` }}
                  >
                    <span className={`text-3xl text-fg-3 ${oswald}`}>?</span>
                    <span className="mt-1 text-[12px]" style={{ color: `${RARITY_STYLE[card.rarity].color}cc` }}>
                      {card.rarityLabel}
                    </span>
                    <span className="line-clamp-2 text-[12px] leading-tight text-fg-3">{card.factionLabel}</span>
                  </div>
                );
              })}
            </div>
            {list.length > 0 && (
              <div className="mt-4 text-center">
                <p className="text-xs text-fg-3">Показано {visibleList.length} из {list.length}</p>
                {visibleCount < list.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + 60)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-app-elevated px-4 text-sm font-semibold text-white"
                  >
                    Показать ещё {Math.min(60, list.length - visibleCount)}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <CardModal card={modal} points={modal ? pointsOf(modal.rarity) : undefined} onClose={() => setModal(null)} />
    </div>
  );
}
