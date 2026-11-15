/**
 * Рисует карточку уведомления в PNG: стиль мерча WarpHub (15.11.2026, выбор владельца — «червяки из угла»).
 * Один размер для всех уведомлений — 1280×720 (16:9). Фон — цвет смысла (лайм, жёлтый — напоминание/ожидание,
 * красный — отмена, серый — информация), из правого верхнего угла — толстые чёрные «червяки».
 * Слева: логотип, надзаголовок, крупный заголовок, дата, статус плашкой, подсказка и адрес внизу.
 * Данных мало (до двух строк) — одна колонка, данные плашками под датой; больше — тёмная панель справа.
 * Без нарисованных кнопок: нажимаются только настоящие кнопки под картинкой. Длинный текст обрезается,
 * чтобы всё помещалось в один размер.
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
const PAD = 56;
const GAP = 48;
const LEFT = 540;
const RIGHT = W - PAD * 2 - LEFT - GAP;
const SINGLE_W = W - PAD * 2 - 420;
const OSWALD = "'Oswald', 'Oswald Cyr', 'Inter Tight', 'Inter Tight Cyr'";
const INTER = "'Inter Tight', 'Inter Tight Cyr'";
const INK = '#111110';
const MUTED = 'rgba(17,17,16,0.72)';
const COLORS = { panel: '#111110', fg: '#F4F4F0', fg3: '#8E8E86', accent: '#ECFE46', warn: '#FBBF24', danger: '#F87171', neutral: '#B8B8B0' };
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

/** Дата/время — крупной строкой под заголовком, остальные строки — данные. */
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

/** Одна колонка, если данных мало: до двух строк и без списков/подзаголовков блоков. */
function isSingle(blocks: CardBlock[]) {
  if (blocks.some((b) => b.type === 'heading' || b.type === 'list')) return false;
  return blocks.reduce((n, b) => n + (b.type === 'rows' ? b.rows.length : 0), 0) <= 2;
}

function titleSize(title: string, single: boolean) {
  const n = title.length;
  const size = n <= 10 ? 100 : n <= 16 ? 84 : n <= 26 ? 68 : 56;
  return single ? size : Math.min(size, 92);
}

function backdrop(tone: string, single: boolean) {
  const worm = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${tone}"/>
${worm(`M${W - 520} -60 C${W - 470} 120 ${W - 300} 60 ${W - 250} 210 S${W - 120} 380 ${W + 60} 330`)}
${worm(`M${W - 340} -60 C${W - 300} 60 ${W - 170} 20 ${W - 120} 130 S${W - 20} 210 ${W + 60} 170`)}
${single ? worm(`M${W + 60} ${H - 260} C${W - 120} ${H - 300} ${W - 160} ${H - 120} ${W - 330} ${H - 110} S${W - 480} ${H + 10} ${W - 520} ${H + 60}`) : ''}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const rowCount = (blocks: CardBlock[]) => blocks.reduce((n, b) => n + (b.type === 'rows' ? b.rows.length : 0), 0);

/**
 * Правая колонка — одна тёмная панель со всеми данными (узор под ней не мешает читать).
 * До 4 строк — «метка над значением», больше — в одну линию, чтобы влезло в 720.
 */
function panel(rows: CardRow[], dense: boolean, first: boolean): Node {
  return el(
    'div',
    { flexDirection: 'column', marginTop: first ? 0 : 8 },
    rows.slice(0, 7).map((r, i) =>
      dense
        ? el('div', { alignItems: 'baseline', padding: '13px 0', borderTop: i ? '2px solid rgba(255,255,255,0.08)' : 'none' }, [
            el('div', { width: 170, flexShrink: 0, fontFamily: INTER, fontWeight: 600, fontSize: 17, letterSpacing: 2.5, textTransform: 'uppercase', color: COLORS.fg3 }, clamp(r.label, 16)),
            lines({ flex: 1, fontFamily: INTER, fontWeight: 600, fontSize: 26, lineHeight: 1.25, color: COLORS.fg }, 1, r.value, 44),
          ])
        : el('div', { flexDirection: 'column', padding: '16px 0', borderTop: i ? '2px solid rgba(255,255,255,0.08)' : 'none' }, [
            el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 18, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.fg3 }, clamp(r.label, 24)),
            lines({ marginTop: 4, fontFamily: INTER, fontWeight: 600, fontSize: 30, lineHeight: 1.25, color: COLORS.fg }, 2, r.value, 70),
          ]),
    ),
  );
}

function rightBlock(b: CardBlock, dense: boolean, first: boolean, tone: string): Node | null {
  if (b.type === 'rows') return panel(b.rows, dense, first);
  if (b.type === 'heading') return lines({ marginTop: first ? 4 : 20, fontFamily: OSWALD, fontWeight: 600, fontSize: 28, textTransform: 'uppercase', color: tone }, 1, b.text, 40);
  if (b.type === 'list') {
    return el(
      'div',
      { flexDirection: 'column', marginTop: first ? 0 : 10 },
      b.items.slice(0, 5).map((item) =>
        el('div', { alignItems: 'flex-start', marginTop: 10 }, [
          el('div', { width: 10, height: 10, marginTop: 12, marginRight: 16, borderRadius: 5, backgroundColor: tone, flexShrink: 0 }),
          lines({ flex: 1, fontFamily: INTER, fontWeight: 400, fontSize: 24, lineHeight: 1.35, color: COLORS.fg }, 2, item, 90),
        ]),
      ),
    );
  }
  return lines({ marginTop: first ? 4 : 16, fontFamily: INTER, fontWeight: 400, fontSize: 24, lineHeight: 1.4, color: COLORS.neutral }, 3, b.text, 200);
}

