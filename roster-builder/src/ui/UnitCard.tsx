import type { ReactNode } from 'react';
import type { ComputedRoster, ComputedUnit, DataLookup, Issue } from '../engine/compute';
import type { Roster, RosterUnit } from '../engine/types';
import { openExternal } from '../telegram';
import { Button, Counter, Field, Icon, Segmented, Tag, cx, fmtPts } from './kit';

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
}) {
  const ds = c.ds;
  const isWarlord = roster.warlordUid === c.unit.uid;
  const hasErr = issues.some((i) => i.level === 'error');
  const hasWarn = !hasErr && issues.length > 0;

  if (!ds) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-sm">
        <span className="flex-1 text-danger">Инфолист не найден в текущих данных</span>
        <Button variant="danger" className="h-8 min-h-0" onClick={onRemove}>
          Убрать
        </Button>
      </div>
    );
  }

  const opt = c.band?.options.find((o) => o.label === c.unit.size);
  const attachedTo = c.unit.attachedTo ? cr.byUid.get(c.unit.attachedTo) : undefined;
  const meta: string[] = [];
  if (opt && (c.band!.options.length > 1 || opt.models > 1)) meta.push(opt.label);
  if (c.enhancement) meta.push(c.enhancement.name);
  for (const [l, n] of [...Object.entries(c.unit.addons), ...Object.entries(c.unit.wargear)]) if (n > 0) meta.push(`${n}× ${l}`);

  // доступные улучшения
  const enhOptions = L.faction.enhancements.filter((e) => roster.detachmentIds.includes(e.detachment) && ds.enhancements.includes(e.id));
  const enhBlocked = ds.epicHero ? 'Epic Hero не может получить улучшение' : ds.group.startsWith('ally:') ? 'Союзники не получают улучшения' : null;
  const usedBy = new Map<string, number>();
  for (const u of cr.units) if (u.unit.enhancementId && u.unit.uid !== c.unit.uid) usedBy.set(u.unit.enhancementId, (usedBy.get(u.unit.enhancementId) ?? 0) + 1);

  // к кому можно присоединить
  const bodyguards = ds.leads.length
    ? cr.units.filter((x) => x.unit.uid !== c.unit.uid && x.ds && ds.leads.includes(x.ds.id) && !x.unit.attachedTo)
    : [];

  return (
    <div
      id={'u-' + c.unit.uid}
      className={cx(
        'overflow-hidden rounded-xl border transition-colors',
        nested ? 'bg-app-elevated' : 'bg-app-elevated',
        hasErr ? 'border-danger/40' : hasWarn ? 'border-warn/30' : expanded ? 'border-white/20' : 'border-white/10',
      )}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-3.5 py-3 text-left active:bg-white/[0.02]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isWarlord && <Icon name="crown" className="size-4 shrink-0 text-accent" />}
            <p className="truncate text-[15px] font-semibold leading-snug">{ds.name}</p>
            {c.copy > 1 && <span className="shrink-0 text-xs font-semibold text-white/35">#{c.copy}</span>}
          </div>
          {(meta.length > 0 || attachedTo || ds.support) && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/50">
              {attachedTo?.ds && <span className="text-accent/80">{ds.support ? 'Support' : 'Leader'} → {attachedTo.ds.name}. </span>}
              {!attachedTo && ds.support && <span className="text-danger">Support — нужно присоединить. </span>}
              {meta.join(' · ')}
            </p>
          )}
          {(ds.legends || ds.group !== 'own' || c.isBattleline !== ds.battleline) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ds.legends && <Tag tone="warn">Legends</Tag>}
              {ds.group.startsWith('ally:') && <Tag>{L.faction.allies.find((a) => 'ally:' + a.key === ds.group)?.name ?? 'Союзник'}</Tag>}
              {ds.group.startsWith('det:') && <Tag>{L.det.get(ds.group.slice(4))?.name ?? 'Детачмент'}</Tag>}
              {c.isBattleline && !ds.battleline && <Tag tone="accent">Battleline (детачмент)</Tag>}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-semibold leading-none tabular-nums">{fmtPts(c.total)}</p>
          {(hasErr || hasWarn) && <Icon name="alert" className={cx('ml-auto mt-1.5 size-4', hasErr ? 'text-danger' : 'text-warn')} />}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-white/[0.06] px-3.5 pb-3.5 pt-3.5">
          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((i, n) => (
                <li key={n} className={cx('rounded-lg px-2.5 py-2 text-[13px]', i.level === 'error' ? 'bg-danger/10 text-red-200' : 'bg-warn/10 text-amber-200')}>
                  {i.message}
                </li>
              ))}
            </ul>
          )}

          {c.band && c.band.options.length > 1 && (
            <Field label="Состав" hint={c.band.from > 1 || c.band.to ? `цены для копии №${c.copy}` : undefined}>
              <Segmented value={c.unit.size} onChange={(size) => onPatch({ size })} options={c.band.options.map((o) => ({ value: o.label, label: o.label, hint: `${o.cost} очк.` }))} />
            </Field>
          )}
          {c.band && c.band.options.length === 1 && c.band.to !== null && (
            <p className="text-[13px] text-white/45">Цена для копии №{c.copy}: {c.band.options[0].cost} очк.</p>
          )}

          {!!c.band?.addons.length && (
            <Field label="Дополнительно">
              <div className="space-y-2">
                {c.band.addons.map((a) => (
                  <Row key={a.label} label={a.label} hint={`+${a.cost} очк.`}>
                    <Counter value={c.unit.addons[a.label] ?? 0} max={addonMax(ds.composition, a.label)} onChange={(n) => onPatch({ addons: { ...c.unit.addons, [a.label]: n } })} />
                  </Row>
                ))}
              </div>
            </Field>
          )}

          {!!c.band?.wargear.length && (
            <Field label="Платное снаряжение">
              <div className="space-y-2">
                {c.band.wargear.map((w) => (
                  <Row key={w.label} label={w.label} hint={`+${w.cost} за шт.`}>
                    <Counter value={c.unit.wargear[w.label] ?? 0} max={Math.max(1, c.models)} onChange={(n) => onPatch({ wargear: { ...c.unit.wargear, [w.label]: n } })} />
                  </Row>
                ))}
              </div>
            </Field>
          )}

          {ds.character && !ds.group.startsWith('ally:') && (
            <button
              type="button"
              onClick={onWarlord}
              className={cx(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold',
                isWarlord ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.03] text-white/80 active:bg-white/10',
              )}
            >
              <Icon name="crown" className="size-4" /> {isWarlord ? 'Warlord' : 'Назначить Warlord'}
            </button>
          )}

          {(enhOptions.length > 0 || c.enhancement) && (
            <Field label="Улучшение" hint={`${cr.enhancementsUsed}/${cr.enhancementsLimit}`}>
              {enhBlocked ? (
                <p className="text-[13px] text-white/45">{enhBlocked}</p>
              ) : (
                <div className="space-y-1.5">
                  <Choice active={!c.unit.enhancementId} onClick={() => onPatch({ enhancementId: null })} title="Без улучшения" />
                  {enhOptions.map((e) => {
                    const used = usedBy.get(e.id) ?? 0;
                    const taken = !e.upgrade && used > 0;
                    return (
                      <Choice
                        key={e.id}
                        active={c.unit.enhancementId === e.id}
                        onClick={() => onPatch({ enhancementId: e.id })}
                        title={e.name}
                        right={`${e.cost} очк.`}
                        sub={[e.upgrade ? `Upgrade · до 3 юнитов${used ? ` (занято ${used})` : ''}` : taken ? 'уже взято другим юнитом' : '', e.restriction].filter(Boolean).join(' · ')}
                        dim={taken}
                        detail={e.text}
                      />
                    );
                  })}
                </div>
              )}
            </Field>
          )}

          {ds.leads.length > 0 && (
            <Field label={ds.support ? 'Присоединить (Support)' : 'Присоединить (Leader)'}>
              {bodyguards.length === 0 && !c.unit.attachedTo ? (
                <p className="text-[13px] text-white/45">
                  В ростере нет подходящих отрядов. Может вести: {ds.leads.map((id) => L.ds.get(id)?.name).filter(Boolean).slice(0, 8).join(', ')}
                  {ds.leads.length > 8 ? '…' : ''}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Choice active={!c.unit.attachedTo} onClick={() => onPatch({ attachedTo: null })} title="Отдельно" />
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
              {ds.leaderNote && <p className="whitespace-pre-line text-xs text-white/40">{ds.leaderNote}</p>}
            </Field>
          )}

          <Profile c={c} />

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={onDuplicate}>
              <Icon name="copy" className="size-4" /> Копия
            </Button>
            {ds.link && (
              <Button variant="ghost" className="flex-1" onClick={() => openExternal(ds.link)}>
                <Icon name="link" className="size-4" /> Wahapedia
              </Button>
            )}
            <Button variant="danger" className="px-3" onClick={onRemove}>
              <Icon name="trash" className="size-4" />
            </Button>
          </div>
        </div>
      )}
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

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-xs text-white/45">{hint}</p>
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
        'w-full rounded-xl border px-3 py-2 text-left transition',
        active ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/[0.03] active:bg-white/10',
        dim && !active && 'opacity-50',
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className={cx('flex-1 text-sm font-semibold', active ? 'text-accent' : 'text-white/85')}>{title}</span>
        {right && <span className={cx('shrink-0 text-xs font-semibold tabular-nums', active ? 'text-accent' : 'text-white/50')}>{right}</span>}
      </span>
      {sub && <span className="mt-0.5 block text-xs text-white/45">{sub}</span>}
      {active && detail && <span className="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-white/60">{detail}</span>}
    </button>
  );
}

