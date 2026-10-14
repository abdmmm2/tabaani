/* =============================================================================
   tools/build-guides.js — توليد الأدلة الثلاثة (PDF + Word) من صفحات HTML
   ---------------------------------------------------------------------------
   المصدر هو HTML داخل docs/guide/ — وهذا الملف يولّد منه:
     • PDF  : عبر Chrome/Chromium (طباعة الصفحة كما تظهر بالأصل، مع تضمين الخطوط).
     • DOCX : عبر LibreOffice ‏(soffice) — نسخ قابلة للتحرير.

   التشغيل:
     node tools/build-guides.js            # الاثنان
     node tools/build-guides.js --pdf      # PDF فقط
     node tools/build-guides.js --docx     # Word فقط
     CHROME_BIN=/path/to/chrome node tools/build-guides.js

   ملاحظة: يُحوَّل DOCX داخل مجلد docs/guide نفسه حتى تبقى مسارات الصور
   (../../screens/…) صحيحة، ثم يُعاد تسمية الملف إلى الاسم العربي المطلوب.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const B = require('./browser');

const ROOT = path.join(__dirname, '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');

/* الاسم الظاهر ⇄ ملف HTML ⇄ اسم المخرج */
const DOCS = [
  { html: 'index.html', out: 'دليل-منصة-تابعني-للمدارس' },
  { html: 'دليل-وكيل-شؤون-الطلاب.html', out: 'دليل-وكيل-شؤون-الطلاب' },
  { html: 'دليل-المدير-المختصر.html', out: 'دليل-المدير-المختصر' }
];

const args = process.argv.slice(2);
const doPdf = args.length === 0 || args.includes('--pdf');
const doDocx = args.length === 0 || args.includes('--docx');

/* ------------------------------------------------ عدّ صفحات PDF
   نأخذ أكبر /Count في الملف — فشجرة الصفحات تحتوي عقدًا فرعية بأعداد أصغر،
   والجذر هو أكبر قيمة. */
function pdfPages(file) {
  const s = fs.readFileSync(file).toString('latin1');
  const counts = (s.match(/\/Count\s+(\d+)/g) || []).map((x) => Number(x.replace(/\D/g, '')));
  return counts.length ? Math.max.apply(null, counts) : null;
}

function human(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' م.ب' : Math.round(bytes / 1024) + ' ك.ب';
}

/* ------------------------------------------------------------- توليد PDF */
async function buildPdf() {
  const site = await B.serve(ROOT);
  const chrome = await B.launch();
  const rows = [];
  try {
    const page = await B.openPage(chrome.port, { width: 1240, height: 1754 });
    for (const d of DOCS) {
      const src = path.join(GUIDE, d.html);
      if (!fs.existsSync(src)) { rows.push([d.out + '.pdf', '✗', 'ملف HTML غير موجود']); continue; }
      await B.goto(page, site.url + '/docs/guide/' + encodeURIComponent(d.html), 'document.readyState === "complete"');
      /* انتظر تحميل الصور كلها قبل الطباعة */
      await page.eval(
        'var imgs = Array.prototype.slice.call(document.images);' +
        'return Promise.all(imgs.map(function (i) { return i.complete ? 1 : new Promise(function (r) { i.onload = i.onerror = r; }); })).then(function () { return true; });'
      ).catch(() => {});
      await B.sleep(400);
      const r = await page.send('Page.printToPDF', {
        printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0
      });
      const out = path.join(GUIDE, d.out + '.pdf');
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      const n = pdfPages(out);
      rows.push([d.out + '.pdf', '✓', (n ? n + ' صفحة · ' : '') + human(fs.statSync(out).size)]);
    }
    const errs = await B.pageErrors(page);
    page.close();
    return { rows, errs };
  } finally {
    chrome.close();
    site.close();
  }
}

/* ------------------------- تجهيز HTML للتحويل: تضمين الصور مصغّرة كبيانات مدمجة
   LibreOffice يربط صور HTML ولا يضمّنها، فيخرج ملف Word بصور مفقودة.
   الحل: نرسم كل صورة في canvas داخل المتصفح، نصغّرها ونحوّلها JPEG،
   ثم نضعها في HTML كـdata URI ⇒ صور مدمجة وملف أصغر. */
async function pageWithInlinedImages(page, dir) {
  const srcs = await page.eval(
    'return Array.prototype.map.call(document.images, function (i) { return i.getAttribute("src"); });'
  );
  const map = {};
  for (let k = 0; k < srcs.length; k++) {
    const data = await page.eval(
      'var img = document.images[' + k + ']; if (!img) return null;' +
      'var i = new Image();' +
      'return new Promise(function (resolve) {' +
      '  i.onload = function () {' +
      '    var maxW = 1000;' +
      '    var sc = Math.min(1, maxW / (i.naturalWidth || 1));' +
      '    var w = Math.max(1, Math.round((i.naturalWidth || 1) * sc));' +
      '    var h = Math.max(1, Math.round((i.naturalHeight || 1) * sc));' +
      '    var c = document.createElement("canvas"); c.width = w; c.height = h;' +
      '    var cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);' +
      '    cx.drawImage(i, 0, 0, w, h);' +
      '    try { resolve(c.toDataURL("image/jpeg", 0.82)); } catch (e) { resolve(null); }' +
      '  };' +
      '  i.onerror = function () { resolve(null); };' +
      '  i.src = img.src;' +
      '});'
    ).catch(() => null);
    if (data) map[srcs[k]] = data;
  }
  return map;
}

