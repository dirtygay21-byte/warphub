/**
 * Test Army, 40K 11-я ред. (27.11.2026): кто и чем может стрелять. Правила — основные правила wh-rules.ru (данные 995,
 * снимок tools/roster-data/40k/whrules-995-core-rules-excerpt.json):
 *  10.04 обычная стрельба — не связан боем и не продвигался в этом ходу;
 *  10.05 штурмовая стрельба — продвигался, не связан боем, есть [ASSAULT]; стреляет только [ASSAULT];
 *  10.06 стрельба в ближнем бою — связан боем, не продвигался, есть [CLOSE-QUARTERS] или MONSTER/VEHICLE; модели без
 *        MONSTER/VEHICLE — только [CLOSE-QUARTERS] и только по юнитам, связанным боем с ними; MONSTER/VEHICLE — −1 к
 *        попаданию, если атака не [CLOSE-QUARTERS] и цель не связана боем с ним; [BLAST] не стреляет по связанному с ним;
 *  09.07 после отступления стрелять и нападать нельзя; 09.06 после продвижения нападать нельзя;
 *  04.02 цель стрельбы не связана боем; 17.03 исключение — связанные MONSTER/VEHICLE: −1 к попаданию (кроме
 *        [CLOSE-QUARTERS] юнитов, связанных с ней), [BLAST] нельзя;
 *  24.07 при другой стрельбе модель (не MONSTER/VEHICLE) стреляет либо [CLOSE-QUARTERS], либо остальным оружием;
 *  24.27 [PISTOL] — то же, что [CLOSE-QUARTERS]; 24.16 [HEAVY] — не связан боем, не выставлен в этом ходу, никто не
 *        прошёл больше 3″; 24.21 [LANCE] — отряд совершил манёвр нападения в этом ходу.
 * Исключения отряда («eligible to shoot / declare a charge in a turn in which it Advanced / Fell Back») берутся из
 * способностей инфолиста; правила с условием (стратагемы, ауры, «If your Army Faction…») — переключатель игрока.
 */
import type { Datasheet } from '../engine/types';

export const isCloseQuarters = (keywords: string) => /(^|,)\s*(close-quarters|pistol)\s*(,|$)/i.test(keywords);
export const hasKeyword = (keywords: string, k: string) => new RegExp(`(^|,)\\s*${k}\\b`, 'i').test(keywords);

export type ShootProfile = {
  assault: boolean;
  closeQuarters: boolean;
  monsterVehicle: boolean;
  /** правило инфолиста, разрешающее стрелять / нападать после продвижения или отступления (название) */
  afterAdvance: { shoot?: string; charge?: string };
  afterFallBack: { shoot?: string; charge?: string };
  /** такие же правила с условием — только вручную (названия) */
  conditional: string[];
};

const RULE = /eligible to (shoot(?: and declare a charge)?|declare a charge(?: and shoot)?) in a turn in which it (Advanced(?: or Fell Back)?|Fell Back(?: or Advanced)?)/i;

/** Профиль стрельбы отряда: оружие в снаряжении (ranged keywords), ключевые слова, способности частей отряда. */
export function shootProfile(parts: { ds: Datasheet; leader: boolean }[], rangedKeywords: string[]): ShootProfile {
  const p: ShootProfile = {
    assault: rangedKeywords.some((k) => hasKeyword(k, 'assault')),
    closeQuarters: rangedKeywords.some(isCloseQuarters),
    monsterVehicle: parts.some(({ ds }) => ds.keywords.some((k) => /^(MONSTER|VEHICLE)$/i.test(k))),
    afterAdvance: {},
    afterFallBack: {},
    conditional: [],
  };
  for (const { ds, leader } of parts)
    for (const a of ds.abilities) {
      if (a.type !== 'datasheet' && a.type !== 'wargear') continue;
      for (const sentence of a.text.split(/(?<=\.)\s+/)) {
        const m = RULE.exec(sentence);
        if (!m) continue;
        // без условия: «This unit/model is eligible…»; у лидера — «While this model is leading a unit, that unit is eligible…»
        const plain = a.type === 'datasheet' && (/^\s*This (unit|model) is eligible/i.test(sentence) || (leader && /^\s*While this model is leading a unit, that unit is eligible/i.test(sentence)));
        if (!plain) {
          if (!p.conditional.includes(a.name)) p.conditional.push(a.name);
          continue;
        }
        const shoot = /shoot/i.test(m[1]!);
        const charge = /charge/i.test(m[1]!);
        for (const [when, slot] of [['Advanced', p.afterAdvance], ['Fell Back', p.afterFallBack]] as const) {
          if (!m[2]!.includes(when)) continue;
          if (shoot) slot.shoot ??= a.name;
          if (charge) slot.charge ??= a.name;
        }
      }
    }
  return p;
}

