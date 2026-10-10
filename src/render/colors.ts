/** 枠色（1〜8枠）。暗い背景で見分けやすいよう明度を調整したオリジナルの色 */
export const FRAME_COLORS: readonly { fill: string; text: string; stroke: string }[] = [
  { fill: '#eef1f4', text: '#11161d', stroke: '#8d99a6' },
  { fill: '#2a2f38', text: '#f2f5f8', stroke: '#9aa6b5' },
  { fill: '#e5484d', text: '#ffffff', stroke: '#ff8f92' },
  { fill: '#3a7bf0', text: '#ffffff', stroke: '#8cb4ff' },
  { fill: '#f2c230', text: '#1a1505', stroke: '#ffe18a' },
  { fill: '#2fae6a', text: '#ffffff', stroke: '#7fe0a8' },
  { fill: '#f08a24', text: '#1d1003', stroke: '#ffbf80' },
  { fill: '#ea6aa6', text: '#ffffff', stroke: '#ffadd2' },
];

export function frameColor(frame: number) {
  return FRAME_COLORS[(frame - 1) % 8];
}

const DARK_TRACK = {
  background: '#071019',
  grid: 'rgba(80, 160, 190, 0.06)',
  turf: 'rgba(40, 120, 80, 0.20)',
  dirt: 'rgba(150, 110, 60, 0.20)',
  rail: 'rgba(150, 230, 255, 0.75)',
  outerRail: 'rgba(150, 230, 255, 0.30)',
  pole: 'rgba(150, 230, 255, 0.9)',
  poleLabel: 'rgba(190, 235, 255, 0.85)',
  goal: '#ffd166',
  start: 'rgba(190, 235, 255, 0.55)',
  focusRing: '#5ef0ff',
  /** 小窓の見出し・出来事の札の下地 */
  panel: 'rgba(5, 12, 19, 0.85)',
};

const LIGHT_TRACK: typeof DARK_TRACK = {
  background: '#f6f9fb',
  grid: 'rgba(30, 90, 120, 0.07)',
  turf: 'rgba(40, 140, 80, 0.22)',
  dirt: 'rgba(170, 120, 60, 0.26)',
  rail: 'rgba(20, 95, 125, 0.85)',
  outerRail: 'rgba(20, 95, 125, 0.35)',
  pole: 'rgba(20, 95, 125, 0.9)',
  poleLabel: 'rgba(30, 70, 90, 0.9)',
  goal: '#b37400',
  start: 'rgba(20, 95, 125, 0.55)',
  focusRing: '#007f9e',
  panel: 'rgba(255, 255, 255, 0.9)',
};

/** トラッキング画面の配色（ライトモードでは setTrackTheme で切り替える。描くたびにここを読む） */
export const TRACK_THEME = { ...DARK_TRACK };

export function setTrackTheme(mode: 'dark' | 'light') {
  Object.assign(TRACK_THEME, mode === 'light' ? LIGHT_TRACK : DARK_TRACK);
}
