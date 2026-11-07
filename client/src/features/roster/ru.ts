/**
 * Русские тексты 40K с wh-rules.ru (01.11.2026): оверлей фракции backend/roster-data/ru/<id>.json поверх английских данных
 * (tools/roster-data/scripts/whrules-ru.mjs). Движок и данные фракции не меняются: русский текст берётся только для показа,
 * английский — запасной. Тексты с разметкой wh-rules.ru (термины, [core:…]) — показывать через RuleRichText.
 */
export interface RuText {
  /** русское название (нет — как по-английски) */
  name?: string;
  text: string;
  /** перевод WarpHub (текста нет на wh-rules.ru; решение владельца 06.11.2026) — показывать с пометкой WARPHUB_LABEL */
  src?: 'warphub';
}

/** Пометка текстов, переведённых WarpHub (их нет на wh-rules.ru). */
export const WARPHUB_LABEL = 'перевод WarpHub';
export const isWarphub = (t: RuText | null | undefined) => t?.src === 'warphub';
export interface RuOverlay {
  schema: 'warphub-ru/1';
  faction: string;
  source: { site: string; dataVersion: number; mfm: string | null; date: string; snapshot: string; fingerprint: string };
  /** армейские правила и ссылки на них (id правила фракции) */
  rules?: Record<string, RuText>;
  /** warphub — поля инфолиста (loadout, options…), переведённые WarpHub */
  datasheets?: Record<string, { abilities?: Record<string, RuText>; loadout?: string; options?: string[]; leader?: string; leaderNote?: string; transport?: string; damaged?: string; warphub?: string[] }>;
  /** nameSrc: 'warphub' — название детачмента переведено WarpHub */
  detachments?: Record<string, { name?: string; nameSrc?: 'warphub'; rules?: Record<string, RuText> }>;
  stratagems?: Record<string, RuText>;
  enhancements?: Record<string, RuText>;
}

/**
 * Название правила, способности, стратагемы, улучшения: английское (как в правилах), перевод — в скобках
 * («Oath of Moment (Клятва момента)»; решение владельца 07.11.2026). Перевода нет или он совпадает — только английское.
 */
export const ruName = (ru: string | null | undefined, en: string): string => (ru && ru.trim() && ru.trim().toLowerCase() !== en.trim().toLowerCase() ? `${en} (${ru.trim()})` : en);

/** Текст сайта (разметка **, __, [gloss:…], [core:…]) — простым текстом: для мест, где нельзя вложить кнопки терминов. */
export const ruPlain = (text: string): string =>
  text
    .replace(/\[(?:gloss:[^:\]]+|core):?([^\]]*)\]/g, (_m, s: string) => s)
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1');

export const ruRule = (o: RuOverlay | null, id: string | null | undefined) => (o && id ? (o.rules?.[id] ?? null) : null);
export const ruAbility = (o: RuOverlay | null, dsId: string, name: string) => o?.datasheets?.[dsId]?.abilities?.[name] ?? null;
export const ruDatasheet = (o: RuOverlay | null, dsId: string) => o?.datasheets?.[dsId] ?? null;
export const ruDetachmentRule = (o: RuOverlay | null, detId: string, abilityId: string) => o?.detachments?.[detId]?.rules?.[abilityId] ?? null;
export const ruDetachmentName = (o: RuOverlay | null, detId: string) => o?.detachments?.[detId]?.name ?? null;
export const ruStratagem = (o: RuOverlay | null, id: string) => o?.stratagems?.[id] ?? null;
export const ruEnhancement = (o: RuOverlay | null, id: string) => o?.enhancements?.[id] ?? null;
/** Правило детачмента по id правила (id правил детачментов уникальны в фракции). */
export function ruDetachmentRuleById(o: RuOverlay | null, abilityId: string): RuText | null {
  for (const d of Object.values(o?.detachments ?? {})) if (d.rules?.[abilityId]) return d.rules[abilityId]!;
  return null;
}
