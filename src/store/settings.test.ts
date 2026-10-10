import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from './settings';

afterEach(() => vi.unstubAllGlobals());

describe('設定', () => {
  it('軽量モードと効果音はデフォルトでオフ、変更は保存されて読み戻せる', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
    });
    const a = createSettingsStore();
    expect(a.getState()).toMatchObject({ lite: false, sound: false, commentary: true });
    a.getState().setLite(true);
    a.getState().setSound(true);
    expect(createSettingsStore().getState()).toMatchObject({ lite: true, sound: true });
  });

  it('localStorage が使えなくても例外を出さない', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
    });
    const s = createSettingsStore();
    expect(() => s.getState().setLite(true)).not.toThrow();
    expect(s.getState().lite).toBe(true);
  });
});
