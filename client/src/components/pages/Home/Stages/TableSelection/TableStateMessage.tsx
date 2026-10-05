import type { ReactNode } from "react";

export default function TableStateMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-app-elevated px-4 py-5 text-sm text-white/60">
      {children}
    </div>
  );
}
