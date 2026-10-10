import type { Grade } from '../gradedRaces';
import { frameNumbers } from '../horse';
import { VENUE_DIRECTION, dayCondition, mainRaceOf, venueDayProgram, type ProgramRace, type RaceClass } from '../program';
import { Rng, hashSeed } from '../rng';
import { type Entry, type PastRun, type RaceSetup, type Surface, type TrackCondition } from '../types';
import { WEEKS_PER_YEAR, weekOf, type RaceWeek } from './calendar';
import { ABROAD, overseasRacesOf, type OverseasRace } from './overseas';
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
  /** 海外のレースに遠征する日本馬（top はその週の日本の現役トップの総合力） */
  abroad: { race: OverseasRace; horseIds: number[]; top: number }[];
}

/** 年の進み具合（0〜1）。週の番号から */
export function seasonProgress(weekIndex: number, weeksPerYear: number): number {
  return weekIndex / Math.max(1, weeksPerYear - 1);
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
  /** 前走から何週あけるか（クラスごとの最小）。上のクラスほど間隔をあける */
  minRest: { maiden: 3, '1win': 3, '2win': 4, '3win': 4, open: 5 } as Record<Tier, number>,
  /** G1 を走ったあとの最小間隔（次も G1 なら g1ToG1） */
  afterG1: 6,
  g1ToG1: 4,
  /** 1年に走る数の上限（G1 馬・オープン馬・それ以外） */
  yearCap: { g1Winner: 6, open: 7, other: 9 },
  /** 出走を決めるときの距離・馬場の適性の下限（これより合わない馬は出さない） */
  minFit: -3.5,
  /** 頭数が足りないときに緩める下限 */
  looseFit: -6,
  /** 出走表が成り立つ最少頭数 */
  minRunners: 5,
  /** G1 を目標にする馬は、G1 の何週前までなら前哨戦に出るか（これより近いと出ない） */
  prepBefore: 4,
  /** 前哨戦に出るのは、何週以上休んだあと（休み明けの1戦だけ） */
  prepAfterRest: 8,
  /** G1 を目標にする目安の期間（週）。冬の間もクラシックを見すえる */
  g1Horizon: 16,
  /** 2・3歳の牝馬が牡馬相手の重賞に出るのは、同世代のトップとの差がこれ以内の馬だけ */
  fillyVsColts: 1.5,
  /** 古馬の牝馬が牝馬限定でない重賞に出るときの選ばれにくさ（点） */
  fillyOlderPenalty: 3,
};
/**
 * G1 の優先出走権（ユーザー指定）。前哨戦でこの着順以内なら、賞金にかかわらず先に出走できる
 */
export const PRIORITY_TRIALS: Record<string, readonly (readonly [string, number])[]> = {
  皐月賞: [
    ['弥生賞ディープインパクト記念', 3],
    ['スプリングS', 3],
  ],
  日本ダービー: [
    ['青葉賞', 2],
    ['皐月賞', 5],
  ],
  桜花賞: [
    ['チューリップ賞', 3],
    ['フィリーズレビュー', 3],
  ],
  オークス: [
    ['桜花賞', 5],
    ['フローラS', 2],
  ],
  菊花賞: [
    ['神戸新聞杯', 3],
    ['セントライト記念', 3],
  ],
  秋華賞: [
    ['ローズS', 3],
    ['紫苑S', 3],
  ],
  NHKマイルC: [['ニュージーランドT', 3]],
};

/** その年の前哨戦で優先出走権を取っているか */
export function hasPriority(h: WorldHorse, g1: string, year: number): boolean {
  const trials = PRIORITY_TRIALS[g1];
  if (!trials) return false;
  return h.runs.some((r) => r.year === year && trials.some(([name, top]) => r.race === name && r.rank <= top));
}

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

/** 前走からあける週の数。G1 を走ったあとは長めに休む（次も G1 ならやや短く） */
export function restNeeded(h: WorldHorse, toG1: boolean): number {
  const base = ENTRY.minRest[h.tier];
  const last = h.runs[h.runs.length - 1];
  if (last?.grade === 'G1') return Math.max(base, toG1 ? ENTRY.g1ToG1 : ENTRY.afterG1);
  return toG1 ? Math.min(base, ENTRY.g1ToG1) : base;
}

