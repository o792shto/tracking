# CLAUDE.md

競馬トラッキング馬券ゲーム。仕様は `docs/SPEC.md` を参照（作業前に関係する節を読むこと）。

## コマンド

- `npm run dev` — 開発サーバー
- `npm run test` — Vitest（シミュレーションの統計テストを含む）
- `npm run build` — 型チェック + 本番ビルド
- `npm run sim:report` — 1000レースの統計表を表示
- `npm run sim:season` — 名簿の世界を画面なしで10年分動かし、人気別成績・オッズ帯・配当・ローテーションの計測レポートを `reports/realism_report.md` に書く（約2分。`-- --years 3` などで短く）
- `npm run sim:probe` — プレイヤーに見える情報だけで買い方を決めて回収率を出す（攻略の穴の検証。`-- --seed 99` など）
- `npm run sim:elite` — 一流馬（G1馬・能力上位10頭）のローテーションと古馬G1の顔ぶれを数える
- `npm run sim:sharp` — 市場の作り方を知っているプレイヤーを想定した攻略の検証（`WINONLY=1` で単勝・複勝だけ）
- `npm run sim:tune` — 世界を一度だけ走らせ、市場のつまみ（`--grid` に JSON の配列、世界側は `--balance`）を変えながら評価する。オッズを調整するときに使う
- `npm run docs:bundle` — AI向けの全体資料（`docs/GAME_ANALYSIS_FOR_AI.md`）・仕様・計測レポート・全ソースを `dist/ai-source-bundle.md` にまとめる。仕組みや調整値を変えたら全体資料も直す
- `npm run tracks:import` — コース形状データ（docs/reference/jra-tracks）から src/sim/trackData.ts を作り直す

## ルール

- シミュレーション（`src/sim/`）は描画やReactに依存しない純粋なTypeScriptにする。DOM・React・Zustand を import しない
- 乱数はすべてシード付き乱数（`src/sim/rng.ts`）を経由する。`Math.random()` は使わない
- 描画側（`src/render/`）は sim の記録を再生するだけで、レース結果を変えない
- 実在の馬名・団体のロゴやデザインは使わない。競馬場名（東京・中山・京都・阪神）・重賞名・騎手名（ユーザー指定の名簿、`src/sim/world/jockeys.ts`）は実在のものを使う（仕様変更済み）。名簿の騎手が足りない日を埋める騎手は架空
- 変更後は `npm run test` と `npm run build` が通ることを確認する
- localStorage へのアクセスは必ず try/catch で保護する
- 配色は `src/ui/global.css` の変数（ダークと `[data-theme='light']`）とコース図の `src/render/colors.ts`（`setTrackTheme`）。色を足すときは両方のモードで決める

## モジュール構成

- `src/sim/` — コース定義、馬データ生成、レースエンジン
- `src/betting/` — オッズ計算、馬券判定、払い戻し
- `src/render/` — トラッキングCanvas、カメラ、エフェクト
- `src/ui/` — React画面
- `src/store/` — Zustandストア（所持コイン、開催データ、成績）

シミュレーションの調整用の数値は `src/sim/params.ts` に集約する。リアリティ（出走間隔・疲労・休み明け・夏の隠れ成長・前哨戦ルート・距離）のつまみは `src/sim/balance.ts`、オッズ（市場）のつまみは `src/betting/params.ts`。調整したら `npm run sim:season` で計測し、目標（`reports/realism_report.md` の判定表）を外していないか確かめる

## 番組と名簿

- 年間の重賞98レースは `src/sim/gradedRaces.ts`（元資料は `docs/reference/graded-races-2026.md`）。重賞はすべて本来の格・名前・距離で行う（オープンへの置き換えはしない）。目黒記念はダービーデーの12R（その日だけ12Rがある）
- 1年42週の暦（土日・月曜の祝日をひとまとめ、夏は開催なし）は `src/sim/world/calendar.ts`。1日11Rの番組テンプレートは `src/sim/program.ts`
- 名簿の世界は `src/sim/world/`：騎手（`jockeys.ts`。ランク S+〜C、昇格、割り当て）、週の初めの記事（`reports.ts`・`press.ts`。大レースの本命・穴はオッズにも響く）、馬（`horses.ts`）、週の出走表（`schedule.ts`）、週を進める・故障・引退・世代交代・夏のニュース・表彰（`advance.ts`）、観戦しないレースの簡易な結果（`quick.ts`、`quick.test.ts` でシミュレーションに合わせる）、実況の物語（`story.ts`）、海外遠征（`overseas.ts`）、画面に出ないレース（夏の重賞・中京G1・交流G1、`offscreen.ts`）。G1を目標にする馬の見立ては `schedule.ts` の `planG1`。賞金は `advance.ts` の `firstPrize`（ユーザー指定の額）
- 1日は11Rまで（9R 3勝クラス・10R オープン特別・11R 重賞。ダービーデーだけ12Rの目黒記念）。プレイヤーが観戦するのは各競馬場の10R・11R（とダービーデーの12R）だけ。同じ週の開催日は1つの画面（`src/sim/meeting.ts` の `weekMeeting`）
- 名簿は大きいので `src/store/world.ts` で圧縮して別のキーに保存する。ゲームの進み具合（`src/store/game.ts`）とは週（serial）でそろえる
- 荒れ方の目安は `src/sim/world/world.test.ts`（観戦レースで見た目の強さが一番の馬の勝率が実際の1番人気の約32%に近いか）。見た目の強さの重みは `src/sim/rating.ts`
- 競馬場のコースの形は `src/sim/racePath.ts`。データ `src/sim/trackData.ts` は `node scripts/import-tracks.mjs` で `docs/reference/jra-tracks/courses_geometry.json`（ユーザー提供の推定モデル。仕様は同じフォルダの `jra_track_spec.md`）から生成する。手で直さない。公式値との照合は `src/sim/venues.ts` と `src/sim/venues.test.ts`

## 時計・ラップの基準

- `docs/reference/jra-lap-reference.md`（機械可読版は `src/sim/reference.ts`）を妥当性チェックに使う。おおよその目安で、実データではない
- 実データが手に入ったらそちらを優先する。参考値のない条件（ダート1600m・2000m など）は推測で埋めない
- 検証は `src/sim/reference.test.ts`
