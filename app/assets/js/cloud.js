/* ==========================================================================
   الحفظ السحابي — رفع النسخة الاحتياطية إلى Google Drive
   --------------------------------------------------------------------------
   بلا خادم وبلا أي مكتبة خارجية: نقطة الرفع = تطبيق Google Apps Script ينشره
   المستخدم في حسابه مرة واحدة (تنفيذ باسمي · أي شخص)، فيحفظ الملف في مجلد
   «تابعني — النسخ الاحتياطية» داخل درايفه ويحتفظ بآخر ١٢ نسخة.

   • الرفع بطلب POST بسيط (Content-Type: text/plain) فلا يُطلق preflight.
   • إن لم يُقرأ الردّ (شبكة/سياسات) نُعيد المحاولة بـ no-cors ونُبلغ «راجع درايف».
   • إن كان الجهاز بلا إنترنت: تُحفظ النسخة في طابور وتُرفع عند عودة الاتصال.
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App, S = window.Store, UI = window.UI, h = UI.h;

  /* الكود الذي ينسخه المستخدم في Apps Script — يظهر حرفيًا في المعالج */
  var SCRIPT_CODE = [
    'var FOLDER = "تابعني — النسخ الاحتياطية";',
    'var KEEP = 12;',
    '',
    'function doPost(e) {',
    '  var p = JSON.parse(e.postData.contents);',
    '  var it = DriveApp.getFoldersByName(FOLDER);',
    '  var f = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);',
    '  if (p.test) return out({ ok: true, test: true, folder: f.getUrl() });',
    '  var name = p.name || ("tabaani-" + new Date().toISOString().slice(0, 10) + ".json");',
    '  var file = f.createFile(name, p.data, "application/json");',
    '  var files = [], all = f.getFiles();',
    '  while (all.hasNext()) files.push(all.next());',
    '  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });',
    '  for (var i = KEEP; i < files.length; i++) files[i].setTrashed(true);',
    '  return out({ ok: true, name: file.getName(), size: p.data.length,',
    '               folder: f.getUrl(), kept: Math.min(files.length, KEEP) });',
    '}',
    '',
    'function doGet() { return out({ ok: true, msg: "نقطة رفع نسخ تابعني جاهزة." }); }',
    '',
    'function out(o) {',
    '  return ContentService.createTextOutput(JSON.stringify(o))',
    '    .setMimeType(ContentService.MimeType.JSON);',
    '}'
  ].join('\n');

  /* خطوات الإعداد كما تظهر في المعالج (زر-بزر · بالعربي والإنجليزي) */
  var STEPS = [
    'زر «افتح Apps Script — مشروع جديد» بالأسفل. احذف السطر function myFunction() { }',
    'اضغط «انسخ الكود» بالأسفل، ثم الصقه في المحرّر، ثم احفظ بأيقونة 💾 أو Ctrl+S.',
    'أعلى اليمين: «نشر / Deploy» ← «نشر جديد / New deployment».',
    'اضغط ⚙ «اختر النوع» ← اختر «تطبيق ويب / Web app» (هذا أهم زر — بدونه لا يظهر الرابط).',
    'في «تنفيذ باسم / Execute as» اختر: «أنا / Me».',
    'في «من لديه صلاحية الوصول / Who has access» اختر: «أي شخص / Anyone» (لا تختر «أنا فقط» وإلا لن تعمل).',
    'اضغط «نشر / Deploy» ثم «إذن الوصول / Authorize access» ← اختر حسابك ← «متقدم / Advanced» ← «الانتقال إلى… (غير آمن)» ← «سماح / Allow».',
    'انسخ «رابط تطبيق الويب / Web app URL» (ينتهي بـ /exec — وليس /dev) والصقه في الحقل، ثم «احفظ واختبر».'
  ];
  /* الأخطاء الأربعة التي تُفشل النشر غالبًا */
  var TRAPS = [
    'الرابط ينتهي بـ /dev ← هذا «رابط اختبار» لا يعمل. خُذ «رابط تطبيق الويب» المنتهي بـ /exec من نفس النافذة.',
    '«من لديه صلاحية الوصول» = «أنا فقط» ← اجعلها «أي شخص / Anyone» ثم «نشر».',
    'لم تختر النوع «تطبيق ويب» في الخطوة ٤ ⇒ لا يظهر رابط أصلًا. أعد: نشر ← نشر جديد ← ⚙ اختر النوع ← تطبيق ويب.',
    'عدّلت الكود بعد النشر ← لازم «نشر ← إدارة عمليات النشر ← ✏️ تعديل ← الإصدار: جديد ← نشر» ليأخذ التغيير.'
  ];

  /* ---------------------------------------------------------------- الطلب */
  function send(url, payload, mode, cb) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    var opt = {
      method: 'POST', mode: mode, body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    };
    if (ctl) opt.signal = ctl.signal;
    function done(err, res) { clearTimeout(to); cb(err, res); }
    try {
      fetch(url, opt).then(function (r) {
        if (mode === 'no-cors') return done(null, { opaque: true });
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok) return done({ message: 'ردّ غير متوقّع (HTTP ' + r.status + ')', http: true, status: r.status }, { raw: String(t).slice(0, 200) });
          done(null, j || { raw: String(t).slice(0, 200) });
        });
      }).catch(function (e) { done({ message: (e && e.message) || 'تعذّر الاتصال', error: e }); });
    } catch (e) { done({ message: (e && e.message) || 'تعذّر الاتصال', error: e }); }
  }

  function post(payload, cb) {
    var cfg = S.driveConfig();
    if (!cfg.url) return cb({ message: 'لا يوجد رابط — اربط Google Drive أولًا.' });
    send(cfg.url, payload, 'cors', function (err, res) {
      if (!err) return cb(null, res);
      /* الخادم ردّ فعلًا بخطأ صريح (HTTP) ⇒ لا محاولة عمياء */
      if (err.http) return cb(err, res);
      /* احتمال ألا نُسمح بقراءة الردّ مع أنّ الحفظ تمّ — محاولة أخيرة بلا قراءة */
      send(cfg.url, payload, 'no-cors', function (err2) {
        if (err2) return cb(err, res);
        cb(null, { unverified: true });
      });
    });
  }

  App.cloud = {
    scriptCode: function () { return SCRIPT_CODE; },
    steps: function () { return STEPS.slice(); },
    traps: function () { return TRAPS.slice(); },
    /** فحص شكل الرابط برسالة محددة لكل حالة خطأ شائعة */
    urlCheck: function (raw) {
      var url = String(raw || '').trim().replace(/\?.*$/, '');
      if (!url) return { ok: false, msg: 'الصق رابط تطبيق الويب من نافذة النشر.' };
      if (/\/dev$/.test(url)) return { ok: false, msg: 'هذا «رابط الاختبار» (.../dev) ولا يعمل مع تابعني — انسخ «رابط تطبيق الويب» المنتهي بـ /exec.' };
      if (/docs\.google\.com|drive\.google\.com|sheets\.google\.com/.test(url)) return { ok: false, msg: 'هذا رابط ملف/مستند — المطلوب «رابط تطبيق الويب» من نافذة «نشر» (يبدأ بـ script.google.com وينتهي بـ /exec).' };
      var m = url.match(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/);
      if (!m) return { ok: false, msg: 'الرابط غير مكتمل. الشكل الصحيح: https://script.google.com/macros/s/.../exec — انسخه من نافذة النشر بلا زيادة.' };
      return { ok: true, msg: '' };
    },
    folderName: 'تابعني — النسخ الاحتياطية',
    post: post,
    copy: function (t) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t); UI.toast('نُسخ الكود ✓', 'ok'); return;
        }
      } catch (e) {}
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); UI.toast('نُسخ الكود ✓', 'ok'); }
      catch (e) { UI.toast('انسخه يدويًا', 'warn'); }
      ta.remove();
    },

    /** اختبار صارم: يجب أن يعود ردّ JSON صريح {ok:true} */
    test: function (cb) {
      post({ test: true, app: 'tabaani' }, function (err, res) {
        if (err) return cb(err);
        if (res && res.unverified) return cb({ message: 'لم نقرأ ردًّا من الرابط — تأكّد أنه ينتهي بـ /exec وأن الوصول «أي شخص».' });
        if (res && res.ok) {
          if (res.folder) S.saveDriveConfig({ folder: res.folder, lastTest: new Date().toISOString(), lastError: '' });
          return cb(null, res);
        }
        cb({ message: 'ردّ غير متوقّع من الرابط — تأكّد من لصق الكود كاملًا ونشر «تطبيق ويب».' });
      });
    },

    /** رفع نسخة + تسجيل النتيجة في السجل */
    upload: function (text, name, cb) {
      var t0 = Date.now();
      post({ name: name, data: text, app: 'tabaani', at: new Date().toISOString() }, function (err, res) {
        var entry = {
          at: new Date().toISOString(), name: name, size: text.length, ms: Date.now() - t0,
          ok: !err,
          note: err ? (err.message || 'فشل الاتصال')
            : (res && res.unverified ? 'أُرسل بلا تحقّق — راجع درايف' : 'رُفع إلى درايف'),
          folder: (res && res.folder) || ''
        };
        S.addDriveLog(entry);
        if (!err && entry.folder) S.saveDriveConfig({ folder: entry.folder, lastOk: entry.at, lastError: '' });
        if (err) S.saveDriveConfig({ lastError: entry.note });
        if (cb) cb(err, res, entry);
      });
    },

    /** رفع نسخة معلّقة (انقطاع إنترنت) عند عودة الاتصال */
    retryPending: function () {
      var p = S.drivePending();
      if (!p || !p.text) return;
      var cfg = S.driveConfig();
      if (!cfg.enabled || !cfg.url || !navigator.onLine) return;
      S.clearDrivePending();
      App.cloud.upload(p.text, p.name, function (err) {
        if (err) { S.saveDrivePending(p); return; }
        UI.toast('رُفعت النسخة المعلّقة إلى درايف ✓', 'ok');
      });
    },

    /** معالج الربط: الخطوات + الكود + الرابط */
    wizard: function (onDone) {
      var cfg = S.driveConfig();
      var urlField = UI.field({
        name: 'url', label: 'رابط تطبيق الويب (Apps Script)', half: false, required: true,
        placeholder: 'https://script.google.com/macros/s/.../exec', value: cfg.url || ''
      });
      var codeBox = h('textarea', { class: 'code-box', rows: 14, readonly: 'readonly', spellcheck: 'false' });
      codeBox.value = SCRIPT_CODE;
      var steps = h('ol', { class: 'cloud-steps' }, STEPS.map(function (s) {
        return h('li', { text: s });
      }));
      var extra = h('div', {}, [
        h('div', { class: 'cloud-open' }, [
          h('a', { class: 'btn btn-primary btn-sm', href: 'https://script.google.com/home/projects/create',
            target: '_blank', rel: 'noopener', text: 'افتح Apps Script — مشروع جديد' }),
          h('span', { class: 'muted', text: 'يفتح لك المحرّر جاهزًا (بلا بحث عن «مشروع جديد»).' })
        ]),
        steps,
        h('div', { class: 'cloud-code' }, [
          h('div', { class: 'cloud-code-head' }, [
            h('strong', { text: 'الكود (الصقه في Apps Script كاملًا)' }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'انسخ الكود', onClick: function () { App.cloud.copy(SCRIPT_CODE); } })
          ]),
          codeBox
        ]),
        h('div', { class: 'callout warn' }, [
          h('strong', { text: 'إن علِقت في «النشر» — هذه الأربعة هي السبب دائمًا: ' }),
          h('ol', { class: 'cloud-steps' }, TRAPS.map(function (t) { return h('li', { text: t }); }))
        ]),
        h('div', { class: 'callout warn', text: 'الرابط سرّي: من يعرفه يستطيع رفع ملفات إلى مجلد النسخ فقط (لا يقرأ شيئًا من درايفك). لا تشاركه، وأعد النشر لإبطاله.' })
      ]);
      var result = h('div', { class: 'cloud-result', hidden: true });
      extra.appendChild(result);

      function runTest() {
        result.hidden = false; result.className = 'cloud-result';
        result.textContent = 'جارٍ الاختبار…';
        App.cloud.test(function (err, res) {
          if (err) {
            result.className = 'cloud-result bad';
            result.textContent = '✗ ' + err.message;
            S.saveDriveConfig({ lastError: err.message });
            return;
          }
          result.className = 'cloud-result ok';
          result.textContent = '✓ تم الربط — سيُحفظ ملف اختبار في مجلد «' + App.cloud.folderName + '».';
          UI.toast('تم ربط Google Drive ✓', 'ok');
          if (onDone) onDone();
        });
      }

      var m = UI.formModal({
        title: 'ربط Google Drive',
        wide: true,
        intro: 'خمس دقائق في حسابك مرة واحدة — وبعدها كل نسخة احتياطية تُرفع تلقائيًا إلى درايفك (بلا خادم وبلا كلمات مرور).',
        fields: [],
        extra: h('div', {}, [extra, urlField.wrap]),
        submitLabel: 'احفظ واختبر',
        onSubmit: function (data, ctx) {
          var url = (urlField.input.value || '').trim();
          var chk = App.cloud.urlCheck(url);
          if (!chk.ok) {
            urlField.wrap.classList.add('has-error');
            result.hidden = false; result.className = 'cloud-result bad';
            result.textContent = '✗ ' + chk.msg;
            return false;
          }
          urlField.wrap.classList.remove('has-error');
          S.saveDriveConfig({ url: url, enabled: true, auto: true });
          runTest();
          return false;   /* أبقِ النافذة مفتوحة لعرض نتيجة الاختبار */
        }
      });
      if (cfg.url) setTimeout(runTest, 300);
      return m;
    }
  };

  /* إعادة المحاولة تلقائيًا عند عودة الاتصال */
  window.addEventListener('online', function () { App.cloud.retryPending(); });
})(window);
