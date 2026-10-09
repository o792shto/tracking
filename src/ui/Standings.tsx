import { useRef } from 'react';
import type { Entry } from '../sim';
import { frameColor, type StandingRow } from '../render';

/** 1行の高さ（px）。行は絶対配置で、順位が変わると translateY でスライドする */
export const STANDING_ROW_HEIGHT = 34;
/** 順位変動の光る時間（ms） */
const FLASH_MS = 700;

interface Props {
  rows: StandingRow[];
  entries: Entry[];
  follow: number | null;
  onSelect: (number: number) => void;
  /** レース内の時刻（秒）。大きく飛んだとき（シーク）は順位変動を光らせない */
  time: number;
  /** 出す行を絞る（スマホ：上位5頭＋自分の馬）。省略時は全頭 */
  filter?: (row: StandingRow) => boolean;
  /** 写真判定中で順位を伏せる馬番 */
  masked?: ReadonlySet<number>;
}

function formatBehind(row: StandingRow): string {
  if (row.rank === 1) return '—';
  return row.behindLengths < 10 ? row.behindLengths.toFixed(1) : row.behindLengths.toFixed(0);
}

/** 順位表：順位・馬番・馬名・先頭との差（馬身）・現在速度 */
export function Standings({ rows, entries, follow, onSelect, time, filter, masked }: Props) {
  const prevRank = useRef(new Map<number, number>());
  const flashes = useRef(new Map<number, { dir: 'up' | 'down'; until: number }>());
  const prevTime = useRef(time);
  const now = performance.now();
  const jumped = Math.abs(time - prevTime.current) > 1;
  prevTime.current = time;
  if (jumped) flashes.current.clear();

  for (const row of rows) {
    const before = prevRank.current.get(row.number);
    if (!jumped && before !== undefined && before !== row.rank) {
      flashes.current.set(row.number, { dir: row.rank < before ? 'up' : 'down', until: now + FLASH_MS });
    }
    prevRank.current.set(row.number, row.rank);
  }

  return (
    <div className="standings" role="table" aria-label="順位表">
      <div className="standings-head" role="row">
        <span role="columnheader">順</span>
        <span role="columnheader">馬</span>
        <span role="columnheader" />
        <span role="columnheader" className="num-col">
          差<small>馬身</small>
        </span>
        <span role="columnheader" className="num-col">
          速度<small>km/h</small>
        </span>
      </div>
      <div className="standings-body" style={{ height: (filter ? rows.filter(filter).length : rows.length) * STANDING_ROW_HEIGHT }}>
        {(filter ? rows.filter(filter) : rows).map((row, slot) => {
          const entry = entries[row.index];
          const c = frameColor(entry.frame);
          const flash = flashes.current.get(row.number);
          const flashing = flash && flash.until > now ? `flash-${flash.dir}` : '';
          const active = follow === row.number;
          const hidden = masked?.has(row.number) ?? false;
          return (
            <button
              type="button"
              role="row"
              key={row.number}
              className={`standing ${flashing} ${active ? 'active' : ''} ${row.finished ? 'done' : ''}`}
              style={{ transform: `translateY(${slot * STANDING_ROW_HEIGHT}px)` }}
              onClick={() => onSelect(row.number)}
              aria-pressed={active}
              aria-label={`${hidden ? '判定中' : `${row.rank}位`} ${row.number}番 ${entry.horse.name}`}
            >
              <span className="rank">{hidden ? '?' : row.rank}</span>
              <span className="num" style={{ background: c.fill, color: c.text, borderColor: c.stroke }}>
                {row.number}
              </span>
              <span className="name">{entry.horse.name}</span>
              <span className="num-col behind">{hidden ? '' : formatBehind(row)}</span>
              <span className="num-col speed">{row.finished ? '' : row.speedKmh.toFixed(1)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
