/**
 * 市場（オッズ）の調整用。名簿の世界を一度だけ走らせて観戦レースの出走表と着順を集め、
 * 市場のつまみ（betting/params.ts の BETTING）を変えながら、何度でも安く評価する。
 * 世界の進み方は市場に依存しない（人気は戦績に残すだけ）ので、着順は使い回せる。
 *   npx tsx tools/market_tune.ts --years 10 --seed 2026 --grid '[{"strengthTemperature":0.1}]'
 */
import { BETTING } from '../src/betting/params.ts';
import { BALANCE } from '../src/sim/balance.ts';
import { buildMarket, settle } from '../src/betting/index.ts';
import { combinationKey, quinellaKey } from '../src/betting/types.ts';
import { simulateRace } from '../src/sim/engine.ts';
import { horseProfiles, type HorseProfile } from '../src/sim/profile.ts';
import { WEEKS_PER_YEAR } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld, raceKey } from '../src/sim/world/advance.ts';
import { raceSetup, weekCard } from '../src/sim/world/schedule.ts';
import type { FinishRecord, RaceSetup } from '../src/sim/types.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const YEARS = Number(arg('years', '10'));
const SEED = Number(arg('seed', '2026'));
const GRID: Record<string, unknown>[] = JSON.parse(arg('grid', '[{}]'));
/** 世界の側のつまみ（BALANCE）の変更。節ごとに上書きする（例：'{"layoff":{"spread":0}}'） */
const BAL: Record<string, Record<string, unknown>> = JSON.parse(arg('balance', '{}'));
for (const [k, v] of Object.entries(BAL)) Object.assign((BALANCE as unknown as Record<string, object>)[k], v);

interface Race {
  setup: RaceSetup;
  profiles: HorseProfile[];
  order: number[];
  /** 馬番ごとの前走からの週（実際の日付）。初出走は null */
  gap: (number | null)[];
  /** 馬番ごとに、前走が夏休みの前（夏明けの初戦） */
  summer: boolean[];
  grade: 'G1' | 'G2' | 'G3' | null;
}

const dayNum = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
const races: Race[] = [];
const world = createWorld(SEED);
const t0 = Date.now();
for (let k = 0; k < YEARS * WEEKS_PER_YEAR; k++) {
  const card = weekCard(world);
  const finishes: Record<string, FinishRecord[]> = {};
  for (const r of card.races.filter((x) => x.visible && x.horseIds.length > 0)) {
    const day = card.week.days[r.dayIndex];
    const setup = raceSetup(world, card, r);
    const result = simulateRace(setup, { record: false });
    finishes[raceKey(world.serial, r)] = result.finish;
    const today = dayNum(card.year, day.month, day.day);
    const gap = setup.entries.map((e) => {
      const last = e.history?.[0];
      return last?.year ? (today - dayNum(last.year, last.month!, last.day!)) / 7 : null;
    });
    const summer = setup.entries.map((e) => {
      const last = e.history?.[0];
      return !!last?.year && last.year === card.year && last.month! <= 6 && day.month >= 9;
    });
    races.push({ setup, profiles: horseProfiles(setup), order: result.finish.map((f) => f.number), gap, summer, grade: r.grade });
  }
  advanceWeek(world, { finishes });
}
process.stderr.write(`collected ${races.length} races (${Math.round((Date.now() - t0) / 1000)}s)\n`);

const base = structuredClone(BETTING);
type Row = Record<string, string | number>;
const rows: Row[] = [];

