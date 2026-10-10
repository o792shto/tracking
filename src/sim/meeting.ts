import { AGE_LABEL, CLASS_LABEL, type ProgramRace, type RaceClass } from './program';
import type { Venue } from './gradedRaces';
import { LAYOUT_LABEL, layoutFor } from './venues';
import type { RaceSetup } from './types';
import { WEEKS_PER_YEAR, weekLabel } from './world/calendar';
import { raceKey } from './world/advance';
import { raceSetup, type WeekCard } from './world/schedule';
import type { World } from './world/types';

/** 観戦できるレース1つ（その週の10R・11R・12R） */
export interface MeetingRace {
  /** レースを区別するキー（週・日・レース番号） */
  key: string;
  /** レース番号（10R〜12R） */
  no: number;
  seed: number;
  raceClass: RaceClass;
  /** 重賞名、または「3歳以上2勝クラス」のような条件 */
  name: string;
  /** 条件の表示（重賞は「3歳以上 牝馬限定」など、条件戦は牝馬限定のときだけ。なければ空） */
  className: string;
  /** 重賞の格（G1〜G3）。重賞でなければ null */
  grade: 'G1' | 'G2' | 'G3' | null;
  program: ProgramRace;
  setup: RaceSetup;
  /** 内回り・外回り（芝で両方ある場のみ。なければ空） */
  layoutLabel: string;
  venueName: Venue;
  /** 「中山競馬場」 */
  venue: string;
  month: number;
  date: number;
  /** 曜日（0=日曜） */
  weekday: number;
  /** その週の何日目（week.days の添字） */
  dayIndex: number;
  /** 出走馬の名簿の id（馬番順） */
  horseIds: number[];
}

/** 1週間の開催（同じ週の開催日をまとめて1つの画面で扱う） */
export interface Meeting {
  /** 通算の週（ゲーム開始が0） */
  serial: number;
  year: number;
  /** その年の何週目か（1始まり） */
  week: number;
  weeksPerYear: number;
  /** 「1月4日〜5日」 */
  label: string;
  races: MeetingRace[];
}

const VENUE_ORDER: Venue[] = ['中山', '東京', '京都', '阪神'];

/** その週の出走表から、観戦できるレース（10〜12R）を日付・レース番号・競馬場の順に並べる */
export function weekMeeting(world: World, card: WeekCard): Meeting {
  const visible = card.races.filter((r) => r.visible && r.horseIds.length > 0);
  const races = visible.map((r): MeetingRace => {
    const day = card.week.days[r.dayIndex];
    const program = r.program;
    const setup = raceSetup(world, card, r);
    const grade = r.grade;
    const name = grade ? program.name : `${AGE_LABEL[program.age]}${CLASS_LABEL[program.raceClass]}`;
    const condition = [grade ? AGE_LABEL[program.age] : '', program.fillies ? '牝馬限定' : ''].filter(Boolean).join(' ');
    return {
      key: raceKey(card.serial, r),
      no: r.no,
      seed: r.seed,
      raceClass: program.raceClass,
      name,
      className: condition,
      grade,
      program,
      setup,
      layoutLabel: LAYOUT_LABEL[layoutFor(day.venue, program.surface, program.distance)],
      venueName: day.venue,
      venue: `${day.venue}競馬場`,
      month: day.month,
      date: day.day,
      weekday: day.weekday,
      dayIndex: r.dayIndex,
      horseIds: r.horseIds,
    };
  });
  const dayNum = (r: MeetingRace) => r.month * 100 + r.date;
  races.sort((a, b) => dayNum(a) - dayNum(b) || a.no - b.no || VENUE_ORDER.indexOf(a.venueName) - VENUE_ORDER.indexOf(b.venueName));
  return {
    serial: card.serial,
    year: card.year,
    week: card.week.index + 1,
    weeksPerYear: WEEKS_PER_YEAR,
    label: weekLabel(card.week),
    races,
  };
}
