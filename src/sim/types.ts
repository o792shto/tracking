export type Surface = 'turf' | 'dirt';
export type Direction = 'right' | 'left';
/** 良・稍重・重・不良 */
export type TrackCondition = 'good' | 'yielding' | 'soft' | 'heavy';
/** 距離（m）。100m単位 */
export type RaceDistance = number;
/** 逃げ・先行・差し・追込 */
export type RunningStyle = 'nige' | 'senko' | 'sashi' | 'oikomi';

/** 番組で使う標準の距離（重賞以外のレースはこの中から選ぶ） */
export const DISTANCES: readonly RaceDistance[] = [1200, 1600, 2000, 2400];
/** 馬場ごとに施行する距離（ダートに2400mはなく、1800mがある） */
export const DISTANCES_BY_SURFACE: Record<Surface, readonly RaceDistance[]> = {
  turf: [1200, 1600, 2000, 2400],
  dirt: [1200, 1600, 1800, 2000],
};
export const SURFACES: readonly Surface[] = ['turf', 'dirt'];
export const CONDITIONS: readonly TrackCondition[] = ['good', 'yielding', 'soft', 'heavy'];
export const STYLES: readonly RunningStyle[] = ['nige', 'senko', 'sashi', 'oikomi'];

export const CONDITION_LABEL: Record<TrackCondition, string> = {
  good: '良',
  yielding: '稍重',
  soft: '重',
  heavy: '不良',
};
export const STYLE_LABEL: Record<RunningStyle, string> = {
  nige: '逃げ',
  senko: '先行',
  sashi: '差し',
  oikomi: '追込',
};
export const SURFACE_LABEL: Record<Surface, string> = { turf: '芝', dirt: 'ダート' };

export interface Course {
  distance: RaceDistance;
  surface: Surface;
  direction: Direction;
  condition: TrackCondition;
  /** 競馬場（指定がなければ標準の平坦な楕円） */
  venue?: '東京' | '中山' | '京都' | '阪神';
}

/** 能力値はすべて 0〜100 */
export interface HorseStats {
  speed: number;
  stamina: number;
  /** 瞬発力（末脚） */
  kick: number;
  power: number;
  /** 気性（高いほど落ち着いている） */
  temperament: number;
  /** スタート巧拙 */
  start: number;
}

export interface Horse {
  id: string;
  name: string;
  stats: HorseStats;
  style: RunningStyle;
  /** 最も得意な距離（m） */
  bestDistance: number;
  /** 馬場適性（1.0 が最良、0.97 程度まで） */
  surfaceAptitude: Record<Surface, number>;
  /** 性別と年齢（名簿の馬のみ。表示用） */
  sex?: 'colt' | 'filly';
  age?: number;
}

/** 出馬表に出す過去のレース1走分 */
export interface PastRun {
  rank: number;
  runners: number;
  surface: Surface;
  distance: number;
  /** 名簿の馬の実際の成績のとき：レース名・競馬場・格・日付 */
  race?: string;
  venue?: string;
  grade?: 'G1' | 'G2' | 'G3' | null;
  year?: number;
  month?: number;
  day?: number;
}

export interface Entry {
  /** 馬番（1始まり、ゲート番号と同じ） */
  number: number;
  /** 枠番（1〜8） */
  frame: number;
  horse: Horse;
  /** 名簿の馬の近走（新しい順）。なければ出馬表の近走は作り物 */
  history?: PastRun[];
  /** 名簿の馬の実績（人気の付き方に使う） */
  record?: { g1Wins: number; gradedWins: number; wins: number; starts: number; earnings: number };
  /** 当日の調子（0.985〜1.015 程度、プレイヤーには非公開） */
  form: number;
}

export interface RaceSetup {
  seed: number;
  course: Course;
  entries: Entry[];
  /** 出馬表に出す近走の数の幅（最小, 最大）。省略時は4走 */
  pastRuns?: [number, number];
}

export type RaceEventKind = 'slowStart' | 'keen' | 'blocked';

export interface RaceEvent {
  kind: RaceEventKind;
  number: number;
  /** 発生時刻（秒） */
  time: number;
}

export interface FinishRecord {
  number: number;
  rank: number;
  /** 走破タイム（秒） */
  time: number;
  /** 前の馬との着差（秒）。1着は 0 */
  marginSec: number;
  /** 前の馬との着差（表記：ハナ、クビ、1/2 など）。1着は空文字 */
  marginLabel: string;
  /** 上がり3F（秒） */
  last3f: number;
}

/**
 * 毎ステップの記録。data は [step][horseIndex][field] の順に並ぶ。
 * field: 0 = 距離(m), 1 = 横位置(内ラチからm), 2 = 速度(m/s), 3 = 残りスタミナ(0〜1)
 */
export interface RaceLog {
  dt: number;
  steps: number;
  horses: number;
  data: Float32Array;
}

export const LOG_FIELDS = 4;

export interface RaceResult {
  setup: RaceSetup;
  finish: FinishRecord[];
  /** 先頭馬の200mごとのラップ（秒）。200で割り切れない距離は最初の区間が短い */
  laps: number[];
  /** 各ラップの区切り（スタートからの距離、m） */
  lapMarks: number[];
  /** 先頭の前半3F（スタートから600mまでの時間、秒） */
  first3f: number;
  pace: 'high' | 'middle' | 'slow';
  events: RaceEvent[];
  log: RaceLog | null;
}
