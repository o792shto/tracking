import { describe, expect, test } from 'vitest';
import { Rng } from '../rng';
import { ABROAD, OVERSEAS_RACES, overseasRacesOf, overseasRanks, overseasWeek } from './overseas';
import { RACE_WEEKS } from './calendar';

describe('海外のレース', () => {
  test('どのレースも開催のある週に割り当たる（凱旋門賞は10月の最初の週あたり）', () => {
    for (const r of OVERSEAS_RACES) expect(overseasRacesOf(overseasWeek(r))).toContain(r);
    const arc = RACE_WEEKS[overseasWeek(OVERSEAS_RACES.find((r) => r.name === '凱旋門賞')!)];
    expect(arc.days[0].month).toBe(10);
  });

  test('日本馬の着順は重ならず、頭数の範囲に収まる', () => {
    const race = OVERSEAS_RACES[0];
    for (let seed = 0; seed < 50; seed++) {
      const ranks = overseasRanks(race, [80, 80, 80], 80, new Rng(seed));
      expect(new Set(ranks).size).toBe(3);
      for (const r of ranks) expect(r >= 1 && r <= ABROAD.rivals + 3).toBe(true);
    }
  });
});
