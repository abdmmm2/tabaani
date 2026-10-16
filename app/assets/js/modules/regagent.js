/* ==========================================================================
   موظف التسجيل — محادثة تسجيل مدرسة كاملة
   --------------------------------------------------------------------------
   يفتح من «الدعم الفني» (أو من القائمة مباشرة). يحاور المسؤول خطوة خطوة:
   اسم المدرسة · المنطقة · المدينة · المراحل · المدير وبياناته ·
   ملفات العميل (فصول/معلمون/طلاب) — ثم يسجّل كل شيء تلقائيًا،
   ويُخرج تقرير التسجيل + كشف بيانات الدخول، ويرسلها للمدير
   على **تلقرام** و/أو **الإيميل** (من بريدك عبر Apps Script).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ------------------------------------------------ الحالة والمحادثة */
  var chat = [];              /* {who:'agent'|'me'|'sys', text} */
  var data = {};              /* بيانات التسجيل المجمّعة */
  var files = {};             /* classes|staff|students */
  var step = 'name';
  var result = null;

  function say(text, who) { chat.push({ who: who || 'agent', text: text }); }
  function sys(text) { say(text, 'sys'); }

  /* ------------------------------------------------- كود التفعيل (قفل ضد الوهمي) */
  var reg = { code: '', channel: '', at: 0, tries: 0, dead: false };
  function newCode() {
    reg.code = String(Math.floor(100000 + Math.random() * 900000));
    reg.at = Date.now(); reg.tries = 0; reg.dead = false;
    return reg.code;
  }
  function codeValid() { return !!reg.code && (Date.now() - reg.at) < 15 * 60000; }
  function checkCode(input) {
    if (reg.dead) return { ok: false, dead: true, error: 'أُلغي هذا التسجيل (محاولات كثيرة) — لا شيء محفوظ. ابدأ من جديد.' };
    if (!codeValid()) return { ok: false, error: 'انتهت صلاحية الكود (١٥ دقيقة) — اطلب كودًا جديدًا.' };
    if (String(input || '').trim() !== reg.code) {
      reg.tries++;
      if (reg.tries >= 3) { reg.dead = true; return { ok: false, dead: true, error: 'كود غير صحيح ٣ مرات ⇒ أُلغي التسجيل ولم يُحفظ أي شيء.' }; }
      return { ok: false, error: 'كود غير صحيح — باقي ' + (3 - reg.tries) + ' محاولة.' };
    }
    return { ok: true };
  }
  /** يرسل كود التفعيل على بريد المدير أو تلقرامه */
  function sendCode(d, channel, cb) {
    var code = newCode();
    var msg = '🔐 تابعني — كود تفعيل تسجيل مدرسة ' + (d.name || '') + '\nالكود: ' + code + '\nصالح ١٥ دقيقة. لا تشاركه مع أحد.';
    if (channel === 'tg') {
      if (!d.ptg) return cb({ ok: false, error: 'لا يوجد معرّف تلقرام للمدير — اختر البريد أو أضف المعرّف.' });
      Promise.resolve(S.telegramSend(msg, '', d.ptg)).then(function (r) {
        if (r && r.ok) return cb({ ok: true, channel: 'تلقرام', to: d.ptg, code: code });
        cb({ ok: false, code: code, error: (r && (r.error || r.note)) || 'تعذّر إرسال الكود على تلقرام — تأكد من ربط البوت (بيانات تابعني ← الربط بتلقرام) أو اختر البريد' });
      }).catch(function (e) { cb({ ok: false, code: code, error: (e && e.message) || 'تعذّر إرسال الكود على تلقرام — تأكد من ربط البوت (بيانات تابعني ← الربط بتلقرام)' }); });
      return;
    }
    if (!d.pemail) return cb({ ok: false, code: code, error: 'لا يوجد بريد للمدير — كود التفعيل يُرسل على البريد الإلكتروني، أضف بريدًا صحيحًا.' });
    if (!S.driveConfigured()) return cb({ ok: false, error: 'الإيميل يحتاج ربط نقطة الإرسال (Apps Script) من: بيانات تابعني ← الحفظ السحابي — أو اختر تلقرام.' });
    App.cloud.mail({ to: d.pemail, subject: 'تابعني — كود تفعيل تسجيل مدرستك', body: msg,
      html: '<div dir="rtl" style="font-family:Tahoma"><p>' + msg.replace(/\n/g, '<br>') + '</p></div>' }, function (err) {
      cb(err ? { ok: false, error: err.message || 'فشل إرسال البريد' } : { ok: true, channel: 'البريد', to: d.pemail, code: code });
    });
  }

  /* تحديد نوع الملف المرفوع من أعمدته */
  function detectFileType(keys) {
    var s = S.guessStaffMap(keys), c = S.guessClassMap(keys), t = S.guessStudentMap(keys);
    if (s.role || s.subject) return 'staff';
    if (c.room && !t.name) return 'classes';
    if (t.name) return 'students';
    if (c.grade || c.stage) return 'classes';
    return 'students';
  }
  var TYPE_LABEL = { classes: 'الفصول', staff: 'الموظفون', students: 'الطلاب' };

  /* الطلب في الدعم الفني (للتتبع) */
  function makeTicket() {
    try {
      return S.openTicket({
        subject: 'تسجيل مدرسة: ' + (data.name || '—'),
        category: 'school', priority: 'high',
        schoolId: result ? result.schoolId : '',
        byName: 'موظف التسجيل', byRole: 'support',
        phone: data.pphone || '', email: data.pemail || '',
        body: 'طلب تسجيل مدرسة عبر موظف التسجيل الآلي.'
      });
    } catch (e) { return null; }
  }

  /* التسجيل الفعلي */
  function submit(d, f) {
    var r = S.onboardSchool(
      { school: { name: d.name, regionName: d.region, city: d.city, gender: d.gender, stages: d.stages, plan: d.plan, setupPaid: true },
        principal: { name: d.pname, phone: d.pphone, email: d.pemail } },
      f || {});
    if (!r.ok) return r;
    /* احفظ بريد وتلقرام المدير على حسابه (لإرسال البيانات وللتحقق بمرحلتين لاحقًا) */
    var pr = S.list('users', { role: 'principal', schoolId: r.schoolId })[0];
    if (pr) {
      var patch = {};
      if (d.pemail) patch.email = d.pemail;
      if (d.pphone) patch.phone = d.pphone;
      if (d.ptg) patch.telegramChatId = String(d.ptg).trim();
      if (Object.keys(patch).length) S.update('users', pr.id, patch);
    }
    return r;
  }

  function credsText(r, d) {
    var lines = [];
    lines.push('🏫 تابعني — بيانات دخول مدرستك');
    lines.push('المدرسة: ' + (d.name || ''));
    lines.push('الباقة: ' + (d.plan === 'pro' ? 'برو' : 'كلاسيك'));
    lines.push('');
    (r.creds || []).forEach(function (c) {
      lines.push('• ' + c.role + ': ' + c.name);
      lines.push('  المستخدم: ' + c.username + '  |  كلمة المرور: ' + c.password);
    });
    lines.push('');
    lines.push('الرابط: ' + location.origin + location.pathname);
    lines.push('يُطلب تغيير كلمة المرور عند أول دخول.');
    return lines.join('\n');
  }
  function credsCsv(r) {
    var rows = [['الاسم', 'الدور', 'اسم المستخدم', 'كلمة المرور']];
    (r.creds || []).forEach(function (c) { rows.push([c.name, c.role, c.username, c.password]); });
    return rows.map(function (r2) { return r2.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
  }
  function b64(s) { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return ''; } }

  /* Sending: تلقرام + إيميل */
  function sendCreds(r, d, via, done) {
    var jobs = [];
    if (via === 'tg' || via === 'both') {
      jobs.push(function (next) {
        var text = credsText(r, d);
        S.setTelegramChatId ? null : null;
        var p = S.telegramSend(text, r.schoolId, d.ptg || '');
        Promise.resolve(p).then(function (res) {
          if (res && res.ok) sys('✅ أُرسلت بيانات الدخول إلى تلقرام' + (d.ptg ? ' (' + d.ptg + ')' : '') + '.');
          else sys('⚠️ تلقرام: ' + ((res && (res.error || res.note)) || 'لم يُرسل — سُجّل في سجل تلقرام بانتظار البوت'));
          next();
        }).catch(function () { sys('⚠️ تعذّر إرسال تلقرام.'); next(); });
      });
    }
    if (via === 'mail' || via === 'both') {
      jobs.push(function (next) {
        if (!d.pemail) { sys('⚠️ لا يوجد بريد للمدير — لم يُرسل الإيميل.'); return next(); }
        if (!S.driveConfigured()) { sys('⚠️ الإيميل يحتاج ربط نقطة الإرسال (Apps Script) من: بيانات تابعني ← الحفظ السحابي.'); return next(); }
        App.cloud.mail({
          to: d.pemail, subject: 'تابعني — بيانات دخول مدرسة ' + (d.name || ''),
          body: credsText(r, d),
          html: '<div dir="rtl" style="font-family:Tahoma,sans-serif"><h3>تابعني — بيانات دخول مدرستك</h3><p>' +
            (d.name || '') + '</p><pre style="font-size:14px">' + credsText(r, d).replace(/</g, '&lt;') + '</pre></div>',
          attachments: [
            { name: 'بيانات-الدخول-' + (d.name || 'مدرسة') + '.csv', mime: 'text/csv', b64: b64(credsCsv(r)) },
            { name: 'تقرير-التسجيل.txt', mime: 'text/plain', b64: b64(credsText(r, d)) }
          ]
        }, function (err, res) {
          if (err) sys('⚠️ فشل الإيميل: ' + (err.message || ''));
          else sys('✅ أُرسل الإيميل إلى ' + d.pemail + ' ومعه كشف بيانات الدخول مرفقًا.');
          next();
        });
      });
    }
    (function run(i) {
      if (i >= jobs.length) { if (done) done(); return; }
      jobs[i](function () { run(i + 1); });
    })(0);
  }

  App.regAgent = { detectFileType: detectFileType, submit: submit, credsText: credsText, credsCsv: credsCsv,
    sendCreds: sendCreds, makeTicket: makeTicket, sendCode: sendCode, checkCode: checkCode, newCode: newCode, state: function () { return reg; } };

  /* ------------------------------------------------ الوحدة */
  App.register({
    id: 'regagent',
    label: 'موظف التسجيل',
    icon: '&#129302;',
    roles: ['super', 'support'],
    render: function (view) {
      var host = h('div', { class: 'stack' });
      var msgs = h('div', { class: 'chat-log' });
      var quick = h('div', { class: 'chat-quick' });
      var input = h('input', { class: 'input', placeholder: 'اكتب هنا…', autocomplete: 'off' });
      var fIn = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', multiple: 'multiple' });

      function bubble(m) {
        var cls = m.who === 'me' ? 'chat-me' : (m.who === 'sys' ? 'chat-sys' : 'chat-agent');
        return h('div', { class: 'chat-row ' + cls }, [h('div', { class: 'chat-b', text: m.text })]);
      }
      function renderLog() {
        clear(msgs);
        chat.forEach(function (m) { msgs.appendChild(bubble(m)); });
        msgs.scrollTop = msgs.scrollHeight;
      }
      function quickBtn(label, onClick, cls) {
        quick.appendChild(h('button', { class: cls || 'btn btn-outline btn-sm', type: 'button', text: label, onClick: onClick }));
      }

      function renderQuick() {
        clear(quick);
        if (step === 'name') { /* لا أزرار */ }
        if (step === 'stages') {
          S.stages.forEach(function (st) {
            var on = (data.stages || []).indexOf(st.id) > -1;
            quick.appendChild(h('button', { class: 'chip' + (on ? ' is-on' : ''), type: 'button', text: st.name, onClick: function () {
              data.stages = on ? data.stages.filter(function (x) { return x !== st.id; }) : (data.stages || []).concat([st.id]);
              var names = (data.stages || []).map(function (x) { return S.stageName(x); });
              sys(names.length ? '✓ المختار الآن: ' + names.join(' · ') + ' — اضغط «تأكيد الاختيار» للمتابعة' : 'أُلغي الاختيار — اختر مرحلة واحدة على الأقل');
              renderLog(); renderQuick();
            } }));
          });
          quickBtn('تأكيد الاختيار ✓', function () {
            if (!(data.stages || []).length) { sys('اختر مرحلة واحدة على الأقل.'); renderLog(); return; }
            say((data.stages || []).map(function (x) { return S.stageName(x); }).join(' · '));
            go('gender', 'بنين أم بنات؟ (اضغط الزر أو اكتب)');
          }, 'btn btn-primary btn-sm');
        }
        if (step === 'gender') {
          quickBtn('بنين', function () { say('بنين'); data.gender = 'boys'; go('plan', 'الباقة؟ «برو» (كل المميزات + تلقرام) أو «كلاسيك».'); });
          quickBtn('بنات', function () { say('بنات'); data.gender = 'girls'; go('plan', 'الباقة؟ «برو» (كل المميزات + تلقرام) أو «كلاسيك».'); });
        }
        if (step === 'plan') {
          quickBtn('برو 1500 (كل المميزات + تلقرام)', function () { say('برو'); data.plan = 'pro'; go('paid', 'هل تم سداد رسم التأسيس (1000 ر.س)؟'); }, 'btn btn-primary btn-sm');
          quickBtn('كلاسيك 1000', function () { say('كلاسيك'); data.plan = 'classic'; go('paid', 'هل تم سداد رسم التأسيس (1000 ر.س)؟'); });
        }
        if (step === 'files') {
          quickBtn('تابع بلا ملفات', function () { say('تابع بلا ملفات'); askSendCode(); });
          quickBtn('تم — التالي', function () { say('تم'); askSendCode(); });
        }
        if (step === 'paid') {
          quickBtn('تم سداد رسم التأسيس ✓', function () { say('تم سداد رسم التأسيس'); data.paid = true; go('pname', 'ممتاز — اسم مدير المدرسة؟'); }, 'btn btn-primary btn-sm');
          quickBtn('لم يُسدد بعد', function () { say('لم يُسدد بعد'); halt('لم يُثبَت سداد رسم التأسيس. لن أكمل التسجيل ولن يُحفظ شيء — أرسل الإيصال ثم ابدأ من جديد.'); });
        }
        if (step === 'channel') {
          quickBtn('أرسل الكود على البريد ✉', function () { say('أرسل'); sendMailCode(); }, 'btn btn-primary btn-sm');
          quickBtn('تغيير البريد', function () { say('تغيير البريد'); data.needEmail = true; go('pemail', 'اكتب بريد المدير الصحيح:'); });
        }
        if (step === 'code') {
          quickBtn('أرسل كودًا جديدًا على البريد', function () { sendMailCode(); });
          quickBtn('إلغاء التسجيل', function () { say('إلغاء'); halt('أُلغي التسجيل — لم يُحفظ أي شيء.'); });
        }
        if (step === 'halted') {
          quickBtn('ابدأ تسجيلًا جديدًا', function () { reset(); });
        }
        if (step === 'send') {
          quickBtn('تلقرام', function () { say('تلقرام'); choice('tg'); });
          quickBtn('إيميل', function () { say('إيميل'); choice('mail'); });
          quickBtn('الاثنان', function () { say('الاثنان'); choice('both'); });
          quickBtn('لا ترسل', function () { say('لا ترسل'); finish(); });
        }
        if (step === 'done') {
          quickBtn('عرض كشف كلمات المرور', function () { UI.passwordSheet(result.creds, { title: 'بيانات دخول ' + data.name }); });
          quickBtn('تسجيل مدرسة أخرى', function () { reset(); });
        }
      }
      function go(next, prompt) {
        step = next;
        if (prompt) say(prompt);
        renderLog(); renderQuick();
      }

      function handle(text, silent) {
        text = String(text || '').trim();
        if (!text) return;
        if (!silent) say(text, 'me');
        if (step === 'name') { data.name = text; return go('region', 'ممتاز! ما المنطقة التعليمية؟'); }
        if (step === 'region') { data.region = text; return go('city', 'والمدينة؟'); }
        if (step === 'city') { data.city = text; return go('stages', 'حدّد المراحل في المدرسة (اضغط لتختار ثم «تم»):'); }
        if (step === 'paid') {
          if (/تم|مدفوع|سددت|دفعت|سدّدت/.test(text)) { data.paid = true; return go('pname', 'ممتاز — اسم مدير المدرسة؟'); }
          return halt('لم يُثبَت سداد رسم التأسيس. لن أكمل التسجيل ولن يُحفظ شيء — أرسل الإيصال ثم ابدأ من جديد.');
        }
        if (step === 'pname') { data.pname = text; return go('pphone', 'جوال مدير المدرسة؟'); }
        if (step === 'pphone') { data.pphone = text; return go('pemail', 'بريد المدير؟ (لإرسال بيانات الدخول بالإيميل — اكتب «تخطَّ» إن لم يوجد)'); }
        if (step === 'pemail') {
          data.pemail = /تخط|لا يوجد|بدون/.test(text) ? '' : text;
          if (!/@/.test(data.pemail)) { sys('البريد غير صحيح — كود التفعيل يُرسل على بريد المدير، فهو إلزامي. اكتب البريد الصحيح.'); return renderLog(); }
          if (data.needEmail) { data.needEmail = false; return sendMailCode(); }
          return go('ptg', 'معرّف تلقرام المدير؟ (رقم الجوال أو chat id — أو «تخطَّ» · تُرسل عليه بيانات الدخول فقط)');
        }
        if (step === 'ptg') { data.ptg = /تخط|لا يوجد|بدون/.test(text) ? '' : text; return go('files', 'ارفع ملفات العميل (فصول · معلمون · طلاب) بزر «📎 ارفق ملف» — أو اضغط «تابع بلا ملفات».'); }
        if (step === 'channel') {
          if (/ارسل|أرسل|تم|نعم/.test(text)) return sendMailCode();
          sys('اكتب «أرسل» لإرسال كود التفعيل على بريد المدير، أو «تغيير البريد».'); return renderLog();
        }
        if (step === 'code') {
          var chk = checkCode(text);
          if (chk.ok) { sys('✅ تم التحقق من الكود — جارٍ إنشاء المدرسة…'); return run(); }
          sys('✗ ' + chk.error);
          if (chk.dead) { step = 'halted'; }
          renderLog(); renderQuick(); return;
        }
        if (step === 'stages') {
          /* اختار بالأزرار ثم كتب إجابة الخطوة التالية (بنين/برو…) ⇒ نُكمل تلقائيًا بلا تعطيل */
          var nextWord = /بنين|بنات|برو|classic|كلاسيك|pro/.test(text) && !/متوسط|ثانوي|ابتدائي|روضة|تمهيدي/.test(text);
          if (nextWord && (data.stages || []).length) {
            sys('✓ المختار: ' + (data.stages || []).map(function (x) { return S.stageName(x); }).join(' · ') + ' — نكمل');
            go('gender', 'بنين أم بنات؟ (اضغط الزر أو اكتب)');
            return handle(text, true);
          }
          /* الرد كتابةً: «ثانوي» أو «متوسط وثانوي» أو «تم» بعد الاختيار بالأزرار */
          if (/^تم|تأكيد|اكمل|أكمل/.test(text)) {
            if (!(data.stages || []).length) { sys('اكتب مرحلة (مثلًا «ثانوي») أو اختر بالأزرار.'); renderLog(); return; }
            return go('gender');
          }
          var picked = [];
          S.stages.forEach(function (st) { if (text.indexOf(st.name) > -1 || new RegExp(st.id, 'i').test(text)) picked.push(st.id); });
          ['تمهيدي', 'روضة', 'ابتدائي', 'متوسط', 'ثانوي'].forEach(function (w) {
            if (text.indexOf(w) === -1) return;
            var id = S.stageFromText(w);
            if (id && picked.indexOf(id) === -1) picked.push(id);
          });
          if (!picked.length) { sys('لم أفهم المرحلة — اكتب «متوسط» أو «ثانوي» أو اختر بالأزرار أعلاه ثم «تأكيد الاختيار».'); renderLog(); renderQuick(); return; }
          data.stages = picked;
          sys('✓ المختار: ' + picked.map(function (x) { return S.stageName(x); }).join(' · '));
          return go('gender', 'بنين أم بنات؟');
        }
        if (step === 'gender') {
          if (/بنات|بنة|إناث|اناث/.test(text)) { data.gender = 'girls'; return go('plan', 'الباقة؟ «برو» (كل المميزات + تلقرام) أو «كلاسيك».'); }
          if (/بنين|ذكور|اولاد|أولاد/.test(text)) { data.gender = 'boys'; return go('plan', 'الباقة؟ «برو» (كل المميزات + تلقرام) أو «كلاسيك».'); }
          sys('اكتب «بنين» أو «بنات» — أيّهما؟'); return renderLog();
        }
        if (step === 'plan') {
          if (/برو|pro/.test(text)) { data.plan = 'pro'; return go('paid', 'هل تم سداد رسم التأسيس (1000 ر.س)؟'); }
          if (/كلاسيك|classic|عادي/.test(text)) { data.plan = 'classic'; return go('paid', 'هل تم سداد رسم التأسيس (1000 ر.س)؟'); }
          sys('اكتب «برو» أو «كلاسيك» — أيّهما؟'); return renderLog();
        }
        if (step === 'files') { if (/^تم|تابع|سجل|تسجيل|ارفع|خلاص/.test(text)) return askSendCode(); sys('ارفع الملفات بزر «📎 ارفق ملف»، أو اكتب «تم» للتسجيل الآن.'); return renderLog(); }
        if (step === 'send') return chooseByText(text);
        sys('الطلب مسجّل — استخدم الأزرار أسفل المحادثة.');
        renderLog();
      }
      function chooseByText(t) {
        if (/تلقرام|تليقرام|تلجرام/.test(t) && /ايميل|إيميل|بريد/.test(t)) { say('الاثنان'); return choice('both'); }
        if (/تلقرام|تليقرام|تلجرام/.test(t)) { choice('tg'); return; }
        if (/ايميل|إيميل|بريد/.test(t)) { choice('mail'); return; }
        if (/لا|تخط|بدون/.test(t)) { finish(); return; }
        sys('اختر: تلقرام · إيميل · الاثنان · لا ترسل');
        renderLog();
      }

      function onFiles(e) {
        var list = Array.prototype.slice.call((e.target.files || []));
        if (!list.length) return;
        var pending = list.length;
        list.forEach(function (f) {
          UI.readExcel(f).then(function (res) {
            var rows = (res && res.rows) || [];
            if (!rows.length) { sys('الملف ' + f.name + ' لا يحتوي صفوفًا.'); done1(); return; }
            var type = detectFileType(Object.keys(rows[0]));
            var map = type === 'staff' ? S.guessStaffMap(Object.keys(rows[0])) : (type === 'classes' ? S.guessClassMap(Object.keys(rows[0])) : S.guessStudentMap(Object.keys(rows[0])));
            files[type] = { rows: rows, map: map, fileName: f.name };
            sys('📎 ' + f.name + ' → ' + TYPE_LABEL[type] + ' (' + rows.length + ' صفًا)');
            done1();
          }).catch(function () { sys('تعذّر قراءة ' + f.name); done1(); });
        });
        function done1() { pending--; if (!pending) { renderLog(); e.target.value = ''; } }
      }

      function run() {
        if (!data.pname) { say('لم يُحدَّد المدير', 'sys'); }
        say('جارٍ التسجيل…');
        renderLog();
        result = submit(data, files);
        if (!result.ok) { sys('✗ ' + result.error); say('اكتب اسم المدرسة من جديد:', 'agent'); step = 'name'; renderLog(); renderQuick(); return; }
        var st = result.stats;
        sys('✅ أُسّست المدرسة: ' + data.name + '\n' +
          '• الفصول: ' + st.classes + '   • الموظفون: ' + st.staff + '   • الطلاب: ' + st.students + '\n' +
          '• حسابات دخول جاهزة: ' + st.credentials);
        (result.warnings || []).forEach(function (w) { sys('• ' + w); });
        var t = makeTicket();
        if (t) sys('🎫 رقم طلب التسجيل: ' + t.no + ' (محفوظ في الدعم الفني)');
        sys('أرسل بيانات الدخول إلى المدير على:');
        step = 'send';
        renderLog(); renderQuick();
      }

      function choice(via) {
        renderLog(); renderQuick();
        sys('جارٍ الإرسال…'); renderLog();
        sendCreds(result, data, via, function () {
          finish();
        });
      }
      /** بعد الملفات: نعرض البريد ونتأكد قبل إرسال الكود */
      function askSendCode() {
        if (!data.pemail || !/@/.test(data.pemail)) {
          data.needEmail = true;
          return go('pemail', 'كود التفعيل يُرسل على بريد المدير — اكتب البريد الإلكتروني:');
        }
        go('channel', 'أرسل كود التفعيل على بريد المدير: ' + data.pemail + ' ؟');
      }

      /** كود التفعيل على بريد المدير فقط (حسب طلب المالك) */
      function sendMailCode() {
        if (!data.pemail || !/@/.test(data.pemail)) {
          data.needEmail = true;
          return go('pemail', 'كود التفعيل يُرسل على بريد المدير — اكتب البريد الإلكتروني:');
        }
        reg.channel = 'mail';
        sys('جارٍ إرسال كود التفعيل على ' + data.pemail + '…');
        renderLog();
        sendCode(data, 'mail', function (res) {
          if (!res.ok) {
            sys('⚠️ ' + res.error);
            sys('إن تعذّر البريد: تحقق من ربط نقطة الإرسال (Apps Script) في: بيانات تابعني ← الحفظ السحابي.');
            step = 'channel'; return renderLog();
          }
          step = 'code';
          say('أرسلت كود التفعيل (٦ أرقام) على البريد ' + data.pemail + ' — اكتبه هنا لإتمام التسجيل:', 'agent');
          sys('لن تُنشأ المدرسة ولن تُحفظ قبل إدخال الكود (حماية من التسجيلات الوهمية).');
          renderLog(); renderQuick();
        });
      }
      function pickChannel(channel) {
        reg.channel = channel;
        sys('جارٍ إرسال كود التفعيل…');
        renderLog();
        sendCode(data, channel, function (res) {
          if (!res.ok) { sys('⚠️ ' + res.error); return renderQuick(); }
          step = 'code';
          say('أرسلت كود التفعيل (٦ أرقام) على ' + res.channel + ' — اكتبه هنا لإتمام التسجيل:', 'agent');
          sys('لن تُنشأ المدرسة ولن تُحفظ قبل إدخال الكود (حماية من التسجيلات الوهمية).');
          renderLog(); renderQuick();
        });
      }
      function halt(msg) {
        step = 'halted';
        sys('⛔ ' + msg);
        say('للحماية من التسجيلات الوهمية: لا يُحفظ أي طلب تسجيل قبل استكمال البيانات والملفات والسداد وتأكيد كود التفعيل.', 'agent');
        renderLog(); renderQuick();
      }
      function finish() {
        step = 'done';
        sys('تمّ التسجيل ✓ — اضغط «عرض كشف كلمات المرور» للطباعة أو التسليم، أو «تسجيل مدرسة أخرى».');
        renderLog(); renderQuick();
        if (result && result.creds && result.creds.length) UI.passwordSheet(result.creds, { title: 'بيانات دخول ' + (data.name || '') });
      }

      function reset() {
        chat = []; data = {}; files = {}; result = null;
        greet();
        renderLog(); renderQuick();
      }
      function greet() {
        say('أهلاً بك 👋 أنا موظف التسجيل — أسجّل لك مدرسة كاملة من الصفر: المدرسة · الفصول · الموظفين بحساباتهم · الطلاب، ثم أرسل بيانات الدخول للمدير على تلقرام والإيميل.');
        sys('يمكنك الإجابة بالكتابة في المربع أسفل، أو بالضغط على الأزرار التي تظهر — ثم «إرسال».');
        sys('ملاحظة الحماية: لن تُنشأ المدرسة ولن يُحفظ أي طلب قبل استكمال (البيانات + الملفات + السداد + كود التفعيل على بريد المدير).');
        say('1) ما اسم المدرسة؟');
      }

      /* ---------------------------------------------- الواجهة */
      clear(host);
      greet();
      msgs.className = 'chat-log';
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { handle(input.value); input.value = ''; } });
      fIn.addEventListener('change', onFiles);
      host.appendChild(h('div', { class: 'callout info' }, [
        h('strong', { text: 'موظف التسجيل: ' }),
        h('span', { text: 'يستقبل الطلب من الدعم الفني ويسجّل المدرسة تلقائيًا، ويُخرج كشف بيانات الدخول ويرسله للمدير (تلقرام · إيميل). كل شيء داخل نظامك.' })
      ]));
      host.appendChild(UI.panel('محادثة التسجيل', 'أجب بكتابة الرد أو بالضغط على الأزرار — وارفع ملفات العميل عند الطلب.', [
        h('label', { class: 'btn btn-outline btn-sm', style: { cursor: 'pointer' } }, [h('span', { text: '📎 ارفق ملف' }), fIn]),
        h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'إعادة البدء', onClick: function () { reset(); } })
      ], [msgs, quick, h('div', { class: 'chat-input' }, [
        input,
        h('button', { class: 'btn btn-primary', type: 'button', text: 'إرسال', onClick: function () { handle(input.value); input.value = ''; } })
      ])]));
      renderLog(); renderQuick();
      view.appendChild(host);
    }
  });
})();
