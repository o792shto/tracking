import { useMemo } from 'react';
import { buildMarket } from '../betting';
import { createMeeting, horseProfiles, simulateRace } from '../sim';
import { useGame } from '../store';

/** 現在の開催 */
export function useMeeting() {
  const meetingSeed = useGame((s) => s.meetingSeed);
  return useMemo(() => createMeeting(meetingSeed), [meetingSeed]);
}

/** 開催の index 番目のレースの出馬表データとオッズ。結果は観戦時まで計算しない */
export function useRaceCard(index: number) {
  const meeting = useMeeting();
  return useMemo(() => {
    const race = meeting.races[Math.min(index, meeting.races.length - 1)];
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