function Profile({ c }: { c: ComputedUnit }) {
  const ds = c.ds!;
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-white/75">
        Профиль
        <Icon name="down" className="size-4 text-white/40 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-3">
        {ds.stats.length > 0 && (
          <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
            <table className="stat-grid w-full min-w-[320px] text-center text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-white/40">
                  <th className="pb-1 text-left font-semibold"> </th>
                  {['M', 'T', 'Sv', 'W', 'Ld', 'OC'].map((h) => (
                    <th key={h} className="pb-1 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ds.stats.map((m, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    <td className="max-w-[9rem] truncate py-1.5 pr-2 text-left text-xs text-white/60">{m.name}</td>
                    <td>{m.M}</td>
                    <td>{m.T}</td>
                    <td>
                      {m.Sv}
                      {m.inv && <span className="text-accent/80">/{m.inv}++</span>}
                    </td>
                    <td>{m.W}</td>
                    <td>{m.Ld}</td>
                    <td>{m.OC}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ds.composition.length > 0 && <Txt title="Состав отряда" text={ds.composition.join('\n')} />}
        {ds.loadout && <Txt title="Снаряжение" text={ds.loadout} />}
        {ds.transport && <Txt title="Транспорт" text={ds.transport} />}
        <div className="flex flex-wrap gap-1">
          {ds.keywords.slice(0, 14).map((k) => (
            <Tag key={k}>{k}</Tag>
          ))}
        </div>
        <p className="text-[11px] text-white/30">{ds.source}</p>
      </div>
    </details>
  );
}

function Txt({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</p>
      <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-white/70">{text}</p>
    </div>
  );
}
