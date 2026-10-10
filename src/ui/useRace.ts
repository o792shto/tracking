import { useMemo } from 'react';
import { buildMarket, settle, type Payouts } from '../betting';
import { horseProfiles, simulateRace, weekCard, weekMeeting, type Meeting, type MeetingRace, type World } from '../sim';
import { advanceWorld, clearWorld, getGameStore, getWorldStore, newWorld, useGame, useWorld, type SettledRace } from '../store';

const EMPTY: Meeting = { serial: 0, year: 0, week: 0, weeksPerYear: 0, label: '', races: [] };

/** 名簿の世界（読み込み前は null） */
export function useWorldData(): World | null {
  return useWorld((s) => s.world);
}

/** 今週の開催（観戦できるレース） */
export function useMeeting(): Meeting {
  const world = useWorldData();
  return useMemo(() => (world ? weekMeeting(world, weekCard(world)) : EMPTY), [world]);
}

/** 今週の index 番目のレースの出馬表データとオッズ。結果は観戦時まで計算しない */
export function useRaceCard(index: number) {
  const meeting = useMeeting();
  return useMemo(() => {
    const race = meeting.races[Math.max(0, Math.min(index, meeting.races.length - 1))];
    const profiles = horseProfiles(race.setup);
    const market = buildMarket(race.setup, profiles);
    return { meeting, race, profiles, market };
  }, [meeting, index]);
}

/** レース結果（記録付き）。同じシードなら何度計算しても同じ */
export function useRaceResult(index: number) {
  const { race } = useRaceCard(index);
  return useMemo(() => simulateRace(race.setup), [race]);
}

/** 確定したレースを成績に残すための情報 */
export function settledInfo(race: MeetingRace, popularity: number[]): SettledRace {
  return { venue: race.venue, no: race.no, raceName: race.name, key: race.key, popularity };
}

/** 観戦せずにレースを走らせて、払い戻しと着順を出す */
export function runQuietly(race: MeetingRace): { payouts: Payouts; finishOrder: number[]; info: SettledRace } {
  const result = simulateRace(race.setup, { record: false });
  const finishOrder = result.finish.map((f) => f.number);
  const market = buildMarket(race.setup, horseProfiles(race.setup));
  const popularity = market.boards[market.boards.length - 1].popularity;
  return { payouts: settle(market, finishOrder), finishOrder, info: settledInfo(race, popularity) };
}

/** 次の週へ進める（名簿の世界を1週間走らせ、週の入金を受け取る） */
export async function goNextWeek(): Promise<void> {
  const world = await advanceWorld(getWorldStore(), getGameStore().getState().popularity);
  if (world) getGameStore().getState().beginWeek(world.serial);
}

/** 今週の残りを飛ばして次の週へ。いまのレースに買った馬券があれば、そのレースだけ走らせて精算する */
export async function skipWeek(meeting: Meeting): Promise<void> {
  const game = getGameStore().getState();
  const race = meeting.races[game.raceIndex];
  if (race && game.placed.length > 0) {
    const r = runQuietly(race);
    game.settle(r.payouts, r.finishOrder, r.info);
  }
  await goNextWeek();
}

/** 今週のレースがすべて終わったか */
export function useWeekDone(): boolean {
  const meeting = useMeeting();
  const raceIndex = useGame((s) => s.raceIndex);
  return raceIndex >= meeting.races.length;
}

/** 新しい世界のシード（時刻から。シミュレーションの乱数ではないので Math.random は使わない） */
export function freshSeed(): number {
  return Date.now() % 2_147_483_647;
}

/** コイン・成績・名簿をすべて消して、新しい世界で最初から */
export async function resetEverything(): Promise<void> {
  clearWorld();
  getGameStore().getState().resetAll();
  await newWorld(getWorldStore(), freshSeed());
}
