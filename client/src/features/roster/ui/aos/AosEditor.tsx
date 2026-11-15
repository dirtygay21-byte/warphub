import { useEffect, useMemo, useRef, useState } from 'react';
import { factionColor } from '../common/factionColors';
import { loadAosFaction } from '../../data';
import { computeAos, formationsOf, makeAosLookup, terrainOf, regimentCap, slotsUsed, unitTotal, type AosComputed, type AosLookup } from '../../aos/engine';
import {
  addAuxiliary,
  addRegiment,
  addToRegiment,
  duplicateAosRoster,
  duplicateAosUnit,
  moveAosUnit,
  newErrors,
  removeAosUnit,
  setEnhancement,
  setGeneral,
  setLore,
  touchAos,
  updateAosUnit,
  type OpResult,
} from '../../aos/roster';
import { AOS_RULES, LORE_LABEL, POINTS_LIMIT_LABEL, auxiliarySurcharge } from '../../aos/rules';
import type { AosFactionData, AosIndex, AosRegiment, AosRoster, AosUnit, AosWarscroll, LoreKind } from '../../aos/types';
import { confirmAsk, haptic } from '../../telegram';
import { Button, Empty, Field, Icon, IconButton, PointsBar, Segmented, Sheet, Tag } from '../kit';
import { cx, fmtPts } from '../util';
import { HeaderStat, NameInput } from '../common/BuilderKit';
import { AosExportSheet } from './AosExportSheet';
import { AosPicker, type PickTarget } from './AosPicker';
import { AosUnitCard, Warscroll } from './AosUnitCard';
import { AosRuleCard, EnhancementsPanel, ManifestationsPanel, SpellsPanel } from './AosPanels';
import { aosPointSystems } from '../../points';
import { AosTerrainGuide } from './AosTerrainGuide';
import { PointsSheet } from '../PointsSheet';
import { useSpellsOpen } from './useSpellsOpen';
import { EnhancementSheet, FormationSheet, LoreSheet, MoveSheet, RorSheet, TerrainSheet } from './AosSheets';

/** Редактор ростера Age of Sigmar: загрузка данных фракции. */
export function AosEditor(props: {
  roster: AosRoster;
  index: AosIndex;
  onBack: () => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  onChange: (r: AosRoster) => void;
  onDuplicate: (r: AosRoster) => void;
  onDelete: () => void;
}) {
  const [faction, setFaction] = useState<AosFactionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadAosFaction(props.roster.factionId).then(setFaction, (e) => setError(String(e?.message ?? e)));
  }, [props.roster.factionId]);
  const L = useMemo(() => (faction ? makeAosLookup(faction) : null), [faction]);
  const cr = useMemo(() => (L ? computeAos(props.roster, L) : null), [props.roster, L]);

  // краткая сводка для списка ростеров
  const { roster, onChange } = props;
  useEffect(() => {
    if (!cr) return;
    const s = { points: cr.points.total, errors: cr.errors, warnings: cr.warnings };
    if (!roster.summary || roster.summary.points !== s.points || roster.summary.errors !== s.errors || roster.summary.warnings !== s.warnings) onChange({ ...roster, summary: s });
  }, [cr, roster, onChange]);

  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl uppercase">Нет данных фракции</p>
        <p className="mt-2 text-sm text-fg-3">{error}</p>
        <Button className="mt-5" onClick={props.onBack}>
          Назад
        </Button>
      </div>
    );
  if (!L || !cr)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </div>
    );
  return <Editor {...props} L={L} cr={cr} />;
}

