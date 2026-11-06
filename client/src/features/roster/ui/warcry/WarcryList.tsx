import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadWarcryFaction } from '../../data';
import { uid } from '../../engine/roster';
import { cloudEnabled } from '../../storage';
import { decodeWarcryRoster, newWarcryRoster, WARCRY_CODE_PREFIX, WARCRY_LIMITS, type WarcryRoster } from '../../warcry/roster';
import type { WarcryIndex } from '../../warcry/types';
import { confirmAsk, haptic, openExternal } from '../../telegram';
import { Button, Empty, Field, Icon, Sheet, Tag } from '../kit';
import { BottomAction, ListHeader, PickTile, RosterCard, SearchField, ToolTile } from '../common/BuilderKit';

const ALLIANCE: Record<string, string> = { chaos: 'Chaos', death: 'Death', destruction: 'Destruction', order: 'Order' };

/** Список варбанд Warcry (W5, вид R2 30.10.2026 — как в AoS): варбанды, создание по фракции, импорт по коду WC1.…. */
export function WarcryList({
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
  index: WarcryIndex;
  rosters: WarcryRoster[];
  onOpen: (id: string) => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  onCreate: (r: WarcryRoster) => void;
  onDuplicate: (r: WarcryRoster) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<WarcryRoster | null>(null);
  const factionOf = useMemo(() => new Map(index.factions.map((f) => [f.id, f])), [index]);
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-4xl lg:pt-8">
      <ListHeader kicker="WarpBuilder · Warcry Matched Play" title="Warcry" onBack={onExit} onImport={() => setImporting(true)} />
      <div className="mb-5 grid grid-cols-2 gap-2">
        <ToolTile icon="spark" title="Начать игру" sub="Battleplan · инициатива · раунды" onClick={onStartGame} />
        <ToolTile icon="map" title="Test Army" sub="Поле 30×22″ · базы · соперник" onClick={onTestArmy} />
        <ToolTile icon="book" title="Правила" sub="Battleplan · Warcrier" onClick={() => openExternal('https://warcrier.net/docs/rules/battleplan')} />
        <ToolTile icon="spark" title="Как играть" sub="Обучение: инициатива, действия, атака" onClick={() => navigate('/learn/warcry')} />
      </div>
      {rosters.length === 0 ? (
        <Empty title="Пока пусто">Выберите фракцию и наберите бойцов: союзники, траллы, монстр, группы Dagger / Shield / Hammer и проверка правил построения.</Empty>
      ) : (
        <ul className="ds-stagger space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2.5 lg:space-y-0">
          {rosters.map((r) => {
            const f = factionOf.get(r.factionId);
            return (
              <RosterCard
                key={r.id}
                name={r.name}
                sub={f ? `${f.name} · ${ALLIANCE[f.grandAlliance] ?? f.grandAlliance}` : r.factionId}
                tags={
                  <>
                    <Tag>Warcry</Tag>
                    <Tag>{r.fighters.length} бойц.</Tag>
                  </>
                }
                status={r.summary}
                points={r.summary?.points}
                limit={WARCRY_LIMITS.points}
                updatedAt={r.updatedAt}
                onOpen={() => onOpen(r.id)}
                onMenu={() => setMenu(r)}
              />
            );
          })}
        </ul>
      )}
      <p className="mt-8 text-center text-xs leading-relaxed text-fg-3">
        Данные: {index.source.name} · {index.source.date} ({index.source.commit}) · правила построения — warcrier.net
        <br />
        {cloudEnabled() ? 'Варбанды синхронизируются через Telegram' : 'Варбанды хранятся в этом браузере'}
      </p>
      <BottomAction onClick={() => setCreating(true)}>Новая варбанда</BottomAction>
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

/** Выбор фракции: Великие альянсы, поиск, подфракции (Bladeborn и др.) метками. Как создание ростера AoS. */
function CreateSheet({ open, index, onClose, onCreate }: { open: boolean; index: WarcryIndex; onClose: () => void; onCreate: (r: WarcryRoster) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return index.grandAlliances
      .map((ga) => ({
        ga,
        list: index.factions.filter((f) => f.grandAlliance === ga && !f.generic && (!needle || [f.name, ...f.subfactions].some((s) => s.toLowerCase().includes(needle)))),
      }))
      .filter((s) => s.list.length);
  }, [index, q]);
  const create = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      const f = await loadWarcryFaction(picked);
      const r = newWarcryRoster(f, index.source.commit);
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
      title="Новая варбанда · Warcry"
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
            placeholder="По умолчанию — название фракции"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </Field>
        <SearchField value={q} onChange={setQ} placeholder="Поиск: фракция или подфракция" />
        {err && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        {!sections.length && <p className="text-sm text-fg-3">Ничего не найдено.</p>}
        {sections.map(({ ga, list }) => (
          <section key={ga}>
            <p className="font-display mb-2 flex items-baseline justify-between border-b border-white/10 pb-1 text-lg font-semibold uppercase leading-none">
              {ALLIANCE[ga] ?? ga}
              <span className="text-[12px] font-semibold text-fg-3">{list.length}</span>
            </p>
            <div className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2">
              {list.map((f) => (
                <PickTile key={f.id} title={f.name} sub={`профилей бойцов: ${f.fighters}`} chips={f.subfactions} active={picked === f.id} onClick={() => setPicked(f.id)} />
              ))}
            </div>
          </section>
        ))}
        <p className="text-[12px] text-fg-3">Метки — подфракции (Bladeborn и другие) из данных warcry_data; их бойцы берутся в варбанду своей фракции.</p>
      </div>
    </Sheet>
  );
}

function ImportSheet({ open, index, onClose, onImport }: { open: boolean; index: WarcryIndex; onClose: () => void; onImport: (r: WarcryRoster) => void }) {
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
    if (c.startsWith('KT1.')) {
      setErr('Это команда Kill Team — импортируйте её на вкладке Kill Team.');
      haptic.error();
      return;
    }
    try {
      onImport(decodeWarcryRoster(c, index.factions.map((f) => f.id)));
      setCode('');
      setErr(null);
      haptic.ok();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не получилось прочитать код. Скопируйте его целиком (начинается с WC1.).');
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
          Добавить варбанду
        </Button>
      }
    >
      <p className="mb-3 text-sm text-fg-3">Вставьте код из «Экспорт → Код» на другом устройстве. После импорта варбанда проверяется по правилам.</p>
      <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={6} placeholder={`${WARCRY_CODE_PREFIX}eyJ2Ijox…`} className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 font-mono text-xs text-white outline-none focus:border-accent" />
      {err && <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Sheet>
  );
}
