import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadKtTeam } from '../../data';
import { uid } from '../../engine/roster';
import { decodeKtRoster, KT_CODE_PREFIX, ktTeamGroup, newKtRoster, type KtRoster } from '../../kt/roster';
import type { KtIndex } from '../../kt/types';
import { cloudEnabled } from '../../storage';
import { confirmAsk, haptic, openExternal } from '../../telegram';
import { Button, Empty, Field, Icon, Segmented, Sheet, Tag } from '../kit';
import { BottomAction, ListHeader, PickTile, RosterCard, SearchField, ToolTile } from '../common/BuilderKit';

type Team = KtIndex['teams'][number];

/** Список команд Kill Team (W3, вид R1 30.10.2026 — как в AoS): ростеры, создание по команде, импорт по коду KT1.…. */
export function KtList({
  onExit,
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
  index: KtIndex;
  rosters: KtRoster[];
  onOpen: (id: string) => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  onCreate: (r: KtRoster) => void;
  onDuplicate: (r: KtRoster) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<KtRoster | null>(null);
  const teamOf = useMemo(() => new Map(index.teams.map((t) => [t.id, t])), [index]);
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <ListHeader kicker={`WarpBuilder · ${index.edition}`} title="Kill Team" onBack={onExit} onImport={() => setImporting(true)} />
      <div className="mb-5 grid grid-cols-2 gap-2">
        <ToolTile icon="spark" title="Начать игру" sub="Approved Ops · CP · раунды" onClick={onStartGame} />
        <ToolTile icon="map" title="Test Army" sub="Поле 30×22″ · базы · соперник" onClick={onTestArmy} />
        <ToolTile icon="book" title="Правила" sub="Core Rules · Wahapedia" onClick={() => openExternal('https://wahapedia.ru/kill-team3/the-rules/core-rules/')} />
        <ToolTile icon="spark" title="Как играть" sub="Обучение: активации, стрельба, бой" onClick={() => navigate('/learn/kt')} />
      </div>
      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Выберите команду и наберите оперативников: датакарты, оружие, снаряжение и уловки — из данных KTDash.</Empty>
      ) : (
        <ul className="ds-stagger space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => {
            const t = teamOf.get(r.teamId);
            return (
              <RosterCard
                key={r.id}
                name={r.name}
                sub={t ? `${t.name} · ${ktTeamGroup(index, t)}` : r.teamId}
                tags={
                  <>
                    <Tag>KT</Tag>
                    <Tag>{r.operatives.length} опер.</Tag>
                  </>
                }
                status={r.summary}
                updatedAt={r.updatedAt}
                onOpen={() => onOpen(r.id)}
                onMenu={() => setMenu(r)}
              />
            );
          })}
        </ul>
      )}
      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        Данные: {index.source.name} · {index.source.date} ({index.source.commit})
        <br />
        {cloudEnabled() ? 'Команды синхронизируются через Telegram' : 'Команды хранятся в этом браузере'}
      </p>
      <BottomAction onClick={() => setCreating(true)}>Новая команда</BottomAction>
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

/**
 * Выбор команды: фракция ktdash → группа по ключевым словам (Imperium → Astra Militarum → Kasrkin), поиск,
 * отдельно — наборы миссий и неигровые оперативники. Как создание ростера AoS: название, выбор, «Создать».
 */
function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: KtIndex; onClose: () => void; onCreate: (r: KtRoster) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<'play' | 'special'>('play');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (t: Team) => !needle || [t.name, t.group ?? '', ...t.archetypes].some((s) => s.toLowerCase().includes(needle));
    return index.factions
      .map((f) => {
        const teams = index.teams.filter((t) => t.factionId === f.id && t.special === (kind === 'special') && match(t));
        // сначала команды без группы (подпись — фракция), затем группы по алфавиту
        const groups = new Map<string, Team[]>();
        for (const t of teams) groups.set(t.group ?? '', [...(groups.get(t.group ?? '') ?? []), t]);
        const list = [...groups].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
        return { faction: f, count: teams.length, groups: list };
      })
      .filter((s) => s.count > 0);
  }, [index, kind, q]);
  const create = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      const team = await loadKtTeam(picked);
      const r = newKtRoster(team, index.source.commit);
      if (name.trim()) r.name = name.trim().slice(0, 80);
      haptic.ok();
      onCreate(r);
      setPicked(null);
      setName('');
      setQ('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Новая команда · Kill Team"
      tall
      footer={
        <Button variant="primary" className="h-12 w-full text-base" disabled={!picked || busy} onClick={() => void create()}>
          {busy ? 'Загрузка…' : 'Создать'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Название">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="По умолчанию — название команды"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </Field>
        <Segmented
          value={kind}
          onChange={(v) => (setKind(v), setPicked(null))}
          options={[
            { value: 'play', label: 'Команды' },
            { value: 'special', label: 'Наборы миссий' },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder="Поиск: команда, группа, архетип" />
        {err && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        {!sections.length && <p className="text-sm text-fg-3">Ничего не найдено.</p>}
        {sections.map(({ faction, count, groups }) => (
          <section key={faction.id}>
            <p className="font-display mb-2 flex items-baseline justify-between border-b border-white/10 pb-1 text-lg font-semibold uppercase leading-none">
              {faction.name}
              <span className="text-[12px] font-semibold text-fg-3">{count}</span>
            </p>
            <div className="space-y-3">
              {groups.map(([group, teams]) => (
                <div key={group || '-'}>
                  {group && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-accent/80">{group}</p>}
                  <div className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2">
                    {teams.map((t) => (
                      <PickTile
                        key={t.id}
                        title={t.name}
                        sub={`${t.group ?? faction.name} · профилей: ${t.operatives}`}
                        chips={t.archetypes}
                        active={picked === t.id}
                        onClick={() => setPicked(t.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="text-[12px] text-fg-3">Группы — по ключевым словам оперативников в данных KTDash. Архетипы — как в источнике.</p>
      </div>
    </Sheet>
  );
}

function ImportSheet({ open, index, onClose, onImport }: { open: boolean; index: KtIndex; onClose: () => void; onImport: (r: KtRoster) => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const go = () => {
    const c = code.trim();
    if (c.startsWith('WH1.')) {
      setErr('Это ростер Warhammer 40,000 — импортируйте его на вкладке 40K.');
      haptic.error();
      return;
    }
    if (c.startsWith('AOS1.')) {
      setErr('Это ростер Age of Sigmar — импортируйте его на вкладке AoS.');
      haptic.error();
      return;
    }
    if (c.startsWith('WC1.')) {
      setErr('Это варбанда Warcry — импортируйте её на вкладке Warcry.');
      haptic.error();
      return;
    }
    try {
      onImport(decodeKtRoster(c, index.teams.map((t) => t.id)));
      setCode('');
      setErr(null);
      haptic.ok();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось прочитать код. Скопируйте его целиком (начинается с KT1.).');
      haptic.error();
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
      <p className="mb-3 text-sm text-fg-3">Вставьте код из «Экспорт → Код» на другом устройстве. После импорта команда проверяется по правилам.</p>
      <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={6} placeholder={`${KT_CODE_PREFIX}eyJ2Ijox…`} className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent" />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}
