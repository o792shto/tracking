import { PARAMS, type RaceResult } from '../sim';
import type { HorseSample } from './replay';

/** 順位表の1行 */
export interface StandingRow {
  /** 馬のインデックス（setup.entries の添字） */
  index: number;
  number: number;
  rank: number;
  /** 先頭との差（馬身）。ゴール後は確定した着差の累計 */
  behindLengths: number;
  /** 現在速度（km/h） */
  speedKmh: number;
  finished: boolean;
}

/** 入れ替わったとみなす最小の差（m）。並んでいる馬の順位がちらつかないようにする */
const SWAP_HYSTERESIS = 0.3;

/**
 * 順位を決める。ゴール済みの馬は着順で固定し、走っている馬は距離順。
 * 前回の並び prev を出発点にして、差が SWAP_HYSTERESIS を超えたときだけ入れ替える。
 */
export function standings(
  result: RaceResult,
  samples: HorseSample[],
  t: number,
  prev: number[] | null,
): StandingRow[] {
  const finishTime = new Map(result.finish.map((f) => [f.number - 1, f.time]));
  const isFinished = (i: number) => (finishTime.get(i) ?? Infinity) <= t;
  const finishRank = new Map(result.finish.map((f) => [f.number - 1, f.rank]));

  let order = prev && prev.length === samples.length ? [...prev] : samples.map((_, i) => i);
  if (!prev || prev.length !== samples.length) {
    order.sort((a, b) => samples[b].d - samples[a].d);
  }
  // 挿入ソート（ヒステリシス付き）
  const ahead = (a: number, b: number) => {
    const fa = isFinished(a);
    const fb = isFinished(b);
    if (fa && fb) return finishRank.get(a)! < finishRank.get(b)!;
    if (fa !== fb) return fa;
    return samples[a].d > samples[b].d + SWAP_HYSTERESIS;
  };
  for (let i = 1; i < order.length; i++) {
    const k = order[i];
    let j = i - 1;
    while (j >= 0 && ahead(k, order[j])) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = k;
  }
  // 並びが前回から大きく崩れた（シークなど）ときの保険：ヒステリシスなしで並べ直す
  const broken = order.some(
    (k, i) => i > 0 && !isFinished(k) && samples[k].d > samples[order[i - 1]].d + 5,
  );
  if (broken) order = [...order].sort((a, b) => (ahead(a, b) ? -1 : ahead(b, a) ? 1 : 0));

  const leader = samples[order[0]];
  const D = result.setup.course.distance;
  const winnerTime = result.finish[0].time;
  // ゴール後の差は時間差を勝ち馬の平均速度で距離に換算する
  const avgSpeed = D / winnerTime;
  return order.map((index, i) => {
    const s = samples[index];
    const finished = isFinished(index);
    let behind: number;
    if (finished) {
      behind = ((finishTime.get(index)! - winnerTime) * avgSpeed) / PARAMS.bodyLength;
    } else if (t >= winnerTime) {
      behind = (D - s.d + (t - winnerTime) * avgSpeed) / PARAMS.bodyLength;
    } else {
      behind = (leader.d - s.d) / PARAMS.bodyLength;
    }
    return {
      index,
      number: result.setup.entries[index].number,
      rank: i + 1,
      behindLengths: Math.max(0, behind),
      speedKmh: s.v * 3.6,
      finished,
    };
  });
}

/** 先頭が通過した200mごとのラップのうち、時刻 t までに確定したもの */
export function lapsSoFar(result: RaceResult, t: number): number[] {
  const out: number[] = [];
  let cum = 0;
  for (const lap of result.laps) {
    cum += lap;
    if (cum > t + 1e-9) break;
    out.push(lap);
  }
  return out;
}

/** このコース・馬場の基準ラップ（能力が平均的な馬の巡航速度で200mを走る時間） */
export function referenceLap(result: RaceResult): number {
  const { course } = result.setup;
  const cruise =
    PARAMS.baseCruise[course.surface] *
    Math.pow(1600 / course.distance, PARAMS.cruiseDistanceExponent[course.surface]) *
    PARAMS.conditionSpeed[course.surface][course.condition];
  return 200 / cruise;
}

export interface PaceReadout {
  first3f: number | null;
  last3f: number | null;
  /** ゴール前は null */
  judgement: RaceResult['pace'] | null;
}

export function paceReadout(result: RaceResult, t: number): PaceReadout {
  const laps = lapsSoFar(result, t);
  const done = laps.length === result.laps.length;
  const first3f = Number.isFinite(result.first3f) && t >= result.first3f ? result.first3f : null;
  const last3f = done ? laps.slice(-3).reduce((a, b) => a + b, 0) : null;
  return { first3f, last3f, judgement: done ? result.pace : null };
}

/** 馬群の長さ（m）：先頭から、まだゴールしていない最後方まで */
export function fieldLength(samples: HorseSample[]): number {
  let max = -Infinity;
  let min = Infinity;
  for (const s of samples) {
    if (s.d > max) max = s.d;
    if (s.d < min) min = s.d;
  }
  return samples.length ? max - min : 0;
}

/** 残り600m/400m/200m のテロップ。先頭が通過してからこの距離の間だけ出す */
const TELOP_SPAN = 45;
export const TELOP_MARKS = [600, 400, 200] as const;

export function activeTelop(result: RaceResult, leaderD: number): (typeof TELOP_MARKS)[number] | null {
  const D = result.setup.course.distance;
  for (const mark of TELOP_MARKS) {
    const at = D - mark;
    if (leaderD >= at && leaderD < at + TELOP_SPAN) return mark;
  }
  return null;
}
