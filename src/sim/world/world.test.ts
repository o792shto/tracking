import { beforeAll, describe, expect, test } from 'vitest';
import { advanceWeek, createWorld } from './advance';
import { WEEKS_PER_YEAR, weekOf } from './calendar';
import { ageOf } from './horses';
import { raceSetup, weekCard, type WeekCard } from './schedule';
import { simulateRace } from '../engine';
import { apparentStrength } from '../rating';
import type { World } from './types';

/** 名簿の世界を1年動かして、番組・出走馬・世代交代がおかしくないかを見る */
describe('世界', () => {
  let world: World;
  const cards: WeekCard[] = [];
  let before: World;

  const setups: { setup: ReturnType<typeof raceSetup>; graded: boolean }[] = [];

  beforeAll(() => {
    world = createWorld(2026);
    before = structuredClone(world);
    for (let k = 0; k < WEEKS_PER_YEAR; k++) {
      const card = weekCard(world);
      cards.push(card);
      for (const r of card.races) if (r.visible && r.horseIds.length > 0) setups.push({ setup: raceSetup(world, card, r), graded: r.grade !== null });
      advanceWeek(world, { full: false });
    }
  }, 120_000);

  test('同じシードなら同じ世界', () => {
    const again = createWorld(2026);
    expect(again.horses.map((h) => h.name)).toEqual(before.horses.map((h) => h.name));
    expect(weekCard(again).races.map((r) => r.horseIds)).toEqual(cards[0].races.map((r) => r.horseIds));
  }, 60_000);

  test('観戦レース（10〜12R）はどれも8頭以上、G1は14頭以上', () => {
    for (const card of cards) {
      for (const r of card.races.filter((x) => x.visible)) {
        expect(r.horseIds.length, `${card.serial} ${r.program.name}`).toBeGreaterThanOrEqual(8);
        if (r.grade === 'G1') expect(r.horseIds.length).toBeGreaterThanOrEqual(14);
      }
    }
  });

  test('出走馬は年齢・性別の条件に合い、1週に1レースまで', () => {
    // 週の初めの名簿で確かめる（引退した馬は名簿から消えることがあるので、出走表を作ったときの名簿）
    let w = structuredClone(before);
    for (const card of cards.slice(0, 12)) {
      const byId = new Map(w.horses.map((h) => [h.id, h]));
      const seen = new Set<number>();
      for (const r of card.races) {
        for (const id of r.horseIds) {
          const h = byId.get(id)!;
          expect(seen.has(id)).toBe(false);
          seen.add(id);
          const age = ageOf(h, card.year);
          const ok = { '2': age === 2, '3': age === 3, '3up': age >= 3, '4up': age >= 4 }[r.program.age];
          expect(ok, `${r.program.name} ${age}歳`).toBe(true);
          if (r.program.fillies) expect(h.sex).toBe('filly');
          if (r.program.raceClass === 'newcomer') expect(h.starts).toBe(0);
          expect(h.retired).toBeNull();
        }
      }
      w = advanceWeek(w, { full: false });
    }
  }, 60_000);

  test('出馬表の近走は名簿の実際の成績（新馬戦は初出走）', () => {
    for (const { setup } of setups.slice(0, 40)) {
      for (const e of setup.entries) expect(e.history!.length).toBeGreaterThan(0);
    }
    let w = structuredClone(before);
    for (let k = 0; k < 22; k++) w = advanceWeek(w, { full: false });
    let newcomers = 0;
    for (const card of cards.slice(22, 26)) {
      for (const r of card.races.filter((x) => x.program.raceClass === 'newcomer' && x.horseIds.length > 0)) {
        for (const e of raceSetup(w, card, r).entries) expect(e.history).toEqual([]);
        newcomers++;
      }
      w = advanceWeek(w, { full: false });
    }
    expect(newcomers).toBeGreaterThan(5);
  }, 60_000);

  test('名簿の頭数が安定している（毎年の2歳と引退がつり合う）', () => {
    const active = (x: World) => x.horses.filter((h) => !h.retired).length;
    expect(active(world)).toBeGreaterThan(1200);
    expect(active(world)).toBeLessThan(2000);
    expect(Math.abs(active(world) - active(before)) / active(before)).toBeLessThan(0.15);
  });

  test('1年で全重賞の結果と表彰が残る', () => {
    const year = weekOf(before.serial).year;
    expect(world.graded.filter((g) => g.year === year)).toHaveLength(98);
    const titles = world.awards.filter((a) => a.year === year).map((a) => a.title);
    expect(titles).toContain('年度代表馬');
    // 夏の上がり馬のニュース
    expect(world.news.some((n) => n.kind === 'summer')).toBe(true);
  });

  test('3歳の未勝利馬は夏で引退し、7歳は年末で引退する', () => {
    const year = weekOf(world.serial).year;
    for (const h of world.horses.filter((x) => !x.retired)) {
      expect(ageOf(h, year)).toBeLessThanOrEqual(7);
      if (ageOf(h, year) >= 4) expect(h.wins).toBeGreaterThan(0);
    }
  });

  test('観戦レースで見た目の強さが一番の馬の勝率が、実際の1番人気（約32%）に近い', () => {
    let wins = 0;
    let top3 = 0;
    for (const { setup } of setups) {
      const s = apparentStrength(setup);
      const fav = setup.entries[s.indexOf(Math.max(...s))].number;
      const res = simulateRace(setup, { record: false });
      if (res.finish[0].number === fav) wins++;
      if (res.finish.slice(0, 3).some((f) => f.number === fav)) top3++;
    }
    const n = setups.length;
    console.log(`観戦レース ${n} / 本命の勝率 ${((wins / n) * 100).toFixed(1)}% / 3着内率 ${((top3 / n) * 100).toFixed(1)}%`);
    expect(wins / n).toBeGreaterThan(0.24);
    expect(wins / n).toBeLessThan(0.42);
    expect(top3 / n).toBeGreaterThan(0.45);
  }, 120_000);
});
