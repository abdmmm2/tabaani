'use strict';
const B = require('/home/user/.workspace/projects/tabaani/tools/browser');
const LIVE = 'https://abdmmm2.github.io/tabaani/app/';
const rows = [];
const ok = (c, m, d) => { rows.push([!!c, m]); console.log('   ' + (c ? 'OK ' : 'BAD') + '  ' + m + (c ? '' : '   <- ' + (d || ''))); };
(async () => {
  const chrome = await B.launch(); const page = await B.openPage(chrome.port, { width: 1400, height: 1000 });
  try {
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(2200);
    await page.eval('try{localStorage.clear();}catch(e){} return true;');
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1800);
    await page.eval('Store.setupOwner({ demo: true, username: "rev2", name: "مراجع", password: "Tabaani@2026" }); return true;');
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1400);
    await page.eval('App.openLogin(); return true;'); await B.sleep(700);
    await page.eval('document.querySelector("[name=username]").value="rev2";document.querySelector("[name=password]").value="Tabaani@2026";document.querySelector("form button[type=submit]").click(); return true;');
    await B.sleep(2400);
    ok(await page.eval('return !!Store.session.userId;'), 'الحيّ: الدخول كمشرف عام');

    const imp = await page.eval(
      'var rows2 = [' +
      ' { "الاسم": "أ. سعد المطيري", "الدور": "معلم", "المادة": "الرياضيات", "رقم الهوية": "1099000001", "الجوال": "+966509900001" },' +
      ' { "الاسم": "أ. نورة الغامدي", "الدور": "معلم", "المادة": "الكفايات اللغوية", "رقم الهوية": "1099000002" },' +
      ' { "الاسم": "أ. هند العتيبي", "الدور": "موجّه التوجيه والإرشاد", "رقم الهوية": "1099000003" }];' +
      'var map = Store.guessStaffMap(Object.keys(rows2[0]));' +
      'var r = Store.importStaff(rows2, map, {});' +
      'window.__creds = r.creds;' +
      'var logins = r.creds.map(function (c) { return Store.authenticate(c.username, c.password).ok; });' +
      'return { added: r.added, roles: r.creds.map(function(c){return c.role;}).join("|"), logins: logins.length && logins.every(function(x){return x;}),' +
      ' map: [map.name, map.role, map.id].join("|"), uniq: new Set(r.creds.map(function(c){return c.username;})).size };');
    ok(imp.added === 3 && imp.uniq === 3, 'الحيّ: استيراد ٣ موظفين من صفوف Excel', JSON.stringify(imp));
    ok(imp.logins === true, 'الحيّ: كل حساب مستورد يسجّل الدخول فعلًا');
    ok(/موجّه/.test(imp.roles), 'الحيّ: الدور قُرئ من الملف', imp.roles);
    ok(imp.map.split('|').every(Boolean), 'الحيّ: تعرّف تلقائي على الأعمدة العربية', imp.map);

    await page.eval('UI.passwordSheet(window.__creds, { title: "حسابات المستوردين" }); return true;');
    await B.sleep(900);
    const sheet = await page.eval('var t=document.body.innerText; return { title:t.indexOf("حسابات المستوردين")>-1, csv:t.indexOf("تنزيل CSV")>-1, print:t.indexOf("طباعة كشف بالتوقيعات")>-1, uname:t.indexOf(window.__creds[0].username)>-1, pw:t.indexOf(window.__creds[0].password)>-1 };');
    ok(sheet.title && sheet.csv && sheet.print && sheet.uname && sheet.pw, 'الحيّ: كشف كلمات المرور يعرض الأسماء والكلمات مع التنزيل والطباعة', JSON.stringify(sheet));

    await page.eval('var b=[].slice.call(document.querySelectorAll("button, .icon-btn, [role=button]")).filter(function(x){return (x.innerText||"").indexOf("×")>-1 || (x.getAttribute("aria-label")||"")==="إغلاق";})[0]; if(b) b.click(); return true;');
    await B.sleep(500);
    await page.eval('App.go("users"); return true;'); await B.sleep(1200);
    const panel = await page.eval('var t=document.querySelector("#view").innerText; return { p:t.indexOf("استيراد موظفين من Excel")>-1, btn:t.indexOf("اختر ملف Excel")>-1, send:t.indexOf("تسليم الحسابات")>-1 };');
    ok(panel.p && panel.btn && panel.send, 'الحيّ: لوحة الاستيراد + تسليم الحسابات في وحدة «الحسابات»', JSON.stringify(panel));

    const errs = await B.pageErrors(page);
    ok(errs.length === 0, 'الحيّ: صفر أخطاء JS', (errs[0] || '').slice(0, 120));
  } finally { page.close(); chrome.close(); }
  const bad = rows.filter(r => !r[0]).length;
  console.log('\n-- المجموع: ' + rows.length + ' | فاشلة: ' + bad + ' --\n');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('FAIL ' + ((e && e.message) || e)); process.exitCode = 1; });
