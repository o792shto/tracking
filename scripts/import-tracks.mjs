// docs/reference/jra-tracks/courses_geometry.json（ユーザー提供のコース形状データ）から、
// ゲームで使う部分だけを src/sim/trackData.ts に書き出す。
//
// - layout（内回り・外回りなど）を、ゴールから走行方向に並べた区間（直線・円弧）の列に平らにする
// - 発走地点を「最初に走る周回の s」と「引き込み線の長さ」に直し、距離が合うかを確かめる
//
// 実行: node scripts/import-tracks.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'docs/reference/jra-tracks/courses_geometry.json';
const OUT = 'src/sim/trackData.ts';
const VENUES = { tokyo: '東京', nakayama: '中山', kyoto: '京都', hanshin: '阪神' };

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const rad = (deg) => (deg * Math.PI) / 180;
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

/** loop の [from, to] の部分の区間を取り出す（区間の途中で切る） */
function slice(loop, from, to) {
  const out = [];
  let s = 0;
  for (const seg of loop.segments) {
    const a = Math.max(from, s);
    const b = Math.min(to, s + seg.length);
    if (b - a > 1e-9) {
      const turn = seg.type === 'arc' ? (seg.turn_deg * (b - a)) / seg.length : 0;
      out.push([round(b - a), round(turn, 6)]);
    }
    s += seg.length;
  }
  return out;
}

/** 区間の列を積分して、s ごとの位置を返す関数を作る（照合用） */
function integrate(start, segs) {
  const poses = [{ s: 0, x: start.x, y: start.y, h: rad(start.heading_deg) }];
  for (const [len, turn] of segs) {
    const p = poses[poses.length - 1];
    const k = rad(turn) / len;
    let { x, y, h } = p;
    if (Math.abs(k) < 1e-12) {
      x += len * Math.cos(h);
      y += len * Math.sin(h);
    } else {
      x += (Math.sin(h + k * len) - Math.sin(h)) / k;
      y += -(Math.cos(h + k * len) - Math.cos(h)) / k;
      h += k * len;
    }
    poses.push({ s: p.s + len, x, y, h });
  }
  const at = (s) => {
    let i = 0;
    while (i < segs.length - 1 && poses[i + 1].s <= s) i++;
    const p = poses[i];
    const [len, turn] = segs[i];
    const l = s - p.s;
    const k = rad(turn) / len;
    if (Math.abs(k) < 1e-12) return { x: p.x + l * Math.cos(p.h), y: p.y + l * Math.sin(p.h), h: p.h };
    return {
      x: p.x + (Math.sin(p.h + k * l) - Math.sin(p.h)) / k,
      y: p.y - (Math.cos(p.h + k * l) - Math.cos(p.h)) / k,
      h: p.h + k * l,
    };
  };
  return { poses, at };
}

const out = {};
const problems = [];

for (const [key, venueName] of Object.entries(VENUES)) {
  const v = data[key];
  const layouts = {};
  const geo = {};
  for (const [name, layout] of Object.entries(v.layouts)) {
    const segs = layout.pieces.flatMap((p) => slice(v.loops[p.loop], p.s_from, p.s_to));
    const total = segs.reduce((a, [l]) => a + l, 0);
    if (Math.abs(total - layout.length) > 0.05) problems.push(`${venueName} ${name}: 区間の合計 ${total} ≠ 周長 ${layout.length}`);
    const firstLoop = v.loops[layout.pieces[0].loop];
    const start = firstLoop.start_pose;
    const g = integrate(start, segs);
    // 1周して元の位置に戻るか
    const end = g.poses[g.poses.length - 1];
    const gap = Math.hypot(end.x - start.x, end.y - start.y);
    if (gap > 0.5) problems.push(`${venueName} ${name}: 1周して ${gap.toFixed(2)}m ずれる`);
    // 同梱の折れ線（5m間隔）と照合
    let worst = 0;
    for (const [s, x, y] of layout.polyline_s_x_y_z) {
      const p = g.at(s);
      worst = Math.max(worst, Math.hypot(p.x - x, p.y - y));
    }
    if (worst > 0.5) problems.push(`${venueName} ${name}: 折れ線と最大 ${worst.toFixed(2)}m ずれる`);
    geo[name] = g;
    layouts[name] = {
      surface: firstLoop.surface,
      length: layout.length,
      start: { x: start.x, y: start.y, headingDeg: start.heading_deg },
      segments: segs,
      elevation: layout.elevation_profile.map(([s, z]) => [round(s, 2), round(z, 3)]),
    };
  }

  const chutes = {};
  for (const [name, c] of Object.entries(v.chutes)) {
    chutes[name] = { layout: c.layout, joinXY: c.join_xy, headingDeg: c.heading_deg, length: c.length_m, usedBy: c.used_by };
  }

  const starts = [];
  for (const s of v.starts) {
    const finalLayout = s.layout.includes('->') ? s.layout.split('->')[0].replace(/_[a-z]+$/, '') + '_' + s.layout.split('->')[1] : s.layout;
    const first = s.first_layout;
    const L1 = v.layouts[first].length;
    const L = v.layouts[finalLayout].length;
    let firstS;
    let chuteBack = 0;
    if (s.start_on === 'chute') {
      const c = v.chutes[s.chute];
      // 合流点を、最初に走る周回の上で探す（引き込み線の join_s は別の周回の s のことがある）
      let best = { d: Infinity, s: 0 };
      for (let t = 0; t < L1; t += 0.05) {
        const p = geo[first].at(t);
        const d = Math.hypot(p.x - c.join_xy[0], p.y - c.join_xy[1]);
        if (d < best.d) best = { d, s: t };
      }
      if (best.d > 0.5) problems.push(`${venueName} ${s.surface}${s.distance}: 引き込み線の合流点が周回から ${best.d.toFixed(2)}m 離れている`);
      firstS = round(best.s, 2);
      chuteBack = s.chute_back_m;
    } else {
      firstS = s.s_from_goal_forward;
    }
    const firstPass = chuteBack + (L1 - firstS);
    const laps = (s.distance - firstPass) / L;
    if (Math.abs(laps - Math.round(laps)) * L > 0.5 || laps < -0.001) {
      problems.push(`${venueName} ${s.surface}${s.distance} ${s.layout}: 距離が合わない（最初の周 ${firstPass.toFixed(1)}m、残り ${(laps * L).toFixed(1)}m）`);
    }
    starts.push({
      surface: s.surface,
      distance: s.distance,
      layout: finalLayout,
      firstLayout: first,
      firstS,
      ...(s.start_on === 'chute' ? { chute: s.chute, chuteBack } : {}),
      laps: Math.round(laps),
    });
  }

  out[venueName] = { direction: v.direction, layouts, chutes, starts };
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const header = `// このファイルは scripts/import-tracks.mjs が ${SRC} から生成する。手で直さないこと。
// 形状はユーザー提供の推定モデル（1周・直線などの公式値は満たすが、コーナー半径・分岐位置・引き込み線は推定）。
// 詳しくは docs/reference/jra-tracks/jra_track_spec.md を参照。
import type { TrackData } from './trackTypes';

export const TRACK_DATA: TrackData = `;
// 数の配列は1行にまとめる
const body = JSON.stringify(out, null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, inner) => `[${inner.replace(/\s+/g, ' ')}]`);
writeFileSync(OUT, header + body + ';\n');
console.log(`${OUT} を書き出しました`);
