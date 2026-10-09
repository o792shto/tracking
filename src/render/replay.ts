import { LOG_FIELDS, type RaceLog } from '../sim';

/** ある時刻の1頭の状態（記録を線形補間したもの） */
export interface HorseSample {
  /** スタートからの距離（m） */
  d: number;
  /** 内ラチからの横位置（m） */
  x: number;
  /** 速度（m/s） */
  v: number;
  /** 残りスタミナ（0〜1） */
  stamina: number;
}

/** 記録の長さ（秒） */
export function logDuration(log: RaceLog): number {
  return (log.steps - 1) * log.dt;
}

/**
 * 時刻 t（秒）の全馬の状態を記録から補間して out に書き込む。
 * 描画側はこれを読むだけで、シミュレーションの結果は変えない。
 */
export function sampleAt(log: RaceLog, t: number, out: HorseSample[] = []): HorseSample[] {
  const n = log.horses;
  const pos = Math.min(Math.max(t / log.dt, 0), log.steps - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(i0 + 1, log.steps - 1);
  const f = pos - i0;
  const data = log.data;
  for (let h = 0; h < n; h++) {
    const a = (i0 * n + h) * LOG_FIELDS;
    const b = (i1 * n + h) * LOG_FIELDS;
    const s = (out[h] ??= { d: 0, x: 0, v: 0, stamina: 0 });
    s.d = data[a] + (data[b] - data[a]) * f;
    s.x = data[a + 1] + (data[b + 1] - data[a + 1]) * f;
    s.v = data[a + 2] + (data[b + 2] - data[a + 2]) * f;
    s.stamina = data[a + 3] + (data[b + 3] - data[a + 3]) * f;
  }
  out.length = n;
  return out;
}

/** 距離の大きい順（先頭から）に並べた馬のインデックス */
export function runningOrder(samples: HorseSample[]): number[] {
  return samples.map((_, i) => i).sort((a, b) => samples[b].d - samples[a].d || a - b);
}
