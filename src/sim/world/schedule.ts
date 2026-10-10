import type { Grade } from '../gradedRaces';
import { frameNumbers } from '../horse';
import {
  CLASS_LABEL,
  RACES_PER_DAY,
  RUNNERS,
  VENUE_DIRECTION,
  mainRaceOf,
  undercard,
  venueDistances,
  type ProgramRace,
  type RaceClass,
} from '../program';
import { Rng, hashSeed } from '../rng';
import { CONDITIONS, type Entry, type PastRun, type RaceSetup, type Surface, type TrackCondition } from '../types';
import { WEEKS_PER_YEAR, weekOf, type RaceWeek, type VenueDay } from './calendar';
import { ageOf, aptitudeFit, currentStats, rating, simHorse } from './horses';
import type { RunRecord, Tier, World, WorldHorse } from './types';

/** 観戦できるレース（10R・11R・12R） */
export const VISIBLE_RACES: readonly number[] = [10, 11, 12];

/** 1つのレースの出走表 */
export interface CardRace {
  /** その週の何日目（week.days の添字） */
  dayIndex: number;
  no: number;
  program: ProgramRace;
  grade: Grade | null;
  visible: boolean;
  seed: number;
  /** 出走馬（馬番順） */
  horseIds: number[];
}

export interface WeekCard {
  serial: number;
  year: number;
  week: RaceWeek;
  /** 日ごとの馬場状態 */
  conditions: Record<Surface, TrackCondition>[];
  races: CardRace[];
}

/** 年の進み具合（0〜1）。週の番号から */
export function seasonProgress(weekIndex: number, weeksPerYear: number): number {
  return weekIndex / Math.max(1, weeksPerYear - 1);
}

