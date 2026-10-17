/* ==========================================================================
   lib.js — منطق تابعني السحابي (دوال خالصة)
   --------------------------------------------------------------------------
   يعمل في Worker (Cloudflare) وفي Node (للفحوص) — بلا أي مكتبة خارجية.
   يحتوي: التحقق من المدخلات · تشفير كلمات المرور (PBKDF2) · رموز الجلسات (HMAC)
   · أكواد التفعيل · **البحث المحصور بالصلاحية على الخادم** (لا يُبنى على الواجهة).
   ========================================================================== */

/* ------------------------------- أدوات نصية ------------------------------- */
export function normDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}
export function normPhone(p) {
  let s = normDigits(p).replace(/[^\d+]/g, '');
  if (s.startsWith('+966')) s = '0' + s.slice(4);
  if (s.startsWith('966') && s.length >= 12) s = '0' + s.slice(3);
  return s;
}
export function isValidPhone(p) { return /^05\d{8}$/.test(normPhone(p)); }
export function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
export function clean(s, max = 200) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }


/* --------------------- تنظيف تكرار المستخدمين (مرّة واحدة) ---------------------
   يحدث التكرار عندما تُدفع نسخة محلية قديمة (بمعرّفاتها) إلى نسخة سحابية
   أنشأت الحساب نفسه بمعرّف خادم (u_...). الدمج يحتفظ بمعرّف واحد ويحوّل
   كل المراجع القديمة إليه، فلا تختفي إسنادات أو حضور أو رسائل.
   - preferId: معرّف الجلسة الحالية (يبقى هو الأصل حتى لا ينفصل الدخول عن البيانات).
   - يُفضّل معرّف الخادم u_... ثم الأحدث إنشاءً.
   - يدمج الحقول الناقصة ويأخذ أقوى حالة إقرار (approved > submitted > pending).
   ========================================================================== */
export function dedupeUsers(db, preferId) {
  const res = { merged: 0, map: {} };
  if (!db || !Array.isArray(db.users) || db.users.length < 2) return res;

  const ts = (v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  };
  const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
  const ackRank = (a) => (a && a.status === 'approved' ? 3 : a && a.status === 'submitted' ? 2 : a && a.status === 'pending' ? 1 : 0);

  const groups = new Map();
  db.users.forEach((u, i) => {
    if (!u || typeof u !== 'object') return;
    const un = String(u.username || '').trim().toLowerCase();
    const key = un ? 'u:' + un : 'id:' + String(u.id || ('#' + i));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  });

  const out = [];
  const oldNew = {};
  groups.forEach((arr) => {
    if (arr.length === 1) { out.push(arr[0]); return; }
    const picked = (preferId && arr.filter((x) => x.id === preferId)[0])
      || arr.filter((x) => /^u_/.test(String(x.id || ''))).sort((a, b) => ts(b.createdAt) - ts(a.createdAt))[0]
      || arr.slice().sort((a, b) => ts(b.createdAt) - ts(a.createdAt))[0]
      || arr[0];
    arr.forEach((x) => {
      if (x === picked) return;
      if (x.id && x.id !== picked.id) { oldNew[x.id] = picked.id; res.merged++; }
      Object.keys(x).forEach((k) => {
        if (k === 'id') return;
        if (k === 'ack') {
          if (ackRank(x.ack) > ackRank(picked.ack)) picked.ack = x.ack;
          else if (empty(picked.ack) && x.ack) picked.ack = x.ack;
          return;
        }
        if (k === 'owner') { if (x.owner) picked.owner = true; return; }
        if (empty(picked[k]) && !empty(x[k])) picked[k] = x[k];
      });
    });
    out.push(picked);
  });

  if (!res.merged) return res;
  db.users = out;

  /* تحويل كل مرجع نصّي مطابق لمعرّف مدموج (في أي مجموعة أو حقل متداخل) */
  const keys = Object.keys(oldNew);
  const remap = (v) => {
    if (typeof v === 'string') return oldNew[v] || v;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = remap(v[i]);
      return v;
    }
    if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => { v[k] = remap(v[k]); });
    }
    return v;
  };
  if (keys.length) {
    Object.keys(db).forEach((coll) => { if (coll !== 'users') remap(db[coll]); });
  }
  res.map = oldNew;
  return res;
}

/* ------------------------------ الترميزات ------------------------------ */
export function b64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(arr).toString('base64');
}
export function unb64(str) {
  const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function b64url(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64url(str) { return unb64(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4)); }

/* ------------------------------ كلمات المرور ------------------------------ */
const PBKDF2_ITER = 100000;
function subtle() { return (globalThis.crypto && globalThis.crypto.subtle) || null; }

export async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? unb64(saltB64) : globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return { iter: PBKDF2_ITER, salt: b64(salt), hash: b64(bits) };
}
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  const enc = new TextEncoder();
  const key = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', salt: unb64(parts[2]), iterations: iter, hash: 'SHA-256' }, key, 256);
  return timingSafeEq(b64(bits), parts[3]);
}
export function packPassword(h) { return 'pbkdf2$' + h.iter + '$' + h.salt + '$' + h.hash; }

export function timingSafeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
/** كلمة مرور مؤقتة قوية سهلة القراءة */
export function tempPassword(rand = Math.random) {
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
export async function signToken(payload, secret, ttlSec = 60 * 60 * 24 * 30) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + ttlSec });
  const p = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = b64url(await hmac(secret, p));
  return p + '.' + sig;
}
export async function verifyToken(token, secret) {
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
export function genCode(rand = Math.random) { return String(Math.floor(100000 + rand() * 900000)); }
export async function hashCode(code, email) {
  const data = String(code) + '|' + String(email || '').toLowerCase().trim();
  const bits = new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(data)));
  return b64(bits);
}
export function codeExpiry(minutes = 15, nowMs = Date.now()) { return Math.floor(nowMs / 1000) + minutes * 60; }
export const MAX_CODE_TRIES = 3;

/* --------------------------- تنقية مدخلات التسجيل --------------------------- */
export const PLANS = ['classic', 'pro'];
export const STAGES = ['ابتدائي', 'متوسط', 'ثانوي'];
export const GENDERS = ['boys', 'girls'];

/** يتحقق من طلب تسجيل مدرسة جديدة ويعيد {ok, errors, data} */
export function validateRegistration(input) {
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
export function scopeOf(user) {
  const u = user || {};
  if (u.role === 'super') return { kind: 'all' };
  if (u.role === 'teacher' || u.role === 'student') return { kind: 'self', schoolId: u.schoolId || null, userId: u.id };
  return { kind: 'school', schoolId: u.schoolId || null, userId: u.id };
}
export function teacherClassIds(userId, dataset) {
  const ids = new Set();
  (dataset.classes || []).forEach((k) => { if (k.supervisorId === userId) ids.add(k.id); });
  (dataset.assignments || []).forEach((a) => { if (a.teacherId === userId && a.classId) ids.add(a.classId); });
  const u = (dataset.users || []).find((x) => x.id === userId);
  (u && u.classIds ? u.classIds : []).forEach((c) => ids.add(c));
  return Array.from(ids);
}
export function scopedSearch(user, q, dataset) {
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
export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), Object.assign({
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  }, extra));
}
