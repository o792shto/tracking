import { useState } from 'react';
import { BETTING } from '../betting';
import { CONDITION_LABEL, SURFACE_LABEL, WEEKDAY_LABEL, type MeetingRace } from '../sim';
import { useGame, type Ticket } from '../store';
import { frameColor } from '../render';
import { GradeBadge, formatCoins } from './GameHeader';
import { goNextWeek, runQuietly, skipWeek, useMeeting, useWorldData } from './useRace';
import { NewsList } from './DataScreen';

/** 今週のトップ：同じ週の開催日のレース（10R〜12R）をまとめて表示する */
export function MeetingTop() {
  const meeting = useMeeting();
  const world = useWorldData();
  const raceIndex = useGame((s) => s.raceIndex);
  const results = useGame((s) => s.results);
  const placed = useGame((s) => s.placed);
  const go = useGame((s) => s.go);
  const openData = useGame((s) => s.openData);
  const settleRace = useGame((s) => s.settle);
  const showResult = useGame((s) => s.showResult);
  const settlements = useGame((s) => s.settlements);
  const [busy, setBusy] = useState(false);
  const done = raceIndex >= meeting.races.length;

  const run = (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void f().finally(() => setBusy(false));
  };

  // 日ごとにまとめる（並びは発走順）
  const days: { key: string; label: string; races: { race: MeetingRace; index: number }[] }[] = [];
  meeting.races.forEach((race, index) => {
    const key = `${race.month}/${race.date}`;
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, label: `${race.month}月${race.date}日（${WEEKDAY_LABEL[race.weekday]}）`, races: [] };
      days.push(day);
    }
    day.races.push({ race, index });
  });
  const news = world ? world.news.filter((n) => n.serial >= world.serial - 1).slice(-4).reverse() : [];

  return (
    <main className="screen meeting-top">
      <section className="intro">
        <h1>
          {meeting.year}年 第{meeting.week}週
          <small>（{meeting.label}）</small>
        </h1>
        <p>
          今週の10R〜12Rを発走順に行います。出馬表で馬券を買って発走させてください。毎週{formatCoins(BETTING.weeklyDeposit)}
          コインが入金されます。
        </p>
        {!done && (
          <div className="skip-main">
            <button type="button" onClick={() => run(() => skipWeek(meeting))} disabled={busy}>
              次の週へスキップ
            </button>
            {placed.length > 0 && <span className="muted small">購入済みのレースの馬券は、結果どおりに精算します。</span>}
          </div>
        )}
      </section>

      {news.length > 0 && (
        <section className="week-news">
          <h2>
            競馬ニュース
            <button type="button" className="link" onClick={() => openData('news')}>
              すべて見る
            </button>
          </h2>
          <NewsList items={news} />
        </section>
      )}

      {days.map((day) => (
        <section key={day.key} className="race-day">
          <h2 className="day-head">{day.label}</h2>
          <ol className="race-list">
            {day.races.map(({ race, index: i }) => {
              const { course, entries } = race.setup;
              const top3 = results[i];
              const status = i < raceIndex ? 'done' : i === raceIndex ? 'next' : 'later';
              return (
                <li key={race.key} className={`race-item ${status}`}>
                  <span className="race-no">
                    <small>{race.venueName}</small>
                    {race.no}R
                  </span>
                  <span className="race-desc">
                    <strong>
                      <GradeBadge grade={race.grade} />
                      {race.name}
                    </strong>
                    <span>
                      {race.className && `${race.className}・`}
                      {SURFACE_LABEL[course.surface]}
                      {course.distance}m{race.layoutLabel && `（${race.layoutLabel}）`}・{course.direction === 'right' ? '右' : '左'}・
                      {CONDITION_LABEL[course.condition]}・{entries.length}頭
                    </span>
                  </span>
                  <span className="race-state">
                    {status === 'done' && settlements[i] && settlements[i].tickets.length > 0 && (
                      <NetResult tickets={settlements[i].tickets} />
                    )}
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
                    {status === 'done' && settlements[i] && (
                      <button type="button" className="detail" onClick={() => showResult(i)}>
                        詳細
                      </button>
                    )}
                    {status === 'next' && (
                      <span className="next-actions">
                        <button type="button" className="primary" onClick={() => go('card')}>
                          {placed.length ? `購入済み ${placed.length}点・出馬表へ` : '出馬表・馬券購入'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const r = runQuietly(race);
                            // 結果画面へは行かずに一覧のまま次へ（詳細はあとから見られる）
                            settleRace(r.payouts, r.finishOrder, r.info, false);
                          }}
                        >
                          結果だけ見る
                        </button>
                      </span>
                    )}
                    {status === 'later' && <span className="muted">発売前</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {done && (
        <div className="meeting-done">
          <p>今週のレースはすべて終わりました。</p>
          <button type="button" className="primary" disabled={busy} onClick={() => run(goNextWeek)}>
            次の週へ
          </button>
        </div>
      )}
    </main>
  );
}

/** 買った馬券の収支（一覧の右に小さく） */
function NetResult({ tickets }: { tickets: Ticket[] }) {
  const spent = tickets.reduce((a, t) => a + t.bet.stake, 0);
  const returned = tickets.reduce((a, t) => a + t.payout, 0);
  const net = returned - spent;
  return (
    <span className={`net ${returned > 0 ? 'hit' : 'miss'}`}>
      {returned > 0 ? '的中 ' : ''}
      {net >= 0 ? '+' : ''}
      {formatCoins(net)}
    </span>
  );
}
