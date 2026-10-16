/**
 * 市場の作り方（ソース）を知っているプレイヤーを想定した攻略の検証（分析用）。
 * 見える情報（確定オッズ・前走の着順）から市場の勝率 p を逆算し、市場と同じ補正（λ）で組み合わせの確率を出して、
 * 票のばらつきで安く売られた組み合わせだけを買う。
 *   npx tsx tools/sharp_probe.ts --years 10 --seed 7
 */
import { buildMarket, placeCount, settle } from '../src/betting/index.ts';
import { BETTING } from '../src/betting/params.ts';
import { combinationKey, quinellaKey } from '../src/betting/types.ts';
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
const SEED = Number(arg('seed', '7'));

type Acc = { bets: number; ret: number; hits: number; perRace: Map<number, { s: number; r: number }> };
const accs = new Map<string, Acc>();
let raceNo = 0;
function bet(name: string, odds: number, hit: boolean) {
  let a = accs.get(name);
  if (!a) accs.set(name, (a = { bets: 0, ret: 0, hits: 0, perRace: new Map() }));
  a.bets++;
  const r = hit ? odds : 0;
  a.ret += r;
  if (hit) a.hits++;
  const x = a.perRace.get(raceNo) ?? { s: 0, r: 0 };
  x.s += 1;
  x.r += r;
  a.perRace.set(raceNo, x);
}

const norm = (xs: number[]) => {
  const z = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => x / z);
};
const powNorm = (xs: number[], l: number) => norm(xs.map((x) => Math.pow(x, l)));

const world = createWorld(SEED);
const t0 = Date.now();
const TH = [1.1, 1.3, 1.6];

