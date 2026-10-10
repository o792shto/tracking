import {
  AGE_LABEL,
  CLASS_LABEL,
  RACES_PER_DAY,
  raceDay,
  setupFor,
  type ProgramRace,
  type RaceClass,
} from './program';
import type { Venue } from './gradedRaces';
import { LAYOUT_LABEL, layoutFor } from './venues';
import type { RaceSetup } from './types';

/** 1開催日のレース数 */
export const RACES_PER_MEETING = RACES_PER_DAY;

export interface MeetingRace {
  /** レース番号（1R〜12R） */
  no: number;
  seed: number;
  raceClass: RaceClass;
  /** 重賞名、またはクラス名 */
  name: string;
  /** 条件の表示（重賞は「3歳以上 牝馬限定」など、条件戦は牝馬限定のときだけ。なければ空） */
  className: string;
  /** 重賞の格（G1〜G3）。重賞でなければ null */
  grade: 'G1' | 'G2' | 'G3' | null;
  program: ProgramRace;
  setup: RaceSetup;
  /** 内回り・外回り（芝で両方ある場のみ。なければ空） */
  layoutLabel: string;
}

export interface Meeting {
  /** 通算の開催日（1始まり） */
  seed: number;
  year: number;
  /** その年の何日目か（1始まり、全97日） */
  day: number;
  month: number;
  date: number;
  venueName: Venue;
  venue: string;
  races: MeetingRace[];
}

/** 通算 serial 日目の開催（1年97日、1日12R、11Rが重賞。ダービーデーは12Rも重賞） */
export function createMeeting(serial: number): Meeting {
  const day = raceDay(serial);
  const races = day.races.map((program): MeetingRace => {
    const setup = setupFor(day, program);
    const grade = program.raceClass === 'G1' || program.raceClass === 'G2' || program.raceClass === 'G3' ? program.raceClass : null;
    // 重賞はレース名と条件（年齢・牝馬限定）、それ以外は「2歳未勝利」のように年齢とクラスで呼ぶ
    const name = grade ? program.name : `${AGE_LABEL[program.age]}${CLASS_LABEL[program.raceClass]}`;
    const condition = [grade ? AGE_LABEL[program.age] : '', program.fillies ? '牝馬限定' : ''].filter(Boolean).join(' ');
    return {
      no: program.no,
      seed: setup.seed,
      raceClass: program.raceClass,
      name,
      className: condition,
      grade,
      program,
      setup,
      layoutLabel: LAYOUT_LABEL[layoutFor(day.venue, program.surface, program.distance)],
    };
  });
  return {
    seed: day.serial,
    year: day.year,
    day: day.dayIndex + 1,
    month: day.month,
    date: day.day,
    venueName: day.venue,
    venue: `${day.venue}競馬場`,
    races,
  };
}