export function cardTree(card: NotificationCard, logoSrc: string): Node {
  const tone = TONE[card.tone];
  const { when, blocks } = splitWhen(card);
  const single = isSingle(blocks);
  const width = single ? SINGLE_W : LEFT;
  const ts = titleSize(card.title, single);

  const extras: Node[] = [];
  if (single) {
    for (const b of blocks) {
      if (b.type === 'rows') {
        extras.push(
          el(
            'div',
            { flexWrap: 'wrap', marginTop: 22 },
            b.rows.map((r) =>
              el('div', { alignItems: 'baseline', padding: '11px 20px', marginRight: 12, marginBottom: 10, backgroundColor: COLORS.panel, borderRadius: 14 }, [
                el('div', { fontFamily: INTER, fontWeight: 600, fontSize: 17, letterSpacing: 2.5, textTransform: 'uppercase', color: COLORS.fg3 }, clamp(r.label, 20)),
                el('div', { marginLeft: 12, fontFamily: INTER, fontWeight: 600, fontSize: 26, color: COLORS.fg }, clamp(r.value, 40)),
              ]),
            ),
          ),
        );
      }
      if (b.type === 'text') extras.push(lines({ marginTop: 16, fontFamily: INTER, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color: MUTED }, 3, b.text, 220));
    }
  }

  const left = el('div', { flexDirection: 'column', width, height: H - PAD * 2, flexShrink: 0 }, [
    el('img', { width: 64, height: 64 }, undefined, { src: logoSrc, width: 64, height: 64 }),
    lines({ marginTop: 30, fontFamily: INTER, fontWeight: 600, fontSize: 24, letterSpacing: 5, textTransform: 'uppercase', color: INK }, 1, card.kicker, 40),
    lines({ marginTop: 10, fontFamily: OSWALD, fontWeight: 700, fontSize: ts, lineHeight: 1.04, textTransform: 'uppercase', color: INK }, 2, card.title, 60),
    ...(when ? [lines({ marginTop: 16, fontFamily: OSWALD, fontWeight: 600, fontSize: 36, lineHeight: 1.2, textTransform: 'uppercase', color: INK }, 2, when, 60)] : []),
    ...(card.subtitle
      ? [
          el('div', { marginTop: 18 }, [
            el('div', { padding: '7px 22px', borderRadius: 40, backgroundColor: COLORS.panel, fontFamily: OSWALD, fontWeight: 600, fontSize: 23, letterSpacing: 1, textTransform: 'uppercase', color: tone }, clamp(card.subtitle, 44)),
          ]),
        ]
      : []),
    ...extras,
    el('div', { flexDirection: 'column', marginTop: 'auto', paddingTop: 20 }, [
      ...(card.note ? [lines({ marginBottom: 12, fontFamily: INTER, fontWeight: 400, fontSize: 22, lineHeight: 1.4, color: MUTED }, 2, card.note, 150)] : []),
      el('div', { fontFamily: OSWALD, fontWeight: 600, fontSize: 20, letterSpacing: 8, color: MUTED }, '• WARPHUB.RU •'),
    ]),
  ]);

  const dense = rowCount(blocks) > 4 || blocks.length > 2;
  const right = single
    ? null
    : el(
        'div',
        { flexDirection: 'column', width: RIGHT, height: H - PAD * 2, marginLeft: GAP, justifyContent: 'center' },
        el(
          'div',
          { flexDirection: 'column', maxHeight: H - PAD * 2, overflow: 'hidden', padding: '18px 30px 22px', backgroundColor: COLORS.panel, borderRadius: 26 },
          blocks.map((b, i) => rightBlock(b, dense, i === 0, tone)).filter(Boolean),
        ),
      );

  // фон-узор картинкой; содержимое — абсолютно и после фона, иначе satori рисует фон поверх текста
  return el('div', { width: W, height: H, position: 'relative', backgroundColor: tone }, [
    el('img', { position: 'absolute', top: 0, left: 0, width: W, height: H }, undefined, { src: backdrop(tone, single), width: W, height: H }),
    el('div', { position: 'absolute', top: PAD, left: PAD, width: W - PAD * 2, height: H - PAD * 2 }, right ? [left, right] : [left]),
  ]);
}

/** PNG карточки 1280×720. Бросает ошибку — вызывающий отправит обычный текст. */
export async function renderCardPng(card: NotificationCard): Promise<Uint8Array> {
  const { fonts: fl, logo: l } = assets();
  const [{ default: satori }, { Resvg }] = await Promise.all([import('satori'), import('@resvg/resvg-js')]);
  const svg = await satori(cardTree(card, l) as never, { width: W, height: H, fonts: fl });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
