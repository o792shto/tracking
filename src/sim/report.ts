import { STYLE_LABEL, STYLES, CONDITION_LABEL, SURFACE_LABEL, type RaceDistance, type Surface, type TrackCondition } from './types';
import { plausibleWinTime, type BatchStats } from './stats';
import { formatTime } from './result';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** 統計結果を Markdown の表にする */
export function formatReport(stats: BatchStats): string {
  const lines: string[] = [];
  lines.push(`## ${stats.races}レースの統計`, '');
  lines.push('### 人気別', '', '| 人気 | 出走 | 勝率 | 3着内率 |', '| --- | --- | --- | --- |');
  for (const p of stats.byPopularity.slice(0, 10)) {
    lines.push(`| ${p.popularity} | ${p.starts} | ${pct(p.winRate)} | ${pct(p.top3Rate)} |`);
  }
  lines.push('', `6番人気以下の勝利: ${pct(stats.longshotWinRate)} / 1・2着差の中央値: ${stats.medianWinMarginSec.toFixed(2)}秒`, '');
  lines.push('### 脚質別', '', '| 脚質 | 出走 | 勝利 | 勝率 | 頭数比の期待勝率 | 比 |', '| --- | --- | --- | --- | --- | --- |');
  for (const s of STYLES) {
    const r = stats.byStyle[s];
    lines.push(`| ${STYLE_LABEL[s]} | ${r.starts} | ${r.wins} | ${pct(r.winRate)} | ${pct(r.expectedWinRate)} | ${r.ratio.toFixed(2)} |`);
  }
  lines.push('', '### 勝ち時計（距離・馬場・馬場状態別）', '', '| 条件 | レース数 | 勝ち時計 平均 (最小〜最大) | 目安 | 勝ち馬の上がり3F 平均 (最小〜最大) |', '| --- | --- | --- | --- | --- |');
  const keys = Object.keys(stats.times).sort((a, b) => {
    const [da, sa, ca] = a.split('-');
    const [db, sb, cb] = b.split('-');
    return sa.localeCompare(sb) || Number(da) - Number(db) || order(ca) - order(cb);
  });
  for (const key of keys) {
    const [d, s, c] = key.split('-') as [string, Surface, TrackCondition];
    const t = stats.times[key];
    const [lo, hi] = plausibleWinTime(Number(d) as RaceDistance, s, c);
    lines.push(
      `| ${SURFACE_LABEL[s]}${d}m ${CONDITION_LABEL[c]} | ${t.winTime.count} | ${formatTime(t.winTime.mean)} (${formatTime(t.winTime.min)}〜${formatTime(t.winTime.max)}) | ${formatTime(lo)}〜${formatTime(hi)} | ${t.last3f.mean.toFixed(1)} (${t.last3f.min.toFixed(1)}〜${t.last3f.max.toFixed(1)}) |`,
    );
  }
  lines.push('', `ペース判定: ハイ ${stats.pace.high} / 平均 ${stats.pace.middle} / スロー ${stats.pace.slow}`);
  lines.push(`1レースあたりのイベント: 出遅れ ${stats.slowStartPerRace.toFixed(2)} / 掛かり ${stats.keenPerRace.toFixed(2)} / 進路が開かない ${stats.blockedPerRace.toFixed(2)}`);
  return lines.join('\n');
}

function order(c: string): number {
  return ['good', 'yielding', 'soft', 'heavy'].indexOf(c);
}
