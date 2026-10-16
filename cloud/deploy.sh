#!/usr/bin/env bash
# =============================================================================
# cloud/deploy.sh — نشر تابعني على Cloudflare (١٠ دقائق · بلا بطاقة)
#   التشغيل:  bash cloud/deploy.sh
#   يفعل: تحقّق الأدوات → دخول → إنشاء قاعدة D1 → تنفيذ المخطط → الأسرار → النشر → فحص صحة الخادم
# =============================================================================
set -u
cd "$(dirname "$0")" || exit 1

say()  { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

command -v node >/dev/null || die "Node.js مطلوب (نزّله من nodejs.org ثم أعد المحاولة)."
command -v npx  >/dev/null || die "npx غير متوفّر — تأكّد من تثبيت Node.js."

say "١/٧ فحص الكود محليًا (بلا شبكة)"
node ../tools/check-cloud.js | tail -3 || die "فحوص منطق الخادم فشلت — أوقفنا النشر."

say "٢/٧ الدخول إلى حساب Cloudflare (سيفتح المتصفح — سجّل دخولك ثم ارجع هنا)"
npx --yes wrangler whoami >/dev/null 2>&1 || npx --yes wrangler login

say "٣/٧ إنشاء قاعدة البيانات D1"
npx --yes wrangler d1 create tabaani 2>&1 | tee /tmp/tabaani-d1.txt
ID=$(grep -oE 'database_id = "[^"]+"' /tmp/tabaani-d1.txt | head -1 | cut -d'"' -f2)
if [ -n "${ID:-}" ]; then
  python3 - "$ID" <<'PY' 2>/dev/null || sed -i "s/database_id = \".*\"/database_id = \"$ID\"/" wrangler.toml
import io,sys,re
p='wrangler.toml'; s=io.open(p,encoding='utf-8').read()
s=re.sub(r'database_id = ".*"', 'database_id = "%s"' % sys.argv[1], s, count=1)
io.open(p,'w',encoding='utf-8').write(s)
PY
  echo "✓ كُتب database_id في wrangler.toml"
else
  warn "لم أقرأ database_id تلقائيًا — إن كانت القاعدة موجودة، انسخ المعرّف إلى wrangler.toml يدويًا."
fi

say "٤/٧ تنفيذ مخطط الجداول على القاعدة"
npx --yes wrangler d1 execute tabaani --file=schema.sql --remote | tail -5

say "٥/٧ ضبط الأسرار (اكتب القيمة عند الطلب)"
if [ ! -f .secrets-done ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  printf '%s' "$SECRET" | npx --yes wrangler secret put TOKEN_SECRET
  read -r -p "رابط Apps Script المنشور (MAIL_ENDPOINT) — Enter لتخطي: " MAIL || true
  [ -n "${MAIL:-}" ] && printf '%s' "$MAIL" | npx --yes wrangler secret put MAIL_ENDPOINT
  read -r -p "توكن بوت تلقرام (TG_TOKEN) — Enter لتخطي: " TG || true
  [ -n "${TG:-}" ] && printf '%s' "$TG" | npx --yes wrangler secret put TG_TOKEN
  printf '%s' "$(node -e "console.log(require('crypto').randomBytes(12).toString('hex'))")" | npx --yes wrangler secret put SEED_KEY
  touch .secrets-done
  echo "✓ حُفظت الأسرار (TOKEN_SECRET عشوائي · SEED_KEY للتأسيس · والباقي إن أدخلته)"
else
  echo "✓ الأسرار مضبوطة سابقًا (احذف cloud/.secrets-done لإعادة الضبط)"
fi

say "٦/٧ النشر"
npx --yes wrangler deploy 2>&1 | tee /tmp/tabaani-deploy.txt | tail -8
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/tabaani-deploy.txt | head -1)
[ -n "${URL:-}" ] && echo "✓ رابطك: $URL" || warn "لم أقرأ الرابط — اقرأه من مخرجات النشر أعلاه."

if [ -n "${URL:-}" ]; then
  say "٧/٧ فحص صحة الخادم"
  curl -sS -m 20 "$URL/api/health" || warn "لم يستجب /api/health — جرّب بعد دقيقة."
  printf '\n\n%s\n' "$URL" > .worker-url
  echo "✓ حُفظ الرابط في cloud/.worker-url"
  echo
  echo "الخطوة الأخيرة يدويًا (دقيقة واحدة): ضع الرابط في"
  echo "  • cloud/public/index.html  → السطر: var API = ..."
  echo "  • المنصة → المزامنة السحابية ← رابط الخادم"
fi

say "تمّ — أنشئ حساب المشرف العام مرّة واحدة:"
echo "curl -X POST \"$URL/api/seed?key=\$(cat cloud/.seed-key 2>/dev/null || echo 'المفتاح الذي أدخلته')\" -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"name\":\"المشرف العام\"}'"
echo
echo "ثم: افتح $URL وأكمل التسجيل تجربةً واحدة، أو اذهب للمنصة ← المزامنة السحابية ← اقرن."
