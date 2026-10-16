const B = require('./browser');
const LIVE = process.argv[2] || 'https://abdmmm2.github.io/tabaani/app/';
(async () => {
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port);
  const errs = [];
  try {
    await B.goto(page, LIVE, '!!window.Store', 15000);
  } catch (e) { console.log('LOAD:', e.message); }
  const st = await page.eval(
    'var m = document.querySelector("meta[name=app-version]");' +
    'var out = { version: m ? m.content : "?", store: typeof window.Store, title: document.title, bodyClass: document.body.className };' +
    'out.sessionNull = Store.session === null || Store.session === undefined;' +
    'try { Store.isGirls(); out.isGirls = "ok"; } catch (e) { out.isGirls = "THROW: " + e.message; }' +
    'try { Store.gtext("معلم"); out.gtext = "ok"; } catch (e) { out.gtext = "THROW: " + e.message; }' +
    'try { Store.roleLabel("teacher"); out.roleLabel = "ok"; } catch (e) { out.roleLabel = "THROW: " + e.message; }' +
    'try { Store.userGender(undefined); out.userGender = "ok"; } catch (e) { out.userGender = "THROW: " + e.message; }' +
    'try { document.querySelector(".login-wrap") ? null : null; out.dom = "ok"; } catch (e) { out.dom = "THROW"; }' +
    'return out;');
  console.log('STATE', JSON.stringify(st));
  /* جرّب: تهيئة بيانات عرض ثم دخول حساب مدير المدرسة */
  const flow = await page.eval(
    'try {' +
    ' if (!Store.needsSetup()) throw new Error("already-setup");' +
    ' var r = Store.setup && Store.setup({ name: "مراجع حي", username: "live-root", password: "LiveRoot@2026" });' +
    ' return { setup: r && r.ok, keys: r ? Object.keys(r) : null };' +
    '} catch (e) { return { err: e.message }; }').catch((e) => ({ evalErr: e.message }));
  console.log('SETUP', JSON.stringify(flow));
  await B.sleep(600);
  const login = await page.eval(
    'var out = {};' +
    'try {' +
    '  var res = Store.authenticate("admin", "Tabaani@2026");' +
    '  out.adminByUser = !!(res && (res.ok || res.user));' +
    '  var u = Store.list("users")[0]; out.first = u ? u.username + "/" + u.role : null;' +
    '} catch (e) { out.err = e.message; }' +
    'out.users = Store.list("users").length;' +
    'out.schools = Store.list("schools").length;' +
    'return out;').catch((e) => ({ evalErr: e.message }));
  console.log('LOGIN', JSON.stringify(login));
  console.log('ERRORS', JSON.stringify(B.pageErrors(page).map(String).slice(0, 5)));
  await B.sleep(300);
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
