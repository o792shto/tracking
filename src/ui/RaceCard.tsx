import { useEffect, useState } from 'react';
import {
  BETTING,
  BET_TYPE_LABEL,
  BET_TYPE_PICKS,
  expectedReturn,
  quinellaKey,
  type Bet,
  type BetType,
} from '../betting';
import { CONDITION_LABEL, STYLE_LABEL, SURFACE_LABEL, formatPastRun } from '../sim';
import { frameColor } from '../render';
import { placedTotal, useGame } from '../store';
import { GradeBadge, formatCoins } from './GameHeader';
import { useRaceCard } from './useRace';

/** 発走前のオッズ表示が切り替わる間隔（ms） */
const BOARD_INTERVAL = 3500;
const BET_TYPES: BetType[] = ['win', 'place', 'quinella'];

function formatRange(min: number, max: number): string {
  return min === max ? formatCoins(Math.floor(min)) : `${formatCoins(Math.floor(min))}〜${formatCoins(Math.floor(max))}`;
}

/** 出馬表と馬券購入 */
export function RaceCard() {
  const raceIndex = useGame((s) => s.raceIndex);
  const { meeting, race, profiles, market } = useRaceCard(raceIndex);
  const coins = useGame((s) => s.coins);
  const placed = useGame((s) => s.placed);
  const buy = useGame((s) => s.buy);
  const cancel = useGame((s) => s.cancel);
  const go = useGame((s) => s.go);

  const [board, setBoard] = useState(0);
  const [type, setType] = useState<BetType>('win');
  const [selection, setSelection] = useState<number[]>([]);
  const [stake, setStake] = useState(100);
  const [message, setMessage] = useState<string | null>(null);

  // 発走前のオッズ変動：何度か更新して確定オッズで止まる
  useEffect(() => {
    setBoard(0);
    const id = window.setInterval(() => {
      setBoard((b) => {
        if (b >= market.boards.length - 1) {
          window.clearInterval(id);
          return b;
        }
        return b + 1;
      });
    }, BOARD_INTERVAL);
    return () => window.clearInterval(id);
  }, [market]);

  const odds = market.boards[board];
  const final = board === market.boards.length - 1;
  const { course, entries } = race.setup;
  const picks = BET_TYPE_PICKS[type];
  const total = placedTotal(placed);
  const remainingLimit = Math.min(BETTING.raceLimit - total, coins);

  const toggle = (num: number) => {
    setMessage(null);
    setSelection((sel) => {
      if (sel.includes(num)) return sel.filter((n) => n !== num);
      const next = [...sel, num];
      return next.length > picks ? next.slice(next.length - picks) : next;
    });
  };
  const changeType = (t: BetType) => {
    setType(t);
    setSelection((sel) => sel.slice(-BET_TYPE_PICKS[t]));
    setMessage(null);
  };

  const ready = selection.length === picks;
  const draft: Bet | null = ready ? { type, selection: [...selection].sort((a, b) => a - b), stake } : null;
  const preview = draft ? expectedReturn(draft, market, board) : null;

  const submit = () => {
    if (!draft) return;
    const error = buy(draft);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage(`${BET_TYPE_LABEL[draft.type]} ${draft.selection.join('-')} を ${formatCoins(draft.stake)}コイン購入しました`);
    setSelection([]);
  };

  const ticketOdds = (bet: Bet) => {
    if (bet.type === 'win') return `${odds.win[bet.selection[0] - 1].toFixed(1)}倍`;
    if (bet.type === 'place') {
      const r = odds.place[bet.selection[0] - 1];
      return `${r.min.toFixed(1)}〜${r.max.toFixed(1)}倍`;
    }
    return `${odds.quinella.get(quinellaKey(bet.selection[0], bet.selection[1]))!.toFixed(1)}倍`;
  };

  return (
    <main className="screen race-card">
      <header className="card-head">
        <div>
          <span className="eyebrow">
            {meeting.venue} {race.no}R
          </span>
          <h1>
            <GradeBadge grade={race.grade} />
            {race.name}　{SURFACE_LABEL[course.surface]}
            {course.distance}m
          </h1>
          <span className="race-meta">
            {race.className && `${race.className}・`}
            {course.direction === 'right' ? '右回り' : '左回り'}・馬場 {CONDITION_LABEL[course.condition]}・
            {entries.length}頭
          </span>
        </div>
        <span className={`odds-state ${final ? 'final' : ''}`} role="status">
          {final ? '最終オッズ' : `オッズ更新中 ${board + 1}/${market.boards.length}`}
        </span>
      </header>

      <div className="card-body">
        <div className="table-wrap">
          <table className="entry-table">
            <thead>
              <tr>
                <th>枠</th>
                <th>馬番</th>
                <th className="name-col">馬名</th>
                <th>脚質</th>
                <th>近走（新しい順）</th>
                <th>短評</th>
                <th className="num">単勝</th>
                <th className="num">人気</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const c = frameColor(e.frame);
                const profile = profiles[i];
                const selected = selection.includes(e.number);
                return (
                  <tr
                    key={e.number}
                    className={selected ? 'selected' : ''}
                    onClick={() => toggle(e.number)}
                  >
                    <td>
                      <span className="frame" style={{ background: c.fill, color: c.text, borderColor: c.stroke }}>
                        {e.frame}
                      </span>
                    </td>
                    <td className="num-cell">
                      <button
                        type="button"
                        className="pick"
                        aria-pressed={selected}
                        aria-label={`${e.number}番 ${e.horse.name}を選ぶ`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          toggle(e.number);
                        }}
                      >
                        {e.number}
                      </button>
                    </td>
                    <td className="name-col">{e.horse.name}</td>
                    <td>{STYLE_LABEL[e.horse.style]}</td>
                    <td>
                      <span className="recent">
                        {profile.recent.map((r, k) => (
                          <span key={k} className={r.rank <= 3 ? 'good' : ''} title={formatPastRun(r)}>
                            {r.rank}
                            <small>/{r.runners}</small>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="comment">{profile.comments.join('、')}</td>
                    <td className="num odds">{odds.win[i].toFixed(1)}</td>
                    <td className="num">{odds.popularity[i]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="bet-panel" aria-label="馬券購入">
          <h2>馬券を買う</h2>
          <div className="seg-group" role="group" aria-label="券種">
            {BET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={type === t ? 'seg on' : 'seg'}
                aria-pressed={type === t}
                onClick={() => changeType(t)}
              >
                {BET_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="hint">
            {type === 'win' && '1着になる馬を1頭選びます。'}
            {type === 'place' && `${entries.length <= 7 ? '2' : '3'}着以内に入る馬を1頭選びます。`}
            {type === 'quinella' && '1・2着になる2頭を選びます（順不同）。'}
            出馬表の馬番をタップしてください。
          </p>
          <div className="selection" aria-live="polite">
            選択：{selection.length ? [...selection].sort((a, b) => a - b).join(' - ') : 'なし'}
          </div>

          <label className="stake" htmlFor="stake">
            金額（{BETTING.unit}コイン単位）
          </label>
          <div className="stake-row">
            <button type="button" onClick={() => setStake((s) => Math.max(BETTING.unit, s - BETTING.unit))} aria-label="100減らす">
              −
            </button>
            <input
              id="stake"
              type="number"
              inputMode="numeric"
              min={BETTING.unit}
              step={BETTING.unit}
              value={stake}
              onChange={(ev) => setStake(Math.max(0, Math.floor(Number(ev.target.value) || 0)))}
            />
            <button type="button" onClick={() => setStake((s) => s + BETTING.unit)} aria-label="100増やす">
              ＋
            </button>
          </div>

          <dl className="preview">
            <div>
              <dt>点数</dt>
              <dd>{ready ? 1 : 0}点</dd>
            </div>
            <div>
              <dt>金額</dt>
              <dd>{formatCoins(ready ? stake : 0)}</dd>
            </div>
            <div>
              <dt>想定配当</dt>
              <dd>{preview ? formatRange(preview.min, preview.max) : '—'}</dd>
            </div>
          </dl>
          <button type="button" className="primary wide" disabled={!ready} onClick={submit}>
            購入する
          </button>
          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}

          <h3>
            購入した馬券 <span className="muted">合計 {formatCoins(total)}／上限 {formatCoins(BETTING.raceLimit)}</span>
          </h3>
          {placed.length === 0 ? (
            <p className="muted">まだありません。</p>
          ) : (
            <ul className="slip">
              {placed.map((bet, i) => (
                <li key={i}>
                  <span className="bet-type">{BET_TYPE_LABEL[bet.type]}</span>
                  <span className="bet-sel">{bet.selection.join('-')}</span>
                  <span className="bet-odds">{ticketOdds(bet)}</span>
                  <span className="bet-stake">{formatCoins(bet.stake)}</span>
                  <button type="button" className="cancel" onClick={() => cancel(i)} aria-label="取り消す">
                    取消
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">あと{formatCoins(Math.max(0, remainingLimit))}コインまで買えます。払い戻しは確定オッズで計算します。</p>

          <button type="button" className="start wide" onClick={() => go('watch')}>
            {placed.length ? '発走する' : '馬券を買わずに観戦する'}
          </button>
        </aside>
      </div>
    </main>
  );
}
