import { describe, expect, it } from 'vitest';
import { simulateRace } from './engine';
import { createRace, frameNumbers } from './horse';
import { marginLabel } from './result';
import { DISTANCES, LOG_FIELDS } from './types';

describe('createRace', () => {
  it('同じシードなら同じ出走表', () => {
    expect(createRace(123)).toEqual(createRace(123));
  });

  it('枠番は1〜8枠、外枠から2頭目が入る', () => {
    expect(frameNumbers(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(frameNumbers(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 8, 8]);
    expect(frameNumbers(18)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8]);
  });

  it('馬名は3〜9文字のカタカナ', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const e of createRace(seed).entries) {
        expect(e.horse.name).toMatch(/^[ァ-ヴー]{3,9}$/);
      }
    }
  });
});

describe('simulateRace', () => {
  it('同じシードなら同じ結果になる（記録も含めて）', () => {
    for (const seed of [1, 99, 2024]) {
      const a = simulateRace(createRace(seed));
      const b = simulateRace(createRace(seed));
      expect(a.finish).toEqual(b.finish);
      expect(a.laps).toEqual(b.laps);
      expect(a.events).toEqual(b.events);
      expect(a.log!.data).toEqual(b.log!.data);
    }
    // 記録（大きな配列）の比較に時間がかかり、全テストを並べて走らせると5秒を超えることがある
  }, 30_000);

  it('記録の有無で結果が変わらない', () => {
    for (const seed of [5, 6, 7]) {
      const a = simulateRace(createRace(seed), { record: true });
      const b = simulateRace(createRace(seed), { record: false });
      expect(b.finish).toEqual(a.finish);
      expect(b.laps).toEqual(a.laps);
      expect(b.log).toBeNull();
    }
  });

  it('シードが違えば結果も違う', () => {
    const a = simulateRace(createRace(1, { course: { distance: 1600 }, runners: 12 }));
    const b = simulateRace(createRace(2, { course: { distance: 1600 }, runners: 12 }));
    expect(a.finish.map((f) => f.time)).not.toEqual(b.finish.map((f) => f.time));
  });

  it.each(DISTANCES)('%im：全馬ゴールし、着順・ラップ・上がり3Fが整合する', (distance) => {
    const setup = createRace(distance, { course: { distance }, runners: 16 });
    const result = simulateRace(setup);
    expect(result.finish).toHaveLength(16);
    expect(result.finish.map((f) => f.rank)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(new Set(result.finish.map((f) => f.number)).size).toBe(16);
    for (let i = 1; i < result.finish.length; i++) {
      expect(result.finish[i].time).toBeGreaterThanOrEqual(result.finish[i - 1].time);
      expect(result.finish[i].marginSec).toBeCloseTo(result.finish[i].time - result.finish[i - 1].time);
    }
    // ラップは200mごと、合計は勝ち時計と一致
    expect(result.laps).toHaveLength(distance / 200);
    const lapSum = result.laps.reduce((a, b) => a + b, 0);
    expect(lapSum).toBeCloseTo(result.finish[0].time, 1);
    for (const lap of result.laps) {
      expect(lap).toBeGreaterThan(10);
      expect(lap).toBeLessThan(15);
    }
    for (const f of result.finish) {
      expect(f.last3f).toBeGreaterThan(31);
      expect(f.last3f).toBeLessThan(45);
    }
  });

  it('毎ステップ各馬の距離・横位置・速度・スタミナを記録する', () => {
    const setup = createRace(10, { course: { distance: 1200 }, runners: 10 });
    const { log, finish } = simulateRace(setup);
    expect(log).not.toBeNull();
    expect(log!.data.length).toBe(log!.steps * log!.horses * LOG_FIELDS);
    // 記録はゴール後まで続き、勝ち馬の距離は単調に増える
    expect((log!.steps - 1) * log!.dt).toBeGreaterThan(finish[finish.length - 1].time);
    const h = finish[0].number - 1;
    let prev = -1;
    for (let s = 0; s < log!.steps; s++) {
      const d = log!.data[(s * log!.horses + h) * LOG_FIELDS];
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('marginLabel', () => {
  it('着差の表記', () => {
    expect(marginLabel(0.01)).toBe('同着');
    expect(marginLabel(0.05)).toBe('ハナ');
    expect(marginLabel(0.15)).toBe('アタマ');
    expect(marginLabel(0.3)).toBe('クビ');
    expect(marginLabel(0.5)).toBe('1/2');
    expect(marginLabel(1.0)).toBe('1');
    expect(marginLabel(1.5)).toBe('1 1/2');
    expect(marginLabel(2.5)).toBe('2 1/2');
    expect(marginLabel(6.2)).toBe('6');
    expect(marginLabel(12)).toBe('大差');
  });
});
