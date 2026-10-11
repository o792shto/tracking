import { GRADED_RACES_2026 } from '../gradedRaces';
import type { ProgramRace } from '../program';
import type { WorldHorse } from './types';
import { OFFSCREEN_G1, SUMMER_RACES } from './offscreen';

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


/** 条件戦を勝ったときの収得賞金の加算（万円）。所属クラスから勝ち数ぶんを足す（おおよその目安） */
const CONDITION_SYUTOKU = { maiden: 0, '1win': 400, '2win': 900, '3win': 1500, open: 2100 } as const;
const GRADED_INFO = new Map<string, { grade: 'G1' | 'G2' | 'G3'; name: string; age: ProgramRace['age']; fillies: boolean }>(
  [...GRADED_RACES_2026, ...SUMMER_RACES, ...OFFSCREEN_G1].map((g) => [g.name, g]),
);

/**
 * 収得賞金（万円）。G1 などの出走順に使う。獲得賞金の総額ではなく、勝ち鞍（特に重賞）を重く見る。
 * 実際の JRA の計算の細かい規定は再現しておらず、おおよその目安：
 * 条件戦の勝ちは所属クラスから、重賞の勝ちは1着賞金の半分、近走の重賞2着は1着賞金の4分の1
 */
export function syutoku(h: Pick<WorldHorse, 'tier' | 'graded' | 'runs'>): number {
  let v = h.tier === 'open' && h.graded.length > 0 ? CONDITION_SYUTOKU['3win'] : CONDITION_SYUTOKU[h.tier];
  for (const g of h.graded) {
    const info = GRADED_INFO.get(g.name);
    v += (info ? firstPrize({ raceClass: info.grade, name: info.name, age: info.age, fillies: info.fillies }) : 20000) / 2;
  }
  for (const r of h.runs) {
    if (r.grade && r.rank === 2) {
      const info = GRADED_INFO.get(r.race);
      if (info) v += firstPrize({ raceClass: info.grade, name: info.name, age: info.age, fillies: info.fillies }) / 4;
    }
  }
  return v;
}
