import { useEffect, useRef, useState } from 'react';
import { getSettingsStore, useGame, useSettings } from '../store';
import { sfx, unlockAudio } from './sound';
import { resetEverything, useMeeting } from './useRace';

/** 設定：軽量モードと効果音 */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const lite = useSettings((s) => s.lite);
  const sound = useSettings((s) => s.sound);
  const commentary = useSettings((s) => s.commentary);
  const light = useSettings((s) => s.light);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="settings" ref={ref}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        設定
      </button>
      {open && (
        <div className="settings-menu" role="group" aria-label="設定">
          <label>
            <input
              type="checkbox"
              checked={lite}
              onChange={(ev) => getSettingsStore().getState().setLite(ev.target.checked)}
            />
            <span>
              軽量モード
              <small>軌跡・発光を省き、描画を軽くします</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={sound}
              onChange={(ev) => {
                getSettingsStore().getState().setSound(ev.target.checked);
                if (ev.target.checked) {
                  unlockAudio();
                  sfx.confirm();
                }
              }}
            />
            <span>
              効果音
              <small>カウントダウン・ゴール・払い戻しなど</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={commentary}
              onChange={(ev) => getSettingsStore().getState().setCommentary(ev.target.checked)}
            />
            <span>
              実況の字幕
              <small>コース図の下に実況を出します</small>
            </span>
          </label>
          <label>
            <input type="checkbox" checked={light} onChange={(ev) => getSettingsStore().getState().setLight(ev.target.checked)} />
            <span>
              ライトモード
              <small>明るい背景で表示します</small>
            </span>
          </label>
          <div className="settings-reset">
            {confirming ? (
              <>
                <p>所持コイン・成績・馬の名簿をすべて消して、新しい世界で最初からやり直します。元に戻せません。</p>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setConfirming(false);
                    setOpen(false);
                    void resetEverything();
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
                すべてのデータを消して最初から
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 重賞の格のバッジ */
export function GradeBadge({ grade }: { grade: 'G1' | 'G2' | 'G3' | null }) {
  return grade ? <span className={`grade ${grade}`}>{grade}</span> : null;
}

export function formatCoins(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 全画面共通の見出し：今週・所持コイン・回収率・画面切替 */
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
        <span className="eyebrow">
          {meeting.year}年・第{meeting.week}週/{meeting.weeksPerYear}
        </span>
        <strong>{meeting.label}</strong>
      </div>
      <nav className="game-nav" aria-label="画面">
        <button type="button" disabled={busy} className={screen === 'top' ? 'on' : ''} onClick={() => go('top')}>
          今週
        </button>
        <button type="button" disabled={busy} className={screen === 'data' ? 'on' : ''} onClick={() => go('data')}>
          データ
        </button>
        <button type="button" disabled={busy} className={screen === 'record' ? 'on' : ''} onClick={() => go('record')}>
          成績
        </button>
        <SettingsMenu />
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
