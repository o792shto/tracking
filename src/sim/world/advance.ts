import { simulateRace } from '../engine';
import { GRADED_RACES_2026, type Grade } from '../gradedRaces';
import type { ProgramRace } from '../program';
import { Rng, hashSeed } from '../rng';
import type { FinishRecord } from '../types';
import { FIRST_YEAR, WEEKS_PER_YEAR, weekOf } from './calendar';
import { WORLD, ageOf, currentStats, newHorse, rating } from './horses';
import { ABROAD, abroadPower, overseasRank } from './overseas';
import { quickFinish } from './quick';
import { raceSetup, seasonProgress, weekCard, type CardRace, type WeekCard } from './schedule';
import { RUNS_KEPT, type Award, type NewsItem, type Tier, type World, type WorldHorse } from './types';

/** 条件戦・オープンの1着の賞金（万円） */
export const PRIZE: Record<'open' | '3win' | '2win' | '1win' | 'maiden' | 'newcomer', number> = {
  open: 2400,
  '3win': 1800,
  '2win': 1500,
  '1win': 1000,
  maiden: 550,
  newcomer: 700,
};
/** 2着以下は1着賞金に対する割合（2着40%・3着25%・4着15%・5着10%） */
export const PRIZE_SHARE = [1, 0.4, 0.25, 0.15, 0.1];
/** G1 で賞金を個別に決めるレース（万円） */
const G1_PRIZE: Record<string, number> = {
  ジャパンC: 50000,
  有馬記念: 50000,
  日本ダービー: 30000,
  '天皇賞・春': 30000,
  '天皇賞・秋': 30000,
  宝塚記念: 30000,
  大阪杯: 30000,
  皐月賞: 20000,
  菊花賞: 20000,
};

/**
 * 1着の賞金（万円。ユーザー指定）。
 * G3 4000万。G2 は2歳戦4000万・3歳戦5500万・古馬戦7000万。
 * G1 はジャパンC・有馬記念5億、ダービー・天皇賞・宝塚記念・大阪杯3億、皐月賞・菊花賞2億、
 * 2歳戦8000万、牝馬限定1億5000万、それ以外（マイル・短距離など）1億8000万
 */
export function firstPrize(p: Pick<ProgramRace, 'raceClass' | 'name' | 'age' | 'fillies'>): number {
  switch (p.raceClass) {
    case 'G1':
      if (G1_PRIZE[p.name]) return G1_PRIZE[p.name];
      if (p.age === '2') return 8000;
      if (p.fillies) return 15000;
      return 18000;
    case 'G2':
      return p.age === '2' ? 4000 : p.age === '3' ? 5500 : 7000;
    case 'G3':
      return 4000;
    default:
      return PRIZE[p.raceClass];
  }
}

/** 世界の出来事の起こりやすさ */
export const EVENTS = {
  /** 1走あたりの故障の確率 */
  injury: 0.012,
  /** 故障のうち引退になる割合 */
  injuryRetire: 0.15,
  /** 休養の長さ（週） */
  injuryRest: [6, 24] as [number, number],
  /** 夏の上がり馬の数 */
  summerHorses: [3, 5] as [number, number],
  /** 夏の上がり馬の上乗せ（点） */
  summerBoost: [3, 6] as [number, number],
  /** 引退する年齢（その年の終わりに） */
  retireAge: 7,
  /** ニュースを残す数 */
  newsKept: 200,
  /** ゲーム開始の何年前から世界を動かしておくか */
  warmupYears: 6,
};

const NEXT_TIER: Record<Tier, Tier> = { maiden: '1win', '1win': '2win', '2win': '3win', '3win': 'open', open: 'open' };

export interface AdvanceOptions {
  /**
   * 観戦レース（10〜12R）をシミュレーションで走らせるか。省略時は true（ゲーム開始前の準備は false で速くする）
   */
  full?: boolean;
  /** 観戦レースの単勝人気（キーは raceKey、値は馬番順の人気） */
  popularity?: Record<string, number[]>;
}

/** レースを区別するキー（週・日・レース番号） */
export function raceKey(serial: number, race: Pick<CardRace, 'dayIndex' | 'no'>): string {
  return `${serial}-${race.dayIndex}-${race.no}`;
}

/** 出走表のレースの結果（観戦レースはシミュレーション、それ以外は簡易な結果） */
export function raceFinish(world: World, card: WeekCard, race: CardRace, full = true): FinishRecord[] {
  const setup = raceSetup(world, card, race);
  if (race.visible && full) return simulateRace(setup, { record: false }).finish;
  return quickFinish(setup, new Rng(race.seed).fork(21));
}

