import { useMemo, useState } from 'react';
import { loadKtTeam } from '../../data';
import { uid } from '../../engine/roster';
import { decodeKtRoster, KT_CODE_PREFIX, newKtRoster, type KtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import { confirmAsk, haptic } from '../../telegram';
import { Button, Empty, Icon, IconButton, Sheet, Tag } from '../kit';
import { cx } from '../util';

/** Список команд Kill Team (W3 30.10.2026): свои ростеры, создание по команде, импорт по коду KT1.…. */
export function KtList({
  onExit,
  index,
  rosters,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  onExit: () => void;
  index: KtIndex;
  rosters: KtRoster[];
  onOpen: (id: string) => void;
  onCreate: (r: KtRoster) => void;
  onDuplicate: (r: KtRoster) => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<KtRoster | null>(null);
  const teamName = useMemo(() => Object.fromEntries(index.teams.map((t) => [t.id, t.name])), [index]);
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-4 flex items-end justify-between gap-3">
        <IconButton icon="back" label="К играм" onClick={onExit} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder · {index.edition}</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Kill Team</h1>
        </div>
        <IconButton icon="upload" label="Импорт команды по коду" onClick={() => setImporting(true)} />
      </header>
      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Выберите команду и наберите оперативников: оружие, снаряжение, уловки и правила — из данных KTDash.</Empty>
      ) : (
        <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <button type="button" onClick={() => (haptic.tap(), onOpen(r.id))} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
                  {teamName[r.teamId] ?? r.teamId} · оперативников: {r.operatives.length}
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
          <Icon name="plus" /> Новая команда
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
                if (await confirmAsk(`Удалить команду «${menu.name}»?`)) {
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

function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: KtIndex; onClose: () => void; onCreate: (r: KtRoster) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [special, setSpecial] = useState(false);
  const pick = async (id: string) => {
    setBusy(id);
    setErr(null);
    try {
      const team = await loadKtTeam(id);
      onCreate(newKtRoster(team, index.source.commit));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Команда" tall>
      {err && <p className="mb-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {index.factions.map((f) => {
        const teams = index.teams.filter((t) => t.factionId === f.id && t.special === special);
        if (!teams.length) return null;
        return (
          <div key={f.id} className="mb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{f.name}</p>
            <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void pick(t.id)}
                  className={cx('rounded-xl border px-3 py-2 text-left active:bg-white/10 disabled:opacity-50', busy === t.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03]')}
                >
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-[11px] text-white/45">{t.archetypes.join(' · ') || `профилей: ${t.operatives}`}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => setSpecial((v) => !v)} className="mt-1 text-[12px] font-semibold text-white/45">
        {special ? '← Команды для игры' : 'Наборы миссий и неигровые оперативники →'}
      </button>
      <p className="mt-3 text-[11px] text-white/35">
        Данные: {index.source.name}, {index.source.date} ({index.source.commit}).
      </p>
    </Sheet>
  );
}

function ImportSheet({ open, index, onClose, onImport }: { open: boolean; index: KtIndex; onClose: () => void; onImport: (r: KtRoster) => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = () => {
    try {
      onImport(decodeKtRoster(code, index.teams.map((t) => t.id)));
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
          Добавить команду
        </Button>
      }
    >
      <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={6} placeholder={`${KT_CODE_PREFIX}eyJ2Ijox…`} className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent" />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}
