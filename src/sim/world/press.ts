import { BALANCE } from '../balance';
import { apparentStrength } from '../rating';
import { Rng } from '../rng';
import type { Entry, RaceSetup } from '../types';

/**
 * 大レース（G1）の予想記事（ユーザーの指示）。新聞・予想家が公開の情報だけで本命と穴を選ぶ。
 * 記事に出た馬には票が集まる（betting/params.ts の press。穴に挙がった馬は売れて、オッズが下がる）
 */
export const PRESS = {
  /** 本命の推定勝率がこれ以上なら「大本命」、これ未満なら「混戦」 */
  strongFavorite: 0.4,
  tight: 0.22,
  /** 穴に選ぶ人気の帯（記者の見立ての順位） */
  darkRange: [5, 10] as [number, number],
  /** 穴を選ぶときのばらつき（m/s 換算） */
  darkNoise: 0.03,
};

export interface PressPick {
  /** 本命（馬番） */
  favorite: number;
  /** 穴（馬番）。頭数が少なければ null */
  darkHorse: number | null;
  tone: 'strong' | 'normal' | 'tight';
  /** 本命の推定勝率（記者の見立て） */
  favoriteChance: number;
}

/** 記者の見立ての強さ（m/s 換算）：見えている能力＋実績＋騎手。市場の見方（betting/market.ts）に近い簡易版 */
function pressView(setup: RaceSetup): number[] {
  return apparentStrength(setup, 'public').map((x, i) => {
    const e = setup.entries[i];
    const r = e.record;
    const credit = r ? 0.0125 * Math.min(r.g1Wins, 3) + 0.005 * Math.min(r.gradedWins - r.g1Wins, 3) : 0;
    const jockey = e.jockey ? BALANCE.jockey.skill[e.jockey.rank] * 16.5 : 0;
    return x + credit + jockey;
  });
}

/** 前走の好走（穴の理由・選びやすさ） */
function lastRunGood(e: Entry): boolean {
  const last = e.history?.[0];
  return !!last && last.rank <= 3;
}

export function pressPicks(setup: RaceSetup): PressPick {
  const rng = new Rng(setup.seed).fork(31);
  const s = pressView(setup);
  const max = Math.max(...s);
  const e = s.map((x) => Math.exp((x - max) / 0.1));
  const z = e.reduce((a, b) => a + b, 0);
  const order = s.map((_, i) => i).sort((a, b) => s[b] - s[a]);
  const fav = order[0];
  const chance = e[fav] / z;
  const [lo, hi] = PRESS.darkRange;
  const band = order.slice(lo - 1, hi);
  let dark: number | null = null;
  let best = -Infinity;
  for (const i of band) {
    const ent = setup.entries[i];
    const v =
      s[i] +
      (lastRunGood(ent) ? 0.03 : 0) +
      (ent.jockey && (ent.jockey.rank === 'S+' || ent.jockey.rank === 'S') ? 0.02 : 0) +
      rng.normal(0, PRESS.darkNoise);
    if (v > best) {
      best = v;
      dark = i;
    }
  }
  return {
    favorite: setup.entries[fav].number,
    darkHorse: dark === null ? null : setup.entries[dark].number,
    tone: chance >= PRESS.strongFavorite ? 'strong' : chance < PRESS.tight ? 'tight' : 'normal',
    favoriteChance: chance,
  };
}

/** 本命の理由 */
function favoriteReason(e: Entry): string {
  const r = e.record;
  const last = e.history?.[0];
  if (r && r.g1Wins >= 2) return `G1・${r.g1Wins}勝の実績は断然`;
  if (last && last.rank === 1 && last.grade) return `前走の${last.race}を快勝して勢いに乗る`;
  if (r && r.g1Wins === 1) return 'G1馬の貫禄を見せられるか';
  if (last && last.rank <= 3) return `前走の${last.race ?? 'レース'}で${last.rank}着と力は上位`;
  return '能力の比較では一枚上';
}

/** 穴の理由 */
function darkReason(e: Entry): string {
  const last = e.history?.[0];
  if (last && last.rank <= 3) return `前走の${last.race ?? 'レース'}${last.rank}着と調子は上向き`;
  if (e.jockey && (e.jockey.rank === 'S+' || e.jockey.rank === 'S')) return `${e.jockey.name}騎手を確保して一発の気配`;
  return '展開ひとつで上位に食い込める';
}

const jockeyOf = (e: Entry) => (e.jockey ? `（${e.jockey.name}騎手）` : '');

/** 予想記事の見出しと本文 */
export function pressArticle(raceName: string, setup: RaceSetup, pick: PressPick): { title: string; body: string } {
  const fav = setup.entries.find((x) => x.number === pick.favorite)!;
  const dark = pick.darkHorse === null ? null : setup.entries.find((x) => x.number === pick.darkHorse)!;
  const title =
    pick.tone === 'strong'
      ? `${raceName}展望：${fav.horse.name}が大本命`
      : pick.tone === 'tight'
        ? `${raceName}展望：主役不在の混戦`
        : `${raceName}展望：本命は${fav.horse.name}`;
  const lead =
    pick.tone === 'tight'
      ? `力の差は小さく、どの馬にもチャンスがある一戦。記者の本命は${fav.horse.name}${jockeyOf(fav)}で、${favoriteReason(fav)}。`
      : `${fav.horse.name}${jockeyOf(fav)}は${favoriteReason(fav)}。`;
  const tail = dark ? `穴は${dark.horse.name}${jockeyOf(dark)}。${darkReason(dark)}。` : '';
  return { title, body: lead + tail };
}
