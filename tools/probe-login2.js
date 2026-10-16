const path = require('path');
const B = require('./browser');
const LOCAL = process.argv.indexOf('--local') > -1;
(async () => {
  let site = null, LIVE = 'https://abdmmm2.github.io/tabaani/app/';
  if (LOCAL) { site = await B.serve(path.join(__dirname, '..', 'app')); LIVE = site.url + '/index.html'; }
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port);
  await B.goto(page, LIVE, '!!window.Store', 15000);
  /* نُهيّئ حالة تشبه جهاز المالك: مشرف عام + مدرسة برو + مدير بكلمة مرور مؤقتة (mustChange) */
  const prep = await page.eval(
    'var out = {};' +
    'try {' +
    '  var sup = Store.addUser({ name: "مشرف تجربة", role: "super", username: "p-super", password: "Tabaani@2026" });' +
    '  var sc = Store.insert("schools", { name: "ثانوية الأصدقاء", region: "الرياض", city: "الرياض", gender: "boys", plan: "pro", license: { plan: "pro", status: "active" } });' +
    '  out.school = sc ? sc.id : null;' +
    '  if (out.school && Store.update) { try { Store.update("schools", out.school, { plan: "pro" }); } catch (e) {} }' +
    '  var pr = Store.addUser({ name: "خالد المدير", role: "principal", schoolId: out.school, username: "p-principal", password: "Tabaani@2026" });' +
    '  out.principal = pr.ok ? pr.user.id : null;' +
    '  if (out.principal) Store.update("users", out.principal, { mustChange: false, status: "active" });' +
    '  out.users = Store.list("users").length; out.schools = Store.list("schools").length;' +
    '  var u = Store.list("users").filter(function (x) { return x.username === "p-principal"; })[0];' +
    '  out.pro = Store.isPro(u.schoolId);' +
    '  out.tf2fa = JSON.stringify(Store.twoFactorFor(u));' +
    '  Store.session = null; if (Store.db) Store.db.session = null;' +
    '} catch (e) { out.err = e.message; }' +
    'return out;');
  console.log('PREP', JSON.stringify(prep));
  await page.eval('try { App.landing({ login: true }); } catch (e) { window.__e1 = e.message; } return true;');
  await B.sleep(500);
  /* اضغط زر الدخول كما يفعل المستخدم */
  const click = await page.eval(
    'var b = [].slice.call(document.querySelectorAll("button")).filter(function (x) { return /تسجيل الدخول/.test(x.textContent || ""); })[0];' +
    'if (b) { b.click(); return "clicked:" + (b.textContent || "").trim(); } return "no-button";').catch((e) => 'throw:' + e.message);
  console.log('CLICK', click);
  await B.sleep(700);
  const form = await page.eval(
    'return { modal: !!document.querySelector(".modal, .ui-modal"), inputs: document.querySelectorAll("input").length,' +
    ' inModal: document.querySelectorAll(".modal input, .ui-modal input").length }');
  console.log('FORM', JSON.stringify(form));
  /* عبّئ ودخل كمدير المدرسة */
  const submit = await page.eval(
    'var inputs = document.querySelectorAll(".modal input, .ui-modal input");' +
    'if (inputs.length < 2) inputs = document.querySelectorAll("input");' +
    'if (inputs.length < 2) return "no-inputs";' +
    'inputs[0].value = "p-principal"; inputs[0].dispatchEvent(new Event("input", { bubbles: true }));' +
    'inputs[1].value = "Tabaani@2026"; inputs[1].dispatchEvent(new Event("input", { bubbles: true }));' +
    'var f = inputs[0].closest("form") || document.querySelector("form");' +
    'if (!f) return "no-form";' +
    'f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));' +
    'return "submitted";').catch((e) => 'throw:' + e.message);
  console.log('SUBMIT', submit);
  await B.sleep(1500);
  const after = await page.eval(
    'var out = {};' +
    'out.session = Store.session ? (Store.session.role + "/" + Store.session.name) : null;' +
    'out.hash = location.hash;' +
    'out.bodyClass = document.body.className;' +
    'out.view = (document.querySelector("#view") || {}).innerText ? document.querySelector("#view").innerText.slice(0, 60) : "";' +
    'out.ackModal = !!document.querySelector(".ack-modal-backdrop");' +
    'out.pwdModal = !!document.querySelector(".modal input[type=password]");' +
    'out.errText = (document.querySelector(".hint-error") || {}).textContent || "";' +
    'out.modalTitle = (document.querySelector(".modal h3, .ui-modal h3, .modal .modal-title") || {}).textContent || "";' +
    'return out;');
  console.log('AFTER', JSON.stringify(after));
  console.log('ERRS', JSON.stringify((await B.pageErrors(page)).map(String).slice(0, 4)));
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
