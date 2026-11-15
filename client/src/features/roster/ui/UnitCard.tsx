import { photoKey } from '../photos';
import { UnitPhotoBlock, UnitThumb } from './common/UnitPhoto';
import { useState, type ReactNode } from 'react';
import { optionalWargear, paidWargear, type ComputedRoster, type ComputedUnit, type DataLookup, type Issue } from '../engine/compute';
import type { Datasheet, Roster, RosterUnit, Weapon } from '../engine/types';
import { optionsOf, whoText, type ParsedOption } from '../engine/wargear';
import { linkLabel, OUTDATED_MARK, outdatedNote, ruleLabel, selectableEnhancement, visibleStratagem } from '../engine/source';
import { groupDetRules, groupOf, roleOf, unitAppliedRules } from '../engine/group';
import { openExternal } from '../telegram';
import { Button, Counter, Field, Icon, Segmented, Tag } from './kit';
import { cx, fmtPts } from './util';
import { cleanRuleText, INCOMPLETE_TEXT } from '../text';
import { useEn, useT } from './common/i18n';
import { compositionRu, invulnNoteRu, sizeLabelRu } from './unitTextRu';
import { RuleText } from './DetachmentPanel';
import { RuleTrigger, WeaponAbilityTag } from './common/RulePopover';
import { useGlossary } from './common/useGlossary';
import { useRu } from './common/useRu';
import { RuleRichText } from './common/RulePopover';
import { isWarphub, ruAbility, ruDatasheet, ruDetachmentRuleById, ruEnhancement, ruName, ruPlain, ruRule, ruStratagem, WARPHUB_LABEL, type RuOverlay, type RuText } from '../ru';
import type { Glossary } from '../glossary';
import { findKeyword, splitWeaponKeywords } from '../glossary';

/** В выгрузке дальность и навык — голые числа («24», «3»); на карточке инфолиста — «24″» и «3+». */
const fmtRange = (r: string) => (/^\d+$/.test(r.trim()) ? `${r.trim()}″` : r);
const fmtSkill = (v: string) => (/^\d$/.test(v.trim()) ? `${v.trim()}+` : v);

