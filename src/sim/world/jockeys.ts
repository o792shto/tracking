import { BALANCE } from '../balance';
import type { Rng } from '../rng';
import { rankValue, type Jockey, type JockeyRank, type World } from './types';

/**
 * 騎手の名簿（ユーザー指定。実在の騎手名を使う）。短期免許の騎手は来日する月だけ乗る。
 * 短期免許の時期は実際の免許期間を確かめていない目安（レーンは春、モレイラは秋のG1シーズン、キングは冬）。
 * 新しく足す騎手は、ランクの節の終わりに足す（id は並び順。保存データの騎手とは名前で照らし合わせる）
 */
const ROSTER: readonly (readonly [string, JockeyRank, [number, number]?])[] = [
  ['C.ルメール', 'S+'],
  ['D.レーン', 'S+', [4, 6]],
  ['J.モレイラ', 'S+', [10, 12]],
  ['岩田望来', 'S'],
  ['松山弘平', 'S'],
  ['川田将雅', 'S'],
  ['武豊', 'S'],
  ['R.キング', 'S', [1, 3]],
  ['坂井瑠星', 'A'],
  ['横山武史', 'A'],
  ['西村淳也', 'A'],
  ['戸崎圭太', 'A'],
  ['北村友一', 'A'],
  ['横山和生', 'A'],
  ['津村明秀', 'A'],
  ['田辺裕信', 'A'],
  ['荻野極', 'A'],
  ['丹内祐次', 'A'],
  ['斎藤新', 'B'],
  ['舟山瑠泉', 'B'],
  ['佐々木大輔', 'B'],
  ['鮫島克駿', 'B'],
  ['高杉吏麒', 'B'],
  ['三浦皇成', 'B'],
  ['吉村誠之助', 'B'],
  ['松若風馬', 'B'],
  ['小林美駒', 'B'],
  ['団野大成', 'B'],
  ['幸英明', 'B'],
  ['西塚洸二', 'B'],
  ['浜中俊', 'B'],
  ['原優介', 'B'],
  ['横山典弘', 'B'],
  ['岩田康誠', 'B'],
  ['池添謙一', 'B'],
  ['古川吉洋', 'B'],
  ['菅原明良', 'B'],
  ['今村聖奈', 'C'],
  ['大野拓弥', 'C'],
  ['田口貫太', 'C'],
  ['菊沢一樹', 'C'],
  ['田山旺佑', 'C'],
  ['菱田裕二', 'C'],
  ['酒井学', 'C'],
  ['丸山元気', 'C'],
  ['M.デムーロ', 'C'],
  ['横山琉人', 'C'],
  ['吉田隼人', 'C'],
  ['小沢大仁', 'C'],
  ['木幡巧也', 'C'],
  ['石川裕紀人', 'C'],
  ['富田暁', 'C'],
  ['小崎綾也', 'C'],
  ['杉原誠人', 'C'],
  ['石橋脩', 'C'],
];


export function initialJockeys(): Jockey[] {

  return ROSTER.map(([name, rank, months], i) => newJockey(i + 1, name, rank, months));
}

function newJockey(id: number, name: string, rank: JockeyRank, months?: [number, number]): Jockey {
  return {
    id,
    name,
    rank,
    ...(months ? { months } : {}),
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    byYear: {},
    graded: [],
    minorWins: 0,
  };
}

/**
 * 保存データの騎手を今の名簿にそろえる。騎手がいない世界には名簿を入れる。
 * 以前の架空の騎手は外し、名簿に増えた騎手は新しい id で足す（成績・昇格したランクは名前で引き継ぐ）
 */
export function ensureJockeys(world: World): World {
  if (!world.jockeys) {
    world.jockeys = initialJockeys();
    return world;
  }
  const kept = world.jockeys.filter((j) => !j.fictional);
  let next = Math.max(0, ...world.jockeys.map((j) => j.id)) + 1;
  for (const [name, rank, months] of ROSTER) {
    const j = kept.find((x) => x.name === name);
    if (!j) kept.push(newJockey(next++, name, rank, months));
    else if (months) j.months = months;
  }
  world.jockeys = kept;
  return world;
}

/** その月に日本で乗れるか（短期免許の騎手は来日する月だけ） */
export function jockeyAvailable(j: Jockey, month: number): boolean {
  return !j.months || (month >= j.months[0] && month <= j.months[1]);
}

/** 騎手を割り当てる1つのレース（馬は horseIds の順、attract は陣営から見た馬の見栄え） */
export interface RideRequest {
  horseIds: number[];
  /** 馬ごとの見栄え（大きいほど良い騎手が乗る） */
  attract: number[];
  /** 前走の騎手（Jockey.id）。乗り続けやすい */
  lastJockey: (number | undefined)[];
}

/** 1つの競馬場の1日（または画面外のレース1つ） */
export interface RideVenue {
  /** その日いちばん大きいレースの格の値（G1 = 3, G2 = 2, G3 = 1, それ以外 0） */
  importance: number;
  races: RideRequest[];
}

