import { GRADED_RACES_2026, type GradedRace, type Venue } from '../gradedRaces';

/**
 * 開催の暦。重賞の日付から「週（土日と月曜の祝日をひとまとめ）」を作る。
 * 1年は重賞のある週だけで、夏（7〜8月）は開催がない。毎年同じ日程を繰り返す。
 */

/** 競馬場の並び順（同じ日の表示順） */
const VENUE_ORDER: Venue[] = ['中山', '東京', '京都', '阪神'];
export const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 1つの競馬場の1日（その日のメインレースと、ダービーデーの目黒記念のような12Rの重賞） */
export interface VenueDay {
  month: number;
  day: number;
  /** 曜日（0=日曜） */
  weekday: number;
  venue: Venue;
  /** 11Rの重賞 */
  main: GradedRace;
  /** 12Rの重賞（目黒記念） */
  last?: GradedRace;
}

export interface RaceWeek {
  /** その年の何週目か（0始まり） */
  index: number;
  days: VenueDay[];
  /** 夏休みの後の最初の週 */
  afterSummer: boolean;
  /** 新しい2歳がデビューする週（6月の最初の週） */
  debut: boolean;
}

const dayNumber = (month: number, day: number) => Date.UTC(2026, month - 1, day) / 86_400_000;

function buildWeeks(): RaceWeek[] {
  const days: VenueDay[] = [];
  for (const g of GRADED_RACES_2026) {
    if (g.raceNo === 12) continue;
    const weekday = new Date(Date.UTC(2026, g.month - 1, g.day)).getUTCDay();
    const last = GRADED_RACES_2026.find(
      (x) => x.raceNo === 12 && x.month === g.month && x.day === g.day && x.venue === g.venue,
    );
    days.push({ month: g.month, day: g.day, weekday, venue: g.venue, main: g, last });
  }
  days.sort((a, b) => dayNumber(a.month, a.day) - dayNumber(b.month, b.day) || VENUE_ORDER.indexOf(a.venue) - VENUE_ORDER.indexOf(b.venue));
  const weeks: RaceWeek[] = [];
  let prev = -Infinity;
  for (const d of days) {
    const n = dayNumber(d.month, d.day);
    // 2日より離れていたら次の週（土・日・月の連休はひとまとめ）
    if (n - prev > 2) weeks.push({ index: weeks.length, days: [], afterSummer: n - prev > 30 && weeks.length > 0, debut: false });
    weeks[weeks.length - 1].days.push(d);
    prev = n;
  }
  const debut = weeks.find((w) => w.days[0].month >= 6);
  if (debut) debut.debut = true;
  return weeks;
}

export const RACE_WEEKS: readonly RaceWeek[] = buildWeeks();
export const WEEKS_PER_YEAR = RACE_WEEKS.length;
/** ゲームの最初の年 */
export const FIRST_YEAR = 2026;

/** 通算の週（ゲーム開始が0。開始前の年は負）から、年とその年の週 */
export function weekOf(serial: number): { year: number; week: RaceWeek } {
  const n = Math.floor(serial);
  const y = Math.floor(n / WEEKS_PER_YEAR);
  return { year: FIRST_YEAR + y, week: RACE_WEEKS[n - y * WEEKS_PER_YEAR] };
}

/** 「1月4日（日）」 */
export function dayLabel(d: Pick<VenueDay, 'month' | 'day' | 'weekday'>): string {
  return `${d.month}月${d.day}日（${WEEKDAY_LABEL[d.weekday]}）`;
}

/** 週の見出し（例：「1月4日〜」「5月30日・31日」） */
export function weekLabel(week: RaceWeek): string {
  const dates = [...new Set(week.days.map((d) => `${d.month}/${d.day}`))];
  const first = week.days[0];
  const last = week.days[week.days.length - 1];
  if (dates.length === 1) return `${first.month}月${first.day}日`;
  if (first.month === last.month) return `${first.month}月${first.day}日〜${last.day}日`;
  return `${first.month}月${first.day}日〜${last.month}月${last.day}日`;
}
