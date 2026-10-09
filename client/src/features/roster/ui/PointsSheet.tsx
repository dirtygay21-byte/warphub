import { useState, type ReactNode } from 'react';
import { AOS_VP, type PointCategory, type PointSystem } from '../points';
import { haptic, openExternal } from '../telegram';
import { Icon, Segmented, Sheet, Tag } from './kit';
import { cx } from './util';

/*
 * Лист «Очки»: очки сборки армии (посчитаны движком ростера) отдельно от очков в партии (VP, CP).
 * Общий для 40K и AoS — содержимое приходит списком PointSystem (points.ts).
 */

const CATEGORY: Record<PointCategory, { title: string; hint: string }> = {
  army: { title: 'Сборка армии', hint: 'Считается по вашему ростеру.' },
  game: { title: 'Во время партии', hint: 'Набираются и тратятся в игре — конструктор их не начисляет.' },
};

const STATUS: Record<PointSystem['status'], { label: string; tone: 'accent' | 'muted' | 'warn' }> = {
  computed: { label: 'по ростеру', tone: 'accent' },
  reference: { label: 'справка', tone: 'muted' },
  unavailable: { label: 'нет данных', tone: 'warn' },
};

function SystemCard({ s }: { s: PointSystem }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{s.title}</p>
        <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-white/50">{s.about}</p>
      <div className="mt-2">
        {s.lines.map((l, i) => (
          <div key={i} className="border-b border-white/[0.05] py-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-white/70">{l.label}</span>
              <span className={cx('shrink-0 text-[13.5px] font-semibold tabular-nums', l.bad ? 'text-danger' : 'text-white/90')}>{l.value}</span>
            </div>
            {l.note && <p className="mt-0.5 text-[11px] leading-snug text-white/40">{l.note}</p>}
          </div>
        ))}
      </div>
      {s.context && <p className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] leading-snug text-white/55">{s.context}</p>}
      {!!s.sources?.length && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
          Источник:
          {s.sources.map((src) =>
            src.url ? (
              <button key={src.label} type="button" onClick={() => openExternal(src.url!)} className="font-semibold text-accent/90 underline underline-offset-2">
                {src.label}
              </button>
            ) : (
              <span key={src.label}>{src.label}</span>
            ),
          )}
        </p>
      )}
    </div>
  );
}

// ---------- счёт партии AoS ----------

type Side = 'me' | 'them';
interface TurnScore {
  objectives: string[];
  tactics: number;
}
const STEP = 'flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-white/80 active:bg-white/10 disabled:opacity-30';
const emptyTurn = (): TurnScore => ({ objectives: [], tactics: 0 });
const turnVp = (t: TurnScore) => AOS_VP.objectives.filter((o) => t.objectives.includes(o.id)).reduce((s, o) => s + o.vp, 0) + t.tactics * AOS_VP.battleTactic;

/**
 * Счёт партии по стандартной схеме GH 2026-27: отметки за ход каждого игрока, сумма и итог.
 * Только в памяти — закрыли лист, счёт остаётся до выхода из ростера.
 */
