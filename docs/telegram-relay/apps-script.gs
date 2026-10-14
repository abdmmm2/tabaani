/**
 * ============================================================================
 *  وسيط بوت تلقرام + ردود آلية — منصة تابعني للخدمات التعليمية
 * ============================================================================
 *  الوظائف:
 *   ١) doPost : تستدعيه المنصة لإرسال تنبيهات (الرمز يبقى هنا ولا يظهر في المتصفح).
 *   ٢) poll   : يقرأ رسائل البوت كل دقيقة ويرد تلقائيًا على /start و /id و /help.
 *   ٣) doGet  : فحص سريع + قائمة المحادثات التي وصلها البوت.
 *
 *  خطوات التشغيل (٥ دقائق):
 *   ١) افتح https://script.google.com ← مشروع جديد ← الصق هذا الملف كاملًا في Code.gs.
 *   ٢) عدّل السطرين في الدالة setup: الرمز من @BotFather + مفتاح سري من اختيارك.
 *   ٣) اختر دالة setup من القائمة العلوية ← Run ← اسمح بالصلاحيات عند الطلب.
 *      (هذه الخطوة تحفظ الإعدادات وتُشغّل الرد الآلي كل دقيقة.)
 *   ٤) Deploy ← New deployment ← Web app
 *         Execute as: Me     ·     Who has access: Anyone
 *      ثم انسخ الرابط المنتهي بـ /exec.
 *   ٥) في المنصة: «سجل تلقرام» ← «ربط بوت تلقرام» ← الوضع: وسيط
 *         الصق الرابط + المفتاح السري ← «إرسال رسالة تجريبية» ✓
 *
 *  ملاحظات:
 *   • بعد تشغيل الرد الآلي، المعرّف يُجلب من داخل المجموعة بأمر /id (لأن الوسيط يقرأ التحديثات).
 *   • لا تشارك الرابط ولا المفتاح السري خارج المدرسة.
 * ============================================================================
 */

/* ------------------------------------------------------------------ الإعداد */
function setup() {
  var TOKEN = 'ضع-رمز-البوت-هنا';            // مثال: 1234567890:AAH…  (من @BotFather)
  var KEY   = 'ضع-مفتاحا-سريا-من-اختيارك';   // مثال: TBN-sultan-2026-9f3a
  var props = PropertiesService.getScriptProperties();
  props.setProperties({ TELEGRAM_TOKEN: TOKEN, RELAY_KEY: KEY });
  installTrigger();
  Logger.log('تم حفظ الإعدادات وتشغيل الرد الآلي ✓  — الآن Deploy ← New deployment ← Web app');
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('poll').timeBased().everyMinutes(1).create();
}

/* ---------------------------------------------------- استقبال إرسال المنصة */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('TELEGRAM_TOKEN');
    var key = props.getProperty('RELAY_KEY');
    if (!token) return out({ ok: false, error: 'لم يُضبط رمز البوت — شغّل الدالة setup' });
    if (key && String(body.key || '') !== key) return out({ ok: false, error: 'مفتاح الوسيط غير صحيح' });
    if (!body.chat_id) return out({ ok: false, error: 'لا يوجد معرّف مجموعة (chat id)' });
    var r = tg(token, 'sendMessage', {
      chat_id: String(body.chat_id), text: String(body.text || ''),
      parse_mode: 'HTML', disable_web_page_preview: true
    });
    return out({ ok: !!r.ok, description: r.description || '' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('RELAY_KEY');
  if (p.key && key && String(p.key) !== key) return out({ ok: false, error: 'مفتاح غير صحيح' });
  if (p.action === 'chats') {
    var all = JSON.parse(props.getProperty('CHATS') || '{}');
    return out({ ok: true, chats: Object.keys(all).map(function (k) { return all[k]; }) });
  }
  return out({ ok: true, app: 'tabaani-telegram-relay', ready: !!props.getProperty('TELEGRAM_TOKEN') });
}

/* ------------------------------------------------------- الرد الآلي (كل دقيقة) */
function poll() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) return;
  var last = Number(props.getProperty('LAST_UPDATE_ID') || 0);
  var url = 'https://api.telegram.org/bot' + token + '/getUpdates?limit=50&timeout=0&offset=' + (last + 1) +
    '&allowed_updates=' + encodeURIComponent(JSON.stringify(['message', 'edited_message', 'channel_post', 'my_chat_member']));
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var j = JSON.parse(res.getContentText() || '{}');
  if (!j.ok) return;
  (j.result || []).forEach(function (u) {
    last = Math.max(last, u.update_id);
    var m = u.message || u.channel_post || u.edited_message || {};
    var chat = m.chat;
    if (!chat) return;
    rememberChat(chat);
    var t = String(m.text || '').trim().toLowerCase();
    if (!t || t.charAt(0) !== '/') return;
    var cmd = t.split(' ')[0].split('@')[0];
    if (cmd === '/id') {
      tg(token, 'sendMessage', { chat_id: chat.id, parse_mode: 'HTML',
        text: '🆔 <b>معرّف هذه المحادثة (chat id)</b>\n<code>' + chat.id + '</code>\n\n' +
              'انسخه والصقه في المنصة: سجل تلقرام ← ربط بوت تلقرام ← معرّف المجموعة.' });
    } else if (cmd === '/start') {
      tg(token, 'sendMessage', { chat_id: chat.id, parse_mode: 'HTML',
        text: '👋 أهلاً بك في بوت منصة <b>تابعني</b> للخدمات التعليمية.\n\n' +
              'هذا البوت يُرسل تنبيهات المدرسة إلى هذه المحادثة: الحضور · المخالفات · ' +
              'إذونات الخروج · الأنشطة والتطوع.\n\nلمعرفة معرّف هذه المحادثة أرسل: <code>/id</code>' });
    } else if (cmd === '/help') {
      tg(token, 'sendMessage', { chat_id: chat.id, parse_mode: 'HTML',
        text: '<b>ماذا يفعل هذا البوت؟</b>\n• يرسل تنبيهات المنصة إلى مجموعة المدرسة.\n' +
              '• <code>/id</code> يعرض معرّف هذه المحادثة.\n• المزيد: منصة تابعني' });
    }
  });
  props.setProperty('LAST_UPDATE_ID', String(last));
}

/* ---------------------------------------------------------------- أدوات مساعدة */
function rememberChat(chat) {
  var props = PropertiesService.getScriptProperties();
  var all = JSON.parse(props.getProperty('CHATS') || '{}');
  all[String(chat.id)] = {
    id: chat.id, type: chat.type, title: chat.title || chat.first_name || chat.username || String(chat.id),
    at: new Date().toISOString()
  };
  props.setProperty('CHATS', JSON.stringify(all));
}

function tg(token, method, payload) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  try { return JSON.parse(res.getContentText() || '{}'); } catch (e) { return { ok: false, description: 'رد غير مفهوم' }; }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
