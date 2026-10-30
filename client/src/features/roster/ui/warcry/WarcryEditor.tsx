import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadWarcryFaction } from '../../data';
import {
  abilitiesFor,
  addFighter,
  autoGroups,
  checkWarcryRoster,
  encodeWarcryRoster,
  fighterOf,
  GROUP_LABEL,
  makeLeader,
  neededFactions,
  removeFighter,
  ROLE_LABEL,
  rolesFor,
  touchWarcry,
  universalFor,
  updateFighter,
  WARCRY_GROUPS,
  WARCRY_LIMITS,
  warcryPoints,
  type WarcryRoster,
  type WarcryRosterFighter,
} from '../../warcry/roster';
import type { WarcryAbility, WarcryFaction, WarcryFighter, WarcryIndex, WarcryWeapon } from '../../warcry/types';
import { confirmAsk, haptic, shareText } from '../../telegram';
import { Button, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { CostBadge, DataCard, EditorHeader, HeaderStat, RuleCard, SearchField, SectionTitle } from '../common/BuilderKit';

type Tab = 'fighters' | 'groups' | 'rules';
const ALLIANCE: Record<string, string> = { chaos: 'Chaos', death: 'Death', destruction: 'Destruction', order: 'Order' };
const COST: Record<string, string> = { double: 'Double', triple: 'Triple', quad: 'Quad', reaction: 'Reaction', passive: 'Passive', battletrait: 'Battle trait' };
const COST_TONE: Record<string, 'muted' | 'accent' | 'warn' | 'danger'> = { double: 'muted', triple: 'accent', quad: 'danger', reaction: 'warn', passive: 'muted', battletrait: 'muted' };
const COST_ORDER = ['reaction', 'double', 'triple', 'quad', 'passive', 'battletrait'];

/**
 * Редактор варбанды Warcry (W5, вид R2 30.10.2026 — как AoS и Kill Team): шапка с очками и лимитами, блок варбанды,
 * датакарты бойцов (характеристики, оружие, способности по стоимости), группы Dagger / Shield / Hammer, правила.
 */
export function WarcryEditor({ roster, index, onBack, onChange, onDelete }: { roster: WarcryRoster; index: WarcryIndex; onBack: () => void; onChange: (r: WarcryRoster) => void; onDelete: () => void }) {
  const [data, setData] = useState<Map<string, WarcryFaction>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const own = data.get(roster.factionId);
  const generic = own ? index.factions.find((f) => f.generic && f.grandAlliance === own.grandAlliance)?.id : undefined;
  // нужные файлы: своя фракция, общий файл альянса, фракции уже взятых бойцов
  const need = useMemo(() => [...new Set([...neededFactions(roster), ...(generic ? [generic] : [])])], [roster, generic]);
  const load = useCallback(
    (id: string) =>
      loadWarcryFaction(id).then(
        (f) => setData((m) => (m.has(id) ? m : new Map(m).set(id, f))),
        (e) => setError(String(e?.message ?? e)),
      ),
    [],
  );
  useEffect(() => {
    for (const id of need) if (!data.has(id)) void load(id);
  }, [need, data, load]);
  const ready = need.every((id) => data.has(id));
  const issues = useMemo(() => (ready ? checkWarcryRoster(roster, data) : []), [roster, data, ready]);
  const points = useMemo(() => warcryPoints(roster, data), [roster, data]);
  useEffect(() => {
    if (!ready) return;
    const s = { fighters: roster.fighters.length, points, errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length };
    const o = roster.summary;
    if (!o || o.fighters !== s.fighters || o.points !== s.points || o.errors !== s.errors || o.warnings !== s.warnings) onChange({ ...roster, summary: s });
  }, [ready, issues, points, roster, onChange]);
  const [tab, setTab] = useState<Tab>('fighters');
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [armyOpen, setArmyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <p className="text-sm text-fg-3">{error}</p>
        <Button className="mt-4" onClick={onBack}>
          Назад
        </Button>
      </div>
    );
  if (!own || !ready) return <div className="mx-auto mt-24 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const L = WARCRY_LIMITS;
  const count = (role: WarcryRosterFighter['role']) => roster.fighters.filter((x) => x.role === role).length;
  const heroes = roster.fighters.filter((x) => fighterOf(data, x)?.runemarks.includes('hero')).length;
  const n = roster.fighters.length;
  const battletraits = own.abilities.filter((a) => a.cost === 'battletrait');

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
      <EditorHeader
        name={roster.name}
        onName={(name) => onChange(touchWarcry({ ...roster, name: name.slice(0, 80) }))}
        onBack={onBack}
        actions={
          <>
            <IconButton icon="share" label="Экспорт" onClick={() => setExporting(true)} className="size-9" />
            <IconButton icon="more" label="Меню" onClick={() => setMenu(true)} className="size-9" />
          </>
        }
        big={points}
        bigLimit={L.points}
        stats={
          <>
            <HeaderStat label="Бойцы" value={`${n}/${L.maxFighters}`} bad={n > 0 && (n < L.minFighters || n > L.maxFighters)} />
            <HeaderStat label="Герои" value={own.heroesAll ? String(heroes) : `${heroes}/${L.heroes}`} bad={!own.heroesAll && heroes > L.heroes} />
          </>
        }
        issues={issues}
      />

      <div className="space-y-4 px-4 pt-4">
        {/* ---- варбанда ---- */}
        <section className="rounded-2xl border border-white/10 bg-app-elevated">
          <button type="button" onClick={() => setArmyOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">Warcry · {ALLIANCE[own.grandAlliance] ?? own.grandAlliance}</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{own.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Tag tone={count('ally') > L.allies ? 'danger' : 'muted'}>
                  Союзники {count('ally')}/{L.allies}
                </Tag>
                <Tag tone={count('thrall') > L.thralls ? 'danger' : 'muted'}>
                  Траллы {count('thrall')}/{L.thralls}
                </Tag>
                <Tag tone={count('monster') > L.monsters ? 'danger' : 'muted'}>
                  Монстр {count('monster')}/{L.monsters}
                </Tag>
              </div>
            </div>
            <Icon name="down" className={cx('size-5 shrink-0 text-fg-3 transition', armyOpen && 'rotate-180')} />
          </button>
          {armyOpen && (
            <div className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3">
              {own.subfactions.length > 0 && (
                <div>
                  <SectionTitle>Подфракции</SectionTitle>
                  <div className="flex flex-wrap gap-1">
                    {own.subfactions.map((s) => (
                      <Tag key={s.name}>
                        {s.name}
                        {s.bladeborn ? ' · Bladeborn' : ''}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              <AbilityList title="Боевые черты фракции" list={battletraits} empty="В данных нет боевых черт фракции." />
              <p className="text-[12px] text-fg-3">
                Данные: {index.source.name}, {index.source.date} ({index.source.commit}). Тексты способностей — английский оригинал.
              </p>
            </div>
          )}
        </section>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'fighters', label: 'Бойцы' },
            { value: 'groups', label: 'Группы' },
            { value: 'rules', label: 'Правила' },
          ]}
        />

        {tab === 'fighters' && (
          <section className="space-y-2.5">
            {!n && <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-fg-3">Добавьте бойцов — первый боец становится лидером (герой своей фракции).</p>}
            {roster.fighters.map((x, i) => {
              const f = fighterOf(data, x);
              return f ? (
                <FighterCard
                  key={x.uid}
                  leader={i === 0}
                  x={x}
                  f={f}
                  src={data.get(x.factionId)}
                  own={own}
                  universal={index.universal}
                  open={expanded === x.uid}
                  onToggle={() => setExpanded((e) => (e === x.uid ? null : x.uid))}
                  onChange={(p) => onChange(updateFighter(roster, x.uid, p))}
                  onLeader={() => (haptic.select(), onChange(makeLeader(roster, x.uid)))}
                  onRemove={() => onChange(removeFighter(roster, x.uid))}
                />
              ) : (
                <div key={x.uid} className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Нет в данных: {x.fighterId}
                  <Button variant="danger" className="text-xs" onClick={() => onChange(removeFighter(roster, x.uid))}>
                    Убрать
                  </Button>
                </div>
              );
            })}
            <Button variant="primary" className="h-12 w-full" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Добавить бойца
            </Button>
          </section>
        )}

        {tab === 'groups' && (
          <section className="space-y-3">
            <Button className="w-full" onClick={() => (haptic.select(), onChange(autoGroups(roster)))}>
              Распределить автоматически
            </Button>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {WARCRY_GROUPS.map((g) => {
                const list = roster.fighters.filter((x) => x.group === g);
                return (
                  <div key={g} className="rounded-2xl border border-white/10 bg-app-elevated p-3">
                    <p className="font-display mb-1.5 flex items-baseline justify-between text-lg font-semibold uppercase leading-none">
                      {GROUP_LABEL[g]}
                      <span className="text-sm text-fg-3">{list.length}</span>
                    </p>
                    {!list.length && <p className="text-[12px] text-fg-3">Пусто</p>}
                    {list.map((x) => (
                      <GroupRow key={x.uid} x={x} f={fighterOf(data, x)} onGroup={(group) => onChange(updateFighter(roster, x.uid, { group }))} />
                    ))}
                  </div>
                );
              })}
            </div>
            {roster.fighters.some((x) => !x.group) && (
              <div className="rounded-2xl border border-warn/30 bg-warn/5 p-3">
                <SectionTitle>Без группы</SectionTitle>
                {roster.fighters
                  .filter((x) => !x.group)
                  .map((x) => (
                    <GroupRow key={x.uid} x={x} f={fighterOf(data, x)} onGroup={(group) => onChange(updateFighter(roster, x.uid, { group }))} />
                  ))}
              </div>
            )}
            <p className="text-[12px] text-fg-3">Бойцы — как можно ровнее по трём группам; монстр — один в своей группе, остальные ровно по двум другим.</p>
          </section>
        )}

        {tab === 'rules' && (
          <section className="space-y-4">
            <AbilityList title="Боевые черты фракции" list={battletraits} empty="В данных нет боевых черт фракции." />
            <AbilityList title="Универсальные способности" list={index.universal} />
            <div className="rounded-2xl border border-white/10 bg-app-elevated p-3.5 text-[12.5px] leading-snug text-fg-2">
              <SectionTitle>Построение варбанды</SectionTitle>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  {L.minFighters}–{L.maxFighters} бойцов, не больше {L.points} очков.
                </li>
                <li>Первый боец — герой и лидер; не больше {L.heroes} героев (с героями-союзниками).</li>
                <li>
                  Союзники (Hero или Ally другой фракции альянса) — до {L.allies}, траллы — до {L.thralls}, монстр — {L.monsters}.
                </li>
                <li>Бойцы Bladeborn — по одному; герой-Bladeborn союзником открывает своих спутников вне лимита союзников.</li>
                {own.heroesAll && <li>«Heroes All»: героев своей фракции — без лимита, героев других фракций — до {L.heroesAllOther}.</li>}
              </ul>
              <p className="mt-2 text-[12px] text-fg-3">Источник: warcrier.net (The Warbands; Allies, Thralls and Monsters; Bladeborn; страницы фракций).</p>
            </div>
          </section>
        )}
      </div>

      <AddSheet open={adding} onClose={() => setAdding(false)} own={own} index={index} data={data} roster={roster} onLoad={load} onAdd={(r) => (haptic.tap(), onChange(r), setAdding(false))} />
      <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} data={data} points={points} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Варбанда">
        <Button
          variant="danger"
          className="w-full justify-start"
          onClick={async () => {
            if (await confirmAsk(`Удалить варбанду «${roster.name}»?`)) onDelete();
          }}
        >
          <Icon name="trash" /> Удалить варбанду
        </Button>
      </Sheet>
    </div>
  );
}

function GroupRow({ x, f, onGroup }: { x: WarcryRosterFighter; f?: WarcryFighter; onGroup: (g: WarcryRosterFighter['group']) => void }) {
  return (
    <div className="flex items-center gap-2 border-t border-white/[0.05] py-1.5 first-of-type:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{x.name || f?.name || x.fighterId}</span>
        <span className="block text-[12px] text-fg-3">
          {f ? `${f.points} очк.` : ''}
          {x.role !== 'warband' ? ` · ${ROLE_LABEL[x.role].toLowerCase()}` : ''}
        </span>
      </span>
      <div className="flex gap-1">
        {WARCRY_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-label={GROUP_LABEL[g]}
            onClick={() => (haptic.select(), onGroup(g))}
            className={cx('ds-hit size-7 rounded-lg border text-[12px] font-bold', x.group === g ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-3')}
          >
            {GROUP_LABEL[g][0]}
          </button>
        ))}
      </div>
    </div>
  );
}

const FIGHTER_STATS = (f: WarcryFighter) => [
  { label: 'Move', value: f.movement },
  { label: 'Tough', value: f.toughness },
  { label: 'Wounds', value: f.wounds },
  { label: 'Очки', value: f.points },
];

/** Датакарта бойца: характеристики и оружие всегда; раскрытая — способности по стоимости, рунмарки, управление. */
function FighterCard({
  leader,
  x,
  f,
  src,
  own,
  universal,
  open,
  onToggle,
  onChange,
  onLeader,
  onRemove,
}: {
  leader: boolean;
  x: WarcryRosterFighter;
  f: WarcryFighter;
  src: WarcryFaction | undefined;
  own: WarcryFaction;
  universal: WarcryAbility[];
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<Pick<WarcryRosterFighter, 'name' | 'group'>>) => void;
  onLeader: () => void;
  onRemove: () => void;
}) {
  const abilities = useMemo(() => (open ? sortByCost(abilitiesFor(src, f)) : []), [open, src, f]);
  const univ = useMemo(() => (open ? sortByCost(universalFor(universal, f)) : []), [open, universal, f]);
  const from = src && src.id !== own.id ? (src.generic ? `${ALLIANCE[src.grandAlliance] ?? src.grandAlliance} · общий` : src.name) : null;
  return (
    <DataCard
      title={x.name || f.name}
      subtitle={[x.name ? f.name : null, from, f.subfaction || null].filter(Boolean).join(' · ') || undefined}
      highlight={leader}
      badges={
        <>
          {leader && <Tag tone="accent">Лидер</Tag>}
          {x.role !== 'warband' && <Tag tone="warn">{ROLE_LABEL[x.role]}</Tag>}
          {x.group && <Tag>{GROUP_LABEL[x.group]}</Tag>}
          {f.runemarks.map((r) => (
            <Tag key={r}>{r}</Tag>
          ))}
        </>
      }
      stats={FIGHTER_STATS(f)}
      open={open}
      onToggle={onToggle}
      summary={<WeaponTable list={f.weapons} />}
    >
      <AbilityList title="Способности" list={abilities} empty="Нет способностей фракции для рунмарок этого бойца." />
      <AbilityList title="Универсальные способности" list={univ} collapsed />
      <input
        value={x.name}
        onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
        placeholder="Своё имя бойца"
        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-fg-3 focus:border-accent"
      />
      <div className="grid grid-cols-2 gap-2">
        {!leader && (
          <Button className="text-xs" onClick={onLeader}>
            <Icon name="crown" /> Сделать лидером
          </Button>
        )}
        <Button variant="danger" className={cx('text-xs', leader && 'col-span-2')} onClick={onRemove}>
          <Icon name="trash" /> Убрать
        </Button>
      </div>
    </DataCard>
  );
}

const sortByCost = (list: WarcryAbility[]) => [...list].sort((a, b) => COST_ORDER.indexOf(a.cost) - COST_ORDER.indexOf(b.cost));

/** Оружие бойца таблицей: рунмарка оружия, дальность, атаки, сила, урон (обычный / крит). */
function WeaponTable({ list }: { list: WarcryWeapon[] }) {
  if (!list.length) return <p className="text-[12px] text-fg-3">Нет оружия в данных</p>;
  const cols = 'grid-cols-[1fr_3rem_2.25rem_2.25rem_3rem]';
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <div className={cx('grid gap-x-1 bg-white/[0.05] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide text-fg-3', cols)}>
        <span>Оружие</span>
        <span className="text-center">Range</span>
        <span className="text-center">A</span>
        <span className="text-center">S</span>
        <span className="text-center">Dmg</span>
      </div>
      {list.map((w, i) => (
        <div key={i} className={cx('grid items-center gap-x-1 border-t border-white/[0.06] px-2.5 py-1.5 text-[12.5px] tabular-nums', cols)}>
          <span className="truncate font-semibold capitalize">{w.runemark || 'оружие'}</span>
          <span className="text-center">
            {w.minRange ? `${w.minRange}-` : ''}
            {w.maxRange}"
          </span>
          <span className="text-center">{w.attacks}</span>
          <span className="text-center">{w.strength}</span>
          <span className="text-center">
            {w.dmgHit}/{w.dmgCrit}
          </span>
        </div>
      ))}
    </div>
  );
}

function AbilityList({ title, list, empty, collapsed }: { title: string; list: WarcryAbility[]; empty?: string; collapsed?: boolean }) {
  if (!list.length) return empty ? <p className="text-[12px] text-fg-3">{empty}</p> : null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-1.5">
        {list.map((a) => (
          <RuleCard
            key={a.id}
            name={a.name}
            sub={[a.subfaction, a.runemarks.length ? a.runemarks.join(', ') : null].filter(Boolean).join(' · ') || undefined}
            badge={<CostBadge tone={COST_TONE[a.cost] ?? 'muted'}>{COST[a.cost] ?? a.cost}</CostBadge>}
            open={!collapsed}
          >
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg-2">{a.text}</p>
          </RuleCard>
        ))}
      </div>
    </div>
  );
}

