import { useState } from 'react';
import { eligibleFor, enhancementFit, generalFit, reinforceFit, unitBaseCost, unitTotal, type AosComputed, type AosIssue, type AosLookup } from '../../aos/engine';
import type { AosRegiment, AosRoster, AosUnit, AosWarscroll, AosWeapon } from '../../aos/types';
import { haptic, openExternal } from '../../telegram';
import { Button, Icon, Tag } from '../kit';
import { cx } from '../util';
import { cleanRuleText } from '../../text';
import { seasonLabel } from '../../aos/rules';
import { AosRuleCard } from './AosPanels';

export interface UnitActions {
  onToggle: () => void;
  onReinforce: (on: boolean) => void;
  onEnhancement: (typeKey: string) => void;
  onGeneral: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** Карточка юнита AoS: строка с очками, по нажатию — настройки и варскролл. */
export function AosUnitCard({
  unit,
  roster,
  L,
  cr,
  regiment,
  leader,
  expanded,
  actions,
  readOnly = false,
}: {
  unit: AosUnit;
  roster: AosRoster;
  L: AosLookup;
  cr: AosComputed;
  regiment: AosRegiment | null;
  leader: boolean;
  expanded: boolean;
  actions: UnitActions;
  /** режим просмотра: без кнопок изменения, варскролл сразу раскрыт */
  readOnly?: boolean;
}) {
  const ws = L.ws.get(unit.warscrollId);
  const issues: AosIssue[] = cr.byUid.get(unit.uid) ?? [];
  const errors = issues.filter((i) => i.level === 'error');
  const isGeneral = leader && roster.generalUid === unit.uid;
  if (!ws) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-red-100">
        <span className="flex-1">Юнит {unit.warscrollId} не найден в данных</span>
        {!readOnly && (
          <Button variant="danger" className="h-9 px-3" onClick={actions.onRemove}>
            <Icon name="trash" className="size-4" />
          </Button>
        )}
      </div>
    );
  }
  const models = ws.unitSize * (unit.reinforced ? 2 : 1);
  const enhRefs = Object.values(unit.enhancements)
    .map((id) => L.enh.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const enh = enhRefs.map((e) => e.item.name);
  return (
    <div id={'u-' + unit.uid} className={cx('overflow-hidden rounded-2xl border bg-app-elevated transition', errors.length ? 'border-danger/40' : expanded ? 'border-white/20' : 'border-white/10')}>
      <button type="button" onClick={() => (haptic.tap(), actions.onToggle())} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug">
            {isGeneral && <Icon name="crown" className="size-4 shrink-0 text-accent" />}
            <span className="min-w-0 break-words">{ws.name}</span>
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-white/45">
            {[leader ? 'Лидер полка' : ws.hero ? 'Герой' : null, models > 1 ? `${models} мод.` : null, unit.reinforced ? 'усилен' : null, seasonLabel(ws.season), ws.legends ? 'Legends' : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {enh.length > 0 && <p className="mt-1 text-[12px] font-semibold leading-snug text-accent/90">{enh.join(' · ')}</p>}
        </div>
        {errors.length > 0 && <Icon name="alert" className="size-4 shrink-0 text-danger" />}
        <span className="shrink-0 text-right">
          <span className="font-display block text-[19px] font-semibold leading-none tabular-nums">{unitTotal(unit, L)}</span>
          <span className="text-[10px] uppercase text-white/35">очк.</span>
        </span>
        <Icon name="down" className={cx('size-4 shrink-0 text-white/35 transition', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3">
          {issues.map((i, n) => (
            <p key={n} className={cx('rounded-lg px-2.5 py-2 text-[12.5px] leading-snug', i.level === 'error' ? 'bg-danger/10 text-red-100' : 'bg-warn/10 text-amber-100')}>
              {i.message}
            </p>
          ))}
          {!readOnly && <Controls unit={unit} ws={ws} roster={roster} L={L} regiment={regiment} leader={leader} isGeneral={isGeneral} actions={actions} />}
          {enhRefs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Улучшения юнита</p>
              {enhRefs.map((e) => (
                <AosRuleCard key={e.item.id} rule={e.item} L={L} open={readOnly} extraSub={[e.type.name, e.item.points ? `+${e.item.points} очк.` : null, seasonLabel(e.table.season)].filter(Boolean).join(' · ')} />
              ))}
            </div>
          )}
          <KnownLores ws={ws} roster={roster} L={L} />
          <Warscroll ws={ws} unit={unit} L={L} defaultOpen={readOnly} />
        </div>
      )}
    </div>
  );
}

/** WIZARD/PRIEST: какие лоры армии знает юнит (по правилам — лоры, выбранные для армии). */
function KnownLores({ ws, roster, L }: { ws: AosWarscroll; roster: AosRoster; L: AosLookup }) {
  if (!ws.wizard && !ws.priest) return null;
  const name = (k: 'spell' | 'prayer' | 'manifestation') => (roster.lores[k] ? L.lore.get(roster.lores[k]!)?.name : null);
  const parts = [
    ws.wizard ? `WIZARD (${ws.wizard}): ${[name('spell'), name('manifestation')].filter(Boolean).join(' · ') || 'лор не выбран'}` : null,
    ws.priest ? `PRIEST (${ws.priest}): ${[name('prayer'), name('manifestation')].filter(Boolean).join(' · ') || 'лор не выбран'}` : null,
  ].filter(Boolean);
  return <p className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12px] leading-snug text-white/60">{parts.join(' · ')}</p>;
}

