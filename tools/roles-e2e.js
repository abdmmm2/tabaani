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

      await completeOtp(page);   /* كل الحسابات عدا الطلاب: كلمة المرور + رمز */
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

    /* --------------------------- التحقق بمرحلتين (2FA) --------------------------- */
    const tfRes = await twoFactorSuite(page, site.url);
    tfRes.forEach((r) => check(r.ok, r.m, r.d));
    report.push({ role: 'twoFactor', modules: String(tfRes.filter((r) => r.ok).length) + '/' + tfRes.length, note: tfRes.every((r) => r.ok) ? 'سليم' : 'إخفاق', label: 'التحقق بمرحلتين' });

    /* ------------------ الباقات والاشتراكات: كلاسيك · برو · الإيقاف ------------------ */
    const licRes = await licenseSuite(page, site.url);
    licRes.forEach((r) => check(r.ok, r.m, r.d));
    report.push({ role: 'license', modules: String(licRes.filter((r) => r.ok).length) + '/' + licRes.length, note: licRes.every((r) => r.ok) ? 'سليم' : 'إخفاق', label: 'الباقات والاشتراكات' });

    /* ------------------ إيقاف/تفعيل حسابات الطلاب (لوحة المشرف العام) ------------------ */
    const stRes = await studentCtlSuite(page, site.url);
    stRes.forEach((r) => check(r.ok, r.m, r.d));
    report.push({ role: 'studentCtl', modules: String(stRes.filter((r) => r.ok).length) + '/' + stRes.length, note: stRes.every((r) => r.ok) ? 'سليم' : 'إخفاق', label: 'حسابات الطلاب (عام)' });
  } finally {
    if (page) page.close();
    chrome.close();
    site.close();
  }

  /* --------------------------------- التقرير --------------------------------- */
  console.log('\n══ فحص الأدوار والعزل (roles-e2e) ══\n');
  const w = Math.max(...report.map((r) => (r.label || ROLE_NAME[r.role] || r.role).length), 14);
  report.forEach((r) => {
    const name = (r.label || ROLE_NAME[r.role] || r.role).padEnd(w, ' ');
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

/** فحص إيقاف/تفعيل كل حسابات الطلاب من لوحة المشرف العام */
async function studentCtlSuite(page, base) {
  const res = [];
  const ok = (c, m, d) => res.push({ ok: !!c, m: m, d: d || '' });
  const shellOn = () => page.eval('return !!document.querySelector(".side-nav a[data-mod]");');
  const sup = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "super" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password };');
  const stu = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "student" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password };');

  /* إيقاف الكل */
  await loginAsRaw(page, base, sup.uname, sup.pw);
  ok(await shellOn(), 'حسابات الطلاب: المشرف العام يدخل (لا يُحجب)');
  const before = await page.eval('return Store.studentAccountStats();');
  const r1 = await page.eval('return Store.setStudentAccounts("suspend", {});');
  ok(r1.ok && r1.changed === before.active, 'حسابات الطلاب: «إيقاف كل الطلاب» يوقف النشط كله', r1.changed + '/' + r1.total);

  /* الطالب يُمنع */
  await loginAsRaw(page, base, stu.uname, stu.pw);
  ok(!(await shellOn()), 'حسابات الطلاب: الطالب الموقوف لا يدخل');

  /* تفعيل الكل */
  await loginAsRaw(page, base, sup.uname, sup.pw);
  const r2 = await page.eval('return Store.setStudentAccounts("activate", {});');
  ok(r2.ok && r2.changed === before.total, 'حسابات الطلاب: «تفعيل كل الطلاب» يُعيدهم', r2.changed + '/' + r2.total);
  await loginAsRaw(page, base, stu.uname, stu.pw);
  ok(await shellOn(), 'حسابات الطلاب: الطالب يعود للدخول بعد التفعيل');
  return res;
}

