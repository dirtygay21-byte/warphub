/**
 * Русский вид двух мелких полей инфолиста, которых нет в текстах wh-rules.ru (16.11.2026, переключатель RU/EN):
 * состав отряда («1 Captain model» → «1 модель: Captain») и пометка к неуязвимому спасброску. Названия моделей
 * остаются английскими, как и остальные названия (решение владельца 07.11.2026).
 */
import { plural } from './util';

/** «1 Captain model» → «Captain — 1 модель»; «4-9 Intercessor models» → «Intercessor — 4–9 моделей». Прочее — как есть. */
export function compositionRu(lines: string[]): string[] {
  return lines.map((line) => {
    const m = /^(\d+)(?:\s*-\s*(\d+))?\s+(.+?)\s+models?$/i.exec(line.trim());
    if (!m) return line;
    const [, a, b, name] = m;
    const n = Number(b ?? a);
    return `${name} — ${b ? `${a}–${b}` : a} ${plural(n, ['модель', 'модели', 'моделей'])}`;
  });
}

const INVULN: Record<string, string> = {
  'against ranged attacks only': 'Только против дальнобойных атак',
  'traitor enforcer model only.': 'Только модель Traitor Enforcer.',
  'chaplain cassius and kill team terminator models only.': 'Только Chaplain Cassius и модели Kill Team Terminator.',
};

/** «* Against ranged attacks only» → «* Только против дальнобойных атак»; неизвестное — как есть. */
export function invulnNoteRu(note: string): string {
  const star = note.trim().startsWith('*') ? '* ' : '';
  const body = note.trim().replace(/^\*\s*/, '');
  const ru = INVULN[body.toLowerCase()];
  return ru ? star + ru : note;
}

const ALLY_EN: Record<string, string> = {
  'До 250/500/750 очков. Не Warlord, без улучшений. По каждому богу не-BATTLELINE юнитов не больше, чем BATTLELINE.':
    'Up to 250/500/750 points. Not the Warlord, no Enhancements. For each god, no more non-BATTLELINE units than BATTLELINE units.',
  '1 TITANIC рыцарь или до 3 ARMIGER. Не Warlord, без улучшений.': '1 TITANIC Knight or up to 3 ARMIGER. Not the Warlord, no Enhancements.',
  '1 модель ADEPTUS TITANICUS в армии ИМПЕРИУМА.': '1 ADEPTUS TITANICUS model in an IMPERIUM army.',
  '1 TITANIC рыцарь или до 3 WAR DOG. Не Warlord, без улучшений.': '1 TITANIC Knight or up to 3 WAR DOG. Not the Warlord, no Enhancements.',
  'Harlequins и Anhrathe до 250/500/750 очков. Не Warlord, без улучшений.': 'Harlequins and Anhrathe up to 250/500/750 points. Not the Warlord, no Enhancements.',
  'Retinue 1/2/3 · Character 1/2/3 · Requisitioned 1/1/2 (Incursion/Strike Force/Onslaught). Транспорт — только с пассажирами.':
    'Retinue 1/2/3 · Character 1/2/3 · Requisitioned 1/1/2 (Incursion/Strike Force/Onslaught). Transports only with passengers.',
};

/** Пояснение к союзникам (WarpHub, по-русски в данных) — по-английски для режима EN; неизвестное — как есть. */
export const allyNoteEn = (note: string): string => ALLY_EN[note] ?? note;

/** Подпись размера отряда из данных («5 models», «1 model») — по-русски для RU; прочее — как есть. */
export function sizeLabelRu(label: string): string {
  const m = /^(\d+)(?:\s*-\s*(\d+))?\s+models?$/i.exec(label.trim());
  if (!m) return label;
  const n = Number(m[2] ?? m[1]);
  return `${m[2] ? `${m[1]}–${m[2]}` : m[1]} ${plural(n, ['модель', 'модели', 'моделей'])}`;
}
