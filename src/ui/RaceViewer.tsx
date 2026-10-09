import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONDITION_LABEL, SURFACE_LABEL, formatTime, type RaceResult } from '../sim';
import {
  RacePlayer,
  activeTelop,
  fieldLength,
  runningOrder,
  sampleAt,
  standings,
  type CameraMode,
  type PlaybackSpeed,
  type PlayerState,
} from '../render';
import { LapChart } from './LapChart';
import { Standings } from './Standings';

const CAMERA_MODES: { mode: CameraMode; label: string }[] = [
  { mode: 'auto', label: '自動' },
  { mode: 'overview', label: '全体' },
  { mode: 'leader', label: '先頭' },
  { mode: 'horse', label: '選択馬' },
];
const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

interface Props {
  /** 記録付きのレース結果（simulateRace の record: true） */
  result: RaceResult;
  /** 見出しの上の小さな文字（例：汐見野 3R） */
  eyebrow: string;
  /** 強調する馬番（自分の買った馬） */
  highlight: ReadonlySet<number>;
  /** 画面下に出す、現在の着順から作る表示（馬券の的中状況など） */
  renderStatus?: (order: number[], finished: boolean) => ReactNode;
  /** 操作ボタンの右に足すボタン（全馬ゴール後かどうかを受け取る） */
  renderActions?: (allFinished: boolean, skip: () => void) => ReactNode;
}

/** レース観戦：トラッキング表示＋順位表・ラップ・テロップ */
export function RaceViewer({ result, eyebrow, highlight, renderStatus, renderActions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<RacePlayer | null>(null);
  const [state, setState] = useState<PlayerState>({ time: 0, duration: 0, playing: false, speed: 1 });
  const [camera, setCamera] = useState<CameraMode>('auto');
  const [follow, setFollow] = useState<number | null>(null);

  // プレイヤーの生成とサイズ追従
  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const player = new RacePlayer(canvas, result);
    playerRef.current = player;
    const unsubscribe = player.subscribe(setState);
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      player.resize(r.width, r.height);
    });
    ro.observe(stage);
    player.play();
    return () => {
      ro.disconnect();
      unsubscribe();
      player.destroy();
      playerRef.current = null;
    };
    // レースの差し替えは下の effect で行う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.load(result);
    player.play();
  }, [result]);

  useEffect(() => {
    playerRef.current?.setOptions({ cameraMode: camera, followNumber: follow, highlight });
  }, [camera, follow, highlight]);

  const { course, entries } = result.setup;
  const samples = useMemo(
    () => (result.log ? sampleAt(result.log, state.time) : []),
    [result, state.time],
  );
  const order = samples.length ? runningOrder(samples) : [];
  const leaderD = order.length ? samples[order[0]].d : 0;
  const remaining = Math.max(0, course.distance - leaderD);
  const finished = state.time >= result.finish[0].time;

  // 順位表：前回の並びを引き継いで、並んだ馬の順位がちらつかないようにする
  const prevOrder = useRef<{ result: RaceResult; order: number[] } | null>(null);
  const rows = useMemo(() => {
    if (!samples.length) return [];
    const prev = prevOrder.current?.result === result ? prevOrder.current.order : null;
    const r = standings(result, samples, state.time, prev);
    prevOrder.current = { result, order: r.map((row) => row.index) };
    return r;
  }, [result, samples, state.time]);
  const allFinished = state.time >= result.finish[result.finish.length - 1].time;
  const telop = finished ? null : activeTelop(result, leaderD);
  const field = samples.length && !finished ? fieldLength(samples) : null;

  const selectHorse = (num: number) => {
    setFollow(num);
    setCamera('horse');
  };

  return (
    <div className="tracking">
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
            <span className="value">{formatTime(Math.min(state.time, result.finish[0].time))}</span>
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

      {renderStatus?.(
        rows.map((r) => r.number),
        finished,
      )}

      <div className="stage-row">
        <div className="stage-col">
          <div className="stage" ref={stageRef}>
            <canvas ref={canvasRef} aria-label="レースのトラッキング表示" />
            {telop && (
              <div className="telop" key={telop} role="status">
                <span className="telop-label">残り</span>
                <span className="telop-value">{telop}</span>
                <span className="telop-unit">m</span>
              </div>
            )}
          </div>
          <LapChart result={result} time={state.time} />
        </div>

        <aside className="field" aria-label="順位">
          <h2>
            順位 <span className="hint">タップで追従</span>
          </h2>
          <Standings rows={rows} entries={entries} follow={follow} onSelect={selectHorse} time={state.time} />
        </aside>
      </div>

      <footer className="controls">
        <div className="group">
          <button
            type="button"
            className="primary"
            onClick={() => (state.playing ? playerRef.current?.pause() : playerRef.current?.play())}
          >
            {state.playing ? '一時停止' : '再生'}
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
          {CAMERA_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              className={camera === mode ? 'seg on' : 'seg'}
              aria-pressed={camera === mode}
              disabled={mode === 'horse' && follow === null}
              onClick={() => setCamera(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          id="seek"
          className="seek"
          type="range"
          min={0}
          max={state.duration || 1}
          step={0.05}
          value={state.time}
          aria-label="再生位置"
          onChange={(ev) => playerRef.current?.seek(Number(ev.target.value))}
        />
        {renderActions?.(allFinished, () => playerRef.current?.seek(playerRef.current.view.duration))}
      </footer>
    </div>
  );
}
