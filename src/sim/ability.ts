import { PARAMS } from './params';
import type { Course, Entry } from './types';

/** レース当日の、その馬の実効能力（エンジン内部で使う） */
export interface EffectiveAbility {
  /** 巡航速度（m/s） */
  cruise: number;
  /** 末脚の最高速（m/s） */
  top: number;
  /** スタミナ量（巡航速度で走れる秒数の目安） */
  staminaPool: number;
  /** スタミナ消費倍率（馬場状態による） */
  burnFactor: number;
  /** 発馬直後の加速度 */
  startAccel: number;
}

/**
 * 能力値・適性・当日の調子・コースから実効能力を求める。
 * includeForm = false にすると当日の調子を除いた値（外から見える強さの推定用）になる。
 */
export function effectiveAbility(entry: Entry, course: Course, includeForm = true): EffectiveAbility {
  const { stats, bestDistance, surfaceAptitude } = entry.horse;
  const D = course.distance;
  const form = includeForm ? entry.form : 1;

  const shortPenalty =
    D < bestDistance ? 1 - PARAMS.shortDistancePenalty * (bestDistance / D - 1) : 1;
  const longPenalty = D > bestDistance ? 1 - PARAMS.longDistancePenalty * (D / bestDistance - 1) : 1;

  const cruise =
    PARAMS.baseCruise[course.surface] *
    Math.pow(1600 / D, PARAMS.cruiseDistanceExponent) *
    (1 + PARAMS.speedStatRange * (stats.speed / 100 - 0.5)) *
    PARAMS.conditionSpeed[course.surface][course.condition] *
    surfaceAptitude[course.surface] *
    shortPenalty *
    form;

  const top =
    cruise *
    (1 +
      (PARAMS.kickBase + PARAMS.kickRange * (stats.kick / 100)) *
        PARAMS.kickSurface[course.surface] *
        Math.pow(D / 1600, PARAMS.kickDistanceExp) *
        PARAMS.conditionKick[course.surface][course.condition]);

  const staminaPool =
    (D / cruise) * (PARAMS.staminaBase + PARAMS.staminaRange * (stats.stamina / 100)) * longPenalty;

  const mud = PARAMS.conditionBurn[course.surface][course.condition] - 1;
  const burnFactor = 1 + mud * (1 - PARAMS.powerMudRelief * (stats.power / 100));

  const startAccel = PARAMS.startAccel * (1 + 0.3 * (stats.power / 100));

  return { cruise, top, staminaPool, burnFactor, startAccel };
}