/** فحص الباقات والاشتراكات: كلاسيك · برو، الرسوم، والإيقاف بسبب عدم السداد */
async function licenseSuite(page, base) {
  const res = [];
  const ok = (c, m, d) => res.push({ ok: !!c, m: m, d: d || '' });
  const shellOn = () => page.eval('return !!document.querySelector(".side-nav a[data-mod]");');
  const clickText = (sel, txt) => 'var b=Array.prototype.filter.call(document.querySelectorAll(' +
    JSON.stringify(sel) + '),function(x){return (x.textContent||"").trim()===' + JSON.stringify(txt) +
    ';})[0]; if(!b) return false; b.click(); return true;';
  const sup = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "super" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password };');
  const prin = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "principal" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password, id: s.id };');
  const stu = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "student" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password };');
  const sch = await page.eval('var s = Store.list("schools")[0]; return { id: s.id, name: s.name, plan: s.plan };');

  /* الباقات والرسوم الافتراضية */
  const fees = await page.eval('return Store.planFees();');
  ok(fees.setupFee === 1000 && fees.classic === 1000 && fees.pro === 1500,
    'الرسوم: تأسيس ١٠٠٠ · كلاسيك ١٠٠٠ · برو ١٥٠٠', JSON.stringify(fees));
  const plans = await page.eval('return Store.PLANS.map(function (p) { return p.id; });');
  ok(plans.length === 2 && plans.join() === 'classic,pro', 'باقتان فقط: كلاسيك وبرو', plans.join(','));
  const L0 = await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ');');
  ok(L0.plan === 'pro' && L0.state === 'active' && L0.daysLeft > 300, 'مدرسة العرض على «برو» سارية سنة',
    JSON.stringify({ plan: L0.plan, state: L0.state, days: L0.daysLeft }));

  /* لوحة المشرف العام */
  await loginAsRaw(page, base, sup.uname, sup.pw);
  ok(await shellOn(), 'باقات: المشرف العام يدخل');
  const dash = await page.eval('var t=document.querySelector("#view").innerText;' +
    'return { lic:t.indexOf("الباقة والاشتراك — هذه المدرسة")>-1, pay:t.indexOf("تسجيل السداد")>-1,' +
    ' off:t.indexOf("إيقاف دخول المدرسة")>-1, stat:t.indexOf("اشتراكات موقوفة")>-1 };');
  ok(dash.lic && dash.pay && dash.off, 'اللوحة: بطاقة الباقة والاشتراك مع أزرار السداد والإيقاف', JSON.stringify(dash));
  ok(dash.stat, 'اللوحة: إحصاء الاشتراكات الموقوفة/المتأخّرة');

  /* إيقاف وتفعيل بضغطة واحدة من لوحة المشرف */
  ok(await page.eval(clickText('#view button', 'إيقاف دخول المدرسة')), 'اللوحة: زر «إيقاف دخول المدرسة» مباشر');
  await B.sleep(400);
  const c1 = await page.eval('var m=document.querySelector(".modal"); return m ? m.innerText : "";');
  ok(/سيتوقف دخول كل حسابات المدرسة/.test(c1) && /لا يتأثّر/.test(c1),
    'تأكيد الإيقاف يشرح الأثر واستثناء المشرف العام', c1.slice(0, 70));
  await page.eval(clickText('.modal button', 'إيقاف دخول المدرسة'));
  await B.sleep(700);
  const Ld = await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ');');
  ok(Ld.blocked, 'الإيقاف المباشر أوقف دخول المدرسة', JSON.stringify({ blocked: Ld.blocked, reason: Ld.reason }));
  const aud0 = await page.eval('return (Store.db.audit || [])[0] || {};');
  ok(aud0.action === 'school_suspended', 'الإيقاف المباشر مقيّد في سجل التدقيق', aud0.action || '—');
  await loginAsRaw(page, base, prin.uname, prin.pw);
  ok(!(await shellOn()), 'الإيقاف المباشر: قائد المدرسة لا يدخل');
  await loginAsRaw(page, base, sup.uname, sup.pw);
  ok(await shellOn(), 'الإيقاف المباشر: المشرف العام لا يُحجب');
  ok(await page.eval(clickText('#view button', 'تفعيل دخول المدرسة')), 'اللوحة: الزر يتحوّل إلى «تفعيل دخول المدرسة»');
  await B.sleep(400);
  await page.eval(clickText('.modal button', 'تفعيل دخول المدرسة'));
  await B.sleep(700);
  const Le = await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ');');
  ok(!Le.blocked, 'التفعيل المباشر أعاد الدخول للمدرسة');
  await loginAsRaw(page, base, prin.uname, prin.pw);
  ok(await shellOn(), 'بعد التفعيل المباشر: قائد المدرسة يدخل');
  await loginAsRaw(page, base, sup.uname, sup.pw);

  /* الإيقاف بسبب موثَّق (عدم سداد الرسوم) — من «تحديد السبب والملاحظة» */
  ok(await page.eval(clickText('#view button', 'تحديد السبب والملاحظة')), 'اللوحة: زر «تحديد السبب والملاحظة»');
  await B.sleep(400);
  const dlg = await page.eval('var m=document.querySelector(".modal"); if(!m) return null;' +
    'return { t:m.innerText.indexOf("عدم سداد الرسوم السنوية")>-1, warn:m.innerText.indexOf("سيتوقف دخول كل حسابات المدرسة")>-1 };');
  ok(dlg && dlg.t, 'نافذة الإيقاف: سبب «عدم سداد الرسوم السنوية»');
  ok(dlg && dlg.warn, 'نافذة الإيقاف: تنبيه بأن كل حسابات المدرسة ستتوقف');
  await page.eval(clickText('.modal button', 'إيقاف الدخول'));
  await B.sleep(700);
  const L1 = await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ');');
  ok(L1.blocked && L1.reason === 'fees' && /رسوم/.test(L1.label), 'الإيقاف بسبب موثَّق: عدم سداد الرسوم',
    JSON.stringify({ blocked: L1.blocked, reason: L1.reason }));
  const aud1 = await page.eval('return (Store.db.audit || [])[0] || {};');
  ok(aud1.action === 'school_suspended', 'الإيقاف مقيّد في سجل التدقيق', aud1.action || 'لا قيد');
  const banner = await page.eval('var t=document.querySelector("#view").innerText;' +
    'return { bad:t.indexOf("مدارس موقوفة")>-1, act:t.indexOf("تفعيل")>-1 };');
  ok(banner.bad && banner.act, 'اللوحة تُظهر تنبيه المدارس الموقوفة مع زر التفعيل', JSON.stringify(banner));

  /* الأثر: لا يدخل أحد من المدرسة — والمشرف العام يدخل دائمًا */
  await loginAsRaw(page, base, prin.uname, prin.pw);
  ok(!(await shellOn()), 'الإيقاف: قائد المدرسة لا يدخل');
  const msg = await page.eval('return (document.querySelector(".hint-error")||{}).textContent||"";');
  ok(/الاشتراك السنوي غير مسدَّد/.test(msg), 'رسالة الإيقاف تشرح السبب (الرسوم)', msg.slice(0, 60));
  await loginAsRaw(page, base, stu.uname, stu.pw);
  ok(!(await shellOn()), 'الإيقاف: الطالب لا يدخل كذلك');
  await loginAsRaw(page, base, sup.uname, sup.pw);
  ok(await shellOn(), 'الإيقاف: المشرف العام لا يُحجب أبدًا (مسار الاسترجاع)');

  /* السداد يمدّد سنة ويرفع إيقاف الرسوم تلقائيًا */
  const pay = await page.eval('return Store.recordPayment(' + JSON.stringify(sch.id) + ', {kind:"annual"});');
  ok(pay.ok && pay.state.blocked === false, 'تسجيل السداد يرفع إيقاف الرسوم تلقائيًا',
    JSON.stringify({ amount: pay.amount, until: pay.state.paidUntil }));
  ok((await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ').daysLeft;')) > 300,
    'السريان مُدّد سنة كاملة');
  await loginAsRaw(page, base, prin.uname, prin.pw);
  ok(await shellOn(), 'عاد الدخول بعد السداد');

  /* التحويل إلى «كلاسيك»: يتوقف تلقرام والتحقق بمرحلتين */
  await loginAsRaw(page, base, sup.uname, sup.pw);
  await page.eval('App.licenseDialog(' + JSON.stringify(sch.id) + '); return true;');
  await B.sleep(500);
  ok(await page.eval(clickText('.modal button', 'التحويل إلى «كلاسيك»')), 'نافذة الباقة: زر التحويل إلى «كلاسيك»');
  await B.sleep(600);
  const L3 = await page.eval('return Store.licenseState(' + JSON.stringify(sch.id) + ');');
  ok(L3.plan === 'classic' && L3.annual === 1000 && L3.telegram === false,
    'الباقة «كلاسيك»: ١٠٠٠ ر.س وتلقرام غير مشمول', JSON.stringify({ plan: L3.plan, annual: L3.annual }));
  await page.eval(clickText('.modal button', 'إغلاق'));
  await B.sleep(300);

  await loginAsRaw(page, base, prin.uname, prin.pw);
  const nav = await page.eval('return Array.prototype.map.call(document.querySelectorAll(".side-nav a[data-mod]"),' +
    'function (a) { return a.getAttribute("data-mod"); });');
  ok(nav.indexOf('telegram') === -1, 'قائمة قائد المدرسة بلا «سجل تلقرام» في الكلاسيك', nav.join(','));
  ok(nav.indexOf('messages') > -1, 'الرسائل الخاصة باقية (المنصة تعمل بلا تلقرام)');
  const tgOut = await page.eval('return Store.telegramSend("تجربة").then(function (r) { return r; });');
  ok(tgOut && tgOut.ok === false && tgOut.pro === false, 'إرسال تلقرام مرفوض في الكلاسيك مع بيان السبب',
    JSON.stringify(tgOut));
  const tfC = await page.eval('return Store.twoFactorFor(' + JSON.stringify(prin.id) + ');');
  ok(tfC.applies === false && /برو/.test(tfC.reason || ''), 'التحقق بمرحلتين لا ينطبق في الكلاسيك', tfC.reason);
  await page.eval('location.hash="#/messages"; return true;');
  await B.sleep(600);
  ok(await page.eval('return document.querySelector("#view").innerText.indexOf("متاح في باقة «تابعني برو»")>-1;'),
    'صفحة الرسائل تُبيّن أن ربط تلقرام في «برو»');
  await page.eval('location.hash="#/dashboard"; return true;');
  await B.sleep(600);
  const pHint = await page.eval('var t=document.querySelector("#view").innerText;' +
    'return { name:t.indexOf("تابعني كلاسيك")>-1, up:t.indexOf("الترقية إلى «تابعني برو»")>-1, panel:t.indexOf("الباقة والاشتراك")>-1 };');
  ok(pHint.name && pHint.up && pHint.panel, 'لوحة قائد المدرسة تُظهر باقته ومزايا الترقية', JSON.stringify(pHint));

  /* إيقاف بسبب تشغيلي: السداد وحده لا يرفعه */
  await loginAsRaw(page, base, sup.uname, sup.pw);
  const r3 = await page.eval('return Store.suspendSchool(' + JSON.stringify(sch.id) + ', "issue", "تجاوز حد الاستخدام");');
  ok(r3.ok && r3.state.reason === 'issue', 'إيقاف بسبب مشكلة تشغيلية');
  await loginAsRaw(page, base, prin.uname, prin.pw);
  const msg2 = await page.eval('return (document.querySelector(".hint-error")||{}).textContent||"";');
  ok(/موقوف من إدارة المنصة/.test(msg2), 'رسالة الإيقاف التشغيلي تختلف عن رسالة الرسوم', msg2.slice(0, 60));
  await loginAsRaw(page, base, sup.uname, sup.pw);
  const pay2 = await page.eval('return Store.recordPayment(' + JSON.stringify(sch.id) + ', {kind:"annual"});');
  ok(pay2.state.blocked === true, 'السداد وحده لا يرفع الإيقاف التشغيلي (قرار المشرف)',
    JSON.stringify({ state: pay2.state.state }));
  await page.eval('return Store.activateSchool(' + JSON.stringify(sch.id) + ');');
  await loginAsRaw(page, base, prin.uname, prin.pw);
  ok(await shellOn(), 'رفع الإيقاف يدويًا يُعيد الدخول');

  /* إعادة مدرسة العرض إلى «برو» حتى لا تتأثّر بقية الفحوص */
  await page.eval('try { Store.logout(); } catch (e) {} return true;');
  await B.goto(page, base + '/index.html', '!!window.Store');
  await page.eval('return Store.setPlan(' + JSON.stringify(sch.id) + ', "pro").ok;');
  await page.eval('return Store.activateSchool(' + JSON.stringify(sch.id) + ').ok;');
  return res;
}

