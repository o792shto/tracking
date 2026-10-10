import { apparentStrength } from './rating';
import { Rng } from './rng';
import { DISTANCES_BY_SURFACE, SURFACE_LABEL, type PastRun, type RaceSetup, type Surface } from './types';

/** 近走の数（2歳戦以外はすべて4走） */
const DEFAULT_PAST_RUNS: [number, number] = [4, 4];

export type { PastRun } from './types';

/** 出馬表で見せる情報。能力値は直接出さず、近走成績と短評から推測させる */
export interface HorseProfile {
  number: number;
  /** 近走（新しい順、最大4走） */
  recent: PastRun[];
  /** 短評（2つ程度） */
  comments: string[];
}

const TRAITS: { key: 'speed' | 'stamina' | 'kick' | 'power' | 'temperament' | 'start'; high: string; low: string }[] = [
  { key: 'speed', high: '先行力がある', low: '行き脚がつかない' },
  { key: 'stamina', high: 'スタミナ豊富', low: '距離延長は疑問' },
  { key: 'kick', high: '末脚が切れる', low: 'じり脚' },
  { key: 'power', high: '道悪は苦にしない', low: '力の要る馬場は苦手' },
  { key: 'temperament', high: '落ち着きがある', low: '気性に難あり' },
  { key: 'start', high: 'ゲートが上手', low: '出遅れ癖あり' },
];

/**
 * 近走成績と短評を作る。近走は見た目の強さにばらつきを加えて着順にするので、
 * 強い馬ほど好走が多いが、たまに凡走もする。短評も能力値に誤差を混ぜて選ぶので当てにしすぎない。
 */
export function horseProfiles(setup: RaceSetup): HorseProfile[] {
  const rng = new Rng(setup.seed).fork(4);
  const strength = apparentStrength(setup);
  const mean = strength.reduce((a, b) => a + b, 0) / strength.length;
  const sd = Math.sqrt(strength.reduce((a, b) => a + (b - mean) ** 2, 0) / strength.length) || 1;

  return setup.entries.map((entry, i) => {
    const z = (strength[i] - mean) / sd;
    const [minRuns, maxRuns] = setup.pastRuns ?? DEFAULT_PAST_RUNS;
    const runs = rng.int(minRuns, maxRuns);
    const recent: PastRun[] = entry.history ? entry.history.slice(0, 4) : [];
    for (let k = 0; !entry.history && k < runs; k++) {
      const runners = rng.int(10, 16);
      const perf = z * 0.8 + rng.normal(0, 1);
      let rank = 1;
      for (let o = 1; o < runners; o++) if (rng.normal(0, 1) > perf) rank++;
      const surface: Surface = rng.chance(0.75) ? setup.course.surface : rng.pick(['turf', 'dirt'] as const);
      recent.push({ rank, runners, surface, distance: rng.pick(DISTANCES_BY_SURFACE[surface]) });
    }

    const scored = TRAITS.map((t) => ({ t, v: entry.horse.stats[t.key] + rng.normal(0, 7) }));
    scored.sort((a, b) => b.v - a.v);
    const comments: string[] = [];
    if (scored[0].v > 62) comments.push(scored[0].t.high);
    const worst = scored[scored.length - 1];
    if (worst.v < 52) comments.push(worst.t.low);
    if (comments.length === 0) comments.push('特徴のない堅実派');
    return { number: entry.number, recent, comments };
  });
}

/** 近走1走の短い表記（例：「芝1600 3着」） */
export function formatPastRun(run: PastRun): string {
  return `${SURFACE_LABEL[run.surface]}${run.distance} ${run.rank}着`;
}
