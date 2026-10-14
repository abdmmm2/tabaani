/* =============================================================================
   users.js — إدارة المستخدمين (مشرف المنصة)
   إضافة مستخدم · تعطيل/تفعيل · تغيير الدور · إعادة تعيين كلمة المرور ·
   توليد كلمات مرور مختلفة لكل حساب حقيقي عند التسليم (مع كشف قابل للطباعة والتصدير).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  function roleName(u) { return S.roleLabel(u.role, u.schoolId); }
  function schoolName(id) { var sc = S.school(id); return sc ? sc.name : (id ? id : '—'); }
  function statusBadge(st) {
    var tone = st === 'active' ? 'ok' : (st === 'pending' ? 'warn' : 'bad');
    return UI.badge(S.userStatuses[st] || st, tone);
  }

  App.register({
    id: 'users',
    label: 'إدارة المستخدمين',
    icon: '&#128100;',
    roles: ['super'],
    render: function (view) {
      var state = { q: '', role: '', status: '', kind: '', schoolId: '' };
      var host = h('div');
      function redraw() { clear(host); draw(); }

      /* -------------------------------- نموذج المستخدم -------------------------------- */
      function userEditor(user, presetRole) {
        var isNew = !user;
        var cur = user || { role: presetRole || 'teacher', status: 'active', schoolId: S.list('schools')[0] ? S.list('schools')[0].id : '' };
        var f = {
          name: UI.field({ name: 'uName', label: 'الاسم الكامل', required: true, value: cur.name || '', half: true }),
          username: UI.field({ name: 'uUser', label: 'اسم المستخدم (للدخول)', required: true, value: cur.username || '', half: true, help: 'بالإنجليزية/أرقام بلا مسافات.' }),
          role: UI.field({ name: 'uRole', label: 'الدور', type: 'select', required: true, half: true,
            options: S.rolesList().map(function (r) { return { value: r.id, label: r.name }; }), value: cur.role }),
          school: UI.field({ name: 'uSchool', label: 'المدرسة', type: 'select', half: true,
            options: [{ value: '', label: '— بلا مدرسة (المشرف العام) —' }].concat(S.list('schools').map(function (sc) { return { value: sc.id, label: sc.name }; })), value: cur.schoolId || '' }),
          email: UI.field({ name: 'uEmail', label: 'البريد الإلكتروني', type: 'email', half: true, value: cur.email || '' }),
          phone: UI.field({ name: 'uPhone', label: 'الجوال', half: true, value: cur.phone || '', help: 'يُستخدم لتنبيهات تلقرام.' }),
          password: UI.field({ name: 'uPass', label: isNew ? 'كلمة المرور (اتركها فارغة ليُولّدها النظام)' : 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)', half: true }),
          status: UI.field({ name: 'uStatus', label: 'حالة الحساب', type: 'select', half: true,
            options: Object.keys(S.userStatuses).map(function (k) { return { value: k, label: S.userStatuses[k] }; }), value: cur.status || 'active' })
        };
        var mustChange = h('input', { type: 'checkbox', checked: cur.mustChange !== false });
        var generated = null;

        var m = UI.modal({
          title: isNew ? 'إضافة مستخدم جديد' : 'تعديل المستخدم',
          wide: true,
          body: [
            h('div', { class: 'grid-2-app' }, [f.name.wrap, f.username.wrap, f.role.wrap, f.school.wrap, f.email.wrap, f.phone.wrap, f.password.wrap, f.status.wrap]),
            h('label', { class: 'checkline' }, [mustChange, h('span', { text: 'إلزامه بتغيير كلمة المرور عند أول دخول' })]),
            h('p', { class: 'muted-block', style: { marginTop: '10px', fontSize: 'var(--fs-xs)' },
              text: 'ملاحظة: هذا نموذج أولي — كلمات المرور تُخزَّن داخل المتصفح (localStorage) بلا تشفير. في الإنتاج تُخزَّن مُشفَّرة (hash) على الخادم.' }),
            h('div', { class: 'callout muted-block', style: { marginTop: '10px', fontSize: 'var(--fs-xs)' },
              text: 'تبديل الدور يغيّر ما يراه المستخدم فورًا في القائمة الجانبية وصفحاته المسموحة.' })
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            { label: isNew ? 'إضافة المستخدم' : 'حفظ التعديلات', class: 'btn-primary', onClick: function (close) {
              var data = {
                name: f.name.input.value.trim(), username: f.username.input.value.trim(),
                role: f.role.input.value, schoolId: f.school.input.value || null,
                email: f.email.input.value.trim(), phone: f.phone.input.value.trim(),
                status: f.status.input.value, mustChange: mustChange.checked
              };
              if (isNew) {
                if (f.password.input.value.trim()) data.password = f.password.input.value.trim();
                var r = S.addUser(data);
                if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                generated = r.user.password;
                UI.toast('أُضيف «' + r.user.name + '» — كلمة المرور: ' + generated, 'ok');
              } else {
                var up = S.updateUser(cur.id, data);
                if (!up.ok) { UI.toast(up.error, 'bad'); return; }
                if (f.password.input.value.trim()) {
                  var rp = S.resetUserPassword(cur.id, f.password.input.value.trim());
                  if (!rp.ok) { UI.toast(rp.error, 'bad'); return; }
                }
                UI.toast('حُفظت بيانات «' + up.user.name + '»', 'ok');
              }
              close(); redraw();
            } }
          ]
        });
        void m;
        void generated;
      }

      /* --------------------------- كشف كلمات المرور المولَّدة --------------------------- */
      function passwordsSheet(rows) {
        if (!rows || !rows.length) { UI.toast('لا توجد حسابات في هذا النطاق', 'warn'); return; }
        var table = UI.table({
          cols: [
            { key: 'name', label: 'الاسم' }, { key: 'username', label: 'اسم المستخدم' },
            { key: 'role', label: 'الدور' }, { key: 'school', label: 'المدرسة' },
            { key: 'password', label: 'كلمة المرور المؤقتة' }
          ],
          rows: rows.map(function (r) {
            return { name: r.name, username: r.username, role: r.role, school: schoolName(r.schoolId), password: r.password };
          })
        });
        UI.modal({
          title: 'كلمات المرور المولَّدة (' + rows.length + ' حسابًا)',
          wide: true,
          body: [
            h('p', { class: 'muted', text: 'كل حساب له كلمة مرور مختلفة. سلّم كل مستخدم كلمته، وسيُطلب منه تغييرها عند أول دخول.' }),
            table,
            h('div', { class: 'callout', style: { marginTop: '10px' },
              text: 'احفظ الكشف في مكان آمن — لا يمكن استرجاع هذه الكلمات من المنصة بعد إغلاق النافذة إلا بإعادة التوليد.' })
          ],
          actions: [
            { label: 'تنزيل CSV', class: 'btn-outline', onClick: function () {
              UI.downloadCsv(rows.map(function (r) {
                return { 'الاسم': r.name, 'اسم المستخدم': r.username, 'الدور': r.role, 'المدرسة': schoolName(r.schoolId), 'كلمة المرور': r.password, 'الجوال': r.phone || '' };
              }), 'كلمات-مرور-الحسابات.csv');
            } },
            { label: 'طباعة كشف بالتوقيعات', class: 'btn-soft', onClick: function () {
              UI.printReport({
                type: 'passwords', title: 'كشف كلمات مرور الحسابات',
                subtitle: 'يُسلَّم لجهة التسليم — يُرجى حفظه في مكان آمن',
                meta: [{ label: 'عدد الحسابات', value: String(rows.length) }, { label: 'أُعدّ بواسطة', value: S.session.name }],
                sections: [{
                  heading: 'الحسابات وكلمات المرور المؤقتة',
                  table: { cols: ['م', 'الاسم', 'اسم المستخدم', 'الدور', 'كلمة المرور'], rows: rows.map(function (r, i) { return [i + 1, r.name, r.username, r.role, r.password]; }) },
                  text: 'ملاحظة: يلزم كل مستخدم تغيير كلمة مروره عند أول دخول.'
                }],
                signatures: ['أعدّ الكشف', 'مدير المدرسة', 'مدير عام المنصة']
              });
            } },
            { label: 'تم', class: 'btn-primary', onClick: function (close) { close(); } }
          ]
        });
      }

      /* --------------------------------- الرسم --------------------------------- */
      function draw() {
        var all = S.usersQuery({});
        var users = S.usersQuery(state);
        var counts = {
          total: all.length,
          staff: all.filter(function (u) { return u.role !== 'student'; }).length,
          students: all.filter(function (u) { return u.role === 'student'; }).length,
          pending: all.filter(function (u) { return u.status === 'pending'; }).length,
          off: all.filter(function (u) { return u.status !== 'active'; }).length
        };

        host.appendChild(h('div', { class: 'grid-3-app' }, [
          UI.statCard('إجمالي الحسابات', String(counts.total), counts.staff + ' موظفًا · ' + counts.students + ' طالبًا'),
          UI.statCard('بانتظار الاعتماد', String(counts.pending), counts.pending ? 'تحتاج قرارًا' : 'لا طلبات معلّقة'),
          UI.statCard('غير نشط', String(counts.off), 'موقوفة أو معطَّلة')
        ]));

        /* توليد كلمات المرور عند التسليم */
        host.appendChild(UI.panel('تسليم الحسابات: كلمات مرور مختلفة لكل حساب', 'يولّد كلمة مرور قوية مختلفة لكل حساب حقيقي، ويُلزم أصحابها بتغييرها عند أول دخول.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'توليد لكلم الحسابات', onClick: function () {
            UI.confirm('سيُغيَّر كلمة المرور لكل الحسابات (' + counts.total + ') إلى كلمات مختلفة عشوائية، وتُلزَم بتغييرها عند أول دخول. متابعة؟', { ok: 'توليد الكل' })
              .then(function (ok) {
                if (!ok) return;
                var rows = S.generatePasswords({});
                UI.toast('وُلّدت كلمات مرور لـ ' + rows.length + ' حسابًا', 'ok');
                passwordsSheet(rows); redraw();
              });
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'الموظفون فقط', onClick: function () {
            var rows = S.generatePasswords({ kind: 'staff' });
            UI.toast('وُلّدت كلمات مرور لـ ' + rows.length + ' حسابًا', 'ok');
            passwordsSheet(rows); redraw();
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'الطلاب فقط', onClick: function () {
            var rows = S.generatePasswords({ kind: 'students' });
            UI.toast('وُلّدت كلمات مرور لـ ' + rows.length + ' حسابًا', 'ok');
            passwordsSheet(rows); redraw();
          } }),
          h('button', { class: 'btn btn-soft', type: 'button', text: 'عرض آخر كشف', onClick: function () {
            passwordsSheet(S.lastGeneratedPasswords());
          } })
        ], [
          h('div', { class: 'callout', text: 'الحساب الحالي (حسابك) لا تُغيَّر كلمته تلقائيًا — استخدم «إعادة تعيين كلمة المرور» من جدول المستخدمين إن أردت.' })
        ]));

        /* الإضافة + الفلاتر */
        host.appendChild(UI.panel('المستخدمون (' + users.length + ' من ' + all.length + ')', 'إضافة، تعطيل/تفعيل، تغيير الدور، وإعادة تعيين كلمة المرور.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة مستخدم', onClick: function () { userEditor(null); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'إضافة مدير مدرسة', onClick: function () { userEditor(null, 'principal'); } })
        ], [
          h('div', { class: 'toolbar' }, [
            UI.field({ name: 'q', label: 'بحث', value: state.q, onInput: function (e) { state.q = e.target.value; redraw(); } }).wrap,
            UI.field({ name: 'frole', label: 'الدور', type: 'select',
              options: [{ value: '', label: 'كل الأدوار' }].concat(S.rolesList().map(function (r) { return { value: r.id, label: r.name }; })),
              value: state.role, onChange: function (e) { state.role = e.target.value; redraw(); } }).wrap,
            UI.field({ name: 'fstatus', label: 'الحالة', type: 'select',
              options: [{ value: '', label: 'كل الحالات' }].concat(Object.keys(S.userStatuses).map(function (k) { return { value: k, label: S.userStatuses[k] }; })),
              value: state.status, onChange: function (e) { state.status = e.target.value; redraw(); } }).wrap,
            UI.field({ name: 'fkind', label: 'النوع', type: 'select',
              options: [{ value: '', label: 'الكل' }, { value: 'staff', label: 'موظفون' }, { value: 'students', label: 'طلاب' }],
              value: state.kind, onChange: function (e) { state.kind = e.target.value; redraw(); } }).wrap,
            UI.field({ name: 'fschool', label: 'المدرسة', type: 'select',
              options: [{ value: '', label: 'كل المدارس' }].concat(S.list('schools').map(function (sc) { return { value: sc.id, label: sc.name }; })),
              value: state.schoolId, onChange: function (e) { state.schoolId = e.target.value; redraw(); } }).wrap
          ]),
          users.length ? UI.table({
            cols: [
              { key: 'name', label: 'الاسم' },
              { key: 'username', label: 'اسم المستخدم' },
              { key: 'roleLabel', label: 'الدور' },
              { key: 'schoolName', label: 'المدرسة' },
              { key: 'statusBadge', label: 'الحالة' },
              { key: 'phone', label: 'الجوال' },
              { key: 'actions', label: 'إجراءات', align: 'start' }
            ],
            rows: users.map(function (u) {
              var isActive = u.status === 'active';
              return {
                name: u.name + (u.mustChange ? ' · يلزم تغيير كلمة المرور' : ''),
                username: u.username, roleLabel: roleName(u), schoolName: schoolName(u.schoolId),
                statusBadge: statusBadge(u.status), phone: u.phone || '—',
                actions: h('div', { class: 'cluster' }, [
                  h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { userEditor(u); } }),
                  h('button', { class: 'mini-btn', type: 'button', text: 'تغيير الدور', onClick: function () {
                    var sel = h('select', { class: 'input' }, S.rolesList().map(function (r) {
                      return h('option', { value: r.id, selected: r.id === u.role, text: r.name });
                    }));
                    UI.modal({
                      title: 'تغيير دور «' + u.name + '»', body: [
                        h('p', { class: 'muted', text: 'الدور الحالي: ' + roleName(u) }),
                        h('div', { class: 'field' }, [h('label', { text: 'الدور الجديد' }), sel])
                      ],
                      actions: [
                        { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
                        { label: 'حفظ الدور', class: 'btn-primary', onClick: function (close) {
                          var r = S.updateUser(u.id, { role: sel.value });
                          if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                          UI.toast('صار دور «' + u.name + '»: ' + S.roleLabel(sel.value, u.schoolId), 'ok');
                          close(); redraw();
                        } }
                      ]
                    });
                  } }),
                  h('button', { class: 'mini-btn' + (isActive ? ' is-danger' : ''), type: 'button',
                    text: isActive ? 'تعطيل' : 'تفعيل', onClick: function () {
                      var r = S.setUserStatus(u.id, isActive ? 'suspended' : 'active');
                      if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                      UI.toast(isActive ? 'عُطِّل حساب «' + u.name + '»' : 'فُعِّل حساب «' + u.name + '»', isActive ? 'warn' : 'ok');
                      redraw();
                    } }),
                  h('button', { class: 'mini-btn', type: 'button', text: 'كلمة مرور', onClick: function () {
                    UI.confirm('إعادة تعيين كلمة مرور «' + u.name + '» بكلمة عشوائية جديدة؟', { ok: 'إعادة التعيين' }).then(function (ok) {
                      if (!ok) return;
                      var r = S.resetUserPassword(u.id);
                      if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                      passwordsSheet([{ id: u.id, name: u.name, username: u.username, role: roleName(u), schoolId: u.schoolId, password: r.password, phone: u.phone }]);
                      redraw();
                    });
                  } }),
                  h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                    UI.confirm('حذف حساب «' + u.name + '» نهائيًا؟', { ok: 'حذف', danger: true }).then(function (ok) {
                      if (!ok) return;
                      var r = S.removeUser(u.id);
                      if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                      UI.toast('حُذف الحساب', 'warn'); redraw();
                    });
                  } })
                ])
              };
            })
          }) : UI.empty('لا مستخدمين مطابقين للتصفية.')
        ]));

        host.appendChild(UI.panel('ملاحظات أمنية قبل التسليم', null, null, [
          h('ul', { class: 'promo-steps' }, [
            h('li', { text: 'ولّد كلمات مرور لكل حساب عند التسليم، وسلّم كل مستخدم كلمته من الكشف.' }),
            h('li', { text: 'أوقفت حسابات؟ فعّلها فقط عند الحاجة (الطلاب يمكن إيقافهم جماعيًا من «إدارة الحسابات»).' }),
            h('li', { text: 'بدّل كلمة مرور المشرف العام بعد التسليم فورًا.' }),
            h('li', { text: 'في الإنتاج: تحقق ثنائي (2FA) + تشفير كلمات المرور على الخادم + سجل تدقيق للعمليات.' })
          ])
        ]));
      }

      draw();
      view.appendChild(host);
    }
  });
})();
