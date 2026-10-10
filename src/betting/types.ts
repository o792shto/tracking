/** 券種 */
export type BetType = 'win' | 'place' | 'quinella' | 'wide' | 'exacta' | 'trio' | 'trifecta';

export const BET_TYPES: readonly BetType[] = ['win', 'place', 'quinella', 'wide', 'exacta', 'trio', 'trifecta'];

export const BET_TYPE_LABEL: Record<BetType, string> = {
  win: '単勝',
  place: '複勝',
  quinella: '馬連',
  wide: 'ワイド',
  exacta: '馬単',
  trio: '3連複',
  trifecta: '3連単',
};

/** 券種ごとに選ぶ頭数 */
export const BET_TYPE_PICKS: Record<BetType, number> = {
  win: 1,
  place: 1,
  quinella: 2,
  wide: 2,
  exacta: 2,
  trio: 3,
  trifecta: 3,
};

/** 着順どおりに当てる券種（馬単・3連単） */
export const BET_TYPE_ORDERED: Record<BetType, boolean> = {
  win: false,
  place: false,
  quinella: false,
  wide: false,
  exacta: true,
  trio: false,
  trifecta: true,
};

/** 買い方：通常・ボックス・流し・フォーメーション */
export type BetMethod = 'single' | 'box' | 'nagashi' | 'formation';

export const BET_METHOD_LABEL: Record<BetMethod, string> = {
  single: '通常',
  box: 'ボックス',
  nagashi: '流し',
  formation: 'フォーメーション',
};

/** ボックス・流し・フォーメーションでまとめて買った馬券の目印 */
export interface BetGroup {
  id: number;
  method: BetMethod;
  /** 表示用（例：「3連単 ボックス 1・3・5・7」） */
  label: string;
}

export interface Bet {
  type: BetType;
  /** 馬番。順不同の券種は小さい順、着順どおりの券種は1着から */
  selection: number[];
  /** 購入額（コイン、100単位） */
  stake: number;
  /** まとめ買いのとき、同じ買い方の馬券に共通の目印 */
  group?: BetGroup;
}

/** 組み合わせのキー。順不同の券種は「1-3-5」、着順どおりの券種は「5>1>3」 */
export function combinationKey(type: BetType, selection: readonly number[]): string {
  if (BET_TYPE_ORDERED[type]) return selection.join('>');
  return [...selection].sort((a, b) => a - b).join('-');
}

/** 馬連・ワイドのキー（順不同の2頭） */
export function quinellaKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** 組み合わせで買う券種（馬連〜3連単）の券種 */
export type ComboType = Exclude<BetType, 'win' | 'place'>;
export const COMBO_TYPES: readonly ComboType[] = ['quinella', 'wide', 'exacta', 'trio', 'trifecta'];

/** 券種ごとの投票（コイン）。払い戻しの計算に使う */
export interface Pools {
  /** win[i] = 馬番 i+1 への単勝票 */
  win: number[];
  place: number[];
  /** 組み合わせの券種：キー（combinationKey）→ 票 */
  quinella: Map<string, number>;
  wide: Map<string, number>;
  exacta: Map<string, number>;
  trio: Map<string, number>;
  trifecta: Map<string, number>;
}

/** 表示用のオッズ（倍） */
export interface OddsBoard {
  win: number[];
  /** 複勝は他にどの馬が来るかで変わるので幅で示す */
  place: { min: number; max: number }[];
  quinella: Map<string, number>;
  /** ワイドも複勝と同じく幅で示す */
  wide: Map<string, { min: number; max: number }>;
  exacta: Map<string, number>;
  trio: Map<string, number>;
  trifecta: Map<string, number>;
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
