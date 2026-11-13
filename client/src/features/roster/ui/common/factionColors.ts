/**
 * Акцент фракции (14.11.2026): тонкая полоса цвета армии в шапке редактора и метка в списках — чтобы ростеры
 * разных армий отличались с первого взгляда. Цвета — узнаваемые цвета армий, приглушённые под тёмную тему;
 * у фракции без цвета — нейтральный (лаймовый акцент приложения). Данные игры не затрагиваются.
 */
const W40K: Record<string, string> = {
  AS: '#c8323c', AC: '#d9a93b', AdM: '#b8402e', AE: '#3fb6a8', AM: '#7d8b4c', CD: '#c04ea0', QT: '#9b2a2a',
  CSM: '#8a6d3b', DG: '#8aa04a', DRU: '#5b8f87', EC: '#c45aa8', GC: '#8b5cc4', GK: '#a7b4c2', AoI: '#b0905a',
  QI: '#3b6fd1', LoV: '#d58a3a', NEC: '#4fd06a', ORK: '#6ab04c', SM: '#3a72d8', TAU: '#d8a65a', TS: '#3f8fd8',
  TYR: '#9b59b6', WE: '#c0392b',
};
const AOS: Record<string, string> = {
  CoS: '#4a7bd0', DoK: '#b8324a', FY: '#e07a2e', ID: '#3fa5b8', KO: '#b8925a', LRL: '#d8d2c2', SN: '#3fb27a',
  SE: '#d9b34a', SY: '#6aa84f', BoC: '#8a6a4a', BoK: '#c0392b', DoT: '#3f8fd8', HS: '#c45aa8', HoH: '#b85a2e',
  MoN: '#8aa04a', ST: '#7a9a3a', StD: '#8a7a6a', FE: '#a04a5a', NT: '#4ac0b0', OB: '#d8cfb8', SG: '#7a4ab8',
  BS: '#d8823a', GG: '#a8c04a', IJ: '#d8b33a', KB: '#5aa05a', OM: '#c0603a', SoB: '#a08a6a',
};

export function factionColor(game: '40k' | 'aos', factionId: string | null | undefined): string {
  const map = game === '40k' ? W40K : AOS;
  return (factionId && map[factionId]) || '#ecfe46';
}
