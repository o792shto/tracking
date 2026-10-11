/**
 * リアリティの計測ツール。名簿の世界を画面なしで N 年分（既定10年）動かし、
 * 人気別成績・オッズ帯・配当・ローテーションなどを集計して reports/ に Markdown で書き出す。
 *
 *   npm run sim:season -- --years 10 --seed 2026 --out reports/realism_report.md
 *
 * 観戦レース（10〜12R）はゲームと同じく毎ステップのシミュレーションで走らせ、オッズも同じ仕組みで作る。
 * 人気・配当の集計は観戦レースだけ（1〜9R は簡易な結果でオッズを作らないため）。
 * ローテーションの集計は全レース。間隔は実際の日付（夏休みを含む）で数える。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildMarket, placeCount, settle } from '../src/betting/index.ts';
import { simulateRace } from '../src/sim/engine.ts';
import { horseProfiles } from '../src/sim/profile.ts';
import { FIRST_YEAR, WEEKS_PER_YEAR, weekOf } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld, raceKey } from '../src/sim/world/advance.ts';
import { ageOf } from '../src/sim/world/horses.ts';
import { raceSetup, weekCard } from '../src/sim/world/schedule.ts';
import type { FinishRecord } from '../src/sim/types.ts';
import type { Tier, WorldHorse } from '../src/sim/world/types.ts';

// ---------- 引数 ----------
const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const YEARS = Number(arg('years', '10'));
const SEED = Number(arg('seed', '2026'));
const OUT = arg('out', 'reports/realism_report.md');
const TITLE = arg('title', 'リアリティ計測');

// ---------- 集計の入れ物 ----------
type Acc = { n: number; win: number; top2: number; place: number; winRet: number; placeRet: number };
const acc = (): Acc => ({ n: 0, win: 0, top2: 0, place: 0, winRet: 0, placeRet: 0 });
const byPop = new Map<string, Acc>();
const favBand = new Map<string, Acc>();
const favBandG1 = new Map<string, Acc>();
const oddsBand = new Map<string, Acc>();
const quinella: number[] = [];
const trifecta: number[] = [];
let visibleRaces = 0;

const intervalBins = { all: new Map<string, number>(), graded: new Map<string, number>() };
const startsPerYear = { olderGraded: [] as number[], all: [] as number[] };
const g1Prev = new Map<string, Map<string, number>>();
const layoff = acc();
const layoffPops: number[] = [];
const promoted = acc();
/** G1 の出走馬の重賞実績（古馬 G1・2〜3歳 G1）：出走・重賞勝ち・重賞勝ちか近走の重賞3着以内 */
const g1Cred = { older: [0, 0, 0], young: [0, 0, 0] };
const tierCounts: { year: number; counts: Record<Tier, number> }[] = [];

const popKey = (p: number) => (p <= 10 ? String(p) : '11+');
const favBandKey = (o: number) => (o < 2 ? '1倍台' : o < 3 ? '2倍台' : o < 4 ? '3倍台' : '4倍以上');
const ODDS_BANDS: [number, number, string][] = [
  [1, 2, '1.0〜1.9'],
  [2, 3, '2.0〜2.9'],
  [3, 5, '3.0〜4.9'],
  [5, 10, '5.0〜9.9'],
  [10, 20, '10〜19.9'],
  [20, 50, '20〜49.9'],
  [50, 100, '50〜99.9'],
  [100, Infinity, '100以上'],
];
const oddsBandKey = (o: number) => ODDS_BANDS.find(([a, b]) => o >= a && o < b)![2];
const bump = (m: Map<string, Acc>, k: string) => {
  if (!m.has(k)) m.set(k, acc());
  return m.get(k)!;
};
const dayNum = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / 86_400_000;
/** 実際の日付での間隔（週） */
function weeksBetween(h: WorldHorse, year: number, month: number, day: number): number | null {
  const last = h.runs[h.runs.length - 1];
  if (!last) return null;
  return (dayNum(year, month, day) - dayNum(last.year, last.month, last.day)) / 7;
}
/** 中N週（JRAの数え方：前走から N+1 週後が「中N週」） */
const intervalKey = (w: number) => {
  const naka = Math.round(w) - 1;
  return naka <= 1 ? '中1週以下' : naka <= 4 ? '中2〜4週' : naka <= 9 ? '中5〜9週' : '中10週以上';
};

