import { GRADED_RACES_2026, type AgeCondition, type GradedRace, type Venue } from './gradedRaces';
import { createRace } from './horse';
import { findStart } from './racePath';
import { Rng, hashSeed } from './rng';
import { CONDITIONS, DISTANCES_BY_SURFACE, type Direction, type RaceSetup, type Surface, type TrackCondition } from './types';

/** 1日のレース数 */
export const RACES_PER_DAY = 12;
/** 開催日のメインレース（11R）になる重賞。12Rに組む重賞（目黒記念）は同じ日に入れる */
const MAIN_RACES = GRADED_RACES_2026.filter((g) => g.raceNo === undefined);
/** 1年の開催日数（メインレースになる重賞の数と同じ） */
export const DAYS_PER_YEAR = MAIN_RACES.length;

/** その日の12Rに組む重賞（同じ日・同じ競馬場） */
function lastRaceOf(main: GradedRace): GradedRace | undefined {
  return GRADED_RACES_2026.find(
    (g) => g.raceNo === 12 && g.month === main.month && g.day === main.day && g.venue === main.venue,
  );
}

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

/**
 * クラスごとの能力水準（能力値の平均）。上のクラスほど速い時計で走る。
 * 段階1〜3の調整は水準60（3勝クラス相当）で行った。
 */
export const CLASS_LEVEL: Record<RaceClass, number> = {
  newcomer: 45,
  maiden: 47,
  '1win': 52,
  '2win': 56,
  '3win': 60,
  open: 63,
  G3: 66,
  G2: 69,
  G1: 73,
};
/** 若い馬ほど能力水準が低い（完成度の差） */
const AGE_LEVEL_OFFSET: Record<AgeCondition, number> = { '2': -4, '3': -2, '3up': 0, '4up': 0 };

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
 * 重賞をゲームのメインレースにする。
 * - 2歳戦は G1 以外をすべて「オープン」に置き換える
 * - G3 以下（置き換えたオープンを含む）で標準距離以外のもの、またはその場で実在しない標準距離のものは
 *   「オープン」にし、距離もその場で実在する最も近い標準距離にする
 */
export function mainRaceOf(g: GradedRace): Omit<ProgramRace, 'no' | 'runners'> {
  let raceClass: RaceClass = g.grade;
  let name = g.name;
  let distance = g.distance;
  if (g.age === '2' && g.grade !== 'G1') {
    raceClass = 'open';
    name = CLASS_LABEL.open;
  }
  const standard = venueDistances(g.venue, g.surface).includes(distance);
  if ((raceClass === 'G3' || raceClass === 'open') && !standard) {
    raceClass = 'open';
    name = CLASS_LABEL.open;
    distance = nearestStandardDistance(g.surface, distance, g.venue);
  }
  return { raceClass, name, surface: g.surface, distance, age: g.age, fillies: g.fillies };
}

type Slot = { raceClass: RaceClass; surface: Surface; age: AgeCondition };

/**
 * 典型的な1日の番組（11Rは重賞）。上半期は3歳戦と古馬戦、6月から2歳戦が始まり古馬は3歳以上になる。
 * 実際の番組表の再現ではなく、クラスの並び方を真似たテンプレート。
 */
function undercard(month: number): Slot[] {
  if (month >= 9) {
    return [
      { raceClass: 'maiden', surface: 'dirt', age: '2' },
      { raceClass: 'maiden', surface: 'turf', age: '2' },
      { raceClass: '1win', surface: 'dirt', age: '3up' },
      { raceClass: 'maiden', surface: 'turf', age: '2' },
      { raceClass: 'newcomer', surface: 'turf', age: '2' },
      { raceClass: '1win', surface: 'dirt', age: '3up' },
      { raceClass: '1win', surface: 'turf', age: '3up' },
      { raceClass: '2win', surface: 'dirt', age: '3up' },
      { raceClass: '2win', surface: 'turf', age: '3up' },
      { raceClass: '3win', surface: 'turf', age: '3up' },
      { raceClass: '2win', surface: 'dirt', age: '3up' },
    ];
  }
  const older: AgeCondition = month >= 6 ? '3up' : '4up';
  return [
    { raceClass: 'maiden', surface: 'dirt', age: '3' },
    { raceClass: 'maiden', surface: 'turf', age: '3' },
    { raceClass: 'maiden', surface: 'dirt', age: '3' },
    { raceClass: 'maiden', surface: 'turf', age: '3' },
    month >= 6
      ? { raceClass: 'newcomer', surface: 'turf', age: '2' }
      : month <= 2
        ? { raceClass: 'newcomer', surface: 'dirt', age: '3' }
        : { raceClass: 'maiden', surface: 'dirt', age: '3' },
    { raceClass: '1win', surface: 'dirt', age: '3' },
    { raceClass: '1win', surface: 'turf', age: older },
    { raceClass: '1win', surface: 'dirt', age: older },
    { raceClass: '1win', surface: 'turf', age: '3' },
    { raceClass: '3win', surface: 'turf', age: older },
    { raceClass: '2win', surface: 'dirt', age: older },
  ];
}

