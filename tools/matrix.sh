#!/usr/bin/env bash
# =============================================================================
# tools/matrix.sh — فحص شامل قبل أي تسليم
# ---------------------------------------------------------------------------
# يشغّل بالترتيب:
#   ١) فحوص ساكنة  : صياغة JS · JSON · وجود ملفات sw.js · الموارد المحلية · رقم الإصدار
#   ٢) فحص الأدوار : node tools/roles-e2e.js    (دخول كل دور · العزل · صفر أخطاء JS)
#   ٣) فحص الجوال  : node tools/mobile-check.js (تجاوز أفقي · القائمة · أهداف اللمس)
#
# التشغيل:  bash tools/matrix.sh
# إن لم يكن Chrome في موضع معروف:  CHROME_BIN=/path/to/chrome bash tools/matrix.sh
# =============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js مطلوب لتشغيل الفحوص (لم يُعثر على node)." >&2
  exit 1
fi

passed=0
failed=0
declare -a summary=()

run_stage () {
  local label="$1"; shift
  echo
  if "$@"; then
    passed=$((passed + 1))
    summary+=("✓  ${label}")
  else
    failed=$((failed + 1))
    summary+=("✗  ${label}")
  fi
}

run_stage "فحوص ساكنة"      node tools/static-checks.js
run_stage "فحص الأدوار والعزل" node tools/roles-e2e.js
run_stage "فحص الجوال"       node tools/mobile-check.js

echo
echo "════════════════════════════════════════════════"
echo "  ملخص الفحص الشامل — تابعني للخدمات الذكية"
echo "════════════════════════════════════════════════"
for line in "${summary[@]}"; do echo "  ${line}"; done
echo "────────────────────────────────────────────────"
if [ "$failed" -eq 0 ]; then
  echo "  ✅ كل المراحل نجحت (${passed}/$((passed + failed)))."
  echo "════════════════════════════════════════════════"
  exit 0
fi
echo "  ✗ مراحل فاشلة: ${failed} من $((passed + failed)) — راجع التفاصيل أعلاه."
echo "════════════════════════════════════════════════"
exit 1
