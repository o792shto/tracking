import { describe, expect, it } from 'vitest';
import { simulateRace } from './engine';
import { GRADED_RACES_2026 } from './gradedRaces';
import { createRace } from './horse';
import { dayCondition, mainRaceOf, nearestStandardDistance, venueDayProgram, VENUE_DIRECTION } from './program';
import { Rng } from './rng';
import { RACE_WEEKS } from './world/calendar';
import { findStart, racePath } from './racePath';
import { lapMarks } from './result';

const byName = (name: string) => mainRaceOf(GRADED_RACES_2026.find((g) => g.name === name)!);

/** 1年分の開催日（競馬場ごと）と、その日の番組 */
const yearDays = () => RACE_WEEKS.flatMap((w) => w.days.map((day, i) => ({ day, races: venueDayProgram(day, new Rng(w.index * 10 + i)) })));

describe('重賞の置き換え', () => {
  it('98レースの重賞を97日に組む（目黒記念はダービーデーの12R）', () => {
    expect(GRADED_RACES_2026).toHaveLength(98);
    const days = yearDays();
    expect(days).toHaveLength(97);
    const derby = days.find((d) => d.races[10].name === '日本ダービー')!;
    expect(derby.races[11]).toMatchObject({ no: 12, name: '目黒記念', raceClass: 'G2', distance: 2500 });
    expect(derby.races.filter((r) => r.fillies && r.no >= 11)).toHaveLength(0);
    for (const d of days) expect(d.races.some((r) => r.name === '目黒記念' && r.no === 11)).toBe(false);
    expect(new Set(days.map((d) => `${d.day.month}/${d.day.day} ${d.day.venue}`)).size).toBe(97);
  });

  it('重賞はすべて本来の格・レース名・距離のまま（オープンへの置き換えはしない）', () => {
    for (const g of GRADED_RACES_2026) {
      expect(mainRaceOf(g)).toMatchObject({ raceClass: g.grade, name: g.name, surface: g.surface, distance: g.distance });
      // どの重賞も、その競馬場に発走地点がある
      expect(findStart(g.venue, g.surface, g.distance), `${g.name}`).toBeDefined();
    }
    expect(byName('サウジアラビアRC')).toMatchObject({ raceClass: 'G3', name: 'サウジアラビアRC' });
    expect(byName('きさらぎ賞')).toMatchObject({ raceClass: 'G3', distance: 1800 });
    expect(byName('ダイヤモンドS')).toMatchObject({ raceClass: 'G3', distance: 3400 });
  });

  it('標準距離への寄せ方', () => {
    expect(nearestStandardDistance('turf', 1400)).toBe(1600);
    expect(nearestStandardDistance('turf', 1800)).toBe(2000);
    expect(nearestStandardDistance('turf', 2200)).toBe(2400);
    expect(nearestStandardDistance('dirt', 1400)).toBe(1600);
    expect(nearestStandardDistance('dirt', 1900)).toBe(2000);
    expect(nearestStandardDistance('dirt', 2400)).toBe(2000);
    // その場で実在する距離から選ぶ
    expect(nearestStandardDistance('dirt', 1400, '東京')).toBe(1600);
    expect(nearestStandardDistance('dirt', 1800, '中山')).toBe(1800);
    expect(nearestStandardDistance('dirt', 1800, '東京')).toBe(1600);
    expect(nearestStandardDistance('dirt', 1900, '阪神')).toBe(2000);
    expect(nearestStandardDistance('turf', 1400, '東京')).toBe(1600);
    expect(nearestStandardDistance('turf', 2200, '中山')).toBe(2000);
  });
});

describe('1日の番組', () => {
  it('1日12Rで、11Rがその日の重賞', () => {
    for (const { day, races } of yearDays()) {
      expect(races).toHaveLength(12);
      expect(races[10]).toMatchObject(mainRaceOf(day.main));
    }
  });

  it('同じ日の芝・ダートの馬場状態は天気から決まり、道悪は1〜4割程度', () => {
    let wet = 0;
    for (let i = 0; i < 400; i++) if (dayCondition(new Rng(i)).turf !== 'good') wet++;
    expect(wet / 400).toBeGreaterThan(0.25);
    expect(wet / 400).toBeLessThan(0.55);
  });

  it('牝馬限定の条件戦は1日1レース（重賞の牝馬限定は別）', () => {
    for (const { races } of yearDays()) {
      expect(races.filter((r) => r.no !== 11 && r.raceClass !== 'G2' && r.fillies)).toHaveLength(1);
    }
  });

  it('回りは東京が左、ほかは右', () => {
    expect(VENUE_DIRECTION.東京).toBe('left');
    expect(VENUE_DIRECTION.中山).toBe('right');
  });
});

describe('標準以外の距離のレース', () => {
  it('200で割り切れない距離は最初の区間が短い', () => {
    expect(lapMarks(2500).slice(0, 3)).toEqual([100, 300, 500]);
    expect(lapMarks(2500).at(-1)).toBe(2500);
    expect(lapMarks(1800)).toHaveLength(9);
  });

  it.each([1800, 2200, 2500, 3200, 3600])('%im も走れて、ラップの合計が勝ち時計になる', (distance) => {
    const r = simulateRace(createRace(distance, { course: { surface: 'turf', distance }, runners: 14 }));
    expect(r.laps).toHaveLength(lapMarks(distance).length);
    expect(r.laps.reduce((a, b) => a + b, 0)).toBeCloseTo(r.finish[0].time, 1);
    expect(r.first3f).toBeGreaterThan(33);
    expect(r.first3f).toBeLessThan(40);
  });
});

describe('実在しない距離', () => {
  it('1年分の番組に、その場で実在しない距離（発走地点が資料にない距離）のレースはない', () => {
    for (const { day, races } of yearDays()) {
      for (const race of races) {
        const course = { venue: day.venue, surface: race.surface, distance: race.distance, direction: VENUE_DIRECTION[day.venue], condition: 'good' as const };
        expect(racePath(course).estimatedStart, `${day.month}/${day.day} ${race.no}R ${day.venue}${race.surface}${race.distance}`).toBe(false);
      }
    }
  });
});
