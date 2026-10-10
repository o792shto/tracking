import { useMemo, useState } from 'react';
import {
  FIRST_YEAR,
  RACE_WEEKS,
  SEX_LABEL,
  WEEKDAY_LABEL,
  ageOf,
  formatPrize,
  formatTime,
  tierLabel,
  weekLabel,
  weekOf,
  type NewsItem,
  type World,
  type WorldHorse,
} from '../sim';
import { useGame, type DataTab } from '../store';
import { GradeBadge } from './GameHeader';
import { useWorldData } from './useRace';

const TABS: { tab: DataTab; label: string }[] = [
  { tab: 'calendar', label: 'カレンダー' },
  { tab: 'ranking', label: 'ランキング' },
  { tab: 'graded', label: '重賞勝ち馬' },
  { tab: 'awards', label: '年度表彰' },
  { tab: 'news', label: 'ニュース' },
  { tab: 'favorites', label: 'お気に入り' },
];

/** 馬名（タップで馬の詳細） */
export function HorseLink({ id, name }: { id: number; name: string }) {
  const showHorse = useGame((s) => s.showHorse);
  return (
    <button type="button" className="horse-link" onClick={() => showHorse(id)}>
      {name}
    </button>
  );
}

/** 性齢（例：「牡3」） */
export function sexAge(h: Pick<WorldHorse, 'sex' | 'birthYear'>, year: number): string {
  return `${SEX_LABEL[h.sex]}${ageOf(h, year)}`;
}

function currentYear(world: World): number {
  return weekOf(world.serial).year;
}

function YearSelect({ world, year, onChange, from = FIRST_YEAR - 1 }: { world: World; year: number; onChange: (y: number) => void; from?: number }) {
  const last = currentYear(world);
  const years: number[] = [];
  for (let y = last; y >= from; y--) years.push(y);
  return (
    <label className="year-select">
      <select value={year} onChange={(ev) => onChange(Number(ev.target.value))} aria-label="年">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}年
          </option>
        ))}
      </select>
    </label>
  );
}

