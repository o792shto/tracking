import type { Rng } from '../rng';
import type { Surface } from '../types';
import { RACE_WEEKS } from './calendar';
import { aptitudeFit } from './horses';
import type { WorldHorse } from './types';

/**
 * 日本の馬が遠征する海外の大レース。日付は毎年のおおよその時期で、その時期に近い開催週に行う。
 * 賞金（1着、万円）は実際の賞金をおおよそ円にしたもの（為替は固定の目安）。
 * 海外の馬は名簿にいないので、結果は「日本馬の力＋向き不向き」と「そのレースの相手の強さ」から決める
 */
export interface OverseasRace {
  name: string;
  /** 国・地域 */
  place: string;
  month: number;
  day: number;
  surface: Surface;
  distance: number;
  /** 1着の賞金（万円） */
  prize: number;
  /** 相手の強さ（日本のトップの水準との差、点）。大きいほど勝ちにくい */
  level: number;
}

export const OVERSEAS_RACES: readonly OverseasRace[] = [
  { name: 'サウジカップ', place: 'サウジアラビア', month: 2, day: 14, surface: 'dirt', distance: 1800, prize: 150000, level: -2 },
  { name: 'ドバイターフ', place: 'ドバイ', month: 3, day: 28, surface: 'turf', distance: 1800, prize: 40000, level: -4 },
  { name: 'ドバイシーマクラシック', place: 'ドバイ', month: 3, day: 28, surface: 'turf', distance: 2400, prize: 50000, level: -3 },
  { name: 'ドバイワールドカップ', place: 'ドバイ', month: 3, day: 28, surface: 'dirt', distance: 2000, prize: 100000, level: -1 },
  { name: 'クイーンエリザベス2世C', place: '香港', month: 4, day: 26, surface: 'turf', distance: 2000, prize: 30000, level: -4 },
  { name: '凱旋門賞', place: 'フランス', month: 10, day: 4, surface: 'turf', distance: 2400, prize: 45000, level: 0 },
  { name: 'ブリーダーズカップ・クラシック', place: 'アメリカ', month: 10, day: 31, surface: 'dirt', distance: 2000, prize: 55000, level: 0 },
  { name: '香港ヴァーズ', place: '香港', month: 12, day: 13, surface: 'turf', distance: 2400, prize: 25000, level: -5 },
  { name: '香港スプリント', place: '香港', month: 12, day: 13, surface: 'turf', distance: 1200, prize: 25000, level: -3 },
  { name: '香港マイル', place: '香港', month: 12, day: 13, surface: 'turf', distance: 1600, prize: 30000, level: -3 },
  { name: '香港カップ', place: '香港', month: 12, day: 13, surface: 'turf', distance: 2000, prize: 40000, level: -4 },
];

const dayNumber = (month: number, day: number) => Date.UTC(2026, month - 1, day) / 86_400_000;

/** 海外のレースを行う週（日付が最も近い開催週） */
export function overseasWeek(race: Pick<OverseasRace, 'month' | 'day'>): number {
  const target = dayNumber(race.month, race.day);
  let best = 0;
  let bestDiff = Infinity;
  for (const w of RACE_WEEKS) {
    const diff = Math.min(...w.days.map((d) => Math.abs(dayNumber(d.month, d.day) - target)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = w.index;
    }
  }
  return best;
}

/** その週の海外のレース */
export function overseasRacesOf(weekIndex: number): OverseasRace[] {
  return OVERSEAS_RACES.filter((r) => overseasWeek(r) === weekIndex);
}

/** 遠征の決め方 */
export const ABROAD = {
  /** 遠征を考える馬（日本のトップの水準との総合力の差がこれ以内） */
  margin: 6,
  /** 向き不向きの下限 */
  minFit: -1.5,
  /** 候補の馬が遠征を選ぶ確率 */
  chance: 0.4,
  /** 1レースに遠征する日本馬の上限 */
  maxPerRace: 3,
  /** 海外の相手の頭数 */
  rivals: 11,
  /** 力のばらつき（点） */
  noise: 3,
};

/**
 * 海外のレースの着順（日本馬それぞれ）。日本馬の力（総合力＋向き不向き）と、
 * 相手（日本の現役トップ＋レースの強さを中心にばらつく）を比べる
 */
export function overseasRank(race: OverseasRace, power: number, top: number, rng: Rng): number {
  const mine = power + rng.normal(0, ABROAD.noise);
  let rank = 1;
  for (let k = 0; k < ABROAD.rivals; k++) if (rng.normal(top + race.level, ABROAD.noise + 1) > mine) rank++;
  return rank;
}

/** 遠征する馬の力（総合力＋向き不向き） */
export function abroadPower(h: WorldHorse, rating: number, race: OverseasRace): number {
  return rating + 0.8 * aptitudeFit(h, race.surface, race.distance);
}
