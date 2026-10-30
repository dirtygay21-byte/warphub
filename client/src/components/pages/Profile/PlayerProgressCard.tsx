import { CATEGORY_LABELS, RANK_MIN, type CategoryProgress, type ProgressCategory } from "@/apiUtils/progress";
import { SectionLabel } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import { Brush, Check, Dice5, Swords, Users } from "lucide-react";
import type { ReactNode } from "react";

const ICONS: Record<ProgressCategory, ReactNode> = {
  warhammer: <Swords className="size-5" />,
  dnd: <Dice5 className="size-5" />,
  painting: <Brush className="size-5" />,
  visits: <Users className="size-5" />,
};

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
  return (
    <section className="mt-6">
      <SectionLabel>Мой прогресс</SectionLabel>
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
                  <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent">{c.rankLabel}</span>
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
    </section>
  );
}
