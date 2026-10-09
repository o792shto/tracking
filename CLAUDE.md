# CLAUDE.md

競馬トラッキング馬券ゲーム。仕様は `docs/SPEC.md` を参照（作業前に関係する節を読むこと）。

## コマンド

- `npm run dev` — 開発サーバー
- `npm run test` — Vitest（シミュレーションの統計テストを含む）
- `npm run build` — 型チェック + 本番ビルド
- `npm run sim:report` — 1000レースの統計表を表示

## ルール

- シミュレーション（`src/sim/`）は描画やReactに依存しない純粋なTypeScriptにする。DOM・React・Zustand を import しない
- 乱数はすべてシード付き乱数（`src/sim/rng.ts`）を経由する。`Math.random()` は使わない
- 描画側（`src/render/`）は sim の記録を再生するだけで、レース結果を変えない
- 実在の馬名・騎手名・競馬場名・団体のロゴやデザインは使わない
- 変更後は `npm run test` と `npm run build` が通ることを確認する
- localStorage へのアクセスは必ず try/catch で保護する

## モジュール構成

- `src/sim/` — コース定義、馬データ生成、レースエンジン
- `src/betting/` — オッズ計算、馬券判定、払い戻し
- `src/render/` — トラッキングCanvas、カメラ、エフェクト
- `src/ui/` — React画面
- `src/store/` — Zustandストア（所持コイン、開催データ、成績）

シミュレーションの調整用の数値は `src/sim/params.ts` に集約する。
