/**
 * Рисует карточку уведомления в PNG (14.11.2026): стиль макетов WarpHub — тёмный фон #111110, лайм #ECFE46,
 * заголовки Oswald в верхнем регистре, текст Inter Tight, логотип WARP BOYS & GIRLS.
 * satori (разметка → SVG, текст в контуры) + resvg (SVG → PNG).
 *
 * 15.11.2026 (владелец): прямоугольный формат 1280 px в ширину, высота по содержимому (не меньше 16:9).
 * Слева — надзаголовок, заголовок, дата, статус, подсказка; справа — данные. Без нарисованных кнопок:
 * нажимаются только настоящие кнопки под картинкой.
 * Варианты для выбора: base — первая версия; date — дата крупно и статус плашкой; tiles — данные плитками;
 * stripe — лаймовая полоса слева.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CardBlock, CardRow, NotificationCard } from './parse';

export const CARD_STYLES = ['base', 'date', 'tiles', 'stripe', 'date-compact', 'date-mini', 'date-band', 'date-grey', 'date-lime', 'lime-faint', 'lime-swoosh', 'lime-corner'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
const DEFAULT_STYLE: CardStyle = 'lime-corner';
/** compact: 0 — обычно; 1 — логотип и надзаголовок в одну строку, строки данных «метка — значение» в одну линию;
 *  2 — то же без панели вокруг данных, меньше поля и кегли (самый низкий). */
/** pattern — узоры мерча WarpHub (15.11.2026): band — лаймовая волна внизу; grey — серые волны на тёмном;
 *  lime — лаймовый фон и чёрные «червячки» справа. Заголовок в узорных вариантах — цветом смысла, без полоски. */
type Pattern = 'band' | 'grey' | 'lime' | 'lime-faint' | 'lime-swoosh' | 'lime-corner';
const isLime = (p?: Pattern) => !!p && p.startsWith('lime');
/** узоры с полосой внизу — содержимое заканчивается выше неё */
const hasBand = (p?: Pattern) => p === 'band' || p === 'lime-swoosh';
type Flags = { date: boolean; tiles: boolean; stripe: boolean; compact: 0 | 1 | 2; pattern?: Pattern };
const FLAGS: Record<CardStyle, Flags> = {
  base: { date: false, tiles: false, stripe: false, compact: 0 },
  date: { date: true, tiles: false, stripe: false, compact: 0 },
  tiles: { date: false, tiles: true, stripe: false, compact: 0 },
  stripe: { date: false, tiles: false, stripe: true, compact: 0 },
  'date-compact': { date: true, tiles: false, stripe: false, compact: 1 },
  'date-mini': { date: true, tiles: false, stripe: false, compact: 2 },
  'date-band': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'band' },
  'date-grey': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'grey' },
  'date-lime': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'lime' },
  'lime-faint': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'lime-faint' },
  'lime-swoosh': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'lime-swoosh' },
  'lime-corner': { date: true, tiles: false, stripe: false, compact: 0, pattern: 'lime-corner' },
};

const BAND = 190;

/** Волна из полуволн-кубиков: x0…x1 на высоте y, размах amp, длина полуволны len. */
function wave(x0: number, x1: number, y: number, amp: number, len: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0, i = 0; x < x1; x += len, i++) {
    const dy = (i % 2 ? 1 : -1) * amp * 1.33;
    d += ` C${(x + len * 0.35).toFixed(1)} ${(y + dy).toFixed(1)} ${(x + len * 0.65).toFixed(1)} ${(y + dy).toFixed(1)} ${x + len} ${y}`;
  }
  return d;
}

