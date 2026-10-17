/* ==========================================================================
   لوحة تحكم المشرف العام — تُعرض في «لوحة البداية»
   --------------------------------------------------------------------------
   إحصاءات + مبالغ المنصة + رسوم بيانية، وأقسام تُفتح وحدها عند الضغط:
   المدارس · المستخدمون · الطلاب · كلمات المرور · الاشتراكات والمالية · إدارة المنصة.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var ROLE_LABEL = { student: 'طلاب', teacher: 'معلمون', principal: 'مدير مدرسة', deputy: 'وكيل شؤون الطلاب',
    guidance: 'موجّه التوجيه والإرشاد', teachers_deputy: 'وكيل شؤون المعلمين', absence_monitor: 'مراقب الغياب',
    volunteer: 'مسؤول ساعات التطوع', activity: 'مسؤول النشاط', guard: 'حارس البوابة', accountant: 'محاسب مالي',
    support: 'دعم فني', super: 'مشرف تابعني' };

  var state = { view: 'home', schoolId: '', picked: {}, error: '' };
  var legacyFn = null;
  var hostRef = null;

  function money(n) { return UI.fmtMoney ? UI.fmtMoney(Number(n) || 0) : (Number(n) || 0) + ' ر.س'; }

  /* ------------------------------------------------------------ الرئيسية */
  function home(d) {
    var kids = [
      UI.statCard('المدارس', String(d.schools), d.regions + ' منطقة · ' + d.cities + ' مدينة', 'mint'),
      UI.statCard('الطلاب', String(d.students), 'في كل المدارس', 'brand'),
      UI.statCard('المعلمون', String(d.teachers), d.staff + ' موظفًا إجمالًا', 'amber'),
      UI.statCard('إجمالي المستخدمين', String(d.users), 'كل الأدوار', 'gold'),
      UI.statCard('الاشتراكات السنوية المتوقّعة', money(d.revenue.annual), d.license.pro + ' برو · ' + d.license.classic + ' كلاسيك', 'brand'),
      UI.statCard('رسم التأسيس المتوقّع', money(d.revenue.setup), 'مرة واحدة لكل مدرسة', 'amber'),
      UI.statCard('المحصّل فعليًا', money(d.revenue.paid), d.revenue.due ? money(d.revenue.due) + ' غير محصّل' : 'لا متأخرات', 'mint'),
      UI.statCard('اشتراكات موقوفة/متأخّرة', String(d.license.suspended + d.license.overdue), d.license.suspended || d.license.overdue ? 'تحتاج متابعة' : 'كلها سارية', (d.license.suspended || d.license.overdue) ? 'gold' : null)
    ];

    var tiles = [
      ['schools', '🏫', 'المدارس', 'كل مدرسة وعدد موظفيها ومعلميها وطلابها'],
      ['users', '👥', 'المستخدمون', 'كل الكوادر حسب الدور والمدرسة'],
      ['students', '🎓', 'الطلاب', 'أعداد الطلاب لكل مدرسة وفصل'],
      ['passwords', '🔑', 'كلمات المرور', 'ولّد لمدرسة كاملة أو لأفراد محددين'],
      ['finance', '💰', 'الاشتراكات والمالية', 'مبالغ المنصة والفواتير والمصروفات']
    
    ].map(function (t) {
      return h('button', { class: 'ctl-tile', type: 'button', onClick: function () { state.view = t[0]; state.picked = {}; draw(); } }, [
        h('span', { class: 'ctl-ic', text: t[1] }),
        h('strong', { text: t[2] }),
        h('span', { class: 'muted', text: t[3] })
      ]);
    });

    var schoolLabels = d.perSchool.map(function (s) { return s.name; });
    var schoolValues = d.perSchool.map(function (s) { return s.students; });
    var roleKeys = Object.keys(d.byRole).filter(function (r) { return r !== 'student'; });
    var userLabels = roleKeys.map(function (r) { return ROLE_LABEL[r] || r; });
    var userValues = roleKeys.map(function (r) { return d.byRole[r]; });
    var moneyLabels = ['اشتراكات سنوية', 'رسم تأسيس', 'محصّل', 'غير محصّل'];
    var moneyValues = [d.revenue.annual, d.revenue.setup, d.revenue.paid, d.revenue.due];

    return [
      h('div', { class: 'stat-row' }, kids),
      h('div', { class: 'ctl-tiles' }, tiles),
      /* الباقة والاشتراك — مباشرة من لوحة التحكم (إيقاف/تفعيل/سداد لكل مدرسة) */
      (function () {
        var schools = S.list('schools');
        if (!schools.length) return null;
        if (!App._dashSchool || !schools.some(function (s) { return s.id === App._dashSchool; })) App._dashSchool = schools[0].id;
        var st = S.licenseState(App._dashSchool) || {};
        var sel = h('select', { class: 'input', onchange: function (e) { App._dashSchool = e.target.value; App.route(); } },
          schools.map(function (s) { return h('option', { value: s.id, selected: s.id === App._dashSchool, text: s.name }); }));
        return UI.panel('الباقة والاشتراك — هذه المدرسة', 'حالة الاشتراك والإيقاف والسداد لهذه المدرسة', [
          st.blocked
            ? h('button', { class: 'btn btn-primary', type: 'button', text: 'تفعيل دخول المدرسة', onClick: function () { App.activateFlow(App._dashSchool); } })
            : h('button', { class: 'btn btn-danger', type: 'button', text: 'إيقاف دخول المدرسة', onClick: function () { App.suspendFlow(App._dashSchool); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'تسجيل السداد (+سنة)', onClick: function () { App.payFlow(App._dashSchool); } }),
          st.blocked ? null : h('button', { class: 'btn btn-soft', type: 'button', text: 'تحديد السبب والملاحظة', onClick: function () { App.suspendDialog(App._dashSchool); } }),
          h('button', { class: 'btn btn-soft', type: 'button', text: 'الباقة والتفاصيل', onClick: function () { App.licenseDialog(App._dashSchool); } })
        ], [
          h('div', { style: { marginBottom: '8px', maxWidth: '360px' } }, [sel]),
          h('div', { class: 'lic-banner is-' + App._licTone(st) }, [App.licenseBadge(App._dashSchool), App._licLine(st)])
        ]);
      })(),
      UI.panel('الطلاب في كل مدرسة', 'عدد الطلاب لكل مدرسة مسجّلة', null, [
        schoolLabels.length ? UI.chart({ type: 'bar', labels: schoolLabels, series: [{ name: 'طلاب', values: schoolValues }], height: 240 })
          : UI.empty('لا مدارس بعد — ابدأ بتسجيل مدرسة من الزر أعلاه.')
      ]),
      UI.panel('المستخدمون حسب الدور', 'الكوادر (بلا الطلاب)', null, [
        userLabels.length ? UI.chart({ type: 'bar', labels: userLabels, series: [{ name: 'مستخدمون', values: userValues }], height: 220 })
          : UI.empty('لا مستخدمون بعد.')
      ]),
      UI.panel('مبالغ المنصة (ر.س)', 'الاشتراكات السنوية · رسم التأسيس · المحصّل', null, [
        UI.chart({ type: 'bar', labels: moneyLabels, series: [{ name: 'المبالغ', values: moneyValues }], height: 200 })
      ]),
      (!S.syncConfigured || !S.syncConfigured())
        ? UI.panel('☁️ اربط المزامنة السحابية', 'نسخة من بياناتك في السحابة + دخول من أي جهاز + حماية من الضياع.', [
            h('button', { class: 'btn btn-primary', type: 'button', text: '⚡ اربط الآن (٤ خانات)', onClick: function () { App.go('sync'); } })
          ], [
            h('div', { class: 'callout info' }, [
              h('div', { html: '<b>رابط الخادم:</b> <span dir="ltr">https://tabaani.tabaani.workers.dev</span>' }),
              h('div', { html: '<b>حساب الخادم:</b> admin &nbsp;·&nbsp; <b>كلمة المرور:</b> Tabaani@2026' }),
              h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '4px' },
                text: 'هذه بيانات حساب الخادم — وليست حساب دخولك للمنصة.' })
            ])
          ])
        : null,
      toolsPanel(d)
    ];
  }

  /* ------------------------------------------------------------ المدارس */
  function schoolsView(d) {
    var rows = d.perSchool.map(function (s) {
      return h('div', { class: 'ctl-school' }, [
        h('div', { class: 'ctl-school-head' }, [
          h('strong', { text: s.name }),
          UI.badge(s.plan === 'pro' ? 'برو' : 'كلاسيك', s.plan === 'pro' ? 'mint' : 'plain'),
          UI.badge(s.licenseLabel || '—', s.license === 'active' ? 'mint' : 'terra'),
          h('span', { class: 'muted', text: (s.region || '') + (s.city ? ' — ' + s.city : '') })
        ]),
        h('div', { class: 'ctl-counts' }, [
          h('span', {}, [h('b', { text: String(s.teachers) }), h('i', { text: 'معلمون' })]),
          h('span', {}, [h('b', { text: String(s.admins) }), h('i', { text: 'إداريون' })]),
          h('span', {}, [h('b', { text: String(s.students) }), h('i', { text: 'طلاب' })]),
          h('span', {}, [h('b', { text: String(s.users) }), h('i', { text: 'إجمالي الحسابات' })])
        ]),
        h('div', { class: 'cluster' }, [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'عرض الكوادر', onClick: function () { state.view = 'users'; state.schoolId = s.id; draw(); } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'كلمات المرور', onClick: function () { state.view = 'passwords'; state.schoolId = s.id; state.picked = {}; draw(); } }),
          h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تفاصيل المدرسة', onClick: function () { App.go('schools'); } })
        ])
      ]);
    });
    return [
      h('div', { class: 'stat-row' }, [
        UI.statCard('عدد المدارس', String(d.schools)),
        UI.statCard('إجمالي الطلاب', String(d.students)),
        UI.statCard('إجمالي الكوادر', String(d.staff))
      ]),
      UI.panel('المدارس المسجّلة', 'لكل مدرسة: المعلمون · الإداريون · الطلاب · إجمالي الحسابات', [
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '🤖 تسجيل مدرسة جديدة', onClick: function () { App.go('regagent'); } })
      ], rows.length ? rows : [UI.empty('لا مدارس بعد.')])
    ];
  }

  /* ------------------------------------------------------------ المستخدمون */
  function usersView(d) {
    var filter = state.role || '';
    var users = S.list('users').filter(function (u) {
      if (state.schoolId && u.schoolId !== state.schoolId) return false;
      if (filter === 'admin') return ['principal', 'deputy', 'guidance', 'teachers_deputy', 'absence_monitor', 'volunteer', 'activity', 'guard', 'accountant', 'support'].indexOf(u.role) > -1;
      if (filter === 'teacher') return u.role === 'teacher';
      if (filter === 'student') return u.role === 'student';
      return true;
    });
    var roleSel = h('select', { class: 'input', style: { maxWidth: '220px' } });
    [['', 'كل الوظائف'], ['admin', 'المدراء والوكلاء والإداريون'], ['teacher', 'المعلمون'], ['student', 'الطلاب']]
      .forEach(function (o) { roleSel.appendChild(h('option', { value: o[0], text: o[1] })); });
    roleSel.value = filter;
    roleSel.addEventListener('change', function () { state.role = roleSel.value; state.picked = {}; draw(); });
    var picker = h('select', { class: 'input', style: { maxWidth: '260px' } });
    picker.appendChild(h('option', { value: '', text: 'كل المدارس' }));
    S.list('schools').forEach(function (s) { picker.appendChild(h('option', { value: s.id, text: s.name })); });
    picker.value = state.schoolId;
    picker.addEventListener('change', function () { state.schoolId = picker.value; state.picked = {}; draw(); });

    var groups = {};
    users.forEach(function (u) { (groups[u.role] = groups[u.role] || []).push(u); });
    var blocks = Object.keys(groups).sort().map(function (r) {
      return UI.panel(ROLE_LABEL[r] || r, groups[r].length + ' حسابًا', null, [
        h('div', { class: 'ctl-users' }, groups[r].map(function (u) {
          var sc = S.school(u.schoolId);
          return h('label', { class: 'ctl-user' }, [
            h('input', { type: 'checkbox', checked: !!state.picked[u.id], onChange: function (e) {
              if (e.target.checked) state.picked[u.id] = 1; else delete state.picked[u.id];
            } }),
            h('span', { class: 'ctl-uname', text: (u.name || '') + ' — ' + (u.username || 'بلا مستخدم') }),
            h('span', { class: 'muted', text: (sc ? sc.name : 'بلا مدرسة') + ' · ' + (u.status === 'active' ? 'نشط' : u.status) })
          ]);
        }))
      ]);
    });
    var picked = Object.keys(state.picked);
    return [
      h('div', { class: 'between' }, [
        h('div', {}, [h('strong', { text: 'المستخدمون (' + users.length + ')' }), h('div', { class: 'muted', text: 'اختر أفرادًا ثم ولّد كلمات مرور لهم فقط' })]),
        h('div', { class: 'cluster' }, [
          picker, roleSel,
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'توليد كلمات مرور للمحدد (' + picked.length + ')', onClick: function () {
            if (!picked.length) { UI.toast('حدّد مستخدمًا واحدًا على الأقل', 'warn'); return; }
            var rows = S.generatePasswords({ ids: picked });
            UI.toast('وُلّدت كلمات مرور لـ ' + rows.length + ' حسابًا', 'ok');
            UI.passwordSheet(rows, { title: 'كلمات مرور المحددين' });
            state.picked = {}; draw();
          } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'توليد للكل', onClick: function () {
            var rows = S.generatePasswords({ schoolId: state.schoolId, excludeSelf: true });
            UI.passwordSheet(rows, { title: 'كلمات مرور الحسابات' });
          } })
        ])
      ])
    ].concat(blocks);
  }

  /* ------------------------------------------------------------ الطلاب */
  function studentsView(d) {
    var rows = d.perSchool.map(function (s) {
      var classes = S.list('classes', { schoolId: s.id });
      var withStudents = classes.filter(function (k) { return (k.students || 0) > 0; }).length;
      return h('div', { class: 'ctl-school' }, [
        h('div', { class: 'ctl-school-head' }, [h('strong', { text: s.name }), h('span', { class: 'muted', text: classes.length + ' فصلًا (' + withStudents + ' فيه طلاب)' })]),
        h('div', { class: 'ctl-counts' }, [
          h('span', {}, [h('b', { text: String(s.students) }), h('i', { text: 'طالبًا' })]),
          h('span', {}, [h('b', { text: String(S.studentAccountStats().total) }), h('i', { text: 'حساب طالب (كل المدارس)' })])
        ])
      ]);
    });
    return [UI.panel('الطلاب حسب المدرسة', 'العدد الكلي ومقارنته بحسابات الطلاب', null, rows.length ? rows : [UI.empty('لا مدارس بعد.')])];
  }

  /* ------------------------------------------------------------ كلمات المرور */
  function passwordsView(d) {
    var sel = h('select', { class: 'input', style: { maxWidth: '300px' } });
    sel.appendChild(h('option', { value: '', text: '— كل المدارس —' }));
    S.list('schools').forEach(function (s) { sel.appendChild(h('option', { value: s.id, text: s.name })); });
    sel.value = state.schoolId || '';
    sel.addEventListener('change', function () { state.schoolId = sel.value; state.picked = {}; draw(); });

    var users = S.list('users').filter(function (u) { return !state.schoolId || u.schoolId === state.schoolId; });
    var list = h('div', { class: 'ctl-users' }, users.slice(0, 300).map(function (u) {
      return h('label', { class: 'ctl-user' }, [
        h('input', { type: 'checkbox', checked: !!state.picked[u.id], onChange: function (e) {
          if (e.target.checked) state.picked[u.id] = 1; else delete state.picked[u.id];
        } }),
        h('span', { class: 'ctl-uname', text: (u.name || '') + ' — ' + (u.username || 'بلا مستخدم') }),
        h('span', { class: 'muted', text: ROLE_LABEL[u.role] || u.role })
      ]);
    }));
    var picked = Object.keys(state.picked);
    return [
      UI.panel('توليد كلمات المرور', 'اختر مدرسة لتوليد كلمات مرور كل موظفيها، أو حدّد أفرادًا بعينهم.', [
        sel,
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'ولّد لكل الموظفين' + (state.schoolId ? ' (هذه المدرسة)' : ' (كل المدارس)'), onClick: function () {
          var rows = S.generatePasswords({ kind: 'staff', schoolId: state.schoolId, excludeSelf: true });
          if (!rows.length) { UI.toast('لا حسابات موظفين في النطاق المحدد', 'warn'); return; }
          UI.passwordSheet(rows, { title: 'كلمات مرور الموظفين' });
        } }),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'ولّد للمحددين (' + picked.length + ')', onClick: function () {
          if (!picked.length) { UI.toast('حدّد أفرادًا أولًا', 'warn'); return; }
          var rows = S.generatePasswords({ ids: picked, excludeSelf: true });
          UI.passwordSheet(rows, { title: 'كلمات مرور المحددين' });
        } }),
        h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'طلاب هذه المدرسة', onClick: function () {
          var rows = S.generatePasswords({ kind: 'students', schoolId: state.schoolId, excludeSelf: true });
          if (!rows.length) { UI.toast('لا حسابات طلاب في النطاق', 'warn'); return; }
          UI.passwordSheet(rows, { title: 'كلمات مرور الطلاب' });
        } })
      ], [
        h('div', { class: 'callout warn', text: 'كل مستخدم يُلزم بتغيير كلمة المرور عند أول دخول. احفظ الكشف قبل إغلاقه — لا يمكن استرجاعه إلا بإعادة التوليد. ولا تُصفَّر كلمة مرورك أنت.' }),
        list
      ])
    ];
  }

  /* ------------------------------------------------------------ المالية */
  function financeView(d) {
    var sum = S.financeSummary('annual');
    return [
      h('div', { class: 'stat-row' }, [
        UI.statCard('الاشتراكات السنوية', money(d.revenue.annual), d.schools + ' مدرسة'),
        UI.statCard('رسوم التأسيس', money(d.revenue.setup), 'مرة واحدة لكل مدرسة'),
        UI.statCard('المحصّل', money(d.revenue.paid), d.revenue.due ? money(d.revenue.due) + ' غير محصّل' : 'لا متأخرات', 'mint'),
        UI.statCard('المصروفات', money(sum.expensesTotal), 'مصروفات التشغيل')
      ]),
      UI.panel('مبالغ المنصة (ر.س)', 'مقارنة سريعة', null, [
        UI.chart({ type: 'bar', labels: ['اشتراكات سنوية', 'رسم تأسيس', 'محصّل', 'غير محصّل', 'مصروفات'],
          series: [{ name: 'المبالغ', values: [d.revenue.annual, d.revenue.setup, d.revenue.paid, d.revenue.due, sum.expensesTotal] }], height: 220 })
      ]),
      UI.panel('الاشتراكات', 'حالة كل مدرسة', [
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'فتح المالية والاشتراكات', onClick: function () { App.go('finance'); } })
      ], [UI.table({
        cols: [
          { label: 'المدرسة', key: 'name' },
          { label: 'الباقة', render: function (r) { return r.plan === 'pro' ? 'برو' : 'كلاسيك'; } },
          { label: 'الحالة', render: function (r) { return r.licenseLabel || '—'; } },
          { label: 'المتوقّع سنويًا', render: function (r) { return money(r.plan === 'pro' ? S.planFees().pro : S.planFees().classic); } },
          { label: 'الطلاب', render: function (r) { return String(r.students); } }
        ], rows: d.perSchool, empty: 'لا مدارس بعد.'
      })])
    ];
  }

  /* ------------------------------------------------------------ إدارة المنصة */
  function platformView() {
    var slot = h('div');
    if (legacyFn) { try { legacyFn(slot); } catch (e) { slot.appendChild(h('div', { class: 'muted', text: 'تعذّر عرض أدوات الإدارة: ' + e.message })); } }
    return [UI.panel('إدارة المنصة', 'التحكم بالمدارس وحسابات الطلاب والباقات وإعادة التهيئة', null, [slot])];
  }

  /** أدوات الإدارة والمدارس (المحتوى القديم كاملًا) — ظاهرة في الرئيسية كما طلب المالك */
  function toolsPanel() {
    var slot = h('div');
    if (legacyFn) { try { legacyFn(slot); } catch (e) { slot.appendChild(h('div', { class: 'muted', text: 'تعذّر عرض أدوات الإدارة: ' + e.message })); } }
    return UI.panel('إدارة المنصة والمدارس', 'التحكم بكل مدرسة وحسابات الطلاب والباقات والاشتراكات وإعادة التهيئة', null, [
      h('div', { class: 'callout info', text: 'اختر مدرسة ثم أوقف/فعّل دخولها أو أوقف حسابات طلابها — وكل قرار يُقيّد في سجل التدقيق.' }),
      slot
    ]);
  }

  /* ------------------------------------------------------------ الرسم */
  function draw() {
    if (!hostRef) return;
    clear(hostRef);
    var d = S.platformDashboard();
    var nav = h('div', { class: 'ctl-nav' }, [
      h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: '⟵ لوحة التحكم', onClick: function () { state.view = 'home'; state.schoolId = ''; state.picked = {}; draw(); } }),
      h('span', { class: 'muted', text: ({ home: 'نظرة عامة', schools: 'المدارس', users: 'المستخدمون', students: 'الطلاب', passwords: 'كلمات المرور', finance: 'الاشتراكات والمالية', platform: 'إدارة المنصة' })[state.view] || '' })
    ]);
    var body = state.view === 'schools' ? schoolsView(d)
      : state.view === 'users' ? usersView(d)
      : state.view === 'students' ? studentsView(d)
      : state.view === 'passwords' ? passwordsView(d)
      : state.view === 'finance' ? financeView(d)
      : home(d);
    if (state.view !== 'home') hostRef.appendChild(nav);
    body.forEach(function (el) { hostRef.appendChild(el); });
  }

  App.controlPanel = function (view, legacy) {
    legacyFn = legacy || legacyFn;
    hostRef = h('div', { class: 'stack' });
    view.appendChild(hostRef);
    draw();
  };
  void App;
})();
