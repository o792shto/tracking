import type { AgeCondition, Grade } from '../gradedRaces';
import { frameNumbers } from '../horse';
import { VENUE_DIRECTION, dayCondition, mainRaceOf, venueDayProgram, type ProgramRace, type RaceClass } from '../program';
import { Rng, hashSeed } from '../rng';
import { type Entry, type PastRun, type RaceSetup, type Surface, type TrackCondition } from '../types';
import { WEEKS_PER_YEAR, weekOf, type RaceWeek } from './calendar';
import { ABROAD, overseasRacesOf, type OverseasRace } from './overseas';
import { offscreenEligible, offscreenG1Of, offscreenJraRunners, type OffscreenRace } from './offscreen';
import { ageOf, aptitudeFit, currentStats, rating, simHorse } from './horses';
import { BALANCE, PREP_ROUTES } from '../balance';
import { syutoku } from './prize';
import type { RunRecord, Tier, World, WorldHorse } from './types';

/** 観戦できるレース（10R・11R。12Rはダービーデーの目黒記念だけ） */
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
  /** 画面に出ない国内の G1（中京・交流 G1）の出走馬 */
  offscreen: { race: OffscreenRace; horseIds: number[] }[];
  /** その週の日本の現役トップの水準（3歳以上の上位5頭目の総合力。海外・交流 G1 の相手の強さの基準） */
  top: number;
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
  // 出走間隔・疲労・距離は balance.ts
  /**
   * 1年に走る数の上限（G1 馬・オープン馬・それ以外）。G1 馬は7走（ユーザーの指示。6走では秋の G1 に届く前に使い切り、
   * 有馬記念に G1 馬がほとんど出なかった）
   */
  yearCap: { g1Winner: 7, open: 7, other: 9 },
  /** 年間の上限に G1 の出走を数えるか（false なら G1 以外だけを数える） */
  capCountsG1: true,
  /** 出走を決めるときの距離・馬場の適性の下限（これより合わない馬は出さない） */
  minFit: -3.5,
  /** 頭数が足りないときに緩める下限 */
  looseFit: -6,
  /** G1 の頭数が足りないとき、補充するのはこの頭数まで（少頭数の G1 もある） */
  g1FillTo: 12,
  /** 出走表が成り立つ最少頭数 */
  minRunners: 5,
  /** G1 を目標にする馬は、G1 の何週前までなら前哨戦に出るか（これより近いと出ない。セントウルS・根岸S・アルゼンチン共和国杯は3週前） */
  prepBefore: 3,
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

/** その時点の総合力と、年齢ごとのトップの総合力 */
export interface Ratings {
  score: Map<number, number>;
  topByAge: Map<number, number>;
}

export function ratingsOf(horses: readonly WorldHorse[], year: number, progress: number): Ratings {
  const score = new Map<number, number>();
  const topByAge = new Map<number, number>();
  for (const h of horses) {
    const r = rating(currentStats(h, year, progress));
    score.set(h.id, r);
    const age = ageOf(h, year);
    topByAge.set(age, Math.max(topByAge.get(age) ?? 0, r));
  }
  return { score, topByAge };
}

/**
 * 2・3歳の牝馬は、牝馬限定でない2・3歳のレース（牡馬クラシック・ラジオNIKKEI賞など）にはほとんど出ない。
 * 同世代のトップと互角の、ずば抜けた牝馬だけが挑む。週の出走表と夏の重賞（画面外）で共通に使う
 */
export function fillyAvoidsColts(
  h: WorldHorse,
  race: { age: AgeCondition; fillies: boolean },
  year: number,
  ratings: Ratings,
): boolean {
  if (h.sex !== 'filly' || race.fillies || (race.age !== '2' && race.age !== '3')) return false;
  const r = ratings.score.get(h.id) ?? 0;
  return r < (ratings.topByAge.get(ageOf(h, year)) ?? 0) - ENTRY.fillyVsColts;
}

