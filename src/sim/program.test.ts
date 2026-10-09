import { describe, expect, it } from 'vitest';
import { simulateRace } from './engine';
import { GRADED_RACES_2026 } from './gradedRaces';
import { createRace } from './horse';
import { createMeeting } from './meeting';
import { DAYS_PER_YEAR, mainRaceOf, nearestStandardDistance, raceDay, raceLevel } from './program';
import { lapMarks } from './result';

const byName = (name: string) => mainRaceOf(GRADED_RACES_2026.find((g) => g.name === name)!);

describe('重賞の置き換え', () => {
  it('98レースが年間の開催日になる', () => {
    expect(GRADED_RACES_2026).toHaveLength(98);
    expect(DAYS_PER_YEAR).toBe(98);
  });

  it('2歳戦は G1 以外をオープンにする', () => {
    expect(byName('サウジアラビアRC')).toMatchObject({ raceClass: 'open', name: 'オープン', distance: 1600 });
    expect(byName('デイリー杯2歳S')).toMatchObject({ raceClass: 'open', name: 'オープン' });
    expect(byName('阪神JF')).toMatchObject({ raceClass: 'G1', name: '阪神JF' });
    expect(byName('ホープフルS')).toMatchObject({ raceClass: 'G1', distance: 2000 });
  });

  it('G3以下で標準距離以外はオープンにして、近い標準距離に変える（等距離は長い方）', () => {
    expect(byName('きさらぎ賞')).toMatchObject({ raceClass: 'open', surface: 'turf', distance: 2000 });
    expect(byName('阪急杯')).toMatchObject({ raceClass: 'open', distance: 1600 });
    expect(byName('ダイヤモンドS')).toMatchObject({ raceClass: 'open', distance: 2400 });
    expect(byName('根岸S')).toMatchObject({ raceClass: 'open', surface: 'dirt', distance: 1600 });
    expect(byName('ユニコーンS')).toMatchObject({ raceClass: 'open', surface: 'dirt', distance: 2000 });
    expect(byName('京王杯2歳S')).toMatchObject({ raceClass: 'open', distance: 1600 });
    expect(byName('東スポ杯2歳S')).toMatchObject({ raceClass: 'open', distance: 2000 });
  });

  it('G1・G2 と標準距離の G3 はそのまま', () => {
    expect(byName('中山記念')).toMatchObject({ raceClass: 'G2', distance: 1800 });
    expect(byName('有馬記念')).toMatchObject({ raceClass: 'G1', distance: 2500 });
    expect(byName('ステイヤーズS')).toMatchObject({ raceClass: 'G2', distance: 3600 });
    expect(byName('シリウスS')).toMatchObject({ raceClass: 'G3', surface: 'dirt', distance: 2000 });
    expect(byName('中山金杯')).toMatchObject({ raceClass: 'G3', name: '中山金杯' });
  });

  it('標準距離への寄せ方', () => {
    expect(nearestStandardDistance('turf', 1400)).toBe(1600);
    expect(nearestStandardDistance('turf', 1800)).toBe(2000);
    expect(nearestStandardDistance('turf', 2200)).toBe(2400);
    expect(nearestStandardDistance('dirt', 1400)).toBe(1600);
    expect(nearestStandardDistance('dirt', 1900)).toBe(2000);
    expect(nearestStandardDistance('dirt', 2400)).toBe(2000);
  });
});

describe('1日の番組', () => {
  it('1日12Rで、11Rがその日の重賞。場は重賞の場', () => {
    for (const serial of [1, 30, 70, 98]) {
      const day = raceDay(serial);
      const g = GRADED_RACES_2026[serial - 1];
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

  it('98日で1年、99日目は翌年の1日目', () => {
    expect(raceDay(98)).toMatchObject({ year: 2026, dayIndex: 97 });
    expect(raceDay(99)).toMatchObject({ year: 2027, dayIndex: 0, month: 1, day: 4 });
  });

  it('上のクラスほど能力水準が高い', () => {
    const day = raceDay(97); // 有馬記念の前日はなし。12/26 ホープフルS（2歳G1）
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
