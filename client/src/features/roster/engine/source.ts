/**
 * Покрытие источником: инфолисты, которых нет в собранном снимке wh-rules.ru, не обновлялись — их данные старые.
 * Они остаются доступными как обычно, но в списках помечаются «*», а в карточке показывается пояснение.
 * Также здесь — Force Disposition детачмента (новые данные дают несколько).
 */
import type { DataIndex, DataSource, Datasheet, Detachment, Enhancement, FactionData, Stratagem } from './types';

/** Пояснение по умолчанию (если в данных не задано своё). */
export const OUTDATED_NOTE = '* Данные устарели — инфолист не обновлён: его нет в собранном источнике wh-rules.ru (версия 981).';
export const OUTDATED_MARK = '*';

export const isOutdated = (ds: Pick<Datasheet, 'outdated'> | undefined | null): boolean => !!ds?.outdated;

/** Название для списков: «Sicaran Venator*», если данные устарели. */
export const dsLabel = (ds: Pick<Datasheet, 'name' | 'outdated'>): string => (ds.outdated ? ds.name + OUTDATED_MARK : ds.name);

/** Пояснение к пометке «*» (или null, если данные актуальны). */
export const outdatedNote = (ds: Pick<Datasheet, 'outdated'> | undefined | null): string | null =>
  ds?.outdated ? (ds.outdated.startsWith(OUTDATED_MARK) ? ds.outdated : `${OUTDATED_MARK} ${ds.outdated}`) : null;

/** Все Force Disposition детачмента: список из новых данных или единственная из старых. */
export const dispositionsOf = (d: Pick<Detachment, 'forceDisposition' | 'forceDispositions'>): string[] =>
  d.forceDispositions?.length ? d.forceDispositions : d.forceDisposition ? [d.forceDisposition] : [];

/** Подпись ссылки на источник инфолиста по адресу (данные бывают из Wahapedia и из wh-rules.ru). */
export const linkLabel = (url: string): string => (/wh-rules\.ru/i.test(url) ? 'wh-rules.ru' : /wahapedia/i.test(url) ? 'Wahapedia' : 'Источник');

// ---------- устаревшие детачменты, улучшения, стратагемы ----------
/** Пояснение для детачмента/улучшения/стратагемы, которых нет в текущем источнике. */
export const OUTDATED_RULE_NOTE = '* Нет в текущем источнике — сохранено для уже собранных ростеров, для новых недоступно.';
/** Название с «*», если запись устарела. */
export const ruleLabel = (x: { name: string; outdated?: string }): string => (x.outdated ? x.name + OUTDATED_MARK : x.name);

/** Детачменты для выбора: устаревшие — только если уже выбраны или были в ростере (chosen — migrate.legacyIds). */
export const selectableDetachments = (list: Detachment[], chosen: string[] = []): Detachment[] => list.filter((d) => !d.outdated || chosen.includes(d.id));

/**
 * Улучшения для выбора: устаревшее — только если оно уже выбрано у этого юнита или уже было в этом ростере
 * (kept = roster.legacyKept.enhancements — можно вернуть после случайного удаления).
 */
export const selectableEnhancement = (e: Enhancement, current: string | null, kept: string[] = []): boolean => !e.outdated || e.id === current || kept.includes(e.id);

/**
 * Показывать ли стратагему: устаревшая — только вместе со своим устаревшим детачментом (у действующего детачмента
 * показываются только стратагемы текущего источника).
 */
export const visibleStratagem = (s: Stratagem, detById: Map<string, Detachment> | ((id: string) => Detachment | undefined)): boolean => {
  if (!s.outdated) return true;
  const d = typeof detById === 'function' ? detById(s.detachment) : detById.get(s.detachment);
  return !!d?.outdated;
};

// ---------- подпись источника данных ----------
const ruDate = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d);
/** «wh-rules.ru · версия 981 · 14.10.2026». */
export const sourceLabel = (s: DataSource): string => `${s.site.replace(/^https?:\/\//, '').replace(/\/$/, '')} · версия ${s.dataVersion} · ${ruDate(s.date)}`;

