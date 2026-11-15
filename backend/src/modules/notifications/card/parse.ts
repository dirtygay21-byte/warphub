/**
 * Картинка уведомления (решение владельца 14.11.2026): изображение в стиле макетов WarpHub вместо текста,
 * под ним — 1–2 строки подписи. Карточка строится из уже готового текста уведомления (шаблон владельца +
 * переменные), поэтому правка текста в админке сразу меняет и картинку. Правила разбора:
 * - первая строка — заголовок: «Вы записаны: Kill Team» → надзаголовок «ВЫ ЗАПИСАНЫ», крупно «Kill Team»;
 *   хвост « — …» или «(…)» — подзаголовок; эмодзи в начале задаёт цвет (успех / внимание / отмена);
 * - «Метка: значение» и строки с 🗓 / 🎲 — строки таблицы;
 * - строка целиком жирная — заголовок блока; «• …» — пункт списка; остальное — абзацы;
 * - последний абзац с «в приложении» — подсказка внизу.
 * Чистая функция без зависимостей — проверяется юнит-тестами.
 */

export type CardTone = 'accent' | 'warn' | 'danger' | 'neutral';
export type CardRow = { label: string; value: string };
export type CardBlock =
  | { type: 'rows'; rows: CardRow[] }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'text'; text: string };

export type NotificationCard = {
  kicker: string;
  title: string;
  subtitle: string;
  tone: CardTone;
  blocks: CardBlock[];
  note: string;
};

const EMOJI_LABEL: Record<string, string> = { '🗓': 'Когда', '📅': 'Когда', '🎲': 'Стол', '🕒': 'Время', '📍': 'Где' };
const TONE_BY_EMOJI: Array<[RegExp, CardTone]> = [
  [/^(❌|🚫)/u, 'danger'],
  [/^(⏰|⏳|🕒|🌙|🔥|⚠️|❗)/u, 'warn'],
  [/^(ℹ️|👋|📰)/u, 'neutral'],
];

const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}][\u{FE0F}\u{200D}\p{Extended_Pictographic}]*\s*)+/u;
const ANY_EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Текст без эмодзи (в шрифтах картинки их нет) и лишних пробелов. */
function clean(text: string): string {
  return text.replace(ANY_EMOJI, '').replace(/\s+/g, ' ').trim();
}

function isBoldLine(raw: string) {
  return /^\s*(?:[^<\w]*\s*)?<b>[^<]+<\/b>\s*$/u.test(raw);
}

export function parseNotificationCard(html: string, fallbackKicker = 'WarpHub'): NotificationCard {
  const lines = html.split('\n');
  const firstIndex = lines.findIndex((l) => decode(l).trim());
  const headRaw = firstIndex >= 0 ? decode(lines[firstIndex]!).trim() : '';
  const tone = TONE_BY_EMOJI.find(([re]) => re.test(headRaw))?.[1] ?? 'accent';
  let head = clean(headRaw.replace(LEADING_EMOJI, ''));

  let subtitle = '';
  const dash = head.indexOf(' — ');
  if (dash > 0) {
    subtitle = head.slice(dash + 3).trim();
    head = head.slice(0, dash).trim();
  }
  const paren = head.match(/^(.*\S)\s*\(([^()]+)\)$/);
  if (paren) {
    head = paren[1]!;
    subtitle = subtitle ? `${paren[2]} · ${subtitle}` : paren[2]!;
  }
  let kicker = fallbackKicker;
  let title = head;
  const colon = head.indexOf(': ');
  if (colon > 0 && colon <= 40) {
    kicker = head.slice(0, colon);
    title = head.slice(colon + 2);
  }

  const blocks: CardBlock[] = [];
  const push = (block: CardBlock) => {
    const last = blocks.at(-1);
    if (block.type === 'rows' && last?.type === 'rows') last.rows.push(...block.rows);
    else if (block.type === 'list' && last?.type === 'list') last.items.push(...block.items);
    else blocks.push(block);
  };

  for (const raw of lines.slice(firstIndex + 1)) {
    const decoded = decode(raw).trim();
    if (!decoded) continue;
    const emoji = Object.keys(EMOJI_LABEL).find((e) => decoded.startsWith(e));
    if (emoji) {
      const value = clean(decoded.slice(emoji.length));
      if (value) push({ type: 'rows', rows: [{ label: EMOJI_LABEL[emoji]!, value }] });
      continue;
    }
    const text = clean(decoded);
    if (!text) continue;
    if (/^[•·\-–]\s/.test(text)) {
      push({ type: 'list', items: [text.replace(/^[•·\-–]\s+/, '')] });
      continue;
    }
    if (isBoldLine(raw)) {
      push({ type: 'heading', text });
      continue;
    }
    const row = text.match(/^([^:]{2,28}):\s+(.+)$/);
    if (row && !/[.!?]$/.test(row[1]!)) {
      push({ type: 'rows', rows: [{ label: row[1]!, value: row[2]! }] });
      continue;
    }
    push({ type: 'text', text });
  }

  // подсказка «что делать» — последний абзац про приложение / админку
  let note = '';
  const last = blocks.at(-1);
  if (last?.type === 'text' && /(в приложении|в админке|ждём вас|до встречи)/i.test(last.text)) {
    note = last.text;
    blocks.pop();
  }

  return { kicker: kicker || fallbackKicker, title: title || fallbackKicker, subtitle, tone, blocks, note };
}

/** Подпись под картинкой: 1–2 первые строки текста (заголовок и время), не длиннее лимита Telegram. */
export function cardCaption(html: string, limit = 1024): string {
  const lines = html.split('\n').filter((l) => decode(l).trim());
  const caption = lines.slice(0, 2).join('\n');
  return caption.length <= limit ? caption : lines[0]!.slice(0, limit);
}