for (const patch of GRID) {
  Object.assign(BETTING, structuredClone(base), patch);
  const acc: Record<string, { st: number; ret: number; n: number; hit: number }> = {};
  const add = (name: string, stake: number, ret: number, hit: boolean) => {
    const a = (acc[name] ??= { st: 0, ret: 0, n: 0, hit: 0 });
    a.st += stake;
    a.ret += ret;
    a.n++;
    if (hit) a.hit++;
  };
  const cal: Record<string, { exp: number; hit: number }> = {};
  const calib = (name: string, imp: number, hit: boolean) => {
    const c = (cal[name] ??= { exp: 0, hit: 0 });
    c.exp += imp;
    if (hit) c.hit++;
  };
  let favTop3 = 0;
  for (const race of races) {
    const market = buildMarket(race.setup, race.profiles);
    const board = market.boards[market.boards.length - 1];
    const pay = settle(market, race.order);
    const n = race.setup.entries.length;
    const won = race.order[0];
    race.setup.entries.forEach((e, i) => {
      const pop = board.popularity[i];
      const o = board.win[i];
      const hit = e.number === won;
      const g = pop === 1 ? 'p1' : pop === 2 ? 'p2' : pop === 3 ? 'p3' : pop <= 5 ? 'p4-5' : pop <= 9 ? 'p6-9' : pop === 10 ? 'p10' : 'p11+';
      add(`win ${g}`, 1, hit ? o : 0, hit);
      add('win all', 1, hit ? o : 0, hit);
      if (pop <= 3) add('win p1-3', 1, hit ? o : 0, hit);
      if (pop >= 10) add('win p10+', 1, hit ? o : 0, hit);
      if (o < 2) add('win odds<2', 1, hit ? o : 0, hit);
      if (pop === 1 && race.order.slice(0, 3).includes(e.number)) favTop3++;
      // G1 の1番人気に重賞の実績（重賞勝ちか近3走の重賞3着以内）があるか
      if (pop === 1 && race.grade === 'G1') {
        const rec = e.record;
        const credit = (rec?.gradedWins ?? 0) > 0 || (e.history ?? []).slice(0, 3).some((x) => x.grade && x.rank <= 3);
        add('g1 fav credit', 1, credit ? 1 : 0, credit);
      }
      const gap = race.gap[i];
      if (gap !== null && gap >= 10) {
        add('layoff', 1, hit ? o : 0, hit);
        add(race.summer[i] ? 'layoff summer' : 'layoff other', 1, hit ? o : 0, hit);
        if (pop >= 4 && pop <= 7) add('layoff p4-7', 1, hit ? o : 0, hit);
      }
      const placed = pay.place.find((x) => x.number === e.number);
      add('place all', 1, placed ? placed.odds : 0, !!placed);
    });
    // 全通り買い
    add('all quinella', board.quinella.size, pay.quinella.odds, true);
    add('all wide', board.wide.size, pay.wide.reduce((a, w) => a + w.odds, 0), true);
    add('all exacta', board.exacta.size, pay.exacta.odds, true);
    add('all trio', board.trio.size, pay.trio.odds, true);
    add('all trifecta', board.trifecta.size, pay.trifecta.odds, true);
    // 校正
    const fk = combinationKey('trifecta', race.order.slice(0, 3));
    for (const [kk, o] of board.trifecta) {
      const imp = (1 - BETTING.takeout.trifecta) / o;
      const band = imp >= 0.01 ? 'tri a>=1%' : imp >= 0.001 ? 'tri b' : imp >= 0.0001 ? 'tri c' : 'tri d<.01%';
      calib(band, imp, kk === fk);
    }
    const ek = combinationKey('exacta', race.order.slice(0, 2));
    for (const [kk, o] of board.exacta) {
      const imp = (1 - BETTING.takeout.exacta) / o;
      const band = imp >= 0.05 ? 'ex a>=5%' : imp >= 0.01 ? 'ex b' : imp >= 0.002 ? 'ex c' : 'ex d<.2%';
      calib(band, imp, kk === ek);
    }
    // 単勝オッズから逆算した Harville の期待値で選ぶ馬連・馬単
    const inv = board.win.map((o) => 1 / o);
    const z = inv.reduce((a, b) => a + b, 0);
    const p = inv.map((x) => x / z);
    const ex = (i: number, j: number) => (p[i] * p[j]) / (1 - p[i]);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const ko = combinationKey('exacta', [i + 1, j + 1]);
        const o = board.exacta.get(ko)!;
        if (ex(i, j) * o >= 1) add('EV exacta', 1, ko === ek ? o : 0, ko === ek);
        if (i < j) {
          const kq = quinellaKey(i + 1, j + 1);
          const oq = board.quinella.get(kq)!;
          if ((ex(i, j) + ex(j, i)) * oq >= 1) add('EV quinella', 1, kq === quinellaKey(race.order[0], race.order[1]) ? oq : 0, kq === quinellaKey(race.order[0], race.order[1]));
        }
      }
  }
  const row: Row = { patch: JSON.stringify(patch) };
  const pct = (x: number) => Math.round(x * 1000) / 10;
  for (const [k, a] of Object.entries(acc)) {
    row[`${k} roi`] = pct(a.ret / a.st);
    if (k.startsWith('win ')) row[`${k} w`] = pct(a.hit / a.n);
  }
  row['fav top3'] = pct(favTop3 / races.length);
  for (const [k, c] of Object.entries(cal)) row[k] = Math.round((c.hit / c.exp) * 100) / 100;
  rows.push(row);
  console.log(JSON.stringify(row));
}