function Controls({
  unit,
  ws,
  roster,
  L,
  regiment,
  leader,
  isGeneral,
  actions,
}: {
  unit: AosUnit;
  ws: AosWarscroll;
  roster: AosRoster;
  L: AosLookup;
  regiment: AosRegiment | null;
  leader: boolean;
  isGeneral: boolean;
  actions: UnitActions;
}) {
  const reinforce = reinforceFit(unit, roster, L);
  const general = leader && regiment ? generalFit(regiment, roster, L) : null;
  // типы улучшений, где есть хотя бы одна таблица, подходящая юниту
  const types = L.faction.enhancementTypes.filter((t) => t.tables.some((tb) => eligibleFor(ws, tb)));
  return (
    <div className="space-y-2">
      {leader && (
        <Row
          label="Генерал"
          value={isGeneral ? 'Да' : 'Нет'}
          action={
            isGeneral ? (
              <Tag tone="accent">Генерал</Tag>
            ) : (
              <Button className="h-9 px-3 text-xs" disabled={!general?.ok} onClick={actions.onGeneral}>
                <Icon name="crown" className="size-4" /> Сделать
              </Button>
            )
          }
          reason={!isGeneral && general && !general.ok ? general.reason : undefined}
        />
      )}
      {(ws.reinforceable || unit.reinforced) && (
        <Row
          label="Усиление"
          value={unit.reinforced ? `${ws.unitSize * 2} моделей · ×2 очков` : `${ws.unitSize} → ${ws.unitSize * 2} моделей, +${ws.cost ?? 0} очк.`}
          action={
            <Button className="h-9 px-3 text-xs" disabled={!unit.reinforced && !reinforce.ok} onClick={() => actions.onReinforce(!unit.reinforced)}>
              {unit.reinforced ? 'Убрать' : 'Усилить'}
            </Button>
          }
          reason={!unit.reinforced && !reinforce.ok ? reinforce.reason : undefined}
        />
      )}
      {types.map((t) => {
        const cur = unit.enhancements[t.key] ? L.enh.get(unit.enhancements[t.key]!) : null;
        const anyOk = t.tables.some((tb) => tb.items.some((it) => enhancementFit(unit, it.id, roster, L).ok));
        const why = !cur && !anyOk ? firstReason(unit, t.tables.flatMap((tb) => tb.items.map((i) => i.id)), roster, L) : undefined;
        return (
          <Row
            key={t.key}
            label={t.name}
            value={cur ? `${cur.item.name}${cur.item.points ? ` · +${cur.item.points}` : ''}` : '—'}
            action={
              <Button className="h-9 px-3 text-xs" disabled={!cur && !anyOk} onClick={() => actions.onEnhancement(t.key)}>
                {cur ? 'Изменить' : 'Выбрать'}
              </Button>
            }
            reason={why}
          />
        );
      })}
      {ws.unique && types.length === 0 && ws.hero && <p className="text-[12px] text-white/40">UNIQUE — улучшения недоступны.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {!leader && (
          <Button className="h-9 px-3 text-xs" onClick={actions.onMove}>
            <Icon name="chevron" className="size-4" /> Перенести
          </Button>
        )}
        <Button className="h-9 px-3 text-xs" onClick={actions.onDuplicate}>
          <Icon name="copy" className="size-4" /> {leader ? 'Ещё такой полк' : 'Копия'}
        </Button>
        <Button variant="danger" className="h-9 px-3 text-xs" onClick={actions.onRemove}>
          <Icon name="trash" className="size-4" /> {leader ? 'Удалить полк' : 'Удалить'}
        </Button>
      </div>
      <p className="text-[11px] text-white/35">
        Цена: {unitBaseCost(unit, ws)} очк.{Object.keys(unit.enhancements).length ? ' + улучшения' : ''}
      </p>
    </div>
  );
}

function firstReason(u: AosUnit, ids: string[], r: AosRoster, L: AosLookup): string | undefined {
  for (const id of ids) {
    const f = enhancementFit(u, id, r, L);
    if (!f.ok) return f.reason;
  }
  return undefined;
}

function Row({ label, value, action, reason }: { label: string; value: string; action: React.ReactNode; reason?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
          <p className="truncate text-[13px] font-semibold text-white/85">{value}</p>
        </div>
        {action}
      </div>
      {reason && <p className="mt-1 text-[12px] leading-snug text-white/45">{reason}</p>}
    </div>
  );
}

/** Варскролл: характеристики, оружие, способности, ключевые слова. */
export function Warscroll({ ws, unit, L, defaultOpen = false }: { ws: AosWarscroll; unit?: AosUnit; L?: AosLookup; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ranged = ws.weapons.filter((w) => w.type === 'ranged');
  const melee = ws.weapons.filter((w) => w.type === 'melee');
  const stat = (label: string, v: string) => (
    <div className="rounded-lg bg-white/[0.04] px-1 py-1.5 text-center">
      <p className="text-[10px] font-semibold uppercase text-white/40">{label}</p>
      <p className="font-display text-[17px] font-semibold leading-tight">{v || '—'}</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-white/75">
        Варскролл
        <Icon name="down" className={cx('size-4 text-white/40 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">
          <div className={cx('grid gap-1.5', ws.stats.ward ? 'grid-cols-5' : 'grid-cols-4')}>
            {stat('Move', ws.stats.move)}
            {stat('Save', ws.stats.save)}
            {stat('Control', ws.stats.control)}
            {stat('Health', ws.stats.health)}
            {ws.stats.ward && stat('Ward', ws.stats.ward)}
          </div>
          {ranged.length > 0 && <Weapons title="Дальнобойное оружие" list={ranged} ranged />}
          {melee.length > 0 && <Weapons title="Ближний бой" list={melee} />}
          {ws.abilities.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Способности</p>
              {ws.abilities.map((a, i) => (
                <AosRuleCard key={i} rule={a} L={L} />
              ))}
            </div>
          )}
          {ws.composition.length > 0 && (
            <p className="text-[12.5px] text-white/60">
              <span className="text-white/40">Состав: </span>
              {ws.composition.map((c) => `${c.size} × ${c.unit}`).join(', ')}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {ws.factionKeywords.map((k) => (
              <Tag key={'f' + k} tone="accent">
                {k}
              </Tag>
            ))}
            {ws.keywords.map((k) => (
              <Tag key={k}>{k + (ws.params[k] ? ` (${ws.params[k]})` : '')}</Tag>
            ))}
          </div>
          <div className="space-y-0.5 text-[12px] text-white/45">
            <p>
              Размер: {ws.unitSize} мод.{unit?.reinforced ? ` (усилен — ${ws.unitSize * 2})` : ''} · Очки: {ws.cost ?? '—'}
              {ws.reinforceable ? ' · можно усилить' : ''}
            </p>
            {ws.bases && <p>Подставка: {ws.bases}</p>}
            {ws.notes && <p className="whitespace-pre-line">{cleanRuleText(ws.notes)}</p>}
            {ws.legendsDate && !ws.legends && <p>Уйдёт в Warhammer Legends: {ws.legendsDate}</p>}
          </div>
          <button type="button" onClick={() => openExternal(ws.link)} className="flex items-center gap-1.5 text-xs font-semibold text-accent/90">
            <Icon name="link" className="size-3.5" /> Открыть на Wahapedia
          </button>
        </div>
      )}
    </div>
  );
}

function Weapons({ title, list, ranged }: { title: string; list: AosWeapon[]; ranged?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</p>
      <div className="no-scrollbar -mx-1 mt-1 overflow-x-auto px-1">
        <table className="w-full min-w-[250px] text-center text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase text-white/35">
              <th className="pb-1 text-left font-semibold"> </th>
              {[ranged ? 'Rng' : null, 'Atk', 'Hit', 'Wnd', 'Rnd', 'Dmg'].filter(Boolean).map((h) => (
                <th key={h} className="px-1 pb-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((w, i) => (
              <tr key={i} className="border-t border-white/[0.05] align-top">
                <td className="max-w-[9rem] py-1.5 pr-1.5 text-left">
                  <span className="block break-words text-[12px] font-semibold leading-tight">{w.name}</span>
                  {w.abilities && w.abilities !== '-' && <span className="block text-[10px] uppercase leading-tight text-accent/70">{w.abilities}</span>}
                </td>
                {ranged && <td className="px-0.5 py-1.5">{w.range}</td>}
                <td className="px-0.5 py-1.5">{w.attacks}</td>
                <td className="px-0.5 py-1.5">{w.hit}</td>
                <td className="px-0.5 py-1.5">{w.wound}</td>
                <td className="px-0.5 py-1.5">{w.rend}</td>
                <td className="px-0.5 py-1.5">{w.damage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
