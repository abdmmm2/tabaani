/* =============================================================================
   tools/browser.js — مساعد تشغيل المتصفح للفحوص الآلية (بلا أي مكتبة خارجية)
   ---------------------------------------------------------------------------
   يشغّل Chrome/Chromium في وضع headless ويتصل به عبر بروتوكول DevTools (CDP)
   باستخدام WebSocket المدمج في Node ‏(٢٢+) — فلا حاجة إلى npm install إطلاقًا.

   يُستخدم من: roles-e2e.js · mobile-check.js
   المتغيّر الاختياري: CHROME_BIN = مسار المتصفح إن لم يكن في موضع معروف.
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------------------------------------------------ أدوات عامة */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** جامع أخطاء يُحقن قبل تحميل أي سكربت في الصفحة (ليلتقط أخطاء الإقلاع أيضًا) */
const ERROR_COLLECTOR = [
  'window.__E2E = { errors: [] };',
  'window.addEventListener("error", function (e) {',
  '  try { window.__E2E.errors.push(String((e && e.message) || e)); } catch (_) {}',
  '});',
  'window.addEventListener("unhandledrejection", function (e) {',
  '  var r = e && e.reason;',
  '  try { window.__E2E.errors.push("unhandledrejection: " + ((r && r.message) || String(r))); } catch (_) {}',
  '});'
].join('\n');

/* إلغاء Service Worker في الفحوص: يمنع تقديم ملفات قديمة مخزّنة (نتائج كاذبة) */
const SW_OFF = [
  'if (navigator.serviceWorker) {',
  '  try { navigator.serviceWorker.register = function () { return Promise.reject(new Error("SW disabled in tests")); }; } catch (_) {}',
  '  try { navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { try { r.unregister(); } catch (_) {} }); }); } catch (_) {}',
  '}'
].join('\n');

/* ------------------------------------------------------- خادم ملفات ثابت بسيط */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8'
};

/** يقدّم مجلدًا كموقع على منفذ عشوائي. يعيد { url, close } */
function serve(dir) {
  const root = path.resolve(dir);
  return new Promise((resolve, reject) => {
    /* نقطتا اختبار لمسار الحفظ السحابي (محليًا فقط — تحاكيان تطبيق Apps Script) */
    let cloudHits = [];
    const syncStore = { version: 0, data: null, hits: [] };
    const server = http.createServer((req, res) => {
      const pure = String(req.url || '').split('?')[0];
      /* محاكي خادم المرحلة الثانية (Worker + D1): دخول · مزامنة بإصدارات · بحث */
      if (pure.indexOf('/__sync') === 0) {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          const j = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
          const sub = pure.replace('/__sync', '') || '/';
          if (sub === '/api/health') return j({ ok: true, mail: true, telegram: false });
          if (sub === '/api/auth/login') {
            const p2 = JSON.parse(body || '{}');
            if (p2.username === 'e2e-cloud' && p2.password === 'Cloud@2026') return j({ ok: true, token: 'tok-e2e' });
            res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, msg: 'بيانات الدخول غير صحيحة' }));
          }
          if (sub === '/api/sync') {
            const auth = String(req.headers.authorization || '').replace('Bearer ', '');
            if (auth !== 'tok-e2e') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false })); }
            if (req.method === 'GET') return j({ ok: true, version: syncStore.version, updatedAt: Date.now(), data: syncStore.data });
            const p3 = JSON.parse(body || '{}');
            if (Number(p3.baseVersion || 0) < syncStore.version) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ ok: false, conflict: true, version: syncStore.version, latest: syncStore.data, msg: 'نسخة أحدث' }));
            }
            syncStore.version++;
            syncStore.data = p3.data;
            syncStore.hits.push({ version: syncStore.version, bytes: (body || '').length, grades: ((p3.data || {}).gradeSheets || []).length });
            return j({ ok: true, version: syncStore.version, bytes: (body || '').length });
          }
          res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false }));
        });
        return;
      }
      if (pure === '/__cloud' || pure === '/__cloudfail') {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          let payload = {}; try { payload = JSON.parse(body || '{}'); } catch (e) {}
          cloudHits.push({ url: pure, payload, body: body.length });
          const cors = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          };
          if (pure === '/__cloudfail') { res.writeHead(500, cors); res.end(JSON.stringify({ ok: false, error: 'boom' })); return; }
          if (payload.action === 'mail') {
            res.writeHead(200, cors);
            res.end(JSON.stringify({ ok: true, mailed: payload.to || '', attachments: (payload.attachments || []).length, subject: payload.subject || '' }));
            return;
          }
          res.writeHead(200, cors);
          res.end(JSON.stringify({
            ok: true, test: !!payload.test, name: payload.name || '',
            size: (payload.data || '').length, kept: 1,
            folder: 'https://drive.google.com/drive/folders/__TEST__'
          }));
        });
        return;
      }
      let rel = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(path.join(root, rel));
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('403'); return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: 'http://127.0.0.1:' + server.address().port,
        close: () => server.close(),
        cloudHits: () => cloudHits.slice(),
        resetCloud: () => { cloudHits = []; },
        syncStore: () => syncStore,
        resetSync: () => { syncStore.version = 0; syncStore.data = null; syncStore.hits = []; }
      });
    });
  });
}