// ---------- 実行 ----------
const t0 = Date.now();
const world = createWorld(SEED);
const startsByHorseYear = new Map<string, number>();
const olderGradedIds = new Map<number, Set<number>>();

for (let k = 0; k < YEARS * WEEKS_PER_YEAR; k++) {
  const card = weekCard(world);
  const { year, week } = card;
  if (week.index === 0) {
    const counts = { maiden: 0, '1win': 0, '2win': 0, '3win': 0, open: 0 } as Record<Tier, number>;
    const og = new Set<number>();
    for (const h of world.horses) {
      if (h.retired) continue;
      counts[h.tier]++;
      if (ageOf(h, year) >= 4 && h.tier === 'open') og.add(h.id);
    }
    tierCounts.push({ year, counts });
    olderGradedIds.set(year, og);
  }
  const byId = new Map(world.horses.map((h) => [h.id, h]));

  // 出走前の情報（間隔・前走・昇級）
  const before = new Map<number, { interval: number | null; tier: Tier; prevRace: string | null; prevWonCondition: boolean }>();
  for (const r of card.races) {
    const day = week.days[r.dayIndex];
    for (const id of r.horseIds) {
      const h = byId.get(id)!;
      const last = h.runs[h.runs.length - 1];
      before.set(id, {
        interval: weeksBetween(h, year, day.month, day.day),
        tier: h.tier,
        prevRace: last ? last.race : null,
        prevWonCondition: !!last && last.rank === 1 && !last.grade && last.raceClass !== 'open',
      });
      const key = `${id}-${year}`;
      startsByHorseYear.set(key, (startsByHorseYear.get(key) ?? 0) + 1);
      const iv = before.get(id)!.interval;
      if (iv !== null) {
        const b = intervalKey(iv);
        intervalBins.all.set(b, (intervalBins.all.get(b) ?? 0) + 1);
        if (h.tier === 'open') intervalBins.graded.set(b, (intervalBins.graded.get(b) ?? 0) + 1);
      }
      if (r.grade === 'G1') {
        const c = r.program.age === '2' || r.program.age === '3' ? g1Cred.young : g1Cred.older;
        c[0]++;
        if (h.graded.length > 0) c[1]++;
        if (h.graded.length > 0 || h.runs.slice(-4).some((x) => x.grade && x.rank <= 3)) c[2]++;
        const m = g1Prev.get(r.program.name) ?? new Map<string, number>();
        const prev = last ? (last.abroad ? `${last.race}（海外）` : last.race) : '（初出走）';
        m.set(prev, (m.get(prev) ?? 0) + 1);
        g1Prev.set(r.program.name, m);
      }
    }
  }
  for (const a of [...card.abroad, ...card.offscreen]) {
    for (const id of a.horseIds) {
      const key = `${id}-${year}`;
      startsByHorseYear.set(key, (startsByHorseYear.get(key) ?? 0) + 1);
    }
  }

  // 観戦レース：オッズを作って走らせ、払い戻しを出す
  const finishes: Record<string, FinishRecord[]> = {};
  const popularity: Record<string, number[]> = {};
  for (const r of card.races.filter((x) => x.visible && x.horseIds.length > 0)) {
    const setup = raceSetup(world, card, r);
    const market = buildMarket(setup, horseProfiles(setup));
    const board = market.boards[market.boards.length - 1];
    const result = simulateRace(setup, { record: false });
    const order = result.finish.map((f) => f.number);
    const payouts = settle(market, order);
    const key = raceKey(world.serial, r);
    finishes[key] = result.finish;
    popularity[key] = board.popularity;
    visibleRaces++;
    const k3 = placeCount(setup.entries.length);
    const rankOf = new Map(result.finish.map((f) => [f.number, f.rank]));
    setup.entries.forEach((e, i) => {
      const pop = board.popularity[i];
      const odds = board.win[i];
      const rank = rankOf.get(e.number)!;
      const placeOdds = payouts.place.find((p) => p.number === e.number)?.odds ?? 0;
      const rows = [bump(byPop, popKey(pop)), bump(oddsBand, oddsBandKey(odds))];
      if (pop === 1) {
        rows.push(bump(favBand, favBandKey(odds)));
        if (r.grade === 'G1') rows.push(bump(favBandG1, favBandKey(odds)));
      }
      const b = before.get(r.horseIds[i])!;
      if (b.interval !== null && b.interval >= 10) {
        rows.push(layoff);
        layoffPops.push(pop);
      }
      for (const a of rows) {
        a.n++;
        if (rank === 1) {
          a.win++;
          a.winRet += odds;
        }
        if (rank <= 2) a.top2++;
        if (rank <= k3) {
          a.place++;
          a.placeRet += placeOdds;
        }
      }
    });
    quinella.push(payouts.quinella.odds * 100);
    trifecta.push(payouts.trifecta.odds * 100);
  }

  advanceWeek(world, { popularity, finishes });

  // 昇級直後の成績（全レース。advance 後の最新の1走がこのレース）
  const after = new Map(world.horses.map((h) => [h.id, h]));
  for (const r of card.races) {
    for (const id of r.horseIds) {
      const b = before.get(id)!;
      if (!b.prevWonCondition || r.grade) continue;
      const h = after.get(id);
      const run = h?.runs[h.runs.length - 1];
      if (!run) continue;
      promoted.n++;
      if (run.rank === 1) promoted.win++;
      if (run.rank <= 3) promoted.place++;
    }
  }
  if ((k + 1) % WEEKS_PER_YEAR === 0) process.stdout.write(`${year}年 終了（${Math.round((Date.now() - t0) / 1000)}秒）\n`);
}

