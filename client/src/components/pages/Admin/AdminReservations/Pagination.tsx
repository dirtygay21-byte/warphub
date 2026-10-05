export default function Pagination({
  canGoBack,
  canGoForward,
  limit,
  offset,
  onNext,
  onPrevious,
  total,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  limit: number;
  offset: number;
  onNext: () => void;
  onPrevious: () => void;
  total: number;
}) {
  if (total <= 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 max-sm:flex-col max-sm:gap-2">
      <span className="text-xs text-white/40">
        {offset + 1}–{Math.min(offset + limit, total)} из {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={onPrevious}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-30"
        >
          Назад
        </button>
        <span className="text-xs text-white/40">
          страница {Math.floor(offset / limit) + 1}
        </span>
        <button
          type="button"
          disabled={!canGoForward}
          onClick={onNext}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-30"
        >
          Вперёд
        </button>
      </div>
    </div>
  );
}
