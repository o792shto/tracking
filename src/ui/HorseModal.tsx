import { useEffect } from 'react';
import { STYLE_LABEL, SURFACE_LABEL, formatPrize, formatTime, tierLabel, weekOf } from '../sim';
import { useGame } from '../store';
import { GradeBadge } from './GameHeader';
import { recordLine, sexAge } from './DataScreen';
import { useWorldData } from './useRace';

const RETIRE_LABEL = { age: '引退', injury: '故障で引退', results: '引退', stud: '引退（種牡馬・繁殖入り）', maiden: '引退' } as const;

/** 馬の詳細（成績・重賞勝ち・直近の成績） */
export function HorseModal() {
  const id = useGame((s) => s.horseId);
  const close = useGame((s) => s.showHorse);
  const world = useWorldData();
  useEffect(() => {
    if (id === null) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, close]);
  if (id === null || !world) return null;
  const h = world.horses.find((x) => x.id === id);
  const year = weekOf(world.serial).year;
  const awards = world.awards.filter((a) => a.horseId === id);
  const resting = h && !h.retired && h.restUntil !== null && h.restUntil > world.serial;

  return (
    <div className="modal-backdrop" onClick={() => close(null)}>
      <div className="modal horse-modal" role="dialog" aria-modal="true" aria-label="馬の詳細" onClick={(ev) => ev.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="閉じる" onClick={() => close(null)}>
          ×
        </button>
        {!h ? (
          <p className="muted">この馬の記録は残っていません（引退して名簿から外れました）。</p>
        ) : (
          <>
            <header>
              <h2>{h.name}</h2>
              <p className="horse-meta">
                {sexAge(h, year)}・{STYLE_LABEL[h.style]}・{tierLabel(h.tier)}
                {h.retired && <span className="tag soft">{RETIRE_LABEL[h.retired.reason]}</span>}
                {resting && <span className="tag soft">休養中</span>}
              </p>
            </header>
            <dl className="horse-stats">
              <div>
                <dt>通算成績</dt>
                <dd>{recordLine(h)}</dd>
              </div>
              <div>
                <dt>獲得賞金</dt>
                <dd>{formatPrize(h.earnings)}</dd>
              </div>
            </dl>
            {(h.graded.length > 0 || awards.length > 0) && (
              <section>
                <h3>主な勝ち鞍・表彰</h3>
                <ul className="graded-wins">
                  {h.graded.map((g, i) => (
                    <li key={i}>
                      <GradeBadge grade={g.grade} />
                      {g.year} {g.name}
                    </li>
                  ))}
                  {awards.map((a) => (
                    <li key={`${a.year}-${a.title}`} className="award">
                      {a.year} {a.title}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3>近走（新しい順）</h3>
              {h.runs.length === 0 ? (
                <p className="muted">まだ走っていません。</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table runs">
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>レース</th>
                        <th>距離</th>
                        <th className="num">頭数</th>
                        <th className="num">人気</th>
                        <th className="num">着順</th>
                        <th className="num">タイム</th>
                        <th>着差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...h.runs].reverse().map((r, i) => (
                        <tr key={i} className={r.rank === 1 ? 'won' : ''}>
                          <td className="small">
                            {r.year}/{r.month}/{r.day} {r.venue}
                            {r.abroad && <span className="tag soft">海外</span>}
                          </td>
                          <td>
                            <GradeBadge grade={r.grade} />
                            {r.race}
                          </td>
                          <td>
                            {SURFACE_LABEL[r.surface]}
                            {r.distance}
                          </td>
                          <td className="num">{r.runners}</td>
                          <td className="num">{r.popularity ?? '—'}</td>
                          <td className="num rank">{r.rank}</td>
                          <td className="num">{r.time > 0 ? formatTime(r.time) : '—'}</td>
                          <td className="small">{r.margin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