for (const [key, n] of startsByHorseYear) {
  const [id, y] = key.split('-').map(Number);
  startsPerYear.all.push(n);
  if (olderGradedIds.get(y)?.has(id)) startsPerYear.olderGraded.push(n);
}

// ---------- 判定 ----------
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const f1 = (x: number) => x.toFixed(1);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const popAcc = (k: string) => byPop.get(k) ?? acc();
const rangeOf = (keys: string[]) => {
  const a = acc();
  for (const k of keys) {
    const x = popAcc(k);
    a.n += x.n;
    a.win += x.win;
    a.winRet += x.winRet;
  }
  return a;
};
const total = [...byPop.values()].reduce((a, x) => ({ ...a, n: a.n + x.n, win: a.win + x.win, winRet: a.winRet + x.winRet }), acc());
const intervalTotal = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const gradedShort = pct(intervalBins.graded.get('中1週以下') ?? 0, intervalTotal(intervalBins.graded));
const gradedCore = pct(
  (intervalBins.graded.get('中2〜4週') ?? 0) + (intervalBins.graded.get('中5〜9週') ?? 0),
  intervalTotal(intervalBins.graded),
);
const tenPlusEach = ['10', '11+'].map((k) => pct(popAcc(k).win, popAcc(k).n));
const g1Fav1x = favBandG1.get('1倍台') ?? acc();

type Check = { name: string; target: string; actual: string; ok: boolean; note?: string };
const within = (x: number, lo: number, hi: number) => x >= lo && x <= hi;
const checks: Check[] = [];
const add = (name: string, target: string, value: number, lo: number, hi: number, unit = '%', note?: string) =>
  checks.push({ name, target, actual: `${f1(value)}${unit}`, ok: within(value, lo, hi), note });
