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
  baseCruise: { turf: 16.75, dirt: 16.15 } as Record<Surface, number>,
  /** 距離による巡航速度の補正：(1600 / 距離) ^ この値 */
  cruiseDistanceExponent: 0.05,
  /** スピード能力 0→100 で巡航速度に掛かる倍率の幅 */
  speedStatRange: 0.03,
  /** 馬場状態による速度倍率 */
  conditionSpeed: { good: 1.0, yielding: 0.992, soft: 0.982, heavy: 0.97 } as Record<
    TrackCondition,
    number
  >,
  /** 馬場状態によるスタミナ消費倍率 */
  conditionBurn: { good: 1.0, yielding: 1.03, soft: 1.06, heavy: 1.1 } as Record<
    TrackCondition,
    number
  >,
  /** パワー100 で重馬場のスタミナ消費増をこの割合だけ打ち消す */
  powerMudRelief: 0.6,

  /** 末脚：最高速 = 巡航速度 × (1 + kickBase + kickRange × 瞬発力/100) */
  kickBase: 0.0,
  kickRange: 0.13,
  /** 末脚の伸びの馬場（芝・ダート）による倍率。ダートは上がりがかかる */
  kickSurface: { turf: 1, dirt: 0.75 } as Record<Surface, number>,
  /** 仕掛けでの騎手の見積もり違い（標準偏差） */
  jockeyJitter: 0.02,

  /** スタミナ量 = 必要量 × (staminaBase + staminaRange × スタミナ/100) */
  staminaBase: 1.02,
  staminaRange: 0.1,
  /** スタミナ消費 = (速度 / 巡航速度) ^ burnExponent */
  burnExponent: 3,
  /** 仕掛け前に巡航速度を超えたときの追加消費：1 + k × (速度比 - 1) */
  overPacePenalty: 1.5,
  /** 得意距離より長いときのスタミナ減少：1 - k × (距離/得意距離 - 1) */
  longDistancePenalty: 0.1,
  /** 得意距離より短いときの速度減少：1 - k × (得意距離/距離 - 1) */
  shortDistancePenalty: 0.012,
  /** スタミナ切れ後の速度（巡航速度に対する倍率） */
  exhaustedSpeed: 0.86,

  /** 発馬直後の加速度（m/s²）。パワーで最大 +30% */
  startAccel: 7,
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
  /** 序盤（この距離まで）は脚質に応じて巡航速度より速く出して位置を取りに行く */
  earlyDashDistance: 350,
  earlyDash: { nige: 0.03, senko: 0.02, sashi: 0.01, oikomi: 0.0 } as Record<RunningStyle, number>,
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
  /** 追い出してからの加速度（m/s²） */
  spurtAccel: 1.6,
  /** 仕掛け開始（残り距離, m）の平均。±spurtJitter */
  spurtStart: { nige: 420, senko: 520, sashi: 640, oikomi: 800 } as Record<RunningStyle, number>,
  spurtJitter: 90,

  /** 前の馬との距離がこれ未満で同じ進路なら「前が壁」 */
  blockDistance: 2.4,
  /** 進路の幅（m）。これより横に離れていれば別の進路 */
  laneWidth: 1.1,
  /** 横移動速度（m/s） */
  lateralSpeed: 0.9,
  /** 横位置の判断間隔（ステップ） */
  lateralInterval: 6,
  /** 進路が開かないイベントの確率（1レースで1頭あたり）と持続（秒） */
  trafficTroubleChance: 0.05,
  trafficTroubleDuration: [1.5, 3.5] as [number, number],

  /** ペース判定：前半3F − 後半3F からスタート分 paceStartAllowance 秒を引き、±paceThreshold を超えたらハイ／スロー */
  paceStartAllowance: 2.5,
  paceThreshold: 0.55,

  /** 1馬身（m） */
  bodyLength: 2.4,
};
