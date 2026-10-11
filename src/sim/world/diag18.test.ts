import { test } from 'vitest';
import { advanceWeek, createWorld } from './advance';
import { WEEKS_PER_YEAR } from './calendar';
import { weekCard, restNeeded } from './schedule';
import { ageOf, aptitudeFit } from './horses';
import { BALANCE } from '../balance';
import { syutoku } from './prize';

test('g1 participation', () => {
  const w = createWorld(2026);
  for (let k = 0; k < WEEKS_PER_YEAR; k++) advanceWeek(w, { full: false });
  const reasons: Record<string, number> = {};
  let runners = 0, gw = 0, gp = 0;
  const none: Record<string, number> = {};
  for (let k = 0; k < WEEKS_PER_YEAR; k++) {
    const card = weekCard(w);
    const used = new Set(card.races.flatMap((r) => r.horseIds));
    for (const a of card.abroad) for (const id of a.horseIds) used.add(id);
    for (const r of card.races.filter((x) => x.grade === 'G1')) {
      const p = r.program;
      const byId = new Map(w.horses.map((h) => [h.id, h]));
      for (const id of r.horseIds) {
        const h = byId.get(id)!;
        runners++;
        if (h.graded.length) gw++;
        else if (h.runs.slice(-4).some((x) => x.grade && x.rank <= 3)) gp++;
        else none[p.name] = (none[p.name] ?? 0) + 1;
      }
      // 不在の重賞勝ち馬
      for (const h of w.horses) {
        if (h.retired || !h.graded.length || r.horseIds.includes(h.id)) continue;
        const age = ageOf(h, card.year);
        const ageOk = { '2': age === 2, '3': age === 3, '3up': age >= 3, '4up': age >= 4 }[p.age];
        if (!ageOk || (p.fillies && h.sex !== 'filly')) continue;
        if (p.surface !== (h.surfaceAptitude.turf >= h.surfaceAptitude.dirt ? 'turf' : 'dirt')) continue;
        let why = 'other';
        const ratio = Math.abs(Math.log(p.distance / h.bestDistance));
        if (used.has(h.id)) why = 'used elsewhere';
        else if (h.restUntil !== null && card.serial < h.restUntil) why = 'injury';
        else if (aptitudeFit(h, p.surface, p.distance) <= -2.5) why = 'aptitude';
        else if ((p.age === '3up' || p.age === '4up') && ratio > BALANCE.distance.olderG1MaxRatio) why = 'distance';
        else if ((h.fatigue ?? 0) > BALANCE.fatigue.maxToRace) why = 'fatigue';
        else if (h.lastWeek !== null && card.serial - h.lastWeek < restNeeded(h)) why = 'rest';
        else if (h.runs.filter((x) => x.year === card.year).length >= 6) why = 'yearcap?';
        else if (p.age === '2' || p.age === '3') why = 'fillyHome/cutoff';
        else {
          why = 'cutoff(field full)';
          const minIn = Math.min(...r.horseIds.map((id) => syutoku(byId.get(id)!)));
          if (false) console.log('EX', p.name, 'field', r.horseIds.length, 'minIn', Math.round(minIn), 'this', Math.round(syutoku(h)), h.tier, 'graded', h.graded.map((g) => g.grade).join(''), 'best', h.bestDistance, 'last', h.runs.at(-1)?.race, card.serial - (h.lastWeek ?? 0), 'yr runs', h.runs.filter((x) => x.year === card.year).length);
        }
        reasons[why] = (reasons[why] ?? 0) + 1;
      }
    }
    advanceWeek(w, { full: false });
  }
  console.log('G1 runners', runners, 'graded winners', (gw / runners * 100).toFixed(1) + '%', 'graded placed (no win)', (gp / runners * 100).toFixed(1) + '%');
  console.log(JSON.stringify(reasons));
  console.log('no credentials', JSON.stringify(none));
}, 600_000);
