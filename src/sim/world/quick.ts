import { PARAMS } from '../params';
import { apparentStrength } from '../rating';
import { marginLabel } from '../result';
import type { Rng } from '../rng';
import type { FinishRecord, RaceSetup } from '../types';

/**
 * 観戦しないレース（1R〜9R）の簡易な結果。毎ステップのシミュレーションは重いので、
 * 見た目の強さ（rating.ts）に当日の調子とばらつきを足して着順と時計を決める。
 * 数値はシミュレーションの結果（勝ち時計・1番人気の勝率・着差）に合わせた（quick.test.ts）
 */
export const QUICK = {
  /** 強さのばらつき（m/s） */
  noise: 0.18,
  /** 強さ（m/s）から平均速度への換算 */
  speedScale: 0.963,
};

export function quickFinish(setup: RaceSetup, rng: Rng): FinishRecord[] {
  const D = setup.course.distance;
  const strength = apparentStrength(setup);
  const rows = setup.entries.map((entry, i) => {
    const perf = strength[i] * entry.form + rng.normal(0, QUICK.noise);
    return { number: entry.number, time: D / (perf * QUICK.speedScale) };
  });
  rows.sort((a, b) => a.time - b.time || a.number - b.number);
  return rows.map((row, i): FinishRecord => {
    const marginSec = i === 0 ? 0 : row.time - rows[i - 1].time;
    const lengths = (marginSec * (D / row.time)) / PARAMS.bodyLength;
    return { number: row.number, rank: i + 1, time: row.time, marginSec, marginLabel: i === 0 ? '' : marginLabel(lengths), last3f: 0 };
  });
}
