import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { BETTING, BET_TYPE_ORDERED, payoutFor, type Bet, type Payouts } from '../betting';
import { loadJSON, removeKey, saveJSON } from './storage';

export const STORAGE_KEY = 'keiba-tracking/save-v1';
/**
 * 保存データの形式の版。番組（週ごとのレース）が変わったら上げる。
 * 古い版のデータは、コイン・成績は引き継ぎ、その週の進み具合（結果・未精算の馬券）はやり直す
 */
export const SAVE_VERSION = 7;

export type Screen = 'top' | 'card' | 'watch' | 'result' | 'record' | 'data';
/** データ画面のタブ */
export type DataTab = 'calendar' | 'ranking' | 'graded' | 'awards' | 'news';

export interface Ticket {
  bet: Bet;
  payout: number;
}

/** 1レース分の成績 */
export interface RaceRecord {
  /** 通算の週 */
  serial: number;
  raceNo: number;
  venue: string;
  /** レース名（古い記録にはない） */
  raceName?: string;
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
  /** 通算の週（名簿の世界の週と同じ） */
  serial: number;
  /** その週の観戦レースの何番目か */
  raceIndex: number;
  placed: Bet[];
  results: Record<number, number[]>;
  /** その週の観戦レースの最終の単勝人気（キーはレースのキー、値は馬番順）。名簿の成績に残す */
  popularity: Record<string, number[]>;
  totals: Totals;
  history: RaceRecord[];
  /** 週ごとの入金を最後に受け取った週 */
  depositedSerial: number;
}

/** 確定したレースの情報（成績・名簿に残す） */
export interface SettledRace {
  venue: string;
  /** レース番号（10R〜12R） */
  no: number;
  raceName: string;
  key: string;
  popularity: number[];
}

export interface GameState extends SaveData {
  screen: Screen;
  dataTab: DataTab;
  /** 馬の詳細を開いている馬（名簿の id） */
  horseId: number | null;
  /** 直前に確定したレースの払い戻し（結果画面用） */
  lastSettlement: { raceIndex: number; tickets: Ticket[]; payouts: Payouts } | null;
}

export interface GameActions {
  go: (screen: Screen) => void;
  openData: (tab: DataTab) => void;
  showHorse: (id: number | null) => void;
  /** 馬券を買う。買えないときは理由を返す */
  buy: (bet: Bet | Bet[]) => string | null;
  /** 発走前なら取り消して返金する */
  /** 発走前なら取り消して返金する。まとめ買いの馬券は同じ買い方の馬券をまとめて取り消す */
  cancel: (index: number) => void;
  /** レースが確定したら払い戻して次のレースへ進める */
  settle: (payouts: Payouts, finishOrder: number[], race: SettledRace) => void;
  /**
   * 新しい週に入る（名簿の世界が進んだあとに呼ぶ）。その週の進み具合をやり直し、週ごとの入金を受け取る。
   * 残っている馬券は返金する
   */
  beginWeek: (serial: number) => void;
  /** 進み具合（コイン・成績・週）をすべて最初に戻す */
  resetAll: () => void;
}

const HISTORY_LIMIT = 30;

function initialData(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: BETTING.initialCoins,
    serial: 0,
    raceIndex: 0,
    placed: [],
    results: {},
    popularity: {},
    totals: { spent: 0, returned: 0, bestPayout: 0, races: 0, hitRaces: 0 },
    history: [],
    depositedSerial: 0,
  };
}

function isSaveData(x: unknown): x is SaveData {
  const d = x as SaveData;
  return !!d && typeof d.coins === 'number' && Array.isArray(d.placed) && typeof d.totals === 'object';
}

/**
 * 古い版の保存データは、レースが今の番組と合わないので週の初めからやり直す（買った馬券は返金）。
 * 開催日ごとの番組だった版（6以前）は、コインと成績だけ引き継いでゲーム開始の週から
 */
