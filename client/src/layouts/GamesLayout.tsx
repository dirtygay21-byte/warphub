import { Outlet } from "react-router-dom";

/** Мини-игры: полный экран без нижнего меню (чтобы не нажать его случайно во время игры) */
export default function GamesLayout() {
  return (
    <div className="relative h-dvh w-full overflow-x-hidden overflow-y-auto bg-app-bg">
      <Outlet />
    </div>
  );
}
