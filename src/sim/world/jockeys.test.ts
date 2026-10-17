import { describe, expect, test } from 'vitest';
import { advanceWeek, createWorld } from './advance';
import { WEEKS_PER_YEAR } from './calendar';
import { ensureJockeys, initialJockeys } from './jockeys';
import { weekCard } from './schedule';
import type { Jockey, World } from './types';

describe('騎手', () => {
  test('どの馬にも騎手が付き、1人の騎手は1レースに1頭・1日に1つの競馬場だけ', () => {
    const world = createWorld(11);
    for (let k = 0; k < WEEKS_PER_YEAR; k++) {
      const card = weekCard(world);
      const venueOf = new Map<string, string>();
      for (const r of card.races) {
        if (r.horseIds.length === 0) continue;
        expect(r.jockeyIds).toHaveLength(r.horseIds.length);
        expect(r.jockeyIds.every((id) => id > 0)).toBe(true);
        expect(new Set(r.jockeyIds).size).toBe(r.jockeyIds.length);
        const d = card.week.days[r.dayIndex];
        for (const id of r.jockeyIds) {
          const key = `${d.month}-${d.day}-${id}`;
          expect(venueOf.get(key) ?? d.venue).toBe(d.venue);
          venueOf.set(key, d.venue);
        }
      }
      advanceWeek(world, { full: false });
    }
  }, 60_000);

  test('古い保存データ：架空の騎手を外し、増えた騎手を足し、成績とランクは名前で引き継ぐ', () => {
    const old = initialJockeys().filter((j) => j.name !== '菅原明良');
    old[0].wins = 99;
    old.find((j) => j.name === '今村聖奈')!.rank = 'B';
    const fake: Jockey = { ...old[1], id: 999, name: '架空', fictional: true };
    const world = ensureJockeys({ jockeys: [...old, fake] } as unknown as World);
    const names = world.jockeys!.map((j) => j.name);
    expect(names).not.toContain('架空');
    expect(names).toContain('菅原明良');
    expect(world.jockeys!.find((j) => j.name === old[0].name)!.wins).toBe(99);
    expect(world.jockeys!.find((j) => j.name === '今村聖奈')!.rank).toBe('B');
    expect(new Set(world.jockeys!.map((j) => j.id)).size).toBe(world.jockeys!.length);
  });
});
