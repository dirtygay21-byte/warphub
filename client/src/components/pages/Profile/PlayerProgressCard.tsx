import { CATEGORY_LABELS, RANK_MIN, RANK_ORDER, type CategoryProgress, type ProgressCategory, type RankKey } from "@/apiUtils/progress";
import { Badge } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import { Brush, Check, ChevronDown, Dice5, Swords, Trophy, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const ICONS: Record<ProgressCategory, ReactNode> = {
  warhammer: <Swords className="size-5" />,
  dnd: <Dice5 className="size-5" />,
  painting: <Brush className="size-5" />,
  visits: <Users className="size-5" />,
};

/**
 * Новый ранг (stage 3): последний увиденный ранг по категориям хранится на устройстве.
 * Первый визит — только запоминаем; дальше ранг выше запомненного показывается как «Новый ранг!» (один раз).
 */
const SEEN_RANKS_KEY = "warphub:seen-ranks";
type SeenRanks = Partial<Record<ProgressCategory, RankKey>>;

function readSeenRanks(): SeenRanks | null {
  try {
    const raw = localStorage.getItem(SEEN_RANKS_KEY);
    return raw ? (JSON.parse(raw) as SeenRanks) : null;
  } catch {
    return null;
  }
}

function rankedUpSince(seen: SeenRanks | null, categories: CategoryProgress[]): Set<ProgressCategory> {
  if (!seen) return new Set();
  return new Set(
    categories
      .filter((c) => {
        const prev = seen[c.category];
        return prev !== undefined && RANK_ORDER.indexOf(c.rank) > RANK_ORDER.indexOf(prev);
      })
      .map((c) => c.category),
  );
}

const gamesWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "игра";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "игры";
  return "игр";
};

/**
 * «Мой прогресс»: ранг и число сыгранных игр по категориям, полоса до следующего ранга.
 * Нажатие на строку выбирает, какая рамка у аватара (на этом устройстве).
 */
export default function PlayerProgressCard({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryProgress[];
  selected: ProgressCategory | null;
  onSelect: (category: ProgressCategory) => void;
}) {
  // свёрнуто по умолчанию: строка «Мой прогресс» раскрывает категории (решение владельца 30.10.2026)
  const [open, setOpen] = useState(false);
  const total = categories.reduce((sum, c) => sum + c.games, 0);
  const [seenAtMount] = useState(readSeenRanks);
  const rankedUp = rankedUpSince(seenAtMount, categories);

  useEffect(() => {
    if (categories.length === 0) return;
    try {
      localStorage.setItem(SEEN_RANKS_KEY, JSON.stringify(Object.fromEntries(categories.map((c) => [c.category, c.rank]))));
    } catch {
      // нет доступа к хранилищу — «Новый ранг» просто не покажется
    }
  }, [categories]);
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => {
          haptic.tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="ds-press flex min-h-[64px] w-full items-center gap-3.5 rounded-[18px] border border-white/10 bg-app-elevated px-4 py-3 text-left"
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Trophy className="size-5" />
          {rankedUp.size > 0 && (
            <>
              <span aria-hidden="true" className="fx-strong-only fx-burst" />
              <span aria-hidden="true" className="fx-strong-only fx-burst fx-burst-late" />
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[17px] font-bold leading-tight">Мой прогресс</span>
            {rankedUp.size > 0 && <Badge tone="accent" className="ds-pop">Новый ранг!</Badge>}
          </span>
          <span className="mt-0.5 block text-sm text-fg-2">
            {total} {gamesWord(total)} · ранги и рамки аватара
          </span>
        </span>
        <ChevronDown className={clsx("size-5 shrink-0 text-fg-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
      <div className="ds-fade mt-2.5">
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
        {categories.map((c) => {
          const from = RANK_MIN[c.rank];
          const pct = c.nextAt === null ? 100 : Math.round(((c.games - from) / (c.nextAt - from)) * 100);
          const active = c.category === selected;
          return (
            <button
              key={c.category}
              type="button"
              onClick={() => {
                haptic.select();
                onSelect(c.category);
              }}
              aria-pressed={active}
              className={clsx("ds-press flex w-full items-center gap-3 px-4 py-3.5 text-left", active && "bg-accent/[0.06]")}
            >
              <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl", active ? "bg-accent text-accent-foreground" : "bg-white/[0.08] text-fg")}>
                {ICONS[c.category]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-base font-semibold">{CATEGORY_LABELS[c.category]}</span>
                  <span className={clsx("shrink-0 whitespace-nowrap text-sm font-semibold text-accent", rankedUp.has(c.category) && "fx-strong fx-bump")}>{c.rankLabel}</span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <span className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out-soft" style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-1 block text-[13px] text-fg-2">
                  {c.games} {gamesWord(c.games)}
                  {c.nextAt !== null ? ` · до «${c.nextLabel}» ещё ${c.nextAt - c.games}` : " · высший ранг"}
                </span>
              </span>
              {active && <Check className="size-4 shrink-0 text-accent" aria-label="Рамка аватара" />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-fg-3">
        Считаются подтверждённые записи после того, как игра прошла. Нажмите на категорию, чтобы выбрать рамку аватара.
      </p>
      </div>
      )}
    </section>
  );
}
