import { effectiveAbility } from './ability';
import { Rng } from './rng';
import type { RaceSetup } from './types';

/**
 * 当日の調子を除いた「見た目の強さ」。値が大きいほど強い。
 * 段階4でオッズ（大衆の仮想投票）を作るときの土台にする。
 */
export function apparentStrength(setup: RaceSetup): number[] {
  return setup.entries.map((entry) => {
    const ab = effectiveAbility(entry, setup.course, false);
    const need = setup.course.distance / ab.cruise;
    const staminaMargin = ab.staminaPool / need - 1;
    return ab.cruise + 0.5 * (ab.top - ab.cruise) + 2.0 * Math.min(staminaMargin, 0.1);
  });
}

/**
 * 仮の人気順（段階4でパリミュチュエルのオッズに置き換える）。
 * 見た目の強さに大衆の見誤り（ノイズ）を加えて並べる。返り値は馬番の配列で、先頭が1番人気。
 */
export function provisionalPopularity(setup: RaceSetup, noise = 0.04): number[] {
  const rng = new Rng(setup.seed).fork(3);
  const strength = apparentStrength(setup);
  return setup.entries
    .map((e, i) => ({ number: e.number, score: strength[i] + rng.normal(0, noise) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.number);
}
