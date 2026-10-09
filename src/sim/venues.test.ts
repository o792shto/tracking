import { describe, expect, it } from 'vitest';
import { simulateRace } from './engine';
import { createRace } from './horse';
import { createMeeting } from './meeting';
import { findStart, layoutFor, pathPose, racePath, TRACK_DATA } from './racePath';
import { OFFICIAL_COURSES } from './venues';
import { STYLES, type RunningStyle } from './types';
import type { Venue } from './gradedRaces';

const VENUES = Object.keys(TRACK_DATA) as Venue[];

describe('コースの形のデータ', () => {
  it('1周距離・直線距離・高低差が公式値どおり', () => {
    for (const venue of VENUES) {
      for (const [name, official] of Object.entries(OFFICIAL_COURSES[venue])) {
        const layout = TRACK_DATA[venue].layouts[name];
        const key = `${venue} ${name}`;
        expect(layout, key).toBeDefined();
        const sum = layout.segments.reduce((a, [l]) => a + l, 0);
        expect(Math.abs(sum - official.lap), key).toBeLessThan(0.5);
        const zs = layout.elevation.map(([, z]) => z);
        expect(Math.max(...zs) - Math.min(...zs), key).toBeCloseTo(official.elevation, 1);
        // 最後の直線（最後のカーブの出口〜ゴール）
        const surface = layout.surface;
        const distance = findStartFor(venue, name)?.distance;
        if (distance) {
          const path = racePath({ venue, surface, distance, direction: TRACK_DATA[venue].direction });
          expect(Math.abs(path.homeStretch - official.homeStraight), key).toBeLessThan(0.5);
        }
      }
    }
  });

  it('資料のどの発走地点からも、ゴールまでの道のりがレースの距離に一致し、ゴールはゴール板の位置', () => {
    for (const venue of VENUES) {
      const { direction, layouts } = TRACK_DATA[venue];
      for (const s of TRACK_DATA[venue].starts) {
        const key = `${venue} ${s.surface}${s.distance} ${s.layout}`;
        const L1 = layouts[s.firstLayout].length;
        const L = layouts[s.layout].length;
        const total = (s.chuteBack ?? 0) + (L1 - s.firstS) + s.laps * L;
        expect(Math.abs(total - s.distance), key).toBeLessThan(0.5);
        if (findStart(venue, s.surface, s.distance) !== s) continue;
        const path = racePath({ venue, surface: s.surface, distance: s.distance, direction });
        const goal = pathPose(path, s.distance);
        const g0 = layouts[s.layout].start;
        expect(Math.hypot(goal.x - g0.x, goal.y - g0.y), key).toBeLessThan(0.5);
      }
    }
  });

  it('道筋は途切れない', () => {
    for (const venue of VENUES) {
      const { direction } = TRACK_DATA[venue];
      for (const s of TRACK_DATA[venue].starts) {
        const path = racePath({ venue, surface: s.surface, distance: s.distance, direction });
        for (let i = 1; i < path.pieces.length; i++) {
          const prev = path.pieces[i - 1];
          const end = pathPose(path, prev.d0 + prev.length - 1e-6);
          const next = path.pieces[i];
          expect(Math.hypot(end.x - next.x, end.y - next.y), `${venue} ${s.distance} #${i}`).toBeLessThan(0.6);
        }
      }
    }
  });

  it('距離ごとの内回り・外回り', () => {
    expect(layoutFor('中山', 'turf', 2500)).toBe('inner');
    expect(layoutFor('中山', 'turf', 1600)).toBe('outer');
    expect(layoutFor('京都', 'turf', 3200)).toBe('outer');
    expect(layoutFor('京都', 'turf', 2000)).toBe('inner');
    expect(layoutFor('阪神', 'turf', 2200)).toBe('inner');
    expect(layoutFor('東京', 'turf', 2400)).toBe('single');
    expect(layoutFor('阪神', 'dirt', 1800)).toBe('single');
  });

  it('中山のゴール前は上り坂、京都の直線は平坦', () => {
    const nakayama = racePath({ venue: '中山', surface: 'turf', distance: 2000, direction: 'right' });
    const kyoto = racePath({ venue: '京都', surface: 'turf', distance: 2400, direction: 'right' });
    const gradeAt = (path: typeof nakayama, d: number) => path.pieces.filter((p) => p.d0 <= d).at(-1)!.grade;
    expect(gradeAt(nakayama, 2000 - 120)).toBeGreaterThan(0.01);
    expect(gradeAt(kyoto, 2400 - 200)).toBe(0);
  });

  it('1年分の番組のどのレースにも道筋がある（資料にない距離は仮の発走地点）', () => {
    const estimated = new Set<string>();
    for (let serial = 1; serial <= 98; serial++) {
      for (const race of createMeeting(serial).races) {
        const path = racePath(race.setup.course);
        expect(path.pieces.length).toBeGreaterThan(0);
        if (path.estimatedStart) estimated.add(`${race.setup.course.venue}${race.setup.course.surface}${race.setup.course.distance}`);
      }
    }
    console.log('仮の発走地点:', [...estimated].sort().join(' '));
  });
});

function findStartFor(venue: Venue, layout: string) {
  return TRACK_DATA[venue].starts.find((s) => s.layout === layout && s.firstLayout === layout && findStart(venue, s.surface, s.distance) === s);
}

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
