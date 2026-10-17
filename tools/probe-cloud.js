const path = require('path');
const B = require('./browser');
(async () => {
  const site = await B.serve(path.join(__dirname, '..', 'app'));
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port);
  await B.goto(page, site.url + '/index.html', '!!window.Store', 20000);
  await page.eval('Store.saveSyncCfg({ url: "http://127.0.0.1:8788" }); return true;');
  /* دخول سحابي */
  const login = await page.eval(
    'return new Promise(function (res) {' +
    'App.signIn("t1x", "Pass@2026x", function (u) { setTimeout(function () { res({ ok: true, name: u.name, role: u.role }); }, 1200); },' +
    ' function (m) { res({ ok: false, err: m }); }); });', { awaitPromise: true });
  console.log('LOGIN', JSON.stringify(login));
  await B.sleep(1500);
  const state = await page.eval('return { cloud: Store.cloudMode(), classes: Store.list("classes").map(function (c) { return c.id; }),' +
    ' students: Store.list("students").map(function (s) { return s.id; }), invoices: Store.list("invoices").length, expenses: Store.list("expenses").length,' +
    ' users: Store.list("users").length, shell: !!document.querySelector(".side-nav") };');
  console.log('STATE', JSON.stringify(state));
  /* كتابة: مخالفة لطالب فصله */
  const write = await page.eval('var st = Store.list("students")[0]; var v = Store.insert("violations", { classId: st.classId, studentId: st.id, note: "من المتصفح" }); return { id: v.id };');
  await B.sleep(2600);
  console.log('WRITE', JSON.stringify(write));
  /* إعادة تحميل: يجب أن يستأنف بلا تسجيل */
  await B.goto(page, site.url + '/index.html', '!!window.Store', 20000);
  await B.sleep(2500);
  const resume = await page.eval('return { cloud: Store.cloudMode(), shell: !!document.querySelector(".side-nav"), classes: Store.list("classes").length, violations: Store.list("violations").map(function (v) { return v.note || ""; }) };');
  console.log('RESUME', JSON.stringify(resume));
  const errs = await B.pageErrors(page);
  console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