/** Обстановка выстрела, посчитанная на столе. */
export type ShotContext = {
  /** normal — 10.04, assault — 10.05 (после продвижения), close — 10.06 (связан боем) */
  mode: 'normal' | 'assault' | 'close';
  attackerMV: boolean;
  /** цель связана боем с атакующим отрядом */
  engagedWithAttacker: boolean;
  /** цель — MONSTER/VEHICLE, связанная боем с другими юнитами атакующего игрока (17.03) */
  engagedMV: boolean;
  /** [HEAVY]: не связан боем и никто не прошёл больше 3″ в этом ходу (режим «Игра»); нет — неизвестно */
  heavy?: boolean;
  /** [LANCE]: манёвр нападения в этом ходу (режим «Игра»); нет — неизвестно */
  charged?: boolean;
  /** правило отряда разрешило стрелять после продвижения — обычная стрельба */
  ruleNote?: string;
};

/** Можно ли выбрать оружие для этой стрельбы и модификатор попадания (до ограничения ±1). */
export function weaponRule(w: { keywords: string; melee: boolean }, s: ShotContext): { allowed: boolean; why?: string; hitMod: number } {
  if (w.melee) return { allowed: true, hitMod: 0 };
  const cq = isCloseQuarters(w.keywords);
  const blast = hasKeyword(w.keywords, 'blast');
  let hitMod = 0;
  if (s.mode === 'assault' && !hasKeyword(w.keywords, 'assault')) return { allowed: false, why: 'после продвижения — только [ASSAULT] (10.05)', hitMod };
  if (s.mode === 'close') {
    if (!s.attackerMV && !cq) return { allowed: false, why: 'связан боем — только [CLOSE-QUARTERS] / [PISTOL] (10.06)', hitMod };
    if (s.attackerMV && blast && s.engagedWithAttacker) return { allowed: false, why: '[BLAST] не стреляет по юниту в бою с ним (10.06)', hitMod };
    if (s.attackerMV && !cq && !s.engagedWithAttacker) hitMod -= 1;
  }
  if (s.engagedMV) {
    if (blast) return { allowed: false, why: '[BLAST] не стреляет по MONSTER/VEHICLE в бою (17.03)', hitMod };
    if (!(cq && s.engagedWithAttacker)) hitMod -= 1;
  }
  return { allowed: true, hitMod };
}

/**
 * Можно ли выбрать цель (04.02, 10.06, 17.03): null — можно, иначе причина. attackerEngaged — атакующий связан боем;
 * targetEngagedWithMine — цель связана боем с другими юнитами атакующего игрока.
 */
export function targetRule(a: { attackerEngaged: boolean; attackerMV: boolean; engagedWithAttacker: boolean; targetEngagedWithMine: boolean; targetMV: boolean }): string | null {
  if (a.attackerEngaged && !a.attackerMV && !a.engagedWithAttacker) return 'отряд связан боем — цель только из тех, с кем он в бою (10.06)';
  if (!a.engagedWithAttacker && a.targetEngagedWithMine && !a.targetMV) return 'цель связана боем — по ней нельзя стрелять (04.02; исключение — MONSTER/VEHICLE, 17.03)';
  return null;
}
