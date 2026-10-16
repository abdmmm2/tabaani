#!/usr/bin/env bash
# يحزم قوالب العميل في ملف مضغوط واحد (يعمل بلا أدوات خارجية — python3 فقط)
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import zipfile, os, glob
out = 'templates/ملفات-تأسيس-المدرسة.zip'
files = sorted(glob.glob('templates/*.xlsx') + glob.glob('templates/*.csv') + glob.glob('templates/*.txt'))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        if f.endswith('.zip'): continue
        z.write(f, os.path.basename(f))
print('✓', out, '·', len([f for f in files if not f.endswith('.zip')]), 'ملفًا')
PY
