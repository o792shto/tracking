import { TRACK, type TrackGeometry } from './course';
import type { Venue } from './gradedRaces';
import type { Surface } from './types';

/**
 * 主要4場のコースデータ（docs/reference/course-data.md）。
 * 1周・直線・高低差はJRAのコース紹介に載っている値（検索結果で確認。Aコース）。
 * 坂の位置と形は解説文からの推定で、公式の高低断面図とは照合していない。
 *
 * ゲームのコースは「直線2本＋半円カーブ2本」の楕円で近似する。
 * - コーナーの半径（推定）を決め、1周から2つのカーブを引いた残りを2本の直線に等分する
 * - ゴールは直線の終わりから GOAL_RUNOUT m 手前（直線距離の方が短ければ直線距離の位置）
 * - 直線距離（4コーナー出口〜ゴール）が楕円の直線より長い場合（東京など）、
 *   はみ出した分は4コーナーの出口側として扱い、追い出しは直線距離の地点から始める
 */
export type Layout = 'inner' | 'outer' | 'single';

export interface CourseSpec {
  /** 1周距離（m） */
  lap: number;
  /** 直線距離（4コーナー出口〜ゴール、m） */
  homeStraight: number;
  /** 高低差（m） */
  elevation: number;
  /** コーナーの半径（推定、m）。小回りほど小さい */
  cornerRadius: number;
  /**
   * 坂（推定）。ゴールからの残り距離で区間を指定し、高さの変化（m）を持つ。
   * 1周で高さの合計が0になるようにする（上りの分だけどこかで下る）
   */
  slopes: { from: number; to: number; rise: number }[];
}

/** ゴール板の先の直線（1コーナーまで）の最短の長さ。公表値が見つからないので仮の値 */
const GOAL_RUNOUT = 20;

const C = (
  lap: number,
  homeStraight: number,
  elevation: number,
  cornerRadius: number,
  slopes: CourseSpec['slopes'],
): CourseSpec => ({ lap, homeStraight, elevation, cornerRadius, slopes });

/**
 * 坂の推定：
 * - 東京：直線の半ば（残り460〜300m）に上り坂。向正面〜3コーナーで緩やかに下る
 * - 中山：ゴール前（残り180〜70m）に急坂。ゴール後〜2コーナーで上り、向正面〜4コーナーは長い下り
 * - 京都：3コーナーに坂（上って下る）。直線は平坦
 * - 阪神：ゴール前（残り200〜80m）に急坂。3〜4コーナーで緩やかに下る
 */
export const COURSES: Record<Venue, Record<Surface, Partial<Record<Layout, CourseSpec>>>> = {
  東京: {
    turf: {
      single: C(2083.1, 525.9, 2.7, 170, [
        { from: 460, to: 300, rise: 2.0 },
        { from: 1300, to: 900, rise: -2.0 },
      ]),
    },
    dirt: {
      single: C(1899, 501.6, 2.5, 150, [
        { from: 440, to: 290, rise: 1.8 },
        { from: 1200, to: 850, rise: -1.8 },
      ]),
    },
  },
  中山: {
    turf: {
      inner: C(1667.1, 310, 5.3, 120, [
        { from: 180, to: 70, rise: 2.2 },
        { from: 1600, to: 1250, rise: 2.0 },
        { from: 1150, to: 330, rise: -4.2 },
      ]),
      outer: C(1839.7, 310, 5.3, 140, [
        { from: 180, to: 70, rise: 2.2 },
        { from: 1770, to: 1400, rise: 2.0 },
        { from: 1300, to: 330, rise: -4.2 },
      ]),
    },
    dirt: {
      single: C(1493, 308, 4.5, 110, [
        { from: 180, to: 70, rise: 2.0 },
        { from: 1420, to: 1120, rise: 1.6 },
        { from: 1000, to: 330, rise: -3.6 },
      ]),
    },
  },
  京都: {
    turf: {
      inner: C(1782.8, 328.4, 3.1, 135, [
        { from: 900, to: 680, rise: 3.1 },
        { from: 680, to: 400, rise: -3.1 },
      ]),
      outer: C(1894.3, 403.7, 4.3, 165, [
        { from: 1000, to: 760, rise: 4.3 },
        { from: 760, to: 450, rise: -4.3 },
      ]),
    },
    dirt: {
      single: C(1607.6, 329.1, 3.0, 125, [
        { from: 850, to: 640, rise: 3.0 },
        { from: 640, to: 400, rise: -3.0 },
      ]),
    },
  },
  阪神: {
    turf: {
      inner: C(1689, 356.5, 1.9, 125, [
        { from: 200, to: 80, rise: 1.8 },
        { from: 800, to: 400, rise: -1.8 },
      ]),
      outer: C(2089, 473.6, 2.4, 175, [
        { from: 200, to: 80, rise: 1.8 },
        { from: 1000, to: 520, rise: -1.8 },
      ]),
    },
    dirt: {
      single: C(1517.6, 352.7, 1.6, 115, [
        { from: 200, to: 80, rise: 1.5 },
        { from: 760, to: 400, rise: -1.5 },
      ]),
    },
  },
};

