import { useState } from 'react';
import type { useSkirmishOnline } from './useSkirmishOnline';
import { Button } from '../kit';

export function SkirmishOnlineControls<E extends { id: string; seq: number; type: string }>({ game, onStart }: { game: ReturnType<typeof useSkirmishOnline<E>>; onStart: () => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (game.online) {
    return <p className="mb-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[12px] text-fg-2">Онлайн · код {game.online.code} · место {game.online.seat}{game.sync.sending ? ' · отправка…' : game.sync.offline ? ' · нет связи' : ''}</p>;
  }
  return (
    <div className="mb-3 grid grid-cols-[1fr_5rem_5rem] gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Код игры" className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none" />
      <Button disabled={busy || code.trim().length < 4} onClick={async () => { setBusy(true); await game.join(code.trim()); setBusy(false); }}>Войти</Button>
      <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); await onStart(); setBusy(false); }}>Онлайн</Button>
    </div>
  );
}
