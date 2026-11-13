import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Страховка всего приложения (13.11.2026): ошибка на любой странице показывает сообщение с кнопками, а не пустой экран.
 * Переход на другую страницу сбрасывает ошибку. У WarpBuilder — своя страховка внутри (RosterPage).
 */
class Boundary extends Component<{ path: string; children: ReactNode }, { error: Error | null; path: string }> {
  state = { error: null as Error | null, path: this.props.path };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { path: string }, state: { error: Error | null; path: string }) {
    return props.path !== state.path ? { error: null, path: props.path } : null;
  }

  componentDidCatch(error: Error) {
    console.error("WarpHub:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6 text-center text-fg" role="alert">
        <p className="text-lg font-semibold">Что-то пошло не так</p>
        <p className="mt-2 text-sm text-fg-2">Страница не открылась. Попробуйте ещё раз — если ошибка повторится, напишите администратору.</p>
        <div className="mt-5 flex gap-2">
          <a href={import.meta.env.BASE_URL} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-fg-2">
            На главную
          </a>
          <button type="button" onClick={() => this.setState({ error: null })} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
            Повторить
          </button>
        </div>
      </div>
    );
  }
}

export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary path={pathname}>{children}</Boundary>;
}
