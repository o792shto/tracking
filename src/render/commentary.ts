import { PARAMS, Rng, crownPreview, racePath, winStory, type HorseStory, type RaceResult } from '../sim';
import { photoFinish } from './overlay';
import { runningOrder, sampleAt, type HorseSample } from './replay';

/**
 * 実況。レースの記録（位置・速度・スタミナ・出来事）から、時刻つきの実況文を作る。
 * 記録を読むだけで結果は変えない。言い回しはレースのシードから選ぶので、同じレースなら同じ実況になる。
 */
export type CommentKind = 'start' | 'trouble' | 'position' | 'pace' | 'move' | 'straight' | 'finish' | 'result' | 'mine';

export interface CommentLine {
  /** レース内の時刻（秒） */
  time: number;
  text: string;
  kind: CommentKind;
}

export interface CommentaryOptions {
  /** 単勝人気（馬番−1 の順）。あれば「◯番人気」を入れる */
  popularity?: readonly number[];
  /** 自分の買った馬の馬番 */
  mine?: ReadonlySet<number>;
  /** レース名と格（重賞は「〇〇、△△を制しました」に使う） */
  raceName?: string;
  grade?: 'G1' | 'G2' | 'G3' | null;
  /** 名簿の馬のこれまでの成績（馬番−1 の順）。クラシックの何冠目か・G1何勝目か・連勝などに使う */
  stories?: readonly (HorseStory | undefined)[];
  /** レースの年（クラシックの何冠目かを数える） */
  year?: number;
}

/** 隊列で同じ集団とみなす前の馬との差（馬身） */
const GROUP_GAP = 0.8;
/** 内と外に並んでいるとみなす横の差（m） */
const SIDE_BY_SIDE = 2;

/** 先頭が入れ替わったとみなす差（m）と、続いている時間（秒） */
const LEAD_CHANGE_GAP = 0.4;
const LEAD_CHANGE_HOLD = 0.8;
/** 実況を調べる間隔（秒） */
const STEP = 0.25;

/** 先頭が入れ替わった時刻（序盤の位置取りは除く） */
export function leaderChanges(result: RaceResult, from = 12): { time: number; from: number; to: number }[] {
  const log = result.log;
  if (!log) return [];
  const D = result.setup.course.distance;
  const out: { time: number; from: number; to: number }[] = [];
  let leader = -1;
  let candidate = -1;
  let since = 0;
  let samples: HorseSample[] = [];
  for (let t = 0; t <= result.finish[0].time; t += STEP) {
    samples = sampleAt(log, t, samples);
    const order = runningOrder(samples);
    const top = order[0];
    if (leader < 0) {
      leader = top;
      continue;
    }
    if (top !== leader && samples[top].d - samples[leader].d >= LEAD_CHANGE_GAP && samples[top].d < D) {
      if (candidate !== top) {
        candidate = top;
        since = t;
      } else if (t - since >= LEAD_CHANGE_HOLD) {
        if (t >= from) out.push({ time: since, from: leader + 1, to: top + 1 });
        leader = top;
        candidate = -1;
      }
    } else if (top === leader) {
      candidate = -1;
    }
  }
  return out;
}

/** 馬身に直す */
function lengths(m: number): number {
  return m / PARAMS.bodyLength;
}

/** 「1馬身半」「クビ」のような差の言い方 */
function gapWords(len: number): string {
  if (len < 0.3) return 'クビ差';
  if (len < 0.7) return '半馬身';
  if (len < 1.2) return '1馬身';
  if (len < 1.8) return '1馬身半';
  if (len < 2.5) return '2馬身';
  if (len < 3.5) return '3馬身';
  if (len < 5) return '4馬身';
  if (len < 7) return '5、6馬身';
  return '大きく';
}

/** 秒を「59秒8」「1分12秒3」に */
function spokenTime(sec: number, splitStyle = false): string {
  // 通過タイムは75秒未満なら「60秒5」のように秒だけで言う
  if (splitStyle && sec < 75) return sec.toFixed(1).replace('.', '秒');
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = s.toFixed(1).replace('.', '秒');
  return m > 0 ? `${m}分${ss}` : ss;
}

