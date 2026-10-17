#!/usr/bin/env node
/* =============================================================================
   tools/check-cloud.js — فحوص المرحلة الثانية (Cloudflare) بلا شبكة وبلا مكتبات
   -----------------------------------------------------------------------------
   يفحص منطق cloud/lib.js (نفس الملف الذي يعمل داخل Worker):
     ١) التحقق من تسجيل مدرسة (حقول صحيحة/خاطئة · جوال · بريد · مراحل).
     ٢) كلمات المرور: PBKDF2 — التجزئة والتحقق (والرفض لكلمة خاطئة).
     ٣) رموز الجلسات: التوقيع والتحقق (ورفض التلاعب/الانتهاء).
     ٤) أكواد التفعيل: ٦ أرقام · صلاحية ١٥ دقيقة · ٣ محاولات · تجزئة.
     ٥) **البحث المحصور بالصلاحية على الخادم**: مشرف عام (الكل) · مدير (مدرسته فقط) ·
        معلم (فصوله فقط — ولا يرى أي مستخدم آخر).
     ٦) ملفات المشروع: schema.sql (الجداول الأساسية) · worker.js (كل المسارات) · wrangler.
   التشغيل: node tools/check-cloud.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fails = [];
let pass = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fails.push(label); console.log('  ✗ ' + label + (extra ? '  ' + extra : '')); }
}

(async () => {
  const lib = await import('file://' + path.join(ROOT, 'cloud', 'lib.js'));
  console.log('\n══ فحوص المرحلة الثانية — Cloudflare ══\n');

  /* ---------------------------------------------------------------- ١) التسجيل */
  const good = lib.validateRegistration({
    schoolName: 'ثانوية الأصدقاء', region: 'الرياض', city: 'الرياض',
    stages: ['متوسط', 'ثانوي'], gender: 'boys', plan: 'pro',
    principalName: 'خالد العتيبي', phone: '٠٥٥١٢٣٤٥٦٧', email: 'KLAD@Example.COM'
  });
  ok(good.ok && good.data.phone === '0551234567' && good.data.email === 'klad@example.com' && good.data.plan === 'pro',
    'تسجيل صحيح يُقبل وتُنظّف بياناته (الجوال العربي → أرقام، البريد lowercase)', JSON.stringify({ phone: good.data.phone, email: good.data.email }));

  const bad = lib.validateRegistration({ schoolName: 'أ', region: '', city: '', stages: [], gender: '', principalName: '', phone: '123', email: 'x' });
  ok(!bad.ok && bad.errors.schoolName && bad.errors.region && bad.errors.stages && bad.errors.gender && bad.errors.phone && bad.errors.email,
    'التسجيل الناقص يُرفض بحقول أخطاء محدّدة', Object.keys(bad.errors).join(','));

  const badPlan = lib.validateRegistration({ schoolName: 'مدرسة', region: 'جدة', city: 'جدة', stages: ['ابتدائي'], gender: 'girls', principalName: 'نورة', phone: '0500000000', email: 'a@b.com', plan: 'hack' });
  ok(badPlan.data.plan === 'classic', 'الباقة غير المعروفة تُصحّح إلى «classic» (لا يُثق بالمدخلات)', badPlan.data.plan);

  /* ------------------------------------------------------- ٢) كلمات المرور */
  const h = await lib.hashPassword('Tabaani@2026');
  const packed = lib.packPassword(h);
  ok(await lib.verifyPassword('Tabaani@2026', packed) === true, 'كلمة المرور الصحيحة تُتحقّق (PBKDF2)');
  ok(await lib.verifyPassword('Tabaani@2027', packed) === false, 'كلمة المرور الخاطئة تُرفض');
  ok(h.iter === 100000 && packed.startsWith('pbkdf2$100000$') && packed.split('$').length === 4,
    'التخزين بصيغة pbkdf2$iter$salt$hash (لا كلمة مرور صريحة)', packed.slice(0, 22) + '…');
  const tmp = lib.tempPassword();
  ok(tmp.length >= 8 && /[A-Z]/.test(tmp) && /[0-9]/.test(tmp) && /[@#$%]/.test(tmp), 'كلمة المرور المؤقتة قوية', tmp);

  /* --------------------------------------------------------- ٣) رموز الجلسات */
  const SECRET = 'test-secret-123';
  const tok = await lib.signToken({ uid: 'u1', role: 'teacher', schoolId: 's1' }, SECRET, 60);
  const v = await lib.verifyToken(tok, SECRET);
  ok(v && v.uid === 'u1' && v.role === 'teacher', 'رمز الجلسة يُوقَّع ويُتحقّق', tok.slice(0, 18) + '…');
  ok((await lib.verifyToken(tok, 'other-secret')) === null, 'رمز مُوقَّع بسرّ آخر يُرفض');
  ok((await lib.verifyToken(tok.split('.')[0] + '.AAAA', SECRET)) === null, 'التلاعب بالتوقيع يُرفض');
  const expired = await lib.signToken({ uid: 'u1' }, SECRET, -10);
  ok((await lib.verifyToken(expired, SECRET)) === null, 'الرمز المنتهي يُرفض');

  /* ------------------------------------------------------- ٤) أكواد التفعيل */
  const code = lib.genCode();
  const codeMax = lib.genCode(() => 0.9999999);
  const codeMin = lib.genCode(() => 0);
  ok(/^\d{6}$/.test(code) && codeMax === '999999' && codeMin === '100000',
    'كود التفعيل ٦ أرقام دائمًا (100000–999999)', code + ' · ' + codeMin + '–' + codeMax);
  const hc = await lib.hashCode('123456', 'a@b.com');
  ok(hc.length > 20 && hc !== (await lib.hashCode('123456', 'other@b.com')),
    'الكود يُخزَّن مُجزَّأً ومرتبطًا بالبريد (لا يُحفظ صريحًا)');
  const exp = lib.codeExpiry(15, 1_700_000_000_000);
  ok(exp === 1_700_000_000 + 15 * 60 && lib.MAX_CODE_TRIES === 3, 'الصلاحية ١٥ دقيقة والمحاولات ٣', 'exp=' + exp);

  /* ------------------------------- ٥) البحث المحصور بالصلاحية (على الخادم) */
  const dataset = {
    schools: [{ id: 's1', name: 'ثانوية الأصدقاء' }, { id: 's2', name: 'متوسطة النخبة' }],
    users: [
      { id: 'u-t1', name: 'محمد المعلم', role: 'teacher', schoolId: 's1', classIds: ['k1'] },
      { id: 'u-t2', name: 'سعد الآخر', role: 'teacher', schoolId: 's1', classIds: ['k2'] },
      { id: 'u-p1', name: 'خالد المدير', role: 'principal', schoolId: 's1' },
      { id: 'u-p2', name: 'مدير آخر', role: 'principal', schoolId: 's2' }
    ],
    classes: [
      { id: 'k1', schoolId: 's1', grade: 'أول', section: 'أ', supervisorId: 'u-t1' },
      { id: 'k2', schoolId: 's1', grade: 'ثاني', section: 'ب', supervisorId: 'u-t2' },
      { id: 'k9', schoolId: 's2', grade: 'ثالث', section: 'ج' }
    ],
    students: [
      { id: 'st1', schoolId: 's1', classId: 'k1', name: 'محمد عبدالله النفيعي' },
      { id: 'st2', schoolId: 's1', classId: 'k2', name: 'محمد سعد الآخر' },
      { id: 'st9', schoolId: 's2', classId: 'k9', name: 'محمد من مدرسة أخرى' }
    ]
  };
  const sup = lib.scopedSearch({ id: 'sup', role: 'super' }, 'محمد', dataset);
  const supSch = lib.scopedSearch({ id: 'sup', role: 'super' }, 'ثانوية', dataset);
  const supSchItems = (supSch.groups.find((g) => g.label === 'المدارس') || { items: [] }).items;
  ok(sup.scope === 'all' && sup.total === 4 && sup.groups.some((g) => g.label === 'الطلاب') && supSchItems.length === 1,
    'المشرف العام: بحث شامل يرى كل المدارس وكل الصفوف', 'total=' + sup.total + ' · مدارس=' + supSchItems.length);
  const prin = lib.scopedSearch({ id: 'u-p1', role: 'principal', schoolId: 's1' }, 'محمد', dataset);
  const prinRows = prin.groups.reduce((a, g) => a.concat(g.items), []);
  ok(prin.scope === 'school' && !prin.groups.some((g) => g.label === 'المدارس') &&
    prinRows.every((r) => !r.schoolId || r.schoolId === 's1'),
    'مدير المدرسة: مدرسته فقط — ولا نتائج من مدرسة أخرى', 'rows=' + prinRows.length);
  const tch = lib.scopedSearch({ id: 'u-t1', role: 'teacher', schoolId: 's1' }, '', dataset);
  ok(tch.total === 0, 'البحث الفارغ لا يُرجع شيئًا', 'total=' + tch.total);
  const tch2 = lib.scopedSearch({ id: 'u-t1', role: 'teacher', schoolId: 's1' }, 'محمد', dataset);
  const tchRows = tch2.groups.reduce((a, g) => a.concat(g.items), []);
  const onlyMine = tchRows.filter((r) => r.kind === 'student').every((r) => r.id === 'st1');
  const noOthers = tchRows.filter((r) => r.kind === 'user').every((r) => r.id === 'u-t1');
  ok(tch2.scope === 'self' && onlyMine && noOthers && tchRows.length > 0,
    'المعلم: طلاب فصوله فقط ولا يرى أي مستخدم آخر', JSON.stringify({ rows: tchRows.length, onlyMine, noOthers }));

  /* --------------------- ٦) دمج تكرار المستخدمين (محلي/سحابي) --------------------- */
  const dup = {
    users: [
      { id: 'u-legacy-teacher', username: 't3210', name: 'أ. هند', role: 'deputy', schoolId: 's1', email: 'hind@school', createdAt: '2026-10-16T07:24:47Z', ack: { status: 'approved' } },
      { id: 'u_server-teacher', username: 'T3210', name: 'أ. هند', role: 'deputy', schoolId: 's1', createdAt: 1792244391623, ack: { status: 'submitted' } },
      { id: 'u-one', username: 'unique', name: 'وحيد', role: 'teacher', schoolId: 's1' }
    ],
    assignments: [{ id: 'a1', teacherId: 'u-legacy-teacher', subject: 'رياضيات' }],
    sessions: [{ id: 'x1', teacherId: 'u_server-teacher', records: [{ studentId: 'st1', by: 'u-legacy-teacher' }] }],
    classrooms: [{ id: 'c1', teacherId: 'u-legacy-teacher' }]
  };
  const dres = lib.dedupeUsers(dup, 'u_server-teacher');
  ok(dup.users.length === 2 && dres.merged === 1 && dup.users.some((u) => u.id === 'u_server-teacher') &&
    dup.users.filter((u) => (u.username || '').toLowerCase() === 't3210').length === 1,
    'تكرار اسم المستخدم يُدمج في سجل واحد ويُفضّل معرّف الجلسة/الخادم', JSON.stringify({ left: dup.users.length, merged: dres.merged }));
  ok(dup.assignments[0].teacherId === 'u_server-teacher' && dup.sessions[0].records[0].by === 'u_server-teacher' &&
    dup.classrooms[0].teacherId === 'u_server-teacher',
    'كل المراجع القديمة (إسناد · حضور · فصل) تُحوَّل إلى المعرّف الباقي');
  ok(dup.users[0].ack && dup.users[0].ack.status === 'approved',
    'حالة الإقرار الأقوى (approved) تبقى بعد الدمج', dup.users[0].ack && dup.users[0].ack.status);
  const again = lib.dedupeUsers(dup, 'u_server-teacher');
  ok(again.merged === 0, 'الدمج آمن للتكرار (idempotent) — لا يغيّر شيئًا في المرة الثانية');

  /* ----------------------------------------------------- ٧) ملفات المشروع */
  /* المخطط المدمج + التهيئة الذاتية */
  const { execFileSync: exf } = require('child_process');
  try {
    exf(process.execPath, [path.join(ROOT, 'tools', 'build-cloud.js')], { stdio: 'pipe' });
    const inline = fs.readFileSync(path.join(ROOT, 'cloud', 'schema-inline.js'), 'utf8');
    const sql = fs.readFileSync(path.join(ROOT, 'cloud', 'schema.sql'), 'utf8');
    ok(/export const SCHEMA_SQL/.test(inline) && /export function schemaStatements/.test(inline),
      'schema-inline مُولَّد (SCHEMA_SQL + schemaStatements)');
    const tables = (sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || []).map((m) => m.split(' ').pop());
    const missT = tables.filter((t) => inline.indexOf('CREATE TABLE IF NOT EXISTS ' + t) === -1);
    ok(missT.length === 0, 'كل جداول schema.sql داخل المخطط المدمج (' + tables.length + ')', missT.join(', '));
  } catch (e) { ok(false, 'توليد/فحص المخطط المدمج', e.message); }
  const wk = fs.readFileSync(path.join(ROOT, 'cloud', 'worker.js'), 'utf8');
  ok(/async function ensureSchema/.test(wk) && /'\/api\/init'/.test(wk) && /from '\.\/schema-inline\.js'/.test(wk),
    'الخادم ينشئ جداوله تلقائيًا (ensureSchema + /api/init)');
  const singleW = fs.readFileSync(path.join(ROOT, 'cloud', 'worker-single.js'), 'utf8');
  ok(/const SCHEMA_SQL/.test(singleW) && /async function ensureSchema/.test(singleW) && singleW.indexOf('import ') === -1,
    'الملف المدموج يشمل المخطط والتهيئة وبلا استيراد');

  const schema = fs.readFileSync(path.join(ROOT, 'cloud', 'schema.sql'), 'utf8');
  ['registrations', 'activation_codes', 'reset_codes', 'schools', 'users', 'data', 'outbox', 'audit'].forEach((t) => {
    ok(new RegExp('CREATE TABLE IF NOT EXISTS ' + t + '\\b').test(schema), 'schema.sql فيه جدول ' + t);
  });
  const worker = fs.readFileSync(path.join(ROOT, 'cloud', 'worker.js'), 'utf8');
  ['/api/register', '/api/activation/verify', '/api/auth/login', '/api/auth/forgot', '/api/auth/reset', '/api/ack/submit', '/api/ack/approve',
    '/api/sync', '/api/search', '/api/admin/approve', '/api/admin/provision', '/api/notify'].forEach((r) => {
    ok(worker.indexOf(r) > -1, 'worker.js فيه المسار ' + r);
  });
  ok(/handleForgot/.test(worker) && /reset_codes/.test(worker), 'استعادة كلمة المرور: الدالة والجدول موجودان');
  ok(/hashCode\(code, user\.email\)/.test(worker), 'رمز الاستعادة يُخزَّن مُجزَّأً (لا نص صريح)');
  ok(/٣ طلبات|>= 3/.test(worker) && /60_000/.test(worker), 'حدود إرسال: ٣/ساعة ومهلة ٦٠ ثانية');
  ok(/إن كان الحساب مسجّلًا ببريد/.test(worker), 'الرد عام لا يكشف وجود الحساب');
  ok(/UPDATE reset_codes SET used = 1/.test(worker), 'إبطال الأكواد السابقة عند طلب جديد');
  ok(/token_version/.test(worker) && /token_version/.test(fs.readFileSync(path.join(ROOT, 'cloud', 'schema.sql'), 'utf8')),
    'إبطال الجلسات بعد تغيير كلمة المرور (token_version)');
  ok(/MAX_CODE_TRIES/.test(worker), 'حد المحاولات (٣) مطبَّق عند التحقق');
  ok(/handleProvision/.test(worker) && /ctx\.user\.role !== 'super'/.test(worker), 'تجهيز الحسابات السحابية للمشرف العام فقط');
  ok(/App\.forgotCloud/.test(fs.readFileSync(path.join(ROOT, 'app', 'assets', 'js', 'modules', 'sync.js'), 'utf8')),
    'شاشة الاستعادة متصلة بالمسار السحابي');
  ok(/MAIL_ENDPOINT/.test(worker) && /TG_TOKEN/.test(worker) && /TOKEN_SECRET/.test(worker),
    'الخادم يقرأ الأسرار من البيئة (لا توكنات في الكود)');
  ok(!/password\s*:\s*['"][^'"]+['"]/.test(worker) && !/Tabaani@2026/.test(worker),
    'لا كلمات مرور مثبّتة في كود الخادم');
  const pub = fs.readFileSync(path.join(ROOT, 'cloud', 'public', 'index.html'), 'utf8');
  ok(/api\/register/.test(pub) && /api\/activation\/verify/.test(pub) && /dir="rtl"/.test(pub),
    'الصفحة العامة: نموذج تسجيل + كود تفعيل + RTL');
  ok(/location\.origin/.test(pub) && /get\('api'\)/.test(pub),
    'الصفحة العامة تكتشف رابط الخادم تلقائيًا (وتقبل ?api=)');
  const reg = fs.readFileSync(path.join(ROOT, 'site', 'register.html'), 'utf8');
  ok(/api\/register/.test(reg) && /tabaani-cloud-url/.test(reg),
    'نسخة GitHub Pages: تسجيل عام + خانة رابط الخادم المحفوظة في المتصفح');
  /* الملف المدموج للنشر من اللوحة (بلا توكن) — نتحقق أنه محدَّث ولا يتخلّف عن المصدر */
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-worker-single.js')], { stdio: 'pipe' });
    const single = fs.readFileSync(path.join(ROOT, 'cloud', 'worker-single.js'), 'utf8');
    const libSrc = fs.readFileSync(path.join(ROOT, 'cloud', 'lib.js'), 'utf8');
    const workerSrc = fs.readFileSync(path.join(ROOT, 'cloud', 'worker.js'), 'utf8');
    ok(single.indexOf('export default') > -1 && single.indexOf('scopedSearch') > -1 && single.indexOf('/api/register') > -1 &&
      single.indexOf('import ') === -1,
      'الملف المدموج worker-single.js صالح للنشر من اللوحة (بلا استيراد)');
    const libFns = (libSrc.match(/export (?:async )?function (\w+)/g) || []).map((m) => m.split(' ').pop());
    const missingFns = libFns.filter((f) => single.indexOf('function ' + f) === -1);
    ok(missingFns.length === 0, 'كل دوال lib.js موجودة في الملف المدموج (' + libFns.length + ')', missingFns.join(', '));
    const routes = (workerSrc.match(/'\/api\/[a-z\/]+'/g) || []).filter((v, i, a) => a.indexOf(v) === i);
    const missingRoutes = routes.filter((r) => single.indexOf(r) === -1);
    ok(missingRoutes.length === 0, 'كل مسارات الخادم موجودة في الملف المدموج (' + routes.length + ')', missingRoutes.join(', '));
  } catch (e) { ok(false, 'توليد/فحص الملف المدموج', e.message); }

  const wr = fs.readFileSync(path.join(ROOT, 'cloud', 'wrangler.toml'), 'utf8');
  ok(/d1_databases/.test(wr) && /\[\[d1_databases\]\]/.test(wr), 'wrangler.toml فيه ربط قاعدة D1');

  console.log('\n  الفحوص: ' + (pass + fails.length) + ' · فاشلة: ' + fails.length + '\n');
  if (fails.length) { console.log('  ✗ فحوص فاشلة:'); fails.forEach((f) => console.log('    - ' + f)); process.exit(1); }
  console.log('  ✅ منطق المرحلة الثانية سليم.\n');
})().catch((e) => { console.error('\n✗ تعذّر الفحص: ' + (e && e.message || e)); process.exit(1); });