/** 出走頭数の幅（クラスごと） */
const RUNNERS: Record<RaceClass, [number, number]> = {
  newcomer: [10, 16],
  maiden: [14, 18],
  '1win': [10, 16],
  '2win': [10, 16],
  '3win': [9, 15],
  open: [9, 16],
  G3: [12, 18],
  G2: [10, 18],
  G1: [14, 18],
};

export interface RaceDay {
  /** 通算の開催日（1始まり）。meetingSeed と同じ */
  serial: number;
  year: number;
  /** その年の何日目か（0始まり） */
  dayIndex: number;
  month: number;
  day: number;
  venue: Venue;
  /** その日の馬場状態（芝・ダートそれぞれ） */
  condition: Record<Surface, TrackCondition>;
  races: ProgramRace[];
}

/** 通算 serial 日目の開催（97日で1年） */
export function raceDay(serial: number): RaceDay {
  const n = Math.max(1, Math.floor(serial));
  const dayIndex = (n - 1) % DAYS_PER_YEAR;
  const year = 2026 + Math.floor((n - 1) / DAYS_PER_YEAR);
  const main = MAIN_RACES[dayIndex];
  const last = lastRaceOf(main);
  const rng = new Rng(hashSeed(n * 7919 + 17));
  const slots = undercard(main.month);
  // 馬場状態はその日の芝・ダートで共通。雨の日は両方とも悪くなりやすい
  const wet = rng.weighted([
    [0, 0.6],
    [1, 0.2],
    [2, 0.12],
    [3, 0.08],
  ] as const);
  const shift = () => Math.max(0, Math.min(3, wet + (rng.chance(0.25) ? (rng.chance(0.5) ? 1 : -1) : 0)));
  const condition: Record<Surface, TrackCondition> = { turf: CONDITIONS[wet], dirt: CONDITIONS[shift()] };
  const races: ProgramRace[] = [];
  let slotIdx = 0;
  // 牝馬限定の条件戦は1日1レース（メインレース以外から選ぶ）
  const filliesNo = rng.pick(last ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  for (let no = 1; no <= RACES_PER_DAY; no++) {
    if (no === 11 || (no === 12 && last)) {
      const m = mainRaceOf(no === 11 ? main : last!);
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
      distance: rng.pick(venueDistances(main.venue, slot.surface)),
      runners: rng.int(...RUNNERS[slot.raceClass]),
    });
  }
  return { serial: n, year, dayIndex, month: main.month, day: main.day, venue: main.venue, condition, races };
}

/** レースの能力水準 */
export function raceLevel(race: ProgramRace): number {
  return CLASS_LEVEL[race.raceClass] + AGE_LEVEL_OFFSET[race.age];
}

/** 回り（東京は左回り、中山・京都・阪神は右回り） */
export const VENUE_DIRECTION: Record<Venue, Direction> = { 東京: 'left', 中山: 'right', 京都: 'right', 阪神: 'right' };

/**
 * 出馬表に出す近走の数。新馬戦はまだ走っていないので0、2歳戦はキャリアが浅いので1〜4走、
 * それ以外は4走
 */
export function pastRunsFor(race: Pick<ProgramRace, 'raceClass' | 'age'>): [number, number] {
  if (race.raceClass === 'newcomer') return [0, 0];
  if (race.age === '2') return [1, 4];
  return [4, 4];
}

/** 番組のレースから出走表を作る */
export function setupFor(day: RaceDay, race: ProgramRace): RaceSetup {
  const seed = hashSeed(day.serial * 131 + race.no);
  return createRace(seed, {
    course: {
      surface: race.surface,
      distance: race.distance,
      direction: VENUE_DIRECTION[day.venue],
      condition: day.condition[race.surface],
      venue: day.venue,
    },
    runners: race.runners,
    classLevel: raceLevel(race),
    pastRuns: pastRunsFor(race),
  });
}
