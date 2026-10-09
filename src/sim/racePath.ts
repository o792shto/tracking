import type { Venue } from './gradedRaces';
import { TRACK_DATA } from './trackData';
import type { LayoutData, StartData } from './trackTypes';
import type { Course, Direction, Surface } from './types';

/**
 * レースの道筋：発走地点からゴールの先までを、曲率と勾配が一定の区間に分けたもの。
 * 位置は「距離計測ライン（内ラチ沿い）」上で、座標はゴール板が原点・y+ が内馬場側（数学の向き）。
 * 馬の横位置は内ラチから外への距離で表す。
 */
export interface PathPiece {
  /** 区間の始まり（スタートからの距離、m） */
  d0: number;
  length: number;
  /** 内馬場側へ曲がる曲率（1/m）。直線は0。外を回るほど進みが遅くなる */
  kIn: number;
  /** 左旋回を正とする曲率（1/m） */
  k: number;
  /** 勾配（高さ/距離、上りが正） */
  grade: number;
  /** 区間の始まりの位置と向き（ラジアン） */
  x: number;
  y: number;
  h: number;
}

export interface RacePath {
  distance: number;
  direction: Direction;
  pieces: PathPiece[];
  /** 道筋の終わり（ゴールの先まで、m） */
  end: number;
  /** 最後の直線の長さ（4コーナー出口〜ゴール、m） */
  homeStretch: number;
  /** 最後のコーナー（3〜4コーナー）の代表的な半径（m） */
  finalCornerRadius: number;
  /** 最後のコーナーの入口と、その後半（4コーナー）の入口（スタートからの距離） */
  finalCornerStart: number;
  fourthCornerStart: number;
  /** 使う周回（データの名前）。最初に走る周回と、使う引き込み線 */
  layout: string;
  firstLayout: string;
  chute: string | null;
  /** 資料に発走地点がない距離で、ゴールから距離ぶん戻った地点を仮の発走地点にしたもの */
  estimatedStart: boolean;
}

/** ゴールを過ぎてから描く・走る道の長さ */
const RUNOUT = 250;
/** 最後のコーナーの半径は、直線の手前この長さのカーブで測る */
const FINAL_CORNER_SPAN = 400;

const rad = (deg: number) => (deg * Math.PI) / 180;

interface Pose {
  x: number;
  y: number;
  h: number;
}

function advance(p: Pose, k: number, l: number): Pose {
  if (k === 0) return { x: p.x + l * Math.cos(p.h), y: p.y + l * Math.sin(p.h), h: p.h };
  return {
    x: p.x + (Math.sin(p.h + k * l) - Math.sin(p.h)) / k,
    y: p.y - (Math.cos(p.h + k * l) - Math.cos(p.h)) / k,
    h: p.h + k * l,
  };
}

/** 周回1つ分の形（区間の境目の位置を積分しておく） */
interface LayoutGeometry {
  data: LayoutData;
  /** 区間 [s0, s0+length) と曲率、始まりの位置 */
  segs: { s0: number; length: number; k: number; pose: Pose }[];
  homeStretch: number;
  /** 最後の直線の手前で続いているカーブの長さ */
  finalCornerLength: number;
  finalCornerRadius: number;
}

function layoutGeometry(data: LayoutData): LayoutGeometry {
  let pose: Pose = { x: data.start.x, y: data.start.y, h: rad(data.start.headingDeg) };
  let s0 = 0;
  const segs: LayoutGeometry['segs'] = [];
  for (const [length, turn] of data.segments) {
    const k = turn === 0 ? 0 : rad(turn) / length;
    segs.push({ s0, length, k, pose });
    pose = advance(pose, k, length);
    s0 += length;
  }
  // 最後の直線と、その手前のカーブ
  let i = segs.length - 1;
  let homeStretch = 0;
  while (i >= 0 && segs[i].k === 0) homeStretch += segs[i--].length;
  let finalCornerLength = 0;
  let span = 0;
  let turnSum = 0;
  while (i >= 0 && segs[i].k !== 0) {
    const seg = segs[i--];
    finalCornerLength += seg.length;
    const use = Math.min(seg.length, FINAL_CORNER_SPAN - span);
    if (use > 0) {
      span += use;
      turnSum += Math.abs(seg.k) * use;
    }
  }
  return { data, segs, homeStretch, finalCornerLength, finalCornerRadius: span / turnSum };
}

