import { describe, expect, test } from 'vitest';
import { Rng } from '../rng';
import { crownPreview, winStory, type HorseStory } from './story';

const base: HorseStory = { sex: 'colt', graded: [], streak: 0, last: { rank: 2, race: '弥生賞', grade: 'G2' }, starts: 4, wins: 2 };
const said = (race: string, story: HorseStory, grade: 'G1' | 'G2' | 'G3' | null = 'G1') =>
  winStory({ race, grade, year: 2026, name: 'テストホース' }, story, new Rng(1)).join(' / ');

describe('勝った馬の実況（物語）', () => {
  test('皐月賞はクラシックの一冠目、皐月・ダービーで二冠、三つで三冠', () => {
    expect(said('皐月賞', base)).toMatch(/一冠目|最も速い/);
    const one = { ...base, graded: [{ year: 2026, name: '皐月賞', grade: 'G1' as const }] };
    expect(said('日本ダービー', one)).toMatch('二冠');
    const two = { ...base, graded: [...one.graded, { year: 2026, name: '日本ダービー', grade: 'G1' as const }] };
    expect(said('菊花賞', two)).toMatch('三冠達成');
  });

  test('牝馬三冠は牝馬の言い方。前の年の勝ち鞍は数えない', () => {
    const f = { ...base, sex: 'filly' as const, graded: [{ year: 2026, name: '桜花賞', grade: 'G1' as const }] };
    expect(said('オークス', f)).toMatch('牝馬二冠');
    const old = { ...base, graded: [{ year: 2025, name: '皐月賞', grade: 'G1' as const }] };
    expect(said('日本ダービー', old)).not.toMatch('二冠');
  });

  test('G1の初制覇・何勝目、重賞の連覇', () => {
    expect(said('天皇賞・秋', base)).toMatch(/G1初/);
    const g1 = { ...base, graded: [{ year: 2025, name: '天皇賞・秋', grade: 'G1' as const }, { year: 2026, name: '大阪杯', grade: 'G1' as const }] };
    const text = said('天皇賞・秋', g1);
    expect(text).toMatch('連覇');
    expect(text).toMatch(/G1 3勝目|三勝目/);
  });

  test('連勝・前走からの巻き返し・初勝利', () => {
    expect(said('3歳以上2勝クラス', { ...base, streak: 3 }, null)).toMatch('4連勝');
    expect(said('3歳以上2勝クラス', { ...base, last: { rank: 9, race: '2勝クラス', grade: null } }, null)).toMatch('9着');
    expect(said('3歳未勝利', { ...base, wins: 0 }, null)).toMatch('初勝利');
    expect(said('2歳新馬', { ...base, wins: 0, starts: 0, last: null }, null)).toMatch(/デビュー|新馬勝ち/);
  });

  test('二冠・三冠がかかる馬の紹介', () => {
    const one = { ...base, graded: [{ year: 2026, name: '皐月賞', grade: 'G1' as const }] };
    expect(crownPreview('日本ダービー', 2026, one, 'テストホース')).toMatch('二冠を狙います');
    expect(crownPreview('天皇賞・秋', 2026, one, 'テストホース')).toBeNull();
  });
});
