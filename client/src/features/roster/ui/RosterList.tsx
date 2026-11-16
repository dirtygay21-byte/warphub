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
import { useEn, useT } from './common/i18n';
import { LangSwitch } from './common/LangSwitch';
import { RosterCardPhotos } from './common/UnitPhoto';
import { photoKey } from '../photos';
import type { PhotoItem } from '../photoList';

const ALLEGIANCE_RU: Record<string, string> = { Imperium: 'Империум', Chaos: 'Хаос', Xenos: 'Ксеносы' };
const ALLEGIANCE_EN: Record<string, string> = { Imperium: 'Imperium', Chaos: 'Chaos', Xenos: 'Xenos' };

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
  const t = useT();
  const en = useEn();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<Roster | null>(null);
  const [sources, setSources] = useState(false);
  const factionName = useMemo(() => Object.fromEntries(index.factions.map((f) => [f.id, f.name])), [index]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <ListHeader kicker={t('WarpBuilder · 40K 11-я редакция', 'WarpBuilder · 40K 11th edition')} title="Warhammer 40,000" onBack={onExit} onImport={() => setImporting(true)} extra={<LangSwitch />} />
      {switcher}

      <ToolMenus
        rules={[
          { icon: 'book', title: t('Правила', 'Rules'), sub: t('Стратагемы · Core Rules', 'Stratagems · Core Rules'), onClick: onRules },
          { icon: 'spark', title: t('Как играть', 'How to play'), sub: t('Обучение для новичков: ход, стрельба, бой', 'A beginner’s guide: turn, shooting, combat'), onClick: () => navigate('/learn/40k') },
          // обучающая игра — после карточек «Как играть» (13.11.2026)
          ...(learnDone('40k') ? [{ icon: 'shield', title: t('Обучающая игра', 'Training game'), sub: t('Раунд по шагам за столом', 'A round step by step at the table'), onClick: () => navigate('/learn/40k/round') }] : []),
        ]}
        game={[
          { icon: 'map', title: t('Начать игру', 'Start a game'), sub: t('Миссии · раскладки · трекер', 'Missions · layouts · tracker'), onClick: onStartGame },
          { icon: 'shield', title: 'Test Army', sub: t('Расставить армию на поле · построения · линейка', 'Place your army on the table · formations · ruler'), onClick: onTestArmy },
        ]}
      />

      {rosters.length === 0 ? (
        <Empty title={t('Пока пусто', 'Nothing here yet')}>{t('Соберите первый ростер — очки, детачменты и правила проверяются на лету.', 'Build your first roster — points, Detachments and rules are checked as you go.')}</Empty>
      ) : (
        <ul className="ds-stagger space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => (
            <RosterCard key={r.id} roster={r} faction={factionName[r.factionId] ?? r.factionId} onOpen={() => onOpen(r.id)} onMenu={() => setMenu(r)} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        <button type="button" onClick={() => setSources(true)} className="underline decoration-white/20 underline-offset-2 active:text-fg-2">
          {indexCredit(index, en ? 'en' : 'ru')}
        </button>
        <br />
        {cloudEnabled() ? t('Ростеры синхронизируются через Telegram', 'Rosters sync through Telegram') : t('Ростеры хранятся в этом браузере', 'Rosters are stored in this browser')}
      </p>

      <Sheet open={sources} onClose={() => setSources(false)} title={t('Версия данных', 'Data version')}>
        <ul className="space-y-3 text-sm">
          {indexCreditDetails(index, en ? 'en' : 'ru').map((x) => (
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
            <Icon name="plus" /> {t('Новый ростер', 'New roster')}
          </Button>
        </div>
      </div>

      <CreateSheet open={creating} index={index} onClose={() => setCreating(false)} onCreate={(r) => (setCreating(false), onCreate(r))} />
      <ImportSheet open={importing} factions={index.factions.map((f) => f.id)} onClose={() => setImporting(false)} onImport={(r) => (setImporting(false), onCreate(r))} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name ?? ''}>
        {menu && (
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (onDuplicate(duplicateRoster(menu)), setMenu(null))}>
              <Icon name="copy" /> {t('Дублировать', 'Duplicate')}
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              onClick={async () => {
                if (await confirmAsk(t(`Удалить ростер «${menu.name}»?`, `Delete roster “${menu.name}”?`))) {
                  onDelete(menu.id);
                  setMenu(null);
                }
              }}
            >
              <Icon name="trash" /> {t('Удалить', 'Delete')}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function RosterCard({ roster, faction, onOpen, onMenu }: { roster: Roster; faction: string; onOpen: () => void; onMenu: () => void }) {
  const t = useT();
  const en = useEn();
  const size = BATTLE_SIZES[roster.battleSize];
  const date = new Date(roster.updatedAt).toLocaleDateString(en ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short' });
  const photos = useMemo<PhotoItem[]>(() => roster.units.map((u) => ({ key: photoKey('40k', u.datasheetId), name: roster.name })), [roster.units, roster.name]);
  return (
    <li className="relative overflow-hidden rounded-2xl border border-white/10 bg-app-elevated">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: factionColor('40k', roster.factionId) }} />
      <div className="flex items-stretch pl-1">
        <button type="button" onClick={() => (haptic.tap(), onOpen())} className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-white/[0.03]">
          <p className="truncate text-base font-semibold">{roster.name}</p>
          <p className="mt-0.5 truncate text-sm text-fg-3">
            {faction}
            {roster.chapter ? ` · ${roster.chapter}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag>{size.label}</Tag>
            <Tag>{roster.units.length} {t('юн.', 'units')}</Tag>
            {roster.summary && (
              <Tag tone={roster.summary.errors ? 'danger' : roster.summary.warnings ? 'warn' : 'accent'}>
                {roster.summary.errors ? `${roster.summary.errors} ${t('ош.', 'err.')}` : roster.summary.warnings ? `${roster.summary.warnings} ${t('пред.', 'warn.')}` : 'OK'}
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
            <span className="mt-1 text-[12px] text-fg-3">{t('из', 'of')} {fmtPts(size.points)}</span>
          </div>
        )}
        <button type="button" aria-label={t('Действия', 'Actions')} onClick={() => (haptic.tap(), onMenu())} className="flex w-12 items-center justify-center text-fg-3 active:bg-white/5">
          <Icon name="more" className="size-6" strokeWidth={3} />
        </button>
      </div>
      <RosterCardPhotos items={photos} onOpenRoster={onOpen} className="-mt-1 pb-3.5 pl-5 pr-4" />
    </li>
  );
}

function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: DataIndex; onClose: () => void; onCreate: (r: Roster) => void }) {
  const t = useT();
  const en = useEn();
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
      title={t('Новый ростер', 'New roster')}
      tall
      footer={
        <Button variant="primary" className="h-12 w-full text-base" disabled={!faction} onClick={create}>
          {t('Создать', 'Create')}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field label={t('Название', 'Name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Например: Турнир в субботу', 'For example: Saturday tournament')}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </Field>
        <Field label={t('Размер боя', 'Battle size')}>
          <Segmented
            value={size}
            onChange={setSize}
            options={BATTLE_SIZE_ORDER.map((s) => ({ value: s, label: BATTLE_SIZES[s].label, hint: `${fmtPts(BATTLE_SIZES[s].points)} ${t('очк.', 'pts')}` }))}
          />
        </Field>
        {groups.map(([alg, list]) => (
          <Field key={alg} label={(en ? ALLEGIANCE_EN : ALLEGIANCE_RU)[alg] ?? alg}>
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
                    {f.units} {t('инфолистов', 'datasheets')}
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
  const t = useT();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Импорт ростера', 'Import roster')}
      footer={
        <Button
          variant="primary"
          className="h-12 w-full"
          disabled={!code.trim()}
          onClick={() => {
            if (code.trim().startsWith('AOS1.')) {
              setErr(t('Это код ростера Age of Sigmar — импортируйте его на вкладке Age of Sigmar.', 'This is an Age of Sigmar roster code — import it on the Age of Sigmar tab.'));
              haptic.error();
              return;
            }
            try {
              onImport(decodeRoster(code, factions));
              setCode('');
              setErr(null);
              haptic.ok();
            } catch (e) {
              const msg = e instanceof Error && e.message.startsWith('Ростер для') ? t(e.message, 'The roster is for an unknown faction — update the data') : null;
              setErr(msg ?? t('Не получилось прочитать код. Скопируйте его целиком (начинается с WH1.).', 'Could not read the code. Copy it in full (it starts with WH1.).'));
              haptic.error();
            }
          }}
        >
          {t('Импортировать', 'Import')}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-3">{t('Вставьте код ростера из раздела «Экспорт → Код» на другом устройстве.', 'Paste the roster code from “Export → Code” on another device.')}</p>
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
