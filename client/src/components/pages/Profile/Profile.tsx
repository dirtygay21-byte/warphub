import { getMe } from "@/apiUtils/user";
import { getRosterAccess } from "@/apiUtils/roster";
import { AccessCodeDialog } from "./AccessCodeDialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { getFullName, getInitials } from "@/utils/user";
import { useQuery } from "@tanstack/react-query";
import { AtSign, ChevronRight, Hash, LoaderCircle, RefreshCw, Swords, UserRound } from "lucide-react";
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

  useEffect(() => {
    if (profileQuery.data) {
      setUser(profileQuery.data);
    }
  }, [profileQuery.data, setUser]);

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] items-center justify-center px-6 text-white/60">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <p className="text-sm text-white/70">
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

  return (
    <div className="px-6 py-3 text-white">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="relative px-6 pb-6 pt-8 text-center">
          <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-accent/15 to-transparent" />

          <div className="relative mx-auto mb-4 flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-accent/70 bg-app-subtle">
            {user?.photoUrl ? (
              <img
                src={user?.photoUrl}
                alt={fullName || "Аватар пользователя"}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-2xl font-semibold text-accent">
                {getInitials(user?.firstName ?? "", user?.lastName ?? "")}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-semibold leading-tight">
            {fullName || "Пользователь"}
          </h1>

          {user?.username ? (
            <p className="mt-2 text-sm text-white/60">@{user?.username}</p>
          ) : (
            <p className="mt-2 text-sm text-white/40">Username не указан</p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          Информация
        </h2>

        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
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
          />
        </div>
      </section>

      <button
        type="button"
        onClick={() => profileQuery.refetch()}
        disabled={profileQuery.isFetching}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-4 text-sm font-semibold text-white transition-colors active:bg-white/10 disabled:opacity-60"
      >
        <RefreshCw
          className={`size-4 ${profileQuery.isFetching ? "animate-spin" : ""}`}
        />
        {profileQuery.isFetching ? "Обновляем..." : "Обновить профиль"}
      </button>

      {hasRosterAccess && (
        <button
          type="button"
          onClick={() => navigate("/roster")}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-4 text-left text-white transition-colors active:bg-accent/20"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Swords className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Roster Builder</span>
            <span className="block text-xs text-white/55">Конструктор ростеров Warhammer 40,000</span>
          </span>
          <ChevronRight className="size-5 text-accent" />
        </button>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-4 text-sm font-semibold text-white transition-colors active:bg-white/10 disabled:opacity-60"
        >
          Админ-панель
        </button>
      )}

      {isAuthenticated && rosterAccess.isSuccess && !hasRosterAccess && (
        <button
          type="button"
          onClick={() => setCodeOpen(true)}
          className="mx-auto mt-6 block px-3 py-2 text-xs font-medium text-white/35 transition-colors active:text-white/60"
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div className="text-accent">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-white/90">
          {value}
        </p>
      </div>
    </div>
  );
}
