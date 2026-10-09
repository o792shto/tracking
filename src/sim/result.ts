import { PARAMS } from './params';
import type { FinishRecord, RaceResult } from './types';

/** 着差（馬身）を表記に変換する */
export function marginLabel(lengths: number): string {
  if (lengths < 0.02) return '同着';
  if (lengths < 0.1) return 'ハナ';
  if (lengths < 0.2) return 'アタマ';
  if (lengths < 0.35) return 'クビ';
  const table: [number, string][] = [
    [0.625, '1/2'],
    [0.875, '3/4'],
    [1.125, '1'],
    [1.375, '1 1/4'],
    [1.625, '1 1/2'],
    [1.875, '1 3/4'],
    [2.25, '2'],
    [2.75, '2 1/2'],
    [3.25, '3'],
    [3.75, '3 1/2'],
  ];
  for (const [limit, label] of table) if (lengths < limit) return label;
  if (lengths <= 10) return String(Math.round(lengths));
  return '大差';
}

export function finishRecords(
  rows: { number: number; time: number; speed: number; last3f: number }[],
): FinishRecord[] {
  const sorted = [...rows].sort((a, b) => a.time - b.time || a.number - b.number);
  return sorted.map((row, i) => {
    if (i === 0) {
      return { number: row.number, rank: 1, time: row.time, marginSec: 0, marginLabel: '', last3f: row.last3f };
    }
    const prev = sorted[i - 1];
    const marginSec = row.time - prev.time;
    const lengths = (marginSec * row.speed) / PARAMS.bodyLength;
    return {
      number: row.number,
      rank: i + 1,
      time: row.time,
      marginSec,
      marginLabel: marginLabel(lengths),
      last3f: row.last3f,
    };
  });
}

/** 先頭の前半3Fと後半3Fを比べてペースを判定する */
export function judgePace(laps: number[]): RaceResult['pace'] {
  if (laps.length < 6 || laps.some((l) => !Number.isFinite(l))) return 'middle';
  const first = laps[0] + laps[1] + laps[2];
  const last = laps[laps.length - 3] + laps[laps.length - 2] + laps[laps.length - 1];
  // 前半3Fには発馬の加速分が含まれるので、その分を差し引いて比べる
  const diff = first - last - PARAMS.paceStartAllowance;
  if (diff < -PARAMS.paceThreshold) return 'high';
  if (diff > PARAMS.paceThreshold) return 'slow';
  return 'middle';
}

/** 秒を「1:34.5」形式にする */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