add('1番人気 勝率', '約32%（28〜36%）', pct(popAcc('1').win, popAcc('1').n), 28, 36);
add('1番人気 複勝率', '約63%（58〜68%）', pct(popAcc('1').place, popAcc('1').n), 58, 68);
add('2番人気 勝率', '約19%（16〜22%）', pct(popAcc('2').win, popAcc('2').n), 16, 22);
add('3番人気 勝率', '約13%（10〜16%）', pct(popAcc('3').win, popAcc('3').n), 10, 16);
const p45 = rangeOf(['4', '5']);
add('4〜5番人気 勝率', '約7〜9%（5〜11%）', pct(p45.win, p45.n), 5, 11);
add('10番人気以下 勝率（10番・11番以下の高い方）', '各1%前後（0.3〜2%）', Math.max(...tenPlusEach), 0.3, 2);
add('単勝回収率（全体）', '約75〜80%（70〜85%）', pct(total.winRet, total.n), 70, 85);
{
  const top = rangeOf(['1', '2', '3']);
  const long = rangeOf(['10', '11+']);
  const topRoi = pct(top.winRet, top.n);
  const longRoi = pct(long.winRet, long.n);
  checks.push({
    name: '人気別単勝回収率の傾向',
    target: '上位人気（約80%）＞大穴（50〜70%）',
    actual: `1〜3番人気 ${f1(topRoi)}% / 10番人気以下 ${f1(longRoi)}%`,
    ok: topRoi > longRoi && within(longRoi, 40, 75),
  });
}
add('1倍台の1番人気（G1） 勝率', '40〜50%（35〜55%）', pct(g1Fav1x.win, g1Fav1x.n), 35, 55, '%', `該当 ${g1Fav1x.n}レース`);
add('年間出走数（古馬重賞級）', '4〜7走（3〜8）', mean(startsPerYear.olderGraded), 3, 8, '走（平均）');
add('古馬G1の出走馬 重賞勝ち馬の割合', '大半（参考：75%以上）', pct(g1Cred.older[1], g1Cred.older[0]), 75, 100);
add('古馬G1の出走馬 重賞勝ちか近走の重賞3着以内', '大半（参考：90%以上）', pct(g1Cred.older[2], g1Cred.older[0]), 90, 100);
add('出走間隔（重賞級） 中1週以下', '5%未満', gradedShort, 0, 5);
add('出走間隔（重賞級） 中2〜9週の割合', '中心（参考：50%以上）', gradedCore, 50, 100);

