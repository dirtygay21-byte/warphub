import { learnDone } from '@/components/tutorial/progress';
import { factionColor } from './common/factionColors';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BATTLE_SIZES, BATTLE_SIZE_ORDER } from '../engine/rules';
import { decodeRoster, duplicateRoster, newRoster } from '../engine/roster';
import type { BattleSize, DataIndex, Roster } from '../engine/types';
import { cloudEnabled } from '../storage';
import { confirmAsk, haptic } from '../telegram';
import { Button, Empty, Field, Icon, Segmented, Sheet, Tag } from './kit';
import { ListHeader, ToolMenus } from './common/BuilderKit';
import { cx, fmtPts } from './util';
import { indexCredit, indexCreditDetails } from '../engine/source';

const ALLEGIANCE_RU: Record<string, string> = { Imperium: 'Империум', Chaos: 'Хаос', Xenos: 'Ксеносы' };

export function RosterList({
  onExit,
  switcher,
  onRules,
  onStartGame,
  onTestArmy,
  index,
  rosters,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  onExit: () => void;
  switcher?: ReactNode;
  onRules: () => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  index: DataIndex;
  rosters: Roster[];
  onOpen: (id: string) => void;
  onCreate: (r: Roster) => void;
  onDuplicate: (r: Roster) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<Roster | null>(null);
  const [sources, setSources] = useState(false);
  const factionName = useMemo(() => Object.fromEntries(index.factions.map((f) => [f.id, f.name])), [index]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <ListHeader kicker="WarpBuilder · 40K 11-я редакция" title="Warhammer 40,000" onBack={onExit} onImport={() => setImporting(true)} />
      {switcher}

      <ToolMenus
        rules={[
          { icon: 'book', title: 'Правила', sub: 'Стратагемы · Core Rules', onClick: onRules },
          { icon: 'spark', title: 'Как играть', sub: 'Обучение для новичков: ход, стрельба, бой', onClick: () => navigate('/learn/40k') },
          // обучающая игра — после карточек «Как играть» (13.11.2026)
          ...(learnDone('40k') ? [{ icon: 'shield', title: 'Обучающая игра', sub: 'Раунд по шагам за столом', onClick: () => navigate('/learn/40k/round') }] : []),
        ]}
        game={[
          { icon: 'map', title: 'Начать игру', sub: 'Миссии · раскладки · трекер', onClick: onStartGame },
          { icon: 'shield', title: 'Test Army', sub: 'Расставить армию на поле · построения · линейка', onClick: onTestArmy },
        ]}
      />

      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Соберите первый ростер — очки, детачменты и правила проверяются на лету.</Empty>
      ) : (
        <ul className="ds-stagger space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => (
            <RosterCard key={r.id} roster={r} faction={factionName[r.factionId] ?? r.factionId} onOpen={() => onOpen(r.id)} onMenu={() => setMenu(r)} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        <button type="button" onClick={() => setSources(true)} className="underline decoration-white/20 underline-offset-2 active:text-fg-2">
          {indexCredit(index)}
        </button>
        <br />
        {cloudEnabled() ? 'Ростеры синхронизируются через Telegram' : 'Ростеры хранятся в этом браузере'}
      </p>

      <Sheet open={sources} onClose={() => setSources(false)} title="Версия данных">
        <ul className="space-y-3 text-sm">
          {indexCreditDetails(index).map((x) => (
            <li key={x.title}>
              <p className="font-semibold">{x.title}</p>
              <p className="text-xs leading-relaxed text-fg-3">{x.text}</p>
            </li>
          ))}
        </ul>
      </Sheet>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto max-w-lg lg:flex lg:max-w-4xl lg:justify-end lg:px-4">
          <Button variant="primary" className="h-12 w-full text-base lg:w-auto lg:px-8" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Новый ростер
          </Button>
        </div>
      </div>

      <CreateSheet open={creating} index={index} onClose={() => setCreating(false)} onCreate={(r) => (setCreating(false), onCreate(r))} />
      <ImportSheet open={importing} factions={index.factions.map((f) => f.id)} onClose={() => setImporting(false)} onImport={(r) => (setImporting(false), onCreate(r))} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (onDuplicate(duplicateRoster(menu)), setMenu(null))}>
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

function RosterCard({ roster, faction, onOpen, onMenu }: { roster: Roster; faction: string; onOpen: () => void; onMenu: () => void }) {
  const size = BATTLE_SIZES[roster.battleSize];
  const date = new Date(roster.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
      <span aria-hidden="true" className="w-1 shrink-0" style={{ background: factionColor('40k', roster.factionId) }} />
      <button type="button" onClick={() => (haptic.tap(), onOpen())} className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/[0.03]">
        <p className="truncate text-base font-semibold">{roster.name}</p>
        <p className="mt-0.5 truncate text-sm text-fg-3">
          {faction}
          {roster.chapter ? ` · ${roster.chapter}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag>{size.label}</Tag>
          <Tag>{roster.units.length} юн.</Tag>
          {roster.summary && (
            <Tag tone={roster.summary.errors ? 'danger' : roster.summary.warnings ? 'warn' : 'accent'}>
              {roster.summary.errors ? `${roster.summary.errors} ош.` : roster.summary.warnings ? `${roster.summary.warnings} пред.` : 'OK'}
            </Tag>
          )}
          <span className="text-xs text-fg-3">{date}</span>
        </div>
      </button>
      {roster.summary && (
        <div className="flex flex-col items-end justify-center pr-1 text-right">
          <span className={cx('font-display text-xl font-semibold leading-none tabular-nums', roster.summary.points > size.points ? 'text-danger' : 'text-white')}>
            {fmtPts(roster.summary.points)}
          </span>
          <span className="mt-1 text-[12px] text-fg-3">из {fmtPts(size.points)}</span>
        </div>
      )}
      <button type="button" aria-label="Действия" onClick={() => (haptic.tap(), onMenu())} className="flex w-12 items-center justify-center text-fg-3 active:bg-white/5">
        <Icon name="more" className="size-6" strokeWidth={3} />
      </button>
    </li>
  );
}

function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: DataIndex; onClose: () => void; onCreate: (r: Roster) => void }) {
  const [size, setSize] = useState<BattleSize>('strike');
  const [faction, setFaction] = useState<string | null>(null);
  const [name, setName] = useState('');
  const groups = useMemo(() => {
    const g: Record<string, DataIndex['factions']> = {};
    for (const f of index.factions) (g[f.allegiance] ||= []).push(f);
    return ['Imperium', 'Chaos', 'Xenos'].filter((k) => g[k]).map((k) => [k, g[k]] as const);
  }, [index]);
  const create = () => {
    if (!faction) return;
    const r = newRoster(faction, size, index.lastUpdate);
    const fName = index.factions.find((f) => f.id === faction)?.name ?? '';
    r.name = name.trim() || `${fName} · ${BATTLE_SIZES[size].points}`;
    haptic.ok();
    onCreate(r);
    setFaction(null);
    setName('');
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Новый ростер"
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
        <Field label="Размер боя">
          <Segmented
            value={size}
            onChange={setSize}
            options={BATTLE_SIZE_ORDER.map((s) => ({ value: s, label: BATTLE_SIZES[s].label, hint: `${fmtPts(BATTLE_SIZES[s].points)} очк.` }))}
          />
        </Field>
        {groups.map(([alg, list]) => (
          <Field key={alg} label={ALLEGIANCE_RU[alg] ?? alg}>
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
                    {f.units} инфолистов
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

function ImportSheet({ open, onClose, onImport, factions }: { open: boolean; onClose: () => void; onImport: (r: Roster) => void; factions: string[] }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Импорт ростера"
      footer={
        <Button
          variant="primary"
          className="h-12 w-full"
          disabled={!code.trim()}
          onClick={() => {
            if (code.trim().startsWith('AOS1.')) {
              setErr('Это код ростера Age of Sigmar — импортируйте его на вкладке Age of Sigmar.');
              haptic.error();
              return;
            }
            try {
              onImport(decodeRoster(code, factions));
              setCode('');
              setErr(null);
              haptic.ok();
            } catch (e) {
              const msg = e instanceof Error && e.message.startsWith('Ростер для') ? e.message : null;
              setErr(msg ?? 'Не получилось прочитать код. Скопируйте его целиком (начинается с WH1.).');
              haptic.error();
            }
          }}
        >
          Импортировать
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-3">Вставьте код ростера из раздела «Экспорт → Код» на другом устройстве.</p>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        rows={6}
        placeholder="WH1.eyJ2Ijox…"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent"
      />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}
