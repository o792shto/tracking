/** カメラの操作モード */
export type CameraMode = 'auto' | 'overview' | 'leader' | 'horse';

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** カメラの状態：ワールド座標（m）の注視点と拡大率（px/m） */
export interface CameraView {
  cx: number;
  cy: number;
  scale: number;
}

/** 点の集まりを囲む矩形（余白 pad m 付き） */
export function boundsOf(points: { x: number; y: number }[], pad = 0): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** 矩形が画面（width×height px）に収まるカメラ。拡大率は minScale〜maxScale に制限 */
export function fitRect(
  rect: Rect,
  width: number,
  height: number,
  minScale = 0,
  maxScale = Infinity,
): CameraView {
  const w = Math.max(1, rect.maxX - rect.minX);
  const h = Math.max(1, rect.maxY - rect.minY);
  const scale = Math.min(Math.max(Math.min(width / w, height / h), minScale), maxScale);
  return { cx: (rect.minX + rect.maxX) / 2, cy: (rect.minY + rect.maxY) / 2, scale };
}

/**
 * 現在のカメラを目標へなめらかに近づける。
 * rate は1秒あたりの追従の速さ。拡大率は対数で補間してズームの速さを揃える。
 */
export function approach(current: CameraView, target: CameraView, rate: number, dt: number): CameraView {
  const k = 1 - Math.exp(-rate * dt);
  return {
    cx: current.cx + (target.cx - current.cx) * k,
    cy: current.cy + (target.cy - current.cy) * k,
    scale: Math.exp(Math.log(current.scale) + (Math.log(target.scale) - Math.log(current.scale)) * k),
  };
}

/** ワールド座標（m）→ 画面座標（px） */
export function toScreen(view: CameraView, width: number, height: number, x: number, y: number) {
  return { x: width / 2 + (x - view.cx) * view.scale, y: height / 2 + (y - view.cy) * view.scale };
}
