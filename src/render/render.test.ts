import { describe, expect, it } from 'vitest';
import { createRace, simulateRace, LOG_FIELDS } from '../sim';
import { approach, boundsOf, fitRect } from './camera';
import { logDuration, runningOrder, sampleAt } from './replay';
import { activeTelop, lapsSoFar, paceReadout, referenceLap, standings } from './overlay';
import { slowWindow } from './player';

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

describe('overlay', () => {
  const result = simulateRace(createRace(11, { course: { distance: 1600 }, runners: 12 }));
  const log = result.log!;

  it('順位表は1位から順に並び、先頭との差は0以上で単調に増える', () => {
    const t = 60;
    const rows = standings(result, sampleAt(log, t), t, null);
    expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(rows[0].behindLengths).toBe(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].behindLengths).toBeGreaterThanOrEqual(rows[i - 1].behindLengths - 0.2);
    }
  });

  it('全馬ゴール後の順位表は着順と一致する', () => {
    const t = logDuration(log);
    const rows = standings(result, sampleAt(log, t), t, null);
    expect(rows.map((r) => r.number)).toEqual(result.finish.map((f) => f.number));
    expect(rows.every((r) => r.finished)).toBe(true);
  });

  it('前回の並びを引き継いでも、途中で並べ直しても同じ順位になる（差が十分あるとき）', () => {
    let prev: number[] | null = null;
    for (let t = 0; t <= 80; t += 0.5) {
      prev = standings(result, sampleAt(log, t), t, prev).map((r) => r.index);
    }
    const fresh = standings(result, sampleAt(log, 80), 80, null).map((r) => r.index);
    expect(prev![0]).toBe(fresh[0]);
  });

  it('ラップは先頭の通過に合わせて積み上がる', () => {
    expect(lapsSoFar(result, 0)).toEqual([]);
    expect(lapsSoFar(result, result.laps[0] + 0.01)).toHaveLength(1);
    expect(lapsSoFar(result, result.finish[0].time + 0.01)).toEqual(result.laps);
  });

  it('ペース判定はゴール後に出る', () => {
    expect(paceReadout(result, 10).judgement).toBeNull();
    const end = paceReadout(result, result.finish[0].time + 0.01);
    expect(end.judgement).toBe(result.pace);
    expect(end.last3f).toBeCloseTo(result.laps.slice(-3).reduce((a, b) => a + b, 0));
  });

  it('テロップは残り600/400/200mを先頭が通過した直後だけ出る', () => {
    const D = 1600;
    expect(activeTelop(result, D - 700)).toBeNull();
    expect(activeTelop(result, D - 590)).toBe(600);
    expect(activeTelop(result, D - 390)).toBe(400);
    expect(activeTelop(result, D - 195)).toBe(200);
    expect(activeTelop(result, D - 100)).toBeNull();
  });

  it('基準ラップはもっともらしい範囲', () => {
    expect(referenceLap(result)).toBeGreaterThan(11);
    expect(referenceLap(result)).toBeLessThan(13.5);
  });
});

describe('ゴール前のスロー', () => {
  it('1・2着が1/2馬身差以内のときだけ、1着のゴール前から2着のゴール後までスローにする', () => {
    const base = simulateRace(createRace(3, { course: { distance: 1200 }, runners: 8 }), { record: false });
    const withMargin = (label: string) => ({
      ...base,
      finish: [
        { ...base.finish[0], time: 70 },
        { ...base.finish[1], time: 70.05, marginLabel: label },
        ...base.finish.slice(2),
      ],
    });
    const w = slowWindow(withMargin('ハナ'));
    expect(w).not.toBeNull();
    expect(w!.from).toBeLessThan(70);
    expect(w!.to).toBeGreaterThan(70.05);
    expect(slowWindow(withMargin('1/2'))).not.toBeNull();
    expect(slowWindow(withMargin('1 1/4'))).toBeNull();
  });
});
