import { beforeAll, describe, expect, it } from 'vitest';
import { formatReport } from './report';
import { runBatch, type BatchStats } from './stats';
import { STYLES } from './types';

/**
 * SPEC.md「検証の基準」の統計テスト。1000レース回して確認する。
 * 時計とラップの検証は reference.test.ts（JRAの参考値との比較）で行う。
 * 結果の表は `npm run sim:report` で表示できる。
 */
const RACES = 1000;
let stats: BatchStats;

beforeAll(() => {
  stats = runBatch(RACES, 1);
  console.log(formatReport(stats));
}, 120_000);

describe(`${RACES}レースの統計`, () => {
  it('1番人気の勝率がおおむね30%前後', () => {
    expect(stats.byPopularity[0].winRate).toBeGreaterThan(0.24);
    expect(stats.byPopularity[0].winRate).toBeLessThan(0.36);
  });

  it('人気が下がるほど勝率も下がる（上位5番人気まで）', () => {
    const rates = stats.byPopularity.slice(0, 5).map((p) => p.winRate);
    expect(rates[0]).toBeGreaterThan(rates[1]);
    expect(rates[1]).toBeGreaterThan(rates[4]);
  });

  it('人気薄の激走もときどき起きる', () => {
    expect(stats.longshotWinRate).toBeGreaterThan(0.08);
    expect(stats.longshotWinRate).toBeLessThan(0.35);
  });

  it('脚質ごとの勝率が極端に偏らない（頭数比の期待勝率の0.6〜1.6倍）', () => {
    for (const s of STYLES) {
      expect(stats.byStyle[s].ratio, s).toBeGreaterThan(0.6);
      expect(stats.byStyle[s].ratio, s).toBeLessThan(1.6);
    }
  });

  it('5馬身以上の大差勝ちはまれ（騎手がゴール前で流すため）', () => {
    expect(stats.bigWinRate).toBeLessThan(0.05);
  });

  it('ペースはハイ・平均・スローがそれぞれ一定数ある', () => {
    for (const p of ['high', 'middle', 'slow'] as const) {
      expect(stats.pace[p] / RACES, p).toBeGreaterThan(0.1);
    }
  });

  it('出遅れ・掛かり・進路が開かないが低確率で起きる', () => {
    expect(stats.slowStartPerRace).toBeGreaterThan(0.1);
    expect(stats.slowStartPerRace).toBeLessThan(1.5);
    expect(stats.keenPerRace).toBeGreaterThan(0.1);
    expect(stats.keenPerRace).toBeLessThan(1.5);
    expect(stats.blockedPerRace).toBeGreaterThan(0.05);
    expect(stats.blockedPerRace).toBeLessThan(1.5);
  });
});
