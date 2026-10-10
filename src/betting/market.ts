import { Rng, apparentStrength, type HorseProfile, type RaceSetup } from '../sim';
import { BETTING } from './params';
import { combinationKey, quinellaKey, type ComboType, type Market, type OddsBoard, type Pools } from './types';

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

/** オッズは0.1倍単位（小数第1位まで）に切り捨て、最低1.0倍（元返し）、最高999.9倍。複勝は最低1.1倍 */
export function roundOdds(x: number, max: number = BETTING.maxOdds): number {
  return Math.min(max, Math.max(1, Math.floor(x * 10 + 1e-9) / 10));
}

/** 券種ごとのオッズの上限 */
function maxOddsOf(type: string): number {
  return BETTING.maxOddsByType[type] ?? BETTING.maxOdds;
}

/** 2頭が1・2着（この順）になる確率（Harville） */
export function exactaProbability(p: number[], i: number, j: number): number {
  return (p[i] * p[j]) / (1 - p[i]);
}

/** 3頭が1・2・3着（この順）になる確率（Harville） */
export function trifectaProbability(p: number[], i: number, j: number, k: number): number {
  return (exactaProbability(p, i, j) * p[k]) / (1 - p[i] - p[j]);
}

/** 3頭が1〜3着（順不同）になる確率 */
export function trioProbability(p: number[], i: number, j: number, k: number): number {
  return (
    trifectaProbability(p, i, j, k) +
    trifectaProbability(p, i, k, j) +
    trifectaProbability(p, j, i, k) +
    trifectaProbability(p, j, k, i) +
    trifectaProbability(p, k, i, j) +
    trifectaProbability(p, k, j, i)
  );
}

/** 組み合わせの券種の、全組み合わせ（0始まりの馬の添字）と的中確率 */
function comboTable(type: ComboType, p: number[]): { idx: number[]; prob: number }[] {
  const n = p.length;
  const out: { idx: number[]; prob: number }[] = [];
  switch (type) {
    case 'quinella':
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push({ idx: [i, j], prob: quinellaProbability(p, i, j) });
      break;
    case 'wide':
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          let prob = 0;
          for (let k = 0; k < n; k++) if (k !== i && k !== j) prob += trioProbability(p, i, j, k);
          out.push({ idx: [i, j], prob });
        }
      break;
    case 'exacta':
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) out.push({ idx: [i, j], prob: exactaProbability(p, i, j) });
      break;
    case 'trio':
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          for (let k = j + 1; k < n; k++) out.push({ idx: [i, j, k], prob: trioProbability(p, i, j, k) });
      break;
    case 'trifecta':
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++)
            if (i !== j && j !== k && i !== k) out.push({ idx: [i, j, k], prob: trifectaProbability(p, i, j, k) });
      break;
  }
  return out;
}

/** ワイド・馬単・3連複・3連単（馬連は単勝などと一緒に作る） */
const EXTRA_COMBOS = ['wide', 'exacta', 'trio', 'trifecta'] as const;

/** 前走の着順による人気の上乗せ */
function formBoost(profile: HorseProfile | undefined): number {
  const last = profile?.recent[0];
  if (!last) return 1;
  const bonus = last.rank === 1 ? 1 : last.rank === 2 ? 0.7 : last.rank === 3 ? 0.5 : last.rank <= 5 ? 0.2 : 0;
  return 1 + BETTING.recentFormBias * bonus;
}

/**
 * 票の重みを総額 total に配分する。どの馬にも一定の票（記念買い・穴狙い）が入るよう、
 * 全体の floorShare を頭数で均等に配る。これで人気薄のオッズが極端に高くならない
 */
