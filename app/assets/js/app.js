/* =============================================================================
   app.js — القشرة، التوجيه (Router)، لوحة البداية، وتصفية الوحدات بحسب الدور
   ========================================================================== */
(function (global) {
  'use strict';
  var S = global.Store, UI = global.UI, h = UI.h, clear = UI.clear;

  var App = {
    modules: {},
    order: [],
    current: 'dashboard',
    register: function (mod) {
      if (!mod || !mod.id) return;
      App.modules[mod.id] = mod;
      if (App.order.indexOf(mod.id) === -1) App.order.push(mod.id);
    },
    go: function (id) { location.hash = '#/' + id; },
    /** عنوان تبويب المتصفح: «اسم الشاشة · تابعني» (والأساس بلا تكرار الاسم) */
    setTitle: function (text) {
      document.title = text ? (String(text).trim() + ' · تابعني') : 'تابعني للخدمات الذكية';
      return document.title;
    },
    can: function (mod) {
      if (!mod) return false;
      if (mod.roles && mod.roles.indexOf(S.session.role) === -1) return false;
      if (mod.pro && !S.isPro()) return false;     /* وحدات تلقرام: مشمولة في باقة «تابعني برو» فقط */
      return true;
    },

    /* --------------------------------------------------------- شارات العدّ */
    badgeFor: function (id) {
      var role = S.session.role, n = 0;
      if (id === 'violations') {
        if (role === 'guidance') n = S.list('violations').filter(function (v) { return v.status === 'guidance_pending'; }).length;
        else if (role === 'deputy') n = S.list('violations').filter(function (v) { return v.status === 'deputy_pending'; }).length;
      }
      if (id === 'permissions' && (role === 'deputy' || role === 'guidance')) {
        n = S.list('permissions').filter(function (p) { return p.status === 'deputy_pending'; }).length;
      }
      if (id === 'activities' && role === 'teacher') {
        n = S.list('activityReqs').filter(function (r) { return r.status === 'pending'; }).length;
      }
      if (id === 'attendance-reports' && (role === 'deputy' || role === 'principal')) {
        n = S.list('sessions').filter(function (s) { return s.status === 'closed' && !s.seen; }).length;
      }
      if (id === 'volunteer' && role === 'volunteer') {
        n = S.list('programRegs').filter(function (r) { return r.status === 'pending'; }).length;
      }
      /* إذن دخول الفصل: للمعلم عدد الأذون التي لم يُقرّ باستلامها */
      if (id === 'entry-permit' && role === 'teacher') {
        n = S.entryPermits({ teacherId: S.session.userId }).filter(function (x) { return !x.ack; }).length;
      }
      /* الرسائل الخاصة: عدد غير المقروء */
      if (id === 'messages') n = S.unreadMessages(S.session.userId);
      /* الدعم الفني: التذاكر الجديدة التي لم تُعالج */
      if (id === 'support') n = S.ticketStats().open;
      return n;
    },
    refreshBadges: function () {
      Array.prototype.forEach.call(document.querySelectorAll('.side-nav a'), function (a) {
        var id = a.getAttribute('data-mod');
        var n = App.badgeFor(id);
        var slot = a.querySelector('.count');
        if (n > 0) {
          if (!slot) { slot = h('span', { class: 'count' }); a.appendChild(slot); }
          slot.textContent = n;
        } else if (slot) slot.remove();
      });
    },


    /* ====================== الباقات والاشتراكات (كلاسيك · برو) ====================== */
    /** شارة الباقة + حالة الاشتراك */
    licenseBadge: function (schoolId) {
      var st = S.licenseState(schoolId);
      if (!st) return h('span', { class: 'muted', text: '—' });
      return h('span', { class: 'plan-wrap' }, [
        h('span', { class: 'plan-chip plan-' + st.plan, title: st.planName + ' · ' + st.annual + ' ر.س سنويًا' }, [
          h('span', { class: 'pc-mrk', html: st.plan === 'pro' ? '&#9733;' : '&#9679;' }),
          h('span', { text: st.planShort })
        ]),
        UI.badge(st.label, st.tone)
      ]);
    },
    _licRow: function (k, v) {
      return h('div', { class: 'lic-row' }, [
        h('span', { class: 'lr-k', text: k }), h('span', { class: 'lr-v', text: String(v) })
      ]);
    },
    _licTone: function (st) { return st.blocked ? 'danger' : (st.overdue ? 'danger' : (st.soon ? 'warn' : 'ok')); },
    _licLine: function (st) {
      var when = st.paidUntil
        ? ('مسدَّد حتى ' + st.paidUntil + (st.daysLeft !== null ? ' (' + st.daysLeft + ' يومًا)' : ''))
        : 'لا يوجد سداد مسجَّل';
      var head = st.blocked ? 'دخول المدرسة موقوف' : (st.overdue ? 'الاشتراك متأخّر' : (st.soon ? 'ينتهي الاشتراك قريبًا' : 'الاشتراك ساري'));
      return h('span', { class: 'muted', text: '· ' + when + ' · ' + st.annual + ' ر.س سنويًا — ' + head });
    },
    /** تسجيل سداد سنة كاملة */
    payFlow: function (schoolId, years) {
      var sc = S.school(schoolId) || {}, st = S.licenseState(schoolId);
      if (!st) return;
      var y = years || 1;
      UI.confirm('تسجيل سداد الاشتراك السنوي لباقة «' + st.planName + '» — ' + sc.name + '؟\n' +
        'المبلغ: ' + (st.annual * y) + ' ر.س · السريان حتى: ' + (st.paidUntil ? 'بعد تمديد سنة من ' + st.paidUntil : 'سنة من اليوم') +
        (st.blocked && st.reason === 'fees' ? '\nويُرفع الإيقاف تلقائيًا بعد السداد.' : ''),
        { ok: 'تسجيل السداد', danger: false }).then(function (yes) {
        if (!yes) return;
        var r = S.recordPayment(schoolId, { kind: 'annual', years: y });
        if (!r.ok) { UI.toast(r.error, 'warn'); return; }
        UI.toast('سُجّل سداد ' + r.amount + ' ر.س — سارية حتى ' + r.state.paidUntil, 'ok');
        App.route();
      });
    },
    /** إيقاف مباشر بضغطة واحدة — السبب يُستنتج: رسوم إن كان متأخّرًا، وإلا مشكلة تشغيلية */
    suspendFlow: function (schoolId, onDone) {
      var sc = S.school(schoolId) || {}, st = S.licenseState(schoolId);
      if (!st) return;
      var reason = (st.overdue || !st.paidUntil) ? 'fees' : 'issue';
      var why = reason === 'fees' ? 'عدم سداد الرسوم السنوية' : 'مشكلة تشغيلية';
      var done = function () { if (onDone) onDone(); else App.route(); };
      UI.confirm('إيقاف دخول مدرسة ' + sc.name + '؟\n' +
        '• سيتوقف دخول كل حسابات المدرسة فورًا: المدير والوكلاء والمعلمون والطلاب.\n' +
        '• السبب المسجَّل: ' + why + ' — ويمكن تحديد سبب آخر وملاحظة من «تحديد السبب».\n' +
        '• حسابك كمشرف عام لا يتأثّر.',
        { ok: 'إيقاف دخول المدرسة', danger: true }).then(function (yes) {
        if (!yes) return;
        var r = S.suspendSchool(schoolId, reason, '');
        if (!r.ok) { UI.toast(r.error, 'warn'); return; }
        UI.toast('أُوقف دخول ' + sc.name + ' — لا يستطيع أي حساب من المدرسة الدخول', 'warn');
        done();
      });
    },
    /** رفع الإيقاف */
    activateFlow: function (schoolId, onDone) {
      var sc = S.school(schoolId) || {}, st = S.licenseState(schoolId) || {};
      var done = function () { if (onDone) onDone(); else App.route(); };
      UI.confirm('تفعيل دخول مدرسة ' + sc.name + '؟\n' +
        'سيعود كل حساباتها (المدير والوكلاء والمعلمون والطلاب) للدخول فورًا.' +
        (st.blocked && st.reason === 'fees' && st.overdue ? '\nملاحظة: الاشتراك متأخّر السداد — الإيقاف سيعود عند تجاوز مدة السماح إن لم يُسدَّد.' : ''),
        { ok: 'تفعيل دخول المدرسة' }).then(function (yes) {
        if (!yes) return;
        var r = S.activateSchool(schoolId);
        if (!r.ok) { UI.toast(r.error, 'warn'); return; }
        UI.toast('فُعّل دخول ' + sc.name + ' ✓', 'ok');
        done();
      });
    },
    /** نافذة الإيقاف: السبب + ملاحظة (قرار المشرف العام) */
    suspendDialog: function (schoolId, onDone) {
      var sc = S.school(schoolId) || {};
      var reason = 'fees';
      var note = h('textarea', { class: 'input', rows: '2', placeholder: 'ملاحظة (اختيارية) — تُسجَّل في سجل التدقيق وتُرسل لإدارة المدرسة' });
      var opts = [
        { v: 'fees', t: 'عدم سداد الرسوم السنوية', d: 'الاشتراك السنوي غير مسدَّد — ويُرفع الإيقاف تلقائيًا عند تسجيل السداد.' },
        { v: 'issue', t: 'مشكلة تشغيلية', d: 'خلل أو مخالفة في الاستخدام — يُرفع بقرار من إدارة تابعني.' },
        { v: 'other', t: 'سبب آخر', d: 'يُوضَّح في الملاحظة.' }
      ];
      var box = h('div', { class: 'stack' });
      opts.forEach(function (o) {
        var radio = h('input', { type: 'radio', name: 'suspendReason' });
        radio.checked = (o.v === reason);
        radio.addEventListener('change', function () { reason = o.v; });
        box.appendChild(h('label', { class: 'setup-card' + (o.v === reason ? ' is-on' : ''), onClick: function () { reason = o.v; redraw(); } }, [
          radio, h('div', {}, [h('strong', { text: o.t }), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: o.d })])
        ]));
      });
      function redraw() {
        clear(box);
        opts.forEach(function (o) {
          var radio = h('input', { type: 'radio', name: 'suspendReason' });
          radio.checked = (o.v === reason);
          radio.addEventListener('change', function () { reason = o.v; redraw(); });
          box.appendChild(h('label', { class: 'setup-card' + (o.v === reason ? ' is-on' : ''), onClick: function () { reason = o.v; redraw(); } }, [
            radio, h('div', {}, [h('strong', { text: o.t }), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: o.d })])
          ]));
        });
      }
      redraw();
      var dlg = UI.modal({
        title: 'إيقاف دخول مدرسة: ' + sc.name,
        body: [
          h('div', { class: 'lic-banner is-danger' }, [
            h('strong', { text: 'سيتوقف دخول كل حسابات المدرسة فورًا' }),
            h('span', { class: 'muted', text: '— المدير والوكلاء والمعلمون والطلاب.' }),
            h('span', { text: 'حسابك كمشرف عام لا يتأثّر.' })
          ]),
          box, note
        ],
        actions: [
          { label: 'إيقاف الدخول', class: 'btn-danger', onClick: function (close) {
              var r = S.suspendSchool(schoolId, reason, note.value);
              if (!r.ok) { UI.toast(r.error, 'warn'); return; }
              UI.toast('أُوقف دخول ' + sc.name + ' — لا يستطيع أي حساب من المدرسة الدخول', 'warn');
              close(); onDone && onDone(); App.route();
            } },
          { label: 'إلغاء' }
        ]
      });
      return dlg;
    },
    /** نافذة الترخيص الكاملة: العرض + السداد + الباقة + الإيقاف */
    licenseDialog: function (schoolId, onDone) {
      var sc = S.school(schoolId) || {}, st = S.licenseState(schoolId);
      if (!st) return;
      var close0 = function () { if (dlg) dlg.close(); };
      var rebuild = function () { close0(); App.licenseDialog(schoolId, onDone); };
      var fees = S.planFees();
      var dlg = UI.modal({
        title: 'الباقة والاشتراك — ' + sc.name, wide: true,
        body: [
          h('div', { class: 'lic-banner is-' + App._licTone(st) }, [App.licenseBadge(schoolId), App._licLine(st)]),
          h('div', { class: 'lic-grid' }, [
            App._licRow('الباقة', st.planName),
            App._licRow('الاشتراك السنوي', st.annual + ' ر.س'),
            App._licRow('رسم التأسيس والتهيئة', st.setupFee + ' ر.س — ' + (st.setupPaid ? 'مسدَّد' : 'غير مسدَّد')),
            App._licRow('السريان حتى', st.paidUntil || '—'),
            App._licRow('آخر سداد', st.lastPaymentAt ? UI.fmtDate(st.lastPaymentAt) : '—'),
            App._licRow('تلقرام', st.telegram ? 'مشمول (برو)' : 'غير مشمول (كلاسيك)')
          ]),
          st.note ? h('p', { class: 'lic-note', text: 'ملاحظة الإيقاف: ' + st.note + (st.suspendedAt ? ' — ' + UI.fmtDate(st.suspendedAt) : '') }) : null,
          h('div', { class: 'plan-cards' }, S.PLANS.map(function (pl) {
            var on = st.plan === pl.id;
            return h('div', { class: 'plan-card' + (on ? ' is-on' : '') }, [
              h('h4', { text: pl.name }),
              h('div', { class: 'pc-price nums', text: (pl.id === 'pro' ? fees.pro : fees.classic) + ' ر.س' }),
              h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'سنويًا · ' + pl.tagline }),
              h('ul', {}, pl.features.map(function (f) { return h('li', { text: f }); })),
              h('button', { class: 'btn ' + (on ? 'btn-outline' : 'btn-primary') + ' btn-sm', type: 'button', disabled: on,
                text: on ? ('الباقة الحالية (' + pl.short + ')') : ('التحويل إلى «' + pl.short + '»'),
                onClick: function () {
                  var r = S.setPlan(schoolId, pl.id);
                  if (!r.ok) { UI.toast(r.error, 'warn'); return; }
                  UI.toast('باقة ' + sc.name + ' ← ' + pl.name, 'ok');
                  rebuild(); onDone && onDone();
                } })
            ]);
          })),
          h('p', { class: 'lic-note', text: 'السداد يُسجَّل يدويًا بعد التحصيل (تحويل بنكي أو نقدًا). رسم التأسيس ' + fees.setupFee + ' ر.س مرة واحدة عند تهيئة تابعني للمدرسة.' })
        ],
        actions: [
          { label: 'تسجيل السداد (+سنة)', class: 'btn-primary', onClick: function (close) { close(); App.payFlow(schoolId); } },
          st.setupPaid ? null : { label: 'تسجيل رسم التأسيس', class: 'btn-outline', onClick: function (close) {
              var r = S.recordPayment(schoolId, { kind: 'setup' });
              UI.toast('سُجّل رسم التأسيس ' + r.amount + ' ر.س', 'ok'); close(); App.route();
            } },
          st.blocked ? { label: 'تفعيل دخول المدرسة', class: 'btn-primary', onClick: function (close) { close(); App.activateFlow(schoolId, onDone); } }
                     : { label: 'إيقاف دخول المدرسة', class: 'btn-danger', onClick: function (close) { close(); App.suspendFlow(schoolId, onDone); } },
          st.blocked ? null : { label: 'إيقاف بسبب محدّد', class: 'btn-outline', onClick: function (close) { close(); App.suspendDialog(schoolId, onDone); } },
          { label: 'إغلاق' }
        ].filter(Boolean)
      });
      return dlg;
    },
    /** بطاقة الباقة والاشتراك لقائد المدرسة (مع دعوة الترقية لباقة برو) */
    schoolLicensePanel: function (schoolId) {
      var st = S.licenseState(schoolId);
      if (!st) return h('span');
      var pro = S.planDef('pro'), fees = S.planFees();
      var body = [
        h('div', { class: 'panel-head' }, [
          h('div', {}, [
            h('h3', { text: 'الباقة والاشتراك' }),
            h('p', { class: 'muted', text: st.planName + ' — ' + pro.tagline })
          ]),
          App.licenseBadge(schoolId)
        ]),
        h('div', { class: 'panel-body stack', style: { gap: '10px' } }, [
          h('div', { class: 'lic-grid' }, [
            App._licRow('الباقة الحالية', st.planName),
            App._licRow('الاشتراك السنوي', st.annual + ' ر.س'),
            App._licRow('السريان حتى', st.paidUntil || 'لم يُسجَّل سداد بعد'),
            App._licRow('رسم التأسيس', st.setupPaid ? 'مسدَّد ✓' : 'غير مسدَّد')
          ]),
          st.blocked
            ? h('div', { class: 'lic-banner is-danger' }, [
                h('strong', { text: 'دخول المدرسة موقوف' }),
                h('span', { class: 'muted', text: st.reason === 'fees' ? '— الاشتراك السنوي غير مسدَّد. تواصل مع إدارة تابعني.' : '— قرار من إدارة تابعني. ' + (st.note || '') })
              ])
            : null,
          (!st.blocked && (st.overdue || st.soon))
            ? h('div', { class: 'lic-banner ' + (st.overdue ? 'is-danger' : 'is-warn') }, [
                h('strong', { text: st.overdue ? 'الاشتراك متأخّر' : 'الاشتراك ينتهي قريبًا' }),
                h('span', { class: 'muted', text: st.paidUntil ? '— السريان حتى ' + st.paidUntil + (st.daysLeft !== null ? ' (' + st.daysLeft + ' يومًا)' : '') : '' })
              ])
            : null,
          !st.telegram
            ? h('div', { class: 'plan-hint' }, [
                h('span', { html: '&#9733;', style: { color: 'var(--amber-600)' } }),
                h('span', { text: 'باقتك الحالية «تابعني كلاسيك»: كل الوحدات بلا تلقرام. الترقية إلى «تابعني برو» تضيف إشعارات تلقرام الفورية والمعلمين وأولياء الأمور، والرسائل الخاصة، والتحقق بمرحلتين — ' + (fees.pro - fees.classic) + ' ر.س فرقًا في السنة (الإجمالي ' + fees.pro + ' ر.س). تواصل مع إدارة تابعني.' })
              ])
            : h('div', { class: 'lic-banner is-ok' }, [
                h('strong', { text: 'باقة «تابعني برو»' }),
                h('span', { class: 'muted', text: '— تشمل تلقرام: الإشعارات الفورية، الرسائل الخاصة، والتحقق بمرحلتين.' })
              ])
        ])
      ];
      return h('section', { class: 'panel', style: { marginTop: '14px' } }, body);
    },

    /* ---------------------- النسخة الاحتياطية المجدولة ---------------------- */
    /** ملف النسخة واسمه — مصدر واحد للتنزيل والرفع السحابي */
    backupPayload: function () {
      var d = new Date();
      var name = 'تابعني-نسخة-' + d.toISOString().slice(0, 10) + '-' +
        String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '.json';
      return { text: S.backupJson(), name: name };
    },
    /** تنزيل نسخة احتياطية للجهاز الآن (+ رفع سحابي إن كان مربوطًا) */
    backupNow: function (silent) {
      var p = App.backupPayload();
      UI.downloadText(p.text, p.name, 'application/json');
      S.markBackup();
      var banner = document.querySelector('.backup-banner');
      if (banner) banner.remove();          /* الشريط خارج #view فلا يكفي App.route() */
      var cfg = S.driveConfig();
      if (cfg.enabled && cfg.auto && cfg.url) {
        if (!navigator.onLine) {
          S.saveDrivePending({ text: p.text, name: p.name, at: new Date().toISOString() });
          UI.toast('نُزّلت النسخة ✓ — لا إنترنت الآن، ستُرفع إلى درايف تلقائيًا', 'warn');
        } else {
          UI.toast('نُزّلت النسخة ✓ — جارٍ رفعها إلى درايف…', 'ok');
          window.App.cloud.upload(p.text, p.name, function (err, res) {
            if (err) UI.toast('تعذّر الرفع: ' + (err.message || '') + ' — الملف محفوظ عندك', 'warn');
            else if (res && res.unverified) UI.toast('أُرسلت إلى درايف (بلا تحقّق) — راجع المجلد', 'warn');
            else UI.toast('✓ رُفعت إلى درايف — «' + window.App.cloud.folderName + '»', 'ok');
            App.route();
          });
        }
      } else if (!silent) UI.toast('نُزّلت النسخة ✓ — احفظها في درايف أو بريدك', 'ok');
      App.route();
    },
    /** شريط تذكير النسخة الأسبوعية */
    backupBanner: function (due) {
      var banner = h('div', { class: 'backup-banner' }, [
        h('span', { class: 'bb-ic', html: '&#128190;' }),
        h('div', { class: 'bb-txt' }, [
          h('strong', { text: 'حان موعد النسخة الاحتياطية' }),
          h('span', { text: ' — ' + (due.never ? 'لم تُؤخذ نسخة على هذا الجهاز بعد.'
            : due.slot ? 'موعدك الأسبوعي (' + S.scheduleLabel() + ').'
            : 'آخر نسخة قبل ' + due.daysSince + ' يومًا.') + ' نزّل الملف واحفظه في درايف أو بريدك.' })
        ]),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تنزيل النسخة الآن',
          onClick: function () { App.backupNow(); } }),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تأجيل أسبوعًا', onClick: function () {
          S.saveBackupSchedule({ snoozeUntil: new Date(Date.now() + 7 * 864e5).toISOString() });
          UI.toast('أُجّل التذكير أسبوعًا', 'ok'); App.route();
        } }),
        h('button', { class: 'icon-btn', type: 'button', title: 'إخفاء', html: '&times;', onClick: function () { banner.remove(); } })
      ]);
      return banner;
    },

    /** إزالة زر الدعم العائم (عند الخروج أو العودة لشاشة الدخول) */
    _removeSupportFab: function () {
      var f = document.getElementById('support-fab');
      if (f) f.remove();
    },

    /* ------------------------------------------------------------- القشرة */
    shell: function () {
      var root = document.getElementById('app');
      var login = document.querySelector('.login-wrap');
      if (login) login.remove();
      clear(root);
      document.body.classList.add('app-body');

      var sidebar = h('aside', { class: 'sidebar', id: 'sidebar' });
      var topbar = h('header', { class: 'topbar' });
      var main = h('div', { class: 'main-area' });
      var content = h('div', { class: 'app-main', id: 'view' });
      main.appendChild(topbar); main.appendChild(content);

      root.appendChild(h('div', { class: 'app-shell' }, [sidebar, main]));
      if (App._stamp) setTimeout(App._stamp, 30);   /* ختم الإصدار أسفل القائمة */

      /* الشريط الجانبي */
      var school = S.school(S.session.schoolId);
      sidebar.appendChild(h('a', { class: 'brand', href: '#/dashboard' }, [
        h('img', { src: 'assets/img/logo-mark.png', alt: '', width: '44', height: '33' }),
        h('span', {}, [
          h('span', { class: 'brand-name', style: { color: '#fff' }, text: 'تابعني' }),
          h('span', { class: 'brand-sub', text: 'للخدمات الذكية' })
        ])
      ]));
      sidebar.appendChild(h('div', { class: 'side-school' }, [
        h('strong', { text: school ? school.name : 'مدرسة' }),
        h('span', { text: school ? [school.city, school.code].filter(Boolean).join(' · ') : '' }),
        school ? App.licenseBadge(school.id) : null
      ]));

      /* خلفية القائمة المنسدلة على الجوال */
      var backdrop = h('div', { class: 'nav-backdrop', onClick: function () { sidebar.classList.remove('is-open'); backdrop.classList.remove('is-open'); } });
      document.body.appendChild(backdrop);
      sidebar._backdrop = backdrop;

      var nav = h('nav', { class: 'side-nav', 'aria-label': 'أقسام تابعني' });
      App.order.forEach(function (id) {
        var mod = App.modules[id];
        if (!mod || !App.can(mod)) return;
        nav.appendChild(h('a', { href: '#/' + id, 'data-mod': id }, [
          h('span', { class: 'ni', html: mod.icon || '&#9679;' }),
          h('span', { text: S.gtext(mod.label) })
        ]));
      });
      sidebar.appendChild(nav);
      sidebar.appendChild(h('div', { class: 'side-role' }, [
        h('div', { style: { fontWeight: '700', color: '#fff' }, text: S.session.name }),
        h('div', { text: S.roleLabel(S.session.role) })
      ]));

      S.genderizeDom(sidebar);
      /* الشريط العلوي */
      var inbox = S.inbox();
      var unread = inbox.filter(function (n) { return !n.read; }).length;
      topbar.appendChild(h('button', { class: 'icon-btn burger-app', type: 'button', 'aria-label': 'القائمة', onClick: function () {
        var open = sidebar.classList.toggle('is-open');
        if (sidebar._backdrop) sidebar._backdrop.classList.toggle('is-open', open);
      } }, [h('span', { html: '&#9776;' })]));
      topbar.appendChild(h('h2', { id: 'view-title', text: '' }));
      var scopeKind = (S.searchScope() || {}).kind;
      topbar.appendChild(h('div', { class: 'topbar-search hide-sm' }, [
        h('span', { html: '&#128269;' }),
        h('input', { class: 'input', type: 'search', placeholder: scopeKind === 'all' ? 'ابحث في كل المدارس…' : (scopeKind === 'self' ? 'ابحث في فصولك…' : 'ابحث في مدرستك…'),
          onClick: function () { App.openSearch(this.value); } })
      ]));
      topbar.appendChild(h('div', { class: 'topbar-actions' }, [
        searchButton(false),
        h('button', { class: 'icon-btn', type: 'button', title: 'الإشعارات', onClick: function () { App.openInbox(); } },
          [h('span', { html: '&#128276;' }), unread ? h('span', { class: 'count', style: { position: 'absolute', transform: 'translate(10px,-10px)', background: 'var(--amber-500)', color: 'var(--on-gold)', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', fontWeight: '700' }, text: String(unread) }) : null]),
        S.isPro() ? h('button', { class: 'icon-btn hide-sm', type: 'button', title: 'سجل رسائل تلقرام', onClick: function () { App.openTelegram(); } },
          [h('span', { html: '&#9992;&#65039;' })]) : null,
        h('button', { class: 'icon-btn hide-sm', type: 'button', title: 'تغيير كلمة المرور', onClick: App.openChangePassword },
          [h('span', { html: '&#128273;' })]),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'خروج', onClick: App.logout })
      ]));

      /* زر الدعم الفني العائم (كل الأدوار): بوت بلهجة سعودية + فتح تذكرة */
      App._removeSupportFab();
      if (S.ackLock && S.ackLock()) { App.rebuildNav && App.rebuildNav(); }
      var agentNow = S.agentNow();
      document.body.appendChild(h('button', {
        class: 'support-fab', type: 'button', id: 'support-fab',
        title: 'الدعم الفني — ' + agentNow.name + ' (' + agentNow.shift + ')',
        onClick: function () { if (S.ackLock && S.ackLock()) { UI.toast('أكمل إقرارك أولًا ليعمل حسابك', 'warn'); return; } App.openSupport({ greet: true }); }
      }, [
        h('img', { src: agentNow.img, alt: '', width: '40', height: '40' }),
        h('span', {}, [
          h('span', { style: { display: 'block', fontWeight: '800' }, text: 'الدعم الفني' }),
          h('span', { style: { display: 'block', fontSize: '10.5px', color: 'var(--text-muted)' }, text: agentNow.name + ' · متصل' })
        ])
      ]));

      /* لافتة المناوبة: تظهر فور دخول صاحب المناوبة في يومه */
      var duty = S.todayDutyFor(S.session.userId);
      if (duty) main.insertBefore(App.dutyBanner(duty), content);

      /* لافتة تحديثات المنصة (لكل دور ما يخصه) */
      try {
        var reg = App.modules || {};
        var canSee = function (role, modIds) { return (modIds || []).some(function (id) {
          return !!reg[id] && (reg[id].roles || []).indexOf(role) > -1;
        }); };
        var unseen = S.unseenUpdates(S.session.userId, function (role, ids) { return canSee(role, ids); });
        if (unseen.length) main.insertBefore(App.updatesBanner(unseen, function () { App.route(); }), content);
      } catch (e) {}

      /* محاولة رفع أي نسخة معلّقة (انقطاع سابق) */
      if (S.session && S.session.role === 'super') window.App.cloud.retryPending();

      /* تذكير النسخة الاحتياطية: للمشرف العام وقائد المدرسة */
      var due = S.backupDue();
      if (due.due && (S.session.role === 'super' || S.session.role === 'principal')) {
        main.insertBefore(App.backupBanner(due), content);
        try {
          if (S.canNotify && S.canNotify() && Notification.permission === 'granted') {
            new Notification('تابعني — نسخة احتياطية', { body: 'حان موعد النسخة (' + S.scheduleLabel() + ') — افتح تابعني ونزّلها بضغطة.' });
          }
        } catch (e) {}
      }

      App.route();
      App.checkStale && App.checkStale();
      global.addEventListener('hashchange', App.route);
    },

    /** لافتة اليوم: المناوبة ومكانها */
    dutyBanner: function (duty) {
      var done = !!duty.ackAt;
      var bar = h('div', { class: 'duty-banner' + (done ? ' is-done' : '') }, [
        h('span', { class: 'db-icon', html: done ? '&#9989;' : '&#128204;' }),
        h('div', { class: 'db-body' }, [
          h('strong', { text: done ? 'استلمت مناوبتك اليوم' : 'لديك مناوبة اليوم' }),
          h('span', {}, [
            h('span', { text: 'المكان: ' }),
            h('span', { class: 'db-loc', text: S.locationName(duty.locationId) }),
            h('span', { text: duty.shift ? ' · التوقيت: ' + duty.shift : '' }),
            h('span', { text: ' · التاريخ: ' + UI.dateLabel(duty.date) })
          ])
        ]),
        done ? h('span', { class: 'duty-chip', text: 'تم الاستلام · جزاك الله خيرًا' })
             : h('button', { class: 'btn btn-sm btn-white', type: 'button', text: 'تم استلام المناوبة', onClick: function (e) {
                 S.ackDuty(duty.id);
                 UI.toast('تم تسجيل استلام المناوبة', 'ok');
                 e.currentTarget.closest('.duty-banner').replaceWith(App.dutyBanner(S.find('duties', duty.id)));
               } })
      ]);
      return bar;
    },

    /** تنبيه الجوال (Notification API) — يُطلب من لوحة البداية مرة واحدة */
    enableMobileNotify: function () {
      S.requestNotifyPermission().then(function (p) {
        if (p === 'granted') { UI.toast('تم تفعيل تنبيهات الجوال على هذا الجهاز', 'ok'); S.pushMobile('تابعني', 'التنبيهات مفعّلة على هذا الجهاز.'); }
        else UI.toast('لم يُمنح إذن التنبيهات — يمكن تفعيلها من إعدادات المتصفح', 'warn');
        App.route();
      });
    },

    /* ------------------------------------------------------------- التوجيه */
    route: function () {
      try { S.ackMigrate && S.ackMigrate(); } catch (e) {}
      /* بوابة الإقرار: لا تعمل أي شاشة أو زر قبل اعتماد الإقرار */
      var view0 = document.getElementById('view');
      if (S.ackLock && S.ackLock() && view0 && App.ackGate) {
        clear(view0);
        App._removeSupportFab && App._removeSupportFab();
        document.body.classList.add('ack-locked');
        var sb0 = document.getElementById('sidebar');
        if (sb0) sb0.classList.add('is-locked');
        App.current = 'ack';
        App.setTitle('إقرار الاستخدام');
        view0.appendChild(App.ackGate());
        S.genderizeDom(view0);
        return;
      }
      document.body.classList.remove('ack-locked');
      var sb1 = document.getElementById('sidebar');
      if (sb1) sb1.classList.remove('is-locked');
      var id = (location.hash || '#/dashboard').replace('#/', '') || 'dashboard';
      var mod = App.modules[id];
      if (!mod || !App.can(mod)) { id = 'dashboard'; mod = App.modules.dashboard; if (location.hash !== '#/dashboard') { location.replace('#/dashboard'); return; } }
      App.current = id;
      Array.prototype.forEach.call(document.querySelectorAll('.side-nav a'), function (a) {
        a.classList.toggle('is-active', a.getAttribute('data-mod') === id);
      });
      var title = document.getElementById('view-title');
      if (title) title.textContent = S.gtext(mod.label);
      App.setTitle(S.gtext(mod.label));                 /* عنوان التبويب = اسم الشاشة */
      var view = document.getElementById('view');
      if (!view) return;
      clear(view);
      try { mod.render(view); S.genderizeDom(view); } catch (e) {
        view.appendChild(h('div', { class: 'muted-block', text: 'خطأ في تحميل الوحدة: ' + e.message }));
        console.error(e);
      }
      if (global.innerWidth <= 1024) {
        var sb = document.getElementById('sidebar');
        if (sb) { sb.classList.remove('is-open'); if (sb._backdrop) sb._backdrop.classList.remove('is-open'); }
      }
      window.scrollTo(0, 0);
      App.refreshBadges();
    },

    /* --------------------------------------------------------- الإشعارات */
    openInbox: function () {
      var rows = S.inbox();
      S.markRead();
      UI.modal({
        title: 'الإشعارات', wide: true,
        body: [rows.length ? UI.table({
          cols: [
            { label: 'النوع', render: function (r) { return UI.badge(r.kind, 'plain'); } },
            { label: 'العنوان', render: function (r) { return h('strong', { text: r.title }); } },
            { label: 'التفصيل', key: 'body' },
            { label: 'التاريخ', render: function (r) { return UI.fmtDateTime(r.at); } }
          ], rows: rows, empty: 'لا إشعارات.'
        }) : UI.empty('لا توجد إشعارات جديدة.')]
      });
      App.refreshBadges();
    },
    openTelegram: function () {
      var slot = h('div');
      UI.renderTelegram(slot);
      UI.modal({ title: 'سجل رسائل تلقرام (محاكاة)', wide: true, body: [
        h('p', { class: 'muted', text: 'الرسائل تُسجَّل هنا بدل الإرسال الفعلي. في الإنتاج تُرسَل عبر بوت تلقرام (Bot API) إلى محادثة كل مستخدم.' }),
        slot
      ] });
    },

    logout: function () {
      App._removeSupportFab();
      S.logout();
      location.hash = '';
      location.reload();
    },

    /* ------------------------------------------------------------ الدخول */
    /* =============================== شاشات الدخول =============================== */

    /** هيكل موحّد لشاشات الدخول/التسجيل/الاستعادة */
    authShell: function (title, sub, content, backLink) {
      var root = document.getElementById('app');
      clear(root);
      var panel = h('div', { class: 'login-panel' });
      if (backLink) panel.appendChild(backLink);
      panel.appendChild(h('div', { class: 'stack-sm' }, [
        h('h1', { style: { fontSize: '1.85rem' }, text: title }),
        sub ? h('p', { class: 'muted', text: sub }) : null
      ]));
      panel.appendChild(content);
      var usersN = 0; try { usersN = S.list('users').length; } catch (e) {}
      panel.appendChild(h('p', { class: 'app-ver', text: 'تابعني · الإصدار ' + App.version() }));

      /* 🆘 لو ما دخلت: تشخيص سريع + تحديث قسري (يحل مشكلة النسخة القديمة/التصميم الأول) */
      var safe = h('div', { class: 'cluster', style: { flexWrap: 'wrap', gap: '8px', marginTop: '10px' } }, [
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🔄 تحديث قسري (مسح الكاش)', onClick: function () { App.hardUpdate(); } }),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🆘 لماذا لا يعمل الدخول؟', onClick: function () {
          UI.modal({ title: 'لماذا لا يعمل الدخول؟', wide: true, body: [
            h('div', { class: 'callout info' }, [
              h('div', { html: '<b>حسابات هذا الجهاز:</b> ' + usersN + (usersN ? '' : ' — لا يوجد أي حساب هنا!') }),
              h('div', { html: '<b>نسخة التطبيق:</b> v' + App.version() }),
              h('div', { html: '<b>الرابط:</b> <span dir="ltr">' + location.origin + location.pathname + '</span>' })
            ]),
            usersN ? null : h('div', { class: 'callout warn', text: 'لا توجد حسابات في هذا المكان ⇒ أنت تفتح المنصة في تخزين مختلف عن الذي أنشأت فيه الحسابات ' +
              '(مثال: تطبيق الشاشة الرئيسية على الآيباد تخزينه منفصل تمامًا عن سفاري، وكذلك النافذة الخاصة). افتحها من نفس المكان دائمًا.' }),
            h('ol', { class: 'promo-steps' }, [
              h('li', { text: 'على الآيباد/الآيفون: افتح المنصة من **سفاري** (وليس من أيقونة الشاشة الرئيسية) — أو العكس، لكن لا تخلط بينهما.' }),
              h('li', { text: 'لا تستخدم «التصفح الخاص/الخفي» إطلاقًا — تخزينه يُمسح.' }),
              h('li', { text: 'لو ظهرت لك نسخة/تصميم قديم: اضغط «🔄 تحديث قسري» أعلاه.' }),
              h('li', { text: 'لو الرسالة «اسم المستخدم غير موجود»: أنت في التخزين الصحيح لكن الحساب في مكان آخر — استرجع نسخة احتياطية من شاشة الإعداد.' }),
              h('li', { text: 'لو الرسالة «دخول المدرسة موقوف»: هذا قرار من إدارة تابعني (اشتراك/إيقاف) — تواصل مع المشرف العام.' })
            ])
          ], actions: [
            { label: '🔄 تحديث قسري', class: 'btn-primary', onClick: function (c) { c(); App.hardUpdate(); } },
            { label: 'إغلاق', class: 'btn-outline', onClick: function (c) { c(); } }
          ] });
        } })
      ]);
      void safe;
      panel.appendChild(h('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--line)' } }, [
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginBottom: '6px' },
          text: 'الحسابات في هذا التطبيق: ' + usersN + ' · الإصدار v' + App.version() }),
        h('div', { class: 'cluster', style: { flexWrap: 'wrap', gap: '8px' } }, [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🔄 تحديث قسري (مسح الكاش)', onClick: function () { App.hardUpdate(); } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🆘 لماذا لا يعمل الدخول؟', onClick: function () { safe.querySelector('.btn-outline:last-child').click(); } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🧾 تقرير تشخيص (انسخه وأرسله)', onClick: function () { App.diagReport(); } })
        ])
      ]));

      var aside = h('aside', { class: 'login-aside' }, [
        h('span', { class: 'eyebrow eyebrow-ghost', text: 'تابعني للخدمات الذكية' }),
        h('h2', { style: { fontSize: '1.9rem' }, text: 'إدارة مدرسية متكاملة… من التحضير إلى التقرير المطبوع' }),
        h('ul', {}, [
          'المدرسة والمناطق والمدن والحسابات والصلاحيات',
          'استيراد المعلمين من نور، وإسناد الفصول والمواد وتثبيت الوكيل',
          'التحضير لكل حصة، والمخالفات السلوكية بدورة كاملة',
          'المناوبة وتوزيعها وتذكيرها الآلي، وبصمة الوجه للحضور والدخول',
          'تقارير يومية وأسبوعية وشهرية وفصلية ورسوم بيانية وطباعة PDF'
        ].map(function (t) { return h('li', {}, [h('span', { html: '&#10003;', style: { color: 'var(--brand-400)' } }), h('span', { text: t })]); })),
        h('p', { class: 'muted', style: { color: 'var(--ink-300)', fontSize: 'var(--fs-xs)' }, text: 'نموذج أولي: البيانات محلية في متصفحك، ورسائل تلقرام محاكاة، والتعرّف على الوجه تجريبي.' })
      ]);
      root.appendChild(h('div', { class: 'login-wrap' }, [aside, panel]));
      return panel;
    },

    backLink: function (label, fn) {
      return h('button', { class: 'btn-link', type: 'button', text: label, style: { alignSelf: 'flex-start' }, onClick: fn });
    },

    /** الدخول: يفتح الصفحة الرئيسية مع نافذة بيانات الدخول */
    login: function () {
      return App.landing({ login: true });
    },

    /** شاشة الدخول المفردة (احتياط — تُستخدم عند الحاجة لإظهار النموذج وحده) */
    loginScreen: function () {
      App._removeSupportFab();
      var user = UI.field({ name: 'username', label: 'اسم المستخدم أو البريد', required: true, placeholder: 'principal', autocomplete: 'username' });
      var pass = UI.field({ name: 'password', label: 'كلمة المرور', type: 'password', required: true, placeholder: '••••••••', autocomplete: 'current-password' });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      var form = h('form', { class: 'stack', onsubmit: function (e) {
        e.preventDefault();
        var res = S.authenticate(user.input.value, pass.input.value);
        if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
        /* المرحلة الأولى نجحت ← قد يُطلب رمز التحقق بمرحلتين */
        var tf = S.twoFactorFor(res.user);
        if (tf.blocked) { err.hidden = false; err.textContent = tf.reason; return; }
        err.hidden = true;
        function afterAuth() {
          App.enter(res.user.id);
          if (res.user.mustChange) App.firstLoginPassword(res.user);
        }
        if (tf.applies) { App.twoFactorScreen(res.user, afterAuth); return; }
        afterAuth();
      } }, [
        user.wrap, pass.wrap, err,
        h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'تسجيل الدخول' }),
        h('div', { class: 'between' }, [
          h('button', { class: 'btn-link', type: 'button', text: 'نسيت كلمة المرور؟', onClick: function () { App.forgot(); } }),
          h('button', { class: 'btn-link', type: 'button', text: 'إنشاء حساب جديد', onClick: function () { App.openRegister(); } })
        ])
      ]);
      var box = h('div', { class: 'stack' }, [
        form,
        h('div', { class: 'muted-block' }, [
          h('strong', { text: 'للتهيئة الأولى: ' }),
          h('span', { text: 'حساب مدير المدرسة ' }),
          h('code', { text: 'principal' }),
          h('span', { text: ' وكلمة المرور ' }),
          h('code', { text: 'Tabaani@2026' }),
          h('span', { text: ' — ثم أنشئ بقية الحسابات أو دع الموظفين يسجّلون من «إنشاء حساب جديد».' })
        ]),
        h('div', { class: 'muted-block' }, [
          h('strong', { text: 'التحقق بمرحلتين: ' }),
          h('span', { text: 'حسابات الموظفين تطلب رمزًا بعد كلمة المرور يُرسل إلى محادثة تلقرام الخاصة. وفي بيانات العرض يظهر الرمز على الشاشة كـ«رمز معاينة» لأن الإرسال الفعلي غير مُفعّل.' })
        ]),
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'أدوات البيانات (إعادة بيانات العرض · البدء من الصفر · النسخة الاحتياطية) صارت داخل تابعني: حساب المشرف العام ← «بيانات تابعني».' })
      ]);
      App.authShell('الدخول إلى تابعني', 'سجّل دخولك لمتابعة خدماتك بحسب دورك.', box);
    },

    /** المرحلة الثانية: التحقق برمز يُرسل إلى تلقرام المستخدم الخاص */
    twoFactorScreen: function (user, onDone) {
      var ttl = S.twoFactorConfig().ttl;
      var status = h('div', { class: 'muted-block', text: 'يُرسل رمز التحقق إلى محادثتك الخاصة على تلقرام…' });
      var codeF = UI.field({
        name: 'otpCode', label: 'رمز التحقق (٦ أرقام)', required: true, dir: 'ltr',
        placeholder: '______', autocomplete: 'one-time-code'
      });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      var resend = h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إعادة إرسال الرمز',
        onClick: function () { send(true); } });

      function mask(v) { return String(v || '').replace(/.(?=.{4})/g, '•'); }

      function send(isResend) {
        resend.disabled = true;
        setTimeout(function () { resend.disabled = false; }, 30000);
        status.textContent = 'يُرسل…';
        S.loginOtpSend(user.id).then(function (r) {
          clear(status);
          var to = r.sentTo ? ' (' + mask(r.sentTo) + ')' : '';
          if (r.ok) {
            status.appendChild(h('div', { class: 'callout tip', style: { marginTop: '0' } }, [
              h('strong', { text: (isResend ? 'أُعيد إرسال الرمز ' : 'أُرسل الرمز ') + '✓ ' }),
              h('span', { text: 'إلى محادثتك الخاصة على تلقرام' + to + ' — صالح ' + ttl + ' دقائق.' })
            ]));
          } else {
            status.appendChild(h('div', { class: 'callout', style: { marginTop: '0', borderInlineStartColor: 'var(--amber-500)' } }, [
              h('strong', { text: 'تعذّر الإرسال فعليًا: ' }),
              h('span', { text: r.error || 'خطأ غير معروف' }),
              r.simCode ? h('div', { style: { marginTop: '6px' } }, [
                h('span', { text: 'رمز المعاينة (يظهر لأن الإرسال غير مُفعّل — في الإنتاج يُرسل لتلقرام فقط): ' }),
                h('code', { text: r.simCode })
              ]) : null
            ]));
          }
        });
      }

      var form = h('form', { class: 'stack', onsubmit: function (e) {
        e.preventDefault();
        var v = S.loginOtpVerify(user.id, codeF.input.value);
        if (!v.ok) { err.hidden = false; err.textContent = v.error; return; }
        err.hidden = true;
        UI.toast('تم التحقق ✓', 'ok');
        onDone();
      } }, [
        h('div', { class: 'muted-block', style: { marginBottom: '12px' } }, [
          h('strong', { text: 'مرحلة ثانية مطلوبة ' }),
          h('span', { text: '— أدخل الرمز المُرسل إلى حساب ' + (user.name || '') + ' على تلقرام.' })
        ]),
        status, codeF.wrap, err,
        h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'تحقق ودخول' }),
        h('div', { class: 'between' }, [
          resend,
          h('button', { class: 'btn-link', type: 'button', text: 'رجوع لتسجيل الدخول',
            onClick: function () { S.loginOtpClear(); App.login(); } })
        ])
      ]);

      App.authShell('التحقق بمرحلتين', 'خطوة أمان إضافية لحماية حسابك.', h('div', { class: 'stack' }, [form]));
      send(false);
    },

    /** شاشة تسجيل حساب جديد */
    openRegister: function () {
      var schools = S.list('schools').map(function (s) { return { value: s.id, label: s.name + ' — ' + (s.city || '') }; });
      var roles = S.selfRegisterRoles().map(function (r) { return { value: r.id, label: r.name + (r.needsApproval ? ' (يحتاج اعتماد المدير)' : '') }; });
      var f = {
        name: UI.field({ name: 'name', label: 'الاسم الكامل', required: true }),
        username: UI.field({ name: 'username', label: 'اسم المستخدم', required: true, placeholder: 'أحرف إنجليزية وأرقام', help: '٤ أحرف على الأقل' }),
        email: UI.field({ name: 'email', label: 'البريد الإلكتروني', type: 'email', required: true }),
        phone: UI.field({ name: 'phone', label: 'رقم الجوال', type: 'tel', placeholder: '+966 5X XXX XXXX' }),
        school: UI.field({ name: 'school', label: 'المدرسة', type: 'select', required: true, options: schools, placeholder: 'اختر المدرسة' }),
        role: UI.field({ name: 'role', label: 'الدور', type: 'select', required: true, options: roles, placeholder: 'اختر الدور' }),
        pass: UI.field({ name: 'password', label: 'كلمة المرور', type: 'password', required: true, help: '٨ أحرف على الأقل وتتضمّن رقمًا وحرفًا' }),
        pass2: UI.field({ name: 'password2', label: 'تأكيد كلمة المرور', type: 'password', required: true }),
        agree: h('label', { class: 'checkbox full' }, [
          h('input', { type: 'checkbox', id: 'reg-agree' }),
          h('span', { html: 'أوافق على <a href="../docs/terms.html">الشروط والأحكام</a> وسياسة الخصوصية.' })
        ])
      };
      var err = h('p', { class: 'hint hint-error', hidden: true });
      var done = h('div');
      var form = h('form', { class: 'stack', onsubmit: function (e) {
        e.preventDefault();
        err.hidden = true;
        if (!f.agree.querySelector('input').checked) { err.hidden = false; err.textContent = 'يجب الموافقة على الشروط والأحكام.'; return; }
        var res = S.registerAccount({
          name: f.name.input.value, username: f.username.input.value, email: f.email.input.value,
          phone: f.phone.input.value, role: f.role.input.value, schoolId: f.school.input.value,
          password: f.pass.input.value, password2: f.pass2.input.value
        });
        if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
        if (res.needsApproval) {
          clear(done);
          done.appendChild(h('div', { class: 'muted-block' }, [
            h('strong', { text: 'تم إرسال طلبك ✓ ' }),
            h('span', { text: 'حسابك بانتظار اعتماد مدير المدرسة؛ سيصلك إشعار عند التفعيل. اسم المستخدم: ' }),
            h('code', { text: res.user.username })
          ]));
          form.hidden = true;
          return;
        }
        UI.toast('تم إنشاء حسابك — مرحبًا ' + res.user.name, 'ok');
        App.enter(res.user.id);
      } }, [
        h('div', { class: 'form-grid' }, [f.name.wrap, f.username.wrap, f.email.wrap, f.phone.wrap, f.school.wrap, f.role.wrap, f.pass.wrap, f.pass2.wrap, f.agree]),
        err,
        h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'إنشاء الحساب' })
      ]);
      var content = h('div', { class: 'stack' }, [
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' }, text: 'الطالب يُفعَّل فورًا، والأدوار الإدارية تُرسل طلبًا لمدير المدرسة للاعتماد.' }),
        form, done,
        h('button', { class: 'btn-link', type: 'button', text: 'لديك حساب؟ تسجيل الدخول', onClick: function () { App.login(); } })
      ]);
      App.authShell('إنشاء حساب جديد', 'سجّل بياناتك للانضمام إلى مدرستك على تابعني.', content);
    },

    /** استعادة كلمة المرور (خطوتان) */
    forgot: function () {
      var step = 1, ident = '';
      var body = h('div', { class: 'stack' });

      function stepOne() {
        var id = UI.field({ name: 'ident', label: 'اسم المستخدم أو البريد الإلكتروني', required: true, value: ident });
        var ch = UI.field({ name: 'channel', label: 'قناة الإرسال', type: 'select', options: [
          { value: 'telegram', label: 'تلقرام (المسجّل في حسابك)' }, { value: 'sms', label: 'رسالة نصية على الجوال' }, { value: 'email', label: 'البريد الإلكتروني' }
        ], value: 'telegram' });
        var err = h('p', { class: 'hint hint-error', hidden: true });
        var info = h('div');
        var form = h('form', { class: 'stack', onsubmit: function (e) {
          e.preventDefault();
          var res = S.requestPasswordReset(id.input.value, ch.input.value);
          if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
          err.hidden = true; ident = id.input.value;
          clear(info);
          info.appendChild(h('div', { class: 'muted-block' }, [
            h('strong', { text: 'أُرسل رمز التحقق ✓ ' }),
            h('span', { text: 'صالح ١٥ دقيقة عبر ' + (ch.input.options[ch.input.selectedIndex].text) + '.' }),
            h('div', { style: { marginTop: '6px' } }, [h('span', { text: 'رمز المعاينة (في الإنتاج يُرسل للجوال): ' }), h('code', { text: res.code })])
          ]));
          stepTwo(res.code);
        } }, [id.wrap, ch.wrap, err, h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'إرسال رمز التحقق' }), info]);
        clear(body);
        body.appendChild(form);
      }

      function stepTwo(hintCode) {
        var code = UI.field({ name: 'code', label: 'رمز التحقق (٦ أرقام)', required: true, value: hintCode || '' });
        var p1 = UI.field({ name: 'password', label: 'كلمة المرور الجديدة', type: 'password', required: true, help: '٨ أحرف على الأقل وتتضمّن رقمًا وحرفًا' });
        var p2 = UI.field({ name: 'password2', label: 'تأكيد كلمة المرور', type: 'password', required: true });
        var err = h('p', { class: 'hint hint-error', hidden: true });
        var form = h('form', { class: 'stack', onsubmit: function (e) {
          e.preventDefault();
          var res = S.resetPassword(ident, code.input.value, p1.input.value, p2.input.value);
          if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
          UI.toast('تم تغيير كلمة المرور — سجّل دخولك الآن', 'ok');
          App.login();
        } }, [
          code.wrap, p1.wrap, p2.wrap, err,
          h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'تعيين كلمة المرور الجديدة' }),
          h('button', { class: 'btn-link', type: 'button', text: 'لم يصلك الرمز؟ إعادة الإرسال', onClick: stepOne })
        ]);
        var wrap = h('div', { class: 'stack' }, [
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' }, text: 'أدخل الرمز المُرسل إلى حسابك ثم اختر كلمة مرور جديدة.' }),
          hintCode ? h('div', { class: 'muted-block' }, [h('span', { text: 'رمز المعاينة (في الإنتاج يُرسل للجوال/تلقرام): ' }), h('code', { text: hintCode })]) : null,
          form
        ]);
        clear(body); body.appendChild(wrap);
        void step;
      }

      stepOne();
      var content = h('div', { class: 'stack' }, [body, h('button', { class: 'btn-link', type: 'button', text: 'رجوع لتسجيل الدخول', onClick: function () { App.login(); } })]);
      App.authShell('استعادة كلمة المرور', 'سنرسل لك رمز تحقق لإعادة تعيين كلمة المرور.', content);
    },

    /** تغيير كلمة المرور من داخل الحساب */
    openChangePassword: function () {
      var cur = UI.field({ name: 'cur', label: 'كلمة المرور الحالية', type: 'password', required: true });
      var p1 = UI.field({ name: 'next', label: 'كلمة المرور الجديدة', type: 'password', required: true });
      var p2 = UI.field({ name: 'confirm', label: 'تأكيد الجديدة', type: 'password', required: true });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      UI.modal({
        title: 'تغيير كلمة المرور',
        body: [h('div', { class: 'stack' }, [cur.wrap, p1.wrap, p2.wrap, err])],
        actions: [
          { label: 'إلغاء', class: 'btn-outline', onClick: function (c) { c(); } },
          { label: 'حفظ', class: 'btn-primary', onClick: function (close) {
            var res = S.changePassword(S.session.userId, cur.input.value, p1.input.value, p2.input.value);
            if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
            UI.toast('تم تغيير كلمة المرور', 'ok'); close();
          } }
        ]
      });
    },

    /** تنبيه أول دخول: إلزام تغيير كلمة المرور المولَّدة عند التسليم */
    firstLoginPassword: function (user) {
      var p1 = UI.field({ name: 'next', label: 'كلمة المرور الجديدة', type: 'password', required: true, help: '٨ أحرف على الأقل، مع رقم وحرف.' });
      var p2 = UI.field({ name: 'confirm', label: 'تأكيد كلمة المرور', type: 'password', required: true });
      var err = h('p', { class: 'hint hint-error', hidden: true });
      UI.modal({
        title: 'مرحبًا ' + (user.name || '') + ' — عيّن كلمة مرور جديدة',
        body: [h('div', { class: 'stack' }, [
          h('p', { class: 'muted', text: 'كلمة المرور الحالية مولَّدة من إدارة تابعني عند التسليم، ولأمان حسابك اختر كلمة مرور خاصة بك.' }),
          p1.wrap, p2.wrap, err
        ])],
        actions: [
          { label: 'لاحقًا', class: 'btn-outline', onClick: function (c) { c(); UI.toast('يمكنك تغييرها من أيقونة المفتاح', 'warn'); } },
          { label: 'حفظ كلمة المرور', class: 'btn-primary', onClick: function (close) {
            var res = S.changePassword(S.session.userId, user.password, p1.input.value, p2.input.value);
            if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
            var u = S.userById(S.session.userId); if (u) { u.mustChange = false; }
            UI.toast('حُفظت كلمة مرورك الجديدة', 'ok'); close();
          } }
        ]
      });
    },

    /** بوابة التحقق بالوجه عند الدخول (للمعلم المسجَّل وجهه) */
    faceGate: function (user, proceed, cancel) {
      var root = document.getElementById('app');
      UI.clear(root);
      var panel = h('div', { class: 'login-panel' });
      var note = h('p', { class: 'muted', text: 'وجّه وجهك نحو الكاميرا للمتابعة إلى تابعني.' });
      var holder = h('div');
      panel.appendChild(h('div', {}, [
        h('span', { class: 'eyebrow', text: 'تحقّق الهوية' }),
        h('h1', { style: { fontSize: '1.9rem', marginTop: '10px' }, text: 'تمرير الوجه' }),
        h('p', { class: 'muted', text: 'التسجيل في تابعني يتطلّب مطابقة بصمة الوجه — كما في تسجيل حضورك للفصل.' })
      ]));
      panel.appendChild(note);
      panel.appendChild(holder);
      panel.appendChild(h('div', { class: 'cluster' }, [
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '‹ رجوع لاختيار الحساب', onClick: function () { cancel(); } }),
        h('button', { class: 'mini-btn', type: 'button', text: 'تخطّي (نموذج تجريبي)', onClick: function () { UI.toast('تم تخطّي التحقق — وضع تجريبي', 'warn'); proceed(); } })
      ]));
      root.appendChild(panel);

      var ctrl = Face.capturePanel({
        buttonText: 'التحقق والدخول',
        onDescriptor: function (res) {
          var match = S.faceMatch(res.descriptor, [user], 0.5);
          S.recordFaceScan({ userId: user.id, type: 'login', ok: !!match.ok, score: match.score, distance: match.distance });
          if (match.ok) {
            UI.toast('تم التعرّف عليك ✓ (' + match.score + '%)', 'ok');
            ctrl.stop(); proceed();
          } else {
            ctrl.setStatus('لم تتطابق البصمة (' + (match.score || 0) + '%) — أعد المحاولة أو استخدم زر التخطّي في النموذج.', 'err');
          }
        }
      });
      holder.appendChild(ctrl.el);
    },

    enter: function (userId) {
      var u = S.user(userId);
      if (!u) { UI.toast('تعذّر الدخول', 'err'); return; }
      /* المعلم الذي سجّل وجهه: يُطلب تمرير الوجه قبل الدخول */
      if (u.role === 'teacher' && S.hasFace(u.id) && typeof Face !== 'undefined') {
        App.faceGate(u, function () { App._doEnter(u.id); }, App.login);
        return;
      }
      App._doEnter(userId);
    },

    _doEnter: function (userId) {
      var u = S.login(userId);
      if (!u) { UI.toast('تعذّر الدخول', 'err'); return; }
      S.notify({ kind: 'system', title: 'تسجيل دخول: ' + u.name, body: S.roleLabel(u.role) });
      App.shell();
      var todayDuty = S.todayDutyFor(u.id);
      if (todayDuty) {
        S.pushMobile('تذكير: مناوبتك اليوم', 'المكان: ' + S.locationName(todayDuty.locationId) + (todayDuty.shift ? ' — ' + todayDuty.shift : ''));
        S.notify({ kind: 'duty', ref: todayDuty.id, title: 'مناوبتك اليوم', body: S.locationName(todayDuty.locationId) + (todayDuty.shift ? ' · ' + todayDuty.shift : ''), to: [u.role] });
      }
      UI.toast('مرحباً ' + u.name, 'ok');
    },

    /** تدفّق إعادة تابعني: يطلب رمز OTP على تلقرام/البريد ثم يُنفّذ الإعادة */
    resetFlow: function (opts) {
      opts = opts || {};
      var kind = opts.kind || 'demo';           /* demo = بيانات العرض · empty = من الصفر */
      var title = kind === 'demo' ? 'إعادة بيانات العرض التجريبية' : 'البدء من الصفر (حذف كل البيانات)';
      var warn = kind === 'demo'
        ? 'سيُستبدل ما في تابعني ببيانات العرض التجريبية، ويبقى حساب المشرف العام كما هو.'
        : 'سيُحذف كل شيء: المدارس والفصول والطلاب والموظفون والتحاضير والمخالفات — ولا يبقى إلا حساب المشرف العام.';
      var otp = UI.field({ name: 'otpCode', label: 'رمز التحقق (٦ أرقام)', dir: 'ltr', placeholder: '______', half: true });
      var pass = UI.field({ name: 'otpWord', label: 'اكتب كلمة: إعادة', half: true, help: 'بديل الرمز عند تعذّر الإرسال.' });
      var status = h('p', { class: 'muted', text: 'اضغط «إرسال رمز التحقق» ليصلك الرمز على تلقرام (أو البريد إن كان الوسيط مُفعّلًا).' });
      var modal = UI.formModal({
        title: title,
        intro: warn,
        submitLabel: 'تنفيذ الإعادة',
        fields: [otp, pass],
        extra: h('div', {}, [
          status,
          h('div', { class: 'panel-actions' }, [
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إرسال رمز التحقق (تلقرام)', onClick: function () {
              status.textContent = 'يُرسل…';
              S.otpSend(kind, 'طلب: ' + title, 'telegram').then(function (r) {
                status.textContent = r.ok
                  ? '✅ أُرسل الرمز إلى تلقرام' + (S.telegramFor(S.session.schoolId).chatId ? ' (المحادثة ' + S.telegramFor(S.session.schoolId).chatId + ')' : '') + ' — صالح ١٠ دقائق.'
                  : '⚠️ لم يُرسل: ' + (r.error || '') + ' — يمكنك استخدام كلمة التأكيد «إعادة» بدلًا منه.';
              });
            } }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إرسال على البريد', onClick: function () {
              status.textContent = 'يُرسل…';
              S.otpSend(kind, 'طلب: ' + title, 'email').then(function (r) {
                status.textContent = r.ok ? ('✅ أُرسل الرمز إلى بريد المشرف العام') : ('⚠️ ' + (r.error || ''));
              });
            } })
          ])
        ]),
        onSubmit: function (d) {
          var code = String(d.otpCode || '').trim();
          if (code) {
            var v = S.otpVerify(code);
            if (!v.ok) { UI.toast(v.error, 'bad'); return; }        /* لا يُنفّذ الإعادة */
          } else if (String(d.otpWord || '').trim() === 'إعادة' && !S.otpCurrent()) {
            /* بديل عند تعذّر الإرسال: لا يوجد رمز مُرسل + كلمة التأكيد صحيحة */
          } else {
            UI.toast('أدخل رمز التحقق المُرسل إليك، أو اطلب رمزًا ثم أدخله', 'warn');
            return;
          }
          var r = kind === 'demo' ? S.reset() : S.resetEmptyAll();
          S.otpClear();
          UI.toast('تمت إعادة تابعني (' + (kind === 'demo' ? 'بيانات العرض' : 'من الصفر') + ') ✓', 'ok');
          S.logout();
        }
      });
      return modal;
    },

    boot: function () {
      UI.setupTelegram();
      App._stamp = App._stamp || function () {
        try {
          var sb = document.getElementById('sidebar') || document.querySelector('.side-nav');
          if (sb && !sb.querySelector('.app-ver-side')) {
            var el = h('div', { class: 'app-ver-side', text: 'الإصدار ' + App.version() });
            sb.appendChild(el);
          }
        } catch (e) {}
        setTimeout(function () {
          var sb = document.getElementById('sidebar') || document.querySelector('.side-nav');
          if (sb && !sb.querySelector('.app-ver-side')) {
            var el = document.createElement('div');
            el.className = 'app-ver-side'; el.textContent = 'الإصدار ' + App.version();
            sb.appendChild(el);
          }
        }, 900);
      };
      App._stamp();
      /* الصفحة الرئيسية العامة أولًا (شاشة التهيئة تُفتح من أيقونة الدخول) */
      var u = S.restore();
      if (u) { App.shell(); return; }
      /* لم يسجّل دخول: الصفحة الرئيسية العامة للموقع */
      if (App.landing) App.landing({ login: !!location.hash.match(/login/) });
      else App.login();
    },

    /* ============ التهيئة الأولى: إنشاء حساب المشرف العام بطريقة آمنة ============ */
    setupScreen: function () {
      App._removeSupportFab();
      var root = document.getElementById('app');
      clear(root);
      var panel = h('div', { class: 'login-panel' });
      var nameF = UI.field({ name: 'supName', label: 'اسم المشرف العام', placeholder: 'مثال: عبدالله العتيبي', half: true });
      var userF = UI.field({ name: 'supUser', label: 'اسم المستخدم', placeholder: 'a-otaibi', dir: 'ltr', half: true,
        help: 'به تدخل تابعني (يمكنك الدخول بالبريد أيضًا).' });
      var mailF = UI.field({ name: 'supMail', label: 'البريد الإلكتروني (اختياري)', dir: 'ltr', half: true });
      var p1 = UI.field({ name: 'supPass', label: 'كلمة المرور', type: 'password', half: true, help: '٨ أحرف على الأقل.' });
      var p2 = UI.field({ name: 'supPass2', label: 'تأكيد كلمة المرور', type: 'password', half: true });
      var mode = { demo: true };
      function modeCard(val, title, desc) {
        var box = h('label', { class: 'setup-card' + (mode.demo === val ? ' is-on' : '') }, [
          (function () { var i = h('input', { type: 'radio', name: 'setupMode' }); i.checked = mode.demo === val;
            i.addEventListener('change', function () { mode.demo = val; draw(); }); return i; })(),
          h('div', {}, [h('strong', { text: title }), h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: desc })])
        ]);
        return box;
      }
      var cards = h('div', { class: 'setup-modes' });
      /* خيار ظاهر (لا باب خلفي): إضافة حساب المشرف العام التجريبي في بيانات العرض */
      var demoAdminCb = h('input', { type: 'checkbox', checked: true });
      var adminRow = h('label', { class: 'checkline', style: { marginTop: '10px' } }, [
        demoAdminCb,
        h('span', { text: 'أضف حساب المشرف العام التجريبي ' }),
        h('code', { text: 'admin' }),
        h('span', { class: 'muted', text: ' — بكلمة المرور الموحّدة للعرض، ليسهل تجربة دور المشرف العام. أوقفه إن كنت ستشارك تابعني مع أحد.' })
      ]);
      function draw() {
        clear(cards);
        cards.appendChild(modeCard(true, 'بيانات عرض تجريبية', 'مدرسة كاملة وأدوار وطلاب جاهزون — للتجربة والعرض على العملاء.'));
        cards.appendChild(modeCard(false, 'مدرسة حقيقية — ابدأ من الصفر', 'بلا أي بيانات: تُنشئ مدرستك وحساباتك بنفسك.'));
        adminRow.hidden = !mode.demo;
      }
      draw();
      /* تنبيه آبل: التطبيق المُثبَّت له مخزن منفصل عن سفاري (بيانات مختلفة لنفس الموقع) */
      var envNow = (UI.env && UI.env()) || {};
      var iosNote = envNow.standalone ? h('div', { class: 'callout warn', style: { marginBottom: '14px' } }, [
        h('strong', { text: 'أنت داخل التطبيق المُثبَّت على الشاشة الرئيسية. ' }),
        h('span', { text: 'على آبل، للتطبيق المُثبَّت **مخزن بيانات منفصل** عن سفاري — حتى لنفس الموقع، وكأنهما جهازان مختلفان. فإمّا أن تعمل دائمًا من هذه الأيقونة، أو دائمًا من سفاري — ولا تنتقل بينهما. أكمل التهيئة هنا إن كانت هذه وجهتك.' }),
        h('button', { class: 'btn-link', type: 'button', style: { marginTop: '6px' },
          text: 'لماذا؟ اقرأ التوضيح', onClick: function () {
            UI.modal({ title: 'التطبيق المُثبَّت وسفاري — لماذا بياناتهما مختلفة؟', body: [
              h('p', { class: 'muted', text: 'هذا سلوك نظام آبل (iOS/iPadOS) لا خطأ في تابعني: التطبيق المُثبَّت على الشاشة الرئيسية يعمل في «مساحة تخزين» مستقلة عن سفاري، ولكل مساحة بياناتها وحساباتها.' }),
              h('ul', { class: 'promo-steps' }, [
                h('li', { text: 'هيّأت في سفاري؟ الأيقونة تطلب تهيئة مرة أخرى — والعكس صحيح.' }),
                h('li', { text: 'الحل: اختر مكانًا واحدًا للعمل والتزم به (أنصح بالأيقونة: ملء الشاشة وأثبت).' }),
                h('li', { text: 'ولو أدخلت بيانات في المكان الآخر: نزّل نسخة احتياطية منه، ثم استرجعها هنا من زر «استرجاع نسخة احتياطية».' }),
                h('li', { text: 'ولا تُعِد تثبيت الأيقونة أكثر من مرة — كل تثبيت = مساحة مستقلة جديدة.' }),
                h('li', { text: 'على أندرويد وويندوز لا توجد هذه المشكلة (المخزن مشترك).' })
              ])
            ] });
          } })
      ]) : null;

      var err = h('p', { class: 'form-error', hidden: true });
      if (iosNote) panel.appendChild(iosNote);
      panel.appendChild(h('div', {}, [
        h('span', { class: 'eyebrow', text: 'التهيئة الأولى' }),
        h('h1', { style: { fontSize: '1.9rem', marginTop: '10px' }, text: 'إنشاء حساب المشرف العام' }),
        h('p', { class: 'muted', text: 'هذه الشاشة تظهر مرة واحدة فقط عند أول تشغيل — لا توجد أي كلمة مرور مكتوبة داخل تابعني، وأنت من يُنشئ حسابك بنفسك.' })
      ]));
      panel.appendChild(cards);
      panel.appendChild(adminRow);

      /* الباقة والرسوم — افتراض للمدارس التي تُضاف لاحقًا */
      var plan = { id: 'classic' };
      var planBox = h('div', { class: 'plan-cards', style: { marginTop: '14px' } });
      var setupPaid = h('input', { type: 'checkbox', checked: true });
      function drawPlans() {
        clear(planBox);
        S.PLANS.forEach(function (pl) {
          var fee = pl.id === 'pro' ? S.planFees().pro : S.planFees().classic;
          planBox.appendChild(h('div', {
            class: 'plan-card' + (plan.id === pl.id ? ' is-on' : ''), style: { cursor: 'pointer' },
            onClick: function () { plan.id = pl.id; drawPlans(); }
          }, [
            h('h4', { text: pl.name }),
            h('div', { class: 'pc-price nums', text: fee + ' ر.س' }),
            h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'سنويًا · ' + pl.tagline }),
            h('ul', {}, pl.features.slice(0, 3).map(function (f) { return h('li', { text: f }); }))
          ]));
        });
      }
      drawPlans();
      panel.appendChild(h('div', { style: { marginTop: '16px' } }, [
        h('strong', { text: 'الباقة والرسوم' }),
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', margin: '4px 0 0' },
          text: 'الباقة الافتراضية للمدرسة — يمكن تغييرها لكل مدرسة لاحقًا من: المناطق والمدن والمدارس. ومدرسة العرض التجريبي تأتي على باقة «برو» لتجربة كل الخدمات.' })
      ]));
      panel.appendChild(planBox);
      panel.appendChild(h('label', { class: 'checkline', style: { marginTop: '10px' } }, [
        setupPaid,
        h('span', { text: 'تم سداد رسم التأسيس والتهيئة ' }),
        h('strong', { text: '1000 ر.س' }),
        h('span', { class: 'muted', text: ' — مرة واحدة عند تهيئة تابعني للمدرسة.' })
      ]));
      panel.appendChild(h('div', { class: 'form-grid' }, [nameF.wrap, userF.wrap, mailF.wrap, p1.wrap, p2.wrap]));
      panel.appendChild(err);
      panel.appendChild(h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'إنشاء الحساب والبدء', onClick: function () {
        err.hidden = true;
        if (!nameF.input.value.trim()) { err.hidden = false; err.textContent = 'اكتب اسم المشرف العام'; return; }
        if (!userF.input.value.trim()) { err.hidden = false; err.textContent = 'اكتب اسم المستخدم'; return; }
        if (p1.input.value.length < 8) { err.hidden = false; err.textContent = 'كلمة المرور ٨ أحرف على الأقل'; return; }
        if (p1.input.value !== p2.input.value) { err.hidden = false; err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
        var r = S.setupOwner({ name: nameF.input.value, username: userF.input.value, email: mailF.input.value,
          password: p1.input.value, demo: mode.demo, withDemoAdmin: mode.demo && demoAdminCb.checked,
          plan: plan.id, setupPaid: setupPaid.checked });
        if (!r.ok) { err.hidden = false; err.textContent = r.error; return; }
        UI.toast('أُنشئ حساب المشرف العام ✓', 'ok');
        App._doEnter(r.user.id);
      } }));
      panel.appendChild(h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' },
        text: 'يمكنك تغيير كلمة المرور لاحقًا من: بياناتي ← تغيير كلمة المرور.' }));

      /* نقل البيانات من جهاز آخر: استرجاع نسخة احتياطية بدل إنشاء حساب جديد */
      var bFile = h('input', { type: 'file', accept: '.json,application/json', class: 'input' });
      bFile.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        UI.confirm('سيُستبدل ما في هذا الجهاز ببيانات الملف «' + f.name + '». متابعة؟', { ok: 'استرجاع', danger: true }).then(function (yes) {
          if (!yes) { bFile.value = ''; return; }
          var rd = new FileReader();
          rd.onload = function (ev) {
            var r = S.restoreJson(ev.target.result);
            if (!r.ok) { err.hidden = false; err.textContent = r.error; return; }
            UI.toast('أُعيدت النسخة — ' + r.stats.schools + ' مدرسة · ' + r.stats.users + ' حسابًا', 'ok');
            setTimeout(function () { location.reload(); }, 900);
          };
          rd.readAsText(f, 'utf-8');
        });
      });
      panel.appendChild(h('div', { class: 'setup-restore' }, [
        h('strong', { text: 'هل عندك نسخة احتياطية من جهاز آخر؟' }),
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', lineHeight: '1.9' },
          text: 'بيانات تابعني محفوظة في المتصفح الذي هيّأتها عليه فقط. لنقل مدرستك إلى هذا الجهاز (مثلًا من كروم الجوال إلى سفاري الآيباد): نزّل النسخة من الجهاز الأول، ثم استرجعها هنا — وستُنقل المدارس والحسابات والبيانات كما هي بلا إعادة إدخال.' }),
        h('label', { class: 'btn btn-outline', style: { cursor: 'pointer' } }, [
          h('span', { text: 'استرجاع نسخة احتياطية' }), bFile
        ])
      ]));
      root.appendChild(panel);
    },
  };

  /* رقم الإصدار الظاهر (للتأكد من التحديث) */
  App.version = function () {
    var m = document.querySelector('meta[name=app-version]');
    return m ? m.getAttribute('content') : '';
  };

  /* =========================================================================
     الوحدة الأساسية: لوحة البداية (تُبنى تلقائيًا بحسب الدور)
     ========================================================================= */
  App.register({
    id: 'dashboard', label: 'لوحة البداية', icon: '&#9632;',
    render: function (view) {
      var role = S.session.role, schoolId = S.session.schoolId;
      var cards = [], actions = [];

      var stats = function (label, value, sub, tone) { cards.push(UI.statCard(label, value, sub, tone)); };
      var action = function (label, mod, cls) { actions.push(h('button', { class: 'btn ' + (cls || 'btn-outline'), type: 'button', text: label, onClick: function () { App.go(mod); } })); };

      function superDashLegacy(target) {
        /* المحتوى القديم للوحة المشرف (متاح من قسم «إدارة المنصة») */
        /* أسفل اللوحة — على اليمين: إعادة تابعني للوضع الافتراضي (برمز تحقق) */
        target.appendChild(h('div', { class: 'dash-corner' }, [
          h('div', { class: 'panel danger-panel' }, [
            h('h3', { class: 'panel-title', text: 'إعادة تابعني للوضع الافتراضي' }),
            h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '6px 0 12px' },
              text: 'يُطلب رمز تحقق (OTP) يُرسل إلى تلقرام أو البريد قبل التنفيذ — حماية من الإعادة بالخطأ.' }),
            h('div', { class: 'cluster' }, [
              h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إعادة بيانات العرض', onClick: function () { App.resetFlow({ kind: 'demo' }); } }),
              h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'حذف كل البيانات (من الصفر)', onClick: function () { App.resetFlow({ kind: 'empty' }); } })
            ])
          ])
        ]));
        stats('المدارس المسجّلة', S.list('schools').length);
        stats('المناطق التعليمية', S.regions.length);
        stats('المدن المتاحة', S.regions.reduce(function (a, r) { return a + r.cities.length; }, 0));
        stats('إجمالي المستخدمين', S.list('users').length, null, 'gold');
        var stAll = S.studentAccountStats();
        stats('حسابات الطلاب', String(stAll.total),
          stAll.total ? (stAll.suspended ? stAll.suspended + ' موقوفة من الدخول' : 'كلها نشطة') : 'لا حسابات',
          stAll.suspended ? 'gold' : null);
        var licAll = S.licenseStats();
        stats('اشتراكات موقوفة / متأخّرة', String(licAll.suspended + licAll.overdue),
          licAll.total ? (licAll.pro + ' برو · ' + licAll.classic + ' كلاسيك') : 'لا مدارس',
          (licAll.suspended || licAll.overdue) ? 'gold' : null);
        /* زر واحد مباشر: إيقاف/تفعيل كل طلاب المنصّة من اللوحة نفسها */
        var allOff = stAll.total > 0 && stAll.active === 0;
        /* اختيار مدرسة واحدة للتحكم المستقل من اللوحة */
        var schools = S.list('schools');
        if (!App._dashSchool || !schools.some(function (s) { return s.id === App._dashSchool; })) {
          App._dashSchool = schools.length ? schools[0].id : '';
        }
        var one = App._dashSchool ? S.studentAccountStats(App._dashSchool) : null;
        var oneOff = !!one && one.total > 0 && one.active === 0;
        target.appendChild(h('div', { class: 'panel' }, [
          h('h3', { class: 'panel-title', text: 'حسابات الطلاب — دخول تابعني' }),
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '6px 0 12px' },
            text: allOff
              ? 'كل حسابات الطلاب موقوفة حاليًا — لا يستطيع أي طالب الدخول.'
              : 'أوقف دخول كل الطلاب في كل المدارس بضغطة واحدة، ثم فعّلهم متى شئت.' }),
          h('div', { class: 'cluster' }, [
            h('button', {
              class: 'btn ' + (allOff ? 'btn-primary' : 'btn-danger') + ' btn-sm', type: 'button',
              text: allOff ? 'تفعيل كل الطلاب' : 'إيقاف كل الطلاب',
              onClick: function () {
                var act = allOff ? 'activate' : 'suspend';
                UI.confirm((allOff ? 'تفعيل' : 'إيقاف') + ' دخول كل الطلاب في كل المدارس؟',
                  { ok: allOff ? 'تفعيل الكل' : 'إيقاف الكل', danger: !allOff }).then(function (yes) {
                  if (!yes) return;
                  var r = S.setStudentAccounts(act, {});
                  UI.toast((allOff ? 'فُعّل ' : 'أُوقف ') + r.changed + ' من ' + r.total + ' حسابًا', r.changed ? 'ok' : 'warn');
                  App.route();
                });
              }
            }),
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحكم مفصّل بكل المدارس', onClick: function () { App.go('users'); } }),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '🤖 تسجيل مدرسة (موظف التسجيل)', onClick: function () { App.go('regagent'); } }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'التأسيس الآلي من ملفات', onClick: function () { App.go('onboard'); } })
          ]),
        ]));
        /* ── مدرسة واحدة: اختيار المدرسة + إيقاف/تفعيل طلابها وحدها ── */
        if (schools.length) {
          var stOne = S.studentAccountStats(App._dashSchool);
          var oneOff = stOne.total > 0 && stOne.active === 0;
          var selOptions = schools.map(function (sc) {
            var st = S.studentAccountStats(sc.id);
            var off = st.total > 0 && st.active === 0;
            var note = st.total ? (off ? ' (موقوفة)' : ' (' + st.active + ' نشطة)') : ' (بلا حسابات)';
            return h('option', { value: sc.id, selected: App._dashSchool === sc.id, text: sc.name + ' — ' + st.total + ' حساب' + note });
          });
          var schoolSel = h('select', { class: 'input', onchange: function (e) { App._dashSchool = e.target.value; App.route(); } }, selOptions);
          target.appendChild(h('div', { class: 'panel', style: { marginTop: '12px' } }, [
            h('h3', { class: 'panel-title', text: 'مدرسة واحدة' }),
            h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '6px 0 12px' },
              text: 'اختر مدرسة ثم أوقف أو فعّل دخول طلابها وحدها — بلا أثر على بقية المدارس.' }),
            h('div', { class: 'cluster', style: { alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' } }, [
              h('div', { class: 'field', style: { minWidth: '280px', margin: 0 } }, [h('label', { text: 'المدرسة' }), schoolSel]),
              h('button', {
                class: 'btn ' + (oneOff ? 'btn-primary' : 'btn-danger') + ' btn-sm', type: 'button',
                disabled: !stOne.total,
                text: oneOff ? 'تفعيل طلاب هذه المدرسة' : 'إيقاف طلاب هذه المدرسة',
                onClick: function () {
                  var target = App._dashSchool;
                  var st = S.studentAccountStats(target);
                  var off = st.total > 0 && st.active === 0;
                  var sc = S.school(target) || {};
                  UI.confirm((off ? 'تفعيل' : 'إيقاف') + ' دخول طلاب ' + (sc.name || '') + '؟',
                    { ok: off ? 'تفعيل المدرسة' : 'إيقاف المدرسة', danger: !off }).then(function (yes) {
                    if (!yes) return;
                    var r = S.setStudentAccounts(off ? 'activate' : 'suspend', { schoolId: target });
                    UI.toast((off ? 'فُعّل ' : 'أُوقف ') + r.changed + ' من ' + r.total + ' حسابًا', r.changed ? 'ok' : 'warn');
                    App.route();
                  });
                }
              })
            ]),
            h('div', { style: { height: '1px', background: 'var(--border)', margin: '14px 0' } }),
            h('h3', { class: 'panel-title', text: 'الباقة والاشتراك — هذه المدرسة' }),
            (function () {
              var st = S.licenseState(App._dashSchool);
              if (!st) return h('span');
              return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' } }, [
                h('div', { class: 'lic-banner is-' + App._licTone(st) }, [App.licenseBadge(App._dashSchool), App._licLine(st)]),
                h('div', { class: 'cluster' }, [
                  /* زر واحد مباشر: إيقاف ⇄ تفعيل دخول المدرسة */
                  st.blocked
                    ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تفعيل دخول المدرسة',
                        onClick: function () { App.activateFlow(App._dashSchool); } })
                    : h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'إيقاف دخول المدرسة',
                        onClick: function () { App.suspendFlow(App._dashSchool); } }),
                  h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تسجيل السداد (+سنة)',
                    onClick: function () { App.payFlow(App._dashSchool); } }),
                  st.blocked ? null : h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحديد السبب والملاحظة',
                    onClick: function () { App.suspendDialog(App._dashSchool); } }),
                  h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'الباقة والتفاصيل',
                    onClick: function () { App.licenseDialog(App._dashSchool); } })
                ])
              ]);
            })()
          ]));
        }

        /* مدارس موقوفة: تنبيه مباشر مع رفع الإيقاف */
        var badSchools = licAll.rows.filter(function (r) { return r.suspended; });
        if (badSchools.length) {
          target.appendChild(h('div', { class: 'panel danger-panel', style: { marginTop: '12px' } }, [
            h('h3', { class: 'panel-title', text: 'مدارس موقوفة (' + badSchools.length + ')' }),
            h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '6px 0 10px' },
              text: 'دخول هذه المدارس موقوف حاليًا — لا يستطيع أي حساب منها الدخول (عدا المشرف العام).' }),
            h('ul', { style: { margin: 0, paddingInlineStart: '18px', lineHeight: '2' } }, badSchools.map(function (r) {
              return h('li', {}, [
                h('strong', { text: r.name }),
                h('span', { class: 'muted', text: ' — ' + r.label + ' · ' + r.planName + ' · ' + r.annual + ' ر.س سنويًا' }),
                ' ',
                h('button', { class: 'btn-link', type: 'button', text: 'تفعيل',
                  onClick: function () { App.activateFlow(r.schoolId); } }),
                ' ',
                h('button', { class: 'btn-link', type: 'button', text: 'التفاصيل',
                  onClick: function () { App._dashSchool = r.schoolId; App.licenseDialog(r.schoolId); } })
              ]);
            }))
          ]));
        }
        action('إضافة مدرسة', 'schools', 'btn-primary');
      }

      if (role === 'super') { App.controlPanel(view, superDashLegacy); return; }
      if (role === 'principal') {
        var teachersN = S.usersByRole('teacher', schoolId).length;
        var openV = S.list('violations').filter(function (v) { return v.status !== 'closed'; }).length;
        var pendP = S.list('permissions').filter(function (p) { return p.status === 'deputy_pending'; }).length;
        var pN = S.list('periods', { schoolId: schoolId }).length;
        stats('المعلمون', teachersN, 'في المدرسة');
        stats('الفصول', S.list('classes', { schoolId: schoolId }).length);
        stats('مخالفات غير مغلقة', openV, null, openV ? 'gold' : null);
        stats('حصص الجدول اليومي', pN + ' حصص');
        action('إضافة حساب موظف', 'staff', 'btn-primary');
        action('استيراد المعلمين (Excel)', 'staff');
        action('إسناد المواد', 'staff');
      }
      if (role === 'deputy') {
        var today = UI.today();
        var todaySessions = S.list('sessions').filter(function (s) { return s.date === today; });
        var absentToday = todaySessions.reduce(function (a, s) { return a + (s.records || []).filter(function (r) { return r.status === 'absent'; }).length; }, 0);
        var vPending = S.list('violations').filter(function (v) { return v.status === 'deputy_pending'; }).length;
        var pPending = S.list('permissions').filter(function (p) { return p.status === 'deputy_pending'; }).length;
        stats('حصص مُحضَّرة اليوم', todaySessions.filter(function (s) { return s.status === 'closed'; }).length + ' / ' + todaySessions.length);
        stats('غياب اليوم', absentToday, 'طالب');
        stats('مخالفات بانتظار الإجراء', vPending, null, vPending ? 'gold' : null);
        stats('استئذانات معلّقة', pPending);
        action('جدول الحصص', 'schedule', 'btn-primary');
        action('تقارير التحضير', 'attendance-reports');
        action('الاستئذان', 'permissions');
      }
      if (role === 'teacher') {
        var my = S.assignmentsOf(S.session.userId);
        var mine = S.list('violations').filter(function (v) { return v.teacherId === S.session.userId; });
        var reqs = S.list('activityReqs').filter(function (r) { return r.teacherId === S.session.userId && r.status === 'pending'; });
        stats('إسناداتي', my.length);
        stats('مخالفاتي', mine.length, mine.filter(function (v) { return v.status !== 'closed'; }).length + ' غير مغلقة');
        stats('طلبات نشاط بانتظار ردّي', reqs.length, null, reqs.length ? 'gold' : null);
        stats('حصص اليوم', S.periodsOf(schoolId).length);
        action('بدء التحضير', 'attendance', 'btn-primary');
        action('تسجيل مخالفة', 'violations');
        action('طلبات النشاط', 'activities');
      }
      if (role === 'guidance') {
        stats('مخالفات بانتظار ردّي', S.list('violations').filter(function (v) { return v.status === 'guidance_pending'; }).length, null, 'gold');
        stats('مخالفات مُعالجة', S.list('violations').filter(function (v) { return v.guidance; }).length);
        stats('استئذانات للتحويل', S.list('permissions').filter(function (p) { return p.status === 'deputy_pending'; }).length);
        action('الرد على المخالفات', 'violations', 'btn-primary');
        action('تحويل استئذان', 'permissions');
      }
      if (role === 'teachers_deputy') {
        var st = S.dutyStats(schoolId);
        var vac = S.usersByRole('teacher', schoolId).length;
        stats('مناوبات اليوم', st.today, vac + ' معلمًا في المدرسة', st.today ? 'gold' : null);
        stats('مناوبات الأسبوع', st.week);
        stats('مناوبات هذا الشهر', st.month);
        stats('أماكن المناوبة', st.locations, st.unreminded ? st.unreminded + ' تذكير لم يُرسل' : 'كل التذكيرات أُرسلت');
        action('لوحة المناوبة', 'duties', 'btn-primary');
        action('توزيع آلي للمناوبين', 'duties');
        action('إرسال تذكيرات الغد', 'duties');
      }
      if (role === 'teacher') {
        var myDuty = S.todayDutyFor(S.session.userId);
        if (myDuty) {
          cards.push(UI.statCard('مناوبتك اليوم', S.locationName(myDuty.locationId), myDuty.shift || '', 'gold'));
        } else {
          var next = S.list('duties').filter(function (d) { return d.teacherId === S.session.userId && d.date > UI.today(); })
            .sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
          cards.push(UI.statCard('مناوبتك القادمة', next ? next.date : 'لا يوجد', next ? S.locationName(next.locationId) : 'لم تُسند لك مناوبة'));
        }
      }
      if (role === 'absence_monitor') {
        var today2 = UI.today();
        var daily = S.dailyAttendance(today2);
        var absentNow = daily.reduce(function (a, c) { return a + c.absent; }, 0);
        var lateNow = daily.reduce(function (a, c) { return a + c.late; }, 0);
        stats('غياب اليوم', absentNow, 'طالب', absentNow ? 'gold' : null);
        stats('تأخر اليوم', lateNow, 'طالب');
        stats('حصص مُحضّرة اليوم', daily.reduce(function (a, c) { return a + c.closed; }, 0) + ' / ' + daily.reduce(function (a, c) { return a + c.sessions; }, 0));
        stats('بلغوا نسبة الحرمان', S.deprivationList(S.rangeOf('term')).rows.length, 'طالب');
        action('الأكثر غيابًا', 'monitor', 'btn-primary');
        action('سجل الغياب', 'monitor');
        action('قائمة الحرمان', 'monitor');
      }
      if (role === 'volunteer') {
        stats('البرامج التطوعية', S.list('programs').length);
        stats('طلبات التسجيل', S.list('programRegs').length, S.list('programRegs').filter(function (r) { return r.status === 'pending'; }).length + ' بانتظار الاعتماد', 'gold');
        stats('إجمالي الساعات المعتمدة', S.list('programRegs').reduce(function (a, r) { return a + (r.hours || 0); }, 0));
        action('إضافة برنامج', 'volunteer', 'btn-primary');
      }
      if (role === 'activity') {
        stats('الأنشطة', S.list('activities').length);
        stats('طلبات المشاركة', S.list('activityReqs').length, S.list('activityReqs').filter(function (r) { return r.status === 'pending'; }).length + ' معلّقة', 'gold');
        stats('مقبولة', S.list('activityReqs').filter(function (r) { return r.status === 'approved'; }).length);
      }
      if (role === 'student') {
        stats('ساعات التطوع', S.list('programRegs', { studentId: S.session.userId }).reduce(function (a, r) { return a + (r.hours || 0); }, 0));
        stats('طلبات النشاط', S.list('activityReqs', { studentId: S.session.userId }).length);
        stats('استئذاناتي', S.list('permissions', { studentId: S.session.userId }).length);
        action('الأنشطة المتاحة', 'activities', 'btn-primary');
        action('برامج التطوع', 'volunteer');
      }

      view.appendChild(h('div', { class: 'stat-row' }, cards));

      /* الباقة والاشتراك — لقائد المدرسة (معلوماته ومزايا الترقية) */
      if (role === 'principal') view.appendChild(App.schoolLicensePanel(schoolId));

      /* طلبات الحسابات بانتظار الاعتماد (المدير) */
      if (role === 'principal' || role === 'deputy') {
        var pending = S.list('users').filter(function (u) { return u.status === 'pending'; });
        if (pending.length) {
          view.appendChild(UI.panel('حسابات بانتظار الاعتماد', 'طلبات تسجيل جديدة تحتاج موافقتك.', null, [
            UI.table({
              cols: [
                { label: 'الاسم', render: function (u) { return h('strong', { text: u.name }); } },
                { label: 'الدور', render: function (u) { return (S.roles.find(function (r) { return r.id === u.role; }) || {}).name; } },
                { label: 'اسم المستخدم', render: function (u) { return h('code', { text: u.username }); } },
                { label: 'البريد', key: 'email' },
                { label: '', class: 'row-actions', render: function (u) {
                  return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'اعتماد', onClick: function () {
                    S.approveAccount(u.id); UI.toast('اعتُمد حساب ' + u.name, 'ok'); App.route(); App.refreshBadges();
                  } });
                } }
              ], rows: pending, empty: 'لا طلبات.'
            })
          ]));
        }
      }
      var perm = S.notifyPermission();
      if (perm !== 'granted') {
        view.appendChild(UI.panel('تنبيهات الجوال', 'لتصل تنبيهات المناوبة والغياب والمخالفات إلى جوالك مباشرة.', [
          h('button', { class: 'btn btn-soft btn-sm', type: 'button',
            text: perm === 'denied' ? 'التنبيهات محجوبة من إعدادات المتصفح' : 'تفعيل تنبيهات الجوال',
            disabled: perm === 'denied', onClick: function () { App.enableMobileNotify(); } })
        ], [
          h('p', { class: 'muted', text: perm === 'unsupported'
            ? 'هذا المتصفح لا يدعم تنبيهات النظام — ستظهر التنبيهات داخل تابعني وإشعارات تلقرام.'
            : perm === 'denied'
              ? 'سبق رفض الإذن — افتح إعدادات الموقع في المتصفح وامنح الإذن للتنبيهات ثم أعد التحميل.'
              : 'سيطلب المتصفح الإذن مرة واحدة، وبعدها تصل التنبيهات حتى لو كانت تابعني في الخلفية.' })
        ]));
      }
      if (actions.length) view.appendChild(UI.panel('إجراءات سريعة', null, actions, [
        h('p', { class: 'muted', text: 'اختصارات مباشرة للمهام المتكرّرة في دورك.' })
      ]));

      /* آخر الإشعارات */
      var inbox = S.inbox().slice(0, 6);
      view.appendChild(UI.panel('آخر ما وصلك', null, [
        h('button', { class: 'mini-btn', type: 'button', text: 'عرض الكل', onClick: App.openInbox })
      ], [
        inbox.length ? UI.timeline(inbox.map(function (n) { return { text: n.title + (n.body ? ' — ' + n.body : ''), by: n.kind, at: n.at }; })) : UI.empty('لا إشعارات بعد — نفّذ إجراءً من إجراءاتك السريعة لتظهر هنا.')
      ]));

      /* مسار العمل بحسب الدور */
      var flows = {
        teacher: ['تختار الفصل والحصة', 'تحضّر الطلاب (غائب/متأخر)', 'تُغلق التحضير بعد نصف الحصة أو نهايتها حسب الجدول', 'يذهب تقرير للوكيل ومدير المدرسة + رسالة تلقرام'],
        deputy: ['تُسند الفصول والمواد للمعلمين', 'تضبط جدول الحصص وقاعدة الإغلاق', 'تستلم تقارير التحضير والغياب', 'تنفّذ لائحة المخالفات وتُغلقها'],
        guidance: ['يصل من المعلم مخالفة سلوكية', 'تكتب الإجراء المقترح والخيارات', 'تقوّمه إلى وكيل شؤون الطلاب', 'يُغلق الطلب بحسب لائحة المدرسة'],
        principal: ['تُنشئ حسابات المدرسة', 'تستورد بيانات المعلمين من نور', 'تُسند المواد بحسب المرحلة', 'تتابع التقارير والمخالفات المغلقة']
      };
      if (flows[role]) {
        view.appendChild(UI.panel('مسار عملك في تابعني', null, null, [
          h('div', { class: 'timeline-list' }, flows[role].map(function (t, i) {
            return h('li', {}, [h('span', { class: 'timeline-num', style: { width: '34px', height: '34px', fontSize: '14px' }, text: '١٢٣٤'[i] || String(i + 1) }),
              h('div', { class: 'tl-text', text: t })]);
          }))
        ]));
      }
    }
  });

  /* =========================================================================
     البحث: صندوق في الشريط العلوي (كل الأدوار) — والنطاق محسوب من الصلاحية
     المشرف العام: كل المدارس · المدير/الوكيل/المراقب: مدرسته فقط · المعلم: فصوله فقط
     ========================================================================= */
  var SCOPE_NOTE = {
    all: 'نطاقك: كل المدارس والبيانات (مشرف عام)',
    school: 'نطاقك: مدرستك فقط — لا تظهر بيانات أي مدرسة أخرى',
    self: 'نطاقك: فصولك أنت فقط — لا تظهر بيانات طلاب أو معلمين آخرين'
  };

  App.searchItemModal = function (it) {
    var rows = [], rec = null;
    if (it.kind === 'student') rec = S.student(it.id);
    if (it.kind === 'user') rec = S.user(it.id);
    if (it.kind === 'class') rec = S.klass(it.id);
    if (it.kind === 'school') rec = S.school(it.id);
    if (rec) {
      Object.keys(rec).forEach(function (k) {
        if (/^(id|schoolId|img|password|passwordHash|salt)$/.test(k)) return;
        var v = rec[k];
        if (v === null || v === undefined || v === '' || typeof v === 'object') return;
        rows.push(h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]));
      });
    }
    var body = [h('div', { class: 'muted', style: { marginBottom: '8px' }, text: it.sub || '' })];
    if (rows.length) body.push(h('table', { class: 'kv' }, rows));
    else body.push(h('p', { class: 'muted', text: 'لا تفاصيل إضافية.' }));
    UI.modal({ title: it.title, wide: true, body: body, actions: [{ label: 'إغلاق', class: 'btn-outline', onClick: function (c) { c(); } }] });
  };

  App.openSearch = function (initial) {
    var inp = h('input', { class: 'input', type: 'search', placeholder: 'اكتب اسمًا أو رقم هوية أو جوال…', autofocus: true });
    var note = h('div', { class: 'callout info', style: { margin: '10px 0' }, text: SCOPE_NOTE[(S.searchScope() || {}).kind] || '' });
    var res = h('div', { class: 'search-res' });
    var m = null;

    function render() {
      var out = S.search(inp.value);
      clear(res);
      if (!inp.value.trim()) {
        res.appendChild(h('p', { class: 'muted', text: 'اكتب حرفين على الأقل…' }));
        return;
      }
      if (!out.groups.length) {
        res.appendChild(h('p', { class: 'muted', text: 'لا نتائج داخل نطاقك.' }));
        return;
      }
      res.appendChild(h('div', { class: 'muted', style: { marginBottom: '6px' }, text: out.total + ' نتيجة' }));
      out.groups.forEach(function (g) {
        res.appendChild(h('div', { class: 'search-group' }, [
          h('div', { class: 'sg-head' }, [h('span', { html: g.icon }), h('strong', { text: g.label }), h('span', { class: 'muted', text: ' (' + g.items.length + ')' })]),
          h('div', { class: 'sg-items' }, g.items.map(function (it) {
            return h('button', { class: 'sg-item', type: 'button', onClick: function () {
              if (m) m.close(); App.searchItemModal(it);
            } }, [
              h('span', { class: 'sgi-t', text: it.title }),
              h('span', { class: 'sgi-s muted', text: (it.sub || '') + (it.badge ? ' · ' + it.badge : '') })
            ]);
          }))
        ]));
      });
    }
    inp.addEventListener('input', render);
    m = UI.modal({ title: '🔎 البحث', wide: true, body: [inp, note, res] });
    if (initial) { inp.value = initial; }
    render();
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 120);
  };

  function searchButton(compact) {
    return h('button', {
      class: 'icon-btn' + (compact ? '' : ' hide-sm'), type: 'button', title: 'بحث (Ctrl+K)', onClick: function () { App.openSearch(); }
    }, [h('span', { html: '&#128269;' })]);
  }
  App.searchButton = searchButton;

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); App.openSearch(); }
  });

  /* ===================== التحديث القسري وكشف النسخة القديمة ===================== */
  App.hardUpdate = function (silent) {
    var done = function () { location.reload(); };
    var tasks = [];
    try {
      if (window.caches && caches.keys) tasks.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    } catch (e) {}
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
    } catch (e) {}
    Promise.all(tasks).then(function () {
      if (!silent) UI.toast('مُسح الكاش القديم ✓ — يُحدَّث الآن', 'ok');
      setTimeout(done, silent ? 0 : 700);
    }, done);
  };

  /** يقرأ رقم الإصدار من sw.js الحقيقي على الشبكة؛ ولو اختلف عن نسخة الصفحة ⇒ يُحدِّث نفسه مرّة واحدة */
  App.checkStale = function () {
    try {
      if (!navigator.onLine) return;
      var key = 'tabaani-stale-check';
      fetch('sw.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (txt) {
        var v = (txt.match(/tabaani-app-v(\d+)/) || [])[1];
        var mine = String(App.version());
        if (!v || v === mine) { try { sessionStorage.removeItem(key); } catch (e) {} return; }
        /* نسخة الصفحة قديمة (كاش/PWA) — حدّث نفسك مرّة واحدة */
        if (sessionStorage.getItem(key) === '1') return;
        try { sessionStorage.setItem(key, '1'); } catch (e) {}
        UI.toast('توجد نسخة أحدث (v' + v + ') — يُحدَّث التطبيق تلقائيًا…', 'ok');
        setTimeout(function () { App.hardUpdate(true); }, 1200);
      }).catch(function () {});
    } catch (e) {}
  };

  /** تقرير تشخيص جاهز للنسخ — يفيد في معرفة سبب عدم الدخول بدقة */
  App.diagReport = function () {
    var L = [];
    var users = []; try { users = S.list('users'); } catch (e) {}
    var st = {}; try { st = S.dataStats(); } catch (e) {}
    var cfg = {}; try { cfg = S.syncCfg(); } catch (e) {}
    var set = (function () { try { return S.db.settings || {}; } catch (e) { return {}; } })();
    L.push('— تابعني — تقرير تشخيص —');
    L.push('التاريخ: ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
    L.push('نسخة التطبيق: v' + App.version());
    L.push('الرابط: ' + location.href.split('?')[0]);
    var env = {}; try { env = UI.env ? UI.env() : {}; } catch (e) {}
    L.push('الوضع: ' + (env.standalone ? 'تطبيق مثبّت (شاشة رئيسية)' : 'متصفح') + ' · iOS: ' + (env.ios ? 'نعم' : 'لا'));
    L.push('الجلسة الحالية: ' + (S.session ? (S.session.role + ' — ' + S.session.name) : 'لا يوجد (شاشة دخول)'));
    L.push('حسابات هذا الجهاز: ' + users.length);
    L.push('أنواع الحسابات: ' + JSON.stringify(users.reduce(function (a, u) { a[u.role] = (a[u.role] || 0) + 1; return a; }, {})));
    L.push('مدارس: ' + (st.schools || 0) + ' · طلاب: ' + (st.students || 0) + ' · فصول: ' + (st.classes || 0));
    L.push('الإقرارات: مفعّلة=' + (set.ackEnabled !== false) + ' · مهيّأة=' + !!set.ackMigrated + ' · وقت التهيئة=' + (set.ackMigratedAt || '—'));
    L.push('محجوبون بالإقرار: ' + users.filter(function (u) { try { return S.ackLock(u.id); } catch (e) { return false; } })
      .map(function (u) { return u.username + '(' + u.role + ')'; }).join(', '));
    L.push('المزامنة: مقرونة=' + !!(cfg.url && cfg.token) + ' · آخر إصدار=' + (cfg.lastVersion || 0) + ' · آخر خطأ=' + (cfg.lastError || '—'));
    L.push('Service Worker: ' + (navigator.serviceWorker ? (navigator.serviceWorker.controller ? 'مسجّل وفعّال' : 'مسجّل بلا تحكّم') : 'غير مدعوم'));
    L.push('تخزين محلي: ' + (function () { try { return Math.round((localStorage.getItem('tabaani-school-db-v1') || '').length / 1024) + ' ك.ب'; } catch (e) { return 'غير متاح'; } })());
    L.push('إنترنت: ' + (navigator.onLine ? 'متصل' : 'غير متصل'));
    var txt = L.join('\n');
    UI.modal({ title: 'تقرير تشخيص', wide: true, body: [
      h('p', { class: 'muted', text: 'انسخ التقرير وأرسله لي (لا يحتوي كلمات مرور).' }),
      h('textarea', { readonly: true, rows: '14', class: 'input', dir: 'ltr', style: { fontFamily: 'monospace', fontSize: '12px' }, value: txt }),
      h('div', { class: 'cluster', style: { marginTop: '10px' } }, [
        h('button', { class: 'btn btn-primary', type: 'button', text: '📋 انسخ التقرير', onClick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
            function () { UI.toast('نُسخ ✓ — أرسله لي', 'ok'); }, function () { UI.toast('حدّد النص وانسخه يدويًا', 'warn'); });
        } }),
        h('button', { class: 'btn btn-outline', type: 'button', text: '🔄 تحديث قسري', onClick: function () { App.hardUpdate(); } })
      ])
    ] });
    return txt;
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.boot);
})(window);