function layoutPose(g: LayoutGeometry, s: number): Pose {
  let i = g.segs.length - 1;
  while (i > 0 && g.segs[i].s0 > s) i--;
  const seg = g.segs[i];
  return advance(seg.pose, seg.k, s - seg.s0);
}

/** 標高の折れ線から、区間 [a, b) の中の勾配の切れ目と勾配を返す */
function gradeBreaks(elevation: [number, number][], a: number, b: number): { s: number; grade: number }[] {
  const out: { s: number; grade: number }[] = [];
  for (let i = 0; i < elevation.length - 1; i++) {
    const [s1, z1] = elevation[i];
    const [s2, z2] = elevation[i + 1];
    if (s2 <= a || s1 >= b || s2 === s1) continue;
    out.push({ s: Math.max(a, s1), grade: (z2 - z1) / (s2 - s1) });
  }
  if (out.length === 0) out.push({ s: a, grade: 0 });
  return out;
}

class PathBuilder {
  pieces: PathPiece[] = [];
  d = 0;
  constructor(private direction: Direction) {}

  push(length: number, k: number, grade: number, pose: Pose) {
    if (length <= 1e-9) return;
    const kIn = this.direction === 'left' ? k : -k;
    this.pieces.push({ d0: this.d, length, k, kIn, grade, x: pose.x, y: pose.y, h: pose.h });
    this.d += length;
  }

  /** 周回の [from, to) を走る */
  run(g: LayoutGeometry, from: number, to: number) {
    for (const seg of g.segs) {
      const a = Math.max(from, seg.s0);
      const b = Math.min(to, seg.s0 + seg.length);
      if (b <= a) continue;
      const breaks = gradeBreaks(g.data.elevation, a, b);
      breaks.forEach((br, j) => {
        const end = j + 1 < breaks.length ? breaks[j + 1].s : b;
        this.push(end - br.s, seg.k, br.grade, advance(seg.pose, seg.k, br.s - seg.s0));
      });
    }
  }
}

const geometryCache = new Map<LayoutData, LayoutGeometry>();
function geometryOf(data: LayoutData): LayoutGeometry {
  let g = geometryCache.get(data);
  if (!g) {
    g = layoutGeometry(data);
    geometryCache.set(data, g);
  }
  return g;
}

/**
 * 競馬場を指定しないときの標準の楕円（平坦）。直線450m・半径150m、ゴールは直線の入口から380m。
 * 参考値との比較（reference.test.ts）はこのコースで行う
 */
export function standardLayout(direction: Direction): LayoutData {
  const turn = direction === 'left' ? 180 : -180;
  const arc = Math.PI * 150;
  return {
    surface: 'turf',
    length: 900 + 2 * arc,
    start: { x: 0, y: 0, headingDeg: direction === 'left' ? 0 : 180 },
    segments: [
      [70, 0],
      [arc, turn],
      [450, 0],
      [arc, turn],
      [380, 0],
    ],
    elevation: [],
  };
}
const STANDARD: Record<Direction, LayoutData> = { left: standardLayout('left'), right: standardLayout('right') };

export type Layout = 'inner' | 'outer' | 'single';

/** 芝で内回り・外回りの両方から発走できる距離は、主な重賞に合わせる */
const PREFERRED_TURF_LAYOUT: Partial<Record<Venue, Record<number, Layout>>> = {
  京都: { 1400: 'outer', 1600: 'outer', 2000: 'inner' },
  阪神: { 1400: 'inner' },
};

function layoutName(surface: Surface, layout: Layout): string {
  if (surface === 'dirt') return 'dirt';
  if (layout === 'single') return 'turf';
  return `turf_${layout}`;
}

