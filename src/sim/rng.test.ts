import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('同じシードなら同じ系列になる', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('シードが違えば系列も違う', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('[0, 1) の範囲に収まり、平均がおよそ 0.5', () => {
    const rng = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });

  it('int は両端を含む', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('fork した系列は元の系列を進めない', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    a.fork(1).next();
    expect(a.next()).toBe(b.next());
  });
});