/** دخول مباشر (بلا خطوات إضافية) */
async function loginAsRaw(page, base, u, pw) {
  await page.eval('try { Store.logout(); } catch (e) {} return true;').catch(() => {});
  await B.goto(page, base + '/index.html', '!!window.Store');
  await B.waitFor(page, '!!document.querySelector("form [name=username]")', 10000);
  await page.eval(
    'document.querySelector("[name=username]").value=' + JSON.stringify(u) + ';' +
    'document.querySelector("[name=password]").value=' + JSON.stringify(pw) + ';' +
    'document.querySelector("form button[type=submit]").click(); return true;');
  await B.sleep(650);
  await completeOtp(page);
}

/** فحص التحقق بمرحلتين: من أين تُطلب المرحلة الثانية ومتى تُحجب */
async function twoFactorSuite(page, base) {
  const res = [];
  const ok = (c, m, d) => res.push({ ok: !!c, m: m, d: d || '' });
  const shellOn = () => page.eval('return !!document.querySelector(".side-nav a[data-mod]");');
  const tfOn = () => page.eval('return !!document.querySelector("[name=otpCode]");');

  async function loginAs(u, pw) {
    /* تنقّل جديد دائمًا: يضمن الوصول لشاشة الدخول سواء كنّا في المنصة أو على شاشة التحقق */
    await page.eval('try { Store.logout(); } catch (e) {} return true;').catch(() => {});
    await B.goto(page, base + '/index.html', '!!window.Store');
    await B.waitFor(page, '!!document.querySelector("form [name=username]")', 10000);
    await page.eval(
      'document.querySelector("[name=username]").value=' + JSON.stringify(u) + ';' +
      'document.querySelector("[name=password]").value=' + JSON.stringify(pw) + ';' +
      'document.querySelector("form button[type=submit]").click(); return true;');
    await B.sleep(700);
  }
  const typeCode = (c) => page.eval(
    'document.querySelector("[name=otpCode]").value=' + JSON.stringify(c) + ';' +
    'document.querySelector("form button[type=submit]").click(); return true;');

  const acc = await page.eval(
    'var t = Store.list("users").filter(function (u) { return u.role === "teacher" && u.username; })[0];' +
    'return { id: t.id, uname: t.username, pw: t.password };');

  /* موظف بلا محادثة: لا مرحلة ثانية */
  await page.eval('Store.saveTwoFactorConfig({ enabled: true, enforce: false });' +
    'Store.setTelegramChatId(' + JSON.stringify(acc.id) + ', ""); return true;');
  await loginAs(acc.uname, acc.pw);
  ok(await shellOn(page) && !(await tfOn(page)), '2FA: موظف بلا محادثة يدخل بكلمة المرور فقط');

  /* بعد ربط المحادثة: تُطلب المرحلة الثانية */
  await page.eval('Store.setTelegramChatId(' + JSON.stringify(acc.id) + ', "555000111"); return true;');
  await loginAs(acc.uname, acc.pw);
  ok(await tfOn(page) && !(await shellOn(page)), '2FA: بعد ربط المحادثة تُطلب مرحلة ثانية قبل الدخول');

  /* رمز خاطئ يُرفض، ثم الصحيح يمنح الدخول، ثم لا يُعاد استعماله */
  const code = await page.eval('return (Store.loginOtpPending() || {}).code;');
  await typeCode('000000');
  await B.sleep(350);
  ok(!(await shellOn(page)), '2FA: الرمز الخاطئ لا يمنح الدخول');
  await typeCode(code);
  await B.sleep(550);
  ok(await shellOn(page), '2FA: الرمز الصحيح يمنح الدخول');
  ok(!(await page.eval('return !!Store.loginOtpPending();')), '2FA: الرمز يُستهلك بعد استخدام واحد');

  /* الرمز المنتهي لا يُقبل */
  await loginAs(acc.uname, acc.pw);
  await page.eval('var r = Store.loginOtpPending(); r.expires = new Date(Date.now() - 60000).toISOString(); Store.save(); return true;');
  const c2 = await page.eval('return (Store.loginOtpPending() || {}).code;');
  await typeCode(c2);
  await B.sleep(350);
  ok(!(await shellOn(page)), '2FA: الرمز المنتهي لا يمنح الدخول');

  /* وضع الإلزام يحجب من لا محادثة له */
  await page.eval('Store.saveTwoFactorConfig({ enforce: true }); Store.setTelegramChatId(' + JSON.stringify(acc.id) + ', ""); return true;');
  await loginAs(acc.uname, acc.pw);
  ok(!(await shellOn(page)) && !(await tfOn(page)), '2FA: الإلزام يمنع دخول موظف بلا محادثة');

  /* الطالب لا يخضع للتحقق */
  const stu = await page.eval('var s = Store.list("users").filter(function (u) { return u.role === "student" && u.username; })[0];' +
    'return { uname: s.username, pw: s.password };');
  await loginAs(stu.uname, stu.pw);
  ok(await shellOn(page), '2FA: الطالب يدخل بلا مرحلة ثانية');

  /* إرجاع الإعدادات الافتراضية */
  await page.eval('Store.saveTwoFactorConfig({ enabled: true, enforce: false }); return true;');
  return res;
}
