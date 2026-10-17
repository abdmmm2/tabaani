/* ==========================================================================
   تابعني — Worker (Cloudflare) — المرحلة الثانية
   --------------------------------------------------------------------------
   المسارات:
     GET  /                     → صفحة التسجيل العامة (من public/index.html)
     POST /api/register         → تسجيل مدرسة جديدة (واجهة عامة) + إرسال كود تفعيل
     POST /api/activation/request → إعادة إرسال الكود (محدود زمنيًا)
     POST /api/activation/verify  → التحقق من الكود (٣ محاولات ثم إلغاء) → يفتح الحساب
     POST /api/auth/login       → دخول حقيقي (PBKDF2) → رمز جلسة
     GET  /api/me               → بيانات الحساب + حالة الإقرار
     POST /api/ack/submit       → إرسال الإقرار (يُقفل الحساب حتى اعتماد المدير/المشرف)
     POST /api/ack/approve      → اعتماد الإقرار (مدير المدرسة/المشرف العام بحسب الدور)
     GET  /api/sync             → أحدث نسخة بيانات المدرسة + الإصدار
     PUT  /api/sync             → رفع نسخة جديدة (مقارنة الإصدارات — لا كتابة فوق الأحدث)
     GET  /api/search?q=        → **بحث محصور بالصلاحية على الخادم**
     GET  /api/admin/requests   → طلبات التسجيل (المشرف العام)
     POST /api/admin/approve    → اعتماد طلب + إنشاء المدرسة والمدير وكلمة مرور مؤقتة
     POST /api/notify           → إرسال تلقرام/إيميل عبر النقطة المربوطة (Apps Script) — بلا نجاح كاذب

   البيئة المطلوبة (wrangler secrets):
     TOKEN_SECRET   سرّ توقيع الرموز (اكتب أي نص طويل عشوائي)
     MAIL_ENDPOINT  رابط Apps Script المنشور (اختياري — للإيميل)
     MAIL_KEY       مفتاح اختياري يقبل به Apps Script
     TG_TOKEN       توكن بوت تلقرام (اختياري — للتنبيهات)
     SETUP_FEE      رسم التأسيس (افتراضي 1000)
   ========================================================================== */
import { SCHEMA_SQL, schemaStatements } from './schema-inline.js';
import {
  validateRegistration, genCode, hashCode, codeExpiry, MAX_CODE_TRIES,
  hashPassword, verifyPassword, packPassword, tempPassword,
  signToken, verifyToken, scopedSearch, json, clean, normDigits, isValidPhone
} from './lib.js';

const rid = (p = 'r') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowSec = () => Math.floor(Date.now() / 1000);
const nowMs = () => Date.now();

/* --------------------- تهيئة الجداول تلقائيًا (self-migrate) --------------------- */
let schemaReady = false;
async function ensureSchema(env, force) {
  if (schemaReady && !force) return { ok: true, skipped: true };
  /* force = يطبّق المخطط كاملًا (جداول/فهارس IF NOT EXISTS) ⇒ يضيف الجديد لقاعدة قائمة */
  if (!force) {
    try {
      await one(env, 'SELECT COUNT(*) AS n FROM users');
      schemaReady = true;
      return { ok: true, already: true };
    } catch (e) {}
  }
  {
    /* الجداول غير موجودة ⇒ ننشئها من المخطط المدمج */
    try {
      /* ننفّذ الجمل واحدة واحدة بعد تنقية التعليقات (D1.execute يرفض التعليقات) */
      let done = 0;
      for (const stmt of schemaStatements()) {
        try { await run(env, stmt); done++; }
        catch (e2) {
          const m = String((e2 && e2.message) || e2);
          if (!/already exists|duplicate/i.test(m)) throw e2;   /* الموجود مسبقًا لا يوقفنا */
        }
      }
      await one(env, 'SELECT COUNT(*) AS n FROM users');
      schemaReady = true;
      return { ok: true, created: !force, updated: !!force, statements: done, tables: (SCHEMA_SQL.match(/CREATE TABLE/gi) || []).length };
    } catch (e3) {
      return { ok: false, error: String((e3 && e3.message) || e3) };
    }
  }
}

/* ------------------------------- مساعدات D1 ------------------------------- */
async function one(env, sql, ...args) { const r = await env.DB.prepare(sql).bind(...args).first(); return r || null; }
async function all(env, sql, ...args) { const r = await env.DB.prepare(sql).bind(...args).all(); return (r && r.results) || []; }
async function run(env, sql, ...args) { return env.DB.prepare(sql).bind(...args).run(); }
async function audit(env, actor, role, schoolId, action, detail, ip) {
  try { await run(env, 'INSERT INTO audit (id,at,actor,role,school_id,action,detail,ip) VALUES (?,?,?,?,?,?,?,?)',
    rid('a'), nowMs(), actor || '', role || '', schoolId || '', action, clean(detail, 500), ip || ''); } catch (e) {}
}

