/* =============================================================================
   تابعني — خادم Cloudflare في **ملف واحد** (مُولَّد آليًا — لا تعدّله يدويًا)
   المصدر: cloud/lib.js + cloud/worker.js  ·  التوليد: node tools/build-worker-single.js
   النشر من اللوحة: Workers & Pages ← Create ← Worker ← Edit code ← الصق هذا كاملًا ← Deploy
   ثم: Bindings = D1 باسم DB · Variables & Secrets = TOKEN_SECRET · MAIL_ENDPOINT · TG_TOKEN · SEED_KEY
   ========================================================================== */
/* eslint-disable */
/* ---------- lib.js ---------- */
/* ==========================================================================
   lib.js — منطق تابعني السحابي (دوال خالصة)
   --------------------------------------------------------------------------
   يعمل في Worker (Cloudflare) وفي Node (للفحوص) — بلا أي مكتبة خارجية.
   يحتوي: التحقق من المدخلات · تشفير كلمات المرور (PBKDF2) · رموز الجلسات (HMAC)
   · أكواد التفعيل · **البحث المحصور بالصلاحية على الخادم** (لا يُبنى على الواجهة).
   ========================================================================== */

/* ------------------------------- أدوات نصية ------------------------------- */
function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}
function normPhone(p) {
  let s = normDigits(p).replace(/[^\d+]/g, '');
  if (s.startsWith('+966')) s = '0' + s.slice(4);
  if (s.startsWith('966') && s.length >= 12) s = '0' + s.slice(3);
  return s;
}
function isValidPhone(p) { return /^05\d{8}$/.test(normPhone(p)); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
function clean(s, max = 200) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

/* ------------------------------ الترميزات ------------------------------ */
function b64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(arr).toString('base64');
}
function unb64(str) {
  const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64url(str) { return unb64(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4)); }

/* ------------------------------ كلمات المرور ------------------------------ */
const PBKDF2_ITER = 100000;
function subtle() { return (globalThis.crypto && globalThis.crypto.subtle) || null; }

async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? unb64(saltB64) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return { iter: PBKDF2_ITER, salt: b64(salt), hash: b64(bits) };
}
async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  const enc = new TextEncoder();
  const key = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: unb64(parts[2]), iterations: iter, hash: 'SHA-256' }, key, 256);
  return timingSafeEq(b64(bits), parts[3]);
}
function packPassword(h) { return 'pbkdf2$' + h.iter + '$' + h.salt + '$' + h.hash; }

function timingSafeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
/** كلمة مرور مؤقتة قوية سهلة القراءة */
function tempPassword(rand = Math.random) {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', S = '@#$%';
  const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(rand() * set.length)]).join('');
  return pick(L, 2) + pick('abcdefghjkmnpqrstuvwxyz', 3) + pick(D, 3) + pick(S, 1);
}

/* ------------------------------ رموز الجلسات ------------------------------ */
async function hmac(secret, dataStr) {
  const enc = new TextEncoder();
  const key = await subtle().importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, enc.encode(dataStr)));
}
async function signToken(payload, secret, ttlSec = 60 * 60 * 24 * 30) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + ttlSec });
  const p = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = b64url(await hmac(secret, p));
  return p + '.' + sig;
}
async function verifyToken(token, secret) {
  const [p, sig] = String(token || '').split('.');
  if (!p || !sig) return null;
  const expect = b64url(await hmac(secret, p));
  if (!timingSafeEq(sig, expect)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(p))); } catch (e) { return null; }
  if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/* ------------------------------ أكواد التفعيل ------------------------------ */
function genCode(rand = Math.random) { return String(Math.floor(100000 + rand() * 900000)); }
async function hashCode(code, email) {
  const data = String(code) + '|' + String(email || '').toLowerCase().trim();
  const bits = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(data)));
  return b64(bits);
}
function codeExpiry(minutes = 15, nowMs = Date.now()) { return Math.floor(nowMs / 1000) + minutes * 60; }
const MAX_CODE_TRIES = 3;

