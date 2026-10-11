import { effectiveAbility } from './ability';
import { Rng } from './rng';
import type { RaceSetup } from './types';

/**
 * 当日の調子を除いた「見た目の強さ」（m/s 換算）。値が大きいほど強い。
 * view = 'public' はファンに見えている能力値で計算する（オッズの土台）。'true' は本当の能力値（簡易な結果・計測用）。
 * 重みはシミュレーションの着順（1〜3着）に条件付きロジットを当てはめて決めた（名簿の馬の約1100レース）。
 * 巡航速度を1として、末脚 0.28・スタミナの余裕 1.9（足りないぶんは 4）・先行 +0.1・逃げ +0.06・外枠 -0.03
 */
export function apparentStrength(setup: RaceSetup, view: 'true' | 'public' = 'true'): number[] {
  const n = setup.entries.length;
  return setup.entries.map((entry, i) => {
    // 市場（ファン）の見方では、見えている能力値（夏の隠れた成長を除く）を使う
    const seen = view === 'public' && entry.horse.publicStats ? { ...entry, horse: { ...entry.horse, stats: entry.horse.publicStats } } : entry;
    const ab = effectiveAbility(seen, setup.course, false);
    const need = setup.course.distance / ab.cruise;
    const margin = ab.staminaPool / need - 1;
    const style = entry.horse.style;
    return (
      ab.cruise +
      0.28 * (ab.top - ab.cruise) +
      1.9 * Math.min(Math.max(margin, 0), 0.3) +
      4 * Math.min(margin, 0) -
      1.6 * (ab.burnFactor - 1) +
      (style === 'senko' ? 0.1 : style === 'nige' ? 0.06 : 0) -
      0.03 * (i / n)
    );
  });
}

/**
 * 仮の人気順（段階4でパリミュチュエルのオッズに置き換える）。
 * 見た目の強さに大衆の見誤り（ノイズ）を加えて並べる。返り値は馬番の配列で、先頭が1番人気。
 */
export function provisionalPopularity(setup: RaceSetup, noise = 0.02): number[] {
  const rng = new Rng(setup.seed).fork(3);
  const strength = apparentStrength(setup);
  return setup.entries
    .map((e, i) => ({ number: e.number, score: strength[i] + rng.normal(0, noise) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.number);
}