/** 1週間を走らせて結果を名簿に反映し、次の週へ進める（world を書き換える） */
export function advanceWeek(world: World, options: AdvanceOptions = {}): World {
  const card = weekCard(world);
  const { year, week } = card;
  const byId = new Map(world.horses.map((h) => [h.id, h]));
  const rng = new Rng(hashSeed(world.seed + world.serial * 7919));
  for (const race of card.races) {
    if (race.horseIds.length === 0) continue;
    const finish = raceFinish(world, card, race, options.full ?? true);
    const day = week.days[race.dayIndex];
    const p = race.program;
    const popularity = options.popularity?.[raceKey(world.serial, race)];
    const winnerTime = finish[0].time;
    const raceName = race.grade ? p.name : `${p.age === '2' ? '2歳' : p.age === '3' ? '3歳' : ''}${p.name}`;
    for (const f of finish) {
      const h = byId.get(race.horseIds[f.number - 1])!;
      const prize = Math.round(firstPrize(p) * (PRIZE_SHARE[f.rank - 1] ?? 0));
      h.starts++;
      if (f.rank === 1) {
        h.wins++;
        h.tier = race.grade || p.raceClass === 'open' ? 'open' : NEXT_TIER[h.tier];
        if (race.grade) h.graded.push({ year, name: p.name, grade: race.grade });
      } else if (f.rank === 2) h.seconds++;
      else if (f.rank === 3) h.thirds++;
      h.earnings += prize;
      h.earningsByYear[year] = (h.earningsByYear[year] ?? 0) + prize;
      h.runs.push({
        year,
        week: week.index,
        month: day.month,
        day: day.day,
        venue: day.venue,
        race: raceName,
        grade: race.grade,
        raceClass: p.raceClass,
        surface: p.surface,
        distance: p.distance,
        runners: finish.length,
        rank: f.rank,
        time: Math.round(f.time * 10) / 10,
        margin: f.rank === 1 ? (finish[1]?.marginLabel ?? '') : f.marginLabel,
        ...(popularity ? { popularity: popularity[f.number - 1] } : {}),
      });
      if (h.runs.length > RUNS_KEPT) h.runs.splice(0, h.runs.length - RUNS_KEPT);
      h.lastWeek = world.serial;
      // 故障
      if (rng.chance(EVENTS.injury)) injure(world, h, rng);
    }
    if (race.grade) {
      world.graded.push({
        year,
        week: week.index,
        name: p.name,
        grade: race.grade,
        venue: day.venue,
        top3: finish.slice(0, 3).map((f) => {
          const h = byId.get(race.horseIds[f.number - 1])!;
          return { id: h.id, name: h.name };
        }),
        time: Math.round(winnerTime * 10) / 10,
      });
    }
  }
  runAbroad(world, card, byId, rng.fork(5));
  world.serial++;
  enterWeek(world);
  return world;
}

/** 海外のレースの結果を名簿とニュースに残す */
function runAbroad(world: World, card: WeekCard, byId: Map<number, WorldHorse>, rng: Rng) {
  const { year, week } = card;
  const progress = seasonProgress(week.index, WEEKS_PER_YEAR);
  for (const { race, horseIds, top } of card.abroad) {
    for (const id of horseIds) {
      const h = byId.get(id)!;
      const rank = overseasRank(race, abroadPower(h, rating(currentStats(h, year, progress)), race), top, rng);
      const prize = Math.round(race.prize * (PRIZE_SHARE[rank - 1] ?? 0));
      h.starts++;
      if (rank === 1) {
        h.wins++;
        h.graded.push({ year, name: race.name, grade: 'G1' });
      } else if (rank === 2) h.seconds++;
      else if (rank === 3) h.thirds++;
      h.earnings += prize;
      h.earningsByYear[year] = (h.earningsByYear[year] ?? 0) + prize;
      h.runs.push({
        year,
        week: week.index,
        month: race.month,
        day: race.day,
        venue: race.place,
        abroad: true,
        race: race.name,
        grade: 'G1',
        raceClass: 'G1',
        surface: race.surface,
        distance: race.distance,
        runners: ABROAD.rivals + horseIds.length,
        rank,
        time: 0,
        margin: '',
      });
      if (h.runs.length > RUNS_KEPT) h.runs.splice(0, h.runs.length - RUNS_KEPT);
      h.lastWeek = world.serial;
      const title =
        rank === 1 ? `${h.name}が${race.name}制覇！` : `${race.name}に${h.name}が挑戦し${rank}着`;
      const body =
        rank === 1
          ? `${race.place}の${race.name}（${race.surface === 'turf' ? '芝' : 'ダート'}${race.distance}m）で、${h.name}が世界の強豪を破って優勝しました。`
          : rank <= 3
            ? `${race.place}の${race.name}に挑んだ${h.name}は${rank}着。勝利には届きませんでしたが、世界の舞台で見せ場を作りました。`
            : `${race.place}の${race.name}に挑んだ${h.name}は${rank}着に終わりました。`;
      news(world, 'abroad', title, body, [h.id]);
      if (rng.chance(EVENTS.injury)) injure(world, h, rng);
    }
  }
}

