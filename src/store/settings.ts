import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { loadJSON, saveJSON } from './storage';

const SETTINGS_KEY = 'keiba-tracking/settings-v1';

/** 表示・音の設定（ゲームの進み具合とは別に保存する） */
export interface Settings {
  /** 軽量モード：軌跡・発光・グリッドを省き、解像度を抑える */
  lite: boolean;
  /** 効果音（デフォルトはオフ） */
  sound: boolean;
  /** 実況の字幕（デフォルトはオン） */
  commentary: boolean;
  /** ライトモード（デフォルトはオフ＝暗い画面） */
  light: boolean;
}

export interface SettingsActions {
  setLite: (on: boolean) => void;
  setSound: (on: boolean) => void;
  setCommentary: (on: boolean) => void;
  setLight: (on: boolean) => void;
}

const DEFAULTS: Settings = { lite: false, sound: false, commentary: true, light: false };
const KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

export function createSettingsStore(load = true) {
  const saved = load ? loadJSON<Partial<Settings>>(SETTINGS_KEY) : null;
  const data = { ...DEFAULTS };
  for (const key of KEYS) if (typeof saved?.[key] === 'boolean') data[key] = saved[key]!;
  const store = createStore<Settings & SettingsActions>()((set) => ({
    ...data,
    setLite: (lite) => set({ lite }),
    setSound: (sound) => set({ sound }),
    setCommentary: (commentary) => set({ commentary }),
    setLight: (light) => set({ light }),
  }));
  store.subscribe((s) => saveJSON(SETTINGS_KEY, Object.fromEntries(KEYS.map((k) => [k, s[k]]))));
  return store;
}

let settingsStore: ReturnType<typeof createSettingsStore> | null = null;
export function getSettingsStore() {
  settingsStore ??= createSettingsStore();
  return settingsStore;
}

export function useSettings<T>(selector: (s: Settings & SettingsActions) => T): T {
  return useStore(getSettingsStore(), selector);
}
