import type { Venue } from './gradedRaces';
import type { Surface } from './types';

/**
 * 主要4場のコースの形は src/sim/trackData.ts（ユーザー提供の推定モデルから生成）と src/sim/racePath.ts。
 * ここには、形のデータが満たしているべき JRA 公式の数値（Aコース）を置く。テストで照合する。
 */
export interface OfficialCourse {
  /** 1周距離（m） */
  lap: number;
  /** 直線距離（4コーナー出口〜ゴール、m） */
  homeStraight: number;
  /** 高低差（m） */
  elevation: number;
}

const O = (lap: number, homeStraight: number, elevation: number): OfficialCourse => ({ lap, homeStraight, elevation });

/** データの周回名ごとの公式値 */
export const OFFICIAL_COURSES: Record<Venue, Record<string, OfficialCourse>> = {
  東京: { turf: O(2083.1, 525.9, 2.7), dirt: O(1899, 501.6, 2.5) },
  中山: { turf_inner: O(1667.1, 310, 5.3), turf_outer: O(1839.7, 310, 5.3), dirt: O(1493, 308, 4.5) },
  京都: { turf_inner: O(1782.8, 328.4, 3.1), turf_outer: O(1894.3, 403.7, 4.3), dirt: O(1607.6, 329.1, 3.0) },
  阪神: { turf_inner: O(1689, 356.5, 1.9), turf_outer: O(2089, 473.6, 2.4), dirt: O(1517.6, 352.7, 1.6) },
};

export type { Surface };
export { layoutFor, LAYOUT_LABEL, findStart, type Layout } from './racePath';
