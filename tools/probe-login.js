const B = require('./browser');
const LIVE = 'https://abdmmm2.github.io/tabaani/app/';
(async () => {
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port);
  await B.goto(page, LIVE, '!!window.Store', 15000);
  const steps = [];
  const snap = async (label) => {
    const s = await page.eval(
      'return { hash: location.hash, loginWrap: !!document.querySelector(".login-wrap"), loginPanel: !!document.querySelector(".login-panel"),' +
      ' form: !!document.querySelector("form"), inputs: document.querySelectorAll(".login-wrap input").length,' +
      ' btnTexts: [].slice.call(document.querySelectorAll("button, a.btn")).map(function (b) { return (b.textContent || "").trim().slice(0, 18); }).slice(0, 14).join(" | "),' +
      ' bodyClass: document.body.className, err: (document.querySelector(".hint-error") || {}).textContent || "" }').catch((e) => ({ evalErr: e.message }));
    steps.push({ label, s });
  };
  await snap('بعد الفتح');
  /* ١) اضغط زر «تسجيل الدخول» كما يفعل المستخدم */
  const clicked = await page.eval(
    'var btns = [].slice.call(document.querySelectorAll("button, a"));' +
    'var b = btns.filter(function (x) { return /تسجيل الدخول|دخول/.test(x.textContent || ""); })[0];' +
    'if (!b) return { found: false };' +
    'b.click(); return { found: true, text: (b.textContent || "").trim() };').catch((e) => ({ evalErr: e.message }));
  steps.push({ label: 'زر الدخول', s: clicked });
  await B.sleep(900);
  await snap('بعد الضغط');
  /* ٢) عبّئ النموذج بأول حساب موجود إن وُجد */
  const f = await page.eval(
    'var users = []; try { users = Store.list("users"); } catch (e) {}' +
    'var u = users.filter(function (x) { return x.role === "super"; })[0] || users[0];' +
    'var inputs = document.querySelectorAll(".login-wrap input, #app input");' +
    'var out = { users: users.length, picked: u ? (u.username + "/" + u.role) : null, inputs: inputs.length };' +
    'if (u && inputs.length >= 2) {' +
    '  inputs[0].value = u.username; inputs[0].dispatchEvent(new Event("input", { bubbles: true }));' +
    '  inputs[1].value = "Tabaani@2026"; inputs[1].dispatchEvent(new Event("input", { bubbles: true }));' +
    '  var form = document.querySelector("form");' +
    '  if (form) { try { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); out.submitted = true; } catch (e) { out.submitErr = e.message; } }' +
    '}' +
    'return out;').catch((e) => ({ evalErr: e.message }));
  steps.push({ label: 'تعبئة ودخول', s: f });
  await B.sleep(1200);
  await snap('بعد الإرسال');
  const errs = (await B.pageErrors(page)).map(String).slice(0, 6);
  console.log(JSON.stringify({ steps, errs }, null, 1).slice(0, 4000));
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
