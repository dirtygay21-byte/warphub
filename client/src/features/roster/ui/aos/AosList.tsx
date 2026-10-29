import { useMemo, useState, type ReactNode } from 'react';
import { AOS_CODE_PREFIX, decodeAosRoster, duplicateAosRoster, newAosRoster } from '../../aos/roster';
import { AOS_RULES, POINTS_LIMIT_LABEL } from '../../aos/rules';
import type { AosIndex, AosPointsLimit, AosRoster } from '../../aos/types';
import { cloudEnabled } from '../../storage';
import { confirmAsk, haptic, openExternal } from '../../telegram';
import { Button, Empty, Field, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx, fmtPts } from '../util';

const ALLIANCE_RU: Record<string, string> = { ORDER: 'Порядок', CHAOS: 'Хаос', DEATH: 'Смерть', DESTRUCTION: 'Разрушение' };

/** Список ростеров Age of Sigmar. switcher — переключатель игровой системы. */
export function AosList({
  onExit,
  switcher,
  index,
  rosters,
  onOpen,
  onStartGame,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  onExit: () => void;
  switcher: ReactNode;
  index: AosIndex;
  rosters: AosRoster[];
  onOpen: (id: string) => void;
  onStartGame: () => void;
  onCreate: (r: AosRoster) => void;
  onDuplicate: (r: AosRoster) => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<AosRoster | null>(null);
  const factionName = useMemo(() => Object.fromEntries(index.factions.map((f) => [f.id, f.name])), [index]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <header className="mb-4 flex items-end justify-between gap-3">
        <IconButton icon="back" label="Назад в WarpHub" onClick={onExit} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpHub · AoS 4-я редакция</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Ростеры</h1>
        </div>
        <IconButton icon="upload" label="Импорт ростера по коду" onClick={() => setImporting(true)} />
      </header>
      {switcher}

      <div className="mb-5 grid grid-cols-2 gap-2">
        <div className="col-span-2 grid">
          <Tile icon="spark" title="Начать игру" sub="Батлплан, priority, CP, тактики и счёт" onClick={onStartGame} />
        </div>
        <Tile icon="book" title="Правила" sub="Core Rules · Wahapedia" onClick={() => openExternal('https://wahapedia.ru/aos4/the-rules/the-core-rules/')} />
        <Tile icon="shield" title="Сезон" sub="General’s Handbook 2026-27" onClick={() => openExternal('https://wahapedia.ru/aos4/the-rules/general-s-handbook-2026-27/')} />
      </div>

      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Соберите первую армию: полки с героями, вспомогательные юниты, лоры и улучшения проверяются сразу.</Empty>
      ) : (
        <ul className="space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => (
            <Card key={r.id} roster={r} faction={factionName[r.factionId] ?? r.factionId} onOpen={() => onOpen(r.id)} onMenu={() => setMenu(r)} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-white/35">
        Данные: powered by Wahapedia · обновлено {index.lastUpdate?.slice(0, 10) ?? '—'}
        <br />
        {cloudEnabled() ? 'Ростеры синхронизируются через Telegram' : 'Ростеры хранятся в этом браузере'}
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto max-w-lg lg:flex lg:max-w-4xl lg:justify-end lg:px-4">
          <Button variant="primary" className="h-12 w-full text-base lg:w-auto lg:px-8" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Новый ростер AoS
          </Button>
        </div>
      </div>

      <CreateSheet open={creating} index={index} onClose={() => setCreating(false)} onCreate={(r) => (setCreating(false), onCreate(r))} />
      <ImportSheet open={importing} factions={index.factions.map((f) => f.id)} onClose={() => setImporting(false)} onImport={(r) => (setImporting(false), onCreate(r))} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (onDuplicate(duplicateAosRoster(menu)), setMenu(null))}>
              <Icon name="copy" /> Дублировать
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              onClick={async () => {
                if (await confirmAsk(`Удалить ростер «${menu.name}»?`)) {
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

function Card({ roster, faction, onOpen, onMenu }: { roster: AosRoster; faction: string; onOpen: () => void; onMenu: () => void }) {
  const date = new Date(roster.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const units = roster.regiments.reduce((n, g) => n + 1 + g.units.length, 0) + roster.auxiliaries.length;
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
      <button type="button" onClick={() => (haptic.tap(), onOpen())} className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/[0.03]">
        <p className="truncate text-base font-semibold">{roster.name}</p>
        <p className="mt-0.5 truncate text-sm text-white/55">{faction}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag>AoS</Tag>
          <Tag>{roster.regiments.length} полк.</Tag>
          <Tag>{units} юн.</Tag>
          {roster.summary && (
            <Tag tone={roster.summary.errors ? 'danger' : roster.summary.warnings ? 'warn' : 'accent'}>
              {roster.summary.errors ? `${roster.summary.errors} ош.` : roster.summary.warnings ? `${roster.summary.warnings} пред.` : 'OK'}
            </Tag>
          )}
          <span className="text-xs text-white/35">{date}</span>
        </div>
      </button>
      {roster.summary && (
        <div className="flex flex-col items-end justify-center pr-1 text-right">
          <span className={cx('font-display text-xl font-semibold leading-none tabular-nums', roster.summary.points > roster.pointsLimit ? 'text-danger' : 'text-white')}>
            {fmtPts(roster.summary.points)}
          </span>
          <span className="mt-1 text-[11px] text-white/40">из {fmtPts(roster.pointsLimit)}</span>
        </div>
      )}
      <button type="button" aria-label="Действия" onClick={() => (haptic.tap(), onMenu())} className="flex w-12 items-center justify-center text-white/50 active:bg-white/5">
        <Icon name="more" className="size-6" strokeWidth={3} />
      </button>
    </li>
  );
}

function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: AosIndex; onClose: () => void; onCreate: (r: AosRoster) => void }) {
  const [limit, setLimit] = useState<AosPointsLimit>(2000);
  const [faction, setFaction] = useState<string | null>(null);
  const [name, setName] = useState('');
  const groups = useMemo(() => {
    const g: Record<string, AosIndex['factions']> = {};
    for (const f of index.factions) (g[f.grandAlliance ?? 'OTHER'] ||= []).push(f);
    return ['ORDER', 'CHAOS', 'DEATH', 'DESTRUCTION', 'OTHER'].filter((k) => g[k]).map((k) => [k, g[k]!] as const);
  }, [index]);
  const create = () => {
    if (!faction) return;
    const r = newAosRoster(faction, limit, index.lastUpdate);
    const meta = index.factions.find((f) => f.id === faction);
    r.name = name.trim() || `${meta?.name ?? ''} · ${limit}`;
    if (meta?.legendsOnly) r.showLegends = true;
    haptic.ok();
    onCreate(r);
    setFaction(null);
    setName('');
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Новый ростер · AoS"
      tall
      footer={
        <Button variant="primary" className="h-12 w-full text-base" disabled={!faction} onClick={create}>
          Создать
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label="Название">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Турнир в субботу"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-white/30 focus:border-accent"
          />
        </Field>
        <Field label="Лимит очков">
          <Segmented
            value={String(limit) as '1000' | '2000'}
            onChange={(v) => setLimit(Number(v) as AosPointsLimit)}
            options={AOS_RULES.pointsLimits.map((p) => ({ value: String(p) as '1000' | '2000', label: POINTS_LIMIT_LABEL[p] }))}
          />
        </Field>
        {groups.map(([alliance, list]) => (
          <Field key={alliance} label={ALLIANCE_RU[alliance] ?? 'Прочие'}>
            <div className="grid grid-cols-2 gap-1.5">
              {list.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => (haptic.select(), setFaction(f.id))}
                  className={cx(
                    'min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold leading-tight transition',
                    faction === f.id ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.03] text-white/85 active:bg-white/10',
                  )}
                >
                  {f.name}
                  <span className={cx('mt-0.5 block text-[11px] font-medium', faction === f.id ? 'text-accent/70' : 'text-white/40')}>
                    {f.legendsOnly ? 'только Legends' : `${f.units} варскроллов`}
                  </span>
                </button>
              ))}
            </div>
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

function ImportSheet({ open, onClose, onImport, factions }: { open: boolean; onClose: () => void; onImport: (r: AosRoster) => void; factions: string[] }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Импорт ростера AoS"
      footer={
        <Button
          variant="primary"
          className="h-12 w-full"
          disabled={!code.trim()}
          onClick={() => {
            const c = code.trim();
            if (c.startsWith('WH1.')) {
              setErr('Это код ростера Warhammer 40,000 — импортируйте его на вкладке 40K.');
              haptic.error();
              return;
            }
            try {
              onImport(decodeAosRoster(c, factions));
              setCode('');
              setErr(null);
              haptic.ok();
            } catch (e) {
              const msg = e instanceof Error && e.message.startsWith('Ростер для') ? e.message : null;
              setErr(msg ?? `Не получилось прочитать код. Скопируйте его целиком (начинается с ${AOS_CODE_PREFIX}).`);
              haptic.error();
            }
          }}
        >
          Импортировать
        </Button>
      }
    >
      <p className="mb-3 text-sm text-white/55">Вставьте код из «Экспорт → Код» на другом устройстве. После импорта ростер проверяется по всем правилам.</p>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={6}
        placeholder={`${AOS_CODE_PREFIX}eyJ2Ijox…`}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent"
      />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (haptic.tap(), onClick())}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition active:bg-white/10"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="font-display block text-base font-semibold uppercase leading-none">{title}</span>
        <span className="mt-1 block truncate text-[11px] text-white/45">{sub}</span>
      </span>
    </button>
  );
}
