import { describe, expect, it } from 'vitest';
import { createRace } from './horse';
import { NAME_BLOCKLIST, generateHorseName, nameVariety } from './names';
import { Rng } from './rng';

describe('馬名', () => {
  it('2〜9文字のカタカナで、よく知られた実在馬の名前は出ない', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 20000; i++) {
      const name = generateHorseName(rng);
      expect(name).toMatch(/^[ァ-ヴー]{2,9}$/);
      expect(NAME_BLOCKLIST.has(name)).toBe(false);
    }
  });

  it('作れる名前は1万種類以上ある', () => {
    expect(nameVariety()).toBeGreaterThan(10000);
  });

  it('同じレースで名前が重ならない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const names = createRace(seed, { runners: 18 }).entries.map((e) => e.horse.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
