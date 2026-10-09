import { BETTING, buildMarket, settle } from '../betting';
import { CONDITION_LABEL, RACES_PER_MEETING, SURFACE_LABEL, horseProfiles, simulateRace } from '../sim';
import { useGame } from '../store';
import { frameColor } from '../render';
import { GradeBadge, formatCoins } from './GameHeader';
import { useMeeting } from './useRace';

/** 開催トップ：本日のレース一覧 */
export function MeetingTop() {
  const meeting = useMeeting();
  const raceIndex = useGame((s) => s.raceIndex);
  const results = useGame((s) => s.results);
  const placed = useGame((s) => s.placed);
  const go = useGame((s) => s.go);
  const nextMeeting = useGame((s) => s.nextMeeting);
  const canRescue = useGame((s) => s.canRescue());
  const claimRescue = useGame((s) => s.claimRescue);
  const settleRace = useGame((s) => s.settle);
  const done = raceIndex >= RACES_PER_MEETING;
  const mainIndex = meeting.races.findIndex((r) => r.no === 11);
  const canSkip = raceIndex < mainIndex;

  /** メインレースの前まで、残りのレースを観戦せずに確定させる（買った馬券は結果どおり精算） */
  const skipToMain = () => {
    for (let i = raceIndex; i < mainIndex; i++) {
      const { setup } = meeting.races[i];
      const result = simulateRace(setup, { record: false });
      const order = result.finish.map((f) => f.number);
      settleRace(settle(buildMarket(setup, horseProfiles(setup)), order), order, meeting.venue);
    }
    go('card');
  };

  return (
    <main className="screen meeting-top">
      <section className="intro">
        <h1>
          {meeting.month}月{meeting.date}日 {meeting.venue}
        </h1>
        <p>
          レースは1Rから順に行います。出馬表で馬券を買って発走させてください。馬券を買わずに観戦だけもできます。
        </p>
        {canSkip && (
          <div className="skip-main">
            <button type="button" className="primary" onClick={skipToMain}>
              メインレース（11R {meeting.races[mainIndex].name}）までスキップ
            </button>
            {placed.length > 0 && <span className="muted small">購入済みの{raceIndex + 1}Rの馬券は、結果どおりに精算します。</span>}
          </div>
        )}
        {canRescue && (
          <div className="rescue" role="status">
            <span>所持コインが{formatCoins(BETTING.rescueThreshold)}未満です。</span>
            <button type="button" className="primary" onClick={claimRescue}>
              救済ボーナス {formatCoins(BETTING.rescueBonus)}コインを受け取る
            </button>
          </div>
        )}
      </section>

      <ol className="race-list">
        {meeting.races.map((race, i) => {
          const { course, entries } = race.setup;
          const top3 = results[i];
          const status = i < raceIndex ? 'done' : i === raceIndex ? 'next' : 'later';
          return (
            <li key={race.no} className={`race-item ${status}`}>
              <span className="race-no">{race.no}R</span>
              <span className="race-desc">
                <strong>
                  <GradeBadge grade={race.grade} />
                  {race.name}
                </strong>
                <span>
                  {race.className && `${race.className}・`}
                  {SURFACE_LABEL[course.surface]}
                  {course.distance}m{race.layoutLabel && `（${race.layoutLabel}）`}・{course.direction === 'right' ? '右' : '左'}・{CONDITION_LABEL[course.condition]}・
                  {entries.length}頭
                </span>
              </span>
              <span className="race-state">
                {status === 'done' && top3 && (
                  <span className="top3" aria-label={`1着から ${top3.join('、')}番`}>
                    {top3.map((num) => {
                      const entry = entries[num - 1];
                      if (!entry) return null;
                      const c = frameColor(entry.frame);
                      return (
                        <span key={num} className="chip" style={{ background: c.fill, color: c.text, borderColor: c.stroke }}>
                          {num}
                        </span>
                      );
                    })}
                  </span>
                )}
                {status === 'next' && (
                  <button type="button" className="primary" onClick={() => go('card')}>
                    {placed.length ? `購入済み ${placed.length}点・出馬表へ` : '出馬表・馬券購入'}
                  </button>
                )}
                {status === 'later' && <span className="muted">発売前</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {done && (
        <div className="meeting-done">
          <p>この日のレースはすべて終わりました。</p>
          <button type="button" className="primary" onClick={nextMeeting}>
            次の開催日へ
          </button>
        </div>
      )}
    </main>
  );
}