/** 1日の番組（12R）。runners は出走頭数の上限 */
function dayProgram(day: VenueDay, rng: Rng): ProgramRace[] {
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

function dayCondition(rng: Rng): Record<Surface, TrackCondition> {
  // 馬場状態はその日の芝・ダートで共通。雨の日は両方とも悪くなりやすい
  const wet = rng.weighted([
    [0, 0.6],
    [1, 0.2],
    [2, 0.12],
    [3, 0.08],
  ] as const);
  const shift = () => Math.max(0, Math.min(3, wet + (rng.chance(0.25) ? (rng.chance(0.5) ? 1 : -1) : 0)));
  return { turf: CONDITIONS[wet], dirt: CONDITIONS[shift()] };
}

const GRADED: readonly RaceClass[] = ['G1', 'G2', 'G3'];
const isGraded = (c: RaceClass): c is Grade => GRADED.includes(c);

/** 出走馬を決める順（上のクラスから） */
const PRIORITY: readonly RaceClass[] = ['G1', 'G2', 'G3', 'open', '3win', '2win', '1win', 'newcomer', 'maiden'];

/** クラス（条件戦）に出られる所属 */
const TIER_OF_CLASS: Partial<Record<RaceClass, Tier>> = { maiden: 'maiden', '1win': '1win', '2win': '2win', '3win': '3win' };
const TIER_BELOW: Partial<Record<Tier, Tier>> = { '1win': 'maiden', '2win': '1win', '3win': '2win' };

/** 出走表を作るときの調整値 */
export const ENTRY = {
  /** 前走から何週あけるか（最小） */
  minRest: 2,
  /** オープン馬の最小間隔（G1 以外） */
  openRest: 3,
  /** 出走を決めるときの距離・馬場の適性の下限（これより合わない馬は出さない） */
  minFit: -3.5,
  /** 頭数が足りないときに緩める下限 */
  looseFit: -6,
  /** 出走表が成り立つ最少頭数 */
  minRunners: 5,
  /** G1 を目標にする馬の目安（同世代の上位の総合力との差） */
  g1Margin: 4,
};

function ageOk(race: ProgramRace, age: number): boolean {
  switch (race.age) {
    case '2':
      return age === 2;
    case '3':
      return age === 3;
    case '3up':
      return age >= 3;
    case '4up':
      return age >= 4;
  }
}

function weeksRested(h: WorldHorse, serial: number): number {
  return h.lastWeek === null ? 99 : serial - h.lastWeek;
}

function available(h: WorldHorse, serial: number, minRest: number): boolean {
  if (h.retired) return false;
  if (h.restUntil !== null && serial < h.restUntil) return false;
  return weeksRested(h, serial) >= minRest;
}

/** その週の出走表（番組と出走馬）。同じ週に1頭が出るのは1レースまで */
export function weekCard(world: World): WeekCard {
  const serial = world.serial;
  const { year, week } = weekOf(serial);
  const progress = seasonProgress(week.index, WEEKS_PER_YEAR);
  const rng = new Rng(hashSeed(world.seed ^ Math.imul(serial + 1000, 0x9e3779b1)));
  const conditions: Record<Surface, TrackCondition>[] = [];
  const races: CardRace[] = [];
  week.days.forEach((day, dayIndex) => {
    const dayRng = rng.fork(dayIndex + 1);
    conditions.push(dayCondition(dayRng.fork(1)));
    for (const program of dayProgram(day, dayRng.fork(2))) {
      races.push({
        dayIndex,
        no: program.no,
        program,
        grade: isGraded(program.raceClass) ? program.raceClass : null,
        visible: VISIBLE_RACES.includes(program.no),
        seed: hashSeed(world.seed + serial * 1009 + dayIndex * 37 + program.no),
        horseIds: [],
      });
    }
  });

  // 能力・年齢はこの週の値で比べる
  const active = world.horses.filter((h) => !h.retired && ageOf(h, year) >= 2);
  const score = new Map<number, number>();
  for (const h of active) score.set(h.id, rating(currentStats(h, year, progress)));

  // G1 を目標にする馬：同じ年齢の上位にいて、2週以内に向いた G1 がある
  const g1Ahead = upcomingG1(serial);
  const topByAge = new Map<number, number>();
  for (const h of active) {
    const age = ageOf(h, year);
    const r = score.get(h.id)!;
    topByAge.set(age, Math.max(topByAge.get(age) ?? 0, r));
  }
  const aimsAtG1 = (h: WorldHorse) => {
    const age = ageOf(h, year);
    if (score.get(h.id)! < (topByAge.get(age) ?? 0) - ENTRY.g1Margin) return false;
    return g1Ahead.some((g) => ageOk(g, age) && (!g.fillies || h.sex === 'filly') && aptitudeFit(h, g.surface, g.distance) > -2);
  };

  const used = new Set<number>();
  const pickRng = rng.fork(99);
  const order = [...races].sort(
    (a, b) =>
      PRIORITY.indexOf(a.program.raceClass) - PRIORITY.indexOf(b.program.raceClass) ||
      Number(b.visible) - Number(a.visible) ||
      a.dayIndex - b.dayIndex ||
      a.no - b.no,
  );
  for (const race of order) {
    const p = race.program;
    const graded = isGraded(p.raceClass);
    const base = (h: WorldHorse) =>
      !used.has(h.id) && ageOk(p, ageOf(h, year)) && (!p.fillies || h.sex === 'filly');
    let pool: { h: WorldHorse; s: number }[];
    if (graded || p.raceClass === 'open') {
      const rest = p.raceClass === 'G1' ? ENTRY.minRest : ENTRY.openRest;
      // 2歳の重賞は未勝利馬も出られる。それ以外は1勝以上
      const eligible = (h: WorldHorse, fit: number, loose: boolean) =>
        base(h) &&
        available(h, serial, rest) &&
        (p.age === '2' ? h.starts > 0 : h.wins > 0) &&
        (loose || h.tier === 'open' || h.tier === '3win' || p.age === '2' || p.age === '3') &&
        fit >= (loose ? ENTRY.looseFit : -2.5) &&
        (p.raceClass === 'G1' || !aimsAtG1(h));
      const collect = (loose: boolean) =>
        active
          .map((h) => ({ h, fit: aptitudeFit(h, p.surface, p.distance) }))
          .filter(({ h, fit }) => eligible(h, fit, loose))
          .map(({ h, fit }) => ({
            h,
            s: score.get(h.id)! + 0.8 * fit + 2 * Math.log10(1 + h.earnings) + pickRng.normal(0, 1.5),
          }));
      pool = collect(false);
      if (pool.length < p.runners) {
        const have = new Set(pool.map((x) => x.h.id));
        pool.push(...collect(true).filter((x) => !have.has(x.h.id)).map((x) => ({ ...x, s: x.s - 100 })));
      }
    } else {
      const tier = TIER_OF_CLASS[p.raceClass];
      const fits = (h: WorldHorse, fit: number, loose: boolean) => {
        if (!base(h) || !available(h, serial, ENTRY.minRest) || fit < (loose ? ENTRY.looseFit : ENTRY.minFit)) return false;
        if (p.raceClass === 'newcomer') return h.starts === 0;
        // 未勝利戦はデビューした馬が先（頭数が足りなければ未出走の馬も出る）
        if (h.tier === tier) return p.raceClass !== 'maiden' || h.starts > 0 || loose;
        // 頭数が足りなければ1つ下のクラスの馬も出る（格上挑戦）
        return loose && tier !== undefined && TIER_BELOW[tier] === h.tier && (h.tier !== 'maiden' || h.starts > 0);
      };
      const collect = (loose: boolean) =>
        active
          .map((h) => ({ h, fit: aptitudeFit(h, p.surface, p.distance) }))
          .filter(({ h, fit }) => fits(h, fit, loose))
          .map(({ h, fit }) => ({
            h,
            s: fit + 0.4 * Math.min(weeksRested(h, serial), 8) + pickRng.normal(0, 1.5) - (loose ? 100 : 0),
          }));
      pool = collect(false);
      if (pool.length < p.runners) {
        const have = new Set(pool.map((x) => x.h.id));
        pool.push(...collect(true).filter((x) => !have.has(x.h.id)));
      }
    }
    pool.sort((a, b) => b.s - a.s);
    const chosen = pool.slice(0, p.runners).map((x) => x.h.id);
    if (chosen.length < ENTRY.minRunners) continue;
    for (const id of chosen) used.add(id);
    // 馬番は抽選（選ばれた順と関係なく）
    race.horseIds = pickRng.shuffle(chosen);
    race.program = { ...p, runners: chosen.length };
  }
  return { serial, year, week, conditions, races };
}

/** これから2週以内（今週を含む）の G1 */
function upcomingG1(serial: number): ProgramRace[] {
  const out: ProgramRace[] = [];
  for (let k = 0; k <= 2; k++) {
    const { week } = weekOf(serial + k);
    for (const d of week.days) {
      for (const g of [d.main, d.last]) {
        if (g?.grade === 'G1') out.push({ no: 11, ...mainRaceOf(g), runners: 18 });
      }
    }
  }
  return out;
}

/** 新しい順の近走（出馬表用） */
export function historyOf(h: WorldHorse): PastRun[] {
  return [...h.runs].reverse().map((r: RunRecord) => ({
    rank: r.rank,
    runners: r.runners,
    surface: r.surface,
    distance: r.distance,
    race: r.race,
    venue: r.venue,
    grade: r.grade,
    year: r.year,
    month: r.month,
    day: r.day,
  }));
}

/** 出走表のレースをシミュレーションの入力にする */
export function raceSetup(world: World, card: WeekCard, race: CardRace): RaceSetup {
  const day = card.week.days[race.dayIndex];
  const p = race.program;
  const byId = new Map(world.horses.map((h) => [h.id, h]));
  const progress = seasonProgress(card.week.index, WEEKS_PER_YEAR);
  const rng = new Rng(race.seed).fork(1);
  const frames = frameNumbers(race.horseIds.length);
  const entries: Entry[] = race.horseIds.map((id, i) => {
    const h = byId.get(id)!;
    return {
      number: i + 1,
      frame: frames[i],
      horse: simHorse(h, card.year, progress),
      history: historyOf(h),
      form: 1 + rng.normal(0, 0.003),
    };
  });
  return {
    seed: race.seed,
    course: {
      surface: p.surface,
      distance: p.distance,
      direction: VENUE_DIRECTION[day.venue],
      condition: card.conditions[race.dayIndex][p.surface],
      venue: day.venue,
    },
    entries,
  };
}
