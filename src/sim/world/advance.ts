import { simulateRace } from '../engine';
import { GRADED_RACES_2026, type Grade } from '../gradedRaces';
import { Rng, hashSeed } from '../rng';
import type { FinishRecord } from '../types';
import { FIRST_YEAR, WEEKS_PER_YEAR, weekOf } from './calendar';
import { WORLD, ageOf, currentStats, newHorse, rating } from './horses';
import { ABROAD, abroadPower, overseasRanks } from './overseas';
import { OFFSCREEN, SUMMER_RACES, offscreenEligible, offscreenRanks, type OffscreenRace } from './offscreen';
import { syutoku } from './prize';
import { BALANCE } from '../balance';
import { quickFinish } from './quick';
import { fillyAvoidsColts, raceSetup, ratingsOf, seasonProgress, weekCard, type CardRace, type WeekCard } from './schedule';
import { RUNS_KEPT, type Award, type NewsItem, type Tier, type World, type WorldHorse } from './types';

export { PRIZE, PRIZE_SHARE, firstPrize } from './prize';
import { PRIZE_SHARE, firstPrize } from './prize';

/** 世界の出来事の起こりやすさ */
export const EVENTS = {
  /** 1走あたりの故障の確率 */
  injury: 0.012,
  /** 故障のうち引退になる割合 */
  injuryRetire: 0.15,
  /** 休養の長さ（週） */
  injuryRest: [6, 24] as [number, number],
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
   * 観戦レース（10R・11R、ダービーデーの12R）をシミュレーションで走らせるか。省略時は true（ゲーム開始前の準備は false で速くする）
   */
  full?: boolean;
  /** 観戦レースの単勝人気（キーは raceKey、値は馬番順の人気） */
  popularity?: Record<string, number[]>;
  /** すでに走らせたレースの着順（キーは raceKey）。あればそれを使う（計測ツールで二重に走らせないため） */
  finishes?: Record<string, FinishRecord[]>;
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
    const finish = options.finishes?.[raceKey(world.serial, race)] ?? raceFinish(world, card, race, options.full ?? true);
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
      addFatigue(h, race.grade ?? (p.raceClass === 'open' ? 'open' : 'condition'), p.distance, f.rank);
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
  // 中京の G1（画面に出ない）
  for (const { race, horseIds } of card.offscreen) {
    if (horseIds.length < 5) continue;
    const horses = horseIds.map((id) => byId.get(id)!);
    const ranks = offscreenRanks(race, horses, year, seasonProgress(week.index, WEEKS_PER_YEAR), rng.fork(9));
    const top3 = recordOffscreen(world, race, horses, ranks, year, week.index, world.serial);
    news(
      world,
      'offscreen',
      `${race.name}は${top3[0].name}が優勝`,
      `${race.venue}の${race.name}（G1・${race.surface === 'turf' ? '芝' : 'ダート'}${race.distance}m）は${top3[0].name}が勝ちました。2着${top3[1]?.name ?? '—'}、3着${top3[2]?.name ?? '—'}。`,
      top3.map((h) => h.id),
    );
    for (const h of horses) addFatigue(h, 'G1', race.distance, ranks[horses.indexOf(h)]);
  }
  // 疲労は週ごとに抜ける
  for (const h of world.horses) if (h.fatigue) h.fatigue = h.fatigue * BALANCE.fatigue.decayPerWeek < 0.01 ? 0 : h.fatigue * BALANCE.fatigue.decayPerWeek;
  world.serial++;
  enterWeek(world);
  return world;
}

/** 海外のレースの結果を名簿とニュースに残す */
function runAbroad(world: World, card: WeekCard, byId: Map<number, WorldHorse>, rng: Rng) {
  const { year, week } = card;
  const progress = seasonProgress(week.index, WEEKS_PER_YEAR);
  for (const { race, horseIds, top } of card.abroad) {
    const horses = horseIds.map((id) => byId.get(id)!);
    const ranks = overseasRanks(race, horses.map((h) => abroadPower(h, rating(currentStats(h, year, progress)), race)), top, rng);
    horses.forEach((h, k) => {
      const rank = ranks[k];
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
      addFatigue(h, 'G1', race.distance, rank);
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
    });
  }
}

