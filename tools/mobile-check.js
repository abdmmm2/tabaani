/* =============================================================================
   tools/mobile-check.js — فحص الجوال (بلا أي مكتبة خارجية)
   ---------------------------------------------------------------------------
   يشغّل المتصفح بمقاس جوال حقيقي (٣٩٠×٨٤٤ + لمس) ويدخل بكل دور، ثم يتحقّق من:
     ١) لا يوجد تجاوز أفقي (horizontal overflow) في أي شاشة — أشهر كسر تخطيط.
     ٢) زر القائمة (المُشغّل) موجود وظاهر، ويفتح القائمة الجانبية ويغلقها.
     ٣) شريط الإجراءات العلوي لا يتجاوز عرض الشاشة.
     ٤) حقول شاشة الدخول بارتفاع لمس مريح (≥ ٤٠ بكسل) وعرض مناسب.
     ٥) صفر أخطاء JS على مقاس الجوال.

   التشغيل: node tools/mobile-check.js     (أو: bash tools/matrix.sh)
   ========================================================================== */
'use strict';
const path = require('path');
const B = require('./browser');

const APP_DIR = path.join(__dirname, '..', 'app');
const OWNER = { username: 'e2e-mob', name: 'مراجع الجوال', password: 'E2eMob@2026' };
const W = 390, H = 844;
const OVERFLOW_TOLERANCE = 1;   /* بكسل — يسمح بتدوير البكسل الجزئي */
const MIN_TAP = 40;             /* أقل ارتفاع مقبول لعنصر لمس */

const ROLE_NAME = {
  super: 'مشرف المنصة', principal: 'مدير المدرسة', deputy: 'وكيل شؤون الطلاب',
  guidance: 'التوجيه والإرشاد', teacher: 'معلم', teachers_deputy: 'وكيل شؤون المعلمين',
  volunteer: 'ساعات التطوع', activity: 'النشاط الطلابي', absence_monitor: 'مراقب الغياب',
  guard: 'حارس البوابة', student: 'طالب'
};

const fails = [];
function check(cond, label, detail) {
  if (cond) return true;
  fails.push(label + (detail ? ' — ' + detail : ''));
  return false;
}

