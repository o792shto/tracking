import { Rng, apparentStrength, type HorseProfile, type RaceSetup } from '../sim';
import { BETTING } from './params';
import { quinellaKey, type Market, type OddsBoard, type Pools } from './types';

/** 複勝の対象になる着順（7頭以下は2着まで） */
export function placeCount(runners: number): number {
  return runners <= 7 ? 2 : 3;
}

/** 見た目の強さから各馬の勝率を推定する（ソフトマックス） */
export function winProbabilities(setup: RaceSetup): number[] {
  const s = apparentStrength(setup);
  const max = Math.max(...s);
  const e = s.map((x) => Math.exp((x - max) / BETTING.strengthTemperature));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
}

/** Harville の公式で、各馬が k 着以内に入る確率 */
export function topKProbabilities(p: number[], k: number): number[] {
  const n = p.length;
  const out = new Array(n).fill(0);
  for (let a = 0; a < n; a++) {
    const pa = p[a];
    out[a] += pa;
    if (k < 2) continue;
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      const pab = (pa * p[b]) / (1 - pa);
      out[b] += pab;
      if (k < 3) continue;
      for (let c = 0; c < n; c++) {
        if (c === a || c === b) continue;
        out[c] += (pab * p[c]) / (1 - pa - p[b]);
      }
    }
  }
  return out;
}

/** 2頭が1・2着（順不同）になる確率 */
export function quinellaProbability(p: number[], i: number, j: number): number {
  return (p[i] * p[j]) / (1 - p[i]) + (p[j] * p[i]) / (1 - p[j]);
}

/** オッズは0.1倍単位に切り捨て、最低1.0倍（元返し） */
export function roundOdds(x: number): number {
  return Math.max(1, Math.floor(x * 10 + 1e-9) / 10);
}

/** 前走の着順による人気の上乗せ */
function formBoost(profile: HorseProfile | undefined): number {
  const last = profile?.recent[0];
  if (!last) return 1;
  const bonus = last.rank === 1 ? 1 : last.rank === 2 ? 0.7 : last.rank === 3 ? 0.5 : last.rank <= 5 ? 0.2 : 0;
  return 1 + BETTING.recentFormBias * bonus;
}

function normalize(weights: number[], total: number): number[] {
  const z = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / z) * total);
}

/**
 * 仮想の投票を作ってオッズを出す（パリミュチュエル方式）。
 * 票は「推定勝率 ^ favoriteBias × 前走の好走 × ばらつき」に比例する。
 * 発走前の表示は、早いほどばらつきが大きく、最後の表示が確定オッズになる。
 */
export function buildMarket(setup: RaceSetup, profiles: HorseProfile[]): Market {
  const rng = new Rng(setup.seed).fork(5);
  const n = setup.entries.length;
  const p = winProbabilities(setup);
  const k = placeCount(n);
  const pPlace = topKProbabilities(p, k);
  const boost = setup.entries.map((e) => formBoost(profiles.find((x) => x.number === e.number)));
  const steps = BETTING.boardSteps;
  const alpha = BETTING.favoriteBias;

  const finalNoise = {
    win: p.map(() => rng.normal(0, BETTING.voteNoise)),
    place: p.map(() => rng.normal(0, BETTING.voteNoise)),
    quinella: new Map<string, number>(),
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) finalNoise.quinella.set(quinellaKey(i + 1, j + 1), rng.normal(0, BETTING.voteNoise));
  }

  const poolsAt = (step: number): Pools => {
    const spread = (BETTING.earlyNoise * (steps - 1 - step)) / Math.max(1, steps - 1);
    const jitter = () => (spread > 0 ? rng.normal(0, spread) : 0);
    const win = normalize(
      p.map((x, i) => Math.pow(x, alpha) * boost[i] * Math.exp(finalNoise.win[i] + jitter())),
      BETTING.poolPerRunner.win * n,
    );
    const place = normalize(
      pPlace.map((x, i) => Math.pow(x, alpha) * boost[i] * Math.exp(finalNoise.place[i] + jitter())),
      BETTING.poolPerRunner.place * n,
    );
    const keys: string[] = [];
    const weights: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const key = quinellaKey(i + 1, j + 1);
        keys.push(key);
        weights.push(
          Math.pow(quinellaProbability(p, i, j), alpha) *
            boost[i] *
            boost[j] *
            Math.exp(finalNoise.quinella.get(key)! + jitter()),
        );
      }
    }
    const qVotes = normalize(weights, BETTING.poolPerRunner.quinella * n);
    return { win, place, quinella: new Map(keys.map((key, idx) => [key, qVotes[idx]])) };
  };

  const boards: OddsBoard[] = [];
  let pools!: Pools;
  for (let step = 0; step < steps; step++) {
    const at = poolsAt(step);
    if (step === steps - 1) pools = at;
    boards.push(oddsBoard(at, n));
  }
  return { boards, pools, runners: n };
}

/** 投票から表示用のオッズを出す */
export function oddsBoard(pools: Pools, runners: number): OddsBoard {
  const winNet = sum(pools.win) * (1 - BETTING.takeout.win);
  const win = pools.win.map((v) => roundOdds(winNet / v));
  const k = placeCount(runners);
  const place = pools.place.map((_, i) => {
    const others = pools.place.filter((_, j) => j !== i).sort((a, b) => b - a);
    const most = others.slice(0, k - 1);
    const least = others.slice(-(k - 1));
    return { min: placeOdds(pools, i, most, k), max: placeOdds(pools, i, least, k) };
  });
  const qNet = sum([...pools.quinella.values()]) * (1 - BETTING.takeout.quinella);
  const quinella = new Map([...pools.quinella].map(([key, v]) => [key, roundOdds(qNet / v)]));
  const order = win.map((o, i) => ({ o, i })).sort((a, b) => a.o - b.o || a.i - b.i);
  const popularity = new Array(runners).fill(0);
  order.forEach(({ i }, rank) => (popularity[i] = rank + 1));
  return { win, place, quinella, popularity };
}

/**
 * 複勝のオッズ：控除後の総額から的中馬の票を引いた利益を、的中頭数で等分して各馬の票で割る。
 * othersVotes は一緒に馬券圏内に入る他の馬の票。
 */
function placeOdds(pools: Pools, i: number, othersVotes: number[], k: number): number {
  const net = sum(pools.place) * (1 - BETTING.takeout.place);
  const winnersVotes = pools.place[i] + sum(othersVotes);
  const profit = net - winnersVotes;
  if (profit <= 0) return 1;
  return roundOdds(1 + profit / k / pools.place[i]);
}

/** 確定した着順での複勝オッズ（placed は複勝圏内の馬番） */
export function settledPlaceOdds(pools: Pools, placed: number[]): Map<number, number> {
  const k = placed.length;
  const out = new Map<number, number>();
  for (const num of placed) {
    const others = placed.filter((x) => x !== num).map((x) => pools.place[x - 1]);
    out.set(num, placeOdds(pools, num - 1, others, k));
  }
  return out;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