/** 重賞の実績（重賞勝ちか、近4走の重賞3着以内）があるか */
export function hasGradedCredit(h: WorldHorse): boolean {
  return h.graded.length > 0 || h.runs.slice(-4).some((r) => r.grade && r.rank <= 3);
}

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

function available(h: WorldHorse, serial: number, minRest: number, fatigueSlack = 0): boolean {
  if (h.retired) return false;
  if (!rested(h, fatigueSlack)) return false;
  if (h.restUntil !== null && serial < h.restUntil) return false;
  return weeksRested(h, serial) >= minRest;
}

/**
 * 前走からあける週の数。G1 を走ったあとは長めに休む。
 * G1 から G1 へは、2400m 以上の1週延長をしない（ジャパンC → 有馬記念、天皇賞・秋 → ジャパンC が組めるように）
 */
export function restNeeded(h: WorldHorse, toG1 = false): number {
  const R = BALANCE.rotation;
  const last = h.runs[h.runs.length - 1];
  if (!last) return 0;
  const min = last.grade === 'G1' ? R.minAfterG1 : last.grade ? R.minAfterGraded : R.minAfterCondition;
  if (toG1 && last.grade === 'G1') return min;
  return min + (last.distance >= R.longRaceDistance ? R.longRaceExtra : 0);
}

/** 希望の間隔の下限（週）。これより短い間隔で使うときは選ばれにくくする */
export function desiredRest(h: WorldHorse): number {
  const R = BALANCE.rotation;
  const last = h.runs[h.runs.length - 1];
  if (!last) return 0;
  const [lo] = last.grade === 'G1' ? R.desiredAfterG1 : last.grade ? R.desiredAfterGraded : R.desiredAfterCondition;
  return lo + (last.distance >= R.longRaceDistance ? R.longRaceExtra : 0);
}

/** 疲労が抜けているか */
function rested(h: WorldHorse, extra = 0): boolean {
  return (h.fatigue ?? 0) <= BALANCE.fatigue.maxToRace + extra;
}

/** G1 の距離：クラシック・2歳 G1 は挑戦する（適性の下限は別に見る）、古馬 G1 は得意距離の ±22% まで */
function g1DistanceOk(h: WorldHorse, g: Pick<ProgramRace, 'age' | 'distance'>): boolean {
  if (g.age === '2' || g.age === '3') return true;
  return Math.abs(Math.log(g.distance / h.bestDistance)) <= BALANCE.distance.olderG1MaxRatio;
}

/** 得意距離 ±400m 以内か（それ以外は低い確率でだけ出る。馬・週・レースで決まる） */
function distanceOk(h: WorldHorse, distance: number, serial: number, no: number): boolean {
  if (Math.abs(distance - h.bestDistance) <= BALANCE.distance.maxDiff) return true;
  return hashSeed(h.id * 7919 + serial * 131 + no) % 1000 < BALANCE.distance.exceptionChance * 1000;
}

/** その年にあと何走できるか（使い詰めにしない） */
function underYearCap(h: WorldHorse, year: number): boolean {
  const n = h.runs.filter((r) => r.year === year && (ENTRY.capCountsG1 || r.grade !== 'G1')).length;
  const cap = h.graded.some((g) => g.grade === 'G1') ? ENTRY.yearCap.g1Winner : h.tier === 'open' ? ENTRY.yearCap.open : ENTRY.yearCap.other;
  return n < cap;
}

/**
 * その週の、G1 を目標にする馬の見立て（週の出走表と夏の重賞で共通に使う）。
 * 能力・年齢・収得賞金はこの週の値で比べる
 */