/* ------------------------------- إرسال (بلا نجاح كاذب) ------------------------------- */
async function sendMail(env, { to, subject, body, html }) {
  if (!env.MAIL_ENDPOINT) return { ok: false, error: 'MAIL_ENDPOINT غير مضبوط في الخادم' };
  try {
    const r = await fetch(env.MAIL_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'mail', key: env.MAIL_KEY || '', to, subject, body, html: html || '' })
    });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch (e) {}
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    return { ok: !!(j && j.ok !== false), raw: j || t.slice(0, 200) };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function sendTelegram(env, chatId, text) {
  if (!env.TG_TOKEN) return { ok: false, error: 'TG_TOKEN غير مضبوط' };
  if (!chatId) return { ok: false, error: 'لا معرّف محادثة' };
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
    const j = await r.json().catch(() => null);
    return j && j.ok ? { ok: true, messageId: j.result && j.result.message_id } : { ok: false, error: (j && j.description) || ('HTTP ' + r.status) };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function logOutbox(env, row) {
  try { await run(env, 'INSERT INTO outbox (id,at,school_id,user_id,channel,to_val,subject,body,ok,error) VALUES (?,?,?,?,?,?,?,?,?,?)',
    rid('o'), nowMs(), row.schoolId || '', row.userId || '', row.channel, row.to || '', clean(row.subject, 200), clean(row.body, 2000), row.ok ? 1 : 0, clean(row.error, 300)); } catch (e) {}
}

/* ------------------------------- جلسات ------------------------------- */
async function auth(env, req) {
  const h = req.headers.get('Authorization') || '';
  const tok = h.replace(/^Bearer\s+/i, '') || (new URL(req.url).searchParams.get('t') || '');
  if (!tok) return null;
  const p = await verifyToken(tok, env.TOKEN_SECRET || 'tabaani-dev-secret');
  if (!p) return null;
  const u = await one(env, 'SELECT * FROM users WHERE id = ?', p.uid);
  if (!u || u.status !== 'active') return null;
  /* إبطال الجلسات: أي رمز أقدم من آخر تغيير لكلمة المرور لا يعمل */
  if (Number(u.token_version || 0) !== Number(p.v || 0)) return null;
  return { user: u, token: p };
}

/* ================================ المسارات ================================ */
async function handleRegister(env, req) {
  const body = await req.json().catch(() => ({}));
  const v = validateRegistration(body);
  if (!v.ok) return json({ ok: false, errors: v.errors, msg: 'راجع الحقول المطلوبة' }, 400);
  const d = v.data;
  /* منع التكرار: نفس الجوال أو البريد خلال ٢٤ ساعة */
  const dup = await one(env, 'SELECT id,status,at FROM registrations WHERE (email = ? OR phone = ?) AND at > ? ORDER BY at DESC LIMIT 1',
    d.email, d.phone, nowMs() - 86400000);
  if (dup && dup.status !== 'rejected') return json({ ok: false, msg: 'لديك طلب مسجّل خلال آخر ٢٤ ساعة — سنتواصل معك.', regId: dup.id, status: dup.status }, 409);

  const id = rid('reg');
  await run(env, `INSERT INTO registrations (id,at,school_name,region,city,stages,gender,plan,principal,phone,email,note,paid_note,students_approx,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')`,
    id, nowMs(), d.schoolName, d.region, d.city, JSON.stringify(d.stages), d.gender, d.plan, d.principalName,
    d.phone, d.email, d.note, d.paid, d.studentsApprox);

  const code = genCode();
  await run(env, 'INSERT INTO activation_codes (id,reg_id,email,hash,at,expires_at,tries,used) VALUES (?,?,?,?,?,?,0,0)',
    rid('c'), id, d.email, await hashCode(code, d.email), nowMs(), codeExpiry(15));

  const mail = await sendMail(env, {
    to: d.email,
    subject: 'تابعني — كود تفعيل طلب تسجيل مدرسة ' + d.schoolName,
    body: 'كود التفعيل: ' + code + '\nصالح ١٥ دقيقة. أرسل طلبك لسداد رسم التأسيس ' + (env.SETUP_FEE || '1000') + ' ر.س (تحويل بنكي) وسنكمل التهيئة.',
    html: '<div dir="rtl" style="font-family:Tahoma"><h3>كود تفعيل تابعني</h3><p style="font-size:26px;letter-spacing:6px"><b>' + code + '</b></p><p>صالح ١٥ دقيقة. رسم التأسيس ' + (env.SETUP_FEE || '1000') + ' ر.س (تحويل بنكي).</p></div>'
  });
  await logOutbox(env, { channel: 'email', to: d.email, subject: 'كود تفعيل', body: 'كود لطلب ' + id, ok: mail.ok, error: mail.error });
  await run(env, 'UPDATE registrations SET status = ? WHERE id = ?', mail.ok ? 'code_sent' : 'new', id);
  await audit(env, '', '', '', 'register', d.schoolName + ' — ' + d.phone, req.headers.get('CF-Connecting-IP') || '');

  /* لا نكشف الكود أبدًا في الردّ — يُرسل بالبريد فقط */
  return json({
    ok: true, regId: id, mailed: mail.ok,
    msg: mail.ok ? 'أُرسل كود التفعيل إلى بريدك — أدخله لإكمال التسجيل.'
      : 'سُجّل طلبك، لكن تعذّر إرسال الكود (' + (mail.error || '') + ') — تواصل معنا وسنرسله يدويًا.'
  }, 201);
}

async function handleActivationVerify(env, req) {
  const body = await req.json().catch(() => ({}));
  const regId = clean(body.regId, 60), email = clean(body.email, 160).toLowerCase(), code = normDigits(clean(body.code, 10));
  if (!regId || !code) return json({ ok: false, msg: 'أدخل الكود المكوّن من ٦ أرقام.' }, 400);
  const row = await one(env, 'SELECT * FROM activation_codes WHERE reg_id = ? ORDER BY at DESC LIMIT 1', regId);
  if (!row) return json({ ok: false, msg: 'لا يوجد كود لهذا الطلب — أعد إرسال الكود.' }, 404);
  if (row.used) return json({ ok: false, msg: 'استُخدم هذا الكود بالفعل.' }, 409);
  if (row.expires_at < nowSec()) return json({ ok: false, msg: 'انتهت صلاحية الكود — اطلب كودًا جديدًا.' }, 410);
  if (row.tries >= MAX_CODE_TRIES) return json({ ok: false, cancelled: true, msg: 'تجاوزت ٣ محاولات — أُلغي الطلب. ابدأ التسجيل من جديد.' }, 429);
  const h = await hashCode(code, email || row.email);
  if (h !== row.hash) {
    await run(env, 'UPDATE activation_codes SET tries = tries + 1 WHERE id = ?', row.id);
    const left = MAX_CODE_TRIES - (row.tries + 1);
    return json({ ok: false, msg: left > 0 ? ('كود غير صحيح — تبقّى ' + left + ' محاولة.') : 'تجاوزت المحاولات — أُلغي الطلب.', left }, 401);
  }
  await run(env, 'UPDATE activation_codes SET used = 1 WHERE id = ?', row.id);
  await run(env, "UPDATE registrations SET status = 'verified' WHERE id = ?", regId);
  await audit(env, '', '', '', 'activation_ok', regId, '');
  const reg = await one(env, 'SELECT * FROM registrations WHERE id = ?', regId);
  return json({ ok: true, msg: 'تم التحقق ✓ — أكمل بسداد رسم التأسيس ليُعتمد طلبك.', reg: reg ? { schoolName: reg.school_name, plan: reg.plan, status: reg.status } : null });
}

async function handleLogin(env, req) {
  const body = await req.json().catch(() => ({}));
  const username = clean(body.username, 60).toLowerCase(), pass = String(body.password || '');
  if (!username || !pass) return json({ ok: false, msg: 'أدخل اسم المستخدم وكلمة المرور.' }, 400);
  const u = await one(env, 'SELECT * FROM users WHERE lower(username) = ? OR (email <> \'\' AND lower(email) = ?) LIMIT 1', username, username);
  if (!u) return json({ ok: false, msg: 'بيانات الدخول غير صحيحة.' }, 401);
  if (u.status !== 'active') return json({ ok: false, msg: 'الحساب موقوف — راجع إدارة المدرسة.' }, 403);
  const okp = await verifyPassword(pass, u.pass);
  if (!okp) return json({ ok: false, msg: 'بيانات الدخول غير صحيحة.' }, 401);
  const token = await signToken({ uid: u.id, role: u.role, schoolId: u.school_id, v: Number(u.token_version || 0) }, env.TOKEN_SECRET || 'tabaani-dev-secret');
  await audit(env, u.username, u.role, u.school_id, 'login', '', req.headers.get('CF-Connecting-IP') || '');
  return json({ ok: true, token, user: publicUser(u) });
}
function publicUser(u) {
  return { id: u.id, name: u.name, role: u.role, schoolId: u.school_id, username: u.username,
    email: u.email, mustChange: !!u.must_change, ack: u.ack_status, ackDoc: u.ack_doc };
}

async function handleAckSubmit(env, req, ctx) {
  const docNo = 'ACR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
  await run(env, "UPDATE users SET ack_status = 'submitted', ack_doc = ? WHERE id = ?", docNo, ctx.user.id);
  await run(env, 'INSERT INTO acks (id,at,user_id,school_id,doc_no,status) VALUES (?,?,?,?,?,?)',
    rid('ak'), nowMs(), ctx.user.id, ctx.user.school_id || '', docNo, 'submitted');
  /* إشعار المعتمد: مدير المدرسة للموظفين، والمشرف العام للمدير/المختص */
  const needsSuper = ['principal', 'specialist', 'accountant', 'support'].indexOf(ctx.user.role) > -1;
  const approver = needsSuper
    ? await one(env, "SELECT * FROM users WHERE role = 'super' ORDER BY at LIMIT 1")
    : await one(env, "SELECT * FROM users WHERE role = 'principal' AND school_id = ? ORDER BY at LIMIT 1", ctx.user.school_id || '');
  let notified = null;
  if (approver && approver.telegram) {
    notified = await sendTelegram(env, approver.telegram, '🖊️ إقرار استخدام بانتظار اعتمادك\n' + ctx.user.name + ' — ' + ctx.user.role + '\nرقم الإقرار: ' + docNo);
    await logOutbox(env, { channel: 'telegram', to: approver.telegram, userId: approver.id, schoolId: ctx.user.school_id, subject: 'إقرار بانتظار الاعتماد', body: docNo, ok: notified.ok, error: notified.error });
  }
  return json({ ok: true, docNo, approver: approver ? approver.name : null, notified: !!(notified && notified.ok) });
}

async function handleAckApprove(env, req, ctx) {
  const body = await req.json().catch(() => ({}));
  const userId = clean(body.userId, 60);
  const target = await one(env, 'SELECT * FROM users WHERE id = ?', userId);
  if (!target) return json({ ok: false, msg: 'لا مستخدم' }, 404);
  const isSuper = ctx.user.role === 'super';
  const sameSchoolPrincipal = ctx.user.role === 'principal' && ctx.user.school_id && ctx.user.school_id === target.school_id;
  if (!isSuper && !sameSchoolPrincipal) return json({ ok: false, msg: 'لا تملك صلاحية اعتماد هذا الإقرار.' }, 403);
  if (target.role === 'super') return json({ ok: false, msg: 'لا يُعتمد إقرار المشرف العام من هنا.' }, 400);
  await run(env, "UPDATE users SET ack_status = 'approved' WHERE id = ?", userId);
  await run(env, 'INSERT INTO acks (id,at,user_id,school_id,doc_no,status,approved_by) VALUES (?,?,?,?,?,?,?)',
    rid('ak'), nowMs(), userId, target.school_id || '', target.ack_doc || '', 'approved', ctx.user.name);
  await audit(env, ctx.user.username, ctx.user.role, target.school_id, 'ack_approve', target.name, '');
  return json({ ok: true, msg: 'اعتُمد إقرار ' + target.name + ' — يعمل حسابه.' });
}

/** مفتاح المزامنة: مدرسة المستخدم · والمشرف العام له مفتاح المنصة (كل البيانات) */
function syncKey(ctx, url, body) {
  if (ctx.user.school_id) return ctx.user.school_id;
  if (ctx.user.role === 'super') {
    const q = new URL(url).searchParams.get('schoolId') || (body && body.schoolId) || 'platform';
    return String(q).slice(0, 60);
  }
  return '';
}
async function handleSyncGet(env, req, ctx) {
  const key = syncKey(ctx, req.url, null);
  if (!key) return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  const row = await one(env, 'SELECT version,json,updated_at FROM data WHERE school_id = ?', key);
  return json({ ok: true, version: row ? row.version : 0, updatedAt: row ? row.updated_at : 0,
    data: row ? JSON.parse(row.json) : null, schoolId: key });
}
async function handleSyncPut(env, req, ctx) {
  const body0 = await req.clone().json().catch(() => ({}));
  const key = syncKey(ctx, req.url, body0);
  if (!key) return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  if (['teacher', 'student'].indexOf(ctx.user.role) > -1) return json({ ok: false, msg: 'الرفع السحابي متاح لمدير المدرسة ومن ينوب عنه.' }, 403);
  const body = body0;
  const incoming = body && body.data;
  if (!incoming || typeof incoming !== 'object') return json({ ok: false, msg: 'لا بيانات صالحة.' }, 400);
  const cur = await one(env, 'SELECT version FROM data WHERE school_id = ?', key);
  const base = Number(body.baseVersion || 0);
  if (cur && Number(base || 0) < cur.version) {
    /* لا نكتب فوق نسخة أحدث — نُعيد الأحدث ليحلّ المدير التعارض */
    const latest = await one(env, 'SELECT version,json FROM data WHERE school_id = ?', key);
    return json({ ok: false, conflict: true, version: cur.version, latest: JSON.parse(latest.json),
      msg: 'توجد نسخة أحدث على الخادم (v' + cur.version + ') — راجعها قبل الرفع.' }, 409);
  }
  const version = (cur ? cur.version : 0) + 1;
  const text = JSON.stringify(incoming);
  if (text.length > 4_000_000) return json({ ok: false, msg: 'حجم البيانات كبير (٤ م.ب كحد أقصى للنسخة).' }, 413);
  if (cur) await run(env, 'UPDATE data SET version = ?, json = ?, updated_at = ?, by_user = ? WHERE school_id = ?',
    version, text, nowMs(), ctx.user.username, key);
  else await run(env, 'INSERT INTO data (school_id,version,json,updated_at,by_user) VALUES (?,?,?,?,?)',
    key, version, text, nowMs(), ctx.user.username);
  await audit(env, ctx.user.username, ctx.user.role, key, 'sync_put', 'v' + version, '');
  return json({ ok: true, version, bytes: text.length });
}

async function handleSearch(env, req, ctx) {
  const q = new URL(req.url).searchParams.get('q') || '';
  const sc = ctx.user.role === 'super' ? null : ctx.user.school_id;
  const users = await all(env, sc ? 'SELECT id,name,role,school_id,username FROM users WHERE school_id = ?' : 'SELECT id,name,role,school_id,username FROM users', ...(sc ? [sc] : []));
  const schools = ctx.user.role === 'super' ? await all(env, 'SELECT id,name,region,city FROM schools') : [];
  let dataset = { users, schools, classes: [], students: [] };
  if (sc) {
    const row = await one(env, 'SELECT json FROM data WHERE school_id = ?', sc);
    if (row) { try { const d = JSON.parse(row.json); dataset.classes = d.classes || []; dataset.students = d.students || []; dataset.assignments = d.assignments || []; } catch (e) {} }
  }
  const out = scopedSearch({ id: ctx.user.id, role: ctx.user.role, schoolId: ctx.user.school_id }, q, dataset);
  return json(Object.assign({ ok: true, q }, out));
}

async function handleAdminRequests(env, req, ctx) {
  if (ctx.user.role !== 'super') return json({ ok: false, msg: 'للمشرف العام فقط.' }, 403);
  const rows = await all(env, 'SELECT * FROM registrations ORDER BY at DESC LIMIT 100');
  return json({ ok: true, rows: rows.map((r) => ({
    id: r.id, at: r.at, schoolName: r.school_name, region: r.region, city: r.city,
    stages: JSON.parse(r.stages || '[]'), gender: r.gender, plan: r.plan, principal: r.principal,
    phone: r.phone, email: r.email, studentsApprox: r.students_approx, status: r.status, paidNote: r.paid_note
  })) });
}

async function handleAdminApprove(env, req, ctx) {
  if (ctx.user.role !== 'super') return json({ ok: false, msg: 'للمشرف العام فقط.' }, 403);
  const body = await req.json().catch(() => ({}));
  const regId = clean(body.regId, 60);
  const reg = await one(env, 'SELECT * FROM registrations WHERE id = ?', regId);
  if (!reg) return json({ ok: false, msg: 'لا طلب بهذا المعرّف.' }, 404);
  if (reg.status === 'approved' || reg.status === 'onboarded') return json({ ok: false, msg: 'الطلب معتمد بالفعل.', schoolId: reg.school_id }, 409);
  const schoolId = 'sch_' + Math.random().toString(36).slice(2, 8);
  const code = 'TB-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  await run(env, 'INSERT INTO schools (id,at,name,region,city,gender,plan,license,code) VALUES (?,?,?,?,?,?,?,?,?)',
    schoolId, nowMs(), reg.school_name, reg.region, reg.city, reg.gender, reg.plan, 'active', code);
  const uname = (body.username && clean(body.username, 40).toLowerCase()) || ('principal' + code.slice(-2).toLowerCase());
  const pw = body.password ? String(body.password) : tempPassword();
  const u = rid('u');
  await run(env, `INSERT INTO users (id,at,school_id,name,role,username,pass,email,phone,must_change,ack_status,status)
    VALUES (?,?,?,?,?,?,?,?,?,1,'pending','active')`,
    u, nowMs(), schoolId, reg.principal, 'principal', uname, packPassword(await hashPassword(pw)), reg.email, reg.phone);
  await run(env, "UPDATE registrations SET status = 'approved', school_id = ? WHERE id = ?", schoolId, regId);
  const mail = await sendMail(env, {
    to: reg.email, subject: 'تابعني — حساب مدرسة ' + reg.school_name,
    body: 'اسم المستخدم: ' + uname + '\nكلمة المرور المؤقتة: ' + pw + '\nرابط المنصة: https://abdmmm2.github.io/tabaani/app/\nغيّر كلمة المرور بعد أول دخول، وأكمل الإقرار.'
  });
  await logOutbox(env, { channel: 'email', to: reg.email, subject: 'بيانات الدخول', body: uname, schoolId, ok: mail.ok, error: mail.error });
  await audit(env, ctx.user.username, 'super', schoolId, 'approve_reg', reg.school_name, '');
  return json({ ok: true, schoolId, username: uname, password: pw, mailed: mail.ok, mailError: mail.error || null,
    msg: mail.ok ? 'أُنشئت المدرسة وأُرسلت بيانات الدخول بالبريد.' : 'أُنشئت المدرسة — لكن تعذّر البريد، انسخ البيانات يدويًا.' });
}