/* --------------------------------------------------------------- تشغيل المتصفح */
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* تجاهل */ }
  }
  return null;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/** يشغّل المتصفح. يعيد { port, close } */
async function launch() {
  const bin = findChrome();
  if (!bin) {
    throw new Error('لم يُعثر على Chrome/Chromium. اضبط CHROME_BIN بمسار المتصفح ثم أعد المحاولة.');
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabaani-e2e-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--no-sandbox',
    '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions',
    '--mute-audio', '--hide-scrollbars', '--window-size=1280,900',
    'about:blank'
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('انتهت مهلة تشغيل المتصفح.\n' + stderr.slice(-400))), 30000);
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (c) => {
      clearTimeout(timer);
      reject(new Error('خرج المتصفح مبكرًا (رمز ' + c + ').\n' + stderr.slice(-400)));
    });
  });
  const port = Number(wsUrl.match(/:(\d+)\//)[1]);
  const close = () => {
    try { proc.kill('SIGKILL'); } catch (e) { /* تجاهل */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* تجاهل */ }
  };
  return { port, wsUrl, close };
}

/* -------------------------------------------------------------- عميل CDP بسيط */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const client = { _id: 0, _pending: new Map(), _handlers: new Map(), errors: [] };
    ws.addEventListener('open', () => resolve(client));
    ws.addEventListener('error', () => reject(new Error('تعذّر الاتصال بالمتصفح عبر CDP')));
    ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && client._pending.has(msg.id)) {
        const p = client._pending.get(msg.id);
        client._pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      } else if (msg.method) {
        const hs = client._handlers.get(msg.method) || [];
        hs.forEach((fn) => { try { fn(msg.params); } catch (e) { /* تجاهل */ } });
      }
    });
    client.send = (method, params) => new Promise((rs, rj) => {
      const id = ++client._id;
      client._pending.set(id, { resolve: rs, reject: rj });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
    client.on = (method, fn) => {
      const a = client._handlers.get(method) || [];
      a.push(fn); client._handlers.set(method, a);
    };
    /** ينفّذ JS في سياق الصفحة الحقيقي ويعيد القيمة */
    client.eval = async (expr) => {
      const r = await client.send('Runtime.evaluate', {
        expression: '(function(){' + expr + '})()',
        returnByValue: true, awaitPromise: true
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        const snip = String(expr).replace(/\s+/g, ' ').slice(0, 220);
        throw new Error(((d.exception && d.exception.description) || d.text || 'خطأ في التقييم') + '\n     ↳ ' + snip);
      }
      return r.result && r.result.value;
    };
    client.close = () => { try { ws.close(); } catch (e) { /* تجاهل */ } };
  });
}

/** ينتظر تحقّق تعبير في الصفحة (يمرّر تعبيرًا لا جسم دالة) */
async function waitFor(client, expr, timeout = 15000, interval = 100) {
  const wrapped = 'return (' + expr + ');';
  const t0 = Date.now();
  let last = false;
  while (Date.now() - t0 < timeout) {
    try { last = await client.eval(wrapped); } catch (e) { last = false; }
    if (last) return true;
    await sleep(interval);
  }
  throw new Error('انتهت المهلة (' + timeout + 'ms) في انتظار: ' + expr.slice(0, 120));
}

/** يفتح صفحة جديدة مهيّأة (قياس الشاشة + جامع الأخطاء) */
async function openPage(port, opts = {}) {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    const list = await getJson('http://127.0.0.1:' + port + '/json/list').catch(() => []);
    const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    target = pages[0];
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('لم يُعثر على صفحة قابلة للتحكم في المتصفح');

  const client = await connect(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: opts.width || 1280, height: opts.height || 900,
    deviceScaleFactor: opts.dsf || 1, mobile: !!opts.mobile
  });
  if (opts.mobile) {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await client.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
  }
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_COLLECTOR + '\n' + SW_OFF });
  client.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    client.errors.push('استثناء: ' + ((d.exception && d.exception.description) || d.text || ''));
  });
  client.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error') return;
    const txt = (p.args || []).map((a) => a.value != null ? a.value : (a.description || '')).join(' ');
    client.errors.push('console.error: ' + txt);
  });
  return client;
}

async function goto(client, url, waitExpr) {
  await client.send('Page.navigate', { url });
  await waitFor(client, 'document.readyState === "complete"');
  if (waitExpr) await waitFor(client, waitExpr);
}
/** كل أخطاء الصفحة (من داخل الصفحة ومن CDP) */
async function pageErrors(client) {
  let inner = [];
  try { inner = (await client.eval('return (window.__E2E && window.__E2E.errors) || [];')) || []; } catch (e) { /* تجاهل */ }
  return inner.concat(client.errors);
}
function resetErrors(client) { client.errors.length = 0; }

module.exports = { serve, launch, openPage, goto, waitFor, pageErrors, resetErrors, sleep, findChrome };
