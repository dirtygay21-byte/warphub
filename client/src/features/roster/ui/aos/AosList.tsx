import { useMemo, useState, type ReactNode } from 'react';
import { AOS_CODE_PREFIX, decodeAosRoster, duplicateAosRoster, newAosRoster } from '../../aos/roster';
import { AOS_RULES, POINTS_LIMIT_LABEL } from '../../aos/rules';
import type { AosIndex, AosPointsLimit, AosRoster } from '../../aos/types';
import { cloudEnabled } from '../../storage';
import { confirmAsk, haptic, openExternal } from '../../telegram';
import { Button, Empty, Field, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { RosterCard, ToolTile } from '../common/BuilderKit';

const ALLIANCE_RU: Record<string, string> = { ORDER: 'Порядок', CHAOS: 'Хаос', DEATH: 'Смерть', DESTRUCTION: 'Разрушение' };

/** Список ростеров Age of Sigmar. switcher — переключатель игровой системы. */
export function AosList({
  onExit,
  switcher,
  index,
  rosters,
  onOpen,
  onStartGame,
  onTestArmy,
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
  onTestArmy: () => void;
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
        <IconButton icon="back" label="К играм" onClick={onExit} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">WarpBuilder · AoS 4-я редакция</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">Ростеры</h1>
        </div>
        <IconButton icon="upload" label="Импорт ростера по коду" onClick={() => setImporting(true)} />
      </header>
      {switcher}

      <div className="mb-5 grid grid-cols-2 gap-2">
        <ToolTile icon="spark" title="Начать игру" sub="Батлплан, priority, CP, тактики" onClick={onStartGame} />
        <ToolTile icon="map" title="Test Army" sub="Расстановка на карте батлплана" onClick={onTestArmy} />
        <ToolTile icon="book" title="Правила" sub="Core Rules · Wahapedia" onClick={() => openExternal('https://wahapedia.ru/aos4/the-rules/the-core-rules/')} />
        <ToolTile icon="shield" title="Сезон" sub="General’s Handbook 2026-27" onClick={() => openExternal('https://wahapedia.ru/aos4/the-rules/general-s-handbook-2026-27/')} />
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

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
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
  const units = roster.regiments.reduce((n, g) => n + 1 + g.units.length, 0) + roster.auxiliaries.length;
  return (
    <RosterCard
      name={roster.name}
      sub={faction}
      tags={
        <>
          <Tag>AoS</Tag>
          <Tag>{roster.regiments.length} полк.</Tag>
          <Tag>{units} юн.</Tag>
        </>
      }
      status={roster.summary}
      points={roster.summary?.points}
      limit={roster.pointsLimit}
      updatedAt={roster.updatedAt}
      onOpen={onOpen}
      onMenu={onMenu}
    />
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
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-fg-3 focus:border-accent"
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
                  <span className={cx('mt-0.5 block text-[12px] font-medium', faction === f.id ? 'text-accent/70' : 'text-fg-3')}>
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
      <p className="mb-3 text-sm text-fg-3">Вставьте код из «Экспорт → Код» на другом устройстве. После импорта ростер проверяется по всем правилам.</p>
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