/**
 * 同じ日の競馬場ごとに騎手を分け、レースごとに馬へ騎手を割り当てる。返り値は venues・races と同じ形の騎手 id の配列。
 * 1人の騎手は1日に1つの競馬場でだけ乗る。上位の騎手ほど大きいレースのある競馬場へ行き、見栄えの良い馬に乗る。
 * 前走と同じ騎手は、その日その競馬場にいれば乗り続けやすい（ランクが高い騎手ほど手放さない）
 */
export function assignRides(jockeys: readonly Jockey[], month: number, venues: RideVenue[], rng: Rng): number[][][] {
  const J = BALANCE.jockey;
  const real = jockeys.filter((j) => jockeyAvailable(j, month) && !j.fictional);
  const need = venues.map((v) => Math.max(0, ...v.races.map((r) => r.horseIds.length)));
  const at: Jockey[][] = venues.map(() => []);
  if (venues.length === 1) at[0].push(...real);
  else {
    // いちばん大きいレースのある競馬場（同じなら頭数の多い方）
    const big = venues.reduce((b, v, i) => (v.importance > venues[b].importance || (v.importance === venues[b].importance && need[i] > need[b]) ? i : b), 0);
    const tied = venues.every((v) => v.importance === venues[big].importance);
    for (const j of rng.shuffle([...real])) {
      if (!tied && rng.chance(J.bigVenue[j.rank])) at[big].push(j);
      else {
        // 大きいレースのない競馬場へ（人数の少ない方を選びやすく）
        const others = venues.map((_, i) => i).filter((i) => tied || i !== big);
        const k = others.reduce((b, i) => (at[i].length - need[i] < at[b].length - need[b] ? i : b), others[rng.int(0, others.length - 1)]);
        at[k].push(j);
      }
    }
  }
  // 騎手が足りない競馬場へ、余っている競馬場からランクの低い騎手を回す（1日は最大2場なので足りる）
  for (let i = 0; i < venues.length; i++) {
    while (at[i].length < need[i]) {
      const from = at.findIndex((xs, k) => k !== i && xs.length > need[k]);
      if (from < 0) break;
      const xs = at[from];
      const low = xs.reduce((b, j, k) => (rankValue(j.rank) < rankValue(xs[b].rank) ? k : b), xs.length - 1);
      at[i].push(...xs.splice(low, 1));
    }
  }
  return venues.map((v, i) =>
    v.races.map((race) => {
      const free = new Set(at[i]);
      const out = race.horseIds.map(() => 0);
      // 見栄えの良い馬から騎手を決める
      const order = race.horseIds.map((_, k) => k).sort((a, b) => race.attract[b] - race.attract[a]);
      for (const k of order) {
        const last = race.lastJockey[k];
        const prev = last !== undefined ? at[i].find((j) => j.id === last) : undefined;
        if (prev && free.has(prev) && rng.chance(J.keep + J.rankKeep * rankValue(prev.rank))) {
          out[k] = prev.id;
          free.delete(prev);
          continue;
        }
        let best: Jockey | null = null;
        let bestScore = -Infinity;
        for (const j of free) {
          const s = rankValue(j.rank) + rng.normal(0, J.pickNoise);
          if (s > bestScore) {
            bestScore = s;
            best = j;
          }
        }
        if (best) {
          out[k] = best.id;
          free.delete(best);
        }
      }
      return out;
    }),
  );
}

/** 馬の見栄え（総合力の点）にばらつきを足す */
export function rideAttract(points: number[], rng: Rng): number[] {
  return points.map((x) => x + rng.normal(0, BALANCE.jockey.horseNoise));
}

/** 騎手の当日の上乗せ（form に掛ける倍率） */
export function jockeyFactor(j: Pick<Jockey, 'rank'> | undefined): number {
  return 1 + (j ? BALANCE.jockey.skill[j.rank] : 0);
}

/** 昇格したときの1つ上のランク */
const UP: Partial<Record<JockeyRank, JockeyRank>> = { C: 'B', B: 'A' };

/**
 * 騎乗の結果を騎手の成績に残し、昇格を判定する（ユーザー指定）。
 * B・C の騎手が G1 を勝つと1つ上へ。C の騎手が G2・G3 を合わせて2勝すると B へ。
 * 昇格したときはランクの文字列（例 'B'）を返す
 */
export function recordRide(
  j: Jockey,
  year: number,
  rank: number,
  race: { name: string; grade: 'G1' | 'G2' | 'G3' | null },
): JockeyRank | null {
  j.starts++;
  const y = (j.byYear[year] ??= [0, 0, 0, 0]);
  y[0]++;
  if (rank === 2) {
    j.seconds++;
    y[2]++;
  } else if (rank === 3) {
    j.thirds++;
    y[3]++;
  }
  if (rank !== 1) return null;
  j.wins++;
  y[1]++;
  if (!race.grade) return null;
  j.graded.push({ year, name: race.name, grade: race.grade });
  const up = UP[j.rank];
  if (!up) return null;
  if (race.grade === 'G1') {
    j.rank = up;
    j.minorWins = 0;
    return up;
  }
  if (j.rank === 'C') {
    j.minorWins++;
    if (j.minorWins >= BALANCE.jockey.minorWinsToB) {
      j.rank = 'B';
      j.minorWins = 0;
      return 'B';
    }
  }
  return null;
}
