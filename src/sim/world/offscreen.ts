import type { AgeCondition, Grade } from '../gradedRaces';
import type { Rng } from '../rng';
import type { Surface } from '../types';
import { ageOf, aptitudeFit, currentStats, rating, gradedPlaced } from './horses';
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
  /** 名簿の馬（JRA の馬）が出る頭数。省略時は OFFSCREEN の頭数 */
  jraRunners?: number;
  /** 地方の馬（名簿にいない）の頭数と強さ（日本のトップの水準との差、点）。交流 G1 だけ */
  locals?: { count: number; level: number };
  /** 格の表記（交流 G1 は「JpnI」） */
  gradeLabel?: string;
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

/**
 * 交流 G1（地方競馬場の JpnI）の、JRA の馬の頭数と地方の馬。地方の馬は名簿にいないので、海外の相手と同じく強さの目安で並べる。
 * JRA の馬の頭数（実際は競走ごとに出走枠がある）と地方の馬の強さは、実在の値を確かめていない目安
 */
const LOCAL = { jraRunners: 7, locals: { count: 7, level: -10 }, gradeLabel: 'JpnI' };

/**
 * 画面に出ない G1（その時期の開催週に、出走馬を決めて結果を出す）。中京の G1 と、交流 G1（ユーザーの指示で追加）。
 * 交流 G1 の日付・競馬場・距離・1着賞金は2026年の施行予定（地方競馬全国協会の発表をもとにした報道・集計サイトで確認）。
 * JBCクラシックは毎年開催地が替わる（2026年は金沢）。ゲームでは毎年同じ日程で繰り返す。
 * 年齢条件は、マイルCS南部杯だけ確かめられていない（3歳以上としている）。
 * JBCスプリント・JBCレディスクラシックは、2026年の距離と賞金を確かめられなかったので入れていない
 */
export const OFFSCREEN_G1: readonly OffscreenRace[] = [
  { name: '高松宮記念', grade: 'G1', venue: '中京', month: 3, day: 29, surface: 'turf', distance: 1200, age: '4up', fillies: false },
  { name: '川崎記念', grade: 'G1', venue: '川崎', month: 4, day: 8, surface: 'dirt', distance: 2100, age: '4up', fillies: false, ...LOCAL },
  { name: 'かしわ記念', grade: 'G1', venue: '船橋', month: 5, day: 5, surface: 'dirt', distance: 1600, age: '4up', fillies: false, ...LOCAL },
  { name: 'さきたま杯', grade: 'G1', venue: '浦和', month: 6, day: 24, surface: 'dirt', distance: 1400, age: '3up', fillies: false, ...LOCAL },
  { name: '帝王賞', grade: 'G1', venue: '大井', month: 7, day: 1, surface: 'dirt', distance: 2000, age: '4up', fillies: false, ...LOCAL },
  { name: 'マイルCS南部杯', grade: 'G1', venue: '盛岡', month: 10, day: 12, surface: 'dirt', distance: 1600, age: '3up', fillies: false, ...LOCAL },
  { name: 'JBCクラシック', grade: 'G1', venue: '金沢', month: 11, day: 3, surface: 'dirt', distance: 2100, age: '3up', fillies: false, ...LOCAL },
  { name: 'チャンピオンズC', grade: 'G1', venue: '中京', month: 12, day: 6, surface: 'dirt', distance: 1800, age: '3up', fillies: false },
  { name: '東京大賞典', grade: 'G1', venue: '大井', month: 12, day: 29, surface: 'dirt', distance: 2000, age: '3up', fillies: false, ...LOCAL },
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
  /** 夏の重賞の割り振り：G2（札幌記念）を選ぶ上乗せと、選ぶときのばらつき（向き不向きの点） */
  g2Pull: 0.5,
  pickNoise: 0.3,
  /** G1 馬・秋の G1 を目標にする馬が夏の重賞を使う確率（多くは秋に備えて休む） */
  eliteSummerRun: 0.15,
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
  if (h.wins === 0 && !gradedPlaced(h)) return false;
  if (race.grade !== 'G1' && h.tier !== 'open' && h.tier !== '3win' && race.age !== '3') return false;
  if (aptitudeFit(h, race.surface, race.distance) <= -2.5) return false;
  return Math.abs(race.distance - h.bestDistance) <= OFFSCREEN.maxDistanceDiff;
}

/**
 * 着順（馬の並び順で返す）。総合力＋向き不向き＋ばらつき。
 * 交流 G1 は地方の馬（top はその週の日本のトップの水準）も一緒に並べるので、着順は出走頭数（名簿の馬＋地方の馬）の中での順位
 */
export function offscreenRanks(race: OffscreenRace, horses: WorldHorse[], year: number, progress: number, rng: Rng, top = 0): number[] {
  const perf = horses.map((h, i) => ({
    i,
    v: rating(currentStats(h, year, progress)) + 0.8 * aptitudeFit(h, race.surface, race.distance) + rng.normal(0, OFFSCREEN.noise),
  }));
  if (race.locals) {
    for (let k = 0; k < race.locals.count; k++) perf.push({ i: -1, v: rng.normal(top + race.locals.level, OFFSCREEN.noise + 1) });
  }
  perf.sort((a, b) => b.v - a.v);
  const ranks = horses.map(() => 0);
  perf.forEach((x, k) => {
    if (x.i >= 0) ranks[x.i] = k + 1;
  });
  return ranks;
}

/** 名簿の馬が出る頭数 */
export function offscreenJraRunners(race: OffscreenRace): number {
  return race.jraRunners ?? OFFSCREEN.g1Runners;
}
