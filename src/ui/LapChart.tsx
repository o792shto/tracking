import { formatTime, type RaceResult } from '../sim';
import { lapsSoFar, paceReadout, referenceLap } from '../render';

const PACE_LABEL = { high: 'ハイ', middle: '平均', slow: 'スロー' } as const;

/** 基準ラップとの差をこの秒数で振り切る */
const MAX_DIFF = 1.5;

interface Props {
  result: RaceResult;
  time: number;
}

/**
 * 200mごとのラップの棒グラフ。棒は基準ラップ（平均的な馬の巡航ペース）からの差で、
 * 上に伸びるほど速い区間、下に伸びるほど遅い区間。棒の下に実際のラップを書く。
 */
export function LapChart({ result, time }: Props) {
  const laps = lapsSoFar(result, time);
  const total = result.laps.length;
  const ref = referenceLap(result);
  const pace = paceReadout(result, time);

  return (
    <section className="lap-chart" aria-label="ラップ">
      <header>
        <h2>ラップ</h2>
        <span className="lap-legend">
          <i className="sw fast" />
          基準より速い
          <i className="sw slow" />
          遅い
          <span className="ref">基準 {ref.toFixed(1)}</span>
        </span>
        <span className="pace">
          <span>
            前半3F <b>{pace.first3f !== null ? pace.first3f.toFixed(1) : '--.-'}</b>
          </span>
          <span>
            後半3F <b>{pace.last3f !== null ? pace.last3f.toFixed(1) : '--.-'}</b>
          </span>
          <span className={`pace-pill ${pace.judgement ?? 'pending'}`}>
            {pace.judgement ? `${PACE_LABEL[pace.judgement]}ペース` : '判定待ち'}
          </span>
        </span>
      </header>
      <ol className="laps" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {result.laps.map((_, i) => {
          const lap = laps[i];
          const label = `${(i + 1) * 200}`;
          if (lap === undefined) {
            return (
              <li key={i} className="lap pending">
                <span className="bar-area" />
                <span className="lap-time">--.-</span>
                <span className="dist">{label}</span>
              </li>
            );
          }
          const diff = Math.max(-MAX_DIFF, Math.min(MAX_DIFF, ref - lap));
          const pct = Math.max(3, (Math.abs(diff) / MAX_DIFF) * 50);
          const fast = diff >= 0;
          return (
            <li
              key={i}
              className={`lap ${i === laps.length - 1 ? 'latest' : ''}`}
              title={`${label}m地点 ${lap.toFixed(1)}秒（基準より${Math.abs(ref - lap).toFixed(1)}秒${fast ? '速い' : '遅い'}）`}
            >
              <span className="bar-area">
                <span
                  className={fast ? 'bar fast' : 'bar slow'}
                  style={fast ? { bottom: '50%', height: `${pct}%` } : { top: '50%', height: `${pct}%` }}
                />
              </span>
              <span className="lap-time">{lap.toFixed(1)}</span>
              <span className="dist">{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        {laps.length ? `ここまでのラップ ${laps.map((l) => l.toFixed(1)).join('、')}` : 'ラップはまだありません'}
        {pace.judgement ? `。走破 ${formatTime(result.finish[0].time)}` : ''}
      </p>
    </section>
  );
}
