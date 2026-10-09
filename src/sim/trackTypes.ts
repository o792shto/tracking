import type { Venue } from './gradedRaces';
import type { Direction, Surface } from './types';

/** 区間：[長さ(m), 旋回角(度)]。旋回角は左旋回が正、直線は0 */
export type SegmentData = [number, number];

export interface LayoutData {
  surface: Surface;
  /** 1周（m） */
  length: number;
  /** ゴール地点の位置と向き。座標はゴール板が原点、y+ が内馬場側 */
  start: { x: number; y: number; headingDeg: number };
  /** ゴールから走行方向に並べた区間 */
  segments: SegmentData[];
  /** 標高の折れ線 [s, z]（推定） */
  elevation: [number, number][];
}

export interface ChuteData {
  layout: string;
  joinXY: [number, number];
  /** 合流点での走行方向（度） */
  headingDeg: number;
  length: number;
  usedBy: string[];
}

export interface StartData {
  surface: Surface;
  distance: number;
  /** 最後に回る周回（レースの layout） */
  layout: string;
  /** 発走して最初に走る周回（中山2500mなどは外回りから入って内回りを回る） */
  firstLayout: string;
  /** 最初の周回に入る地点の s（ゴールから走行方向への距離） */
  firstS: number;
  /** 引き込み線から発走するとき、その線の名前と合流点までの長さ */
  chute?: string;
  chuteBack?: number;
  /** ゴールを過ぎてから回る周回の数 */
  laps: number;
}

export interface VenueTrackData {
  direction: Direction;
  layouts: Record<string, LayoutData>;
  chutes: Record<string, ChuteData>;
  starts: StartData[];
}

export type TrackData = Record<Venue, VenueTrackData>;
