/**
 * リアリティの計測ツール。名簿の世界を画面なしで N 年分（既定10年）動かし、
 * 人気別成績・オッズ帯・配当・ローテーションなどを集計して reports/ に Markdown で書き出す。
 *
 *   npm run sim:season -- --years 10 --seed 2026 --out reports/realism_report.md
 *
 * 観戦レース（10R・11R、ダービーデーの12R）はゲームと同じく毎ステップのシミュレーションで走らせ、オッズも同じ仕組みで作る。
 * 人気・配当の集計は観戦レースだけ（1〜9R は簡易な結果でオッズを作らないため）。
 * ローテーションの集計は全レース。間隔は実際の日付（夏休みを含む）で数える。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BETTING, buildMarket, placeCount, settle } from '../src/betting/index.ts';
import { combinationKey, quinellaKey, type ComboType } from '../src/betting/types.ts';
import { simulateRace } from '../src/sim/engine.ts';
import { horseProfiles } from '../src/sim/profile.ts';
import { FIRST_YEAR, WEEKS_PER_YEAR, weekOf } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld, raceKey } from '../src/sim/world/advance.ts';
import { ageOf, currentStats, rating } from '../src/sim/world/horses.ts';
import { SUMMER_RACES } from '../src/sim/world/offscreen.ts';
import { syutoku } from '../src/sim/world/prize.ts';
import { initialJockeys } from '../src/sim/world/jockeys.ts';
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
/** 騎手のランク別（観戦レース）。キーはランク、または「ランク:人気帯」 */
const byJockey = new Map<string, Acc>();
/** G1（観戦レース）の騎乗数のランク別 */
const g1Rides = new Map<string, number>();
/** 前走3着以内の馬の、前走の格と今回の格の差（格下げ・同じ・昇級）ごと */
const byStep = new Map<string, Acc>();
const LEVEL: Record<string, number> = { newcomer: 0, maiden: 0, '1win': 1, '2win': 2, '3win': 3, open: 4, G3: 5, G2: 6, G1: 7 };
/** 大レースの予想記事の本命・穴（観戦レース） */
const pressAcc = { favorite: { n: 0, win: 0, ret: 0, pop: 0 }, dark: { n: 0, win: 0, ret: 0, pop: 0 } };
const oddsBand = new Map<string, Acc>();
const quinella: number[] = [];
const trifecta: number[] = [];
let visibleRaces = 0;
/** 組み合わせ馬券の全通り買い（点数と払い戻しの合計、1点1倍） */
const COMBOS: readonly ComboType[] = ['quinella', 'wide', 'exacta', 'trio', 'trifecta'];
const COMBO_LABEL: Record<ComboType, string> = { quinella: '馬連', wide: 'ワイド', exacta: '馬単', trio: '3連複', trifecta: '3連単' };
const allCombo = Object.fromEntries(COMBOS.map((t) => [t, { stake: 0, ret: 0 }])) as Record<ComboType, { stake: number; ret: number }>;
/** オッズが示す確率（(1−控除率)/オッズ）の帯ごとの、期待の的中数と実際の的中数 */
const CALIB_BANDS: Record<'exacta' | 'trifecta', [number, string][]> = {
  exacta: [
    [0.05, '5%以上'],
    [0.01, '1〜5%'],
    [0.002, '0.2〜1%'],
    [0, '0.2%未満'],
  ],
  trifecta: [
    [0.01, '1%以上'],
    [0.001, '0.1〜1%'],
    [0.0001, '0.01〜0.1%'],
    [0, '0.01%未満'],
  ],
};
const calib = new Map<string, { exp: number; hit: number }>();
/** 単勝オッズから逆算した勝率（Harville）で期待値1以上の馬連・馬単を買う（券種の間の値付けのずれを突く買い方） */
const evBuy = { quinella: { stake: 0, ret: 0 }, exacta: { stake: 0, ret: 0 } };
/** 1番人気のオッズ帯ごとの、2〜5番人気の単勝を全部買った回収率（修正指示書2 の sharp_probe と同じ） */
const FAV_BANDS = ['1.1〜1.4倍', '1.5〜1.9倍', '2.0〜2.9倍', '3.0倍以上'] as const;
const favBandOf = (o: number) => (o < 1.5 ? FAV_BANDS[0] : o < 2 ? FAV_BANDS[1] : o < 3 ? FAV_BANDS[2] : FAV_BANDS[3]);
const second5 = new Map<string, { stake: number; ret: number }>();

