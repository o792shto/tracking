import { describe, expect, it } from 'vitest';
import { createRace, horseProfiles, simulateRace } from '../sim';
import {
  BETTING,
  buildMarket,
  exactaProbability,
  trifectaProbability,
  trioProbability,
  isHit,
  payoutFor,
  placeCount,
  quinellaKey,
  roundOdds,
  settle,
  topKProbabilities,
  winProbabilities,
  type Bet,
} from '.';

const marketFor = (seed: number, runners?: number) => {
  const setup = createRace(seed, { runners });
  return { setup, market: buildMarket(setup, horseProfiles(setup)) };
};

describe('確率とオッズの基本', () => {
  it('オッズは0.1倍単位の切り捨てで、最低1.0倍', () => {
    expect(roundOdds(3.47)).toBe(3.4);
    expect(roundOdds(12.0)).toBe(12);
    expect(roundOdds(0.8)).toBe(1);
  });

  it('オッズは小数第1位まで、複勝は最低1.1倍', () => {
    const decimals = (x: number) => Math.abs(Math.round(x * 10) - x * 10) < 1e-9;
    for (let seed = 1; seed <= 40; seed++) {
      const { setup, market } = marketFor(seed);
      for (const board of market.boards) {
        board.win.forEach((o) => expect(decimals(o)).toBe(true));
        board.quinella.forEach((o) => expect(decimals(o)).toBe(true));
        for (const r of board.place) {
          expect(decimals(r.min) && decimals(r.max)).toBe(true);
          expect(r.min).toBeGreaterThanOrEqual(BETTING.placeMinOdds);
        }
      }
      const order = simulateRace(setup, { record: false }).finish.map((f) => f.number);
      for (const p of settle(market, order).place) {
        expect(p.odds).toBeGreaterThanOrEqual(BETTING.placeMinOdds);
        expect(decimals(p.odds)).toBe(true);
      }
    }
  });

  it('組み合わせの確率の合計：馬単・3連単・3連複は1、ワイドは3', () => {
    const p = [0.3, 0.2, 0.15, 0.12, 0.1, 0.08, 0.05];
    let ex = 0;
    let tri = 0;
    let trio = 0;
    let wide = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = 0; j < p.length; j++) {
        if (i === j) continue;
        ex += exactaProbability(p, i, j);
        for (let k = 0; k < p.length; k++) if (k !== i && k !== j) tri += trifectaProbability(p, i, j, k);
      }
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        for (let k = j + 1; k < p.length; k++) trio += trioProbability(p, i, j, k);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        for (let k = 0; k < p.length; k++) if (k !== i && k !== j) wide += trioProbability(p, i, j, k);
    expect(ex).toBeCloseTo(1, 9);
    expect(tri).toBeCloseTo(1, 9);
    expect(trio).toBeCloseTo(1, 9);
    expect(wide).toBeCloseTo(3, 9);
  });

  it('ワイド・馬単・3連複・3連単も、確定オッズで払い戻し、的中は1組（ワイドは3組）', () => {
    const { setup, market } = marketFor(9, 14);
    const order = simulateRace(setup, { record: false }).finish.map((f) => f.number);
    const pay = settle(market, order);
    const [a, b, c] = order;
    expect(pay.wide).toHaveLength(3);
    expect(pay.exacta.key).toBe(`${a}>${b}`);
    expect(pay.trifecta.key).toBe(`${a}>${b}>${c}`);
    expect(pay.trio.key).toBe([a, b, c].sort((x, y) => x - y).join('-'));
    const bet = (type: Bet['type'], selection: number[]): Bet => ({ type, selection, stake: 100 });
    expect(isHit(bet('wide', [c, a]), order, 14)).toBe(true);
    expect(isHit(bet('exacta', [b, a]), order, 14)).toBe(false);
    expect(isHit(bet('trio', [c, b, a]), order, 14)).toBe(true);
    expect(isHit(bet('trifecta', [a, c, b]), order, 14)).toBe(false);
    expect(payoutFor(bet('trifecta', [a, b, c]), pay)).toBeCloseTo(pay.trifecta.odds * 100, 5);
    // ワイドの確定オッズは表示の幅に入る
    const board = market.boards.at(-1)!;
    for (const w of pay.wide) {
      const r = board.wide.get(w.key)!;
      expect(w.odds).toBeGreaterThanOrEqual(r.min);
      expect(w.odds).toBeLessThanOrEqual(r.max);
    }
  });

  it('勝率の合計は1、k着以内の確率の合計はk', () => {
    const { setup } = marketFor(3, 12);
    const p = winProbabilities(setup);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(topKProbabilities(p, 2).reduce((a, b) => a + b, 0)).toBeCloseTo(2, 9);
    expect(topKProbabilities(p, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(3, 9);
  });

  it('複勝は8頭以上で3着まで、7頭以下で2着まで', () => {
    expect(placeCount(8)).toBe(3);
    expect(placeCount(7)).toBe(2);
  });

  it('同じシードなら同じオッズ', () => {
    expect(marketFor(9).market.boards.at(-1)!.win).toEqual(marketFor(9).market.boards.at(-1)!.win);
  });

  it('単勝オッズの逆数の合計は 1 / (1 - 控除率) 程度（切り捨ての分だけ大きい）', () => {
    const { market } = marketFor(4, 14);
    const inv = market.boards.at(-1)!.win.reduce((a, o) => a + 1 / o, 0);
    expect(inv).toBeGreaterThan(1 / (1 - BETTING.takeout.win) - 0.01);
    expect(inv).toBeLessThan(1 / (1 - BETTING.takeout.win) + 0.1);
  });

  it('発走前にオッズが何度か変わり、最後が確定オッズ', () => {
    const { market } = marketFor(5, 14);
    expect(market.boards).toHaveLength(BETTING.boardSteps);
    expect(market.boards[0].win).not.toEqual(market.boards.at(-1)!.win);
  });

  it('人気は単勝オッズの低い順', () => {
    const board = marketFor(6, 14).market.boards.at(-1)!;
    const fav = board.popularity.indexOf(1);
    expect(board.win[fav]).toBe(Math.min(...board.win));
  });

  it('複勝の表示は最低〜最高の幅で、確定オッズはその範囲に入る', () => {
    const { setup, market } = marketFor(7, 14);
    const result = simulateRace(setup, { record: false });
    const order = result.finish.map((f) => f.number);
    const payouts = settle(market, order);
    const board = market.boards.at(-1)!;
    for (const p of payouts.place) {
      const range = board.place[p.number - 1];
      expect(range.min).toBeLessThanOrEqual(range.max);
      expect(p.odds).toBeGreaterThanOrEqual(range.min);
      expect(p.odds).toBeLessThanOrEqual(range.max);
    }
  });
});

describe('的中判定と払い戻し', () => {
  const runners = 10;
  const order = [3, 7, 1, 5, 2, 4, 6, 8, 9, 10];

  it('単勝は1着だけ', () => {
    expect(isHit({ type: 'win', selection: [3], stake: 100 }, order, runners)).toBe(true);
    expect(isHit({ type: 'win', selection: [7], stake: 100 }, order, runners)).toBe(false);
  });

  it('複勝は3着まで（7頭以下は2着まで）', () => {
    expect(isHit({ type: 'place', selection: [1], stake: 100 }, order, runners)).toBe(true);
    expect(isHit({ type: 'place', selection: [5], stake: 100 }, order, runners)).toBe(false);
    expect(isHit({ type: 'place', selection: [1], stake: 100 }, order.slice(0, 7), 7)).toBe(false);
  });

  it('馬連は1・2着の組み合わせ（順不同）', () => {
    expect(isHit({ type: 'quinella', selection: [7, 3], stake: 100 }, order, runners)).toBe(true);
    expect(isHit({ type: 'quinella', selection: [3, 1], stake: 100 }, order, runners)).toBe(false);
    expect(quinellaKey(7, 3)).toBe('3-7');
  });

  it('払い戻し額は 購入額 × オッズ、外れは0', () => {
    const payouts = {
      win: { number: 3, odds: 2.3 },
      place: [
        { number: 3, odds: 1.2 },
        { number: 7, odds: 3.5 },
        { number: 1, odds: 1.8 },
      ],
      quinella: { key: '3-7', odds: 12.6 },
      wide: [
        { key: '3-7', odds: 4.1 },
        { key: '1-3', odds: 2.0 },
        { key: '1-7', odds: 6.3 },
      ],
      exacta: { key: '3>7', odds: 24.5 },
      trio: { key: '1-3-7', odds: 31.2 },
      trifecta: { key: '3>7>1', odds: 158.3 },
    };
    const bet = (type: Bet['type'], selection: number[], stake: number): Bet => ({ type, selection, stake });
    expect(payoutFor(bet('win', [3], 300), payouts)).toBe(690);
    expect(payoutFor(bet('win', [7], 300), payouts)).toBe(0);
    expect(payoutFor(bet('place', [7], 200), payouts)).toBe(700);
    expect(payoutFor(bet('quinella', [7, 3], 100), payouts)).toBe(1260);
    expect(payoutFor(bet('quinella', [1, 3], 100), payouts)).toBe(0);
    expect(payoutFor(bet('wide', [7, 1], 100), payouts)).toBe(630);
    expect(payoutFor(bet('wide', [1, 5], 100), payouts)).toBe(0);
    expect(payoutFor(bet('exacta', [3, 7], 100), payouts)).toBe(2450);
    expect(payoutFor(bet('exacta', [7, 3], 100), payouts)).toBe(0);
    expect(payoutFor(bet('trio', [7, 1, 3], 200), payouts)).toBe(6240);
    expect(payoutFor(bet('trifecta', [3, 7, 1], 100), payouts)).toBe(15830);
    expect(payoutFor(bet('trifecta', [3, 1, 7], 100), payouts)).toBe(0);
  });

  it('払い戻しの総額は控除後の投票総額を超えない', () => {
    const { setup, market } = marketFor(12, 16);
    const result = simulateRace(setup, { record: false });
    const payouts = settle(market, result.finish.map((f) => f.number));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const winNet = sum(market.pools.win) * (1 - BETTING.takeout.win);
    expect(market.pools.win[payouts.win.number - 1] * payouts.win.odds).toBeLessThanOrEqual(winNet + 1);
    const placeNet = sum(market.pools.place) * (1 - BETTING.takeout.place);
    const placePaid = sum(payouts.place.map((p) => market.pools.place[p.number - 1] * p.odds));
    expect(placePaid).toBeLessThanOrEqual(placeNet + 1);
  });
});

describe('オッズと結果の統計（500レース）', () => {
  it('1番人気の勝率がおおむね30%前後、人気通りに買い続けると回収率は100%を下回る', () => {
    let favWins = 0;
    let longshot = 0;
    let spent = 0;
    let returned = 0;
    const N = 500;
    for (let seed = 1; seed <= N; seed++) {
      const { setup, market } = marketFor(seed);
      const result = simulateRace(setup, { record: false });
      const order = result.finish.map((f) => f.number);
      const board = market.boards.at(-1)!;
      const fav = board.popularity.indexOf(1) + 1;
      if (order[0] === fav) favWins++;
      if (board.popularity[order[0] - 1] >= 6) longshot++;
      const payouts = settle(market, order);
      spent += 100;
      returned += payoutFor({ type: 'win', selection: [fav], stake: 100 }, payouts);
    }
    console.log(`1番人気 勝率 ${((favWins / N) * 100).toFixed(1)}% / 6番人気以下の勝利 ${((longshot / N) * 100).toFixed(1)}% / 1番人気の単勝回収率 ${((returned / spent) * 100).toFixed(1)}%`);
    expect(favWins / N).toBeGreaterThan(0.24);
    expect(favWins / N).toBeLessThan(0.38);
    expect(longshot / N).toBeGreaterThan(0.08);
    expect(returned / spent).toBeLessThan(1.0);
    expect(returned / spent).toBeGreaterThan(0.5);
  }, 60_000);
});
