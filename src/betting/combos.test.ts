import { describe, expect, it } from 'vitest';
import { EMPTY_SLOTS, expandSelections, groupLabel, type PickSlots } from './combos';

const slots = (s: Partial<PickSlots>): PickSlots => ({ ...EMPTY_SLOTS, ...s });

describe('買い方の展開', () => {
  it('通常：選んだ馬そのまま（順不同の券種は小さい順、着順の券種は選んだ順）', () => {
    expect(expandSelections('quinella', 'single', slots({ picks: [7, 3] }))).toEqual([[3, 7]]);
    expect(expandSelections('trifecta', 'single', slots({ picks: [7, 3, 5] }))).toEqual([[7, 3, 5]]);
    expect(expandSelections('trio', 'single', slots({ picks: [7, 3] }))).toEqual([]);
  });

  it('ボックス：順不同は組み合わせ、着順は順列', () => {
    expect(expandSelections('quinella', 'box', slots({ picks: [1, 2, 3, 4] }))).toHaveLength(6);
    expect(expandSelections('wide', 'box', slots({ picks: [1, 2, 3] }))).toHaveLength(3);
    expect(expandSelections('exacta', 'box', slots({ picks: [1, 2, 3] }))).toHaveLength(6);
    expect(expandSelections('trio', 'box', slots({ picks: [1, 2, 3, 4, 5] }))).toHaveLength(10);
    expect(expandSelections('trifecta', 'box', slots({ picks: [1, 2, 3, 4] }))).toHaveLength(24);
  });

  it('流し：軸＋相手。馬単・3連単は軸が上の着順', () => {
    expect(expandSelections('quinella', 'nagashi', slots({ axis: [5], partners: [1, 2, 3] }))).toEqual([
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    expect(expandSelections('exacta', 'nagashi', slots({ axis: [5], partners: [1, 2] }))).toEqual([
      [5, 1],
      [5, 2],
    ]);
    // 3連複 軸1頭：相手から2頭
    expect(expandSelections('trio', 'nagashi', slots({ axis: [5], partners: [1, 2, 3, 4] }))).toHaveLength(6);
    // 3連複 軸2頭：相手から1頭
    expect(expandSelections('trio', 'nagashi', slots({ axis: [5, 6], partners: [1, 2, 3] }))).toHaveLength(3);
    // 3連単 1着固定：相手の順列
    expect(expandSelections('trifecta', 'nagashi', slots({ axis: [5], partners: [1, 2, 3] }))).toHaveLength(6);
    // 相手に軸と同じ馬がいても数えない
    expect(expandSelections('quinella', 'nagashi', slots({ axis: [5], partners: [5, 1] }))).toEqual([[1, 5]]);
  });

  it('フォーメーション：列ごとの候補の組み合わせ（同じ馬の重なりと、順不同の重複は除く）', () => {
    // 3連単 1着{1,2} 2着{1,2,3} 3着{1,2,3,4}
    const tri = expandSelections('trifecta', 'formation', slots({ columns: [[1, 2], [1, 2, 3], [1, 2, 3, 4]] }));
    expect(tri).toHaveLength(8); // 1→2→{3,4}、1→3→{2,4}、2→1→{3,4}、2→3→{1,4}
    expect(new Set(tri.map((s) => s.join('>'))).size).toBe(tri.length);
    // 3連複 {1,2}-{1,2,3}-{3,4}：重複を除く
    const trio = expandSelections('trio', 'formation', slots({ columns: [[1, 2], [1, 2, 3], [3, 4]] }));
    expect(trio.map((s) => s.join('-')).sort()).toEqual(['1-2-3', '1-2-4', '1-3-4', '2-3-4']);
  });

  it('表示のラベル', () => {
    expect(groupLabel('trifecta', 'box', slots({ picks: [7, 1, 3] }))).toBe('3連単 ボックス 1・3・7');
    expect(groupLabel('exacta', 'nagashi', slots({ axis: [5], partners: [3, 1] }))).toBe('馬単 流し 軸5 → 1・3');
  });
});
