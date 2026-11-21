import { photoKey } from '../../photos';
import type { PhotoItem } from '../../photoList';
import { PhotoStrip, RosterPhotos } from '../common/UnitPhoto';
import { useEffect, useMemo, useState } from 'react';
import { loadKtTeam } from '../../data';
import { uid } from '../../engine/roster';
import { addBlockReason, structureOf } from '../../kt/composition';
import { addOperative, checkKtRoster, encodeKtRoster, isLeaderOperative, ktTeamGroup, ktTeamTotal, nextWeaponsForToggle, removeOperative, rosterSelectionCount, toggleEquipment, touchKt, updateOperative, type KtRoster, type KtRosterOp } from '../../kt/roster';
import type { KtIndex, KtOperative, KtTeam, KtWeapon } from '../../kt/types';
import { confirmAsk, haptic, openExternal, shareText } from '../../telegram';
import { Button, Empty, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { AddRow, ArmyBlock, ControlRow, CostBadge, DatasheetBlock, EditorHeader, GroupHeading, HeaderStat, PickRow, RuleCard, RulesPanel, SectionTitle, StatTiles, UnitRowCard, type BuilderIssue } from '../common/BuilderKit';
import { Md } from './Md';
import { RuleTrigger } from '../common/RulePopover';
import { ktRuleIndex, ktWeaponRuleTokens } from '../../kt/weaponRules';


/**
 * Редактор команды Kill Team (W3; вид 07.11.2026 — из тех же блоков, что AoS и 40K): шапка со счётом и проверкой,
 * блок команды (снаряжение — строкой выбора), панели правил и уловок, оперативники одной группой — карточки как у юнитов AoS.
 */
export function KtEditor({
  roster,
  index,
  onBack,
  onStartGame,
  onTestArmy,
  onChange,
  onDuplicate,
  onDelete,
  viewOnly = false,
}: {
  roster: KtRoster;
  index: KtIndex;
  onBack: () => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  onChange: (r: KtRoster) => void;
  onDuplicate: (r: KtRoster) => void;
  onDelete: () => void;
  /** только просмотр (режим мастера в игре, 07.11.2026): без переключения в редактирование, меню и нижней панели */
  viewOnly?: boolean;
}) {
  const [team, setTeam] = useState<KtTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    loadKtTeam(roster.teamId).then(setTeam, (e) => setError(String(e?.message ?? e)));
  }, [roster.teamId, attempt]);
  const issues = useMemo(() => (team ? checkKtRoster(roster, team) : []), [roster, team]);
  const findRule = useMemo(() => ktRuleIndex(index.weaponRules), [index]);
  useEffect(() => {
    if (!team || viewOnly) return;
    const s = { operatives: roster.operatives.length, errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length };
    const o = roster.summary;
    if (!o || o.operatives !== s.operatives || o.errors !== s.errors || o.warnings !== s.warnings) onChange({ ...roster, summary: s });
  }, [team, issues, roster, onChange, viewOnly]);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [teamOpen, setTeamOpen] = useState(roster.operatives.length === 0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ploysOpen, setPloysOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState(viewOnly);

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
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={onBack}>Назад</Button>
          <Button variant="primary" onClick={() => (setError(null), setAttempt((n) => n + 1))}>Повторить</Button>
        </div>
      </div>
    );
  if (!team) return <div className="mx-auto mt-24 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const opOf = (x: KtRosterOp) => team.operatives.find((o) => o.id === x.opTypeId);
  const total = ktTeamTotal(team);
  const hasWeights = Object.keys(structureOf(team)?.weights ?? {}).length > 0;
  const selections = rosterSelectionCount(roster, team);
  const meta = index.teams.find((t) => t.id === team.id);
  const leader = roster.operatives.some((x) => {
    const operative = opOf(x);
    return operative ? isLeaderOperative(team, operative) : false;
  });
  const ploys = team.ploys.filter((p) => p.type !== 'rule');
  const teamRules = team.ploys.filter((p) => p.type === 'rule');
  const scrollToOperative = (id: string) => {
    setExpanded(id);
    window.setTimeout(() => document.getElementById(`u-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  // фото команды (16.11.2026): оперативники по порядку
  const photoList: PhotoItem[] = roster.operatives.flatMap((x) => {
    const o = opOf(x);
    return o ? [{ key: photoKey('kt', o.id), name: x.name || o.name, sub: [x.name ? o.name : null, `APL ${o.stats.apl}`, `${o.stats.wounds} W`].filter(Boolean).join(' · '), uid: x.uid }] : [];
  });

  return (
    <RosterPhotos items={photoList} onOpenCard={(it) => it.uid && scrollToOperative(it.uid)} readOnly={view}>
      <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
        <EditorHeader
          name={roster.name}
          onName={(name) => onChange(touchKt({ ...roster, name: name.slice(0, 80) }))}
          onBack={onBack}
          actions={
            viewOnly ? undefined : (
            <>
              <IconButton
                icon={view ? 'edit' : 'eye'}
                label={view ? 'Редактировать' : 'Режим просмотра'}
                onClick={() => (setView((v) => !v), setExpanded(null), setAdding(false))}
                className={cx('size-9', view && 'bg-accent/15 text-accent')}
              />
              {!view && (
                <>
                  <IconButton icon="share" label="Экспорт" onClick={() => setExporting(true)} className="size-9" />
                  <IconButton icon="more" label="Меню" onClick={() => setMenu(true)} className="size-9" />
                </>
              )}
            </>
            )
          }
          big={selections}
          bigLimit={total}
          bigUnit={total == null || !hasWeights ? 'оперативн.' : 'выборов'}
          stats={
            <>
              <HeaderStat label="Лидер" value={leader ? '✓' : '—'} bad={!leader && roster.operatives.length > 0} />
              <HeaderStat label="Снаряж." value={String(roster.equipment.length)} />
            </>
          }
          issues={issues}
          readOnly={view}
          onOpenIssue={(issue) => issue.uids?.[0] && scrollToOperative(issue.uids[0])}
        />

        <div className="space-y-5 px-4 pt-4">
          {/* ---- команда (как блок армии AoS) ---- */}
          <ArmyBlock
            kicker={`Kill Team · ${meta ? ktTeamGroup(index, meta) : team.factionId}`}
            title={team.name}
            line={team.archetypes.join(' · ') || undefined}
            open={teamOpen}
            onToggle={() => setTeamOpen((o) => !o)}
          >
            {team.description && <Md text={team.description} className="text-[12.5px] italic leading-snug text-fg-2" />}
            <div>
              <SectionTitle>Состав команды</SectionTitle>
              {team.composition ? <Md text={team.composition} className="text-[12.5px] leading-snug text-fg-2" /> : <p className="text-sm text-fg-3">Нет данных о составе.</p>}
            </div>
            <PickRow
              label="Снаряжение команды"
              value={team.equipment.filter((e) => roster.equipment.includes(e.id)).map((e) => e.name).join(', ')}
              empty={team.equipment.length ? (view ? 'Не выбрано' : 'Выбрать') : 'Нет в данных'}
              right={roster.equipment.length > 0 ? <Tag>{roster.equipment.length}</Tag> : undefined}
              onClick={team.equipment.length ? () => setEquipOpen(true) : undefined}
            />
            <p className="text-[12px] text-fg-3">
              Данные: {index.source.name}, {index.source.date} ({index.source.commit}).
            </p>
          </ArmyBlock>

          {/* ---- правила и уловки (как панели лоров AoS) ---- */}
          <RulesPanel
            label={`Правила команды · ${factionRules.length + teamRules.length}`}
            line={[...factionRules.map((a) => a.name), ...teamRules.map((p) => p.name)].join(' · ') || 'Нет в данных'}
            open={rulesOpen}
            onToggle={() => setRulesOpen((o) => !o)}
          >
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
            <WeaponRules index={index} />
          </RulesPanel>
          {ploys.length > 0 && (
            <RulesPanel label={`Уловки · ${ploys.length}`} line={ploys.map((p) => p.name).join(' · ')} open={ploysOpen} onToggle={() => setPloysOpen((o) => !o)}>
              {(['strategy', 'firefight'] as const).map((type) => {
                const list = ploys.filter((p) => p.type === type);
                if (!list.length) return null;
                return (
                  <div key={type} className="space-y-1.5">
                    <SectionTitle>{type === 'strategy' ? 'Стратегические уловки' : 'Боевые уловки'}</SectionTitle>
                    {list.map((p) => (
                      <RuleCard key={p.id} name={p.name} badge={<CostBadge tone={type === 'strategy' ? 'accent' : 'warn'}>{type === 'strategy' ? 'Strategy' : 'Firefight'}</CostBadge>}>
                        <Md text={p.text} className="text-[12.5px] leading-relaxed text-fg-2" />
                      </RuleCard>
                    ))}
                  </div>
                );
              })}
              <p className="text-[12px] text-fg-3">Стоимость уловок в CP в данных источника не записана — смотрите правила редакции.</p>
            </RulesPanel>
          )}

          <PhotoStrip />

          {/* ---- оперативники (как полк AoS) ---- */}
          <section>
            <GroupHeading
              title="Оперативники"
              count={total == null ? roster.operatives.length : `${roster.operatives.length} моделей · ${selections}/${total} выборов`}
              right={<span className={cx('text-xs font-semibold', leader ? 'text-fg-3' : 'text-warn')}>{leader ? 'лидер есть' : roster.operatives.length ? 'нет лидера' : ''}</span>}
            />
            <div className="space-y-2">
              {!roster.operatives.length && <Empty title="Нет оперативников">Добавьте оперативников — первым обычно берут лидера команды.</Empty>}
              {roster.operatives.map((x, n) => {
                const o = opOf(x);
                return o ? (
                  <OpCard
                    key={x.uid}
                    n={n + 1}
                    x={x}
                    o={o}
                    team={team}
                    isLeader={isLeaderOperative(team, o)}
                    issues={issues.filter((i) => i.uids?.includes(x.uid))}
                    open={expanded === x.uid}
                    onToggle={() => setExpanded((e) => (e === x.uid ? null : x.uid))}
                    onChange={(p) => onChange(updateOperative(roster, x.uid, p))}
                    onRemove={() => onChange(removeOperative(roster, x.uid))}
                    readOnly={view}
                    findRule={findRule}
                  />
                ) : (
                  <div key={x.uid} className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                    Нет в данных: {x.opTypeId}
                    {!view && (
                      <Button variant="danger" className="text-xs" onClick={() => onChange(removeOperative(roster, x.uid))}>
                        Убрать
                      </Button>
                    )}
                  </div>
                );
              })}
              {!view && roster.operatives.length > 0 && <AddRow onClick={() => setAdding(true)}>Оперативник{total != null ? ` · ${roster.operatives.length}/${total}` : ''}</AddRow>}
            </div>
          </section>
        </div>
        {!viewOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <div className="mx-auto flex max-w-lg gap-2 lg:max-w-3xl lg:px-4">
            {view ? (
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setView(false)}>
                <Icon name="edit" /> <span className="whitespace-nowrap">Редактировать</span>
              </Button>
            ) : (
              <Button variant="primary" className="h-12 flex-1 text-base" onClick={() => setAdding(true)}>
                <Icon name="plus" /> <span className="whitespace-nowrap">Добавить оперативника</span>
              </Button>
            )}
            <Button variant="ghost" className="h-12 px-4" onClick={() => setExporting(true)}>
              <Icon name="share" /> <span className="max-[359px]:sr-only">Экспорт</span>
            </Button>
          </div>
        </div>
        )}
        <AddSheet open={adding} team={team} roster={roster} onClose={() => setAdding(false)} onAdd={(o) => (haptic.tap(), onChange(addOperative(roster, o)), setAdding(false))} />
        <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} team={team} />
        <Sheet open={equipOpen} onClose={() => setEquipOpen(false)} title={`Снаряжение · выбрано ${roster.equipment.length}`} tall>
          <div className="space-y-2 pb-2">
            {team.equipment.map((e) => {
              const on = roster.equipment.includes(e.id);
              return (
                <div key={e.id} className={cx('overflow-hidden rounded-2xl border', on ? 'border-accent/50 bg-accent/[0.06]' : 'border-white/10 bg-app-elevated')}>
                  <button type="button" disabled={view} onClick={() => (haptic.select(), onChange(toggleEquipment(roster, e.id)))} className="flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left disabled:cursor-default">
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
          </div>
        </Sheet>
        <Sheet open={menu} onClose={() => setMenu(false)} title="Команда">
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (setMenu(false), onStartGame())}>
              <Icon name="spark" /> Начать игру с этой командой
            </Button>
            <Button className="w-full justify-start" onClick={() => (setMenu(false), onTestArmy())}>
              <Icon name="map" /> Test Army: расставить оперативников
            </Button>
            <Button
              className="w-full justify-start"
              onClick={() => (setMenu(false), onDuplicate({ ...roster, id: uid(), name: `${roster.name} (копия)`, createdAt: Date.now(), updatedAt: Date.now() }))}
            >
              <Icon name="copy" /> Дублировать команду
            </Button>
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
    </RosterPhotos>
  );
}

const OP_STATS = (o: KtOperative) => [
  { label: 'APL', value: o.stats.apl },
  { label: 'Move', value: o.stats.move },
  { label: 'Save', value: o.stats.save },
  { label: 'Wounds', value: o.stats.wounds },
];

/** Оперативник (как юнит AoS): имя, характеристики строкой, выбранное оружие; раскрытый — оружие и имя, затем датакарта. */
function OpCard({
  n,
  x,
  o,
  team,
  isLeader,
  issues,
  open,
  onToggle,
  onChange,
  onRemove,
  readOnly,
  findRule,
}: {
  n: number;
  x: KtRosterOp;
  o: KtOperative;
  team: KtTeam;
  isLeader: boolean;
  issues: BuilderIssue[];
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<KtRosterOp>) => void;
  onRemove: () => void;
  readOnly: boolean;
  findRule: FindRule;
}) {
  const chosen = o.weapons.filter((w) => x.weapons.includes(w.id));
  const toggle = (w: KtWeapon) => (haptic.select(), onChange({ weapons: nextWeaponsForToggle(team, o, x.weapons, w) }));
  const leader = isLeader;
  const own = o.abilities.filter((a) => !a.factionRule);
  return (
    <UnitRowCard
      id={`u-${x.uid}`}
      photo={{ key: photoKey('kt', o.id), readOnly }}
      title={x.name || o.name}
      crown={leader}
      meta={[leader ? 'Лидер' : null, x.name ? o.name : null, `APL ${o.stats.apl}`, `${o.stats.wounds} W`, `Sv ${o.stats.save}`]}
      accentLine={chosen.map((w) => w.name).join(' · ') || 'Оружие не выбрано'}
      value={n}
      valueLabel="№"
      issues={issues}
      open={open}
      onToggle={onToggle}
    >
      {!readOnly && (
        <div className="space-y-2">
          <ControlRow label="Оружие · отметьте выбранное" value={`${chosen.length} из ${o.weapons.length}`}>
            <WeaponTable list={o.weapons} chosen={x.weapons} onToggle={readOnly ? undefined : toggle} op={o} findRule={findRule} />
          </ControlRow>
          <ControlRow label="Своё имя">
            <input
              value={x.name}
              onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
              placeholder={o.name}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </ControlRow>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="danger" className="h-9 px-3 text-xs" onClick={onRemove}>
              <Icon name="trash" className="size-4" /> Удалить
            </Button>
          </div>
        </div>
      )}
      <DatasheetBlock defaultOpen={readOnly}>
        <StatTiles stats={OP_STATS(o)} />
        <div>
          <SectionTitle>Оружие</SectionTitle>
          <WeaponTable list={readOnly ? chosen : o.weapons} chosen={readOnly ? undefined : x.weapons} empty="Оружие не выбрано" op={o} findRule={findRule} />
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
        <p className="text-[12px] text-fg-3">Подставка: {o.baseMm ? `${o.baseMm} мм` : 'нет данных'}</p>
      </DatasheetBlock>
    </UnitRowCard>
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
type FindRule = ReturnType<typeof ktRuleIndex>;

/** Правила оружия профиля: каждое — нажимается и открывает текст (как способности оружия 40K); без текста — просто подпись. */
function KtRuleList({ rules, op, findRule }: { rules: string; op: KtOperative; findRule: FindRule }) {
  return (
    <>
      {ktWeaponRuleTokens(rules, findRule, op.abilities).map((t, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {t.rule ? (
            <RuleTrigger source={{ title: t.rule.name, text: t.rule.text, sub: t.rule.sub }} className="inline text-accent/90 underline decoration-accent/40 decoration-dotted underline-offset-2 active:text-accent">
              {t.label}
            </RuleTrigger>
          ) : (
            t.label
          )}
        </span>
      ))}
    </>
  );
}

function WeaponTable({ list, chosen, onToggle, empty, op, findRule }: { list: KtWeapon[]; chosen?: string[]; onToggle?: (w: KtWeapon) => void; empty?: string; op: KtOperative; findRule: FindRule }) {
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
          // строка — не <button>: внутри нажимаемые правила оружия (кнопки); выбор — нажатием на строку или Enter/пробел
          <div
            key={w.id}
            role={onToggle ? 'checkbox' : undefined}
            aria-checked={onToggle ? !!on : undefined}
            tabIndex={onToggle ? 0 : undefined}
            onClick={() => onToggle?.(w)}
            onKeyDown={(e) => {
              if (!onToggle || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              onToggle(w);
            }}
            className={cx('block w-full cursor-default border-t border-white/[0.06] px-2.5 py-1.5 text-left', onToggle && !on && 'opacity-55', onToggle && 'active:bg-white/5')}
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
                  {p.rules && <KtRuleList rules={p.rules} op={op} findRule={findRule} />}
                </span>
                <span className="text-center text-white/85">{p.atk}</span>
                <span className="text-center text-white/85">{p.hit}</span>
                <span className="text-center text-white/85">{p.dmg}</span>
              </span>
            ))}
          </div>
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
  const leaders = team.operatives.filter((o) => isLeaderOperative(team, o));
  const others = team.operatives.filter((o) => !isLeaderOperative(team, o));
  const structure = structureOf(team);
  const row = (o: KtOperative) => {
    const count = roster.operatives.filter((x) => x.opTypeId === o.id).length;
    // состав по слотам (21.11.2026): больше, чем положено, не добавить — причина под названием
    const blocked = structure ? addBlockReason(structure, team, roster.operatives, o) : null;
    return (
      <li key={o.id}>
        <button type="button" onClick={() => onAdd(o)} disabled={!!blocked} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left active:bg-white/10 disabled:opacity-45">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight">{o.name}</span>
            {count > 0 && <Tag tone="accent">×{count}</Tag>}
            {!blocked && <Icon name="plus" className="size-4 text-accent" />}
          </span>
          {blocked && <span className="mt-1 block text-[12px] text-fg-3">{blocked}</span>}
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
        {structure?.note && <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] leading-snug text-fg-2">{structure.note}</p>}
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
