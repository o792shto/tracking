import { courseOutlines, offsetPoint, pathPoint, racePath, type RacePath, type RaceResult, type Surface } from '../sim';
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

type Point = { x: number; y: number };

/** 内ラチの外側に描くコース幅（m） */
const TRACK_WIDTH = 24;
/** 先頭追従・選択馬追従で映す前後の範囲（m）。選択馬はその馬に大きく寄る */
const LEADER_SPAN = 45;
const HORSE_SPAN = 14;
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
  /** 軽量モード：軌跡・発光・グリッドを描かない */
  lite?: boolean;
}

/** 全体表示で馬がこの拡大率（px/m）より小さく見えるとき、馬群を拡大した小窓を重ねる */
const INSET_SCALE = 3.4;
/** 小窓の大きさ（コース図の幅に対する割合と、上限・下限 px）と、下の字幕を避ける余白 */
const INSET_WIDTH_RATIO = 0.38;
const INSET_MAX_WIDTH = 300;
const INSET_MIN_WIDTH = 140;
const INSET_BOTTOM_GAP = 64;

/** 出遅れの札を出し始める時刻（秒）。ゲートが開く前（カウントダウン中）には出さない */
const SLOW_START_TAG_FROM = 0.5;
/** ゲートが開いて消えるまでの時間（秒） */
const GATE_FADE = 0.5;
/** レース中の出来事の札（出遅れ・掛かり・進路をなくした）と、出している時間（秒） */
const EVENT_TAGS: Record<RaceResult['events'][number]['kind'], { label: string; color: string; span: number }> = {
  slowStart: { label: '出遅れ', color: '#ff7b7f', span: 5 },
  keen: { label: '掛かる', color: '#f0b46a', span: 4 },
  blocked: { label: '詰まる', color: '#c9a0ff', span: 3 },
};

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
  /** コースの帯（内ラチと外ラチ）。このレースで走るものは明るく描く */
  private bands: { surface: Surface; active: boolean; closed: boolean; inner: Point[]; outer: Point[] }[] = [];
  private path!: RacePath;
  private overviewRect: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private lite = false;
  private insetView: CameraView | null = null;

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
    const { course } = this.result.setup;
    this.path = racePath(course);
    this.bands = courseOutlines(course).map((o) => ({
      surface: o.surface,
      active: o.active,
      closed: o.closed,
      inner: o.poses.map((p) => offsetPoint(p, 0, course.direction)),
      outer: o.poses.map((p) => offsetPoint(p, TRACK_WIDTH, course.direction)),
    }));
    // 全体表示は、このレースで走る周回が収まるように
    const active = this.bands.filter((b) => b.active).flatMap((b) => b.outer);
    this.overviewRect = boundsOf(active, 18);
  }

  private point(d: number, lateral: number) {
    return pathPoint(this.path, d, lateral);
  }

  /** 時刻 t の画面を描く。frameDt は前回の描画からの実時間（カメラの追従に使う） */
  draw(t: number, frameDt: number, options: ViewOptions) {
    const log = this.result.log;
    if (!log || this.width === 0) return;
    this.samples = sampleAt(log, t, this.samples);
    this.earlier = sampleAt(log, t - ACCEL_WINDOW, this.earlier);
    const target = this.cameraTarget(options);
    this.view = this.view ? approach(this.view, target, 3.2, frameDt) : target;

    this.lite = options.lite ?? false;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = TRACK_THEME.background;
    ctx.fillRect(0, 0, this.width, this.height);
    if (!this.lite) this.drawGrid();
    this.drawTrack();
    this.drawMarkers();
    this.drawGate(t);
    this.drawHorses(options);
    this.drawEventTags(t);
    this.drawInset(t, frameDt, options);
  }

  /**
   * 全体表示で馬が小さいとき、先頭集団を拡大した小窓を右下に重ねる。
   * 同じ描画処理を、小窓の大きさとカメラに差し替えて呼ぶ
   */
  private drawInset(t: number, frameDt: number, options: ViewOptions) {
    const view = this.view!;
    const D = this.result.setup.course.distance;
    const order = runningOrder(this.samples);
    const leader = this.samples[order[0]];
    if (view.scale >= INSET_SCALE || t <= 0 || !leader || leader.d >= D + 30) {
      this.insetView = null;
      return;
    }
    const iw = Math.round(Math.min(INSET_MAX_WIDTH, Math.max(INSET_MIN_WIDTH, this.width * INSET_WIDTH_RATIO)));
    const ih = Math.round(iw * 0.62);
    const ix = this.width - iw - 10;
    const iy = Math.max(10, this.height - ih - INSET_BOTTOM_GAP);
    // 先頭から30m以内の馬と、先頭の少し前
    const pts = order
      .map((i) => this.samples[i])
      .filter((s) => leader.d - s.d < 30)
      .map((s) => this.point(s.d, s.x));
    pts.push(this.point(leader.d + 18, 0), this.point(leader.d + 18, TRACK_WIDTH * 0.6));
    const target = fitRect(boundsOf(pts, 6), iw, ih, 0, 9);
    this.insetView = this.insetView ? approach(this.insetView, target, 4, frameDt) : target;

    const ctx = this.ctx;
    const saved = { view: this.view, width: this.width, height: this.height };
    ctx.save();
    ctx.translate(ix, iy);
    ctx.beginPath();
    ctx.rect(0, 0, iw, ih);
    ctx.clip();
    ctx.fillStyle = TRACK_THEME.background;
    ctx.fillRect(0, 0, iw, ih);
    this.view = this.insetView;
    this.width = iw;
    this.height = ih;
    this.drawTrack();
    this.drawMarkers();
    this.drawHorses(options);
    this.view = saved.view;
    this.width = saved.width;
    this.height = saved.height;
    ctx.restore();
    // 枠と見出し
    ctx.strokeStyle = TRACK_THEME.rail;
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    ctx.font = '700 11px "Zen Kaku Gothic New", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = TRACK_THEME.panel;
    ctx.fillRect(ix + 1, iy + 1, 58, 16);
    ctx.fillStyle = TRACK_THEME.rail;
    ctx.fillText('先頭集団', ix + 6, iy + 3);
  }

  /** 発光（軽量モードでは描かない） */
  private glow(color: string, blur: number) {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = this.lite ? 0 : blur;
  }

  /** 発走前のゲート。開いたら少しの間で消える */
  private drawGate(t: number) {
    if (t >= GATE_FADE) return;
    const ctx = this.ctx;
    const n = this.result.setup.entries.length;
    const width = n * 1.0 + 0.6;
    ctx.globalAlpha = t <= 0 ? 1 : 1 - t / GATE_FADE;
    ctx.strokeStyle = TRACK_THEME.goal;
    ctx.lineWidth = 1.5;
    const across = (d: number) => {
      const a = this.worldToScreen(this.point(d, 0));
      const b = this.worldToScreen(this.point(d, width));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    // 前扉と後ろの枠、馬房の仕切り
    across(1.2);
    across(-2.4);
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      const a = this.worldToScreen(this.point(1.2, i * 1.0 + 0.0));
      const b = this.worldToScreen(this.point(-2.4, i * 1.0 + 0.0));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** 出遅れ・掛かり・進路をなくした馬に、少しの間だけ札を出す */
  private drawEventTags(t: number) {
    const ctx = this.ctx;
    const scale = this.view!.scale;
    const radius = Math.min(15, Math.max(5, 1.2 * scale));
    ctx.font = `700 11px ${'"Zen Kaku Gothic New", system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ev of this.result.events) {
      const tag = EVENT_TAGS[ev.kind];
      // 出遅れは記録上はスタート時刻（0秒）。ゲートが開いて周りが出ていってから札を出す
      const from = ev.kind === 'slowStart' ? Math.max(ev.time, SLOW_START_TAG_FROM) : ev.time;
      if (t < from || t > from + tag.span) continue;
      const s = this.samples[ev.number - 1];
      if (!s || s.d >= this.result.setup.course.distance) continue;
      const p = this.worldToScreen(this.point(s.d, s.x));
      const w = ctx.measureText(tag.label).width + 10;
      const x = p.x;
      const y = p.y - radius - 12;
      ctx.globalAlpha = Math.min(1, (from + tag.span - t) / 0.5);
      ctx.fillStyle = TRACK_THEME.panel;
      ctx.strokeStyle = tag.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - w / 2, y - 8, w, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = tag.color;
      ctx.fillText(tag.label, x, y + 0.5);
      // 馬にも輪を付ける
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private cameraTarget(options: ViewOptions): CameraView {
    const { width: w, height: h, samples } = this;
    const overview = fitRect(this.overviewRect, w, h);
    const order = runningOrder(samples);

    const groupAround = (centerIdx: number, span: number, pad: number, maxScale: number) => {
      const c = samples[centerIdx];
      const pts = samples
        .filter((s) => Math.abs(s.d - c.d) < span)
        .map((s) => this.point(s.d, s.x));
      pts.push(this.point(c.d + span * 0.6, 0), this.point(c.d - span * 0.4, 0));
      return fitRect(boundsOf(pts, pad), w, h, 0, maxScale);
    };

    switch (options.cameraMode) {
      case 'overview':
        return overview;
      case 'leader':
        return groupAround(order[0], LEADER_SPAN, 10, 9);
      case 'horse': {
        // 選択馬：その馬のまわりだけに寄る
        const idx = this.result.setup.entries.findIndex((e) => e.number === options.followNumber);
        return idx >= 0 ? groupAround(idx, HORSE_SPAN, 4, 16) : overview;
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

  private tracePath(points: Point[], close = true) {
    const ctx = this.ctx;
    points.forEach((p, i) => {
      const s = this.worldToScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (close) ctx.closePath();
  }

  /** コースの帯を描く。このレースで使わない周回（もう一方の馬場や回り）は薄く描く */
  private drawTrack() {
    const ctx = this.ctx;
    const ordered = [...this.bands.filter((b) => !b.active), ...this.bands.filter((b) => b.active)];
    for (const band of ordered) {
      ctx.globalAlpha = band.active ? 1 : 0.35;
      ctx.beginPath();
      if (band.closed) {
        this.tracePath(band.outer);
        this.tracePath([...band.inner].reverse());
      } else {
        // 引き込み線：内ラチ側と外ラチ側をつないだ四角形
        this.tracePath([...band.inner, ...[...band.outer].reverse()]);
      }
      ctx.fillStyle = band.surface === 'turf' ? TRACK_THEME.turf : TRACK_THEME.dirt;
      ctx.fill('evenodd');
    }
    for (const band of ordered) {
      ctx.globalAlpha = band.active ? 1 : 0.3;
      ctx.lineWidth = band.active ? 1.5 : 1;
      ctx.strokeStyle = TRACK_THEME.rail;
      this.glow(TRACK_THEME.rail, band.active ? 6 : 0);
      ctx.beginPath();
      this.tracePath(band.inner, band.closed);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = TRACK_THEME.outerRail;
      ctx.beginPath();
      this.tracePath(band.outer, band.closed);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    this.glow(TRACK_THEME.goal, 10);
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
      if (trailLength > 1 && !this.lite) {
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
          if (surge > 0) this.glow(color.stroke, 12 * surge);
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
        this.glow(TRACK_THEME.focusRing, 8);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = color.fill;
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 1;
      if (surging.has(i)) this.glow(color.stroke, 14);
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
