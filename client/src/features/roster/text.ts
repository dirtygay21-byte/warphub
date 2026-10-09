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
