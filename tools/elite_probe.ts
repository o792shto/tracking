/**
 * 一流馬のローテーションの検証（分析用）。名簿の世界を N 年動かし、G1 馬・能力上位馬が
 * 1年に何走し、そのうち G1 がいくつかを数える。観戦レースも簡易な結果で走らせる（ローテーションは出走表で決まるため）。
 *   npx tsx tools/elite_probe.ts --years 10 --seed 2026
 */
import { WEEKS_PER_YEAR } from '../src/sim/world/calendar.ts';
import { advanceWeek, createWorld } from '../src/sim/world/advance.ts';
import { ageOf, currentStats, rating } from '../src/sim/world/horses.ts';
import { weekCard } from '../src/sim/world/schedule.ts';
import type { RunRecord, WorldHorse } from '../src/sim/world/types.ts';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const YEARS = Number(arg('years', '10'));
const SEED = Number(arg('seed', '2026'));

const world = createWorld(SEED);
const sig = (r: RunRecord) => `${r.year}-${r.month}-${r.day}-${r.race}`;
const lastSig = new Map<number, string>();
for (const h of world.horses) if (h.runs.length) lastSig.set(h.id, sig(h.runs[h.runs.length - 1]));

type Starts = { all: number; g1: number; g23: number; open: number; cond: number; abroad: number; summer: number; names: string[] };
const blank = (): Starts => ({ all: 0, g1: 0, g23: 0, open: 0, cond: 0, abroad: 0, summer: 0, names: [] });
const byHorseYear = new Map<string, Starts>();
// 年の初めの区分：G1馬（それまでに G1 勝ち）・能力上位10頭（4歳以上）
const groups = new Map<number, { g1Winners: Set<number>; top10: Set<number> }>();
// 古馬 G1 の出走馬のうち、G1 馬・能力上位10頭の数
const g1Fields: { race: string; n: number; g1w: number; top: number }[] = [];

function classify(r: RunRecord, s: Starts) {
  s.all++;
  if (r.abroad) s.abroad++;
  else if (r.grade === 'G1') s.g1++;
  else if (r.grade === 'G2' || r.grade === 'G3') s.g23++;
  else if (r.raceClass === 'open') s.open++;
  else s.cond++;
  if (!r.abroad && r.grade && r.month >= 7 && r.month <= 8) s.summer++;
  s.names.push(`${r.race}${r.abroad ? '(海外)' : ''}${r.rank}着`);
}

for (let k = 0; k < YEARS * WEEKS_PER_YEAR; k++) {
  const card = weekCard(world);
  const { year, week } = card;
  if (week.index === 0) {
    const progress = 0;
    const active = world.horses.filter((h) => !h.retired && ageOf(h, year) >= 4);
    const g1Winners = new Set(active.filter((h) => h.graded.some((g) => g.grade === 'G1')).map((h) => h.id));
    const top10 = new Set(
      [...active]
        .sort((a, b) => rating(currentStats(b, year, progress)) - rating(currentStats(a, year, progress)))
        .slice(0, 10)
        .map((h) => h.id),
    );
    groups.set(year, { g1Winners, top10 });
  }
  const gr = groups.get(year);
  for (const r of card.races) {
    if (r.grade !== 'G1' || r.program.age === '2' || r.program.age === '3') continue;
    g1Fields.push({
      race: r.program.name,
      n: r.horseIds.length,
      g1w: gr ? r.horseIds.filter((id) => gr.g1Winners.has(id)).length : 0,
      top: gr ? r.horseIds.filter((id) => gr.top10.has(id)).length : 0,
    });
  }
  advanceWeek(world, { full: false });
  for (const h of world.horses) {
    if (!h.runs.length) continue;
    const prev = lastSig.get(h.id);
    const fresh: RunRecord[] = [];
    for (let i = h.runs.length - 1; i >= 0; i--) {
      if (sig(h.runs[i]) === prev) break;
      fresh.unshift(h.runs[i]);
    }
    lastSig.set(h.id, sig(h.runs[h.runs.length - 1]));
    for (const r of fresh) {
      const key = `${h.id}-${r.year}`;
      const s = byHorseYear.get(key) ?? blank();
      classify(r, s);
      byHorseYear.set(key, s);
    }
  }
}

