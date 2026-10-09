import { useGame } from '../store';
import { useMeeting } from './useRace';

export function formatCoins(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 全画面共通の見出し：開催名・所持コイン・回収率・画面切替 */
export function GameHeader() {
  const meeting = useMeeting();
  const coins = useGame((s) => s.coins);
  const totals = useGame((s) => s.totals);
  const screen = useGame((s) => s.screen);
  const go = useGame((s) => s.go);
  const rate = totals.spent > 0 ? `${Math.round((totals.returned / totals.spent) * 100)}%` : '—';
  const busy = screen === 'watch';

  return (
    <header className="game-header">
      <div className="meeting-name">
        <span className="eyebrow">{meeting.day}日目</span>
        <strong>{meeting.venue}</strong>
      </div>
      <nav className="game-nav" aria-label="画面">
        <button type="button" disabled={busy} className={screen === 'top' ? 'on' : ''} onClick={() => go('top')}>
          開催トップ
        </button>
        <button type="button" disabled={busy} className={screen === 'record' ? 'on' : ''} onClick={() => go('record')}>
          成績
        </button>
      </nav>
      <div className="wallet">
        <div className="readout">
          <span className="label">回収率</span>
          <span className="value small">{rate}</span>
        </div>
        <div className="readout">
          <span className="label">所持コイン</span>
          <span className="value">{formatCoins(coins)}</span>
        </div>
      </div>
    </header>
  );
}
