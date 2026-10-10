import { effectiveAbility, type EffectiveAbility } from './ability';
import { racePath } from './racePath';
import { PARAMS } from './params';
import { finishRecords, judgePace, lapMarks } from './result';
import { Rng } from './rng';
import {
  LOG_FIELDS,
  type RaceEvent,
  type RaceLog,
  type RaceResult,
  type RaceSetup,
  type RunningStyle,
} from './types';

export interface SimulateOptions {
  /** 毎ステップの記録を残すか（統計テストでは false にして速くする） */
  record?: boolean;
  /** 全馬ゴール後も記録を続ける秒数 */
  tailSeconds?: number;
}

interface Runner {
  number: number;
  style: RunningStyle;
  ab: EffectiveAbility;
  d: number;
  /** いまいる道筋の区間 */
  piece: number;
  /** 先頭で抜け出したとき、追うのをやめる2着馬との差（m） */
  easeGap: number;
  x: number;
  v: number;
  stamina: number;
  startTime: number;
  targetGap: number;
  tolerance: number;
  spurtAt: number;
  spurting: boolean;
  /** 直線の長さによる末脚の倍率 */
  stretchBias: number;
  /** 直線で追い出した時刻 */
  kickFrom: number;
  /** 追い出しを始める残り距離（直線がこれより短ければ直線に入ってすぐ） */
  kickAt: number;
  /** 序盤の先行争いで巡航速度に上乗せする割合 */
  dash: number;
  /** 仕掛けでの騎手の見積もり（1 より大きいと脚を使いすぎる） */
  jockeyBias: number;
  keenFrom: number;
  keenUntil: number;
  trafficTrouble: boolean;
  stuckUntil: number;
  targetX: number;
  blockedBy: number;
  finishTime: number;
  finishSpeed: number;
  last600Time: number;
}