export function migrate(saved: SaveData): SaveData {
  const data = { ...initialData(), ...saved };
  if (saved.version === SAVE_VERSION) return data;
  const history = (data.history ?? []).map((r) => ({ ...r, serial: r.serial ?? 0 }));
  return {
    ...initialData(),
    coins: data.coins + placedTotal(data.placed),
    totals: data.totals,
    history,
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
    dataTab: 'calendar',
    horseId: null,
    lastSettlement: null,

    go: (screen) => set({ screen }),
    openData: (tab) => set({ screen: 'data', dataTab: tab }),
    showHorse: (id) => set({ horseId: id }),

    buy: (bet) => {
      const bets = Array.isArray(bet) ? bet : [bet];
      const { coins, placed } = get();
      if (bets.length === 0) return '買い目がありません';
      if (bets.some((b) => !Number.isInteger(b.stake) || b.stake <= 0 || b.stake % BETTING.unit !== 0)) {
        return `金額は${BETTING.unit}コイン単位で入力してください`;
      }
      const cost = placedTotal(bets);
      if (cost > coins) return '所持コインが足りません';
      // 順不同の券種は馬番を小さい順にそろえる。まとめて買うときは全部買えるときだけ買う
      const normalized = bets.map((b) => ({
        ...b,
        selection: BET_TYPE_ORDERED[b.type] ? [...b.selection] : [...b.selection].sort((x, y) => x - y),
      }));
      set({ coins: coins - cost, placed: [...placed, ...normalized] });
      return null;
    },

    cancel: (index) => {
      const { placed, coins } = get();
      const bet = placed[index];
      if (!bet) return;
      const same = (b: Bet, i: number) => (bet.group ? b.group?.id === bet.group.id : i === index);
      const refund = placedTotal(placed.filter(same));
      set({ coins: coins + refund, placed: placed.filter((b, i) => !same(b, i)) });
    },

    settle: (payouts, finishOrder, race) => {
      const s = get();
      const tickets = s.placed.map((bet) => ({ bet, payout: payoutFor(bet, payouts) }));
      const spent = placedTotal(s.placed);
      const returned = tickets.reduce((a, t) => a + t.payout, 0);
      const best = Math.max(0, ...tickets.map((t) => t.payout));
      const bought = tickets.length > 0;
      const record: RaceRecord = {
        serial: s.serial,
        raceNo: race.no,
        venue: race.venue,
        raceName: race.raceName,
        tickets,
        spent,
        returned,
      };
      set({
        coins: s.coins + returned,
        placed: [],
        results: { ...s.results, [s.raceIndex]: finishOrder.slice(0, 3) },
        popularity: { ...s.popularity, [race.key]: race.popularity },
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

    beginWeek: (serial) => {
      const s = get();
      // 週ごとの入金（まだ受け取っていない週の数だけ）
      const weeks = Math.max(0, serial - s.depositedSerial);
      set({
        serial,
        raceIndex: s.serial === serial ? s.raceIndex : 0,
        results: s.serial === serial ? s.results : {},
        popularity: s.serial === serial ? s.popularity : {},
        placed: s.serial === serial ? s.placed : [],
        coins: s.coins + (s.serial === serial ? 0 : placedTotal(s.placed)) + weeks * BETTING.weeklyDeposit,
        depositedSerial: Math.max(s.depositedSerial, serial),
        lastSettlement: s.serial === serial ? s.lastSettlement : null,
        screen: s.serial === serial ? s.screen : 'top',
      });
    },

    resetAll: () => {
      removeKey(STORAGE_KEY);
      set({ ...initialData(), screen: 'top', lastSettlement: null, horseId: null });
    },
  }));

  store.subscribe((s) => {
    const save: SaveData = {
      version: SAVE_VERSION,
      coins: s.coins,
      serial: s.serial,
      raceIndex: s.raceIndex,
      placed: s.placed,
      results: s.results,
      popularity: s.popularity,
      totals: s.totals,
      history: s.history,
      depositedSerial: s.depositedSerial,
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

export function getGameStore(): GameStore {
  return getAppStore();
}

export function useGame<T>(selector: (s: GameState & GameActions) => T): T {
  return useStore(getAppStore(), selector);
}
