import { Icon, IconButton } from '../kit';

/** Нижняя панель ошибки игрового экрана — единая для всех систем. */
export function GameErrorBar({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <div className="sheet-enter fixed inset-x-0 bottom-0 z-40 border-t border-danger/40 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-lg items-start gap-2">
        <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="min-w-0 flex-1 text-sm text-white/85">{error}</p>
        <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-8" />
      </div>
    </div>
  );
}
