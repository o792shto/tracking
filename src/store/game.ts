import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { BETTING, payoutFor, type Bet, type Payouts } from '../betting';
import { RACES_PER_MEETING } from '../sim/meeting';
import { loadJSON, removeKey, saveJSON } from './storage';

export const STORAGE_KEY = 'keiba-tracking/save-v1';
/**
 * 保存データの形式の版。番組（開催日ごとのレース）が変わったら上げる。
 * 古い版のデータは、コイン・成績は引き継ぎ、その日の進み具合（結果・未精算の馬券）はやり直す
 */
export const SAVE_VERSION = 5;

export type Screen = 'top' | 'card' | 'watch' | 'result' | 'record';

export interface Ticket {
  bet: Bet;
  payout: number;
}

/** 1レース分の成績 */
export interface RaceRecord {
  meetingSeed: number;
  raceNo: number;
  venue: string;
  tickets: Ticket[];
  spent: number;
  returned: number;
}

export interface Totals {
  spent: number;
  returned: number;
  /** 1枚の馬券での最高払い戻し */
  bestPayout: number;
  /** 馬券を買ったレース数と、そのうち1枚でも的中したレース数 */
  races: number;
  hitRaces: number;
}

/** 保存する部分 */
interface SaveData {
  version: number;
  coins: number;
  meetingSeed: number;
  raceIndex: number;
  placed: Bet[];
  results: Record<number, number[]>;
  totals: Totals;
  history: RaceRecord[];
  /** 再入金した回数 */
  redeposits: number;
}

export interface GameState extends SaveData {
  screen: Screen;
  /** 直前に確定したレースの払い戻し（結果画面用） */
  lastSettlement: { raceIndex: number; tickets: Ticket[]; payouts: Payouts } | null;
}

export interface GameActions {
  go: (screen: Screen) => void;
  /** 馬券を買う。買えないときは理由を返す */
  buy: (bet: Bet) => string | null;
  /** 発走前なら取り消して返金する */
  cancel: (index: number) => void;
  /** レースが確定したら払い戻して次のレースへ進める */
  settle: (payouts: Payouts, finishOrder: number[], venue: string) => void;
  nextMeeting: () => void;
  /** 次の開催日へ進む。いまのレースに買った馬券があれば、その結果で精算してから進む */
  skipDay: (current: { payouts: Payouts; finishOrder: number[]; venue: string } | null) => void;
  /** 所持コインが尽きた（購入の単位未満で、買った馬券もない）ら再入金できる */
  canRedeposit: () => boolean;
  redeposit: () => void;
  resetAll: () => void;
}

const HISTORY_LIMIT = 30;

function initialData(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: BETTING.initialCoins,
    meetingSeed: 1,
    raceIndex: 0,
    placed: [],
    results: {},
    totals: { spent: 0, returned: 0, bestPayout: 0, races: 0, hitRaces: 0 },
    history: [],
    redeposits: 0,
  };
}

function isSaveData(x: unknown): x is SaveData {
  const d = x as SaveData;
  return !!d && typeof d.coins === 'number' && Array.isArray(d.placed) && typeof d.totals === 'object';
}

/** 古い版の保存データは、その日のレースが今の番組と合わないので、日の初めからやり直す（買った馬券は返金） */
export function migrate(saved: SaveData): SaveData {
  const data = { ...initialData(), ...saved };
  if (saved.version === SAVE_VERSION) return data;
  return {
    ...data,
    version: SAVE_VERSION,
    coins: data.coins + placedTotal(data.placed),
    raceIndex: 0,
    placed: [],
    results: {},
  };
}

export function placedTotal(placed: Bet[]): number {
  return placed.reduce((a, b) => a + b.stake, 0);
}