async function handleNotify(env, req, ctx) {
  const body = await req.json().catch(() => ({}));
  const text = clean(body.text, 2000);
  if (!text) return json({ ok: false, msg: 'لا نص.' }, 400);
  const out = {};
  if (body.chatId) { const r = await sendTelegram(env, clean(body.chatId, 40), text); out.telegram = r;
    await logOutbox(env, { channel: 'telegram', to: body.chatId, userId: ctx.user.id, schoolId: ctx.user.school_id, body: text, ok: r.ok, error: r.error }); }
  if (body.email) { const r = await sendMail(env, { to: clean(body.email, 160), subject: clean(body.subject, 160) || 'تابعني', body: text }); out.email = r;
    await logOutbox(env, { channel: 'email', to: body.email, userId: ctx.user.id, schoolId: ctx.user.school_id, subject: body.subject, body: text, ok: r.ok, error: r.error }); }
  const ok = Object.keys(out).some((k) => out[k].ok);
  return json({ ok, channels: out }, ok ? 200 : 502);
}

/* ================================ الموجّه ================================ */
export default {
  async fetch(req, env, ctxExec) {
    const url = new URL(req.url);
    const p = url.pathname;
    const ip = req.headers.get('CF-Connecting-IP') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || 'https://abdmmm2.github.io',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let res;
      if (p === '/api/init') {
        const r = await ensureSchema(env, url.searchParams.get('force') !== null || req.method === 'POST');
        res = json(r.ok ? { ok: true, msg: 'الجداول جاهزة', ...r, tables: r.tables || 8 } : { ok: false, msg: 'تعذّر إنشاء الجداول', error: r.error }, r.ok ? 200 : 500);
      }
      else if (p === '/api/register' && req.method === 'POST') res = await handleRegister(env, req);
      else if (p === '/api/activation/request' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        res = await handleActivationRequest(env, body, req);
      } else if (p === '/api/activation/verify' && req.method === 'POST') res = await handleActivationVerify(env, req);
      else if (p === '/api/auth/forgot' && req.method === 'POST') res = await handleForgot(env, req);
      else if (p === '/api/auth/reset' && req.method === 'POST') res = await handleReset(env, req);
      else if (p === '/api/auth/login' && req.method === 'POST') res = await handleLogin(env, req);
      else if (p === '/api/health') res = json({ ok: true, service: 'tabaani-cloud', at: nowMs(), mail: !!env.MAIL_ENDPOINT, telegram: !!env.TG_TOKEN });
      else {
        /* أي مسار آخر: نتأكد أن الجداول موجودة (تنشأ تلقائيًا إن لزم) */
        try { await ensureSchema(env); } catch (e) {}
        const ctx = await auth(env, req);
        if (p === '/api/me' && ctx) res = json({ ok: true, user: publicUser(ctx.user) });
        else if (p === '/api/ack/submit' && ctx) res = await handleAckSubmit(env, req, ctx);
        else if (p === '/api/ack/approve' && ctx) res = await handleAckApprove(env, req, ctx);
        else if (p === '/api/ack/list' && ctx) {
          const sc = ctx.user.role === 'super' ? null : ctx.user.school_id;
          if (ctx.user.role !== 'super' && ctx.user.role !== 'principal') res = json({ ok: false, msg: 'للمدير والمشرف العام.' }, 403);
          else {
            const rows = await all(env, sc ? 'SELECT id,name,role,ack_status,ack_doc,school_id FROM users WHERE school_id = ?' : 'SELECT id,name,role,ack_status,ack_doc,school_id FROM users', ...(sc ? [sc] : []));
            res = json({ ok: true, rows });
          }
        }
        else if (p === '/api/sync' && ctx && req.method === 'GET') res = await handleSyncGet(env, req, ctx);
        else if (p === '/api/sync' && ctx && req.method === 'PUT') res = await handleSyncPut(env, req, ctx);
        else if (p === '/api/search' && ctx) res = await handleSearch(env, req, ctx);
        else if (p === '/api/sync/reset' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const k = String(new URL(req.url).searchParams.get('key') || '');
        if (!env.SEED_KEY || k !== env.SEED_KEY) { res = json({ ok: false, msg: 'مفتاح غير صحيح.' }, 403); }
        else {
          const target = String(body.schoolId || 'platform').slice(0, 60);
          await run(env, 'DELETE FROM data WHERE school_id = ?', target);
          res = json({ ok: true, msg: 'أُعيد ضبط نسخة ' + target, schoolId: target });
        }
      }
      else if (p === '/api/me/password' && ctx && req.method === 'POST') res = await handleMyPassword(env, req, ctx);
      else if (p === '/api/me/data' && ctx && req.method === 'GET') res = await handleMyData(env, ctx);
      else if (p === '/api/me/data' && ctx && (req.method === 'POST' || req.method === 'PUT')) res = await handleMyWrite(env, req, ctx);
      else if (p === '/api/admin/provision' && ctx) res = await handleProvision(env, req, ctx);
      else if (p === '/api/admin/outbox' && ctx && ctx.user.role === 'super') res = await handleOutbox(env, req);
      else if (p === '/api/admin/stats' && ctx && ctx.user.role === 'super') res = await handleAdminStats(env);
      else if (p === '/api/admin/users' && ctx && ctx.user.role === 'super') res = await handleAdminUsers(env);
      else if (p === '/api/admin/setpass' && ctx && ctx.user.role === 'super') res = await handleAdminSetPass(env, req, ctx);
      else if (p === '/api/admin/passwords' && ctx) res = await handleBulkPasswords(env, req, ctx);
      else if (p === '/api/admin/deleteuser' && ctx) res = await handleDeleteUser(env, req, ctx);
      else if (p === '/api/admin/requests' && ctx) res = await handleAdminRequests(env, req, ctx);
        else if (p === '/api/admin/approve' && ctx) res = await handleAdminApprove(env, req, ctx);
        else if (p === '/api/notify' && ctx) res = await handleNotify(env, req, ctx);
        else if (p === '/' || p === '/index.html') res = await servePublic(env, req);
        else if (p === '/api/seed' && req.method === 'POST' && (env.SEED_KEY || 'seed') === (url.searchParams.get('key') || '')) res = await handleSeed(env, req);
        else if (!ctx && /^\/api\/(me|ack|sync|search|admin|notify)\b/.test(p)) res = json({ ok: false, msg: 'انتهت الجلسة — سجّل الدخول من جديد.', expired: true }, 401);
        else res = json({ ok: false, msg: 'مسار غير معروف: ' + p }, 404);
      }
      const h2 = new Headers(res.headers);
      Object.keys(cors).forEach((k) => h2.set(k, cors[k]));
      return new Response(res.body, { status: res.status, headers: h2 });
    } catch (e) {
      return json({ ok: false, msg: 'خطأ في الخادم', error: String(e && e.message || e) }, 500, { 'Access-Control-Allow-Origin': cors['Access-Control-Allow-Origin'] });
    }
  }
};