const intervalBins = { all: new Map<string, number>(), graded: new Map<string, number>() };
const startsPerYear = { olderGraded: [] as number[], all: [] as number[] };
const g1Prev = new Map<string, Map<string, number>>();
const layoff = acc();
const layoffPops: number[] = [];
const promoted = acc();
/** G1 の出走馬の重賞実績（古馬 G1・2〜3歳 G1）：出走・重賞勝ち・重賞勝ちか近走の重賞3着以内 */
const g1Cred = { older: [0, 0, 0], young: [0, 0, 0] };
const tierCounts: { year: number; counts: Record<Tier, number> }[] = [];
/**
 * 一流馬のローテーション（修正指示書2 の elite_probe と同じ集計）。年の初めの区分：
 * G1 馬（4歳以上でそれまでに G1 勝ち）・能力上位10頭（4歳以上）・JC/有馬の距離が合う芝の能力上位10頭（得意距離が2400mの±22%）
 */
type EliteYear = { all: number; g1: number; g23: number; open: number; abroad: number; races: string[] };
const eliteRuns = new Map<string, EliteYear>();
const eliteGroups = new Map<number, { g1Winners: Set<number>; top10: Set<number>; longTop10: Set<number> }>();
const olderG1Fields = new Map<string, { races: number; n: number; g1w: number; top: number; longTop: number; g1Now: number }>();
const runSig = (r: { year: number; month: number; day: number; race: string }) => `${r.year}-${r.month}-${r.day}-${r.race}`;
const lastRunSig = new Map<number, string>();
/** 夏の重賞ごとの出走馬の収得賞金（夏の前の値）の合計と頭数 */
const SUMMER_NAMES = new Set(SUMMER_RACES.map((r) => r.name));
const summerMoney = new Map<string, { sum: number; n: number }>();

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
for (const h of world.horses) if (h.runs.length) lastRunSig.set(h.id, runSig(h.runs[h.runs.length - 1]));
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
    const older = world.horses.filter((h) => !h.retired && ageOf(h, year) >= 4);
    const byRating = [...older].sort((a, b) => rating(currentStats(b, year, 0)) - rating(currentStats(a, year, 0)));
    eliteGroups.set(year, {
      g1Winners: new Set(older.filter((h) => h.graded.some((g) => g.grade === 'G1')).map((h) => h.id)),
      top10: new Set(byRating.slice(0, 10).map((h) => h.id)),
      longTop10: new Set(
        byRating
          .filter((h) => h.surfaceAptitude.turf >= 1 && Math.abs(Math.log(2400 / h.bestDistance)) <= 0.22)
          .slice(0, 10)
          .map((h) => h.id),
      ),
    });
  }
  {
    const g = eliteGroups.get(year);
    for (const r of card.races) {
      if (r.grade !== 'G1' || r.program.age === '2' || r.program.age === '3' || !g) continue;
      const x = olderG1Fields.get(r.program.name) ?? { races: 0, n: 0, g1w: 0, top: 0, longTop: 0, g1Now: 0 };
      x.races++;
      // 出走の時点の G1 馬（その年に勝った馬も含む）
      x.g1Now += r.horseIds.filter((id) => world.horses.find((h) => h.id === id)!.graded.some((gw) => gw.grade === 'G1')).length;
      x.n += r.horseIds.length;
      x.g1w += r.horseIds.filter((id) => g.g1Winners.has(id)).length;
      x.top += r.horseIds.filter((id) => g.top10.has(id)).length;
      x.longTop += r.horseIds.filter((id) => g.longTop10.has(id)).length;
      olderG1Fields.set(r.program.name, x);
    }
  }
  const moneyBeforeSummer = weekOf(world.serial + 1).week.afterSummer ? new Map(world.horses.map((h) => [h.id, syutoku(h)])) : null;
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
      for (const [k, num] of [['favorite', setup.press?.favorite], ['dark', setup.press?.darkHorse]] as const) {
        if (num !== e.number) continue;
        const a = pressAcc[k];
        a.n++;
        a.pop += pop;
        if (rank === 1) {
          a.win++;
          a.ret += odds;
        }
      }
      const prev = e.history?.[0];
      if (prev && prev.rank <= 3 && prev.raceClass && setup.raceClass) {
        const d = LEVEL[prev.raceClass] - LEVEL[setup.raceClass];
        rows.push(bump(byStep, d > 0 ? '格下げ' : d === 0 ? '同じ格' : '昇級'));
      }
      const jr = e.jockey?.rank ?? '-';
      rows.push(bump(byJockey, jr), bump(byJockey, `${jr}:${pop <= 3 ? '1-3' : pop <= 6 ? '4-6' : '7+'}`));
      if (r.grade === 'G1') g1Rides.set(jr, (g1Rides.get(jr) ?? 0) + 1);
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
    {
      const band = favBandOf(Math.min(...board.win));
      const x = second5.get(band) ?? { stake: 0, ret: 0 };
      setup.entries.forEach((e, i) => {
        const pop = board.popularity[i];
        if (pop < 2 || pop > 5) return;
        x.stake++;
        if (order[0] === e.number) x.ret += board.win[i];
      });
      second5.set(band, x);
    }
    // 全通り買い
    allCombo.quinella.ret += payouts.quinella.odds;
    allCombo.wide.ret += payouts.wide.reduce((a, w) => a + w.odds, 0);
    allCombo.exacta.ret += payouts.exacta.odds;
    allCombo.trio.ret += payouts.trio.odds;
    allCombo.trifecta.ret += payouts.trifecta.odds;
    for (const t of COMBOS) allCombo[t].stake += board[t].size;
    // 校正
    for (const t of ['exacta', 'trifecta'] as const) {
      const winKey = combinationKey(t, order.slice(0, t === 'exacta' ? 2 : 3));
      for (const [key, o] of board[t]) {
        const imp = (1 - BETTING.takeout[t]) / o;
        const band = CALIB_BANDS[t].find(([lo]) => imp >= lo)![1];
        const c = calib.get(`${t}:${band}`) ?? { exp: 0, hit: 0 };
        c.exp += imp;
        if (key === winKey) c.hit++;
        calib.set(`${t}:${band}`, c);
      }
    }
    // 単勝オッズから逆算した期待値で選ぶ馬連・馬単
    {
      const inv = board.win.map((o) => 1 / o);
      const z = inv.reduce((a, b) => a + b, 0);
      const p = inv.map((x) => x / z);
      const ex = (i: number, j: number) => (p[i] * p[j]) / (1 - p[i]);
      const qWin = quinellaKey(order[0], order[1]);
      const eWin = combinationKey('exacta', order.slice(0, 2));
      const n = p.length;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const ek = combinationKey('exacta', [i + 1, j + 1]);
          const eo = board.exacta.get(ek)!;
          if (ex(i, j) * eo >= 1) {
            evBuy.exacta.stake++;
            if (ek === eWin) evBuy.exacta.ret += eo;
          }
          if (i < j) {
            const qk = quinellaKey(i + 1, j + 1);
            const qo = board.quinella.get(qk)!;
            if ((ex(i, j) + ex(j, i)) * qo >= 1) {
              evBuy.quinella.stake++;
              if (qk === qWin) evBuy.quinella.ret += qo;
            }
          }
        }
    }
  }

  advanceWeek(world, { popularity, finishes });

  // 一流馬の1年の出走（この週に増えた戦績）と、夏の重賞の出走馬の収得賞金
  for (const h of world.horses) {
    if (!h.runs.length) continue;
    const prev = lastRunSig.get(h.id);
    const fresh = [];
    for (let i = h.runs.length - 1; i >= 0; i--) {
      if (runSig(h.runs[i]) === prev) break;
      fresh.unshift(h.runs[i]);
    }
    lastRunSig.set(h.id, runSig(h.runs[h.runs.length - 1]));
    for (const r of fresh) {
      const key = `${h.id}-${r.year}`;
      const s = eliteRuns.get(key) ?? { all: 0, g1: 0, g23: 0, open: 0, abroad: 0, races: [] };
      s.all++;
      if (r.abroad) s.abroad++;
      else if (r.grade === 'G1') s.g1++;
      else if (r.grade) s.g23++;
      else if (r.raceClass === 'open') s.open++;
      s.races.push(r.race);
      eliteRuns.set(key, s);
      if (moneyBeforeSummer && r.offscreen && SUMMER_NAMES.has(r.race)) {
        const m = summerMoney.get(r.race) ?? { sum: 0, n: 0 };
        m.sum += moneyBeforeSummer.get(h.id) ?? 0;
        m.n++;
        summerMoney.set(r.race, m);
      }
    }
  }

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
{
  // 休み明けは「少し狙い目」（ユーザーの指示）：全体の回収率より高いが、上がりすぎない
  const all = pct(total.winRet, total.n);
  const lay = pct(layoff.winRet, layoff.n);
  checks.push({
    name: '休み明け初戦の単勝回収率',
    target: '全体より少し高い（全体〜全体+15ポイント、100%未満）',
    actual: `${f1(lay)}%（全体 ${f1(all)}%）`,
    ok: lay >= all - 3 && lay <= Math.min(all + 15, 100),
  });
}
// ---------- 一流馬のローテーション（修正指示書2） ----------
const eliteRows = (pick: (g: { g1Winners: Set<number>; top10: Set<number>; longTop10: Set<number> }) => Set<number>) => {
  const rows: EliteYear[] = [];
  const years = [...eliteGroups.keys()];
  for (const [year, g] of eliteGroups) {
    if (year === years[years.length - 1] && YEARS * WEEKS_PER_YEAR % WEEKS_PER_YEAR !== 0) continue;
    for (const id of pick(g)) rows.push(eliteRuns.get(`${id}-${year}`) ?? { all: 0, g1: 0, g23: 0, open: 0, abroad: 0, races: [] });
  }
  return rows;
};
const g1wRows = eliteRows((g) => g.g1Winners);
const longRows = eliteRows((g) => g.longTop10);
const top10Rows = eliteRows((g) => g.top10);
const meanOf = (rows: EliteYear[], f: (s: EliteYear) => number) => (rows.length ? rows.reduce((a, s) => a + f(s), 0) / rows.length : 0);
const jcArima = [...eliteRuns.values()].filter((s) => s.races.includes('ジャパンC') && s.races.includes('有馬記念')).length;
const perRace = (name: string, f: (x: { races: number; n: number; g1w: number; top: number; longTop: number; g1Now: number }) => number) => {
  const x = olderG1Fields.get(name);
  return x && x.races ? f(x) / x.races : 0;
};
add('同じ年にジャパンCと有馬記念の両方に出た馬', '1頭以上（10年で）', jcArima, 1, Infinity, '頭×年');
for (const name of ['ジャパンC', '有馬記念']) {
  add(`${name}の年初のG1馬（1レースあたり）`, '4頭以上', perRace(name, (x) => x.g1w), 4, Infinity, '頭');
  add(`${name}の距離が合う芝の能力上位10頭（1レースあたり）`, '2頭以上（ユーザーの指示で、距離の合う馬で測る）', perRace(name, (x) => x.longTop), 2, Infinity, '頭');
}
for (const name of ['天皇賞・春', '宝塚記念', '天皇賞・秋', 'ジャパンC', '有馬記念']) {
  add(`${name}の出走時のG1馬（1レースあたり）`, '3頭以上（ユーザーの指示：3〜4頭は出てほしい）', perRace(name, (x) => x.g1Now), 3, Infinity, '頭');
}
add('年初のG1馬 出走のうちG1が半分以上の馬', '修正前71%より上', pct(g1wRows.filter((s) => s.all > 0 && (s.g1 + s.abroad) / s.all >= 0.5).length, g1wRows.length), 71.01, 100);
add('年初のG1馬 オープン特別の出走（1年あたり）', 'ほぼ0', meanOf(g1wRows, (s) => s.open), 0, 0.1, '走');
{
  const m = g1Prev.get('スプリンターズS') ?? new Map<string, number>();
  const all = [...m.values()].reduce((a, b) => a + b, 0);
  add('スプリンターズSの前走がアイビスSDの割合', '半分以下', pct(m.get('アイビスサマーダッシュ') ?? 0, all), 0, 50);
}

