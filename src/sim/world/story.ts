import type { Grade } from '../gradedRaces';
import type { Rng } from '../rng';
import type { Sex, World, WorldHorse } from './types';

/**
 * 実況で使う、その馬のこれまで（このレースより前）の成績。
 * クラシックの何冠目か・G1何勝目か・連勝・前走からの巻き返しなどを組み立てる
 */
export interface HorseStory {
  sex: Sex;
  /** 重賞の勝ち鞍（古い順） */
  graded: { year: number; name: string; grade: Grade }[];
  /** 直前までの連勝の数 */
  streak: number;
  /** 前走 */
  last: { rank: number; race: string; grade: Grade | null } | null;
  starts: number;
  wins: number;
}

/** 牡馬・牝馬それぞれのクラシック三冠（この順に行う） */
export const TRIPLE_CROWN = ['皐月賞', '日本ダービー', '菊花賞'] as const;
export const FILLIES_CROWN = ['桜花賞', 'オークス', '秋華賞'] as const;

/** 名簿の馬の、いまの週の時点の成績（出走表の馬番順） */
export function storiesFor(world: World, horseIds: readonly number[]): (HorseStory | undefined)[] {
  const byId = new Map(world.horses.map((h) => [h.id, h]));
  return horseIds.map((id) => {
    const h = byId.get(id);
    return h ? storyOf(h) : undefined;
  });
}

export function storyOf(h: WorldHorse): HorseStory {
  let streak = 0;
  for (let i = h.runs.length - 1; i >= 0 && h.runs[i].rank === 1; i--) streak++;
  const lastRun = h.runs[h.runs.length - 1];
  return {
    sex: h.sex,
    graded: h.graded.map((g) => ({ ...g })),
    streak,
    last: lastRun ? { rank: lastRun.rank, race: lastRun.race, grade: lastRun.grade } : null,
    starts: h.starts,
    wins: h.wins,
  };
}

function crownOf(race: string): readonly string[] | null {
  if ((TRIPLE_CROWN as readonly string[]).includes(race)) return TRIPLE_CROWN;
  if ((FILLIES_CROWN as readonly string[]).includes(race)) return FILLIES_CROWN;
  return null;
}

/** その年にすでに勝っているクラシック（同じ三冠のうち） */
function crownsWon(story: HorseStory, crown: readonly string[], year: number): string[] {
  return story.graded.filter((g) => g.year === year && crown.includes(g.name)).map((g) => g.name);
}

const KANJI = ['', '一', '二', '三'];

/** クラシックで三冠がかかっている・二冠目を狙う馬の紹介（発走前後の実況） */
export function crownPreview(race: string, year: number, story: HorseStory | undefined, name: string): string | null {
  const crown = crownOf(race);
  if (!crown || !story) return null;
  const won = crownsWon(story, crown, year);
  if (won.length === 0) return null;
  const filly = crown === FILLIES_CROWN ? '牝馬' : '';
  if (won.length === 2) return `注目は${filly}三冠がかかる${name}`;
  return `${won[0]}を制した${name}、${filly}二冠を狙います`;
}

/**
 * 勝った馬の物語（実況のゴール後に続ける文）。重賞は「〇〇、△△を制しました」のあと、
 * クラシックの何冠目か・G1何勝目か・連勝などを足す
 */
