import { describe, expect, it } from 'vitest';
import { TRACK, curveLength, isCurve, lapLength, lapPosition, segmentAt, trackPoint } from './course';
import { DISTANCES } from './types';

describe('course', () => {
  it('どの距離でもゴールは周回座標の finishOffset（ホームストレッチ上）', () => {
    for (const D of DISTANCES) {
      expect(lapPosition(TRACK, D, D)).toBeCloseTo(TRACK.finishOffset);
      expect(segmentAt(TRACK, lapPosition(TRACK, D, D))).toBe('homeStraight');
    }
  });

  it('周回座標は 0 以上 1周未満', () => {
    const lap = lapLength(TRACK);
    for (const D of DISTANCES) {
      for (let d = 0; d <= D; d += 50) {
        const s = lapPosition(TRACK, D, d);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(lap);
      }
    }
  });

  it('カーブ判定', () => {
    expect(isCurve(TRACK, 10)).toBe(false);
    expect(isCurve(TRACK, TRACK.straight + 10)).toBe(true);
    expect(isCurve(TRACK, 2 * TRACK.straight + curveLength(TRACK) + 10)).toBe(true);
  });

  it('平面座標は周回に沿って途切れない', () => {
    const lap = lapLength(TRACK);
    for (const dir of ['left', 'right'] as const) {
      let prev = trackPoint(TRACK, dir, 0, 0);
      for (let s = 1; s <= lap; s += 1) {
        const p = trackPoint(TRACK, dir, s % lap, 0);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(1.01);
        prev = p;
      }
    }
  });

  it('左回りと右回りは左右反転', () => {
    const l = trackPoint(TRACK, 'left', 600, 3);
    const r = trackPoint(TRACK, 'right', 600, 3);
    expect(r.x).toBeCloseTo(-l.x);
    expect(r.y).toBeCloseTo(l.y);
  });
});
