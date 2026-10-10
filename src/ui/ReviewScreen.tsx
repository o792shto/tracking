import { GRADED_RACES_2026, RACE_WEEKS, weekLabel } from '../sim';
import { useGame } from '../store';
import { HorseLink } from './DataScreen';
import { GradeBadge, formatCoins } from './GameHeader';
import { useWorldData } from './useRace';

const DOMESTIC = new Set(GRADED_RACES_2026.map((g) => g.name));

/** 年末のふりかえり：年度代表馬・表彰・その年の G1・海外の G1・自分の馬券の成績 */
export function ReviewScreen() {
  const world = useWorldData();
  const year = useGame((s) => s.reviewYear);
  const totals = useGame((s) => (year !== null ? s.yearTotals[year] : undefined));
  const go = useGame((s) => s.go);
  if (!world || year === null) return null;
  const awards = world.awards.filter((a) => a.year === year);
  const top = awards.find((a) => a.title === '年度代表馬');
  const g1 = world.graded.filter((g) => g.year === year && g.grade === 'G1');
  const abroad = world.horses.flatMap((h) =>
    h.graded.filter((g) => g.year === year && !DOMESTIC.has(g.name)).map((g) => ({ id: h.id, name: h.name, race: g.name })),
  );
  const rate = totals && totals.spent > 0 ? `${((totals.returned / totals.spent) * 100).toFixed(1)}%` : '—';
  const hitRate = totals && totals.races > 0 ? `${Math.round((totals.hitRaces / totals.races) * 100)}%` : '—';

  return (
    <main className="screen review-screen">
      <h1>{year}年のふりかえり</h1>
      {top && (
        <section className="review-hero">
          <span className="eyebrow">年度代表馬</span>
          <strong>
            <HorseLink id={top.horseId} name={top.name} />
          </strong>
          <span>{top.reason}</span>
        </section>
      )}

      <section>
        <h2>あなたの馬券</h2>
        {totals && totals.races > 0 ? (
          <dl className="stats">
            <div>
              <dt>回収率</dt>
              <dd>{rate}</dd>
            </div>
            <div>
              <dt>収支</dt>
              <dd className={totals.returned - totals.spent >= 0 ? 'plus' : 'minus'}>
                {totals.returned - totals.spent >= 0 ? '+' : ''}
                {formatCoins(totals.returned - totals.spent)}
              </dd>
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
          </dl>
        ) : (
          <p className="muted">この年は馬券を買いませんでした。</p>
        )}
      </section>

      {awards.length > 1 && (
        <section>
          <h2>表彰</h2>
          <dl className="awards">
            {awards
              .filter((a) => a.title !== '年度代表馬')
              .map((a) => (
                <div key={a.title}>
                  <dt>{a.title}</dt>
                  <dd>
                    <HorseLink id={a.horseId} name={a.name} />
                    <small>{a.reason}</small>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      <section>
        <h2>G1の勝ち馬</h2>
        <ul className="review-g1">
          {g1.map((g) => (
            <li key={`${g.week}-${g.name}`}>
              <span className="muted small">{weekLabel(RACE_WEEKS[g.week])}</span>
              <span>
                <GradeBadge grade="G1" />
                {g.name}
              </span>
              <HorseLink id={g.top3[0].id} name={g.top3[0].name} />
            </li>
          ))}
        </ul>
        {abroad.length > 0 && (
          <>
            <h3>海外のG1</h3>
            <ul className="review-g1">
              {abroad.map((a) => (
                <li key={`${a.id}-${a.race}`}>
                  <span />
                  <span>{a.race}</span>
                  <HorseLink id={a.id} name={a.name} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="result-actions">
        <button type="button" className="primary wide" onClick={() => go('top')}>
          今週のレースへ
        </button>
      </div>
    </main>
  );
}
