import { Outlet } from "react-router-dom";

/**
 * Мини-игры: полный экран без нижнего меню (чтобы не нажать его случайно во время игры).
 * На планшете и компьютере игра — в колонке по центру, как остальное приложение.
 */
export default function GamesLayout() {
  return (
    <div className="relative h-dvh w-full overflow-x-hidden overflow-y-auto bg-app-bg">
      <div className="mx-auto w-full md:max-w-xl">
        <Outlet />
      </div>
    </div>
  );
}
