import { getRosterAccess } from "@/apiUtils/roster";
import { RosterBuilder } from "@/features/roster/ui/App";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

/** Скрытый раздел: открывается только тем, у кого есть доступ (код или админ). */
export default function RosterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authChecked = useAuthStore((s) => s.authChecked);
  // откуда пришли (профиль или админка) — туда и вернёмся
  const from = (location.state as { from?: string } | null)?.from ?? "/profile";

  const access = useQuery({
    queryKey: ["roster-access"],
    queryFn: getRosterAccess,
    enabled: isAuthenticated,
  });

  if (!authChecked || (isAuthenticated && access.isLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app-bg">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  // сеть или сервер недоступны — это не «нет доступа»: даём повторить
  if (access.isError) {
    return (
      <Message title="Не удалось открыть раздел" text={access.error.message}>
        <button type="button" onClick={() => navigate(from)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/80">
          Назад
        </button>
        <button type="button" onClick={() => access.refetch()} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black">
          Повторить
        </button>
      </Message>
    );
  }

  if (!access.data?.hasAccess) return <Navigate to="/profile" replace />;

  return (
    <div className="roster-root min-h-dvh bg-app-bg text-white">
      <RosterErrorBoundary onExit={() => navigate(from)}>
        <RosterBuilder onExit={() => navigate(from)} />
      </RosterErrorBoundary>
    </div>
  );
}

function Message({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app-bg px-6 text-center text-white">
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="mt-2 text-sm text-white/50">{text}</p>}
      <div className="mt-5 flex gap-2">{children}</div>
    </div>
  );
}

/** Страховка: ошибка внутри конструктора не оставляет белый экран, а предлагает перезапустить раздел. */
class RosterErrorBoundary extends Component<{ onExit: () => void; children: ReactNode }, { error: Error | null; key: number }> {
  state = { error: null as Error | null, key: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Roster Builder:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <Message title="Что-то пошло не так" text="Ростеры сохранены. Перезапустите раздел — если ошибка повторится, напишите администратору.">
          <button type="button" onClick={this.props.onExit} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/80">
            Выйти
          </button>
          <button
            type="button"
            onClick={() => this.setState((s) => ({ error: null, key: s.key + 1 }))}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black"
          >
            Перезапустить
          </button>
        </Message>
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
