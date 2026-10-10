import type { RaceResult } from '../sim';
import { TrackView, type ViewOptions } from './trackView';

export type PlaybackSpeed = 1 | 2 | 4;

export interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
  speed: PlaybackSpeed;
  /** ゲートのカウントダウンの残り（秒）。カウントダウン中でなければ 0 */
  countdown: number;
  /** ゴール前のスロー再生中か */
  slow: boolean;
}

/** 接戦（1・2着の差がこれ以下の着差）のとき、ゴール前をスローで見せる */
const CLOSE_FINISH_LABELS = new Set(['同着', 'ハナ', 'アタマ', 'クビ', '1/2']);
/** スローの倍率と、1着のゴールの何秒前から2着のゴールの何秒後まで */
const SLOW_FACTOR = 0.5;
const SLOW_BEFORE = 1.6;
const SLOW_AFTER = 0.5;

/** 接戦ならスロー再生する時間帯（レース内の時刻）。接戦でなければ null */
export function slowWindow(result: RaceResult): { from: number; to: number } | null {
  const [first, second] = result.finish;
  if (!second || !CLOSE_FINISH_LABELS.has(second.marginLabel)) return null;
  return { from: first.time - SLOW_BEFORE, to: second.time + SLOW_AFTER };
}

/**
 * requestAnimationFrame で記録を再生する。時刻は実時間 × 倍速で進み、
 * 描画は毎フレーム記録を補間するので表示の滑らかさは記録の間隔に左右されない。
 */
export class RacePlayer {
  readonly view: TrackView;
  private time = 0;
  private playing = false;
  private speed: PlaybackSpeed = 1;
  private raf = 0;
  private last = 0;
  private settleUntil = 0;
  private countdown = 0;
  private slow: { from: number; to: number } | null = null;
  /** 描画の間隔の下限（秒）。軽量モードでは 30fps に抑える */
  private minFrameInterval = 0;
  private lastDraw = 0;
  private listeners = new Set<(s: PlayerState) => void>();
  options: ViewOptions = { cameraMode: 'leader', followNumber: null, highlight: new Set() };

  constructor(canvas: HTMLCanvasElement, result: RaceResult) {
    this.view = new TrackView(canvas, result);
    this.slow = slowWindow(result);
  }

  get state(): PlayerState {
    return {
      time: this.time,
      duration: this.view.duration,
      playing: this.playing,
      speed: this.speed,
      countdown: this.countdown,
      slow: this.inSlow(),
    };
  }

  private inSlow(): boolean {
    return this.playing && this.slow !== null && this.time >= this.slow.from && this.time < this.slow.to;
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }

  /** 別のレースに差し替える（最初から） */
  load(result: RaceResult) {
    this.view.setResult(result);
    this.slow = slowWindow(result);
    this.countdown = 0;
    this.time = 0;
    this.emit();
    this.requestFrame();
  }

  play() {
    if (this.time >= this.view.duration) this.time = 0;
    this.playing = true;
    this.emit();
    this.requestFrame();
  }

  /** ゲートのカウントダウン（秒）のあとで発走する */
  startWithCountdown(seconds: number) {
    this.time = 0;
    this.playing = false;
    this.countdown = seconds;
    this.emit();
    this.requestFrame();
  }

  pause() {
    this.playing = false;
    this.countdown = 0;
    this.emit();
  }

  /** 同じ記録を最初から再生し直す（同じシードなので結果も同じ） */
  replay() {
    this.time = 0;
    this.play();
  }

  setSpeed(speed: PlaybackSpeed) {
    this.speed = speed;
    this.emit();
  }

  seek(time: number) {
    if (this.countdown > 0) {
      this.countdown = 0;
      this.playing = true;
    }
    this.time = Math.min(Math.max(time, 0), this.view.duration);
    this.emit();
    this.requestFrame();
  }

  /** 表示オプションの変更を反映して1フレーム描く */
  setOptions(options: Partial<ViewOptions>) {
    this.options = { ...this.options, ...options };
    this.requestFrame();
  }

  resize(width: number, height: number, dpr?: number) {
    this.view.resize(width, height, dpr);
    this.requestFrame();
  }

  /** 軽量モード：描画を 30fps に抑える */
  setLite(lite: boolean) {
    this.minFrameInterval = lite ? 1 / 31 : 0;
    this.requestFrame();
  }

  /** 1フレーム描く。停止中でもカメラが追いつくまで少しの間は描き続ける */
  private requestFrame() {
    this.settleUntil = performance.now() + 1500;
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    // 軽量モードでは間引く（時刻は飛ばさず、次のフレームでまとめて進める）
    if (this.minFrameInterval > 0 && (now - this.lastDraw) / 1000 < this.minFrameInterval) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.lastDraw = now;
    const frameDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - frameDt);
      if (this.countdown === 0) this.playing = true;
      this.settleUntil = now + 1500;
      this.emit();
    } else if (this.playing) {
      // 接戦のゴール前はスロー
      this.time += frameDt * this.speed * (this.inSlow() ? SLOW_FACTOR : 1);
      if (this.time >= this.view.duration) {
        this.time = this.view.duration;
        this.playing = false;
        this.settleUntil = now + 1500;
      }
      this.emit();
    }
    this.view.draw(this.time, frameDt, this.options);
    // 停止中もカメラが目標に落ち着くまでしばらく描き続ける
    if (this.playing || this.countdown > 0 || now < this.settleUntil) this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners.clear();
  }
}