/**
 * 画面に出ないレースの結果を名簿・重賞の結果・ニュースに残す（ranks は horses の並び順の着順）
 */
function recordOffscreen(
  world: World,
  race: OffscreenRace,
  horses: WorldHorse[],
  ranks: number[],
  year: number,
  weekIndex: number,
  lastWeek: number,
) {
  const first = firstPrize({ raceClass: race.grade, name: race.name, age: race.age, fillies: race.fillies });
  horses.forEach((h, k) => {
    const rank = ranks[k];
    const prize = Math.round(first * (PRIZE_SHARE[rank - 1] ?? 0));
    h.starts++;
    if (rank === 1) {
      h.wins++;
      h.tier = 'open';
      h.graded.push({ year, name: race.name, grade: race.grade });
    } else if (rank === 2) h.seconds++;
    else if (rank === 3) h.thirds++;
    h.earnings += prize;
    h.earningsByYear[year] = (h.earningsByYear[year] ?? 0) + prize;
    h.runs.push({
      year,
      week: weekIndex,
      month: race.month,
      day: race.day,
      venue: race.venue,
      offscreen: true,
      race: race.name,
      grade: race.grade,
      raceClass: race.grade,
      surface: race.surface,
      distance: race.distance,
      runners: horses.length,
      rank,
      time: 0,
      margin: '',
    });
    if (h.runs.length > RUNS_KEPT) h.runs.splice(0, h.runs.length - RUNS_KEPT);
    h.lastWeek = Math.max(h.lastWeek ?? lastWeek, lastWeek);
  });
  const top3 = [1, 2, 3].map((r) => horses[ranks.indexOf(r)]).filter(Boolean);
  world.graded.push({
    year,
    week: weekIndex,
    name: race.name,
    grade: race.grade,
    venue: race.venue,
    date: { month: race.month, day: race.day },
    top3: top3.map((h) => ({ id: h.id, name: h.name })),
    time: 0,
  });
  return top3;
}