/** データ画面：カレンダー・ランキング・重賞勝ち馬・年度表彰・ニュース */
export function DataScreen() {
  const world = useWorldData();
  const tab = useGame((s) => s.dataTab);
  const openData = useGame((s) => s.openData);
  if (!world) return null;
  return (
    <main className="screen data-screen">
      <div className="seg-group data-tabs" role="tablist" aria-label="データ">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={tab === t.tab}
            className={tab === t.tab ? 'seg on' : 'seg'}
            onClick={() => openData(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'calendar' && <Calendar world={world} />}
      {tab === 'ranking' && <Ranking world={world} />}
      {tab === 'graded' && <GradedWinners world={world} />}
      {tab === 'awards' && <Awards world={world} />}
      {tab === 'favorites' && <Favorites world={world} />}
      {tab === 'news' && (
        <section>
          <h1>競馬ニュース</h1>
          <NewsList items={[...world.news].reverse()} withDate />
        </section>
      )}
    </main>
  );
}

/** 1年の開催の暦。終わった重賞は勝ち馬を出す */
function Calendar({ world }: { world: World }) {
  const now = weekOf(world.serial);
  const [year, setYear] = useState(now.year);
  const results = new Map(world.graded.filter((g) => g.year === year).map((g) => [`${g.week}-${g.name}`, g]));
  return (
    <section>
      <h1>
        開催カレンダー <YearSelect world={world} year={year} onChange={setYear} from={FIRST_YEAR} />
      </h1>
      <ol className="calendar">
        {RACE_WEEKS.map((week) => {
          const current = year === now.year && week.index === now.week.index;
          const past = year < now.year || (year === now.year && week.index < now.week.index);
          return (
            <li key={week.index} className={`cal-week ${current ? 'current' : ''} ${past ? 'past' : ''}`}>
              <div className="cal-date">
                <b>第{week.index + 1}週</b>
                <span>{weekLabel(week)}</span>
                {current && <span className="tag">今週</span>}
                {week.afterSummer && <span className="tag soft">夏明け</span>}
                {week.debut && <span className="tag soft">2歳デビュー</span>}
              </div>
              <ul className="cal-races">
                {week.days.flatMap((d) =>
                  [d.main, d.last].flatMap((g) => {
                    if (!g) return [];
                    const r = results.get(`${week.index}-${g.name}`);
                    return [
                      <li key={`${d.month}-${d.day}-${g.name}`}>
                        <span className="cal-day">
                          {d.month}/{d.day}（{WEEKDAY_LABEL[d.weekday]}）{d.venue}
                        </span>
                        <span className="cal-name">
                          <GradeBadge grade={g.grade} />
                          {g.name}
                        </span>
                        <span className="cal-winner">{r ? <HorseLink id={r.top3[0].id} name={r.top3[0].name} /> : null}</span>
                      </li>,
                    ];
                  }),
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type RankKey = 'year' | 'total' | 'g1';
type AgeFilter = 'all' | '2' | '3' | 'older';

function Ranking({ world }: { world: World }) {
  const year = currentYear(world);
  const [key, setKey] = useState<RankKey>('year');
  const [age, setAge] = useState<AgeFilter>('all');
  const rows = useMemo(() => {
    const value = (h: WorldHorse) =>
      key === 'year' ? (h.earningsByYear[year] ?? 0) : key === 'total' ? h.earnings : h.graded.filter((g) => g.grade === 'G1').length;
    return world.horses
      .filter((h) => !h.retired)
      .filter((h) => {
        const a = ageOf(h, year);
        return age === 'all' || (age === '2' ? a === 2 : age === '3' ? a === 3 : a >= 4);
      })
      .map((h) => ({ h, v: value(h) }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v || b.h.earnings - a.h.earnings)
      .slice(0, 50);
  }, [world, key, age, year]);
  return (
    <section>
      <h1>ランキング（現役馬）</h1>
      <div className="filters">
        <div className="seg-group" role="group" aria-label="並べ方">
          {(
            [
              ['year', `${year}年の賞金`],
              ['total', '通算賞金'],
              ['g1', 'G1勝利数'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={key === k ? 'seg on' : 'seg'} aria-pressed={key === k} onClick={() => setKey(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="seg-group" role="group" aria-label="年齢">
          {(
            [
              ['all', 'すべて'],
              ['2', '2歳'],
              ['3', '3歳'],
              ['older', '古馬'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={age === k ? 'seg on' : 'seg'} aria-pressed={age === k} onClick={() => setAge(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">まだ該当する馬がいません。</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">順位</th>
                <th>馬名</th>
                <th>性齢</th>
                <th>クラス</th>
                <th>成績</th>
                <th className="num">{key === 'g1' ? 'G1' : '賞金'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ h, v }, i) => (
                <tr key={h.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <HorseLink id={h.id} name={h.name} />
                  </td>
                  <td>{sexAge(h, year)}</td>
                  <td>{tierLabel(h.tier)}</td>
                  <td className="small">{recordLine(h)}</td>
                  <td className="num">{key === 'g1' ? `${v}勝` : formatPrize(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 通算成績（例：「12戦4勝 [4-2-1-5]」） */
export function recordLine(h: WorldHorse): string {
  const other = h.starts - h.wins - h.seconds - h.thirds;
  return `${h.starts}戦${h.wins}勝 [${h.wins}-${h.seconds}-${h.thirds}-${other}]`;
}

function GradedWinners({ world }: { world: World }) {
  const [year, setYear] = useState(currentYear(world));
  const [grade, setGrade] = useState<'all' | 'G1'>('all');
  const list = world.graded.filter((g) => g.year === year && (grade === 'all' || g.grade === 'G1'));
  return (
    <section>
      <h1>
        重賞勝ち馬 <YearSelect world={world} year={year} onChange={setYear} />
      </h1>
      <div className="seg-group" role="group" aria-label="格">
        <button type="button" className={grade === 'all' ? 'seg on' : 'seg'} onClick={() => setGrade('all')}>
          すべて
        </button>
        <button type="button" className={grade === 'G1' ? 'seg on' : 'seg'} onClick={() => setGrade('G1')}>
          G1のみ
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted">この年の重賞はまだ行われていません。</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>週</th>
                <th>レース</th>
                <th>1着</th>
                <th>2着</th>
                <th>3着</th>
                <th className="num">タイム</th>
              </tr>
            </thead>
            <tbody>
              {list.map((g) => (
                <tr key={`${g.week}-${g.name}`}>
                  <td className="small">{weekLabel(RACE_WEEKS[g.week])}</td>
                  <td>
                    <GradeBadge grade={g.grade} />
                    {g.name}
                    <small className="muted">（{g.venue}）</small>
                  </td>
                  {[0, 1, 2].map((k) => (
                    <td key={k}>{g.top3[k] ? <HorseLink id={g.top3[k].id} name={g.top3[k].name} /> : '—'}</td>
                  ))}
                  <td className="num">{formatTime(g.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Favorites({ world }: { world: World }) {
  const favorites = useGame((s) => s.favorites);
  const year = currentYear(world);
  const horses = favorites.map((id) => world.horses.find((h) => h.id === id)).filter((h): h is WorldHorse => !!h);
  return (
    <section>
      <h1>お気に入りの馬</h1>
      {horses.length === 0 ? (
        <p className="muted">馬の詳細の「☆ お気に入りに入れる」で登録できます。出走する週は、今週のレース一覧に ★ が付きます。</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>馬名</th>
                <th>性齢</th>
                <th>クラス</th>
                <th>成績</th>
                <th>前走</th>
                <th className="num">賞金</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h) => {
                const last = h.runs[h.runs.length - 1];
                return (
                  <tr key={h.id}>
                    <td>
                      <HorseLink id={h.id} name={h.name} />
                    </td>
                    <td>{h.retired ? '引退' : sexAge(h, year)}</td>
                    <td>{tierLabel(h.tier)}</td>
                    <td className="small">{recordLine(h)}</td>
                    <td className="small">{last ? `${last.month}/${last.day} ${last.race} ${last.rank}着` : '—'}</td>
                    <td className="num">{formatPrize(h.earnings)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Awards({ world }: { world: World }) {
  const showReview = useGame((s) => s.showReview);
  const years = [...new Set(world.awards.map((a) => a.year))].sort((a, b) => b - a);
  if (years.length === 0) return <p className="muted">まだ表彰はありません。</p>;
  return (
    <section>
      <h1>年度表彰</h1>
      {years.map((y) => (
        <div key={y} className="award-year">
          <h2>
            {y}年
            <button type="button" className="link" onClick={() => showReview(y)}>
              ふりかえりを見る
            </button>
          </h2>
          <dl className="awards">
            {world.awards
              .filter((a) => a.year === y)
              .map((a) => (
                <div key={a.title} className={a.title === '年度代表馬' ? 'top' : ''}>
                  <dt>{a.title}</dt>
                  <dd>
                    <HorseLink id={a.horseId} name={a.name} />
                    <small>{a.reason}</small>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

/** ニュースの一覧 */
export function NewsList({ items, withDate = false }: { items: NewsItem[]; withDate?: boolean }) {
  const world = useWorldData();
  if (items.length === 0) return <p className="muted">ニュースはまだありません。</p>;
  const nameOf = (id: number) => world?.horses.find((h) => h.id === id)?.name;
  return (
    <ul className="news-list">
      {items.map((n, i) => {
        const { year, week } = weekOf(n.serial);
        return (
          <li key={i} className={`news ${n.kind}`}>
            {withDate && (
              <span className="news-date">
                {year}年 {weekLabel(week)}
              </span>
            )}
            {n.horseIds.length === 1 ? (
              <NewsTitle id={n.horseIds[0]} title={n.title} />
            ) : (
              <b>{n.title}</b>
            )}
            <span>{n.body}</span>
            {n.horseIds.length > 1 && (
              <span className="news-horses">
                {n.horseIds.map((id) => {
                  const name = nameOf(id);
                  return name ? <HorseLink key={id} id={id} name={name} /> : null;
                })}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewsTitle({ id, title }: { id: number; title: string }) {
  const showHorse = useGame((s) => s.showHorse);
  return (
    <button type="button" className="horse-link news-title" onClick={() => showHorse(id)}>
      {title}
    </button>
  );
}
