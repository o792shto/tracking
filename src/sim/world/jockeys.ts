import { BALANCE } from '../balance';
import type { Rng } from '../rng';
import { rankValue, type Jockey, type JockeyRank, type World } from './types';

/**
 * 騎手の名簿（ユーザー指定。実在の騎手名を使う）。短期免許の騎手は来日する月だけ乗る。
 * 短期免許の時期は実際の免許期間を確かめていない目安（レーンは春、モレイラは秋のG1シーズン）
 */
const ROSTER: readonly (readonly [string, JockeyRank, [number, number]?])[] = [
  ['C.ルメール', 'S+'],
  ['D.レーン', 'S+', [4, 6]],
  ['J.モレイラ', 'S+', [10, 12]],
  ['岩田望来', 'S'],
  ['松山弘平', 'S'],
  ['川田将雅', 'S'],
  ['武豊', 'S'],
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
  ['今村聖奈', 'C'],
  ['大野拓弥', 'C'],
  ['田口貫太', 'C'],
  ['菊沢一樹', 'C'],
  ['田山旺佑', 'C'],
  ['菱田裕二', 'C'],
  ['酒井学', 'C'],
  ['丸山元気', 'C'],
  ['M.デムーロ', 'C'],
];

/**
 * 名簿の騎手だけでは、2〜3場の開催で1レース18頭ぶんの騎手が足りない日がある。その日を埋める架空の騎手（C）。
 * 名前は架空（実在の騎手と重ならないように選んだつもりだが、すべては確かめていない）
 */
const FILLERS: readonly string[] = [
  '朝霧隼人',
  '久我蒼真',
  '柚木颯太',
  '真壁涼介',
  '桐生迅',
  '篠宮航平',
  '葛城悠真',
  '鳴海大翔',
  '氷室拓真',
  '宗像陸',
  '雨宮晴斗',
  '早瀬昂',
  '御影瑛太',
  '神楽坂奏',
  '東雲匠',
  '白鷺海斗',
  '天野彗',
  '瀬戸口翼',
  '霧島蓮',
  '如月慧',
  '春日部遼',
  '秋津律',
  '日向野光',
  '藤代湊',
];

export function initialJockeys(): Jockey[] {
  const base = (id: number, name: string, rank: JockeyRank): Jockey => ({
    id,
    name,
    rank,
    starts: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    byYear: {},
    graded: [],
    minorWins: 0,
  });
  const out: Jockey[] = ROSTER.map(([name, rank, months], i) => ({ ...base(i + 1, name, rank), ...(months ? { months } : {}) }));
  FILLERS.forEach((name, i) => out.push({ ...base(ROSTER.length + i + 1, name, 'C'), fictional: true }));
  return out;
}

/** 古い保存データ（騎手がいない世界）に騎手を足す */
export function ensureJockeys(world: World): World {
  if (!world.jockeys) world.jockeys = initialJockeys();
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
  const pool = jockeys.filter((j) => jockeyAvailable(j, month));
  const real = pool.filter((j) => !j.fictional);
  const fillers = pool.filter((j) => j.fictional);
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
  // 足りない競馬場を架空の騎手で埋める
  let f = 0;
  venues.forEach((_, i) => {
    while (at[i].length < need[i] && f < fillers.length) at[i].push(fillers[f++]);
  });
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
          const s = rankValue(j.rank) - (j.fictional ? 0.3 : 0) + rng.normal(0, J.pickNoise);
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
