import { describe, expect, test } from 'vitest';
import { createRace } from '../horse';
import { simulateRace } from '../engine';
import { apparentStrength } from '../rating';
import { Rng } from '../rng';
import { quickFinish } from './quick';

/** 簡易な結果が、シミュレーションと同じくらいの時計・荒れ方になるか */
describe('簡易な結果', () => {
  test('勝ち時計と本命の勝率がシミュレーションに近い', () => {
    let simFav = 0;
    let quickFav = 0;
    let simTime = 0;
    let quickTime = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const setup = createRace(5000 + i, {
        runners: 14,
        classLevel: 60,
        course: { venue: (['東京', '中山', '京都', '阪神'] as const)[i % 4], direction: i % 4 === 0 ? 'left' : 'right' },
      });
      const s = apparentStrength(setup);
      const fav = setup.entries[s.indexOf(Math.max(...s))].number;
      const sim = simulateRace(setup, { record: false });
      const quick = quickFinish(setup, new Rng(i));
      if (sim.finish[0].number === fav) simFav++;
      if (quick[0].number === fav) quickFav++;
      simTime += sim.finish[0].time / setup.course.distance;
      quickTime += quick[0].time / setup.course.distance;
    }
    console.log('fav', simFav / n, quickFav / n, 'time/m', simTime / n, quickTime / n);
    expect(Math.abs(quickTime / simTime - 1)).toBeLessThan(0.01);
    expect(Math.abs(quickFav - simFav) / n).toBeLessThan(0.1);
  }, 60_000);
});
