import { getSettingsStore } from '../store';

/**
 * 効果音。音声ファイルは使わず Web Audio で合成する（設定でオンのときだけ鳴らす。デフォルトはオフ）。
 * ブラウザはユーザー操作の後でないと音を出せないので、設定をオンにしたときや発走ボタンで unlock する。
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getSettingsStore().getState().sound) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** ユーザー操作の中で呼んで、音を出せる状態にしておく */
export function unlockAudio() {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.15) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buf.getChannelData(0);
  // 効果音のノイズはレース結果に関わらないので、シード付き乱数でなくてよい（簡単な線形合同法）
  let x = 12345;
  for (let i = 0; i < data.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (x / 0x3fffffff - 1) * (1 - i / data.length);
  }
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(gain, t0);
  src.connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** カウントダウンの「ピッ」 */
  count: () => tone(660, 0, 0.12, 'square', 0.06),
  /** ゲートが開く（高い音＋がしゃん） */
  gate: () => {
    tone(1320, 0, 0.35, 'square', 0.07);
    noise(0, 0.18, 0.12);
  },
  /** 残り600/400/200m */
  furlong: () => tone(880, 0, 0.08, 'triangle', 0.05),
  /** ゴール */
  goal: () => {
    tone(784, 0, 0.25, 'triangle', 0.1);
    tone(1046, 0.12, 0.4, 'triangle', 0.1);
  },
  /** 写真判定のシャッター */
  shutter: () => {
    noise(0, 0.05, 0.2);
    noise(0.09, 0.05, 0.15);
  },
  /** 着順確定 */
  confirm: () => {
    tone(988, 0, 0.15, 'sine', 0.1);
    tone(1318, 0.1, 0.35, 'sine', 0.1);
  },
  /** 払い戻しのカウントアップ */
  coin: () => tone(1568, 0, 0.05, 'square', 0.03),
  /** 高配当のファンファーレ */
  fanfare: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.1));
    tone(1046, 0.5, 0.8, 'triangle', 0.12);
    tone(1318, 0.5, 0.8, 'triangle', 0.08);
  },
};
