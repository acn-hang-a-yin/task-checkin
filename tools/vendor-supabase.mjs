// 更新本地化的 supabase-js：把 @supabase/supabase-js 的 ESM 依赖图整包下载到
// js/vendor/supabase/，并把 jsDelivr 的内部根路径说明符（/npm/...）改写为同目录相对路径，
// 使页面运行时不再请求任何外部 CDN。
// 用法：node tools/vendor-supabase.mjs [版本号]   例如 node tools/vendor-supabase.mjs 2.118.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = process.argv[2] || '2.118.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', 'js', 'vendor', 'supabase');
const ENTRY = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${VERSION}/+esm`;

/** 把依赖 URL 变成扁平的本地文件名，例如 .../auth-js@2.118.0/+esm → auth-js.js */
function localName(u, entry) {
  if (u === entry) return 'supabase-js.js';
  const m = u.match(/\/npm\/(?:(@[^/]+)\/)?([^/@]+)@[^/]+\/\+esm$/);
  if (!m) throw new Error('无法生成文件名: ' + u);
  return m[2] + '.js';
}

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const files = new Map(); // url -> { text, local }
const queue = [ENTRY];

while (queue.length) {
  const u = queue.shift();
  if (files.has(u)) continue;
  const r = await fetch(u);
  if (!r.ok) throw new Error('下载失败 ' + u + ' → HTTP ' + r.status);
  const text = await r.text();
  files.set(u, { text, local: localName(u, ENTRY) });
  const re = /from\s*["'](\/npm\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const abs = 'https://cdn.jsdelivr.net' + m[1];
    if (!files.has(abs)) queue.push(abs);
  }
}

// URL → 本地文件名（同时记录根路径与完整 URL 两种写法）
const map = new Map();
for (const [u, v] of files) {
  map.set(new URL(u).pathname, v.local);
  map.set(u, v.local);
}
const keys = [...map.keys()].sort((a, b) => b.length - a.length);

let total = 0;
let externalLeft = 0;
for (const [u, v] of files) {
  let out = v.text;
  for (const k of keys) {
    out = out.split('"' + k + '"').join('"./' + map.get(k) + '"');
    out = out.split("'" + k + "'").join("'./" + map.get(k) + "'");
  }
  // 检查是否还残留外部说明符（警告文案里的字符串会命中，需人工确认）
  const left = [...out.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith('./'));
  if (left.length) {
    externalLeft += left.length;
    console.log('提示 ' + v.local + ' 里仍出现这些说明符（若只是报错文案可忽略）:', [...new Set(left)].join(', '));
  }
  fs.writeFileSync(path.join(ROOT, v.local), out, 'utf8');
  total += out.length;
  console.log('写入 ' + v.local.padEnd(18) + out.length + ' 字节  ←  ' + u.replace('https://cdn.jsdelivr.net', ''));
}

console.log(`\n完成：${files.size} 个文件，共 ${total} 字节（约 ${(total / 1024).toFixed(0)} KB），版本 ${VERSION}`);
console.log('目标目录：' + ROOT);
if (externalLeft) console.log('注意：上面若除 @supabase/supabase-js/tracing 之外还有别的说明符，请检查。');