function layoutOfName(name: string): Layout {
  if (name === 'turf_inner') return 'inner';
  if (name === 'turf_outer') return 'outer';
  return 'single';
}

/** その場・距離の発走地点（資料にあるもの）。両回りにあるときは主な重賞に合わせて選ぶ */
export function findStart(venue: Venue, surface: Surface, distance: number): StartData | undefined {
  const candidates = TRACK_DATA[venue].starts.filter((s) => s.surface === surface && s.distance === distance);
  const preferred = surface === 'turf' ? PREFERRED_TURF_LAYOUT[venue]?.[distance] : undefined;
  if (preferred) {
    const name = layoutName(surface, preferred);
    const hit = candidates.find((s) => s.layout === name);
    if (hit) return hit;
  }
  return candidates[0];
}

/** 距離ごとに使う周回（内回り・外回り）。資料に発走地点がなければ直線の長い外回り */
export function layoutFor(venue: Venue, surface: Surface, distance: number): Layout {
  const start = findStart(venue, surface, distance);
  if (start) return layoutOfName(start.layout);
  if (surface === 'dirt' || TRACK_DATA[venue].layouts.turf) return 'single';
  return 'outer';
}

export const LAYOUT_LABEL: Record<Layout, string> = { inner: '内回り', outer: '外回り', single: '' };

/** ゴールから距離ぶん戻った地点から発走する（周回の上だけを走る） */
function loopStart(layoutLength: number, distance: number) {
  const laps = Math.floor((distance - 1e-6) / layoutLength);
  return { firstS: layoutLength - (distance - laps * layoutLength), laps };
}

function buildPath(
  direction: Direction,
  distance: number,
  final: LayoutGeometry,
  first: LayoutGeometry,
  firstS: number,
  laps: number,
  chute: { back: number } | null,
): Omit<RacePath, 'layout' | 'firstLayout' | 'chute' | 'estimatedStart'> {
  const b = new PathBuilder(direction);
  if (chute) {
    // 引き込み線：合流点の向きのまま、後ろへ伸ばした直線（勾配は資料にないので平坦）
    const join = layoutPose(first, firstS);
    const pose = { x: join.x - chute.back * Math.cos(join.h), y: join.y - chute.back * Math.sin(join.h), h: join.h };
    b.push(chute.back, 0, 0, pose);
  }
  b.run(first, firstS, first.data.length);
  for (let i = 0; i < laps; i++) b.run(final, 0, final.data.length);
  b.run(final, 0, RUNOUT);
  const finalCornerStart = distance - final.homeStretch - final.finalCornerLength;
  return {
    distance,
    direction,
    pieces: b.pieces,
    end: b.d,
    homeStretch: final.homeStretch,
    finalCornerRadius: final.finalCornerRadius,
    finalCornerStart,
    fourthCornerStart: finalCornerStart + final.finalCornerLength / 2,
  };
}

const pathCache = new Map<string, RacePath>();

/** レースの道筋。競馬場の指定がなければ標準の楕円 */
export function racePath(course: Pick<Course, 'venue' | 'surface' | 'distance' | 'direction'>): RacePath {
  const key = `${course.venue ?? '-'}-${course.surface}-${course.distance}-${course.direction}`;
  const cached = pathCache.get(key);
  if (cached) return cached;
  let path: RacePath;
  if (!course.venue) {
    const g = geometryOf(STANDARD[course.direction]);
    const { firstS, laps } = loopStart(g.data.length, course.distance);
    path = {
      ...buildPath(course.direction, course.distance, g, g, firstS, laps, null),
      layout: 'standard',
      firstLayout: 'standard',
      chute: null,
      estimatedStart: false,
    };
  } else {
    const venue = TRACK_DATA[course.venue];
    const start = findStart(course.venue, course.surface, course.distance);
    if (start) {
      const final = geometryOf(venue.layouts[start.layout]);
      const first = geometryOf(venue.layouts[start.firstLayout]);
      const chute = start.chute ? { back: start.chuteBack ?? 0 } : null;
      path = {
        ...buildPath(venue.direction, course.distance, final, first, start.firstS, start.laps, chute),
        layout: start.layout,
        firstLayout: start.firstLayout,
        chute: start.chute ?? null,
        estimatedStart: false,
      };
    } else {
      // TODO: 資料に発走地点がない距離（東京芝1200m・ダート2000m、中山芝2400m・ダート1600m/2000m など）。
      // 実在しない距離なので、ゴールから距離ぶん戻った周回上の地点を仮の発走地点にしている
      const name = layoutName(course.surface, layoutFor(course.venue, course.surface, course.distance));
      const g = geometryOf(venue.layouts[name]);
      const { firstS, laps } = loopStart(g.data.length, course.distance);
      path = {
        ...buildPath(venue.direction, course.distance, g, g, firstS, laps, null),
        layout: name,
        firstLayout: name,
        chute: null,
        estimatedStart: true,
      };
    }
  }
  pathCache.set(key, path);
  return path;
}