// ---------- Markdown ----------
const lines: string[] = [];
const L = (s = '') => lines.push(s);
L(`# ${TITLE}`);
L();
L(`- 作成: ${new Date().toISOString().slice(0, 10)}　シード ${SEED}　${YEARS}年分（${FIRST_YEAR}年〜）`);
L(`- 観戦レース（人気・配当の集計対象） ${visibleRaces} レース。計算 ${Math.round((Date.now() - t0) / 1000)} 秒`);
L('- 目標値は JRA 平地全体の長期平均のおおよその目安（指示書 §2）。厳密な値ではない');
L();
L('## 判定');
L();
L('| 指標 | 目標 | 実測 | 判定 |');
L('| --- | --- | --- | --- |');
for (const c of checks) L(`| ${c.name} | ${c.target} | ${c.actual}${c.note ? `（${c.note}）` : ''} | ${c.ok ? 'OK' : 'NG'} |`);
L();
L('## 1. 人気別成績');
L();
L('| 人気 | 出走 | 勝率 | 連対率 | 複勝率 | 単勝回収率 | 複勝回収率 |');
L('| --- | --- | --- | --- | --- | --- | --- |');
for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11+']) {
  const a = popAcc(k);
  L(`| ${k} | ${a.n} | ${f1(pct(a.win, a.n))}% | ${f1(pct(a.top2, a.n))}% | ${f1(pct(a.place, a.n))}% | ${f1(pct(a.winRet, a.n))}% | ${f1(pct(a.placeRet, a.n))}% |`);
}
L();
L('## 2. 1番人気の単勝オッズ帯別');
L();
L('| オッズ帯 | 全レース 出走 | 勝率 | G1 出走 | G1 勝率 |');
L('| --- | --- | --- | --- | --- |');
for (const k of ['1倍台', '2倍台', '3倍台', '4倍以上']) {
  const a = favBand.get(k) ?? acc();
  const g = favBandG1.get(k) ?? acc();
  L(`| ${k} | ${a.n} | ${f1(pct(a.win, a.n))}% | ${g.n} | ${f1(pct(g.win, g.n))}% |`);
}
L();
L('## 3. オッズ帯別の勝率と回収率（全馬）');
L();
L('理想は「単勝オッズ X 倍の勝率 ≒ 0.8 / X」（回収率 ≒ 80%）。');
L();
L('| 単勝オッズ | 出走 | 勝率 | 0.8/X の目安 | 回収率 |');
L('| --- | --- | --- | --- | --- |');
for (const [a, b, k] of ODDS_BANDS) {
  const x = oddsBand.get(k) ?? acc();
  const mid = b === Infinity ? a * 1.5 : (a + b) / 2;
  L(`| ${k} | ${x.n} | ${f1(pct(x.win, x.n))}% | ${f1(80 / mid)}% | ${f1(pct(x.winRet, x.n))}% |`);
}
L();
L('## 4. 配当の分布（100円あたり）');
L();
L('| 券種 | 平均 | 中央値 | 万馬券率 |');
L('| --- | --- | --- | --- |');
for (const [name, xs] of [
  ['馬連', quinella],
  ['3連単', trifecta],
] as const) {
  L(`| ${name} | ${Math.round(mean(xs)).toLocaleString()}円 | ${Math.round(median(xs)).toLocaleString()}円 | ${f1(pct(xs.filter((x) => x >= 10000).length, xs.length))}% |`);
}
L();
L('## 5. ローテーション');
L();
L('### 出走間隔（実際の日付で数える。夏休みを含む）');
L();
L('| 間隔 | 全馬 | 重賞級（オープン馬） |');
L('| --- | --- | --- |');
for (const k of ['中1週以下', '中2〜4週', '中5〜9週', '中10週以上']) {
  L(`| ${k} | ${f1(pct(intervalBins.all.get(k) ?? 0, intervalTotal(intervalBins.all)))}% | ${f1(pct(intervalBins.graded.get(k) ?? 0, intervalTotal(intervalBins.graded)))}% |`);
}
L();
L(`### 1頭あたりの年間出走数`);
L();
L(`- 全馬: 平均 ${f1(mean(startsPerYear.all))}走（中央値 ${median(startsPerYear.all)}）`);
L(`- 古馬重賞級（年初に4歳以上のオープン馬）: 平均 ${f1(mean(startsPerYear.olderGraded))}走（中央値 ${median(startsPerYear.olderGraded)}、最大 ${Math.max(0, ...startsPerYear.olderGraded)}）`);
L();
L('### G1の出走馬の重賞実績');
L();
L('| G1 | 出走 | 重賞勝ち馬 | 重賞勝ちか近走の重賞3着以内 |');
L('| --- | --- | --- | --- |');
for (const [name, c] of [
  ['古馬G1', g1Cred.older],
  ['2〜3歳G1', g1Cred.young],
] as const) {
  L(`| ${name} | ${c[0]} | ${f1(pct(c[1], c[0]))}% | ${f1(pct(c[2], c[0]))}% |`);
}
L();
L('### G1の前走（上位5つ）');
L();
L('| G1 | 前走の内訳（頭数） |');
L('| --- | --- |');
for (const [name, m] of [...g1Prev].sort()) {
  const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  L(`| ${name} | ${top.map(([r, n]) => `${r} ${n}`).join('、')} |`);
}
L();
L('### 休み明け初戦（実際の日付で10週以上あいた馬・観戦レース）');
L();
L(`- 出走 ${layoff.n}　勝率 ${f1(pct(layoff.win, layoff.n))}%　複勝率 ${f1(pct(layoff.place, layoff.n))}%　平均人気 ${f1(mean(layoffPops))}　単勝回収率 ${f1(pct(layoff.winRet, layoff.n))}%`);
L();
L('## 6. クラス別の頭数（各年の初め）と昇級直後の成績');
L();
L('| 年 | 未勝利 | 1勝 | 2勝 | 3勝 | オープン |');
L('| --- | --- | --- | --- | --- | --- |');
for (const t of tierCounts) L(`| ${t.year} | ${t.counts.maiden} | ${t.counts['1win']} | ${t.counts['2win']} | ${t.counts['3win']} | ${t.counts.open} |`);
L();
L(`- 昇級直後（前走で条件戦を勝った馬の次走、全レース）: 出走 ${promoted.n}　勝率 ${f1(pct(promoted.win, promoted.n))}%　3着内率 ${f1(pct(promoted.place, promoted.n))}%`);
L();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'));
console.log(`\n${OUT} に書き出しました`);
for (const c of checks) console.log(`${c.ok ? 'OK' : 'NG'}  ${c.name}: ${c.actual}（目標 ${c.target}）`);