async function handleActivationRequest(env, body, req) {
  const regId = clean(body.regId, 60), email = clean(body.email, 160).toLowerCase();
  const reg = await one(env, 'SELECT * FROM registrations WHERE id = ?', regId);
  if (!reg) return json({ ok: false, msg: 'لا طلب بهذا المعرّف.' }, 404);
  if (reg.status === 'rejected') return json({ ok: false, msg: 'الطلب مرفوض.' }, 409);
  const last = await one(env, 'SELECT at FROM activation_codes WHERE reg_id = ? ORDER BY at DESC LIMIT 1', regId);
  if (last && nowMs() - last.at < 60_000) return json({ ok: false, msg: 'انتظر دقيقة قبل طلب كود جديد.' }, 429);
  const code = genCode();
  await run(env, 'INSERT INTO activation_codes (id,reg_id,email,hash,at,expires_at,tries,used) VALUES (?,?,?,?,?,?,0,0)',
    rid('c'), regId, email || reg.email, await hashCode(code, email || reg.email), nowMs(), codeExpiry(15));
  const mail = await sendMail(env, { to: email || reg.email, subject: 'تابعني — كود تفعيل جديد',
    body: 'كود التفعيل الجديد: ' + code + '\nصالح ١٥ دقيقة.' });
  await logOutbox(env, { channel: 'email', to: email || reg.email, subject: 'كود تفعيل جديد', body: regId, ok: mail.ok, error: mail.error });
  return json({ ok: true, mailed: mail.ok, msg: mail.ok ? 'أُرسل كود جديد إلى بريدك.' : ('تعذّر الإرسال: ' + (mail.error || '')) });
}