/* --------------------------- تنقية مدخلات التسجيل --------------------------- */
const PLANS = ['classic', 'pro'];
const STAGES = ['ابتدائي', 'متوسط', 'ثانوي'];
const GENDERS = ['boys', 'girls'];

/** يتحقق من طلب تسجيل مدرسة جديدة ويعيد {ok, errors, data} */
function validateRegistration(input) {
  const d = input || {};
  const errors = {};
  const data = {
    schoolName: clean(d.schoolName, 120),
    region: clean(d.region, 60),
    city: clean(d.city, 60),
    stages: (Array.isArray(d.stages) ? d.stages : []).map((s) => clean(s, 20)).filter((s) => STAGES.indexOf(s) > -1),
    gender: GENDERS.indexOf(d.gender) > -1 ? d.gender : '',
    plan: PLANS.indexOf(d.plan) > -1 ? d.plan : 'classic',
    principalName: clean(d.principalName, 120),
    phone: normPhone(d.phone),
    email: clean(d.email, 160).toLowerCase(),
    note: clean(d.note, 600),
    paid: clean(d.paid, 40),
    studentsApprox: parseInt(normDigits(d.studentsApprox), 10) || 0
  };
  if (data.schoolName.length < 3) errors.schoolName = 'اسم المدرسة مطلوب (٣ أحرف على الأقل).';
  if (!data.region) errors.region = 'المنطقة مطلوبة.';
  if (!data.city) errors.city = 'المدينة مطلوبة.';
  if (!data.stages.length) errors.stages = 'اختر مرحلة واحدة على الأقل.';
  if (!data.gender) errors.gender = 'حدّد (بنين / بنات).';
  if (data.principalName.length < 3) errors.principalName = 'اسم مدير المدرسة مطلوب.';
  if (!isValidPhone(data.phone)) errors.phone = 'جوال سعودي غير صحيح (مثال: 05xxxxxxxx).';
  if (!isValidEmail(data.email)) errors.email = 'بريد إلكتروني غير صحيح — عليه يُرسل كود التفعيل.';
  return { ok: Object.keys(errors).length === 0, errors, data };
}

/* ------------------- البحث المحصور بالصلاحية (على الخادم) ------------------- */
/**
 * نطاقات: all (المشرف العام) · school (مدير/وكيل/محاسب/دعم: مدرسته) · self (معلم/طالب: فصوله فقط)
 * dataset = { schools, users, classes, students } — وكلها صفوف فيها schoolId (والطلاب فيها classId).
 */
function scopeOf(user) {
  const u = user || {};
  if (u.role === 'super') return { kind: 'all' };
  if (u.role === 'teacher' || u.role === 'student') return { kind: 'self', schoolId: u.schoolId || null, userId: u.id };
  return { kind: 'school', schoolId: u.schoolId || null, userId: u.id };
}
function teacherClassIds(userId, dataset) {
  const ids = new Set();
  (dataset.classes || []).forEach((k) => { if (k.supervisorId === userId) ids.add(k.id); });
  (dataset.assignments || []).forEach((a) => { if (a.teacherId === userId && a.classId) ids.add(a.classId); });
  const u = (dataset.users || []).find((x) => x.id === userId);
  (u && u.classIds ? u.classIds : []).forEach((c) => ids.add(c));
  return Array.from(ids);
}
function scopedSearch(user, q, dataset) {
  const term = String(q == null ? '' : q).trim().toLowerCase();
  const sc = scopeOf(user);
  const out = { scope: sc.kind, total: 0, groups: [] };
  if (term.length < 1) return out;
  const ds = dataset || {};
  const mine = sc.kind === 'self' ? teacherClassIds(sc.userId, ds) : [];
  const hit = (v) => String(v == null ? '' : v).toLowerCase().indexOf(term) > -1;
  const any = (row, keys) => keys.some((k) => hit(row[k]));
  const inSchool = (row) => sc.kind === 'all' || (sc.schoolId && row.schoolId === sc.schoolId);

  const push = (label, items) => { if (items.length) { out.groups.push({ label, items }); out.total += items.length; } };

  if (sc.kind === 'all') {
    push('المدارس', (ds.schools || []).filter((s) => any(s, ['name', 'region', 'city'])).map((s) => ({ kind: 'school', id: s.id, schoolId: s.id, title: s.name })));
  }
  push('المستخدمون', (ds.users || []).filter((u) => {
    if (!inSchool(u)) return false;
    if (sc.kind === 'self') return u.id === sc.userId;                 /* المعلم: لا يرى غيره إطلاقًا */
    return any(u, ['name', 'username', 'phone', 'email']);
  }).map((u) => ({ kind: 'user', id: u.id, schoolId: u.schoolId, title: u.name, sub: u.role })));

  push('الطلاب', (ds.students || []).filter((s) => {
    if (!inSchool(s)) return false;
    if (sc.kind === 'self' && mine.indexOf(s.classId) === -1) return false;
    return any(s, ['name', 'nationalId', 'guardianPhone']);
  }).map((s) => ({ kind: 'student', id: s.id, schoolId: s.schoolId, title: s.name, sub: s.classId })));

  push('الفصول', (ds.classes || []).filter((k) => {
    if (!inSchool(k)) return false;
    if (sc.kind === 'self' && mine.indexOf(k.id) === -1) return false;
    return any(k, ['grade', 'section', 'room']);
  }).map((k) => ({ kind: 'class', id: k.id, schoolId: k.schoolId, title: (k.grade || '') + ' / ' + (k.section || '') })));
  return out;
}

