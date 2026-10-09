import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONDITION_LABEL, SURFACE_LABEL, formatTime, type RaceResult } from '../sim';
import {
  RacePlayer,
  activeTelop,
  fieldLength,
  frameColor,
  runningOrder,
  sampleAt,
  standings,
  type CameraMode,
  type PlaybackSpeed,
  type PlayerState,
  type StandingRow,
} from '../render';
import { useSettings } from '../store';
import { LapChart } from './LapChart';
import { sfx } from './sound';
import { Standings } from './Standings';
import { useLayoutMode } from './useLayout';

const CAMERA_MODES: { mode: CameraMode; label: string }[] = [
  { mode: 'auto', label: '自動' },
  { mode: 'overview', label: '全体' },
  { mode: 'leader', label: '先頭' },
  { mode: 'horse', label: '選択馬' },
];
const SPEEDS: PlaybackSpeed[] = [1, 2, 4];
/** ゲートのカウントダウン（秒） */
const COUNTDOWN = 3;
/** 写真判定にする着差と、判定にかける時間（レース内の秒） */
const PHOTO_LABELS = new Set(['同着', 'ハナ', 'アタマ']);
const PHOTO_SECONDS = 2.6;
/** 1着のテロップを出している時間（秒） */
const WINNER_TELOP_SECONDS = 4;
/** スマホの順位表で常に出す上位の頭数 */
const COMPACT_TOP = 5;

type Tab = 'standings' | 'laps' | 'bets';
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'standings', label: '順位' },
  { tab: 'laps', label: 'ラップ' },
  { tab: 'bets', label: '馬券' },
];

interface Props {
  /** 記録付きのレース結果（simulateRace の record: true） */
  result: RaceResult;
  /** 見出しの上の小さな文字（例：中山 3R） */
  eyebrow: string;
  /** 強調する馬番（自分の買った馬） */
  highlight: ReadonlySet<number>;
  /**
   * 現在の着順から作る馬券の状況。variant が 'bar' なら1行の細いバー（スマホの最下部）、'full' なら一覧。
   * 馬券がなければ null を返す
   */
  renderStatus?: (order: number[], finished: boolean, variant: 'bar' | 'full', judging: boolean) => ReactNode;
  /** 操作ボタンの右に足すボタン（全馬ゴールして着順が確定したかどうかを受け取る） */
  renderActions?: (allFinished: boolean, skip: () => void) => ReactNode;
}

/** 写真判定：1・2着（同着や3着も僅差なら含む）の着差がごく小さいとき */
function photoFinish(result: RaceResult) {
  const f = result.finish;
  if (f.length < 2 || !PHOTO_LABELS.has(f[1].marginLabel)) return null;
  const numbers = new Set([f[0].number, f[1].number]);
  if (f[2] && PHOTO_LABELS.has(f[2].marginLabel)) numbers.add(f[2].number);
  return { numbers, revealAt: f[numbers.size - 1].time + PHOTO_SECONDS };
}

