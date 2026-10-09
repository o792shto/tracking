import { Rng } from './rng';
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

const SYLLABLES = [
  'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ',
  'ガ', 'ギ', 'グ', 'ゲ', 'ゴ', 'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ', 'ダ', 'デ', 'ド',
  'バ', 'ビ', 'ブ', 'ベ', 'ボ', 'パ', 'ピ', 'プ', 'ペ', 'ポ',
  'キャ', 'シュ', 'ショ', 'チャ', 'ティ', 'ディ', 'ファ', 'フィ', 'ヴィ', 'リュ',
];
const TAILS = ['ン', 'ー', 'ル', 'ス', 'ト', 'ド', 'ム', 'ク'];

/** 架空の馬名（2〜9文字のカタカナ）。実在馬との一致は確認していない */
export function generateHorseName(rng: Rng): string {
  for (;;) {
    const count = rng.int(2, 4);
    let name = '';
    for (let i = 0; i < count; i++) {
      name += rng.pick(SYLLABLES);
      if (rng.chance(0.3)) name += rng.pick(TAILS);
    }
    if (name.length >= 3 && name.length <= 9 && !name.startsWith('ー') && !name.startsWith('ン')) {
      return name;
    }
  }
}

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
  return Math.round(Math.min(100, Math.max(15, rng.normal(mean + bias, 10))));
}

export function generateHorse(rng: Rng, id: string, classLevel = 60): Horse {
  const style = rng.weighted(STYLE_WEIGHTS);
  const b = STYLE_BIAS[style];
  const turfBetter = rng.chance(0.55);
  const off = 1 - rng.range(0.005, 0.03);
  return {
    id,
    name: generateHorseName(rng),
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
  for (let i = 0; i < runners; i++) {
    entries.push({
      number: i + 1,
      frame: frames[i],
      horse: generateHorse(rng, `h${seed}-${i + 1}`, options.classLevel),
      form: 1 + rng.normal(0, 0.006),
    });
  }
  return { seed, course, entries };
}
