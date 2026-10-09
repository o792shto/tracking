import { simulateRace } from './engine';
import { createRace, type CreateRaceOptions } from './horse';
import { provisionalPopularity } from './rating';
import {
  STYLES,
  type RaceDistance,
  type RaceResult,
  type RunningStyle,
  type Surface,
  type TrackCondition,
} from './types';

export interface TimeSummary {
  count: number;
  min: number;
  mean: number;
  max: number;
  p05: number;
  p95: number;
}

export interface BatchStats {
  races: number;
  /** 人気順（1番人気〜）ごとの勝率と3着内率 */
  byPopularity: { popularity: number; starts: number; winRate: number; top3Rate: number }[];
  /** 脚質ごとの出走数・勝率・1頭あたり勝率の期待値との比 */
  byStyle: Record<
    RunningStyle,
    { starts: number; wins: number; winRate: number; expectedWinRate: number; ratio: number }
  >;
  /** 距離×馬場×馬場状態ごとの勝ち時計と勝ち馬の上がり3F */
  times: Record<string, { winTime: TimeSummary; last3f: TimeSummary }>;
  /** 1・2着の着差（秒）の中央値 */
  medianWinMarginSec: number;
  /** 6番人気以下の勝利の割合 */
  longshotWinRate: number;
  pace: Record<RaceResult['pace'], number>;
  slowStartPerRace: number;
  keenPerRace: number;
  blockedPerRace: number;
}

export function timeKey(distance: RaceDistance, surface: Surface, condition: TrackCondition): string {
  return `${distance}-${surface}-${condition}`;
}

function summarize(values: number[]): TimeSummary {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    count: s.length,
    min: s[0],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    max: s[s.length - 1],
    p05: q(0.05),
    p95: q(0.95),
  };
}

/** seedStart から races 本のレースを回して統計を取る */
export function runBatch(races: number, seedStart = 1, options: CreateRaceOptions = {}): BatchStats {
  const popStarts: number[] = [];
  const popWins: number[] = [];
  const popTop3: number[] = [];
  const styleStarts = Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<RunningStyle, number>;
  const styleWins = { ...styleStarts };
  const styleExpected = { ...styleStarts };
  const timeRows: Record<string, { win: number[]; last3f: number[] }> = {};
  const margins: number[] = [];
  const pace = { high: 0, middle: 0, slow: 0 };
  let longshotWins = 0;
  let slowStarts = 0;
  let keen = 0;
  let blocked = 0;

  for (let k = 0; k < races; k++) {
    const setup = createRace(seedStart + k, options);
    const result = simulateRace(setup, { record: false });
    const n = setup.entries.length;
    const popularity = provisionalPopularity(setup);
    const rankOf = new Map(result.finish.map((f) => [f.number, f.rank]));
    popularity.forEach((num, p) => {
      popStarts[p] = (popStarts[p] ?? 0) + 1;
      const rank = rankOf.get(num)!;
      if (rank === 1) popWins[p] = (popWins[p] ?? 0) + 1;
      if (rank <= 3) popTop3[p] = (popTop3[p] ?? 0) + 1;
      if (rank === 1 && p >= 5) longshotWins++;
    });
    for (const e of setup.entries) {
      styleStarts[e.horse.style]++;
      styleExpected[e.horse.style] += 1 / n;
    }
    const winner = setup.entries[result.finish[0].number - 1];
    styleWins[winner.horse.style]++;

    const key = timeKey(setup.course.distance, setup.course.surface, setup.course.condition);
    timeRows[key] ??= { win: [], last3f: [] };
    timeRows[key].win.push(result.finish[0].time);
    timeRows[key].last3f.push(result.finish[0].last3f);
    margins.push(result.finish[1].marginSec);
    pace[result.pace]++;
    for (const ev of result.events) {
      if (ev.kind === 'slowStart') slowStarts++;
      else if (ev.kind === 'keen') keen++;
      else blocked++;
    }
  }

  const byStyle = {} as BatchStats['byStyle'];
  for (const s of STYLES) {
    const winRate = styleStarts[s] ? styleWins[s] / styleStarts[s] : 0;
    const expectedWinRate = styleStarts[s] ? styleExpected[s] / styleStarts[s] : 0;
    byStyle[s] = {
      starts: styleStarts[s],
      wins: styleWins[s],
      winRate,
      expectedWinRate,
      ratio: expectedWinRate ? winRate / expectedWinRate : 0,
    };
  }
  const times: BatchStats['times'] = {};
  for (const [key, row] of Object.entries(timeRows)) {
    times[key] = { winTime: summarize(row.win), last3f: summarize(row.last3f) };
  }
  const sortedMargins = margins.sort((a, b) => a - b);

  return {
    races,
    byPopularity: popStarts.map((starts, p) => ({
      popularity: p + 1,
      starts,
      winRate: (popWins[p] ?? 0) / starts,
      top3Rate: (popTop3[p] ?? 0) / starts,
    })),
    byStyle,
    times,
    medianWinMarginSec: sortedMargins[Math.floor(sortedMargins.length / 2)],
    longshotWinRate: longshotWins / races,
    pace,
    slowStartPerRace: slowStarts / races,
    keenPerRace: keen / races,
    blockedPerRace: blocked / races,
  };
}

/** 勝ち時計がもっともらしい範囲（良馬場、秒）。重い馬場ほど遅くなる分は conditionAllowance で足す */
export const PLAUSIBLE_WIN_TIME: Record<Surface, Record<RaceDistance, [number, number]>> = {
  turf: { 1200: [66.5, 71.5], 1600: [91.5, 97.5], 2000: [117, 124], 2400: [142, 150] },
  dirt: { 1200: [69, 74], 1600: [94, 101], 2000: [121, 129], 2400: [147, 156] },
};
/** 馬場状態による勝ち時計の許容の上乗せ（1000mあたり秒） */
export const CONDITION_ALLOWANCE: Record<TrackCondition, number> = {
  good: 0,
  yielding: 0.8,
  soft: 1.6,
  heavy: 2.6,
};
/** 勝ち馬の上がり3Fのもっともらしい範囲（秒） */
export const PLAUSIBLE_LAST3F: Record<Surface, [number, number]> = {
  turf: [32.5, 37.5],
  dirt: [35, 40],
};

export function plausibleWinTime(
  distance: RaceDistance,
  surface: Surface,
  condition: TrackCondition,
): [number, number] {
  const [lo, hi] = PLAUSIBLE_WIN_TIME[surface][distance];
  return [lo, hi + (CONDITION_ALLOWANCE[condition] * distance) / 1000];
}

