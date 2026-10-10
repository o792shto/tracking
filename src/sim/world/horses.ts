import { generateHorseName } from '../names';
import type { Rng } from '../rng';
import type { Horse, HorseStats, RunningStyle, Surface } from '../types';
import type { Sex, WorldHorse } from './types';

/**
 * 名簿の馬の生まれつきの能力と、年齢による成長・衰え。
 * 素質（talent）を決めて、そのまわりに6つの能力値をばらつかせる。上のクラスにいるのは素質の高い馬
 */
export const WORLD = {
  /** 素質の平均と標準偏差（能力値の平均）。G1級は上位数％ */
  talentMean: 57,
  talentSpread: 12,
  /** 素質馬の割合と、上乗せの大きさ（標準偏差） */
  starChance: 0.1,
  starSpread: 10,
  /** 能力値ごとのばらつき（素質のまわり） */
  statSpread: 9,
  /** 1世代の頭数（2歳で入ってくる数） */
  cohortSize: 480,
};

const STYLE_WEIGHTS: readonly (readonly [RunningStyle, number])[] = [
  ['nige', 0.13],
  ['senko', 0.34],
  ['sashi', 0.33],
  ['oikomi', 0.2],
];
const STYLE_BIAS: Record<RunningStyle, Partial<HorseStats>> = {
  nige: { speed: 6, start: 8, stamina: 4 },
  senko: { speed: 3, start: 4 },
  sashi: { kick: 4 },
  oikomi: { kick: 6, start: -6, speed: -2 },
};
const STAT_KEYS: (keyof HorseStats)[] = ['speed', 'stamina', 'kick', 'power', 'temperament', 'start'];

const clampStat = (x: number) => Math.round(Math.min(100, Math.max(15, x)));

/** 新しい馬を1頭作る（成績は空） */
export function newHorse(rng: Rng, id: number, birthYear: number, sex: Sex, taken: Set<string>, talentShift = 0): WorldHorse {
  const style = rng.weighted(STYLE_WEIGHTS);
  // ひと握りの素質馬は分布の右にはみ出す（G1 で抜けた存在になる）
  const star = rng.chance(WORLD.starChance) ? Math.abs(rng.normal(0, WORLD.starSpread)) : 0;
  const talent = rng.normal(WORLD.talentMean + talentShift, WORLD.talentSpread) + star;
  const bias = STYLE_BIAS[style];
  const potential = Object.fromEntries(
    STAT_KEYS.map((k) => [k, clampStat(talent + (bias[k] ?? 0) + rng.normal(0, WORLD.statSpread))]),
  ) as unknown as HorseStats;
  const turfBetter = rng.chance(0.55);
  const off = 1 - rng.range(0.005, 0.03);
  const name = generateHorseName(rng, taken);
  taken.add(name);
  return {
    id,
    name,
    sex,
    birthYear,
    style,
    potential,
    bestDistance: Math.round(Math.min(3200, Math.max(1100, rng.normal(1750, 400))) / 100) * 100,
    surfaceAptitude: turfBetter ? { turf: 1, dirt: off } : { turf: off, dirt: 1 },
    growth: Math.max(-1, Math.min(1, rng.normal(0, 0.5))),
    boost: 0,
    tier: 'maiden',
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    earnings: 0,
    earningsByYear: {},
    graded: [],
    runs: [],
    lastWeek: null,
    restUntil: null,
    retired: null,
  };
}

export function ageOf(h: Pick<WorldHorse, 'birthYear'>, year: number): number {
  return year - h.birthYear;
}

/**
 * 年齢と季節による能力の増減（点）。2〜3歳は成長途中、4〜5歳が完成、6歳から衰える。
 * 早熟（growth < 0）は若いうちから強く衰えも早い、晩成（growth > 0）はその逆。
 * seasonProgress はその年の進み具合（0〜1）
 */
export function ageOffset(age: number, seasonProgress: number, growth: number): number {
  let base: number;
  if (age <= 2) base = -9 + 3 * seasonProgress;
  else if (age === 3) base = -5 + 4 * seasonProgress;
  else if (age <= 5) base = 0;
  else base = -2 * (age - 5);
  // 早熟は若いうちのマイナスが小さく、晩成は大きい。年を取ると逆になる
  const young = age <= 3 ? -growth * 2.5 : 0;
  const old = age >= 6 ? growth * 1.5 : 0;
  return base + young + old;
}

/** その時点の能力値 */
export function currentStats(h: WorldHorse, year: number, seasonProgress: number): HorseStats {
  const offset = ageOffset(ageOf(h, year), seasonProgress, h.growth) + h.boost;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, clampStat(h.potential[k] + offset)])) as unknown as HorseStats;
}

/** 総合力の目安（出走馬を選ぶとき・表彰の参考） */
export function rating(stats: HorseStats): number {
  return stats.speed * 0.3 + stats.stamina * 0.25 + stats.kick * 0.3 + stats.power * 0.05 + stats.start * 0.05 + stats.temperament * 0.05;
}

/** 距離・馬場の向き不向き（大きいほど向いている、0 が最適） */
export function aptitudeFit(h: Pick<WorldHorse, 'bestDistance' | 'surfaceAptitude'>, surface: Surface, distance: number): number {
  return -6 * Math.abs(Math.log(distance / h.bestDistance)) - (h.surfaceAptitude[surface] < 1 ? 4 : 0);
}

/** レースで走らせるときの馬（シミュレーション用） */
export function simHorse(h: WorldHorse, year: number, seasonProgress: number): Horse {
  return {
    id: `w${h.id}`,
    name: h.name,
    stats: currentStats(h, year, seasonProgress),
    style: h.style,
    bestDistance: h.bestDistance,
    surfaceAptitude: h.surfaceAptitude,
    sex: h.sex,
    age: ageOf(h, year),
  };
}
