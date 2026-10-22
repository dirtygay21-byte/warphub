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

/** Подпись данных фракции: свой источник, если данные из него, иначе выгрузка Wahapedia. */
export const factionCredit = (faction: Pick<FactionData, 'source'> | null | undefined, index: Pick<DataIndex, 'lastUpdate'>): string =>
  faction?.source ? sourceLabel(faction.source) : `powered by Wahapedia${index.lastUpdate ? ` · ${index.lastUpdate.slice(0, 10)}` : ''}`;

/** Подпись для списка ростеров: выгрузка + обновлённые фракции со своим источником. */
export const indexCredit = (index: Pick<DataIndex, 'lastUpdate' | 'updates' | 'factions'>): string[] => {
  const lines = [`powered by Wahapedia · обновлено ${index.lastUpdate?.slice(0, 10) ?? '—'}`];
  for (const u of index.updates ?? []) {
    const names = (u.scope ?? []).map((id) => index.factions.find((f) => f.id === id)?.name ?? id);
    if (names.length) lines.push(`${names.join(', ')}: ${sourceLabel(u.source)}`);
  }
  return lines;
};
