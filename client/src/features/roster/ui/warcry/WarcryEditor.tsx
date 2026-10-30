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
import type { WarcryAbility, WarcryFaction, WarcryFighter, WarcryIndex } from '../../warcry/types';
import { confirmAsk, haptic, shareText } from '../../telegram';
import { Button, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';

type Tab = 'fighters' | 'groups' | 'rules';
const COST: Record<string, string> = { double: 'Double', triple: 'Triple', quad: 'Quad', reaction: 'Reaction', passive: 'Passive', battletrait: 'Battle trait' };

/** Редактор варбанды Warcry (W5 30.10.2026): бойцы (свои, союзники, траллы, монстр), группы, правила и проверка построения. */
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

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <p className="text-sm text-white/55">{error}</p>
        <Button className="mt-4" onClick={onBack}>
          Назад
        </Button>
      </div>
    );
  if (!own || !ready) return <div className="mx-auto mt-24 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const heroes = roster.fighters.filter((x) => fighterOf(data, x)?.runemarks.includes('hero')).length;
  const battletraits = own.abilities.filter((a) => a.cost === 'battletrait');

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-3xl lg:pt-8">
      <header className="mb-3 flex items-start gap-3">
        <IconButton icon="back" label="К списку" onClick={onBack} className="mt-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-accent">Warcry · {own.name}</p>
          <input
            value={roster.name}
            onChange={(e) => onChange(touchWarcry({ ...roster, name: e.target.value.slice(0, 80) }))}
            className="font-display mt-1 w-full bg-transparent text-2xl font-semibold uppercase leading-none outline-none"
            aria-label="Название варбанды"
          />
          <p className="mt-1 text-[11px] tabular-nums text-white/45">
            <span className={cx(points > WARCRY_LIMITS.points && 'text-danger')}>
              {points} / {WARCRY_LIMITS.points} очк.
            </span>{' '}
            · бойцов {roster.fighters.length} / {WARCRY_LIMITS.maxFighters} · героев {heroes}
          </p>
        </div>
        <IconButton icon="share" label="Экспорт" onClick={() => setExporting(true)} className="size-9" />
        <IconButton icon="more" label="Меню" onClick={() => setMenu(true)} className="size-9" />
      </header>
      {issues.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {issues.map((i, k) => (
            <li key={k} className={cx('flex gap-2 text-[12.5px]', i.level === 'error' ? 'text-danger' : 'text-warn')}>
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              {i.message}
            </li>
          ))}
        </ul>
      )}
      <Segmented
        className="mb-3"
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
          {roster.fighters.map((x, n) => {
            const f = fighterOf(data, x);
            return f ? (
              <FighterCard
                key={x.uid}
                leader={n === 0}
                x={x}
                f={f}
                src={data.get(x.factionId)}
                own={own}
                universal={index.universal}
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
          <p className="text-[11px] text-white/35">Лидер — первый боец: герой своей фракции, не союзник.</p>
        </section>
      )}
      {tab === 'groups' && (
        <section className="space-y-3">
          <Button className="w-full" onClick={() => (haptic.select(), onChange(autoGroups(roster)))}>
            Распределить автоматически
          </Button>
          {WARCRY_GROUPS.map((g) => {
            const list = roster.fighters.filter((x) => x.group === g);
            return (
              <div key={g} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  {GROUP_LABEL[g]} · {list.length}
                </p>
                {!list.length && <p className="text-[12px] text-white/35">Пусто</p>}
                {list.map((x) => (
                  <GroupRow key={x.uid} x={x} name={x.name || fighterOf(data, x)?.name || x.fighterId} onGroup={(group) => onChange(updateFighter(roster, x.uid, { group }))} />
                ))}
              </div>
            );
          })}
          {roster.fighters.some((x) => !x.group) && (
            <div className="rounded-2xl border border-warn/30 bg-warn/5 p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-warn">Без группы</p>
              {roster.fighters
                .filter((x) => !x.group)
                .map((x) => (
                  <GroupRow key={x.uid} x={x} name={x.name || fighterOf(data, x)?.name || x.fighterId} onGroup={(group) => onChange(updateFighter(roster, x.uid, { group }))} />
                ))}
            </div>
          )}
          <p className="text-[11px] text-white/35">Бойцы — как можно ровнее по трём группам; монстр — один в своей группе, остальные ровно по двум другим.</p>
        </section>
      )}
      {tab === 'rules' && (
        <section className="space-y-3">
          <AbilityList title="Боевые черты фракции" list={battletraits} empty="В данных нет боевых черт фракции." />
          <AbilityList title="Универсальные способности" list={index.universal} />
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[12.5px] leading-snug text-white/75">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Построение варбанды</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                {WARCRY_LIMITS.minFighters}–{WARCRY_LIMITS.maxFighters} бойцов, не больше {WARCRY_LIMITS.points} очков.
              </li>
              <li>Первый боец — герой и лидер; не больше {WARCRY_LIMITS.heroes} героев (с героями-союзниками).</li>
              <li>
                Союзники (Hero или Ally другой фракции альянса) — до {WARCRY_LIMITS.allies}, траллы — до {WARCRY_LIMITS.thralls}, монстр — {WARCRY_LIMITS.monsters}.
              </li>
              <li>Бойцы Bladeborn — по одному; герой-Bladeborn союзником открывает своих спутников вне лимита союзников.</li>
              {own.heroesAll && <li>«Heroes All»: героев своей фракции — без лимита, героев других фракций — до {WARCRY_LIMITS.heroesAllOther}.</li>}
            </ul>
            <p className="mt-2 text-[11px] text-white/40">Источник правил: warcrier.net (The Warbands; Allies, Thralls and Monsters; Bladeborn; страницы фракций).</p>
          </div>
          <p className="text-[11px] text-white/35">
            Данные: {index.source.name}, {index.source.date} ({index.source.commit}). Тексты способностей — английский оригинал.
          </p>
        </section>
      )}

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

function GroupRow({ x, name, onGroup }: { x: WarcryRosterFighter; name: string; onGroup: (g: WarcryRosterFighter['group']) => void }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {name}
        {x.role !== 'warband' && <span className="ml-1 text-[11px] text-white/40">· {ROLE_LABEL[x.role].toLowerCase()}</span>}
      </span>
      <div className="flex gap-1">
        {WARCRY_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => (haptic.select(), onGroup(g))}
            className={cx('rounded-lg border px-2 py-1 text-[11px] font-semibold', x.group === g ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-white/50')}
          >
            {GROUP_LABEL[g][0]}
          </button>
        ))}
      </div>
    </div>
  );
}

