/**
 * Рисует карточку уведомления в PNG: стиль мерча WarpHub (15.11.2026, выбор владельца — «червяки из угла»).
 * Один размер для всех — 1280×720 (16:9). Фон — цвет смысла (лайм; жёлтый — напоминание/ожидание; красный —
 * отмена; серый — информация), из углов справа — толстые чёрные «червяки».
 *
 * 15.11.2026 (владелец: «шрифт не читается, не нужно открывать картинку»): в чате картинка показывается
 * примерно в 3–4 раза меньше, поэтому на ней только главное и очень крупно — надзаголовок, заголовок (игра),
 * дата, статус и до двух ключевых фактов. Весь текст уведомления — в подписи под картинкой.
 * satori (разметка → SVG, текст в контуры) + resvg (SVG → PNG).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CardBlock, CardRow, NotificationCard } from './parse';

export const CARD_W = 1280;
export const CARD_H = 720;
const W = CARD_W;
const H = CARD_H;
const PAD = 60;
const TEXT_W = W - PAD * 2 - 280; // справа — узор
const OSWALD = "'Oswald', 'Oswald Cyr', 'Inter Tight', 'Inter Tight Cyr'";
const INTER = "'Inter Tight', 'Inter Tight Cyr'";
const INK = '#111110';
const MUTED = 'rgba(17,17,16,0.7)';
const COLORS = { panel: '#111110', fg: '#F4F4F0', fg3: '#9A9A92', accent: '#ECFE46', warn: '#FBBF24', danger: '#F87171', neutral: '#B8B8B0' };
const TONE: Record<NotificationCard['tone'], string> = { accent: COLORS.accent, warn: COLORS.warn, danger: COLORS.danger, neutral: COLORS.neutral };

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' };
let fonts: Font[] | null = null;
let logo: string | null = null;

function assets() {
  if (fonts && logo) return { fonts, logo };
  const require = createRequire(import.meta.url);
  const dir = (pkg: string) => join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  // подмножества шрифта — под разными именами: одинаковые имена satori не объединяет (латиница пропадала)
  const load = (pkg: string, file: string, name: string, weight: Font['weight']): Font[] =>
    (['latin', 'cyrillic'] as const).map((subset) => ({
      name: subset === 'latin' ? name : `${name} Cyr`,
      weight,
      style: 'normal' as const,
      data: readFileSync(join(dir(pkg), `${file}-${subset}-${weight}-normal.woff`)),
    }));
  fonts = [
    ...load('@fontsource/oswald', 'oswald', 'Oswald', 700),
    ...load('@fontsource/oswald', 'oswald', 'Oswald', 600),
    ...load('@fontsource/inter-tight', 'inter-tight', 'Inter Tight', 400),
    ...load('@fontsource/inter-tight', 'inter-tight', 'Inter Tight', 600),
  ];
  logo = `data:image/png;base64,${readFileSync(join(import.meta.dir, 'logo.png')).toString('base64')}`;
  return { fonts, logo };
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children, ...extra },
});

/** Текст, который должен уместиться: не больше n строк (и запасной обрез по длине). */
function clamp(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
const lines = (style: Record<string, unknown>, n: number, text: string, max: number) =>
  el('div', { display: 'block', lineClamp: n, overflow: 'hidden', ...style }, clamp(text, max));

const WHEN_LABELS = new Set(['Когда', 'Теперь', 'Время']);
/** Какие факты попадают на картинку (по порядку важности); остальное — только в подписи. */
const FACT_PRIORITY = ['Стол', 'Соперник', 'Игрок', 'Отменил', 'За столом', 'Записей', 'Сыграно игр', 'Мест', 'Команда', 'Армия', 'Варбанда', 'Очки'];
const MAX_FACTS = 2;

function pick(card: NotificationCard): { when: string; facts: CardRow[]; text: string } {
  const rows = card.blocks.flatMap((b: CardBlock) => (b.type === 'rows' ? b.rows : []));
  const when = rows.find((r) => WHEN_LABELS.has(r.label))?.value ?? '';
  const facts = FACT_PRIORITY.map((label) => rows.find((r) => r.label === label)).filter((r): r is CardRow => !!r).slice(0, MAX_FACTS);
  // нет ни даты, ни фактов (новость, «давно не виделись») — первый абзац крупно
  const text = !when && !facts.length ? (card.blocks.find((b) => b.type === 'text') as { text: string } | undefined)?.text ?? '' : '';
  return { when, facts, text };
}

function titleSize(title: string) {
  const n = title.length;
  return n <= 12 ? 128 : n <= 18 ? 108 : n <= 28 ? 88 : 72;
}

function backdrop(tone: string) {
  const worm = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="62" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${tone}"/>
${worm(`M${W - 420} -60 C${W - 380} 110 ${W - 230} 60 ${W - 190} 200 S${W - 80} 360 ${W + 60} 320`)}
${worm(`M${W - 250} -60 C${W - 220} 50 ${W - 110} 20 ${W - 70} 120 S${W + 10} 200 ${W + 70} 170`)}
${worm(`M${W + 60} ${H - 250} C${W - 100} ${H - 290} ${W - 130} ${H - 120} ${W - 270} ${H - 110} S${W - 400} ${H + 10} ${W - 430} ${H + 60}`)}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function cardTree(card: NotificationCard, logoSrc: string): Node {
  const tone = TONE[card.tone];
  const { when, facts, text } = pick(card);
  const content = el('div', { flexDirection: 'column', width: TEXT_W, height: H - PAD * 2 }, [
    el('div', { alignItems: 'center' }, [
      el('img', { width: 76, height: 76 }, undefined, { src: logoSrc, width: 76, height: 76 }),
      lines({ marginLeft: 22, flex: 1, fontFamily: OSWALD, fontWeight: 600, fontSize: 44, letterSpacing: 2, textTransform: 'uppercase', color: INK }, 1, card.kicker, 30),
    ]),
    lines({ marginTop: 26, fontFamily: OSWALD, fontWeight: 700, fontSize: titleSize(card.title), lineHeight: 1.0, textTransform: 'uppercase', color: INK }, 2, card.title, 40),
    ...(when ? [lines({ marginTop: 18, fontFamily: OSWALD, fontWeight: 600, fontSize: 60, lineHeight: 1.1, textTransform: 'uppercase', color: INK }, 1, when, 34)] : []),
    ...(text ? [lines({ marginTop: 20, fontFamily: INTER, fontWeight: 600, fontSize: 46, lineHeight: 1.25, color: MUTED }, 3, text, 110)] : []),
    el('div', { flexWrap: 'wrap', marginTop: 'auto' }, [
      ...(card.subtitle
        ? [el('div', { padding: '12px 28px', marginRight: 16, marginTop: 16, borderRadius: 50, backgroundColor: COLORS.panel, fontFamily: OSWALD, fontWeight: 600, fontSize: 42, textTransform: 'uppercase', color: tone }, clamp(card.subtitle, 30))]
        : []),
      ...facts.map((r) =>
        el('div', { alignItems: 'baseline', padding: '12px 28px', marginRight: 16, marginTop: 16, borderRadius: 22, backgroundColor: COLORS.panel }, [
          el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 30, textTransform: 'uppercase', color: COLORS.fg3 }, clamp(r.label, 14)),
          el('div', { marginLeft: 16, fontFamily: INTER, fontWeight: 600, fontSize: 46, color: COLORS.fg }, clamp(r.value, 22)),
        ]),
      ),
    ]),
  ]);
  // фон-узор картинкой; содержимое — абсолютно и после фона, иначе satori рисует фон поверх текста
  return el('div', { width: W, height: H, position: 'relative', backgroundColor: tone }, [
    el('img', { position: 'absolute', top: 0, left: 0, width: W, height: H }, undefined, { src: backdrop(tone), width: W, height: H }),
    el('div', { position: 'absolute', top: PAD, left: PAD, width: TEXT_W, height: H - PAD * 2 }, content),
  ]);
}

/** PNG карточки 1280×720. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const svg = await satori(cardTree(card, l) as never, { width: W, height: H, fonts: fl });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
