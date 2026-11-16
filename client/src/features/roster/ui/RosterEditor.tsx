import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { factionColor } from './common/factionColors';
import { loadFaction } from '../data';
import { availableDetachments, computeRoster, makeLookup, roleGroup, type ComputedRoster, type ComputedUnit, type DataLookup } from '../engine/compute';
import { BATTLE_SIZES, BATTLE_SIZE_ORDER } from '../engine/rules';
import { legacyIds, migrateRoster } from '../engine/migrate';
import { addUnit, duplicateRoster, duplicateUnit, removeUnit, touch, updateUnit } from '../engine/roster';
import { dispositionsOf, factionCredit, OUTDATED_RULE_NOTE, ruleLabel, visibleStratagem } from '../engine/source';
import type { DataIndex, Datasheet, Detachment, FactionData, Roster } from '../engine/types';
import { confirmAsk, haptic } from '../telegram';
import { Button, Empty, Field, Icon, IconButton, PointsBar, Segmented, Sheet, Tag } from './kit';
import { cx, fmtPts } from './util';
import { UnitCard } from './UnitCard';
import { sortRosterUnits } from '../engine/sort';
import { UnitPicker } from './UnitPicker';
import { BattleSheet } from './BattleSheet';
import { ExportSheet } from './ExportSheet';
import { DetachmentPanel, RuleText } from './DetachmentPanel';
import { useRu } from './common/useRu';
import { ruDetachmentRule, ruName, ruRule, ruStratagem } from '../ru';
import { RuleRichText } from './common/RulePopover';
import { useGlossary } from './common/useGlossary';
import { LangSwitch } from './common/LangSwitch';
import { useEn, useT } from './common/i18n';
import { cleanRuleText } from '../text';
import { w40kPointSystems } from '../points';
import { PointsSheet } from './PointsSheet';
import { PhotoStrip, RosterPhotos } from './common/UnitPhoto';
import { photoKey } from '../photos';
import type { PhotoItem } from '../photoList';

const GROUPS: { key: ReturnType<typeof roleGroup>; title: string; en: string }[] = [
  { key: 'characters', title: 'Персонажи', en: 'Characters' },
  { key: 'battleline', title: 'Боевая линия', en: 'Battleline' },
  { key: 'transports', title: 'Выделенный транспорт', en: 'Dedicated Transports' },
  { key: 'other', title: 'Прочие', en: 'Other units' },
  { key: 'allies', title: 'Союзники', en: 'Allies' },
];

export function RosterEditor({
  roster,
  index,
  onBack,
  onRules,
  onStartGame,
  onTestArmy,
  onChange,
  onDuplicate,
  onDelete,
  viewOnly = false,
}: {
  roster: Roster;
  index: DataIndex;
  onBack: () => void;
  onRules: () => void;
  onStartGame: () => void;
  onTestArmy?: () => void;
  onChange: (r: Roster) => void;
  onDuplicate: (r: Roster) => void;
  onDelete: () => void;
  /** только просмотр (режим мастера в игре): без редактирования, меню и переключателя режима */
  viewOnly?: boolean;
}) {
  const t = useT();
  const en = useEn();
  const [faction, setFaction] = useState<FactionData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    loadFaction(roster.factionId).then(setFaction, (e) => setLoadErr(String(e.message ?? e)));
  }, [roster.factionId]);

  const L = useMemo(() => (faction ? makeLookup(faction) : null), [faction]);
  const cr = useMemo(() => (L ? computeRoster(roster, L, en ? 'en' : 'ru') : null), [roster, L, en]);

  // перевод сохранённого ростера на обновлённые данные (замены id из FactionData.migrations)
  useEffect(() => {
    if (!L) return;
    const m = migrateRoster(roster, L);
    if (m.changed) onChange(m.roster);
  }, [L, roster, onChange]);

  // кэш итогов для списка ростеров (без изменения updatedAt)
  useEffect(() => {
    if (!cr) return;
    const s = roster.summary;
    if (!s || s.points !== cr.points || s.errors !== cr.errors || s.warnings !== cr.warnings) {
      onChange({ ...roster, summary: { points: cr.points, errors: cr.errors, warnings: cr.warnings } });
    }
  }, [cr, roster, onChange]);

  if (loadErr) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl uppercase">{t('Не удалось открыть ростер', 'Could not open the roster')}</p>
        <p className="mt-2 text-sm text-fg-3">{loadErr}</p>
        <div className="mt-5 flex gap-2">
          <Button onClick={onBack}>{t('К списку', 'Back to list')}</Button>
          <Button variant="primary" onClick={() => (setLoadErr(null), loadFaction(roster.factionId).then(setFaction, (e) => setLoadErr(String(e.message ?? e))))}>
            {t('Повторить', 'Retry')}
          </Button>
        </div>
      </div>
    );
  }
  if (!L || !cr || !faction) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </div>
    );
  }
  return <Editor roster={roster} L={L} cr={cr} index={index} onBack={onBack} onRules={onRules} onStartGame={onStartGame} onTestArmy={onTestArmy} onChange={onChange} onDuplicate={onDuplicate} onDelete={onDelete} viewOnly={viewOnly} />;
}

