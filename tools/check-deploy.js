#!/usr/bin/env node
/* =============================================================================
   tools/check-deploy.js — فحص نشر تابعني (بعد wrangler deploy)
   الاستخدام:  node tools/check-deploy.js https://تابعني.حسابك.workers.dev
   فحوص غير مُدمِّرة: صحة الخادم · رؤوس CORS · رفض الدخول بالخطأ (٤٠١) · رفض المسارات المحميّة بلا رمز.
   ========================================================================== */
'use strict';
const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\/.+/.test(url)) { console.error('✗ مرّر رابط الخادم: node tools/check-deploy.js https://xxx.workers.dev'); process.exit(1); }
let pass = 0; const fails = [];
const ok = (c, l, e) => { if (c) { pass++; console.log('  ✓ ' + l + (e ? '  ' + e : '')); } else { fails.push(l); console.log('  ✗ ' + l + (e ? '  ' + e : '')); } };

(async () => {
  console.log('\n══ فحص الخادم المنشور ══\n');
  const get = (p, init) => fetch(url + p, init);
  try {
    const h = await get('/api/health');
    const j = await h.json().catch(() => null);
    ok(h.ok && j && j.ok === true, 'الخادم يستجيب على /api/health', j ? JSON.stringify({ mail: j.mail, telegram: j.telegram }) : '');
    ok(!!h.headers.get('access-control-allow-origin'), 'رؤوس CORS مضبوطة للمتصفح', h.headers.get('access-control-allow-origin') || '');
    const bad = await get('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'no-such-user', password: 'x' }) });
    ok(bad.status === 401, 'الدخول ببيانات خاطئة يُرفض (٤٠١)', 'HTTP ' + bad.status);
    const noTok = await get('/api/me');
    ok(noTok.status === 404 || noTok.status === 401, 'بيانات الحساب لا تُعطى بلا رمز جلسة', 'HTTP ' + noTok.status);
    const syncNoTok = await get('/api/sync');
    ok(syncNoTok.status === 404 || syncNoTok.status === 401, 'المزامنة محميّة بلا رمز جلسة', 'HTTP ' + syncNoTok.status);
    const adminNoTok = await get('/api/admin/requests');
    ok(adminNoTok.status === 404 || adminNoTok.status === 401 || adminNoTok.status === 403, 'طلبات التسجيل للمشرف العام فقط', 'HTTP ' + adminNoTok.status);
    const root = await get('/');
    ok(root.ok, 'الصفحة العامة تُفتح على الجذر', 'HTTP ' + root.status);
    const br = await fetch(url + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const brj = await br.json().catch(() => ({}));
    ok(br.status === 400 && brj && brj.ok === false && brj.errors, 'التسجيل الفارغ يُرفض بحقول أخطاء (لا يُخزَّن شيء)', JSON.stringify(Object.keys(brj.errors || {})));
  } catch (e) {
    ok(false, 'الاتصال بالخادم', e.message);
  }
  console.log('\n  الفحوص: ' + (pass + fails.length) + ' · فاشلة: ' + fails.length + '\n');
  if (fails.length) process.exit(1);
  console.log('  ✅ النشر سليم ومحميّ.\n');
})();
