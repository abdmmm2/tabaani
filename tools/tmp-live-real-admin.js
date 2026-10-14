'use strict';
/* فحص حيّ: تهيئة «مدرسة حقيقية» على المنصة الحيّة وتجربة المميزات */
const B = require('/home/user/.workspace/projects/tabaani/tools/browser');
const LIVE = 'https://abdmmm2.github.io/tabaani/app/';
const U = 'abdullah.a', P = 'Tabaani#2026';
const rows = [];
const ok = (c, m, d) => { rows.push([!!c, m, d || '']); console.log('   ' + (c ? 'OK ' : 'BAD') + '  ' + m + (c ? '' : '   <- ' + (d || ''))); };

(async () => {
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port, { width: 1400, height: 1000 });
  try {
    await B.goto(page, LIVE, '!!window.Store');
    await B.sleep(2200);
    await page.eval('try{localStorage.clear();}catch(e){} return true;');
    await B.goto(page, LIVE, '!!window.Store');
    await B.sleep(2000);
    ok(await page.eval('return !!Store.needsSetup();'), 'جهاز جديد: المنصة تطلب إنشاء مشرف عام');

    /* مسار ١: أيقونة الدخول ← نافذة ← «إنشاء حساب المشرف العام» */
    await page.eval('App.openLogin(); return true;');
    await B.sleep(900);
    const modal = await page.eval('return document.body.innerText.indexOf("إنشاء حساب المشرف العام")>-1;');
    ok(modal, 'أيقونة الدخول تعرض زر «إنشاء حساب المشرف العام» منبثقًا');
    await page.eval('var b=[].filter.call(document.querySelectorAll("button"),function(x){return x.textContent.indexOf("إنشاء حساب المشرف العام")>-1;})[0]; b.click(); return true;');
    await B.sleep(1200);
    const s1 = await page.eval('var t=document.body.innerText; return { radios:document.querySelectorAll("input[name=setupMode]").length, real:t.indexOf("مدرسة حقيقية")>-1, plan:t.indexOf("الباقة والرسوم")>-1, fee:t.indexOf("رسم التأسيس")>-1, fields:document.querySelectorAll(".form-grid input").length };');
    ok(s1.radios === 2 && s1.real, 'شاشة التهيئة: «مدرسة حقيقية — ابدأ من الصفر» أو «بيانات عرض تجريبية»', JSON.stringify(s1));
    ok(s1.plan && s1.fee && s1.fields >= 5, 'التهيئة: اختيار الباقة + رسم التأسيس 1000 + ٥ حقول للحساب', JSON.stringify({ plan: s1.plan, fee: s1.fee, fields: s1.fields }));

    /* اختيار الحقيقي + باقة برو (لتجربة كل المميزات) */
    await page.eval(
      'var rs=[].slice.call(document.querySelectorAll("input[name=setupMode]"));' +
      'var i=rs.filter(function(r){return (r.parentElement.innerText||"").indexOf("مدرسة حقيقية")>-1;})[0];' +
      'i.checked=true; i.dispatchEvent(new Event("change",{bubbles:true})); return rs.length;');
    await B.sleep(400);
    const hidden = await page.eval('var l=document.querySelector(".checkline"); return { adminHidden: !document.body.innerText.includes("حساب المشرف العام التجريبي") };');
    ok(hidden.adminHidden, 'في المدرسة الحقيقية يختفي خيار حساب المشرف التجريبي (لا باب خلفي)', JSON.stringify(hidden));

    const proPicked = await page.eval('var c=[].filter.call(document.querySelectorAll(".plan-card"),function(x){return x.innerText.indexOf("برو")>-1;})[0]; if(c){c.click(); return c.innerText.replace(/\\n/g," ").slice(0,40);} return "none";');
    ok(/برو/.test(String(proPicked)), 'اختيار باقة «برو» (كل المميزات + تلقرام)', String(proPicked));

    await page.eval(
      'var ins=document.querySelectorAll(".form-grid input");' +
      'var v=["عبدالله المشرف", ' + JSON.stringify(U) + ', ' + JSON.stringify(U + '@school.sa') + ', ' + JSON.stringify(P) + ', ' + JSON.stringify(P) + '];' +
      'for (var n=0;n<ins.length;n++) if (v[n]!==undefined) ins[n].value=v[n]; return ins.length;');
    await page.eval('var b=[].filter.call(document.querySelectorAll("button"),function(x){return x.textContent.indexOf("إنشاء الحساب والبدء")>-1;})[0]; b.click(); return true;');
    await B.sleep(2600);

    const st = await page.eval('return { nav:document.querySelectorAll(".side-nav a[data-mod]").length, users:Store.list("users").map(function(u){return u.username+":"+u.role;}).join(","), schools:Store.list("schools").length, students:Store.list("students").length, demo:Store.db.meta.demo, role:(Store.session||{}).role, plan:(Store.db.meta.setupPlan||{}).plan, fee:(Store.db.meta.setupPlan||{}).setupPaid, logs:Store.list("telegram").length };');
    ok(st.nav >= 9 && st.role === 'super', 'دخل مباشرة كمشرف عام بكل الوحدات', 'nav=' + st.nav + ' role=' + st.role);
    ok(st.users === U + ':super' && st.schools === 0 && st.students === 0 && st.demo === false, 'قاعدة بيانات حقيقية نظيفة — لا بيانات ولا حسابات تجريبية', st.users + ' | schools=' + st.schools + ' | students=' + st.students);
    ok(st.plan === 'pro' && st.fee === true, 'حُفظت الباقة (برو) وحالة سداد رسم التأسيس', JSON.stringify({ plan: st.plan, fee: st.fee }));

    /* الخطوة التالية: إنشاء المدرسة من وحدة المدارس */
    await page.eval('App.go("schools"); return true;');
    await B.sleep(1100);
    const sch = await page.eval('var v=document.querySelector("#view"); var t=v?v.innerText:""; return { ok:t.length>50, add:t.indexOf("أضف")>-1||t.indexOf("إضافة")>-1, regions:t.indexOf("منطقة")>-1||t.indexOf("مدينة")>-1 };');
    ok(sch.ok && sch.add, 'وحدة المدارس جاهزة لإنشاء مدرستك الحقيقية', JSON.stringify(sch));

    await page.eval('Store.logout(); return true;');
    await B.goto(page, LIVE, '!!window.Store');
    await B.sleep(1600);
    await page.eval('App.openLogin(); return true;');
    await B.sleep(800);
    await page.eval('document.querySelector("[name=username]").value=' + JSON.stringify(U) + ';document.querySelector("[name=password]").value=' + JSON.stringify(P) + ';document.querySelector("form button[type=submit]").click(); return true;');
    await B.sleep(2500);
    const st2 = await page.eval('return { nav:document.querySelectorAll(".side-nav a[data-mod]").length, otp:!!document.querySelector("[name=otpCode]"), role:(Store.session||{}).role };');
    ok(st2.nav >= 9 && st2.role === 'super' && !st2.otp, 'خروج ثم دخول بكلمة مرورك مباشرة (بلا رمز تحقق للمشرف العام)', JSON.stringify(st2));

    const errs = await B.pageErrors(page);
    ok(errs.length === 0, 'صفر أخطاء JS في الرحلة كاملة', (errs[0] || '').slice(0, 130));
  } finally { page.close(); chrome.close(); }
  const bad = rows.filter(r => !r[0]).length;
  console.log('\n-- المجموع: ' + rows.length + ' | فاشلة: ' + bad + ' --\n');
  process.exitCode = bad ? 1 : 0;
})().catch(e => { console.error('FAIL ' + ((e && e.message) || e)); process.exitCode = 1; });