/* ------------------------------- ردود JSON ------------------------------- */
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), Object.assign({
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  }, extra));
}


/* ---------- schema-inline.js ---------- */
/* =============================================================================
   schema-inline.js — **مُولَّد آليًا** من cloud/schema.sql (لا تعدّله يدويًا)
   التوليد: node tools/build-cloud.js
   الغرض: ينفّذه الخادم لإنشاء الجداول تلقائيًا عند أول تشغيل.
   ========================================================================== */
const SCHEMA_SQL = `-- =============================================================================
-- تابعني — مخطط قاعدة البيانات على Cloudflare D1 (مجاني)
-- التنفيذ:  npx wrangler d1 execute tabaani --file=cloud/schema.sql --remote
-- =============================================================================

-- طلبات تسجيل المدارس (الواجهة العامة — البوت/الصفحة)
CREATE TABLE IF NOT EXISTS registrations (
  id            TEXT PRIMARY KEY,
  at            INTEGER NOT NULL,
  school_name   TEXT NOT NULL,
  region        TEXT NOT NULL,
  city          TEXT NOT NULL,
  stages        TEXT NOT NULL,              -- JSON array
  gender        TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'classic',
  principal     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL,
  note          TEXT DEFAULT '',
  paid_note     TEXT DEFAULT '',
  students_approx INTEGER DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new', -- new | code_sent | verified | approved | rejected | onboarded
  school_id     TEXT,
  ip            TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reg_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);

-- أكواد التفعيل (تُخزَّن مُجزَّأةً — لا يُحفظ الكود نفسه)
CREATE TABLE IF NOT EXISTS activation_codes (
  id         TEXT PRIMARY KEY,
  reg_id     TEXT NOT NULL,
  email      TEXT NOT NULL,
  hash       TEXT NOT NULL,
  at         INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_code_reg ON activation_codes(reg_id);
CREATE INDEX IF NOT EXISTS idx_code_email ON activation_codes(email);

-- أكواد استعادة كلمة المرور (تُخزَّن مُجزَّأةً — لا يُحفظ الكود نفسه)
CREATE TABLE IF NOT EXISTS reset_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  ident      TEXT NOT NULL,
  email      TEXT NOT NULL,
  hash       TEXT NOT NULL,
  at         INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_ident ON reset_codes(ident);

-- المدارس (نسخة مرجعية على الخادم)
CREATE TABLE IF NOT EXISTS schools (
  id      TEXT PRIMARY KEY,
  at      INTEGER NOT NULL,
  name    TEXT NOT NULL,
  region  TEXT NOT NULL,
  city    TEXT NOT NULL,
  gender  TEXT NOT NULL,
  plan    TEXT NOT NULL DEFAULT 'classic',
  license TEXT NOT NULL DEFAULT 'active',   -- active | suspended | expired
  code    TEXT UNIQUE                       -- معرّف مختصر للمدرسة
);

-- المستخدمون (كلمات المرور مُجزَّأة PBKDF2 — لا تُخزَّن صريحة أبدًا)
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  at           INTEGER NOT NULL,
  school_id    TEXT,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  username     TEXT UNIQUE NOT NULL,
  pass         TEXT NOT NULL,               -- pbkdf2$iter$salt$hash
  email        TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  telegram     TEXT DEFAULT '',
  must_change  INTEGER NOT NULL DEFAULT 1,
  ack_status   TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | approved
  ack_doc      TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',
  class_ids    TEXT DEFAULT ''              -- JSON array (للمعلمين)
);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- الإقرارات (سجل الاعتماد: من اعتمد متى)
CREATE TABLE IF NOT EXISTS acks (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  user_id    TEXT NOT NULL,
  school_id  TEXT,
  doc_no     TEXT NOT NULL,
  status     TEXT NOT NULL,                 -- submitted | approved | reopened
  approved_by TEXT DEFAULT '',
  note       TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_acks_user ON acks(user_id);

-- بيانات المدرسة (مزامنة: ملف JSON مُرقَّم بالإصدار — آخر نسخة تفوز)
CREATE TABLE IF NOT EXISTS data (
  school_id  TEXT PRIMARY KEY,
  version    INTEGER NOT NULL DEFAULT 0,
  json       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  by_user    TEXT DEFAULT '',
  device     TEXT DEFAULT ''
);

-- سجل الإرسال (تلقرام/إيميل) — لمعرفة ما وصل فعلًا
CREATE TABLE IF NOT EXISTS outbox (
  id        TEXT PRIMARY KEY,
  at        INTEGER NOT NULL,
  school_id TEXT,
  user_id   TEXT,
  channel   TEXT NOT NULL,                 -- telegram | email
  to_val    TEXT DEFAULT '',
  subject   TEXT DEFAULT '',
  body      TEXT DEFAULT '',
  ok        INTEGER NOT NULL DEFAULT 0,
  error     TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_outbox_school ON outbox(school_id);

-- سجل التغييرات (من فعل ماذا — للتدقيق)
CREATE TABLE IF NOT EXISTS audit (
  id        TEXT PRIMARY KEY,
  at        INTEGER NOT NULL,
  actor     TEXT DEFAULT '',
  role      TEXT DEFAULT '',
  school_id TEXT DEFAULT '',
  action    TEXT NOT NULL,
  detail    TEXT DEFAULT '',
  ip        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
`;

