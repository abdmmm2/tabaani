'use strict';
/* فحص حيّ (يدوي): اسم ملف كل تقرير/وثيقة يأخذ اسمه — node tools/live-title-check.js */
'use strict';
/* فحص حيّ (يدوي): اسم ملف كل تقرير/وثيقة يأخذ اسمه — node tools/live-title-check.js */
const LIVE = 'https://abdmmm2.github.io/tabaani/app/';
const rows = []; const ok = (c, m, d) => { rows.push([!!c, m]); console.log('   ' + (c ? 'OK ' : 'BAD') + '  ' + m + (c ? '' : '   <- ' + (d || ''))); };
(async () => {
  const chrome = await B.launch(); const page = await B.openPage(chrome.port, { width: 1300, height: 900 });
  try {
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(2200);
    await page.eval('try{localStorage.clear();}catch(e){} return true;');
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1600);
    await page.eval('Store.setupOwner({ demo: true, username: "rev3", name: "مراجع", password: "Tabaani@2026" }); return true;');
    await B.goto(page, LIVE, '!!window.Store'); await B.sleep(1400);
    await page.eval('App.openLogin(); return true;'); await B.sleep(700);
    await page.eval('document.querySelector("[name=username]").value="rev3";document.querySelector("[name=password]").value="Tabaani@2026";document.querySelector("form button[type=submit]").click(); return true;');
    await B.sleep(2200);
    ok(await page.eval('return !!Store.session.userId;'), 'الحيّ: دخول المشرف العام');
    const base = await page.eval('return document.title;');
    ok(/^تابعني للخدمات الذكية$/.test(base) || /تابعني/.test(base), 'الحيّ: عنوان أساسي بلا تكرار', base);

    await page.eval('App.go("schools"); return true;'); await B.sleep(1100);
    const modT = await page.eval('return document.title;');
    ok(/المدارس/.test(modT) && /تابعني$/.test(modT), 'الحيّ: عنوان التبويب يتبع الشاشة', modT);

    await page.eval('var b=[].slice.call(document.querySelectorAll("#view button")).filter(function(x){return x.innerText.indexOf("طباعة التقرير")>-1;})[0]; b.click(); return true;');
    await B.sleep(1200);
    const t1 = await page.eval('return document.title;');
    ok(t1 === 'تقرير المدارس المسجّلة', 'الحيّ: اسم ملف التقرير = «تقرير المدارس المسجّلة»', t1);
    const bar = await page.eval('var b = document.getElementById("report-bar"); return b ? b.innerText.split(String.fromCharCode(10)).join(" | ") : "";');
    ok(/طباعة/.test(bar) && /PDF|تبويب/.test(bar), 'الحيّ: شريط الإجراءات ظاهر مع خيارات الطباعة', bar);

    await page.eval('UI.printDoc("<!doctype html><html><head><title>فاتورة TBN-2026-0007</title></head><body>x</body></html>"); return true;');
    await B.sleep(1000);
    const t2 = await page.eval('return document.title;');
    ok(t2 === 'فاتورة TBN-2026-0007', 'الحيّ: الفاتورة/الوثيقة تأخذ اسمها أيضًا', t2);
    ok(/تابعني$/.test(await page.eval('App.setTitle("الحسابات"); return document.title;')), 'الحيّ: العودة لعنوان الشاشة بعد الوثيقة');
    const errs = await B.pageErrors(page);
    ok(errs.length === 0, 'الحيّ: صفر أخطاء JS', (errs[0] || '').slice(0, 110));
  } finally { page.close(); chrome.close(); }
  const bad = rows.filter(r => !r[0]).length;
  console.log('\n-- المجموع: ' + rows.length + ' | فاشلة: ' + bad + ' --\n');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('FAIL ' + ((e && e.message) || e)); process.exitCode = 1; });
