/* =============================================================================
   tools/static-checks.js — فحوص ساكنة سريعة (بلا متصفح)
   ---------------------------------------------------------------------------
   تحرس القواعد الإلزامية في المشروع:
     ١) سلامة صياغة كل ملفات JS (node --check).
     ٢) صحة ملفات JSON (المانيفست…).
     ٣) كل ملف مذكور في قائمة التخزين المؤقت في app/sw.js موجود فعلًا على القرص.
     ٤) كل <script src> و<link rel="stylesheet"> في الصفحات موجود على القرص، وبلا أي رابط خارجي.
     ٥) تطابق رقم الإصدار: sw.js ⇄ <meta app-version> ⇄ README.
     ٦) وجود الملفات الأساسية للمشروع.

   التشغيل: node tools/static-checks.js   (أو: bash tools/matrix.sh)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
const add = (ok, name, detail) => results.push({ ok: !!ok, name, detail: detail || '' });

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* --------------------------------------------- ١) سلامة صياغة JS */
(function jsSyntax() {
  const dirs = ['app/assets/js', 'site/assets/js', 'tools'];
  const files = dirs.flatMap((d) => walk(path.join(ROOT, d)))
    .filter((f) => f.endsWith('.js') && !f.includes(path.sep + 'vendor' + path.sep));
  const bad = [];
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad.push(rel(f) + ': ' + String(e.stderr || e.message).split('\n').slice(0, 2).join(' ')); }
  }
  add(bad.length === 0, 'صياغة JS سليمة (' + files.length + ' ملفًا)', bad.join(' | '));
})();

/* --------------------------------------------- ٢) صحة ملفات JSON */
(function jsonFiles() {
  const files = ['app/manifest.webmanifest', 'screens/manifest.json'].filter((p) => fs.existsSync(path.join(ROOT, p)));
  const bad = [];
  for (const f of files) {
    try { JSON.parse(read(f)); } catch (e) { bad.push(f + ': ' + e.message); }
  }
  add(bad.length === 0, 'ملفات JSON صحيحة (' + files.length + ')', bad.join(' | '));
})();

/* ------------------- ٣) قائمة التخزين المؤقت في sw.js موجودة فعلًا */
(function swCache() {
  const sw = read('app/sw.js');
  const block = sw.match(/var FILES\s*=\s*\[([\s\S]*?)\];/);
  if (!block) { add(false, 'قراءة قائمة FILES من app/sw.js', 'لم أجد المصفوفة'); return; }
  const paths = Array.from(block[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  const missing = paths.filter((p) => !fs.existsSync(path.join(ROOT, 'app', p.replace(/^\.\//, ''))));
  add(paths.length > 0 && missing.length === 0,
    'كل ملفات التخزين المؤقت موجودة (' + paths.length + ')', missing.join(' · '));
})();

/* ---------------- ٤) موارد الصفحات: موجودة محليًا وبلا روابط خارجية */
(function pageAssets() {
  const pages = ['app/index.html', 'index.html']
    .concat(walk(path.join(ROOT, 'site')).filter((f) => f.endsWith('.html')).map(rel));
  const missing = [], external = [];
  for (const page of pages) {
    const html = read(page);
    const dir = path.dirname(path.join(ROOT, page));
    const refs = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map((m) => m[1])
      .concat(Array.from(html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)).map((m) => m[1]));
    for (const u of refs) {
      if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:')) { external.push(page + ' → ' + u); continue; }
      if (/^[a-z0-9-]+:/i.test(u) || u.includes('{{') || u.includes('${')) continue;
      const target = path.resolve(dir, u.split('?')[0].split('#')[0]);
      if (!fs.existsSync(target)) missing.push(page + ' → ' + u);
    }
  }
  add(missing.length === 0, 'كل موارد الصفحات موجودة على القرص', missing.slice(0, 6).join(' · '));
  add(external.length === 0, 'لا مكتبات خارجية في الصفحات (كل شيء محلي)', external.slice(0, 6).join(' · '));
})();

/* --------------------------- ٥) تطابق رقم الإصدار بين ثلاثة مواضع */
(function version() {
  const sw = read('app/sw.js').match(/CACHE\s*=\s*'tabaani-app-v(\d+)'/);
  const meta = read('app/index.html').match(/name="app-version"\s+content="(\d+)"/);
  const readme = read('README.md').match(/النسخة:\*\*\s*v(\d+)/);
  const swV = sw && sw[1], metaV = meta && meta[1], readmV = readme && readme[1];
  const all = [swV, metaV, readmV].filter(Boolean);
  add(
    all.length === 3 && swV === metaV && metaV === readmV,
    'رقم الإصدار متطابق (app/sw.js ⇄ index.html ⇄ README)',
    'sw=' + swV + ' · index=' + metaV + ' · README=' + readmV
  );
})();

/* ----------------------------------- ٦) الملفات الأساسية للمشروع */
(function essentials() {
  const must = [
    'README.md', 'index.html', 'app/index.html', 'app/sw.js', 'app/manifest.webmanifest',
    'site/index.html', 'docs/BLUEPRINT.md', 'docs/brand-guidelines.md',
    'brand/logo/master', 'screens/index.html', '.nojekyll'
  ];
  const missing = must.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  add(missing.length === 0, 'الملفات الأساسية موجودة (' + must.length + ')', missing.join(' · '));
})();

/* ---------------------------------------- التقرير */
console.log('\n══ فحوص ساكنة (static-checks) ══\n');
results.forEach((r) => {
  console.log('  ' + (r.ok ? '✓' : '✗') + '  ' + r.name + (r.ok ? '' : '\n       ↳ ' + r.detail));
});
const bad = results.filter((r) => !r.ok);
console.log('\n  الفحوص: ' + results.length + ' · فاشلة: ' + bad.length + '\n');
process.exitCode = bad.length ? 1 : 0;
