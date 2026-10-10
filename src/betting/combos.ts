import { BET_METHOD_LABEL, BET_TYPE_LABEL, BET_TYPE_ORDERED, BET_TYPE_PICKS, combinationKey, type BetMethod, type BetType } from './types';

/**
 * 買い方ごとに選んだ馬。
 * - 通常：picks に選んだ順（馬単・3連単は着順）
 * - ボックス：picks に選んだ馬すべて
 * - 流し：axis に軸（3連系は1〜2頭、馬単・3連単は軸が1着・2着）、partners に相手
 * - フォーメーション：columns[i] に i 頭目（馬単・3連単は i+1 着）の候補
 */
export interface PickSlots {
  picks: number[];
  axis: number[];
  partners: number[];
  columns: number[][];
}

export const EMPTY_SLOTS: PickSlots = { picks: [], axis: [], partners: [], columns: [[], [], []] };

/** その券種で使える買い方（1頭を選ぶ単勝・複勝は通常のみ） */
export function methodsFor(type: BetType): BetMethod[] {
  return BET_TYPE_PICKS[type] === 1 ? ['single'] : ['single', 'box', 'nagashi', 'formation'];
}

/** 流しの軸の最大頭数（2頭の券種は1頭、3頭の券種は2頭まで） */
export function maxAxis(type: BetType): number {
  return BET_TYPE_PICKS[type] === 3 ? 2 : 1;
}

/** n 頭から k 頭を選ぶ組み合わせ（順不同） */
function combinations(items: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i]]);
  };
  rec(0, []);
  return out;
}

/** n 頭から k 頭を並べる順列 */
function permutations(items: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (const x of items) if (!acc.includes(x)) rec([...acc, x]);
  };
  rec([]);
  return out;
}

/** 選んだ馬から、買い目（1点ずつの馬番の並び）を作る。重複は除く */
export function expandSelections(type: BetType, method: BetMethod, slots: PickSlots): number[][] {
  const k = BET_TYPE_PICKS[type];
  const ordered = BET_TYPE_ORDERED[type];
  let raw: number[][] = [];
  switch (method) {
    case 'single':
      raw = slots.picks.length === k ? [slots.picks.slice(0, k)] : [];
      break;
    case 'box':
      raw = slots.picks.length >= k ? (ordered ? permutations(slots.picks, k) : combinations(slots.picks, k)) : [];
      break;
    case 'nagashi': {
      const axis = slots.axis.slice(0, maxAxis(type));
      const partners = slots.partners.filter((x) => !axis.includes(x));
      const rest = k - axis.length;
      if (axis.length === 0 || rest <= 0 || partners.length < rest) break;
      // 馬単・3連単は軸が上の着順（1着、2頭軸なら1・2着）、相手が残りの着順
      raw = (ordered ? permutations(partners, rest) : combinations(partners, rest)).map((p) => [...axis, ...p]);
      break;
    }
    case 'formation': {
      const cols = slots.columns.slice(0, k);
      if (cols.length < k || cols.some((c) => c.length === 0)) break;
      const rec = (i: number, acc: number[]) => {
        if (i === k) {
          raw.push([...acc]);
          return;
        }
        for (const x of cols[i]) if (!acc.includes(x)) rec(i + 1, [...acc, x]);
      };
      rec(0, []);
      break;
    }
  }
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const sel of raw) {
    const normalized = ordered ? sel : [...sel].sort((a, b) => a - b);
    const key = combinationKey(type, normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** まとめ買いの表示（例：「3連単 流し 軸5 → 1・3・7」） */
export function groupLabel(type: BetType, method: BetMethod, slots: PickSlots): string {
  const dots = (xs: number[]) => [...xs].sort((a, b) => a - b).join('・');
  const head = `${BET_TYPE_LABEL[type]} ${BET_METHOD_LABEL[method]}`;
  const k = BET_TYPE_PICKS[type];
  switch (method) {
    case 'single':
      return `${BET_TYPE_LABEL[type]} ${slots.picks.join(BET_TYPE_ORDERED[type] ? '→' : '-')}`;
    case 'box':
      return `${head} ${dots(slots.picks)}`;
    case 'nagashi':
      return `${head} 軸${slots.axis.slice(0, maxAxis(type)).join(BET_TYPE_ORDERED[type] ? '→' : '・')} → ${dots(slots.partners.filter((x) => !slots.axis.includes(x)))}`;
    case 'formation':
      return `${head} ${slots.columns
        .slice(0, k)
        .map(dots)
        .join(' → ')}`;
  }
}
