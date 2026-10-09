import {
  courseTrack,
  lapLength,
  lapPosition,
  pastFourthCorner,
  trackPoint,
  type RaceResult,
  type TrackGeometry,
} from '../sim';
import {
  approach,
  boundsOf,
  fitRect,
  toScreen,
  type CameraMode,
  type CameraView,
  type Rect,
} from './camera';
import { TRACK_THEME, frameColor } from './colors';
import { logDuration, runningOrder, sampleAt, type HorseSample } from './replay';

/** 内ラチの外側に描くコース幅（m） */
const TRACK_WIDTH = 24;
/** 自動カメラ：序盤〜中盤で全体表示と先頭集団追従を切り替える周期（秒） */
const AUTO_CYCLE = 14;
const AUTO_OVERVIEW_PART = 7;
/** 加速度を測る時間幅（秒） */
const ACCEL_WINDOW = 0.4;
/** 軌跡の長さ：速度がこれを超えた分 × TRAIL_PER_MPS (m) */
const TRAIL_BASE_SPEED = 13;
const TRAIL_PER_MPS = 5;
/** これ以上の加速度（m/s²）で「伸びている」演出を出す */
const SURGE_ACCEL = 0.6;

export interface ViewOptions {
  cameraMode: CameraMode;
  /** 指定馬追従の馬番 */
  followNumber: number | null;
  /** 強調表示する馬番（自分の買った馬など） */
  highlight: ReadonlySet<number>;
}

/**
 * レースの記録を Canvas 2D に描く。結果は変えず、記録を再生するだけ。
 */
export class TrackView {
  private ctx: CanvasRenderingContext2D;
  private result: RaceResult;
  private samples: HorseSample[] = [];
  /** 加速の判定用に、少し前の時刻の状態 */
  private earlier: HorseSample[] = [];
  private view: CameraView | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private trackOuter: { x: number; y: number }[] = [];
  private trackInner: { x: number; y: number }[] = [];
  private track: TrackGeometry = courseTrack({ surface: 'turf', distance: 1600 });
  private overviewRect: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  constructor(
    private canvas: HTMLCanvasElement,
    result: RaceResult,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.result = result;
    this.buildTrack();
  }

  setResult(result: RaceResult) {
    this.result = result;
    this.buildTrack();
    this.view = null;
  }

  get duration(): number {
    return this.result.log ? logDuration(this.result.log) : 0;
  }

