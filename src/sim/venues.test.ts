import { describe, expect, it } from 'vitest';
import { gradeAt, lapLength, lapPosition } from './course';
import { simulateRace } from './engine';
import { createRace } from './horse';
import { COURSES, layoutFor, trackFor, trackFromSpec } from './venues';
import { STYLES, type RunningStyle } from './types';

describe('コースデータ', () => {
  it('どのコースも1周距離が資料どおりで、ゴールは直線上、坂は1周で高さが元に戻る', () => {
    for (const [venue, bySurface] of Object.entries(COURSES)) {
      for (const [surface, byLayout] of Object.entries(bySurface)) {
        for (const [layout, spec] of Object.entries(byLayout)) {
          const t = trackFromSpec(spec!);
          const key = `${venue}-${surface}-${layout}`;
          expect(lapLength(t), key).toBeCloseTo(spec!.lap, 6);
          expect(t.finishOffset, key).toBeLessThan(t.straight);
          expect(t.radius, key).toBeGreaterThan(80);
          const rise = spec!.slopes.reduce((a, s) => a + s.rise, 0);
          expect(rise, key).toBeCloseTo(0, 6);
          expect(Math.max(...spec!.slopes.map((s) => Math.abs(s.rise)))).toBeLessThanOrEqual(spec!.elevation);
        }
      }
    }
  });

  it('距離ごとの内回り・外回り', () => {
    expect(layoutFor('中山', 'turf', 2500)).toBe('inner');
    expect(layoutFor('中山', 'turf', 1600)).toBe('outer');
    expect(layoutFor('京都', 'turf', 3200)).toBe('outer');
    expect(layoutFor('阪神', 'turf', 2200)).toBe('inner');
    expect(layoutFor('東京', 'turf', 2400)).toBe('single');
    expect(layoutFor('阪神', 'dirt', 1800)).toBe('single');
  });

  it('中山のゴール前は上り坂', () => {
    const { track } = trackFor('中山', 'turf', 2000);
    const s = lapPosition(track, 2000, 2000 - 120);
    expect(gradeAt(track, s)).toBeGreaterThan(0.01);
  });
});

describe('競馬場による脚質の有利不利', () => {
  const ratios = (venue: '東京' | '中山') => {
    const wins: Record<string, number> = {};
    const expected: Record<string, number> = {};
    for (const distance of [1600, 2000]) {
      for (let s = 0; s < 120; s++) {
        const setup = createRace(40000 + s, { course: { surface: 'turf', distance, condition: 'good', venue }, runners: 14 });
        const r = simulateRace(setup, { record: false });
        const st = setup.entries[r.finish[0].number - 1].horse.style;
        wins[st] = (wins[st] ?? 0) + 1;
        for (const e of setup.entries) expected[e.horse.style] = (expected[e.horse.style] ?? 0) + 1 / 14;
      }
    }
    return Object.fromEntries(STYLES.map((k) => [k, (wins[k] ?? 0) / expected[k]])) as Record<RunningStyle, number>;
  };

  it('直線の長い東京は差し・追込、短い中山は逃げ・先行が有利', () => {
    const tokyo = ratios('東京');
    const nakayama = ratios('中山');
    console.log('東京', tokyo, '中山', nakayama);
    expect(tokyo.oikomi + tokyo.sashi).toBeGreaterThan(nakayama.oikomi + nakayama.sashi);
    expect(nakayama.nige + nakayama.senko).toBeGreaterThan(tokyo.nige + tokyo.senko);
  }, 60_000);
});