function injure(world: World, h: WorldHorse, rng: Rng) {
  const notable = h.tier === 'open' || h.graded.length > 0;
  if (rng.chance(EVENTS.injuryRetire)) {
    retire(world, h, 'injury');
    if (notable) news(world, 'injury', `${h.name}が故障で引退`, `${h.name}が故障のため現役を引退することになりました。`, [h.id]);
    return;
  }
  const weeks = rng.int(...EVENTS.injuryRest);
  h.restUntil = world.serial + 1 + weeks;
  if (notable) {
    const months = Math.max(1, Math.round(weeks / 4));
    news(world, 'injury', `${h.name}が故障で休養`, `${h.name}に故障が見つかり、およそ${months}か月の休養に入ります。`, [h.id]);
  }
}

function retire(world: World, h: WorldHorse, reason: NonNullable<WorldHorse['retired']>['reason']) {
  h.retired = { serial: world.serial, reason };
}

function news(world: World, kind: NewsItem['kind'], title: string, body: string, horseIds: number[]) {
  world.news.push({ serial: world.serial, kind, title, body, horseIds });
  if (world.news.length > EVENTS.newsKept) world.news.splice(0, world.news.length - EVENTS.newsKept);
}

/** 週の初めの出来事：年の変わり目（表彰・引退）、夏明け（未勝利馬の引退・上がり馬）、2歳のデビュー */
export function enterWeek(world: World) {
  const { year, week } = weekOf(world.serial);
  const rng = new Rng(hashSeed(world.seed ^ Math.imul(world.serial + 77, 0x2545f491)));
  if (week.index === 0) yearEnd(world, year - 1, rng.fork(1));
  if (week.afterSummer) afterSummer(world, year, rng.fork(2));
  if (week.debut) addCohort(world, year, rng.fork(3));
}

/** 新しい2歳を名簿に入れる */
function addCohort(world: World, year: number, rng: Rng) {
  const taken = new Set(world.horses.map((h) => h.name));
  for (let i = 0; i < WORLD.cohortSize; i++) {
    world.horses.push(newHorse(rng, world.nextId++, year - 2, i % 2 === 0 ? 'colt' : 'filly', taken));
  }
  news(world, 'debut', '2歳馬がデビュー', `今年も${WORLD.cohortSize}頭の2歳馬が登録されました。新馬戦が始まります。`, []);
}

function afterSummer(world: World, year: number, rng: Rng) {
  const active = world.horses.filter((h) => !h.retired);
  // 3歳の未勝利戦は夏で終わる
  for (const h of active) if (ageOf(h, year) === 3 && h.wins === 0) retire(world, h, 'maiden');
  // 夏に力をつけた馬（3〜4歳の条件馬、晩成ほど選ばれやすい）
  const candidates = active.filter(
    (h) => !h.retired && (ageOf(h, year) === 3 || ageOf(h, year) === 4) && h.tier !== 'maiden' && h.tier !== 'open',
  );
  const count = rng.int(...EVENTS.summerHorses);
  const picked: WorldHorse[] = [];
  for (let k = 0; k < count && candidates.length > 0; k++) {
    const i = rng.weighted(candidates.map((h, idx) => [idx, Math.exp(h.growth * 1.5)] as const));
    picked.push(candidates.splice(i, 1)[0]);
  }
  for (const h of picked) {
    const boost = rng.int(...EVENTS.summerBoost);
    h.boost += boost;
    const look = boost >= 5 ? 'ひと夏で馬体が見違えるほど成長' : '夏の休養で馬体がひと回り大きくなった';
    news(world, 'summer', `夏の上がり馬：${h.name}`, `${h.name}（${ageOf(h, year)}歳・${tierLabel(h.tier)}）は${look}。秋の飛躍が期待されます。`, [h.id]);
  }
}

/** 賞金（万円）の表示（例：「12億3,300万円」「5,285万円」） */
export function formatPrize(man: number): string {
  const n = Math.round(man);
  const oku = Math.floor(n / 10000);
  const rest = n % 10000;
  const restText = rest > 0 ? `${rest.toLocaleString('ja-JP')}万` : '';
  return oku > 0 ? `${oku}億${restText}円` : `${restText || '0万'}円`;
}

const TIER_LABEL: Record<Tier, string> = { maiden: '未勝利', '1win': '1勝クラス', '2win': '2勝クラス', '3win': '3勝クラス', open: 'オープン' };
export const tierLabel = (t: Tier) => TIER_LABEL[t];

