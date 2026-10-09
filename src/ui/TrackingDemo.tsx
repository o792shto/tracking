import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONDITION_LABEL,
  STYLE_LABEL,
  SURFACE_LABEL,
  createRace,
  formatTime,
  simulateRace,
  type RaceResult,
} from '../sim';
import {
  RacePlayer,
  frameColor,
  runningOrder,
  sampleAt,
  type CameraMode,
  type PlaybackSpeed,
  type PlayerState,
} from '../render';

const CAMERA_MODES: { mode: CameraMode; label: string }[] = [
  { mode: 'auto', label: '自動' },
  { mode: 'overview', label: '全体' },
  { mode: 'leader', label: '先頭' },
  { mode: 'horse', label: '選択馬' },
];
const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

/** 確認用ページなので固定の見本レースから始める */
const SAMPLE_SEED = 20261009;

/** 段階2の確認用ページ：仮の出走馬でレースを1本流す */
export function TrackingDemo() {
  const [seed, setSeed] = useState(SAMPLE_SEED);
  const result: RaceResult = useMemo(() => simulateRace(createRace(seed)), [seed]);
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
    playerRef.current?.setOptions({ cameraMode: camera, followNumber: follow });
  }, [camera, follow]);

  const { course, entries } = result.setup;
  const samples = useMemo(
    () => (result.log ? sampleAt(result.log, state.time) : []),
    [result, state.time],
  );
  const order = samples.length ? runningOrder(samples) : [];
  const leaderD = order.length ? samples[order[0]].d : 0;
  const remaining = Math.max(0, course.distance - leaderD);
  const finished = state.time >= result.finish[0].time;

  const selectHorse = (num: number) => {
    setFollow(num);
    setCamera('horse');
  };

  return (
    <div className="tracking">
      <header className="race-bar">
        <div className="race-title">
          <span className="eyebrow">確認用レース</span>
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
        </div>
      </header>

      <div className="stage-row">
        <div className="stage" ref={stageRef}>
          <canvas ref={canvasRef} aria-label="レースのトラッキング表示" />
        </div>

        <aside className="field" aria-label="出走馬">
          <h2>出走馬 <span className="hint">タップで追従</span></h2>
          <ul>
            {entries.map((e) => {
              const c = frameColor(e.frame);
              const active = follow === e.number;
              return (
                <li key={e.number}>
                  <button
                    type="button"
                    className={active ? 'horse active' : 'horse'}
                    onClick={() => selectHorse(e.number)}
                    aria-pressed={active}
                  >
                    <span className="num" style={{ background: c.fill, color: c.text, borderColor: c.stroke }}>
                      {e.number}
                    </span>
                    <span className="name">{e.horse.name}</span>
                    <span className="style">{STYLE_LABEL[e.horse.style]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
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
          <button type="button" onClick={() => setSeed((s) => s + 1)}>
            次のレース
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
        <span className="seed">シード {seed}</span>
      </footer>
    </div>
  );
}
