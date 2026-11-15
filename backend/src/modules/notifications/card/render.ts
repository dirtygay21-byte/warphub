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
const FACT_PRIORITY = ['Код', 'Стол', 'Соперник', 'Рейтинг', 'Игрок', 'Отменил', 'За столом', 'Записей', 'Сыграно игр', 'Мест', 'Команда', 'Армия', 'Варбанда', 'Очки'];
const MAX_FACTS = 2;

/**
 * Значение факта на картинке (15.11.2026, владелец: «тире и многоточие выглядят неправильно»): одинаково для всех
 * карточек — только главная часть значения, без обрезки посередине. «Иван Петров (@ivan) — Kommandos, Игрок» →
 * «Иван Петров (@ivan)»; «5 · ждут подтверждения: 2» → «5». Слишком длинное — без «(…)», затем по словам.
 * Подробности остаются в подписи под картинкой.
 */
export function factValue(value: string, max = 22): string {
  let v = value.split(/\s[—·]\s/)[0]!.trim();
  if (v.length > max) v = v.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (v.length > max) {
    const words = v.split(/\s+/);
    v = '';
    for (const w of words) {
      if ((v ? `${v} ${w}` : w).length > max) break;
      v = v ? `${v} ${w}` : w;
    }
    v ||= words[0]!.slice(0, max);
  }
  return v;
}

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

/**
 * Фон: толстые чёрные «червяки» из правых углов (стиль мерча, выбор владельца). 15.11.2026 (владелец):
 * червяки бесконечно «прокручиваются» вперёд вдоль своего направления. Каждый червяк — волна той же формы,
 * что и на прежней картинке (S-изгиб из угла), на месте прежнего; за цикл волна сдвигается ровно на свою длину,
 * поэтому цикл бесшовный, а движение — только вперёд. phase 0…1 — кадр; статичная картинка — phase 0.
 */
type Worm = { x: number; y: number; angle: number; lambda: number; amp: number; half: number };
const WORMS: Worm[] = [
  { x: W - 180, y: 130, angle: 38, lambda: 620, amp: 52, half: 760 },
  { x: W - 80, y: 50, angle: 36, lambda: 420, amp: 38, half: 560 },
  { x: W - 190, y: H - 95, angle: 148, lambda: 600, amp: 52, half: 760 },
];

function wormPath({ lambda, amp, half }: Worm, shift: number) {
  const step = lambda / 2;
  let x = -half - lambda * 2 + shift;
  let d = `M${x.toFixed(1)} 0`;
  for (let i = 0; x < half + lambda; i++, x += step) {
    const dy = (i % 2 ? 1 : -1) * amp * 1.33;
    d += ` C${(x + step * 0.35).toFixed(1)} ${dy.toFixed(1)} ${(x + step * 0.65).toFixed(1)} ${dy.toFixed(1)} ${(x + step).toFixed(1)} 0`;
  }
  return d;
}