/* ------------------------------------------------------------ توليد DOCX */
function findSoffice() {
  for (const c of ['/usr/bin/soffice', '/usr/bin/libreoffice', 'soffice']) {
    try { execFileSync('bash', ['-lc', 'command -v ' + c], { stdio: 'pipe' }); return c; } catch (e) { /* تابع */ }
  }
  return null;
}

async function buildDocx() {
  const bin = findSoffice();
  if (!bin) return { rows: DOCS.map((d) => [d.out + '.docx', '✗', 'LibreOffice غير مثبّت']), errs: [] };
  const rows = [];
  const site = await B.serve(ROOT);
  const chrome = await B.launch();
  let page = null;
  try {
    page = await B.openPage(chrome.port, { width: 1240, height: 1754 });
    for (const d of DOCS) {
      const src = path.join(GUIDE, d.html);
      if (!fs.existsSync(src)) { rows.push([d.out + '.docx', '✗', 'ملف HTML غير موجود']); continue; }
      const tmp = path.join(GUIDE, '.__inline-' + d.html);
      try {
        /* ١) تضمين الصور */
        await B.goto(page, site.url + '/docs/guide/' + encodeURIComponent(d.html), 'document.readyState === "complete"');
        await page.eval('return Promise.all(Array.prototype.map.call(document.images, function (i) {' +
          'return i.complete ? 1 : new Promise(function (r) { i.onload = i.onerror = r; }); })).then(function () { return true; });').catch(() => {});
        const map = await pageWithInlinedImages(page, GUIDE);
        let html = fs.readFileSync(src, 'utf8');
        let inlined = 0;
        for (const [u, data] of Object.entries(map)) {
          const before = html;
          html = html.split('src="' + u + '"').join('src="' + data + '"');
          if (html !== before) inlined++;
        }
        fs.writeFileSync(tmp, html, 'utf8');

        /* ٢) التحويل */
        execFileSync(bin, [
          '--headless', '--norestore',
          '-env:UserInstallation=file:///tmp/tabaani-lo-profile',
          '--convert-to', 'docx:MS Word 2007 XML', '--outdir', GUIDE, tmp
        ], { stdio: 'pipe', timeout: 240000 });
        const produced = path.join(GUIDE, path.basename(tmp).replace(/\.html$/i, '') + '.docx');
        const target = path.join(GUIDE, d.out + '.docx');
        if (!fs.existsSync(produced)) { rows.push([d.out + '.docx', '✗', 'لم يُنتج الملف']); continue; }
        fs.rmSync(target, { force: true });
        fs.renameSync(produced, target);

        /* ٣) فحص: صور مدمجة + اتجاه RTL */
        let media = 0, rtl = false;
        try {
          const list = execFileSync('bash', ['-lc', 'unzip -l ' + JSON.stringify(target)], { stdio: 'pipe' }).toString();
          media = (list.match(/word\/media\//g) || []).length;
          const xml = execFileSync('bash', ['-lc', 'unzip -p ' + JSON.stringify(target) + ' word/document.xml'], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
          rtl = /w:bidi/.test(xml) || /w:rtl/.test(xml);
        } catch (e) { /* تجاهل */ }
        const note = human(fs.statSync(target).size) + ' · ' + media + ' صورة' + (rtl ? ' · RTL' : ' · ⚠ اتجاه');
        rows.push([d.out + '.docx', (media > 0 && rtl) ? '✓' : '⚠', note + (inlined ? '' : ' · ⚠ لم تُضمَّن الصور')]);
      } catch (e) {
        rows.push([d.out + '.docx', '✗', String(e.message || e).split('\n')[0].slice(0, 80)]);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
  } finally {
    if (page) page.close();
    chrome.close();
    site.close();
  }
  return { rows, errs: [] };
}

/* ----------------------------------------------------------------- التشغيل */
(async () => {
  const all = [];
  if (doPdf) {
    console.log('\n══ توليد PDF (Chrome) ══');
    const { rows, errs } = await buildPdf();
    rows.forEach((r) => { console.log('  ' + r[1] + '  ' + r[0].padEnd(34, ' ') + r[2]); all.push(r); });
    const bad = errs.filter((e) => !/غير مسموح|NotAllowed|Permission/i.test(e));
    if (bad.length) console.log('  ⚠ أخطاء صفحة: ' + bad.slice(0, 3).join(' | '));
  }
  if (doDocx) {
    console.log('\n══ توليد Word (LibreOffice) ══');
    const { rows } = await buildDocx();
    rows.forEach((r) => { console.log('  ' + r[1] + '  ' + r[0].padEnd(34, ' ') + r[2]); all.push(r); });
  }
  const failed = all.filter((r) => r[1] === '✗');
  console.log('\n  المُخرجات: ' + all.length + ' · فاشلة: ' + failed.length + '\n');
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => { console.error('✗ ' + (e && e.message || e)); process.exitCode = 1; });
