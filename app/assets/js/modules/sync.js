/* ==========================================================================
   المزامنة السحابية — نسخة المدرسة على خادم Cloudflare (المرحلة الثانية)
   --------------------------------------------------------------------------
   • إقران: رابط الـWorker + دخول بحساب المدرسة → رمز جلسة (يُخزَّن محليًا).
   • رفع: يُرسل كل بيانات المدرسة (وتشمل **كشوف الدرجات** ونقاط الطلاب).
   • تنزيل: يجلب نسخة الخادم ويطبّقها بعد تأكيد + نسخة احتياطية تلقائية.
   • التعارض: لا نكتب فوق نسخة أحدث — الخادم يردّ 409 وتُعرض المقارنة.
   • رفع تلقائي بعد حفظ كشوف الدرجات عند تشغيل «تلقائي».
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h;

  function jpost(url, path, body, token) {
    return fetch(url.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, ok: r.ok, body: j }; }, function () { return { status: r.status, ok: r.ok, body: {} }; }); });
  }
  function jget(url, path, token) {
    return fetch(url.replace(/\/$/, '') + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, ok: r.ok, body: j }; }, function () { return { status: r.status, ok: r.ok, body: {} }; }); });
  }
  function jput(url, path, body, token) {
    return fetch(url.replace(/\/$/, '') + path, {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, ok: r.ok, body: j }; }, function () { return { status: r.status, ok: r.ok, body: {} }; }); });
  }

  /** دمج ذكي: نأخذ الأحدث للكشوف والمستخدمين بلا حذف شيء (نسخة الاحتياط أولًا) */
  function mergeServer(local, server) {
    var out = JSON.parse(JSON.stringify(server || {}));
    var byId = function (arr) { var m = {}; (arr || []).forEach(function (x) { m[x.id] = x; }); return m; };
    ['gradeSheets', 'students', 'users', 'classes'].forEach(function (k) {
      var sm = byId(out[k]), lm = byId(local && local[k]);
      Object.keys(lm).forEach(function (id) { if (!sm[id]) out[k] = (out[k] || []).concat([lm[id]]); });
    });
    return out;
  }

  App.syncPush = function (cb) {
    var c = S.syncCfg();
    if (!c.url || !c.token) { if (cb) cb({ ok: false, error: 'المزامنة غير مقرونة بعد' }); return; }
    UI.toast('جارٍ رفع نسخة المدرسة…', 'info');
    jput(c.url, '/api/sync', { baseVersion: c.lastVersion || 0, data: S.db }, c.token).then(function (r) {
      var j = r.body || {};
      if (j.ok) {
        S.saveSyncCfg({ lastVersion: j.version, lastAt: new Date().toISOString(), lastError: '' });
        S.clearSyncDirty();
        UI.toast('رُفعت النسخة إلى السحابة (v' + j.version + ') — ' + Math.round((j.bytes || 0) / 1024) + ' ك.ب', 'ok');
        if (cb) cb({ ok: true, version: j.version });
        App.route();
        return;
      }
      if (j.conflict) {
        S.saveSyncCfg({ lastError: 'تعارض: نسخة الخادم أحدث (v' + j.version + ')' });
        UI.modal({ title: 'تعارض في النسخ', wide: true, body: [
          h('p', { text: 'نسخة الخادم أحدث (v' + j.version + ') — اختر:' }),
          h('ul', { class: 'promo-steps' }, [
            h('li', { text: '«نزّل نسخة الخادم» ثم أعد إدخال تعديلاتك.' }),
            h('li', { text: 'أو «ادمج وحاول الرفع» — يُدمج ما عندك مع نسخة الخادم (بحسب المعرّفات) ثم يُرفع كنسخة جديدة.' })
          ])
        ], actions: [
          { label: 'نزّل نسخة الخادم', class: 'btn-outline', onClick: function (close) { close(); App.syncPull(); } },
          { label: 'ادمج وحاول الرفع', class: 'btn-primary', onClick: function (close) {
              close();
              var merged = mergeServer(S.db, j.latest);
              S.saveSyncCfg({ lastVersion: j.version });
              S.applyServerData(merged);
              App.syncPush();
            } },
          { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } }
        ] });
        if (cb) cb({ ok: false, conflict: true });
        return;
      }
      S.saveSyncCfg({ lastError: j.msg || 'فشل الرفع' });
      UI.toast('تعذّر الرفع: ' + (j.msg || ''), 'bad');
      if (cb) cb({ ok: false, error: j.msg });
    }).catch(function (e) {
      S.saveSyncCfg({ lastError: e.message });
      UI.toast('تعذّر الاتصال بالخادم: ' + e.message, 'bad');
      if (cb) cb({ ok: false, error: e.message });
    });
  };

  App.syncPull = function (cb) {
    var c = S.syncCfg();
    if (!c.url || !c.token) { if (cb) cb({ ok: false, error: 'المزامنة غير مقرونة' }); return; }
    jget(c.url, '/api/sync', c.token).then(function (r) {
      var j = r.body || {};
      if (!j.ok || !j.data) { UI.toast('لا نسخة على الخادم بعد (' + (j.msg || '') + ')', 'warn'); if (cb) cb({ ok: false }); return; }
      var local = S.db;
      var doIt = function () {
        UI.downloadText(JSON.stringify(local), 'تابعني-قبل-الدمج-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json', 'application/json');
        var merged = mergeServer(local, j.data);
        var res = S.applyServerData(merged);
        S.saveSyncCfg({ lastVersion: j.version, lastAt: new Date().toISOString(), lastError: '' });
        UI.toast(res.ok ? ('نُزّلت نسخة الخادم (v' + j.version + ') ودُمجت مع بياناتك ✓') : ('تعذّر التطبيق: ' + res.error), res.ok ? 'ok' : 'bad');
        App.route();
        if (cb) cb({ ok: res.ok });
      };
      UI.confirm('سيُنزَّل ما على الخادم (v' + j.version + ') ويُدمج مع بيانات هذا الجهاز — وتُنزَّل نسخة احتياطية قبل الدمج. متابعة؟', doIt);
    }).catch(function (e) { UI.toast('تعذّر الاتصال: ' + e.message, 'bad'); if (cb) cb({ ok: false }); });
  };

  /** يُستدعى بعد كل كتابة مهمة (كشوف الدرجات وغيرها) */
  App.syncAfterWrite = function (why) {
    var c = S.syncCfg();
    S.markSyncDirty(why);
    if (c.auto && c.url && c.token && navigator.onLine) {
      if (App._syncTimer) clearTimeout(App._syncTimer);
      App._syncTimer = setTimeout(function () { App.syncPush(); }, 1500);
    }
  };

  /* ==========================================================================
     اللحظية: (١) أي تعديل في أي شاشة يُعلَّم ويُرفع تلقائيًا
              (٢) سحب تلقائي كل ٢٠ ثانية وعند العودة للتطبيق — فتظهر تعديلات غيرك بسرعة
     ========================================================================== */
  (function autoSync() {
    /* (١) اعتراض الحفظ العام: أي كتابة ⇒ تعديل معلّق (مع منع التكرار اللانهائي) */
    var origSave = S.save;
    if (typeof origSave === 'function' && !origSave.__syncWrapped) {
      var wrapped = function () {
        var r = origSave.apply(S, arguments);
        if (!S._inSyncWrite) {
          /* مؤجَّل (debounce): لا نكتب/نعلّم عند كل حفظ — مرة واحدة كل نصف ثانية ⇒ أداء سليم */
          clearTimeout(App._dirtyT);
          App._dirtyT = setTimeout(function () {
            var cfg = S.syncCfg();
            if (!S.syncDirty()) {
              S._inSyncWrite = true;
              try { S.markSyncDirty && S.markSyncDirty('تعديل في المنصة'); } finally { S._inSyncWrite = false; }
            }
            if (cfg.auto && cfg.url && cfg.token && navigator.onLine) {
              clearTimeout(App._autoPushT);
              App._autoPushT = setTimeout(function () { App.syncPush(); }, 2500);
            }
          }, 500);
        }
        return r;
      };
      wrapped.__syncWrapped = true;
      S.save = wrapped;
    }

    /* (٢) سحب تلقائي: كل ٢٠ ثانية + عند عودة التركيز للتطبيق */
    var polling = false;
    function checkRemote() {
      var c = S.syncCfg();
      /* السحب التلقائي يعمل فقط في الوضع «تلقائي» — ولا يُقاطع من يكتب ولا يدهس تعديلات غير مرفوعة */
      if (!c.url || !c.token || !c.auto || !navigator.onLine || polling) return;
      if (document.hidden) return;
      polling = true;
      fetch(c.url.replace(/\/$/, '') + '/api/sync', { headers: { Authorization: 'Bearer ' + c.token } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          polling = false;
          if (!j || !j.ok) return;
          if (!j.version || j.version <= (c.lastVersion || 0)) return;        /* لا جديد */
          if (S.syncDirty()) {                                                /* عندي تعديلات: لا أدهسها */
            if (!App._syncNoticeShown) {
              App._syncNoticeShown = 1;
              UI.toast('توجد تعديلات جديدة على السحابة — افتح «المزامنة السحابية» واختر «نزّل نسخة الخادم»', 'warn', 6000);
            }
            return;
          }
          var before = document.activeElement && document.activeElement.tagName;
          if (before === 'INPUT' || before === 'TEXTAREA') return;            /* لا نقاطع من يكتب */
          var res = S.applyServerData(j.data);
          if (res.ok) {
            S.saveSyncCfg({ lastVersion: j.version, lastAt: new Date().toISOString() });
            UI.toast('تم تحديث البيانات من السحابة (v' + j.version + ') ✓', 'ok');
            App._syncNoticeShown = 0;
            App.route();
          }
        })
        .catch(function () { polling = false; });
    }
    App.syncCheckRemote = checkRemote;
    setInterval(checkRemote, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkRemote(); });
    window.addEventListener('focus', checkRemote);
  })();

  App.register({
    id: 'sync',
    label: 'المزامنة السحابية',
    icon: '&#9729;&#65039;',
    roles: ['super', 'principal'],
    render: function (view) {
      var c = S.syncCfg();
      var host = h('div', { class: 'stack' });
      var nameF = UI.field({ name: 'u', label: 'حساب الخادم (ليس حساب دخولك للمنصة)', half: true, value: c.username || 'admin' });
      var passF = UI.field({ name: 'p', label: 'كلمة مرور حساب الخادم', type: 'password', half: true });
      var urlF = UI.field({ name: 'url', label: 'رابط الخادم (Worker)', half: false, value: c.url, placeholder: 'https://tabaani.<حسابك>.workers.dev' });
      var autoF = UI.field({ name: 'auto', label: 'المزامنة اللحظية', type: 'select', half: true, value: c.auto ? '1' : '0',
        options: [{ value: '1', label: 'تلقائية — رفع بعد كل تعديل + سحب كل ٢٠ ثانية ⚡' }, { value: '0', label: 'يدوية — أرفع/أنزّل بنفسي' }] });

      host.appendChild(UI.panel('إقران المزامنة',
        c.token ? ('مقرون ✓ — آخر رفع: ' + (c.lastAt ? UI.fmtDateTime(c.lastAt) : 'لم يُرفع بعد') + ' · إصدار الخادم v' + c.lastVersion) : 'اربط نسخة مدرستك على الخادم ليدخل الجميع من أي جهاز بنفس البيانات.',
        [
          h('button', { class: 'btn btn-primary', type: 'button', text: c.token ? 'تحديث الإقران' : 'أقرن الآن', onClick: function () {
            var url = urlF.input.value.trim();
            if (!/^https?:\/\//.test(url)) { UI.toast('ضع رابط الخادم كاملًا (https://…)', 'warn'); return; }
            S.saveSyncCfg({ url: url, auto: autoF.input.value === '1' });
            if (!passF.input.value) { UI.toast('حُفظ الرابط — أدخل كلمة المرور للدخول', 'warn'); App.route(); return; }
            jpost(url, '/api/auth/login', { username: nameF.input.value.trim(), password: passF.input.value }).then(function (r) {
              if (r.body && r.body.ok && r.body.token) {
                S.saveSyncCfg({ token: r.body.token, username: nameF.input.value.trim(), lastError: '' });
                UI.toast('تمّ الإقران ✓ — يمكنك الرفع والتنزيل', 'ok');
                App.syncPush();
              } else {
                UI.toast('فشل الدخول: ' + ((r.body && r.body.msg) || ('HTTP ' + r.status)), 'bad');
              }
            }).catch(function (e) { UI.toast('تعذّر الوصول للخادم: ' + e.message, 'bad'); });
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'افحص الاتصال', onClick: function () {
            jget(urlF.input.value.trim(), '/api/health', null).then(function (r) {
              var j = r.body || {};
              UI.toast(j.ok ? ('الخادم يعمل ✓ — بريد: ' + (j.mail ? 'مضبوط' : 'غير مضبوط') + ' · تلقرام: ' + (j.telegram ? 'مضبوط' : 'غير مضبوط')) : ('ردّ غير متوقّع (HTTP ' + r.status + ')'), j.ok ? 'ok' : 'bad');
            }).catch(function (e) { UI.toast('تعذّر الوصول: ' + e.message, 'bad'); });
          } })
        ], [
          h('div', { class: 'callout warn' }, [
            h('div', { html: '<b>تنبيه مهم:</b> البيانات هنا هي <b>حساب الخادم السحابي</b> — وليست حساب دخولك للمنصة.' }),
            h('div', { class: 'muted', style: { marginTop: '4px' },
              text: 'الحساب الافتراضي على الخادم: admin / Tabaani@2026 (غيّره بعد أول ربط). أما دخولك للمنصة فبحسابك المعتاد على هذا الجهاز.' })
          ]),
          h('div', { class: 'callout info', text: 'الرابط هو ما يعطيك إياه Cloudflare بعد النشر. وللمدارس: كل مدرسة تربط بحساب مديرها على الخادم.' }),
          h('div', { class: 'form-grid' }, [urlF.wrap, nameF.wrap, passF.wrap, autoF.wrap])
        ]));

      if (c.token) {
        host.appendChild(UI.panel('النسخ', 'كشوف الدرجات ونقاط الطلاب تُرفع مع النسخة تلقائيًا.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: '⬆️ ارفع نسختي إلى السحابة', onClick: function () { App.syncPush(); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '⬇️ نزّل نسخة الخادم ودمج', onClick: function () { App.syncPull(); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🔌 افصل المزامنة', onClick: function () {
            UI.confirm('سيُحذف رمز الجلسة من هذا الجهاز (تبقى بياناتك كما هي). متابعة؟', function () {
              S.saveSyncCfg({ token: '', lastError: '' }); UI.toast('فُصلت المزامنة', 'ok'); App.route();
            });
          } })
        ], [
          h('div', { class: 'stat-row' }, [
            UI.statCard('حالة المزامنة', S.syncDirty() ? 'تعديلات غير مرفوعة' : 'متزامنة ✓', S.syncDirty() ? ((S.syncDirty().why) || '') : 'لا تغييرات معلّقة', S.syncDirty() ? 'amber' : 'mint'),
            UI.statCard('كشوف الدرجات', String(S.gradeSheetsForCloud().length), 'كشفًا محفوظًا محليًا', 'brand'),
            UI.statCard('إصدار الخادم', 'v' + c.lastVersion, c.lastAt ? UI.fmtDateTime(c.lastAt) : '—', 'brand')
          ]),
          c.lastError ? h('div', { class: 'callout warn', text: 'آخر خطأ: ' + c.lastError }) : null
        ]));
      }
      view.appendChild(host);
    }
  });
})();
