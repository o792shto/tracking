import { Rng, hashSeed } from '../rng';
import { weekOf } from './calendar';
import { ageOf } from './horses';
import { pressArticle, pressPicks } from './press';
import { planG1, raceSetup, realWeeksSince, weekCard } from './schedule';
import { FILLIES_CROWN, TRIPLE_CROWN } from './story';
import type { NewsKind, World, WorldHorse } from './types';

/**
 * 週の初めの記事（ユーザーの指示で報道を増やした）。
 * - 大レース（その週の G1）の予想記事：本命と穴（press.ts。記事に出た馬はオッズにも響く）
 * - ローテーションの記事：G1 を目標に順調な馬、G1 へ直行する馬、二冠馬の三冠への道
 * どれも公開の情報（成績・G1 の目標）だけで書く。能力の隠れた部分は書かない
 */
export const REPORTS = {
  /** 「〇〇が G1 目標に向けて充実」を出す、G1 の何週前か */
  buildUpWeeks: 4,
  /** 「直行」を出す、G1 の何週前か（これより近いと前哨戦には出ない） */
  directWeeks: 2,
  /** 直行とみなす前走からの間隔（実際の日付、週） */
  directGap: 6,
  /** 1週に出すローテーションの記事の数の上限 */
  maxPerWeek: 4,
  /** 同じ G1 についての記事の上限（1週あたり） */
  perTarget: 2,
};

export interface Report {
  kind: NewsKind;
  title: string;
  body: string;
  horseIds: number[];
}

const g1Wins = (h: WorldHorse) => h.graded.filter((g) => g.grade === 'G1').length;

/** 記事にする価値（G1 馬・重賞馬・前走の好走） */
function fame(h: WorldHorse): number {
  const last = h.runs[h.runs.length - 1];
  return 10 * g1Wins(h) + 3 * h.graded.length + (last && last.rank <= 2 && last.grade ? 2 : 0);
}

/** 「G1馬」「二冠馬」などの肩書き */
function titleOf(h: WorldHorse, year: number): string {
  for (const crown of [TRIPLE_CROWN, FILLIES_CROWN] as const) {
    const won = h.graded.filter((g) => g.year === year && (crown as readonly string[]).includes(g.name));
    if (won.length === 2) return crown === FILLIES_CROWN ? '牝馬二冠馬' : '二冠馬';
  }
  const g1 = g1Wins(h);
  if (g1 >= 2) return `G1・${g1}勝馬`;
  if (g1 === 1) return `${h.graded.find((g) => g.grade === 'G1')!.name}馬`;
  if (h.graded.length > 0) return '重賞馬';
  return ageOf(h, year) === 3 ? '素質馬' : '上がり馬';
}

/** 三冠の最後（菊花賞・秋華賞）に二冠馬が向かうか */
function crownBid(h: WorldHorse, target: string, year: number): string | null {
  const crown = target === TRIPLE_CROWN[2] ? TRIPLE_CROWN : target === FILLIES_CROWN[2] ? FILLIES_CROWN : null;
  if (!crown) return null;
  const won = h.graded.filter((g) => g.year === year && (crown as readonly string[]).includes(g.name)).length;
  return won === 2 ? (crown === FILLIES_CROWN ? '牝馬三冠' : '三冠') : null;
}