/** その年にあと何走できるか（使い詰めにしない） */
function underYearCap(h: WorldHorse, year: number): boolean {
  const n = h.runs.filter((r) => r.year === year).length;
  const cap = h.graded.some((g) => g.grade === 'G1') ? ENTRY.yearCap.g1Winner : h.tier === 'open' ? ENTRY.yearCap.open : ENTRY.yearCap.other;
  return n < cap;
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
    for (const program of venueDayProgram(day, dayRng.fork(2))) {
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

  // G1 を目標にする馬：同じ年齢の上位にいて、数週以内に向いた G1 がある
  const g1Ahead = upcomingG1(serial, ENTRY.g1Horizon);
  const topByAge = new Map<number, number>();
  for (const h of active) {
    const age = ageOf(h, year);
    const r = score.get(h.id)!;
    topByAge.set(age, Math.max(topByAge.get(age) ?? 0, r));
  }
  /**
   * 2・3歳の牝馬は、牝馬限定でないレース（牡馬クラシックなど）にはほとんど出ない。
   * 同世代のトップと互角の、ずば抜けた牝馬だけが挑む
   */
  const fillyStaysHome = (h: WorldHorse, race: Pick<ProgramRace, 'age' | 'fillies'>) =>
    h.sex === 'filly' &&
    !race.fillies &&
    (race.age === '2' || race.age === '3') &&
    score.get(h.id)! < (topByAge.get(ageOf(h, year)) ?? 0) - ENTRY.fillyVsColts;
  /** G1 に出たい馬の条件（年齢・性別・距離・勝ち鞍） */
  const wantsG1 = (h: WorldHorse, g: ProgramRace) =>
    ageOk(g, ageOf(h, year)) &&
    (!g.fillies || h.sex === 'filly') &&
    !fillyStaysHome(h, g) &&
    (g.age === '2' ? h.starts > 0 : h.wins > 0) &&
    aptitudeFit(h, g.surface, g.distance) > -2.5;
  /** これからの G1 それぞれの、賞金で出走できる目安（出走頭数番目の賞金） */
  const cutoff = new Map<string, number>();
  for (const { race: g } of g1Ahead) {
    if (cutoff.has(g.name)) continue;
    const earnings = active
      .filter((h) => wantsG1(h, g) && !hasPriority(h, g.name, year))
      .map((h) => h.earnings)
      .sort((a, b) => b - a);
    cutoff.set(g.name, earnings[Math.min(earnings.length - 1, g.runners - 1)] ?? 0);
  }
  /**
   * 目標の G1 が何週先か（目標がなければ null）。賞金が足りている馬と、優先出走権を取った馬だけが G1 を目標にする
   * （賞金が足りない馬は前哨戦で賞金や権利を取りにいく）
   */
  const targetCache = new Map<number, number | null>();
  const g1Target = (h: WorldHorse): number | null => {
    if (targetCache.has(h.id)) return targetCache.get(h.id)!;
    const hit = g1Ahead.find(
      ({ race: g }) => wantsG1(h, g) && (hasPriority(h, g.name, year) || (h.earnings > 0 && h.earnings >= (cutoff.get(g.name) ?? Infinity))),
    );
    const weeks = hit ? hit.weeks : null;
    targetCache.set(h.id, weeks);
    return weeks;
  };
  /**
   * G1 を目標にする馬は、近すぎる前哨戦には出ない。前哨戦は休み明けの1戦だけ（叩き台）。
   * そのため G1 馬は「休み明けの1戦 → G1」か「G1 へ直行」になる
   */
  const skipsForG1 = (h: WorldHorse) => {
    const k = g1Target(h);
    if (k === null) return false;
    return k < ENTRY.prepBefore || weeksRested(h, serial) < ENTRY.prepAfterRest;
  };

  const used = new Set<number>();

  // 海外遠征：日本の現役トップに近い馬が、向いたレースにときどき挑戦する（その週は国内に出ない）
  const abroadRng = rng.fork(77);
  const older = active.filter((h) => ageOf(h, year) >= 3);
  // 日本のトップの水準（現役の上位5頭目の総合力。1頭だけ抜けた馬に引っぱられないように）
  const top = older.map((h) => score.get(h.id)!).sort((a, b) => b - a)[4] ?? 0;
  const abroad = overseasRacesOf(week.index).map((race) => {
    const candidates = older
      .filter(
        (h) =>
          !used.has(h.id) &&
          h.tier === 'open' &&
          score.get(h.id)! >= top - ABROAD.margin &&
          aptitudeFit(h, race.surface, race.distance) >= ABROAD.minFit &&
          available(h, serial, restNeeded(h, true)) &&
          underYearCap(h, year),
      )
      .sort((a, b) => score.get(b.id)! - score.get(a.id)!);
    const horseIds: number[] = [];
    for (const h of candidates) {
      if (horseIds.length >= ABROAD.maxPerRace) break;
      if (abroadRng.chance(ABROAD.chance)) horseIds.push(h.id);
    }
    for (const id of horseIds) used.add(id);
    return { race, horseIds, top };
  });

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
      // 2歳の重賞は未勝利馬も出られる。それ以外は1勝以上
      const eligible = (h: WorldHorse, fit: number, loose: boolean) =>
        base(h) &&
        available(h, serial, restNeeded(h, p.raceClass === 'G1')) &&
        underYearCap(h, year) &&
        (p.age === '2' ? h.starts > 0 : h.wins > 0) &&
        (loose || h.tier === 'open' || h.tier === '3win' || p.age === '2' || p.age === '3') &&
        fit >= (loose ? ENTRY.looseFit : -2.5) &&
        (loose || !fillyStaysHome(h, p)) &&
        (p.raceClass === 'G1' || !skipsForG1(h));
      const collect = (loose: boolean) =>
        active
          .map((h) => ({ h, fit: aptitudeFit(h, p.surface, p.distance) }))
          .filter(({ h, fit }) => eligible(h, fit, loose))
          .map(({ h, fit }) => ({
            h,
            // G1 は優先出走権のある馬が先、あとは賞金順（ユーザー指定）。G2・G3 は賞金を重く、能力（陣営の見立て）も少し
            s:
              p.raceClass === 'G1'
                ? (hasPriority(h, p.name, year) ? 1e6 : 0) + h.earnings + pickRng.range(0, 1)
                : 3 * Math.log10(1 + h.earnings) +
                  0.4 * score.get(h.id)! +
                  0.8 * fit +
                  pickRng.normal(0, 1.5) -
                  (h.sex === 'filly' && !p.fillies ? ENTRY.fillyOlderPenalty : 0),
          }));
      pool = collect(false);
      if (pool.length < p.runners) {
        const have = new Set(pool.map((x) => x.h.id));
        pool.push(...collect(true).filter((x) => !have.has(x.h.id)).map((x) => ({ ...x, s: x.s - 100 })));
      }
    } else {
      const tier = TIER_OF_CLASS[p.raceClass];
      const fits = (h: WorldHorse, fit: number, loose: boolean) => {
        // 頭数が足りないときは間隔を1週だけ詰め、年間の上限も超えてよい（3週より短くはしない）
        const rest = loose ? Math.max(3, restNeeded(h, false) - 1) : restNeeded(h, false);
        if (!base(h) || !available(h, serial, rest) || (!loose && !underYearCap(h, year)) || fit < (loose ? ENTRY.looseFit : ENTRY.minFit)) {
          return false;
        }
        // G1 に出られる賞金・権利のある馬は、条件戦には出ずに G1 へ向かう
        if (g1Target(h) !== null) return false;
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
  return { serial, year, week, conditions, races, abroad };
}

/** これから horizon 週以内（今週を含む）の G1 と、何週先か */
function upcomingG1(serial: number, horizon: number): { race: ProgramRace; weeks: number }[] {
  const out: { race: ProgramRace; weeks: number }[] = [];
  for (let k = 0; k <= horizon; k++) {
    const { week } = weekOf(serial + k);
    for (const d of week.days) {
      for (const g of [d.main, d.last]) {
        if (g?.grade === 'G1') out.push({ race: { no: 11, ...mainRaceOf(g), runners: 18 }, weeks: k });
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
      record: {
        g1Wins: h.graded.filter((g) => g.grade === 'G1').length,
        gradedWins: h.graded.length,
        wins: h.wins,
        starts: h.starts,
        earnings: h.earnings,
      },
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
