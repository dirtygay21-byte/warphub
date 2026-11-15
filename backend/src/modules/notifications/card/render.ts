/**
 * Рисует карточку уведомления в PNG (14.11.2026): стиль макетов WarpHub — тёмный фон #111110, лайм #ECFE46,
 * заголовки Oswald в верхнем регистре, текст Inter Tight.
 * «Живая» версия (15.11.2026, по открыткам WarpHub): HUD-кольца с делениями и светящийся знак WBG справа сверху,
 * сетка на фоне, уголки-рамки, дата крупно под заголовком, статус — контурной плашкой, данные — плитками,
 * внизу лаймовая кнопка «как на афише». Цвет колец и акцентов — по смыслу уведомления.
 * satori (разметка → SVG, текст в контуры) + resvg (SVG → PNG). Ширина 1080, высота по содержимому.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { LOGO_D, LOGO_VIEWBOX } from './logo';
import type { CardBlock, CardRow, NotificationCard } from './parse';

const W = 1080;
const OSWALD = "'Oswald', 'Oswald Cyr', 'Inter Tight', 'Inter Tight Cyr'";
const INTER = "'Inter Tight', 'Inter Tight Cyr'";
const PAD = 72;
const INNER = W - PAD * 2;
const COLORS = { bg: '#111110', elevated: '#1A1A18', fg: '#F4F4F0', fg2: '#B8B8B0', fg3: '#8E8E86', accent: '#ECFE46', warn: '#FBBF24', danger: '#F87171' };
const TONE: Record<NotificationCard['tone'], string> = { accent: COLORS.accent, warn: COLORS.warn, danger: COLORS.danger, neutral: COLORS.fg2 };

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' };
let fonts: Font[] | null = null;

function loadFonts() {
  if (fonts) return fonts;
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
  return fonts;
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children, ...extra },
});

const WHEN_LABELS = new Set(['Когда', 'Теперь', 'Время']);
const TOP = 300; // высота верхней зоны: надзаголовок слева, знак в кольцах справа

/** Дата/время поднимается под заголовок крупной строкой (как на афише), остальные строки — плитками. */
function splitWhen(card: NotificationCard): { when: string; blocks: CardBlock[] } {
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

function titleSize(title: string) {
  const n = title.length;
  return n <= 12 ? 124 : n <= 18 ? 104 : n <= 28 ? 84 : 66;
}

/** Примерное число строк (ширина символа ≈ k·кегль) — для высоты картинки. */
function lineCount(text: string, size: number, k: number, width = INNER) {
  const perLine = Math.max(6, Math.floor(width / (size * k)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const TILE_GAP = 20;
const HALF = (INNER - TILE_GAP) / 2;
const isWide = (r: CardRow) => r.value.length > 22 || r.label.length > 18;

function tilesHeight(rows: CardRow[]) {
  let h = 0;
  let pendingHalf = false;
  for (const r of rows) {
    const tile = 36 + 30 + 10 + lineCount(r.value, 34, 0.5, (isWide(r) ? INNER : HALF) - 56) * 44 + 32;
    if (isWide(r)) {
      if (pendingHalf) pendingHalf = false;
      h += tile + TILE_GAP;
    } else if (pendingHalf) {
      pendingHalf = false;
    } else {
      pendingHalf = true;
      h += tile + TILE_GAP;
    }
  }
  return h;
}

function estimateHeight(card: NotificationCard, when: string, blocks: CardBlock[]) {
  const ts = titleSize(card.title);
  let h = PAD + TOP;
  h += lineCount(card.title.toUpperCase(), ts, 0.48) * ts * 1.02 + 30 + 10;
  if (when) h += 28 + lineCount(when, 46, 0.46) * 58;
  if (card.subtitle) h += 28 + lineCount(card.subtitle, 28, 0.5, INNER - 60) * 38 + 24;
  for (const b of blocks) {
    if (b.type === 'rows') h += 40 + tilesHeight(b.rows);
    if (b.type === 'heading') h += 40 + lineCount(b.text, 38, 0.5) * 48;
    if (b.type === 'list') h += 24 + b.items.reduce((s, i) => s + 14 + lineCount(i, 32, 0.52, INNER - 40) * 45, 0);
    if (b.type === 'text') h += 28 + lineCount(b.text, 32, 0.52) * 45;
  }
  h += 64 + (card.note ? lineCount(card.note, 28, 0.52) * 40 + 24 : 0) + 84 + PAD;
  return Math.round(Math.min(2600, Math.max(1000, h + 40)));
}

/** Фон одной картинкой SVG: сетка, свечение, HUD-кольца с делениями, знак WBG, уголки-рамки. */
function backdrop(height: number, tone: string): string {
  const cx = W - 200;
  const cy = 190;
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = i % 6 === 0 ? 226 : 236;
    const p = (r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    return `<path d="M${p(r1)} L${p(246)}" stroke="${tone}" stroke-opacity="${i % 6 === 0 ? 0.7 : 0.35}" stroke-width="${i % 6 === 0 ? 3 : 2}"/>`;
  }).join('');
  const corner = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x} ${y + dy * 54} L${x} ${y} L${x + dx * 54} ${y}" fill="none" stroke="${tone}" stroke-opacity="0.55" stroke-width="3"/>`;
  const lw = 230;
  const lh = (lw * 550.63) / 657.12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
<defs>
  <pattern id="g" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1.5"/></pattern>
  <radialGradient id="glow" cx="${cx}" cy="${cy}" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tone}" stop-opacity="0.30"/><stop offset="0.45" stop-color="${tone}" stop-opacity="0.07"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>
  <radialGradient id="low" cx="0" cy="${height}" r="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tone}" stop-opacity="0.10"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111110" stop-opacity="0"/><stop offset="1" stop-color="#111110" stop-opacity="0.85"/></linearGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
</defs>
<rect width="${W}" height="${height}" fill="#111110"/>
<rect width="${W}" height="${height}" fill="url(#g)"/>
<rect width="${W}" height="${height}" fill="url(#glow)"/>
<rect width="${W}" height="${height}" fill="url(#low)"/>
<circle cx="${cx}" cy="${cy}" r="300" fill="none" stroke="${tone}" stroke-opacity="0.12" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="246" fill="none" stroke="${tone}" stroke-opacity="0.22" stroke-width="2"/>
${ticks}
<circle cx="${cx}" cy="${cy}" r="196" fill="none" stroke="${tone}" stroke-opacity="0.55" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="162" fill="none" stroke="${tone}" stroke-opacity="0.30" stroke-width="2"/>
<g transform="translate(${cx - lw / 2} ${cy - lh / 2}) rotate(-6 ${lw / 2} ${lh / 2})">
  <svg width="${lw}" height="${lh.toFixed(1)}" viewBox="${LOGO_VIEWBOX}"><path d="${LOGO_D}" fill="${tone}" filter="url(#blur)" opacity="0.65"/><path d="${LOGO_D}" fill="${tone}"/></svg>
</g>
<rect y="${height - 420}" width="${W}" height="420" fill="url(#fade)"/>
${corner(28, 28, 1, 1)}${corner(W - 28, 28, -1, 1)}${corner(28, height - 28, 1, -1)}${corner(W - 28, height - 28, -1, -1)}
</svg>`;
}

function tiles(rows: CardRow[], tone: string): Node {
  return el(
    'div',
    { flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 40 },
    rows.map((r) =>
      el(
        'div',
        {
          flexDirection: 'column',
          width: isWide(r) ? INNER : HALF,
          marginBottom: TILE_GAP,
          padding: '30px 28px 32px',
          backgroundColor: 'rgba(26,26,24,0.88)',
          border: '2px solid rgba(255,255,255,0.08)',
          borderRadius: 28,
        },
        [
          el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', color: tone }, r.label),
          el('div', { marginTop: 10, fontFamily: INTER, fontWeight: 600, fontSize: 34, lineHeight: 1.3, color: COLORS.fg }, r.value),
        ],
      ),
    ),
  );
}

function block(b: CardBlock, tone: string): Node {
  if (b.type === 'rows') return tiles(b.rows, tone);
  if (b.type === 'heading') {
    return el('div', { marginTop: 40, fontFamily: OSWALD, fontWeight: 600, fontSize: 38, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.fg }, b.text);
  }
  if (b.type === 'list') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: 24 },
      b.items.map((item) =>
        el('div', { alignItems: 'flex-start', marginTop: 14 }, [
          el('div', { width: 16, height: 16, marginTop: 14, marginRight: 22, transform: 'rotate(45deg)', backgroundColor: tone, flexShrink: 0 }),
          el('div', { flex: 1, fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.4, color: COLORS.fg }, item),
        ]),
      ),
    );
  }
  return el('div', { marginTop: 28, fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.4, color: COLORS.fg2 }, b.text);
}

export function cardTree(card: NotificationCard, height: number): Node {
  const tone = TONE[card.tone];
  const ts = titleSize(card.title);
  const { when, blocks } = splitWhen(card);
  const bg = `data:image/svg+xml;base64,${Buffer.from(backdrop(height, tone)).toString('base64')}`;
  // поля — отступом внутреннего блока: у корня satori считает padding сверх ширины
  return el('div', { width: W, height, position: 'relative', backgroundColor: COLORS.bg }, [
    el('img', { position: 'absolute', top: 0, left: 0, width: W, height }, undefined, { src: bg, width: W, height }),
    // содержимое тоже абсолютное и после фона — иначе satori рисует фон поверх текста
    el('div', { position: 'absolute', top: PAD, left: PAD, flexDirection: 'column', width: INNER, height: height - PAD * 2 }, [
      el('div', { flexDirection: 'column', height: TOP - PAD + 40, maxWidth: 560 }, [
        el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 26, letterSpacing: 6, color: COLORS.fg3 }, 'WARP BOYS & GIRLS'),
        el('div', { marginTop: 18, fontFamily: OSWALD, fontWeight: 600, fontSize: 32, letterSpacing: 5, textTransform: 'uppercase', color: tone }, `${card.kicker} · WarpHub`),
      ]),
      el('div', { fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.02, textTransform: 'uppercase', color: COLORS.fg }, card.title),
      el('div', { marginTop: 22, width: 220, height: 10, backgroundColor: tone }),
      ...(when ? [el('div', { marginTop: 28, fontFamily: OSWALD, fontWeight: 600, fontSize: 46, lineHeight: 1.2, textTransform: 'uppercase', color: COLORS.fg }, when)] : []),
      ...(card.subtitle
        ? [
            el('div', { marginTop: 28 }, [
              el(
                'div',
                { padding: '10px 26px', border: `3px solid ${tone}`, borderRadius: 40, fontFamily: OSWALD, fontWeight: 600, fontSize: 28, letterSpacing: 1, textTransform: 'uppercase', color: tone },
                card.subtitle,
              ),
            ]),
          ]
        : []),
      ...blocks.map((b) => block(b, tone)),
      el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 64 }, [
        ...(card.note ? [el('div', { marginBottom: 24, fontFamily: INTER, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color: COLORS.fg2 }, card.note)] : []),
        el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
          el('div', { alignItems: 'center' }, [
            el('div', { padding: '16px 34px', borderRadius: 18, backgroundColor: tone, fontFamily: OSWALD, fontWeight: 700, fontSize: 34, letterSpacing: 1, color: COLORS.bg }, 'ОТКРЫТЬ'),
            el('div', { marginLeft: 20, fontFamily: INTER, fontWeight: 400, fontSize: 26, color: COLORS.fg2 }, 'в приложении WarpHub'),
          ]),
          el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 24, letterSpacing: 8, color: COLORS.fg3 }, '• WARPHUB.RU •'),
        ]),
      ]),
    ]),
  ]);
}

/** PNG карточки. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard): Promise<Uint8Array> {
  const f = loadFonts();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const { when, blocks } = splitWhen(card);
  const height = estimateHeight(card, when, blocks);
  const svg = await satori(cardTree(card, height) as never, { width: W, height, fonts: f });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
