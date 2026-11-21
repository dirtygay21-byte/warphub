/**
 * Крестик в правом верхнем углу окна (21.11.2026, решение владельца: у каждого окна — явный выход).
 * Панель окна должна быть `relative`. 44 px — минимальная зона нажатия (дизайн-код).
 */
import { X } from "lucide-react";

export function SheetClose({ onClose, disabled, label = "Закрыть" }: { onClose: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      aria-label={label}
      className="absolute right-2 top-2 z-10 flex size-11 items-center justify-center rounded-xl text-fg-2 transition-colors hover:bg-white/5 hover:text-fg disabled:opacity-40"
    >
      <X className="size-5" />
    </button>
  );
}
