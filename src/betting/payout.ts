import { BETTING } from './params';
import { placeCount, settledPlaceOdds, settledWideOdds } from './market';
import { BET_TYPE_ORDERED, combinationKey, quinellaKey, type Bet, type Market } from './types';

/** 組み合わせ1つの配当 */
export interface ComboPayout {
  key: string;
  odds: number;
}

/** レースの払い戻し（100コインあたりではなく、倍率で持つ） */
export interface Payouts {
  win: { number: number; odds: number };
  place: { number: number; odds: number }[];
  quinella: ComboPayout;
  /** ワイドは3着内の3頭でできる3組 */
  wide: ComboPayout[];
  exacta: ComboPayout;
  trio: ComboPayout;
  trifecta: ComboPayout;
}

/** 確定した着順（馬番の配列、1着から）から各券種の配当を出す */
export function settle(market: Market, finishOrder: number[]): Payouts {
  const finalBoard = market.boards[market.boards.length - 1];
  const winner = finishOrder[0];
  const placed = finishOrder.slice(0, placeCount(market.runners));
  const placeOdds = settledPlaceOdds(market.pools, placed);
  const top3 = finishOrder.slice(0, 3);
  const wideOdds = settledWideOdds(market.pools, top3);
  const qKey = quinellaKey(finishOrder[0], finishOrder[1]);
  const exKey = combinationKey('exacta', finishOrder.slice(0, 2));
  const trioKey = combinationKey('trio', top3);
  const triKey = combinationKey('trifecta', top3);
  return {
    win: { number: winner, odds: finalBoard.win[winner - 1] },
    place: placed.map((number) => ({ number, odds: placeOdds.get(number)! })),
    quinella: { key: qKey, odds: finalBoard.quinella.get(qKey)! },
    wide: [...wideOdds].map(([key, odds]) => ({ key, odds })),
    exacta: { key: exKey, odds: finalBoard.exacta.get(exKey)! },
    trio: { key: trioKey, odds: finalBoard.trio.get(trioKey)! },
    trifecta: { key: triKey, odds: finalBoard.trifecta.get(triKey)! },
  };
}

/** 着順がこのとおりなら的中か（観戦中の「現在の着順なら」にも使う） */
export function isHit(bet: Bet, order: number[], runners: number): boolean {
  const key = combinationKey(bet.type, bet.selection);
  switch (bet.type) {
    case 'win':
      return order[0] === bet.selection[0];
    case 'place':
      return order.slice(0, placeCount(runners)).includes(bet.selection[0]);
    case 'wide': {
      const top3 = order.slice(0, 3);
      return bet.selection.every((n) => top3.includes(n));
    }
    case 'quinella':
    case 'exacta':
      return combinationKey(bet.type, order.slice(0, 2)) === key;
    case 'trio':
    case 'trifecta':
      return combinationKey(bet.type, order.slice(0, 3)) === key;
  }
}

/** 馬券1枚のオッズ（外れは0） */
function oddsFor(bet: Bet, payouts: Payouts): number {
  const key = combinationKey(bet.type, bet.selection);
  switch (bet.type) {
    case 'win':
      return payouts.win.number === bet.selection[0] ? payouts.win.odds : 0;
    case 'place':
      return payouts.place.find((p) => p.number === bet.selection[0])?.odds ?? 0;
    case 'wide':
      return payouts.wide.find((w) => w.key === key)?.odds ?? 0;
    case 'quinella':
    case 'exacta':
    case 'trio':
    case 'trifecta':
      return payouts[bet.type].key === key ? payouts[bet.type].odds : 0;
  }
}

/** 馬券1枚の払い戻し額（コイン）。外れは0 */
export function payoutFor(bet: Bet, payouts: Payouts): number {
  const odds = oddsFor(bet, payouts);
  // オッズは0.1倍単位なので、100コイン単位の購入なら払い戻しは10コイン単位の整数になる
  return Math.round((bet.stake / BETTING.unit) * odds * 10) * (BETTING.unit / 10);
}

/** 買い目1点の、いまのオッズ（複勝・ワイドは幅） */
export function currentOdds(bet: Pick<Bet, 'type' | 'selection'>, market: Market, boardIndex = market.boards.length - 1) {
  const board = market.boards[boardIndex];
  const key = combinationKey(bet.type, bet.selection);
  switch (bet.type) {
    case 'win': {
      const o = board.win[bet.selection[0] - 1];
      return { min: o, max: o };
    }
    case 'place':
      return board.place[bet.selection[0] - 1];
    case 'wide':
      return board.wide.get(key)!;
    default: {
      const o = board[bet.type].get(key)!;
      return { min: o, max: o };
    }
  }
}

/** 購入時点の想定配当（複勝・ワイドは幅） */
export function expectedReturn(bet: Bet, market: Market, boardIndex = market.boards.length - 1) {
  const units = bet.stake / BETTING.unit;
  const o = currentOdds(bet, market, boardIndex);
  return { min: units * o.min * BETTING.unit, max: units * o.max * BETTING.unit };
}

/** 着順どおりの券種か */
export function isOrdered(bet: Pick<Bet, 'type'>): boolean {
  return BET_TYPE_ORDERED[bet.type];
}
