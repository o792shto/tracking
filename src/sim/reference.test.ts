import { beforeAll, describe, expect, it } from 'vitest';
import {
  REFERENCE_DIRT_HEAVY,
  REFERENCE_FIRST_LAP,
  REFERENCE_GOOD,
  REFERENCE_TURF_HEAVY,
} from './reference';
import { runCourseBatch, type CourseStats } from './stats';
import { DISTANCES_BY_SURFACE, type RaceDistance, type Surface } from './types';

/**
 * JRAのラップタイム参考値（docs/reference/jra-lap-reference.md）との比較。
 * 参考値はおおよその目安なので、外れ値を見つけるための許容幅を付けて比べる。
 * 参考値のない条件（ダート1600m・2000m の良馬場の絶対値）は、極端な値でないかだけを見る。
 */
const RACES = 60;
/** 参考値の範囲に足す許容幅 */
const TOL_TIME = 0.5;
const TOL_LAP = 0.15;
const TOL_3F = 0.3;

type Key = `${Surface}-${RaceDistance}`;
const good = new Map<Key, CourseStats>();
const heavy = new Map<Key, CourseStats>();
const courses = (['turf', 'dirt'] as const).flatMap((surface) =>
  DISTANCES_BY_SURFACE[surface].map((distance) => ({ surface, distance, key: `${surface}-${distance}` as Key })),
);

beforeAll(() => {
  const rows: string[] = ['| 条件 | 勝ち時計 | 平均ラップ | 上がり3F | 1F目 | 最速/最遅 | 2F目最速 | ラスト2F目最速 | 最終F最遅 |'];
  for (const { surface, distance, key } of courses) {
    const g = runCourseBatch(surface, distance, ['good'], RACES, 5000);
    // 道悪＝重・不良。同じシード系列で良と比べる
    const h = runCourseBatch(surface, distance, ['soft', 'heavy'], RACES, 5000);
    good.set(key, g);
    heavy.set(key, h);
    for (const [label, s] of [['良', g], ['道悪', h]] as const) {
      const pct = (x: number) => `${Math.round(x * 100)}%`;
      rows.push(
        `| ${key} ${label} | ${s.winTime.toFixed(1)} | ${s.avgLap.toFixed(2)} | ${s.last3f.toFixed(1)} | ${s.firstLap.toFixed(2)} | ${s.fastestLap.toFixed(1)}/${s.slowestLap.toFixed(1)} | ${pct(s.secondLapFastest)} | ${pct(s.penultimateFastest)} | ${pct(s.lastLapSlowest)} |`,
      );
    }
  }
  console.log(rows.join('\n'));
}, 120_000);

describe('良馬場：参考値との比較', () => {
  it.each(courses)('$key', ({ surface, distance, key }) => {
    const s = good.get(key)!;
    const ref = REFERENCE_GOOD[surface][distance];
    if (!ref) {
      // 参考値なし：極端な外れ値だけを見る
      expect(s.avgLap).toBeGreaterThan(11.0);
      expect(s.avgLap).toBeLessThan(13.5);
      return;
    }
    expect(s.winTime).toBeGreaterThan(ref.winTime[0] - TOL_TIME);
    expect(s.winTime).toBeLessThan(ref.winTime[1] + TOL_TIME);
    expect(Math.abs(s.avgLap - ref.avgLap)).toBeLessThan(TOL_LAP);
    expect(s.last3f).toBeGreaterThan(ref.last3f[0] - TOL_3F);
    expect(s.last3f).toBeLessThan(ref.last3f[1] + TOL_3F);
    expect(s.fastestLap).toBeGreaterThan(ref.lapRange[0] - TOL_LAP);
    expect(s.slowestLap).toBeLessThan(ref.lapRange[1] + 0.5);
  });
});

describe('道悪（重・不良）', () => {
  it.each(courses.filter((c) => c.surface === 'turf'))('$key：芝は良より遅く、上がりがかかる', ({ key }) => {
    const g = good.get(key)!;
    const h = heavy.get(key)!;
    expect(h.winTime - g.winTime).toBeGreaterThan(REFERENCE_TURF_HEAVY.timeDelta[0]);
    expect(h.avgLap - g.avgLap).toBeGreaterThan(REFERENCE_TURF_HEAVY.avgLapDelta[0] - 0.1);
    expect(h.avgLap - g.avgLap).toBeLessThan(REFERENCE_TURF_HEAVY.avgLapDelta[1] + 0.1);
    expect(h.last3f).toBeGreaterThan(REFERENCE_TURF_HEAVY.last3f[0] - TOL_3F);
    expect(h.last3f).toBeLessThan(REFERENCE_TURF_HEAVY.last3f[1] + TOL_3F);
  });

  it.each(courses.filter((c) => c.surface === 'dirt'))('$key：ダートは良より速くなる', ({ key }) => {
    const g = good.get(key)!;
    const h = heavy.get(key)!;
    expect(h.winTime - g.winTime).toBeGreaterThan(REFERENCE_DIRT_HEAVY.timeDelta[0] - 0.3);
    expect(h.winTime - g.winTime).toBeLessThan(REFERENCE_DIRT_HEAVY.timeDelta[1] + 0.3);
    expect(h.last3f - g.last3f).toBeGreaterThan(REFERENCE_DIRT_HEAVY.last3fDelta[0] - 0.3);
    expect(h.last3f - g.last3f).toBeLessThan(REFERENCE_DIRT_HEAVY.last3fDelta[1] + 0.3);
  });
});

describe('ラップ形状の傾向', () => {
  it.each(courses)('$key：1F目はほぼ12秒台', ({ key }) => {
    const s = good.get(key)!;
    expect(s.firstLap).toBeGreaterThan(REFERENCE_FIRST_LAP[0] - 0.1);
    expect(s.firstLap).toBeLessThan(REFERENCE_FIRST_LAP[1] + 0.1);
    expect(s.fastestLap).toBeLessThan(s.firstLap);
  });

  it('短距離（1200m）は2F目が最速ラップになりやすい', () => {
    expect(good.get('turf-1200')!.secondLapFastest).toBeGreaterThan(0.5);
    expect(good.get('dirt-1200')!.secondLapFastest).toBeGreaterThan(0.5);
  });

  it('芝の中長距離はラスト2F目が最速ラップになりやすい', () => {
    for (const key of ['turf-1600', 'turf-2000', 'turf-2400'] as const) {
      expect(good.get(key)!.penultimateFastest, key).toBeGreaterThan(0.3);
    }
  });

  it('ダートは最遅ラップがゴール前1Fになりがち（短い距離ほど顕著）', () => {
    expect(good.get('dirt-1200')!.lastLapSlowest).toBeGreaterThan(0.5);
    expect(good.get('dirt-1600')!.lastLapSlowest).toBeGreaterThan(0.5);
  });
});
