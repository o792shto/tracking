import type { Surface } from './types';

/**
 * 2026年 JRA主要4場（東京・中山・京都・阪神）の平地重賞（ユーザー提供、docs/reference/graded-races-2026.md）。
 * 出典：デイリースポーツ「2026年JRA重賞成績」（2026/10/9時点）。10/10以降は予定で、変更の可能性あり。
 * ゲームではこの98レースを1年の98開催日のメインレース（11R）に使う。
 */
export type Venue = '東京' | '中山' | '京都' | '阪神';
export type Grade = 'G1' | 'G2' | 'G3';
/** 年齢条件：2歳・3歳・3歳以上・4歳以上 */
export type AgeCondition = '2' | '3' | '3up' | '4up';

export interface GradedRace {
  month: number;
  day: number;
  grade: Grade;
  name: string;
  venue: Venue;
  surface: Surface;
  distance: number;
  age: AgeCondition;
  /** 牝馬限定 */
  fillies: boolean;
  note?: string;
}

export const GRADED_RACES_2026: readonly GradedRace[] = [
  { month: 1, day: 4, grade: 'G3', name: '中山金杯', venue: '中山', surface: 'turf', distance: 2000, age: '4up', fillies: false },
  { month: 1, day: 4, grade: 'G3', name: '京都金杯', venue: '京都', surface: 'turf', distance: 1600, age: '4up', fillies: false },
  { month: 1, day: 11, grade: 'G3', name: 'フェアリーS', venue: '中山', surface: 'turf', distance: 1600, age: '3', fillies: true },
  { month: 1, day: 12, grade: 'G3', name: 'シンザン記念', venue: '京都', surface: 'turf', distance: 1600, age: '3', fillies: false },
  { month: 1, day: 18, grade: 'G3', name: '京成杯', venue: '中山', surface: 'turf', distance: 2000, age: '3', fillies: false },
  { month: 1, day: 18, grade: 'G2', name: '日経新春杯', venue: '京都', surface: 'turf', distance: 2400, age: '4up', fillies: false },
  { month: 1, day: 25, grade: 'G2', name: 'AJCC', venue: '中山', surface: 'turf', distance: 2200, age: '4up', fillies: false },
  { month: 1, day: 25, grade: 'G2', name: 'プロキオンS', venue: '京都', surface: 'dirt', distance: 1800, age: '4up', fillies: false },
  { month: 2, day: 1, grade: 'G3', name: '根岸S', venue: '東京', surface: 'dirt', distance: 1400, age: '4up', fillies: false },
  { month: 2, day: 1, grade: 'G3', name: 'シルクロードS', venue: '京都', surface: 'turf', distance: 1200, age: '4up', fillies: false },
  { month: 2, day: 8, grade: 'G3', name: '東京新聞杯', venue: '東京', surface: 'turf', distance: 1600, age: '4up', fillies: false },
  { month: 2, day: 8, grade: 'G3', name: 'きさらぎ賞', venue: '京都', surface: 'turf', distance: 1800, age: '3', fillies: false },
  { month: 2, day: 14, grade: 'G3', name: 'クイーンC', venue: '東京', surface: 'turf', distance: 1600, age: '3', fillies: true },
  { month: 2, day: 15, grade: 'G3', name: '共同通信杯', venue: '東京', surface: 'turf', distance: 1800, age: '3', fillies: false },
  { month: 2, day: 15, grade: 'G2', name: '京都記念', venue: '京都', surface: 'turf', distance: 2200, age: '4up', fillies: false },
  { month: 2, day: 21, grade: 'G3', name: 'ダイヤモンドS', venue: '東京', surface: 'turf', distance: 3400, age: '4up', fillies: false },
  { month: 2, day: 21, grade: 'G3', name: '阪急杯', venue: '阪神', surface: 'turf', distance: 1400, age: '4up', fillies: false },
  { month: 2, day: 22, grade: 'G1', name: 'フェブラリーS', venue: '東京', surface: 'dirt', distance: 1600, age: '4up', fillies: false },
  { month: 2, day: 28, grade: 'G3', name: 'オーシャンS', venue: '中山', surface: 'turf', distance: 1200, age: '4up', fillies: false },
  { month: 3, day: 1, grade: 'G2', name: '中山記念', venue: '中山', surface: 'turf', distance: 1800, age: '4up', fillies: false },
  { month: 3, day: 1, grade: 'G2', name: 'チューリップ賞', venue: '阪神', surface: 'turf', distance: 1600, age: '3', fillies: true },
  { month: 3, day: 7, grade: 'G3', name: '中山牝馬S', venue: '中山', surface: 'turf', distance: 1800, age: '4up', fillies: true },
  { month: 3, day: 7, grade: 'G2', name: 'フィリーズレビュー', venue: '阪神', surface: 'turf', distance: 1400, age: '3', fillies: true },
  { month: 3, day: 8, grade: 'G2', name: '弥生賞ディープインパクト記念', venue: '中山', surface: 'turf', distance: 2000, age: '3', fillies: false },
  { month: 3, day: 15, grade: 'G2', name: 'スプリングS', venue: '中山', surface: 'turf', distance: 1800, age: '3', fillies: false },
  { month: 3, day: 21, grade: 'G3', name: 'フラワーC', venue: '中山', surface: 'turf', distance: 1800, age: '3', fillies: true },
  { month: 3, day: 22, grade: 'G2', name: '阪神大賞典', venue: '阪神', surface: 'turf', distance: 3000, age: '4up', fillies: false },
  { month: 3, day: 28, grade: 'G2', name: '日経賞', venue: '中山', surface: 'turf', distance: 2500, age: '4up', fillies: false },
  { month: 3, day: 28, grade: 'G3', name: '毎日杯', venue: '阪神', surface: 'turf', distance: 1800, age: '3', fillies: false },
  { month: 3, day: 29, grade: 'G3', name: 'マーチS', venue: '中山', surface: 'dirt', distance: 1800, age: '4up', fillies: false },
  { month: 4, day: 4, grade: 'G3', name: 'ダービー卿CT', venue: '中山', surface: 'turf', distance: 1600, age: '4up', fillies: false },
  { month: 4, day: 4, grade: 'G3', name: 'チャーチルダウンズC', venue: '阪神', surface: 'turf', distance: 1600, age: '3', fillies: false },
  { month: 4, day: 5, grade: 'G1', name: '大阪杯', venue: '阪神', surface: 'turf', distance: 2000, age: '4up', fillies: false },
  { month: 4, day: 11, grade: 'G2', name: 'ニュージーランドT', venue: '中山', surface: 'turf', distance: 1600, age: '3', fillies: false },
  { month: 4, day: 11, grade: 'G2', name: '阪神牝馬S', venue: '阪神', surface: 'turf', distance: 1600, age: '4up', fillies: true },
  { month: 4, day: 12, grade: 'G1', name: '桜花賞', venue: '阪神', surface: 'turf', distance: 1600, age: '3', fillies: true },
  { month: 4, day: 18, grade: 'G3', name: 'アンタレスS', venue: '阪神', surface: 'dirt', distance: 1800, age: '4up', fillies: false },
  { month: 4, day: 19, grade: 'G1', name: '皐月賞', venue: '中山', surface: 'turf', distance: 2000, age: '3', fillies: false },
  { month: 4, day: 25, grade: 'G2', name: '青葉賞', venue: '東京', surface: 'turf', distance: 2400, age: '3', fillies: false },
  { month: 4, day: 26, grade: 'G2', name: 'フローラS', venue: '東京', surface: 'turf', distance: 2000, age: '3', fillies: true },
  { month: 4, day: 26, grade: 'G2', name: 'マイラーズC', venue: '京都', surface: 'turf', distance: 1600, age: '4up', fillies: false },
  { month: 5, day: 2, grade: 'G2', name: '京王杯SC', venue: '東京', surface: 'turf', distance: 1400, age: '4up', fillies: false },
  { month: 5, day: 2, grade: 'G3', name: 'ユニコーンS', venue: '京都', surface: 'dirt', distance: 1900, age: '3', fillies: false },
  { month: 5, day: 3, grade: 'G1', name: '天皇賞・春', venue: '京都', surface: 'turf', distance: 3200, age: '4up', fillies: false },
  { month: 5, day: 9, grade: 'G3', name: 'エプソムC', venue: '東京', surface: 'turf', distance: 1800, age: '4up', fillies: false, note: '年齢条件は要確認' },
  { month: 5, day: 9, grade: 'G2', name: '京都新聞杯', venue: '京都', surface: 'turf', distance: 2200, age: '3', fillies: false },
  { month: 5, day: 10, grade: 'G1', name: 'NHKマイルC', venue: '東京', surface: 'turf', distance: 1600, age: '3', fillies: false },
  { month: 5, day: 17, grade: 'G1', name: 'ヴィクトリアマイル', venue: '東京', surface: 'turf', distance: 1600, age: '4up', fillies: true },
  { month: 5, day: 23, grade: 'G3', name: '平安S', venue: '京都', surface: 'dirt', distance: 1900, age: '4up', fillies: false },
  { month: 5, day: 24, grade: 'G1', name: 'オークス', venue: '東京', surface: 'turf', distance: 2400, age: '3', fillies: true },
  { month: 5, day: 30, grade: 'G3', name: '葵S', venue: '京都', surface: 'turf', distance: 1200, age: '3', fillies: false },
  { month: 5, day: 31, grade: 'G1', name: '日本ダービー', venue: '東京', surface: 'turf', distance: 2400, age: '3', fillies: false },
  { month: 5, day: 31, grade: 'G2', name: '目黒記念', venue: '東京', surface: 'turf', distance: 2500, age: '4up', fillies: false },
  { month: 6, day: 7, grade: 'G1', name: '安田記念', venue: '東京', surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { month: 6, day: 14, grade: 'G1', name: '宝塚記念', venue: '阪神', surface: 'turf', distance: 2200, age: '3up', fillies: false },
  { month: 6, day: 21, grade: 'G3', name: '府中牝馬S', venue: '東京', surface: 'turf', distance: 1800, age: '3up', fillies: true },
  { month: 6, day: 21, grade: 'G3', name: 'しらさぎS', venue: '阪神', surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { month: 9, day: 5, grade: 'G3', name: '京成杯AH', venue: '中山', surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { month: 9, day: 6, grade: 'G2', name: '紫苑S', venue: '中山', surface: 'turf', distance: 2000, age: '3', fillies: true },
  { month: 9, day: 6, grade: 'G2', name: 'セントウルS', venue: '阪神', surface: 'turf', distance: 1200, age: '3up', fillies: false },
  { month: 9, day: 12, grade: 'G3', name: 'チャレンジC', venue: '阪神', surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { month: 9, day: 13, grade: 'G2', name: 'ローズS', venue: '阪神', surface: 'turf', distance: 1800, age: '3', fillies: true },
  { month: 9, day: 13, grade: 'G2', name: 'セントライト記念', venue: '中山', surface: 'turf', distance: 2200, age: '3', fillies: false },
  { month: 9, day: 20, grade: 'G2', name: 'オールカマー', venue: '中山', surface: 'turf', distance: 2200, age: '3up', fillies: false },
  { month: 9, day: 21, grade: 'G2', name: '神戸新聞杯', venue: '阪神', surface: 'turf', distance: 2400, age: '3', fillies: false },
  { month: 9, day: 26, grade: 'G3', name: 'シリウスS', venue: '阪神', surface: 'dirt', distance: 2000, age: '3up', fillies: false },
  { month: 9, day: 27, grade: 'G1', name: 'スプリンターズS', venue: '中山', surface: 'turf', distance: 1200, age: '3up', fillies: false },
  { month: 10, day: 4, grade: 'G2', name: '毎日王冠', venue: '東京', surface: 'turf', distance: 1800, age: '3up', fillies: false },
  { month: 10, day: 4, grade: 'G2', name: '京都大賞典', venue: '京都', surface: 'turf', distance: 2400, age: '3up', fillies: false },
  { month: 10, day: 10, grade: 'G3', name: 'サウジアラビアRC', venue: '東京', surface: 'turf', distance: 1600, age: '2', fillies: false },
  { month: 10, day: 11, grade: 'G2', name: 'アイルランドT', venue: '東京', surface: 'turf', distance: 1800, age: '3up', fillies: true },
  { month: 10, day: 12, grade: 'G2', name: 'スワンS', venue: '京都', surface: 'turf', distance: 1400, age: '3up', fillies: false },
  { month: 10, day: 17, grade: 'G2', name: '富士S', venue: '東京', surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { month: 10, day: 18, grade: 'G1', name: '秋華賞', venue: '京都', surface: 'turf', distance: 2000, age: '3', fillies: true },
  { month: 10, day: 24, grade: 'G3', name: 'アルテミスS', venue: '東京', surface: 'turf', distance: 1600, age: '2', fillies: true },
  { month: 10, day: 25, grade: 'G1', name: '菊花賞', venue: '京都', surface: 'turf', distance: 3000, age: '3', fillies: false },
  { month: 10, day: 31, grade: 'G3', name: 'ファンタジーS', venue: '京都', surface: 'turf', distance: 1400, age: '2', fillies: true },
  { month: 11, day: 1, grade: 'G1', name: '天皇賞・秋', venue: '東京', surface: 'turf', distance: 2000, age: '3up', fillies: false },
  { month: 11, day: 7, grade: 'G2', name: '京王杯2歳S', venue: '東京', surface: 'turf', distance: 1400, age: '2', fillies: false },
  { month: 11, day: 8, grade: 'G2', name: 'アルゼンチン共和国杯', venue: '東京', surface: 'turf', distance: 2500, age: '3up', fillies: false },
  { month: 11, day: 8, grade: 'G3', name: 'みやこS', venue: '京都', surface: 'dirt', distance: 1800, age: '3up', fillies: false },
  { month: 11, day: 14, grade: 'G3', name: '武蔵野S', venue: '東京', surface: 'dirt', distance: 1600, age: '3up', fillies: false },
  { month: 11, day: 14, grade: 'G2', name: 'デイリー杯2歳S', venue: '京都', surface: 'turf', distance: 1600, age: '2', fillies: false },
  { month: 11, day: 15, grade: 'G1', name: 'エリザベス女王杯', venue: '京都', surface: 'turf', distance: 2200, age: '3up', fillies: true },
  { month: 11, day: 22, grade: 'G1', name: 'マイルCS', venue: '京都', surface: 'turf', distance: 1600, age: '3up', fillies: false },
  { month: 11, day: 23, grade: 'G2', name: '東スポ杯2歳S', venue: '東京', surface: 'turf', distance: 1800, age: '2', fillies: false },
  { month: 11, day: 28, grade: 'G3', name: '京都2歳S', venue: '京都', surface: 'turf', distance: 2000, age: '2', fillies: false },
  { month: 11, day: 29, grade: 'G1', name: 'ジャパンC', venue: '東京', surface: 'turf', distance: 2400, age: '3up', fillies: false },
  { month: 11, day: 29, grade: 'G3', name: '京阪杯', venue: '京都', surface: 'turf', distance: 1200, age: '3up', fillies: false },
  { month: 12, day: 5, grade: 'G2', name: 'ステイヤーズS', venue: '中山', surface: 'turf', distance: 3600, age: '3up', fillies: false },
  { month: 12, day: 5, grade: 'G3', name: '鳴尾記念', venue: '阪神', surface: 'turf', distance: 1800, age: '3up', fillies: false },
  { month: 12, day: 13, grade: 'G3', name: 'カペラS', venue: '中山', surface: 'dirt', distance: 1200, age: '3up', fillies: false },
  { month: 12, day: 13, grade: 'G1', name: '阪神JF', venue: '阪神', surface: 'turf', distance: 1600, age: '2', fillies: true },
  { month: 12, day: 19, grade: 'G3', name: 'ターコイズS', venue: '中山', surface: 'turf', distance: 1600, age: '3up', fillies: true },
  { month: 12, day: 20, grade: 'G1', name: '朝日杯FS', venue: '阪神', surface: 'turf', distance: 1600, age: '2', fillies: false },
  { month: 12, day: 26, grade: 'G1', name: 'ホープフルS', venue: '中山', surface: 'turf', distance: 2000, age: '2', fillies: false },
  { month: 12, day: 26, grade: 'G2', name: '阪神C', venue: '阪神', surface: 'turf', distance: 1400, age: '3up', fillies: false },
  { month: 12, day: 27, grade: 'G1', name: '有馬記念', venue: '中山', surface: 'turf', distance: 2500, age: '3up', fillies: false },
];