/* ------------------- استعادة كلمة المرور: طلب رمز بالبريد -------------------
   • ردّ عام دائمًا (لا نكشف وجود الحساب).
   • الكود ٦ أرقام يُخزَّن مُجزَّأً (SHA-256 مع البريد) — لا يُحفظ كنص.
   • صلاحية ١٥ دقيقة · ٣ محاولات · ٣ طلبات/ساعة · مهلة ٦٠ ثانية بين الطلبات. */
async function handleForgot(env, req) {
  const body = await req.json().catch(() => ({}));
  const ident = clean(body.ident || body.email || body.username, 160).toLowerCase().trim();
  const generic = { ok: true, msg: 'إن كان الحساب مسجّلًا ببريد فسيصلك رمز التحقق خلال دقيقة.' };
  if (!ident) return json(generic, 200);

  /* حدود الإرسال (منع الإزعاج والاستهلاك) */
  const now = nowMs();
  const last = await one(env, 'SELECT at FROM reset_codes WHERE ident = ? ORDER BY at DESC LIMIT 1', ident);
  if (last && now - last.at < 60_000) return json({ ...generic, wait: 60 }, 200);
  const hourAgo = Math.floor(now / 1000) - 3600;
  const cnt = await one(env, 'SELECT COUNT(*) AS n FROM reset_codes WHERE ident = ? AND at > ?', ident, hourAgo * 1000);
  if (cnt && Number(cnt.n) >= 3) return json({ ...generic, limited: true }, 200);

  const user = await one(env, 'SELECT * FROM users WHERE lower(username) = ? OR (email <> \'\' AND lower(email) = ?) LIMIT 1', ident, ident);
  if (!user || !user.email) return json(generic, 200);

  const code = genCode();
  const hash = await hashCode(code, user.email);
  /* إبطال أي كود سابق لنفس المستخدم */
  await run(env, 'UPDATE reset_codes SET used = 1 WHERE user_id = ? AND used = 0', user.id);
  await run(env, 'INSERT INTO reset_codes (id,user_id,ident,email,hash,at,expires_at,tries,used) VALUES (?,?,?,?,?,?,?,0,0)',
    rid('rs'), user.id, ident, String(user.email).toLowerCase(), hash, now, codeExpiry(15));

  const mail = await sendMail(env, {
    to: user.email,
    subject: 'تابعني — رمز استعادة كلمة المرور',
    body: 'رمز استعادة كلمة المرور في تابعني: ' + code + '\n\nصالح ١٥ دقيقة، ولا تشاركه مع أي شخص.\nإذا لم تطلبه فتجاهل هذه الرسالة.'
  });
  await logOutbox(env, { channel: 'email', to: user.email, subject: 'استعادة كلمة المرور', body: user.id, ok: mail.ok, error: mail.error });
  await audit(env, user.id, user.role, user.school_id, 'password_reset_request', clean(ident, 80), req.headers.get('CF-Connecting-IP') || '');
  if (!mail.ok) return json({ ok: false, msg: 'تعذّر إرسال الرمز الآن. حاول بعد قليل أو تواصل مع إدارة تابني.' }, 502);
  return json(generic, 200);
}

/* ------------------- استعادة كلمة المرور: التحقق وتعيين الجديدة -------------------
   • الكود ٦ أرقام · ٣ محاولات · صلاحية ١٥ دقيقة.
   • النجاح ⇒ كلمة مرور PBKDF2 + زيادة token_version (إبطال كل الجلسات السابقة). */
async function handleReset(env, req) {
  const body = await req.json().catch(() => ({}));
  const ident = clean(body.ident || body.email || body.username, 160).toLowerCase().trim();
  const code = normDigits(clean(body.code, 12));
  const pass = String(body.password || body.newPassword || '');
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const bad = { ok: false, msg: 'الكود غير صحيح أو منتهي الصلاحية.' };
  if (!ident || !/^\d{6}$/.test(code)) return json({ ok: false, msg: 'أدخل الرمز المكوّن من ٦ أرقام.' }, 400);
  if (pass.length < 8) return json({ ok: false, msg: 'كلمة المرور ٨ أحرف على الأقل.' }, 400);

  const u = await one(env, 'SELECT * FROM users WHERE lower(username) = ? OR (email <> \'\' AND lower(email) = ?) LIMIT 1', ident, ident);
  if (!u) return json(bad, 400);
  const row = await one(env, 'SELECT * FROM reset_codes WHERE user_id = ? AND used = 0 ORDER BY at DESC LIMIT 1', u.id);
  if (!row) return json(bad, 400);

  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(row.expires_at) < nowSec) {
    await run(env, 'UPDATE reset_codes SET used = 1 WHERE id = ?', row.id);
    return json({ ok: false, msg: 'انتهت صلاحية الرمز — اطلب رمزًا جديدًا.' }, 400);
  }
  if (Number(row.tries) >= MAX_CODE_TRIES) {
    await run(env, 'UPDATE reset_codes SET used = 1 WHERE id = ?', row.id);
    return json({ ok: false, msg: 'محاولات كثيرة — اطلب رمزًا جديدًا.' }, 429);
  }
  const h = await hashCode(code, row.email || u.email);
  if (h !== row.hash) {
    await run(env, 'UPDATE reset_codes SET tries = tries + 1 WHERE id = ?', row.id);
    const n = Number(row.tries) + 1;
    return json({ ok: false, msg: n >= MAX_CODE_TRIES ? 'محاولات كثيرة — اطلب رمزًا جديدًا.' : ('الرمز غير صحيح (بقيت ' + (MAX_CODE_TRIES - n) + ' محاولات).') }, 400);
  }

  await run(env, 'UPDATE reset_codes SET used = 1 WHERE id = ?', row.id);
  await run(env, 'UPDATE users SET pass = ?, must_change = 0, token_version = COALESCE(token_version,0) + 1 WHERE id = ?',
    packPassword(await hashPassword(pass)), u.id);
  await audit(env, u.username, u.role, u.school_id, 'password_reset_done', '', ip);
  return json({ ok: true, msg: 'تم تغيير كلمة المرور ✓ سجّل الدخول بكلمة المرور الجديدة.' });
}