/**
 * 芝の距離ごとの内回り・外回り（JRAのコース紹介の発走距離欄より。両方あるものは主な重賞に合わせた）。
 * 載っていない距離は、直線の長い方（外回り）を使う。
 */
const TURF_LAYOUT: Record<Venue, Record<number, Layout>> = {
  東京: {},
  中山: { 1200: 'outer', 1600: 'outer', 1800: 'inner', 2000: 'inner', 2200: 'outer', 2500: 'inner', 3600: 'inner' },
  京都: { 1200: 'inner', 1400: 'outer', 1600: 'outer', 1800: 'outer', 2000: 'inner', 2200: 'outer', 2400: 'outer', 3000: 'outer', 3200: 'outer' },
  阪神: { 1200: 'inner', 1400: 'inner', 1600: 'outer', 1800: 'outer', 2000: 'inner', 2200: 'inner', 2400: 'outer', 3000: 'inner' },
};

export function layoutFor(venue: Venue, surface: Surface, distance: number): Layout {
  const specs = COURSES[venue][surface];
  if (specs.single) return 'single';
  return TURF_LAYOUT[venue][distance] ?? 'outer';
}

export const LAYOUT_LABEL: Record<Layout, string> = { inner: '内回り', outer: '外回り', single: '' };

/** コースデータを楕円の形に直す */
export function trackFromSpec(spec: CourseSpec): TrackGeometry {
  const radius = spec.cornerRadius;
  const straight = (spec.lap - 2 * Math.PI * radius) / 2;
  const finishOffset = Math.min(spec.homeStraight, straight - GOAL_RUNOUT);
  const lap = spec.lap;
  // 坂：ゴールからの残り距離 → 周回座標 s（ゴールは s = finishOffset）に直して、区間ごとの勾配にする
  const grades = spec.slopes.map(({ from, to, rise }) => {
    const start = (((finishOffset - from) % lap) + lap) % lap;
    const length = from - to;
    return { start, length, grade: rise / length };
  });
  return { straight, radius, finishOffset, homeStretch: spec.homeStraight, grades };
}

export function trackFor(venue: Venue, surface: Surface, distance: number): { track: TrackGeometry; layout: Layout } {
  const layout = layoutFor(venue, surface, distance);
  const spec = COURSES[venue][surface][layout]!;
  return { track: trackFromSpec(spec), layout };
}

const cache = new Map<string, TrackGeometry>();

/** レースのコースの形。競馬場の指定がなければ標準の楕円 */
export function courseTrack(course: { venue?: Venue; surface: Surface; distance: number }): TrackGeometry {
  if (!course.venue) return TRACK;
  const key = `${course.venue}-${course.surface}-${course.distance}`;
  let t = cache.get(key);
  if (!t) {
    t = trackFor(course.venue, course.surface, course.distance).track;
    cache.set(key, t);
  }
  return t;
}
