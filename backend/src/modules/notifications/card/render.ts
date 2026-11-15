/**
 * Рисует карточку уведомления в PNG (14.11.2026): стиль макетов WarpHub — тёмный фон #111110, лайм #ECFE46,
 * заголовки Oswald в верхнем регистре, текст Inter Tight, логотип WARP BOYS & GIRLS.
 * satori (разметка → SVG, текст в контуры) + resvg (SVG → PNG). Ширина 1080, высота по содержимому.
 *
 * Варианты (15.11.2026, владелец выбирает по примерам): base — первая версия; date — дата крупно и статус плашкой;
 * tiles — данные плитками в два ряда; stripe — лаймовая полоса слева; cta — сетка и кнопка «Открыть» внизу;
 * combo — date + tiles + cta.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CardBlock, CardRow, NotificationCard } from './parse';

export const CARD_STYLES = ['base', 'date', 'tiles', 'stripe', 'cta', 'combo'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
const DEFAULT_STYLE: CardStyle = 'base';
type Flags = { date: boolean; tiles: boolean; stripe: boolean; cta: boolean };
const FLAGS: Record<CardStyle, Flags> = {
  base: { date: false, tiles: false, stripe: false, cta: false },
  date: { date: true, tiles: false, stripe: false, cta: false },
  tiles: { date: false, tiles: true, stripe: false, cta: false },
  stripe: { date: false, tiles: false, stripe: true, cta: false },
  cta: { date: false, tiles: false, stripe: false, cta: true },
  combo: { date: true, tiles: true, stripe: false, cta: true },
};

const W = 1080;
const OSWALD = "'Oswald', 'Oswald Cyr', 'Inter Tight', 'Inter Tight Cyr'";
const INTER = "'Inter Tight', 'Inter Tight Cyr'";
const PAD = 72;
const INNER = W - PAD * 2;
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
  return n <= 12 ? 112 : n <= 20 ? 92 : n <= 32 ? 76 : 62;
}

/** Примерное число строк (ширина символа ≈ k·кегль) — для высоты картинки. */
function lineCount(text: string, size: number, k: number, width = INNER) {
  const perLine = Math.max(8, Math.floor(width / (size * k)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const WHEN_LABELS = new Set(['Когда', 'Теперь', 'Время']);

/** Дата/время — крупной строкой под заголовком (вариант date), остальные строки остаются. */
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

const TILE_GAP = 20;
const TILE_PAD_X = 28;
const HALF = (INNER - TILE_GAP) / 2;
const isWide = (r: CardRow) => r.value.length > 22 || r.label.length > 18;

function tilesHeight(rows: CardRow[]) {
  let h = 0;
  let open = false;
  for (const r of rows) {
    const tile = 4 + 28 + 30 + 8 + lineCount(r.value, 34, 0.5, (isWide(r) ? INNER : HALF) - 60) * 44 + 30;
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

function estimateHeight(card: NotificationCard, f: Flags, when: string, blocks: CardBlock[]) {
  const ts = titleSize(card.title);
  let h = PAD * 2 + 88; // поля и шапка
  h += 56 + 40; // надзаголовок
  h += 16 + lineCount(card.title.toUpperCase(), ts, 0.5) * ts * 1.04 + 34;
  if (when) h += 28 + lineCount(when, 44, 0.46) * 56;
  if (card.subtitle) h += f.date ? 28 + lineCount(card.subtitle, 28, 0.5, INNER - 60) * 38 + 24 : 24 + lineCount(card.subtitle, 36, 0.52) * 50;
  for (const b of blocks) {
    if (b.type === 'rows') h += f.tiles ? 40 + tilesHeight(b.rows) : 40 + 16 + b.rows.reduce((s, r) => s + 70 + lineCount(r.value, 36, 0.52, INNER - 72) * 48, 0);
    if (b.type === 'heading') h += 40 + lineCount(b.text, 38, 0.5) * 48;
    if (b.type === 'list') h += 24 + b.items.reduce((s, i) => s + 12 + lineCount(i, 32, 0.52, INNER - 40) * 45, 0);
    if (b.type === 'text') h += 28 + lineCount(b.text, 32, 0.52) * 45;
  }
  h += 56 + 2 + 28 + (card.note ? lineCount(card.note, 28, 0.52) * 40 + 16 : 0) + (f.cta ? 96 : 36);
  return Math.round(Math.min(2400, Math.max(760, h + 96)));
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
          // satori считает ширину без полей и рамки — вычитаем их, иначе две плитки не встают в ряд
          width: (isWide(r) ? INNER : HALF) - TILE_PAD_X * 2 - 4,
          marginBottom: TILE_GAP,
          padding: `28px ${TILE_PAD_X}px 30px`,
          backgroundColor: COLORS.elevated,
          border: '2px solid rgba(255,255,255,0.08)',
          borderRadius: 28,
        },
        [
          el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: tone }, r.label),
          el('div', { marginTop: 8, fontFamily: INTER, fontWeight: 600, fontSize: 34, lineHeight: 1.3, color: COLORS.fg }, r.value),
        ],
      ),
    ),
  );
}