const byId = new Map<number, WorldHorse>(world.horses.map((h) => [h.id, h]));
function report(label: string, pick: (g: { g1Winners: Set<number>; top10: Set<number> }) => Set<number>) {
  const rows: Starts[] = [];
  let dirt = 0, dirtZero = 0, turfZero = 0, capHit = 0;
  const examples: string[] = [];
  for (const [year, g] of groups) {
    if (year === [...groups.keys()].at(-1)) continue; // 途中の年は除く
    for (const id of pick(g)) {
      const s = byHorseYear.get(`${id}-${year}`) ?? blank();
      rows.push(s);
      const h = byId.get(id);
      const isDirt = h ? h.surfaceAptitude.dirt >= 1 && h.surfaceAptitude.turf < 1 : false;
      if (isDirt) dirt++;
      if (s.g1 === 0) { if (isDirt) dirtZero++; else turfZero++; }
      const cap = h && h.graded.some((g) => g.grade === 'G1') ? 6 : 7;
      if (s.all >= cap) capHit++;
      if (examples.length < 12 && s.all > 0) examples.push(`${year} ${byId.get(id)?.name ?? id}: ${s.names.join(' → ')}`);
    }
  }
  const mean = (f: (s: Starts) => number) => (rows.reduce((a, s) => a + f(s), 0) / rows.length).toFixed(2);
  const share = (f: (s: Starts) => boolean) => ((rows.filter(f).length / rows.length) * 100).toFixed(0) + '%';
  const both = rows.filter((s) => s.names.some((x) => x.startsWith('ジャパンC')) && s.names.some((x) => x.startsWith('有馬記念'))).length;
  const jc = rows.filter((s) => s.names.some((x) => x.startsWith('ジャパンC'))).length;
  console.log(`ジャパンCに出た馬×年 ${jc}、そのうち同じ年に有馬記念にも出た ${both}`);
  console.log(`\n## ${label}（馬×年 ${rows.length}）`);
  console.log(`平均：出走 ${mean((s) => s.all)}、国内G1 ${mean((s) => s.g1)}、G2・G3 ${mean((s) => s.g23)}（うち夏 ${mean((s) => s.summer)}）、オープン特別 ${mean((s) => s.open)}、条件戦 ${mean((s) => s.cond)}、海外 ${mean((s) => s.abroad)}`);
  console.log(`国内G1が0走 ${share((s) => s.g1 === 0)}、1〜2走 ${share((s) => s.g1 >= 1 && s.g1 <= 2)}、3走以上 ${share((s) => s.g1 >= 3)}、4走以上 ${share((s) => s.g1 >= 4)}`);
  console.log(`出走のうちG1（国内＋海外）の割合が半分以上 ${share((s) => s.all > 0 && (s.g1 + s.abroad) / s.all >= 0.5)}、1年走らず ${share((s) => s.all === 0)}`);
  console.log(`ダート馬 ${dirt}、国内G1 0走のうちダート馬 ${dirtZero}・芝馬 ${turfZero}、年間出走数の上限に達した ${capHit}`);
  for (const e of examples.slice(0, 4)) console.log(`  例 ${e}`);
}
console.log(`seed=${SEED} years=${YEARS}`);
report('年の初めにG1馬だった4歳以上', (g) => g.g1Winners);
report('年の初めに能力上位10頭（4歳以上）', (g) => g.top10);

const byRace = new Map<string, { n: number; races: number; g1w: number; top: number }>();
for (const f of g1Fields) {
  const x = byRace.get(f.race) ?? { n: 0, races: 0, g1w: 0, top: 0 };
  x.n += f.n;
  x.races++;
  x.g1w += f.g1w;
  x.top += f.top;
  byRace.set(f.race, x);
}
console.log('\n## 古馬G1の1レースあたり（頭数・年初のG1馬・年初の能力上位10頭）');
for (const [name, x] of byRace) console.log(`${name}\t${(x.n / x.races).toFixed(1)}頭\tG1馬 ${(x.g1w / x.races).toFixed(1)}\t上位10頭 ${(x.top / x.races).toFixed(1)}`);
