import { useMemo, useState } from 'react';
import { loadWarcryFaction } from '../../data';
import { uid } from '../../engine/roster';
import { decodeWarcryRoster, newWarcryRoster, WARCRY_CODE_PREFIX, type WarcryRoster } from '../../warcry/roster';
import type { WarcryIndex } from '../../warcry/types';
import { confirmAsk, haptic } from '../../telegram';
import { Button, Empty, Icon, IconButton, Sheet, Tag } from '../kit';
import { cx, fmtPts } from '../util';

const ALLIANCE: Record<string, string> = { chaos: 'Chaos', death: 'Death', destruction: 'Destruction', order: 'Order' };

/** Список варбанд Warcry (W5 30.10.2026): свои варбанды, создание по фракции, импорт по коду WC1.…. */
export function WarcryList({
  onExit,
  index,
  rosters,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  onExit: () => void;
  index: WarcryIndex;
  rosters: WarcryRoster[];
  onOpen: (id: string) => void;
  onCreate: (r: WarcryRoster) => void;
  onDuplicate: (r: WarcryRoster) => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<WarcryRoster | null>(null);
  const factionName = useMemo(() => Object.fromEntries(index.factions.map((f) => [f.id, f.name])), [index]);
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-4 flex items-end justify-between gap-3">
        <IconButton icon="back" label="К играм" onClick={onExit} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder · Matched Play</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Warcry</h1>
        </div>
        <IconButton icon="upload" label="Импорт варбанды по коду" onClick={() => setImporting(true)} />
      </header>
      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Выберите фракцию и наберите бойцов: союзники, траллы, монстр, группы Dagger / Shield / Hammer и проверка правил построения.</Empty>
      ) : (
        <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <button type="button" onClick={() => (haptic.tap(), onOpen(r.id))} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
                  {factionName[r.factionId] ?? r.factionId} · бойцов: {r.fighters.length}
                  {r.summary ? ` · ${fmtPts(r.summary.points)} очк.` : ''}
                  {r.summary?.errors ? <Tag tone="danger">ошибок: {r.summary.errors}</Tag> : r.summary?.warnings ? <Tag tone="warn">замечаний: {r.summary.warnings}</Tag> : null}
                </span>
              </button>
              <IconButton icon="more" label="Меню" onClick={() => setMenu(r)} className="size-9" />
            </li>
          ))}
        </ul>
      )}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-app/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Button variant="primary" className="mx-auto h-12 w-full max-w-lg" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Новая варбанда
        </Button>
      </div>
      <CreateSheet open={creating} index={index} onClose={() => setCreating(false)} onCreate={(r) => (setCreating(false), onCreate(r))} />
      <ImportSheet open={importing} index={index} onClose={() => setImporting(false)} onImport={(r) => (setImporting(false), onCreate(r))} />
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (onDuplicate({ ...menu, id: uid(), name: `${menu.name} (копия)`, createdAt: Date.now(), updatedAt: Date.now() }), setMenu(null))}>
              <Icon name="copy" /> Дублировать
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              onClick={async () => {
                if (await confirmAsk(`Удалить варбанду «${menu.name}»?`)) {
                  onDelete(menu.id);
                  setMenu(null);
                }
              }}
            >
              <Icon name="trash" /> Удалить
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: WarcryIndex; onClose: () => void; onCreate: (r: WarcryRoster) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      const f = await loadWarcryFaction(id);
      onCreate(newWarcryRoster(f, index.source.commit));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Фракция" tall>
      {err && <p className="mb-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {index.grandAlliances.map((ga) => (
        <div key={ga} className="mb-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{ALLIANCE[ga] ?? ga}</p>
          <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
            {index.factions
              .filter((f) => f.grandAlliance === ga && !f.generic)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void pick(f.id)}
                  className={cx('rounded-xl border px-3 py-2 text-left active:bg-white/10 disabled:opacity-50', busy === f.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}
                >
                  <span className="block text-sm font-semibold">{f.name}</span>
                  <span className="block truncate text-[11px] text-white/45">{f.subfactions.length ? f.subfactions.join(' · ') : `профилей: ${f.fighters}`}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
      <p className="mt-3 text-[11px] text-white/35">
        Данные: {index.source.name}, {index.source.date} ({index.source.commit}). Правила построения — warcrier.net.
      </p>
    </Sheet>
  );
}

function ImportSheet({ open, index, onClose, onImport }: { open: boolean; index: WarcryIndex; onClose: () => void; onImport: (r: WarcryRoster) => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = () => {
    try {
      onImport(decodeWarcryRoster(code, index.factions.map((f) => f.id)));
      setCode('');
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Неверный код');
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Импорт по коду"
      footer={
        <Button variant="primary" className="h-12 w-full" disabled={!code.trim()} onClick={go}>
          Добавить варбанду
        </Button>
      }
    >
      <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={6} placeholder={`${WARCRY_CODE_PREFIX}eyJ2Ijox…`} className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent" />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}
