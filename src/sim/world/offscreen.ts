import type { AgeCondition, Grade } from '../gradedRaces';
import type { Rng } from '../rng';
import type { Surface } from '../types';
import { ageOf, aptitudeFit, currentStats, rating } from './horses';
import { overseasWeek } from './overseas';
import type { WorldHorse } from './types';

/**
 * 画面に出ない国内の重賞（4場以外）。夏競馬（札幌・函館・新潟・小倉・福島）と中京の G1。
 * レースとしては走らせず、出走馬と着順だけを決めて、戦績・ニュース・重賞の結果に残す（オフスクリーン出走）。
 * 日付は毎年のおおよその時期（正確な施行日ではない）
 */
export interface OffscreenRace {
  name: string;
  grade: Grade;
  venue: string;
  month: number;
  day: number;
  surface: Surface;
  distance: number;
  age: AgeCondition;
  fillies: boolean;
}

/** 夏の重賞（夏休みの間に行われ、夏明けの週にまとめて結果を出す） */
export const SUMMER_RACES: readonly OffscreenRace[] = [
  { name: 'ラジオNIKKEI賞', grade: 'G3', venue: '福島', month: 7, day: 5, surface: 'turf', distance: 1800, age: '3', fillies: false },
  { name: '七夕賞', grade: 'G3', venue: '福島', month: 7, day: 12, surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { name: '函館記念', grade: 'G3', venue: '函館', month: 7, day: 19, surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { name: 'アイビスサマーダッシュ', grade: 'G3', venue: '新潟', month: 7, day: 26, surface: 'turf', distance: 1000, age: '3up', fillies: false },
  { name: 'クイーンS', grade: 'G3', venue: '札幌', month: 8, day: 2, surface: 'turf', distance: 1800, age: '3up', fillies: true },
  { name: '小倉記念', grade: 'G3', venue: '小倉', month: 8, day: 9, surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { name: 'エルムS', grade: 'G3', venue: '札幌', month: 8, day: 9, surface: 'dirt', distance: 1700, age: '3up', fillies: false },
  { name: '関屋記念', grade: 'G3', venue: '新潟', month: 8, day: 16, surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { name: '北九州記念', grade: 'G3', venue: '小倉', month: 8, day: 16, surface: 'turf', distance: 1200, age: '3up', fillies: false },
  { name: '札幌記念', grade: 'G2', venue: '札幌', month: 8, day: 23, surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { name: 'キーンランドC', grade: 'G3', venue: '札幌', month: 8, day: 30, surface: 'turf', distance: 1200, age: '3up', fillies: false },
  { name: '新潟記念', grade: 'G3', venue: '新潟', month: 8, day: 30, surface: 'turf', distance: 2000, age: '3up', fillies: false },
];

/** 中京の G1（その時期の開催週に、出走馬を決めて結果を出す） */
export const OFFSCREEN_G1: readonly OffscreenRace[] = [
  { name: '高松宮記念', grade: 'G1', venue: '中京', month: 3, day: 29, surface: 'turf', distance: 1200, age: '4up', fillies: false },
  { name: 'チャンピオンズC', grade: 'G1', venue: '中京', month: 12, day: 6, surface: 'dirt', distance: 1800, age: '3up', fillies: false },
];

export const OFFSCREEN = {
  /** 出走頭数（夏の重賞・中京の G1） */
  summerRunners: [10, 16] as [number, number],
  g1Runners: 16,
  /** 力のばらつき（点） */
  noise: 3.5,
  /** 得意距離との差の上限（m） */
  maxDistanceDiff: 400,
  /** 夏の重賞に出られるのは、その年のここまでの出走がこれ未満の馬 */
  summerMaxStartsSoFar: 5,
  /** 夏の重賞の勝ち馬が夏に力をつけている確率（ニュースの「夏の上がり馬」になる） */
  winnerGrowthChance: 0.6,
};

/** その週の中京の G1 */
export function offscreenG1Of(weekIndex: number): OffscreenRace[] {
  return OFFSCREEN_G1.filter((r) => overseasWeek(r) === weekIndex);
}

function ageFits(race: OffscreenRace, age: number): boolean {
  switch (race.age) {
    case '2':
      return age === 2;
    case '3':
      return age === 3;
    case '3up':
      return age >= 3;
    case '4up':
      return age >= 4;
  }
}

/** 出られる馬か（年齢・性別・馬場・距離・クラス） */
export function offscreenEligible(h: WorldHorse, race: OffscreenRace, year: number): boolean {
  if (h.retired) return false;
  if (!ageFits(race, ageOf(h, year))) return false;
  if (race.fillies && h.sex !== 'filly') return false;
  if (h.wins === 0) return false;
  if (race.grade !== 'G1' && h.tier !== 'open' && h.tier !== '3win' && race.age !== '3') return false;
  if (aptitudeFit(h, race.surface, race.distance) <= -2.5) return false;
  return Math.abs(race.distance - h.bestDistance) <= OFFSCREEN.maxDistanceDiff;
}

/** 着順（馬の並び順で返す）。総合力＋向き不向き＋ばらつき */
export function offscreenRanks(race: OffscreenRace, horses: WorldHorse[], year: number, progress: number, rng: Rng): number[] {
  const perf = horses.map((h, i) => ({
    i,
    v: rating(currentStats(h, year, progress)) + 0.8 * aptitudeFit(h, race.surface, race.distance) + rng.normal(0, OFFSCREEN.noise),
  }));
  perf.sort((a, b) => b.v - a.v);
  const ranks = horses.map(() => 0);
  perf.forEach((x, k) => (ranks[x.i] = k + 1));
  return ranks;
}
