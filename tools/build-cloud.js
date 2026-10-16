#!/usr/bin/env node
/* =============================================================================
   tools/build-cloud.js — يولّد cloud/schema-inline.js من cloud/schema.sql
   الفائدة: الخادم ينشئ جداوله **بنفسه** عند أول تشغيل (لا لصق في Console إطلاقًا).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'cloud', 'schema.sql'), 'utf8');
const esc = src.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const out = `/* =============================================================================
   schema-inline.js — **مُولَّد آليًا** من cloud/schema.sql (لا تعدّله يدويًا)
   التوليد: node tools/build-cloud.js
   الغرض: ينفّذه الخادم لإنشاء الجداول تلقائيًا عند أول تشغيل.
   ========================================================================== */
export const SCHEMA_SQL = \`${esc}\`;

/** تقسيم السكربت إلى جمل مستقلة (بلا تعليقات) */
export function schemaStatements() {
  return SCHEMA_SQL.split(';')
    .map((s) => s.replace(/--[^\\n]*/g, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ';');
}
`;
fs.writeFileSync(path.join(ROOT, 'cloud', 'schema-inline.js'), out);
const n = (src.match(/CREATE TABLE/gi) || []).length;
const idx = (src.match(/CREATE INDEX/gi) || []).length;
console.log('✓ cloud/schema-inline.js — ' + n + ' جداول · ' + idx + ' فهارس · ' + Math.round(out.length / 1024) + ' ك.ب');
