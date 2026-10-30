import { getMe } from "@/apiUtils/user";
import { CATEGORY_LABELS, getMyProgress, RANK_ORDER, SUPPORTER_LABELS, type ProgressCategory } from "@/apiUtils/progress";
import AvatarFrame from "@/components/ui/AvatarFrame/AvatarFrame";
import SupporterFrame from "@/components/ui/AvatarFrame/SupporterFrame";
import PlayerProgressCard from "./PlayerProgressCard";
import { pickFrame, saveFrame } from "./progressChoice";
import { getRosterAccess } from "@/apiUtils/roster";
import { AccessCodeDialog } from "./AccessCodeDialog";
import TelegramOnly from "@/components/ui/TelegramOnly/TelegramOnly";
import { isOutsideTelegram } from "@/utils/telegramEnv";
import { useAuthStore } from "@/stores/useAuthStore";
import { getFullName, getInitials } from "@/utils/user";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Check, Copy, Gamepad2, Hash, LoaderCircle, RefreshCw, ShieldCheck, Swords, UserRound } from "lucide-react";
import { DsButton, GroupCard, NavRow, SectionLabel } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export default function Profile() {
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
      <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center px-6 text-fg-2">
        <LoaderCircle className="size-8 animate-spin text-accent" />
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

  return (
    <div className="ds-enter px-5 py-3 text-fg lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:pt-8">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.35)] lg:sticky lg:top-8 lg:row-span-6">
        <div className="relative px-6 pb-6 pt-8 text-center">
          <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-accent/15 to-transparent" />

          {supporter ? (
            <SupporterFrame title={supporter} size={104} label={`Поддерживает клуб: ${SUPPORTER_LABELS[supporter]}`}>
              {avatar}
            </SupporterFrame>
          ) : (
            <AvatarFrame
              category={frame?.category ?? "warhammer"}
              tier={frame ? RANK_ORDER.indexOf(frame.rank) : 0}
              size={96}
              label={frame ? `Рамка: ${CATEGORY_LABELS[frame.category]} · ${frame.rankLabel}` : undefined}
            >
              {avatar}
            </AvatarFrame>
          )}


          <h1 className="text-2xl font-semibold leading-tight">
            {fullName || "Пользователь"}
          </h1>

          {user?.username ? (
            <p className="mt-2 text-[15px] text-fg-2">@{user?.username}</p>
          ) : (
            <p className="mt-2 text-[15px] text-fg-3">Username не указан</p>
          )}
          {supporter && (
            <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[13px] font-bold uppercase tracking-[0.04em] text-accent-foreground">
              ★ {SUPPORTER_LABELS[supporter]} · Поддерживает клуб
            </p>
          )}
        </div>
      </section>

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

      <NavRow
        className="mt-4"
        tone="accent-outline"
        bareIcon
        icon={<Gamepad2 className="size-7" />}
        title="Мини-игры"
        subtitle="Играйте и получайте скидки в клубе"
        onClick={() => navigate("/games")}
      />

      <section className="mt-6">
        <SectionLabel>Информация</SectionLabel>

        <GroupCard>
          <InfoRow
            icon={<UserRound className="size-5" />}
            label="Имя"
            value={user?.firstName || "—"}
          />
          <InfoRow
            icon={<UserRound className="size-5" />}
            label="Фамилия"
            value={user?.lastName || "—"}
          />
          <InfoRow
            icon={<AtSign className="size-5" />}
            label="Telegram"
            value={user?.username ? `@${user?.username}` : "—"}
          />
          <InfoRow
            icon={<Hash className="size-5" />}
            label="Telegram ID"
            value={user?.telegramId ? String(user?.telegramId) : "—"}
            copy={user?.telegramId ? String(user?.telegramId) : undefined}
          />
        </GroupCard>
      </section>

      <DsButton
        className="mt-4 w-full"
        size="lg"
        onClick={() => profileQuery.refetch()}
        disabled={profileQuery.isFetching}
      >
        <RefreshCw className={`size-[18px] ${profileQuery.isFetching ? "animate-spin" : ""}`} />
        {profileQuery.isFetching ? "Обновляем…" : "Обновить имя и фото из Telegram"}
      </DsButton>

      {hasRosterAccess && (
        <NavRow
          className="mt-3"
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
          className="mt-3"
          iconTone="neutral"
          icon={<ShieldCheck className="size-[22px]" />}
          title="Админ-панель"
          subtitle="Записи, столы, контент, доступы"
          onClick={() => navigate("/admin")}
        />
      )}

      {isAuthenticated && rosterAccess.isSuccess && !hasRosterAccess && (
        <button
          type="button"
          onClick={() => setCodeOpen(true)}
          className="mx-auto mt-6 block min-h-11 px-4 text-sm font-medium text-fg-3 transition-colors active:text-fg-2"
        >
          Есть код доступа?
        </button>
      )}

      {codeOpen && (
        <AccessCodeDialog
          onClose={() => setCodeOpen(false)}
          onSuccess={() => {
            setCodeOpen(false);
            navigate("/roster");
          }}
        />
      )}
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
