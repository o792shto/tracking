import { useMemo } from 'react';
import { BET_TYPE_LABEL, isHit, settle } from '../betting';
import { useGame } from '../store';
import { RaceViewer } from './RaceViewer';
import { useRaceCard, useRaceResult } from './useRace';

/** 観戦：トラッキング画面と「現在の着順なら的中／不的中」 */
export function Watch() {
  const raceIndex = useGame((s) => s.raceIndex);
  const placed = useGame((s) => s.placed);
  const settleRace = useGame((s) => s.settle);
  const { meeting, race, market } = useRaceCard(raceIndex);
  const result = useRaceResult(raceIndex);
  const highlight = useMemo(() => new Set(placed.flatMap((b) => b.selection)), [placed]);
  const runners = race.setup.entries.length;

  const finishOrder = result.finish.map((f) => f.number);
  const toResult = () => settleRace(settle(market, finishOrder), finishOrder, meeting.venue);

  return (
    <RaceViewer
      result={result}
      eyebrow={`${meeting.venue} ${race.no}R ${race.grade ? `${race.name}（${race.grade}）` : race.name}`}
      highlight={highlight}
      renderStatus={(order, finished, variant, judging) => {
        if (placed.length === 0) return null;
        const hits = placed.map((bet) => isHit(bet, order, runners));
        // 写真判定中は的中かどうかを伏せる
        if (judging) {
          return (
            <div className={variant === 'bar' ? 'bet-bar' : 'bet-status'} aria-label="馬券の状況">
              <span className="label">写真判定中</span>
              <b>判定を待っています</b>
            </div>
          );
        }
        if (variant === 'bar') {
          // スマホの最下部の細いバー：的中の数と、買い目を短く
          const n = hits.filter(Boolean).length;
          return (
            <div className={`bet-bar ${n > 0 ? 'hit' : 'miss'}`} aria-label="馬券の状況" aria-live="off">
              <span className="label">{finished ? '着順' : '現在の着順なら'}</span>
              <b>
                {n > 0 ? `的中 ${n}` : '不的中'}
                <small>/{placed.length}点</small>
              </b>
              <span className="bets">
                {placed.map((bet, i) => (
                  <span key={i} className={hits[i] ? 'hit' : 'miss'}>
                    {BET_TYPE_LABEL[bet.type]}
                    {bet.selection.join('-')}
                  </span>
                ))}
              </span>
            </div>
          );
        }
        return (
          <div className="bet-status" aria-label="馬券の状況" aria-live="off">
            <span className="label">{finished ? '着順' : '現在の着順なら'}</span>
            <ul>
              {placed.map((bet, i) => {
                const hit = hits[i];
                return (
                  <li key={i} className={hit ? 'hit' : 'miss'}>
                    <span>{BET_TYPE_LABEL[bet.type]}</span>
                    <b>{bet.selection.join('-')}</b>
                    <span className="verdict">{hit ? '的中' : '不的中'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }}
      renderActions={(allFinished, skip) =>
        allFinished ? (
          <button type="button" className="primary go-result" onClick={toResult}>
            結果・払い戻しへ
          </button>
        ) : (
          <button type="button" onClick={skip}>
            スキップ
          </button>
        )
      }
    />
  );
}
