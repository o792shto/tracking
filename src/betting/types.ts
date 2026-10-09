/** 単勝・複勝・馬連（ワイド・馬単・3連複・3連単は段階7） */
export type BetType = 'win' | 'place' | 'quinella';

export const BET_TYPE_LABEL: Record<BetType, string> = {
  win: '単勝',
  place: '複勝',
  quinella: '馬連',
};

/** 券種ごとに選ぶ頭数 */
export const BET_TYPE_PICKS: Record<BetType, number> = {
  win: 1,
  place: 1,
  quinella: 2,
};

export interface Bet {
  type: BetType;
  /** 馬番。馬連は小さい順に並べる */
  selection: number[];
  /** 購入額（コイン、100単位） */
  stake: number;
}

/** 券種ごとの投票（コイン）。payouts の計算に使う */
export interface Pools {
  /** win[i] = 馬番 i+1 への単勝票 */
  win: number[];
  place: number[];
  /** quinella[key] = 組み合わせへの馬連票。key は quinellaKey(a, b) */
  quinella: Map<string, number>;
}

/** 表示用のオッズ（倍） */
export interface OddsBoard {
  win: number[];
  /** 複勝は他にどの馬が来るかで変わるので幅で示す */
  place: { min: number; max: number }[];
  quinella: Map<string, number>;
  /** 単勝オッズから決めた人気順（popularity[i] = 馬番 i+1 の人気） */
  popularity: number[];
}

export interface Market {
  /** 発走前のオッズの推移（最後が確定オッズ） */
  boards: OddsBoard[];
  /** 確定時の投票。払い戻しはこれで計算する */
  pools: Pools;
  runners: number;
}

export function quinellaKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
