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
}

export interface SettingsActions {
  setLite: (on: boolean) => void;
  setSound: (on: boolean) => void;
}

const DEFAULTS: Settings = { lite: false, sound: false };

export function createSettingsStore(load = true) {
  const saved = load ? loadJSON<Partial<Settings>>(SETTINGS_KEY) : null;
  const data: Settings = {
    lite: typeof saved?.lite === 'boolean' ? saved.lite : DEFAULTS.lite,
    sound: typeof saved?.sound === 'boolean' ? saved.sound : DEFAULTS.sound,
  };
  const store = createStore<Settings & SettingsActions>()((set) => ({
    ...data,
    setLite: (lite) => set({ lite }),
    setSound: (sound) => set({ sound }),
  }));
  store.subscribe((s) => saveJSON(SETTINGS_KEY, { lite: s.lite, sound: s.sound }));
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