/* ------------- تجهيز حسابات سحابية للمستخدمين الحاليين (المشرف العام فقط) -------------
   يستقبل قائمة المستخدمين من التطبيق (المرة الأولى أو بعد إضافة موظفين)،
   ويُنشئ/يحدّث حسابات الدخول السحابية بكلمات مرور PBKDF2. */
async function handleProvision(env, req, ctx) {
  if (ctx.user.role !== 'super') return json({ ok: false, msg: 'للمشرف العام فقط.' }, 403);
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.users) ? body.users.slice(0, 500) : [];
  if (!list.length) return json({ ok: false, msg: 'لا يوجد مستخدمون في الطلب.' }, 400);
  let created = 0, updated = 0, skipped = 0;
  for (const x of list) {
    const username = clean(x.username, 60).toLowerCase();
    const role = clean(x.role, 20);
    const pass = String(x.password || '');
    const email = clean(x.email, 160).toLowerCase();
    if (!username || !role || !pass) { skipped++; continue; }
    const name = clean(x.name, 80) || username;
    const status = (x.status === 'suspended' || x.status === 'pending') ? x.status : 'active';
    const ack = (x.ackStatus === 'approved' || x.ackStatus === 'submitted') ? x.ackStatus : 'pending';
    const schoolId = clean(x.schoolId, 60) || null;
    const phone = clean(x.phone, 30), tg = clean(x.telegram, 40);
    const packed = packPassword(await hashPassword(pass));
    const ex = await one(env, 'SELECT id FROM users WHERE lower(username) = ?', username);
    if (ex) {
      await run(env, `UPDATE users SET name=?, role=?, school_id=?, email=?, phone=?, telegram=?, status=?, ack_status=?, pass=?,
        token_version = COALESCE(token_version,0) + 1 WHERE id=?`,
        name, role, schoolId, email, phone, tg, status, ack, packed, ex.id);
      updated++;
    } else {
      await run(env, `INSERT INTO users (id,at,school_id,name,role,username,pass,email,phone,telegram,must_change,ack_status,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`,
        rid('u'), nowMs(), schoolId, name, role, username, packed, email, phone, tg, ack, status);
      created++;
    }
  }
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'accounts_provisioned',
    'أُنشئ ' + created + ' · حُدّث ' + updated + ' · تُخطّي ' + skipped, req.headers.get('CF-Connecting-IP') || '');
  return json({ ok: true, created, updated, skipped, total: list.length });
}

/* ------------ تشخيص (المشرف العام): آخر الرسائل الصادرة + إحصاءات ------------ */
async function handleOutbox(env, req) {
  const limit = Math.min(50, Math.max(1, parseInt(new URL(req.url).searchParams.get('limit') || '15', 10) || 15));
  const rows = await all(env, 'SELECT channel, to_val, subject, ok, error, at, body FROM outbox ORDER BY at DESC LIMIT ?', limit);
  return json({ ok: true, rows: rows.map(function (r) {
    return { channel: r.channel, to: r.to_val, subject: r.subject, ok: r.ok, error: r.error, at: r.at, body: r.body };
  }) });
}
async function handleAdminStats(env) {
  const n = async (sql, ...a) => Number(((await one(env, sql, ...a)) || {}).n || 0);
  return json({ ok: true, stats: {
    users: await n('SELECT COUNT(*) AS n FROM users'),
    usersWithEmail: await n("SELECT COUNT(*) AS n FROM users WHERE email <> ''"),
    registrations: await n('SELECT COUNT(*) AS n FROM registrations'),
    resetCodes: await n('SELECT COUNT(*) AS n FROM reset_codes'),
    outbox: await n('SELECT COUNT(*) AS n FROM outbox')
  } });
}

/* ================== بيانات المستخدم بنطاقه (٣أ) ==================
   • المشرف العام: نسخة المنصة كاملة.
   • مدير/وكيل/إرشاد/محاسب/دعم/مختص: مدرسته كاملة.
   • المعلم: فصوله وطلابه فقط (+ الكتابة على الحضور/المخالفات/الأذونات/الكشوف/رسائله).
   • الطالب: بياناته ورسائله فقط. */
const ADMIN_ROLES = ['principal', 'deputy', 'guidance', 'accountant', 'support', 'specialist'];

