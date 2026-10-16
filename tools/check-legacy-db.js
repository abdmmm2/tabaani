#!/usr/bin/env node
/* =============================================================================
   tools/check-legacy-db.js — «لا تنكسر منصّة من كان عنده نسخة قديمة»
   -----------------------------------------------------------------------------
   يحاكي جهازًا فيه بيانات محفوظة من إصدار سابق (بلا المجموعات ولا الحقول الجديدة):
     ١) يُقلع التطبيق وينشئ مالكًا.
     ٢) يحذف من قاعدة المتصفح كل ما أُضيف لاحقًا (updates · serviceRequests · pledges ·
        gradeSheets · الحقول ack/idType/idNo · settings الجديدة · الجلسة).
     ٣) يعيد تحميل الصفحة ← يجب أن تظهر **شاشة الدخول** (لا شاشة الإعداد) وأن **يدخل الحساب القديم**.
     ٤) اللوحة تُرسم بلا أخطاء JS · والمجموعات الناقصة تُستكمل تلقائيًا · والشاشات الجديدة (الإقرارات · الدرجات ·
        المزامنة) تُفتح بلا انهيار.
     ٥) أدوات الاستعادة موجودة: تحديث قسري · كشف نسخة قديمة · نصّ التشخيص في شاشة الدخول.
   التشغيل: node tools/check-legacy-db.js
   ========================================================================== */
'use strict';
const path = require('path');
const B = require('./browser');

const APP_DIR = path.join(__dirname, '..', 'app');
const OWNER = { username: 'legacy-root', password: 'Legacy@2026' };
let pass = 0; const fails = [];
const ok = (c, l, e) => { if (c) { pass++; console.log('  ✓ ' + l + (e ? '  ' + e : '')); } else { fails.push(l); console.log('  ✗ ' + l + (e ? '  ' + e : '')); } };