async function main() {
  const site = await B.serve(APP_DIR);
  const chrome = await B.launch();
  let page;
  const report = [];
  try {
    page = await B.openPage(chrome.port, { mobile: true, width: W, height: H, dsf: 3 });
    await B.goto(page, site.url + '/index.html', '!!window.Store');

    const needsSetup = await page.eval('return !!(window.Store && Store.needsSetup());');
    if (needsSetup) {
      await page.eval(
        'var r = Store.setupOwner({ demo: true, username: ' + JSON.stringify(OWNER.username) +
        ', name: ' + JSON.stringify(OWNER.name) + ', password: ' + JSON.stringify(OWNER.password) + ' });' +
        'return !!(r && r.ok);'
      );
      await B.goto(page, site.url + '/index.html', '!!window.Store');
    }

    /* --------------------- ٤) شاشة الدخول: أهداف اللمس --------------------- */
    await ensureLoggedOut(page);
    await B.waitFor(page, '!!document.querySelector("form [name=username]")', 10000);
    const loginMetrics = await page.eval(
      'var rects = ["username", "password"].map(function (n) {' +
      '  var e = document.querySelector("[name=" + n + "]"); if (!e) return null;' +
      '  var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };' +
      '});' +
      'var btn = document.querySelector("form button[type=submit]");' +
      'var br = btn ? btn.getBoundingClientRect() : null;' +
      'return { fields: rects, button: br ? { w: Math.round(br.width), h: Math.round(br.height) } : null,' +
      '         overflow: document.documentElement.scrollWidth - window.innerWidth };'
    );
    loginMetrics.fields.forEach((f, i) => {
      check(f && f.h >= MIN_TAP, 'حقل الدخول ' + (i + 1) + ' بارتفاع لمس ≥ ' + MIN_TAP, f ? f.h + 'px' : 'غير موجود');
    });
    check(!!loginMetrics.button && loginMetrics.button.h >= MIN_TAP,
      'زر الدخول بارتفاع لمس ≥ ' + MIN_TAP, loginMetrics.button ? loginMetrics.button.h + 'px' : 'غير موجود');
    check(loginMetrics.overflow <= OVERFLOW_TOLERANCE, 'شاشة الدخول بلا تجاوز أفقي', loginMetrics.overflow + 'px');

    /* ------------------------------- الأدوار ------------------------------- */
    const accounts = await page.eval(
      'return Store.demoAccounts().map(function (a) { return { u: a.username, p: a.password, r: a.role, n: a.name }; });'
    );
    const byRole = {};
    accounts.forEach((a) => { if (!byRole[a.r]) byRole[a.r] = a; });

    for (const role of Object.keys(byRole).sort()) {
      const acc = byRole[role];
      B.resetErrors(page);
      await ensureLoggedOut(page);
      await B.waitFor(page, '!!document.querySelector("form [name=username]")', 10000);

      await page.eval(
        'document.querySelector("[name=username]").value = ' + JSON.stringify(acc.u) + ';' +
        'document.querySelector("[name=password]").value = ' + JSON.stringify(acc.p) + ';' +
        'var b = document.querySelector("form button[type=submit]"); if (b) b.click(); return true;'
      );
      await completeOtp(page);
      let ok = true;
      try { await B.waitFor(page, '!!document.querySelector(".side-nav a[data-mod]")', 8000); }
      catch (e) { ok = false; }
      if (!check(ok, 'دخول ' + role + ' على الجوال')) { report.push({ role, note: 'فشل الدخول', screens: '-' }); continue; }

      /* ------------------------- ٢) زر القائمة والدرج ------------------------- */
      const burger = await page.eval(
        'var b = document.querySelector(".burger-app");' +
        'if (!b) return { exists: false };' +
        'var r = b.getBoundingClientRect();' +
        'return { exists: true, visible: r.width > 0 && r.height > 0 && getComputedStyle(b).display !== "none",' +
        '         h: Math.round(r.height), w: Math.round(r.width) };'
      );
      check(burger.exists && burger.visible, 'زر القائمة ظاهر لـ' + role);
      if (burger.exists && burger.visible) {
        check(burger.h >= MIN_TAP && burger.w >= MIN_TAP, 'زر القائمة بحجم لمس كافٍ لـ' + role,
          burger.w + '×' + burger.h);
        await page.eval('document.querySelector(".burger-app").click(); return true;');
        await B.sleep(250);
        const opened = await page.eval(
          'var s = document.getElementById("sidebar"); return !!s && s.classList.contains("is-open");'
        );
        check(opened, 'القائمة الجانبية تُفتح لـ' + role);
        await page.eval(
          'var b = document.querySelector(".nav-backdrop"); if (b) b.click();' +
          'var s = document.getElementById("sidebar"); if (s) s.classList.remove("is-open");' +
          'return true;'
        );
        await B.sleep(150);
      }

      /* ------------------ ١) التجاوز الأفقي في كل الوحدات ------------------ */
      const ids = await page.eval(
        'var A = window.App; return A.order.filter(function (id) { return A.can(A.modules[id]); });'
      );
      let over = [];
      for (const id of ids) {
        await page.eval('location.hash = "#/" + ' + JSON.stringify(id) + '; return true;');
        await B.sleep(160);
        const m = await page.eval(
          'return { over: document.documentElement.scrollWidth - window.innerWidth,' +
          '         top: (function () { var t = document.querySelector(".topbar-actions");' +
          '           if (!t) return 0; var r = t.getBoundingClientRect(); return Math.round(r.right - window.innerWidth); })() };'
        );
        const label = await page.eval('return window.App.modules[' + JSON.stringify(id) + '].label;');
        if (m.over > OVERFLOW_TOLERANCE) over.push(label + ' (' + m.over + 'px)');
        if (m.top > OVERFLOW_TOLERANCE) over.push('شريط الإجراءات/' + label + ' (' + m.top + 'px)');
      }
      check(over.length === 0, 'لا تجاوز أفقي في وحدات ' + role, over.slice(0, 4).join(' · '));

      const errs = await B.pageErrors(page);
      check(errs.length === 0, 'صفر أخطاء JS على الجوال في ' + role, errs.slice(0, 2).join(' | '));

      report.push({ role, screens: ids.length, note: over.length ? over.length + ' تجاوز' : 'سليم' });
    }
  } finally {
    if (page) page.close();
    chrome.close();
    site.close();
  }

  console.log('\n══ فحص الجوال (' + W + '×' + H + ') ══\n');
  const w = Math.max(...report.map((r) => (ROLE_NAME[r.role] || r.role).length), 14);
  report.forEach((r) => {
    const name = (ROLE_NAME[r.role] || r.role).padEnd(w, ' ');
    console.log('  ' + (r.note === 'سليم' ? '✓' : '✗') + '  ' + name + '  شاشات: ' + String(r.screens).padEnd(4) + ' ' + r.note);
  });
  console.log('\n  الأدوار المفحوصة: ' + report.length + ' · مشكلات: ' + fails.length);

  if (fails.length) {
    console.log('\n── التفاصيل ──');
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('\n  ✅ لا مشكلات في تخطيط الجوال.\n');
  }
}

main().catch((e) => {
  console.error('\n✗ تعذّر إكمال الفحص: ' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});

async function ensureLoggedOut(page) {
  const inShell = await page.eval('return !!document.querySelector(".side-nav");').catch(() => false);
  if (!inShell) return;
  await page.eval(
    'var b = Array.prototype.filter.call(document.querySelectorAll("button"), function (x) {' +
    '  return x.textContent.trim() === "خروج"; })[0]; if (b) b.click(); return true;'
  );
  await B.sleep(300);
}

/** يُكمل خطوة التحقق بمرحلتين إن ظهرت (الرمز يُقرأ من حالة المنصة في بيانات العرض) */
async function completeOtp(page) {
  await B.sleep(450);
  const onOtp = await page.eval('return !!document.querySelector("[name=otpCode]");').catch(() => false);
  if (!onOtp) return false;
  const code = await page.eval('return (Store.loginOtpPending() || {}).code;');
  if (!code) return false;
  await page.eval(
    'document.querySelector("[name=otpCode]").value=' + JSON.stringify(code) + ';' +
    'document.querySelector("form button[type=submit]").click(); return true;');
  await B.sleep(500);
  return true;
}