function skeleton() {
  return { meta: { version: 1 }, settings: { hijri: true }, regions: [], users: [], schools: [], classes: [],
    students: [], assignments: [], transfers: [], periods: [], sessions: [], violations: [], permissions: [],
    programs: [], programRegs: [], activities: [], activityReqs: [], dutyLocations: [], duties: [], terms: [],
    activityLog: [], checkins: [], faceScans: [], reports: [], telegram: [], audit: [], notif: [], subjects: [],
    exits: [], entryPermits: [], messages: [], serviceRequests: [], pledges: [], gradeSheets: [],
    paymentRequests: [], invoices: [], expenses: [], tickets: [], updates: [], letterhead: null };
}
function myClassIds(db, u) {
  return (db.classes || []).filter(function (c) {
    var t = c.teacherId || c.teacher || '';
    return t === u.id || (Array.isArray(c.teachers) && c.teachers.indexOf(u.id) > -1) || c.supervisorId === u.id;
  }).map(function (c) { return c.id; });
}
function filterForUser(db, u) {
  if (!db) return null;
  if (u.role === 'super' || ADMIN_ROLES.indexOf(u.role) > -1) return db;
  var out = skeleton();
  out.meta = db.meta; out.settings = db.settings; out.regions = db.regions || []; out.letterhead = db.letterhead || null;
  out.schools = (db.schools || []).filter(function (s) { return s.id === u.school_id; });
  if (u.role === 'teacher') {
    var ids = myClassIds(db, u);
    var students = (db.students || []).filter(function (s) { return ids.indexOf(s.classId) > -1; });
    var sids = students.map(function (s) { return s.id; });
    out.classes = (db.classes || []).filter(function (c) { return ids.indexOf(c.id) > -1; });
    out.students = students;
    out.users = (db.users || []).filter(function (x) { return x.id === u.id; });
    out.sessions = (db.sessions || []).filter(function (a) { return ids.indexOf(a.classId) > -1 || a.teacherId === u.id; });
    out.violations = (db.violations || []).filter(function (v) { return ids.indexOf(v.classId) > -1 || sids.indexOf(v.studentId) > -1; });
    out.permissions = (db.permissions || []).filter(function (p) { return sids.indexOf(p.studentId) > -1; });
    out.gradeSheets = (db.gradeSheets || []).filter(function (g) { return ids.indexOf(g.classId) > -1; });
    out.messages = (db.messages || []).filter(function (m) { return m.fromUserId === u.id || m.toUserId === u.id; });
    out.notif = (db.notif || []).filter(function (n) { return n.toUserId === u.id; });
    out.tickets = (db.tickets || []).filter(function (t) { return t.byUserId === u.id; });
    out.terms = (db.terms || []).filter(function (t) { return t.active; });
    return out;
  }
  if (u.role === 'student') {
    out.students = (db.students || []).filter(function (s) { return s.id === u.id || s.userId === u.id; });
    var st = out.students[0] || {};
    out.classes = (db.classes || []).filter(function (c) { return c.id === st.classId; });
    out.sessions = (db.sessions || []).filter(function (a) { return a.classId === st.classId; });
    out.users = (db.users || []).filter(function (x) { return x.id === u.id; });
    out.violations = (db.violations || []).filter(function (v) { return v.studentId === st.id; });
    out.permissions = (db.permissions || []).filter(function (p) { return p.studentId === st.id; });
    out.gradeSheets = (db.gradeSheets || []).filter(function (g) { return g.classId === st.classId; });
    out.messages = (db.messages || []).filter(function (m) { return m.fromUserId === u.id || m.toUserId === u.id; });
    out.notif = (db.notif || []).filter(function (n) { return n.toUserId === u.id; });
    return out;
  }
  return out;
}
/* مصدر النسخة: نسخة المدرسة إن وُجدت، وإلا نسخة المنصة (المشرف) مع فلترة المدرسة */
async function blobKeyFor(env, u) {
  if (u.role === 'super') return 'platform';
  const own = await one(env, 'SELECT school_id FROM data WHERE school_id = ?', u.school_id);
  if (own) return u.school_id;
  const plat = await one(env, 'SELECT school_id FROM data WHERE school_id = ?', 'platform');
  if (plat) return 'platform';
  return u.school_id;
}
/* فلترة نسخة المنصة إلى مدرسة واحدة (المشرف/المدير) */
function filterSchool(db, sid) {
  if (!db) return null;
  var out = skeleton();
  out.meta = db.meta; out.settings = db.settings; out.regions = db.regions || []; out.letterhead = db.letterhead || null;
  Object.keys(out).forEach(function (k) {
    if (!Array.isArray(out[k]) || k === 'meta' || k === 'settings' || k === 'regions') return;
    var src = db[k];
    if (!Array.isArray(src)) return;
    out[k] = src.filter(function (it) {
      if (!it || typeof it !== 'object') return false;
      return it.schoolId === sid || !it.schoolId;   /* بيانات المدرسة + العناصر العامة */
    });
  });
  out.schools = (db.schools || []).filter(function (x) { return x.id === sid; });
  return out;
}
async function handleMyData(env, ctx) {
  const u = ctx.user;
  if (!u.school_id && u.role !== 'super') return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  const key = await blobKeyFor(env, u);
  const row = await one(env, 'SELECT version,json,updated_at FROM data WHERE school_id = ?', key);
  let db = row ? JSON.parse(row.json) : null;
  if (db && u.role !== 'super' && key === 'platform') db = filterSchool(db, u.school_id);
  const view = filterForUser(db, u);
  /* نضمن وجود سجل المستخدم نفسه (حتى لو لم يكن في النسخة) ليكتمل الدخول */
  if (view && Array.isArray(view.users) && !view.users.some(function (x) { return x && x.id === u.id; })) {
    view.users.push({ id: u.id, name: u.name, role: u.role, username: u.username, email: u.email || '',
      schoolId: u.school_id || null, status: u.status, createdAt: nowMs() });
  }
  return json({ ok: true, version: row ? row.version : 0, updatedAt: row ? row.updated_at : 0,
    scope: u.role, schoolId: u.school_id || null, data: view });
}
const TEACHER_WRITE = ['sessions', 'violations', 'permissions', 'gradeSheets', 'messages'];
const STUDENT_WRITE = ['messages'];
function upsert(db, coll, item) {
  if (!item || !item.id) return false;
  var arr = db[coll] || (db[coll] = []);
  for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === item.id) { arr[i] = item; return true; } }
  arr.push(item); return true;
}
async function handleMyWrite(env, req, ctx) {
  const u = ctx.user;
  const isSuper = u.role === 'super';
  if (!u.school_id && !isSuper) return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  const key = isSuper ? 'platform' : await blobKeyFor(env, u);
  const body = await req.json().catch(() => ({}));
  const incoming = body.data;
  if (!incoming || typeof incoming !== 'object') return json({ ok: false, msg: 'لا بيانات صالحة.' }, 400);
  const row = await one(env, 'SELECT version,json FROM data WHERE school_id = ?', key);
  const db = row ? JSON.parse(row.json) : skeleton();
  const allowed = u.role === 'teacher' ? TEACHER_WRITE : (u.role === 'student' ? STUDENT_WRITE
    : ((isSuper || ADMIN_ROLES.indexOf(u.role) > -1) ? Object.keys(skeleton()) : []));
  const ids = u.role === 'teacher' ? myClassIds(db, u) : [];
  const sids = u.role === 'teacher'
    ? (db.students || []).filter(function (s) { return ids.indexOf(s.classId) > -1; }).map(function (s) { return s.id; })
    : (db.students || []).filter(function (s) { return s.id === u.id || s.userId === u.id; }).map(function (s) { return s.id; });
  let changed = 0, rejected = 0;
  allowed.forEach(function (coll) {
    if (!Array.isArray(incoming[coll])) return;
    if (coll === 'schools' && !isSuper) return;          /* المدارس للمشرف العام فقط */
    incoming[coll].forEach(function (item) {
      var okScope = true;
      if (coll === 'users') {
        /* المستخدمون: المشرف العام للجميع، ومدير المدرسة لمدرسته فقط وبلا ترقية إلى مشرف */
        if (isSuper) okScope = true;
        else if (ADMIN_ROLES.indexOf(u.role) > -1) okScope = String(item.schoolId || '') === String(u.school_id || '') && item.role !== 'super';
        else okScope = !!(item && item.id === u.id);
      } else if (u.role === 'teacher') {
        if (coll === 'sessions') okScope = ids.indexOf(item.classId) > -1 || item.teacherId === u.id;
        else if (coll === 'violations' || coll === 'permissions') okScope = ids.indexOf(item.classId) > -1 || sids.indexOf(item.studentId) > -1;
        else if (coll === 'gradeSheets') okScope = ids.indexOf(item.classId) > -1;
        else if (coll === 'messages') okScope = item.fromUserId === u.id || item.toUserId === u.id;
      } else if (u.role === 'student') {
        okScope = coll === 'messages' && (item.fromUserId === u.id || item.toUserId === u.id);
      }
      if (!okScope) { rejected++; return; }
      if (upsert(db, coll, item)) changed++;
    });
  });
  /* تحديث كلمات مرور الحسابات السحابية إذا تغيّرت في التطبيق (للمشرف/المدير) */
  if ((isSuper || ADMIN_ROLES.indexOf(u.role) > -1) && Array.isArray(incoming.users)) {
    for (const it of incoming.users) {
      if (!it || !it.username || !it.password) continue;
      if (!isSuper && String(it.schoolId || '') !== String(u.school_id || '')) continue;
      const un = String(it.username).toLowerCase();
      const acc = await one(env, 'SELECT id FROM users WHERE lower(username) = ?', un);
      if (acc) continue;   /* الحساب موجود: كلمة مروره السحابية هي المرجع (لا نكتب فوقها) */
      /* مستخدم جديد في التطبيق ⇒ حساب سحابي تلقائي (يدخل من أي جهاز) */
      await run(env, `INSERT INTO users (id,at,school_id,name,role,username,pass,email,phone,telegram,must_change,ack_status,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,'pending','active')`,
        rid('u'), nowMs(), it.schoolId || u.school_id, clean(it.name, 80) || un, clean(it.role, 20) || 'teacher',
        un, packPassword(await hashPassword(String(it.password))), clean(it.email, 160).toLowerCase(),
        clean(it.phone, 30), clean(it.telegram, 40));
    }
  }
  /* التاريخ على الخادم */
  if (db.meta) db.meta.updatedAt = nowMs();
  const version = (row ? row.version : 0) + 1;
  const text = JSON.stringify(db);
  if (text.length > 4_000_000) return json({ ok: false, msg: 'حجم البيانات كبير.' }, 413);
  if (row) await run(env, 'UPDATE data SET version = ?, json = ?, updated_at = ?, by_user = ? WHERE school_id = ?',
    version, text, nowMs(), u.username, key);
  else await run(env, 'INSERT INTO data (school_id,version,json,updated_at,by_user) VALUES (?,?,?,?,?)',
    key, version, text, nowMs(), u.username);
  return json({ ok: true, version, changed, rejected });
}