export function winStory(
  options: { race: string; grade: Grade | null; year: number; name: string; raceClass?: string },
  story: HorseStory | undefined,
  rng: Rng,
): string[] {
  const { race, grade, year, name } = options;
  const say = <T>(xs: readonly T[]) => rng.pick(xs);
  const lines: string[] = [];
  const crown = crownOf(race);
  const prevG1 = story ? story.graded.filter((g) => g.grade === 'G1').length : 0;

  if (crown && story) {
    const won = crownsWon(story, crown, year);
    const filly = crown === FILLIES_CROWN;
    const total = won.length + 1;
    if (total === 3) {
      lines.push(
        filly
          ? say([`${name}、牝馬三冠達成！ 桜・樫・秋華、すべてを手にしました！`, `牝馬三冠達成！ ${name}が歴史に名を刻みました！`])
          : say([`${name}、三冠達成！ 史上に残る三冠馬の誕生です！`, `三冠達成！ ${name}がクラシックをすべて制しました！`]),
      );
    } else if (total === 2) {
      lines.push(
        say([`${name}、${filly ? '牝馬' : ''}二冠達成！`, `${won[0]}に続いて${race}も制覇、${name}が${filly ? '牝馬' : ''}二冠！`]),
      );
      if (race !== crown[2]) lines.push(say([`秋は${filly ? '牝馬' : ''}三冠をかけて${crown[2]}へ！`, `${filly ? '牝馬' : ''}三冠へ、夢が広がります`]));
    } else {
      const first: Record<string, readonly string[]> = {
        皐月賞: [`${name}、クラシックの一冠目を制しました！`, `クラシック一冠目は${name}！ 最も速い馬が決まりました`],
        日本ダービー: [`${name}、日本ダービー制覇！ ${year}年のダービー馬に輝きました！`, `${year}年の頂点は${name}！ ダービー馬の誕生です`],
        菊花賞: [`${name}、菊花賞制覇！ クラシック最後の一冠を手にしました`, `最も強い馬が勝つ菊花賞、${name}が制しました！`],
        桜花賞: [`${name}、牝馬クラシックの一冠目、桜の女王に輝きました！`, `桜の女王は${name}！`],
        オークス: [`${name}、樫の女王に輝きました！`, `オークスを制したのは${name}！ 樫の女王の誕生です`],
        秋華賞: [`${name}、秋華賞制覇！ 牝馬クラシック最後の一冠を手にしました`, `最後の一冠は${name}が手にしました！`],
      };
      lines.push(say(first[race]));
      if (race === '日本ダービー' && story.sex === 'filly') lines.push('牝馬によるダービー制覇です！');
    }
  } else if (grade) {
    lines.push(say([`${name}、${race}を制しました！`, `${race}は${name}が勝利！`, `${name}が${race}を勝ち取りました`]));
  }

  if (!story) return lines;

  // 同じレースの連覇
  if (grade && story.graded.some((g) => g.year === year - 1 && g.name === race)) {
    lines.push(say([`${race}連覇！`, `昨年に続いて${race}連覇です！`]));
  }

  // G1 の勝利数
  if (grade === 'G1') {
    if (prevG1 === 0) lines.push(say(['うれしいG1初制覇！', '待望のG1初勝利です']));
    else if (!crown || lines.length < 2) lines.push(say([`これでG1 ${prevG1 + 1}勝目！`, `G1は${KANJI[prevG1 + 1] ?? prevG1 + 1}勝目、${prevG1 + 1 >= 4 ? '現役最強の座は揺るぎません' : '勢いが止まりません'}`]));
  } else if (grade && story.graded.length === 0) {
    lines.push(say(['うれしい重賞初制覇！', '重賞初勝利です']));
  }

  // 連勝・前走からの巻き返し
  const streak = story.streak + 1;
  if (streak >= 3) {
    lines.push(say([`これで${streak}連勝！`, `${streak}連勝、止まりません！`]));
  } else if (story.last && story.last.rank >= 6 && story.starts > 0) {
    lines.push(say([`前走${story.last.rank}着から見事な巻き返し！`, `前走の${story.last.rank}着から一変しました`]));
  } else if (story.last && story.last.rank === 1 && story.last.grade && grade) {
    lines.push(say([`前走の${story.last.race}に続いて重賞連勝！`, `${story.last.race}に続く重賞連勝です`]));
  }

  // 初勝利（新馬・未勝利）
  if (!grade && story.wins === 0) {
    lines.push(story.starts === 0 ? say(['デビュー戦を勝利で飾りました！', '見事な新馬勝ち！']) : say([`${story.starts + 1}戦目でうれしい初勝利！`, 'うれしい初勝利です！']));
  }
  return lines;
}
