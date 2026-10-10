import { useState } from 'react';
import { useGame } from '../store';
import { groupBets } from './betGroups';
import { formatCoins } from './GameHeader';

/** 成績：所持コイン・回収率・最高配当・購入履歴 */
export function RecordScreen() {
  const coins = useGame((s) => s.coins);
  const totals = useGame((s) => s.totals);
  const history = useGame((s) => s.history);
  const redeposits = useGame((s) => s.redeposits);
  const resetAll = useGame((s) => s.resetAll);
  const [confirming, setConfirming] = useState(false);
  const rate = totals.spent > 0 ? `${((totals.returned / totals.spent) * 100).toFixed(1)}%` : '—';
  const hitRate = totals.races > 0 ? `${Math.round((totals.hitRaces / totals.races) * 100)}%` : '—';

  return (
    <main className="screen record-screen">
      <h1>成績</h1>
      <dl className="stats">
        <div>
          <dt>所持コイン</dt>
          <dd>{formatCoins(coins)}</dd>
        </div>
        <div>
          <dt>回収率</dt>
          <dd>{rate}</dd>
        </div>
        <div>
          <dt>的中率（レース単位）</dt>
          <dd>{hitRate}</dd>
        </div>
        <div>
          <dt>最高配当</dt>
          <dd>{formatCoins(totals.bestPayout)}</dd>
        </div>
        <div>
          <dt>購入 / 払い戻し</dt>
          <dd className="small">
            {formatCoins(totals.spent)} / {formatCoins(totals.returned)}
          </dd>
        </div>
        <div>
          <dt>再入金</dt>
          <dd className="small">{redeposits}回</dd>
        </div>
      </dl>

      <h2>購入履歴（新しい順、最大30レース）</h2>
      {history.length === 0 ? (
        <p className="muted">まだ馬券を買っていません。</p>
      ) : (
        <ul className="history">
          {history.map((h, i) => (
            <li key={i}>
              <span className="where">
                {h.venue} {h.raceNo}R
              </span>
              <span className="tickets">
                {groupBets(h.tickets, (t) => t.bet).map((g) => (
                  <span key={g.key} className={g.items.some((t) => t.payout > 0) ? 'hit' : ''}>
                    {g.label}
                    {g.grouped && `（${g.items.length}点）`}
                  </span>
                ))}
              </span>
              <span className={h.returned - h.spent >= 0 ? 'plus' : 'minus'}>
                {h.returned - h.spent >= 0 ? '+' : ''}
                {formatCoins(h.returned - h.spent)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="danger-zone">
        {confirming ? (
          <>
            <span>所持コインと成績をすべて消して最初からやり直します。よろしいですか？</span>
            <button
              type="button"
              className="danger"
              onClick={() => {
                resetAll();
                setConfirming(false);
              }}
            >
              消して最初から
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              やめる
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            データを消して最初から
          </button>
        )}
      </div>
    </main>
  );
}
