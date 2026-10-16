/**
 * 攻略の穴の検証（分析用）。プレイヤーに見える情報（確定オッズ・出馬表の近走と日付）だけで買い方を決め、
 * 回収率を集計する。ゲームと同じ市場・シミュレーションを使う。
 *   npx tsx tools/strategy_probe.ts --years 10 --seed 2026
 */
import { buildMarket, placeCount, settle } from '../src/betting/index.ts';
import { quinellaKey, combinationKey } from '../src/betting/types.ts';
import { simulateRace } from '../src/sim/engine.ts';
import { horseProfiles } from '../src/sim/profile.ts';
import { WEEKS_PER_YEAR } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld, raceKey } from '../src/sim/world/advance.ts';
import { raceSetup, weekCard } from '../src/sim/world/schedule.ts';
import type { FinishRecord } from '../src/sim/types.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const YEARS = Number(arg('years', '10'));
const SEED = Number(arg('seed', '2026'));

type Acc = { bets: number; stake: number; ret: number; hits: number; races: Set<number>; perRace: Map<number, number> };
const accs = new Map<string, Acc>();
let raceNo = 0;
function bet(name: string, odds: number, hit: boolean) {
  let a = accs.get(name);
  if (!a) accs.set(name, (a = { bets: 0, stake: 0, ret: 0, hits: 0, races: new Set(), perRace: new Map() }));
  a.bets++;
  a.stake += 1;
  a.races.add(raceNo);
  const r = hit ? odds : 0;
  a.ret += r;
  if (hit) a.hits++;
  a.perRace.set(raceNo, (a.perRace.get(raceNo) ?? 0) + r - 1);
}

const cal = new Map<string, { n: number; exp: number; hit: number }>();
function calib(name: string, imp: number, hit: boolean) {
  let c = cal.get(name);
  if (!c) cal.set(name, (c = { n: 0, exp: 0, hit: 0 }));
  c.n++;
  c.exp += imp;
  if (hit) c.hit++;
}
const dayNum = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
const world = createWorld(SEED);
const t0 = Date.now();

