#!/usr/bin/env bash
# =============================================================================
# cloud/deploy-token.sh — نشر تابعني بالكامل (بلا متصفح) باستخدام توكن Cloudflare
#   الاستخدام:
#     CF_API_TOKEN=xxx MAIL_ENDPOINT=https://... TG_TOKEN=... bash cloud/deploy-token.sh
#   ملاحظة: تُنشئ D1 · تنفّذ المخطط · تضبط الأسرار · تنشر · تفحص · تُنشئ المشرف العام · تفحص الرابط.
#            التوكن يُستخدم محليًا فقط ولا يُكتب في أي ملف.
# =============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
: "${CF_API_TOKEN:?ضع CF_API_TOKEN (توكن Cloudflare)}"
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
export WRANGLER_SEND_METRICS=false
OK()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
WARN(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }
ERR() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; }

echo "١) التحقق من التوكن"
ACC=$(npx --yes wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
if [ -z "${ACC:-}" ]; then ERR "التوكن غير صالح أو ناقص الصلاحيات (يحتاج Workers + D1)."; exit 1; fi
OK "الحساب: $ACC"
grep -q 'account_id' cloud/wrangler.toml || sed -i "1i account_id = \"$ACC\"" cloud/wrangler.toml

echo "٢) فحص الكود قبل النشر"
node tools/check-cloud.js >/dev/null || { ERR "فحوص المنطق فشلت"; exit 1; }
OK "٤٠ فحصًا نظيفة"

echo "٣) قاعدة D1"
if npx --yes wrangler d1 list 2>/dev/null | grep -qE '\btabaani\b'; then
  WARN "القاعدة موجودة — نتجاوز الإنشاء"
else
  npx --yes wrangler d1 create tabaani 2>&1 | tee /tmp/d1.txt | tail -3
fi
ID=$(npx --yes wrangler d1 list --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);const r=a.find(x=>x.name==='tabaani');console.log(r?r.uuid:'')}catch(e){console.log('')}})")
if [ -n "${ID:-}" ]; then
  node -e "const fs=require('fs');let s=fs.readFileSync('cloud/wrangler.toml','utf8');s=s.replace(/database_id = \"[^\"]*\"/,'database_id = \"$ID\"');fs.writeFileSync('cloud/wrangler.toml',s)"
  OK "database_id = $ID"
else WARN "لم أقرأ معرّف القاعدة — تحقّق من wrangler.toml"; fi

echo "٤) تنفيذ المخطط"
cd cloud && npx --yes wrangler d1 execute tabaani --file=schema.sql --remote 2>&1 | tail -3
OK "الجداول جاهزة"

echo "٥) الأسرار"
SECRET=${TOKEN_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}
printf '%s' "$SECRET" | npx --yes wrangler secret put TOKEN_SECRET >/dev/null && OK "TOKEN_SECRET"
if [ -n "${MAIL_ENDPOINT:-}" ]; then printf '%s' "$MAIL_ENDPOINT" | npx --yes wrangler secret put MAIL_ENDPOINT >/dev/null && OK "MAIL_ENDPOINT"; else WARN "بلا MAIL_ENDPOINT (لن تُرسل أكواد التفعيل بالبريد)"; fi
if [ -n "${TG_TOKEN:-}" ]; then printf '%s' "$TG_TOKEN" | npx --yes wrangler secret put TG_TOKEN >/dev/null && OK "TG_TOKEN"; else WARN "بلا TG_TOKEN (لن تصل تنبيهات تلقرام)"; fi
SEED=${SEED_KEY:-$(node -e "console.log(require('crypto').randomBytes(12).toString('hex'))")}
printf '%s' "$SEED" | npx --yes wrangler secret put SEED_KEY >/dev/null && OK "SEED_KEY محفوظ"

echo "٦) النشر"
npx --yes wrangler deploy 2>&1 | tee /tmp/dep.txt | tail -6
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/dep.txt | head -1)
[ -n "${URL:-}" ] && { printf '%s' "$URL" > .worker-url; OK "الرابط: $URL"; } || { ERR "لم أقرأ الرابط"; exit 1; }

echo "٧) فحص الخادم"
sleep 6
curl -sS -m 20 "$URL/api/health"; echo

echo "٨) إنشاء حساب المشرف العام"
curl -sS -m 25 -X POST "$URL/api/seed?key=$SEED" -H 'Content-Type: application/json' \
  -d '{"username":"admin","name":"المشرف العام","password":"Tabaani@2026"}' ; echo
printf '%s' "$SEED" > .seed-key

echo "٩) فحص الحماية على الرابط المنشور"
cd .. && node tools/check-deploy.js "$URL" || WARN "راجع الفحوص أعلاه"
echo
OK "تمّ النشر بالكامل."
echo "  الرابط:   $URL"
echo "  الصفحة:   https://abdmmm2.github.io/tabaani/site/register.html?api=$URL"
echo "  المشرف:   admin / Tabaani@2026  (غيّرها بعد أول دخول)"
echo "  المفتاح:  cloud/.seed-key"
