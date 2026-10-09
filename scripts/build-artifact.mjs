// dist/ のビルド結果を、JS と CSS を埋め込んだ1枚の HTML（dist/artifact.html）にまとめる。
// claude.ai の Artifact として公開して、ブラウザから直接見られるようにするためのもの。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module"[^>]*src="\/([^"]+)"/)?.[1];
const css = html.match(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('dist/index.html から JS / CSS が見つかりません。先に npm run build を実行してください');

const fonts = html.match(/<link\s+rel="stylesheet"\s+href="(https:\/\/fonts\.googleapis\.com[^"]+)"/)?.[1];
const code = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(dist, css), 'utf8');

// 起動チェック（古い書き方の普通のスクリプト）。本体が読み込めなかったり例外で止まったりしたとき、
// 真っ黒の画面のままにせず、エラーの内容とブラウザの情報を表示する
const BOOT_CHECK = `(function () {
  var errors = [];
  function add(m) { errors.push(String(m)); }
  window.addEventListener('error', function (e) { add((e.message || e.error) + (e.filename ? ' @' + e.lineno + ':' + e.colno : '')); });
  window.addEventListener('unhandledrejection', function (e) { add('Promise: ' + (e.reason && e.reason.stack || e.reason)); });
  function show() {
    var root = document.getElementById('root');
    if (window.__keibaBooted && root && root.childNodes.length) return;
    var box = document.createElement('pre');
    box.style.cssText = 'white-space:pre-wrap;word-break:break-all;color:#fff;background:#300;padding:12px;margin:16px;font:12px monospace';
    box.textContent = 'ゲームを起動できませんでした。この内容（またはスクリーンショット）を知らせてください。\\n\\n' +
      (errors.length ? errors.join('\\n') : '（エラーの記録なし：スクリプトが読み込まれていない可能性）') +
      '\\n\\nbooted=' + !!window.__keibaBooted + '\\n' + navigator.userAgent;
    document.body.appendChild(box);
  }
  window.addEventListener('load', function () { setTimeout(show, 4000); });
})();`;

// スマホで PC 幅に縮小表示されないよう、viewport を必ず入れる（ノッチのある端末は safe-area まで使う）
const out = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>競馬トラッキング</title>
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ''}
<style>${style}</style>
<div id="root"></div>
<script>${BOOT_CHECK}</script>
<script type="module">${code}</script>
`;
writeFileSync(join(dist, 'artifact.html'), out);
console.log(`dist/artifact.html (${(out.length / 1024).toFixed(0)} KB)`);
