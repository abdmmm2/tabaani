/**
 * ============================================================================
 * وسيط إرسال رسائل تلقرام — Cloudflare Worker (منصة تابعني)
 * ----------------------------------------------------------------------------
 * الأفضل أداءً وضبطًا للـ CORS. الخطوات:
 *  ١) افتح https://dash.cloudflare.com ← Workers & Pages ← Create ← Worker.
 *  ٢) الصق هذا الكود.
 *  ٣) Settings ← Variables: أضف
 *        TELEGRAM_TOKEN = رمز البوت (اجعله Secret/Encrypt)
 *        RELAY_KEY      = مفتاح سري من اختيارك
 *  ٤) Deploy ← انسخ رابط الـ Worker (https://xxxx.workers.dev).
 *  ٥) في المنصة: «سجل تلقرام» ← «ربط بوت تلقرام» ← الوضع: وسيط ← الرابط + المفتاح.
 *
 * مثال على الطلب الذي ترسله المنصة:
 *  POST /  { "key": "…", "chat_id": "-1001234567890", "text": "رسالة" }
 * ============================================================================
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json = (o, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'GET') return json({ ok: true, app: 'tabaani-telegram-relay' });
    if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

    let body = {};
    try { body = JSON.parse(await request.text() || '{}'); } catch (e) { return json({ ok: false, error: 'JSON غير صالح' }); }

    const token = env.TELEGRAM_TOKEN;
    if (!token) return json({ ok: false, error: 'لم يُضبط رمز البوت (TELEGRAM_TOKEN)' });
    if (env.RELAY_KEY && String(body.key || '') !== env.RELAY_KEY) return json({ ok: false, error: 'مفتاح الوسيط غير صحيح' });
    if (!body.chat_id) return json({ ok: false, error: 'لا يوجد معرّف مجموعة (chat id)' });

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(body.chat_id), text: String(body.text || ''), disable_web_page_preview: true })
    });
    const j = await res.json().catch(() => ({ ok: false, description: 'رد غير مفهوم من تلقرام' }));
    return json({ ok: !!j.ok, description: j.description || '' });
  }
};
