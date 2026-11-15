import { getMe } from "@/apiUtils/user";
import { CATEGORY_LABELS, getMyProgress, RANK_ORDER, SUPPORTER_LABELS, type ProgressCategory } from "@/apiUtils/progress";
import AvatarFrame from "@/components/ui/AvatarFrame/AvatarFrame";
import SupporterFrame from "@/components/ui/AvatarFrame/SupporterFrame";
import PlayerProgressCard from "./PlayerProgressCard";
import { pickFrame, saveFrame } from "./progressChoice";
import { getRosterAccess } from "@/apiUtils/roster";
import { AccessCodeDialog } from "./AccessCodeDialog";
import SupportSection from "./SupportSection";
import PartnerSection from "./PartnerSection";
import NotificationsTab from "./NotificationsSection";
import TelegramOnly from "@/components/ui/TelegramOnly/TelegramOnly";
import { isOutsideTelegram } from "@/utils/telegramEnv";
import { useAuthStore } from "@/stores/useAuthStore";
import { getFullName, getInitials } from "@/utils/user";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Bell, BookOpen, Check, Copy, Gamepad2, Hash, LayoutGrid, RefreshCw, ShieldCheck, Sparkles, Store, Swords, UserRound } from "lucide-react";
import { DsButton, GroupCard, LimeCorner, NavRow, SectionLabel, Skeleton } from "@/components/ui/ds";
import clsx from "clsx";
import { useEffectsStore } from "@/stores/useEffectsStore";
import { haptic } from "@/utils/haptic";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { toast } from "@/stores/useToastStore";

/** Разделы профиля (переработка 14.11.2026): меню-вкладки, выбранная — в адресе `/profile?tab=…`. */
type ProfileTab = "overview" | "notifications" | "account" | "club";
const PROFILE_TABS: ProfileTab[] = ["overview", "notifications", "account", "club"];