export function createGameStore(load = true) {
  const saved = load ? loadJSON<unknown>(STORAGE_KEY) : null;
  const data = isSaveData(saved) ? migrate(saved) : initialData();

  const store = createStore<GameState & GameActions>()((set, get) => ({
    ...data,
    screen: 'top',
    lastSettlement: null,

    go: (screen) => set({ screen }),

    buy: (bet) => {
      const { coins, placed, raceIndex } = get();
      if (raceIndex >= RACES_PER_MEETING) return 'この開催のレースは終わりました';
      if (!Number.isInteger(bet.stake) || bet.stake <= 0 || bet.stake % BETTING.unit !== 0) {
        return `金額は${BETTING.unit}コイン単位で入力してください`;
      }
      if (bet.stake > coins) return '所持コインが足りません';
      const selection = bet.type === 'quinella' ? [...bet.selection].sort((a, b) => a - b) : bet.selection;
      set({ coins: coins - bet.stake, placed: [...placed, { ...bet, selection }] });
      return null;
    },

    cancel: (index) => {
      const { placed, coins } = get();
      const bet = placed[index];
      if (!bet) return;
      set({ coins: coins + bet.stake, placed: placed.filter((_, i) => i !== index) });
    },

    settle: (payouts, finishOrder, venue) => {
      const s = get();
      const tickets = s.placed.map((bet) => ({ bet, payout: payoutFor(bet, payouts) }));
      const spent = placedTotal(s.placed);
      const returned = tickets.reduce((a, t) => a + t.payout, 0);
      const best = Math.max(0, ...tickets.map((t) => t.payout));
      const bought = tickets.length > 0;
      const record: RaceRecord = {
        meetingSeed: s.meetingSeed,
        raceNo: s.raceIndex + 1,
        venue,
        tickets,
        spent,
        returned,
      };
      set({
        coins: s.coins + returned,
        placed: [],
        results: { ...s.results, [s.raceIndex]: finishOrder.slice(0, 3) },
        totals: {
          spent: s.totals.spent + spent,
          returned: s.totals.returned + returned,
          bestPayout: Math.max(s.totals.bestPayout, best),
          races: s.totals.races + (bought ? 1 : 0),
          hitRaces: s.totals.hitRaces + (returned > 0 ? 1 : 0),
        },
        history: bought ? [record, ...s.history].slice(0, HISTORY_LIMIT) : s.history,
        lastSettlement: { raceIndex: s.raceIndex, tickets, payouts },
        raceIndex: s.raceIndex + 1,
        screen: 'result',
      });
    },

    nextMeeting: () => set((s) => ({ meetingSeed: s.meetingSeed + 1, raceIndex: 0, results: {}, screen: 'top' })),

    skipDay: (current) => {
      if (current && get().placed.length > 0) get().settle(current.payouts, current.finishOrder, current.venue);
      get().nextMeeting();
    },

    canRedeposit: () => {
      const s = get();
      return s.coins < BETTING.unit && s.placed.length === 0;
    },

    redeposit: () => {
      if (!get().canRedeposit()) return;
      set((s) => ({ coins: s.coins + BETTING.redeposit, redeposits: s.redeposits + 1 }));
    },

    resetAll: () => {
      removeKey(STORAGE_KEY);
      set({ ...initialData(), screen: 'top', lastSettlement: null });
    },
  }));

  store.subscribe((s) => {
    const save: SaveData = {
      version: SAVE_VERSION,
      coins: s.coins,
      meetingSeed: s.meetingSeed,
      raceIndex: s.raceIndex,
      placed: s.placed,
      results: s.results,
      totals: s.totals,
      history: s.history,
      redeposits: s.redeposits,
    };
    saveJSON(STORAGE_KEY, save);
  });
  return store;
}

export type GameStore = ReturnType<typeof createGameStore>;

let appStore: GameStore | null = null;
function getAppStore(): GameStore {
  appStore ??= createGameStore();
  return appStore;
}

export function useGame<T>(selector: (s: GameState & GameActions) => T): T {
  return useStore(getAppStore(), selector);
}
