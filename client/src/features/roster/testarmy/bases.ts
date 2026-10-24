/**
 * Test Army (24.10.2026): размеры баз из профилей инфолистов (ModelStats.base, источник — данные ростера).
 * Круглые базы («32mm»), овальные («75 x 42mm», «120x92mm Oval Base»), «flying base», несколько вариантов
 * («32mm, 40mm», «28.5mm / 25mm»). «Use model», «No official base size», «Unique» и пустое — размера нет:
 * ничего не придумываем, игрок задаёт размер сам (в интерфейсе — «размер базы не указан»).
 */

export const MM_PER_INCH = 25.4;

export type BaseShape =
  | { kind: 'circle'; d: number; flying?: boolean }
  /** w — длинная сторона, h — короткая (мм) */
  | { kind: 'oval'; w: number; h: number; flying?: boolean };

export type BaseInfo = {
  /** варианты из данных (обычно один); пусто — размера нет */
  options: BaseShape[];
  /** исходная строка данных */
  source: string;
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

/** Разобрать строку размера базы из данных. */
export function parseBase(text: string | null | undefined): BaseInfo {
  const source = (text ?? '').trim();
  const options: BaseShape[] = [];
  for (const part0 of source.split(/\s*(?:,|\/|;|\bor\b)\s*/i)) {
    const part = part0.trim();
    if (!part) continue;
    const flying = /flying/i.test(part);
    const oval = part.match(new RegExp(`${NUM}\\s*[x×]\\s*${NUM}\\s*mm`, 'i'));
    if (oval) {
      const a = parseFloat(oval[1]!.replace(',', '.'));
      const b = parseFloat(oval[2]!.replace(',', '.'));
      options.push({ kind: 'oval', w: Math.max(a, b), h: Math.min(a, b), ...(flying ? { flying } : {}) });
      continue;
    }
    const circle = part.match(new RegExp(`${NUM}\\s*mm`, 'i'));
    if (circle) options.push({ kind: 'circle', d: parseFloat(circle[1]!.replace(',', '.')), ...(flying ? { flying } : {}) });
  }
  return { options, source };
}

/** Подпись базы: «32 мм», «овал 75×42 мм», «+ подставка» для летающих. */
export function baseLabel(b: BaseShape): string {
  const fly = b.flying ? ', подставка' : '';
  return b.kind === 'circle' ? `${fmt(b.d)} мм${fly}` : `овал ${fmt(b.w)}×${fmt(b.h)} мм${fly}`;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Полуоси базы в дюймах (rx — вдоль длинной стороны). */
export function baseRadii(b: BaseShape): { rx: number; ry: number } {
  return b.kind === 'circle' ? { rx: b.d / 2 / MM_PER_INCH, ry: b.d / 2 / MM_PER_INCH } : { rx: b.w / 2 / MM_PER_INCH, ry: b.h / 2 / MM_PER_INCH };
}
