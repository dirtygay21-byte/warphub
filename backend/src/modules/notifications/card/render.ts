/**
 * Рисует карточку уведомления в PNG (14.11.2026): стиль макетов WarpHub — тёмный фон #111110, лайм #ECFE46,
 * заголовки Oswald в верхнем регистре, текст Inter Tight, логотип WARP BOYS & GIRLS.
 * satori (разметка → SVG, текст в контуры) + resvg (SVG → PNG). Ширина 1080, высота по содержимому.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { CardBlock, NotificationCard } from './parse';

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

function estimateHeight(card: NotificationCard) {
  const ts = titleSize(card.title);
  let h = PAD * 2 + 88; // поля и шапка
  h += 56 + 40; // надзаголовок
  h += 16 + lineCount(card.title.toUpperCase(), ts, 0.5) * ts * 1.04 + 34;
  if (card.subtitle) h += 24 + lineCount(card.subtitle, 36, 0.52) * 50;
  for (const b of card.blocks) {
    if (b.type === 'rows') h += 40 + 16 + b.rows.reduce((s, r) => s + 70 + lineCount(r.value, 36, 0.52, INNER - 72) * 48, 0);
    if (b.type === 'heading') h += 40 + lineCount(b.text, 38, 0.5) * 48;
    if (b.type === 'list') h += 24 + b.items.reduce((s, i) => s + 12 + lineCount(i, 32, 0.52, INNER - 40) * 45, 0);
    if (b.type === 'text') h += 28 + lineCount(b.text, 32, 0.52) * 45;
  }
  h += 56 + 2 + 28 + (card.note ? lineCount(card.note, 28, 0.52) * 40 + 16 : 0) + 36;
  return Math.round(Math.min(2400, Math.max(760, h + 96)));
}

function block(b: CardBlock, tone: string): Node {
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

export function cardTree(card: NotificationCard, logoSrc: string, height: number): Node {
  const tone = TONE[card.tone];
  const ts = titleSize(card.title);
  // поля — отступом внутреннего блока: у корня satori считает padding сверх ширины (содержимое уезжало за край)
  return el(
    'div',
    {
      width: W,
      height,
      backgroundColor: COLORS.bg,
      backgroundImage: `radial-gradient(circle at 88% 0%, ${tone}33 0%, rgba(17,17,16,0) 46%)`,
    },
    el('div', { flexDirection: 'column', flexGrow: 1, margin: PAD, width: INNER }, [
      el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
        el('img', { width: 88, height: 88 }, undefined, { src: logoSrc, width: 88, height: 88 }),
        el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 22, letterSpacing: 8, color: COLORS.fg3 }, 'WARPHUB'),
      ]),
      el('div', { marginTop: 56, fontFamily: INTER, fontWeight: 600, fontSize: 28, letterSpacing: 5, textTransform: 'uppercase', color: tone }, card.kicker),
      el('div', { marginTop: 16, fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.04, textTransform: 'uppercase', color: COLORS.fg }, card.title),
      el('div', { marginTop: 24, width: 140, height: 10, borderRadius: 5, backgroundColor: tone }),
      ...(card.subtitle ? [el('div', { marginTop: 24, fontFamily: INTER, fontWeight: 400, fontSize: 36, lineHeight: 1.35, color: COLORS.fg2 }, card.subtitle)] : []),
      ...card.blocks.map((b) => block(b, tone)),
      el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 56 }, [
        el('div', { height: 2, backgroundColor: 'rgba(255,255,255,0.08)' }),
        ...(card.note ? [el('div', { marginTop: 28, fontFamily: INTER, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color: COLORS.fg3 }, card.note)] : []),
        el('div', { marginTop: card.note ? 16 : 28, fontFamily: OSWALD, fontWeight: 600, fontSize: 24, letterSpacing: 8, color: COLORS.fg3 }, '• WARPHUB.RU •'),
      ]),
    ]),
  );
}

/** PNG карточки. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard): Promise<Uint8Array> {
  const { fonts: f, logo: l } = assets();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const height = estimateHeight(card);
  const svg = await satori(cardTree(card, l, height) as never, { width: W, height, fonts: f });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
