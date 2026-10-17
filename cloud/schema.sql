-- =============================================================================
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