export function planG1(world: World, serial: number) {
  const { year, week } = weekOf(serial);
  const progress = seasonProgress(week.index, WEEKS_PER_YEAR);
  const active = world.horses.filter((h) => !h.retired && ageOf(h, year) >= 2);
  const ratings = ratingsOf(active, year, progress);

  // G1 を目標にする馬：同じ年齢の上位にいて、数週以内に向いた G1 がある
  const g1Ahead = upcomingG1(serial, ENTRY.g1Horizon);
  const fillyStaysHome = (h: WorldHorse, race: Pick<ProgramRace, 'age' | 'fillies'>) => fillyAvoidsColts(h, race, year, ratings);
  /** G1 に出たい馬の条件（年齢・性別・距離・勝ち鞍） */
  const wantsG1 = (h: WorldHorse, g: ProgramRace) =>
    ageOk(g, ageOf(h, year)) &&
    (!g.fillies || h.sex === 'filly') &&
    !fillyStaysHome(h, g) &&
    (g.age === '2' ? h.starts > 0 : h.wins > 0) &&
    aptitudeFit(h, g.surface, g.distance) > -2.5 &&
    g1DistanceOk(h, g);
  /** これからの G1 それぞれの、賞金で出走できる目安（出走頭数番目の賞金） */
  // 収得賞金（勝ち鞍を重く見る）はこの週の間変わらないので先に計算しておく
  const money = new Map<number, number>();
  for (const h of active) money.set(h.id, syutoku(h));
  const cutoff = new Map<string, number>();
  for (const { race: g } of g1Ahead) {
    if (cutoff.has(g.name)) continue;
    const earnings = active
      .filter((h) => wantsG1(h, g) && !hasPriority(h, g.name, year))
      .map((h) => money.get(h.id)!)
      .sort((a, b) => b - a);
    cutoff.set(g.name, earnings[Math.min(earnings.length - 1, g.runners - 1)] ?? 0);
  }
  /**
   * 目標の G1 が何週先か（目標がなければ null）。賞金が足りている馬（出走頭数番目の馬より多い）と、
   * 優先出走権を取った馬だけが G1 を目標にする
   * （賞金が足りない馬は前哨戦で賞金や権利を取りにいく）
   */
  const targetCache = new Map<number, { weeks: number; name: string } | null>();
  const g1Target = (h: WorldHorse): { weeks: number; name: string } | null => {
    if (targetCache.has(h.id)) return targetCache.get(h.id)!;
    const hit = g1Ahead.find(
      ({ race: g }) =>
        wantsG1(h, g) && (hasPriority(h, g.name, year) || money.get(h.id)! > (cutoff.get(g.name) ?? Infinity)),
    );
    const target = hit ? { weeks: hit.weeks, name: hit.race.name } : null;
    targetCache.set(h.id, target);
    return target;
  };
  /**
   * G1 を目標にする馬は、近すぎる前哨戦には出ない。前哨戦は休み明けの1戦だけ（叩き台）で、
   * 目標の G1 の代表的な前哨戦ルート（PREP_ROUTES）にあるレースに限る。
   * そのため G1 馬は「休み明けの1戦 → G1」か「G1 へ直行」になる
   */
  const skipsForG1 = (h: WorldHorse, race: ProgramRace) => {
    const t = g1Target(h);
    if (t === null) return false;
    // 休み明けかどうかは実際の日付で数える（夏休みは開催週では1週しかない）
    const gap = realWeeksSince(h, year, week.days[0].month, week.days[0].day) ?? 99;
    if (t.weeks < ENTRY.prepBefore || gap < ENTRY.prepAfterRest) return true;
    const route = PREP_ROUTES[t.name];
    return !!route && !route.includes(race.name);
  };
  /** 希望の間隔より短いときの選ばれにくさ */
  const shortRest = (h: WorldHorse) => BALANCE.rotation.shortPenalty * Math.max(0, desiredRest(h) - weeksRested(h, serial));
  return { active, ratings, money, g1Target, skipsForG1, fillyStaysHome, shortRest, wantsG1 };
}

