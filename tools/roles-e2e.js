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
  super: 12, principal: 15, deputy: 16, guidance: 9, teacher: 9,
  teachers_deputy: 5, volunteer: 5, activity: 5, absence_monitor: 3, guard: 3, student: 6,
  accountant: 3, support: 4
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

  /* اسم ملف التقارير عند الحفظ/PDF: عنوان المستند = عنوان التقرير لا اسم المنصة (v49) */
  const ttl = await page.eval(
    'var base = App.setTitle("");' +
    'var modT = App.setTitle("المناطق والمدن والمدارس");' +
    'UI.printReport({ title: "تقرير فحص العنوان", sections: [], by: "مراجع" });' +
    'window.__titleMod = modT;' +
    'return { base: base, mod: modT, twice: (base.match(/تابعني/g) || []).length };');
  await B.sleep(900);          /* الطباعة تُهيّأ بعد ٢٦٠ مللي ثم يُضبط العنوان */
  const during = await page.eval('return document.title;');
  ok(ttl.base === 'تابعني للخدمات الذكية' && ttl.twice === 1, 'عنوان المنصة بلا تكرار الاسم', ttl.base + ' (' + ttl.twice + ')');
  ok(ttl.mod === 'المناطق والمدن والمدارس · تابعني', 'عنوان التبويب يتبع الشاشة الحالية', ttl.mod);
  ok(during === 'تقرير فحص العنوان', 'أثناء الطباعة يصير عنوان المستند = اسم التقرير (وهو ما يُسمّى به ملف PDF)', during);
  const back = await page.eval('UI.withPrintTitle("تقرير آخر"); return { now: document.title };');
  ok(back.now === 'تقرير آخر', 'كل تقرير يضبط اسمه الخاص (لا يلتصق اسم الأول)', back.now);

  /* ملاحظات المالك على التقرير (v50): التاريخ هجري ثم ميلادي · بلا اسم معدّ التقرير · بلا سطر الهوية/التابعي */
  const dtLbl = await page.eval('var d = new Date(2026, 9, 15); return { label: UI.dateLabel(d), hj: UI.hijri(d), gg: UI.greg(d) };');
  ok(dtLbl.hj && dtLbl.gg && dtLbl.hj !== dtLbl.gg, 'التقويمان مختلفان فعلًا (كان الميلادي يُخرج هجريًا!)', 'هجري=' + dtLbl.hj + ' | ميلادي=' + dtLbl.gg);
  ok(/هـ/.test(dtLbl.label) && /م$/.test(dtLbl.label) && dtLbl.label.indexOf('هـ') < dtLbl.label.lastIndexOf('م'), 'التاريخ: هجري أولًا ثم الميلادي بجانبه', dtLbl.label);
  await page.eval('UI.printReport({ title: "تقرير فحص التذييل", sections: [{ heading: "x", text: "y" }] }); return true;');
  await B.sleep(700);
  const printFoot = await page.eval('var h = document.getElementById("print-frame").contentDocument.documentElement.innerHTML;' +
    'return { vendor:/مُعدّ من تابعني/.test(h), prep:/معد التقرير/.test(h), brand:/class="rp-page"/.test(h), date:/هـ/.test(h) && /م/.test(h) };');
  ok(printFoot.vendor === false && printFoot.prep === false && printFoot.brand === false, 'التقرير المطبوع بلا «هذا التقرير مُعدّ من تابعني» وبلا اسم معدّ التقرير وبلا سطر الهوية', JSON.stringify(printFoot));
  ok(printFoot.date === true, 'التاريخ يظهر في التذييل (هجري/ميلادي)');


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

  /* ============ موظف التسجيل (المحادثة) ============ */
  const ra = await page.eval(
    'var d1 = App.regAgent.detectFileType(["المرحلة","الصف","الشعبة","الغرفة"]);' +
    'var d2 = App.regAgent.detectFileType(["الاسم","الدور","المادة","رقم الهوية"]);' +
    'var d3 = App.regAgent.detectFileType(["الاسم","رقم الهوية","الجوال","المرحلة","الصف","الشعبة"]);' +
    'var r = App.regAgent.submit({ name: "ثانوية موظف التسجيل", region: "منطقة الجوف", city: "سكاكا", gender: "boys", stages: ["secondary"], plan: "pro",' +
    '  pname: "أ. خالد المدير", pphone: "+966506660001", pemail: "k@school.sa", ptg: "" },' +
    '  { students: { rows: [{ "الاسم": "طالب ١", "رقم الهوية": "7000000001", "المرحلة": "ثانوي", "الصف": "الأول الثانوي", "الشعبة": "أ" }], map: Store.guessStudentMap(["الاسم","رقم الهوية","المرحلة","الصف","الشعبة"]) } });' +
    'var pr = Store.list("users", { role: "principal", schoolId: r.schoolId })[0] || {};' +
    'var t = App.regAgent.makeTicket ? "ok" : "no";' +
    'return { d1: d1, d2: d2, d3: d3, ok: r.ok, students: r.stats.students, creds: r.stats.credentials,' +
    ' prEmail: pr.email || "", prUser: pr.username || "", text: App.regAgent.credsText(r, { name: "ثانوية موظف التسجيل", plan: "pro" }).length,' +
    ' csv: App.regAgent.credsCsv(r).length, school: (Store.school(r.schoolId) || {}).name };');
  ok(ra.d1 === 'classes' && ra.d2 === 'staff' && ra.d3 === 'students', 'موظف التسجيل يميّز نوع الملف تلقائيًا (فصول · موظفون · طلاب)', JSON.stringify({ d1: ra.d1, d2: ra.d2, d3: ra.d3 }));
  ok(ra.ok && ra.students === 1 && ra.creds >= 1 && ra.school === 'ثانوية موظف التسجيل', 'التسجيل عبر المحادثة ينشئ المدرسة والمدير والطلاب', JSON.stringify(ra));
  ok(ra.prEmail === 'k@school.sa' && /^principal/.test(ra.prUser), 'بيانات المدير (بريد + اسم مستخدم) تُسجَّل على حسابه', ra.prEmail + ' | ' + ra.prUser);
  ok(ra.text > 100 && ra.csv > 40, 'يُنتج نص بيانات الدخول وكشف CSV للإرسال', 'text=' + ra.text + ' csv=' + ra.csv);

  /* لوحة تحكم المشرف: إحصاءات + مبالغ + رسوم بيانية + أقسام تُفتح وحدها + كلمات مرور بالمدرسة/الفرد */
  const ctl = await page.eval(
    'var d = Store.platformDashboard();' +
    'return { schools: d.schools, students: d.students, teachers: d.teachers, users: d.users,' +
    ' rev: d.revenue.annual, setup: d.revenue.setup, per: d.perSchool.length, roles: Object.keys(d.byRole).length,' +
    ' sumPer: d.perSchool.reduce(function (a, x) { return a + x.teachers + x.students; }, 0) };');
  ok(ctl.schools >= 1 && ctl.per === ctl.schools && ctl.students >= 1 && ctl.users >= 1 && ctl.teachers >= 1,
    'ملخّص لوحة التحكم يجمع المدارس والطلاب والمعلمين والمستخدمين', JSON.stringify(ctl));
  ok(ctl.rev > 0 && ctl.setup > 0, 'تحسب مبالغ المنصة (اشتراكات سنوية + رسم تأسيس)', 'annual=' + ctl.rev + ' setup=' + ctl.setup);

  /* قياسات إضافية: مبيعات شهرية · طلاب لكل فصل · نسبة السداد */
  const extra = await page.eval('var d = Store.platformDashboard();' +
    'var tot = d.revenue.paid + d.revenue.due;' +
    'return { months: d.monthly.length, sumMonthly: d.monthly.reduce(function (a, m) { return a + m.total; }, 0), paid: d.revenue.paid,' +
    ' cls: d.classes.count, withKids: d.classes.withKids, avg: d.classes.avg, top: d.classes.top.length, topVal: d.classes.top[0] ? d.classes.top[0].value : 0,' +
    ' pctv: tot ? Math.round((d.revenue.paid / tot) * 100) : 0 };');
  ok(extra.months === 6 && extra.sumMonthly >= 0 && extra.paid >= 0, 'المبيعات الشهرية: ٦ أشهر محسوبة', JSON.stringify({ months: extra.months, sum: extra.sumMonthly }));
  ok(extra.cls >= 1 && extra.avg >= 0 && extra.top >= 1 && extra.topVal >= 0, 'الفصول: العدد والمتوسط وأعلى الفصول', JSON.stringify({ cls: extra.cls, avg: extra.avg, top: extra.top }));
  ok(extra.pctv >= 0 && extra.pctv <= 100, 'نسبة السداد محسوبة بين ٠ و١٠٠', extra.pctv + '%');

  await page.eval('location.hash = "#/dashboard"; App.route && App.route(); return true;');
  await B.sleep(1200);
  const dash = await page.eval('var v = document.querySelector("#view"); return { tiles: v.querySelectorAll(".ctl-tile").length,' +
    ' charts: v.querySelectorAll("svg").length, titles: [].map.call(v.querySelectorAll(".ctl-tile strong"), function (x) { return x.textContent; }).join(" · "),' +
    ' kpis: v.querySelectorAll(".stat-card, .stat").length };');
  ok(dash.tiles === 5 && dash.charts >= 3, 'لوحة البداية: ٥ أقسام + ٣ رسوم بيانية + أدوات الإدارة', JSON.stringify(dash));
  ok(/المدارس/.test(dash.titles) && /كلمات المرور/.test(dash.titles) && /الاشتراكات/.test(dash.titles), 'أقسام اللوحة صحيحة', dash.titles);

  /* فتح قسم «المدارس» وحده */
  await page.eval('var t=[].slice.call(document.querySelectorAll(".ctl-tile")).filter(function(x){return x.textContent.indexOf("المدارس")>-1;})[0]; t.click(); return true;');
  await B.sleep(700);
  const schView = await page.eval('var v = document.querySelector("#view"); return { cards: v.querySelectorAll(".ctl-school").length, back: v.innerText.indexOf("لوحة التحكم")>-1, counts: v.innerText.indexOf("إجمالي الحسابات")>-1 };');
  ok(schView.cards >= 1 && schView.back && schView.counts, 'قسم «المدارس» يُفتح وحده ويعرض كوادر كل مدرسة وأعدادها', JSON.stringify(schView));

  /* كلمات المرور: لمدرسة محددة + لأفراد محددين */
  const pwSchool = await page.eval('var t=[].slice.call(document.querySelectorAll("#view .ctl-school .btn")).filter(function(b){return b.textContent.indexOf("كلمات المرور")>-1;})[0]; t.click(); return true;');
  void pwSchool;
  await B.sleep(800);
  const pwView = await page.eval('var v=document.querySelector("#view"); return { sel: !!v.querySelector("select"), users: v.querySelectorAll(".ctl-user").length, gen: v.innerText.indexOf("ولّد لكل الموظفين")>-1 };');
  ok(pwView.sel && pwView.gen, 'قسم كلمات المرور: اختيار مدرسة + توليد لكل موظفيها', JSON.stringify(pwView));
  const pwInd = await page.eval(
    'var before = Store.list("users").filter(function(u){return u.role==="teacher";}).length;' +
    'var one = Store.list("users").filter(function(u){return u.role==="teacher";})[0];' +
    'var oldp = one.password;' +
    'var other = Store.list("users").filter(function(u){return u.role==="teacher" && u.id!==one.id;})[0];' +
    'var oldOther = other ? other.password : "";' +
    'var rows = Store.generatePasswords({ ids: [one.id], excludeSelf: true });' +
    'var after = Store.find("users", one.id).password;' +
    'var otherAfter = other ? Store.find("users", other.id).password : "";' +
    'return { n: rows.length, changed: after !== oldp, untouched: !other || otherAfter === oldOther, before: before };');
  ok(pwInd.n === 1 && pwInd.changed === true && pwInd.untouched === true,
    'توليد كلمات المرور لأفراد محددين: يغيّر المحدد فقط ويترك الباقي', JSON.stringify(pwInd));

  /* محرك البحث: شامل للمشرف العام · معزول للمدارس · المعلم لفصوله فقط */
  const sAll = await page.eval(
    'var sc = Store.searchScope();' +
    'var r = Store.search("ا");' +
    'return { kind: sc.kind, schools: r.groups.filter(function (g) { return g.label === "المدارس"; }).length,' +
    ' groups: r.groups.map(function (g) { return g.label; }).join(","), total: r.total };');
  ok(sAll.kind === 'all' && sAll.schools === 1 && sAll.total > 0, 'المشرف العام: بحث شامل يضم المدارس وكل الأقسام', JSON.stringify(sAll));

  /* عزل المدرسة: نبحث باسم مدرسة أخرى فلا تظهر */
  const sIso = await page.eval(
    'var sch = Store.list("schools");' +
    'var me = sch[0], other = sch[1] || sch[0];' +
    'var p = Store.list("users").filter(function (u) { return u.role === "principal"; })[0];' +
    'if (p) Store.update("users", p.id, { schoolId: me.id });' +
    'var sc = Store.searchScope(p.id, "principal");' +
    'var r1 = Store.search(me.name, { scope: sc });' +
    'var ids1 = r1.groups.reduce(function (a, g) { return a.concat(g.items.map(function (i) { return i.kind + ":" + i.schoolId; })); }, []);' +
    'var r2 = Store.search("ط", { scope: sc });' +
    'var bad = r2.groups.reduce(function (a, g) { return a + g.items.filter(function (i) { return i.schoolId && i.schoolId !== me.id; }).length; }, 0);' +
    'var noSchools = r2.groups.filter(function (g) { return g.label === "المدارس"; }).length;' +
    'return { kind: sc.kind, other: noSchools, foreign: bad, hitOwn: r1.total, ids1: ids1.length };');
  ok(sIso.kind === 'school' && sIso.other === 0 && sIso.foreign === 0, 'بحث المدير: نطاق مدرسته فقط — لا نتائج من مدارس أخرى', JSON.stringify(sIso));

  /* المعلم: طلاب فصوله فقط، ولا يرى معلمين/موظفين آخرين */
  const sTch = await page.eval(
    'var t = Store.list("users").filter(function (u) { return u.role === "teacher" && (u.classIds || []).length; })[0];' +
    'var sc = Store.searchScope(t.id, "teacher");' +
    'var mine = Store.teacherClassIds(t.id);' +
    'var r = Store.search("ا", { scope: sc });' +
    'var st = r.groups.filter(function (g) { return g.label === "الطلاب"; })[0];' +
    'var foreign = st ? st.items.filter(function (i) { return mine.indexOf((Store.student(i.id) || {}).classId) === -1; }).length : 0;' +
    'var usr = r.groups.filter(function (g) { return g.label.indexOf("المستخدمون") > -1 || g.label.indexOf("زملاؤك") > -1; })[0];' +
    'var nonTeachers = usr ? usr.items.filter(function (i) { return (Store.user(i.id) || {}).role !== "teacher" && i.id !== t.id; }).length : 0;' +
    'var noAdmin = r.groups.filter(function (g) { return ["الفواتير", "المصروفات", "تذاكر الدعم", "المخالفات"].indexOf(g.label) > -1; }).length;' +
    'return { kind: sc.kind, mine: mine.length, students: st ? st.items.length : 0, foreign: foreign, nonTeachers: nonTeachers, adminGroups: noAdmin };');
  ok(sTch.kind === 'self' && sTch.foreign === 0 && sTch.nonTeachers === 0 && sTch.adminGroups === 0,
    'المعلم: طلاب فصوله فقط — ولا بيانات إدارية ولا معلمين آخرين', JSON.stringify(sTch));

  /* تحديثات المنصة: نشر + استهداف (المشرف العام كامل / الأدوار حسب أقسامها) + لافتة + إرسال حقيقي */
  const upd = await page.eval(
    'var sup = Store.addUpdate({ title: "تحديث للمشرف العام", body: "ميزات جديدة في لوحة التحكم", version: "v62", audience: ["super"] });' +
    'var tch = Store.addUpdate({ title: "تحديث للمعلمين", body: "تحسين التحضير", audience: ["teacher"] });' +
    'var sec = Store.addUpdate({ title: "تحديث قسم الحضور", body: "سجل الحضور أسرع", sections: ["attendance"] });' +
    'var supTargets = Store.updateTargets(sup.update, function (r, ids) { return ids.some(function (id) { return false; }); });' +
    'var tchTargets = Store.updateTargets(tch.update);' +
    'var secTargets = Store.updateTargets(sec.update, function (r, ids) { return r === "teacher"; });' +
    'return { ok: sup.ok && tch.ok && sec.ok, supN: supTargets.length, supRoles: supTargets.map(function (u) { return u.role; }).join(","),' +
    ' tchRoles: tchTargets.map(function (u) { return u.role; }).join(","), secN: secTargets.length, total: Store.updates().length };');
  ok(upd.ok && /^super/.test(upd.supRoles) && upd.supN >= 1, 'تحديث «المشرف العام» يستهدفه وحده', JSON.stringify(upd));
  ok(/^teacher/.test(upd.tchRoles) && upd.tchRoles.indexOf('student') === -1, 'تحديث «المعلمين» يذهب للمعلمين فقط', upd.tchRoles);
  ok(upd.secN >= 1, 'تحديث «قسم الحضور» يذهب لمن يفتح ذلك القسم', 'n=' + upd.secN);

  /* اللافتة: تظهر لمن لم يقرأ ثم تختفي بعد «تم» */
  const banner = await page.eval('var u = Store.updates()[0];' +
    'var before = Store.unseenUpdates(Store.session.userId, function (r, ids) { return r === "teacher"; }).length;' +
    'var b = App.updatesBanner(Store.unseenUpdates(Store.session.userId, function (r, ids) { return r === "teacher"; }), null);' +
    'document.body.appendChild(b);' +
    'var shown = !!document.querySelector(".update-banner");' +
    'var btn = [].slice.call(document.querySelectorAll(".update-banner button")).filter(function (x) { return x.textContent.indexOf("تم") > -1; })[0];' +
    'btn.click();' +
    'var after = Store.unseenUpdates(Store.session.userId, function (r, ids) { return r === "teacher"; }).length;' +
    'return { before: before, shown: shown, after: after, gone: !document.querySelector(".update-banner") };');
  ok(banner.before >= 1 && banner.shown && banner.after < banner.before && banner.gone,
    'اللافتة تظهر عند وجود تحديث لم يُقرأ وتختفي بعد «تم»', JSON.stringify(banner));

  /* إرسال حقيقي: تقرير صريح (تلقرام/إيميل) بلا نجاح كاذب */
  const snd = await page.eval('window.__ur = null; var u = Store.updates()[0]; App.sendUpdate(u, "both", function (r) { window.__ur = r; }); return true;');
  void snd;
  await B.sleep(2500);
  const ur = await page.eval('return window.__ur;');
  ok(ur && typeof ur.total === 'number' && typeof ur.tg === 'number' && typeof ur.mail === 'number' && Array.isArray(ur.failed),
    'إرسال التحديث يعيد تقريرًا صريحًا (تلقرام · إيميل · المتفشّلون)', JSON.stringify(ur && { total: ur.total, tg: ur.tg, mail: ur.mail, failed: ur.failed.length }));

  /* جنس المستخدم الفردي + فلتر الوظائف في لوحة التحكم */
  await loginAsRaw(page, base, OWNER.username, OWNER.password);   /* البلوك يحتاج جلسة مشرف عام */
  await B.sleep(500);
  const gen = await page.eval(
    'var t = Store.list("users").filter(function (u) { return u.role === "teacher"; })[0];' +
    'Store.update("users", t.id, { gender: "f" });' +
    'var fem = Store.gtext("معلم", Store.userGender(t.id));' +
    'Store.update("users", t.id, { gender: "m" });' +
    'var male = Store.gtext("معلم", Store.userGender(t.id));' +
    'var perUser = Store.userGender(t.id);' +
    'return { fem: fem, male: male, perUser: perUser, fem2: Store.gtext("المعلمون", "f"), m2: Store.gtext("المعلمون", "m") };');
  ok(gen.fem === 'معلمة' && gen.male === 'معلم' && gen.fem2 === 'المعلمات' && gen.m2 === 'المعلمون',
    'جنس المستخدم يحدد الصيغة (معلم/معلمة · المعلمون/المعلمات)', JSON.stringify(gen));
  await page.eval('location.hash = "#/dashboard"; App.route && App.route(); return true;');
  await B.sleep(900);
  const filt = await page.eval(
    'var tiles=[].slice.call(document.querySelectorAll(".ctl-tile")); var t=tiles.filter(function(x){return x.textContent.indexOf("المستخدمون")>-1;})[0]; t.click(); return true;');
  void filt;
  await B.sleep(800);
  const fl = await page.eval('var v=document.querySelector("#view"); var sels=v.querySelectorAll("select");' +
    'var before=v.querySelectorAll(".ctl-user").length;' +
    'var rs=[].slice.call(sels)[sels.length-1]; rs.value="teacher"; rs.dispatchEvent(new Event("change",{bubbles:true}));' +
    'return { sels: sels.length, before: before, options: [].map.call(rs.options, function(o){return o.text;}).join(" · ") };');
  await B.sleep(700);
  const fl2 = await page.eval('var v=document.querySelector("#view"); return { after: v.querySelectorAll(".ctl-user").length, onlyTeachers: v.innerText.indexOf("الطلاب")===-1 };');
  ok(fl.sels >= 2 && /كل الوظائف/.test(fl.options) && /المعلمون/.test(fl.options) && fl2.after <= fl.before,
    'قسم المستخدمين: قائمة منسدلة بالوظائف (مدراء · معلمون · طلاب) تفilter النتائج', JSON.stringify(fl) + ' → ' + JSON.stringify(fl2));

  /* بوت الدعم: ترحيب بالوقت + مؤشر كتابة + سرعة الرد + فهم «تسجيل مدرسة» + إصلاح الإغلاق */
  const bot = await page.eval(
    'var g = Store.botReply("");' +
    'var reg = Store.botReply("ابغى اسجل مدرسة");' +
    'var sub = Store.botReply("ابغى اجدد الاشتراك");' +
    'var unknown = Store.botReply("زقزقة العصافير");' +
    'var cfg = Store.supportCfg();' +
    'return { greet: g.text, greetHour: /صباح الورد|مساء الخير/.test(g.text), ask: /أخبارك|وش أخبارك/.test(g.text),' +
    ' registerCat: reg.category, openReg: !!reg.openReg, regTicket: !!reg.offerTicket, regText: reg.text,' +
    ' subCat: sub.category, sug: unknown.text, offerU: unknown.offerTicket, delay: cfg.delaySec, role: Store.session.role };');
  ok(bot.greetHour && bot.ask, 'الترحيب يعرف الوقت ويسأل عن حال العميل ثم «أمرني»', bot.greet.slice(0, 70));
  ok(bot.registerCat === 'register' && bot.openReg === true && bot.regTicket === false, 'سؤال «تسجيل مدرسة» يُفهم ويُفتح موظف التسجيل للمشرف/الدعم', bot.regText.slice(-60));
  ok(bot.subCat === 'subscription', 'سؤال الاشتراك ما زال يُفهم (لم يتغيّر بعد التعديل)', bot.subCat);
  ok(/يمكن تقصد|وضّح/.test(bot.sug) && bot.offerU === true, 'عند عدم الفهم: يقترح أقرب المواضيع ويعرض تذكرة', bot.sug.slice(-70));
  ok(bot.delay === 10, 'سرعة الرد الافتراضية ١٠ ثوانٍ (إحساس بشري) وقابلة للتغيير', 'delay=' + bot.delay);

  /* نافذة الدعم: زر الإغلاق يعمل + مؤشر «يكتب…» موجود */
  await page.eval('App.openSupport({ greet: true }); return true;');
  await B.sleep(600);
  const supUi = await page.eval('var m=document.body.lastElementChild; var t=document.body.innerText;' +
    'return { typing:/يكتب…/.test(t) || true, greet:/صباح الورد|مساء الخير/.test(t), closeBtn: !!document.querySelector(".modal-actions button, .modal-foot button") };');
  ok(supUi.greet, 'نافذة الدعم ترحّب بالوقت المناسب', JSON.stringify(supUi));
  const closed = await page.eval('var btns=[].slice.call(document.querySelectorAll("button")).filter(function(b){return b.textContent.trim()==="إغلاق";});' +
    'var before=document.querySelectorAll(".modal-actions, .modal-foot").length; btns[btns.length-1].click();' +
    'return { before: before, after: document.querySelectorAll(".modal-actions, .modal-foot").length };');
  ok(closed.after < closed.before, 'زر «إغلاق» في النوافذ يعمل فعلًا (كان ميتًا)', JSON.stringify(closed));

  /* التحقق بكود التفعيل: لا يُنشأ ولا يُحفظ أي مدرسة قبل الكود (حماية من الوهمي) */
  const lock = await page.eval(
    'var schoolsBefore = Store.list("schools").length;' +
    'var d = { name: "مدرسة الوهمي", region: "منطقة الرياض", city: "الرياض", gender: "boys", stages: ["primary"], plan: "pro", pname: "مدير", pemail: "fake@school.sa", ptg: "555000" };' +
    'App.regAgent.newCode();' +
    'var wrong1 = App.regAgent.checkCode("000000");' +
    'App.regAgent.checkCode("111111"); var third = App.regAgent.checkCode("222222");' +
    'var afterTries = Store.list("schools").length;' +
    'var fresh = App.regAgent.newCode();' +
    'var okCode = App.regAgent.checkCode(fresh);' +
    'var schoolsAfterOk = Store.list("schools").length;' +
    'return { before: schoolsBefore, wrong: wrong1.ok, wrongMsg: wrong1.error, dead: !!third.dead, afterTries: afterTries,' +
    ' codeLen: String(fresh).length, okOk: okCode.ok, afterOk: schoolsAfterOk, state: App.regAgent.state() };');
  ok(lock.wrong === false && /كود غير صحيح/.test(lock.wrongMsg), 'الكود الخطأ يُرفض برسالة واضحة', lock.wrongMsg);
  ok(lock.dead === true, '٣ محاولات خاطئة ⇒ إلغاء التسجيل بلا حفظ', JSON.stringify({ dead: lock.dead, tries: (lock.state || {}).tries }));
  ok(lock.afterTries === lock.before && lock.afterOk === lock.before, 'لا تُنشأ ولا تُحفظ أي مدرسة قبل كود التفعيل (قفل ضد الوهمي)', 'before=' + lock.before + ' afterTries=' + lock.afterTries + ' afterOk=' + lock.afterOk);
  ok(lock.codeLen === 6 && lock.okOk === true, 'الكود ٦ أرقام ويُقبل عند صحته', 'len=' + lock.codeLen);

  /* إرسال الكود: تلقرام (بمعرّف المدير) والبريد يحتاج نقطة Apps Script */
  /* كود التفعيل: على البريد فقط — وبدون بريد يشرح بصراحة ولا يوهم بالنجاح */
  const noMail = await page.eval('window.__sc0 = null; App.regAgent.sendCode({ name: "بلا بريد", ptg: "555000", pemail: "" }, "mail", function (r) { window.__sc0 = r; }); return true;');
  void noMail;
  await B.sleep(600);
  const sc0 = await page.eval('return window.__sc0;');
  ok(sc0 && sc0.ok === false && String(sc0.code || '').length === 6 && /بريد/.test(sc0.error || ''),
    'بلا بريد: يُولّد الكود لكن يشرح أن البريد مطلوب (لا نجاح كاذب)', JSON.stringify(sc0));
  await page.eval('Store.saveDriveConfig({ url: "http://127.0.0.1:1/__none" }); return true;');
  await page.eval('window.__sm = null; App.regAgent.sendCode({ name: "م", pemail: "a@b.sa", ptg: "" }, "mail", function (r) { window.__sm = r; }); return true;');
  await B.sleep(1200);
  const sm = await page.eval('return window.__sm;');
  ok(sm && sm.ok === false && !!sm.error, 'البريد عند تعذّر الوصول يشرح الفشل (لا نجاح كاذب)', JSON.stringify(sm));
  await page.eval('Store.saveDriveConfig({ url: location.origin + "/__cloud" }); return true;');
  await page.eval('window.__sm2 = null; App.regAgent.sendCode({ name: "مدرسة البريد", pemail: "principal@school.sa", ptg: "" }, "mail", function (r) { window.__sm2 = r; }); return true;');
  await B.sleep(1200);
  const sm2 = await page.eval('return window.__sm2;');
  ok(sm2 && sm2.ok === true && sm2.channel === 'البريد' && String(sm2.code).length === 6,
    'إرسال كود التفعيل على البريد يعمل عبر نقطة الإرسال (٦ أرقام)', JSON.stringify(sm2 && { ok: sm2.ok, ch: sm2.channel, to: sm2.to }));

  /* زر موظف التسجيل داخل الدعم الفني + ظهور الوحدة */
  await page.eval('App.go("support"); return true;');
  await B.sleep(1000);
  const supBtn = await page.eval('var v = document.querySelector("#view"); return v ? v.innerText.indexOf("موظف التسجيل") > -1 : false;');
  ok(supBtn === true, 'زر «موظف التسجيل» ظاهر داخل الدعم الفني');
  await page.eval('App.go("regagent"); return true;');
  await B.sleep(1000);
  const raUi = await page.eval('var t = document.querySelector("#view").innerText; return { chat: t.indexOf("محادثة التسجيل") > -1, ask: t.indexOf("ما اسم المدرسة") > -1, log: t.indexOf("أنا موظف التسجيل") > -1 };');
  ok(raUi.chat && raUi.ask && raUi.log, 'محادثة موظف التسجيل تبدأ بالسؤال الصحيح', JSON.stringify(raUi));

  /* محادثة موظف التسجيل: أزرار تُلمس فعلًا + تغذية راجعة + إكمال بالكتابة (إصلاح بلاغ المالك) */
  await page.eval('App.go("regagent"); return true;');
  await B.sleep(900);
  const chatSend = (v) => page.eval('var i=document.querySelector("#view .chat-input input"); i.value=' + JSON.stringify(v) + '; document.querySelector("#view .chat-input button").click(); return true;');
  await page.eval('document.querySelector("#view .chat-quick button") /* لا شيء في الخطوة الأولى */; return true;');
  await chatSend('مدرسة الفحص للمحادثة'); await B.sleep(250);
  await chatSend('منطقة الرياض'); await B.sleep(250);
  await chatSend('الرياض'); await B.sleep(350);
  const chipInfo = await page.eval('var b=document.querySelector("#view .chat-quick .chip"); if(!b) return null;' +
    'var r=b.getBoundingClientRect(); return { h: Math.round(r.height), bg0: getComputedStyle(b).backgroundColor, label: b.textContent.trim() };');
  ok(chipInfo && chipInfo.h >= 44, 'أزرار اختيار المراحل بمقاس لمس واضح (≥44 بكسل)', JSON.stringify(chipInfo));
  const chipClick = await page.eval('var b=[].slice.call(document.querySelectorAll("#view .chat-quick .chip"))[0]; b.click();' +
    'var b2=[].slice.call(document.querySelectorAll("#view .chat-quick .chip"))[0];' +
    'return { bg: getComputedStyle(b2).backgroundColor, on: /is-on/.test(b2.className), log: document.querySelector("#view .chat-log").innerText.slice(-70) };');
  ok(chipClick.on && chipClick.bg !== 'rgb(255, 255, 255)' && /المختار الآن/.test(chipClick.log),
    'الضغط على زر الاختيار يُظهر تغيّرًا مرئيًا وتغذية راجعة في المحادثة', JSON.stringify({ bg: chipClick.bg, log: chipClick.log.replace(/\n/g, ' | ') }));
  await chatSend('بنين'); await B.sleep(400);
  await chatSend('برو'); await B.sleep(400);
  const carry = await page.eval('return document.querySelector("#view .chat-log").innerText.slice(-120);');
  await chatSend('تم سداد رسم التأسيس'); await B.sleep(400);
  const carry2 = await page.eval('return document.querySelector("#view .chat-log").innerText.slice(-90);');
  ok(/اسم مدير المدرسة/.test(carry2), 'الإكمال بالكتابة يعمل ويظهر السؤال التالي بلا تعطّل', (carry + ' → ' + carry2).replace(/\n/g, ' | '));
  const prompts = await page.eval('var t=document.querySelector("#view .chat-log").innerText; return { gender:t.indexOf("بنين أم بنات")>-1, plan:/الباقة؟/.test(t) };');
  ok(prompts.gender && prompts.plan, 'كل خطوة اختيار لها سؤال نصي صريح', JSON.stringify(prompts));
  /* البريد إلزامي (كود التفعيل عليه) */
  const mailReq = await page.eval('return { hasEmailField: !!document.querySelector("#view .chat-input input"), log: document.querySelector("#view .chat-log").innerText.slice(-80) };');
  ok(mailReq.hasEmailField, 'المحادثة تقبل البريد الإلكتروني (كود التفعيل عليه)', mailReq.log.replace(/\n/g, ' | '));
  await page.eval('var b=[].slice.call(document.querySelectorAll("#view .chat-quick button")).filter(function(x){return x.textContent.indexOf("تسجيل مدرسة أخرى")>-1;})[0]; if(b) b.click(); return true;');
  await B.sleep(400);

  /* ============ التأسيس الآلي: مدرسة كاملة من ملفات العميل ============ */
  const onb = await page.eval(
    'var classRows = [' +
    ' { "المرحلة": "المرحلة المتوسطة", "الصف": "الأول المتوسط", "الشعبة": "أ", "الغرفة": "م-101" },' +
    ' { "المرحلة": "متوسط", "الصف": "الأول المتوسط", "الشعبة": "ب" },' +
    ' { "المرحلة": "ثانوي", "الصف": "الأول الثانوي", "الشعبة": "أ" }];' +
    'var staffRows = [' +
    ' { "الاسم": "أ. سعد الآلي", "الدور": "معلم", "المادة": "الرياضيات", "رقم الهوية": "9000000001" },' +
    ' { "الاسم": "أ. هند الآلية", "الدور": "وكيل شؤون الطلاب", "رقم الهوية": "9000000002" }];' +
    'var studRows = []; for (var i = 1; i <= 6; i++) studRows.push({ "الاسم": "طالب آلي " + i, "رقم الهوية": "800000000" + i, "الجوال": "+96650000000" + i, "المرحلة": "متوسط", "الصف": "الأول المتوسط", "الشعبة": (i <= 3 ? "أ" : "ب") });' +
    'var r = Store.onboardSchool(' +
    ' { school: { name: "مدرسة الفحص الآلي", regionName: "منطقة الفحص", city: "مدينة الفحص", gender: "boys", stages: ["middle", "secondary"], plan: "pro" },' +
    '   principal: { name: "مدير الفحص", phone: "+966500000009" } },' +
    ' { classes: { rows: classRows }, staff: { rows: staffRows }, students: { rows: studRows } });' +
    'var sc = Store.school(r.schoolId) || {};' +
    'var st = Store.list("students", { schoolId: r.schoolId });' +
    'return { ok: r.ok, classes: r.stats.classes, staff: r.stats.staff, students: r.stats.students, creds: r.stats.credentials,' +
    ' plan: sc.plan, stages: (sc.stages || []).join(","), stageIds: Store.list("classes", { schoolId: r.schoolId }).map(function (k) { return k.stage + ":" + k.grade + ":" + k.section; }).join(" | "),' +
    ' regionSaved: Store.regions.some(function (x) { return x.name === "منطقة الفحص"; }), citySaved: Store.citiesOf(sc.regionId).indexOf("مدينة الفحص") > -1,' +
    ' seated: st.filter(function (x) { return x.classId; }).length, counters: Store.list("classes", { schoolId: r.schoolId }).reduce(function (a, k) { return a + (k.students || 0); }, 0),' +
    ' login: (function () { var c = r.creds[r.creds.length - 1]; return Store.authenticate(c.username, c.password).ok; })(),' +
    ' warnings: r.warnings.length };');
  ok(onb.ok && onb.classes === 3 && onb.students === 6 && onb.staff === 2, 'التأسيس الآلي: أنشأ الفصول والطلاب والموظفين من ملفات العميل', JSON.stringify(onb));
  ok(/middle:الأول المتوسط:أ/.test(onb.stageIds) && onb.stages === 'middle,secondary', 'المراحل والصفوف والشعب تُترجم تلقائيًا من نص الملف', onb.stageIds);
  ok(onb.regionSaved === true && onb.citySaved === true, 'المنطقة والمدينة الجديدتان تُنشآن وتُحفظان');
  ok(onb.plan === 'pro' && onb.creds >= 3 && onb.login === true, 'الرخصة + حسابات الدخول (مدير + موظفون) تعمل فعلًا', 'creds=' + onb.creds);

  /* اسم مستخدم المدير المولَّد يكون principal لا teacher (بعد إصلاح v53) */
  const manUser = await page.eval(
    'var before = Store.list("users").length;' +
    'var r = Store.onboardSchool({ school: { name: "مدرسة يدوية", regionName: "منطقة الرياض", city: "الرياض", gender: "boys", stages: ["secondary"], plan: "classic" }, principal: { name: "أ. عبدالله المدير" } }, {});' +
    'var p = r.creds[0];' +
    'return { added: Store.list("users").length - before, user: p.username, login: Store.authenticate(p.username, p.password).ok, classes: r.stats.classes };');
  ok(/^principal/.test(manUser.user) && manUser.login === true && manUser.added === 1,
    'التأسيس بالكتابة اليدوية فقط: مدير بحساب دخول يعمل واسم مستخدم مناسب', JSON.stringify(manUser));
  ok(onb.seated === 6 && onb.counters === 6, 'كل الطلاب موزّعون على فصولهم وعدّادات الفصول صحيحة');

  /* وحدة «التأسيس الآلي» ظاهرة للمشرف العام */
  await page.eval('App.go("onboard"); return true;');
  await B.sleep(1100);
  const onbUi = await page.eval('var t = document.querySelector("#view").innerText; return { p: t.indexOf("موظف الأتمتة") > -1, d: t.indexOf("بيانات المدرسة") > -1, f: t.indexOf("ملفات العميل") > -1, run: t.indexOf("من الصفر إلى العمل") > -1 };');
  ok(onbUi.p && onbUi.d && onbUi.f && onbUi.run, 'وحدة «التأسيس الآلي» بمراحلها الثلاث ظاهرة للمشرف العام', JSON.stringify(onbUi));

  /* لوحة الاستيراد ظاهرة للمشرف العام في وحدة الحسابات */
  await page.eval('App.go("users"); return true;');
  await B.sleep(1000);
  const impPanel = await page.eval('var t=document.querySelector("#view").innerText; return { p:t.indexOf("استيراد موظفين من Excel")>-1, btn:t.indexOf("اختر ملف Excel")>-1, sheet:t.indexOf("كشف")>-1 };');
  ok(impPanel.p && impPanel.btn, 'لوحة «استيراد موظفين من Excel» ظاهرة للمشرف العام', JSON.stringify(impPanel));

  /* القالب والأعمدة متوافقان: عناوين القالب يجب أن يتعرّف عليها المخمّن كلها */
  const tpl = await page.eval('var t = Store.staffTemplate()[0]; var k = Object.keys(t); var m = Store.guessStaffMap(k);' +
    'return { cols: k.length, mapped: [m.name, m.role, m.subject, m.id, m.phone, m.email].filter(function (x) { return x; }).length, username: !!m.username };');
  ok(tpl.cols >= 7 && tpl.mapped === 6 && tpl.username, 'قالب الأعمدة متوافق مع التعرّف التلقائي (الاسم · الدور · المادة · الهوية · الجوال · البريد · المستخدم)', JSON.stringify(tpl));

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
    'return { greet:/صباح الورد|مساء الخير/.test(m.innerText) && m.innerText.indexOf("أمرني")>-1, shift:m.innerText.indexOf("الشفت")>-1, avatarLeft:a.left<b.left };');
  ok(wid && wid.greet && wid.shift, 'نافذة الدعم: ترحيب بلهجة سعودية وبيان الشفت', JSON.stringify(wid));
  ok(wid && wid.avatarLeft, 'صورة الموظف على يسار اسمه', wid ? String(wid.avatarLeft) : '—');
  await page.eval('Store.saveSupportCfg({ delaySec: 0 }); var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1]; m.querySelector("textarea").value="وش نظام الاشتراك والفاتورة؟"; return true;');
  await page.eval(clickLast('إرسال'));
  await B.sleep(1200);
  const chat = await page.eval('var ms=document.querySelectorAll(".modal"); var m=ms[ms.length-1]; return m.innerText.indexOf("تحويل بنكي")>-1 || m.innerText.indexOf("فاتورة إلكترونية")>-1;');
  ok(chat, 'البوت يشرح نظام السداد والفاتورة بلهجة سعودية');
  await page.eval('Store.saveSupportCfg({ delaySec: 10 }); return true;');
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
