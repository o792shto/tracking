import { describe, expect, it } from 'vitest';
import { createRace, simulateRace } from '../sim';
import { buildCommentary, currentComments } from './commentary';

describe('実況', () => {
  const races = [1, 2, 3, 4, 5, 6].map((seed) =>
    simulateRace(createRace(seed * 7, { course: { distance: [1200, 1600, 2000, 2400, 1800, 1600][seed - 1], venue: (['東京', '中山', '京都', '阪神', '中山', '東京'] as const)[seed - 1], direction: seed % 2 ? 'left' : 'right' } })),
  );

  it('時刻の順に並び、ゴール前の行は詰まりすぎない', () => {
    for (const r of races) {
      const lines = buildCommentary(r);
      expect(lines.length).toBeGreaterThan(8);
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].time).toBeGreaterThanOrEqual(lines[i - 1].time);
        if (lines[i].kind !== 'finish') expect(lines[i].time - lines[i - 1].time).toBeGreaterThanOrEqual(1.79);
      }
    }
  });

  it('ゴールの実況には勝ち馬の名前が入り、勝ち馬のゴールの時刻に出る', () => {
    for (const r of races) {
      const winner = r.setup.entries[r.finish[0].number - 1].horse.name;
      const goal = buildCommentary(r).find((l) => l.kind === 'finish')!;
      expect(goal.text).toContain(winner);
      expect(goal.time).toBeCloseTo(r.finish[0].time, 5);
    }
  });

  it('同じレースなら同じ実況になる', () => {
    expect(buildCommentary(races[0])).toEqual(buildCommentary(races[0]));
  });

  it('自分の馬の着順を伝える', () => {
    const r = races[1];
    const lines = buildCommentary(r, { mine: new Set([r.finish[2].number]) });
    const name = r.setup.entries[r.finish[2].number - 1].horse.name;
    expect(lines.some((l) => l.kind === 'mine' && l.text.includes(`${name}は3着`))).toBe(true);
  });

  it('時刻までの最新の行を返す', () => {
    const lines = buildCommentary(races[0]);
    expect(currentComments(lines, -1)).toEqual([]);
    const mid = lines[3].time;
    expect(currentComments(lines, mid, 2)).toEqual([lines[2], lines[3]]);
  });
});
