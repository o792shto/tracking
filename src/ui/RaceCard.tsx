import { useEffect, useRef, useState } from 'react';
import {
  BETTING,
  BET_METHOD_LABEL,
  BET_TYPES,
  BET_TYPE_LABEL,
  BET_TYPE_ORDERED,
  BET_TYPE_PICKS,
  EMPTY_SLOTS,
  currentOdds,
  expandSelections,
  groupLabel,
  maxAxis,
  methodsFor,
  type Bet,
  type BetMethod,
  type BetType,
  type PickSlots,
} from '../betting';
import { CONDITION_LABEL, SEX_LABEL, STYLE_LABEL, SURFACE_LABEL, formatPastRun } from '../sim';
import { frameColor } from '../render';
import { MARKS, placedTotal, useGame, type Mark } from '../store';
import { GradeBadge, formatCoins } from './GameHeader';
import { runQuietly, useRaceCard } from './useRace';
import { unlockAudio } from './sound';
import { groupBets } from './betGroups';

/** 発走前のオッズ表示が切り替わる間隔（ms） */
const BOARD_INTERVAL = 3500;
/** まとめ買いの点数がこれを超えたら注意を出す */
const MANY_POINTS = 300;

/** 券種と買い方ごとの説明 */
function hintFor(type: BetType, method: BetMethod, runners: number): string {
  const k = BET_TYPE_PICKS[type];
  const ordered = BET_TYPE_ORDERED[type];
  const what: Record<BetType, string> = {
    win: '1着になる馬を当てます。',
    place: `${runners <= 7 ? '2' : '3'}着以内に入る馬を当てます。`,
    quinella: '1・2着の2頭を当てます（順不同）。',
    wide: '3着以内に入る2頭を当てます（順不同）。',
    exacta: '1・2着の2頭を着順どおりに当てます。',
    trio: '1〜3着の3頭を当てます（順不同）。',
    trifecta: '1〜3着の3頭を着順どおりに当てます。',
  };
  const how: Record<BetMethod, string> = {
    single: ordered ? `${k}頭を着順の順にタップします。` : `${k}頭をタップします。`,
    box: `${k}頭以上を選ぶと、その中のすべての${ordered ? '並び' : '組み合わせ'}を買います。`,
    nagashi: ordered
      ? `軸（${maxAxis(type) === 2 ? '1着、2頭なら1・2着' : '1着'}）と相手を選びます。`
      : `軸（${maxAxis(type) === 2 ? '1〜2頭' : '1頭'}）と相手を選びます。軸は必ず入る組み合わせを買います。`,
    formation: ordered ? '着順ごとに候補を選びます。' : `${k}つの列ごとに候補を選びます。`,
  };
  return what[type] + how[method];
}

function formatRange(min: number, max: number): string {
  return min === max ? formatCoins(Math.floor(min)) : `${formatCoins(Math.floor(min))}〜${formatCoins(Math.floor(max))}`;
}

