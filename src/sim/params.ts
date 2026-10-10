import type { RunningStyle, Surface, TrackCondition } from './types';

/**
 * シミュレーションの調整用パラメータ。
 * 数値は初期値で、stats.test.ts の統計を見ながら調整する。
 */
export const PARAMS = {
  /** 固定タイムステップ（秒） */
  dt: 1 / 60,
  /** これを超えたら打ち切る（秒） */
  maxTime: 240,

  /** 1600m・良馬場・能力50 の巡航速度（m/s） */
  baseCruise: { turf: 16.9, dirt: 16.31 } as Record<Surface, number>,
  /** 距離による巡航速度の補正：(1600 / 距離) ^ この値 */
  cruiseDistanceExponent: { turf: 0.08, dirt: 0.13 } as Record<Surface, number>,
  /** スピード能力 0→100 で巡航速度に掛かる倍率の幅 */
  speedStatRange: 0.04,
  /** 馬場状態による速度倍率。芝は道悪で遅く、ダートは砂が締まって速くなる */
  conditionSpeed: {
    turf: { good: 1.0, yielding: 0.994, soft: 0.988, heavy: 0.982 },
    dirt: { good: 1.0, yielding: 1.004, soft: 1.008, heavy: 1.012 },
  } as Record<Surface, Record<TrackCondition, number>>,
  /** 馬場状態によるスタミナ消費倍率 */
  conditionBurn: {
    turf: { good: 1.0, yielding: 1.03, soft: 1.06, heavy: 1.1 },
    dirt: { good: 1.0, yielding: 1.0, soft: 1.0, heavy: 1.0 },
  } as Record<Surface, Record<TrackCondition, number>>,
  /** 馬場状態による末脚の伸びの倍率（芝の道悪は上がりがかかる） */
  conditionKick: {
    turf: { good: 1.0, yielding: 0.85, soft: 0.7, heavy: 0.55 },
    dirt: { good: 1.0, yielding: 1.04, soft: 1.08, heavy: 1.15 },
  } as Record<Surface, Record<TrackCondition, number>>,
  /** パワー100 で重馬場のスタミナ消費増をこの割合だけ打ち消す */
  powerMudRelief: 0.6,

  /** 末脚：最高速 = 巡航速度 × (1 + kickBase + kickRange × 瞬発力/100) */
  kickBase: 0.0,
  kickRange: 0.13,
  /** 末脚の伸びの馬場（芝・ダート）による倍率。ダートは上がりがかかる */
  kickSurface: { turf: 1, dirt: 0.5 } as Record<Surface, number>,
  /** 末脚の伸びの距離による倍率：(距離 / 1600) ^ この値。短距離は前半が速いぶん上がりがかかる */
  kickDistanceExp: { turf: 0.7, dirt: 0.0 } as Record<Surface, number>,
  /** 仕掛けでの騎手の見積もり違い（標準偏差） */
  jockeyJitter: 0.02,

  /** スタミナ量 = 必要量 × (staminaBase + staminaRange × スタミナ/100) */
  staminaBase: 1.02,
  staminaRange: 0.1,
  /** スタミナ消費 = (速度 / 巡航速度) ^ burnExponent */
  burnExponent: 3,
  /** 仕掛け前に巡航速度を超えたときの追加消費：1 + k × (速度比 - 1) */
  overPacePenalty: 2.5,
  /** 得意距離より長いときのスタミナ減少：1 - k × (距離/得意距離 - 1) */
  longDistancePenalty: 0.1,
  /** 得意距離より短いときの速度減少：1 - k × (得意距離/距離 - 1) */
  shortDistancePenalty: 0.012,
  /** スタミナ切れ後の速度（巡航速度に対する倍率） */
  exhaustedSpeed: 0.86,

  /** 発馬直後の加速度（m/s²）。パワーで最大 +30% */
  startAccel: 9,
  /** 通常の加速度・減速度（m/s²） */
  accel: 0.9,
  decel: 1.4,

  /** 出遅れ確率 = slowStartBase × (1 - スタート/100 × 0.8) */
  slowStartBase: 0.07,
  /** 出遅れ時の遅れ（秒） */
  slowStartDelay: [0.5, 1.4] as [number, number],
  /** 通常の反応のばらつき（秒） */
  reactionJitter: 0.2,

  /** 掛かり確率 = keenBase × (1 - 気性/100 × 0.8) */
  keenBase: 0.1,
  /** 掛かっている間のスタミナ消費倍率と持続（秒） */
  keenBurn: 1.35,
  keenDuration: [8, 20] as [number, number],

  /** 脚質ごとの目標位置（先頭からの差、m）の範囲 */
  targetGap: {
    nige: [0, 0],
    senko: [2, 7],
    sashi: [6, 12],
    oikomi: [10, 16],
  } as Record<RunningStyle, [number, number]>,
  /** 前の馬の後ろ（この距離以内）につけると風よけでスタミナ消費が減る */
  draftDistance: 5,
  draftRelief: 0.1,
  /** 先頭のペースについていくとき、巡航速度をこの割合まで超えてよい（後ろの脚質ほど無理をしない） */
  followLimit: { nige: 0.05, senko: 0.03, sashi: 0.012, oikomi: 0.0 } as Record<RunningStyle, number>,
  /** 逃げ馬・掛かった馬が自分から上げるペースの上限（巡航速度に対する割合） */
  paceTolerance: { nige: 0.035, senko: 0.02, sashi: 0.02, oikomi: 0.02 } as Record<
    RunningStyle,
    number
  >,
  /** 序盤（この距離まで）は脚質に応じて巡航速度より速く出して位置を取りに行く。その後 earlyDashFade m かけて落ち着く */
  earlyDashDistance: 300,
  earlyDashFade: 250,
  /** 脚質ごとの上乗せ。実際の値 = これ × earlyDashSurface × (1200 / 距離) ^ earlyDashDistanceExp */
  earlyDash: { nige: 1.0, senko: 0.8, sashi: 0.45, oikomi: 0.2 } as Record<RunningStyle, number>,
  earlyDashSurface: { turf: 0.09, dirt: 0.09 } as Record<Surface, number>,
  earlyDashDistanceExp: 0.7,
  /** 逃げ馬以外が先頭に立ったときに巡航速度から抑える割合 */
  reluctantLeaderEase: 0.012,
  /** レースごとのペースのばらつき（標準偏差、巡航速度に対する割合） */
  racePaceJitter: 0.012,
  /** 位置取りのための速度補正の強さ（1/s） */
  positionGain: 0.08,
  /** 逃げ馬の上乗せ：単独なら pushSolo、競り合うと pushDuel */
  nigePushSolo: 0.008,
  nigePushDuel: 0.03,

  /** 仕掛けてから直線に入るまでの速度の上限（巡航速度に対する上乗せ）。直線で一気に追い出す。
   *  後ろの脚質ほど3〜4コーナーで外からまくって進出する */
  spurtCurveCap: { nige: 0.0, senko: 0.01, sashi: 0.035, oikomi: 0.05 } as Record<RunningStyle, number>,
  /** 直線の長さによる末脚の補正：直線が referenceStretch より100m長いごとに、最高速が この値% 変わる */
  referenceStretch: 380,
  stretchBias: { nige: -0.015, senko: -0.008, sashi: 0.01, oikomi: 0.02 } as Record<RunningStyle, number>,
  /** 直線で追い出しを始める残り距離（脚質ごと、±kickJitter） */
  kickAt: { nige: 420, senko: 440, sashi: 460, oikomi: 480 } as Record<RunningStyle, number>,
  kickJitter: 40,
  /** コーナーの半径による、3〜4コーナーで押し上げられる速さの倍率：(半径 / referenceRadius) ^ curveEaseExponent */
  referenceRadius: 150,
  curveEaseExponent: 2,
  /** 追い出してからの最高速の落ち方（1秒あたりの割合）。ダートは脚が上がりやすい */
  kickFade: { turf: 0.0042, dirt: 0.0045 } as Record<Surface, number>,
  /** 失速の距離による倍率：(1600 / 距離) ^ この値。短距離ほど前半で脚を使っているので止まりやすい */
  kickFadeDistanceExp: 0.8,
  /** 追い出してからの加速度（m/s²） */
  spurtAccel: 1.6,
  /** 仕掛け開始（残り距離, m）の平均。±spurtJitter */
  spurtStart: { nige: 420, senko: 520, sashi: 640, oikomi: 800 } as Record<RunningStyle, number>,
  spurtJitter: 90,

  /**
   * カーブで出せる横向きの加速度の上限（m/s²）。カーブの速度の上限は √(この値 × 走っている半径)。
   * 走っている半径は「カーブの半径（曲率の逆数）＋内ラチからの横位置」なので、外を回るほど速く回れるが道のりは長い。
   * 半径150mでは上限が約20m/s で効かず、ダートの小回り（半径90〜120m）で効く
   */
  cornerLateralAccel: 2.8,

  /** 坂：勾配1%あたりの目標速度の低下と、スタミナ消費の増加（下りは逆） */
  slopeSpeed: 0.012,
  slopeBurn: 0.12,

  /** 前の馬との距離がこれ未満で同じ進路なら「前が壁」 */
  blockDistance: 2.4,
  /** 進路の幅（m）。これより横に離れていれば別の進路 */
  laneWidth: 1.1,
  /** 横移動速度（m/s） */
  lateralSpeed: 0.9,
  /**
   * 内へ寄せるときに空いていてほしい前後の距離（m）。前は詰まり（blockDistance）より少し長く、
   * 前の馬の真後ろに入れる。広すぎると外枠の馬がいつまでも外を回らされる
   */
  tuckAhead: 2.5,
  tuckBehind: 1.0,
  /** 横位置の判断間隔（ステップ） */
  lateralInterval: 6,
  /** 進路が開かないイベントの確率（1レースで1頭あたり）と持続（秒） */
  trafficTroubleChance: 0.05,
  trafficTroubleDuration: [1.5, 3.5] as [number, number],

  /** ペース判定：前半3F − 後半3F（− paceStartAllowance）が −paceThreshold 未満ならハイ、+paceThreshold 超ならスロー。
   *  1F目が12秒台になるよう発馬を調整したので、補正なしで前後半をそのまま比べる */
  paceStartAllowance: 0,
  paceThreshold: 0.5,

  /** 1馬身（m） */
  bodyLength: 2.4,
  /**
   * 大きく抜け出した先頭馬は、ゴール前で追うのをやめる（馬なりで流す）。
   * 残り easeFrom m から、2着馬との差が流し始める差を超えた分に easeGain を掛けて、2着馬の速度より遅くする
   * （下げ幅は easeMaxDrop m/s まで）。着順は変えずに、大差勝ちを現実的な幅に収める
   */
  easeFrom: 300,
  /** 流し始める差（馬身）。騎手によって違うので、この範囲で馬ごとに決める */
  easeGapLengths: [1.5, 4.5] as [number, number],
  easeGain: 0.1,
  easeMaxDrop: 0.5,
  /**
   * 同じレースの出走馬の能力値のばらつき（標準偏差）。クラス分けされたレースは力の近い馬が集まるので小さめ。
   * 大きいと着差が開きすぎる（大差勝ちが多くなる）
   */
  statSpread: 10,
};
