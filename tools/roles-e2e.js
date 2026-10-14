/* =============================================================================
   tools/roles-e2e.js — فحص الأدوار والعزل وصفر أخطاء JS
   ---------------------------------------------------------------------------
   يدخل بكل دور من شاشة الدخول الحقيقية، ويتحقّق من:
     ١) نجاح الدخول وصحة الدور الحالي.
     ٢) القائمة الجانبية = وحدات الدور فقط (لا زيادة ولا نقصان) وبنفس الترتيب.
     ٣) عدد الوحدات مطابق للجدول المتوقّع (EXPECTED) — يمنع تسرّب وحدة بالخطأ.
     ٤) محاولة فتح وحدة محظورة عبر الرابط تُعيده إلى لوحته.
     ٥) كل وحدة مسموحة تُرسم بلا رسالة خطأ وبمحتوى فعلي.
     ٦) صفر أخطاء JS (استثناءات + console.error) خلال كل ذلك.

   التشغيل: node tools/roles-e2e.js     (أو: bash tools/matrix.sh)
   بلا أي مكتبة خارجية — يحتاج Chrome/Chromium فقط (أو CHROME_BIN).
   ========================================================================== */
'use strict';
const path = require('path');
const B = require('./browser');

const APP_DIR = path.join(__dirname, '..', 'app');
const OWNER = { username: 'e2e-root', name: 'مراجع آلي', password: 'E2eRoot@2026' };

/* العدد المتوقّع للوحدات لكل دور — حدّثه عمدًا عند إضافة/نقل وحدة */
const EXPECTED = {
  super: 7, principal: 14, deputy: 16, guidance: 9, teacher: 9,
  teachers_deputy: 5, volunteer: 5, activity: 5, absence_monitor: 3, guard: 3, student: 6
};

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

const list = (expr) => `return (${expr});`;

