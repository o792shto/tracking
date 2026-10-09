import { BET_TYPE_LABEL, BETTING } from '../betting';
import { RACES_PER_MEETING, formatTime } from '../sim';
import { frameColor } from '../render';
import { useGame } from '../store';
import { GradeBadge, formatCoins } from './GameHeader';
import { useRaceCard, useRaceResult } from './useRace';

/** 確定・払い戻し */
export function ResultScreen() {
  const settlement = useGame((s) => s.lastSettlement);
  const raceIndex = useGame((s) => s.raceIndex);
  const go = useGame((s) => s.go);
  const nextMeeting = useGame((s) => s.nextMeeting);
  const index = settlement?.raceIndex ?? Math.max(0, raceIndex - 1);
  const { meeting, race, market } = useRaceCard(index);
  const result = useRaceResult(index);

  if (!settlement) {
    return (
      <main className="screen">
        <p>表示できる結果がありません。</p>
        <button type="button" onClick={() => go('top')}>
          開催トップへ
        </button>
      </main>
    );
  }

  const { entries } = race.setup;
  const board = market.boards[market.boards.length - 1];
  const { payouts, tickets } = settlement;
  const spent = tickets.reduce((a, t) => a + t.bet.stake, 0);
  const returned = tickets.reduce((a, t) => a + t.payout, 0);
  const per100 = (odds: number) => formatCoins(Math.round(odds * BETTING.unit));
  const meetingDone = raceIndex >= RACES_PER_MEETING;

  return (
    <main className="screen result-screen">
      <header className="card-head">
        <div>
          <span className="eyebrow">
            {meeting.venue} {race.no}R 確定
          </span>
          <h1>
            <GradeBadge grade={race.grade} />
            {race.name}
          </h1>
        </div>
      </header>

      <div className="result-grid">
        <section className="result-table" aria-label="着順">
          <h2>着順</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">着</th>
                  <th>馬番</th>
                  <th className="name-col">馬名</th>
                  <th className="num">タイム</th>
                  <th>着差</th>
                  <th className="num">上がり3F</th>
                  <th className="num">人気</th>
                </tr>
              </thead>
              <tbody>
                {result.finish.map((f) => {
                  const e = entries[f.number - 1];
                  const c = frameColor(e.frame);
                  return (
                    <tr key={f.number}>
                      <td className="num">{f.rank}</td>
                      <td>
                        <span className="frame" style={{ background: c.fill, color: c.text, borderColor: c.stroke }}>
                          {f.number}
                        </span>
                      </td>
                      <td className="name-col">{e.horse.name}</td>
                      <td className="num">{formatTime(f.time)}</td>
                      <td>{f.marginLabel}</td>
                      <td className="num">{f.last3f.toFixed(1)}</td>
                      <td className="num">{board.popularity[f.number - 1]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="result-side">
          <section className="payouts" aria-label="払い戻し">
            <h2>払い戻し（100コインあたり）</h2>
            <dl>
              <div>
                <dt>単勝</dt>
                <dd>
                  <span>{payouts.win.number}</span>
                  <b>{per100(payouts.win.odds)}</b>
                </dd>
              </div>
              <div>
                <dt>複勝</dt>
                <dd className="multi">
                  {payouts.place.map((p) => (
                    <span key={p.number}>
                      <span>{p.number}</span>
                      <b>{per100(p.odds)}</b>
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>馬連</dt>
                <dd>
                  <span>{payouts.quinella.key}</span>
                  <b>{per100(payouts.quinella.odds)}</b>
                </dd>
              </div>
            </dl>
          </section>

          <section className="my-tickets" aria-label="あなたの馬券">
            <h2>あなたの馬券</h2>
            {tickets.length === 0 ? (
              <p className="muted">このレースは馬券を買っていません。</p>
            ) : (
              <>
                <ul className="slip">
                  {tickets.map((t, i) => (
                    <li key={i} className={t.payout > 0 ? 'hit' : 'miss'}>
                      <span className="bet-type">{BET_TYPE_LABEL[t.bet.type]}</span>
                      <span className="bet-sel">{t.bet.selection.join('-')}</span>
                      <span className="bet-stake">{formatCoins(t.bet.stake)}</span>
                      <span className="bet-payout">{t.payout > 0 ? `+${formatCoins(t.payout)}` : '不的中'}</span>
                    </li>
                  ))}
                </ul>
                <p className="balance">
                  購入 {formatCoins(spent)} → 払い戻し <b>{formatCoins(returned)}</b>
                  <span className={returned - spent >= 0 ? 'plus' : 'minus'}>
                    （{returned - spent >= 0 ? '+' : ''}
                    {formatCoins(returned - spent)}）
                  </span>
                </p>
              </>
            )}
          </section>

          <div className="result-actions">
            {meetingDone ? (
              <button type="button" className="primary wide" onClick={nextMeeting}>
                次の開催日へ
              </button>
            ) : (
              <button type="button" className="primary wide" onClick={() => go('card')}>
                次のレース（{raceIndex + 1}R）の出馬表へ
              </button>
            )}
            <button type="button" className="wide" onClick={() => go('top')}>
              開催トップへ
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