/** 距離 d を含む区間の番号。hint から前後に探す */
export function pieceIndex(path: RacePath, d: number, hint = 0): number {
  const p = path.pieces;
  let i = Math.min(Math.max(hint, 0), p.length - 1);
  while (i < p.length - 1 && d >= p[i + 1].d0) i++;
  while (i > 0 && d < p[i].d0) i--;
  return i;
}

/** 道筋上の位置と向き（数学の向きの座標）。範囲外は端の直線を延ばす */
export function pathPose(path: RacePath, d: number): Pose {
  const i = pieceIndex(path, d, binarySearch(path, d));
  const piece = path.pieces[i];
  const l = d - piece.d0;
  if (l < 0 || l > piece.length) return advance(piece, 0, l);
  return advance(piece, piece.k, l);
}

function binarySearch(path: RacePath, d: number): number {
  const p = path.pieces;
  let lo = 0;
  let hi = p.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p[mid].d0 <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 位置から内ラチの外側へ lateral m ずらした点（画面の座標：y は下向き） */
export function offsetPoint(pose: Pose, lateral: number, direction: Direction): { x: number; y: number; heading: number } {
  // 外側の向き：左回りは進行方向の右、右回りは左
  const sx = direction === 'left' ? Math.sin(pose.h) : -Math.sin(pose.h);
  const sy = direction === 'left' ? -Math.cos(pose.h) : Math.cos(pose.h);
  return { x: pose.x + lateral * sx, y: -(pose.y + lateral * sy), heading: -pose.h };
}

/** 道筋上の位置 d・横位置 lateral の画面座標 */
export function pathPoint(path: RacePath, d: number, lateral: number) {
  return offsetPoint(pathPose(path, d), lateral, path.direction);
}

export interface CourseOutline {
  surface: Surface;
  /** このレースで走る周回・引き込み線か */
  active: boolean;
  closed: boolean;
  /** 内ラチ沿いの位置（数学の向き） */
  poses: Pose[];
}

/** コースの絵：その場の全周回（芝・ダート）と、このレースで使う引き込み線 */
export function courseOutlines(course: Pick<Course, 'venue' | 'surface' | 'distance' | 'direction'>, step = 4): CourseOutline[] {
  const path = racePath(course);
  const sample = (g: LayoutGeometry) => {
    const poses: Pose[] = [];
    for (let s = 0; s < g.data.length; s += step) poses.push(layoutPose(g, s));
    return poses;
  };
  if (!course.venue) {
    return [{ surface: course.surface, active: true, closed: true, poses: sample(geometryOf(STANDARD[course.direction])) }];
  }
  const venue = TRACK_DATA[course.venue];
  const out: CourseOutline[] = Object.entries(venue.layouts).map(([name, data]) => ({
    surface: data.surface,
    active: name === path.layout || name === path.firstLayout,
    closed: true,
    poses: sample(geometryOf(data)),
  }));
  if (path.chute) {
    const first = path.pieces[0];
    out.push({
      surface: course.surface,
      active: true,
      closed: false,
      poses: [first, advance(first, 0, first.length)],
    });
  }
  return out;
}

export { TRACK_DATA };
