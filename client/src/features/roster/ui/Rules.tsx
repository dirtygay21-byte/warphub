import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadFaction } from '../data';
import type { DataIndex, Detachment, FactionData, Stratagem } from '../engine/types';
import { openExternal } from '../telegram';
import { IconButton, Segmented, Tag } from './kit';
import { cx } from './util';
import { cleanRuleText } from '../text';
import { factionCredit, ruleLabel, visibleStratagem } from '../engine/source';
import { isWarphub, ruDetachmentName, ruName, ruStratagem, WARPHUB_LABEL, type RuText } from '../ru';
import { glossaryEntries, GLOSSARY_GROUPS, matchGlossary, type Glossary, type GlossaryGroup } from '../glossary';
import { RuleRichText } from './common/RulePopover';
import { useGlossary } from './common/useGlossary';
import { useRu } from './common/useRu';
import { useEn, useT } from './common/i18n';
import { LangSwitch } from './common/LangSwitch';

const PART_EN: Record<string, string> = {
  'Базовые правила': 'Basics',
  'Раунд битвы': 'The battle round',
  'Поле боя и тактика': 'Battlefield and tactics',
  'Продвинутые правила': 'Advanced rules',
  'Справочник': 'Reference',
};
const PHASE_EN: Record<string, string> = { all: 'All', Command: 'Command', Movement: 'Move', Shooting: 'Shoot', Charge: 'Charge', Fight: 'Fight' };
const GROUP_EN: Record<string, string> = { unit: 'Abilities', weapon: 'Weapons', faction: 'Faction weapons', terms: 'Terms' };

const CORE_URL = 'https://wahapedia.ru/wh40k11ed/the-rules/core-rules/';

/** Оглавление Core Rules 11-й редакции: текст правил открывается на Wahapedia на нужной главе. */
const CORE_RULES: { part: string; chapters: [string, string, string][] }[] = [
  {
    part: 'Базовые правила',
    chapters: [
      ['01', 'Основные понятия', 'Core-Concepts'],
      ['02', 'Инфолисты', 'Datasheets'],
      ['03', 'Перемещение', 'Moving'],
      ['04', 'Атаки', 'Making-Attacks'],
      ['05', 'Последовательность атаки', 'Attack-Sequence'],
      ['06', 'Прочие понятия', 'Other-Concepts'],
    ],
  },
  {
    part: 'Раунд битвы',
    chapters: [
      ['07', 'Раунд битвы', 'The-Battle-Round-1'],
      ['08', 'Фаза командования', 'Command-Phase'],
      ['09', 'Фаза движения', 'Movement-Phase'],
      ['10', 'Фаза стрельбы', 'Shooting-Phase'],
      ['11', 'Фаза атаки', 'Charge-Phase'],
      ['12', 'Фаза ближнего боя', 'Fight-Phase'],
    ],
  },
  {
    part: 'Поле боя и тактика',
    chapters: [
      ['13', 'Террейн', 'Terrain'],
      ['14', 'Цели', 'Objectives'],
      ['15', 'Стратагемы', 'Stratagems'],
      ['16', 'Действия', 'Actions'],
    ],
  },
  {
    part: 'Продвинутые правила',
    chapters: [
      ['17', 'Монстры и техника', 'Monsters-and-Vehicles'],
      ['18', 'Транспорты', 'Transports'],
      ['19', 'Присоединённые отряды', 'Attached-Units'],
      ['20', 'Стратегический резерв', 'Strategic-Reserves'],
      ['21', 'Полёт и рывок', 'Flying-and-Surging'],
      ['22', 'Прочие правила и способности', 'Other-Rules-and-Abilities'],
      ['23', 'Авиация', 'Aircraft'],
    ],
  },
  {
    part: 'Справочник',
    chapters: [
      ['24', 'Основные способности', 'Core-Abilities'],
      ['25', 'Сбор армии', 'Muster-Armies'],
    ],
  },
];

type Phase = 'all' | 'Command' | 'Movement' | 'Shooting' | 'Charge' | 'Fight';
const PHASES: { value: Phase; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'Command', label: 'Команд.' },
  { value: 'Movement', label: 'Движ.' },
  { value: 'Shooting', label: 'Стрельба' },
  { value: 'Charge', label: 'Атака' },
  { value: 'Fight', label: 'Бой' },
];
const TURN_RU: Record<string, string> = { 'Your turn': 'Ваш ход', 'Opponent’s turn': 'Ход противника', 'Either player’s turn': 'Любой ход' };

const inPhase = (st: Stratagem, ph: Phase) => ph === 'all' || st.phase === 'Any phase' || st.phase.includes(ph);