/** レースの疲労（格・距離・着順で増える） */
function addFatigue(h: WorldHorse, cls: keyof typeof BALANCE.fatigue.gain, distance: number, rank: number) {
  const F = BALANCE.fatigue;
  const gain = F.gain[cls] * (distance >= BALANCE.rotation.longRaceDistance ? F.longFactor : 1) * (rank <= 3 ? F.hardRunFactor : 1);
  h.fatigue = (h.fatigue ?? 0) + gain;
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
  // 夏は全馬が放牧で休む（疲労はすっかり抜ける）
  for (const h of active) h.fatigue = 0;
  // 夏に力をつけた馬（3〜4歳。晩成ほど選ばれやすい）。能力は本当に上がるが、ファンに見えるのは一部だけ
  const S = BALANCE.summer;
  const grown = new Map<number, number>();
  const grow = (h: WorldHorse, share: number) => {
    const boost = rng.int(...S.boost);
    h.boost += boost;
    h.boostPublic = (h.boostPublic ?? 0) + boost * share;
    grown.set(h.id, boost);
  };
  const candidates = active.filter((h) => !h.retired && (ageOf(h, year) === 3 || ageOf(h, year) === 4) && h.tier !== 'maiden');
  const count = rng.int(...S.hiddenHorses);
  for (let k = 0; k < count && candidates.length > 0; k++) {
    const i = rng.weighted(candidates.map((h, idx) => [idx, Math.exp(h.growth * 1.5)] as const));
    grow(candidates.splice(i, 1)[0], S.publicShareHidden);
  }

  // 夏の重賞（画面に出ない）：収得賞金の順に出走馬を決めて着順を出す。G1 馬の多くは秋に備えて休む。
  // 夏に力をつけた馬ほど勝ちやすい。勝ち馬の多くは「夏の上がり馬」としてニュースになる
  const { week } = weekOf(world.serial);
  const progress = seasonProgress(week.index, WEEKS_PER_YEAR);
  const money = new Map(active.map((h) => [h.id, syutoku(h)]));
  const ratings = ratingsOf(active, year, progress);
  const ran = new Set<number>();
  const results: { race: OffscreenRace; winner: WorldHorse }[] = [];
  for (const race of SUMMER_RACES) {
    const n = rng.int(...OFFSCREEN.summerRunners);
    const field = active
      .filter(
        (h) =>
          !h.retired &&
          !ran.has(h.id) &&
          offscreenEligible(h, race, year) &&
          // 3歳の牝馬は牡馬相手の3歳重賞（ラジオNIKKEI賞）にはずば抜けた馬だけ
          !fillyAvoidsColts(h, race, year, ratings) &&
          // 年間の出走数の上限に余裕のある馬だけ（秋の分を残す）
          h.runs.filter((r) => r.year === year).length < OFFSCREEN.summerMaxStartsSoFar,
      )
      .filter((h) => !h.graded.some((g) => g.grade === 'G1') || rng.chance(0.15))
      .sort((x, y) => money.get(y.id)! - money.get(x.id)! + rng.normal(0, 300))
      .slice(0, n);
    if (field.length < 6) continue;
    for (const h of field) ran.add(h.id);
    const ranks = offscreenRanks(race, field, year, progress, rng);
    const top3 = recordOffscreen(world, race, field, ranks, year, Math.max(0, week.index - 1), world.serial - 1);
    const winner = top3[0];
    results.push({ race, winner });
    // 勝ち馬は夏に力をつけていたことが多い（まだならここで成長。ファンにも知られる）
    if (!grown.has(winner.id) && rng.chance(OFFSCREEN.winnerGrowthChance)) grow(winner, S.publicShareNamed);
    if (grown.has(winner.id)) {
      winner.boostPublic = Math.max(winner.boostPublic ?? 0, grown.get(winner.id)! * S.publicShareNamed);
      const look = grown.get(winner.id)! >= 5 ? 'ひと夏で馬体が見違えるほど成長' : '夏の間にひと回りたくましくなった';
      news(
        world,
        'summer',
        `夏の上がり馬：${winner.name}`,
        `${race.name}（${race.venue}・${race.grade}）を勝った${winner.name}（${ageOf(winner, year)}歳）は${look}。秋の飛躍が期待されます。`,
        [winner.id],
      );
    }
  }
  if (results.length > 0) {
    news(
      world,
      'offscreen',
      `${year}年 夏の重賞の結果`,
      results.map(({ race, winner }) => `${race.name}＝${winner.name}`).join('、'),
      results.map(({ winner }) => winner.id),
    );
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
  const studs: { h: WorldHorse; g1: number }[] = [];
  for (const h of world.horses) {
    if (h.retired) continue;
    const age = ageOf(h, year);
    const g1 = h.graded.filter((g) => g.grade === 'G1').length;
    if (age >= EVENTS.retireAge) {
      retire(world, h, 'age');
    } else if (g1 > 0 && age >= 4 && rng.chance(h.sex === 'colt' ? (age >= 5 ? 0.8 : 0.5) : age >= 5 ? 0.6 : 0.2)) {
      retire(world, h, 'stud');
      studs.push({ h, g1 });
    } else if (age >= 4 && h.tier !== 'open' && recentPoor(h) && rng.chance(age >= 5 ? 0.6 : 0.3)) {
      retire(world, h, 'results');
    }
  }
  // G1 馬の引退は1つのニュースにまとめる
  if (studs.length === 1) {
    const { h, g1 } = studs[0];
    news(world, 'retire', `${h.name}が引退`, `G1 ${g1}勝の${h.name}が引退し、${h.sex === 'colt' ? '種牡馬' : '繁殖牝馬'}になります。`, [h.id]);
  } else if (studs.length > 1) {
    studs.sort((a, b) => b.g1 - a.g1);
    news(
      world,
      'retire',
      `${year}年限りでG1馬${studs.length}頭が引退`,
      `${studs.map(({ h, g1 }) => `${h.name}（G1 ${g1}勝・${h.sex === 'colt' ? '種牡馬' : '繁殖牝馬'}）`).join('、')}が引退します。`,
      studs.map(({ h }) => h.id),
    );
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