export function AosScoreTracker() {
  const [round, setRound] = useState(0);
  const [side, setSide] = useState<Side>('me');
  const [score, setScore] = useState<Record<Side, TurnScore[]>>(() => ({
    me: Array.from({ length: AOS_VP.battleRounds }, emptyTurn),
    them: Array.from({ length: AOS_VP.battleRounds }, emptyTurn),
  }));
  const t = score[side][round];
  const update = (fn: (t: TurnScore) => TurnScore) => {
    haptic.tap();
    setScore((s) => ({ ...s, [side]: s[side].map((x, i) => (i === round ? fn(x) : x)) }));
  };
  const total = (sd: Side) => score[sd].reduce((s, x) => s + turnVp(x), 0);
  const tacticsDone = (sd: Side) => score[sd].reduce((s, x) => s + x.tactics, 0);
  const me = total('me');
  const them = total('them');
  const diff = me - them;
  const result =
    diff === 0
      ? tacticsDone('me') === tacticsDone('them')
        ? 'Ничья'
        : `Малая победа: ${tacticsDone('me') > tacticsDone('them') ? 'вы' : 'противник'} (больше тактик)`
      : `${Math.abs(diff) >= AOS_VP.majorVictoryMargin ? 'Крупная' : 'Малая'} победа: ${diff > 0 ? 'вы' : 'противник'}`;
  const underdog = (r: number) => {
    // underdog раунда — у кого меньше VP к его началу
    const sum = (sd: Side) => score[sd].slice(0, r).reduce((s, x) => s + turnVp(x), 0);
    const a = sum('me');
    const b = sum('them');
    return a === b ? null : a < b ? 'вы' : 'противник';
  };
  const ud = underdog(round);
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] px-3.5 py-3">
      <p className="text-[14px] font-semibold">Счёт партии</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">Стандартная схема битвенных планов GH 2026-27. Отметьте, что выполнено в конце хода.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        {(['me', 'them'] as Side[]).map((sd) => (
          <div key={sd} className="rounded-xl bg-white/[0.04] py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{sd === 'me' ? 'Вы' : 'Противник'}</p>
            <p className="font-display text-[28px] font-semibold leading-none tabular-nums">{total(sd)}</p>
            <p className="mt-0.5 text-[10.5px] text-white/40">тактик: {tacticsDone(sd)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[12.5px] font-semibold text-white/75">{me || them ? result : 'Счёт пока 0 : 0'}</p>
      <div className="mt-3 space-y-2">
        <Segmented value={String(round)} onChange={(v) => setRound(Number(v))} options={score.me.map((_, i) => ({ value: String(i), label: `Р${i + 1}` }))} />
        <Segmented value={side} onChange={(v) => setSide(v)} options={[{ value: 'me', label: 'Ваш ход' }, { value: 'them', label: 'Ход противника' }]} />
        {ud && <p className="text-[11.5px] text-white/50">Underdog раунда {round + 1}: {ud}</p>}
        {AOS_VP.objectives.map((o) => {
          const on = t.objectives.includes(o.id);
          return (
            <label key={o.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
              <input type="checkbox" checked={on} onChange={() => update((x) => ({ ...x, objectives: on ? x.objectives.filter((id) => id !== o.id) : [...x.objectives, o.id] }))} className="size-5 accent-accent" />
              <span className="min-w-0 flex-1 text-[12.5px] text-white/75">{o.label}</span>
              <span className="text-[12.5px] font-semibold tabular-nums text-white/70">+{o.vp}</span>
            </label>
          );
        })}
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
          <span className="min-w-0 flex-1 text-[12.5px] text-white/75">Боевые тактики (+{AOS_VP.battleTactic} каждая)</span>
          <button type="button" className={STEP} disabled={t.tactics <= 0} onClick={() => update((x) => ({ ...x, tactics: x.tactics - 1 }))} aria-label="Меньше тактик">
            <Icon name="minus" className="size-4" />
          </button>
          <span className="w-4 text-center text-[13.5px] font-semibold tabular-nums">{t.tactics}</span>
          <button type="button" className={STEP} disabled={t.tactics >= AOS_VP.battleTacticCards} onClick={() => update((x) => ({ ...x, tactics: x.tactics + 1 }))} aria-label="Больше тактик">
            <Icon name="plus" className="size-4" />
          </button>
        </div>
        <p className="text-right text-[12px] text-white/50">
          За этот ход: <span className="font-semibold text-white/80">{turnVp(t)} VP</span>
        </p>
      </div>
    </div>
  );
}

export function PointsSheet({ open, onClose, systems, extra }: { open: boolean; onClose: () => void; systems: PointSystem[]; extra?: Partial<Record<PointCategory, ReactNode>> }) {
  return (
    <Sheet open={open} onClose={onClose} title="Очки" tall>
      <div className="space-y-5 pb-2">
        {(['army', 'game'] as PointCategory[]).map((cat) => (
          <section key={cat} className="space-y-2" aria-label={CATEGORY[cat].title}>
            <div className="px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/45">{CATEGORY[cat].title}</p>
              <p className="text-[11.5px] text-white/40">{CATEGORY[cat].hint}</p>
            </div>
            {systems
              .filter((s) => s.category === cat)
              .map((s) => (
                <SystemCard key={s.id} s={s} />
              ))}
            {extra?.[cat]}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
