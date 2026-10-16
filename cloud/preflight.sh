#!/usr/bin/env bash
# =============================================================================
# cloud/preflight.sh — فحص توكن Cloudflare قبل النشر (يخبرك بأي صلاحية ناقصة بالاسم)
#   الاستخدام: CF_API_TOKEN=xxx bash cloud/preflight.sh
# =============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
: "${CF_API_TOKEN:?ضع CF_API_TOKEN}"
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
export WRANGLER_SEND_METRICS=false
OK(){ printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
NO(){ printf '\033[1;31m✗ %s\033[0m\n' "$*"; }
echo "١) صحة التوكن والحساب…"
W=$(npx --yes wrangler whoami 2>&1)
TOK=$(echo "$W" | grep -oE '[0-9a-f]{32}' | head -1)
echo "$W" | grep -qiE 'not authenticated|invalid|Unauthorized' && { NO "التوكن غير صالح (أعد إنشاءه من قالب Edit Cloudflare Workers)"; exit 1; }
[ -n "${TOK:-}" ] && OK "الحساب: $TOK" || { NO "لم أقرأ معرّف الحساب — التوكن ناقص صلاحية"; echo "$W" | tail -4; }

echo "٢) صلاحية Workers Scripts (النشر)…"
if npx --yes wrangler deploy --dry-run --outdir=/tmp/wdry >/tmp/wdry.log 2>&1; then OK "النشر متاح"; else
  grep -qi 'permission\|403\|forbidden' /tmp/wdry.log && NO "ناقص: Account → Workers Scripts → Edit" || OK "بناء الخادم سليم (الرسائل: $(tail -1 /tmp/wdry.log | cut -c1-60))"; fi

echo "٣) صلاحية Workers Scripts (قراءة قائمة السكربتات)…"
npx --yes wrangler deployments list >/dev/null 2>&1 && OK "قراءة السكربتات متاحة" || NO "ناقص (اختياري): Account → Workers Scripts → Read"

echo "٤) صلاحية D1 (قاعدة البيانات)…"
if npx --yes wrangler d1 list >/tmp/d1l.txt 2>&1; then OK "D1 متاح ($(grep -c . /tmp/d1l.txt) سطر)"; else
  NO "ناقص: Account → D1 → Edit  (أضفه في نفس صفحة التوكن ثم أعد النسخ)"; fi

echo
echo "الخلاصة: إن ظهر ✗ أعلاه، ارجع لصفحة التوكن ← Edit ← أضف الصلاحية الناقصة ← Continue ← Save."
