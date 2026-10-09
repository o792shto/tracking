import { describe, expect, it } from 'vitest';
import { layoutMode } from './useLayout';

describe('観戦画面のレイアウト', () => {
  it('幅768px未満の縦長はスマホ縦、高さの足りない横長はスマホ横、それ以外はPC', () => {
    expect(layoutMode(390, 844)).toBe('compact');
    expect(layoutMode(767, 1000)).toBe('compact');
    expect(layoutMode(844, 390)).toBe('short');
    expect(layoutMode(667, 375)).toBe('short');
    expect(layoutMode(768, 1024)).toBe('wide');
    expect(layoutMode(1280, 800)).toBe('wide');
  });
});
