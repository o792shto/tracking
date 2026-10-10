import { generateHorseName } from './names';
import { PARAMS } from './params';
import { Rng } from './rng';

/** 文字列から乱数のシードを作る（FNV-1a） */
function stringSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
import {
  CONDITIONS,
  DISTANCES_BY_SURFACE,
  type Course,
  type Entry,
  type Horse,
  type HorseStats,
  type RaceSetup,
  type RunningStyle,
} from './types';

const STYLE_WEIGHTS: readonly (readonly [RunningStyle, number])[] = [
  ['nige', 0.13],
  ['senko', 0.34],
  ['sashi', 0.33],
  ['oikomi', 0.2],
];

/** 脚質ごとの能力の傾向 */
const STYLE_BIAS: Record<RunningStyle, Partial<HorseStats>> = {
  nige: { speed: 6, start: 8, stamina: 4 },
  senko: { speed: 3, start: 4 },
  sashi: { kick: 4 },
  oikomi: { kick: 6, start: -6, speed: -2 },
};

function stat(rng: Rng, mean: number, bias = 0): number {
  return Math.round(Math.min(100, Math.max(15, rng.normal(mean + bias, PARAMS.statSpread))));
}

/**
 * 馬を1頭作る。馬名は能力とは別の乱数で作る（馬名の作り方を変えても能力やレース結果が変わらないように）。
 * name を省略すると、id から決まる乱数で作る
 */
export function generateHorse(rng: Rng, id: string, classLevel = 60, name?: string): Horse {
  const style = rng.weighted(STYLE_WEIGHTS);
  const b = STYLE_BIAS[style];
  const turfBetter = rng.chance(0.55);
  const off = 1 - rng.range(0.005, 0.03);
  return {
    id,
    name: name ?? generateHorseName(new Rng(stringSeed(id))),
    style,
    stats: {
      speed: stat(rng, classLevel, b.speed),
      stamina: stat(rng, classLevel, b.stamina),
      kick: stat(rng, classLevel, b.kick),
      power: stat(rng, classLevel, b.power),
      temperament: stat(rng, classLevel, b.temperament),
      start: stat(rng, classLevel, b.start),
    },
    bestDistance: Math.round(Math.min(2800, Math.max(1100, rng.normal(1750, 380))) / 100) * 100,
    surfaceAptitude: turfBetter ? { turf: 1, dirt: off } : { turf: off, dirt: 1 },
  };
}

/** 枠番：頭数に応じて1〜8枠に割り振る（9頭以上は外枠から2頭ずつ） */
export function frameNumbers(count: number): number[] {
  if (count <= 8) return Array.from({ length: count }, (_, i) => i + 1);
  const perFrame = Array(8).fill(1);
  for (let extra = count - 8, f = 7; extra > 0; extra--, f = f === 0 ? 7 : f - 1) perFrame[f]++;
  const out: number[] = [];
  perFrame.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(i + 1);
  });
  return out;
}

export interface CreateRaceOptions {
  course?: Partial<Course>;
  runners?: number;
  /** 出走馬の能力水準（能力値の平均）。省略時は60（3勝クラス相当） */
  classLevel?: number;
  /** 出馬表に出す近走の数の幅（最小, 最大）。省略時は4走 */
  pastRuns?: [number, number];
}

/** シードからコースと出走馬を生成する */
export function createRace(seed: number, options: CreateRaceOptions = {}): RaceSetup {
  const rng = new Rng(seed).fork(1);
  const wanted = options.course?.distance;
  const surface =
    options.course?.surface ??
    (wanted && !DISTANCES_BY_SURFACE.dirt.includes(wanted)
      ? 'turf'
      : rng.chance(0.55)
        ? 'turf'
        : 'dirt');
  const distance = wanted ?? rng.pick(DISTANCES_BY_SURFACE[surface]);
  if (distance < 1000 || distance > 4000 || distance % 100 !== 0) {
    throw new Error(`${distance}m のレースは作れません（1000〜4000mの100m単位）`);
  }
  const course: Course = {
    distance,
    surface,
    direction: options.course?.direction ?? (rng.chance(0.5) ? 'right' : 'left'),
    condition:
      options.course?.condition ??
      rng.weighted([
        [CONDITIONS[0], 0.6],
        [CONDITIONS[1], 0.2],
        [CONDITIONS[2], 0.12],
        [CONDITIONS[3], 0.08],
      ]),
  };
  if (options.course?.venue) course.venue = options.course.venue;
  const runners = options.runners ?? rng.int(8, 18);
  const frames = frameNumbers(runners);
  const entries: Entry[] = [];
  // 馬名は別の乱数で、同じレースで重ならないように作る
  const nameRng = new Rng(seed).fork(7);
  const taken = new Set<string>();
  for (let i = 0; i < runners; i++) {
    const name = generateHorseName(nameRng, taken);
    taken.add(name);
    entries.push({
      number: i + 1,
      frame: frames[i],
      horse: generateHorse(rng, `h${seed}-${i + 1}`, options.classLevel, name),
      form: 1 + rng.normal(0, 0.006),
    });
  }
  const setup: RaceSetup = { seed, course, entries };
  if (options.pastRuns) setup.pastRuns = options.pastRuns;
  return setup;
}
