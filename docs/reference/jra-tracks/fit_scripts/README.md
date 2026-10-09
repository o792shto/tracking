# fit_scripts
- `egg.py`   : 卵型周回（直線-円弧-直線-円弧-直線）を、周長・直線長・3-4角長から解く
- `arms.py`  : 内回り/外回りアームを、合流点・周長の制約で解く
- `build.py` : 各場の入力値（公式値・二次情報・推定）と発走地点・引き込み線・標高の定義
- `export.py`: courses_geometry.json を生成（発走地点の解決を含む）
- `plot.py`  : プレビュー画像を生成
実行: `python3 plot.py`（numpy, scipy, matplotlib が必要。日本語フォントは Noto Sans CJK JP を想定）
注意: plot.py は courses_geometry.json を _meta なしで上書きする。
