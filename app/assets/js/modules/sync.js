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

  /* ------------------- استعادة كلمة المرور عبر السحابة ------------------- */
  var DEFAULT_CLOUD = 'https://tabaani.tabaani.workers.dev';
  /** إعدادات السحابة للاستعادة: رابط المزامنة إن وُجد، وإلا الخادم الرسمي (مسارات عامة بلا رمز) */
  function cloudCfg() {
    try { var c = S.syncCfg(); if (c && c.url) return { url: c.url, token: c.token || '' }; } catch (e) {}
    return { url: DEFAULT_CLOUD, token: '' };
  }
  /** إقران كامل (يتطلب رمز جلسة) — للرفع والتجهيز */
  function pairedCfg() {
    try { var c = S.syncCfg(); return (c && c.url && c.token) ? c : null; } catch (e) { return null; }
  }
  App.cloudReady = function () { return true; };
  App.cloudUrl = function () { return cloudCfg().url; };

  App.forgotCloud = function (cfg) {
    cfg = cfg || cloudCfg(); if (!cfg) return false;
    var ident = '';
    var body = h('div', { class: 'stack' });
    function stepOne() {
      var id = UI.field({ name: 'ident', label: 'اسم المستخدم أو البريد الإلكتروني', required: true, value: ident });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      var busy = false;
      var form = h('form', { class: 'stack', onsubmit: function (e) {
        e.preventDefault();
        if (busy) return; busy = true;
        err.hidden = true; ident = id.input.value;
        fetch(cfg.url.replace(/\/$/, '') + '/api/auth/forgot', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ident: ident })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
          busy = false;
          if (!j.ok) { err.hidden = false; err.textContent = j.msg || 'تعذّر إرسال الرمز الآن.'; return; }
          stepTwo(j);
        }).catch(function () {
          busy = false; err.hidden = false;
          UI.clear(err);
          err.appendChild(h('span', { text: 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت. ' }));
          err.appendChild(h('button', { class: 'btn-link', type: 'button', text: 'استعادة محلية على هذا الجهاز', onClick: function () { App.forgotLocal(); } }));
        });
      } }, [id.wrap, err, h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'أرسل رمز التحقق' }), h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'يصل الرمز إلى البريد المسجّل في حسابك ✓' })]);
      UI.clear(body); body.appendChild(form);
    }
    function stepTwo(resp) {
      var code = UI.field({ name: 'code', label: 'رمز التحقق (٦ أرقام)', required: true, inputmode: 'numeric' });
      var p1 = UI.field({ name: 'password', label: 'كلمة المرور الجديدة', type: 'password', required: true, help: '٨ أحرف على الأقل' });
      var p2 = UI.field({ name: 'password2', label: 'تأكيد كلمة المرور', type: 'password', required: true });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      var busy = false;
      var form = h('form', { class: 'stack', onsubmit: function (e) {
        e.preventDefault();
        if (busy) return; busy = true;
        if (p1.input.value !== p2.input.value) { busy = false; err.hidden = false; err.textContent = 'كلمتا المرور غير متطابقتين.'; return; }
        err.hidden = true;
        fetch(cfg.url.replace(/\/$/, '') + '/api/auth/reset', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ident: ident, code: code.input.value, password: p1.input.value })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
          busy = false;
          if (!j.ok) { err.hidden = false; err.textContent = j.msg || 'تعذّر تعيين كلمة المرور.'; return; }
          UI.toast('تم تغيير كلمة المرور ✓ سجّل الدخول بالجديدة', 'ok');
          App.login();
        }).catch(function () {
          busy = false; err.hidden = false; err.textContent = 'تعذّر الاتصال بالخادم — أعد المحاولة.';
        });
      } }, [code.wrap, p1.wrap, p2.wrap, err,
        h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'تعيين كلمة المرور الجديدة' }),
        h('button', { class: 'btn-link', type: 'button', text: 'لم يصلك الرمز؟ إعادة الإرسال', onClick: stepOne })]);
      UI.clear(body);
      body.appendChild(h('div', { class: 'stack' }, [
        h('div', { class: 'callout ok', text: (resp && resp.msg) || 'إن كان الحساب مسجّلًا ببريد فسيصلك رمز التحقق خلال دقيقة.' }),
        form
      ]));
    }
    stepOne();
    App.authShell('استعادة كلمة المرور', 'الرمز يصل إلى بريدك المسجّل ✓', h('div', { class: 'stack' }, [
      body,
      h('button', { class: 'btn-link', type: 'button', text: 'رجوع لتسجيل الدخول', onClick: function () { App.login(); } })
    ]));
    return true;
  };

  /** الدخول الموحّد: يتحقق من الخادم أولًا (أي جهاز) ثم محليًا كاحتياط (بلا إنترنت) */
  App.signIn = function (username, password, onOk, onErr) {
    var cfg = cloudCfg();
    var local = function () {
      var res = S.authenticate(username, password);
      if (!res.ok) { onErr(res.error || 'بيانات الدخول غير صحيحة.'); return; }
      var tf = S.twoFactorFor(res.user);
      if (tf.blocked) { onErr(tf.reason + ' — اربط تلقرام أو أوقف الإلزام من الإعدادات.'); return; }
      if (tf.applies) { S.logout(); App.twoFactorScreen(res.user, function () { onOk(res.user); }); return; }
      onOk(res.user);
    };
    if (!navigator.onLine) { local(); return; }
    fetch(cfg.url.replace(/\/$/, '') + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.j || !res.j.ok) { local(); return; }
        var tok = res.j.token;
        fetch(cfg.url.replace(/\/$/, '') + '/api/me/data', { headers: { authorization: 'Bearer ' + tok } })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (d) {
            S.cloudStart(cfg.url, tok, res.j.user, (d && d.data) || {});
            onOk(res.j.user);
          })
          .catch(function () { local(); });
      })
      .catch(function () {
        onErr('تعذّر الوصول إلى السحابة — تحقّق من الإنترنت ثم أعد المحاولة.');
      });
  };

  /** تجهيز/تحديث الحسابات السحابية للمستخدمين الحاليين (المشرف العام) */
  App.cloudProvision = function (onDone) {
    var cfg = pairedCfg();
    if (!cfg) { UI.toast('اربط المزامنة السحابية أولًا', 'warn'); return; }
    var users = S.list('users').map(function (u) {
      return { id: u.id, name: u.name, role: u.role, username: u.username, email: u.email || '',
        password: u.password || '', phone: u.phone || '', telegram: u.telegramChatId || '',
        schoolId: u.schoolId || null, status: u.status || 'active',
        ackStatus: (u.ack && u.ack.status) || 'pending' };
    }).filter(function (u) { return u.username && u.password; });
    if (!users.length) { UI.toast('لا مستخدمين صالحين للتهيئة', 'warn'); return; }
    UI.confirm('تجهيز ' + users.length + ' حسابًا سحابيًا؟\n' +
      '• يستطيعون الدخول من أي جهاز واستعادة كلمة المرور بالبريد ✓\n' +
      '• كلمات المرور تُخزَّن مشفّرة (PBKDF2) على الخادم.',
      { ok: 'تجهيز الآن' }).then(function (yes) {
      if (!yes) return;
      fetch(cfg.url.replace(/\/$/, '') + '/api/admin/provision', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.token },
        body: JSON.stringify({ users: users })
      }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
        if (!j.ok) { UI.toast(j.msg || 'تعذّر التجهيز', 'bad'); return; }
        UI.toast('جاهز ✓ أُنشئ ' + j.created + ' · حُدّث ' + j.updated + (j.skipped ? ' · تُخطّي ' + j.skipped : ''), 'ok');
        if (onDone) onDone(j);
      }).catch(function () { UI.toast('تعذّر الاتصال بالخادم', 'bad'); });
    });
  };

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
          h('button', { class: 'btn btn-outline', type: 'button', text: '☁️ تجهيز الحسابات السحابية', onClick: function () { App.cloudProvision(); } }),
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
          h('div', { class: 'callout info', text: '«تجهيز الحسابات السحابية» يرسل مستخدمي هذا الجهاز إلى الخادم بكلمات مرور مشفّرة — بعدها يستطيع كل مستخدم الدخول من أي جهاز واستعادة كلمة المرور على بريده ✓' }),
          c.lastError ? h('div', { class: 'callout warn', text: 'آخر خطأ: ' + c.lastError }) : null
        ]));
      }
      view.appendChild(host);
    }
  });
})();
