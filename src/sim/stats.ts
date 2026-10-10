import { PARAMS } from './params';
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
  /** 2着に5馬身以上の差をつけた勝ちの割合 */
  bigWinRate: number;
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
  let bigWins = 0;
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
    // 1・2着の差を馬身に（勝ち馬の平均速度で換算）
    const lengths = (result.finish[1].marginSec * (setup.course.distance / result.finish[0].time)) / PARAMS.bodyLength;
    if (lengths >= 5) bigWins++;
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
    bigWinRate: bigWins / races,
    longshotWinRate: longshotWins / races,
    pace,
    slowStartPerRace: slowStarts / races,
    keenPerRace: keen / races,
    blockedPerRace: blocked / races,
  };
}

/** 1つのコース条件でまとめて回したときの、勝ち馬とラップの集計 */
export interface CourseStats {
  races: number;
  winTime: number;
  /** 平均ラップ = 勝ち時計 ÷ (距離 / 200) */
  avgLap: number;
  last3f: number;
  firstLap: number;
  /** 1F目が12秒台だった割合 */
  firstLapIn12: number;
  /** 各レースの最速ラップ・最遅ラップの平均 */
  fastestLap: number;
  slowestLap: number;
  /** ラップ形状：2F目が最速／ラスト2F目が最速／最終Fが最遅（1F目を除く）だった割合 */
  secondLapFastest: number;
  penultimateFastest: number;
  lastLapSlowest: number;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/** コース条件を固定して races 本回す。conditions は順番に割り当てる（道悪＝重・不良をまとめて見る用） */
export function runCourseBatch(
  surface: Surface,
  distance: RaceDistance,
  conditions: TrackCondition[],
  races: number,
  seedStart = 1,
): CourseStats {
  const win: number[] = [];
  const last3f: number[] = [];
  const first: number[] = [];
  const fastest: number[] = [];
  const slowest: number[] = [];
  let in12 = 0;
  let second = 0;
  let penult = 0;
  let lastSlow = 0;
  for (let k = 0; k < races; k++) {
    const condition = conditions[k % conditions.length];
    const r = simulateRace(createRace(seedStart + k, { course: { surface, distance, condition } }), {
      record: false,
    });
    const laps = r.laps;
    win.push(r.finish[0].time);
    last3f.push(r.finish[0].last3f);
    first.push(laps[0]);
    if (laps[0] >= 12 && laps[0] < 13) in12++;
    // 最初の区間が200mより短い距離（2100mなど）は、その区間を最速・最遅の比較から除く
    const offset = r.lapMarks[0] < 200 ? 1 : 0;
    const full = laps.slice(offset);
    const min = Math.min(...full);
    const maxAfterFirst = Math.max(...laps.slice(1));
    fastest.push(min);
    slowest.push(Math.max(...full));
    if (laps.indexOf(min) === 1) second++;
    if (laps.indexOf(min) === laps.length - 2) penult++;
    if (laps.lastIndexOf(maxAfterFirst) === laps.length - 1) lastSlow++;
  }
  const winTime = mean(win);
  return {
    races,
    winTime,
    avgLap: winTime / (distance / 200),
    last3f: mean(last3f),
    firstLap: mean(first),
    firstLapIn12: in12 / races,
    fastestLap: mean(fastest),
    slowestLap: mean(slowest),
    secondLapFastest: second / races,
    penultimateFastest: penult / races,
    lastLapSlowest: lastSlow / races,
  };
}
