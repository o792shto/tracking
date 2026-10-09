/** 枠色（1〜8枠）。暗い背景で見分けやすいよう明度を調整したオリジナルの色 */
export const FRAME_COLORS: readonly { fill: string; text: string; stroke: string }[] = [
  { fill: '#eef1f4', text: '#11161d', stroke: '#ffffff' },
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

/** トラッキング画面の配色 */
export const TRACK_THEME = {
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
};