function patternSvg(pattern: Pattern, height: number, tone: string) {
  let body = '';
  if (pattern === 'band') {
    const top = height - BAND + 40;
    body =
      `<path d="${wave(-60, W + 260, top, 34, 240)} L${W + 260} ${height + 10} L-60 ${height + 10} Z" fill="${tone}"/>` +
      `<path d="${wave(-80, W + 300, height - 70, 30, 280)}" fill="none" stroke="#111110" stroke-width="34" stroke-linecap="round"/>`;
  } else if (pattern === 'grey') {
    body = [0.3, 0.62, 0.94]
      .map((k) => `<path d="${wave(-120, W + 320, height * k, 60, 330)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="64" stroke-linecap="round"/>`)
      .join('');
    body = `<g transform="rotate(-8 ${W / 2} ${height / 2})">${body}</g>`;
  } else if (pattern === 'lime-faint') {
    // как «Без тебя не начнём»: лайм и чуть более тёмные широкие волны
    body = `<rect width="${W}" height="${height}" fill="${tone}"/>` +
      `<g transform="rotate(-10 ${W / 2} ${height / 2})">` +
      [0.18, 0.55, 0.92].map((k) => `<path d="${wave(-160, W + 360, height * k, 70, 360)}" fill="none" stroke="#111110" stroke-opacity="0.08" stroke-width="90" stroke-linecap="round"/>`).join('') +
      `</g>`;
  } else if (pattern === 'lime-swoosh') {
    // как «Твой ход», наоборот: лайм сверху, внизу чёрная волна и лаймовая линия по ней
    const top = height - BAND + 40;
    body = `<rect width="${W}" height="${height}" fill="${tone}"/>` +
      `<path d="${wave(-60, W + 260, top, 34, 240)} L${W + 260} ${height + 10} L-60 ${height + 10} Z" fill="#111110"/>` +
      `<path d="${wave(-80, W + 300, height - 70, 30, 280)}" fill="none" stroke="${tone}" stroke-width="30" stroke-linecap="round"/>`;
  } else if (pattern === 'lime-corner') {
    // как «Спасибо, что заглянул в Варп»: толстые чёрные «червяки» из угла
    body = `<rect width="${W}" height="${height}" fill="${tone}"/>` +
      `<path d="M${W - 520} -60 C${W - 470} 120 ${W - 300} 60 ${W - 250} 210 S${W - 120} 380 ${W + 60} 330" fill="none" stroke="#111110" stroke-width="58" stroke-linecap="round"/>` +
      `<path d="M${W - 340} -60 C${W - 300} 60 ${W - 170} 20 ${W - 120} 130 S${W - 20} 210 ${W + 60} 170" fill="none" stroke="#111110" stroke-width="58" stroke-linecap="round"/>` +
      `<path d="M-60 ${height - 170} C120 ${height - 230} 180 ${height - 60} 330 ${height - 90} S520 ${height + 10} 600 ${height + 60}" fill="none" stroke="#111110" stroke-width="58" stroke-linecap="round"/>`;
  } else {
    body = `<rect width="${W}" height="${height}" fill="${tone}"/>`;
    for (let y = 40; y < height + 80; y += 150) {
      body += `<path d="M${W - 230} ${y} C${W - 150} ${y - 60} ${W - 90} ${y + 70} ${W + 10} ${y} S${W + 130} ${y - 40} ${W + 200} ${y}" fill="none" stroke="#111110" stroke-width="44" stroke-linecap="round"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><rect width="${W}" height="${height}" fill="#111110"/>${body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const W = 1280;
const MIN_H = 720;
const OSWALD = "'Oswald', 'Oswald Cyr', 'Inter Tight', 'Inter Tight Cyr'";
const INTER = "'Inter Tight', 'Inter Tight Cyr'";
const PAD = 64;
const GAP = 56;
const LEFT = 520;
const RIGHT = W - PAD * 2 - LEFT - GAP;
const COLORS = { bg: '#111110', elevated: '#1A1A18', fg: '#F4F4F0', fg2: '#B8B8B0', fg3: '#8E8E86', accent: '#ECFE46', warn: '#FBBF24', danger: '#F87171' };
const TONE: Record<NotificationCard['tone'], string> = { accent: COLORS.accent, warn: COLORS.warn, danger: COLORS.danger, neutral: COLORS.fg2 };

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

function titleSize(title: string) {
  const n = title.length;
  return n <= 10 ? 104 : n <= 16 ? 88 : n <= 26 ? 72 : 58;
}

/** Примерное число строк (ширина символа ≈ k·кегль) — для высоты картинки. */
function lineCount(text: string, size: number, k: number, width: number) {
  const perLine = Math.max(6, Math.floor(width / (size * k)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const WHEN_LABELS = new Set(['Когда', 'Теперь', 'Время']);

/** Дата/время — крупной строкой под заголовком (вариант date), остальные строки остаются справа. */
function splitWhen(card: NotificationCard, on: boolean): { when: string; blocks: CardBlock[] } {
  if (!on) return { when: '', blocks: card.blocks };
  let when = '';
  const blocks = card.blocks
    .map((b) => {
      if (b.type !== 'rows' || when) return b;
      const i = b.rows.findIndex((r) => WHEN_LABELS.has(r.label));
      if (i < 0) return b;
      when = b.rows[i]!.value;
      return { ...b, rows: b.rows.filter((_, j) => j !== i) };
    })
    .filter((b) => b.type !== 'rows' || b.rows.length > 0);
  return { when, blocks };
}

const TILE_GAP = 16;
const TILE_PAD_X = 24;
const HALF = (RIGHT - TILE_GAP) / 2;
const isWide = (r: CardRow) => r.value.length > 18 || r.label.length > 16;

function tilesHeight(rows: CardRow[]) {
  let h = 0;
  let open = false;
  for (const r of rows) {
    const tile = 4 + 24 + 28 + 6 + lineCount(r.value, 30, 0.5, (isWide(r) ? RIGHT : HALF) - 52) * 40 + 26;
    if (isWide(r)) {
      open = false;
      h += tile + TILE_GAP;
    } else if (open) open = false;
    else {
      open = true;
      h += tile + TILE_GAP;
    }
  }
  return h;
}

/**
 * Одна колонка (15.11.2026, владелец: «одна плашка справа выглядит странно»): если данных мало (до двух строк,
 * без списков и подзаголовков блоков), они встают плашками под датой слева, а текст — под ними; правой колонки нет.
 */
function isSingle(f: Flags, blocks: CardBlock[]) {
  if (!f.pattern) return false;
  if (blocks.some((b) => b.type === 'heading' || b.type === 'list')) return false;
  const rows = blocks.reduce((n, b) => n + (b.type === 'rows' ? b.rows.length : 0), 0);
  return rows <= 2;
}
const SINGLE_W = W - PAD * 2 - 300;

function heights(card: NotificationCard, f: Flags, when: string, blocks: CardBlock[]) {
  if (f.compact) return compactHeight(card, f, when, blocks);
  if (isSingle(f, blocks)) {
    const ts = titleSize(card.title);
    let h = 72 + 48 + 34 + 14 + lineCount(card.title.toUpperCase(), ts, 0.5, SINGLE_W) * ts * 1.04 + 10;
    if (when) h += 26 + 50;
    if (card.subtitle) h += 24 + 50;
    for (const b of blocks) {
      if (b.type === 'rows') h += 28 + b.rows.length * 70;
      if (b.type === 'text') h += 20 + lineCount(b.text, 30, 0.52, SINGLE_W) * 42;
    }
    h += 48 + (card.note ? lineCount(card.note, 26, 0.52, SINGLE_W) * 37 + 16 : 0) + 36;
    return Math.round(Math.min(2400, Math.max(MIN_H, h + PAD * 2 + 48)) + (hasBand(f.pattern) ? BAND - 40 : 0));
  }
  const ts = titleSize(card.title);
  let left = 72 + 48 + 34; // логотип и надзаголовок
  left += 14 + lineCount(card.title.toUpperCase(), ts, 0.5, LEFT) * ts * 1.04 + 34;
  if (when) left += 26 + lineCount(when, 40, 0.46, LEFT) * 50;
  if (card.subtitle) left += f.date ? 24 + lineCount(card.subtitle, 26, 0.5, LEFT - 56) * 36 + 22 : 22 + lineCount(card.subtitle, 32, 0.52, LEFT) * 44;
  left += 48 + (card.note ? lineCount(card.note, 26, 0.52, LEFT) * 37 + 16 : 0) + 36;
  let right = 0;
  for (const b of blocks) {
    if (b.type === 'rows') right += f.tiles ? tilesHeight(b.rows) : 12 + b.rows.reduce((s, r) => s + 62 + lineCount(r.value, 32, 0.52, RIGHT - 64) * 42, 0) + 24;
    if (b.type === 'heading') right += 32 + lineCount(b.text, 34, 0.5, RIGHT) * 44;
    if (b.type === 'list') right += 16 + b.items.reduce((s, i) => s + 12 + lineCount(i, 30, 0.52, RIGHT - 40) * 42, 0);
    if (b.type === 'text') right += 24 + lineCount(b.text, 30, 0.52, RIGHT) * 42;
  }
  return Math.round(Math.min(2400, Math.max(MIN_H, Math.max(left, right) + PAD * 2 + 48)) + (hasBand(f.pattern) ? BAND - 40 : 0));
}

const C = {
  1: { pad: 52, minH: 600, title: 0.86, when: 36, row: 30, rowPad: 14 },
  2: { pad: 44, minH: 520, title: 0.78, when: 32, row: 28, rowPad: 10 },
} as const;

function compactHeight(card: NotificationCard, f: Flags, when: string, blocks: CardBlock[]) {
  const c = C[f.compact as 1 | 2];
  const ts = Math.round(titleSize(card.title) * c.title);
  const left0 = W - c.pad * 2 - RIGHT - GAP;
  let left = 56 + 34; // логотип+надзаголовок
  left += lineCount(card.title.toUpperCase(), ts, 0.5, left0) * ts * 1.04 + 20 + 10;
  if (when) left += 20 + lineCount(when, c.when, 0.46, left0) * c.when * 1.25;
  if (card.subtitle) left += 20 + lineCount(card.subtitle, 24, 0.5, left0 - 50) * 32 + 18;
  left += 36 + (card.note ? lineCount(card.note, 24, 0.52, left0) * 34 + 12 : 0) + 30;
  let right = 0;
  for (const b of blocks) {
    if (b.type === 'rows') right += (f.compact === 1 ? 12 : 0) + b.rows.reduce((s, r) => s + c.rowPad * 2 + lineCount(r.value, c.row, 0.52, RIGHT - 230) * c.row * 1.3 + 2, 0) + (f.compact === 1 ? 12 : 0);
    if (b.type === 'heading') right += 26 + lineCount(b.text, 30, 0.5, RIGHT) * 40;
    if (b.type === 'list') right += 12 + b.items.reduce((s, i) => s + 10 + lineCount(i, 28, 0.52, RIGHT - 36) * 38, 0);
    if (b.type === 'text') right += 20 + lineCount(b.text, 28, 0.52, RIGHT) * 39;
  }
  return Math.round(Math.min(2400, Math.max(c.minH, Math.max(left, right) + c.pad * 2 + 24)));
}

/** Строки «метка — значение» в одну линию (компактные варианты). */
function inlineRows(rows: CardRow[], f: Flags, first: boolean): Node {
  const c = C[f.compact as 1 | 2];
  const panel = f.compact === 1;
  return el(
    'div',
    {
      flexDirection: 'column',
      marginTop: first ? 0 : 20,
      ...(panel ? { padding: '4px 28px', backgroundColor: COLORS.elevated, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 24 } : {}),
    },
    rows.map((r, i) =>
      el('div', { alignItems: 'baseline', padding: `${c.rowPad}px 0`, borderTop: i ? '2px solid rgba(255,255,255,0.07)' : 'none' }, [
        el('div', { width: 190, flexShrink: 0, fontFamily: INTER, fontWeight: 600, fontSize: 19, letterSpacing: 2.5, textTransform: 'uppercase', color: COLORS.fg3 }, r.label),
        el('div', { flex: 1, fontFamily: INTER, fontWeight: 600, fontSize: c.row, lineHeight: 1.3, color: COLORS.fg }, r.value),
      ]),
    ),
  );
}

function tiles(rows: CardRow[], tone: string): Node {
  return el(
    'div',
    { flexWrap: 'wrap', justifyContent: 'space-between' },
    rows.map((r) =>
      el(
        'div',
        {
          flexDirection: 'column',
          // satori считает ширину без полей и рамки — вычитаем их, иначе две плитки не встают в ряд
          width: (isWide(r) ? RIGHT : HALF) - TILE_PAD_X * 2 - 4,
          marginBottom: TILE_GAP,
          padding: `24px ${TILE_PAD_X}px 26px`,
          backgroundColor: COLORS.elevated,
          border: '2px solid rgba(255,255,255,0.08)',
          borderRadius: 24,
        },
        [
          el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', color: tone }, r.label),
          el('div', { marginTop: 6, fontFamily: INTER, fontWeight: 600, fontSize: 30, lineHeight: 1.3, color: COLORS.fg }, r.value),
        ],
      ),
    ),
  );
}

function block(b: CardBlock, tone: string, f: Flags, first: boolean, onLime = false): Node {
  const top = first ? 0 : 28;
  if (b.type === 'rows' && f.tiles) return el('div', { marginTop: top }, tiles(b.rows, tone));
  if (b.type === 'rows' && f.compact) return inlineRows(b.rows, f, first);
  if (b.type === 'rows') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: top, padding: '6px 32px', backgroundColor: COLORS.elevated, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 28 },
      b.rows.map((r, i) =>
        el('div', { flexDirection: 'column', padding: '18px 0', borderTop: i ? '2px solid rgba(255,255,255,0.07)' : 'none' }, [
          el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.fg3 }, r.label),
          el('div', { marginTop: 4, fontFamily: INTER, fontWeight: 600, fontSize: 32, lineHeight: 1.3, color: COLORS.fg }, r.value),
        ]),
      ),
    );
  }
  if (b.type === 'heading') {
    return el('div', { marginTop: first ? 0 : 32, fontFamily: OSWALD, fontWeight: 600, fontSize: 34, textTransform: 'uppercase', letterSpacing: 1, color: onLime ? COLORS.bg : COLORS.fg }, b.text);
  }
  if (b.type === 'list') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: first ? 0 : 16 },
      b.items.map((item) =>
        el('div', { alignItems: 'flex-start', marginTop: 12 }, [
          el('div', { width: 12, height: 12, marginTop: 14, marginRight: 20, borderRadius: 6, backgroundColor: onLime ? COLORS.bg : tone, flexShrink: 0 }),
          el('div', { flex: 1, fontFamily: INTER, fontWeight: 400, fontSize: 30, lineHeight: 1.4, color: onLime ? COLORS.bg : COLORS.fg }, item),
        ]),
      ),
    );
  }
  return el('div', { marginTop: first ? 0 : 24, fontFamily: INTER, fontWeight: 400, fontSize: 30, lineHeight: 1.4, color: onLime ? 'rgba(17,17,16,0.8)' : COLORS.fg2 }, b.text);
}

export function cardTree(card: NotificationCard, logoSrc: string, height: number, style: CardStyle = DEFAULT_STYLE): Node {
  const f = FLAGS[style];
  const tone = TONE[card.tone];
  const { when, blocks } = splitWhen(card, f.date);
  if (f.compact) return compactTree(card, logoSrc, height, f, tone, when, blocks);
  const ts = titleSize(card.title);
  const onLime = isLime(f.pattern);
  const ink = onLime ? COLORS.bg : COLORS.fg; // основной текст
  const accentText = onLime ? COLORS.bg : tone; // надзаголовок
  const muted = onLime ? 'rgba(17,17,16,0.72)' : COLORS.fg3;
  const left = el('div', { flexDirection: 'column', width: LEFT, flexShrink: 0 }, [
    el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
      el('img', { width: 72, height: 72 }, undefined, { src: logoSrc, width: 72, height: 72 }),
      el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 20, letterSpacing: 8, color: muted }, 'WARPHUB'),
    ]),
    el('div', { marginTop: 48, fontFamily: INTER, fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: 'uppercase', color: accentText }, f.stripe ? `${card.kicker} · WarpHub` : card.kicker),
    el('div', { marginTop: 14, fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.04, textTransform: 'uppercase', color: f.pattern && !onLime ? tone : ink }, card.title),
    ...(f.pattern ? [] : [el('div', { marginTop: 22, width: f.stripe ? 200 : 130, height: 10, borderRadius: 5, backgroundColor: tone })]),
    ...(when ? [el('div', { marginTop: 26, fontFamily: OSWALD, fontWeight: 600, fontSize: 40, lineHeight: 1.2, textTransform: 'uppercase', color: ink }, when)] : []),
    ...(card.subtitle && f.date
      ? [
          el('div', { marginTop: 24 }, [
            el(
              'div',
              onLime
                ? { padding: '8px 24px', borderRadius: 40, backgroundColor: COLORS.bg, fontFamily: OSWALD, fontWeight: 600, fontSize: 26, letterSpacing: 1, textTransform: 'uppercase', color: tone }
                : { padding: '8px 24px', border: `3px solid ${tone}`, borderRadius: 40, fontFamily: OSWALD, fontWeight: 600, fontSize: 26, letterSpacing: 1, textTransform: 'uppercase', color: tone },
              card.subtitle,
            ),
          ]),
        ]
      : []),
    ...(card.subtitle && !f.date ? [el('div', { marginTop: 22, fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.35, color: COLORS.fg2 }, card.subtitle)] : []),
    el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 48 }, [
      ...(card.note ? [el('div', { marginBottom: 16, fontFamily: INTER, fontWeight: 400, fontSize: 26, lineHeight: 1.4, color: onLime ? muted : COLORS.fg3 }, card.note)] : []),
      el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 22, letterSpacing: 8, color: muted }, '• WARPHUB.RU •'),
    ]),
  ]);
  if (f.pattern && isSingle(f, blocks)) {
    // данных мало — всё в одну колонку: плашки «метка значение» и текст под датой
    const items: Node[] = [];
    for (const b of blocks) {
      if (b.type === 'rows') {
        items.push(
          el(
            'div',
            { flexWrap: 'wrap', marginTop: 28 },
            b.rows.map((r) =>
              el('div', { alignItems: 'baseline', padding: '12px 22px', marginRight: 14, marginBottom: 12, backgroundColor: COLORS.bg, borderRadius: 16 }, [
                el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 18, letterSpacing: 2.5, textTransform: 'uppercase', color: COLORS.fg3 }, r.label),
                el('div', { marginLeft: 14, fontFamily: INTER, fontWeight: 600, fontSize: 28, color: COLORS.fg }, r.value),
              ]),
            ),
          ),
        );
      }
      if (b.type === 'text') {
        items.push(el('div', { marginTop: 20, fontFamily: INTER, fontWeight: 400, fontSize: 30, lineHeight: 1.4, color: onLime ? 'rgba(17,17,16,0.8)' : COLORS.fg2 }, b.text));
      }
    }
    const children = left.props.children as Node[];
    const single = el('div', { flexDirection: 'column', width: SINGLE_W, flexShrink: 0 }, [...children.slice(0, -1), ...items, children.at(-1)]);
    const contentH = height - PAD * 2 - (hasBand(f.pattern) ? BAND - 40 : 0);
    return el('div', { width: W, height, position: 'relative', backgroundColor: COLORS.bg }, [
      el('img', { position: 'absolute', top: 0, left: 0, width: W, height }, undefined, { src: patternSvg(f.pattern, height, tone), width: W, height }),
      el('div', { position: 'absolute', top: PAD, left: PAD, width: W - PAD * 2, height: contentH }, [single]),
    ]);
  }
  if (f.pattern) {
    const right = el(
      'div',
      { flexDirection: 'column', width: RIGHT, marginLeft: GAP, justifyContent: 'center' },
      blocks.map((b, i) => block(b, tone, f, i === 0, onLime)),
    );
    const contentH = height - PAD * 2 - (hasBand(f.pattern) ? BAND - 40 : 0);
    // фон-узор картинкой; содержимое — абсолютно и после фона, иначе satori рисует фон поверх текста
    return el('div', { width: W, height, position: 'relative', backgroundColor: COLORS.bg }, [
      el('img', { position: 'absolute', top: 0, left: 0, width: W, height }, undefined, { src: patternSvg(f.pattern, height, tone), width: W, height }),
      el('div', { position: 'absolute', top: PAD, left: PAD, width: W - PAD * 2, height: contentH }, [left, right]),
    ]);
  }
  const right = el(
    'div',
    { flexDirection: 'column', width: RIGHT, marginLeft: GAP, justifyContent: 'center' },
    blocks.map((b, i) => block(b, tone, f, i === 0)),
  );
  // поля — отступом внутреннего блока: у корня satori считает padding сверх ширины
  return el(
    'div',
    {
      width: W,
      height,
      backgroundColor: COLORS.bg,
      backgroundImage: `radial-gradient(circle at 0% 0%, ${tone}2E 0%, rgba(17,17,16,0) 42%)`,
      ...(f.stripe ? { borderLeft: `14px solid ${tone}` } : {}),
    },
    el('div', { flexGrow: 1, margin: PAD, marginLeft: f.stripe ? PAD - 14 : PAD, width: W - PAD * 2 }, [left, right]),
  );
}

function compactTree(card: NotificationCard, logoSrc: string, height: number, f: Flags, tone: string, when: string, blocks: CardBlock[]): Node {
  const c = C[f.compact as 1 | 2];
  const ts = Math.round(titleSize(card.title) * c.title);
  const leftW = W - c.pad * 2 - RIGHT - GAP;
  const left = el('div', { flexDirection: 'column', width: leftW, flexShrink: 0 }, [
    el('div', { alignItems: 'center' }, [
      el('img', { width: 56, height: 56 }, undefined, { src: logoSrc, width: 56, height: 56 }),
      el('div', { marginLeft: 18, fontFamily: INTER, fontWeight: 600, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: tone }, card.kicker),
    ]),
    el('div', { marginTop: 30, fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.04, textTransform: 'uppercase', color: COLORS.fg }, card.title),
    el('div', { marginTop: 18, width: 110, height: 8, borderRadius: 4, backgroundColor: tone }),
    ...(when ? [el('div', { marginTop: 20, fontFamily: OSWALD, fontWeight: 600, fontSize: c.when, lineHeight: 1.2, textTransform: 'uppercase', color: COLORS.fg }, when)] : []),
    ...(card.subtitle
      ? [
          el('div', { marginTop: 18 }, [
            el(
              'div',
              { padding: '6px 20px', border: `3px solid ${tone}`, borderRadius: 40, fontFamily: OSWALD, fontWeight: 600, fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', color: tone },
              card.subtitle,
            ),
          ]),
        ]
      : []),
    el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 36 }, [
      ...(card.note ? [el('div', { marginBottom: 12, fontFamily: INTER, fontWeight: 400, fontSize: 24, lineHeight: 1.4, color: COLORS.fg3 }, card.note)] : []),
      el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 20, letterSpacing: 8, color: COLORS.fg3 }, '• WARPHUB.RU •'),
    ]),
  ]);
  const right = el(
    'div',
    { flexDirection: 'column', width: RIGHT, marginLeft: GAP, justifyContent: 'center' },
    blocks.map((b, i) => block(b, tone, f, i === 0)),
  );
  return el(
    'div',
    { width: W, height, backgroundColor: COLORS.bg, backgroundImage: `radial-gradient(circle at 0% 0%, ${tone}2E 0%, rgba(17,17,16,0) 42%)` },
    el('div', { flexGrow: 1, margin: c.pad, width: W - c.pad * 2 }, [left, right]),
  );
}

/** PNG карточки. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard, style: CardStyle = DEFAULT_STYLE): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const f = FLAGS[style];
  const { when, blocks } = splitWhen(card, f.date);
  const height = heights(card, f, when, blocks);
  const svg = await satori(cardTree(card, l, height, style) as never, { width: W, height, fonts: fl });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