function Editor({
  roster,
  L,
  cr,
  index,
  onBack,
  onRules,
  onStartGame,
  onTestArmy,
  onChange,
  onDuplicate,
  onDelete,
  viewOnly = false,
}: {
  roster: Roster;
  L: DataLookup;
  cr: ComputedRoster;
  index: DataIndex;
  onBack: () => void;
  onRules: () => void;
  onStartGame: () => void;
  onTestArmy?: () => void;
  onChange: (r: Roster) => void;
  onDuplicate: (r: Roster) => void;
  onDelete: () => void;
  /** только просмотр (режим мастера в игре): без редактирования, меню и переключателя режима */
  viewOnly?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string | null>(null);
  const ru = useRu(L.faction.id);
  const [picker, setPicker] = useState(false);
  const [problems, setProblems] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [battle, setBattle] = useState(false);
  const [detSheet, setDetSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(roster.detachmentIds.length === 0);
  const [flash, setFlash] = useState<string | null>(null);
  // режим просмотра: только чтение, без кнопок изменения
  const [viewState, setView] = useState(viewOnly);
  const view = viewOnly || viewState;
  const [detInfo, setDetInfo] = useState<string | null>(null);
  const [pointsInfo, setPointsInfo] = useState(false);
  const closeDetInfo = useCallback(() => setDetInfo(null), []);
  const shownDet = detInfo && cr.detachments.some((d) => d.id === detInfo) ? detInfo : null;
  const toggleDetInfo = (id: string) => {
    haptic.tap();
    setDetInfo((cur) => (cur === id ? null : id));
    window.setTimeout(() => document.getElementById('detachment-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };
  const size = BATTLE_SIZES[roster.battleSize];

  const set = (patch: Partial<Roster>) => onChange(touch({ ...roster, ...patch }));

  const issuesByUid = useMemo(() => {
    const m = new Map<string, ComputedRoster['issues']>();
    for (const i of cr.issues) for (const u of i.unitUids ?? []) m.set(u, [...(m.get(u) ?? []), i]);
    return m;
  }, [cr]);

  const topLevel = sortRosterUnits(cr.units.filter((c) => !c.unit.attachedTo || !cr.byUid.has(c.unit.attachedTo)));
  const grouped = GROUPS.map((g) => ({ ...g, list: topLevel.filter((c) => roleGroup(c) === g.key) })).filter((g) => g.list.length);

  const add = (ds: Datasheet) => {
    const next = addUnit(roster, ds);
    onChange(next);
    haptic.ok();
    setFlash(ds.name);
    window.setTimeout(() => setFlash((f) => (f === ds.name ? null : f)), 1400);
  };

  const scrollToUnit = (uid: string) => {
    setExpanded(uid);
    window.setTimeout(() => document.getElementById('u-' + uid)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const over = cr.points > size.points;
  // фото армии (16.11.2026): юниты в порядке списка, присоединённые — сразу после своего отряда
  const photoList = useMemo<PhotoItem[]>(
    () =>
      grouped.flatMap((g) =>
        g.list.flatMap((c) =>
          [c, ...c.attached.map((u) => cr.byUid.get(u.uid))].flatMap((x) =>
            x?.ds ? [{ key: photoKey('40k', x.ds.id), name: x.ds.name, sub: `${fmtPts(x.total)} ${t('очк.', 'pts')}`, uid: x.unit.uid }] : [],
          ),
        ),
      ),
    [grouped, cr, t],
  );

  return (
    <RosterPhotos items={photoList} onOpenCard={(it) => it.uid && scrollToUnit(it.uid)} readOnly={view}>
      <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
        {/* ---- шапка ---- */}
        <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-app/95 px-4 pb-3 pt-3 backdrop-blur">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, ${factionColor('40k', roster.factionId)}, transparent 85%)` }}
          />
          <div className="flex items-center gap-2">
            <IconButton icon="back" label={t('К списку', 'Back to list')} onClick={onBack} className="size-9" />
            {view ? (
              <p className="font-display min-w-0 flex-1 truncate px-1.5 py-1 text-lg font-semibold uppercase">{roster.name}</p>
            ) : (
              <NameInput value={roster.name} onChange={(name) => set({ name })} />
            )}
            <LangSwitch />
            {!viewOnly && (
              <IconButton
                icon={view ? 'edit' : 'eye'}
                label={view ? t('Редактировать', 'Edit') : t('Режим просмотра', 'View mode')}
                onClick={() => (setView((v) => !v), setExpanded(null))}
                className={cx('size-9', view && 'bg-accent/15 text-accent')}
              />
            )}
            {!view && <IconButton icon="more" label={t('Меню', 'Menu')} onClick={() => setMenu(true)} className="size-9" />}
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <button type="button" onClick={() => (haptic.tap(), setPointsInfo(true))} aria-label={t('Очки: сборка армии и партия', 'Points: army building and game')} className="min-w-0 rounded-lg text-left active:opacity-70">
              <div className="flex items-baseline gap-1.5">
                <span className={cx('font-display text-[32px] font-semibold leading-none tabular-nums', over ? 'text-danger' : 'text-white')}>{fmtPts(cr.points)}</span>
                <span className="text-sm text-fg-3">/ {fmtPts(size.points)}</span>
                <Icon name="info" className="size-3.5 shrink-0 self-center text-fg-3" />
              </div>
            </button>
            <div className="flex gap-1.5">
              <Stat label="DP" value={`${cr.dp}/${cr.dpLimit}`} bad={cr.issues.some((i) => i.code === 'dp')} />
              <Stat label={t('Улучш.', 'Enh.')} value={`${cr.enhancementsUsed}/${cr.enhancementsLimit}`} bad={cr.issues.some((i) => i.code === 'enh-cap')} />
              <button
                type="button"
                onClick={() => (haptic.tap(), setProblems(true))}
                className={cx(
                  'flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1 transition active:scale-95',
                  cr.errors ? 'bg-danger text-accent-foreground' : cr.warnings ? 'bg-warn text-accent-foreground' : 'bg-accent text-accent-foreground',
                )}
              >
                <Icon name={cr.errors || cr.warnings ? 'alert' : 'check'} className="size-4" />
                <span className="text-[12px] font-semibold leading-tight">{cr.errors ? cr.errors : cr.warnings ? cr.warnings : 'OK'}</span>
              </button>
            </div>
          </div>
          <PointsBar used={cr.points} limit={size.points} />
        </div>

        <div className="space-y-6 px-4 pt-4">
          {/* ---- армия ---- */}
          <section className="rounded-2xl border border-white/10 bg-app-elevated">
            <button type="button" onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">
                  {L.faction.name}
                  {cr.chapter ? ` · ${cr.chapter}` : ''} · {size.label}
                </p>
                <p className="mt-0.5 truncate text-[15px] font-semibold">
                  {cr.detachments.length ? cr.detachments.map((d) => d.name).join(' + ') : <span className="text-accent">{t('Выберите детачмент', 'Choose a Detachment')}</span>}
                </p>
                {roster.forceDisposition && <p className="mt-0.5 text-sm text-fg-3">{roster.forceDisposition}</p>}
              </div>
              <Icon name="down" className={cx('size-5 shrink-0 text-fg-3 transition', settingsOpen && 'rotate-180')} />
            </button>
            {settingsOpen && view && (
              <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">
                <div>
                  {[
                    [t('Размер боя', 'Battle size'), `${size.label} · ${fmtPts(size.points)}`],
                    [t('Орден', 'Chapter'), L.faction.chapters.length ? roster.chapter ?? cr.chapter ?? '—' : null],
                    [t('Детачменты', 'Detachments'), cr.detachments.map((d) => d.name).join(' + ') || '—'],
                    ['Force Disposition', roster.forceDisposition],
                  ]
                    .filter((x): x is [string, string] => !!x[1])
                    .map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0">
                        <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{k}</span>
                        <span className="text-right text-[13.5px] font-semibold text-white/85">{v}</span>
                      </div>
                    ))}
                </div>
                {L.faction.armyRules.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Правила армии', 'Army rules')}</p>
                    {L.faction.armyRules.map((id) => {
                      const r = L.faction.rules[id];
                      return r ? <RuleText key={id} name={r.name} text={r.text} ru={ruRule(ru, id)} /> : null;
                    })}
                  </div>
                )}
              </div>
            )}
            {settingsOpen && !view && (
              <div className="space-y-5 border-t border-white/[0.06] px-4 pb-4 pt-4">
                <Field label={t('Размер боя', 'Battle size')}>
                  <Segmented
                    value={roster.battleSize}
                    onChange={(battleSize) => set({ battleSize })}
                    options={BATTLE_SIZE_ORDER.map((s) => ({ value: s, label: BATTLE_SIZES[s].label, hint: `${fmtPts(BATTLE_SIZES[s].points)} · ${BATTLE_SIZES[s].dp} DP` }))}
                  />
                </Field>
                {L.faction.chapters.length > 0 && (
                  <Field label={t('Орден', 'Chapter')} hint="Space Marines">
                    <select
                      value={roster.chapter ?? ''}
                      onChange={(e) => set({ chapter: e.target.value || null })}
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white outline-none focus:border-accent"
                    >
                      <option value="">{t('Без ордена / определить автоматически', 'No Chapter / detect automatically')}</option>
                      {L.faction.chapters.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label={t('Детачменты', 'Detachments')} hint={t(`${cr.dp} из ${cr.dpLimit} DP`, `${cr.dp} of ${cr.dpLimit} DP`)}>
                  <div className="space-y-1.5">
                    {cr.detachments.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5">
                        <button type="button" onClick={() => toggleDetInfo(d.id)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-semibold">
                            {ruleLabel(d)}
                            <span className="ml-1.5 text-xs font-semibold text-accent">{t('подробнее', 'details')}</span>
                          </p>
                          <p className="text-xs text-fg-3">
                            {dpOf(d, cr.chapter)} DP · {dispositionsOf(d).join(' / ') || '—'}
                            {d.tag ? ` · ${d.tag}` : ''}
                          </p>
                        </button>
                        <IconButton
                          icon="close"
                          label={t('Убрать детачмент', 'Remove Detachment')}
                          className="size-8 border-0"
                          onClick={() => {
                            const ids = roster.detachmentIds.filter((x) => x !== d.id);
                            const fds = ids.flatMap((x) => { const dd = L.det.get(x); return dd ? dispositionsOf(dd) : []; });
                            set({ detachmentIds: ids, forceDisposition: roster.forceDisposition && fds.includes(roster.forceDisposition) ? roster.forceDisposition : null });
                          }}
                        />
                      </div>
                    ))}
                    <Button variant="outline" className="w-full border-dashed" onClick={() => setDetSheet(true)}>
                      <Icon name="plus" className="size-4" /> {cr.detachments.length ? t('Добавить детачмент', 'Add Detachment') : t('Выбрать детачмент', 'Choose Detachment')}
                    </Button>
                  </div>
                </Field>
                {L.faction.armyRules.length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-fg-3">{t('Правила армии', 'Army rules')}</span>
                      <span className="flex items-center gap-1 text-xs text-fg-3">
                        {L.faction.armyRules.length}
                        <Icon name="down" className="size-3.5 transition group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {L.faction.armyRules.map((id) => {
                        const r = L.faction.rules[id];
                        return r ? <RuleText key={id} name={r.name} text={r.text} ru={ruRule(ru, id)} /> : null;
                      })}
                    </div>
                  </details>
                )}
                {cr.dispositions.length > 0 && (
                  <Field label="Force Disposition">
                    <Segmented value={roster.forceDisposition} onChange={(forceDisposition) => set({ forceDisposition })} options={cr.dispositions.map((d) => ({ value: d, label: d }))} />
                  </Field>
                )}
              </div>
            )}
          </section>

          {/* ---- детачмент: кнопки и раскрывающаяся карточка ---- */}
          {cr.detachments.length > 0 && (
            <div className="-mt-3 space-y-3">
              {!shownDet && (
                // переносятся на новую строку, а не уезжают за край экрана (UI-аудит B10); при нескольких — без подписи
                <div className="flex flex-wrap gap-1.5">
                  {cr.detachments.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDetInfo(d.id)}
                      className="flex min-h-9 max-w-full shrink-0 items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/10 px-3 py-1.5 text-left text-xs font-semibold text-accent transition active:scale-[0.98]"
                    >
                      <Icon name="book" className="size-3.5 shrink-0" />
                      {cr.detachments.length === 1 && <span className="text-accent/70">{t('Детачмент:', 'Detachment:')}</span>}
                      <span className="truncate text-white/90">{d.name}</span>
                      <Icon name="down" className="size-3.5 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {shownDet && <DetachmentPanel id={shownDet} cr={cr} L={L} dp={(d) => dpOf(d, cr.chapter)} onSwitch={setDetInfo} onClose={closeDetInfo} />}
            </div>
          )}

          <PhotoStrip />

          {/* ---- юниты ---- */}
          {grouped.length === 0 ? (
            <Empty title={t('Нет юнитов', 'No units')}>{t('Нажмите «Добавить юнит» внизу.', 'Tap “Add unit” below.')}</Empty>
          ) : (
            grouped.map((g) => (
              <section key={g.key}>
                <div className="mb-2.5 flex items-baseline justify-between px-1">
                  <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">
                    {t(g.title, g.en)}
                    <span className="ml-2 font-sans text-xs font-semibold text-fg-3">{g.list.reduce((n, c) => n + 1 + c.attached.length, 0)}</span>
                  </h2>
                  <span className="text-xs font-semibold tabular-nums text-fg-3">{fmtPts(g.list.reduce((s, c) => s + c.total + c.attached.reduce((a, u) => a + (cr.byUid.get(u.uid)?.total ?? 0), 0), 0))}</span>
                </div>
                <div className="space-y-2.5">
                  {g.list.map((c) => (
                    <UnitGroup
                      key={c.unit.uid}
                      c={c}
                      cr={cr}
                      roster={roster}
                      L={L}
                      issuesByUid={issuesByUid}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      onChange={onChange}
                      readOnly={view}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          <p className="pt-2 text-center text-xs text-fg-3">{factionCredit(L.faction, index, t('ru', 'en') as 'ru' | 'en')}</p>
        </div>

        {/* ---- нижняя панель ---- */}
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <div className="mx-auto flex max-w-lg gap-2 lg:max-w-3xl lg:px-4">
            {viewOnly ? (
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={onBack}>
                <Icon name="back" /> <span className="whitespace-nowrap">{t('К игре', 'Back to game')}</span>
              </Button>
            ) : view ? (
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setView(false)}>
                <Icon name="edit" /> <span className="whitespace-nowrap">{t('Редактировать', 'Edit')}</span>
              </Button>
            ) : (
              <Button variant="primary" className="h-12 flex-1 text-base" onClick={() => setPicker(true)}>
                <Icon name="plus" /> <span className="whitespace-nowrap">{t('Добавить юнит', 'Add unit')}</span>
              </Button>
            )}
            {(view || viewOnly) && (
              <Button variant="ghost" className="h-12 px-4" onClick={() => (haptic.tap(), setBattle(true))}>
                <Icon name="book" /> <span className="max-[359px]:sr-only">{t('Лист', 'Sheet')}</span>
              </Button>
            )}
            <Button variant="ghost" className="h-12 px-4" onClick={() => setExporting(true)}>
              <Icon name="share" /> <span className="max-[359px]:sr-only">{t('Экспорт', 'Export')}</span>
            </Button>
          </div>
        </div>

        {flash && (
          <div className="fade-enter pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg">+ {flash}</div>
          </div>
        )}

        <PointsSheet open={pointsInfo} onClose={() => setPointsInfo(false)} systems={w40kPointSystems(roster, L, cr, t('ru', 'en') as 'ru' | 'en')} />
        <UnitPicker open={picker} onClose={() => setPicker(false)} roster={roster} L={L} cr={cr} onAdd={add} onToggleLegends={() => set({ showLegends: !roster.showLegends })} ru={ru} />

        <DetachmentSheet open={detSheet} onClose={() => setDetSheet(false)} roster={roster} L={L} cr={cr} onPick={(d) => {
          const ids = [...roster.detachmentIds, d.id];
          const patch: Partial<Roster> = { detachmentIds: ids };
          const fds = dispositionsOf(d);
          if (!roster.forceDisposition && fds.length === 1) patch.forceDisposition = fds[0];
          if (d.chapter && !roster.chapter) patch.chapter = d.chapter;
          set(patch);
          setDetSheet(false);
          haptic.ok();
        }} />

        <Sheet open={problems} onClose={() => setProblems(false)} title={cr.issues.length ? `${t('Проверка', 'Validation')} · ${cr.issues.length}` : t('Проверка', 'Validation')}>
          {cr.issues.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icon name="check" className="size-6" />
              </div>
              <p className="mt-3 font-semibold">{t('Ростер соответствует правилам', 'The roster is valid')}</p>
              <p className="mt-1 text-sm text-fg-3">{t('Очки, детачменты, улучшения, лимиты и присоединения в порядке.', 'Points, Detachments, Enhancements, limits and attachments are all fine.')}</p>
            </div>
          ) : (
            <ul className="space-y-2 pb-2">
              {cr.issues.map((i, n) => (
                <li key={n}>
                  <button
                    type="button"
                    disabled={!i.unitUids?.length}
                    onClick={() => {
                      setProblems(false);
                      if (i.unitUids?.[0]) scrollToUnit(i.unitUids[0]);
                    }}
                    className={cx(
                      'flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left text-sm',
                      i.level === 'error' ? 'border-danger/25 bg-danger/[0.07] text-red-100' : 'border-warn/25 bg-warn/[0.07] text-amber-100',
                    )}
                  >
                    <Icon name={i.level === 'error' ? 'alert' : 'info'} className={cx('mt-0.5 size-4 shrink-0', i.level === 'error' ? 'text-danger' : 'text-warn')} />
                    <span className="flex-1">{i.message}</span>
                    {!!i.unitUids?.length && <Icon name="chevron" className="mt-0.5 size-4 shrink-0 opacity-50" />}
                  </button>
                </li>
              ))}
              {!!roster.migrationNotes?.length && (
                <li>
                  <Button variant="outline" className="w-full" onClick={() => set({ migrationNotes: undefined })}>
                    {t('Скрыть сообщения о заменённых детачментах и улучшениях', 'Hide messages about replaced Detachments and Enhancements')}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </Sheet>

        <BattleSheet open={battle} onClose={() => setBattle(false)} L={L} cr={cr} detachmentIds={roster.detachmentIds} />

        <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} L={L} cr={cr} dataVersion={index.lastUpdate} credit={factionCredit(L.faction, index, 'en')} />

        <Sheet open={menu} onClose={() => setMenu(false)} title={t('Ростер', 'Roster')}>
          <div className="space-y-2 pb-2">
            <Button className="w-full justify-start" onClick={() => (setMenu(false), onRules())}>
              <Icon name="book" /> {t('Стратагемы армии и правила', 'Army stratagems and rules')}
            </Button>
            <Button className="w-full justify-start" onClick={() => (setMenu(false), setBattle(true))}>
              <Icon name="book" /> {t('Боевой лист: стратагемы по фазам и юниты', 'Battle sheet: stratagems by phase and units')}
            </Button>
            <Button className="w-full justify-start" onClick={() => (setMenu(false), onStartGame())}>
              <Icon name="map" /> {t('Начать игру с этим ростером', 'Start a game with this roster')}
            </Button>
            {onTestArmy && (
              <Button className="w-full justify-start" onClick={() => (setMenu(false), onTestArmy())}>
                <Icon name="shield" /> {t('Test Army с этим ростером', 'Test Army with this roster')}
              </Button>
            )}
            <Button className="w-full justify-start" onClick={() => (setMenu(false), onDuplicate(duplicateRoster(roster)))}>
              <Icon name="copy" /> {t('Дублировать ростер', 'Duplicate roster')}
            </Button>
            <Button className="w-full justify-start" onClick={() => (setMenu(false), setExporting(true))}>
              <Icon name="share" /> {t('Экспорт / поделиться', 'Export / share')}
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              onClick={async () => {
                if (await confirmAsk(t(`Удалить ростер «${roster.name}»?`, `Delete roster “${roster.name}”?`))) onDelete();
              }}
            >
              <Icon name="trash" /> {t('Удалить ростер', 'Delete roster')}
            </Button>
          </div>
        </Sheet>
      </div>
    </RosterPhotos>
  );
}

const dpOf = (d: Detachment, chapter: string | null) => (chapter && d.chapterDp[chapter] != null ? d.chapterDp[chapter] : d.dp);

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={cx('flex min-w-12 flex-col items-center justify-center rounded-lg px-2 py-1', bad ? 'bg-danger/15 text-danger' : 'bg-white/[0.06] text-white/85')}>
      <span className="text-[13px] font-semibold leading-tight tabular-nums">{value}</span>
      <span className="text-[12px] font-semibold uppercase leading-tight tracking-wide opacity-55">{label}</span>
    </div>
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // название изменилось снаружи (дублирование, импорт) — показываем новое
  if (value !== prev) {
    setPrev(value);
    setV(value);
  }
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        // сохраняем сразу, чтобы название не потерялось при выходе кнопкой «Назад» без потери фокуса
        if (e.target.value.trim()) onChange(e.target.value);
      }}
      onBlur={() => (v.trim() ? v !== v.trim() && onChange(v.trim()) : setV(value))}
      onKeyDown={(e) => e.key === 'Enter' && ref.current?.blur()}
      aria-label={t('Название ростера', 'Roster name')}
      className="font-display min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold uppercase outline-none focus:border-white/10 focus:bg-white/[0.04]"
    />
  );
}

function UnitGroup({
  c,
  cr,
  roster,
  L,
  issuesByUid,
  expanded,
  setExpanded,
  onChange,
  readOnly = false,
}: {
  c: ComputedUnit;
  cr: ComputedRoster;
  roster: Roster;
  L: DataLookup;
  issuesByUid: Map<string, ComputedRoster['issues']>;
  expanded: string | null;
  setExpanded: (u: string | null) => void;
  onChange: (r: Roster) => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const card = (x: ComputedUnit, nested: boolean) => (
    <UnitCard
      key={x.unit.uid}
      c={x}
      cr={cr}
      roster={roster}
      L={L}
      nested={nested}
      issues={issuesByUid.get(x.unit.uid) ?? []}
      expanded={expanded === x.unit.uid}
      onToggle={() => setExpanded(expanded === x.unit.uid ? null : x.unit.uid)}
      onPatch={(patch) => onChange(updateUnit(roster, x.unit.uid, patch))}
      onWarlord={() => onChange(touch({ ...roster, warlordUid: x.unit.uid }))}
      onDuplicate={() => onChange(duplicateUnit(roster, x.unit.uid))}
      onRemove={() => {
        onChange(removeUnit(roster, x.unit.uid));
        haptic.tap();
      }}
      readOnly={readOnly}
    />
  );
  if (!c.attached.length) return card(c, false);
  // порядок внутри отряда: Leader → Support → телохранители
  const chars = c.attached
    .map((u) => cr.byUid.get(u.uid))
    .filter((x): x is ComputedUnit => !!x)
    .sort((a, b) => Number(!!a.ds?.support) - Number(!!b.ds?.support));
  const total = c.total + chars.reduce((s, x) => s + x.total, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-accent/25 bg-app-elevated">
      <div className="flex items-baseline justify-between bg-accent/[0.06] px-4 py-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent/85">{t('Отряд', 'Combined unit')}</p>
        <p className="text-[12px] font-semibold tabular-nums text-accent/85">{fmtPts(total)} {t('очк.', 'pts')}</p>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {chars.map((x) => card(x, true))}
        {card(c, true)}
      </div>
    </div>
  );
}

function DetachmentSheet({ open, onClose, roster, L, cr, onPick }: { open: boolean; onClose: () => void; roster: Roster; L: DataLookup; cr: ComputedRoster; onPick: (d: Detachment) => void }) {
  const t = useT();
  const [info, setInfo] = useState<string | null>(null);
  const ru = useRu(L.faction.id);
  const g = useGlossary();
  const list = availableDetachments(L, roster.chapter ?? cr.chapter, legacyIds(roster).detachments).filter((d) => !roster.detachmentIds.includes(d.id));
  const usedTags = new Set(cr.detachments.map((d) => d.tag).filter(Boolean));
  const left = cr.dpLimit - cr.dp;
  const sorted = [...list].sort((a, b) => a.dp - b.dp || a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={onClose} title={t('Детачменты', 'Detachments')} tall>
      <p className="mb-3 text-sm text-fg-3">
        {t('Осталось', 'Left:')} <b className="text-white">{Math.max(0, left)} DP</b>. {t('Детачменты с одинаковым тегом взять вместе нельзя.', 'Detachments with the same tag cannot be taken together.')}
      </p>
      <ul className="space-y-1.5 pb-2">
        {sorted.map((d) => {
          const dp = dpOf(d, roster.chapter ?? cr.chapter);
          const tooMuch = dp > left;
          const tagClash = !!d.tag && usedTags.has(d.tag);
          const enh = L.faction.enhancements.filter((e) => e.detachment === d.id && (!e.outdated || !!d.outdated));
          const open_ = info === d.id;
          return (
            <li key={d.id} className={cx('rounded-xl border bg-white/[0.03]', tooMuch || tagClash ? 'border-white/[0.06]' : 'border-white/10')}>
              <div className="flex items-center gap-2 py-2 pl-3 pr-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setInfo(open_ ? null : d.id)}>
                  <p className={cx('text-sm font-semibold', (tooMuch || tagClash) && 'text-fg-3')}>{ruleLabel(d)}</p>
                  {d.outdated && <p className="mt-0.5 text-xs text-amber-200">{t(`${OUTDATED_RULE_NOTE} Был в этом ростере — можно вернуть.`, '* Not in the current source — it was in this roster and can be restored.')}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone={tooMuch ? 'danger' : 'accent'}>{dp} DP</Tag>
                    {dispositionsOf(d).map((fd) => (
                      <Tag key={fd}>{fd}</Tag>
                    ))}
                    {d.tag && <Tag tone={tagClash ? 'danger' : 'muted'}>{d.tag}</Tag>}
                    {d.chapter && <Tag tone="warn">{d.chapter}</Tag>}
                  </div>
                </button>
                <Button variant={tooMuch || tagClash ? 'ghost' : 'primary'} className="h-9 min-h-0 px-3" onClick={() => onPick(d)}>
                  {t('Взять', 'Take')}
                </Button>
              </div>
              {open_ && (
                <div className="space-y-3 border-t border-white/[0.06] px-3 py-3 text-sm">
                  {d.abilities.map((a, i) => {
                    const r = ruDetachmentRule(ru, d.id, a.id);
                    return (
                      <div key={i}>
                        <p className="font-semibold text-accent">{r ? ruName(r.name, a.name) : a.name}</p>
                        {r ? <RuleRichText text={r.text} g={g} className="mt-1 text-fg-2" /> : <p className="mt-1 whitespace-pre-line text-fg-2">{cleanRuleText(a.text)}</p>}
                      </div>
                    );
                  })}
                  {L.faction.stratagems.some((st) => st.detachment === d.id && visibleStratagem(st, L.det)) && (
                    <div>
                      <p className="font-semibold text-white/85">{t('Стратагемы', 'Stratagems')}</p>
                      <div className="mt-1 space-y-1.5">
                        {L.faction.stratagems
                          .filter((st) => st.detachment === d.id && visibleStratagem(st, L.det))
                          .map((st) => (
                            <RuleText key={st.id} name={st.name} sub={[`${st.cp} CP`, st.type, st.turn, st.phase].filter(Boolean).join(' · ')} text={st.text} ru={ruStratagem(ru, st.id)} />
                          ))}
                      </div>
                    </div>
                  )}
                  {enh.length > 0 && (
                    <div>
                      <p className="font-semibold text-white/85">{t('Улучшения', 'Enhancements')}</p>
                      <ul className="mt-1 space-y-1 text-fg-2">
                        {enh.map((e) => (
                          <li key={e.id}>
                            {e.name} — {e.cost} {t('очк.', 'pts')}{e.upgrade ? ' · Upgrade' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

