/**
 * ============================================================================
 * وسيط إرسال رسائل تلقرام — منصة تابعني للخدمات التعليمية
 * ----------------------------------------------------------------------------
 * وظيفته: يحفظ رمز بوت تلقرام بعيدًا عن المتصفح، ويمرّر الرسائل من المنصة إلى
 *         مجموعة المدرسة في تلقرام. (الوضع الموصى به أمنيًا)
 *
 * خطوات التشغيل (٥ دقائق، مجانًا):
 *  ١) افتح https://script.google.com  ←  مشروع جديد.
 *  ٢) الصق هذا الكود كاملًا مكان الموجود في الملف Code.gs.
 *  ٣) من القائمة اليمنى: Project Settings (⚙) ← Script properties ← أضف خاصيتين:
 *        TELEGRAM_TOKEN = رمز البوت من @BotFather
 *        RELAY_KEY      = مفتاح سري من اختيارك (مثال: TBN-2026-sultan-9f3a)
 *  ٤) Deploy ← New deployment ← نوع: Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *     ثم انسخ رابط الـ Web app (ينتهي بـ /exec).
 *  ٥) في المنصة: «سجل تلقرام» ← «ربط بوت تلقرام» ← الوضع: وسيط
 *        الصق الرابط + المفتاح السري ← «حفظ» ← «إرسال رسالة تجريبية».
 *
 * ملاحظة: لا تشارك رابط الوسيط ولا المفتاح السري خارج المدرسة.
 * ============================================================================
 */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('RELAY_KEY');
    var token = props.getProperty('TELEGRAM_TOKEN');

    if (!token) return out({ ok: false, error: 'لم يُضبط رمز البوت (TELEGRAM_TOKEN)' });
    if (key && String(body.key || '') !== key) return out({ ok: false, error: 'مفتاح الوسيط غير صحيح' });
    if (!body.chat_id) return out({ ok: false, error: 'لا يوجد معرّف مجموعة (chat id)' });

    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: String(body.chat_id),
        text: String(body.text || ''),
        disable_web_page_preview: true
      })
    });
    var j = JSON.parse(res.getContentText() || '{}');
    return out({ ok: !!j.ok, description: j.description || (j.ok ? '' : 'فشل الإرسال') });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, app: 'tabaani-telegram-relay', hint: 'أرسل POST من منصة تابعني' });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