// 組み合わせ馬券：全通り買いの回収率は「1 − 控除率」の ±5ポイント（指示書 課題2）
for (const t of COMBOS) {
  const roi = pct(allCombo[t].ret, allCombo[t].stake);
  const mid = (1 - BETTING.takeout[t]) * 100;
  add(`${COMBO_LABEL[t]}の全通り買い 回収率`, `${f1(mid)}%前後（±5）`, roi, mid - 5, mid + 5);
}
for (const band of FAV_BANDS) {
  const x = second5.get(band) ?? { stake: 0, ret: 0 };
  add(`1番人気${band}のレースの2〜5番人気の単勝 回収率`, '100%未満（指示書の目標は4シード平均で90%未満）', pct(x.ret, x.stake), 0, 99.99);
}
for (const t of ['quinella', 'exacta'] as const) {
  add(`単勝オッズから逆算した期待値1以上の${COMBO_LABEL[t]} 回収率`, '100%未満', pct(evBuy[t].ret, evBuy[t].stake), 0, 99.99);
}
for (const t of ['exacta', 'trifecta'] as const) {
  for (const [, band] of CALIB_BANDS[t]) {
    const c = calib.get(`${t}:${band}`) ?? { exp: 0, hit: 0 };
    const ratio = c.exp > 0 ? c.hit / c.exp : 0;
    checks.push({
      name: `${COMBO_LABEL[t]}の校正（オッズが示す確率 ${band}）`,
      target: '実際の的中 ÷ 期待の的中 0.8〜1.25',
      actual: `${ratio.toFixed(2)}（期待 ${f1(c.exp)}・実際 ${c.hit}）`,
      ok: within(ratio, 0.8, 1.25),
    });
  }
}

