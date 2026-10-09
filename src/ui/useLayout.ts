import { useEffect, useState } from 'react';

/**
 * 観戦画面のレイアウト。
 * - wide：PC（横長）。コース図＋右に順位表、下にラップ
 * - short：スマホの横向き（高さが足りない横長）。PCに近い並びで、ラップは右のタブへ
 * - compact：幅768px未満の縦長。コース図を上に、下にタブ（順位／ラップ／馬券）と操作
 */
export type LayoutMode = 'wide' | 'short' | 'compact';

const SHORT_HEIGHT = 560;
const COMPACT_WIDTH = 768;

export function layoutMode(width: number, height: number): LayoutMode {
  if (width > height && height < SHORT_HEIGHT) return 'short';
  if (width < COMPACT_WIDTH) return 'compact';
  return 'wide';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => layoutMode(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const update = () => setMode(layoutMode(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return mode;
}
