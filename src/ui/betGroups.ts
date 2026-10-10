import { BET_TYPE_LABEL, BET_TYPE_ORDERED, type Bet } from '../betting';

/** 馬券1点の表示（例：「3連単 5→1→3」「馬連 1-5」） */
export function betLabel(bet: Bet): string {
  return `${BET_TYPE_LABEL[bet.type]} ${bet.selection.join(BET_TYPE_ORDERED[bet.type] ? '→' : '-')}`;
}

export interface BetGroupView<T> {
  key: string;
  /** まとめ買いはその買い方の表示、1点買いはその馬券の表示 */
  label: string;
  /** まとめ買いか */
  grouped: boolean;
  items: T[];
  /** 最初の馬券の添字（取消に使う） */
  firstIndex: number;
}

/** 馬券をまとめ買いごとにまとめる（1点買いはそれぞれ1つ） */
export function groupBets<T>(items: readonly T[], betOf: (item: T) => Bet): BetGroupView<T>[] {
  const out: BetGroupView<T>[] = [];
  const byGroup = new Map<number, BetGroupView<T>>();
  items.forEach((item, i) => {
    const bet = betOf(item);
    if (bet.group) {
      let g = byGroup.get(bet.group.id);
      if (!g) {
        g = { key: `g${bet.group.id}`, label: bet.group.label, grouped: true, items: [], firstIndex: i };
        byGroup.set(bet.group.id, g);
        out.push(g);
      }
      g.items.push(item);
    } else {
      out.push({ key: `b${i}`, label: betLabel(bet), grouped: false, items: [item], firstIndex: i });
    }
  });
  return out;
}