export function weekReports(world: World): Report[] {
  const out: Report[] = [];
  const { year, week } = weekOf(world.serial);
  const rng = new Rng(hashSeed(world.seed ^ Math.imul(world.serial + 3, 0x27d4eb2f)));
  const card = weekCard(world);

  // 大レースの予想記事
  for (const race of card.races) {
    if (race.grade !== 'G1' || !race.visible || race.horseIds.length < 5) continue;
    const setup = raceSetup(world, card, race);
    const pick = pressPicks(setup);
    const { title, body } = pressArticle(race.program.name, setup, pick);
    const ids = [pick.favorite, pick.darkHorse].filter((n): n is number => n !== null).map((n) => race.horseIds[n - 1]);
    out.push({ kind: 'preview', title, body, horseIds: ids });
  }

  // ローテーションの記事
  const plan = planG1(world, world.serial);
  const day = week.days[0];
  const running = new Set(card.races.flatMap((r) => r.horseIds));
  const candidates: { h: WorldHorse; report: Report; score: number; target?: string }[] = [];
  for (const h of plan.active) {
    if (h.restUntil !== null && world.serial < h.restUntil) continue;
    const t = plan.g1Target(h);
    if (!t || t.weeks === 0) continue;
    const f = fame(h);
    if (f < 3) continue;
    const name = h.name;
    const label = titleOf(h, year);
    const bid = crownBid(h, t.name, year);
    const gap = realWeeksSince(h, year, day.month, day.day);
    const last = h.runs[h.runs.length - 1];
    if (t.weeks === REPORTS.directWeeks && gap !== null && gap >= REPORTS.directGap && !running.has(h.id)) {
      const title = bid ? `${label}${name}は${t.name}直行、${bid}へ` : `${label}${name}は${t.name}へ直行`;
      const body = bid
        ? `${last?.race ?? '前走'}以来となる${t.name}へ、前哨戦を使わずに向かいます。陣営は「${bid}をとりにいく」と力強く話しています。`
        : `${name}は${last?.race ?? '前走'}以来の休み明けで${t.name}に挑みます。${rng.pick(['調教の動きは上々', '放牧先から元気に帰厩', '仕上がりは順調'])}とのことです。`;
      candidates.push({ h, report: { kind: 'rotation', title, body, horseIds: [h.id] }, score: f + (bid ? 50 : 0), target: t.name });
    } else if (t.weeks === REPORTS.directWeeks && bid && last && last.year === year && last.month >= 9) {
      // 二冠馬が前哨戦を使って三冠の最後へ
      const title = `${label}${name}、${last.race}${last.rank === 1 ? 'を快勝' : 'をひと叩き'}して${bid}へ`;
      const body = `${last.race}で${last.rank}着の${name}は予定どおり${t.name}へ。${bid}がかかる大一番に向けて、陣営は「上積みは十分」と話しています。`;
      candidates.push({ h, report: { kind: 'rotation', title, body, horseIds: [h.id] }, score: f + 50, target: t.name });
    } else if (t.weeks === REPORTS.buildUpWeeks) {
      const lastText = last ? `前走の${last.race}${last.rank === 1 ? 'を勝って' : `${last.rank}着のあと`}` : '';
      const good = !last || last.rank <= 5;
      const title = bid ? `${label}${name}、${bid}へ視界良好` : good ? `${name}が${t.name}目標に充実` : `${name}、${t.name}で巻き返しへ`;
      const body = bid
        ? `${lastText}${t.name}へ。${bid}の偉業へ、陣営は「ここまで予定どおり」と自信をのぞかせます。`
        : good
          ? `${label}の${name}は${lastText}${t.name}を目標に調整中。${rng.pick([
              '陣営は「状態は今がいちばん」と手応え十分です。',
              '追い切りでは好時計をマークしました。',
              '「この馬の力を見せたい」と陣営も意欲的です。',
            ])}`
          : `${label}の${name}は${lastText}${t.name}で巻き返しを期します。${rng.pick([
              '陣営は「前走は力を出し切れなかった」と話しています。',
              '立て直して状態は上向きとのことです。',
            ])}`;
      candidates.push({ h, report: { kind: 'rotation', title, body, horseIds: [h.id] }, score: f + (bid ? 50 : 0) - (good ? 0 : 5), target: t.name });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // 同じ G1 の記事は2本まで（いろいろな G1 の話題が出るように）
  const perTarget = new Map<string, number>();
  let n = 0;
  for (const c of candidates) {
    if (n >= REPORTS.maxPerWeek) break;
    const k = perTarget.get(c.target ?? '') ?? 0;
    if (k >= REPORTS.perTarget) continue;
    perTarget.set(c.target ?? '', k + 1);
    out.push(c.report);
    n++;
  }
  return out;
}
