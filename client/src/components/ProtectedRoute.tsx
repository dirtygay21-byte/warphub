import { Navigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const authChecked = useAuthStore((state) => state.authChecked);

  // Пока идёт вход через Telegram, права ещё неизвестны — ждём,
  // иначе админа выбросит на главную при открытии /admin напрямую.
  if (!isAdmin && !authChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app-bg">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
