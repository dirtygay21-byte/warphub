/*
 * Очистка текстов правил из выгрузки Wahapedia.
 *
 * В выгрузке встречается служебная разметка, которую нельзя показывать игроку:
 *   • ссылки Wahapedia: «%000009837Redeploy%» — «%», id из 6+ цифр, текст ссылки, «%»;
 *   • теги ключевых слов: «<KY>MOONCLAN</KY>», в том числе пришедшие как «&lt;KY&gt;»;
 *   • HTML-сущности, которые остались после двойного кодирования: «&emsp;».
 *
 * Та же логика есть в импортёре (tools/roster-data/scripts/import-wahapedia.mjs → cleanWahaText),
 * чтобы данные приходили чистыми; здесь — страховка на случай старых или частично обновлённых данных.
 * Тест tools/roster-data/tests/text.test.ts проверяет, что обе реализации дают одинаковый результат.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', emsp: ' ', ensp: ' ', thinsp: ' ',
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', times: '×', bull: '•',
};

const decodeEntities = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Ссылка Wahapedia: «%000009837Redeploy%» → «Redeploy». Сирота «%000009837» без закрывающего «%» убирается. */
const WAHA_LINK = /%\d{6,}([^%\n]*)%/g;
const WAHA_LINK_ORPHAN = /%\d{6,}/g;
/** Короткие теги разметки (<KY>, </KY>, <b>, <br> …). Сравнения вроде «x < 3» не задеваются: после «<» сразу буква и «>». */
const TAG = /<\/?[A-Za-z][A-Za-z0-9]{0,9}\s*\/?>/g;

export function cleanRuleText(s: string | null | undefined): string {
  if (!s) return '';
  let out = String(s);
  // сущности могут скрывать теги («&lt;KY&gt;»), поэтому сначала раскодируем, потом убираем разметку
  // дважды закодированное («&amp;emsp;») раскодируем, пока текст меняется (не больше 3 раз)
  for (let i = 0; i < 3; i++) {
    const next = decodeEntities(out);
    if (next === out) break;
    out = next;
  }
  out = out.replace(/<br\s*\/?>/gi, '\n').replace(TAG, '');
  out = out.replace(WAHA_LINK, '$1').replace(WAHA_LINK_ORPHAN, '');
  // обрывок тега в конце («… D3 <a href="/aos4/the-rul») и заглушка таблицы «$000001417»; что текст неполный,
  // показывает rawIncomplete / поле incomplete правила (предупреждение со ссылкой на полный текст)
  out = out.replace(/<[A-Za-z/][^>\n]*$/, '').replace(/\n?\$\d{6,}/g, '');
  return out
    .replace(/[ \t\u00a0\u2002\u2003\u2009]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Есть ли в строке служебная разметка (для проверки данных в тестах). */
export function hasMarkup(s: string | null | undefined): boolean {
  if (!s) return false;
  // без флага g: у глобального RegExp.test есть состояние (lastIndex)
  return /%\d{6,}/.test(s) || new RegExp(TAG.source).test(s) || /&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s);
}

/** Почему текст правила неполный (как в данных: incomplete у правила AoS). */
export type IncompleteKind = 'truncated' | 'table';

/**
 * Признак неполного текста по самому тексту, до очистки: заглушка таблицы «$000001417» или обрыв посреди тега.
 * Та же проверка, что rawIncomplete в импортёре; нужна для данных без поля incomplete (40K, старые файлы).
 */
export function rawIncomplete(s: string | null | undefined): IncompleteKind | null {
  const t = String(s ?? '').trimEnd();
  if (/\$\d{6,}/.test(t)) return 'table';
  if (/<[A-Za-z/][^>]*$/.test(t)) return 'truncated';
  return null;
}

export const INCOMPLETE_TEXT: Record<IncompleteKind, string> = {
  truncated: 'Текст обрезан в выгрузке Wahapedia (лимит 1024 символа) — конец правила не показан.',
  table: 'В правиле есть таблица, которой нет в выгрузке Wahapedia.',
};
