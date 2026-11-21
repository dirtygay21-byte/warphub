export type SkirmishSystem = 'kt' | 'warcry';

interface GameSource {
  name: string;
  url: string;
  checked: string;
}

interface BoardData {
  width: number;
  height: number;
  objectiveMm: number | null;
}

export type KtPoint = [number, number];
/** Lettered label box on the official card (centre, board inches); one entry per occurrence. */
export interface KtMapFeature {
  label: string;
  x: number;
  y: number;
}
export interface KtMapGuide {
  edge: 'left' | 'right' | 'top' | 'bottom';
  at: KtPoint;
  /** Drop-zone depth from the edge, inches; for cards not drawn to scale (`toScale: false`) only proportional. */
  d: number;
  side: 'p1' | 'p2';
  toScale?: false;
}
export type KtKeyPlayer = 'p1' | 'p2';
export type KtKeyColour = 'p1Drop' | 'p1Territory' | 'p2Drop' | 'p2Territory' | 'p1Objective' | 'p2Objective' | 'centreObjective' | 'neutral';
export interface KtMapKeyFeature {
  id: string;
  en: string;
  ru?: string;
  labels: string[];
  types: string[];
  rules?: string[];
  note?: string;
  hatchway?: boolean;
  breachPoint?: boolean;
}
export interface KtMapKeyZone {
  keyImages?: string[];
  keyText?: boolean;
  notToScale?: boolean;
  intro?: string;
  note?: string;
  symbols?: { id: string; en: string; ru: string }[];
  features?: KtMapKeyFeature[];
  rules?: { wall?: string; hatchway?: string[]; breachPoint?: string[] };
  areas?: { id: string; en: string; ru: string; colour: string; rules: string[] }[];
}
/** Wahapedia map key (Approved Ops 2025) and killzone terrain types — tools/roster-data/kt/map-keys.json. */
export interface KtMapKey {
  source: { approvedOpsUrl: string; killzonesUrl: string; checked: string };
  universal: { id: string; en: string; ru: string; swatch: 'zone' | 'edge' | 'objective' | 'dots' | 'centre' | 'dashed'; colour: KtKeyColour }[];
  lines: { id: string; en: string; ru: string }[];
  colours: Record<string, Record<KtKeyColour, string>>;
  terrainTypes: { id: string; ru: string; en: string }[];
  killzones: Record<string, KtMapKeyZone>;
}

export interface KtMapData {
  id: string;
  killzone: string;
  map: number;
  sourceImage: string;
  zones: { p1: KtPoint[][]; p2: KtPoint[][] };
  territories: { p1: KtPoint[][]; p2: KtPoint[][] };
  dropZones: { p1: KtPoint[][]; p2: KtPoint[][] };
  objectives: { id: string; x: number; y: number }[];
  terrain: KtPoint[][];
  features: KtMapFeature[];
  walls: KtPoint[][];
  doors: KtPoint[][];
  guides: KtMapGuide[];
  /** Board on the card image: inner border in px, image size; Gallowdark / Tomb World cards are not to scale. */
  frame: { px: [number, number, number, number]; size: [number, number]; toScale: boolean };
  /** Data side → Universal Map Key player (colour on the card: Player 1 orange, Player 2 grey / blue). */
  keyPlayer: Record<'p1' | 'p2', KtKeyPlayer>;
}

export interface KtGameData {
  system: 'kt';
  title: string;
  source: GameSource & { coreRulesUrl: string; appendixUrl: string; killzonesUrl: string };
  board: BoardData;
  setup: string[];
  game: {
    initialCp: number;
    equipmentPicks: number;
    setupFraction: number;
    roundLabel: string;
    end: string;
    readyCp: string;
    turningPoints: number;
    vpPerOpCap: number;
    primaryOpBonus: string;
  };
  critOps: { id: string; name: string; text: string }[];
  tacOps: { id: string; name: string; archetype: string; text: string }[];
  killOp: { maxGrade: number; thresholds: Record<string, number[]>; text: string };
  missionPack: {
    title: string;
    url: string;
    missions: string[];
    killzones: string[];
    mapsPerKillzone: number;
  };
  maps: KtMapData[];
  mapImport: { method: string; problems: string[] };
  mapImportV2: { method: string; problems: string[] };
  mapImportV3: { date: string; method: string; notToScale: string[] };
  mapKey: KtMapKey;
}

export type WarcryPoint = [number, number];
export interface WarcryDeploymentPoint {
  group: 'dagger' | 'shield' | 'hammer';
  side: 'red' | 'blue';
  x: number;
  y: number;
  reserve: 2 | 3 | null;
  offboard: boolean;
  /** Исходная позиция на карте до ограничения игрового поля; x/y остаются безопасными для текущего рендера. */
  sourceX: number;
  sourceY: number;
}
export interface WarcryDeploymentGuide {
  from: WarcryPoint;
  to: WarcryPoint;
  at: WarcryPoint;
  d: 4 | 6 | 8 | 9;
  side: 'red' | 'blue';
  group: 'dagger' | 'shield' | 'hammer';
}
export interface WarcryDeployment {
  id: string;
  name: string;
  table: 'tableA' | 'tableB';
  image: string;
  points: WarcryDeploymentPoint[];
  guides: WarcryDeploymentGuide[];
  orientation: { kind: 'double-arrow'; at: WarcryPoint };
}
export interface WarcryVictory {
  id: string;
  name: string;
  text: string;
  endRound: number | null;
}

export interface WarcryGameData {
  system: 'warcry';
  title: string;
  source: GameSource & { battleplanUrl: string; fightingUrl: string; matchedPlayUrl: string };
  board: BoardData;
  setup: string[];
  game: { roundLabel: string; phases: string[]; end: string };
  deploymentOptions: { tableA: string[]; tableB: string[] };
  victoryOptions: { tableA: string[]; tableB: string[] };
  deployments: WarcryDeployment[];
  victories: { tableA: WarcryVictory[]; tableB: WarcryVictory[] };
  twists: WarcryVictory[];
  mapImport: { method: string; problems: string[] };
  mapImportV2: { method: string; problems: string[] };
}

export type SkirmishGameData = KtGameData | WarcryGameData;