/** レース観戦：トラッキング表示＋順位表・ラップ・テロップ */
export function RaceViewer({ result, eyebrow, highlight, renderStatus, renderActions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<RacePlayer | null>(null);
  const [state, setState] = useState<PlayerState>({
    time: 0,
    duration: 0,
    playing: false,
    speed: 1,
    countdown: COUNTDOWN,
    slow: false,
  });
  const [camera, setCamera] = useState<CameraMode>('auto');
  const [follow, setFollow] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('standings');
  const [showAll, setShowAll] = useState(false);
  const mode = useLayoutMode();
  const lite = useSettings((s) => s.lite);

  // プレイヤーの生成。レイアウトが変わる（スマホを横にするなど）とコース図の要素が作り直されるので、
  // プレイヤーも作り直して、再生位置・倍速・再生中かどうかを引き継ぐ
  const snapshot = useRef<{ result: RaceResult; state: PlayerState } | null>(null);
  useEffect(() => {
    const player = new RacePlayer(canvasRef.current!, result);
    playerRef.current = player;
    const prev = snapshot.current?.result === result ? snapshot.current.state : null;
    const unsubscribe = player.subscribe((s) => {
      snapshot.current = { result, state: s };
      setState(s);
    });
    if (prev) {
      player.setSpeed(prev.speed);
      if (prev.countdown > 0) player.startWithCountdown(prev.countdown);
      else {
        player.seek(prev.time);
        if (prev.playing) player.play();
      }
    } else {
      player.startWithCountdown(COUNTDOWN);
    }
    return () => {
      unsubscribe();
      player.destroy();
      playerRef.current = null;
    };
    // レースの差し替えは下の effect で行う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 表示サイズ（レイアウトが変わるとコース図の大きさも変わる）。軽量モードは解像度を上げない
  useEffect(() => {
    const stage = stageRef.current!;
    const player = playerRef.current!;
    const dpr = lite ? 1 : window.devicePixelRatio || 1;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      player.resize(r.width, r.height, dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    player.setLite(lite);
    return () => ro.disconnect();
  }, [lite, mode]);

  const loaded = useRef(result);
  useEffect(() => {
    const player = playerRef.current;
    if (!player || loaded.current === result) return;
    loaded.current = result;
    player.load(result);
    player.startWithCountdown(COUNTDOWN);
  }, [result]);

  useEffect(() => {
    playerRef.current?.setOptions({ cameraMode: camera, followNumber: follow, highlight, lite });
  }, [camera, follow, highlight, lite, mode]);

  const { course, entries } = result.setup;
  const samples = useMemo(
    () => (result.log ? sampleAt(result.log, state.time) : []),
    [result, state.time],
  );
  const order = samples.length ? runningOrder(samples) : [];
  const leaderD = order.length ? samples[order[0]].d : 0;
  const remaining = Math.max(0, course.distance - leaderD);
  const winner = result.finish[0];
  const finished = state.time >= winner.time;

  // 順位表：前回の並びを引き継いで、並んだ馬の順位がちらつかないようにする
  const prevOrder = useRef<{ result: RaceResult; order: number[] } | null>(null);
  const rows = useMemo(() => {
    if (!samples.length) return [];
    const prev = prevOrder.current?.result === result ? prevOrder.current.order : null;
    const r = standings(result, samples, state.time, prev);
    prevOrder.current = { result, order: r.map((row) => row.index) };
    return r;
  }, [result, samples, state.time]);

  // 写真判定：判定中は上位の着順を伏せる
  const photo = useMemo(() => photoFinish(result), [result]);
  const photoPending = photo !== null && finished && state.time < photo.revealAt;
  const masked = useMemo(
    () => (photoPending ? new Set([...photo!.numbers].filter((n) => result.finish.find((f) => f.number === n)!.time <= state.time)) : undefined),
    [photoPending, photo, result, state.time],
  );
  const confirmedAt = photo ? photo.revealAt : winner.time;
  const showWinner = state.time >= confirmedAt && state.time < confirmedAt + WINNER_TELOP_SECONDS;

  const allFinished = state.time >= result.finish[result.finish.length - 1].time && !photoPending;
  const telop = finished ? null : activeTelop(result, leaderD);
  const field = samples.length && !finished ? fieldLength(samples) : null;
  const counting = state.countdown > 0;

  // 効果音：カウントダウン・ゲート・残り600/400/200m・ゴール・写真判定・確定
  const cue = useRef({ count: Math.ceil(state.countdown), telop: telop as number | null, finished, photoPending, confirmed: false });
  useEffect(() => {
    const c = cue.current;
    const count = Math.ceil(state.countdown);
    if (count !== c.count) {
      if (count > 0) sfx.count();
      else if (c.count > 0) sfx.gate();
    }
    if (state.playing && telop !== null && telop !== c.telop) sfx.furlong();
    if (state.playing && finished && !c.finished) sfx.goal();
    if (state.playing && photoPending && !c.photoPending) sfx.shutter();
    const confirmed = state.time >= confirmedAt;
    if (state.playing && photo && confirmed && !c.confirmed) sfx.confirm();
    cue.current = { count, telop, finished, photoPending, confirmed };
  }, [state, telop, finished, photoPending, photo, confirmedAt]);

  const selectHorse = (num: number) => {
    setFollow(num);
    setCamera('horse');
  };
  const skip = () => playerRef.current?.seek(playerRef.current.view.duration);
  const togglePlay = () => (state.playing || counting ? playerRef.current?.pause() : playerRef.current?.play());
  const cycleSpeed = () => playerRef.current?.setSpeed(SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length]);
  const cameraChoices = CAMERA_MODES.filter((c) => c.mode !== 'horse' || follow !== null);
  const cycleCamera = () => {
    const i = cameraChoices.findIndex((c) => c.mode === camera);
    setCamera(cameraChoices[(i + 1) % cameraChoices.length].mode);
  };

  const raceBar = (
    <header className="race-bar">
      <div className="race-title">
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {SURFACE_LABEL[course.surface]}
          {course.distance}m
        </h1>
        <span className="race-meta">
          {course.direction === 'right' ? '右回り' : '左回り'} ・ 馬場 {CONDITION_LABEL[course.condition]} ・{' '}
          {entries.length}頭
        </span>
      </div>
      <div className="readouts">
        <div className="readout">
          <span className="label">経過</span>
          <span className="value">{formatTime(Math.min(state.time, winner.time))}</span>
        </div>
        <div className="readout">
          <span className="label">残り</span>
          <span className="value">{finished ? 'GOAL' : `${Math.ceil(remaining)}m`}</span>
        </div>
        <div className="readout">
          <span className="label">馬群</span>
          <span className="value small">{field === null ? '—' : `${Math.round(field)}m`}</span>
        </div>
      </div>
    </header>
  );

  const winnerEntry = entries[winner.number - 1];
  const second = result.finish[1];
  const stage = (
    <div className="stage" ref={stageRef}>
      <canvas ref={canvasRef} aria-label="レースのトラッキング表示" />
      {counting && (
        <div className="countdown" key={Math.ceil(state.countdown)} role="status" aria-live="assertive">
          {Math.ceil(state.countdown)}
        </div>
      )}
      {!counting && state.time < 1 && state.time > 0 && (
        <div className="countdown go" role="status">
          スタート
        </div>
      )}
      {telop && (
        <div className="telop" key={telop} role="status">
          <span className="telop-label">残り</span>
          <span className="telop-value">{telop}</span>
          <span className="telop-unit">m</span>
        </div>
      )}
      {state.slow && <div className="slow-badge">スロー</div>}
      {photoPending && (
        <div className="photo" role="status">
          <span className="photo-flash" />
          <span className="photo-label">写真判定</span>
          <span className="photo-sub">着順を確認しています</span>
        </div>
      )}
      {showWinner && (
        <div className="winner-telop" role="status">
          <span className="winner-rank">1着</span>
          <span
            className="winner-num"
            style={{
              background: frameColor(winnerEntry.frame).fill,
              color: frameColor(winnerEntry.frame).text,
              borderColor: frameColor(winnerEntry.frame).stroke,
            }}
          >
            {winner.number}
          </span>
          <span className="winner-name">{winnerEntry.horse.name}</span>
          {second && (
            <span className="winner-margin">
              {second.marginLabel === '同着' ? `${second.number}番と同着` : `${second.marginLabel}${/\d/.test(second.marginLabel) ? '馬身' : ''}差`}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const standingsTable = (filter?: (row: StandingRow) => boolean) => (
    <Standings
      rows={rows}
      entries={entries}
      follow={follow}
      onSelect={selectHorse}
      time={state.time}
      filter={filter}
      masked={masked}
    />
  );

  // スマホの順位表：上位5頭＋自分の馬・追従中の馬。タップで全頭
  const compactFilter = showAll
    ? undefined
    : (row: StandingRow) => row.rank <= COMPACT_TOP || highlight.has(row.number) || follow === row.number;
  const statusFull = renderStatus?.(
    rows.map((r) => r.number),
    finished && !photoPending,
    'full',
    photoPending,
  );
  const statusBar = renderStatus?.(
    rows.map((r) => r.number),
    finished && !photoPending,
    'bar',
    photoPending,
  );

  const panel = (
    <>
      <div className="tabs" role="tablist" aria-label="表示の切り替え">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={tab === t.tab}
            className={tab === t.tab ? 'tab on' : 'tab'}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {tab === 'standings' && (
          <>
            {standingsTable(mode === 'compact' ? compactFilter : undefined)}
            {mode === 'compact' && (
              <button type="button" className="show-all" onClick={() => setShowAll((v) => !v)}>
                {showAll ? `上位${COMPACT_TOP}頭と自分の馬だけ表示` : `全${entries.length}頭を表示`}
              </button>
            )}
          </>
        )}
        {tab === 'laps' && <LapChart result={result} time={state.time} />}
        {tab === 'bets' && (statusFull || <p className="muted empty">このレースは馬券を買っていません。</p>)}
      </div>
    </>
  );

  const seek = (
    <input
      className="seek"
      type="range"
      min={0}
      max={state.duration || 1}
      step={0.05}
      value={state.time}
      aria-label="再生位置"
      onChange={(ev) => playerRef.current?.seek(Number(ev.target.value))}
    />
  );

  // スマホ（縦・横）の操作：親指で押せる大きめのボタン。倍速・カメラは押すたびに切り替え
  const dock = (
    <div className="dock-controls">
      <button type="button" className="primary" onClick={togglePlay}>
        {state.playing || counting ? '一時停止' : '再生'}
      </button>
      <button type="button" className="seg" onClick={cycleSpeed} aria-label={`倍速 ${state.speed}x（押すと切り替え）`}>
        {state.speed}x
      </button>
      <button type="button" onClick={cycleCamera} aria-label={`カメラ ${CAMERA_MODES.find((c) => c.mode === camera)!.label}（押すと切り替え）`}>
        <small>カメラ</small> {CAMERA_MODES.find((c) => c.mode === camera)!.label}
      </button>
      <button type="button" onClick={() => playerRef.current?.replay()}>
        リプレイ
      </button>
      {renderActions?.(allFinished, skip)}
    </div>
  );

  if (mode === 'compact') {
    return (
      <div className="tracking compact">
        {raceBar}
        {stage}
        {panel}
        <div className="dock">
          {statusBar}
          {seek}
          {dock}
        </div>
      </div>
    );
  }

  if (mode === 'short') {
    return (
      <div className="tracking short">
        {raceBar}
        <div className="stage-row">
          {stage}
          <aside className="field side-panel" aria-label="順位・ラップ・馬券">
            {panel}
          </aside>
        </div>
        <div className="dock">
          {seek}
          {dock}
        </div>
      </div>
    );
  }

  return (
    <div className="tracking wide">
      {raceBar}

      {statusFull}

      <div className="stage-row">
        <div className="stage-col">
          {stage}
          <LapChart result={result} time={state.time} />
        </div>

        <aside className="field" aria-label="順位">
          <h2>
            順位 <span className="hint">タップで追従</span>
          </h2>
          {standingsTable()}
        </aside>
      </div>

      <footer className="controls">
        <div className="group">
          <button type="button" className="primary" onClick={togglePlay}>
            {state.playing || counting ? '一時停止' : '再生'}
          </button>
          <button type="button" onClick={() => playerRef.current?.replay()}>
            リプレイ
          </button>
        </div>

        <div className="group" role="group" aria-label="倍速">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={state.speed === s ? 'seg on' : 'seg'}
              aria-pressed={state.speed === s}
              onClick={() => playerRef.current?.setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="group" role="group" aria-label="カメラ">
          {CAMERA_MODES.map(({ mode: m, label }) => (
            <button
              key={m}
              type="button"
              className={camera === m ? 'seg on' : 'seg'}
              aria-pressed={camera === m}
              disabled={m === 'horse' && follow === null}
              onClick={() => setCamera(m)}
            >
              {label}
            </button>
          ))}
        </div>

        {seek}
        {renderActions?.(allFinished, skip)}
      </footer>
    </div>
  );
}
