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
import {
  validateRegistration, genCode, hashCode, codeExpiry, MAX_CODE_TRIES,
  hashPassword, verifyPassword, packPassword, tempPassword,
  signToken, verifyToken, scopedSearch, json, clean, normDigits, isValidPhone
} from './lib.js';

const rid = (p = 'r') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowSec = () => Math.floor(Date.now() / 1000);
const nowMs = () => Date.now();

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
  const u = await one(env, 'SELECT * FROM users WHERE lower(username) = ?', username);
  if (!u) return json({ ok: false, msg: 'بيانات الدخول غير صحيحة.' }, 401);
  if (u.status !== 'active') return json({ ok: false, msg: 'الحساب موقوف — راجع إدارة المدرسة.' }, 403);
  const okp = await verifyPassword(pass, u.pass);
  if (!okp) return json({ ok: false, msg: 'بيانات الدخول غير صحيحة.' }, 401);
  const token = await signToken({ uid: u.id, role: u.role, schoolId: u.school_id }, env.TOKEN_SECRET || 'tabaani-dev-secret');
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

async function handleSyncGet(env, req, ctx) {
  if (!ctx.user.school_id) return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  const row = await one(env, 'SELECT version,json,updated_at FROM data WHERE school_id = ?', ctx.user.school_id);
  return json({ ok: true, version: row ? row.version : 0, updatedAt: row ? row.updated_at : 0,
    data: row ? JSON.parse(row.json) : null, schoolId: ctx.user.school_id });
}
async function handleSyncPut(env, req, ctx) {
  if (!ctx.user.school_id) return json({ ok: false, msg: 'حسابك غير مرتبط بمدرسة.' }, 400);
  if (['teacher', 'student'].indexOf(ctx.user.role) > -1) return json({ ok: false, msg: 'الرفع السحابي متاح لمدير المدرسة ومن ينوب عنه.' }, 403);
  const body = await req.json().catch(() => ({}));
  const incoming = body && body.data;
  if (!incoming || typeof incoming !== 'object') return json({ ok: false, msg: 'لا بيانات صالحة.' }, 400);
  const cur = await one(env, 'SELECT version FROM data WHERE school_id = ?', ctx.user.school_id);
  const base = Number(body.baseVersion || 0);
  if (cur && Number(base || 0) < cur.version) {
    /* لا نكتب فوق نسخة أحدث — نُعيد الأحدث ليحلّ المدير التعارض */
    const latest = await one(env, 'SELECT version,json FROM data WHERE school_id = ?', ctx.user.school_id);
    return json({ ok: false, conflict: true, version: cur.version, latest: JSON.parse(latest.json),
      msg: 'توجد نسخة أحدث على الخادم (v' + cur.version + ') — راجعها قبل الرفع.' }, 409);
  }
  const version = (cur ? cur.version : 0) + 1;
  const text = JSON.stringify(incoming);
  if (text.length > 4_000_000) return json({ ok: false, msg: 'حجم البيانات كبير (٤ م.ب كحد أقصى للنسخة).' }, 413);
  if (cur) await run(env, 'UPDATE data SET version = ?, json = ?, updated_at = ?, by_user = ? WHERE school_id = ?',
    version, text, nowMs(), ctx.user.username, ctx.user.school_id);
  else await run(env, 'INSERT INTO data (school_id,version,json,updated_at,by_user) VALUES (?,?,?,?,?)',
    ctx.user.school_id, version, text, nowMs(), ctx.user.username);
  await audit(env, ctx.user.username, ctx.user.role, ctx.user.school_id, 'sync_put', 'v' + version, '');
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
      if (p === '/api/register' && req.method === 'POST') res = await handleRegister(env, req);
      else if (p === '/api/activation/request' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        res = await handleActivationRequest(env, body, req);
      } else if (p === '/api/activation/verify' && req.method === 'POST') res = await handleActivationVerify(env, req);
      else if (p === '/api/auth/login' && req.method === 'POST') res = await handleLogin(env, req);
      else if (p === '/api/health') res = json({ ok: true, service: 'tabaani-cloud', at: nowMs(), mail: !!env.MAIL_ENDPOINT, telegram: !!env.TG_TOKEN });
      else {
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
        else if (p === '/api/admin/requests' && ctx) res = await handleAdminRequests(env, req, ctx);
        else if (p === '/api/admin/approve' && ctx) res = await handleAdminApprove(env, req, ctx);
        else if (p === '/api/notify' && ctx) res = await handleNotify(env, req, ctx);
        else if (p === '/' || p === '/index.html') res = await servePublic(env, req);
        else if (p === '/api/seed' && req.method === 'POST' && (env.SEED_KEY || 'seed') === (url.searchParams.get('key') || '')) res = await handleSeed(env, req);
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
