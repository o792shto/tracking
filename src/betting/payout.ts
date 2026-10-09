import { BETTING } from './params';
import { placeCount, settledPlaceOdds } from './market';
import { quinellaKey, type Bet, type Market } from './types';

/** レースの払い戻し（100コインあたりではなく、倍率で持つ） */
export interface Payouts {
  win: { number: number; odds: number };
  place: { number: number; odds: number }[];
  quinella: { key: string; odds: number };
}

/** 確定した着順（馬番の配列、1着から）から各券種の配当を出す */
export function settle(market: Market, finishOrder: number[]): Payouts {
  const finalBoard = market.boards[market.boards.length - 1];
  const winner = finishOrder[0];
  const placed = finishOrder.slice(0, placeCount(market.runners));
  const placeOdds = settledPlaceOdds(market.pools, placed);
  const key = quinellaKey(finishOrder[0], finishOrder[1]);
  return {
    win: { number: winner, odds: finalBoard.win[winner - 1] },
    place: placed.map((number) => ({ number, odds: placeOdds.get(number)! })),
    quinella: { key, odds: finalBoard.quinella.get(key)! },
  };
}

/** 着順がこのとおりなら的中か（観戦中の「現在の着順なら」にも使う） */
export function isHit(bet: Bet, order: number[], runners: number): boolean {
  switch (bet.type) {
    case 'win':
      return order[0] === bet.selection[0];
    case 'place':
      return order.slice(0, placeCount(runners)).includes(bet.selection[0]);
    case 'quinella':
      return quinellaKey(order[0], order[1]) === quinellaKey(bet.selection[0], bet.selection[1]);
  }
}

/** 馬券1枚の払い戻し額（コイン）。外れは0 */
export function payoutFor(bet: Bet, payouts: Payouts): number {
  let odds = 0;
  switch (bet.type) {
    case 'win':
      odds = payouts.win.number === bet.selection[0] ? payouts.win.odds : 0;
      break;
    case 'place':
      odds = payouts.place.find((p) => p.number === bet.selection[0])?.odds ?? 0;
      break;
    case 'quinella':
      odds =
        payouts.quinella.key === quinellaKey(bet.selection[0], bet.selection[1]) ? payouts.quinella.odds : 0;
      break;
  }
  // オッズは0.1倍単位なので、100コイン単位の購入なら払い戻しは10コイン単位の整数になる
  return Math.round((bet.stake / BETTING.unit) * odds * 10) * (BETTING.unit / 10);
}

/** 購入時点の想定配当（複勝は幅） */
export function expectedReturn(bet: Bet, market: Market, boardIndex = market.boards.length - 1) {
  const board = market.boards[boardIndex];
  const units = bet.stake / BETTING.unit;
  switch (bet.type) {
    case 'win': {
      const o = board.win[bet.selection[0] - 1];
      return { min: units * o * BETTING.unit, max: units * o * BETTING.unit };
    }
    case 'place': {
      const o = board.place[bet.selection[0] - 1];
      return { min: units * o.min * BETTING.unit, max: units * o.max * BETTING.unit };
    }
    case 'quinella': {
      const o = board.quinella.get(quinellaKey(bet.selection[0], bet.selection[1]))!;
      return { min: units * o * BETTING.unit, max: units * o * BETTING.unit };
    }
  }
}
