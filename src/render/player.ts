import type { RaceResult } from '../sim';
import { TrackView, type ViewOptions } from './trackView';

export type PlaybackSpeed = 1 | 2 | 4;

export interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
  speed: PlaybackSpeed;
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
  private listeners = new Set<(s: PlayerState) => void>();
  options: ViewOptions = { cameraMode: 'auto', followNumber: null, highlight: new Set() };

  constructor(canvas: HTMLCanvasElement, result: RaceResult) {
    this.view = new TrackView(canvas, result);
  }

  get state(): PlayerState {
    return { time: this.time, duration: this.view.duration, playing: this.playing, speed: this.speed };
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

  pause() {
    this.playing = false;
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
    this.time = Math.min(Math.max(time, 0), this.view.duration);
    this.emit();
    this.requestFrame();
  }

  /** 表示オプションの変更を反映して1フレーム描く */
  setOptions(options: Partial<ViewOptions>) {
    this.options = { ...this.options, ...options };
    this.requestFrame();
  }

  resize(width: number, height: number) {
    this.view.resize(width, height);
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
    const frameDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) {
      this.time += frameDt * this.speed;
      if (this.time >= this.view.duration) {
        this.time = this.view.duration;
        this.playing = false;
        this.settleUntil = now + 1500;
      }
      this.emit();
    }
    this.view.draw(this.time, frameDt, this.options);
    // 停止中もカメラが目標に落ち着くまでしばらく描き続ける
    if (this.playing || now < this.settleUntil) this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners.clear();
  }
}
