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

const out = `<title>競馬トラッキング</title>
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ''}
<style>${style}</style>
<div id="root"></div>
<script type="module">${code}</script>
`;
writeFileSync(join(dist, 'artifact.html'), out);
console.log(`dist/artifact.html (${(out.length / 1024).toFixed(0)} KB)`);
