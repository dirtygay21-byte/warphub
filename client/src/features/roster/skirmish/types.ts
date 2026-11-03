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

export interface KtMapData {
  id: string;
  killzone: string;
  map: number;
  sourceImage: string;
  zones: { p1: [number, number][][]; p2: [number, number][][] };
  objectives: { id: string; x: number; y: number }[];
  terrain: [number, number][][];
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
}

export interface WarcryDeploymentPoint {
  group: 'dagger' | 'shield' | 'hammer';
  side: 'red' | 'blue';
  x: number;
  y: number;
  reserve: 2 | 3 | null;
  offboard: boolean;
}
export interface WarcryDeployment {
  id: string;
  name: string;
  table: 'tableA' | 'tableB';
  image: string;
  points: WarcryDeploymentPoint[];
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
}

export type SkirmishGameData = KtGameData | WarcryGameData;