const RANKS = ['S+', 'S', 'A', 'B', 'C'] as const;
{
  const wr = RANKS.map((k) => {
    const a = byJockey.get(k);
    return a ? pct(a.win, a.n) : 0;
  });
  checks.push({
    name: '騎手のランク別 勝率（S+・S・A・B・C）',
    target: 'S+＞S＞A＞B・C（B と C は騎乗の少ない C のぶれが大きいので比べない）',
    actual: wr.map((x) => `${f1(x)}%`).join(' / '),
    ok: wr[0] > wr[1] && wr[1] > wr[2] && wr[2] > Math.max(wr[3], wr[4]),
  });
  for (const k of RANKS) {
    const a = byJockey.get(k);
    if (a) add(`騎手 ${k} の単勝回収率`, '100%未満', pct(a.winRet, a.n), 0, 99.99);
  }
}

for (const k of ['格下げ', '同じ格', '昇級']) {
  const a = byStep.get(k);
  if (a) add(`前走3着以内・${k}の単勝回収率`, '100%未満', pct(a.winRet, a.n), 0, 99.99, '%', `${a.n}頭・勝率${f1(pct(a.win, a.n))}%`);
}
for (const [k, label] of [['favorite', '本命'], ['dark', '穴']] as const) {
  const a = pressAcc[k];
  if (a.n > 0) add(`G1の予想記事の${label}の単勝回収率`, '100%未満', pct(a.ret, a.n), 0, 99.99, '%', `${a.n}頭・平均${f1(a.pop / a.n)}番人気・勝率${f1(pct(a.win, a.n))}%`);
}

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
L('### 一流馬のローテーション（年の初めの区分ごと、1年あたり）');
L();
L('| 区分 | 馬×年 | 出走 | 国内G1 | G2・G3 | オープン特別 | 海外 | 国内G1が0走 | G1が出走の半分以上 |');
L('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [label, rows] of [
  ['G1馬（4歳以上）', g1wRows],
  ['能力上位10頭（4歳以上）', top10Rows],
  ['JC・有馬の距離が合う芝の能力上位10頭', longRows],
] as const) {
  L(
    `| ${label} | ${rows.length} | ${f1(meanOf(rows, (s) => s.all))} | ${f1(meanOf(rows, (s) => s.g1))} | ${f1(meanOf(rows, (s) => s.g23))} | ${f1(meanOf(rows, (s) => s.open))} | ${f1(meanOf(rows, (s) => s.abroad))} | ${f1(pct(rows.filter((s) => s.g1 === 0).length, rows.length))}% | ${f1(pct(rows.filter((s) => s.all > 0 && (s.g1 + s.abroad) / s.all >= 0.5).length, rows.length))}% |`,
  );
}
L();
L(`- 同じ年にジャパンCと有馬記念の両方に出た馬: ${jcArima}頭×年`);
L();
L('| 古馬G1 | 頭数 | 年初のG1馬 | 年初の能力上位10頭 | 距離が合う芝の上位10頭（JC・有馬の距離） |');
L('| --- | --- | --- | --- | --- |');
for (const [name, x] of olderG1Fields) {
  L(`| ${name} | ${f1(x.n / x.races)} | ${f1(x.g1w / x.races)} | ${f1(x.top / x.races)} | ${f1(x.longTop / x.races)} |`);
}
L();
L('### 夏の重賞の出走馬（収得賞金は夏の前の値の平均）');
L();
L('| 夏の重賞 | 頭数（10年） | 収得賞金の平均（万円） |');
L('| --- | --- | --- |');
for (const r of SUMMER_RACES) {
  const m = summerMoney.get(r.name);
  L(`| ${r.name} | ${m?.n ?? 0} | ${m ? Math.round(m.sum / m.n).toLocaleString() : '—'} |`);
}
L();
L('### 休み明け初戦（実際の日付で10週以上あいた馬・観戦レース）');
L();
L(`- 出走 ${layoff.n}　勝率 ${f1(pct(layoff.win, layoff.n))}%　複勝率 ${f1(pct(layoff.place, layoff.n))}%　平均人気 ${f1(mean(layoffPops))}　単勝回収率 ${f1(pct(layoff.winRet, layoff.n))}%`);
L();
L('## 7. 騎手（観戦レース）');
L();
L('| ランク | 騎乗 | 勝率 | 複勝率 | 単勝回収率 | 1〜3番人気の単勝回収率 | 4〜6番人気 | 7番人気以下 | G1の騎乗 |');
L('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const k of [...RANKS, '-']) {
  const a = byJockey.get(k);
  if (!a) continue;
  const roiOf = (band: string) => {
    const x = byJockey.get(`${k}:${band}`);
    return x ? `${f1(pct(x.winRet, x.n))}%（${x.n}）` : '—';
  };
  L(`| ${k} | ${a.n} | ${f1(pct(a.win, a.n))}% | ${f1(pct(a.place, a.n))}% | ${f1(pct(a.winRet, a.n))}% | ${roiOf('1-3')} | ${roiOf('4-6')} | ${roiOf('7+')} | ${g1Rides.get(k) ?? 0} |`);
}
L();
L('### 騎手の通算成績（全レース・上位20人）と最後のランク');
L();
L('| 騎手 | 最初 | 最後 | 騎乗 | 勝利 | 勝率 | 重賞 | G1 |');
L('| --- | --- | --- | --- | --- | --- | --- | --- |');
{
  const first = new Map(initialJockeys().map((j) => [j.id, j.rank]));
  for (const j of [...(world.jockeys ?? [])].sort((a, b) => b.wins - a.wins).slice(0, 20)) {
    L(`| ${j.name} | ${first.get(j.id)} | ${j.rank} | ${j.starts} | ${j.wins} | ${f1(pct(j.wins, j.starts))}% | ${j.graded.length} | ${j.graded.filter((g) => g.grade === 'G1').length} |`);
  }
  const ups = (world.jockeys ?? []).filter((j) => first.get(j.id) !== j.rank);
  L();
  L(`- 昇格した騎手 ${ups.length}人：${ups.map((j) => `${j.name}（${first.get(j.id)}→${j.rank}）`).join('、') || 'なし'}`);
}
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