function block(b: CardBlock, tone: string, f: Flags): Node {
  if (b.type === 'rows' && f.tiles) return tiles(b.rows, tone);
  if (b.type === 'rows') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: 40, padding: '8px 36px', backgroundColor: COLORS.elevated, border: '2px solid rgba(255,255,255,0.08)', borderRadius: 32 },
      b.rows.map((r, i) =>
        el('div', { flexDirection: 'column', padding: '22px 0', borderTop: i ? '2px solid rgba(255,255,255,0.07)' : 'none' }, [
          el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.fg3 }, r.label),
          el('div', { marginTop: 6, fontFamily: INTER, fontWeight: 600, fontSize: 36, lineHeight: 1.3, color: COLORS.fg }, r.value),
        ]),
      ),
    );
  }
  if (b.type === 'heading') {
    return el('div', { marginTop: 40, fontFamily: OSWALD, fontWeight: 600, fontSize: 38, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.fg }, b.text);
  }
  if (b.type === 'list') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: 24 },
      b.items.map((item) =>
        el('div', { alignItems: 'flex-start', marginTop: 12 }, [
          el('div', { width: 14, height: 14, marginTop: 15, marginRight: 22, borderRadius: 7, backgroundColor: tone, flexShrink: 0 }),
          el('div', { flex: 1, fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.4, color: COLORS.fg }, item),
        ]),
      ),
    );
  }
  return el('div', { marginTop: 28, fontFamily: INTER, fontWeight: 400, fontSize: 32, lineHeight: 1.4, color: COLORS.fg2 }, b.text);
}

const GRID = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54"><path d="M54 0H0V54" fill="none" stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="1.5"/></svg>',
).toString('base64')}`;

export function cardTree(card: NotificationCard, logoSrc: string, height: number, style: CardStyle = DEFAULT_STYLE): Node {
  const f = FLAGS[style];
  const tone = TONE[card.tone];
  const ts = titleSize(card.title);
  const { when, blocks } = splitWhen(card, f.date);
  // поля — отступом внутреннего блока: у корня satori считает padding сверх ширины (содержимое уезжало за край)
  return el(
    'div',
    {
      width: W,
      height,
      backgroundColor: COLORS.bg,
      backgroundImage: f.cta
        ? `radial-gradient(circle at 88% 0%, ${tone}33 0%, rgba(17,17,16,0) 46%), url(${GRID})`
        : `radial-gradient(circle at 88% 0%, ${tone}33 0%, rgba(17,17,16,0) 46%)`,
      ...(f.cta ? { backgroundSize: `100% 100%, 54px 54px`, backgroundRepeat: 'no-repeat, repeat' } : {}),
      ...(f.stripe ? { borderLeft: `16px solid ${tone}` } : {}),
    },
    el('div', { flexDirection: 'column', flexGrow: 1, margin: PAD, marginLeft: f.stripe ? PAD - 16 : PAD, width: INNER }, [
      el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
        el('img', { width: 88, height: 88 }, undefined, { src: logoSrc, width: 88, height: 88 }),
        el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 22, letterSpacing: 8, color: COLORS.fg3 }, 'WARPHUB'),
      ]),
      el('div', { marginTop: 56, fontFamily: INTER, fontWeight: 600, fontSize: 28, letterSpacing: 5, textTransform: 'uppercase', color: tone }, f.stripe ? `${card.kicker} · WarpHub` : card.kicker),
      el('div', { marginTop: 16, fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.04, textTransform: 'uppercase', color: COLORS.fg }, card.title),
      el('div', { marginTop: 24, width: f.stripe ? 220 : 140, height: 10, borderRadius: 5, backgroundColor: tone }),
      ...(when ? [el('div', { marginTop: 28, fontFamily: OSWALD, fontWeight: 600, fontSize: 44, lineHeight: 1.2, textTransform: 'uppercase', color: COLORS.fg }, when)] : []),
      ...(card.subtitle && f.date
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
      ...(card.subtitle && !f.date ? [el('div', { marginTop: 24, fontFamily: INTER, fontWeight: 400, fontSize: 36, lineHeight: 1.35, color: COLORS.fg2 }, card.subtitle)] : []),
      ...blocks.map((b) => block(b, tone, f)),
      el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 56 }, [
        el('div', { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' }),
        ...(card.note ? [el('div', { marginTop: 28, fontFamily: INTER, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color: COLORS.fg3 }, card.note)] : []),
        f.cta
          ? el('div', { marginTop: 28, alignItems: 'center', justifyContent: 'space-between' }, [
              el('div', { alignItems: 'center' }, [
                el('div', { padding: '14px 32px', borderRadius: 16, backgroundColor: tone, fontFamily: OSWALD, fontWeight: 700, fontSize: 32, color: COLORS.bg }, 'ОТКРЫТЬ'),
                el('div', { marginLeft: 20, fontFamily: INTER, fontWeight: 400, fontSize: 26, color: COLORS.fg2 }, 'в приложении WarpHub'),
              ]),
              el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 24, letterSpacing: 8, color: COLORS.fg3 }, '• WARPHUB.RU •'),
            ])
          : el('div', { marginTop: card.note ? 16 : 28, fontFamily: OSWALD, fontWeight: 600, fontSize: 24, letterSpacing: 8, color: COLORS.fg3 }, '• WARPHUB.RU •'),
      ]),
    ]),
  );
}

/** PNG карточки. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard, style: CardStyle = DEFAULT_STYLE): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const f = FLAGS[style];
  const { when, blocks } = splitWhen(card, f.date);
  const height = estimateHeight(card, f, when, blocks);
  const svg = await satori(cardTree(card, l, height, style) as never, { width: W, height, fonts: fl });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
