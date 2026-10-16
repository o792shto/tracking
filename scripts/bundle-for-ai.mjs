// AIに読ませる資料を1ファイルにまとめる：docs/GAME_ANALYSIS_FOR_AI.md・CLAUDE.md・SPEC・計測レポート・全ソース。
// 出力は dist/ai-source-bundle.md（コミットしない）。使い方：npm run docs:bundle
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist', 'ai-source-bundle.md');

/** 先に読ませる資料（この順） */
const DOCS = ['docs/GAME_ANALYSIS_FOR_AI.md', 'CLAUDE.md', 'docs/SPEC.md', 'reports/realism_report.md', 'package.json'];
/** ソースのフォルダ */
const SOURCE_DIRS = ['src', 'tools', 'scripts'];
/** 大きい生成データは中身を省く（コースの座標。元資料から scripts/import-tracks.mjs で作る） */
const SKIP = new Set(['src/sim/trackData.ts']);
const LANG = { ts: 'ts', tsx: 'tsx', mjs: 'js', js: 'js', css: 'css', json: 'json', md: 'markdown' };

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

const files = SOURCE_DIRS.flatMap((d) => walk(join(root, d)))
  .map((p) => relative(root, p))
  .filter((p) => /\.(ts|tsx|mjs|css)$/.test(p));

const parts = [
  '# 競馬トラッキング馬券ゲーム：AI向けの資料とソース一式',
  '',
  `作成: ${new Date().toISOString().slice(0, 10)}。最初の「AI向けの全体資料」が要約、そのあとに仕様・計測レポート・全ソースが続く。`,
  'テストファイル（*.test.ts）も含む。コードと資料が食い違うときはコードが正しい。',
  '',
  '## 収録ファイル',
  '',
  ...[...DOCS, ...files].map((p) => `- ${p}${SKIP.has(p) ? '（中身は省略）' : ''}`),
  '',
];

const fence = (text) => (text.includes('```') ? '````' : '```');
for (const p of [...DOCS, ...files]) {
  const ext = p.split('.').pop();
  parts.push(`\n---\n\n## ファイル: ${p}\n`);
  if (SKIP.has(p)) {
    parts.push('（コースの座標の生成データ。docs/reference/jra-tracks/courses_geometry.json から scripts/import-tracks.mjs で作る。中身は省略）\n');
    continue;
  }
  const text = readFileSync(join(root, p), 'utf8');
  if (ext === 'md') {
    parts.push(text);
  } else {
    const f = fence(text);
    parts.push(`${f}${LANG[ext] ?? ''}\n${text.replace(/\n$/, '')}\n${f}`);
  }
}

mkdirSync(join(root, 'dist'), { recursive: true });
const body = parts.join('\n') + '\n';
writeFileSync(out, body);
console.log(`${relative(root, out)}: ${files.length + DOCS.length} ファイル、${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`);
