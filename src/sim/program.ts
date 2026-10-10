import type { AgeCondition, GradedRace, Venue } from './gradedRaces';
import { findStart } from './racePath';
import type { Rng } from './rng';
import { CONDITIONS, DISTANCES_BY_SURFACE, type Direction, type Surface, type TrackCondition } from './types';
import type { VenueDay } from './world/calendar';

/** 1日のレース数 */
export const RACES_PER_DAY = 12;

/** クラス（条件） */
export type RaceClass = 'newcomer' | 'maiden' | '1win' | '2win' | '3win' | 'open' | 'G3' | 'G2' | 'G1';

export const CLASS_LABEL: Record<RaceClass, string> = {
  newcomer: '新馬',
  maiden: '未勝利',
  '1win': '1勝クラス',
  '2win': '2勝クラス',
  '3win': '3勝クラス',
  open: 'オープン',
  G3: 'G3',
  G2: 'G2',
  G1: 'G1',
};

export const AGE_LABEL: Record<AgeCondition, string> = {
  '2': '2歳',
  '3': '3歳',
  '3up': '3歳以上',
  '4up': '4歳以上',
};

/** 標準距離（重賞以外のレースと、置き換えたオープンの距離） */
export const STANDARD_DISTANCES = DISTANCES_BY_SURFACE;

export interface ProgramRace {
  /** レース番号（1〜12） */
  no: number;
  raceClass: RaceClass;
  /** 表示名（重賞はレース名、置き換えたものと条件戦はクラス名） */
  name: string;
  surface: Surface;
  distance: number;
  age: AgeCondition;
  fillies: boolean;
  /** 出走頭数 */
  runners: number;
}

/**
 * その場で使える標準距離。実在しない距離（コースの資料に発走地点がない距離）は番組に出さない。
 * 例：中山・京都のダートは1200mだけ、東京の芝は1600/2000/2400m
 */
export function venueDistances(venue: Venue, surface: Surface): number[] {
  return STANDARD_DISTANCES[surface].filter((d) => findStart(venue, surface, d) !== undefined);
}

/** 最も近い標準距離（等距離なら長い方）。競馬場を指定すると、その場で実在する距離から選ぶ */
export function nearestStandardDistance(surface: Surface, distance: number, venue?: Venue): number {
  const candidates = venue ? venueDistances(venue, surface) : STANDARD_DISTANCES[surface];
  let best = candidates[0];
  for (const d of candidates) {
    const diff = Math.abs(d - distance);
    const bestDiff = Math.abs(best - distance);
    if (diff < bestDiff || (diff === bestDiff && d > best)) best = d;
  }
  return best;
}

/**
 * 重賞をゲームのレースにする。レース名・格・距離・条件は本来のまま（置き換えはしない）
 */
export function mainRaceOf(g: GradedRace): Omit<ProgramRace, 'no' | 'runners'> {
  return { raceClass: g.grade, name: g.name, surface: g.surface, distance: g.distance, age: g.age, fillies: g.fillies };
}

export type Slot = { raceClass: RaceClass; surface: Surface; age: AgeCondition };

/**
 * 典型的な1日の番組（11Rは重賞）。上半期は3歳戦と古馬戦、6月から2歳の新馬戦が始まり古馬は3歳以上になる。
 * クラスの数は名簿の馬の数（クラスごとの頭数）に合わせた。
 * 実際の番組表の再現ではなく、クラスの並び方を真似たテンプレート。
 */
