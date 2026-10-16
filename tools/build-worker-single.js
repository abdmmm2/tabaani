#!/usr/bin/env node
/* =============================================================================
   tools/build-worker-single.js — يدمج cloud/lib.js + cloud/worker.js في ملف واحد
   -----------------------------------------------------------------------------
   الفائدة: نشر الخادم من **لوحة Cloudflare بالمتصفح** بلصق ملف واحد (بلا توكن وبلا Node).
   الاستخدام: node tools/build-worker-single.js     (ويُشغَّل تلقائيًا داخل فحص السحابة)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CLOUD = path.join(ROOT, 'cloud');

function read(f) { return fs.readFileSync(path.join(CLOUD, f), 'utf8'); }

const lib = read('lib.js')
  .replace(/^export\s+(async\s+)?function\s/gm, (m, a) => (a ? 'async function ' : 'function '))
  .replace(/^export\s+const\s/gm, 'const ');

const worker = read('worker.js')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/lib\.js['"];\s*/m, '');

const out = `/* =============================================================================
   تابعني — خادم Cloudflare في **ملف واحد** (مُولَّد آليًا — لا تعدّله يدويًا)
   المصدر: cloud/lib.js + cloud/worker.js  ·  التوليد: node tools/build-worker-single.js
   النشر من اللوحة: Workers & Pages ← Create ← Worker ← Edit code ← الصق هذا كاملًا ← Deploy
   ثم: Bindings = D1 باسم DB · Variables & Secrets = TOKEN_SECRET · MAIL_ENDPOINT · TG_TOKEN · SEED_KEY
   ========================================================================== */
/* eslint-disable */
/* ---------- lib.js ---------- */
${lib}

/* ---------- worker.js ---------- */
${worker}
`;
fs.writeFileSync(path.join(CLOUD, 'worker-single.js'), out);

/* تحقّق ذاتي: كل الدوال والمسارات موجودة */
const need = ['function validateRegistration', 'function scopedSearch', 'function hashPassword', 'function verifyPassword',
  'function signToken', 'function verifyToken', 'function genCode', 'function json', 'export default',
  "'/api/register'", "'/api/auth/login'", "'/api/sync'", "'/api/search'", "'/api/ack/approve'", "'/api/admin/approve'"];
const missing = need.filter((n) => out.indexOf(n) === -1);
if (missing.length) { console.error('✗ ناقص في الملف المدموج: ' + missing.join(', ')); process.exit(1); }
const kb = Math.round(Buffer.byteLength(out, 'utf8') / 1024);
console.log('✓ cloud/worker-single.js — ' + kb + ' ك.ب · كل الدوال والمسارات موجودة (' + need.length + ' تحقّقًا)');