/** تقسيم السكربت إلى جمل مستقلة (بلا تعليقات) */
function schemaStatements() {
  return SCHEMA_SQL.split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ';');
}


/* ---------- worker.js ---------- */
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
const rid = (p = 'r') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowSec = () => Math.floor(Date.now() / 1000);
const nowMs = () => Date.now();

/* --------------------- تهيئة الجداول تلقائيًا (self-migrate) --------------------- */
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return { ok: true, skipped: true };
  try {
    await one(env, 'SELECT COUNT(*) AS n FROM users');
    schemaReady = true;
    return { ok: true, already: true };
  } catch (e) {
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
      return { ok: true, created: true, statements: done, tables: (SCHEMA_SQL.match(/CREATE TABLE/gi) || []).length };
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
        const r = await ensureSchema(env);
        res = json(r.ok ? { ok: true, msg: 'الجداول جاهزة', ...r, tables: r.tables || 8 } : { ok: false, msg: 'تعذّر إنشاء الجداول', error: r.error }, r.ok ? 200 : 500);
      }
      else if (p === '/api/register' && req.method === 'POST') res = await handleRegister(env, req);
      else if (p === '/api/activation/request' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        res = await handleActivationRequest(env, body, req);
      } else if (p === '/api/activation/verify' && req.method === 'POST') res = await handleActivationVerify(env, req);
      else if (p === '/api/auth/forgot' && req.method === 'POST') res = await handleForgot(env, req);
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

