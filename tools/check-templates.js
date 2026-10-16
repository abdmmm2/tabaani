'use strict';
/* ==========================================================================
   فحص ملفات القوالب فعليًا: تُقرأ بـ SheetJS ثم تُمرَّر إلى محرك التأسيس في المنصة
   التشغيل: node tools/check-templates.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const B = require('./browser');
const XLSX = require(path.join(__dirname, '..', 'app', 'assets', 'js', 'vendor', 'xlsx.full.min.js'));

const TPL = path.join(__dirname, '..', 'templates');
const rowsOf = (f) => {
  const wb = XLSX.read(fs.readFileSync(path.join(TPL, f)), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
};

(async () => {
  const classes = rowsOf('قالب-الفصول.xlsx');
  const staff = rowsOf('قالب-المعلمين.xlsx');
  const students = rowsOf('قالب-الطلاب.xlsx');
  const rows = []; const ok = (c, m, d) => { rows.push([!!c, m]); console.log('   ' + (c ? 'OK ' : 'BAD') + '  ' + m + (c ? '' : '   <- ' + (d || ''))); };

  const site = await B.serve(path.join(__dirname, '..', 'app'));
  const chrome = await B.launch();
  const page = await B.openPage(chrome.port, { width: 1200, height: 800 });
  try {
    await B.goto(page, site.url + '/index.html', '!!window.Store'); await B.sleep(800);
    await page.eval('Store.setupOwner({ demo: true, username: "tpl1", name: "مراجع القوالب", password: "Tabaani@2026" }); return true;');
    await B.goto(page, site.url + '/index.html', '!!window.Store'); await B.sleep(800);

    const payload = JSON.stringify({ classes, staff, students });
    const out = await page.eval(
      'var d = ' + payload + ';' +
      'var mC = Store.guessClassMap(Object.keys(d.classes[0]));' +
      'var mS = Store.guessStaffMap(Object.keys(d.staff[0]));' +
      'var mT = Store.guessStudentMap(Object.keys(d.students[0]));' +
      'var r = Store.onboardSchool({ school: { name: "مدرسة القوالب", regionName: "منطقة القوالب", city: "مدينة القوالب", gender: "boys", stages: ["middle","secondary"], plan: "pro" }, principal: { name: "مدير القوالب" } },' +
      '  { classes: { rows: d.classes, map: mC }, staff: { rows: d.staff, map: mS }, students: { rows: d.students, map: mT } });' +
      'var ks = Store.list("classes", { schoolId: r.schoolId });' +
      'var logins = r.creds.map(function (c) { return Store.authenticate(c.username, c.password).ok; });' +
      'return { ok: r.ok, warning: r.warnings, classes: r.stats.classes, staff: r.stats.staff, students: r.stats.students,' +
      ' creds: r.stats.credentials, mappedC: Object.keys(mC).filter(function (k) { return mC[k]; }).length,' +
      ' mappedS: Object.keys(mS).filter(function (k) { return mS[k]; }).length, mappedT: Object.keys(mT).filter(function (k) { return mT[k]; }).length,' +
      ' stageIds: ks.map(function (k) { return k.stage + ":" + k.grade + ":" + k.section + ":" + (k.students || 0); }).join(" | "),' +
      ' allLogin: logins.length > 0 && logins.every(function (x) { return x; }) };');

    ok(out.mappedC === 4, 'أعمدة ملف الفصول تُتعرَّف كلها (مرحلة · صف · شعبة · غرفة)', 'mapped=' + out.mappedC);
    ok(out.mappedS === 7, 'أعمدة ملف المعلمين تُتعرَّف كلها (٧ أعمدة)', 'mapped=' + out.mappedS);
    ok(out.mappedT >= 6, 'أعمدة ملف الطلاب تُتعرَّف (الاسم · الهوية · الجوال · المرحلة · الصف · الشعبة)', 'mapped=' + out.mappedT);
    ok(out.ok && out.classes === 5 && out.staff === 5 && out.students === 6, 'التأسيس من القوالب: ٥ فصول · ٥ موظفين · ٦ طلاب', JSON.stringify(out));
    ok(out.creds >= 6 && out.allLogin, 'كل حسابات القالب (مدير + ٥ موظفين) تسجّل الدخول فعلًا', 'creds=' + out.creds);
    ok(/middle:الأول المتوسط:أ:3/.test(out.stageIds) && /secondary:الأول الثانوي:ب:0/.test(out.stageIds), 'الصفوف والشعب وعدّادات الطلاب صحيحة (٦ طلاب موزّعين)', out.stageIds);
    const badWarn = (out.warning || []).filter((w) => /تُخطّي|لا فصول|لا موظفون|بلا صف/.test(w));
    ok(badWarn.length === 0, 'بلا تحذيرات بيانات عند التأسيس من القوالب', JSON.stringify(out.warning));
  } finally { page.close(); chrome.close(); site.close(); }

  const bad = rows.filter((r) => !r[0]).length;
  console.log('\n-- المجموع: ' + rows.length + ' | فاشلة: ' + bad + ' --\n');
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error('FAIL ' + ((e && e.message) || e)); process.exitCode = 1; });
