/**
 * ============================================================================
 *  تابعني — إرسال البريد (Apps Script) · نسخة مختصرة للبريد فقط
 * ----------------------------------------------------------------------------
 *  الخطوات:
 *   ١) script.google.com ← مشروع جديد ← احذف الموجود والصق هذا الملف كاملًا.
 *   ٢) غيّر السطر KEY إلى مفتاح سري من اختيارك (احفظه — ستحتاجه مع الرابط).
 *   ٣) (تجربة) اختر دالة test ← Run ← اسمح بالصلاحيات ← يصلك بريد تجريبي.
 *   ٤) Deploy ← New deployment ← Web app
 *        Execute as: Me      ·      Who has access: Anyone
 *      ثم انسخ الرابط المنتهي بـ /exec.
 *   ٥) أرسل للمنصة: الرابط + المفتاح ← يُضبطان في الخادم (MAIL_ENDPOINT/MAIL_KEY)
 *      ويصير /api/health ← mail:true.
 * ============================================================================
 */

var KEY = 'ضع-مفتاحا-سريا-من-اختيارك';   /* نفس المفتاح الذي سنضعه في الخادم */

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (KEY && d.key !== KEY) return out({ ok: false, error: 'مفتاح غير صحيح' });
    if (d.action !== 'mail' || !d.to) return out({ ok: false, error: 'طلب غير معروف' });
    MailApp.sendEmail({
      to: d.to,
      subject: d.subject || 'تابعني للخدمات الذكية',
      body: d.body || '',
      htmlBody: d.html || undefined,
      name: 'تابعني للخدمات الذكية'
    });
    return out({ ok: true, to: d.to });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() { return out({ ok: true, service: 'tabaani-mail' }); }

function test() { MailApp.sendEmail('ضع-بريدك@gmail.com', 'اختبار تابعني', 'وصل ✓ — إعداد البريد سليم'); }

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