export function undercard(month: number): Slot[] {
  if (month >= 9) {
    return [
      { raceClass: 'maiden', surface: 'dirt', age: '2' },
      { raceClass: 'maiden', surface: 'turf', age: '2' },
      { raceClass: '1win', surface: 'dirt', age: '3up' },
      { raceClass: '1win', surface: 'turf', age: '2' },
      // 新馬戦は10月まで（それ以降はほとんどの2歳がデビューしている）
      { raceClass: month <= 10 ? 'newcomer' : 'maiden', surface: 'turf', age: '2' },
      { raceClass: '1win', surface: 'turf', age: '3up' },
      { raceClass: '2win', surface: 'dirt', age: '3up' },
      { raceClass: '2win', surface: 'turf', age: '3up' },
      { raceClass: '3win', surface: 'dirt', age: '3up' },
      { raceClass: '3win', surface: 'turf', age: '3up' },
      { raceClass: '2win', surface: 'dirt', age: '3up' },
    ];
  }
  const older: AgeCondition = month >= 6 ? '3up' : '4up';
  return [
    { raceClass: 'maiden', surface: 'dirt', age: '3' },
    { raceClass: 'maiden', surface: 'turf', age: '3' },
    { raceClass: 'maiden', surface: 'dirt', age: '3' },
    month >= 6
      ? { raceClass: 'newcomer', surface: 'turf', age: '2' }
      : { raceClass: 'maiden', surface: 'turf', age: '3' },
    { raceClass: '1win', surface: 'dirt', age: '3' },
    { raceClass: '1win', surface: 'turf', age: '3' },
    { raceClass: '1win', surface: 'turf', age: older },
    { raceClass: '2win', surface: 'dirt', age: older },
    { raceClass: '2win', surface: 'turf', age: older },
    { raceClass: '3win', surface: 'turf', age: older },
    { raceClass: '2win', surface: 'dirt', age: older },
  ];
}

/** 出走頭数の幅（クラスごと） */
export const RUNNERS: Record<RaceClass, [number, number]> = {
  newcomer: [8, 14],
  maiden: [12, 16],
  '1win': [10, 16],
  '2win': [10, 16],
  '3win': [9, 15],
  open: [9, 16],
  G3: [11, 18],
  G2: [9, 16],
  G1: [15, 18],
};

/** 回り（東京は左回り、中山・京都・阪神は右回り） */
export const VENUE_DIRECTION: Record<Venue, Direction> = { 東京: 'left', 中山: 'right', 京都: 'right', 阪神: 'right' };

/** 1つの競馬場の1日の番組（12R）。11Rは重賞、ダービーデーは12Rも重賞（目黒記念）。runners は出走頭数の上限 */
export function venueDayProgram(day: VenueDay, rng: Rng): ProgramRace[] {
  const slots = undercard(day.month);
  const races: ProgramRace[] = [];
  let slotIdx = 0;
  // 牝馬限定の条件戦は1日1レース（重賞以外から選ぶ）
  const filliesNo = rng.pick(day.last ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  for (let no = 1; no <= RACES_PER_DAY; no++) {
    if (no === 11 || (no === 12 && day.last)) {
      const m = mainRaceOf(no === 11 ? day.main : day.last!);
      races.push({ no, ...m, runners: rng.int(...RUNNERS[m.raceClass]) });
      continue;
    }
    const slot = slots[slotIdx++];
    races.push({
      no,
      raceClass: slot.raceClass,
      name: CLASS_LABEL[slot.raceClass],
      surface: slot.surface,
      age: slot.age,
      fillies: no === filliesNo,
      distance: rng.pick(venueDistances(day.venue, slot.surface)),
      runners: rng.int(...RUNNERS[slot.raceClass]),
    });
  }
  return races;
}

/** その日の馬場状態。芝・ダートで共通の天気から決め、雨の日は両方とも悪くなりやすい */
export function dayCondition(rng: Rng): Record<Surface, TrackCondition> {
  const wet = rng.weighted([
    [0, 0.6],
    [1, 0.2],
    [2, 0.12],
    [3, 0.08],
  ] as const);
  const shift = () => Math.max(0, Math.min(3, wet + (rng.chance(0.25) ? (rng.chance(0.5) ? 1 : -1) : 0)));
  return { turf: CONDITIONS[wet], dirt: CONDITIONS[shift()] };
}
