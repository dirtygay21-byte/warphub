import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

/**
 * Мини-игры: полный экран без нижнего меню (чтобы не нажать его случайно во время игры).
 * На планшете и компьютере игра — в колонке по центру, как остальное приложение.
 */
export default function GamesLayout() {
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div ref={scroller} className="relative h-dvh w-full overflow-x-hidden overflow-y-auto bg-app-bg">
      <div className="mx-auto w-full md:max-w-xl">
        <Outlet />
      </div>
    </div>
  );
}
