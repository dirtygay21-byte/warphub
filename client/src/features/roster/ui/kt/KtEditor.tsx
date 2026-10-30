import { useEffect, useMemo, useState } from 'react';
import { loadKtTeam } from '../../data';
import { addOperative, checkKtRoster, encodeKtRoster, removeOperative, toggleEquipment, touchKt, updateOperative, type KtRoster, type KtRosterOp } from '../../kt/roster';
import type { KtIndex, KtOperative, KtTeam, KtWeapon } from '../../kt/types';
import { confirmAsk, haptic, shareText } from '../../telegram';
import { Button, Icon, IconButton, Segmented, Sheet, Tag } from '../kit';
import { cx } from '../util';
import { Md } from './Md';

type Tab = 'ops' | 'ploys' | 'equip' | 'team';

/** Редактор команды Kill Team (W3 30.10.2026): оперативники и оружие, снаряжение, уловки, состав и проверки. */
export function KtEditor({ roster, index, onBack, onChange, onDelete }: { roster: KtRoster; index: KtIndex; onBack: () => void; onChange: (r: KtRoster) => void; onDelete: () => void }) {
  const [team, setTeam] = useState<KtTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadKtTeam(roster.teamId).then(setTeam, (e) => setError(String(e?.message ?? e)));
  }, [roster.teamId]);
  const issues = useMemo(() => (team ? checkKtRoster(roster, team) : []), [roster, team]);
  // краткая сводка для списка
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

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <p className="text-sm text-white/55">{error}</p>
        <Button className="mt-4" onClick={onBack}>
          Назад
        </Button>
      </div>
    );
  if (!team) return <div className="mx-auto mt-24 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const opOf = (x: KtRosterOp) => team.operatives.find((o) => o.id === x.opTypeId);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-5 lg:max-w-3xl lg:pt-8">
      <header className="mb-3 flex items-start gap-3">
        <IconButton icon="back" label="К списку" onClick={onBack} className="mt-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Kill Team · {team.name}</p>
          <input
            value={roster.name}
            onChange={(e) => onChange(touchKt({ ...roster, name: e.target.value.slice(0, 80) }))}
            className="font-display mt-1 w-full bg-transparent text-2xl font-semibold uppercase leading-none outline-none"
            aria-label="Название команды"
          />
          <p className="mt-1 text-[11px] text-white/45">
            оперативников: {roster.operatives.length} · снаряжение: {roster.equipment.length}
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
          { value: 'ops', label: 'Оперативники' },
          { value: 'equip', label: 'Снаряжение' },
          { value: 'ploys', label: 'Уловки' },
          { value: 'team', label: 'Команда' },
        ]}
      />
      {tab === 'ops' && (
        <section className="space-y-2.5">
          {roster.operatives.map((x, n) => {
            const o = opOf(x);
            return o ? (
              <OpCard key={x.uid} n={n + 1} x={x} o={o} onChange={(p) => onChange(updateOperative(roster, x.uid, p))} onRemove={() => onChange(removeOperative(roster, x.uid))} />
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
      {tab === 'equip' && (
        <section className="space-y-2">
          {!team.equipment.length && <p className="text-sm text-white/50">В данных нет снаряжения этой команды.</p>}
          {team.equipment.map((e) => {
            const on = roster.equipment.includes(e.id);
            return (
              <label key={e.id} className={cx('block cursor-pointer rounded-2xl border p-3', on ? 'border-accent/50 bg-accent/[0.06]' : 'border-white/10 bg-white/[0.03]')}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => (haptic.select(), onChange(toggleEquipment(roster, e.id)))} className="size-5 accent-accent" />
                  <span className="text-sm font-semibold">{e.name}</span>
                </span>
                <Md text={e.text} />
              </label>
            );
          })}
          <p className="text-[11px] text-white/35">Лимит снаряжения в данных источника не записан — смотрите правила редакции.</p>
        </section>
      )}
      {tab === 'ploys' && (
        <section className="space-y-3">
          {(['strategy', 'firefight', 'rule'] as const).map((type) => {
            const list = team.ploys.filter((p) => p.type === type);
            if (!list.length) return null;
            return (
              <div key={type}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{type === 'strategy' ? 'Стратегические уловки' : type === 'firefight' ? 'Боевые уловки' : 'Правила команды'}</p>
                <div className="space-y-2">
                  {list.map((p) => (
                    <details key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold">{p.name}</summary>
                      <Md text={p.text} />
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
      {tab === 'team' && (
        <section className="space-y-3">
          {team.archetypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {team.archetypes.map((a) => (
                <Tag key={a}>{a}</Tag>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Состав команды</p>
            {team.composition ? <Md text={team.composition} /> : <p className="text-sm text-white/50">Нет данных о составе.</p>}
          </div>
          {team.description && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <Md text={team.description} className="text-[12.5px] italic leading-snug text-white/60" />
            </div>
          )}
          <p className="text-[11px] text-white/35">
            Данные: {index.source.name}, {index.source.date} ({index.source.commit}).
          </p>
        </section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Оперативник" tall>
        <ul className="space-y-1.5">
          {team.operatives.map((o) => {
            const count = roster.operatives.filter((x) => x.opTypeId === o.id).length;
            return (
              <li key={o.id}>
                <button type="button" onClick={() => (haptic.tap(), onChange(addOperative(roster, o)), setAdding(false))} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left active:bg-white/10">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm font-semibold">{o.name}</span>
                    {count > 0 && <Tag tone="accent">×{count}</Tag>}
                  </span>
                  <span className="block text-[11px] text-white/45">
                    APL {o.stats.apl} · Move {o.stats.move} · Save {o.stats.save} · Wounds {o.stats.wounds}
                    {o.keywords.includes('LEADER') ? ' · LEADER' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
      <ExportSheet open={exporting} onClose={() => setExporting(false)} roster={roster} team={team} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Команда">
        <Button
          variant="danger"
          className="w-full justify-start"
          onClick={async () => {
            if (await confirmAsk(`Удалить команду «${roster.name}»?`)) onDelete();
          }}
        >
          <Icon name="trash" /> Удалить команду
        </Button>
      </Sheet>
    </div>
  );
}

const STAT = (label: string, v: string | number) => (
  <div className="rounded-lg bg-white/[0.04] px-1 py-1 text-center">
    <p className="text-[9.5px] font-semibold uppercase text-white/40">{label}</p>
    <p className="font-display text-[16px] font-semibold leading-tight">{v}</p>
  </div>
);

function OpCard({ n, x, o, onChange, onRemove }: { n: number; x: KtRosterOp; o: KtOperative; onChange: (p: Partial<KtRosterOp>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const chosen = o.weapons.filter((w) => x.weapons.includes(w.id));
  const toggle = (w: KtWeapon) => (haptic.select(), onChange({ weapons: x.weapons.includes(w.id) ? x.weapons.filter((id) => id !== w.id) : [...x.weapons, w.id] }));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start gap-2">
        <span className="font-display mt-0.5 w-6 text-center text-lg font-semibold text-white/40">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{x.name || o.name}</p>
          {x.name && <p className="text-[11px] text-white/45">{o.name}</p>}
          <p className="mt-0.5 truncate text-[10.5px] text-white/40">{o.keywords.join(', ')}</p>
        </div>
        <IconButton icon={open ? 'down' : 'chevron'} label="Подробнее" onClick={() => setOpen((v) => !v)} className="size-8" />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {STAT('APL', o.stats.apl)}
        {STAT('Move', o.stats.move)}
        {STAT('Save', o.stats.save)}
        {STAT('Wounds', o.stats.wounds)}
      </div>
      <Weapons list={open ? o.weapons : chosen} chosen={x.weapons} onToggle={open ? toggle : undefined} />
      {open && (
        <div className="mt-2 space-y-2">
          <input
            value={x.name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })}
            placeholder="Своё имя оперативника"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {o.abilities.map((a) => (
            <div key={a.id} className="rounded-xl bg-black/20 px-3 py-2">
              <p className="text-[13px] font-semibold">
                {a.name}
                {a.ap != null && <span className="ml-1 text-[11px] font-normal text-accent">{a.ap} AP</span>}
              </p>
              <Md text={a.text} />
            </div>
          ))}
          {o.options.map((a) => (
            <div key={a.id} className="rounded-xl bg-black/20 px-3 py-2">
              <p className="text-[13px] font-semibold">{a.name}</p>
              <Md text={a.text} />
            </div>
          ))}
          <p className="text-[11px] text-white/40">База: {o.baseMm ? `${o.baseMm} мм` : 'нет данных'}</p>
          <Button variant="danger" className="w-full text-xs" onClick={onRemove}>
            <Icon name="trash" /> Убрать оперативника
          </Button>
        </div>
      )}
    </div>
  );
}

/** Оружие: профили (ATK, HIT, DMG, правила); в развёрнутой карточке — всё оружие с отметкой выбранного. */
function Weapons({ list, chosen, onToggle }: { list: KtWeapon[]; chosen: string[]; onToggle?: (w: KtWeapon) => void }) {
  if (!list.length) return <p className="mt-2 text-[12px] text-white/45">Оружие не выбрано — раскройте карточку.</p>;
  return (
    <ul className="mt-2 space-y-1">
      {list.map((w) => {
        const on = chosen.includes(w.id);
        return (
          <li key={w.id} className={cx('rounded-lg px-2 py-1.5', on ? 'bg-white/[0.05]' : 'opacity-60')}>
            <button type="button" disabled={!onToggle} onClick={() => onToggle?.(w)} className="flex w-full items-center gap-2 text-left">
              {onToggle && <span className={cx('flex size-4 items-center justify-center rounded border', on ? 'border-accent bg-accent text-black' : 'border-white/30')}>{on && <Icon name="check" className="size-3" />}</span>}
              <span className="text-[10px] font-semibold uppercase text-white/40">{w.type === 'ranged' ? 'Дальн.' : w.type === 'melee' ? 'Ближн.' : 'Снар.'}</span>
              <span className="min-w-0 flex-1 text-[13px] font-semibold">{w.name}</span>
            </button>
            {w.profiles.map((p, i) => (
              <p key={i} className="ml-6 text-[11.5px] tabular-nums text-white/70">
                {p.name && <b className="text-white/85">{p.name}: </b>}
                ATK {p.atk} · HIT {p.hit} · DMG {p.dmg}
                {p.rules && <span className="text-white/50"> · {p.rules}</span>}
              </p>
            ))}
          </li>
        );
      })}
    </ul>
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
      <pre className="whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11.5px] text-white/80">{text}</pre>
    </Sheet>
  );
}