for (let k = 0; k < YEARS * WEEKS_PER_YEAR; k++) {
  const card = weekCard(world);
  const finishes: Record<string, FinishRecord[]> = {};
  const popularity: Record<string, number[]> = {};
  for (const r of card.races.filter((x) => x.visible && x.horseIds.length > 0)) {
    raceNo++;
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

    // ---- 単勝オッズから市場の勝率 p を逆算する（均等票・前走の上乗せ・偏りの係数を外す） ----
    const boost = setup.entries.map((e) => {
      const last = profiles.find((x) => x.number === e.number)?.recent[0];
      if (!last) return 1;
      const b = last.rank === 1 ? 1 : last.rank === 2 ? 0.7 : last.rank === 3 ? 0.5 : last.rank <= 5 ? 0.2 : 0;
      return 1 + BETTING.recentFormBias * b;
    });
    const share = norm(board.win.map((o) => 1 / o));
    const f = BETTING.longshotFloor;
    const w = share.map((s) => Math.max(1e-6, (s - f / n) / (1 - f)));
    const p = norm(w.map((x, i) => Math.pow(x / boost[i], 1 / BETTING.favoriteBias)));
    const q = powNorm(p, BETTING.comboLambda[0]);
    const rr = powNorm(p, BETTING.comboLambda[1]);
    const ex = (i: number, j: number) => (p[i] * q[j]) / (1 - q[i]);
    const tri = (i: number, j: number, l: number) => (ex(i, j) * rr[l]) / (1 - rr[i] - rr[j]);
    const trio = (i: number, j: number, l: number) => tri(i, j, l) + tri(i, l, j) + tri(j, i, l) + tri(j, l, i) + tri(l, i, j) + tri(l, j, i);

    // 単純な買い方：1番人気のオッズ帯ごとに、2〜5番人気の単勝
    {
      const fav = Math.min(...board.win);
      const band = fav < 1.5 ? '1.1-1.4' : fav < 2 ? '1.5-1.9' : fav < 3 ? '2.0-2.9' : '3.0+';
      for (let i = 0; i < n; i++) {
        const pop = board.popularity[i];
        if (pop >= 2 && pop <= 5) bet(`単純 本命${band}倍のレースの2-5番人気`, board.win[i], order[0] === i + 1);
        if (pop === 1) bet(`単純 本命${band}倍の1番人気`, board.win[i], order[0] === i + 1);
      }
    }
    // 単勝・複勝
    const placed = new Set(order.slice(0, placeCount(n)));
    const pPlace = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      pPlace[a] += p[a];
      for (let b = 0; b < n; b++) {
        if (b === a) continue;
        const pab = ex(a, b);
        pPlace[b] += pab;
        if (placeCount(n) < 3) continue;
        for (let c = 0; c < n; c++) if (c !== a && c !== b) pPlace[c] += (pab * rr[c]) / (1 - rr[a] - rr[b]);
      }
    }
    for (let i = 0; i < n; i++) {
      const num = i + 1;
      const evW = p[i] * board.win[i];
      for (const t of TH) if (evW >= t) bet(`単勝 EV≥${t}`, board.win[i], order[0] === num);
      if (evW >= 1.1 && process.env.DUMP) {
        const last = profiles.find((x) => x.number === num)?.recent[0];
        console.error(`ROW\t${board.win[i]}\t${board.popularity[i]}\t${n}\t${last?.rank ?? '-'}\t${p[i].toFixed(3)}\t${share[i].toFixed(3)}\t${order[0] === num ? 1 : 0}\t${r.program.raceClass}`);
      }
      const po = pay.place.find((x) => x.number === num)?.odds ?? 0;
      const evP = pPlace[i] * board.place[i].min;
      for (const t of TH) if (evP >= t) bet(`複勝 EV≥${t}`, po, placed.has(num));
    }

    // 組み合わせ
    if (process.env.WINONLY) continue;
    const qk = quinellaKey(order[0], order[1]);
    const ek = combinationKey('exacta', order.slice(0, 2));
    const tk = combinationKey('trio', order.slice(0, 3));
    const fk = combinationKey('trifecta', order.slice(0, 3));
    const top3 = new Set(order.slice(0, 3));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const ko = combinationKey('exacta', [i + 1, j + 1]);
        const evE = ex(i, j) * board.exacta.get(ko)!;
        for (const t of TH) if (evE >= t) bet(`馬単 EV≥${t}`, board.exacta.get(ko)!, ko === ek);
        if (i < j) {
          const kq = quinellaKey(i + 1, j + 1);
          const o = board.quinella.get(kq)!;
          const evQ = (ex(i, j) + ex(j, i)) * o;
          for (const t of TH) if (evQ >= t) bet(`馬連 EV≥${t}`, o, kq === qk);
          // ワイド：確率は3着内に2頭が入る確率、オッズは表示の最低値で見積もる
          let pw = 0;
          for (let l = 0; l < n; l++) if (l !== i && l !== j) pw += trio(i, j, l);
          const wo = board.wide.get(kq)!;
          const hitW = top3.has(i + 1) && top3.has(j + 1);
          const paidW = hitW ? pay.wide.find((x) => x.key === kq)!.odds : 0;
          for (const t of TH) if (pw * wo.min >= t) bet(`ワイド EV≥${t}`, paidW || 1, hitW);
        }
        for (let l = 0; l < n; l++) {
          if (l === i || l === j) continue;
          const kf = combinationKey('trifecta', [i + 1, j + 1, l + 1]);
          const of = board.trifecta.get(kf)!;
          const evF = tri(i, j, l) * of;
          for (const t of TH) if (evF >= t) bet(`3連単 EV≥${t}`, of, kf === fk);
          if (i < j && j < l) {
            const kt = combinationKey('trio', [i + 1, j + 1, l + 1]);
            const ot = board.trio.get(kt)!;
            const evT = trio(i, j, l) * ot;
            for (const t of TH) if (evT >= t) bet(`3連複 EV≥${t}`, ot, kt === tk);
          }
        }
      }
  }
  advanceWeek(world, { popularity, finishes });
  if ((k + 1) % WEEKS_PER_YEAR === 0) process.stderr.write(`${(k + 1) / WEEKS_PER_YEAR}年 (${Math.round((Date.now() - t0) / 1000)}s)\n`);
}

// レース単位のブートストラップで回収率の95%区間
function ci(a: Acc): [number, number] {
  const rows = [...a.perRace.values()];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const out: number[] = [];
  for (let b = 0; b < 400; b++) {
    let s = 0;
    let r = 0;
    for (let k = 0; k < rows.length; k++) {
      const x = rows[Math.floor(rnd() * rows.length)];
      s += x.s;
      r += x.r;
    }
    out.push(r / s);
  }
  out.sort((x, y) => x - y);
  return [out[10], out[389]];
}

console.log(`races=${raceNo} seed=${SEED} years=${YEARS}`);
console.log('買い方\t点数\t対象レース\t的中率\t回収率\t95%区間');
for (const [name, a] of [...accs].sort()) {
  const [lo, hi] = ci(a);
  console.log(`${name}\t${a.bets}\t${a.perRace.size}\t${((a.hits / a.bets) * 100).toFixed(2)}%\t${((a.ret / a.bets) * 100).toFixed(1)}%\t${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`);
}
