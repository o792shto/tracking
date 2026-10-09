import type { Course } from './types';

/**
 * 楕円トラック（直線2本＋半円カーブ2本）。
 * 周回座標 s は内ラチ沿いの距離で、s = 0 がホームストレッチの入口。
 *   [0, S)            ホームストレッチ
 *   [S, S+C)          1〜2コーナー
 *   [S+C, 2S+C)       バックストレッチ
 *   [2S+C, 2S+2C)     3〜4コーナー
 */
export interface TrackGeometry {
  /** 直線の長さ（m） */
  straight: number;
  /** カーブ半径（内ラチ、m） */
  radius: number;
  /** ホームストレッチ入口からゴール線までの距離（m） */
  finishOffset: number;
  /** 追い出しを始める直線の長さ（ゴールまで、m）。省略時は finishOffset */
  homeStretch?: number;
  /** 坂：周回座標 start から length m の区間の勾配（高さ/距離）。なければ平坦 */
  grades?: { start: number; length: number; grade: number }[];
}

/** 競馬場を指定しないときの標準の楕円（平坦）。参考値との比較はこのコースで行う */
export const TRACK: TrackGeometry = {
  straight: 450,
  radius: 150,
  finishOffset: 380,
};

/** 周回座標 s での勾配（上りが正） */
export function gradeAt(g: TrackGeometry, s: number): number {
  if (!g.grades) return 0;
  const lap = lapLength(g);
  for (const seg of g.grades) {
    let rel = s - seg.start;
    if (rel < 0) rel += lap;
    if (rel < seg.length) return seg.grade;
  }
  return 0;
}

export function curveLength(g: TrackGeometry): number {
  return Math.PI * g.radius;
}

export function lapLength(g: TrackGeometry): number {
  return 2 * g.straight + 2 * curveLength(g);
}

/** レース上の距離 d（スタートから）を周回座標 s に変換 */
export function lapPosition(g: TrackGeometry, distance: number, d: number): number {
  const lap = lapLength(g);
  const s = (g.finishOffset - distance + d) % lap;
  return s < 0 ? s + lap : s;
}

export type SegmentKind = 'homeStraight' | 'corner12' | 'backStraight' | 'corner34';

export function segmentAt(g: TrackGeometry, s: number): SegmentKind {
  const c = curveLength(g);
  if (s < g.straight) return 'homeStraight';
  if (s < g.straight + c) return 'corner12';
  if (s < 2 * g.straight + c) return 'backStraight';
  return 'corner34';
}

export function isCurve(g: TrackGeometry, s: number): boolean {
  const seg = segmentAt(g, s);
  return seg === 'corner12' || seg === 'corner34';
}

/** ゴール前の最後のカーブ（3〜4コーナー）の入口から先か */
export function inFinalPhase(g: TrackGeometry, course: Course, d: number): boolean {
  const lastCurveStart = course.distance - g.finishOffset - curveLength(g);
  return d >= lastCurveStart;
}

/** 4コーナー（最後のカーブの後半）以降か */
export function pastFourthCorner(g: TrackGeometry, course: Course, d: number): boolean {
  const fourthCornerStart = course.distance - g.finishOffset - curveLength(g) / 2;
  return d >= fourthCornerStart;
}

/**
 * 周回座標 s と内ラチからの横位置 lateral を平面座標（m）に変換する。
 * 原点はトラック中心。右回りでは時計回り、左回りでは反時計回りに進む。
 * ホームストレッチは y > 0 側（画面下側）。
 */
export function trackPoint(
  g: TrackGeometry,
  direction: Course['direction'],
  s: number,
  lateral: number,
): { x: number; y: number; heading: number } {
  const c = curveLength(g);
  const half = g.straight / 2;
  const r = g.radius + lateral;
  let x: number;
  let y: number;
  let heading: number;
  if (s < g.straight) {
    // ホームストレッチ：左から右へ（左回り基準）
    x = -half + s;
    y = r;
    heading = 0;
  } else if (s < g.straight + c) {
    const a = (s - g.straight) / g.radius; // 0..π
    x = half + r * Math.sin(a);
    y = r * Math.cos(a);
    heading = -a;
  } else if (s < 2 * g.straight + c) {
    x = half - (s - g.straight - c);
    y = -r;
    heading = Math.PI;
  } else {
    const a = (s - 2 * g.straight - c) / g.radius;
    x = -half - r * Math.sin(a);
    y = -r * Math.cos(a);
    heading = Math.PI - a;
  }
  // 上記は y 軸下向きの画面座標で反時計回り（左回り）。右回りは左右反転する。
  if (direction === 'right') {
    x = -x;
    heading = Math.PI - heading;
  }
  return { x, y, heading };
}
