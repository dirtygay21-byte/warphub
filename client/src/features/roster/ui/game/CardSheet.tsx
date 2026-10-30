import { useEffect, useRef, type ReactNode } from 'react';
import type { MissionCard } from '../../data';
import { totals, type GameState, type Seat } from '../../game';
import { pushOverlay } from '../../telegram';
import { Icon, IconButton } from '../kit';
import { MissionCardView } from '../MissionCard';
import { cx } from '../util';
import { useOpenCard } from './cardViewer';
import type { GameHook } from './useGame';

const TURN_RU = { own: 'конец вашего хода', opponent: 'конец хода противника', any: 'конец любого хода', 'opponent-or-r5': 'конец хода противника или конец 5-го раунда' } as const;

/**
 * Просмотр карты миссии (G3.8): шторка снизу с полным текстом карты и её положением в игре у этого игрока
 * (в колоде / активна с раунда N / выполнена / сброшена / фиксированная, ПО основной). Ничего в игре не меняет;
 * закрывается крестиком, нажатием вне шторки и кнопкой «Назад» Telegram. Выше остальных шторок (z-60).
 */
export function CardSheet({ game, id, seat, onClose }: { game: GameHook; id: string; seat?: Seat; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => pushOverlay(() => close.current()), []);
  const card = game.data?.missions.cards.find((c) => c.id === id);
  if (!card) return null;
  const state = game.state;
  const status = state && seat ? cardStatus(game, state, seat, card) : [];
  const foe = state && seat && card.type === 'primary' ? state.players[seat === 'p1' ? 'p2' : 'p1'] : null;
  const foeName = foe?.disposition ? game.data!.battlefield.dispositions.find((d) => d.id === foe.disposition)?.nameRu : undefined;
  return (
    <div className="fade-enter fixed inset-0 z-[60] flex flex-col bg-black/70" onClick={onClose}>
      <div
        className="sheet-enter mt-auto max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-app-elevated px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-lg">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {state && seat && <p className="text-[12px] text-fg-3">{state.players[seat].name}</p>}
              {status.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {status.map((s, i) => (
                    <span key={i} className={cx('rounded-full border px-2 py-0.5 text-[12px]', i === 0 ? 'border-accent/50 text-accent' : 'border-white/15 text-fg-2')}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <IconButton icon="close" label="Закрыть" onClick={onClose} className="size-9 shrink-0" />
          </div>
          <MissionCardView card={card} foeName={foeName} className="mt-2" />
        </div>
      </div>
    </div>
  );
}

/** Положение карты у игрока: первая строка — главное (активна, выполнена, сброшена, в колоде), дальше подробности. */
function cardStatus(game: GameHook, state: GameState, seat: Seat, card: MissionCard): string[] {
  const p = state.players[seat];
  const catalog = game.data!.catalog;
  if (card.type === 'primary') {
    if (state.primary[seat] !== card.id) return [];
    const out = ['основная миссия'];
    if (state.stage !== 'setup') out.push(`засчитано: ${totals(state, seat, catalog).primary.total} ПО`);
    return out;
  }
  const mode = p.secondaryMode;
  const timing = [...new Set(card.blocks.filter((b) => !b.mode || !mode || b.mode === mode).map((b) => b.turn ?? 'any'))].map((t) => TURN_RU[t]);
  if (mode === 'fixed') {
    if (!p.fixed?.includes(card.id)) return ['не выбрана'];
    const cap = catalog.caps.fixedSecondaryCard;
    const vp = state.stage === 'setup' ? 0 : (totals(state, seat, catalog).secondary.byFixedCard[card.id] ?? 0);
    return ['фиксированная · активна всю битву', ...(cap != null ? [`${vp} / ${cap} ПО`] : []), ...timing];
  }
  if (mode !== 'tactical') return [];
  const a = p.active.find((x) => x.id === card.id);
  if (a) return [`активна${a.n != null ? ` · №${a.n}` : ''}`, `взята: раунд ${a.round}`, ...timing, ...(a.note ? [`выбор: ${a.note}`] : [])];
  const sc = p.scored.find((x) => x.id === card.id);
  if (sc) return [`выполнена${sc.n != null ? ` · №${sc.n}` : ''}`, `раунд ${sc.round} · ${sc.vp} ПО`];
  const d = [...p.discardLog].reverse().find((x) => x.id === card.id);
  if (d)
    return [
      `${d.why === 'swap' ? 'заменена за 1 CP' : d.why === 'when-drawn' ? 'сброшена при взятии' : 'сброшена'}${d.n != null ? ` · №${d.n}` : ''}`,
      `раунд ${d.round}${d.cp > 0 ? ' · +1 CP' : ''}`,
    ];
  return ['в колоде', ...timing];
}

/**
 * Название карты, которое открывает просмотр (G3.8): текст + значок «i». children — своя подпись вместо названия.
 * Без просмотра (вне игры) — просто текст.
 */
export function CardLink({ id, seat, name, className, children }: { id: string; seat?: Seat; name: string; className?: string; children?: ReactNode }) {
  const open = useOpenCard();
  if (!open) return <span className={className}>{children ?? name}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        // не раскрывать/выбирать то, внутри чего стоит ссылка (summary, кнопка строки)
        e.preventDefault();
        e.stopPropagation();
        open(id, seat);
      }}
      className={cx('inline-flex min-w-0 max-w-full items-center gap-1 text-left underline-offset-2 active:underline', className)}
      aria-label={`Открыть карту «${name}»`}
    >
      <span className="min-w-0 truncate">{children ?? name}</span>
      <Icon name="info" className="size-3.5 shrink-0 text-accent/80" />
    </button>
  );
}