/** 実況の行どうしの最小の間隔（秒）。詰まっていたら後ろへずらす */
const MIN_GAP = 1.8;
/** 掛かった馬を実況する数の上限 */
const MAX_KEEN_CALLS = 2;

/** レースの実況文を作る */
export function buildCommentary(result: RaceResult, options: CommentaryOptions = {}): CommentLine[] {
  const log = result.log;
  if (!log) return [];
  const { setup, finish } = result;
  const { course, entries } = setup;
  const D = course.distance;
  const n = entries.length;
  const rng = new Rng(setup.seed).fork(11);
  const say = <T>(choices: readonly T[]) => rng.pick(choices);
  const name = (i: number) => entries[i].horse.name;
  const mine = options.mine ?? new Set<number>();
  const pop = (i: number) => options.popularity?.[i];
  const path = racePath(course);
  const lines: CommentLine[] = [];
  const add = (time: number, text: string, kind: CommentKind) => lines.push({ time, text, kind });

  // 時刻ごとの並びを先に作っておく
  const frames: { t: number; s: HorseSample[]; order: number[] }[] = [];
  for (let t = 0; t <= result.finish[0].time + 0.01; t += STEP) {
    const s = sampleAt(log, t).map((x) => ({ ...x }));
    frames.push({ t, s, order: runningOrder(s) });
  }
  const frameAt = (t: number) => frames[Math.min(frames.length - 1, Math.max(0, Math.round(t / STEP)))];
  /** 先頭が距離 d を通過した時刻 */
  const leaderTimeAt = (d: number) => frames.find((f) => f.s[f.order[0]].d >= d)?.t ?? null;

  // --- スタート ---
  add(0.2, say(['スタートしました！', 'ゲートが開いて、各馬一斉にスタート！', 'スタート！ きれいに揃いました', 'さあスタートです！']), 'start');
  const slow = result.events.filter((e) => e.kind === 'slowStart').map((e) => e.number - 1);
  if (slow.length === 1) {
    add(1.6, say([`${name(slow[0])}は出遅れました`, `あっと、${name(slow[0])}が立ち遅れた`, `${name(slow[0])}、ダッシュがつかない`]), 'trouble');
  } else if (slow.length > 1) {
    add(1.6, `${slow.slice(0, 3).map(name).join('、')}がやや出遅れ`, 'trouble');
  }
  const early = frameAt(4.5);
  const fastStarter = early.order[0];
  if (!slow.includes(fastStarter)) {
    add(4.5, say([`${name(fastStarter)}が好スタート`, `まず飛び出したのは${name(fastStarter)}`, `${name(fastStarter)}、いいスタートを切りました`]), 'start');
  }

  // --- 先行争い・ハナ ---
  const firstCall = leaderTimeAt(Math.min(D * 0.25, 350)) ?? 12;

  {
    const f = frameAt(firstCall);
    const [a, b, c] = f.order;
    const gapAB = lengths(f.s[a].d - f.s[b].d);
    if (gapAB < 0.5) {
      add(firstCall, say([`${name(a)}と${name(b)}が並んでハナを争う`, `先行争いは${name(a)}、${name(b)}。激しい主導権争い`, `内から${name(a)}、外から${name(b)}、どちらが行くか`]), 'position');
    } else if (gapAB > 2) {
      add(firstCall, say([`${name(a)}がハナを切って、後続を引き離しにかかります`, `${name(a)}が単騎の逃げ。リードは${gapWords(gapAB)}`, `${name(a)}、気分よく先頭を行きます`]), 'position');
    } else {
      add(firstCall, say([`ハナを切ったのは${name(a)}。2番手に${name(b)}、${name(c)}も前へ`, `${name(a)}が先頭に立ちました。${name(b)}が続きます`, `主導権を握ったのは${name(a)}。${name(b)}、${name(c)}が追走`]), 'position');
    }
  }

  // クラシックで二冠・三冠がかかっている馬の紹介
  if (options.raceName && options.stories && options.year !== undefined) {
    const previews = entries
      .map((_, i) => crownPreview(options.raceName!, options.year!, options.stories![i], name(i)))
      .filter((x): x is string => x !== null);
    if (previews.length > 0) add(firstCall + 3, previews[0], 'position');
  }

  // --- 掛かり・不利 ---
  let keenCalls = 0;
  for (const ev of result.events) {
    const i = ev.number - 1;
    if (ev.kind === 'keen') {
      if (keenCalls++ >= MAX_KEEN_CALLS) continue;
      add(ev.time + 0.5, say([`${name(i)}は掛かっています！`, `${name(i)}、行きたがって折り合いを欠いている`, `${name(i)}が頭を上げて、引っかかり気味`]), 'trouble');
    } else if (ev.kind === 'blocked') {
      add(ev.time + 0.3, say([`${name(i)}、前が壁！`, `${name(i)}は行き場がない！`, `${name(i)}、進路が開かない！`]), 'trouble');
    }
  }

  // 最後のコーナー：勝負所の実況は直線の手前この距離から（外回りの長いカーブでも早すぎないように）
  const cornerLength = 2 * (path.fourthCornerStart - path.finalCornerStart);
  const cornerCallD = D - path.homeStretch - Math.min(cornerLength, 380);

  // --- 隊列（前から順に、集団ごとに） ---
  /** 人気馬の位置の言い方 */
  const placeWords = (rank: number) =>
    rank === 1
      ? '先頭'
      : rank <= 3
        ? `${rank}番手の好位`
        : rank === n
          ? '最後方'
          : rank >= n - 2
            ? `後方${n - rank + 1}番手`
            : rank <= Math.ceil(n * 0.45)
              ? `前寄りの${rank}番手`
              : `中団${rank}番手`;
  const favorites = [1, 2]
    .map((p) => entries.findIndex((_, i) => pop(i) === p))
    .filter((i) => i >= 0);

  const formation = (t: number) => {
    const f = frameAt(t);
    const o = f.order;
    // 前の馬との差で集団に分ける
    const groups: number[][] = [];
    for (let k = 0; k < o.length; k++) {
      const gap = k === 0 ? Infinity : lengths(f.s[o[k - 1]].d - f.s[o[k]].d);
      if (gap > GROUP_GAP) groups.push([o[k]]);
      else groups[groups.length - 1].push(o[k]);
    }
    /** 2頭が内と外に並んでいれば [内, 外] */
    const pairOf = (g: number[]) =>
      g.length === 2 && Math.abs(f.s[g[0]].x - f.s[g[1]].x) >= SIDE_BY_SIDE
        ? f.s[g[0]].x < f.s[g[1]].x
          ? g
          : [g[1], g[0]]
        : null;
    const sentences: string[] = [];
    let prevWhere = '';
    groups.forEach((g, gi) => {
      const rank = o.indexOf(g[0]) + 1;
      const gapBefore = gi === 0 ? 0 : lengths(f.s[groups[gi - 1][groups[gi - 1].length - 1]].d - f.s[g[0]].d);
      const gapAfter = gi + 1 < groups.length ? lengths(f.s[g[g.length - 1]].d - f.s[groups[gi + 1][0]].d) : 0;
      const pair = pairOf(g);
      if (gi === 0) {
        if (g.length === 1) {
          sentences.push(
            gapAfter >= 1.5
              ? say([`先頭は${name(g[0])}、リードは${gapWords(gapAfter)}`, `${name(g[0])}が${gapWords(gapAfter)}ほどのリードで先頭`, `ハナは${name(g[0])}、後続に${gapWords(gapAfter)}の差`])
              : say([`先頭は${name(g[0])}`, `${name(g[0])}が先頭で引っ張ります`]),
          );
        } else if (pair) {
          sentences.push(`内に${name(pair[0])}、外に${name(pair[1])}、2頭並んで先頭`);
        } else {
          sentences.push(`${g.map(name).join('、')}が${g.length === 2 ? '並んで先頭' : '横並びで先頭争い'}`);
        }
        prevWhere = '先団';
        return;
      }
      const isLast = gi === groups.length - 1;
      const where = isLast && g.length === 1 ? '最後方' : rank <= Math.ceil(n * 0.35) ? '好位' : rank <= Math.ceil(n * 0.7) ? '中団' : '後方';
      const names = pair ? `内に${name(pair[0])}、外に${name(pair[1])}` : g.map(name).join('、');
      if (gapBefore < 1.2 && where === prevWhere) {
        // 同じ位置どりのすぐ後ろ
        sentences.push(`${say(['すぐ後ろに', 'その後ろに', '続いて'])}${names}`);
      } else {
        const lead =
          gapBefore < 1.2
            ? ''
            : gapBefore < 2.5
              ? say(['1馬身ほどあいて', '少しあいて'])
              : gapBefore < 4.5
                ? say(['2、3馬身離れて', '少し離れて'])
                : say(['大きく離れて', 'かなり離れて']);
        sentences.push(`${lead}${where}${pair ? 'の' : 'に'}${names}`);
      }
      prevWhere = where;
    });
    const spread = lengths(f.s[o[0]].d - f.s[o[n - 1]].d);
    sentences.push(
      spread > 15
        ? say(['縦長の隊列になっています', '馬群は縦に長い'])
        : spread < 8
          ? say(['一団の馬群', 'ひと固まりの馬群です'])
          : `先頭から最後方まで${Math.round(spread)}馬身ほど`,
    );
    // 3文ずつ字幕にする
    const PER_LINE = 3;
    for (let k = 0; k < sentences.length; k += PER_LINE) {
      add(t + (k / PER_LINE) * 2.4, sentences.slice(k, k + PER_LINE).join('。'), 'position');
    }
    const after = t + Math.ceil(sentences.length / PER_LINE) * 2.4;
    // 人気馬の位置（1行にまとめる）
    const favText = favorites.map((fi) => {
      const rank = o.indexOf(fi) + 1;
      const who = pop(fi) === 1 ? say(['人気を背負った', '1番人気の']) : '2番人気の';
      return `${who}${name(fi)}は${rank === 1 ? '先頭' : `${placeWords(rank)}`}`;
    });
    if (favText.length) add(after, `${favText.join('、')}${say(['の位置', '', 'につけています'])}`, 'position');
    // 自分の馬の位置
    const ranks = [...mine]
      .map((num) => ({ num, rank: o.indexOf(num - 1) + 1 }))
      .filter((m) => m.rank > 0 && !favorites.includes(m.num - 1))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 2);
    if (ranks.length) {
      add(after + 2.2, ranks.map((m) => `${name(m.num - 1)}は${placeWords(m.rank)}`).join('、') + say(['', 'の位置', 'で追走']), 'mine');
    }
  };
  // 向正面（勝負所の手前）で1回。短い距離は先行争いの後すぐ。長い距離は1周目でも
  const firstCallD = Math.min(D * 0.25, 350);
  const formationD = Math.max(firstCallD + 100, Math.min(D * 0.45, cornerCallD - 200));
  const backStretch = leaderTimeAt(Math.min(formationD, cornerCallD - 60));
  if (D >= 2400) {
    const t = leaderTimeAt(D * 0.2);
    if (t !== null && backStretch !== null && backStretch - t > 25) formation(t);
  }
  if (backStretch !== null) formation(backStretch);

  // --- 通過タイム（タイムだけを伝える） ---
  if (D >= 1600) {
    const t1000 = leaderTimeAt(1000);
    if (t1000 !== null) add(t1000 + 0.5, say([`1000mの通過は${spokenTime(t1000, true)}`, `1000m通過、${spokenTime(t1000, true)}`]), 'pace');
  } else if (Number.isFinite(result.first3f)) {
    add(result.first3f + 0.5, `前半600mの通過は${spokenTime(result.first3f)}`, 'pace');
  }

  // --- 3〜4コーナー：手応えと進出 ---
  const cornerT = leaderTimeAt(cornerCallD);
  if (cornerT !== null) {
    const f = frameAt(cornerT);
    const lead = f.order[0];
    const st = f.s[lead].stamina;
    const feel =
      st > 0.4
        ? say([`${name(lead)}はまだ手応え十分`, `${name(lead)}、持ったままで余裕がある`])
        : st < 0.18
          ? say([`${name(lead)}は手応えが怪しくなってきた`, `${name(lead)}、苦しくなってきたか`])
          : say([`${name(lead)}が先頭のまま`, `${name(lead)}、懸命に先頭を守る`]);
    add(cornerT, `${say(['3コーナーから4コーナーへ', '勝負所の3コーナー', 'さあ3コーナーカーブ'])}。${feel}`, 'move');
  }
  // 進出：最後のコーナーで6秒の間に3つ以上順位を上げた馬
  const moved = new Set<number>();
  if (cornerT !== null) {
    const straightT = leaderTimeAt(D - path.homeStretch) ?? cornerT + 15;
    for (let t = cornerT; t < straightT && moved.size < 2; t += 1) {
      const a = frameAt(t - 6);
      const b = frameAt(t);
      for (const i of b.order.slice(0, Math.ceil(n * 0.7))) {
        if (moved.has(i)) continue;
        const gained = a.order.indexOf(i) - b.order.indexOf(i);
        if (gained >= 3) {
          moved.add(i);
          add(t, say([`外から${name(i)}が一気に進出！`, `${name(i)}がまくってきた！`, `${name(i)}、ぐんぐん位置を上げてくる！`]), 'move');
          break;
        }
      }
    }
  }

  // --- 直線 ---
  const straightT = leaderTimeAt(D - path.homeStretch);
  if (straightT !== null) {
    const f = frameAt(straightT);
    const [a, b] = f.order;
    const gap = lengths(f.s[a].d - f.s[b].d);
    const venue = course.venue ? `${course.venue}の` : '';
    const len = Math.round(path.homeStretch);
    const straightCall =
      path.homeStretch >= 450
        ? say([`直線コースに向いて、${venue}長い直線${len}mの攻防！`, `さあ直線！ ${venue}${len}m、ここからが長い`, `4コーナーを回って、${venue}長い直線へ！`])
        : path.homeStretch <= 340
          ? say([`4コーナーを回って直線！ ${venue}短い直線、前は止まらないか`, `さあ直線！ ゴールまで${len}m、後ろは間に合うか`, `直線に向いた！ 短い${venue}直線の勝負！`])
          : say(['4コーナーを回って直線コース！', 'さあ最後の直線！', '直線に向きました！']);
    add(straightT, straightCall, 'straight');
    add(
      straightT + 2.5,
      gap > 1.5
        ? say([`${name(a)}が先頭、リードは${gapWords(gap)}`, `${name(a)}が抜け出しにかかる！`])
        : say([`${name(a)}が先頭、${name(b)}が並びかける`, `${name(a)}と${name(b)}の叩き合い！`, `${name(b)}が${name(a)}に迫る！`]),
      'straight',
    );
  }

  // 直線：1番人気がまだ後ろにいるなら触れる
  if (straightT !== null) {
    const f = frameAt(straightT + 4);
    const fav = favorites[0];
    if (fav !== undefined && pop(fav) === 1) {
      const rank = f.order.indexOf(fav) + 1;
      if (rank > 3) {
        add(
          straightT + 4,
          say([`1番人気の${name(fav)}はまだ${placeWords(rank)}、届くか！`, `人気の${name(fav)}は${placeWords(rank)}から追い上げにかかる`, `${name(fav)}はまだ後ろ、間に合うか`]),
          'straight',
        );
      }
    }
  }

  // 先頭交代（直線とその手前）
  for (const ch of leaderChanges(result)) {
    if (straightT !== null && ch.time < straightT - 20) continue;
    add(ch.time, say([`${name(ch.to - 1)}が先頭に躍り出た！`, `${name(ch.to - 1)}、かわして先頭！`, `ここで${name(ch.to - 1)}が先頭に！`]), 'straight');
  }

  // 残り600m：前の並びと差
  const t600 = D >= 1400 ? leaderTimeAt(D - 600) : null;
  if (t600 !== null) {
    const f = frameAt(t600);
    const [a, b, c] = f.order;
    const gap = lengths(f.s[a].d - f.s[b].d);
    add(
      t600,
      gap > 1.5
        ? say([`残り600、${name(a)}が${gapWords(gap)}のリード`, `残り600を切って、${name(a)}がまだ先頭`])
        : say([`残り600、${name(a)}、${name(b)}、${name(c)}が横に広がる`, `残り600、先頭は${name(a)}、すぐ後ろに${name(b)}`]),
      'move',
    );
  }

  // 残り200m：先頭と、一番伸びている馬。勝ち馬が分かっているので、勝つ馬を外さないように言う
  const winnerIndex = finish[0].number - 1;
  const t200 = leaderTimeAt(D - 200);
  if (t200 !== null) {
    const f = frameAt(t200);
    const [a, b] = f.order;
    const gap = lengths(f.s[a].d - f.s[b].d);
    let closer = -1;
    let best = 0;
    for (const i of f.order.slice(1, 8)) {
      const behind = lengths(f.s[a].d - f.s[i].d);
      const speedGap = f.s[i].v - f.s[a].v;
      if (behind < 6 && speedGap > best) {
        best = speedGap;
        closer = i;
      }
    }
    const head =
      gap > 2
        ? say([`残り200、${name(a)}が抜け出した！`, `残り200！ ${name(a)}のリードは${gapWords(gap)}`])
        : say([`残り200！ ${name(a)}が粘る、${name(b)}が迫る！`, `残り200、${name(a)}か${name(b)}か！`]);
    add(t200, head, 'straight');
    if (winnerIndex === a) {
      add(t200 + 2, say([`${name(a)}、粘る！粘る！`, `${name(a)}の脚色は衰えない！`, `${name(a)}、まだ伸びる！`]), 'straight');
    } else if (winnerIndex === closer || f.order.indexOf(winnerIndex) >= 2) {
      add(t200 + 2, say([`外から${name(winnerIndex)}が猛然と追い込んでくる！`, `${name(winnerIndex)}がすごい脚！`, `${name(winnerIndex)}、一完歩ずつ迫る！`]), 'straight');
    } else {
      add(t200 + 2, say([`${name(winnerIndex)}が詰め寄る！`, `${name(winnerIndex)}、あと少し！`, `${name(winnerIndex)}が並びかける！`]), 'straight');
    }
  }

  // ゴール前：接戦なら「並んだ！」
  const close = finish[1] && ['同着', 'ハナ', 'アタマ', 'クビ', '1/2'].includes(finish[1].marginLabel);
  const t80 = leaderTimeAt(D - 80);
  if (close && t80 !== null) {
    const a = finish[0].number - 1;
    const b = finish[1].number - 1;
    add(t80, say([`${name(a)}、${name(b)}、並んだ！ 並んだ！`, `ゴール前、${name(a)}と${name(b)}の大接戦！`, `${name(b)}も来ている！ ${name(a)}も粘る！`]), 'straight');
  }

  // --- ゴール ---
  const w = finish[0];
  const wi = w.number - 1;
  const second = finish[1];
  const photo = photoFinish(result);
  const straightRank = straightT !== null ? frameAt(straightT).order.indexOf(wi) + 1 : 0;
  const ledAll = backStretch !== null && frameAt(backStretch).order[0] === wi && straightRank === 1;
  let goal: string;
  if (photo) {
    goal = say([`${name(wi)}か${name(second.number - 1)}か！ 並んでゴールイン！`, `${name(wi)}、${name(second.number - 1)}、際どい！ 際どい勝負！`, `ほとんど並んでゴール！ 写真判定です`]);
  } else if (second && second.marginSec * (D / w.time) / PARAMS.bodyLength >= 3) {
    goal = say([`${name(wi)}、圧勝！ 後続を${gapWords((second.marginSec * (D / w.time)) / PARAMS.bodyLength)}突き放してゴールイン！`, `強い！ ${name(wi)}が独走でゴールイン！`]);
  } else if (ledAll) {
    goal = say([`${name(wi)}、逃げ切った！`, `${name(wi)}がそのまま押し切ってゴールイン！`, `${name(wi)}、最後まで先頭を譲らなかった！`]);
  } else if (straightRank >= 5) {
    goal = say([`${name(wi)}、直線だけで差し切った！`, `${name(wi)}が鮮やかに差し切ってゴールイン！`, `${name(wi)}、豪快な追い込みが決まった！`]);
  } else {
    goal = say([`${name(wi)}、先頭でゴールイン！`, `${name(wi)}が抜け出してゴールイン！`, `勝ったのは${name(wi)}！`]);
  }
  add(w.time, goal, 'finish');
  if (photo) {
    add(photo.revealAt, `写真判定の結果、${name(wi)}が${second.marginLabel === '同着' ? `${name(second.number - 1)}と同着` : `${second.marginLabel}差で先着`}`, 'result');
  }

  // --- 結果 ---
  let after = (photo ? photo.revealAt : w.time) + 2.5;
  // 重賞は「〇〇、△△を制しました」。名簿の成績があれば、クラシックの何冠目か・G1何勝目か・連勝なども
  const story = winStory(
    { race: options.raceName ?? '', grade: options.raceName ? (options.grade ?? null) : null, year: options.year ?? 0, name: name(wi) },
    options.stories?.[wi],
    new Rng(setup.seed).fork(12),
  );
  story.forEach((text, k) => add(after - 0.6 + k * 2.4, text, 'result'));
  after += story.length * 2.4;
  const p = pop(wi);
  const popWords =
    p === undefined
      ? ''
      : p === 1
        ? say(['1番人気に応えました', '人気に応える勝利'])
        : p >= 8
          ? say([`${p}番人気の大穴！`, `${p}番人気、波乱の決着！`])
          : `${p}番人気`;
  add(after, `勝ちタイムは${spokenTime(w.time)}、上がり3Fは${spokenTime(w.last3f)}${popWords ? `。${popWords}` : ''}`, 'result');
  // 1番人気が負けたとき
  const favorite = entries.findIndex((_, i) => pop(i) === 1);
  if (favorite >= 0 && favorite !== wi) {
    const fr = finish.find((f) => f.number === favorite + 1)!;
    add(
      after + 2.4,
      fr.rank <= 3
        ? say([`1番人気の${name(favorite)}は${fr.rank}着`, `人気の${name(favorite)}は${fr.rank}着まで`])
        : fr.rank <= 5
          ? say([`1番人気の${name(favorite)}は${fr.rank}着に敗れました`, `人気を背負った${name(favorite)}は${fr.rank}着`])
          : say([`1番人気の${name(favorite)}は${fr.rank}着、まさかの大敗`, `人気を背負った${name(favorite)}は${fr.rank}着に沈みました`]),
      'result',
    );
  }
  const mineFinish = finish.filter((f) => mine.has(f.number)).slice(0, 3);
  if (mineFinish.length) {
    const last = Math.max(...mineFinish.map((f) => f.time));
    add(Math.max(after + 3, last + 0.5), mineFinish.map((f) => `${name(f.number - 1)}は${f.rank}着`).join('、'), 'mine');
  }

  // 詰まった行は後ろへずらす。ゴール前の行がゴールを越えてしまうなら捨てる
  lines.sort((a, b) => a.time - b.time);
  const out: CommentLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    let time = line.time;
    if (prev && time < prev.time + MIN_GAP && line.kind !== 'finish') time = prev.time + MIN_GAP;
    const beforeGoal = line.kind !== 'finish' && line.kind !== 'result' && line.kind !== 'mine';
    if (beforeGoal && time > w.time - 0.3) continue;
    out.push({ ...line, time });
  }
  return out;
}

/** 時刻 t までに出た実況のうち、最新の count 行 */
export function currentComments(lines: readonly CommentLine[], t: number, count = 2): CommentLine[] {
  let end = 0;
  while (end < lines.length && lines[end].time <= t) end++;
  return lines.slice(Math.max(0, end - count), end);
}