function backdrop(tone: string, phase = 0) {
  const worms = WORMS.map((w) =>
    `<g transform="translate(${w.x} ${w.y}) rotate(${w.angle})"><path d="${wormPath(w, phase * w.lambda)}" fill="none" stroke="${INK}" stroke-width="62" stroke-linecap="round"/></g>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${tone}"/>${worms}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function cardTree(card: NotificationCard, logoSrc: string, background?: string): Node {
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
          el('div', { marginLeft: 16, fontFamily: INTER, fontWeight: 600, fontSize: 46, color: COLORS.fg }, factValue(r.value)),
        ]),
      ),
    ]),
  ]);
  // фон-узор картинкой; содержимое — абсолютно и после фона, иначе satori рисует фон поверх текста
  return el('div', { width: W, height: H, position: 'relative', backgroundColor: tone }, [
    el('img', { position: 'absolute', top: 0, left: 0, width: W, height: H }, undefined, { src: background ?? backdrop(tone), width: W, height: H }),
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

/**
 * Анимированная карточка (GIF, 15.11.2026). Текст рисуется один раз (satori), для кадров подменяется только фон.
 * Качество (владелец: «стало хуже»): полный размер 1280×720, палитра 255 цветов по первому кадру; в следующих
 * кадрах неизменившиеся точки прозрачные (остаётся предыдущий кадр) — меняются только червяки,
 * поэтому файл небольшой. 36 кадров по 60 мс (≈2,2 с), червяки прокручиваются вперёд, повтор бесконечный.
 */
export const GIF_W = W;
export const GIF_FRAMES = 36;
const GIF_DELAY = 60;

export async function renderCardGif(card: NotificationCard): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }, gifenc] = await Promise.all([import('satori'), import('@resvg/resvg-js'), import('gifenc')]);
  const tone = TONE[card.tone];
  const first = backdrop(tone, 0);
  const svg = await satori(cardTree(card, l, first) as never, { width: W, height: H, fonts: fl });
  if (!svg.includes(first)) throw new Error('animation: background not found in svg');
  const gif = gifenc.GIFEncoder();
  let palette: number[][] | null = null;
  let transparentIndex = 0;
  let previous: Uint8Array | null = null;
  for (let i = 0; i < GIF_FRAMES; i++) {
    const frame = i === 0 ? svg : svg.replace(first, backdrop(tone, i / GIF_FRAMES));
    const image = new Resvg(frame, { fitTo: { mode: 'width', value: GIF_W } }).render();
    const rgba = new Uint8Array(image.pixels.buffer, image.pixels.byteOffset, image.pixels.length);
    if (!palette) {
      palette = gifenc.quantize(rgba, 255);
      transparentIndex = palette.length;
      palette.push([255, 0, 255]); // служебный «прозрачный» цвет, в картинке не встречается
    }
    const index = gifenc.applyPalette(rgba, palette.slice(0, transparentIndex));
    if (!previous) {
      gif.writeFrame(index, image.width, image.height, { palette, delay: GIF_DELAY, dispose: 1 });
    } else {
      const delta = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) delta[p] = index[p] === previous[p] ? transparentIndex : index[p]!;
      gif.writeFrame(delta, image.width, image.height, { delay: GIF_DELAY, transparent: true, transparentIndex, dispose: 1 });
    }
    previous = index;
  }
  gif.finish();
  return gif.bytes();
}

/**
 * Анимация в MP4 (H.264), 15.11.2026 (владелец: «анимация выглядит размытой»). GIF Telegram сам пережимает в
 * видео с низким качеством; готовый MP4 высокого качества он показывает как есть. 1280×720, 24 кадра/с,
 * 48 кадров = 2 с, цикл бесшовный (червяки сдвигаются ровно на длину волны), Telegram повторяет его сам.
 * h264-mp4-encoder — кодировщик на WebAssembly, без внешних программ.
 */
export const MP4_FPS = 24;
export const MP4_FRAMES = 48;

export async function renderCardMp4(card: NotificationCard): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }, hme] = await Promise.all([import('satori'), import('@resvg/resvg-js'), import('h264-mp4-encoder')]);
  const tone = TONE[card.tone];
  const first = backdrop(tone, 0);
  const svg = await satori(cardTree(card, l, first) as never, { width: W, height: H, fonts: fl });
  if (!svg.includes(first)) throw new Error('animation: background not found in svg');
  const encoder = await ((hme as { default?: typeof hme }).default ?? hme).createH264MP4Encoder();
  try {
    encoder.width = W;
    encoder.height = H;
    encoder.frameRate = MP4_FPS;
    encoder.quantizationParameter = 16; // 10 — лучшее, 51 — худшее; 16 — текст чёткий, файл небольшой
    encoder.initialize();
    for (let i = 0; i < MP4_FRAMES; i++) {
      const frame = i === 0 ? svg : svg.replace(first, backdrop(tone, i / MP4_FRAMES));
      const image = new Resvg(frame, { fitTo: { mode: 'width', value: W } }).render();
      encoder.addFrameRgba(new Uint8Array(image.pixels.buffer, image.pixels.byteOffset, image.pixels.length));
    }
    encoder.finalize();
    return encoder.FS.readFile(encoder.outputFilename);
  } finally {
    encoder.delete();
  }
}