/** 出馬表と馬券購入 */
export function RaceCard() {
  const raceIndex = useGame((s) => s.raceIndex);
  const { race, profiles, market } = useRaceCard(raceIndex);
  const showHorse = useGame((s) => s.showHorse);
  const favorites = useGame((s) => s.favorites);
  const placed = useGame((s) => s.placed);
  const buy = useGame((s) => s.buy);
  const cancel = useGame((s) => s.cancel);
  const go = useGame((s) => s.go);
  const settleRace = useGame((s) => s.settle);
  const panelRef = useRef<HTMLElement>(null);

  const [board, setBoard] = useState(0);
  const [type, setType] = useState<BetType>('win');
  const [method, setMethod] = useState<BetMethod>('single');
  const [slots, setSlots] = useState<PickSlots>(EMPTY_SLOTS);
  /** 流しは 0=軸・1=相手、フォーメーションは何列目を選んでいるか */
  const [active, setActive] = useState(0);
  const [stake, setStake] = useState(100);
  const [message, setMessage] = useState<string | null>(null);
  const marks = useGame((s) => s.marks[race.key]);

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

  // 購入のお知らせは少しで消す
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(id);
  }, [message]);

  const odds = market.boards[board];
  const final = board === market.boards.length - 1;
  const { course, entries } = race.setup;
  const picks = BET_TYPE_PICKS[type];
  const ordered = BET_TYPE_ORDERED[type];
  const total = placedTotal(placed);

  const toggleIn = (list: number[], num: number, limit = Infinity) => {
    if (list.includes(num)) return list.filter((n) => n !== num);
    const next = [...list, num];
    return next.length > limit ? next.slice(next.length - limit) : next;
  };
  const toggle = (num: number) => {
    setMessage(null);
    setSlots((sl) => {
      switch (method) {
        case 'single':
          return { ...sl, picks: toggleIn(sl.picks, num, picks) };
        case 'box':
          return { ...sl, picks: toggleIn(sl.picks, num) };
        case 'nagashi':
          return active === 0
            ? { ...sl, axis: toggleIn(sl.axis, num, maxAxis(type)), partners: sl.partners.filter((n) => n !== num) }
            : { ...sl, partners: toggleIn(sl.partners, num), axis: sl.axis.filter((n) => n !== num) };
        case 'formation':
          return { ...sl, columns: sl.columns.map((c, i) => (i === active ? toggleIn(c, num) : c)) };
      }
    });
  };
  const changeType = (t: BetType) => {
    setType(t);
    if (!methodsFor(t).includes(method)) setMethod('single');
    setSlots((sl) => ({ ...sl, picks: sl.picks.slice(-BET_TYPE_PICKS[t]) }));
    setActive(0);
    setMessage(null);
  };
  const changeMethod = (m: BetMethod) => {
    setMethod(m);
    setActive(0);
    setSlots((sl) => ({ ...EMPTY_SLOTS, picks: m === 'single' ? sl.picks.slice(-picks) : m === 'box' ? sl.picks : [] }));
    setMessage(null);
  };

  /** 出馬表の馬番に付ける印（選ばれていなければ null） */
  const markOf = (num: number): string | null => {
    switch (method) {
      case 'single': {
        const i = slots.picks.indexOf(num);
        return i < 0 ? null : ordered ? `${i + 1}着` : '';
      }
      case 'box':
        return slots.picks.includes(num) ? '' : null;
      case 'nagashi':
        return slots.axis.includes(num) ? '軸' : slots.partners.includes(num) ? '相手' : null;
      case 'formation': {
        const cols = slots.columns.slice(0, picks).flatMap((c, i) => (c.includes(num) ? [i + 1] : []));
        return cols.length ? cols.join('・') : null;
      }
    }
  };

  const selections = expandSelections(type, method, slots);
  const points = selections.length;
  const anySelected = slots.picks.length + slots.axis.length + slots.partners.length + slots.columns.flat().length > 0;
  // 想定配当（1点あたり）の幅
  let previewMin = Infinity;
  let previewMax = 0;
  for (const sel of selections) {
    const o = currentOdds({ type, selection: sel }, market, board);
    previewMin = Math.min(previewMin, o.min);
    previewMax = Math.max(previewMax, o.max);
  }
  const preview = points ? { min: previewMin * stake, max: previewMax * stake } : null;
  const slotLabels = method === 'nagashi' ? ['軸', '相手'] : Array.from({ length: picks }, (_, i) => (ordered ? `${i + 1}着` : `${i + 1}頭目`));

  const submit = () => {
    if (points === 0) return;
    const group =
      method === 'single'
        ? undefined
        : { id: Math.max(0, ...placed.map((b) => b.group?.id ?? 0)) + 1, method, label: groupLabel(type, method, slots) };
    const bets: Bet[] = selections.map((selection) => ({ type, selection, stake, group }));
    const error = buy(bets);
    if (error) {
      setMessage(error);
      return;
    }
    const label = group ? group.label : `${BET_TYPE_LABEL[type]} ${selections[0].join(ordered ? '→' : '-')}`;
    setMessage(`${label}（${points}点）を ${formatCoins(points * stake)}コイン購入しました`);
    setSlots(EMPTY_SLOTS);
    setActive(0);
  };

  /** 観戦せずに走らせて、今週のレース一覧へ戻る（買った馬券は結果どおりに精算。詳細は一覧から） */
  const resultOnly = () => {
    const r = runQuietly(race);
    settleRace(r.payouts, r.finishOrder, r.info, false);
  };
  const start = () => {
    // 効果音がオンなら、このタップで音を出せる状態にしておく（ブラウザの制限）
    unlockAudio();
    go('watch');
  };

  const ticketOdds = (bet: Bet) => {
    const o = currentOdds(bet, market, board);
    return o.min === o.max ? `${o.min.toFixed(1)}倍` : `${o.min.toFixed(1)}〜${o.max.toFixed(1)}倍`;
  };

  return (
    <main className="screen race-card">
      <header className="card-head">
        <div>
          <span className="eyebrow">
            {race.month}月{race.date}日 {race.venue} {race.no}R
          </span>
          <h1>
            <GradeBadge grade={race.grade} />
            {race.name}　{SURFACE_LABEL[course.surface]}
            {course.distance}m
            {race.layoutLabel && <small className="layout">（{race.layoutLabel}）</small>}
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
                <th className="mark-col">印</th>
                <th>枠</th>
                <th>馬番</th>
                <th className="name-col">馬名</th>
                <th>性齢</th>
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
                const mark = markOf(e.number);
                const selected = mark !== null;
                return (
                  <tr
                    key={e.number}
                    className={selected ? 'selected' : ''}
                    onClick={() => toggle(e.number)}
                  >
                    <td className="mark-cell" onClick={(ev) => ev.stopPropagation()}>
                      <MarkPicker raceKey={race.key} number={e.number} name={e.horse.name} mark={marks?.[e.number]} />
                    </td>
                    <td className="frame-cell">
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
                        {mark && <small className="pick-mark">{mark}</small>}
                      </button>
                    </td>
                    <td className="name-col">
                      <button
                        type="button"
                        className="horse-link"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          showHorse(race.horseIds[i]);
                        }}
                      >
                        {favorites.includes(race.horseIds[i]) && <span className="fav-star" aria-label="お気に入り">★</span>}
                        {e.horse.name}
                      </button>
                    </td>
                    <td className="sexage-cell">
                      {e.horse.sex ? SEX_LABEL[e.horse.sex] : ''}
                      {e.horse.age ?? ''}
                    </td>
                    <td className="style-cell">{STYLE_LABEL[e.horse.style]}</td>
                    <td className="recent-cell">
                      <span className="recent">
                        {profile.recent.length === 0 && <span className="muted">初出走</span>}
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
                    <td className="num pop-cell">{odds.popularity[i]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="bet-panel" aria-label="馬券購入" ref={panelRef}>
          <h2>馬券を買う</h2>
          <div className="seg-group bet-types" role="group" aria-label="券種">
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
          {methodsFor(type).length > 1 && (
            <div className="seg-group bet-methods" role="group" aria-label="買い方">
              {methodsFor(type).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={method === m ? 'seg on' : 'seg'}
                  aria-pressed={method === m}
                  onClick={() => changeMethod(m)}
                >
                  {BET_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          <p className="hint">{hintFor(type, method, entries.length)}出馬表の馬番をタップしてください。</p>
          {(method === 'nagashi' || method === 'formation') && (
            <div className="slot-tabs" role="group" aria-label="選ぶ欄">
              {slotLabels.map((label, i) => (
                <button key={label} type="button" className={active === i ? 'on' : ''} aria-pressed={active === i} onClick={() => setActive(i)}>
                  {label}を選ぶ
                </button>
              ))}
            </div>
          )}
          <div className="selection" aria-live="polite">
            {method === 'single' && <>選択：{slots.picks.length ? slots.picks.join(ordered ? ' → ' : ' - ') : 'なし'}</>}
            {method === 'box' && <>選択：{slots.picks.length ? [...slots.picks].sort((x, y) => x - y).join('・') : 'なし'}</>}
            {method === 'nagashi' && (
              <>
                <div>軸：{slots.axis.length ? slots.axis.join(ordered ? ' → ' : '・') : 'なし'}</div>
                <div>相手：{slots.partners.length ? [...slots.partners].sort((x, y) => x - y).join('・') : 'なし'}</div>
              </>
            )}
            {method === 'formation' &&
              slotLabels.map((label, i) => (
                <div key={label}>
                  {label}：{slots.columns[i].length ? [...slots.columns[i]].sort((x, y) => x - y).join('・') : 'なし'}
                </div>
              ))}
          </div>

          <label className="stake" htmlFor="stake">
            1点あたりの金額（{BETTING.unit}コイン単位）
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
              <dd>{points}点</dd>
            </div>
            <div>
              <dt>合計</dt>
              <dd>{formatCoins(points * stake)}</dd>
            </div>
            <div>
              <dt>想定配当（1点）</dt>
              <dd>{preview ? formatRange(preview.min, preview.max) : '—'}</dd>
            </div>
          </dl>
          {points > MANY_POINTS && <p className="muted small">点数が多くなっています（{points}点）。</p>}
          <button type="button" className="primary wide" disabled={points === 0} onClick={submit}>
            購入する
          </button>
          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}

          <h3>
            購入した馬券 <span className="muted">合計 {formatCoins(total)}</span>
          </h3>
          {placed.length === 0 ? (
            <p className="muted">まだありません。</p>
          ) : (
            <ul className="slip">
              {groupBets(placed, (b) => b).map((g) => (
                <li key={g.key}>
                  <span className="bet-sel">{g.label}</span>
                  <span className="bet-odds">{g.grouped ? `${g.items.length}点` : ticketOdds(g.items[0])}</span>
                  <span className="bet-stake">{formatCoins(placedTotal(g.items))}</span>
                  <button type="button" className="cancel" onClick={() => cancel(g.firstIndex)} aria-label="取り消す">
                    取消
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">所持コインの範囲でいくらでも買えます。払い戻しは確定オッズで計算します。</p>

          <button type="button" className="start wide" onClick={start}>
            {placed.length ? '発走する' : '馬券を買わずに観戦する'}
          </button>
          <button type="button" className="wide result-only" onClick={resultOnly}>
            観戦せずに結果だけ見る
          </button>
        </aside>
      </div>

      {/* スマホ：馬を選んだら画面下に購入バー（出馬表の下まで戻らなくても買える） */}
      {(anySelected || placed.length > 0) && (
        <div className="buy-bar" role="region" aria-label="購入">
          {anySelected ? (
            <>
              <div className="buy-what">
                <span className="buy-type">
                  {BET_TYPE_LABEL[type]}
                  {method !== 'single' && ` ${BET_METHOD_LABEL[method]}`}
                </span>
                <b>{points}点</b>
                <small>{formatCoins(points * stake)}コイン</small>
                {preview && <small>想定 {formatRange(preview.min, preview.max)}</small>}
              </div>
              <div className="buy-stake">
                <button type="button" onClick={() => setStake((s) => Math.max(BETTING.unit, s - BETTING.unit))} aria-label="100減らす">
                  −
                </button>
                <span>{formatCoins(stake)}</span>
                <button type="button" onClick={() => setStake((s) => s + BETTING.unit)} aria-label="100増やす">
                  ＋
                </button>
              </div>
              <button type="button" className="primary" disabled={points === 0} onClick={submit}>
                購入
              </button>
              <button type="button" className="buy-more" onClick={() => panelRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                券種
              </button>
            </>
          ) : (
            <>
              <div className="buy-what">
                <span className="buy-type">購入済み</span>
                <b>{placed.length}点</b>
                <small>{formatCoins(total)}コイン</small>
              </div>
              <button type="button" className="start-small" onClick={start}>
                発走する
              </button>
            </>
          )}
        </div>
      )}
      {message && <p className="buy-toast" role="status">{message}</p>}
    </main>
  );
}

/** 印を付けるボタン。タップで ◎○▲△☆✓ を選ぶ（◎○▲ は1レースに1頭だけ） */
function MarkPicker({ raceKey, number, name, mark }: { raceKey: string; number: number; name: string; mark?: Mark }) {
  const setMark = useGame((s) => s.setMark);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: PointerEvent) => {
      if (!ref.current?.contains(ev.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const choose = (m: Mark | null) => {
    setMark(raceKey, number, m);
    setOpen(false);
  };
  return (
    <div className="mark-picker" ref={ref}>
      <button
        type="button"
        className={`mark-btn ${mark ? 'on' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${number}番 ${name}の印${mark ? `（${mark}）` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {mark ?? ''}
      </button>
      {open && (
        <div className="mark-menu" role="group" aria-label="印を選ぶ">
          {MARKS.map((m) => (
            <button key={m} type="button" className={m === mark ? 'on' : ''} aria-pressed={m === mark} onClick={() => choose(m)}>
              {m}
            </button>
          ))}
          <button type="button" className="clear" onClick={() => choose(null)}>
            消す
          </button>
        </div>
      )}
    </div>
  );
}
