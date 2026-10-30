import { useEffect, useMemo, useState } from 'react';
import { loadKtTeam } from '../../data';
import { addOperative, checkKtRoster, compositionTotal, encodeKtRoster, ktTeamGroup, removeOperative, toggleEquipment, touchKt, updateOperative, type KtRoster, type KtRosterOp } from '../../kt/roster';
import type { KtIndex, KtOperative, KtTeam, KtWeapon } from '../../kt/types';
import { confirmAsk, haptic, openExternal, shareText } from '../../telegram';
import { Button, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { CostBadge, DataCard, EditorHeader, HeaderStat, RuleCard, SectionTitle } from '../common/BuilderKit';
import { Md } from './Md';

type Tab = 'ops' | 'rules' | 'ploys' | 'equip';

/**
 * Редактор команды Kill Team (W3, вид R1 30.10.2026 — как AoS и датакарты Wahapedia): шапка со счётом и проверкой,
 * блок команды, датакарты оперативников, правила фракции (один раз, а не в каждой карточке), уловки, снаряжение.
 */
export function KtEditor({ roster, index, onBack, onChange, onDelete }: { roster: KtRoster; index: KtIndex; onBack: () => void; onChange: (r: KtRoster) => void; onDelete: () => void }) {
  const [team, setTeam] = useState<KtTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadKtTeam(roster.teamId).then(setTeam, (e) => setError(String(e?.message ?? e)));
  }, [roster.teamId]);
  const issues = useMemo(() => (team ? checkKtRoster(roster, team) : []), [roster, team]);
  useEffect(() => {
    if (!team) return;
    const s = { operatives: roster.operatives.length, errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length };
    const o = roster.summary;
    if (!o || o.operatives !== s.operatives || o.errors !== s.errors || o.warnings !== s.warnings) onChange({ ...roster, summary: s });
  }, [team, issues, roster, onChange]);
  const [tab, setTab] = useState<Tab>('ops');
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // правила фракции повторяются в каждом оперативнике источника — показываются один раз во вкладке «Правила»
  const factionRules = useMemo(() => {
    if (!team) return [];
    const seen = new Map<string, KtOperative['abilities'][number]>();
    for (const o of team.operatives) for (const a of o.abilities) if (a.factionRule && !seen.has(a.name)) seen.set(a.name, a);
    return [...seen.values()];
  }, [team]);

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <p className="text-sm text-fg-3">{error}</p>
        <Button className="mt-4" onClick={onBack}>
          Назад
        </Button>
      </div>
    );
  if (!team) return <div className="mx-auto mt-24 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const opOf = (x: KtRosterOp) => team.operatives.find((o) => o.id === x.opTypeId);
  const total = compositionTotal(team.composition);
  const meta = index.teams.find((t) => t.id === team.id);
  const leader = roster.operatives.some((x) => opOf(x)?.keywords.includes('LEADER'));
  const ploys = team.ploys.filter((p) => p.type !== 'rule');
  const teamRules = team.ploys.filter((p) => p.type === 'rule');

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
      <EditorHeader
        name={roster.name}
        onName={(name) => onChange(touchKt({ ...roster, name: name.slice(0, 80) }))}
        onBack={onBack}
        actions={
          <>
            <IconButton icon="share" label="Экспорт" onClick={() => setExporting(true)} className="size-9" />
            <IconButton icon="more" label="Меню" onClick={() => setMenu(true)} className="size-9" />
          </>
        }
        big={roster.operatives.length}
        bigLimit={total}
        bigUnit={total == null ? 'оперативн.' : undefined}
        stats={
          <>
            <HeaderStat label="Лидер" value={leader ? '✓' : '—'} bad={!leader && roster.operatives.length > 0} />
            <HeaderStat label="Снаряж." value={String(roster.equipment.length)} />
          </>
        }
        issues={issues}
      />

      <div className="space-y-4 px-4 pt-4">
        {/* ---- команда ---- */}
        <section className="rounded-2xl border border-white/10 bg-app-elevated">
          <button type="button" onClick={() => setTeamOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">Kill Team · {meta ? ktTeamGroup(index, meta) : team.factionId}</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{team.name}</p>
              {team.archetypes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {team.archetypes.map((a) => (
                    <Tag key={a}>{a}</Tag>
                  ))}
                </div>
              )}
            </div>
            <Icon name="down" className={cx('size-5 shrink-0 text-fg-3 transition', teamOpen && 'rotate-180')} />
          </button>
          {teamOpen && (
            <div className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3">
              {team.description && <Md text={team.description} className="text-[12.5px] italic leading-snug text-fg-2" />}
              <div>
                <SectionTitle>Состав команды</SectionTitle>
                {team.composition ? <Md text={team.composition} className="text-[12.5px] leading-snug text-fg-2" /> : <p className="text-sm text-fg-3">Нет данных о составе.</p>}
              </div>
              <p className="text-[12px] text-fg-3">
                Данные: {index.source.name}, {index.source.date} ({index.source.commit}).
              </p>
            </div>
          )}
        </section>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ops', label: 'Оперативники' },
            { value: 'rules', label: 'Правила' },
            { value: 'ploys', label: 'Уловки' },
            { value: 'equip', label: 'Снаряж.' },
          ]}
        />

        {tab === 'ops' && (
          <section className="space-y-2.5">
            {!roster.operatives.length && <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-fg-3">Добавьте оперативников — первым обычно идёт лидер.</p>}
            {roster.operatives.map((x, n) => {
              const o = opOf(x);
              return o ? (
                <OpCard
                  key={x.uid}
                  n={n + 1}
                  x={x}
                  o={o}
                  open={expanded === x.uid}
                  onToggle={() => setExpanded((e) => (e === x.uid ? null : x.uid))}
                  onChange={(p) => onChange(updateOperative(roster, x.uid, p))}
                  onRemove={() => onChange(removeOperative(roster, x.uid))}
                />
              ) : (
                <div key={x.uid} className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Нет в данных: {x.opTypeId}
                  <Button variant="danger" className="text-xs" onClick={() => onChange(removeOperative(roster, x.uid))}>
                    Убрать
                  </Button>
                </div>
              );
            })}
            <Button variant="primary" className="h-12 w-full" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Добавить оперативника
            </Button>
          </section>
        )}

        {tab === 'rules' && (
          <section className="space-y-4">
            <div>
              <SectionTitle>Правила фракции</SectionTitle>
              <div className="space-y-1.5">
                {factionRules.map((a) => (
                  <RuleCard key={a.id} name={a.name} badge={a.ap != null ? <CostBadge>{a.ap} AP</CostBadge> : undefined}>
                    <Md text={a.text} className="text-[12.5px] leading-relaxed text-fg-2" />
                  </RuleCard>
                ))}
                {teamRules.map((p) => (
                  <RuleCard key={p.id} name={p.name}>
                    <Md text={p.text} className="text-[12.5px] leading-relaxed text-fg-2" />
                  </RuleCard>
                ))}
                {!factionRules.length && !teamRules.length && <p className="text-sm text-fg-3">В данных нет правил фракции.</p>}
              </div>
            </div>
            <WeaponRules index={index} />
          </section>
        )}

        {tab === 'ploys' && (
          <section className="space-y-4">
            {(['strategy', 'firefight'] as const).map((type) => {
              const list = ploys.filter((p) => p.type === type);
              if (!list.length) return null;
              return (
                <div key={type}>
                  <SectionTitle>{type === 'strategy' ? 'Стратегические уловки' : 'Боевые уловки'}</SectionTitle>
                  <div className="space-y-1.5">
                    {list.map((p) => (
                      <RuleCard key={p.id} name={p.name} badge={<CostBadge tone={type === 'strategy' ? 'accent' : 'warn'}>{type === 'strategy' ? 'Strategy' : 'Firefight'}</CostBadge>}>
                        <Md text={p.text} className="text-[12.5px] leading-relaxed text-fg-2" />
                      </RuleCard>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-[12px] text-fg-3">Стоимость уловок в CP в данных источника не записана — смотрите правила редакции.</p>
          </section>
        )}

        {tab === 'equip' && (
          <section className="space-y-2">
            {!team.equipment.length && <p className="text-sm text-fg-3">В данных нет снаряжения этой команды.</p>}
            {team.equipment.map((e) => {
              const on = roster.equipment.includes(e.id);
              return (
                <div key={e.id} className={cx('overflow-hidden rounded-2xl border', on ? 'border-accent/50 bg-accent/[0.06]' : 'border-white/10 bg-app-elevated')}>
                  <button type="button" onClick={() => (haptic.select(), onChange(toggleEquipment(roster, e.id)))} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                    <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-accent bg-accent text-black' : 'border-white/30')}>{on && <Icon name="check" className="size-3.5" />}</span>
                    <span className="min-w-0 flex-1 text-[14px] font-semibold">{e.name}</span>
                    {on && <Tag tone="accent">Взято</Tag>}
                  </button>
                  <div className="border-t border-white/[0.06] px-3.5 py-2">
                    <Md text={e.text} className="text-[12.5px] leading-relaxed text-fg-2" />
                  </div>
                </div>
              );
            })}
            <p className="text-[12px] text-fg-3">Лимит снаряжения в данных источника не записан — смотрите правила редакции.</p>
          </section>
        )}
      </div>

      <AddSheet open={adding} team={team} roster={roster} onClose={() => setAdding(false)} onAdd={(o) => (haptic.tap(), onChange(addOperative(roster, o)), setAdding(false))} />
      <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} team={team} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Команда">
        <div className="space-y-2 pb-2">
          <Button className="w-full justify-start" onClick={() => openExternal('https://wahapedia.ru/kill-team3/')}>
            <Icon name="book" /> Правила Kill Team на Wahapedia
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={async () => {
              if (await confirmAsk(`Удалить команду «${roster.name}»?`)) onDelete();
            }}
          >
            <Icon name="trash" /> Удалить команду
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

const OP_STATS = (o: KtOperative) => [
  { label: 'APL', value: o.stats.apl },
  { label: 'Move', value: o.stats.move },
  { label: 'Save', value: o.stats.save },
  { label: 'Wounds', value: o.stats.wounds },
];

/** Датакарта оперативника: характеристики, выбранное оружие таблицей; раскрытая — всё оружие, способности, имя. */
function OpCard({
  n,
  x,
  o,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  n: number;
  x: KtRosterOp;
  o: KtOperative;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<KtRosterOp>) => void;
  onRemove: () => void;
}) {
  const chosen = o.weapons.filter((w) => x.weapons.includes(w.id));
  const toggle = (w: KtWeapon) => (haptic.select(), onChange({ weapons: x.weapons.includes(w.id) ? x.weapons.filter((id) => id !== w.id) : [...x.weapons, w.id] }));
  const leader = o.keywords.includes('LEADER');
  const own = o.abilities.filter((a) => !a.factionRule);
  return (
    <DataCard
      title={x.name || o.name}
      subtitle={x.name ? o.name : o.keywords.filter((k) => k !== 'LEADER').join(' · ')}
      highlight={leader}
      right={<span className="font-display text-lg font-semibold leading-none text-fg-3">#{n}</span>}
      badges={
        <>
          {leader && <Tag tone="accent">Лидер</Tag>}
          {own.length > 0 && <Tag>{own.length} способн.</Tag>}
        </>
      }
      stats={OP_STATS(o)}
      open={open}
      onToggle={onToggle}
      summary={!open && <WeaponTable list={chosen} empty="Оружие не выбрано — раскройте карточку" />}
    >
      <div>
        <SectionTitle>Оружие · отметьте выбранное</SectionTitle>
        <WeaponTable list={o.weapons} chosen={x.weapons} onToggle={toggle} />
      </div>
      {own.length > 0 && (
        <div>
          <SectionTitle>Способности</SectionTitle>
          <div className="space-y-1.5">
            {own.map((a) => (
              <RuleCard key={a.id} name={a.name} badge={a.ap != null ? <CostBadge>{a.ap} AP</CostBadge> : undefined}>
                <Md text={a.text} className="text-[12.5px] leading-relaxed text-fg-2" />
              </RuleCard>
            ))}
          </div>
        </div>
      )}
      {o.options.length > 0 && (
        <div>
          <SectionTitle>Опции</SectionTitle>
          <div className="space-y-1.5">
            {o.options.map((a) => (
              <RuleCard key={a.id} name={a.name}>
                <Md text={a.text} className="text-[12.5px] leading-relaxed text-fg-2" />
              </RuleCard>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {o.keywords.map((k) => (
          <Tag key={k}>{k}</Tag>
        ))}
      </div>
      <input
        value={x.name}
        onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
        placeholder="Своё имя оперативника"
        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-fg-3 focus:border-accent"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-fg-3">Подставка: {o.baseMm ? `${o.baseMm} мм` : 'нет данных'}</span>
        <Button variant="danger" className="text-xs" onClick={onRemove}>
          <Icon name="trash" /> Убрать
        </Button>
      </div>
    </DataCard>
  );
}

/** Значок типа оружия (как на Wahapedia: стрелковое / ближний бой). */
function WeaponIcon({ type }: { type: KtWeapon['type'] }) {
  if (type === 'melee')
    return (
      <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-accent" aria-label="Ближний бой">
        <path d="M3 17 L13 7 M11 5 L15 9 M13 7 L17 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-accent" aria-label={type === 'ranged' ? 'Стрелковое' : 'Снаряжение'}>
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M10 1 V6 M10 14 V19 M1 10 H6 M14 10 H19" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Оружие таблицей, как на датакарте Wahapedia: строка названия со значком, под ней ATK · HIT · DMG и правила (WR).
 * onToggle — режим выбора (отметки слева).
 */
function WeaponTable({ list, chosen, onToggle, empty }: { list: KtWeapon[]; chosen?: string[]; onToggle?: (w: KtWeapon) => void; empty?: string }) {
  if (!list.length) return <p className="text-[12px] text-fg-3">{empty ?? 'Нет оружия'}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <div className="grid grid-cols-[1fr_2.5rem_2.5rem_2.75rem] gap-x-1 bg-white/[0.05] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide text-fg-3">
        <span>Оружие</span>
        <span className="text-center">ATK</span>
        <span className="text-center">HIT</span>
        <span className="text-center">DMG</span>
      </div>
      {list.map((w) => {
        const on = chosen?.includes(w.id);
        return (
          <button
            key={w.id}
            type="button"
            disabled={!onToggle}
            onClick={() => onToggle?.(w)}
            className={cx('block w-full border-t border-white/[0.06] px-2.5 py-1.5 text-left', onToggle && !on && 'opacity-55', onToggle && 'active:bg-white/5')}
          >
            <span className="flex items-center gap-1.5">
              {onToggle && <span className={cx('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-black' : 'border-white/30')}>{on && <Icon name="check" className="size-3" />}</span>}
              <WeaponIcon type={w.type} />
              <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">{w.name}</span>
            </span>
            {w.profiles.map((p, i) => (
              <span key={i} className="mt-0.5 grid grid-cols-[1fr_2.5rem_2.5rem_2.75rem] gap-x-1 text-[12.5px] tabular-nums">
                <span className="min-w-0 pl-[1.375rem] text-[12px] leading-snug text-fg-3">
                  {p.name && <b className="text-fg-2">{p.name}</b>}
                  {p.name && p.rules ? ' · ' : ''}
                  {p.rules}
                </span>
                <span className="text-center text-white/85">{p.atk}</span>
                <span className="text-center text-white/85">{p.hit}</span>
                <span className="text-center text-white/85">{p.dmg}</span>
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}

/** Справочник правил оружия (WR) — свёрнут. */
function WeaponRules({ index }: { index: KtIndex }) {
  const [open, setOpen] = useState(false);
  if (!index.weaponRules.length) return null;
  return (
    <div>
      <SectionTitle
        right={
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] font-semibold text-accent">
            {open ? 'Скрыть' : 'Показать'}
          </button>
        }
      >
        Правила оружия (WR)
      </SectionTitle>
      {open && (
        <div className="space-y-1.5">
          {index.weaponRules.map((r) => (
            <RuleCard key={r.code} name={r.name} sub={r.code}>
              <Md text={r.text} className="text-[12.5px] leading-relaxed text-fg-2" />
            </RuleCard>
          ))}
        </div>
      )}
    </div>
  );
}

/** Добавление оперативника: лидеры сверху, у каждого — характеристики и число уже взятых. */
function AddSheet({ open, team, roster, onClose, onAdd }: { open: boolean; team: KtTeam; roster: KtRoster; onClose: () => void; onAdd: (o: KtOperative) => void }) {
  const leaders = team.operatives.filter((o) => o.keywords.includes('LEADER'));
  const others = team.operatives.filter((o) => !o.keywords.includes('LEADER'));
  const row = (o: KtOperative) => {
    const count = roster.operatives.filter((x) => x.opTypeId === o.id).length;
    return (
      <li key={o.id}>
        <button type="button" onClick={() => onAdd(o)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight">{o.name}</span>
            {count > 0 && <Tag tone="accent">×{count}</Tag>}
            <Icon name="plus" className="size-4 text-accent" />
          </span>
          <span className="mt-1.5 grid grid-cols-4 gap-1 text-center">
            {OP_STATS(o).map((s) => (
              <span key={s.label} className="rounded-md bg-black/25 py-0.5">
                <span className="block text-[12px] font-semibold uppercase text-fg-3">{s.label}</span>
                <span className="font-display block text-[14px] font-semibold leading-tight">{s.value}</span>
              </span>
            ))}
          </span>
          <span className="mt-1 block truncate text-[12px] text-fg-3">{o.weapons.map((w) => w.name).join(', ')}</span>
        </button>
      </li>
    );
  };
  return (
    <Sheet open={open} onClose={onClose} title="Оперативник" tall>
      <div className="space-y-4">
        {leaders.length > 0 && (
          <div>
            <SectionTitle>Лидер</SectionTitle>
            <ul className="space-y-1.5">{leaders.map(row)}</ul>
          </div>
        )}
        <div>
          <SectionTitle>Оперативники</SectionTitle>
          <ul className="space-y-1.5">{others.map(row)}</ul>
        </div>
      </div>
    </Sheet>
  );
}

function ExportSheet({ open, onClose, roster, team }: { open: boolean; onClose: () => void; roster: KtRoster; team: KtTeam }) {
  const [fmt, setFmt] = useState<'list' | 'code'>('list');
  const text = useMemo(() => {
    if (!open) return '';
    if (fmt === 'code') return encodeKtRoster(roster);
    const lines = [`${roster.name} — ${team.name} (Kill Team)`, ''];
    roster.operatives.forEach((x, i) => {
      const o = team.operatives.find((y) => y.id === x.opTypeId);
      const ws = o?.weapons.filter((w) => x.weapons.includes(w.id)).map((w) => w.name) ?? [];
      lines.push(`${i + 1}. ${x.name ? `${x.name} (${o?.name ?? x.opTypeId})` : (o?.name ?? x.opTypeId)}${ws.length ? ` — ${ws.join(', ')}` : ''}`);
    });
    const eq = team.equipment.filter((e) => roster.equipment.includes(e.id)).map((e) => e.name);
    if (eq.length) lines.push('', `Снаряжение: ${eq.join(', ')}`);
    lines.push('', 'Created with WarpHub WarpBuilder (data: KTDash)');
    return lines.join('\n');
  }, [open, fmt, roster, team]);
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
          { value: 'code', label: 'Код KT1.' },
        ]}
      />
      <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-white/80">{text}</pre>
    </Sheet>
  );
}
