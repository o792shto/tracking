import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETTING, type Payouts } from '../betting';
import { SAVE_VERSION, STORAGE_KEY, createGameStore } from './game';
import { loadJSON, saveJSON } from './storage';

const payouts: Payouts = {
  win: { number: 3, odds: 2.5 },
  place: [
    { number: 3, odds: 1.3 },
    { number: 7, odds: 2.1 },
    { number: 1, odds: 1.6 },
  ],
  quinella: { key: '3-7', odds: 9.8 },
};

afterEach(() => vi.unstubAllGlobals());

describe('ゲームの状態', () => {
  it('買うとコインが減り、取り消すと戻る', () => {
    const store = createGameStore(false);
    expect(store.getState().buy({ type: 'win', selection: [3], stake: 500 })).toBeNull();
    expect(store.getState().coins).toBe(BETTING.initialCoins - 500);
    store.getState().cancel(0);
    expect(store.getState().coins).toBe(BETTING.initialCoins);
    expect(store.getState().placed).toHaveLength(0);
  });

  it('100単位でない金額、上限超え、所持コイン不足は買えない', () => {
    const store = createGameStore(false);
    const s = store.getState();
    expect(s.buy({ type: 'win', selection: [1], stake: 150 })).toMatch('単位');
    expect(s.buy({ type: 'win', selection: [1], stake: BETTING.raceLimit + 100 })).toMatch('上限');
    store.setState({ coins: 200 });
    expect(store.getState().buy({ type: 'win', selection: [1], stake: 300 })).toMatch('足りません');
  });

  it('確定すると払い戻しが加算され、成績が記録されて次のレースへ進む', () => {
    const store = createGameStore(false);
    const s = store.getState();
    s.buy({ type: 'win', selection: [3], stake: 1000 });
    s.buy({ type: 'quinella', selection: [7, 3], stake: 200 });
    s.buy({ type: 'place', selection: [5], stake: 300 });
    store.getState().settle(payouts, [3, 7, 1, 5], '汐見野競馬場');
    const after = store.getState();
    expect(after.coins).toBe(BETTING.initialCoins - 1500 + 2500 + 1960);
    expect(after.totals).toMatchObject({ spent: 1500, returned: 4460, bestPayout: 2500, races: 1, hitRaces: 1 });
    expect(after.raceIndex).toBe(1);
    expect(after.placed).toHaveLength(0);
    expect(after.history[0].tickets.map((t) => t.payout)).toEqual([2500, 1960, 0]);
    expect(after.screen).toBe('result');
  });

  it('コインが尽きたら救済ボーナスを受け取れる', () => {
    const store = createGameStore(false);
    store.setState({ coins: 50 });
    expect(store.getState().canRescue()).toBe(true);
    store.getState().claimRescue();
    expect(store.getState().coins).toBe(50 + BETTING.rescueBonus);
    expect(store.getState().canRescue()).toBe(false);
  });
});

describe('保存', () => {
  it('localStorage が使えなくても例外を出さない', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(loadJSON('x')).toBeNull();
    expect(() => saveJSON('x', { a: 1 })).not.toThrow();
    const store = createGameStore();
    expect(() => store.getState().buy({ type: 'win', selection: [1], stake: 100 })).not.toThrow();
  });

  it('所持コインと成績を保存して読み戻せる', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
    });
    const a = createGameStore();
    a.getState().buy({ type: 'win', selection: [3], stake: 1000 });
    a.getState().settle(payouts, [3, 7, 1], '汐見野競馬場');
    const b = createGameStore();
    expect(b.getState().coins).toBe(a.getState().coins);
    expect(b.getState().totals).toEqual(a.getState().totals);
    expect(b.getState().screen).toBe('top');
  });

  it('古い版の保存データは、コインと成績を引き継いでその日を最初からやり直す', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
    });
    const totals = { spent: 500, returned: 0, bestPayout: 0, races: 1, hitRaces: 0 };
    // 版の番号がない（段階4の頃の）データ。結果の馬番は今の番組の頭数を超えることがある
    mem.set(
      STORAGE_KEY,
      JSON.stringify({
        coins: 9000,
        meetingSeed: 3,
        raceIndex: 5,
        placed: [{ type: 'win', selection: [16], stake: 300 }],
        results: { 0: [18, 17, 16] },
        totals,
        history: [],
        rescues: 0,
      }),
    );
    const s = createGameStore().getState();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.coins).toBe(9300);
    expect(s.meetingSeed).toBe(3);
    expect(s.raceIndex).toBe(0);
    expect(s.placed).toEqual([]);
    expect(s.results).toEqual({});
    expect(s.totals).toEqual(totals);
  });
});
