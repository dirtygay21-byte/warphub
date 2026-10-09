/*
 * Общие правила размещения террейна фракции в Age of Sigmar 4 — не из выгрузки Wahapedia (там только варскроллы),
 * а из опубликованных правил, с источником и редакцией. Фракционные правила размещения берутся из данных
 * (aos/refs.ts → terrainPlacementOf). Схема в интерфейсе — иллюстрация этих правил, а не официальная карта.
 */
import { AOS_SOURCES, type PointSource } from '../points';

export interface PlacementRule {
  text: string;
  /** обязательное правило или рекомендация/пример */
  kind: 'mandatory' | 'optional';
}

export interface PlacementBlock {
  id: string;
  title: string;
  /** где это правило действует */
  context: string;
  rules: PlacementRule[];
  source: PointSource;
}

/** Core Rules 10.0–10.1: способность DEPLOY FACTION TERRAIN. Действует во всех режимах на основе Core Rules. */
export const FACTION_TERRAIN_CORE: PlacementBlock = {
  id: 'core',
  title: 'Террейн фракции — Core Rules',
  context: 'Age of Sigmar 4, Core Rules (10.0–10.1). Действует везде, где играют по основным правилам.',
  rules: [
    { kind: 'mandatory', text: 'Ставится способностью «Deploy Faction Terrain» в шаге деплоя террейна — до деплоя юнитов.' },
    { kind: 'mandatory', text: 'Целиком в своей территории (wholly within friendly territory).' },
    { kind: 'mandatory', text: 'Дальше 3" от всех объективов и от других элементов террейна.' },
    { kind: 'mandatory', text: 'Первым свои DEPLOY TERRAIN способности использует игрок, который начинает деплой, затем противник.' },
    { kind: 'optional', text: 'Ставить террейн фракции не обязательно: можно не использовать «Deploy Faction Terrain».' },
  ],
  source: AOS_SOURCES.coreRules,
};

/** General’s Handbook 2026-27 (Pitched Battles): расстановка обычного (не фракционного) террейна. */
export const BATTLEFIELD_TERRAIN_GH: PlacementBlock = {
  id: 'gh',
  title: 'Обычный террейн поля — General’s Handbook 2026-27',
  context: 'Только для батлпака Pitched Battles 2026-27; в других режимах (Spearhead, Path to Glory, свои сценарии) — свои правила.',
  rules: [
    { kind: 'mandatory', text: 'Террейн ставит защищающийся игрок после объективов.' },
    { kind: 'mandatory', text: 'Каждый элемент — дальше 3" от края поля, дальше 3" от объективов и дальше 6" от другого террейна.' },
    { kind: 'optional', text: 'Рекомендуется 4 малых и 4 средних элемента на поле 44" × 60" (1000 и 2000 очков) или 4 элемента на 30" × 44" (1000 очков).' },
    { kind: 'optional', text: 'Можно взять готовую карту расстановки из батлпака — с теми же расстояниями.' },
  ],
  source: AOS_SOURCES.gh,
};