async function main() {
  const site = await B.serve(APP_DIR);
  const chrome = await B.launch();
  let page;
  const report = [];
  try {
    page = await B.openPage(chrome.port);
    await B.goto(page, site.url + '/index.html', '!!window.Store');

    /* --------------------------- تهيئة بيانات العرض --------------------------- */
    const needsSetup = await page.eval('return !!(window.Store && Store.needsSetup());');
    if (needsSetup) {
      const ok = await page.eval(
        'var r = Store.setupOwner({ demo: true, username: ' + JSON.stringify(OWNER.username) +
        ', name: ' + JSON.stringify(OWNER.name) + ', password: ' + JSON.stringify(OWNER.password) + ' });' +
        'return !!(r && r.ok);'
      );
      check(ok, 'تهيئة بيانات العرض التجريبية');
      await B.goto(page, site.url + '/index.html', '!!window.Store');
    }

    /* ------------------------------- الحسابات ------------------------------- */
    const accounts = await page.eval(
      'return Store.demoAccounts().map(function (a) { return { u: a.username, p: a.password, r: a.role, n: a.name }; });'
    );
    if (!accounts || !accounts.length) throw new Error('لا توجد حسابات قابلة للدخول — تحقّق من بيانات العرض');

    /* حساب واحد لكل دور (يكفي لعزل الصلاحيات) */
    const byRole = {};
    accounts.forEach((a) => { if (!byRole[a.r]) byRole[a.r] = a; });
    const roles = Object.keys(byRole).sort();

    for (const role of roles) {
      const acc = byRole[role];
      B.resetErrors(page);
      await ensureLoggedOut(page);
      await B.waitFor(page, '!!document.querySelector("form [name=username]")', 10000);

      /* ------------------------------ الدخول ------------------------------ */
      const logged = await page.eval(
        'var u = document.querySelector("[name=username]");' +
        'var p = document.querySelector("[name=password]");' +
        'u.value = ' + JSON.stringify(acc.u) + ';' +
        'p.value = ' + JSON.stringify(acc.p) + ';' +
        'var b = document.querySelector("form button[type=submit]");' +
        'if (b) b.click(); else document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));' +
        'return true;'
      );
      void logged;

      let entered = true;
      try { await B.waitFor(page, '!!document.querySelector(".side-nav a[data-mod]")', 8000); }
      catch (e) { entered = false; }
      if (!check(entered, 'دخول ' + role + ' (' + acc.u + ')')) {
        const errText = await page.eval('var e = document.querySelector(".hint-error"); return e ? e.textContent : "";').catch(() => '');
        if (errText) fails.push('  ↳ رسالة شاشة الدخول: ' + errText);
        report.push({ role: role, modules: '-', note: 'فشل الدخول' });
        continue;
      }

      /* --------------------------- الدور والقائمة --------------------------- */
      const info = await page.eval(
        'var A = window.App, S = window.Store;' +
        'var accessible = A.order.filter(function (id) { return A.can(A.modules[id]); });' +
        'var shown = Array.prototype.map.call(document.querySelectorAll(".side-nav a[data-mod]"), function (a) { return a.getAttribute("data-mod"); });' +
        'return { role: S.session.role, accessible: accessible, shown: shown, allCount: A.order.length };'
      );

      check(info.role === role, 'الدور الحالي لـ' + role, 'الفعلي: ' + info.role);
      check(
        info.shown.join(',') === info.accessible.join(','),
        'قائمة ' + role + ' = وحداته فقط',
        'المعروض [' + info.shown.join(', ') + '] والمتوقّع [' + info.accessible.join(', ') + ']'
      );
      if (EXPECTED[role] != null) {
        check(
          info.shown.length === EXPECTED[role],
          'عدد وحدات ' + role + ' = ' + EXPECTED[role],
          'الفعلي: ' + info.shown.length + ' — إن كان التغيير مقصودًا فحدّث جدول EXPECTED'
        );
      }

      /* -------------------------- الوحدة المحظورة -------------------------- */
      const blocked = await page.eval(
        'var A = window.App;' +
        'return A.order.filter(function (id) { return !A.can(A.modules[id]); })[0] || null;'
      );
      if (blocked) {
        await page.eval('location.hash = "#/" + ' + JSON.stringify(blocked) + '; return true;');
        await B.sleep(350);
        const after = await page.eval('return { hash: location.hash, mod: (window.App.current || "") };');
        check(
          after.mod === 'dashboard' && after.hash === '#/dashboard',
          'وحدة محظورة (' + blocked + ') تُعيد ' + role + ' إلى لوحته',
          'انتهى إلى: ' + after.hash + ' / ' + after.mod
        );
      }

      /* ------------------------ رسم كل وحدة مسموحة ------------------------ */
      let rendered = 0, bad = [];
      for (const id of info.accessible) {
        const label = await page.eval('return window.App.modules[' + JSON.stringify(id) + '].label;');
        await page.eval('location.hash = "#/" + ' + JSON.stringify(id) + '; return true;');
        let ok = true;
        try {
          await B.waitFor(
            page,
            '(function(){var t=document.getElementById("view-title");' +
            'return !!t && t.textContent === ' + JSON.stringify(label) + ';})()',
            6000
          );
        } catch (e) { ok = false; }
        const view = await page.eval(
          'var v = document.getElementById("view"); return v ? v.innerText : "";'
        );
        const broken = String(view).indexOf('خطأ في تحميل الوحدة') > -1;
        const empty = String(view).trim().length < 15;
        if (!ok || broken || empty) bad.push(id + (broken ? '(خطأ)' : empty ? '(فارغة)' : '(لم تُعَنون)'));
        else rendered++;
      }
      check(bad.length === 0, 'كل وحدات ' + role + ' تُرسم سليمة', bad.join(' · '));
      void rendered;

      /* ------------------------------- الأخطاء ------------------------------- */
      const errs = await B.pageErrors(page);
      check(errs.length === 0, 'صفر أخطاء JS في ' + role, errs.slice(0, 3).join(' | '));

      report.push({ role: role, modules: info.shown.length + '/' + info.accessible.length, note: errs.length ? errs.length + ' خطأ' : 'سليم' });
    }
  } finally {
    if (page) page.close();
    chrome.close();
    site.close();
  }

  /* --------------------------------- التقرير --------------------------------- */
  console.log('\n══ فحص الأدوار والعزل (roles-e2e) ══\n');
  const w = Math.max(...report.map((r) => (ROLE_NAME[r.role] || r.role).length), 14);
  report.forEach((r) => {
    const name = (ROLE_NAME[r.role] || r.role).padEnd(w, ' ');
    console.log('  ' + (r.note === 'سليم' ? '✓' : '✗') + '  ' + name + '  وحدات: ' + String(r.modules).padEnd(6) + ' ' + r.note);
  });
  console.log('\n  الأدوار المفحوصة: ' + report.length + ' · أخطاء: ' + fails.length);

  if (fails.length) {
    console.log('\n── التفاصيل ──');
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('\n  ✅ كل الفحوص نظيفة.\n');
  }
}

main().catch((e) => {
  console.error('\n✗ تعذّر إكمال الفحص: ' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});

/* ------------------------------------------------------------------- مساعدات */
async function ensureLoggedOut(page) {
  const inShell = await page.eval('return !!document.querySelector(".side-nav");').catch(() => false);
  if (!inShell) return;
  await page.eval(
    'var b = Array.prototype.filter.call(document.querySelectorAll("button"), function (x) {' +
    '  return x.textContent.trim() === "خروج"; })[0];' +
    'if (b) b.click(); return true;'
  );
  await B.sleep(300);
}
