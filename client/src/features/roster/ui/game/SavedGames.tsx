import { useEffect, useState } from 'react';
import { ROUNDS, type SavedEntry } from '../../game';
import { haptic, pushOverlay } from '../../telegram';
import { Button, Icon, IconButton } from '../kit';
import { cx } from '../util';
import type { GameHook } from './useGame';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/**
 * Сохранённые игры (24.10.2026): список на этом телефоне — дата, игроки, основные миссии, деплой, стадия и счёт;
 * нажатие открывает игру. Одиночную можно удалить (с подтверждением), игру на двух телефонах — убрать из списка.
 */
export function SavedGames({ game, onClose }: { game: GameHook; onClose: () => void }) {
  useEffect(() => pushOverlay(onClose), [onClose]);
  const list = game.library ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (e: SavedEntry) => {
    setBusy(e.key);
    const ok = await game.openSaved(e);
    setBusy(null);
    if (ok) haptic.ok();
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Назад" onClick={onClose} className="size-8" />
        <p className="font-display min-w-0 flex-1 text-xl font-semibold uppercase">Сохранённые игры</p>
        <span className="text-xs text-fg-3">{list.length}</span>
      </div>
      {!list.length && <p className="py-6 text-center text-sm text-fg-3">Сохранённых игр пока нет.</p>}
      <ul className="space-y-2">
        {list.map((e) => (
          <Row key={e.key} game={game} entry={e} busy={busy === e.key} disabled={!!busy} onOpen={() => void open(e)} />
        ))}
      </ul>
      <p className="pt-1 text-[12px] text-fg-3">Игры хранятся на этом телефоне (до 20); игры на двух телефонах — на сервере, здесь — ссылка.</p>
    </section>
  );
}

function Row({ game, entry, busy, disabled, onOpen }: { game: GameHook; entry: SavedEntry; busy: boolean; disabled: boolean; onOpen: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const s = entry.summary;
  const dep = s?.deploymentId ? game.data!.battlefield.deployments.find((d) => d.id === s.deploymentId)?.nameRu : null;
  const stage = !s ? null : s.stage === 'setup' ? 'Подготовка' : s.stage === 'finished' ? 'Битва окончена' : `Раунд ${s.round} из ${ROUNDS}`;
  const online = entry.kind === 'online';
  return (
    <li className={cx('rounded-2xl border bg-white/[0.03]', s?.stage === 'finished' ? 'border-white/10' : 'border-accent/30')}>
      <button type="button" disabled={disabled} onClick={onOpen} className="w-full px-3 pb-2 pt-2.5 text-left active:bg-white/5 disabled:opacity-60">
        <span className="flex items-center gap-2 text-[12px] text-fg-3">
          <span className="min-w-0 flex-1 truncate">
            {fmtDate(entry.updatedAt)}
            {s?.mode === 'dominatus' ? ` · Dominatus${s.domPhase ? `, фаза ${s.domPhase}` : ''}` : ''}
            {stage ? ` · ${stage}` : ''}
          </span>
          <span className={cx('rounded-full border px-2 py-px font-semibold', online ? 'border-accent/50 text-accent' : 'border-white/15 text-fg-3')}>
            {online ? `2 телефона · ${entry.online?.code ?? ''}` : '1 телефон'}
          </span>
        </span>
        {s ? (
          <>
            <span className="mt-1 flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {s.names.p1} — {s.names.p2}
              </span>
              {s.stage !== 'setup' && (
                <span className="font-display shrink-0 text-lg font-semibold tabular-nums">
                  {s.score.p1} : {s.score.p2}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-fg-2">
              {s.primary.p1 || s.primary.p2 ? (
                <>
                  {s.names.p1}: {s.primary.p1 ?? '—'} · {s.names.p2}: {s.primary.p2 ?? '—'}
                </>
              ) : (
                'Основные миссии ещё не определены'
              )}
            </span>
            {dep && <span className="block text-[12px] text-fg-3">Деплой: {dep}</span>}
          </>
        ) : (
          <span className="mt-1 block text-xs text-fg-3">Откройте, чтобы увидеть игроков и миссии.</span>
        )}
        {busy && <span className="mt-1 block text-[12px] text-accent">Открываю…</span>}
      </button>
      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-3 py-1.5">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 text-[12px] font-semibold text-fg-3 active:text-fg-2">
            <Icon name="trash" className="size-3.5" />
            {online ? 'Убрать из списка' : 'Удалить'}
          </button>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[12px] text-warn">{online ? 'Игра останется на сервере, уберётся только ссылка.' : 'Игра будет удалена с телефона.'}</span>
            <Button variant="danger" className="text-xs" onClick={() => game.removeSaved(entry.key)}>
              {online ? 'Убрать' : 'Удалить'}
            </Button>
            <Button className="text-xs" onClick={() => setConfirm(false)}>
              Нет
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
