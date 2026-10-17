/**
 * オッズの決め方を1レースで分解して見せる（人気の基準の説明用）。
 *   npm run sim:odds -- --race 有馬記念 --seed 2026 --year 2026
 * 馬ごとに：見た目の強さ（公開の能力値）・実績・騎手 → 推定勝率 → 票の上乗せ（前走・予想記事） → 単勝オッズ
 */
import { BETTING, buildMarket } from '../src/betting/index.ts';
import { reputation, winProbabilities } from '../src/betting/market.ts';
import { apparentStrength } from '../src/sim/rating.ts';
import { horseProfiles } from '../src/sim/profile.ts';
import { weekOf } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld } from '../src/sim/world/advance.ts';
import { raceSetup, weekCard } from '../src/sim/world/schedule.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const RACE = arg('race', '有馬記念');
const SEED = Number(arg('seed', '2026'));
const YEAR = Number(arg('year', '2026'));

const world = createWorld(SEED);
for (;;) {
  const { year } = weekOf(world.serial);
  if (year > YEAR) throw new Error(`${YEAR}年に${RACE}が見つからない`);
  const card = weekCard(world);
  const race = card.races.find((r) => r.program.name === RACE && r.horseIds.length > 0);
  if (year === YEAR && race) {
    const setup = raceSetup(world, card, race);
    const profiles = horseProfiles(setup);
    const strength = apparentStrength(setup, 'public');
    const p = winProbabilities(setup);
    const board = buildMarket(setup, profiles).boards.at(-1)!;
    const f = (x: number, d = 3) => x.toFixed(d);
    console.log(`${YEAR}年 ${RACE}（${setup.course.surface === 'turf' ? '芝' : 'ダート'}${setup.course.distance}m・${setup.entries.length}頭）`);
    console.log(`温度 ${BETTING.strengthTemperature}・抜けた本命の差の縮め ${BETTING.leaderGapShrink}・均等票 ${BETTING.longshotFloor * 100}%・控除 ${BETTING.takeout.win * 100}%`);
    console.log('| 人気 | 馬番 | 馬名 | 騎手 | 見た目の強さ | 実績 | 疲れ | 騎手の人気 | 合計 | 推定勝率 | 前走の上乗せ | 記事 | 単勝 |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    const rows = setup.entries.map((e, i) => {
      const jk = e.jockey ? BETTING.jockeyPopularity[e.jockey.rank] : 0;
      const tired = -BETTING.reputation.fatigue * (e.record?.fatigue ?? 0);
      const rep = reputation(e) - jk - tired;
      const last = profiles.find((x) => x.number === e.number)?.recent[0];
      const form = last ? (last.rank === 1 ? 1 : last.rank === 2 ? 0.7 : last.rank === 3 ? 0.5 : last.rank <= 5 ? 0.2 : 0) * BETTING.recentFormBias : 0;
      const press = setup.press?.favorite === e.number ? '本命 +5%' : setup.press?.darkHorse === e.number ? '穴 +20%' : '';
      return {
        pop: board.popularity[i],
        line: `| ${board.popularity[i]} | ${e.number} | ${e.horse.name} | ${e.jockey ? `${e.jockey.name}（${e.jockey.rank}）` : '—'} | ${f(strength[i])} | +${f(rep)} | ${f(tired)} | +${f(jk)} | ${f(strength[i] + rep + tired + jk)} | ${(p[i] * 100).toFixed(1)}% | ${form > 0 ? `+${Math.round(form * 100)}%` : ''} | ${press} | ${board.win[i].toFixed(1)} |`,
      };
    });
    for (const r of rows.sort((a, b) => a.pop - b.pop)) console.log(r.line);
    break;
  }
  advanceWeek(world, { full: false });
}
