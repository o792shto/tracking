import { useEffect, useState } from 'react';
import { BET_TYPE_LABEL, BETTING } from '../betting';
import { formatTime } from '../sim';
import { frameColor } from '../render';
import { useGame } from '../store';
import { GradeBadge, formatCoins } from './GameHeader';
import { sfx } from './sound';
import { goNextWeek, useRaceCard, useRaceResult } from './useRace';
import { groupBets } from './betGroups';

/** 高配当：1枚の払い戻しが賭け金のこの倍率以上（万馬券）、または払い戻しの合計がこれ以上 */
const BIG_ODDS = 100;
const BIG_RETURN = 50_000;
/** 払い戻しのカウントアップにかける時間（ms） */
const COUNT_MS = 1400;

/** 0 から target まで数を増やしていく（動きを減らす設定ならすぐに target） */
function useCountUp(target: number, onTick?: () => void, animate = true): number {
  const still = () => !animate || target <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(() => (still() ? target : 0));
  useEffect(() => {
    if (still()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let lastTick = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      // 最後はゆっくり止まる
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (onTick && now - lastTick > 70 && p < 1) {
        lastTick = now;
        onTick();
      }
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

/** 確定・払い戻し */
export function ResultScreen() {
  const viewing = useGame((s) => s.viewing);
  const fresh = useGame((s) => s.freshResult);
  const raceIndex = useGame((s) => s.raceIndex);
  const index = viewing ?? Math.max(0, raceIndex - 1);
  const settlement = useGame((s) => s.settlements[index]);
  const go = useGame((s) => s.go);
  const [advancing, setAdvancing] = useState(false);
  const { meeting, race, market } = useRaceCard(index);
  const meetingDone = raceIndex >= meeting.races.length;
  const result = useRaceResult(index);
  const tickets = settlement?.tickets ?? [];
  const returned = tickets.reduce((a, t) => a + t.payout, 0);
  const big =
    returned >= BIG_RETURN || tickets.some((t) => t.payout > 0 && t.payout >= t.bet.stake * BIG_ODDS);
  const shown = useCountUp(returned, sfx.coin, fresh);
  const counted = shown === returned;
  useEffect(() => {
    if (returned <= 0 || !fresh) return;
    const id = window.setTimeout(() => (big ? sfx.fanfare() : sfx.confirm()), COUNT_MS);
    return () => window.clearTimeout(id);
  }, [returned, big, fresh]);

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
  const { payouts } = settlement;
  const spent = tickets.reduce((a, t) => a + t.bet.stake, 0);
  const per100 = (odds: number) => formatCoins(Math.round(odds * BETTING.unit));

  return (
    <main className={`screen result-screen ${big ? 'big-win' : ''}`}>
      {returned > 0 && (
        <div className={`win-banner ${big ? 'big' : ''} ${counted ? 'done' : ''}`} role="status">
          <span className="win-title">{big ? '高配当！' : '的中！'}</span>
          <span className="win-amount">
            +{formatCoins(shown)}
            <small>コイン</small>
          </span>
          {big && <span className="sparkles" aria-hidden="true" />}
        </div>
      )}
      <header className="card-head">
        <div>
          <span className="eyebrow">
            {race.venue} {race.no}R 確定
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
              {payouts.wide && (
                <div>
                  <dt>ワイド</dt>
                  <dd className="multi">
                    {payouts.wide.map((w) => (
                      <span key={w.key}>
                        <span>{w.key}</span>
                        <b>{per100(w.odds)}</b>
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {(['exacta', 'trio', 'trifecta'] as const).map(
                (t) =>
                  payouts[t] && (
                    <div key={t}>
                      <dt>{BET_TYPE_LABEL[t]}</dt>
                      <dd>
                        <span>{payouts[t].key.replace(/>/g, '→')}</span>
                        <b>{per100(payouts[t].odds)}</b>
                      </dd>
                    </div>
                  ),
              )}
            </dl>
          </section>

          <section className="my-tickets" aria-label="あなたの馬券">
            <h2>あなたの馬券</h2>
            {tickets.length === 0 ? (
              <p className="muted">このレースは馬券を買っていません。</p>
            ) : (
              <>
                <ul className="slip">
                  {groupBets(tickets, (t) => t.bet).map((g) => {
                    const won = g.items.reduce((a, t) => a + t.payout, 0);
                    const hitsIn = g.items.filter((t) => t.payout > 0).length;
                    return (
                      <li key={g.key} className={won > 0 ? 'hit' : 'miss'}>
                        <span className="bet-sel">
                          {g.label}
                          {g.grouped && <small className="muted">（{g.items.length}点{hitsIn > 0 ? `中${hitsIn}点的中` : ''}）</small>}
                        </span>
                        <span className="bet-stake">{formatCoins(g.items.reduce((a, t) => a + t.bet.stake, 0))}</span>
                        <span className="bet-payout">{won > 0 ? `+${formatCoins(won)}` : '不的中'}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="balance">
                  購入 {formatCoins(spent)} → 払い戻し <b>{formatCoins(shown)}</b>
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
              <button
                type="button"
                className="primary wide"
                disabled={advancing}
                onClick={() => {
                  setAdvancing(true);
                  void goNextWeek().finally(() => setAdvancing(false));
                }}
              >
                次の週へ
              </button>
            ) : (
              <button type="button" className="primary wide" onClick={() => go('card')}>
                次のレース（{meeting.races[raceIndex].venueName}
                {meeting.races[raceIndex].no}R）の出馬表へ
              </button>
            )}
            <button type="button" className="wide" onClick={() => go('top')}>
              今週のレース一覧へ
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