export function UnitCard({
  c,
  cr,
  roster,
  L,
  nested,
  issues,
  expanded,
  onToggle,
  onPatch,
  onWarlord,
  onDuplicate,
  onRemove,
  readOnly = false,
}: {
  c: ComputedUnit;
  cr: ComputedRoster;
  roster: Roster;
  L: DataLookup;
  nested: boolean;
  issues: Issue[];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<RosterUnit>) => void;
  onWarlord: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** режим просмотра: вместо переключателей — итог выбора, без кнопок изменения */
  readOnly?: boolean;
}) {
  const en = useEn();
  const t = useT();
  const ds = c.ds;
  const isWarlord = roster.warlordUid === c.unit.uid;
  const hasErr = issues.some((i) => i.level === 'error');
  const hasWarn = !hasErr && issues.length > 0;
  const ru = useRu(L.faction.id);
  const g = useGlossary();

  if (!ds) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-sm">
        <span className="flex-1 text-danger">{t('Инфолист не найден в текущих данных', 'Datasheet not found in the current data')}</span>
        {!readOnly && (
          <Button variant="danger" className="h-8 min-h-0" onClick={onRemove}>
            {t('Убрать', 'Remove')}
          </Button>
        )}
      </div>
    );
  }

  const opt = c.band?.options.find((o) => o.label === c.unit.size);
  const attachedTo = c.unit.attachedTo ? cr.byUid.get(c.unit.attachedTo) : undefined;
  const meta: string[] = [];
  if (opt && (c.band!.options.length > 1 || opt.models > 1)) meta.push(en ? opt.label : sizeLabelRu(opt.label));
  if (c.enhancement) meta.push(c.enhancement.name);
  for (const [l, n] of [...Object.entries(c.unit.addons), ...Object.entries(paidWargear(c))]) if (n > 0) meta.push(`${n}× ${l}`);

  // доступные улучшения
  const enhOptions = L.faction.enhancements.filter((e) => roster.detachmentIds.includes(e.detachment) && ds.enhancements.includes(e.id) && selectableEnhancement(e, c.unit.enhancementId, roster.legacyKept?.enhancements));
  const enhBlocked = ds.epicHero ? t('Epic Hero не может получить улучшение', 'An Epic Hero cannot take an Enhancement') : ds.group.startsWith('ally:') && !c.grant ? t('Союзники не получают улучшения', 'Allies cannot take Enhancements') : null;
  const usedBy = new Map<string, number>();
  for (const u of cr.units) if (u.unit.enhancementId && u.unit.uid !== c.unit.uid) usedBy.set(u.unit.enhancementId, (usedBy.get(u.unit.enhancementId) ?? 0) + 1);

  // к кому можно присоединить
  const bodyguards = ds.leads.length
    ? cr.units.filter((x) => x.unit.uid !== c.unit.uid && x.ds && ds.leads.includes(x.ds.id) && !x.unit.attachedTo)
    : [];

  const role = nested ? (attachedTo ? (ds.support ? 'Support' : 'Leader') : t('Телохранители', 'Bodyguard')) : null;
  const tags: { label: string; tone: 'muted' | 'accent' | 'warn' }[] = [];
  if (ds.epicHero && !nested) tags.push({ label: 'Epic Hero', tone: 'muted' });
  if (ds.legends) tags.push({ label: 'Legends', tone: 'warn' });
  if (ds.group.startsWith('ally:')) tags.push({ label: L.faction.allies.find((a) => 'ally:' + a.key === ds.group)?.name ?? t('Союзник', 'Ally'), tone: 'muted' });
  if (ds.group.startsWith('det:')) tags.push({ label: L.det.get(ds.group.slice(4))?.name ?? t('Детачмент', 'Detachment'), tone: 'muted' });
  if (c.isBattleline && !ds.battleline) tags.push({ label: t('Battleline от детачмента', 'Battleline from Detachment'), tone: 'accent' });

  return (
    <div
      id={'u-' + c.unit.uid}
      className={cx(
        'relative overflow-hidden transition-colors',
        nested ? '' : 'rounded-2xl border bg-app-elevated',
        !nested && (expanded ? 'border-white/20' : 'border-white/[0.08]'),
      )}
    >
      {(hasErr || hasWarn) && <span className={cx('absolute inset-y-0 left-0 w-[3px]', hasErr ? 'bg-danger' : 'bg-warn')} aria-hidden />}
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.02]">
        <UnitThumb photoKey={photoKey('40k', ds.id)} />
        <div className="min-w-0 flex-1">
          {role && <p className="mb-0.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent/70">{role}</p>}
          <p className="text-[15px] font-semibold leading-tight">
            {isWarlord && <Icon name="crown" className="-mt-0.5 mr-1 inline size-[15px] text-accent" />}
            {ds.name}
            {ds.outdated && (
              <span className="text-warn" title={outdatedNote(ds) ?? undefined}>
                {OUTDATED_MARK}
              </span>
            )}
            {c.copy > 1 && <span className="ml-1.5 text-xs font-semibold text-fg-3">#{c.copy}</span>}
          </p>
          {(meta.length > 0 || tags.length > 0 || (!attachedTo && ds.support)) && (
            // 01.11.2026: метки (Epic Hero, Legends, союзник…) — в той же строке, что и состав, а не отдельной строкой
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.6] text-fg-3">
              {!attachedTo && ds.support && <span className="text-danger">{t('Нужно присоединить · ', 'Must be attached · ')}</span>}
              {meta.map((m, i) => (
                <span key={i} className={cx(c.enhancement && m === c.enhancement.name && 'text-accent/80')}>
                  {i > 0 && ' · '}
                  {m}
                </span>
              ))}
              {tags.map((t, i) => (
                <span key={t.label} className={cx('align-[1px]', (i > 0 || meta.length > 0) && 'ml-1.5')}>
                  <Tag tone={t.tone}>{t.label}</Tag>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="font-display text-[19px] font-semibold leading-none tabular-nums">{fmtPts(c.total)}</p>
            <p className="mt-0.5 text-[12px] font-medium uppercase tracking-wide text-fg-3">{t('очк.', 'pts')}</p>
          </div>
          <Icon name="down" className={cx('size-4 text-fg-3 transition', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-white/[0.06] bg-black/20 px-4 pb-4 pt-4">
          {ds.outdated && <p className="rounded-lg bg-warn/10 px-2.5 py-2 text-[13px] text-amber-200">{outdatedNote(ds)}</p>}
          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((i, n) => (
                <li key={n} className={cx('rounded-lg px-2.5 py-2 text-[13px]', i.level === 'error' ? 'bg-danger/10 text-red-200' : 'bg-warn/10 text-amber-200')}>
                  {i.message}
                </li>
              ))}
              {c.unit.migration && !readOnly && (
                <li>
                  <Button variant="outline" className="w-full" onClick={() => onPatch({ migration: null })}>
                    {c.unit.migration.reason === 'options' ? t('Понятно — скрыть сообщение об изменённых вариантах', 'Got it — hide the message about changed options') : c.unit.migration.reason === 'size' ? t('Понятно — скрыть сообщение о размере отряда', 'Got it — hide the message about unit size') : t('Понятно — скрыть сообщение о замене инфолиста', 'Got it — hide the message about the replaced datasheet')}
                  </Button>
                </li>
              )}
            </ul>
          )}

          <Profile c={c} cr={cr} L={L} detachmentIds={roster.detachmentIds} />

          <UnitPhotoBlock photoKey={photoKey('40k', ds.id)} name={ds.name} readOnly={readOnly} />

          {readOnly ? (
            <ReadOnlyChoices c={c} cr={cr} isWarlord={isWarlord} attachedTo={attachedTo?.ds?.name ?? null} ru={ru} />
          ) : (
            // настройка свёрнута (профиль — главное при открытии); при ошибках и предупреждениях открыта сразу
            <details className="group rounded-xl border border-white/10 bg-white/[0.02]" open={issues.length > 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-fg-2">
                <span className="min-w-0">
                  {t('Настройка отряда', 'Unit setup')}
                  <span className="block truncate text-[12px] font-normal text-fg-3">{meta.length ? meta.join(' · ') : t('состав, снаряжение, улучшение', 'size, wargear, enhancement')}</span>
                </span>
                <Icon name="down" className="size-4 shrink-0 text-fg-3 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-white/[0.06] px-3 pb-3 pt-3">
          {c.band && c.band.options.length > 1 && (
            <Field label={t('Состав', 'Unit size')} hint={c.band.from > 1 || c.band.to ? t(`цены для копии №${c.copy}`, `prices for copy #${c.copy}`) : undefined}>
              <Segmented value={c.unit.size} onChange={(size) => onPatch({ size })} options={c.band.options.map((o) => ({ value: o.label, label: en ? o.label : sizeLabelRu(o.label), hint: `${o.cost} ${t('очк.', 'pts')}` }))} />
            </Field>
          )}
          {c.band && c.band.options.length === 1 && c.band.to !== null && (
            <p className="text-[13px] text-fg-3">{t(`Цена для копии №${c.copy}: ${c.band.options[0].cost} очк.`, `Price for copy #${c.copy}: ${c.band.options[0].cost} pts`)}</p>
          )}

          {!!c.band?.addons.length && (
            <Field label={t('Дополнительно', 'Extras')}>
              <div className="space-y-2">
                {c.band.addons.map((a) => (
                  <Row key={a.label} label={a.label} hint={`+${a.cost} ${t('очк.', 'pts')}`} warn={a.unverified ? t('не проверено', 'not verified') : undefined}>
                    <Counter value={c.unit.addons[a.label] ?? 0} max={addonMax(ds.composition, a.label)} onChange={(n) => onPatch({ addons: { ...c.unit.addons, [a.label]: n } })} />
                  </Row>
                ))}
              </div>
            </Field>
          )}

          {ds.weapons.length > 0 && <LoadoutEditor c={c} onPatch={onPatch} ru={ru} />}

          {!!c.band?.wargear.length && (
            <Field label={t('Платное снаряжение', 'Paid wargear')} hint={t(`цены для копии №${c.copy}`, `prices for copy #${c.copy}`)}>
              <div className="space-y-2">
                {c.band.wargear.map((w) =>
                  c.paidAuto[w.label] !== undefined ? (
                    <div key={w.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{w.label}</p>
                        <p className="text-xs text-fg-3">
                          +{w.cost} {t('за шт.', 'each')}{w.unverified && <span className="text-warn"> · {t('не проверено', 'not verified')}</span>} · {t('считается по «Снаряжению»', 'counted from Wargear')}
                        </p>
                      </div>
                      <span className={cx('text-sm font-semibold tabular-nums', c.paidAuto[w.label] ? 'text-accent' : 'text-fg-3')}>
                        {c.paidAuto[w.label]} {t('шт.', 'pcs')} · +{c.paidAuto[w.label]! * w.cost}
                      </span>
                    </div>
                  ) : (
                    (() => {
                      // предмет необязательной модели (Banner of Macragge у Chapter Ancient) — столько, сколько таких моделей
                      const opt = optionalWargear(ds, w.label);
                      return (
                        <Row key={w.label} label={w.label} hint={t(`+${w.cost} за шт. · отмечается вручную${opt ? ` — если в отряде есть ${opt.subject}` : ''}`, `+${w.cost} each · set manually${opt ? ` — if the unit has ${opt.subject}` : ''}`)} warn={w.unverified ? t('не проверено', 'not verified') : undefined}>
                          <Counter value={c.unit.wargear[w.label] ?? 0} max={opt ? opt.max : Math.max(1, c.models)} onChange={(n) => onPatch({ wargear: { ...c.unit.wargear, [w.label]: n } })} />
                        </Row>
                      );
                    })()
                  ),
                )}
              </div>
            </Field>
          )}

          {ds.character && !ds.group.startsWith('ally:') && (
            <button
              type="button"
              onClick={onWarlord}
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13.5px] font-semibold text-white/85 active:bg-white/10"
            >
              <Icon name="crown" className={cx('size-4', isWarlord ? 'text-accent' : 'text-fg-3')} />
              <span className="flex-1 text-left">Warlord</span>
              <span className={cx('relative h-5 w-9 rounded-full transition', isWarlord ? 'bg-accent' : 'bg-white/15')}>
                <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', isWarlord ? 'left-[18px] bg-black' : 'left-0.5')} />
              </span>
            </button>
          )}

          {(enhOptions.length > 0 || c.enhancement) && (
            <Field label={t('Улучшение', 'Enhancement')} hint={`${cr.enhancementsUsed}/${cr.enhancementsLimit}`}>
              {enhBlocked ? (
                <p className="text-[13px] text-fg-3">{enhBlocked}</p>
              ) : (
                <div className="space-y-1">
                  <Choice active={!c.unit.enhancementId} onClick={() => onPatch({ enhancementId: null })} title={t('Без улучшения', 'No Enhancement')} />
                  {enhOptions.map((e) => {
                    const used = usedBy.get(e.id) ?? 0;
                    const re = ruEnhancement(ru, e.id);
                    const taken = !e.upgrade && used > 0;
                    return (
                      <Choice
                        key={e.id}
                        active={c.unit.enhancementId === e.id}
                        onClick={() => onPatch({ enhancementId: e.id })}
                        title={re ? ruName(re.name, ruleLabel(e)) : ruleLabel(e)}
                        right={`${e.cost} ${t('очк.', 'pts')}`}
                        sub={[e.upgrade ? t(`Upgrade · до 3 юнитов${used ? ` (занято ${used})` : ''}`, `Upgrade · up to 3 units${used ? ` (${used} used)` : ''}`) : taken ? t('уже взято другим юнитом', 'already taken by another unit') : '', e.restriction].filter(Boolean).join(' · ')}
                        dim={taken}
                        detail={re ? ruPlain(re.text) + (isWarphub(re) ? `\n\n${WARPHUB_LABEL}` : '') : e.text}
                      />
                    );
                  })}
                </div>
              )}
            </Field>
          )}

          {ds.leads.length > 0 && (
            <Field label={ds.support ? t('Присоединить (Support)', 'Attach (Support)') : t('Присоединить (Leader)', 'Attach (Leader)')}>
              {bodyguards.length === 0 && !c.unit.attachedTo ? (
                <p className="text-[13px] text-fg-3">
                  {t('В ростере нет подходящих отрядов. Может вести:', 'No suitable units in the roster. Can lead:')} {ds.leads.map((id) => L.ds.get(id)?.name).filter(Boolean).slice(0, 8).join(', ')}
                  {ds.leads.length > 8 ? '…' : ''}
                </p>
              ) : (
                <div className="space-y-1">
                  <Choice active={!c.unit.attachedTo} onClick={() => onPatch({ attachedTo: null })} title={t('Отдельно', 'Not attached')} />
                  {bodyguards.map((b) => (
                    <Choice
                      key={b.unit.uid}
                      active={c.unit.attachedTo === b.unit.uid}
                      onClick={() => onPatch({ attachedTo: b.unit.uid })}
                      title={b.ds!.name + (b.copy > 1 ? ` #${b.copy}` : '')}
                      sub={b.attached.filter((a) => a.uid !== c.unit.uid).map((a) => cr.byUid.get(a.uid)?.ds?.name).filter(Boolean).join(', ') || undefined}
                    />
                  ))}
                </div>
              )}
              {ds.leaderNote &&
                (ruDatasheet(ru, ds.id)?.leaderNote ? (
                  <div className="text-xs text-fg-3">
                    <RuleRichText text={ruDatasheet(ru, ds.id)!.leaderNote!} g={g} className="leading-relaxed" />
                    {ruDatasheet(ru, ds.id)?.warphub?.includes('leaderNote') && <p className="mt-0.5 text-[12px]">{WARPHUB_LABEL}</p>}
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-xs text-fg-3">{cleanRuleText(ds.leaderNote)}</p>
                ))}
            </Field>
          )}

              </div>
            </details>
          )}

          <CombinedUnit c={c} cr={cr} L={L} detachmentIds={roster.detachmentIds} />

          <div className="flex gap-2 pt-1">
            {!readOnly && (
              <Button variant="ghost" className="flex-1" onClick={onDuplicate}>
                <Icon name="copy" className="size-4" /> {t('Копия', 'Copy')}
              </Button>
            )}
            {ds.link && (
              <Button variant="ghost" className="flex-1" onClick={() => openExternal(ds.link)}>
                <Icon name="link" className="size-4" /> {linkLabel(ds.link)}
              </Button>
            )}
            {!readOnly && (
              <Button variant="danger" className="px-3" onClick={onRemove}>
                <Icon name="trash" className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Итог выбора юнита для режима просмотра: состав, снаряжение, Warlord, улучшение, присоединение. */
function ReadOnlyChoices({ c, cr, isWarlord, attachedTo, ru }: { c: ComputedUnit; cr: ComputedRoster; isWarlord: boolean; attachedTo: string | null; ru: RuOverlay | null }) {
  const en = useEn();
  const t = useT();
  const lines: [string, string][] = [];
  if (c.unit.size) lines.push([t('Состав', 'Unit size'), en ? c.unit.size : sizeLabelRu(c.unit.size)]);
  const extras = [...Object.entries(c.unit.addons), ...Object.entries(paidWargear(c))].filter(([, n]) => n > 0).map(([l, n]) => `${n}× ${l}`);
  if (extras.length) lines.push([t('Дополнительно', 'Extras'), extras.join(', ')]);
  if (isWarlord) lines.push(['Warlord', t('да', 'yes')]);
  if (attachedTo) lines.push([t('Присоединён к', 'Attached to'), attachedTo]);
  return (
    <div className="space-y-2">
      {lines.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-1">
          {lines.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{k}</span>
              <span className="text-right text-[13px] font-semibold text-white/85">{v}</span>
            </div>
          ))}
        </div>
      )}
      {c.enhancement && <RuleText name={c.enhancement.name} sub={t(`Улучшение · ${c.enhancement.cost} очк. · ${cr.enhancementsUsed}/${cr.enhancementsLimit}`, `Enhancement · ${c.enhancement.cost} pts · ${cr.enhancementsUsed}/${cr.enhancementsLimit}`)} text={c.enhancement.text} ru={ruEnhancement(ru, c.enhancement.id)} open />}
    </div>
  );
}

function addonMax(composition: string[], label: string): number {
  const name = label.replace(/^\d+\s*/, '').toLowerCase();
  for (const line of composition) {
    const m = line.match(/^(\d+)(?:-(\d+))?\s+(.+)$/);
    if (m && m[3].toLowerCase().includes(name)) return +(m[2] ?? m[1]);
  }
  return 1;
}

function Row({ label, hint, warn, children }: { label: string; hint: string; warn?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-xs text-fg-3">
          {hint}
          {warn && <span className="text-warn"> · {warn}</span>}
        </p>
      </div>
      {children}
    </div>
  );
}

function Choice({ active, onClick, title, right, sub, dim, detail }: { active: boolean; onClick: () => void; title: string; right?: string; sub?: string; dim?: boolean; detail?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-lg border px-3 py-[7px] text-left transition',
        active ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
        dim && !active && 'opacity-50',
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className={cx('flex-1 text-[13.5px] font-semibold', active ? 'text-accent' : 'text-white/85')}>{title}</span>
        {right && <span className={cx('shrink-0 text-xs font-semibold tabular-nums', active ? 'text-accent' : 'text-fg-3')}>{right}</span>}
      </span>
      {sub && <span className="mt-0.5 block text-xs text-fg-3">{sub}</span>}
      {active && detail && <span className="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-fg-2">{cleanRuleText(detail)}</span>}
    </button>
  );
}

function Profile({ c, cr, L, detachmentIds }: { c: ComputedUnit; cr: ComputedRoster; L: DataLookup; detachmentIds: string[] }) {
  const en = useEn();
  const t = useT();
  const ds = c.ds!;
  const [allWeapons, setAllWeapons] = useState(false);
  // армейское правило (faction) — в строке «Действует на юнит» с пометкой АРМИЯ; здесь — основные способности
  const tagAbilities = ds.abilities.filter((a) => a.type === 'core');
  const applied = unitAppliedRules(c, cr, L, detachmentIds);
  const textAbilities = ds.abilities.filter((a) => a.type !== 'core' && a.type !== 'faction');
  const g = useGlossary();
  const ru = useRu(L.faction.id);
  const rds = ruDatasheet(ru, ds.id);
  const moreSummary = [textAbilities.length ? textAbilities.map((a) => a.name).join(', ') : null, ds.composition.length ? t('состав', 'composition') : null, t('ключевые слова', 'keywords')].filter(Boolean).join(' · ');
  // в обычном виде — только оружие, которое сейчас есть у отряда; полный список — по кнопке
  const count = countIn(c.loadout);
  const equipped = ds.weapons.filter((w) => count(w.name) > 0);
  const shown = allWeapons || !equipped.length ? ds.weapons : equipped;
  const hidden = ds.weapons.length - equipped.length;
  const ranged = shown.filter((w) => w.profiles.some((p) => p.type !== 'Melee'));
  const melee = shown.filter((w) => w.profiles.every((p) => p.type === 'Melee'));
  // 01.11.2026 (по образцу wh-rules.ru): при открытии юнита сразу видны характеристики, оружие и способности-чипы;
  // тексты способностей, правила детачмента, состав и ключевые слова — в свёрнутом блоке ниже
  return (
    <>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 pb-3 pt-3">
        {ds.stats.length > 0 && (
          // 07.11.2026: таблица помещается в ширину экрана — имя модели строкой над значениями (если моделей несколько)
          <table className="stat-grid w-full table-fixed text-center text-[13px]">
            <thead>
              <tr className="text-[12px] uppercase text-fg-3">
                {['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((h) => (
                  <th key={h} className="pb-1 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {ds.stats.map((m, i) => (
              <tbody key={i} className="border-t border-white/[0.05]">
                {ds.stats.length > 1 && (
                  <tr>
                    <td colSpan={6} className="truncate pt-1.5 text-left text-xs text-fg-2">
                      {m.name}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1.5">{m.M}</td>
                  <td>{m.T}</td>
                  <td className="whitespace-nowrap">
                    {m.Sv}
                    {m.inv && <span className="text-accent/80">/{m.inv}++</span>}
                  </td>
                  <td>{m.W}</td>
                  <td>{m.Ld}</td>
                  <td>{m.OC}</td>
                </tr>
              </tbody>
            ))}
          </table>
        )}
        {ds.invulnNote && <p className="text-xs text-fg-3">{ru ? invulnNoteRu(ds.invulnNote) : ds.invulnNote}</p>}
        {ranged.length > 0 && <WeaponTable title={t('Дальнобойное оружие', 'Ranged weapons')} skill="BS" weapons={ranged} count={count} />}
        {melee.length > 0 && <WeaponTable title={t('Ближний бой', 'Melee weapons')} skill="WS" weapons={melee} count={count} />}
        {equipped.length > 0 && hidden > 0 && (
          <button type="button" onClick={() => setAllWeapons((v) => !v)} className="text-xs font-semibold text-accent/90">
            {allWeapons ? t('Показать только снаряжение отряда', 'Show only the unit’s wargear') : t(`Показать все варианты оружия (+${hidden})`, `Show all weapon options (+${hidden})`)}
          </button>
        )}
        {tagAbilities.length > 0 && (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Способности', 'Abilities')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {tagAbilities.map((a, i) => (
                <RuleChip key={i} name={a.name + (a.param ? ' ' + a.param : '')} text={a.ref ? L.faction.rules[a.ref]?.text ?? '' : a.text} accent={a.type === 'faction'} core={a.type === 'core'} ru={ruOf(ru, ds.id, a)} />
              ))}
            </div>
          </div>
        )}
        {(applied.army.length > 0 || applied.det.length > 0) && (
          // 07.11.2026: какие правила армии и детачмента действуют на юнит — сразу видно при открытии (по образцу Warmind)
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Действует на юнит', 'Applies to this unit')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {applied.army.map((r, i) => (
                <RuleChip key={'a' + i} tag={t('Армия', 'Army')} name={r.name} text={r.text} accent ru={ruOf(ru, ds.id, r.ability)} />
              ))}
              {applied.det.map((r) => (
                <RuleChip key={r.id} tag={t('Детачмент', 'Detachment')} name={r.name + (r.own ? '' : ` · ${t('через', 'via')} ${r.via.join(', ')}`)} text={`${r.det}\n\n${r.text}`} accent ru={ruDetachmentRuleById(ru, r.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-fg-2">
          <span className="min-w-0">
            {t('Способности и подробности', 'Abilities and details')}
            <span className="block truncate text-[12px] font-normal text-fg-3">{moreSummary}</span>
          </span>
          <Icon name="down" className="size-4 shrink-0 text-fg-3 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">
          {textAbilities.map((a, i) => {
            // 01.11.2026: русский текст с wh-rules.ru, если есть (название «Русское (English)», термины нажимаются)
            const r = ruOf(ru, ds.id, a);
            return (
              <div key={i}>
                <p className="text-[13px] font-semibold text-accent/90">
                  {r ? ruName(r.name, a.name) : a.name}
                  {a.param ? ` ${a.param}` : ''}
                  {a.type === 'wargear' && <span className="ml-1.5 text-[12px] font-medium uppercase text-fg-3">{t('снаряжение', 'wargear')}</span>}
                </p>
                {r ? (
                  <RuleRichText text={r.text} g={g} className="mt-0.5 text-[13px] leading-relaxed text-fg-2" />
                ) : (
                  <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{cleanRuleText(a.ref ? L.faction.rules[a.ref]?.text : a.text)}</p>
                )}
                {!r && a.incomplete && (
                  <p className="mt-1 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[12px] leading-snug text-amber-100">
                    {en ? (a.incomplete === 'table' ? 'The rule has a table or diagram that is not in the Wahapedia export.' : 'The text is cut off in the Wahapedia export (1024-character limit) — the end of the rule is not shown.') : INCOMPLETE_TEXT[a.incomplete]}{' '}
                    <button type="button" onClick={() => openExternal(ds.link)} className="font-semibold text-accent underline underline-offset-2">
                      {t('Полный текст', 'Full text')} — {linkLabel(ds.link)}
                    </button>
                  </p>
                )}
              </div>
            );
          })}
          <UnitRules c={c} L={L} detachmentIds={detachmentIds} ru={ru} />
          {ds.damaged && <Txt title={t(`Повреждён: ${ds.damaged.w} ран`, `Damaged: ${ds.damaged.w} wounds remaining`)} text={ds.damaged.text} ru={rds?.damaged} g={g} warphub={rds?.warphub?.includes('damaged')} />}
          {ds.composition.length > 0 && <Txt title={t('Состав отряда', 'Unit composition')} text={ds.composition.join('\n')} ru={ru ? compositionRu(ds.composition).join('\n') : null} />}
          {ds.loadout && <Txt title={t('Снаряжение', 'Wargear')} text={ds.loadout} ru={rds?.loadout} g={g} warphub={rds?.warphub?.includes('loadout')} />}
          {rds?.options && <Txt title={t('Варианты снаряжения', 'Wargear options')} text="" ru={rds.options.map((o) => `▪ ${o}`).join('\n')} g={g} warphub={rds.warphub?.includes('options')} />}
          {ds.transport && <Txt title={t('Транспорт', 'Transport')} text={ds.transport} ru={rds?.transport} g={g} warphub={rds?.warphub?.includes('transport')} />}
          <div className="flex flex-wrap gap-1">
            {ds.keywords.map((k) =>
              g && findKeyword(g, k) ? (
                <RuleTrigger key={k} source={{ lookup: 'keyword', label: k }} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[12px] font-semibold uppercase leading-none tracking-wide text-fg-2 underline decoration-accent/50 decoration-dotted underline-offset-2">
                  {k}
                </RuleTrigger>
              ) : (
                <Tag key={k}>{k}</Tag>
              ),
            )}
          </div>
          <p className="text-[12px] text-fg-3">{ds.source}</p>
        </div>
      </details>
    </>
  );
}

function Txt({ title, text, ru, g, warphub }: { title: string; text: string; ru?: string | null; g?: Glossary | null; warphub?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">
        {title}
        {ru && warphub && <span className="font-normal normal-case tracking-normal"> · {WARPHUB_LABEL}</span>}
      </p>
      {ru ? <RuleRichText text={ru} g={g ?? null} className="mt-0.5 text-[13px] leading-relaxed text-fg-2" /> : <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{cleanRuleText(text)}</p>}
    </div>
  );
}

/** Русский текст способности инфолиста (wh-rules.ru): армейское правило по ссылке или способность самого инфолиста. */
const ruOf = (ru: RuOverlay | null, dsId: string, a: Datasheet['abilities'][number]): RuText | null =>
  a.type === 'core' ? null : a.type === 'faction' ? ruRule(ru, a.ref) : ruAbility(ru, dsId, a.name);

/**
 * Русские тексты вариантов снаряжения по индексу ds.options. Сайт отдаёт варианты без «None» и пустых строк, в том же порядке;
 * число не совпало — не сопоставлять (показывается английский).
 */
function optionTextsRu(ds: Datasheet, ru: string[] | undefined): (string | undefined)[] | null {
  if (!ru?.length) return null;
  const idx = ds.options.map((o, i) => ({ t: (o.text ?? '').trim(), i })).filter((x) => x.t && x.t.toLowerCase() !== 'none');
  if (idx.length !== ru.length) return null;
  const out: (string | undefined)[] = [];
  idx.forEach((x, k) => (out[x.i] = ru[k]));
  return out;
}

/** Сколько штук оружия в снаряжении (без учёта регистра и апострофов). */
function countIn(loadout: Record<string, number>) {
  const k = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
  const m = new Map(Object.entries(loadout).map(([w, n]) => [k(w), n]));
  return (name: string) => m.get(k(name)) ?? 0;
}

function WeaponTable({ title, skill, weapons, count }: { title: string; skill: string; weapons: Weapon[]; count: (name: string) => number }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{title}</p>
      {/* 07.11.2026: название и способности оружия — строкой над значениями, таблица помещается в ширину экрана */}
      <table className="stat-grid mt-1 w-full table-fixed text-center text-[12px]">
        <thead>
          <tr className="text-[12px] uppercase text-fg-3">
            {['Range', 'A', skill, 'S', 'AP', 'D'].map((h) => (
              <th key={h} className="px-0.5 pb-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        {weapons.flatMap((w) =>
          w.profiles.map((p, i) => (
            <tbody key={w.name + i} className={cx(i === 0 && 'border-t border-white/[0.05]', count(w.name) ? 'text-white' : 'text-fg-3')}>
              <tr>
                <td colSpan={6} className="pt-1.5 text-left">
                  <span className="block text-[12px] font-semibold leading-tight">
                    {w.profiles.length > 1 ? p.name : w.name}
                    {i === 0 && count(w.name) ? <span className="ml-1 text-accent">×{count(w.name)}</span> : null}
                  </span>
                  {p.keywords && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {splitWeaponKeywords(p.keywords).map((k) => (
                        <WeaponAbilityTag key={k} label={k} />
                      ))}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-0.5 py-1">{p.type === 'Melee' ? '—' : fmtRange(p.range)}</td>
                <td className="px-0.5 py-1">{p.A}</td>
                <td className="px-0.5 py-1">{fmtSkill(p.skill)}</td>
                <td className="px-0.5 py-1">{p.S}</td>
                <td className="px-0.5 py-1">{p.AP}</td>
                <td className="px-0.5 py-1">{p.D}</td>
              </tr>
            </tbody>
          )),
        )}
      </table>
    </div>
  );
}

/** Способность-чип: нажатие открывает подсказку. Основные способности (core) — текст из глоссария (wh-rules.ru, раздел 24), остальные — свой текст. */
function RuleChip({ name, text, accent, core, ru, tag }: { name: string; text: string; accent?: boolean; core?: boolean; ru?: RuText | null; tag?: string }) {
  return (
    <RuleTrigger
      source={core ? { lookup: 'ability', label: name } : ru ? { title: ruName(ru.name, name), text: ru.text, rich: true, ...(isWarphub(ru) ? { sub: WARPHUB_LABEL } : {}) } : { title: name, text }}
      className={cx('rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-wide', accent ? 'bg-accent/15 text-accent' : 'bg-white/[0.07] text-fg-2')}
    >
      {tag && <span className="mr-1.5 rounded bg-black/25 px-1 py-px text-[10px] font-bold tracking-wider opacity-80">{tag}</span>}
      {name}
    </RuleTrigger>
  );
}

const wkey = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/e?s$/, '');

/**
 * Снаряжение: стандартное по инфолисту + замены из вариантов инфолиста. Счётчики не дают выйти за лимиты
 * («1 на каждые 10 моделей», «только Nob») и заменить оружие, которого в отряде уже нет.
 */
function LoadoutEditor({ c, onPatch, ru }: { c: ComputedUnit; onPatch: (p: Partial<RosterUnit>) => void; ru: RuOverlay | null }) {
  const t = useT();
  const ds = c.ds!;
  const ruOpts = optionTextsRu(ds, ruDatasheet(ru, ds.id)?.options);
  const info = optionsOf(ds);
  const [open, setOpen] = useState(false);
  const picks = c.unit.picks ?? {};
  const legacy = !!c.unit.weapons && !c.unit.picks;
  const custom = c.loadoutCustom || legacy;
  const paid = new Map((c.band?.wargear ?? []).map((w) => [wkey(w.label), w.cost]));
  const summary = Object.entries(c.loadout)
    .map(([k, n]) => `${n}× ${k}`)
    .join(', ');
  const setPick = (key: string, ci: number, n: number) => {
    const cur = [...(picks[key] ?? [])];
    while (cur.length <= ci) cur.push(0);
    cur[ci] = n;
    const next = { ...picks, [key]: cur };
    if (cur.every((x) => !x)) delete next[key];
    onPatch({ picks: Object.keys(next).length ? next : null, weapons: null });
  };
  const notes = [...info.unparsed, ...info.notes].sort((x, y) => x - y);
  return (
    <Field label={t('Снаряжение', 'Wargear')} hint={custom ? t('изменено', 'changed') : t('по умолчанию', 'default')}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">{summary || t('Не выбрано', 'Nothing chosen')}</span>
        <Icon name="down" className={cx('size-4 shrink-0 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2">
          {legacy && (
            <p className="rounded-lg bg-warn/10 px-2.5 py-2 text-[12.5px] text-amber-200">
              {t('Снаряжение было задано вручную в старой версии и не проверено. Нажмите «Вернуть стандартное» и выберите замены заново.', 'The wargear was set manually in an old version and is not validated. Tap “Reset to default” and choose the swaps again.')}
            </p>
          )}
          {info.parsed.length === 0 && !notes.length && <p className="text-[13px] text-fg-3">{t('У этого юнита нет вариантов замены снаряжения.', 'This unit has no wargear options.')}</p>}
          {info.parsed.map((o) => (
            <OptionCard key={o.key} o={o} c={c} picks={picks[o.key] ?? []} paid={paid} onPick={(ci, n) => setPick(o.key, ci, n)} />
          ))}
          {notes.length > 0 && (
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">
                {info.unparsed.length ? t('Не выбирается автоматически — только как пояснение', 'Not selectable automatically — for reference only') : t('Пояснения', 'Notes')}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {notes.map((i) => (
                  <li key={i} className="whitespace-pre-line text-[12px] leading-relaxed text-fg-2">
                    {ds.options[i]!.star ? '* ' : '• '}
                    {ruOpts?.[i] ? ruPlain(ruOpts[i]!) : ds.options[i]!.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {custom && (
            <Button variant="ghost" className="w-full" onClick={() => onPatch({ picks: null, weapons: null })}>
              {t('Вернуть стандартное снаряжение', 'Reset to default wargear')}
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

function OptionCard({ o, c, picks, paid, onPick }: { o: ParsedOption; c: ComputedUnit; picks: number[]; paid: Map<string, number>; onPick: (ci: number, n: number) => void }) {
  const en = useEn();
  const t = useT();
  const limit = (c.loadoutInfo.limits[o.key] ?? 0) * o.perModel;
  const max = c.loadoutInfo.max[o.key] ?? [];
  const used = picks.reduce((s, n) => s + (n > 0 ? n : 0), 0);
  const name = (items: { weapon: string; qty: number }[]) => items.map((i) => (i.qty > 1 ? `${i.qty}× ` : '') + i.weapon).join(' + ');
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 pb-2 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{whoText(o, en ? 'en' : 'ru')}</p>
        <p className={cx('shrink-0 text-[12px] font-semibold tabular-nums', limit ? 'text-fg-3' : 'text-fg-3')}>{limit ? `${used}/${limit}` : t('недоступно', 'unavailable')}</p>
      </div>
      {o.from.length > 0 && <p className="mt-0.5 text-[12.5px] text-fg-2">{t('Заменить:', 'Replace:')} {name(o.from)}</p>}
      {o.requires.length > 0 && <p className="mt-0.5 text-[12px] text-fg-3">{t('Если есть:', 'If it has:')} {name(o.requires)}</p>}
      {o.forbids.length > 0 && <p className="mt-0.5 text-[12px] text-fg-3">{t('Если нет:', 'If it does not have:')} {name(o.forbids)}</p>}
      {!limit && o.minModels > 0 && <p className="mt-0.5 text-[12px] text-fg-3">{t(`Нужно не меньше ${o.minModels} моделей в отряде.`, `The unit needs at least ${o.minModels} models.`)}</p>}
      <div className="mt-1.5 space-y-1">
        {o.choices.map((choice, ci) => {
          const cost = choice.reduce((s, it) => s + (paid.get(wkey(it.weapon)) ?? 0) * it.qty, 0);
          return (
            <div key={ci} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className={cx('text-[13.5px] font-semibold leading-tight', (picks[ci] ?? 0) > 0 ? 'text-accent' : 'text-white/85')}>{name(choice)}</p>
                {cost > 0 && <p className="text-[12px] text-fg-3">+{cost} {t('очк. за модель', 'pts per model')}</p>}
              </div>
              <Counter value={picks[ci] ?? 0} max={Math.max(picks[ci] ?? 0, max[ci] ?? 0)} onChange={(n) => onPick(ci, n)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CombinedUnit({ c, cr, L, detachmentIds }: { c: ComputedUnit; cr: ComputedRoster; L: DataLookup; detachmentIds: string[] }) {
  const t = useT();
  const ru = useRu(L.faction.id);
  const members = groupOf(c, cr);
  if (members.length < 2) return null;
  const rules = groupDetRules(members, L, detachmentIds);
  const text = (a: Datasheet['abilities'][number]) => (a.ref ? (L.faction.rules[a.ref]?.text ?? '') : a.text);
  return (
    <details className="group rounded-xl border border-accent/25 bg-accent/[0.04]" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold uppercase tracking-wider text-accent/80">{t('Совместный отряд', 'Combined unit')}</span>
          <span className="block truncate text-sm font-semibold text-white/85">{members.map((m) => m.ds!.name).join(' + ')}</span>
        </span>
        <Icon name="down" className="size-4 shrink-0 text-fg-3 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">
        <p className="text-[12px] leading-relaxed text-fg-3">{t('Способности каждой части отряда. Нажмите на название, чтобы прочитать текст.', 'Abilities of each part of the unit. Tap a name to read the text.')}</p>
        {members.map((m) => (
          <div key={m.unit.uid}>
            <p className="text-[12.5px] font-semibold text-white/85">
              {m.ds!.name}
              <span className="ml-1.5 text-[12px] font-semibold uppercase tracking-wider text-accent/70">{roleOf(m)}</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {m.ds!.abilities.map((a, i) => (
                <RuleChip key={i} name={a.name + (a.param ? ' ' + a.param : '')} text={text(a)} accent={a.type === 'faction'} core={a.type === 'core'} ru={ruOf(ru, m.ds!.id, a)} />
              ))}
            </div>
          </div>
        ))}
        {rules.length > 0 && (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Правила детачмента для всего отряда', 'Detachment rules for the whole unit')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {rules.map((r) => (
                <RuleChip
                  key={r.id}
                  name={r.name + (r.via.length < members.length ? ` · ${t('через', 'via')} ${r.via.join(', ')}` : '')}
                  text={`${r.det}\n\n${r.text}`}
                  accent
                  ru={ruDetachmentRuleById(ru, r.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

/** Стратагемы, доступные юниту (правила армии и детачмента — в строке «Действует на юнит» выше). */
function UnitRules({ c, L, detachmentIds, ru }: { c: ComputedUnit; L: DataLookup; detachmentIds: string[]; ru: RuOverlay | null }) {
  const t = useT();
  const ds = c.ds!;
  const detIds = new Set(detachmentIds);
  const strats = L.faction.stratagems.filter((st) => ds.stratagems.includes(st.id) && (!st.detachment || detIds.has(st.detachment)) && visibleStratagem(st, L.det));
  if (!strats.length) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{t('Стратагемы', 'Stratagems')} ({strats.length})</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {strats.map((st) => (
            <RuleChip key={st.id} name={`${st.name} · ${st.cp}`} text={`${st.type}${st.phase ? ' · ' + st.phase : ''}\n\n${st.text}`} accent={!!st.detachment} ru={ruStratagem(ru, st.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