/** レースを最初から最後までシミュレーションする。同じ setup なら必ず同じ結果になる */
export function simulateRace(setup: RaceSetup, options: SimulateOptions = {}): RaceResult {
  // ホットループ内でモジュールの名前空間を毎回たどらないよう、ローカルに束縛しておく
  const P = PARAMS;
  const path = racePath(setup.course);
  const pieces = path.pieces;
  const lastPiece = pieces.length - 1;
  const homeStretch = path.homeStretch;
  const curveEase = Math.pow(path.finalCornerRadius / P.referenceRadius, P.curveEaseExponent);
  const { course } = setup;
  const D = course.distance;
  const dt = P.dt;
  const rng = new Rng(setup.seed).fork(2);
  // 騎手の流し方は別の乱数で決める（ほかの乱数の並びを変えないように）
  const easeRng = new Rng(setup.seed).fork(13);
  const invBurnExp = 1 / (P.burnExponent - 1);
  const kickFade = P.kickFade[course.surface] * Math.pow(1600 / D, P.kickFadeDistanceExp);
  const dashScale = P.earlyDashSurface[course.surface] * Math.pow(1200 / D, P.earlyDashDistanceExp);
  /** レースごとのペースの流れ（先頭がどれだけ飛ばすか）のばらつき */
  const paceMood = rng.normal(0, P.racePaceJitter);
  const events: RaceEvent[] = [];

  const runners: Runner[] = setup.entries.map((entry, i) => {
    const { style, stats } = entry.horse;
    const ab = effectiveAbility(entry, course);
    let startTime = rng.range(0, P.reactionJitter);
    const slowP = P.slowStartBase * (1 - (stats.start / 100) * 0.8);
    if (rng.chance(slowP)) {
      startTime += rng.range(...P.slowStartDelay);
      events.push({ kind: 'slowStart', number: entry.number, time: 0 });
    }
    let keenFrom = Infinity;
    let keenUntil = -Infinity;
    const keenP = P.keenBase * (1 - (stats.temperament / 100) * 0.8);
    if (rng.chance(keenP)) {
      keenFrom = startTime + rng.range(3, 12);
      keenUntil = keenFrom + rng.range(...P.keenDuration);
      events.push({ kind: 'keen', number: entry.number, time: keenFrom });
    }
    const [gapMin, gapMax] = P.targetGap[style];
    return {
      number: entry.number,
      style,
      ab,
      d: 0,
      piece: 0,
      easeGap: easeRng.range(...P.easeGapLengths) * P.bodyLength,
      x: 0.5 + i * 1.0,
      v: 0,
      stamina: ab.staminaPool,
      startTime,
      targetGap: rng.range(gapMin, gapMax),
      tolerance: P.paceTolerance[style],
      spurtAt: Math.max(
        300,
        P.spurtStart[style] + rng.range(-P.spurtJitter, P.spurtJitter),
      ),
      spurting: false,
      kickFrom: Infinity,
      // 直線が長いほど後ろの脚質が伸び、短いほど前の脚質が粘る
      stretchBias: 1 + (P.stretchBias[style] * (homeStretch - P.referenceStretch)) / 100,
      kickAt: P.kickAt[style] + rng.range(-P.kickJitter, P.kickJitter),
      dash: P.earlyDash[style] * dashScale,
      jockeyBias: 1 + rng.normal(0, P.jockeyJitter),
      keenFrom,
      keenUntil,
      trafficTrouble: rng.chance(P.trafficTroubleChance),
      stuckUntil: -Infinity,
      targetX: 0.5 + i * 1.0,
      blockedBy: -1,
      finishTime: NaN,
      finishSpeed: NaN,
      last600Time: NaN,
    };
  });

  const n = runners.length;
  // ラップの区切り（スタートからの距離）。ゴールから200mごとに区切るので、
  // 200で割り切れない距離（2500mなど）は最初の区間が短くなる
  const marks = lapMarks(D);
  const firstMark = marks[0];
  const lapCount = marks.length;
  const lapCross: number[] = new Array(lapCount).fill(NaN);
  let split600 = NaN;
  const record = options.record ?? true;
  const tail = options.tailSeconds ?? 2;
  const frames: number[] = [];
  const maxSteps = Math.ceil(P.maxTime / dt);

  let t = 0;
  let step = 0;
  let finishedCount = 0;
  let allFinishedAt = Infinity;

  const pushFrame = () => {
    for (const r of runners) frames.push(r.d, r.x, r.v, r.stamina / r.ab.staminaPool);
  };
  if (record) pushFrame();

  const order = runners.map((_, i) => i);
  /** pos[i] = 馬 i の現在の順位（0始まり、order の添字） */
  const pos = runners.map((_, i) => i);

  /** 順位で前後を走査して、指定した横位置の進路が空いているか（ゴール済みの馬は除く） */
  const laneClear = (i: number, laneX: number, ahead: number, behind: number) => {
    const self = runners[i];
    const w = P.laneWidth * 0.95;
    for (let p = pos[i] - 1; p >= 0; p--) {
      const o = runners[order[p]];
      if (o.d - self.d >= ahead) break;
      if (Math.abs(o.x - laneX) < w && Number.isNaN(o.finishTime)) return false;
    }
    for (let p = pos[i] + 1; p < n; p++) {
      const o = runners[order[p]];
      if (self.d - o.d >= behind) break;
      if (Math.abs(o.x - laneX) < w && Number.isNaN(o.finishTime)) return false;
    }
    return true;
  };

  while (step < maxSteps && t < allFinishedAt + (record ? tail : 0)) {
    // 順位順に並べる（前ステップの順序からの挿入ソートでほぼ O(n)）
    for (let i = 1; i < n; i++) {
      const k = order[i];
      let j = i - 1;
      while (j >= 0 && runners[order[j]].d < runners[k].d) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = k;
    }
    for (let p = 0; p < n; p++) pos[order[p]] = p;
    let leader = runners[order[0]];
    for (const idx of order) {
      if (Number.isNaN(runners[idx].finishTime)) {
        leader = runners[idx];
        break;
      }
    }

    const tNext = t + dt;
    for (let i = 0; i < n; i++) {
      const r = runners[i];
      if (tNext <= r.startTime) continue;
      const finished = !Number.isNaN(r.finishTime);
      if (finished && !record) continue;
      const remaining = D - r.d;
      const keen = tNext >= r.keenFrom && tNext < r.keenUntil;

      // 目標速度
      let vTarget: number;
      if (finished) {
        vTarget = r.ab.cruise * 0.7;
      } else if (r.stamina <= 0) {
        vTarget = r.ab.cruise * P.exhaustedSpeed;
      } else if (remaining <= r.spurtAt) {
        r.spurting = true;
        // 残りスタミナをゴールまでで使い切る速度を狙う。消費は (速度比)^p / 秒 なので、
        // 持続できる速度比は (残りスタミナ × 巡航速度 / 残り距離)^(1/(p-1))。上限は末脚の最高速。
        // 騎手の見積もり違いで使い切るのが早すぎると、ゴール前で失速する。
        const sustainable = Math.pow(
          Math.max(0, r.stamina * r.ab.cruise) / (remaining * r.ab.burnFactor),
          invBurnExp,
        );
        // 直線に向くまでは手綱を抑えて進出し、追い出しは直線に入ってから。
        // 追い出した後は時間とともに脚が上がって最高速が落ちる（最後の1Fは少し遅くなる）
        let cap: number;
        if (remaining > homeStretch) {
          // 小回りのコーナーでは外から押し上げにくい
          cap = r.ab.cruise * (1 + P.spurtCurveCap[r.style] * curveEase);
        } else if (remaining > r.kickAt) {
          // 長い直線：追い出しを待つ間も、後ろの馬は外から押し上げていく
          cap = r.ab.cruise * (1 + P.spurtCurveCap[r.style]);
        } else {
          if (r.kickFrom === Infinity) r.kickFrom = tNext;
          cap = r.ab.top * r.stretchBias * (1 - kickFade * (tNext - r.kickFrom));
        }
        vTarget = clamp(
          r.ab.cruise * sustainable * r.jockeyBias,
          r.ab.cruise * P.exhaustedSpeed,
          Math.min(cap, r.ab.top),
        );
      } else if (r.style === 'nige' || keen) {
        const duel = leader !== r || hasRivalNear(runners, r, 1.5);
        const push = duel ? P.nigePushDuel : P.nigePushSolo;
        vTarget = r.ab.cruise * (1 + paceMood + Math.min(push, r.tolerance + (keen ? 0.03 : 0)));
        if (keen && r.style !== 'nige') {
          // 掛かった馬は前へ行きたがるが、先頭から離れすぎない範囲で
          const gap = leader.d - r.d;
          vTarget = Math.min(vTarget, leader.v + P.positionGain * gap + 0.4);
        }
      } else if (leader === r) {
        // 逃げ馬がいない・競りかけてこないときの先頭は、自分の巡航ペースより少し抑える
        vTarget = r.ab.cruise * (1 + paceMood - P.reluctantLeaderEase);
      } else {
        const gap = leader.d - r.d;
        vTarget = leader.v + P.positionGain * (gap - r.targetGap);
        vTarget = clamp(vTarget, r.ab.cruise * 0.9, r.ab.cruise * (1 + P.followLimit[r.style]));
      }
      // 序盤の位置取り争い（短距離ほど激しい）。earlyDashDistance を過ぎたら徐々に落ち着く
      if (!finished && r.d < P.earlyDashDistance + P.earlyDashFade) {
        const fade = clamp(1 - (r.d - P.earlyDashDistance) / P.earlyDashFade, 0, 1);
        vTarget = Math.max(vTarget, r.ab.cruise * (1 + r.dash * fade));
      }

      // 坂：上りでは脚が鈍り、下りでは少し速くなる（勾配は％で扱う）
      // いまいる区間（d は減らないので前へ進めるだけでよい）
      while (r.piece < lastPiece && r.d >= pieces[r.piece + 1].d0) r.piece++;
      const piece = pieces[r.piece];
      const slope = piece.grade * 100;
      if (slope !== 0 && !finished) vTarget *= 1 - P.slopeSpeed * slope;
      // カーブ：曲率が大きい（半径が小さい）ほど速度の上限が下がる
      if (piece.kIn !== 0 && !finished) {
        const radius = 1 / Math.abs(piece.kIn) + (piece.kIn > 0 ? r.x : -r.x);
        vTarget = Math.min(vTarget, Math.sqrt(P.cornerLateralAccel * radius));
      }

      // 大きく抜け出した先頭馬は、ゴール前で追うのをやめる
      if (!finished && r === leader && remaining < P.easeFrom) {
        let second: Runner | null = null;
        for (let p = pos[i] + 1; p < n; p++) {
          const o = runners[order[p]];
          if (Number.isNaN(o.finishTime)) {
            second = o;
            break;
          }
        }
        const easeGap = r.easeGap;
        if (second && r.d - second.d > easeGap) {
          const eased = second.v + P.easeGain * (easeGap - (r.d - second.d));
          vTarget = Math.min(vTarget, Math.max(second.v - P.easeMaxDrop, eased));
        }
      }

      // 前が壁
      r.blockedBy = -1;
      let drafting = false;
      if (!finished) {
        let nearest = Infinity;
        for (let p = pos[i] - 1; p >= 0; p--) {
          const j = order[p];
          const dd = runners[j].d - r.d;
          if (dd >= P.draftDistance) break;
          // ゴール済みの馬はもう進路の邪魔にならない（記録の有無で結果が変わらないように）
          if (!Number.isNaN(runners[j].finishTime)) continue;
          const dx = Math.abs(runners[j].x - r.x);
          if (dd > 0 && dx < P.laneWidth * 1.2) drafting = true;
          if (dd > 0 && dd < P.blockDistance && dd < nearest && dx < P.laneWidth * 0.9) {
            nearest = dd;
            r.blockedBy = j;
          }
        }
        if (r.blockedBy >= 0) {
          const front = runners[r.blockedBy];
          vTarget = Math.min(vTarget, front.v + (nearest - 1.4) * 0.8);
        }
      }

      // 速度
      const acc =
        r.v < r.ab.cruise * 0.85 && r.d < 300 ? r.ab.startAccel : r.spurting ? P.spurtAccel : P.accel;
      const dv = vTarget - r.v;
      r.v = Math.max(0, r.v + clamp(dv, -P.decel * dt, acc * dt));

      // 横位置の判断
      if (!finished && (step + i) % P.lateralInterval === 0) {
        const wantsOut = r.blockedBy >= 0 && (r.spurting || keen || vTarget < r.ab.cruise * 0.97);
        if (wantsOut) {
          if (tNext < r.stuckUntil) {
            // 進路が開かない
          } else if (r.trafficTrouble && r.spurting) {
            r.trafficTrouble = false;
            r.stuckUntil = tNext + rng.range(...P.trafficTroubleDuration);
            events.push({ kind: 'blocked', number: r.number, time: tNext });
          } else {
            const out = r.x + P.laneWidth;
            if (out < 20 && laneClear(i, out, 2.5, 2.0)) r.targetX = out;
          }
        } else if (r.blockedBy < 0 && r.x > 0.6) {
          const inside = Math.max(0.5, r.x - P.laneWidth);
          // 直線で仕掛けている馬は内に切り込まない
          if (!r.spurting && laneClear(i, inside, 4.0, 3.0)) r.targetX = inside;
        }
      }
      const dx = r.targetX - r.x;
      r.x += clamp(dx, -P.lateralSpeed * dt, P.lateralSpeed * dt);

      // 前進（カーブでは外を回るほど内ラチ換算の進みが小さい）
      const factor = piece.kIn === 0 ? 1 : 1 / (1 + piece.kIn * r.x);
      const dPrev = r.d;
      r.d += r.v * dt * factor;

      // スタミナ
      if (!finished) {
        const ratio = r.v / r.ab.cruise;
        r.stamina -=
          Math.pow(ratio, P.burnExponent) * dt * r.ab.burnFactor *
          // 仕掛け前に自分の巡航速度を超えて走ると余計に消耗する（ハイペースで前が苦しくなる）
          (!r.spurting && ratio > 1 ? 1 + P.overPacePenalty * (ratio - 1) : 1) *
          (keen ? P.keenBurn : 1) *
          (drafting ? 1 - P.draftRelief : 1) *
          // 上り坂はスタミナを余計に使い、下り坂は少し楽
          Math.max(0.7, 1 + P.slopeBurn * slope);
      }

      // 通過時刻（補間）
      const moved = r.d - dPrev;
      if (dPrev < D - 600 && r.d >= D - 600) r.last600Time = t + (dt * (D - 600 - dPrev)) / moved;
      const lapIdx = r.d >= firstMark ? Math.floor((r.d - firstMark) / 200) : -1;
      if (lapIdx >= 0 && lapIdx < lapCount && Number.isNaN(lapCross[lapIdx])) {
        const mark = marks[lapIdx];
        if (dPrev < mark) lapCross[lapIdx] = t + (dt * (mark - dPrev)) / moved;
      }
      if (Number.isNaN(split600) && dPrev < 600 && r.d >= 600) split600 = t + (dt * (600 - dPrev)) / moved;
      if (!finished && r.d >= D) {
        r.finishTime = t + (dt * (D - dPrev)) / moved;
        r.finishSpeed = r.v;
        finishedCount++;
        if (finishedCount === n) allFinishedAt = r.finishTime;
      }
    }

    t = tNext;
    step++;
    if (record) pushFrame();
  }

  // 万一ゴールしなかった馬（打ち切り）は最後の位置から推定
  for (const r of runners) {
    if (Number.isNaN(r.finishTime)) {
      r.finishTime = t + (D - r.d) / Math.max(1, r.v);
      r.finishSpeed = Math.max(1, r.v);
    }
    if (Number.isNaN(r.last600Time)) r.last600Time = r.finishTime - 600 / Math.max(1, r.v);
  }

  const laps = lapCross.map((c, i) => (i === 0 ? c : c - lapCross[i - 1]));
  const log: RaceLog | null = record
    ? { dt, steps: step + 1, horses: n, data: Float32Array.from(frames) }
    : null;
  if (log && log.data.length !== log.steps * n * LOG_FIELDS) throw new Error('log size mismatch');

  return {
    setup,
    finish: finishRecords(
      runners.map((r) => ({
        number: r.number,
        time: r.finishTime,
        speed: r.finishSpeed,
        last3f: r.finishTime - r.last600Time,
      })),
    ),
    laps,
    lapMarks: marks,
    first3f: split600,
    pace: judgePace(split600, laps),
    events,
    log,
  };
}

function hasRivalNear(runners: Runner[], self: Runner, range: number): boolean {
  for (const o of runners) {
    if (o !== self && Math.abs(o.d - self.d) < range && o.d > 50) return true;
  }
  return false;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
