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
    can: function (mod) { return !mod.roles || mod.roles.indexOf(S.session.role) > -1; },

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
          h('span', { class: 'brand-sub', text: 'الخدمات التعليمية للمدارس' })
        ])
      ]));
      sidebar.appendChild(h('div', { class: 'side-school' }, [
        h('strong', { text: school ? school.name : 'مدرسة' }),
        h('span', { text: school ? [school.city, school.code].filter(Boolean).join(' · ') : '' })
      ]));

      /* خلفية القائمة المنسدلة على الجوال */
      var backdrop = h('div', { class: 'nav-backdrop', onClick: function () { sidebar.classList.remove('is-open'); backdrop.classList.remove('is-open'); } });
      document.body.appendChild(backdrop);
      sidebar._backdrop = backdrop;

      var nav = h('nav', { class: 'side-nav', 'aria-label': 'أقسام المنصة' });
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
      topbar.appendChild(h('div', { class: 'topbar-actions' }, [
        h('button', { class: 'icon-btn', type: 'button', title: 'الإشعارات', onClick: function () { App.openInbox(); } },
          [h('span', { html: '&#128276;' }), unread ? h('span', { class: 'count', style: { position: 'absolute', transform: 'translate(10px,-10px)', background: 'var(--amber-500)', color: 'var(--on-gold)', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', fontWeight: '700' }, text: String(unread) }) : null]),
        h('button', { class: 'icon-btn hide-sm', type: 'button', title: 'سجل رسائل تلقرام', onClick: function () { App.openTelegram(); } },
          [h('span', { html: '&#9992;&#65039;' })]),
        h('button', { class: 'icon-btn hide-sm', type: 'button', title: 'تغيير كلمة المرور', onClick: App.openChangePassword },
          [h('span', { html: '&#128273;' })]),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'خروج', onClick: App.logout })
      ]));

      /* لافتة المناوبة: تظهر فور دخول صاحب المناوبة في يومه */
      var duty = S.todayDutyFor(S.session.userId);
      if (duty) main.insertBefore(App.dutyBanner(duty), content);

      App.route();
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
      var id = (location.hash || '#/dashboard').replace('#/', '') || 'dashboard';
      var mod = App.modules[id];
      if (!mod || !App.can(mod)) { id = 'dashboard'; mod = App.modules.dashboard; if (location.hash !== '#/dashboard') { location.replace('#/dashboard'); return; } }
      App.current = id;
      Array.prototype.forEach.call(document.querySelectorAll('.side-nav a'), function (a) {
        a.classList.toggle('is-active', a.getAttribute('data-mod') === id);
      });
      var title = document.getElementById('view-title');
      if (title) title.textContent = S.gtext(mod.label);
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
      panel.appendChild(h('p', { class: 'app-ver', text: 'تابعني · الإصدار ' + App.version() }));

      var aside = h('aside', { class: 'login-aside' }, [
        h('span', { class: 'eyebrow eyebrow-ghost', text: 'منصة تابعني للخدمات التعليمية' }),
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

    /** شاشة الدخول */
    login: function () {
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
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'أدوات البيانات (إعادة بيانات العرض · البدء من الصفر · النسخة الاحتياطية) صارت داخل المنصة: حساب المشرف العام ← «بيانات المنصة».' })
      ]);
      App.authShell('الدخول إلى المنصة', 'سجّل دخولك لمتابعة خدماتك بحسب دورك.', box);
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
      App.authShell('إنشاء حساب جديد', 'سجّل بياناتك للانضمام إلى مدرستك على منصة تابعني.', content);
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
          h('p', { class: 'muted', text: 'كلمة المرور الحالية مولَّدة من إدارة المنصة عند التسليم، ولأمان حسابك اختر كلمة مرور خاصة بك.' }),
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
      var note = h('p', { class: 'muted', text: 'وجّه وجهك نحو الكاميرا للمتابعة إلى المنصة.' });
      var holder = h('div');
      panel.appendChild(h('div', {}, [
        h('span', { class: 'eyebrow', text: 'تحقّق الهوية' }),
        h('h1', { style: { fontSize: '1.9rem', marginTop: '10px' }, text: 'تمرير الوجه' }),
        h('p', { class: 'muted', text: 'التسجيل في المنصة يتطلّب مطابقة بصمة الوجه — كما في تسجيل حضورك للفصل.' })
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

    /** تدفّق إعادة المنصة: يطلب رمز OTP على تلقرام/البريد ثم يُنفّذ الإعادة */
    resetFlow: function (opts) {
      opts = opts || {};
      var kind = opts.kind || 'demo';           /* demo = بيانات العرض · empty = من الصفر */
      var title = kind === 'demo' ? 'إعادة بيانات العرض التجريبية' : 'البدء من الصفر (حذف كل البيانات)';
      var warn = kind === 'demo'
        ? 'سيُستبدل ما في المنصة ببيانات العرض التجريبية، ويبقى حساب المشرف العام كما هو.'
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
                status.innerHTML = r.ok
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
          UI.toast('تمت إعادة المنصة (' + (kind === 'demo' ? 'بيانات العرض' : 'من الصفر') + ') ✓', 'ok');
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
      if (S.needsSetup()) { App.setupScreen(); return; }   /* أول تشغيل: لا كلمات مرور في الكود */
      var u = S.restore();
      if (u) App.shell(); else App.login();
    },

    /* ============ التهيئة الأولى: إنشاء حساب المشرف العام بطريقة آمنة ============ */
    setupScreen: function () {
      var root = document.getElementById('app');
      clear(root);
      var panel = h('div', { class: 'login-panel' });
      var nameF = UI.field({ name: 'supName', label: 'اسم المشرف العام', placeholder: 'مثال: عبدالله العتيبي', half: true });
      var userF = UI.field({ name: 'supUser', label: 'اسم المستخدم', placeholder: 'a-otaibi', dir: 'ltr', half: true,
        help: 'به تدخل المنصة (يمكنك الدخول بالبريد أيضًا).' });
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
      function draw() {
        clear(cards);
        cards.appendChild(modeCard(true, 'بيانات عرض تجريبية', 'مدرسة كاملة وأدوار وطلاب جاهزون — للتجربة والعرض على العملاء.'));
        cards.appendChild(modeCard(false, 'مدرسة حقيقية — ابدأ من الصفر', 'بلا أي بيانات: تُنشئ مدرستك وحساباتك بنفسك.'));
      }
      draw();
      var err = h('p', { class: 'form-error', hidden: true });
      panel.appendChild(h('div', {}, [
        h('span', { class: 'eyebrow', text: 'التهيئة الأولى' }),
        h('h1', { style: { fontSize: '1.9rem', marginTop: '10px' }, text: 'إنشاء حساب المشرف العام' }),
        h('p', { class: 'muted', text: 'هذه الشاشة تظهر مرة واحدة فقط عند أول تشغيل — لا توجد أي كلمة مرور مكتوبة داخل المنصة، وأنت من يُنشئ حسابك بنفسك.' })
      ]));
      panel.appendChild(cards);
      panel.appendChild(h('div', { class: 'form-grid' }, [nameF.wrap, userF.wrap, mailF.wrap, p1.wrap, p2.wrap]));
      panel.appendChild(err);
      panel.appendChild(h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'إنشاء الحساب والبدء', onClick: function () {
        err.hidden = true;
        if (!nameF.input.value.trim()) { err.hidden = false; err.textContent = 'اكتب اسم المشرف العام'; return; }
        if (!userF.input.value.trim()) { err.hidden = false; err.textContent = 'اكتب اسم المستخدم'; return; }
        if (p1.input.value.length < 8) { err.hidden = false; err.textContent = 'كلمة المرور ٨ أحرف على الأقل'; return; }
        if (p1.input.value !== p2.input.value) { err.hidden = false; err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
        var r = S.setupOwner({ name: nameF.input.value, username: userF.input.value, email: mailF.input.value,
          password: p1.input.value, demo: mode.demo });
        if (!r.ok) { err.hidden = false; err.textContent = r.error; return; }
        UI.toast('أُنشئ حساب المشرف العام ✓', 'ok');
        App._doEnter(r.user.id);
      } }));
      panel.appendChild(h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' },
        text: 'يمكنك تغيير كلمة المرور لاحقًا من: بياناتي ← تغيير كلمة المرور.' }));
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

      if (role === 'super') {
        /* أسفل اللوحة — على اليمين: إعادة المنصة للوضع الافتراضي (برمز تحقق) */
        view.appendChild(h('div', { class: 'dash-corner' }, [
          h('div', { class: 'panel danger-panel' }, [
            h('h3', { class: 'panel-title', text: 'إعادة المنصة للوضع الافتراضي' }),
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
        action('إضافة مدرسة', 'schools', 'btn-primary');
      }
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
            ? 'هذا المتصفح لا يدعم تنبيهات النظام — ستظهر التنبيهات داخل المنصة وإشعارات تلقرام.'
            : perm === 'denied'
              ? 'سبق رفض الإذن — افتح إعدادات الموقع في المتصفح وامنح الإذن للتنبيهات ثم أعد التحميل.'
              : 'سيطلب المتصفح الإذن مرة واحدة، وبعدها تصل التنبيهات حتى لو كانت المنصة في الخلفية.' })
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
        view.appendChild(UI.panel('مسار عملك في المنصة', null, null, [
          h('div', { class: 'timeline-list' }, flows[role].map(function (t, i) {
            return h('li', {}, [h('span', { class: 'timeline-num', style: { width: '34px', height: '34px', fontSize: '14px' }, text: '١٢٣٤'[i] || String(i + 1) }),
              h('div', { class: 'tl-text', text: t })]);
          }))
        ]));
      }
    }
  });

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.boot);
})(window);