export default function Profile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as ProfileTab | null;
  const tab: ProfileTab = tabParam && PROFILE_TABS.includes(tabParam) ? tabParam : "overview";
  const selectTab = (next: ProfileTab) => {
    if (next === tab) return;
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [codeOpen, setCodeOpen] = useState(false);

  // Roster Builder — скрытый раздел: кнопка видна только тем, у кого есть доступ
  const rosterAccess = useQuery({
    queryKey: ["roster-access"],
    queryFn: getRosterAccess,
    enabled: isAuthenticated,
  });
  const hasRosterAccess = rosterAccess.data?.hasAccess === true;

  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  // прогресс игрока и рамка аватара (30.10.2026)
  const progressQuery = useQuery({ queryKey: ["me-progress"], queryFn: getMyProgress, enabled: isAuthenticated });
  const [frameChoice, setFrameChoice] = useState<ProgressCategory | null>(null);
  const frame = progressQuery.data
    ? (progressQuery.data.categories.find((c) => c.category === frameChoice) ?? pickFrame(progressQuery.data.categories))
    : null;

  useEffect(() => {
    if (profileQuery.data) {
      setUser(profileQuery.data);
    }
  }, [profileQuery.data, setUser]);

  if (isOutsideTelegram()) return <TelegramOnly what="Профиль, мини-игры и WarpBuilder" />;

  if (profileQuery.isLoading) {
    return (
      <div className="px-5 pb-3 pt-6" aria-busy="true" aria-label="Загружаем профиль">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-app-elevated p-6">
          <Skeleton className="size-[104px] rounded-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-[18px]" />
          ))}
        </div>
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <p className="text-sm text-fg-2">
          Не удалось загрузить профиль. Попробуйте ещё раз.
        </p>
        <button
          type="button"
          onClick={() => profileQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          <RefreshCw className="size-4" />
          Повторить
        </button>
      </div>
    );
  }

  const user = profileQuery.data;
  const fullName = getFullName(user?.firstName ?? "", user?.lastName ?? "");
  const supporter = progressQuery.data?.supporter ?? null;
  const avatar = (
    <div className="flex size-full items-center justify-center bg-app-subtle">
      {user?.photoUrl ? (
        <img src={user?.photoUrl} alt={fullName || "Аватар пользователя"} className="size-full object-cover" />
      ) : (
        <span className="text-2xl font-semibold text-accent">{getInitials(user?.firstName ?? "", user?.lastName ?? "")}</span>
      )}
    </div>
  );

  const tabs: { value: ProfileTab; label: string; icon: ReactNode }[] = [
    { value: "overview", label: "Обзор", icon: <LayoutGrid className="size-[18px]" /> },
    { value: "notifications", label: "Уведомления", icon: <Bell className="size-[18px]" /> },
    { value: "account", label: "Аккаунт", icon: <UserRound className="size-[18px]" /> },
    { value: "club", label: "Клуб", icon: <Store className="size-[18px]" /> },
  ];

  return (
    <div className="ds-enter px-5 py-3 text-fg lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:pt-8">
      {/* шапка: аватар с рамкой, имя, username — компактно (переработка профиля 14.11.2026) */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.35)] lg:sticky lg:top-8">
        <div className="absolute inset-x-0 top-0 h-20 bg-linear-to-b from-accent/15 to-transparent" />
        {/* лаймовый концепт (15.11.2026): уголок с червяком — справа снизу, сверху переключатель эффектов */}
        <LimeCorner size={60} className="bottom-0 top-auto rotate-90" />
        <EffectsToggle />
        <div className="relative flex items-center gap-4 py-4 pl-4 pr-10 pt-5 lg:flex-col lg:px-6 lg:pb-6 lg:pt-8 lg:text-center">
          <div className="flex shrink-0 justify-center">
            {supporter ? (
              <SupporterFrame inline title={supporter} size={72} label={`Поддерживает клуб: ${SUPPORTER_LABELS[supporter]}`}>
                {avatar}
              </SupporterFrame>
            ) : (
              <AvatarFrame
                inline
                category={frame?.category ?? "warhammer"}
                tier={frame ? RANK_ORDER.indexOf(frame.rank) : 0}
                size={68}
                label={frame ? `Рамка: ${CATEGORY_LABELS[frame.category]} · ${frame.rankLabel}` : undefined}
              >
                {avatar}
              </AvatarFrame>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-14 lg:pr-0">
            <h1 className="truncate text-xl font-semibold leading-tight lg:text-2xl">{fullName || "Пользователь"}</h1>
            <p className={clsx("mt-1 truncate text-[15px]", user?.username ? "text-fg-2" : "text-fg-3")}>
              {user?.username ? `@${user.username}` : "Username не указан"}
            </p>
            {frame && !supporter && (
              <p className="mt-1 truncate text-[13px] text-fg-3">
                {CATEGORY_LABELS[frame.category]} · {frame.rankLabel}
              </p>
            )}
            {supporter && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.04em] text-accent-foreground">
                ★ {SUPPORTER_LABELS[supporter]}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="min-w-0">
        {/* меню разделов: закреплено сверху при прокрутке, выбранный раздел — в адресе (?tab=) */}
        <nav
          aria-label="Разделы профиля"
          className="sticky top-[60px] z-40 -mx-5 mt-4 bg-app-bg/95 px-5 py-2 backdrop-blur lg:top-0 lg:mx-0 lg:mt-0 lg:px-0"
        >
          <div role="tablist" className="grid grid-cols-4 gap-1 rounded-[14px] border border-white/10 bg-app-elevated p-1">
            {tabs.map((t) => {
              const on = t.value === tab;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  id={`profile-tab-${t.value}`}
                  aria-selected={on}
                  aria-controls={`profile-panel-${t.value}`}
                  onClick={() => selectTab(t.value)}
                  className={clsx(
                    "ds-press flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 text-[11.5px] font-semibold leading-tight",
                    on ? "bg-accent text-accent-foreground" : "text-fg-2",
                  )}
                >
                  {t.icon}
                  <span className="max-w-full truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} className="mt-3">
          {tab === "overview" && (
            <div className="space-y-6">
              {progressQuery.data && (
                <PlayerProgressCard
                  categories={progressQuery.data.categories}
                  selected={supporter ? null : (frame?.category ?? null)}
                  onSelect={(category) => {
                    saveFrame(category);
                    setFrameChoice(category);
                  }}
                />
              )}

              <section>
                <SectionLabel>Разделы</SectionLabel>
                <div className="space-y-3">
                  <NavRow
                    tone="accent-outline"
                    bareIcon
                    icon={<Gamepad2 className="size-7" />}
                    title="Мини-игры"
                    subtitle="Играйте и получайте скидки в клубе"
                    onClick={() => navigate("/games")}
                  />
                  <NavRow
                    icon={<BookOpen className="size-5" />}
                    title="Как играть"
                    subtitle="Обучение для новичков: схемы и короткие правила"
                    onClick={() => navigate("/learn")}
                  />
                  {hasRosterAccess && (
                    <NavRow
                      tone="accent"
                      iconTone="solid"
                      icon={<Swords className="size-[22px]" />}
                      title="WarpBuilder"
                      subtitle="40K, Age of Sigmar, Kill Team, Warcry"
                      onClick={() => navigate("/roster")}
                    />
                  )}
                  {isAdmin && (
                    <NavRow
                      iconTone="neutral"
                      icon={<ShieldCheck className="size-[22px]" />}
                      title="Админ-панель"
                      subtitle="Записи, столы, контент, доступы"
                      onClick={() => navigate("/admin")}
                    />
                  )}
                </div>
                {isAuthenticated && rosterAccess.isSuccess && !hasRosterAccess && (
                  <button
                    type="button"
                    onClick={() => setCodeOpen(true)}
                    className="mx-auto mt-4 block min-h-11 px-4 text-sm font-medium text-fg-3 transition-colors active:text-fg-2"
                  >
                    Есть код доступа?
                  </button>
                )}
              </section>
            </div>
          )}

          {tab === "notifications" && <NotificationsTab />}

          {tab === "account" && (
            <div className="space-y-4">
              <section>
                <SectionLabel>Данные из Telegram</SectionLabel>
                <GroupCard>
                  <InfoRow icon={<UserRound className="size-5" />} label="Имя" value={user?.firstName || "—"} />
                  <InfoRow icon={<UserRound className="size-5" />} label="Фамилия" value={user?.lastName || "—"} />
                  <InfoRow icon={<AtSign className="size-5" />} label="Telegram" value={user?.username ? `@${user?.username}` : "—"} />
                  <InfoRow
                    icon={<Hash className="size-5" />}
                    label="Telegram ID"
                    value={user?.telegramId ? String(user?.telegramId) : "—"}
                    copy={user?.telegramId ? String(user?.telegramId) : undefined}
                  />
                </GroupCard>
              </section>
              <DsButton
                className="w-full"
                size="lg"
                onClick={async () => {
                  const result = await profileQuery.refetch();
                  if (result.isError) toast.error("Не удалось обновить профиль. Попробуйте позже");
                  else toast.success("Профиль обновлён");
                }}
                disabled={profileQuery.isFetching}
              >
                <RefreshCw className={`size-[18px] ${profileQuery.isFetching ? "animate-spin" : ""}`} />
                {profileQuery.isFetching ? "Обновляем…" : "Обновить имя и фото из Telegram"}
              </DsButton>
              <p className="text-center text-[13px] text-fg-3">Имя, фото и username берутся из Telegram. Изменили их там — нажмите «Обновить».</p>
            </div>
          )}

          {tab === "club" && (
            <div>
              <SupportSection />
              <PartnerSection />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {codeOpen && (
          <AccessCodeDialog
            onClose={() => setCodeOpen(false)}
            onSuccess={() => {
              setCodeOpen(false);
              toast.success("Доступ к WarpBuilder открыт");
              navigate("/roster");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  copy,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** значение для копирования (кнопка справа) */
  copy?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <div className="text-accent">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{label}</p>
        <p className="mt-0.5 truncate text-base font-semibold text-fg">{value}</p>
      </div>
      {copy && (
        <button
          type="button"
          aria-label={`Скопировать: ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(copy);
              setCopied(true);
              haptic.ok();
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* буфер обмена недоступен */
            }
          }}
          className="ds-press flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 active:bg-white/[0.06]"
        >
          {copied ? <Check className="ds-pop size-[18px] text-accent" /> : <Copy className="size-[18px]" />}
        </button>
      )}
    </div>
  );
}

/**
 * Переключатель «Яркие эффекты» (на этом устройстве) — маленький, в правом верхнем углу карточки профиля
 * (решение владельца 06.11.2026). Подписи нет, поэтому смена состояния подтверждается всплывающим сообщением.
 * При «Уменьшить движение» в системе эффекты выключены всегда — нажатие объясняет почему.
 */
function EffectsToggle() {
  const strongEnabled = useEffectsStore((s) => s.strongEnabled);
  const systemReduced = useEffectsStore((s) => s.systemReduced);
  const setStrongEnabled = useEffectsStore((s) => s.setStrongEnabled);
  const on = strongEnabled && !systemReduced;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Яркие эффекты"
      title={systemReduced ? "Яркие эффекты выключены: в системе включено «Уменьшить движение»" : "Яркие эффекты"}
      onClick={() => {
        haptic.select();
        if (systemReduced) {
          toast.info("В системе включено «Уменьшить движение» — яркие эффекты выключены");
          return;
        }
        setStrongEnabled(!strongEnabled);
        toast.info(strongEnabled ? "Яркие эффекты выключены" : "Яркие эффекты включены");
      }}
      className="ds-press absolute right-1.5 top-1.5 z-[2] flex min-h-11 items-center gap-1.5 rounded-full px-2.5"
    >
      <Sparkles aria-hidden="true" className={clsx("size-4 transition-colors duration-200", on ? "text-accent" : "text-fg-3")} />
      <span
        aria-hidden="true"
        className={clsx(
          "flex h-[18px] w-[30px] items-center rounded-full p-[2px] transition-colors duration-200",
          on ? "justify-end bg-accent" : "justify-start bg-white/[0.16]",
          systemReduced && "opacity-50",
        )}
      >
        <span className={clsx("size-[14px] rounded-full", on ? "bg-accent-foreground" : "bg-fg")} />
      </span>
    </button>
  );
}