const STAT = (label: string, v: string | number) => (
  <div className="rounded-lg bg-white/[0.04] px-1 py-1 text-center">
    <p className="text-[9.5px] font-semibold uppercase text-white/40">{label}</p>
    <p className="font-display text-[16px] font-semibold leading-tight">{v}</p>
  </div>
);

function FighterCard({
  leader,
  x,
  f,
  src,
  own,
  universal,
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
  onChange: (p: Partial<Pick<WarcryRosterFighter, 'name' | 'group'>>) => void;
  onLeader: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const abilities = useMemo(() => (open ? abilitiesFor(src, f) : []), [open, src, f]);
  const univ = useMemo(() => (open ? universalFor(universal, f) : []), [open, universal, f]);
  return (
    <div className={cx('rounded-2xl border p-3', leader ? 'border-accent/40 bg-accent/[0.04]' : 'border-white/10 bg-white/[0.03]')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{x.name || f.name}</p>
          {x.name && <p className="text-[11px] text-white/45">{f.name}</p>}
          <p className="mt-1 flex flex-wrap gap-1">
            {leader && <Tag tone="accent">Лидер</Tag>}
            {x.role !== 'warband' && <Tag tone="warn">{ROLE_LABEL[x.role]}</Tag>}
            {src && src.id !== own.id && !src.generic && <Tag>{src.name}</Tag>}
            {f.subfaction && <Tag>{f.subfaction}</Tag>}
            {x.group && <Tag>{GROUP_LABEL[x.group]}</Tag>}
          </p>
          {f.runemarks.length > 0 && <p className="mt-1 truncate text-[10.5px] text-white/40">{f.runemarks.join(', ')}</p>}
        </div>
        <IconButton icon={open ? 'down' : 'chevron'} label="Подробнее" onClick={() => setOpen((v) => !v)} className="size-8" />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {STAT('Move', f.movement)}
        {STAT('Tough', f.toughness)}
        {STAT('Wounds', f.wounds)}
        {STAT('Очки', f.points)}
      </div>
      <ul className="mt-2 space-y-0.5">
        {f.weapons.map((w, i) => (
          <li key={i} className="text-[11.5px] tabular-nums text-white/70">
            <b className="text-white/85">{w.runemark || 'оружие'}</b> · Range {w.minRange ? `${w.minRange}-` : ''}
            {w.maxRange}" · Attacks {w.attacks} · Str {w.strength} · Dmg {w.dmgHit}/{w.dmgCrit}
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            value={x.name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
            placeholder="Своё имя бойца"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <AbilityList title="Способности" list={abilities} empty="Нет способностей фракции для рунмарок этого бойца." />
          <AbilityList title="Универсальные" list={univ} collapsed />
          <div className="grid grid-cols-2 gap-2">
            {!leader && (
              <Button className="text-xs" onClick={onLeader}>
                Сделать лидером
              </Button>
            )}
            <Button variant="danger" className={cx('text-xs', leader && 'col-span-2')} onClick={onRemove}>
              <Icon name="trash" /> Убрать
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AbilityList({ title, list, empty, collapsed }: { title: string; list: WarcryAbility[]; empty?: string; collapsed?: boolean }) {
  if (!list.length) return empty ? <p className="text-[12px] text-white/45">{empty}</p> : null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</p>
      <div className="space-y-1.5">
        {list.map((a) => (
          <details key={a.id} open={!collapsed} className="rounded-xl bg-black/20 px-3 py-2">
            <summary className="cursor-pointer text-[13px] font-semibold">
              <span className="mr-1 text-[10.5px] font-semibold uppercase text-accent">[{COST[a.cost] ?? a.cost}]</span>
              {a.name}
              {a.subfaction && <span className="ml-1 text-[11px] font-normal text-white/45">· {a.subfaction}</span>}
              {a.runemarks.length > 0 && <span className="ml-1 text-[11px] font-normal text-white/45">· {a.runemarks.join(', ')}</span>}
            </summary>
            <p className="mt-1 whitespace-pre-line text-[12.5px] leading-snug text-white/75">{a.text}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

/** Добавление бойца: своя фракция; союзники, траллы и монстры — общий файл альянса и другие фракции альянса. */
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
  const sources = useMemo(() => index.factions.filter((f) => f.grandAlliance === own.grandAlliance && f.id !== own.id), [index, own]);
  const [srcId, setSrcId] = useState(own.id);
  const src = data.get(srcId);
  useEffect(() => {
    if (open && !data.has(srcId)) void onLoad(srcId);
  }, [open, srcId, data, onLoad]);
  const rows = useMemo(() => (src ? src.fighters.map((f) => ({ f, roles: rolesFor(own, src, f) })).filter((r) => r.roles.length) : []), [src, own]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.f.subfaction, [...(m.get(r.f.subfaction) ?? []), r]);
    return [...m];
  }, [rows]);
  return (
    <Sheet open={open} onClose={onClose} title="Боец" tall>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[{ id: own.id, name: own.name, generic: false }, ...sources].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => (haptic.select(), setSrcId(s.id))}
            className={cx('rounded-full border px-2.5 py-1 text-[11.5px] font-semibold', srcId === s.id ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-white/55')}
          >
            {s.id === own.id ? 'Своя фракция' : s.generic ? 'Союзники, траллы, монстры альянса' : s.name}
          </button>
        ))}
      </div>
      {!src ? (
        <div className="mx-auto my-8 size-6 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      ) : !rows.length ? (
        <p className="text-sm text-white/50">Нет бойцов, которых можно взять в эту варбанду.</p>
      ) : (
        groups.map(([sub, list]) => (
          <div key={sub} className="mb-3">
            {sub && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{sub}</p>}
            <ul className="space-y-1.5">
              {list.map(({ f, roles }) => {
                const count = roster.fighters.filter((x) => x.factionId === src.id && x.fighterId === f.id).length;
                return (
                  <li key={f.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold">{f.name}</span>
                      {count > 0 && <Tag tone="accent">×{count}</Tag>}
                      <span className="text-[12px] tabular-nums text-white/60">{f.points}</span>
                    </div>
                    <p className="text-[11px] text-white/45">
                      Move {f.movement} · Tough {f.toughness} · Wounds {f.wounds}
                      {f.runemarks.length ? ` · ${f.runemarks.join(', ')}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
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
      <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11.5px] text-white/80">{text}</pre>
    </Sheet>
  );
}
