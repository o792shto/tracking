import type { RaceDistance, Surface } from './types';

/**
 * JRAのラップタイム参考値（docs/reference/jra-lap-reference.md）。
 * 実データの集計値ではなく、中央場・古馬・中〜上級クラスを想定したおおよその目安。
 * 妥当性チェック（外れ値検出）にだけ使う。参考値のない条件は undefined のままにし、推測で埋めない。
 */
export interface GoodTrackReference {
  /** 勝ち時計（秒） */
  winTime: [number, number];
  /** 平均ラップ（秒） */
  avgLap: number;
  /** 最速〜最遅ラップ（秒） */
  lapRange: [number, number];
  /** 上がり3F（勝ち馬・上位馬、秒） */
  last3f: [number, number];
}

export const REFERENCE_GOOD: Record<Surface, Partial<Record<RaceDistance, GoodTrackReference>>> = {
  turf: {
    1200: { winTime: [68.0, 69.0], avgLap: 11.4, lapRange: [10.3, 12.0], last3f: [34.0, 35.0] },
    1600: { winTime: [92.0, 94.0], avgLap: 11.6, lapRange: [10.8, 12.4], last3f: [33.5, 35.0] },
    2000: { winTime: [118.0, 121.0], avgLap: 11.9, lapRange: [11.0, 13.0], last3f: [33.5, 35.0] },
    2400: { winTime: [143.0, 147.0], avgLap: 12.1, lapRange: [11.0, 13.3], last3f: [33.5, 35.0] },
    // 参考値は「3000以上」。3000mで比べる
    3000: { winTime: [182.0, 186.0], avgLap: 12.2, lapRange: [11.2, 13.5], last3f: [34.0, 35.5] },
  },
  dirt: {
    1200: { winTime: [70.0, 72.0], avgLap: 11.8, lapRange: [10.6, 12.8], last3f: [36.0, 37.5] },
    1400: { winTime: [83.0, 85.0], avgLap: 12.0, lapRange: [10.8, 13.0], last3f: [36.5, 38.0] },
    1800: { winTime: [110.0, 113.0], avgLap: 12.4, lapRange: [11.5, 13.3], last3f: [37.0, 38.5] },
    2100: { winTime: [131.0, 134.0], avgLap: 12.6, lapRange: [11.8, 13.5], last3f: [37.5, 39.0] },
    // 1600・2000 は参考値なし
  },
};

/** 芝の道悪（重〜不良）：良より遅くなる */
export const REFERENCE_TURF_HEAVY = {
  /** 走破タイムの良との差（秒）。「+1〜3秒以上」なので上限は目安 */
  timeDelta: [1, 3] as [number, number],
  avgLapDelta: [0.2, 0.4] as [number, number],
  last3f: [35.5, 37.5] as [number, number],
};

/** ダートの道悪（重〜不良）：砂が締まって良より速くなる */
export const REFERENCE_DIRT_HEAVY = {
  timeDelta: [-1.5, -0.5] as [number, number],
  last3fDelta: [-1.0, -0.5] as [number, number],
};

/** 1F目はゲート発走のためほぼ12秒台 */
export const REFERENCE_FIRST_LAP: [number, number] = [12.0, 13.0];
