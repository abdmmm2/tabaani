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
  super: 9, principal: 15, deputy: 16, guidance: 9, teacher: 9,
  teachers_deputy: 5, volunteer: 5, activity: 5, absence_monitor: 3, guard: 3, student: 6,
  accountant: 3, support: 3
};

const ROLE_NAME_EXTRA = { accountant: 'المحاسب المالي', support: 'الدعم الفني' };

const ROLE_NAME = {
  super: 'مشرف تابعني', principal: 'مدير المدرسة', deputy: 'وكيل شؤون الطلاب',
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
      await openLogin(page);
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

    /* ------------------ بقاء البيانات والنسخة الاحتياطية ------------------ */
    const bkRes = await backupSuite(page, site.url, () => site.cloudHits());
    bkRes.forEach((r) => check(r.ok, r.m, r.d));
    report.push({ role: 'backup', modules: String(bkRes.filter((r) => r.ok).length) + '/' + bkRes.length, note: bkRes.every((r) => r.ok) ? 'سليم' : 'إخفاق', label: 'البيانات والنسخ الاحتياطي' });

    /* ------------------ المالية والدعم الفني ------------------ */
    const fsRes = await financeSupportSuite(page, site.url);
    fsRes.forEach((r) => check(r.ok, r.m, r.d));
    report.push({ role: 'finance', modules: String(fsRes.filter((r) => r.ok).length) + '/' + fsRes.length, note: fsRes.every((r) => r.ok) ? 'سليم' : 'إخفاق', label: 'المالية والدعم الفني' });

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
/** يُكمل خطوة التحقق بمرحلتين إن ظهرت (الرمز يُقرأ من حالة تابعني في بيانات العرض) */
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

/** فحص بقاء البيانات والنسخة الاحتياطية (تنزيل/استرجاع) */
async function backupSuite(page, base, hitsFn) {
  const res = [];
  const ok = (c, m, d) => res.push({ ok: !!c, m: m, d: d || '' });
  await page.eval('try { Store.logout(); } catch (e) {} return true;').catch(() => {});
  await B.goto(page, base + '/index.html', '!!window.Store');
  await B.sleep(700);
  const r1 = await page.eval('var json = Store.backupJson(); var r = Store.restoreJson(json);' +
    'return { len: json.length, ok: r.ok, err: r.error || "", schools: (r.stats || {}).schools };');
  ok(r1.len > 500, 'النسخة الاحتياطية تُنتج ملفًا كاملًا', (r1.len / 1024).toFixed(1) + ' ك.ب');
  ok(r1.ok, 'الاسترجاع من ملف النسخة يعمل', r1.err);
  ok(r1.schools >= 1, 'البيانات عادت كاملة بعد الاسترجاع', String(r1.schools) + ' مدرسة');
  const r2 = await page.eval('return Store.restoreJson("نص ليس نسخة").ok === false;');
  ok(r2, 'الاسترجاع يرفض ملفًا غير صالح دون المساس بالبيانات');
  const r3 = await page.eval('var b = Store.list("users").length; Store.restoreJson(Store.backupJson());' +
    'return b === Store.list("users").length;');
  ok(r3, 'لا يتغيّر عدد الحسابات بعد الاسترجاع');

  /* الموعد الأسبوعي: الخميس ٤ مساءً افتراضيًا */
  const sch = await page.eval('var x = Store.backupSchedule(); return { day:x.weekday, hour:x.hour, on:x.enabled, label:Store.scheduleLabel() };');
  ok(sch.day === 4 && sch.hour === 16 && sch.on, 'الموعد الافتراضي: الخميس ٤ مساءً', sch.label);
  const due1 = await page.eval('return Store.backupDue(new Date("2026-10-15T16:30:00"));');   /* الخميس ٤:٣٠ م */
  ok(due1.slot || due1.due, 'يُعتبر الموعد حانًا يوم الخميس بعد الرابعة', JSON.stringify({ slot: due1.slot, due: due1.due }));
  const due2 = await page.eval('Store.saveBackupSchedule({ snoozeUntil: new Date(Date.now()+7*864e5).toISOString() });' +
    'var d = Store.backupDue(); Store.saveBackupSchedule({ snoozeUntil: "" }); return d.due;');
  ok(due2 === false, '«تأجيل أسبوعًا» يُخفي التذكير');
  const r4 = await page.eval('Store.markBackup(); var d = Store.backupDue(); return { due:d.due, since:d.daysSince, last:Store.lastBackupAt() ? true : false };');
  ok(r4.due === false && r4.since === 0 && r4.last, 'بعد تنزيل نسخة: لا تذكير حتى الموعد القادم', JSON.stringify({ due: r4.due, since: r4.since }));

  /* ============ نقل البيانات بين الأجهزة (استرجاع على جهاز جديد) ============
     جهاز جديد = مخزن فارغ: يجب أن تُبنى شاشة التهيئة وفيها خيار استرجاع نسخة. */
  const before = await page.eval('return { users: Store.list("users").length, schools: Store.list("schools").length, json: Store.backupJson() };');
  await page.eval('localStorage.setItem("__e2e_backup", localStorage.getItem("tabaani-school-db-v1"));' +
    'localStorage.removeItem("tabaani-school-db-v1"); return true;');
  await B.goto(page, base + '/index.html', '!!window.Store');
  await B.sleep(900);
  const fresh = await page.eval('return { setup: Store.needsSetup(), users: Store.list("users").length };');
  ok(fresh.setup === true && fresh.users === 0, 'جهاز جديد: مخزن فارغ ويطلب التهيئة (لا يرى بيانات الجهاز الآخر)', JSON.stringify(fresh));
  await page.eval('App.setupScreen(); return true;');
  await B.sleep(700);
  const scr = await page.eval('var t=document.querySelector("#app").innerText; return { restore:t.indexOf("استرجاع نسخة احتياطية")>-1, fresh:t.indexOf("استرجاع")>-1, create:t.indexOf("إنشاء الحساب والبدء")>-1 };');
  ok(scr.restore && scr.create, 'شاشة التهيئة فيها «استرجاع نسخة احتياطية» بجانب إنشاء حساب جديد', JSON.stringify(scr));
  /* تنبيه آبل: داخل التطبيق المُثبَّت يظهر تحذير المخزن المنفصل (v47) */
  const iosNote = await page.eval(
    'var keep = UI.env; UI.env = function () { return { ios: true, standalone: true, canShare: true }; };' +
    'App.setupScreen(); var t = document.querySelector("#app").innerText;' +
    'var shown = t.indexOf("مخزن بيانات منفصل") > -1 || t.indexOf("التطبيق المُثبَّت") > -1;' +
    'UI.env = keep; App.setupScreen(); var after = document.querySelector("#app").innerText.indexOf("مخزن بيانات منفصل") > -1;' +
    'return { shown: shown, after: after };');
  ok(iosNote.shown === true, 'داخل التطبيق المُثبَّت (آبل): تنبيه واضح بفصل المخزن عن سفاري', JSON.stringify(iosNote));
  ok(iosNote.after === false, 'وخارج التطبيق المُثبَّت لا يظهر التنبيه (بلا إزعاج)');

  const mig = await page.eval('var r = Store.restoreJson(localStorage.getItem("__e2e_backup")); localStorage.removeItem("__e2e_backup");' +
    'return { ok:r.ok, schools:r.ok?r.stats.schools:0, users:r.ok?r.stats.users:0, setup:Store.needsSetup() };');
  ok(mig.ok && mig.schools === before.schools && mig.users === before.users && mig.setup === false,
    'الاسترجاع ينقل المدرسة والحسابات كاملة ويُلغي طلب التهيئة', JSON.stringify({ ok: mig.ok, schools: mig.schools + '/' + before.schools, users: mig.users + '/' + before.users }));

  /* ============ الحفظ السحابي في Google Drive ============
     نقطتان محليتان تحاكيان تطبيق Apps Script: /__cloud (نجاح) و/__cloudfail (فشل). */
  /* أدوات التسليم: لا تُصفَّر كلمة مرور المستخدم الحالي */
  const gp = await page.eval(
    'var me = (Store.list("users").filter(function(x){return x.role==="super";})[0] || Store.list("users")[0]).id;' +
    'Store.session = { userId: me, role: "super", schoolId: null, name: "مراجع" };' +
    'var before = Store.find("users", me).password;' +
    'var n = Store.generatePasswords({ kind: "staff", excludeSelf: true }).length;' +
    'var after = Store.find("users", me).password;' +
    'return { same: before === after, n: n, role: Store.find("users", me).role, other: Store.list("users").filter(function(x){return x.role!=="student";}).length };');
  ok(gp.same, 'توليد كلمات المرور لا يمسّ حساب المستخدم الحالي (بعد إصلاحه)', JSON.stringify(gp));

  const hits = (typeof hitsFn === 'function') ? hitsFn : (() => []);
  const waitEval = async (expr, pollExpr, tries = 24) => {
    await page.eval(expr);
    for (let i = 0; i < tries; i++) {
      const v = await page.eval('return ' + pollExpr + ';');
      if (v) return v;
      await B.sleep(250);
    }
    return null;
  };
  const OK = base + '/__cloud', BAD = base + '/__cloudfail';

  const d0 = await page.eval('var c = Store.driveConfig(); return { u:c.url, e:c.enabled, n:c.count, log:Store.driveLog().length, p:!!Store.drivePending() };');
  ok(d0.u === '' && d0.n === 0 && d0.log === 0 && !d0.p, 'السحابة: غير مربوطة افتراضيًا (بلا رابط أو سجل)', JSON.stringify(d0));

  await page.eval('Store.saveDriveConfig({ url: ' + JSON.stringify(OK) + ', enabled: true, auto: true }); return true;');
  ok(await page.eval('return Store.driveConfigured() && Store.driveConfig().auto;'), 'السحابة: الربط يُحفظ ويُفعّل الرفع التلقائي');

  const t1 = await waitEval('window.__ct = null; App.cloud.test(function (e, r) { window.__ct = e ? ("E:" + e.message) : JSON.stringify(r); }); return true;', 'window.__ct');
  ok(/__TEST__/.test(String(t1)), 'السحابة: «اختبر الاتصال» ينجح ويعيد رابط المجلد', String(t1).slice(0, 90));
  const h1 = hits().filter((x) => x.payload && x.payload.test === true);
  ok(h1.length >= 1 && h1[h1.length - 1].url === '/__cloud', 'السحابة: وصل طلب الاختبار إلى النقطة فعلًا', 'hits=' + hits().length);

  const up = await waitEval('window.__up = null; App.backupNow(true); return true;', 'window.__up && window.__up.name');
  await B.sleep(600);
  const log1 = await page.eval('var l = Store.driveLog(); var c = Store.driveConfig(); return { ok:l[0].ok, note:l[0].note, name:l[0].name, size:l[0].size, cnt:c.count, folder:c.folder };');
  const sent = hits().filter((x) => x.payload && x.payload.data && x.payload.data.length > 500);
  ok(log1.ok && sent.length >= 1, 'السحابة: تنزيل النسخة يرفعها تلقائيًا إلى درايف', JSON.stringify({ note: log1.note, size: log1.size }));
  ok(sent.length >= 1 && sent[sent.length - 1].payload.data.length === log1.size, 'السحابة: المحتوى المرفوع هو النسخة نفسها (الحجم مطابق)');
  ok(/__TEST__/.test(String(log1.folder)) && log1.cnt >= 1, 'السحابة: يُسجّل رابط المجلد وعدد النسخ المرفوعة', String(log1.folder).slice(0, 60));

  /* فشل الرفع: النقطة تُعيد 500 → سجل بخطأ + محاولة no-cors لا تُظهر نجاحًا كاذبًا */
  await page.eval('Store.saveDriveConfig({ url: ' + JSON.stringify(BAD) + ' }); return true;');
  const t2 = await waitEval('window.__ct2 = null; App.cloud.test(function (e, r) { window.__ct2 = e ? ("E:" + e.message) : "OK"; }); return true;', 'window.__ct2');
  ok(/^E:/.test(String(t2)), 'السحابة: الرابط المعطوب يُرفَض في الاختبار برسالة واضحة', String(t2).slice(0, 70));
  await page.eval('window.__up2 = null; App.cloud.upload("{}", "bad.json", function (e) { window.__up2 = e ? "E" : "OK"; }); return true;');
  await B.sleep(1200);
  const log2 = await page.eval('var l = Store.driveLog(); var c = Store.driveConfig(); return { ok:l[0].ok, note:l[0].note, err:c.lastError };');
  ok(log2.ok === false && /HTTP|تعذّر|ردّ/.test(log2.note + ' ' + log2.err), 'السحابة: فشل الرفع يُسجّل خطأً صريحًا', log2.note);

  /* الطابور: نسخة معلّقة تُحفظ ثم تُرفع عند عودة الاتصال */
  await page.eval('Store.saveDriveConfig({ url: ' + JSON.stringify(OK) + ' }); Store.saveDrivePending({ text: JSON.stringify({ a: 1 }), name: "pending.json" }); return true;');
  ok(await page.eval('var p = Store.drivePending(); return !!p && p.name === "pending.json";'), 'السحابة: النسخة المعلّقة تُحفظ في الطابور');
  await page.eval('window.__rp = null; App.cloud.retryPending(); return true;');
  await B.sleep(1200);
  const rq = await page.eval('return { p:!!Store.drivePending(), last:Store.driveLog()[0].name };');
  ok(rq.p === false && rq.last === 'pending.json', 'السحابة: الطابور يُفرَّغ ويُرفع عند عودة الاتصال', JSON.stringify(rq));

  /* فحص شكل الرابط: رسالة محددة لكل خطأ شائع في «النشر» */
  const u = await page.eval('var f = function (x) { var r = App.cloud.urlCheck(x); return r.ok ? "OK" : r.msg.slice(0, 40); };' +
    'return { dev:f("https://script.google.com/macros/s/AKfy/exec".replace("/exec","/dev")),' +
    ' doc:f("https://docs.google.com/document/d/abc/edit"), win:f("https://script.google.com/home/projects/x/edit"),' +
    ' empty:f(""), good:f("https://script.google.com/macros/s/AKfybC-123_x/exec"), q:f("https://script.google.com/macros/s/AKfybC-123_x/exec?x=1") };');
  ok(/dev/.test(u.dev), 'الرابط /dev يُرفَض برسالة صريحة (رابط اختبار)', u.dev);
  ok(/ملف|مستند/.test(u.doc) && /رابط/.test(u.win) && /الصق/.test(u.empty), 'الأخطاء الشائعة تُشرح بالتفصيل (درايف · محرّر المشروع · فارغ)');
  ok(u.good === 'OK' && u.q === 'OK', 'رابط /exec الصحيح (ومعه ?معامل) يُقبل');
  const tp = await page.eval('return { s:App.cloud.steps().length, t:App.cloud.traps().length, code:App.cloud.scriptCode().length, wiz:typeof App.cloud.wizard };');
  ok(tp.s >= 8 && tp.t >= 4 && tp.code > 500, 'التعليمات التفصيلية (٨ خطوات) + الأخطاء الأربعة + الكود متاحة', 'steps=' + tp.s + ' traps=' + tp.t);

  /* لوحة الإعداد ظاهرة فعلًا في وحدة «بيانات تابعني» (بدخول المشرف العام) */
  await loginAsRaw(page, base, OWNER.username, OWNER.password);
  await B.sleep(500);
  await page.eval('App.go("platform"); return true;');
  await B.sleep(900);
  const panel = await page.eval('var v = document.querySelector("#view"); if (!v) return { none: true }; var t = v.innerText;' +
    'return { cloud:t.indexOf("الحفظ السحابي") > -1, drive:t.indexOf("Google Drive") > -1, log:t.indexOf("آخر عمليات الرفع") > -1, sched:t.indexOf("موعد النسخة الاحتياطية") > -1 };');
  ok(panel.cloud && panel.drive && panel.log && panel.sched, 'السحابة: اللوحة (الحالة · السجل · زر الربط) ظاهرة للمشرف العام', JSON.stringify(panel));
  /* زر «طباعة التقرير»: ينتج الوثيقة + شريط إجراءات ظاهر (بدل الفشل الصامت على الجوال) */
  await page.eval('App.go("schools"); return true;');
  await B.sleep(900);
  const repClick = await page.eval('var b=[].slice.call(document.querySelectorAll("#view button")).filter(function(x){return x.innerText.indexOf("طباعة التقرير")>-1;})[0]; if(!b) return "NO"; b.click(); return "OK";');
  await B.sleep(1000);
  const rb = await page.eval('var f=document.getElementById("print-frame"); var bar=document.getElementById("report-bar");' +
    'return { frame:f?f.contentDocument.documentElement.innerHTML.length:0, bar:!!bar,' +
    ' actions:bar?bar.innerText.replace(/[\\n\\r]+/g," | "):"", err:(window.__E2E.errors||[]).length };');
  ok(repClick === 'OK' && rb.frame > 1000 && rb.bar,
    'زر «طباعة التقرير» يُنتج الوثيقة ويُظهر شريط الإجراءات (طباعة · تبويب · PDF)', repClick + ' | frame=' + rb.frame + ' | ' + rb.actions);
  ok(rb.err === 0, 'لا أخطاء JS عند الطباعة', String(rb.err));

  /* بيئة آبل: مساعدات جاهزة (تُختبر هنا على سطح مكتب ⇒ قيمها false والمسار العادي سليم) */
  const env = await page.eval('var e = UI.env(); return { ios:e.ios, st:e.standalone, share:typeof UI.shareFile, btns:(document.getElementById("report-bar")||{querySelectorAll:function(){return[];}}).querySelectorAll("button").length };');
  ok(env.ios === false && env.st === false && env.share === 'function', 'دعم آبل مُهيّأ (‎UI.env/UI.shareFile) وبلا تأثير على سطح المكتب', JSON.stringify(env));
  const dl = await page.eval('var r = UI.downloadText("x", "فحص.txt", "text/plain"); return { r: r, frame: !!document.getElementById("print-frame") };');
  ok(dl.r === 'فحص.txt', 'تنزيل الملفات يعمل كما هو على غير آبل (بلا تغيير)', JSON.stringify(dl));

  /* ============ استيراد المعلمين من Excel (٨٠ معلمًا بضغطة) ============ */
  const imp = await page.eval(
    'var before = Store.list("users").length;' +
    'var rows = [' +
    ' { "الاسم": "أ. سعد المطيري", "الدور": "معلم", "المادة": "الرياضيات", "رقم الهوية": "1023000001", "الجوال": "+966501110001", "البريد": "imp1@x.sa" },' +
    ' { "الاسم": "أ. نورة الغامدي", "الدور": "معلم", "المادة": "الكفايات اللغوية / التفكير الناقد", "رقم الهوية": "1023000002" },' +
    ' { "الاسم": "أ. هند العتيبي", "الدور": "موجّه التوجيه والإرشاد", "رقم الهوية": "1023000003" },' +
    ' { "الاسم": "أ. سعد المطيري", "رقم الهوية": "1023000001" }' +
    '];' +
    'var map = Store.guessStaffMap(Object.keys(rows[0]));' +
    'var gm = [map.name, map.role, map.id].join("|");' +
    'var r = Store.importStaff(rows, map, {});' +
    'var logins = r.creds.map(function (c) { return Store.authenticate(c.username, c.password).ok ? "OK" : "FAIL"; });' +
    'return { added: r.added, skipped: r.skipped, gm: gm, usernames: r.creds.map(function (c) { return c.username; }),' +
    ' roles: r.creds.map(function (c) { return c.role; }).join("|"), passLen: r.creds[0].password.length,' +
    ' mustChange: r.users[0].mustChange, allLogin: logins.every(function (x) { return x === "OK"; }),' +
    ' school: !!r.users[0].schoolId, total: Store.list("users").length - before };');
  ok(imp.added === 3 && imp.skipped === 1 && imp.total === 3, 'استيراد Excel: يضيف الصفوف الصحيحة ويتخطّى المكرر', JSON.stringify({ added: imp.added, skipped: imp.skipped }));
  ok(imp.gm.split('|').every(function (x) { return x; }), 'يتعرّف على أعمدة الملف تلقائيًا (الاسم/الدور/الهوية)', imp.gm);
  ok(new Set(imp.usernames).size === 3 && imp.usernames.every(function (u) { return u && u.length >= 3; }), 'لكل مستورد اسم مستخدم فريد', imp.usernames.join(','));
  ok(imp.allLogin === true, 'كل حساب مستورد يستطيع الدخول فعلًا (اسم المستخدم + كلمة المرور)');
  ok(imp.mustChange === true && imp.passLen >= 8 && imp.school, 'إلزام تغيير كلمة المرور + ربط الحساب بالمدرسة', 'pass=' + imp.passLen);
  ok(/موجّه/.test(imp.roles), 'الدور يُقرأ من الملف (موجّه التوجيه والإرشاد)', imp.roles);

  /* لوحة الاستيراد ظاهرة للمشرف العام في وحدة الحسابات */
  await page.eval('App.go("users"); return true;');
  await B.sleep(1000);
  const impPanel = await page.eval('var t=document.querySelector("#view").innerText; return { p:t.indexOf("استيراد موظفين من Excel")>-1, btn:t.indexOf("اختر ملف Excel")>-1, sheet:t.indexOf("كشف")>-1 };');
  ok(impPanel.p && impPanel.btn, 'لوحة «استيراد موظفين من Excel» ظاهرة للمشرف العام', JSON.stringify(impPanel));

  await page.eval('Store.saveDriveConfig({ url: "", enabled: false }); return true;');
  ok(await page.eval('return !Store.driveConfigured();'), 'السحابة: فصل الربط يُوقف الرفع التلقائي');
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
  ok(nav.indexOf('messages') > -1, 'الرسائل الخاصة باقية (تعمل بلا تلقرام)');
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
  ok(/موقوف من إدارة تابعني/.test(msg2), 'رسالة الإيقاف التشغيلي تختلف عن رسالة الرسوم', msg2.slice(0, 60));
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

/** فحص المالية (السداد · الفاتورة الإلكترونية · المصروفات · التقارير) وبوت الدعم وتذاكره */
async function financeSupportSuite(page, base) {
  const res = [];
  const ok = (c, m, d) => res.push({ ok: !!c, m: m, d: d || '' });
  const clickLast = (txt) => 'var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1]; if(!m) return "no-modal";' +
    'var b=Array.prototype.filter.call(m.querySelectorAll("button"),function(x){return (x.textContent||"").trim()===' + JSON.stringify(txt) + ';})[0];' +
    'if(!b) return "no-button"; b.click(); return "ok";';
  const clickText = (sel, txt) => 'var b=Array.prototype.filter.call(document.querySelectorAll(' + JSON.stringify(sel) +
    '),function(x){return (x.textContent||"").trim()===' + JSON.stringify(txt) + ';})[0]; if(!b) return false; b.click(); return true;';
  const sup = await page.eval('var u=Store.list("users").filter(function(x){return x.role==="super"&&x.username;})[0]; return {u:u.username,p:u.password};');
  const fin = await page.eval('var u=Store.list("users").filter(function(x){return x.role==="accountant"&&x.username;})[0]; return u?{u:u.username,p:u.password}:null;');
  const supAg = await page.eval('var u=Store.list("users").filter(function(x){return x.role==="support"&&x.username;})[0]; return u?{u:u.username,p:u.password}:null;');
  const prin = await page.eval('var u=Store.list("users").filter(function(x){return x.role==="principal"&&x.username;})[0]; return {u:u.username,p:u.password};');

  /* حسابا تابعني موجودان في بيانات العرض */
  ok(fin && supAg, 'بيانات العرض: حساب المحاسب المالي وحساب الدعم الفني', JSON.stringify({ accountant: !!fin, support: !!supAg }));

  /* المحاسب المالي: وحدة المالية وحدها (عزل) */
  if (fin) {
    await loginAsRaw(page, base, fin.u, fin.p);
    const nav = await page.eval('return Array.prototype.map.call(document.querySelectorAll(".side-nav a[data-mod]"),function(a){return a.getAttribute("data-mod");});');
    ok(nav.indexOf('finance') > -1 && nav.indexOf('schools') === -1, 'المحاسب المالي: يرى المالية ولا يرى إدارة المدارس', nav.join(','));
    await page.eval('App.go("finance"); return true;');
    await B.sleep(700);
    const ui = await page.eval('var t=document.querySelector("#view").innerText; return { inv:t.indexOf("الفواتير")>-1, exp:t.indexOf("المصروفات")>-1, rep:t.indexOf("التقارير المالية")>-1, bank:t.indexOf("بيانات التحويل")>-1 };');
    ok(ui.inv && ui.exp && ui.rep && ui.bank, 'لوحة المالية: الفواتير والمصروفات والتقارير وبيانات التحويل', JSON.stringify(ui));
  }

  /* الفاتورة الإلكترونية: الرقم والختم والشعار والوقت والمبلغ */
  const inv = await page.eval('var inv=Store.invoices()[0]; if(!inv) return null; var h=UI.invoiceHtml(inv);' +
    'return { no:inv.no, len:h.length, num:h.indexOf(inv.no)>-1, stamp:h.indexOf("textPath")>-1, logo:h.indexOf("logo-mark")>-1,' +
    ' time:h.indexOf("الوقت")>-1, total:h.indexOf(UI.fmtMoney(inv.amount))>-1, title:h.indexOf("تابعني للخدمات الذكية")>-1 };');
  ok(inv && inv.num && inv.stamp && inv.logo && inv.time && inv.total && inv.title,
    'الفاتورة الإلكترونية: رقم + ختم تابعني + الشعار + الترويسة + التاريخ/الوقت + المبلغ',
    inv ? JSON.stringify({ no: inv.no, ok: [inv.num, inv.stamp, inv.logo, inv.time, inv.total] }) : 'لا فاتورة');

  /* تقرير مالي بست فترات */
  const periods = await page.eval('return Store.financeAllPeriods().map(function(p){return p.period.name;});');
  ok(periods.length === 6, 'التقارير المالية: يومي · أسبوعي · شهري · ربع سنوي · نصف سنوي · سنوي', periods.join(' · '));
  const doc = await page.eval('var h=UI.platformDoc({title:"تقرير",sections:[{heading:"م",table:{cols:["أ","ب"],rows:[["1","2"]]}}],signatures:["المحاسب المالي لتابعني","المشرف العام"]});' +
    'return { len:h.length, stamp:h.indexOf("textPath")>-1, sig:h.indexOf("المشرف العام")>-1, logo:h.indexOf("logo-mark")>-1 };');
  ok(doc.len > 2000 && doc.stamp && doc.sig && doc.logo, 'وثيقة التقرير المالي بترويسة تابعني والختم والتوقيعات', JSON.stringify(doc));

  /* مصروف */
  const e0 = await page.eval('return Store.expenses().length;');
  const e1 = await page.eval('return Store.addExpense({title:"صيانة اختبار",category:"maintenance",amount:150}).ok;');
  const e2 = await page.eval('return Store.expenses().length;');
  ok(e1 && e2 === e0 + 1, 'تسجيل مصروف (صيانة/سيرفرات/تشغيل/دومين)', e0 + ' → ' + e2);

  /* دورة كاملة: سند تحويل ← اعتماد ← تفعيل آلي + فاتورة */
  const sch = await page.eval('var s=Store.list("schools")[0]; return { id:s.id, name:s.name };');
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDc0NDH/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQA/9k=';
  const req = await page.eval('return Store.createPaymentRequest({ schoolId:' + JSON.stringify(sch.id) + ', kind:"annual", plan:"pro", years:1, transferRef:"TR-9090", receipt:' + JSON.stringify(jpeg) + ' }).ok;');
  ok(req, 'المدرسة ترفع سند التحويل وطلب التفعيل');
  const pend = await page.eval('return Store.paymentRequests({status:"pending"}).length;');
  ok(pend === 1, 'الطلب يظهر بانتظار الاعتماد', String(pend));
  await loginAsRaw(page, base, sup.u, sup.p);
  await page.eval('App.go("finance"); return true;');
  await B.sleep(700);
  ok(await page.eval(clickText('#view button', 'اعتماد وتفعيل')), 'المشرف العام: زر «اعتماد وتفعيل» لواجهة السند');
  await B.sleep(500);
  await page.eval(clickLast('اعتماد وتفعيل'));
  await B.sleep(1300);
  const done = await page.eval('var inv=Store.invoices()[0]; var lic=Store.licenseState(' + JSON.stringify(sch.id) + '); var r=Store.paymentRequests()[0];' +
    'return { invNo:inv.no, amount:inv.amount, plan:inv.plan, status:r.status, linked:!!r.invoiceId, receipt:!!inv.receipt, days:lic.daysLeft, blocked:lic.blocked, audit:(Store.db.audit||[])[0].action };');
  ok(done.amount === 1500 && done.plan === 'pro', 'الاعتماد أصدر فاتورة اشتراك برو 1500 ر.س', JSON.stringify({ no: done.invNo, amount: done.amount }));
  ok(done.days > 300, 'تفعيل الباقة آليًا بعد الاعتماد', done.days + ' يومًا');
  ok(done.status === 'approved' && done.linked && done.receipt, 'الطلب مُعتمد والفاتورة مرتبطة به ومعها صورة السند');
  ok(done.audit === 'payment_approved', 'الاعتماد مُقيَّد في سجل التدقيق', done.audit);

  /* بوت الدعم: شفت + لهجة سعودية + صورة + تذكرة */
  const agent = await page.eval('return { name:Store.agentNow().name, shift:Store.agentNow().shift, agents:Store.AGENTS.length };');
  ok(agent.agents === 2 && agent.shift.indexOf('الشفت') > -1, 'شفتان: فارس الحربي (٨ص–٨م) وهند المطيري (٨م–٨ص)', agent.name + ' · ' + agent.shift);
  const bot = await page.eval('var r=Store.botReply("ما أقدر أسكّر التحضير"); return { agent:r.agent.name, cat:r.category, saudi:r.text.indexOf("أبشر")>-1 || r.text.indexOf("هلا")>-1 || r.text.indexOf("يمديك")>-1, subj:r.subject };');
  ok(bot.cat === 'attendance' && bot.saudi, 'البوت يفهم الاستفسار ويرد بلهجة سعودية', bot.agent + ' · ' + bot.cat);
  const botImg = await page.eval('var r=Store.botReply("", { image:true, imageMeta:{w:800,h:600,kb:90,type:"JPEG"} }); return { offer:r.offerTicket, text:r.text.indexOf("الصورة")>-1 };');
  ok(botImg.offer && botImg.text, 'البوت يستقبل صورة المشكلة ويفرزها ويفتح تذكرة');
  const tkt = await page.eval('var r=Store.openTicket({subject:"اختبار فحص",category:"attendance",byName:"مراجع آلي",byRole:"principal"});' +
    'return { no:r.ticket.no, status:r.ticket.status, assignee:r.ticket.assignee, notif:(Store.db.notif||[]).filter(function(n){return n.kind==="support";}).length };');
  ok(tkt.no && tkt.assignee === 'support' && tkt.notif > 0, 'التذكرة تُفتح وتوصل «قسم الدعم» و«المشرف العام»', JSON.stringify(tkt));
  if (supAg) {
    await loginAsRaw(page, base, supAg.u, supAg.p);
    const sNav = await page.eval('return Array.prototype.map.call(document.querySelectorAll(".side-nav a[data-mod]"),function(a){return a.getAttribute("data-mod");});');
    ok(sNav.indexOf('support') > -1, 'موظف الدعم الفني يرى وحدة التذاكر', sNav.join(','));
    await page.eval('App.go("support"); return true;');
    await B.sleep(800);
    const queue = await page.eval('var t=document.querySelector("#view").innerText; return { stats:t.indexOf("تذاكر جديدة")>-1, queue:t.indexOf("تذاكر الدعم")>-1 };');
    ok(queue.stats && queue.queue, 'وحدة الدعم: إحصاء التذاكر وقائمة المتابعة', JSON.stringify(queue));
    await page.eval(clickText('#view button', 'فتح'));
    await B.sleep(700);
    await page.eval('var ta=document.querySelector("#view textarea"); if(ta) ta.value="تم، شفنا المشكلة وبنتابعها معاك."; return true;');
    await page.eval(clickText('#view button', 'إرسال الرد'));
    await B.sleep(900);
    const rep2 = await page.eval('var t=Store.tickets()[0]; return { last:t.messages[t.messages.length-1].from, status:t.status };');
    ok(rep2.last === 'agent' && rep2.status === 'progress', 'ردّ الدعم يُسجَّل والتذكرة تصير قيد المعالجة', JSON.stringify(rep2));
  }

  /* واجهة زر الدعم العائم: الصورة يسار الاسم */
  await loginAsRaw(page, base, prin.u, prin.p);
  ok(await page.eval('return !!document.getElementById("support-fab");'), 'زر «الدعم الفني» العائم يظهر لكل الأدوار');
  await page.eval('App.openSupport(); return true;');
  await B.sleep(700);
  const wid = await page.eval('var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1];' +
    'var img=m.querySelector("img"); var nm=Array.prototype.filter.call(m.querySelectorAll("div"),function(d){return d.textContent.trim()===Store.agentNow().name;})[0];' +
    'if(!img||!nm) return null; var a=img.getBoundingClientRect(), b=nm.getBoundingClientRect();' +
    'return { greet:m.innerText.indexOf("هلا والله")>-1, shift:m.innerText.indexOf("الشفت")>-1, avatarLeft:a.left<b.left };');
  ok(wid && wid.greet && wid.shift, 'نافذة الدعم: ترحيب بلهجة سعودية وبيان الشفت', JSON.stringify(wid));
  ok(wid && wid.avatarLeft, 'صورة الموظف على يسار اسمه', wid ? String(wid.avatarLeft) : '—');
  await page.eval('var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1]; m.querySelector("textarea").value="وش نظام الاشتراك والفاتورة؟"; return true;');
  await page.eval(clickLast('إرسال'));
  await B.sleep(1500);
  const chat = await page.eval('var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1]; return m.innerText.indexOf("تحويل بنكي")>-1 || m.innerText.indexOf("فاتورة إلكترونية")>-1;');
  ok(chat, 'البوت يشرح نظام السداد والفاتورة بلهجة سعودية');
  await page.eval('Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"),function(b){b.remove();}); return true;');

  /* لقطة مالية أخيرة: التحصيل المتوقّع والمصروفات في الملخّص */
  const sum = await page.eval('var s=Store.financeSummary("annual"); return { rev:s.revenue, exp:s.expensesTotal, net:s.net, expected:s.annualExpected };');
  ok(sum.expected >= 1500 && sum.exp > 0, 'الملخّص المالي: إيرادات ومصروفات وصافي والتحصيل المتوقّع', JSON.stringify(sum));
  return res;
}

/** دخول مباشر (بلا خطوات إضافية) */
/** يفتح نافذة بيانات الدخول إن كانت الصفحة الرئيسية هي المعروضة */
async function openLogin(page) {
  const has = await page.eval('return !!document.querySelector("form [name=username]");').catch(() => false);
  if (has) return true;
  await page.eval('var b = document.querySelector("[data-login]"); if (b) b.click(); return true;').catch(() => {});
  await B.sleep(400);
  return true;
}

async function loginAsRaw(page, base, u, pw) {
  await page.eval('try { Store.logout(); } catch (e) {} return true;').catch(() => {});
  await B.goto(page, base + '/index.html', '!!window.Store');
  await openLogin(page);
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
    /* تنقّل جديد دائمًا: يضمن الوصول لشاشة الدخول سواء كنّا داخل تابعني أو على شاشة التحقق */
    await page.eval('try { Store.logout(); } catch (e) {} return true;').catch(() => {});
    await B.goto(page, base + '/index.html', '!!window.Store');
    await openLogin(page);
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
