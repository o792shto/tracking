import { describe, expect, it } from 'vitest';
import { createRace, simulateRace, LOG_FIELDS } from '../sim';
import { approach, boundsOf, fitRect } from './camera';
import { logDuration, runningOrder, sampleAt } from './replay';

describe('replay', () => {
  const result = simulateRace(createRace(3, { course: { distance: 1200 }, runners: 8 }));
  const log = result.log!;

  it('記録のステップ上ではその値をそのまま返す', () => {
    const step = 600;
    const s = sampleAt(log, step * log.dt);
    for (let h = 0; h < log.horses; h++) {
      expect(s[h].d).toBeCloseTo(log.data[(step * log.horses + h) * LOG_FIELDS], 3);
    }
  });

  it('ステップの間は線形補間する', () => {
    const a = sampleAt(log, 600 * log.dt).map((s) => s.d);
    const b = sampleAt(log, 601 * log.dt).map((s) => s.d);
    const mid = sampleAt(log, 600.5 * log.dt);
    mid.forEach((s, h) => expect(s.d).toBeCloseTo((a[h] + b[h]) / 2, 4));
  });

  it('範囲外の時刻は端に丸める', () => {
    expect(sampleAt(log, -5)[0].d).toBe(0);
    expect(sampleAt(log, logDuration(log) + 10)[0].d).toBeCloseTo(sampleAt(log, logDuration(log))[0].d);
  });

  it('勝ち馬のゴール直後は勝ち馬が先頭', () => {
    const t = result.finish[0].time + 0.02;
    const order = runningOrder(sampleAt(log, t)).map((i) => result.setup.entries[i].number);
    expect(order[0]).toBe(result.finish[0].number);
  });
});

describe('camera', () => {
  it('矩形が画面に収まる拡大率を選ぶ', () => {
    const v = fitRect({ minX: 0, minY: 0, maxX: 200, maxY: 50 }, 800, 400);
    expect(v.scale).toBe(4);
    expect(v.cx).toBe(100);
    expect(v.cy).toBe(25);
  });

  it('拡大率の上限を守る', () => {
    expect(fitRect(boundsOf([{ x: 0, y: 0 }], 1), 800, 400, 0, 9).scale).toBe(9);
  });

  it('なめらかに目標へ近づき、行き過ぎない', () => {
    let v = { cx: 0, cy: 0, scale: 1 };
    const target = { cx: 100, cy: -50, scale: 4 };
    for (let i = 0; i < 300; i++) {
      v = approach(v, target, 3, 1 / 60);
      expect(v.cx).toBeLessThanOrEqual(100);
    }
    expect(v.cx).toBeCloseTo(100, 0);
    expect(v.scale).toBeCloseTo(4, 1);
  });
});