for (let k = 0; k < YEARS * WEEKS_PER_YEAR; k++) {
  const card = weekCard(world);
  const finishes: Record<string, FinishRecord[]> = {};
  const popularity: Record<string, number[]> = {};
  for (const r of card.races.filter((x) => x.visible && x.horseIds.length > 0)) {
    raceNo++;
    const day = card.week.days[r.dayIndex];
    const setup = raceSetup(world, card, r);
    const profiles = horseProfiles(setup);
    const market = buildMarket(setup, profiles);
    const board = market.boards[market.boards.length - 1];
    const result = simulateRace(setup, { record: false });
    const order = result.finish.map((f) => f.number);
    const pay = settle(market, order);
    const key = raceKey(world.serial, r);
    finishes[key] = result.finish;
    popularity[key] = board.popularity;
    const n = setup.entries.length;

    // ---------- 単勝・複勝：見える情報での条件 ----------
    const placed = new Set(order.slice(0, placeCount(n)));
    setup.entries.forEach((e, i) => {
      const num = e.number;
      const odds = board.win[i];
      const pop = board.popularity[i];
      const won = order[0] === num;
      const prof = profiles.find((p) => p.number === num)!;
      const last = prof.recent[0];
      const placeOdds = pay.place.find((p) => p.number === num)?.odds ?? 0;
      bet('単勝 全馬', odds, won);
      // 休み明け（出馬表の前走の日付から）
      if (last?.year) {
        const w = (dayNum(day.year ?? card.year, day.month, day.day) - dayNum(last.year, last.month!, last.day!)) / 7;
        if (w >= 10) {
          bet('単勝 休み明け(10週+)', odds, won);
          bet('複勝 休み明け(10週+)', placeOdds, placed.has(num));
          if (pop <= 3) bet('単勝 休み明け 1-3人気', odds, won);
          else if (pop <= 7) bet('単勝 休み明け 4-7人気', odds, won);
          else bet('単勝 休み明け 8人気-', odds, won);
          if (w >= 20) bet('単勝 休み明け(20週+)', odds, won);
        } else if (w < 4) bet('単勝 間隔3週以下', odds, won);
      }
      // 前走着順
      if (last) {
        const g = last.rank === 1 ? '1着' : last.rank <= 3 ? '2-3着' : last.rank <= 5 ? '4-5着' : '6着以下';
        bet(`単勝 前走${g}`, odds, won);
      }
      // 1倍台の本命
      if (odds < 2) bet('単勝 1倍台', odds, won);
      if (odds >= 10 && odds < 20) bet('単勝 10-19.9倍', odds, won);
    });

    // ---------- 全通り買い（頭数別）と、オッズの示す確率と実際の的中のずれ ----------
    {
      const nb = n <= 10 ? '≤10頭' : n <= 14 ? '11-14頭' : '15頭以上';
      const tk = combinationKey('trio', order.slice(0, 3));
      for (const [kk, o] of board.trio) bet(`3連複 全通り ${nb}`, o, kk === tk);
      const qk = quinellaKey(order[0], order[1]);
      for (const [kk, o] of board.quinella) bet(`馬連 全通り ${nb}`, o, kk === qk);
      const fk = combinationKey('trifecta', order.slice(0, 3));
      for (const [kk, o] of board.trifecta) {
        // オッズから見た確率 = (1-控除)/オッズ の帯で、実際の的中を数える
        const imp = 0.725 / o;
        const band = imp >= 0.01 ? 'a ≥1%' : imp >= 0.001 ? 'b 0.1-1%' : imp >= 0.0001 ? 'c 0.01-0.1%' : 'd <0.01%';
        calib(`3連単 ${band}`, imp, kk === fk);
      }
      const ek = combinationKey('exacta', order.slice(0, 2));
      for (const [kk, o] of board.exacta) {
        const imp = 0.75 / o;
        const band = imp >= 0.05 ? 'a ≥5%' : imp >= 0.01 ? 'b 1-5%' : imp >= 0.002 ? 'c 0.2-1%' : 'd <0.2%';
        calib(`馬単 ${band}`, imp, kk === ek);
      }
    }
    // ---------- 券種間の歪み：単勝オッズから勝率を逆算し、組み合わせの期待値で選ぶ ----------
    const inv = board.win.map((o) => 1 / o);
    const z = inv.reduce((a, b) => a + b, 0);
    const p = inv.map((x) => x / z);
    const ex = (i: number, j: number) => (p[i] * p[j]) / (1 - p[i]);
    const tri = (i: number, j: number, l: number) => (ex(i, j) * p[l]) / (1 - p[i] - p[j]);
    const TH = [0, 1.0, 1.2, 1.5];
    const q12 = quinellaKey(order[0], order[1]);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const kq = quinellaKey(i + 1, j + 1);
        const o = board.quinella.get(kq)!;
        const ev = (ex(i, j) + ex(j, i)) * o;
        for (const t of TH) if (ev >= t) bet(`馬連 EV≥${t}`, o, kq === q12);
      }
    const exKey = combinationKey('exacta', order.slice(0, 2));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const kk = combinationKey('exacta', [i + 1, j + 1]);
        const o = board.exacta.get(kk)!;
        const ev = ex(i, j) * o;
        for (const t of TH) if (ev >= t) bet(`馬単 EV≥${t}`, o, kk === exKey);
      }
    const trioKey = combinationKey('trio', order.slice(0, 3));
    const triKey = combinationKey('trifecta', order.slice(0, 3));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let l = 0; l < n; l++) {
          if (i === j || j === l || i === l) continue;
          const kk = combinationKey('trifecta', [i + 1, j + 1, l + 1]);
          const o = board.trifecta.get(kk)!;
          const ev = tri(i, j, l) * o;
          for (const t of TH) if (ev >= t) bet(`3連単 EV≥${t}`, o, kk === triKey);
          if (i < j && j < l) {
            const kt = combinationKey('trio', [i + 1, j + 1, l + 1]);
            const ot = board.trio.get(kt)!;
            const pt = tri(i, j, l) + tri(i, l, j) + tri(j, i, l) + tri(j, l, i) + tri(l, i, j) + tri(l, j, i);
            for (const t of TH) if (pt * ot >= t) bet(`3連複 EV≥${t}`, ot, kt === trioKey);
          }
        }
  }
  advanceWeek(world, { popularity, finishes });
  if ((k + 1) % WEEKS_PER_YEAR === 0) process.stderr.write(`${(k + 1) / WEEKS_PER_YEAR}年 (${Math.round((Date.now() - t0) / 1000)}s)\n`);
}

// レース単位のブートストラップで回収率の95%区間を出す
function ci(a: Acc): [number, number] {
  const races = [...a.races];
  const per = races.map((r) => a.perRace.get(r)!);
  const stakePer = new Map<number, number>();
  // 1レースあたりの点数
  const cnt = new Map<number, number>();
  // perRace は（払い戻し−点数）。点数は bets/races の再現に必要なので近似：perRace + 点数
  void stakePer;
  void cnt;
  const B = 400;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rois: number[] = [];
  const meanStake = a.stake / races.length;
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let k = 0; k < per.length; k++) s += per[Math.floor(rnd() * per.length)];
    rois.push(1 + s / (meanStake * per.length));
  }
  rois.sort((x, y) => x - y);
  return [rois[Math.floor(B * 0.025)], rois[Math.floor(B * 0.975)]];
}

console.log(`races=${raceNo} seed=${SEED} years=${YEARS}`);
console.log('買い方\t点数\t対象レース\t的中率\t回収率\t95%区間');
for (const [name, a] of accs) {
  const [lo, hi] = ci(a);
  console.log(
    `${name}\t${a.bets}\t${a.races.size}\t${((a.hits / a.bets) * 100).toFixed(2)}%\t${((a.ret / a.stake) * 100).toFixed(1)}%\t${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
  );
}

console.log('\n校正（オッズの示す確率の合計 vs 実際の的中数）');
for (const [k, c] of [...cal].sort()) console.log(`${k}\t点数${c.n}\t期待的中${c.exp.toFixed(1)}\t実際${c.hit}\t比${(c.hit / c.exp).toFixed(2)}`);