/** Добавление бойца: источник (своя фракция; общий файл альянса; другие фракции альянса), поиск, роли кнопками. */
function AddSheet({
  open,
  onClose,
  own,
  index,
  data,
  roster,
  onLoad,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  own: WarcryFaction;
  index: WarcryIndex;
  data: Map<string, WarcryFaction>;
  roster: WarcryRoster;
  onLoad: (id: string) => Promise<void>;
  onAdd: (r: WarcryRoster) => void;
}) {
  const sources = useMemo(() => index.factions.filter((f) => f.grandAlliance === own.grandAlliance && f.id !== own.id).sort((a, b) => Number(b.generic) - Number(a.generic)), [index, own]);
  const [srcId, setSrcId] = useState(own.id);
  const [q, setQ] = useState('');
  const src = data.get(srcId);
  useEffect(() => {
    if (open && !data.has(srcId)) void onLoad(srcId);
  }, [open, srcId, data, onLoad]);
  const groups = useMemo(() => {
    if (!src) return [];
    const needle = q.trim().toLowerCase();
    const rows = src.fighters
      .map((f) => ({ f, roles: rolesFor(own, src, f) }))
      .filter((r) => r.roles.length && (!needle || [r.f.name, ...r.f.runemarks, r.f.subfaction].some((s) => s.toLowerCase().includes(needle))));
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.f.subfaction || (r.f.runemarks.includes('hero') ? 'Герои' : 'Бойцы');
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    const order = (k: string) => (k === 'Герои' ? 0 : k === 'Бойцы' ? 1 : 2);
    return [...m].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));
  }, [src, own, q]);
  return (
    <Sheet open={open} onClose={onClose} title="Боец" tall>
      <div className="space-y-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: own.id, name: own.name, generic: false }, ...sources].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => (haptic.select(), setSrcId(s.id))}
              className={cx('shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold', srcId === s.id ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-fg-3')}
            >
              {s.id === own.id ? 'Своя фракция' : s.generic ? 'Союзники, траллы, монстры' : s.name}
            </button>
          ))}
        </div>
        <SearchField value={q} onChange={setQ} placeholder="Поиск: имя или рунмарка" />
        {!src ? (
          <div className="mx-auto my-8 size-6 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
        ) : !groups.length ? (
          <p className="text-sm text-fg-3">Нет бойцов, которых можно взять в эту варбанду.</p>
        ) : (
          groups.map(([group, list]) => (
            <div key={group}>
              <SectionTitle>{group}</SectionTitle>
              <ul className="space-y-1.5">
                {list.map(({ f, roles }) => {
                  const taken = roster.fighters.filter((x) => x.factionId === src.id && x.fighterId === f.id).length;
                  return (
                    <li key={f.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight">{f.name}</span>
                        {taken > 0 && <Tag tone="accent">×{taken}</Tag>}
                        <span className="font-display text-[17px] font-semibold tabular-nums">{f.points}</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                        {FIGHTER_STATS(f)
                          .slice(0, 3)
                          .map((s) => (
                            <span key={s.label} className="rounded-md bg-black/25 py-0.5">
                              <span className="block text-[12px] font-semibold uppercase text-fg-3">{s.label}</span>
                              <span className="font-display block text-[14px] font-semibold leading-tight">{s.value}</span>
                            </span>
                          ))}
                      </div>
                      {f.runemarks.length > 0 && <p className="mt-1 truncate text-[12px] capitalize text-fg-3">{f.runemarks.join(' · ')}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {roles.map((role) => (
                          <Button key={role} className="h-8 px-3 text-xs" onClick={() => onAdd(addFighter(roster, src.id, f, role))}>
                            <Icon name="plus" className="size-3.5" /> {role === 'warband' ? 'Добавить' : ROLE_LABEL[role]}
                          </Button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

function ExportSheet({ open, onClose, roster, data, points }: { open: boolean; onClose: () => void; roster: WarcryRoster; data: Map<string, WarcryFaction>; points: number }) {
  const [fmt, setFmt] = useState<'list' | 'code'>('list');
  const text = useMemo(() => {
    if (!open) return '';
    if (fmt === 'code') return encodeWarcryRoster(roster);
    const own = data.get(roster.factionId);
    const lines = [`${roster.name} — ${own?.name ?? roster.factionId} (Warcry, ${points} pts)`, ''];
    roster.fighters.forEach((x, i) => {
      const f = fighterOf(data, x);
      const label = x.name ? `${x.name} (${f?.name ?? x.fighterId})` : (f?.name ?? x.fighterId);
      const tags = [i === 0 ? 'Leader' : '', x.role !== 'warband' ? x.role : '', x.group ? GROUP_LABEL[x.group] : ''].filter(Boolean);
      lines.push(`${i + 1}. ${label} — ${f?.points ?? '?'} pts${tags.length ? ` [${tags.join(', ')}]` : ''}`);
    });
    lines.push('', 'Created with WarpHub WarpBuilder (data: warcry_data)');
    return lines.join('\n');
  }, [open, fmt, roster, data, points]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* буфер обмена недоступен — остаётся «Поделиться» */
    }
    haptic.ok();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Экспорт"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" className="h-12" onClick={() => void copy()}>
            <Icon name="copy" /> Копировать
          </Button>
          <Button className="h-12" onClick={() => shareText(text)}>
            <Icon name="share" /> Поделиться
          </Button>
        </div>
      }
    >
      <Segmented
        className="mb-2"
        value={fmt}
        onChange={setFmt}
        options={[
          { value: 'list', label: 'Список' },
          { value: 'code', label: 'Код WC1.' },
        ]}
      />
      <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-white/80">{text}</pre>
    </Sheet>
  );
}
