import { useMemo } from 'react';
import { isHit, settle } from '../betting';
import { groupBets } from './betGroups';
import { useGame } from '../store';
import { RaceViewer } from './RaceViewer';
import { settledInfo, useRaceCard, useRaceResult, useWorldData } from './useRace';
import { storiesFor } from '../sim';

/** 観戦：トラッキング画面と「現在の着順なら的中／不的中」 */
export function Watch() {
  const raceIndex = useGame((s) => s.raceIndex);
  const placed = useGame((s) => s.placed);
  const settleRace = useGame((s) => s.settle);
  const { meeting, race, market } = useRaceCard(raceIndex);
  const world = useWorldData();
  const marks = useGame((s) => s.marks[race.key]);
  const result = useRaceResult(raceIndex);
  const highlight = useMemo(() => new Set(placed.flatMap((b) => b.selection)), [placed]);
  const runners = race.setup.entries.length;
  // 実況に使う、出走馬のこれまでの成績（クラシックの何冠目か・G1何勝目か・連勝など）
  const raceInfo = useMemo(
    () => ({ name: race.name, grade: race.grade, year: meeting.year, stories: world ? storiesFor(world, race.horseIds) : undefined }),
    [race, meeting.year, world],
  );

  const finishOrder = result.finish.map((f) => f.number);
  const popularity = market.boards[market.boards.length - 1].popularity;
  const toResult = () => settleRace(settle(market, finishOrder), finishOrder, settledInfo(race, popularity));

  return (
    <RaceViewer
      result={result}
      eyebrow={`${race.venue} ${race.no}R ${race.grade ? `${race.name}（${race.grade}）` : race.name}`}
      highlight={highlight}
      popularity={popularity}
      marks={marks}
      race={raceInfo}
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
        // まとめ買いは1つにまとめて「◯点中◯点的中」
        const groups = groupBets(
          placed.map((bet, i) => ({ bet, hit: hits[i] })),
          (x) => x.bet,
        ).map((g) => ({ ...g, hitCount: g.items.filter((x) => x.hit).length }));
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
                {groups.map((g) => (
                  <span key={g.key} className={g.hitCount > 0 ? 'hit' : 'miss'}>
                    {g.label}
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
              {groups.map((g) => (
                <li key={g.key} className={g.hitCount > 0 ? 'hit' : 'miss'}>
                  <b>{g.label}</b>
                  <span className="verdict">
                    {g.grouped ? `${g.items.length}点中 ${g.hitCount > 0 ? `${g.hitCount}点的中` : '的中なし'}` : g.hitCount > 0 ? '的中' : '不的中'}
                  </span>
                </li>
              ))}
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
