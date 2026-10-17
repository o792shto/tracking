import type { Grade, Venue } from '../gradedRaces';
import type { RaceClass } from '../program';
import type { HorseStats, RunningStyle, Surface } from '../types';

/** 性別（騸馬は扱わない） */
export type Sex = 'colt' | 'filly';
export const SEX_LABEL: Record<Sex, string> = { colt: '牡', filly: '牝' };

/** 1走の記録 */
export interface RunRecord {
  year: number;
  /** その年の週（0始まり） */
  week: number;
  month: number;
  day: number;
  /** 競馬場（海外のレースは国・地域の名前） */
  venue: Venue | string;
  /** 海外のレース */
  abroad?: boolean;
  /** 画面に出ない国内のレース（夏競馬・中京の G1） */
  offscreen?: boolean;
  /** レース名（重賞は名前、それ以外は「3歳未勝利」のような条件） */
  race: string;
  grade: Grade | null;
  raceClass: RaceClass;
  surface: Surface;
  distance: number;
  runners: number;
  rank: number;
  /** 走破タイム（秒） */
  time: number;
  /** 着差（勝ったときは2着との差） */
  margin: string;
  /** 単勝人気（観戦したレースのみ） */
  popularity?: number;
  /** 騎手（Jockey.id）。騎手を入れる前の記録にはない */
  jockeyId?: number;
}

export interface GradedWin {
  year: number;
  name: string;
  grade: Grade;
}

/** 所属クラス（勝てば上がる。重賞・オープンで勝てばオープン） */
export type Tier = 'maiden' | '1win' | '2win' | '3win' | 'open';
export const TIERS: readonly Tier[] = ['maiden', '1win', '2win', '3win', 'open'];

export type RetireReason = 'age' | 'injury' | 'results' | 'stud' | 'maiden';

export interface WorldHorse {
  id: number;
  name: string;
  sex: Sex;
  /** 生まれた年（年齢 = その年 − 生まれた年） */
  birthYear: number;
  style: RunningStyle;
  /** 完成したときの能力（成長・衰えの前） */
  potential: HorseStats;
  bestDistance: number;
  surfaceAptitude: Record<Surface, number>;
  /** 成長の型：-1 早熟 〜 +1 晩成 */
  growth: number;
  /** 夏の成長などによる能力の上乗せ（点）。レースではこの分だけ強くなる */
  boost: number;
  /** boost のうち、ファン（市場）に見えている分（点）。古いデータにはない */
  boostPublic?: number;
  /** 疲労（レースで増え、週ごとに抜ける）。古いデータにはない */
  fatigue?: number;
  /** 休み明けの得意・不得意（鉄砲駆け・叩き良化）。古いデータにはない */
  layoffType?: 'fresh' | 'needsRun' | 'normal';
  tier: Tier;
  starts: number;
  wins: number;
  seconds: number;
  thirds: number;
  /** 獲得賞金（万円） */
  earnings: number;
  /** 年ごとの獲得賞金（万円） */
  earningsByYear: Record<number, number>;
  graded: GradedWin[];
  /** 直近の成績（古い順、最大 RUNS_KEPT 走） */
  runs: RunRecord[];
  /** 最後に走った通算の週 */
  lastWeek: number | null;
  /** 休養明けの通算の週（怪我など） */
  restUntil: number | null;
  retired: { serial: number; reason: RetireReason } | null;
  /** 前走の騎手（Jockey.id）。乗り替わりの判断に使う */
  jockeyId?: number;
}

/** 騎手のランク（S+ が最上位） */
export type JockeyRank = 'S+' | 'S' | 'A' | 'B' | 'C';
export const JOCKEY_RANKS: readonly JockeyRank[] = ['S+', 'S', 'A', 'B', 'C'];
/** ランクの値（S+ = 4 〜 C = 0） */
export const rankValue = (r: JockeyRank) => 4 - JOCKEY_RANKS.indexOf(r);

export interface Jockey {
  id: number;
  name: string;
  rank: JockeyRank;
  /** 短期免許：この月の範囲（両端を含む）だけ日本で乗る */
  months?: [number, number];
  /** 以前の版の架空の騎手（いまは使わない。保存データを読むときに外す） */
  fictional?: boolean;
  starts: number;
  wins: number;
  seconds: number;
  thirds: number;
  /** 年ごとの [騎乗数, 勝利数, 2着, 3着] */
  byYear: Record<number, [number, number, number, number]>;
  graded: GradedWin[];
  /** C ランクのあいだに勝った G2・G3 の数（B への昇格に使う） */
  minorWins: number;
}

export type NewsKind = 'summer' | 'injury' | 'retire' | 'debut' | 'award' | 'record' | 'abroad' | 'offscreen' | 'jockey' | 'preview' | 'rotation';

export interface NewsItem {
  /** 通算の週 */
  serial: number;
  kind: NewsKind;
  title: string;
  body: string;
  horseIds: number[];
}

/** 重賞の結果（カレンダー・重賞勝ち馬一覧用） */
export interface GradedResult {
  year: number;
  week: number;
  name: string;
  grade: Grade;
  /** 競馬場（4場以外のレースはその競馬場の名前） */
  venue: Venue | string;
  /** 日付（4場以外のレースだけ。4場のレースは週から分かる） */
  date?: { month: number; day: number };
  /** 1〜3着の馬（id と名前） */
  top3: { id: number; name: string }[];
  time: number;
}

export interface Award {
  year: number;
  title: string;
  horseId: number;
  name: string;
  reason: string;
}

export interface World {
  version: 1;
  seed: number;
  /** いまの通算の週（この週の出走表を作って走らせる） */
  serial: number;
  horses: WorldHorse[];
  nextId: number;
  news: NewsItem[];
  graded: GradedResult[];
  awards: Award[];
  /** 騎手（騎手を入れる前の保存データにはない。読み込むときに作る） */
  jockeys?: Jockey[];
}

/** 直近の成績を残す数 */
export const RUNS_KEPT = 10;
