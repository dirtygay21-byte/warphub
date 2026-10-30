import { haptic } from "@/utils/haptic";
import clsx from "clsx";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Crown,
  Dice5,
  Gift,
  KeyRound,
  Newspaper,
  ShieldCheck,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type Section = { path: string; label: string; sub: string; icon: LucideIcon };

/** Разделы админ-панели по группам (концепт «Admin menu», D4a). Адреса страниц — как в App.tsx. */
const GROUPS: { title: string; items: Section[] }[] = [
  {
    title: "Записи",
    items: [
      { path: "/admin", label: "Все записи", sub: "Игры, тренировки, покраска, клуб", icon: CalendarDays },
      { path: "/admin/warhammer", label: "Столы Warhammer", sub: "Расписание столов на день", icon: Swords },
      { path: "/admin/dnd", label: "D&D", sub: "Игры, заявки и мастера", icon: Dice5 },
    ],
  },
  {
    title: "Клуб",
    items: [
      { path: "/admin/content", label: "Контент", sub: "Ивенты и новости", icon: Newspaper },
      { path: "/admin/rewards", label: "Награды", sub: "Скидки за мини-игры", icon: Gift },
      { path: "/admin/supporters", label: "Поддержка клуба", sub: "Особые звания и рамки аватара", icon: Crown },
    ],
  },
  {
    title: "Доступ",
    items: [
      { path: "/admin/roster", label: "Ростеры", sub: "Коды доступа WarpBuilder", icon: KeyRound },
      { path: "/admin/admins", label: "Админы", sub: "Кто управляет приложением", icon: ShieldCheck },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.items);

const sectionOf = (pathname: string) =>
  SECTIONS.filter((s) => s.path !== "/admin").find((s) => pathname.startsWith(s.path)) ?? SECTIONS[0]!;

/**
 * Шапка админ-панели: выход в профиль и переключатель раздела; список разделов — нижняя шторка с группами.
 * Открытие шторки задаёт AdminLayout (кнопка «Назад» Telegram сначала закрывает шторку).
 */
export default function AdminNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = sectionOf(pathname);
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (path: string) => {
    haptic.select();
    onOpenChange(false);
    if (path !== current.path) navigate(path);
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-app-bg px-4 pb-3 pt-3 text-fg lg:px-6">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Админ-панель</span>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              navigate("/profile");
            }}
            aria-label="Выйти из админ-панели"
            className="ds-press flex size-[52px] shrink-0 items-center justify-center rounded-[14px] border border-white/[0.14] bg-app-elevated text-fg"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              onOpenChange(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="ds-press flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-white/[0.14] bg-app-elevated px-3.5 text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent text-accent-foreground">
              <CurrentIcon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-xl font-semibold uppercase leading-tight">{current.label}</span>
              <span className="block text-[12px] text-fg-3">Раздел · нажмите, чтобы сменить</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-fg-3" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="ds-fade absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Разделы админ-панели"
            className="ds-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col gap-3.5 overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-app-elevated px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 text-fg"
          >
            <div className="h-1 w-10 self-center rounded bg-white/20" />
            <h2 className="px-1 font-display text-[22px] font-semibold uppercase leading-none">Разделы</h2>
            {GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <span className="px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-fg-3">{group.title}</span>
                <div className="flex flex-col overflow-hidden rounded-[14px] bg-field">
                  {group.items.map((item) => {
                    const active = item.path === current.path;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => go(item.path)}
                        aria-current={active ? "page" : undefined}
                        className={clsx(
                          "flex min-h-[56px] items-center gap-3 border-t border-white/[0.05] px-3.5 py-2 text-left transition-colors first:border-t-0 active:bg-white/[0.06]",
                          active && "bg-accent/10",
                        )}
                      >
                        <Icon className={clsx("size-5 shrink-0", active ? "text-accent" : "text-fg-2")} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold">{item.label}</span>
                          <span className="block text-[13px] text-fg-2">{item.sub}</span>
                        </span>
                        {active && <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate("/profile");
              }}
              className="ds-press h-12 shrink-0 rounded-[14px] border border-white/[0.14] text-[15px] font-semibold"
            >
              Выйти в приложение
            </button>
          </div>
        </div>
      )}
    </>
  );
}