(async () => {
  const site = await B.serve(APP_DIR);
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port);
  console.log('\n══ فحص «بيانات قديمة لا تكسر المنصة» ══\n');

  await B.goto(page, site.url + '/index.html', '!!window.Store', 15000);
  const needs = await page.eval('return Store.needsSetup();');
  if (needs) {
    await page.eval(
      'App.boot && null;' +
      'var r = Store.setupOwner ? Store.setupOwner({ username: "' + OWNER.username + '", password: "' + OWNER.password + '", name: "مراجع قديم" }) : null;' +
      'return true;').catch(() => {});
    /* بعض الإصدارات تُنشئ المالك من شاشة الإعداد: نجرّب المسارين */
    const created = await page.eval('return Store.list("users").length;');
    if (!created) {
      await page.eval('var u = Store.addUser({ name: "مراجع قديم", role: "super", username: "' + OWNER.username + '", password: "' + OWNER.password + '" }); return !!u.ok;').catch(() => {});
    }
  }
  const seeded = await page.eval('return { users: Store.list("users").length, owner: (Store.list("users", { role: "super" })[0] || {}).username || "" };');
  ok(seeded.users >= 1, 'تهيّأ جهاز الفحص بحساب مشرف', JSON.stringify(seeded));

  /* -------- نحذف كل ما أُضيف لاحقًا (محاكاة جهاز قديم) -------- */
  const legacy = await page.eval(
    'var db = Store.db;' +
    '["updates", "serviceRequests", "pledges", "gradeSheets"].forEach(function (k) { delete db[k]; });' +
    'if (db.settings) { delete db.settings.ackMigrated; delete db.settings.ackEnabled; delete db.settings.cloudSync; delete db.settings.platformOwner; delete db.settings.botName; }' +
    'Store.list("users").forEach(function (u) { delete u.ack; delete u.idType; delete u.idNo; delete u.gender; });' +
    'Store.list("classes").forEach(function (k) { delete k.stage; });' +
    'db.session = null; db.currentUserId = null;' +
    'localStorage.setItem("tabaani-school-db-v1", JSON.stringify(db));' +
    'return { users: Store.list("users").length, hasGrade: "gradeSheets" in db, session: db.session };');
  ok(legacy.users >= 1 && legacy.hasGrade === false && legacy.session === null,
    'حُضّرت قاعدة «قديمة» (بلا المجموعات والحقول الجديدة وبلا جلسة)', JSON.stringify({ users: legacy.users, session: legacy.session }));

  /* -------- إعادة التحميل: يجب ألا تنكسر -------- */
  B.resetErrors(page);
  await B.goto(page, site.url + '/index.html', '!!window.Store', 15000);
  const after = await page.eval(
    'var out = {};' +
    'out.needsSetup = Store.needsSetup();' +
    'out.users = Store.list("users").length;' +
    'out.collections = ["updates", "serviceRequests", "pledges", "gradeSheets"].map(function (k) { return Store.list(k).length; });' +
    'out.loginScreen = !!document.querySelector(".login-panel, .login-wrap");' +
    'out.ver = (document.querySelector(".app-ver") || {}).textContent || "";' +
    'out.hardBtn = !!App.hardUpdate;' +
    'out.staleCheck = !!App.checkStale;' +
    'out.tools = /تحديث قسري/.test(document.body.innerText);' +
    'return out;');
  ok(after.needsSetup === false && after.users >= 1, 'لم تُفتح شاشة الإعداد (الحساب القديم ما زال موجودًا)', JSON.stringify({ setup: after.needsSetup, users: after.users }));
  ok(after.collections.every((n) => n === 0), 'المجموعات الجديدة استُكملت تلقائيًا (لا انهيار)', JSON.stringify(after.collections));
  ok(after.hardBtn && after.staleCheck, 'أدوات الاستعادة موجودة (تحديث قسري + كشف نسخة قديمة)');
  /* نفتح شاشة الدخول نفسها ونتأكد أن أدوات الاستعادة ظاهرة لمن لا يقدر يدخل */
  const loginUi = await page.eval(
    'try { Store.session = null; if (Store.db) Store.db.session = null; } catch (e) {}' +
    'try { App.landing ? App.landing({ login: true }) : null; } catch (e) {}' +
    'try { if (App.openLogin) App.openLogin(); } catch (e) {}' +
    'try { if (!document.querySelector(".login-wrap") && App.loginScreen) App.loginScreen(); } catch (e) {}' +
    'var txt = document.body.innerText || "";' +
    'return { tools: /تحديث قسري/.test(txt), help: /لماذا لا يعمل الدخول/.test(txt), users: /الحسابات في هذا التطبيق/.test(txt), hasLogin: !!document.querySelector(".login-wrap, .login-panel") };');
  ok(loginUi.tools && loginUi.help && loginUi.hasLogin, 'شاشة الدخول فيها «تحديث قسري» + «لماذا لا يعمل الدخول؟» + عدد الحسابات', JSON.stringify(loginUi));

  /* -------- الدخول بالحساب القديم -------- */
  const login = await page.eval(
    'var res = Store.authenticate("' + OWNER.username + '", "' + OWNER.password + '");' +
    'if (!res || (!res.ok && !res.user)) return { fail: (res && res.error) || "authenticate" };' +
    'var u = res.user || (Store.list("users")[0]);' +
    'Store.session = { userId: u.id, name: u.name, role: u.role, schoolId: u.schoolId || null };' +
    'App.route();' +
    'return { ok: true, role: u.role, hasView: !!document.querySelector("#view"), viewText: (document.querySelector("#view") || {}).innerText ? document.querySelector("#view").innerText.slice(0, 40) : "" };');
  ok(login.ok === true, 'الدخول بالحساب القديم يعمل بعد التحديث', JSON.stringify(login));

  /* -------- الشاشات الجديدة تُفتح بلا انهيار -------- */
  const mods = await page.eval(
    'var out = {};' +
    '["grades", "acks", "sync", "updates", "pledges"].forEach(function (id) {' +
    '  var m = App.modules[id]; if (!m) { out[id] = "missing"; return; }' +
    '  try { var v = document.createElement("div"); document.body.appendChild(v); m.render(v); out[id] = v.innerText ? "ok" : "empty"; v.remove(); }' +
    '  catch (e) { out[id] = "THROW: " + e.message; }' +
    '});' +
    'return out;');
  const bad = Object.keys(mods).filter((k) => mods[k] !== 'ok' && mods[k] !== 'missing' && mods[k] !== 'empty');
  ok(bad.length === 0, 'الشاشات الجديدة (الدرجات · الإقرارات · المزامنة · التحديثات · الإقرار) تُرسم بلا خطأ', JSON.stringify(mods));

  /* لا يُحجب مدير المدرسة بالإقرار · وتقرير التشخيص يعمل · والتهيئة لا تُعلَّم بلا مستخدمين */
  const guards = await page.eval(
    'var sc = Store.list("schools")[0] || { id: "s-x" };' +
    'var pr = Store.list("users", { role: "principal" })[0];' +
    'if (!pr) { var r0 = Store.addUser({ name: "مدير تجربة", role: "principal", schoolId: sc.id, username: "legacy-prin", password: "Legacy@2026" }); pr = r0.user || Store.list("users", { role: "principal" })[0]; }' +
    'var t = Store.list("users", { role: "teacher" })[0] || (Store.addUser({ name: "معلم تجربة", role: "teacher", schoolId: sc.id, username: "legacy-teach", password: "Legacy@2026" }).user);' +
    'Store.saveAckEnabled(true);' +
    'Store.reopenAck(pr.id); Store.reopenAck(t.id);' +
    'var prinLocked = Store.ackLock(pr.id);' +
    'var teachLocked = Store.ackLock(t.id);' +
    'var rep = ""; try { rep = App.diagReport ? (App.diagReport() || "") : ""; } catch (e) { rep = "THROW:" + e.message; }' +
    'Store.saveAckEnabled(false);' +
    'return { prinLocked: prinLocked, teachLocked: teachLocked, rep: /تقرير تشخيص/.test(rep) && /نسخة التطبيق/.test(rep) && /محجوبون بالإقرار/.test(rep), ver: Store.ack(pr.id).status };');
  ok(guards.prinLocked === false, 'مدير المدرسة لا يُحجب بالإقرار (لا تتعطّل المدرسة)', 'principalLocked=' + guards.prinLocked);
  ok(guards.teachLocked === true, 'المعلم يُحجب قبل اعتماد إقراره (المطلوب أصلًا)', 'teacherLocked=' + guards.teachLocked);
  ok(guards.rep === true, 'تقرير التشخيص يعمل ويحتوي الإصدار والمحجوبين', 'status=' + guards.ver);

  const migrated = await page.eval(
    'var out = {};' +
    'try {' +
    '  var db = Store.db; var saved = JSON.stringify(db.settings || {});' +
    '  db.settings.ackMigrated = true; db.settings.ackMigratedAt = new Date(Date.now() + 60000).toISOString();' +
    '  var u = Store.list("users", { role: "teacher" })[0];' +
    '  delete u.ack;' +
    '  var fixed = Store.ackMigrate();' +
    '  out.fixed = fixed > 0; out.status = Store.ack(u.id).status;' +
    '  db.settings = JSON.parse(saved);' +
    '} catch (e) { out.err = e.message; }' +
    'return out;');
  ok(migrated.fixed === true && migrated.status === 'approved',
    'إصلاح تلقائي: حساب أُنشئ قبل التهيئة وبلا إقرار يُعتمد (كان يُحجب بلا سبب)', JSON.stringify(migrated));

  /* التحقق بمرحلتين لا يجوز أن يحجب المدرسة بلا ربط تلقرام */
  const tfa = await page.eval(
    'var out = {};' +
    'var sc = Store.list("schools")[0] || { id: "s-x" };' +
    'if (!Store.list("schools").length) { }' +
    'Store.list("users").forEach(function (u) { delete u.telegramChatId; });' +
    'if (Store.db.settings) Store.db.settings.twoFactor = { enabled: true, enforce: true };' +
    'var healed = Store.twoFactorHeal();' +
    'out.healed = healed;' +
    'out.enforce = Store.twoFactorConfig().enforce;' +
    'var pr = Store.list("users", { role: "principal" })[0] || Store.list("users")[0];' +
    'out.afterHeal = Store.twoFactorFor(pr.id).blocked;' +
    '/* لو أُلغي الإصلاح الذاتي، نعيد الإلزام لنتأكد من مهرب المحاكاة */' +
    'if (Store.db.settings) Store.db.settings.twoFactor = { enabled: true, enforce: true };' +
    'var before = Store.twoFactorConfig();' +
    'var prevMode = Store.telegramConfig().mode;' +
    'Store.saveTelegramConfig({ mode: "sim" });' +
    'out.blockedInSim = Store.twoFactorFor(pr.id).blocked;' +
    'Store.saveTelegramConfig({ mode: prevMode });' +
    'out.authOk = (function () { try { Store.ensureSuper && Store.ensureSuper(Store.db); return true; } catch (e) { return false; } })();' +
    'return out;');
  ok(tfa.healed === true && tfa.enforce === false && tfa.afterHeal === false,
    'إصلاح ذاتي: إلزام تحقق بلا تلقرام مربوط لا يحجب المدرسة', JSON.stringify({ healed: tfa.healed, enforce: tfa.enforce }));
  ok(tfa.blockedInSim === false, 'وضع المحاكاة (بلا إرسال فعلي) لا يحجب الدخول', 'blocked=' + tfa.blockedInSim);

  const errs = (await B.pageErrors(page)).map(String).filter((e) => !/favicon|manifest/i.test(e));
  ok(errs.length === 0, 'صفر أخطاء JS على قاعدة قديمة', errs.slice(0, 3).join(' | '));

  console.log('\n  الفحوص: ' + (pass + fails.length) + ' · فاشلة: ' + fails.length + '\n');
  await site.close();
  if (fails.length) { fails.forEach((f) => console.log('   - ' + f)); process.exit(1); }
  console.log('  ✅ المنصة لا تنكسر لمن عنده بيانات من إصدار قديم.\n');
  process.exit(0);
})().catch((e) => { console.error('\n✗ تعذّر الفحص: ' + (e && e.message || e)); process.exit(1); });
