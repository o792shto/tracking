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
  venue: Venue;
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
  /** 夏の成長などによる能力の上乗せ（点） */
  boost: number;
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
}

export type NewsKind = 'summer' | 'injury' | 'retire' | 'debut' | 'award' | 'record';

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
  venue: Venue;
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
}

/** 直近の成績を残す数 */
export const RUNS_KEPT = 10;
