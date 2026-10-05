import { getRosterAccess } from "@/apiUtils/roster";
import { RosterBuilder } from "@/features/roster/ui/App";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

/** Скрытый раздел: открывается только тем, у кого есть доступ (код или админ). */
export default function RosterPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authChecked = useAuthStore((s) => s.authChecked);

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

  if (!access.data?.hasAccess) return <Navigate to="/profile" replace />;

  return (
    <div className="roster-root min-h-dvh bg-app-bg text-white">
      <RosterBuilder onExit={() => navigate("/profile")} />
    </div>
  );
}
