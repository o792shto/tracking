import { createRace } from './horse';
import { Rng, hashSeed } from './rng';
import type { RaceSetup } from './types';

/** 1開催のレース数（仕様では未決定。仮の値） */
export const RACES_PER_MEETING = 8;

/** 架空の競馬場名（実在の競馬場と重ならない名前） */
const VENUES = ['汐見野', '霧ノ原', '星降', '朝凪', '風祭', '月見坂', '若潮', '鈴鳴'];
const CLASSES = ['未勝利', '1勝クラス', '1勝クラス', '2勝クラス', '2勝クラス', '3勝クラス', 'オープン', 'オープン'];

export interface MeetingRace {
  /** レース番号（1R〜） */
  no: number;
  seed: number;
  className: string;
  setup: RaceSetup;
}

export interface Meeting {
  seed: number;
  venue: string;
  /** 開催の何日目か（表示用） */
  day: number;
  races: MeetingRace[];
}

export function raceSeed(meetingSeed: number, index: number): number {
  return hashSeed(meetingSeed * 131 + index + 1);
}

/** 開催のレース一覧を作る。後のレースほどクラスが上がる */
export function createMeeting(meetingSeed: number): Meeting {
  const rng = new Rng(hashSeed(meetingSeed)).fork(7);
  const venue = rng.pick(VENUES);
  const races: MeetingRace[] = [];
  for (let i = 0; i < RACES_PER_MEETING; i++) {
    const seed = raceSeed(meetingSeed, i);
    races.push({ no: i + 1, seed, className: CLASSES[i % CLASSES.length], setup: createRace(seed) });
  }
  return { seed: meetingSeed, venue: `${venue}競馬場`, day: (meetingSeed % 8) + 1, races };
}
