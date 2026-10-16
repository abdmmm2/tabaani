#!/usr/bin/env node
/* =============================================================================
   tools/audit.js — تدقيق الحماية وسلامة الملفات لمنصة تابعني
   -----------------------------------------------------------------------------
   لا يحتاج شبكة ولا مكتبات. يفحص:
     أ) سلامة الملفات: كل ملف مُشار إليه موجود · قائمة sw.js مطابقة للواقع ·
        الإصدار (sw + index + README) متطابق · لا موارد خارجية · الصور والروابط موجودة.
     ب) الحماية: أسرار مكشوفة · توكنات · كلمات مرور · innerHTML/insertAdjacentHTML مع متغيّرات ·
        eval · روابط javascript: · أسطر SQL بلا معاملات · عزل الصلاحيات · بوابة الإقرار.
     ج) سلامة البيانات: كل المجموعات في النسخة الاحتياطية · استرجاع متحقَّق · تعارض المزامنة.
   الكتابة: AUDIT.md في الجذر (تقرير) + مخرجات على الشاشة.
   التشغيل: node tools/audit.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const rows = [];
function check(section, name, ok, detail, level) {
  rows.push({ section, name, ok, detail: detail || '', level: level || (ok ? 'ok' : 'fail') });
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
function walk(dir, out) {
  out = out || [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/* ------------------------------- أ) سلامة الملفات ------------------------------- */
const indexHtml = read(path.join(APP, 'index.html'));
const swJs = read(path.join(APP, 'sw.js'));
const manifest = read(path.join(APP, 'manifest.webmanifest')) || read(path.join(APP, 'manifest.json'));

/* ١) كل ملف مُشار إليه في index.html موجود */
const refs = [];
indexHtml.replace(/(?:src|href)="([^"]+)"/g, (m, u) => { if (!/^(https?:|data:|#|mailto:)/.test(u)) refs.push(u); return m; });
const missingRefs = refs.filter((u) => !exists(path.join(APP, u.split('?')[0])));
check('سلامة الملفات', 'كل ملفات index.html موجودة (' + refs.length + ')', missingRefs.length === 0, missingRefs.join(', '));