type IndexInfo = Pick<DataIndex, 'lastUpdate' | 'updates' | 'factions'>;
type Update = NonNullable<DataIndex['updates']>[number];
const site = (s: DataSource) => s.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
const sameSource = (a: DataSource, b: DataSource) => site(a) === site(b) && String(a.dataVersion) === String(b.dataVersion);
/** «MFM 1.6 · wh-rules.ru 995 · 16.10.2026» — версия очков. */
export const pointsLabel = (s: DataSource): string => `${s.mfm ? `MFM ${s.mfm} · ` : ''}${site(s)} ${s.dataVersion} · ${ruDate(s.date)}`;
const wahapedia = (index: Pick<DataIndex, 'lastUpdate'>) => `Wahapedia${index.lastUpdate ? ` · ${ruDate(index.lastUpdate.slice(0, 10))}` : ''}`;

/** Обновления, которые не меняют очки и правила (сверка связей Leader с Warmind, 07.11.2026) — в подпись источника не идут. */
const NOT_POINTS = new Set(['warmind-leaders']);
const pointsUpdates = (index: Pick<DataIndex, 'updates'>) => (index.updates ?? []).filter((u) => !NOT_POINTS.has(u.kind));

/** Последнее применённое обновление, которое меняло фракцию (порядок index.updates — порядок применения). */
export const pointsUpdateFor = (index: Pick<DataIndex, 'updates'>, factionId: string): Update | null =>
  [...pointsUpdates(index)].reverse().find((u) => (u.scope ?? []).includes(factionId)) ?? null;

/**
 * Подпись данных фракции: откуда очки (последнее обновление, которое её меняло) и откуда правила (своя конвертация или
 * выгрузка Wahapedia). «Очки и правила: MFM 1.6 · wh-rules.ru 995 · 16.10.2026» (Adeptus Custodes),
 * «Очки: MFM 1.6 · wh-rules.ru 995 · 16.10.2026 · правила: Wahapedia · 28.09.2026» (Orks).
 */
const CREDIT = {
  ru: { both: 'Очки и правила', points: 'Очки', rules: 'правила', sep: ' · ' },
  en: { both: 'points and rules', points: 'points', rules: 'rules', sep: '; ' },
};
export const factionCredit = (faction: Pick<FactionData, 'id' | 'source'> | null | undefined, index: IndexInfo, lang: 'ru' | 'en' = 'ru'): string => {
  const t = CREDIT[lang];
  const rules = faction?.source ?? null;
  const pts = faction ? pointsUpdateFor(index, faction.id)?.source ?? rules : null;
  if (!pts) return `powered by ${wahapedia(index)}`;
  if (rules && sameSource(rules, pts)) return `${t.both}: ${pointsLabel(pts)}`;
  return `${t.points}: ${pointsLabel(pts)}${t.sep}${t.rules}: ${rules ? `${site(rules)} ${rules.dataVersion} · ${ruDate(rules.date)}` : wahapedia(index)}`;
};

/** Короткая подпись для списка ростеров: самая новая версия очков (или выгрузка Wahapedia, если обновлений нет). */
export const indexCredit = (index: IndexInfo): string => {
  const latest = [...pointsUpdates(index)].sort((a, b) => a.source.date.localeCompare(b.source.date)).at(-1);
  return latest ? `Очки: ${pointsLabel(latest.source)}` : `powered by ${wahapedia(index)}`;
};

/** Что меняет обновление данных — по его виду (scripts/updates-40k.mjs), для игроков. */
const UPDATE_KIND: Record<string, string> = {
  'whrules-faction': 'Инфолисты, детачменты и правила армии целиком',
  'whrules-faction-convert': 'Инфолисты, детачменты и правила армии целиком (новый кодекс)',
  'whrules-points': 'Очки отрядов, ступени цены за копии, DP детачментов, очки улучшений, платное снаряжение',
  'whrules-wargear': 'Платное снаряжение и варианты снаряжения — как в конструкторе ростеров сайта',
  'warmind-leaders': 'К каким юнитам присоединяются персонажи (Leader) — дополнено по сверке с Warmind',
};

/** Подробности для списка ростеров: выгрузка и каждое обновление — версия, дата, что меняет и какие армии. */
export const indexCreditDetails = (index: IndexInfo): { title: string; text: string }[] => {
  const name = (id: string) => index.factions.find((f) => f.id === id)?.name ?? id;
  return [
    { title: `Выгрузка ${wahapedia(index)}`, text: 'Основа данных 40K: правила и инфолисты армий, которые не обновлялись целиком.' },
    ...(index.updates ?? []).map((u) => ({
      title: pointsLabel(u.source),
      text: `${UPDATE_KIND[u.kind] ?? 'Обновление данных'}. Армии: ${(u.scope ?? []).map(name).join(', ') || '—'}.`,
    })),
  ];
};
