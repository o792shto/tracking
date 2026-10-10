import { describe, expect, it } from 'vitest';
import { simulateRace } from './engine';
import { GRADED_RACES_2026 } from './gradedRaces';
import { createRace } from './horse';
import { createMeeting } from './meeting';
import { horseProfiles } from './profile';
import { DAYS_PER_YEAR, mainRaceOf, nearestStandardDistance, raceDay, raceLevel } from './program';
import { findStart, racePath } from './racePath';
import { lapMarks } from './result';

const byName = (name: string) => mainRaceOf(GRADED_RACES_2026.find((g) => g.name === name)!);

describe('重賞の置き換え', () => {
  it('98レースの重賞を97日に組む（目黒記念はダービーデーの12R）', () => {
    expect(GRADED_RACES_2026).toHaveLength(98);
    expect(DAYS_PER_YEAR).toBe(97);
    let derbyDay = null as ReturnType<typeof raceDay> | null;
    const mains = new Set<string>();
    for (let serial = 1; serial <= DAYS_PER_YEAR; serial++) {
      const day = raceDay(serial);
      mains.add(`${day.month}/${day.day} ${day.venue}`);
      if (day.races[10].name === '日本ダービー') derbyDay = day;
      expect(day.races.some((r) => r.name === '目黒記念' && r.no === 11)).toBe(false);
    }
    expect(derbyDay).not.toBeNull();
    expect(derbyDay!.races[11]).toMatchObject({ no: 12, name: '目黒記念', raceClass: 'G2', distance: 2500 });
    expect(derbyDay!.races.filter((r) => r.fillies && r.no >= 11)).toHaveLength(0);
    expect(mains.size).toBe(97);
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
  it('1日12Rで、11Rがその日の重賞。場は重賞の場', () => {
    const mains = GRADED_RACES_2026.filter((g) => g.raceNo === undefined);
    for (const serial of [1, 30, 70, 97]) {
      const day = raceDay(serial);
      const g = mains[serial - 1];
      expect(day.races).toHaveLength(12);
      expect(day.races[10]).toMatchObject(mainRaceOf(g));
      expect(day.venue).toBe(g.venue);
    }
  });

  it('同じ日の芝・ダートはそれぞれ馬場状態が同じ', () => {
    const m = createMeeting(12);
    for (const surface of ['turf', 'dirt'] as const) {
      const conds = new Set(m.races.filter((r) => r.setup.course.surface === surface).map((r) => r.setup.course.condition));
      expect(conds.size).toBeLessThanOrEqual(1);
    }
  });

  it('牝馬限定の条件戦は1日1レース（重賞の牝馬限定は別）', () => {
    for (const serial of [1, 20, 50, 80]) {
      const undercard = raceDay(serial).races.filter((r) => r.no !== 11);
      expect(undercard.filter((r) => r.fillies)).toHaveLength(1);
    }
  });

  it('97日で1年、98日目は翌年の1日目', () => {
    expect(raceDay(97)).toMatchObject({ year: 2026, dayIndex: 96 });
    expect(raceDay(98)).toMatchObject({ year: 2027, dayIndex: 0, month: 1, day: 4 });
  });

  it('上のクラスほど能力水準が高い', () => {
    const day = raceDay(96); // 12/26 ホープフルS（2歳G1）
    const levels = day.races.map(raceLevel);
    const maiden = day.races.find((r) => r.raceClass === 'maiden')!;
    expect(raceLevel(day.races[10])).toBeGreaterThan(raceLevel(maiden));
    expect(Math.max(...levels)).toBe(raceLevel(day.races[10]));
  });

  it('開催の出走表は同じ開催日なら同じ', () => {
    expect(createMeeting(5).races[3].setup).toEqual(createMeeting(5).races[3].setup);
    expect(createMeeting(1).venue).toBe('中山競馬場');
    expect(createMeeting(1).races[10].setup.course.direction).toBe('right');
    expect(createMeeting(9).races[10].setup.course.direction).toBe('left'); // 根岸S（東京）
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

describe('近走の数', () => {
  it('2歳戦以外は4走、新馬戦は0走、2歳戦は1〜4走', () => {
    for (let serial = 1; serial <= 98; serial += 7) {
      for (const race of createMeeting(serial).races) {
        const counts = horseProfiles(race.setup).map((p) => p.recent.length);
        for (const n of counts) {
          if (race.raceClass === 'newcomer') expect(n).toBe(0);
          else if (race.program.age === '2') expect(n >= 1 && n <= 4).toBe(true);
          else expect(n).toBe(4);
        }
      }
    }
  });
});

describe('実在しない距離', () => {
  it('1年分の番組に、その場で実在しない距離（発走地点が資料にない距離）のレースはない', () => {
    for (let serial = 1; serial <= DAYS_PER_YEAR; serial++) {
      for (const race of createMeeting(serial).races) {
        const { course } = race.setup;
        expect(racePath(course).estimatedStart, `${serial}日目 ${race.no}R ${course.venue}${course.surface}${course.distance}`).toBe(false);
      }
    }
  });
});