/** 年の終わり：表彰と引退 */
function yearEnd(world: World, year: number, rng: Rng) {
  if (year >= FIRST_YEAR - 1) awards(world, year);
  for (const h of world.horses) {
    if (h.retired) continue;
    const age = ageOf(h, year);
    const g1 = h.graded.filter((g) => g.grade === 'G1').length;
    if (age >= EVENTS.retireAge) {
      retire(world, h, 'age');
    } else if (g1 > 0 && age >= 4 && rng.chance(h.sex === 'colt' ? (age >= 5 ? 0.8 : 0.5) : age >= 5 ? 0.6 : 0.2)) {
      retire(world, h, 'stud');
      news(world, 'retire', `${h.name}が引退`, `G1 ${g1}勝の${h.name}が引退し、${h.sex === 'colt' ? '種牡馬' : '繁殖牝馬'}になります。`, [h.id]);
    } else if (age >= 4 && h.tier !== 'open' && recentPoor(h) && rng.chance(age >= 5 ? 0.6 : 0.3)) {
      retire(world, h, 'results');
    }
  }
  // 引退して重賞を勝っていない馬は名簿から外す（保存を小さくする）
  world.horses = world.horses.filter((h) => !h.retired || h.graded.length > 0);
}

/** 直近5走で3着以内がない */
function recentPoor(h: WorldHorse): boolean {
  const last = h.runs.slice(-5);
  return last.length >= 3 && last.every((r) => r.rank > 3);
}

const GRADE_POINTS: Record<Grade, number> = { G1: 100, G2: 30, G3: 12 };

function awards(world: World, year: number) {
  const raceInfo = new Map(GRADED_RACES_2026.map((g) => [g.name, g]));
  const rows = world.horses
    .map((h) => {
      const wins = h.graded.filter((g) => g.year === year);
      const points = wins.reduce((a, g) => a + GRADE_POINTS[g.grade], 0) + (h.earningsByYear[year] ?? 0) / 500;
      return { h, wins, points, age: ageOf(h, year) };
    })
    .filter((r) => r.points > 0);
  const best = (title: string, filter: (r: (typeof rows)[number]) => boolean) => {
    const pool = rows.filter(filter).sort((a, b) => b.points - a.points);
    const top = pool[0];
    if (!top) return;
    const g1 = top.wins.filter((g) => g.grade === 'G1').map((g) => g.name);
    const reason = g1.length > 0 ? `G1 ${g1.length}勝（${g1.join('・')}）` : top.wins.length > 0 ? `重賞${top.wins.length}勝` : '';
    const earnings = `獲得賞金 ${formatPrize(top.h.earningsByYear[year] ?? 0)}`;
    const award: Award = { year, title, horseId: top.h.id, name: top.h.name, reason: [reason, earnings].filter(Boolean).join('、') };
    world.awards.push(award);
    return award;
  };
  const dirtWins = (r: (typeof rows)[number]) => r.wins.some((g) => raceInfo.get(g.name)?.surface === 'dirt');
  const sprintWins = (r: (typeof rows)[number]) =>
    r.wins.some((g) => (raceInfo.get(g.name)?.distance ?? 9999) <= 1400 && raceInfo.get(g.name)?.surface === 'turf');
  const top = best('年度代表馬', () => true);
  best('最優秀2歳牡馬', (r) => r.age === 2 && r.h.sex === 'colt');
  best('最優秀2歳牝馬', (r) => r.age === 2 && r.h.sex === 'filly');
  best('最優秀3歳牡馬', (r) => r.age === 3 && r.h.sex === 'colt');
  best('最優秀3歳牝馬', (r) => r.age === 3 && r.h.sex === 'filly');
  best('最優秀4歳以上牡馬', (r) => r.age >= 4 && r.h.sex === 'colt');
  best('最優秀4歳以上牝馬', (r) => r.age >= 4 && r.h.sex === 'filly');
  best('最優秀短距離馬', sprintWins);
  best('最優秀ダートホース', dirtWins);
  if (top && year >= FIRST_YEAR) {
    news(world, 'award', `${year}年の年度代表馬は${top.name}`, `${year}年の年度代表馬に${top.name}が選ばれました。${top.reason}。`, [top.horseId]);
  }
}

/** 新しい世界を作る。ゲーム開始の数年前から簡易な結果で動かして、各世代の馬と成績をそろえる */
export function createWorld(seed: number): World {
  const world: World = {
    version: 1,
    seed,
    serial: -EVENTS.warmupYears * WEEKS_PER_YEAR,
    horses: [],
    nextId: 1,
    news: [],
    graded: [],
    awards: [],
  };
  enterWeek(world);
  while (world.serial < 0) advanceWeek(world, { full: false });
  // 準備期間のニュースと、前の年より古い重賞の結果は残さない
  world.news = world.news.filter((n) => n.serial >= 0);
  world.graded = world.graded.filter((g) => g.year >= FIRST_YEAR - 1);
  return world;
}