/* ---------- دعم المشرف العام: قائمة الحسابات + تعيين كلمة مرور سحابية ---------- */
async function handleAdminUsers(env) {
  const rows = await all(env, "SELECT id, username, name, role, email, status, school_id, ack_status FROM users ORDER BY role, username");
  return json({ ok: true, rows: rows.map(function (r) {
    return { id: r.id, username: r.username, name: r.name, role: r.role, email: r.email || '', status: r.status, schoolId: r.school_id || null, ack: r.ack_status };
  }) });
}
async function handleAdminSetPass(env, req, ctx) {
  const body = await req.json().catch(() => ({}));
  const username = clean(body.username, 60).toLowerCase();
  const pass = String(body.password || '');
  if (!username || pass.length < 8) return json({ ok: false, msg: 'اسم المستخدم وكلمة مرور (٨ أحرف+) مطلوبان.' }, 400);
  const u = await one(env, 'SELECT id FROM users WHERE lower(username) = ?', username);
  if (!u) return json({ ok: false, msg: 'لا حساب بهذا الاسم.' }, 404);
  const force = body.mustChange !== false;
  await run(env, 'UPDATE users SET pass = ?, must_change = ?, token_version = COALESCE(token_version,0) + 1 WHERE id = ?',
    packPassword(await hashPassword(pass)), force ? 1 : 0, u.id);
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'admin_setpass', 'target=' + username, req.headers.get('CF-Connecting-IP') || '');
  return json({ ok: true, msg: 'عُيّنت كلمة المرور — سيُطلب تغييرها عند أول دخول.' });
}

/* تغيير كلمة المرور من داخل الحساب (سحابيًا) — يرجّع رمزًا جديدًا */
async function handleMyPassword(env, req, ctx) {
  const body = await req.json().catch(() => ({}));
  const cur = String(body.current || body.old || '');
  const next = String(body.next || body.password || '');
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!cur || !next) return json({ ok: false, msg: 'أدخل الحالية والجديدة.' }, 400);
  if (next.length < 8) return json({ ok: false, msg: 'كلمة المرور ٨ أحرف على الأقل.' }, 400);
  const okp = await verifyPassword(cur, ctx.user.pass);
  if (!okp) return json({ ok: false, msg: 'كلمة المرور الحالية غير صحيحة.' }, 401);
  const v = Number(ctx.user.token_version || 0) + 1;
  await run(env, 'UPDATE users SET pass = ?, must_change = 0, token_version = ? WHERE id = ?',
    packPassword(await hashPassword(next)), v, ctx.user.id);
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'password_changed', '', ip);
  const token = await signToken({ uid: ctx.user.id, role: ctx.user.role, schoolId: ctx.user.school_id, v: v },
    env.TOKEN_SECRET || 'tabaani-dev-secret');
  return json({ ok: true, token, msg: 'تم تغيير كلمة المرور ✓' });
}

/* تعيين كلمات مرور دفعة واحدة (توليد كلمات المرور في التطبيق)
   • المشرف العام: أي حساب.
   • مدير المدرسة/الوكلاء: حسابات مدرستهم فقط. */
async function handleBulkPasswords(env, req, ctx) {
  const isSuper = ctx.user.role === 'super';
  if (!isSuper && ADMIN_ROLES.indexOf(ctx.user.role) === -1) return json({ ok: false, msg: 'غير مصرّح.' }, 403);
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.users) ? body.users.slice(0, 300) : [];
  if (!list.length) return json({ ok: false, msg: 'لا مستخدمين.' }, 400);
  let updated = 0, skipped = 0;
  for (const x of list) {
    const un = clean(x.username, 60).toLowerCase();
    const pw = String(x.password || '');
    if (!un || pw.length < 6) { skipped++; continue; }
    const acc = await one(env, 'SELECT id, school_id FROM users WHERE lower(username) = ?', un);
    if (!acc) { skipped++; continue; }
    if (!isSuper && String(acc.school_id || '') !== String(ctx.user.school_id || '')) { skipped++; continue; }
    await run(env, 'UPDATE users SET pass = ?, must_change = 1, token_version = COALESCE(token_version,0) + 1 WHERE id = ?',
      packPassword(await hashPassword(pw)), acc.id);
    updated++;
  }
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'passwords_generated',
    'حُدّث ' + updated + ' · تُخطّي ' + skipped, req.headers.get('CF-Connecting-IP') || '');
  return json({ ok: true, updated, skipped });
}

/* حذف حساب صريح: المشرف العام لأي حساب، والمدير لحسابات مدرسته فقط */
async function handleDeleteUser(env, req, ctx) {
  const isSuper = ctx.user.role === 'super';
  if (!isSuper && ctx.user.role !== 'principal') return json({ ok: false, msg: 'غير مصرّح.' }, 403);
  const body = await req.json().catch(() => ({}));
  const un = clean(body.username, 60).toLowerCase();
  if (!un) return json({ ok: false, msg: 'اسم المستخدم مطلوب.' }, 400);
  if (un === String(ctx.user.username || '').toLowerCase()) return json({ ok: false, msg: 'لا يمكنك حذف حسابك الحالي.' }, 400);
  const acc = await one(env, 'SELECT id, role, school_id FROM users WHERE lower(username) = ?', un);
  if (!acc) return json({ ok: false, msg: 'لا حساب بهذا الاسم.' }, 404);
  if (!isSuper && String(acc.school_id || '') !== String(ctx.user.school_id || '')) return json({ ok: false, msg: 'خارج نطاق مدرستك.' }, 403);
  if (acc.role === 'super') {
    const n = await one(env, "SELECT COUNT(*) AS n FROM users WHERE role = 'super' AND status = 'active'");
    if (Number(n && n.n) <= 1) return json({ ok: false, msg: 'لا يمكن حذف آخر مشرف عام.' }, 400);
  }
  await run(env, "UPDATE users SET status = 'deleted', token_version = COALESCE(token_version,0) + 1 WHERE id = ?", acc.id);
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'user_deleted', 'target=' + un, req.headers.get('CF-Connecting-IP') || '');
  return json({ ok: true, msg: 'حُذف الحساب.' });
}

/** تهيئة أولية (اختيارية): تنشئ حساب المشرف العام */
async function handleSeed(env, req) {
  const body = await req.json().catch(() => ({}));
  const username = clean(body.username, 40).toLowerCase() || 'admin';
  const exists = await one(env, 'SELECT id FROM users WHERE username = ?', username);
  if (exists) return json({ ok: false, msg: 'الحساب موجود.' }, 409);
  const pw = body.password ? String(body.password) : tempPassword();
  const id = rid('u');
  await run(env, `INSERT INTO users (id,at,school_id,name,role,username,pass,must_change,ack_status,status)
    VALUES (?,?,NULL,?,?,?,?,1,'approved','active')`,
    id, nowMs(), clean(body.name, 80) || 'المشرف العام', 'super', username, packPassword(await hashPassword(pw)));
  return json({ ok: true, username, password: pw });
}

async function servePublic(env, req) {
  if (!env.ASSETS) return json({ ok: true, msg: 'تابعني — الخادم يعمل. اربط الصفحة العامة أو استخدم /api/*' });
  return env.ASSETS.fetch(req);
}