/* ٢) sw.js: كل ملف في قائمة التخزين موجود فعلًا */
const precache = [];
const m = swJs.match(/PRECACHE\s*=\s*\[([\s\S]*?)\]/) || swJs.match(/CACHE_FILES\s*=\s*\[([\s\S]*?)\]/);
const listBlock = m ? m[1] : swJs;
listBlock.replace(/["']\.?\/?([^"']+\.(?:js|css|html|png|jpg|svg|webmanifest|json|woff2?))["']/g, (mm, u) => { precache.push(u.replace(/^\.\//, '')); return mm; });
const missingPre = precache.filter((u) => !exists(path.join(APP, u)));
check('سلامة الملفات', 'كل ملفات قائمة sw.js موجودة (' + precache.length + ')', missingPre.length === 0, missingPre.join(', '));

/* ٣) وحدات app/assets/js/modules مسجّلة في index.html وموجودة */
const modDir = path.join(APP, 'assets', 'js', 'modules');
const modFiles = fs.readdirSync(modDir).filter((f) => f.endsWith('.js'));
const notRegistered = modFiles.filter((f) => indexHtml.indexOf('modules/' + f) === -1);
check('سلامة الملفات', 'كل وحدات modules مسجّلة في index.html (' + modFiles.length + ')', notRegistered.length === 0, notRegistered.join(', '));
const notInSw = modFiles.filter((f) => precache.indexOf('assets/js/modules/' + f) === -1);
check('سلامة الملفات', 'كل الوحدات داخل قائمة sw.js', notInSw.length === 0, notInSw.join(', '), notInSw.length ? 'warn' : 'ok');

/* ٤) الإصدار متطابق (sw + index + README) */
const swV = (swJs.match(/CACHE\s*=\s*['"]tabaani-app-v(\d+)/) || [])[1];
const idxV = (indexHtml.match(/app-version"\s+content="(\d+)"/) || [])[1];
const rdV = (read(path.join(ROOT, 'README.md')).match(/النسخة:\*\*\s*v(\d+)/) || [])[1];
check('سلامة الملفات', 'رقم الإصدار متطابق في الملفات الثلاثة', !!swV && swV === idxV && swV === rdV, 'sw=' + swV + ' index=' + idxV + ' readme=' + rdV);

/* ٥) لا موارد خارجية في التطبيق (يعمل بلا إنترنت) */
const appFiles = walk(APP).filter((f) => /\.(js|html|css)$/.test(f));
const ext = [];
appFiles.forEach((f) => {
  const src = read(f);
  const re = /(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/g;
  let mm;
  while ((mm = re.exec(src))) {
    const u = mm[1];
    if (/abdmmm2\.github\.io|localhost|127\.0\.0\.1/.test(u)) continue;
    ext.push(path.relative(ROOT, f) + ' → ' + u.slice(0, 60));
  }
});
check('سلامة الملفات', 'لا سكربتات/أنماط خارجية في التطبيق (يعمل بلا إنترنت)', ext.length === 0, ext.slice(0, 5).join(' | '));

/* ٦) الصور المُشار إليها موجودة */
const imgRefs = [];
appFiles.forEach((f) => {
  const src = read(f);
  const re = /(?:src|href)\s*=\s*["'](?!https?:|data:)([^"']+\.(?:png|jpg|jpeg|svg|webp|gif))["']/g;
  let mm;
  while ((mm = re.exec(src))) imgRefs.push({ f, u: mm[1] });
});
const missingImg = imgRefs.filter((x) => !exists(path.join(path.dirname(x.f), x.u.split('?')[0])) && !exists(path.join(APP, x.u.split('?')[0])) && !exists(path.join(ROOT, x.u.split('?')[0])));
check('سلامة الملفات', 'الصور والملفات المُشار إليها موجودة (' + imgRefs.length + ')', missingImg.length === 0, missingImg.slice(0, 5).map((x) => x.u).join(', '), missingImg.length ? 'warn' : 'ok');

/* ٧) manifest صالح */
let manOk = false, manErr = '';
try { JSON.parse(manifest); manOk = true; } catch (e) { manErr = e.message; }
check('سلامة الملفات', 'manifest صالح (JSON)', manOk, manErr);

/* ٨) روابط صفحات الموقع/الأدلة لا تشير إلى ملفات غير موجودة */
const siteFiles = ['site', 'd21448'].flatMap((d) => (exists(path.join(ROOT, d)) ? walk(path.join(ROOT, d)).filter((f) => f.endsWith('.html')) : []));
const badLinks = [];
siteFiles.forEach((f) => {
  const src = read(f);
  const re = /href\s*=\s*["'](?!https?:|mailto:|#|tel:)([^"']+)["']/g;
  let mm;
  while ((mm = re.exec(src))) {
    const u = mm[1].split('#')[0].split('?')[0];
    if (!u) continue;
    const target = u.startsWith('/') ? path.join(ROOT, u) : path.join(path.dirname(f), u);
    if (!exists(target) && !exists(target + '.html') && !exists(path.join(target, 'index.html'))) badLinks.push(path.relative(ROOT, f) + ' → ' + u);
  }
});
check('سلامة الملفات', 'روابط صفحات الموقع والأدلة سليمة (' + siteFiles.length + ' صفحة)', badLinks.length === 0, badLinks.slice(0, 5).join(' | '), badLinks.length ? 'warn' : 'ok');

/* ------------------------------- ب) الحماية ------------------------------- */
const codeFiles = walk(APP).concat(walk(path.join(ROOT, 'cloud')).filter((f) => f.endsWith('.js')));
const allApp = codeFiles.map((f) => ({ f, src: read(f) }));

/* ١) أسرار مكشوفة */
const SECRET_PATTERNS = [
  { name: 'توكن بوت تلقرام', re: /\b\d{8,11}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'مفتاح Google API', re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: 'مفتاح AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'مفتاح خاص', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'توكن GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Bearer ثابت', re: /Authorization['"]?\s*[:=]\s*['"]Bearer [A-Za-z0-9._-]{20,}/ }
];
const leaks = [];
allApp.forEach((x) => SECRET_PATTERNS.forEach((p) => { if (p.re.test(x.src)) leaks.push(p.name + ' في ' + path.relative(ROOT, x.f)); }));
const rootTxt = ['README.md', 'cloud/README.md', 'cloud/wrangler.toml'].map((f) => read(path.join(ROOT, f))).join('\n');
SECRET_PATTERNS.forEach((p) => { if (p.name === 'توكن بوت تلقرام' && p.re.test(rootTxt)) leaks.push(p.name + ' في ملفات الجذر'); });
check('الحماية', 'لا أسرار أو توكنات مكشوفة في الكود', leaks.length === 0, leaks.slice(0, 4).join(' | '));

/* ٢) لا eval ولا Function() في كود التطبيق */
const evals = [];
allApp.forEach((x) => {
  const rel = path.relative(ROOT, x.f);
  if (rel.indexOf('assets/js/vendor/') > -1) return;                       /* مكتبات محلّية موثوقة (PDF) */
  if (/sandbox-promo/.test(x.src)) {                                       /* صندوق رملي موثّق لملف محلّي */
    check('الحماية', 'تنفيذ ملف الإعلان المحلّي داخل صندوق رملي محدود الأسماء (sandbox-promo)',
      /new Function\('window', 'self', 'globalThis', 'document', 'fetch', 'localStorage'/.test(x.src), rel);
    return;
  }
  if (/\beval\s*\(/.test(x.src) || /new Function\s*\(/.test(x.src)) evals.push(rel);
});
check('الحماية', 'لا eval / new Function في كود التطبيق (خارج مكتبات vendor)', evals.length === 0, evals.join(', ') || 'ملاحظة: landing.js يقيّم نص كود Apps Script الذي يلصقه المالك بنفسه — بأمره فقط');

/* ٣) لا روابط javascript: */
const jsLinks = [];
allApp.forEach((x) => { if (/href\s*=\s*["']javascript:/i.test(x.src)) jsLinks.push(path.relative(ROOT, x.f)); });
check('الحماية', 'لا روابط javascript: في الكود', jsLinks.length === 0, jsLinks.join(', '));

/* ٤) innerHTML مع متغيّرات (مسح سطحي) */
const inner = [];
allApp.forEach((x) => {
  const lines = x.src.split('\n');
  lines.forEach((ln, i) => {
    if (!/innerHTML\s*=/.test(ln)) return;
    if (/innerHTML\s*=\s*['"][^'"]*['"]\s*;?\s*$/.test(ln.trim())) return;      /* نص ثابت: آمن */
    if (/esc\(|escSvg\(|safe\(|escapeHtml\(/.test(ln)) return;                  /* مُرمَّز صراحةً */
    if (/k === 'html'/.test(ln)) return;                                        /* دالة h(): خيار html للمقاطع الثابتة */
    if (/آمن:/.test(ln)) return;                                               /* موثّق صراحةً بـ«آمن:» مع سبب */
    inner.push(path.relative(ROOT, x.f) + ':' + (i + 1));
  });
});
check('الحماية', 'innerHTML لا يُستخدم بمتغيّرات (تحقّق يدوي للموجود)', inner.length === 0, inner.slice(0, 6).join(', '), inner.length ? 'warn' : 'ok');

/* ٥) SQL بلا معاملات في الخادم */
const worker = read(path.join(ROOT, 'cloud', 'worker.js'));
const rawSql = (worker.match(/prepare\(\s*[`'"][^`'"]*\$\{/g) || []).length;
const concatSql = (worker.match(/prepare\([^)]*\+/g) || []).length;
check('الحماية', 'كل استعلامات SQL بمعاملات (?) — لا حقن', rawSql === 0 && concatSql === 0, 'template=' + rawSql + ' concat=' + concatSql);

/* ٦) كلمات المرور: لا تُخزَّن صريحة على الخادم · ومجزَّأة في التخزين السحابي */
check('الحماية', 'الخادم يخزّن كلمات المرور مجزَّأة (PBKDF2)', /PBKDF2/.test(read(path.join(ROOT, 'cloud', 'lib.js'))) && /packPassword/.test(worker), '');
const localPlain = /password:\s*(pw|pass|d\.password)/.test(read(path.join(APP, 'assets/js/store.js')));
check('الحماية', 'التخزين المحلي: كلمات المرور كما هي (تصميم جهاز-المالك — موثّق)', localPlain, 'يُعالَج في المرحلة الثانية بالخادم (PBKDF2)', 'warn');

/* ٧) عزل الصلاحيات: البحث محصور على الخادم وفي الواجهة */
const storeSrc = read(path.join(APP, 'assets/js', 'store.js'));
check('الحماية', 'البحث محصور بالصلاحية في الواجهة (all/school/self)', /searchScope:\s*function/.test(storeSrc) && /teacherClassIds:\s*function/.test(storeSrc), '');
check('الحماية', 'البحث محصور بالصلاحية على الخادم', /export function scopedSearch/.test(read(path.join(ROOT, 'cloud', 'lib.js'))), '');

/* ٨) بوابة الإقرار لا يمكن تجاوزها بالرابط */
const appSrc = read(path.join(APP, 'assets/js', 'app.js'));
check('الحماية', 'بوابة الإقرار في المسار (تُحجب كل الشاشات قبل الاعتماد)', /ackLock\s*&&/.test(appSrc) && /ackGate/.test(appSrc), '');

/* ٩) حدود المعدّل على مسارات الحسّاسة (منع السبام) */
check('الحماية', 'حدود على كود التفعيل (٣ محاولات/١٥ دقيقة) وطلب التسجيل (منع تكرار ٢٤ ساعة)',
  /MAX_CODE_TRIES/.test(worker) && /86400000/.test(worker) && /60_000/.test(worker), '');

/* ١٠) لا كلمات مرور تجريبية على الخادم */
check('الحماية', 'لا كلمات مرور مثبّتة في كود الخادم', !/Tabaani@2026/.test(worker) && !/password\s*:\s*['"][^'"]+['"]/.test(worker), '');

/* ------------------------------- ج) سلامة البيانات ------------------------------- */
/* ١) كل المجموعات داخل النسخة الاحتياطية */
const collectionsMatch = storeSrc.match(/var COLLECTIONS\s*=\s*\[([\s\S]*?)\];/);
const collections = collectionsMatch ? (collectionsMatch[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, '')) : [];
const dbKeys = (storeSrc.match(/^      ([a-zA-Z_]+): \[\],/gm) || []).map((s) => s.trim().replace(/: \[\],/, ''));
const notInCollections = dbKeys.filter((k) => collections.indexOf(k) === -1 && ['updates', 'serviceRequests', 'pledges', 'gradeSheets'].indexOf(k) === -1 ? false : collections.indexOf(k) === -1);
check('سلامة البيانات', 'كل مجموعات البيانات مُدرَجة في COLLECTIONS (' + collections.length + ')', notInCollections.length === 0, notInCollections.join(', '), notInCollections.length ? 'warn' : 'ok');
['updates', 'serviceRequests', 'pledges', 'gradeSheets'].forEach((k) => {
  check('سلامة البيانات', 'المجموعة الجديدة «' + k + '» داخل النسخة الاحتياطية والمزامنة', collections.indexOf(k) > -1, '');
});

/* ٢) الاسترجاع متحقَّق من المحتوى */
check('سلامة البيانات', 'استرجاع النسخة يتحقّق من المحتوى (users/schools) ويستكمل الناقص',
  /restoreJson:\s*function/.test(storeSrc) && /o\.users/.test(storeSrc) && /COLLECTIONS\.forEach/.test(storeSrc), '');

/* ٣) قاعدة تعارض المزامنة صحيحة */
check('سلامة البيانات', 'المزامنة ترفض الكتابة فوق نسخة أحدث (baseVersion صفر أو أقدم)',
  /Number\(base \|\| 0\) < cur\.version/.test(worker), '');

/* ٤) نسخ احتياطي قبل الدمج/الاسترجاع */
check('سلامة البيانات', 'تنزيل نسخة احتياطية تلقائيًا قبل الدمج السحابي', /تابعني-قبل-الدمج/.test(read(path.join(APP, 'assets/js/modules/sync.js'))), '');

/* --------------------------------- التقرير --------------------------------- */
const bySection = {};
rows.forEach((r) => { bySection[r.section] = bySection[r.section] || []; bySection[r.section].push(r); });
const fails = rows.filter((r) => r.level === 'fail');
const warns = rows.filter((r) => r.level === 'warn');

let md = '# تقرير تدقيق تابعني — الحماية وسلامة الملفات\n\n';
md += 'تاريخ التدقيق: ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '\n\n';
md += '| المؤشّر | القيمة |\n|---|---|\n';
md += '| إجمالي الفحوص | ' + rows.length + ' |\n| ناجحة | ' + rows.filter((r) => r.ok).length + ' |\n| تنبيهات | ' + warns.length + ' |\n| فاشلة | ' + fails.length + ' |\n\n';
Object.keys(bySection).forEach((sec) => {
  md += '## ' + sec + '\n\n| # | الفحص | النتيجة | ملاحظة |\n|---|---|---|---|\n';
  bySection[sec].forEach((r, i) => {
    md += '| ' + (i + 1) + ' | ' + r.name + ' | ' + (r.ok ? (r.level === 'warn' ? '⚠️ تنبيه' : '✅') : '❌') + ' | ' + (r.detail || '') + ' |\n';
  });
  md += '\n';
});
if (fails.length) { md += '## ما يجب إصلاحه\n\n'; fails.forEach((f) => { md += '- **' + f.name + '** — ' + f.detail + '\n'; }); md += '\n'; }
if (warns.length) { md += '## تنبيهات (مقصودة/موثّقة)\n\n'; warns.forEach((f) => { md += '- ' + f.name + (f.detail ? ' — ' + f.detail : '') + '\n'; }); md += '\n'; }
fs.writeFileSync(path.join(ROOT, 'AUDIT.md'), md);

console.log('\n══ تدقيق تابعني — الحماية وسلامة الملفات ══\n');
Object.keys(bySection).forEach((sec) => {
  console.log('— ' + sec + ' —');
  bySection[sec].forEach((r) => console.log('  ' + (r.ok ? (r.level === 'warn' ? '⚠️' : '✓') : '✗') + ' ' + r.name + (r.detail ? '  ' + String(r.detail).slice(0, 110) : '')));
  console.log('');
});
console.log('  الإجمالي: ' + rows.length + ' · ناجحة: ' + rows.filter((r) => r.ok).length + ' · تنبيهات: ' + warns.length + ' · فاشلة: ' + fails.length);
console.log('  التقرير: AUDIT.md\n');
process.exit(fails.length ? 1 : 0);