/** «Правила»: стратагемы (основные + армии) и оглавление Core Rules со ссылками на Wahapedia. */
export function Rules({
  index,
  onBack,
  factionId,
  detachmentIds,
}: {
  index: DataIndex;
  onBack: () => void;
  factionId?: string;
  detachmentIds?: string[];
}) {
  const t = useT();
  const en = useEn();
  const [tab, setTab] = useState<'strats' | 'terms' | 'core'>('strats');
  const [fid, setFid] = useState(factionId ?? '');
  const [loaded, setLoaded] = useState<{ id: string; faction?: FactionData; error?: string } | null>(null);
  const [det, setDet] = useState<string>(detachmentIds?.length ? 'mine' : 'all');
  const [phase, setPhase] = useState<Phase>('all');
  // переключатель RU/EN (07.11.2026): русские тексты — те же оверлеи, что в редакторе
  const gloss = useGlossary();

  // основные стратагемы есть в файле любой фракции — без выбранной армии грузим первую
  const loadId = fid || index.factions[0]?.id || '';
  useEffect(() => {
    if (!loadId) return;
    let alive = true;
    loadFaction(loadId).then(
      (f) => alive && setLoaded({ id: loadId, faction: f }),
      (e) => alive && setLoaded({ id: loadId, error: String(e.message ?? e) }),
    );
    return () => {
      alive = false;
    };
  }, [loadId]);
  // показываем только результат для текущей фракции: старый ответ или старая ошибка не «прилипают»
  const faction = loaded?.id === loadId ? (loaded.faction ?? null) : null;
  const error = loaded?.id === loadId ? (loaded.error ?? null) : null;
  const ru = useRu(faction ? loadId : null);

  const groups = useMemo(() => {
    if (!faction) return [];
    const list = faction.stratagems.filter((s) => inPhase(s, phase));
    const out: { title: string; sub?: string; items: Stratagem[] }[] = [{ title: en ? 'Core Stratagems' : 'Основные стратагемы', sub: 'Core', items: list.filter((s) => !s.detachment) }];
    if (fid) {
      // устаревшие детачменты (нет в текущем источнике) — только если выбраны в ростере
      const dets = faction.detachments.filter((d) =>
        det === 'mine' ? detachmentIds?.includes(d.id) : det === 'all' ? !d.outdated || !!detachmentIds?.includes(d.id) : d.id === det,
      );
      const byId = new Map<string, Detachment>(faction.detachments.map((d: Detachment) => [d.id, d]));
      for (const d of dets) {
        const items = list.filter((s) => s.detachment === d.id && visibleStratagem(s, byId));
        if (items.length) out.push({ title: ruName(ruDetachmentName(ru, d.id), ruleLabel(d)), sub: en ? 'Detachment' : 'Детачмент', items });
      }
    }
    return out.filter((g) => g.items.length);
  }, [faction, phase, fid, det, detachmentIds, ru, en]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-5 lg:max-w-3xl lg:pt-8">
      <header className="mb-4 flex items-end gap-3">
        <IconButton icon="back" label={t('Назад', 'Back')} onClick={onBack} className="mb-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t('11-я редакция', '11th edition')}</p>
          <h1 className="font-display mt-1 text-3xl font-semibold uppercase leading-none">{t('Правила', 'Rules')}</h1>
        </div>
        <LangSwitch />
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'strats', label: t('Стратагемы', 'Stratagems') },
          { value: 'terms', label: t('Термины', 'Terms') },
          { value: 'core', label: 'Core Rules' },
        ]}
      />

      {tab === 'terms' ? (
        <GlossaryTab g={gloss} />
      ) : tab === 'core' ? (
        <div className="mt-4 space-y-5">
          <p className="text-sm leading-relaxed text-fg-3">
            {t('Полный текст основных правил — на Wahapedia. Глава откроется сразу на нужном месте и всегда в актуальной версии.', 'The full Core Rules are on Wahapedia. Each chapter opens at the right place and is always up to date.')}
          </p>
          {CORE_RULES.map((part) => (
            <section key={part.part}>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-fg-3">{en ? PART_EN[part.part] ?? part.part : part.part}</p>
              <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                {part.chapters.map(([n, title, anchor], i) => (
                  <li key={anchor}>
                    <button
                      type="button"
                      onClick={() => openExternal(`${CORE_URL}#${anchor}`)}
                      className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/10', i > 0 && 'border-t border-white/[0.06]')}
                    >
                      <span className="font-display w-6 text-sm font-semibold text-accent/80 tabular-nums">{n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-white/90">{en ? anchor.replace(/-1$/, '').replace(/-/g, ' ') : title}</span>
                        {!en && <span className="block text-[12px] text-fg-3">{anchor.replace(/-1$/, '').replace(/-/g, ' ')}</span>}
                      </span>
                      <span className="text-fg-3">↗</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-center text-[12px] text-fg-3">{t('Текст правил — Games Workshop, публикация: Wahapedia', 'Rules text — Games Workshop, published by Wahapedia')}</p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-2">
            <Select value={fid} onChange={(v) => (setFid(v), setDet('all'))}>
              <option value="">{t('Только основные стратагемы', 'Core Stratagems only')}</option>
              {index.factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            {fid && faction && faction.id === fid && faction.detachments.length > 0 && (
              <Select value={det} onChange={setDet}>
                {fid === factionId && detachmentIds?.length ? <option value="mine">{t('Детачменты ростера', 'Roster Detachments')}</option> : null}
                <option value="all">{t('Все детачменты', 'All Detachments')}</option>
                {faction.detachments
                  .filter((d) => !d.outdated || detachmentIds?.includes(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {ruleLabel(d)}
                    </option>
                  ))}
              </Select>
            )}
          </div>
          <div className="-mx-4 mt-2 overflow-x-auto px-4">
            <div className="flex w-max gap-1.5">
              {PHASES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPhase(p.value)}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    phase === p.value ? 'border-accent bg-accent/15 text-white' : 'border-white/10 text-fg-2 active:bg-white/10',
                  )}
                >
                  {en ? PHASE_EN[p.value] : p.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mt-8 text-center text-sm text-fg-3">{error}</p>
          ) : !faction ? (
            <div className="mx-auto mt-12 size-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
          ) : groups.length === 0 ? (
            <p className="mt-8 text-center text-sm text-fg-3">{t('В этой фазе стратагем нет.', 'No Stratagems in this phase.')}</p>
          ) : (
            <div className="mt-4 space-y-5">
              {groups.map((g) => (
                <section key={g.title}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="font-display text-base font-semibold uppercase">{g.title}</p>
                    <span className="text-[12px] text-fg-3">
                      {g.sub} · {g.items.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.items.map((s) => (
                      <StratCard key={s.id} s={s} ru={ruStratagem(ru, s.id)} g={gloss} />
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-center text-[12px] text-fg-3">{factionCredit(faction, index, en ? 'en' : 'ru')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Термины (07.11.2026): основные способности, способности оружия (в т. ч. фракций) и термины правил — поиск и группы. */
function GlossaryTab({ g }: { g: Glossary | null }) {
  const t = useT();
  const en = useEn();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GlossaryGroup | 'all'>('all');
  const all = useMemo(() => (g ? glossaryEntries(g) : []), [g]);
  if (!g) return <div className="mx-auto mt-10 size-6 animate-spin rounded-full border-2 border-white/15 border-t-accent" />;
  const hits = all
    .map((e) => ({ e, hit: matchGlossary(e, q) }))
    .filter((x) => x.hit && (group === 'all' || x.e.group === group))
    .sort((a, b) => b.hit - a.hit);
  return (
    <div className="mt-4 space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('Поиск: Deep Strike, Lethal Hits, укрытие…', 'Search: Deep Strike, Lethal Hits, cover…')}
        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-fg-3 focus:border-accent"
      />
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {[{ key: 'all' as const, label: t('Все', 'All') }, ...GLOSSARY_GROUPS.map((x) => ({ ...x, label: en ? GROUP_EN[x.key] ?? x.label : x.label }))].map((x) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={group === x.key}
            onClick={() => setGroup(x.key)}
            className={cx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition', group === x.key ? 'bg-accent text-accent-foreground' : 'bg-white/[0.06] text-fg-2')}
          >
            {x.label} <span className="tabular-nums opacity-60">{x.key === 'all' ? all.length : all.filter((e) => e.group === x.key).length}</span>
          </button>
        ))}
      </div>
      {hits.length ? (
        <div className="space-y-1.5">
          {hits.map(({ e }) => (
            <details key={e.id} className="group rounded-xl border border-white/10 bg-white/[0.03]">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm font-semibold">{e.name}</span>
                <span className="shrink-0 text-[11px] text-fg-3">{[e.num, (en ? GROUP_EN[e.group] : GLOSSARY_GROUPS.find((x) => x.key === e.group)!.label)].filter(Boolean).join(' · ')}</span>
              </summary>
              <div className="space-y-2 border-t border-white/[0.06] px-3 py-2.5">
                {e.texts.map((t, i) => (
                  <RuleRichText key={i} text={t} g={g} className="text-[13px] leading-relaxed text-fg-2" />
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-fg-3">{t('Ничего не найдено', 'Nothing found')}</p>
      )}
      <p className="text-[11px] leading-snug text-fg-3">
        {t('Тексты — wh-rules.ru, данные', 'Texts — wh-rules.ru, data')} {g.source.dataVersion}
        {g.source.mfm ? ` (MFM ${g.source.mfm})` : ''}.
      </p>
    </div>
  );
}

function StratCard({ s, ru, g }: { s: Stratagem; ru: RuText | null; g: Glossary | null }) {
  const t = useT();
  const en = useEn();
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight text-white/90">{ru ? ruName(ru.name, s.name) : s.name}</span>
          <span className="mt-0.5 block text-[12px] text-fg-3">
            {[en ? s.turn : TURN_RU[s.turn] ?? s.turn, s.phase, isWarphub(ru) ? WARPHUB_LABEL : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Tag tone={s.detachment ? 'accent' : 'muted'}>{s.cp} CP</Tag>
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3.5 pb-3 pt-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-3">{s.type}</p>
          {ru ? (
            <RuleRichText text={ru.text} g={g} className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2" />
          ) : (
            <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-fg-2">{cleanRuleText(s.text)}</p>
          )}
        </div>
      )}
    </li>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/90 outline-none focus:border-accent/60 [&>option]:bg-[#1b1b18]"
    >
      {children}
    </select>
  );
}