function Editor({
  roster,
  index,
  L,
  cr,
  onBack,
  onStartGame,
  onTestArmy,
  onChange,
  onDuplicate,
  onDelete,
}: {
  roster: AosRoster;
  index: AosIndex;
  L: AosLookup;
  cr: AosComputed;
  onBack: () => void;
  onStartGame: () => void;
  onTestArmy: () => void;
  onChange: (r: AosRoster) => void;
  onDuplicate: (r: AosRoster) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickTarget | null>(null);
  const [armyOpen, setArmyOpen] = useState(roster.regiments.length === 0);
  const [sheet, setSheet] = useState<null | 'formation' | 'terrain' | 'ror' | 'problems' | 'export' | 'menu' | 'traits' | 'points'>(null);
  const [lore, setLoreSheet] = useState<LoreKind | null>(null);
  const [enh, setEnh] = useState<{ uid: string; typeKey: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  // режим просмотра: только чтение, без кнопок изменения (как просмотр ростера в приложениях-конструкторах)
  const [view, setView] = useState(false);
  const [spellsOpen, toggleSpells] = useSpellsOpen();
  const [manifOpen, setManifOpen] = useState(true);
  /** открыт гид «Как ставить террейн» — id варскролла террейна */
  const [guide, setGuide] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const f = L.faction;
  const over = cr.points.total > roster.pointsLimit;

  const flash = (text: string, bad = false) => {
    setToast({ text, bad });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), bad ? 3200 : 1400);
  };
  const apply = (res: OpResult, okText?: string) => {
    if (res.ok) {
      onChange(res.roster);
      haptic.ok();
      if (okText) flash(okText);
      return true;
    }
    haptic.error();
    flash(res.reason, true);
    return false;
  };
  const set = (patch: Partial<AosRoster>) => onChange(touchAos({ ...roster, ...patch }));
  const scrollTo = (uid: string) => {
    setExpanded(uid);
    window.setTimeout(() => document.getElementById('u-' + uid)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const pick = (w: AosWarscroll) => {
    if (!picker) return;
    const res = picker.kind === 'leader' ? addRegiment(roster, w, L) : picker.kind === 'aux' ? addAuxiliary(roster, w, L) : addToRegiment(roster, picker.regUid, w, L);
    if (apply(res, '+ ' + w.name)) {
      // полк набран — закрываем выбор; для лидера сразу предлагаем юниты полка
      if (picker.kind === 'leader' && res.ok) {
        const reg = res.roster.regiments[res.roster.regiments.length - 1]!;
        setPicker(w.options.length ? { kind: 'regiment', regUid: reg.uid } : null);
      } else if (picker.kind === 'regiment' && res.ok) {
        const reg = res.roster.regiments.find((g) => g.uid === picker.regUid)!;
        if (slotsUsed(reg, L) >= regimentCap(reg, res.roster)) setPicker(null);
      }
    }
  };

  const actionsFor = (u: AosUnit, reg: AosRegiment | null, leader: boolean) => ({
    onToggle: () => setExpanded(expanded === u.uid ? null : u.uid),
    onReinforce: (on: boolean) => onChange(updateAosUnit(roster, u.uid, { reinforced: on })),
    onEnhancement: (typeKey: string) => setEnh({ uid: u.uid, typeKey }),
    onGeneral: () => (onChange(setGeneral(roster, u.uid)), haptic.ok()),
    onMove: () => setMoving(u.uid),
    onDuplicate: () => apply(duplicateAosUnit(roster, u.uid, L), leader ? 'Новый полк' : 'Копия добавлена'),
    onRemove: async () => {
      const name = L.ws.get(u.warscrollId)?.name ?? 'юнит';
      const next = removeAosUnit(roster, u.uid, L);
      // предупреждаем, если удаление сломает остальное (обязательный юнит, «1 на каждый», полк с Adjutants…)
      const broken = newErrors(roster, next, L);
      const parts = [leader && reg?.units.length ? `Удалить полк «${name}» вместе с ${reg.units.length} юнит.?` : null, broken.length ? `После удаления: ${broken.slice(0, 3).join(' ')}` : null].filter(Boolean);
      if (parts.length && !(await confirmAsk(parts.join('\n\n') + (leader && reg?.units.length ? '' : '\n\nВсё равно удалить?')))) return;
      onChange(next);
      setExpanded(null);
    },
  });

  const formation = roster.formationId ? L.formation.get(roster.formationId) : null;
  const ror = roster.ror ? L.ror.get(roster.ror.id) : null;
  const terrain = roster.terrainId ? L.ws.get(roster.terrainId) : null;
  const regs = [...roster.regiments].sort((a, b) => Number(b.leader.uid === roster.generalUid) - Number(a.leader.uid === roster.generalUid));

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-32 lg:max-w-3xl">
      {/* ---- шапка ---- */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-app/95 px-4 pb-3 pt-3 backdrop-blur">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${factionColor('aos', roster.factionId)}, transparent 85%)` }}
        />
        <div className="flex items-center gap-2">
          <IconButton icon="back" label="К списку" onClick={onBack} className="size-9" />
          {view ? (
            <p className="font-display min-w-0 flex-1 truncate px-1.5 py-1 text-lg font-semibold uppercase">{roster.name}</p>
          ) : (
            <NameInput value={roster.name} onChange={(name) => set({ name })} />
          )}
          <IconButton
            icon={view ? 'edit' : 'eye'}
            label={view ? 'Редактировать' : 'Режим просмотра'}
            onClick={() => (setView((v) => !v), setExpanded(null), setPicker(null))}
            className={cx('size-9', view && 'bg-accent/15 text-accent')}
          />
          {!view && <IconButton icon="more" label="Меню" onClick={() => setSheet('menu')} className="size-9" />}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <button type="button" onClick={() => (haptic.tap(), setSheet('points'))} aria-label="Очки: сборка армии и партия" className="flex min-w-0 items-baseline gap-1.5 rounded-lg text-left active:opacity-70">
            <span className={cx('font-display text-[32px] max-[359px]:text-[26px] font-semibold leading-none tabular-nums', over ? 'text-danger' : 'text-white')}>{fmtPts(cr.points.total)}</span>
            <span className="whitespace-nowrap text-sm text-fg-3">/ {fmtPts(roster.pointsLimit)}</span>
            <Icon name="info" className="size-3.5 shrink-0 self-center text-fg-3" />
          </button>
          <div className="flex gap-1.5">
            <HeaderStat label="Полки" value={`${roster.regiments.length}/${AOS_RULES.maxRegiments}`} bad={cr.issues.some((i) => i.code === 'regiments' || i.code === 'no-regiment')} />
            <HeaderStat label="Высадки" value={String(cr.drops)} />
            <button
              type="button"
              onClick={() => (haptic.tap(), setSheet('problems'))}
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
        <PointsBar used={cr.points.total} limit={roster.pointsLimit} />
      </div>

      <div className="space-y-5 px-4 pt-4">
        {/* ---- армия ---- */}
        <section className="rounded-2xl border border-white/10 bg-app-elevated">
          <button type="button" onClick={() => setArmyOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">
                Age of Sigmar · {f.name} · {POINTS_LIMIT_LABEL[roster.pointsLimit]}
              </p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{formation ? formation.name : formationsOf(L).length ? <span className="text-accent">Выберите боевое построение</span> : 'Без построения'}</p>
              <p className="mt-0.5 truncate text-sm text-fg-3">
                {(['spell', 'prayer', 'manifestation'] as LoreKind[])
                  .map((k) => (roster.lores[k] ? L.lore.get(roster.lores[k]!)?.name : null))
                  .filter(Boolean)
                  .join(' · ') || 'Лоры не выбраны'}
              </p>
            </div>
            <Icon name="down" className={cx('size-5 shrink-0 text-fg-3 transition', armyOpen && 'rotate-180')} />
          </button>
          {armyOpen && view && <ArmyView roster={roster} L={L} onGuide={setGuide} />}
          {armyOpen && !view && (
            <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-4">
              {f.rulesNotice && <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] leading-snug text-amber-100">{f.rulesNotice}</p>}
              <Field label="Лимит очков">
                <Segmented
                  value={String(roster.pointsLimit) as '1000' | '2000'}
                  onChange={(v) => set({ pointsLimit: Number(v) as 1000 | 2000 })}
                  options={AOS_RULES.pointsLimits.map((p) => ({ value: String(p) as '1000' | '2000', label: POINTS_LIMIT_LABEL[p] }))}
                />
              </Field>
              <PickRow label="Боевое построение" value={formation?.name} points={formation?.points} warn={!formation && formationsOf(L).length > 0} empty={formationsOf(L).length ? 'Выбрать' : 'Нет в данных'} onClick={formationsOf(L).length ? () => setSheet('formation') : undefined} />
              {(['spell', 'prayer', 'manifestation'] as LoreKind[]).map((k) => {
                const l = roster.lores[k] ? L.lore.get(roster.lores[k]!) : null;
                const avail = f.lores.some((x) => x.kind === k);
                return <PickRow key={k} label={LORE_LABEL[k]} value={l?.name} points={l?.points} empty={avail ? 'Выбрать' : 'Нет у фракции'} onClick={avail ? () => setLoreSheet(k) : undefined} />;
              })}
              <PickRow label="Террейн фракции" value={terrain?.name} points={terrain?.cost} empty={f.warscrolls.some((w) => w.kind === 'terrain') ? 'Выбрать' : 'Нет у фракции'} onClick={f.warscrolls.some((w) => w.kind === 'terrain') ? () => setSheet('terrain') : undefined} />
              {terrainOf(L).length > 0 && (
                <Button variant="outline" className="w-full justify-start" onClick={() => setGuide((terrain ?? terrainOf(L)[0]).id)}>
                  <Icon name="map" className="size-4" /> Как ставить террейн фракции
                </Button>
              )}
              <PickRow label="Полк славы" value={ror?.name} points={ror ? cr.points.ror : null} empty={f.rors.length ? 'Выбрать' : 'Нет'} onClick={f.rors.length ? () => setSheet('ror') : undefined} />
              {f.battleTraits.length > 0 && (
                <Button variant="outline" className="w-full justify-start" onClick={() => setSheet('traits')}>
                  <Icon name="book" className="size-4" /> Боевые черты фракции · {f.battleTraits.length}
                </Button>
              )}
            </div>
          )}
        </section>

        <SpellsPanel roster={roster} L={L} open={spellsOpen} onToggle={toggleSpells} />
        <ManifestationsPanel roster={roster} L={L} open={manifOpen} onToggle={() => setManifOpen((o) => !o)} />
        <EnhancementsPanel roster={roster} L={L} onUnit={scrollTo} />

        {/* ---- полки ---- */}
        {roster.regiments.length === 0 && <Empty title="Нет полков">Армия собирается из полков: герой-лидер и до 3 юнитов. Нажмите «Новый полк».</Empty>}
        {regs.map((reg, n) => {
          const leaderWs = L.ws.get(reg.leader.warscrollId);
          const isGen = reg.leader.uid === roster.generalUid;
          const used = slotsUsed(reg, L);
          const cap = regimentCap(reg, roster);
          const total = [reg.leader, ...reg.units].reduce((s, u) => s + unitTotal(u, L), 0);
          return (
            <section key={reg.uid}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">
                  {isGen ? 'Полк генерала' : `Полк ${regs[0]?.leader.uid === roster.generalUid ? n : n + 1}`}
                  <span className="ml-2 font-sans text-xs font-semibold text-fg-3">
                    {used}/{cap}
                  </span>
                </h2>
                <span className="text-xs font-semibold tabular-nums text-fg-3">{fmtPts(total)}</span>
              </div>
              <div className="space-y-2">
                <AosUnitCard unit={reg.leader} roster={roster} L={L} cr={cr} regiment={reg} leader expanded={expanded === reg.leader.uid} actions={actionsFor(reg.leader, reg, true)} readOnly={view} />
                {reg.units.length > 0 && (
                  <div className="space-y-2 border-l-2 border-white/[0.07] pl-2.5">
                    {reg.units.map((u) => (
                      <AosUnitCard key={u.uid} unit={u} roster={roster} L={L} cr={cr} regiment={reg} leader={false} expanded={expanded === u.uid} actions={actionsFor(u, reg, false)} readOnly={view} />
                    ))}
                  </div>
                )}
                {!view && leaderWs && leaderWs.options.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicker({ kind: 'regiment', regUid: reg.uid })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[13px] font-semibold text-fg-2 active:bg-white/5"
                  >
                    <Icon name="plus" className="size-4" /> В полк {used >= cap ? '(заполнен)' : `· свободно ${cap - used}`}
                  </button>
                )}
              </div>
            </section>
          );
        })}

        {/* ---- вспомогательные ---- */}
        {(roster.auxiliaries.length > 0 || (!view && roster.regiments.length > 0)) && (
          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">
                Вспомогательные
                <span className="ml-2 font-sans text-xs font-semibold text-fg-3">{roster.auxiliaries.length}</span>
              </h2>
              {cr.points.auxiliary > 0 && <span className="text-xs font-semibold text-warn">доплата +{auxiliarySurcharge(roster.auxiliaries.length)}</span>}
            </div>
            <div className="space-y-2">
              {roster.auxiliaries.map((u) => (
                <AosUnitCard key={u.uid} unit={u} roster={roster} L={L} cr={cr} regiment={null} leader={false} expanded={expanded === u.uid} actions={actionsFor(u, null, false)} readOnly={view} />
              ))}
              {!view && (
              <button
                type="button"
                onClick={() => setPicker({ kind: 'aux' })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[13px] font-semibold text-fg-2 active:bg-white/5"
              >
                <Icon name="plus" className="size-4" /> Юнит вне полка
              </button>
              )}
            </div>
          </section>
        )}

        {ror && (
          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="font-display text-[15px] font-semibold uppercase tracking-wider text-fg-2">Полк славы</h2>
              <span className="text-xs font-semibold tabular-nums text-fg-3">{fmtPts(cr.points.ror)}</span>
            </div>
            <button type="button" onClick={() => !view && setSheet('ror')} className="w-full rounded-2xl border border-white/10 bg-app-elevated px-3.5 py-3 text-left">
              <p className="text-[15px] font-semibold">{ror.name}</p>
              <p className="mt-0.5 text-[12px] text-fg-3">
                {ror.units
                  .filter((u) => !u.optional || roster.ror!.picked.includes(u.id))
                  .map((u) => `${u.count > 1 ? u.count + '× ' : ''}${L.ws.get(u.id)?.name}`)
                  .join(', ')}
              </p>
            </button>
          </section>
        )}

        <p className="pt-2 text-center text-xs text-fg-3">Данные: powered by Wahapedia · {index.lastUpdate?.slice(0, 10)} · General’s Handbook 2026-27</p>
      </div>

      {/* ---- нижняя панель ---- */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-app via-app/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-lg gap-2 lg:max-w-3xl lg:px-4">
          {view ? (
            <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setView(false)}>
              <Icon name="edit" /> <span className="whitespace-nowrap">Редактировать</span>
            </Button>
          ) : (
            <Button variant="primary" className="h-12 flex-1 text-base" onClick={() => setPicker({ kind: 'leader' })}>
              <Icon name="plus" /> <span className="whitespace-nowrap">Новый полк</span>
            </Button>
          )}
          <Button variant="ghost" className="h-12 px-4" onClick={() => setSheet('export')}>
            <Icon name="share" /> <span className="max-[359px]:sr-only">Экспорт</span>
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fade-enter pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className={cx('max-w-sm rounded-2xl px-4 py-2 text-center text-sm font-semibold shadow-lg', toast.bad ? 'bg-danger text-white' : 'bg-white text-black')}>{toast.text}</div>
        </div>
      )}

      <AosPicker key={picker ? picker.kind + (picker.kind === 'regiment' ? picker.regUid : '') : 'none'} target={picker} onClose={() => setPicker(null)} roster={roster} L={L} onPick={pick} onToggleLegends={() => set({ showLegends: !roster.showLegends })} />
      <FormationSheet open={sheet === 'formation'} onClose={() => setSheet(null)} roster={roster} L={L} onPick={(id) => (set({ formationId: id }), setSheet(null))} />
      <TerrainSheet open={sheet === 'terrain'} onClose={() => setSheet(null)} roster={roster} L={L} onPick={(id) => (set({ terrainId: id }), setSheet(null))} onGuide={(id) => (setSheet(null), setGuide(id))} />
      <AosTerrainGuide ws={guide ? (L.ws.get(guide) ?? null) : null} L={L} onClose={() => setGuide(null)} />
      <RorSheet key={sheet === 'ror' ? 'ror-open' : 'ror'} open={sheet === 'ror'} onClose={() => setSheet(null)} roster={roster} L={L} onPick={(v) => (set({ ror: v }), setSheet(null))} />
      <LoreSheet key={'lore-' + (lore ?? 'closed')} kind={lore} onClose={() => setLoreSheet(null)} roster={roster} L={L} onPick={(id) => (lore && onChange(setLore(roster, lore, id)), setLoreSheet(null))} />
      <EnhancementSheet target={enh} onClose={() => setEnh(null)} roster={roster} L={L} onPick={(id) => (enh && onChange(setEnhancement(roster, enh.uid, enh.typeKey, id)), setEnh(null))} />
      <MoveSheet uid={moving} onClose={() => setMoving(null)} roster={roster} L={L} onMove={(t) => (moving && apply(moveAosUnit(roster, moving, t, L), 'Перенесено'), setMoving(null))} />
      <PointsSheet open={sheet === 'points'} onClose={() => setSheet(null)} systems={aosPointSystems(roster, L, cr)} extra={{
          game: (
            <Button variant="primary" className="w-full" onClick={() => (setSheet(null), onStartGame())}>
              <Icon name="spark" /> Начать игру: батлплан, priority, тактики и счёт
            </Button>
          ),
        }} />
      <AosExportSheet open={sheet === 'export'} onClose={() => setSheet(null)} roster={roster} L={L} cr={cr} />

      <Sheet open={sheet === 'traits'} onClose={() => setSheet(null)} title="Боевые черты" tall>
        <div className="space-y-1.5 pb-2">
          {f.battleTraits.map((a, i) => (
            <AosRuleCard key={i} rule={a} L={L} />
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'problems'} onClose={() => setSheet(null)} title={cr.issues.length ? `Проверка · ${cr.issues.length}` : 'Проверка'}>
        {cr.issues.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon name="check" className="size-6" />
            </div>
            <p className="mt-3 font-semibold">Ростер соответствует правилам</p>
            <p className="mt-1 text-sm text-fg-3">Очки, полки, генерал, улучшения, лоры и ограничения в порядке.</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-2">
            {cr.issues.map((i, n) => (
              <li key={n}>
                <button
                  type="button"
                  disabled={!i.uids?.length}
                  onClick={() => {
                    setSheet(null);
                    if (i.uids?.[0]) scrollTo(i.uids[0]);
                  }}
                  className={cx(
                    'flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left text-sm',
                    i.level === 'error' ? 'border-danger/25 bg-danger/[0.07] text-red-100' : 'border-warn/25 bg-warn/[0.07] text-amber-100',
                  )}
                >
                  <Icon name={i.level === 'error' ? 'alert' : 'info'} className={cx('mt-0.5 size-4 shrink-0', i.level === 'error' ? 'text-danger' : 'text-warn')} />
                  <span className="flex-1">{i.message}</span>
                  {!!i.uids?.length && <Icon name="chevron" className="mt-0.5 size-4 shrink-0 opacity-50" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Ростер">
        <div className="space-y-2 pb-2">
          <label className="flex items-center justify-between rounded-xl bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white/85">
            Показывать Warhammer Legends
            <input type="checkbox" checked={roster.showLegends} onChange={() => set({ showLegends: !roster.showLegends })} className="size-5 accent-accent" />
          </label>
          <Button className="w-full justify-start" onClick={() => (setSheet(null), onStartGame())}>
            <Icon name="spark" /> Начать игру с этим ростером
          </Button>
          <Button className="w-full justify-start" onClick={() => (setSheet(null), onTestArmy())}>
            <Icon name="map" /> Test Army: расставить на карте
          </Button>
          <Button className="w-full justify-start" onClick={() => (setSheet(null), onDuplicate(duplicateAosRoster(roster)))}>
            <Icon name="copy" /> Дублировать ростер
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start"
            onClick={async () => {
              if (await confirmAsk(`Удалить ростер «${roster.name}»?`)) onDelete();
            }}
          >
            <Icon name="trash" /> Удалить ростер
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Блок армии в режиме просмотра: построение с правилами, лоры, террейн, полк славы, боевые черты — без выбора. */
function ArmyView({ roster, L, onGuide }: { roster: AosRoster; L: AosLookup; onGuide: (id: string) => void }) {
  const f = L.faction;
  const formation = roster.formationId ? L.formation.get(roster.formationId) : null;
  const terrain = roster.terrainId ? L.ws.get(roster.terrainId) : null;
  const ror = roster.ror ? L.ror.get(roster.ror.id) : null;
  const line = (label: string, value: string | null | undefined, points?: number | null) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</span>
      <span className="text-right text-[13.5px] font-semibold text-white/85">
        {value ?? <span className="text-fg-3">—</span>}
        {points ? <span className="ml-1.5 text-xs text-fg-3">+{points}</span> : null}
      </span>
    </div>
  );
  return (
    <div className="space-y-4 border-t border-white/[0.06] px-4 pb-4 pt-3">
      {f.rulesNotice && <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] leading-snug text-amber-100">{f.rulesNotice}</p>}
      <div>
        {line('Лимит', POINTS_LIMIT_LABEL[roster.pointsLimit])}
        {line('Построение', formation?.name, formation?.points)}
        {(['spell', 'prayer', 'manifestation'] as LoreKind[]).map((k) => {
          const l = roster.lores[k] ? L.lore.get(roster.lores[k]!) : null;
          return <div key={k}>{line(LORE_LABEL[k], l?.name, l?.points)}</div>;
        })}
        {line('Террейн', terrain?.name, terrain?.cost)}
        {line('Полк славы', ror?.name)}
      </div>
      {terrainOf(L).length > 0 && (
        <Button variant="outline" className="w-full justify-start" onClick={() => onGuide((terrain ?? terrainOf(L)[0]).id)}>
          <Icon name="map" className="size-4" /> Как ставить террейн фракции
        </Button>
      )}
      {formation && formation.rules.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Построение · {formation.name}</p>
          {formation.rules.map((a, i) => (
            <AosRuleCard key={i} rule={a} L={L} />
          ))}
        </div>
      )}
      {f.battleTraits.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">Боевые черты · {f.battleTraits.length}</p>
          {f.battleTraits.map((a, i) => (
            <AosRuleCard key={i} rule={a} L={L} />
          ))}
        </div>
      )}
      {terrain && <Warscroll ws={terrain} L={L} />}
    </div>
  );
}

function PickRow({ label, value, points, empty, warn, onClick }: { label: string; value?: string; points?: number | null; empty: string; warn?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={() => (haptic.tap(), onClick?.())}
      className={cx('flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition active:bg-white/5', warn ? 'border-accent/40' : 'border-white/10', !onClick && 'opacity-50')}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wider text-fg-3">{label}</span>
        <span className={cx('block truncate text-[14px] font-semibold', value ? 'text-white/90' : warn ? 'text-accent' : 'text-fg-3')}>{value ?? empty}</span>
      </span>
      {!!points && <Tag>+{points}</Tag>}
      {onClick && <Icon name="chevron" className="size-4 shrink-0 text-fg-3" />}
    </button>
  );
}