  /** 表示サイズと devicePixelRatio に合わせて解像度を設定する */
  resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1) {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
  }

  private buildTrack() {
    const dir = this.result.setup.course.direction;
    this.track = courseTrack(this.result.setup.course);
    const lap = lapLength(this.track);
    this.trackInner = [];
    this.trackOuter = [];
    for (let s = 0; s < lap; s += 4) {
      this.trackInner.push(trackPoint(this.track, dir, s, 0));
      this.trackOuter.push(trackPoint(this.track, dir, s, TRACK_WIDTH));
    }
    this.overviewRect = boundsOf(this.trackOuter, 18);
  }

  private point(d: number, lateral: number) {
    const { course } = this.result.setup;
    return trackPoint(this.track, course.direction, lapPosition(this.track, course.distance, d), lateral);
  }

  /** 時刻 t の画面を描く。frameDt は前回の描画からの実時間（カメラの追従に使う） */
  draw(t: number, frameDt: number, options: ViewOptions) {
    const log = this.result.log;
    if (!log || this.width === 0) return;
    this.samples = sampleAt(log, t, this.samples);
    this.earlier = sampleAt(log, t - ACCEL_WINDOW, this.earlier);
    const target = this.cameraTarget(t, options);
    this.view = this.view ? approach(this.view, target, 3.2, frameDt) : target;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = TRACK_THEME.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid();
    this.drawTrack();
    this.drawMarkers();
    this.drawHorses(options);
  }

  private cameraTarget(t: number, options: ViewOptions): CameraView {
    const { width: w, height: h, samples } = this;
    const { course } = this.result.setup;
    const D = course.distance;
    const overview = fitRect(this.overviewRect, w, h);
    const order = runningOrder(samples);
    const leader = samples[order[0]];

    const groupAround = (centerIdx: number, span: number, pad: number) => {
      const c = samples[centerIdx];
      const pts = samples
        .filter((s) => Math.abs(s.d - c.d) < span)
        .map((s) => this.point(s.d, s.x));
      pts.push(this.point(c.d + span * 0.6, 0), this.point(c.d - span * 0.4, 0));
      return fitRect(boundsOf(pts, pad), w, h, 0, 9);
    };

    switch (options.cameraMode) {
      case 'overview':
        return overview;
      case 'leader':
        return groupAround(order[0], 45, 10);
      case 'horse': {
        const idx = this.result.setup.entries.findIndex((e) => e.number === options.followNumber);
        return idx >= 0 ? groupAround(idx, 30, 8) : overview;
      }
      case 'auto': {
        if (leader.d >= D) {
          // ゴール前後：ゴール線付近に寄せる
          const near = samples
            .filter((s) => s.d > D - 60)
            .map((s) => this.point(Math.min(s.d, D + 60), s.x));
          near.push(this.point(D + 20, 0), this.point(D - 30, TRACK_WIDTH * 0.6));
          return fitRect(boundsOf(near, 8), w, h, 0, 9);
        }
        if (D - leader.d <= this.track.finishOffset) {
          // 直線：ゴール線を画面に入れて固定気味にし、馬がゴールへ迫っていく動きを見せる。
          // 先頭がゴールに近づくほど枠が縮んで寄っていく
          const front = order
            .slice(0, Math.max(5, Math.ceil(order.length / 2)))
            .map((i) => samples[i])
            .filter((s) => leader.d - s.d < 30);
          const rear = Math.min(...front.map((s) => s.d));
          const pts = front.map((s) => this.point(s.d, s.x));
          // 前方に余白（ゴールが近づいたらゴール線で止める）、後ろにも少し余白
          const ahead = Math.min(D + 12, leader.d + 70);
          pts.push(this.point(ahead, 0), this.point(ahead, TRACK_WIDTH * 0.5), this.point(rear - 20, 0));
          return fitRect(boundsOf(pts, 6), w, h, 0, 9);
        }
        if (pastFourthCorner(this.track, course, leader.d)) {
          // 4コーナー以降：先頭〜中団に寄ってズーム
          const front = order.slice(0, Math.max(5, Math.ceil(order.length / 2)));
          const pts = front
            .map((i) => samples[i])
            .filter((s) => leader.d - s.d < 35)
            .map((s) => this.point(s.d, s.x));
          pts.push(this.point(leader.d + 25, 0));
          return fitRect(boundsOf(pts, 10), w, h, 0, 8);
        }
        const phase = t % AUTO_CYCLE;
        if (t < 6 || phase >= AUTO_OVERVIEW_PART) return groupAround(order[0], 55, 12);
        return overview;
      }
    }
  }

  private worldToScreen(p: { x: number; y: number }) {
    return toScreen(this.view!, this.width, this.height, p.x, p.y);
  }

  private drawGrid() {
    const ctx = this.ctx;
    const view = this.view!;
    const step = 50 * view.scale;
    if (step < 12) return;
    ctx.strokeStyle = TRACK_THEME.grid;
    ctx.lineWidth = 1;
    const origin = toScreen(view, this.width, this.height, 0, 0);
    const startX = origin.x % step;
    const startY = origin.y % step;
    ctx.beginPath();
    for (let x = startX; x < this.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = startY; y < this.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  private tracePath(points: { x: number; y: number }[]) {
    const ctx = this.ctx;
    points.forEach((p, i) => {
      const s = this.worldToScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }

  private drawTrack() {
    const ctx = this.ctx;
    ctx.beginPath();
    this.tracePath(this.trackOuter);
    this.tracePath([...this.trackInner].reverse());
    ctx.fillStyle = this.result.setup.course.surface === 'turf' ? TRACK_THEME.turf : TRACK_THEME.dirt;
    ctx.fill('evenodd');

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = TRACK_THEME.rail;
    ctx.shadowColor = TRACK_THEME.rail;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    this.tracePath(this.trackInner);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = TRACK_THEME.outerRail;
    ctx.beginPath();
    this.tracePath(this.trackOuter);
    ctx.stroke();
  }

  /** ハロン棒（ゴールまで200mごと）、スタート、ゴール線 */
  private drawMarkers() {
    const ctx = this.ctx;
    const D = this.result.setup.course.distance;
    const scale = this.view!.scale;
    const fontSize = Math.round(Math.min(13, Math.max(9, scale * 4)));
    ctx.font = `600 ${fontSize}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let toGo = 200; toGo < D; toGo += 200) {
      const a = this.worldToScreen(this.point(D - toGo, -4));
      const b = this.worldToScreen(this.point(D - toGo, 0));
      ctx.strokeStyle = TRACK_THEME.pole;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (scale > 0.9) {
        const label = this.worldToScreen(this.point(D - toGo, -9));
        ctx.fillStyle = TRACK_THEME.poleLabel;
        ctx.fillText(String(toGo / 100), label.x, label.y);
      }
    }

    const line = (d: number, color: string, width: number, dash: number[]) => {
      const a = this.worldToScreen(this.point(d, -3));
      const b = this.worldToScreen(this.point(d, TRACK_WIDTH + 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(0, TRACK_THEME.start, 1.5, [4, 4]);
    ctx.shadowColor = TRACK_THEME.goal;
    ctx.shadowBlur = 10;
    line(D, TRACK_THEME.goal, 2.5, []);
    ctx.shadowBlur = 0;
    const goalLabel = this.worldToScreen(this.point(D, TRACK_WIDTH + 8));
    ctx.fillStyle = TRACK_THEME.goal;
    ctx.fillText('GOAL', goalLabel.x, goalLabel.y);
  }

  private drawHorses(options: ViewOptions) {
    const ctx = this.ctx;
    const { entries } = this.result.setup;
    const scale = this.view!.scale;
    const radius = Math.min(15, Math.max(5, 1.2 * scale));
    // 後ろの馬から描いて、前の馬が上に重なるようにする
    const order = runningOrder(this.samples).reverse();

    // 軌跡：速度が上がるほど長く、加速中は太く明るくして「伸び」を見せる
    const surging = new Set<number>();
    for (const i of order) {
      const s = this.samples[i];
      const accel = (s.v - (this.earlier[i]?.v ?? s.v)) / ACCEL_WINDOW;
      const surge = Math.min(1, Math.max(0, (accel - SURGE_ACCEL) / 1.0));
      if (surge > 0 && s.d < this.result.setup.course.distance) surging.add(i);
      const trailLength = Math.max(0, s.v - TRAIL_BASE_SPEED) * TRAIL_PER_MPS * (1 + 0.6 * surge);
      if (trailLength > 1) {
        const color = frameColor(entries[i].frame);
        const segments = 10;
        ctx.lineCap = 'round';
        for (let k = 0; k < segments; k++) {
          const p0 = this.worldToScreen(this.point(s.d - (trailLength * k) / segments, s.x));
          const p1 = this.worldToScreen(this.point(s.d - (trailLength * (k + 1)) / segments, s.x));
          const fade = 1 - k / segments;
          ctx.strokeStyle = color.stroke;
          ctx.globalAlpha = (0.45 + 0.4 * surge) * fade;
          ctx.lineWidth = radius * (1 + 0.5 * surge) * fade;
          if (surge > 0) {
            ctx.shadowColor = color.stroke;
            ctx.shadowBlur = 12 * surge;
          }
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(radius * 1.15)}px "IBM Plex Mono", ui-monospace, monospace`;
    for (const i of order) {
      const s = this.samples[i];
      const entry = entries[i];
      const color = frameColor(entry.frame);
      const p = this.worldToScreen(this.point(s.d, s.x));
      const focused = options.highlight.has(entry.number) || options.followNumber === entry.number;
      if (focused) {
        ctx.strokeStyle = TRACK_THEME.focusRing;
        ctx.lineWidth = 2;
        ctx.shadowColor = TRACK_THEME.focusRing;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = color.fill;
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 1;
      if (surging.has(i)) {
        ctx.shadowColor = color.stroke;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      if (radius >= 6.5) {
        ctx.fillStyle = color.text;
        ctx.fillText(String(entry.number), p.x, p.y + 0.5);
      }
    }
  }
}