function normalize(weights: number[], total: number, floorShare = BETTING.longshotFloor): number[] {
  const z = weights.reduce((a, b) => a + b, 0);
  const n = weights.length;
  return weights.map((w) => ((1 - floorShare) * (w / z) + floorShare / n) * total);
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

  // ワイド・馬単・3連複・3連単の票は別の乱数で作る（単勝・複勝・馬連のオッズを変えないように）
  const rngX = new Rng(setup.seed).fork(6);
  const tables = {} as Record<(typeof EXTRA_COMBOS)[number], { key: string; prob: number; boost: number }[]>;
  const comboNoise = {} as Record<(typeof EXTRA_COMBOS)[number], number[]>;
  for (const type of EXTRA_COMBOS) {
    tables[type] = comboTable(type, p).map((c) => ({
      key: combinationKey(type, c.idx.map((i) => i + 1)),
      prob: c.prob,
      boost: c.idx.reduce((a, i) => a * boost[i], 1),
    }));
    comboNoise[type] = tables[type].map(() => rngX.normal(0, BETTING.voteNoise));
  }
  const extraJitter = (spread: number) => (spread > 0 ? rngX.normal(0, spread) : 0);

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
    const qVotes = normalize(weights, BETTING.poolPerRunner.quinella * n, BETTING.comboFloor.quinella);
    const extra = {} as Record<(typeof EXTRA_COMBOS)[number], Map<string, number>>;
    for (const type of EXTRA_COMBOS) {
      const table = tables[type];
      const noise = comboNoise[type];
      const w = table.map((c, idx) => Math.pow(c.prob, alpha) * c.boost * Math.exp(noise[idx] + extraJitter(spread)));
      const votes = normalize(w, BETTING.poolPerRunner[type] * n, BETTING.comboFloor[type]);
      extra[type] = new Map(table.map((c, idx) => [c.key, votes[idx]]));
    }
    return { win, place, quinella: new Map(keys.map((key, idx) => [key, qVotes[idx]])), ...extra };
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
  const simple = (type: 'quinella' | 'exacta' | 'trio' | 'trifecta') => {
    const net = sum([...pools[type].values()]) * (1 - BETTING.takeout[type]);
    const cap = maxOddsOf(type);
    return new Map([...pools[type]].map(([key, v]) => [key, roundOdds(net / v, cap)]));
  };
  const order = win.map((o, i) => ({ o, i })).sort((a, b) => a.o - b.o || a.i - b.i);
  const popularity = new Array(runners).fill(0);
  order.forEach(({ i }, rank) => (popularity[i] = rank + 1));
  return {
    win,
    place,
    quinella: simple('quinella'),
    wide: wideBoard(pools, runners),
    exacta: simple('exacta'),
    trio: simple('trio'),
    trifecta: simple('trifecta'),
    popularity,
  };
}

/**
 * 複勝のオッズ：控除後の総額から的中馬の票を引いた利益を、的中頭数で等分して各馬の票で割る。
 * othersVotes は一緒に馬券圏内に入る他の馬の票。
 */
function placeOdds(pools: Pools, i: number, othersVotes: number[], k: number): number {
  const net = sum(pools.place) * (1 - BETTING.takeout.place);
  const winnersVotes = pools.place[i] + sum(othersVotes);
  const profit = net - winnersVotes;
  if (profit <= 0) return BETTING.placeMinOdds;
  return Math.max(BETTING.placeMinOdds, roundOdds(1 + profit / k / pools.place[i]));
}

/**
 * ワイドのオッズ：3着内の3頭でできる3組が的中になる。控除後の総額から3組の票を引いた利益を3等分して、各組の票で割る。
 * 表示は、3着に来るもう1頭しだいの最低〜最高の幅
 */
function wideOdds(net: number, own: number, othersVotes: number): number {
  const profit = net - own - othersVotes;
  if (profit <= 0) return 1;
  return roundOdds(1 + profit / 3 / own, maxOddsOf('wide'));
}

function wideBoard(pools: Pools, runners: number): Map<string, { min: number; max: number }> {
  const net = sum([...pools.wide.values()]) * (1 - BETTING.takeout.wide);
  const v = (a: number, b: number) => pools.wide.get(quinellaKey(a, b)) ?? 0;
  const out = new Map<string, { min: number; max: number }>();
  for (let a = 1; a <= runners; a++) {
    for (let b = a + 1; b <= runners; b++) {
      let most = -Infinity;
      let least = Infinity;
      for (let c = 1; c <= runners; c++) {
        if (c === a || c === b) continue;
        const s = v(a, c) + v(b, c);
        most = Math.max(most, s);
        least = Math.min(least, s);
      }
      const own = v(a, b);
      out.set(quinellaKey(a, b), { min: wideOdds(net, own, most), max: wideOdds(net, own, least) });
    }
  }
  return out;
}

/** 確定した着順でのワイドのオッズ（top3 は1〜3着の馬番） */
export function settledWideOdds(pools: Pools, top3: number[]): Map<string, number> {
  const net = sum([...pools.wide.values()]) * (1 - BETTING.takeout.wide);
  const [a, b, c] = top3;
  const keys = [quinellaKey(a, b), quinellaKey(a, c), quinellaKey(b, c)];
  const votes = keys.map((k) => pools.wide.get(k) ?? 0);
  const total = votes.reduce((x, y) => x + y, 0);
  return new Map(keys.map((k, i) => [k, wideOdds(net, votes[i], total - votes[i])]));
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