/** その週の出走表（番組と出走馬）。同じ週に1頭が出るのは1レースまで */
export function weekCard(world: World): WeekCard {
  const serial = world.serial;
  const { year, week } = weekOf(serial);
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

  // 能力・年齢・G1 の目標はこの週の値で決める
  const plan = planG1(world, serial);
  const { active, ratings, money, g1Target, skipsForG1, fillyStaysHome, shortRest } = plan;
  const score = ratings.score;
  /**
   * G1 馬と G1 を目標にする馬（一流馬）は、オープン特別には出ず、G1 以外の重賞は春（1〜6月）・秋（9〜12月）にそれぞれ1つまで
   * （前哨戦を1つ使って G1 へ。G1 中心のローテーションにする）
   */
  const month = week.days[0].month;
  const eliteSkips = (h: WorldHorse, race: ProgramRace) => {
    if (!h.graded.some((g) => g.grade === 'G1') && g1Target(h) === null) return false;
    if (race.raceClass === 'open') return true;
    const spring = month <= 6;
    return h.runs.some(
      (r) => r.year === year && !r.abroad && (r.grade === 'G2' || r.grade === 'G3') && (spring ? r.month <= 6 : r.month >= 9),
    );
  };

  const used = new Set<number>();

  // 画面に出ない G1（中京・交流 G1）：収得賞金順に出走馬を決める
  const offscreen = offscreenG1Of(week.index).map((race) => {
    const horseIds = active
      .filter((h) => !used.has(h.id) && offscreenEligible(h, race, year) && available(h, serial, restNeeded(h, true)) && underYearCap(h, year))
      .sort((a, b) => money.get(b.id)! - money.get(a.id)!)
      .slice(0, offscreenJraRunners(race))
      .map((h) => h.id);
    for (const id of horseIds) used.add(id);
    return { race, horseIds };
  });

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
        (p.raceClass === 'G1' || !eliteSkips(h, p)) &&
        (p.age === '2' ? h.starts > 0 : h.wins > 0) &&
        (loose || h.tier === 'open' || h.tier === '3win' || p.age === '2' || p.age === '3') &&
        // 古馬の G1 の補充はオープン馬だけ（ユーザー指定。足りなければ少頭数で行う）
        (!loose || p.raceClass !== 'G1' || p.age === '2' || p.age === '3' || h.tier === 'open') &&
        fit >= (loose ? ENTRY.looseFit : -2.5) &&
        (loose || (p.raceClass === 'G1' ? g1DistanceOk(h, p) : distanceOk(h, p.distance, serial, p.no))) &&
        (loose || !fillyStaysHome(h, p)) &&
        (p.raceClass === 'G1' || !skipsForG1(h, p)) &&
        // 古馬の G1 は重賞の実績（勝ち鞍か近走の3着以内）がある馬（頭数が足りなければ補充で入る）
        (loose || p.raceClass !== 'G1' || p.age === '2' || p.age === '3' || hasGradedCredit(h));
      const collect = (loose: boolean) =>
        active
          .map((h) => ({ h, fit: aptitudeFit(h, p.surface, p.distance) }))
          .filter(({ h, fit }) => eligible(h, fit, loose))
          .map(({ h, fit }) => ({
            h,
            // G1 は優先出走権のある馬が先、あとは収得賞金順（ユーザー指定）。G2・G3 は収得賞金を重く、能力（陣営の見立て）も少し
            s:
              p.raceClass === 'G1'
                ? (hasPriority(h, p.name, year) ? 1e6 : 0) + money.get(h.id)! + pickRng.range(0, 1)
                : 3 * Math.log10(1 + money.get(h.id)!) +
                  0.4 * score.get(h.id)! +
                  0.8 * fit +
                  pickRng.normal(0, 1.5) -
                  shortRest(h) -
                  (h.sex === 'filly' && !p.fillies ? ENTRY.fillyOlderPenalty : 0),
          }));
      pool = collect(false);
      // 頭数が足りないときの補充。G1 は少頭数でも行い（G1_FILL 頭まで）、距離の合う馬から選ぶ
      const fillTo = p.raceClass === 'G1' ? Math.min(p.runners, ENTRY.g1FillTo) : p.runners;
      if (pool.length < fillTo) {
        const have = new Set(pool.map((x) => x.h.id));
        const extra = collect(true)
          .filter((x) => !have.has(x.h.id))
          .map((x) => ({
            ...x,
            // G1 の補充は勝ち上がった馬（収得賞金のある馬）が先、その中では距離の合う馬から
            s:
              p.raceClass === 'G1'
                ? -1e7 + (x.h.wins > 0 ? 1000 : 0) + 2 * aptitudeFit(x.h, p.surface, p.distance) + Math.log10(1 + money.get(x.h.id)!)
                : x.s - 100,
          }))
          .sort((a, b) => b.s - a.s)
          .slice(0, fillTo - pool.length);
        pool.push(...extra);
      }
    } else {
      const tier = TIER_OF_CLASS[p.raceClass];
      const fits = (h: WorldHorse, fit: number, loose: boolean) => {
        // 頭数が足りないときは年間の上限を超えてよく、疲労も少しだけ大目に見る
        if (
          !base(h) ||
          !available(h, serial, restNeeded(h), loose ? 0.15 : 0) ||
          (!loose && !underYearCap(h, year)) ||
          fit < (loose ? ENTRY.looseFit : ENTRY.minFit) ||
          (!loose && !distanceOk(h, p.distance, serial, p.no))
        ) {
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
            s: fit + 0.1 * Math.min(weeksRested(h, serial), 8) - shortRest(h) + pickRng.normal(0, 1.5) - (loose ? 100 : 0),
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
  return { serial, year, week, conditions, races, abroad, offscreen, top };
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
    // 画面に出ない G1（中京・交流 G1）も目標になる（名簿の馬が出られる頭数で賞金の目安を見る）
    for (const o of offscreenG1Of(week.index)) {
      const { name, surface, distance, age, fillies } = o;
      out.push({ race: { no: 11, raceClass: 'G1', name, surface, distance, age, fillies, runners: offscreenJraRunners(o) }, weeks: k });
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

const dayNumber = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / 86_400_000;

/** 前走から何週（実際の日付）。初出走は null */
export function realWeeksSince(h: WorldHorse, year: number, month: number, day: number): number | null {
  const last = h.runs[h.runs.length - 1];
  if (!last) return null;
  return (dayNumber(year, month, day) - dayNumber(last.year, last.month, last.day)) / 7;
}

/**
 * 当日の調子（プレイヤー・市場には見えない）。ふだんの小さなぶれに、疲労の残りと休み明けの補正を足す。
 * 休み明け（実際の日付で10週以上）はランダムに上下し、鉄砲駆けは上向き、叩き良化は割り引き（2走目で上向く）
 */
function dayForm(h: WorldHorse, year: number, month: number, day: number, rng: Rng): number {
  const L = BALANCE.layoff;
  let form = 1 + rng.normal(0, 0.003) - BALANCE.fatigue.formPenalty * (h.fatigue ?? 0);
  const gap = realWeeksSince(h, year, month, day);
  const type = h.layoffType ?? 'normal';
  if (gap !== null && gap >= L.weeks) {
    form += rng.normal(0, L.spread);
    if (type === 'fresh') form += L.freshBonus;
    if (type === 'needsRun') form -= L.needsRunPenalty;
  } else if (type === 'needsRun' && h.runs.length >= 2) {
    // 叩き2走目：前走が休み明けだった
    const [prev, last] = h.runs.slice(-2);
    if ((dayNumber(last.year, last.month, last.day) - dayNumber(prev.year, prev.month, prev.day)) / 7 >= L.weeks) form += L.secondRunBonus;
  }
  return form;
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
        fatigue: h.fatigue ?? 0,
        g1Wins: h.graded.filter((g) => g.grade === 'G1').length,
        gradedWins: h.graded.length,
        wins: h.wins,
        starts: h.starts,
        earnings: h.earnings,
      },
      form: dayForm(h, card.year, day.month, day.day, rng),
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
