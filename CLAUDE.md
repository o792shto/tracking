# CLAUDE.md

競馬トラッキング馬券ゲーム。仕様は `docs/SPEC.md` を参照（作業前に関係する節を読むこと）。

## コマンド

- `npm run dev` — 開発サーバー
- `npm run test` — Vitest（シミュレーションの統計テストを含む）
- `npm run build` — 型チェック + 本番ビルド
- `npm run sim:report` — 1000レースの統計表を表示
- `npm run tracks:import` — コース形状データ（docs/reference/jra-tracks）から src/sim/trackData.ts を作り直す

## ルール

- シミュレーション（`src/sim/`）は描画やReactに依存しない純粋なTypeScriptにする。DOM・React・Zustand を import しない
- 乱数はすべてシード付き乱数（`src/sim/rng.ts`）を経由する。`Math.random()` は使わない
- 描画側（`src/render/`）は sim の記録を再生するだけで、レース結果を変えない
- 実在の馬名・騎手名・団体のロゴやデザインは使わない。競馬場名（東京・中山・京都・阪神）と重賞名は実在のものを使う（仕様変更済み）
- 変更後は `npm run test` と `npm run build` が通ることを確認する
- localStorage へのアクセスは必ず try/catch で保護する

## モジュール構成

- `src/sim/` — コース定義、馬データ生成、レースエンジン
- `src/betting/` — オッズ計算、馬券判定、払い戻し
- `src/render/` — トラッキングCanvas、カメラ、エフェクト
- `src/ui/` — React画面
- `src/store/` — Zustandストア（所持コイン、開催データ、成績）

シミュレーションの調整用の数値は `src/sim/params.ts` に集約する。

## 番組と名簿

- 年間の重賞98レースは `src/sim/gradedRaces.ts`（元資料は `docs/reference/graded-races-2026.md`）。重賞はすべて本来の格・名前・距離で行う（オープンへの置き換えはしない）。目黒記念はダービーデーの12R
- 1年42週の暦（土日・月曜の祝日をひとまとめ、夏は開催なし）は `src/sim/world/calendar.ts`。1日12Rの番組テンプレートは `src/sim/program.ts`
- 名簿の世界は `src/sim/world/`：馬（`horses.ts`）、週の出走表（`schedule.ts`）、週を進める・故障・引退・世代交代・夏のニュース・表彰（`advance.ts`）、観戦しないレースの簡易な結果（`quick.ts`、`quick.test.ts` でシミュレーションに合わせる）、実況の物語（`story.ts`）
- プレイヤーが観戦するのは各競馬場の10〜12Rだけ。同じ週の開催日は1つの画面（`src/sim/meeting.ts` の `weekMeeting`）
- 名簿は大きいので `src/store/world.ts` で圧縮して別のキーに保存する。ゲームの進み具合（`src/store/game.ts`）とは週（serial）でそろえる
- 荒れ方の目安は `src/sim/world/world.test.ts`（観戦レースで見た目の強さが一番の馬の勝率が実際の1番人気の約32%に近いか）。見た目の強さの重みは `src/sim/rating.ts`
- 競馬場のコースの形は `src/sim/racePath.ts`。データ `src/sim/trackData.ts` は `node scripts/import-tracks.mjs` で `docs/reference/jra-tracks/courses_geometry.json`（ユーザー提供の推定モデル。仕様は同じフォルダの `jra_track_spec.md`）から生成する。手で直さない。公式値との照合は `src/sim/venues.ts` と `src/sim/venues.test.ts`

## 時計・ラップの基準

- `docs/reference/jra-lap-reference.md`（機械可読版は `src/sim/reference.ts`）を妥当性チェックに使う。おおよその目安で、実データではない
- 実データが手に入ったらそちらを優先する。参考値のない条件（ダート1600m・2000m など）は推測で埋めない
- 検証は `src/sim/reference.test.ts`
