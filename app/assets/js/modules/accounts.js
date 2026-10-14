/* =============================================================================
   accounts.js — إدارة الحسابات: تفعيل/إيقاف حسابات الطلاب جماعيًا وفرديًا،
   وحسابات الموظفين، وطلبات الاعتماد. (مدير المدرسة ووكيل شؤون الطلاب)
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var ROLE_NAME = function (id) { return S.roleLabel(id); };
  var STATUS = {
    active: { label: 'نشط', tone: 'mint' },
    suspended: { label: 'موقوف', tone: 'amber' },
    disabled: { label: 'موقوف', tone: 'amber' },
    pending: { label: 'بانتظار الاعتماد', tone: 'plain' }
  };
  function statusBadge(u) {
    var s = STATUS[u.status] || STATUS.active;
    return UI.badge(s.label, u.status === 'pending' ? 'plain' : (u.status === 'active' ? 'mint' : 'amber'));
  }

  App.register({
    id: 'accounts',
    label: 'إدارة الحسابات',
    icon: '&#128101;',
    roles: ['principal', 'deputy'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var state = { tab: 'students', classId: '', status: '', selected: {} };

      /* ------------------------------- البطاقات ------------------------------- */
      var students = S.studentAccounts({});
      var staff = S.list('users', { schoolId: schoolId }).filter(function (u) { return u.role !== 'student'; });
      var pending = S.list('users', { schoolId: schoolId }).filter(function (u) { return u.status === 'pending'; });
      view.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('إجمالي الحسابات', String(students.length + staff.length)),
        UI.statCard('حسابات الطلاب', String(students.length), students.filter(function (s) { return s.status === 'active'; }).length + ' نشط'),
        UI.statCard('حسابات موقوفة', String(students.filter(function (s) { return s.status !== 'active'; }).length + staff.filter(function (s) { return s.status !== 'active'; }).length),
          null, students.some(function (s) { return s.status !== 'active'; }) ? 'gold' : null),
        UI.statCard('بانتظار الاعتماد', String(pending.length), pending.length ? 'يحتاج قرارك' : 'لا طلبات')
      ]));

      var tabs = UI.tabs([
        { key: 'students', label: 'حسابات الطلاب' },
        { key: 'staff', label: 'حسابات الموظفين' },
        { key: 'pending', label: 'طلبات الاعتماد' + (pending.length ? ' (' + pending.length + ')' : '') }
      ], function (k) { state.tab = k; paint(); });

      var body = h('div');
      view.appendChild(UI.panel('إدارة الحسابات', 'تفعيل وإيقاف الحسابات — حسابات الطلاب يمكن إيقافها أو تفعيلها كلها بضغطة واحدة.', null, [tabs, body]));

      function paint() {
        clear(body);
        if (state.tab === 'students') body.appendChild(studentsTab());
        else if (state.tab === 'staff') body.appendChild(staffTab());
        else body.appendChild(pendingTab());
      }

      /* ---------------------------- حسابات الطلاب ---------------------------- */
      function studentsTab() {
        var classOpts = [{ value: '', label: 'كل الفصول' }].concat(S.list('classes', { schoolId: schoolId }).map(function (k) { return { value: k.id, label: k.name }; }));
        var statusOpts = [{ value: '', label: 'كل الحالات' }, { value: 'active', label: 'النشطة' }, { value: 'suspended', label: 'الموقوفة' }, { value: 'pending', label: 'بانتظار الاعتماد' }];

        var classSel = h('select', { class: 'input', onchange: function (e) { state.classId = e.target.value; state.selected = {}; paint(); } },
          classOpts.map(function (o) { return h('option', { value: o.value, text: o.label, selected: state.classId === o.value }); }));
        var statusSel = h('select', { class: 'input', onchange: function (e) { state.status = e.target.value; paint(); } },
          statusOpts.map(function (o) { return h('option', { value: o.value, text: o.label, selected: state.status === o.value }); }));

        var rows = S.studentAccounts({ classId: state.classId || undefined, status: state.status || undefined });
        var selectedIds = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });

        var toolbar = h('div', { class: 'panel-actions', style: { marginBottom: '12px' } }, [
          h('div', { class: 'field', style: { minWidth: '190px' } }, [h('label', { text: 'الفصل' }), classSel]),
          h('div', { class: 'field', style: { minWidth: '160px' } }, [h('label', { text: 'الحالة' }), statusSel]),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تفعيل كل الطلاب' + (state.classId ? ' في الفصل' : ''), onClick: function () { bulk('activate'); } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إيقاف كل الطلاب' + (state.classId ? ' في الفصل' : ''), onClick: function () { bulk('suspend'); } }),
          h('button', {
            class: 'btn btn-soft btn-sm', type: 'button', disabled: !selectedIds.length,
            text: 'عكس حالة المحدّدين (' + selectedIds.length + ')', onClick: function () {
              var anyActive = rows.some(function (r) { return state.selected[r.id] && r.status === 'active'; });
              run(anyActive ? 'suspend' : 'activate', { ids: selectedIds });
            }
          }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: function () {
            UI.downloadCsv(rows.map(function (r) { return { 'الاسم': r.studentName || r.name, 'الفصل': r.className, 'اسم المستخدم': r.username, 'الحالة': (STATUS[r.status] || {}).label || r.status, 'الجوال': r.phone || '' }; }), 'حسابات-الطلاب.csv');
          } })
        ]);

        function bulk(action) {
          var scope = state.classId ? (S.klass(state.classId) || {}).name : 'كل الفصول';
          UI.confirm((action === 'activate' ? 'تفعيل' : 'إيقاف') + ' كل حسابات الطلاب في: ' + scope + '؟', { ok: action === 'activate' ? 'تفعيل الكل' : 'إيقاف الكل', danger: action !== 'activate' })
            .then(function (ok) {
              if (!ok) return;
              run(action, { classId: state.classId || undefined });
            });
        }
        function run(action, opts) {
          var res = S.setStudentAccounts(action, opts || {});
          UI.toast((action === 'activate' ? 'فُعّل ' : 'أُوقف ') + res.changed + ' من ' + res.total + ' حسابًا', res.changed ? 'ok' : 'warn');
          state.selected = {};
          paint();
          App.refreshBadges();
        }

        var table = UI.table({
          cols: [
            { label: '', width: '38px', render: function (r) {
              return h('input', { type: 'checkbox', checked: !!state.selected[r.id], onchange: function (e) { state.selected[r.id] = e.target.checked; paint(); } });
            } },
            { label: 'الطالب', render: function (r) { return h('strong', { style: { fontWeight: '500' }, text: r.studentName || r.name }); } },
            { label: 'الفصل', key: 'className' },
            { label: 'اسم المستخدم', render: function (r) { return h('code', { text: r.username || '—' }); } },
            { label: 'الجوال', render: function (r) { return r.phone || '—'; } },
            { label: 'الحالة', render: function (r) { return statusBadge(r); } },
            { label: 'إجراء', class: 'row-actions', render: function (r) {
              var active = r.status === 'active';
              return h('button', {
                class: 'mini-btn' + (active ? ' is-danger' : ' is-primary'), type: 'button',
                text: active ? 'إيقاف' : 'تفعيل',
                onClick: function () { run(active ? 'suspend' : 'activate', { ids: [r.id] }); }
              });
            } }
          ], rows: rows, empty: 'لا توجد حسابات طلاب مطابقة للتصفية.'
        });

        return h('div', {}, [
          toolbar,
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginBottom: '10px' } },
            ['الحساب الموقوف لا يستطيع الدخول، وتظهر له رسالة «الحساب موقوف — راجع مدير المدرسة». عدد المعروض: ', h('strong', { text: String(rows.length) })]),
          table
        ]);
      }

      /* ---------------------------- حسابات الموظفين ---------------------------- */
      function staffTab() {
        var list = S.list('users', { schoolId: schoolId }).filter(function (u) { return u.role !== 'student'; });
        return h('div', {}, [
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginBottom: '10px' }, text: 'حسابات المدير والوكلاء والتوجيه والمعلمين ومسؤولي الخدمات — يمكن إيقاف أي حساب أو تفعيله.' }),
          UI.table({
            cols: [
              { label: 'الاسم', render: function (u) { return h('strong', { style: { fontWeight: '500' }, text: u.name }); } },
              { label: 'الدور', render: function (u) { return UI.badge(ROLE_NAME(u.role), 'plain'); } },
              { label: 'اسم المستخدم', render: function (u) { return h('code', { text: u.username || '—' }); } },
              { label: 'البريد', render: function (u) { return u.email || '—'; } },
              { label: 'الحالة', render: function (u) { return statusBadge(u); } },
              { label: 'إجراء', class: 'row-actions', render: function (u) {
                if (u.role === 'principal' && u.id === S.session.userId) return h('span', { class: 'muted', text: 'حسابك' });
                var active = u.status === 'active';
                return h('button', {
                  class: 'mini-btn' + (active ? ' is-danger' : ' is-primary'), type: 'button', text: active ? 'إيقاف' : 'تفعيل',
                  onClick: function () {
                    S.update('users', u.id, { status: active ? 'suspended' : 'active', canLogin: !active, statusChangedAt: S.now(), statusChangedBy: S.session.name });
                    UI.toast((active ? 'أُوقف ' : 'فُعّل ') + u.name, 'ok'); paint();
                  }
                });
              } }
            ], rows: list, empty: 'لا حسابات.'
          })
        ]);
      }

      /* ---------------------------- طلبات الاعتماد ---------------------------- */
      function pendingTab() {
        var list = S.list('users', { schoolId: schoolId }).filter(function (u) { return u.status === 'pending'; });
        if (!list.length) return UI.empty('لا توجد طلبات حساب بانتظار الاعتماد.');
        return UI.table({
          cols: [
            { label: 'الاسم', render: function (u) { return h('strong', { style: { fontWeight: '500' }, text: u.name }); } },
            { label: 'الدور المطلوب', render: function (u) { return ROLE_NAME(u.role); } },
            { label: 'اسم المستخدم', render: function (u) { return h('code', { text: u.username }); } },
            { label: 'البريد', render: function (u) { return u.email || '—'; } },
            { label: 'الجوال', render: function (u) { return u.phone || '—'; } },
            { label: 'إجراء', class: 'row-actions', render: function (u) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn is-primary', type: 'button', text: 'اعتماد', onClick: function () {
                  S.approveAccount(u.id); UI.toast('اعتُمد حساب ' + u.name, 'ok'); paint(); App.refreshBadges();
                } }),
                h('button', { class: 'mini-btn is-danger', type: 'button', text: 'رفض', onClick: function () {
                  UI.confirm('رفض وحذف طلب حساب ' + u.name + '؟', { ok: 'رفض', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.remove('users', u.id); UI.toast('رُفض الطلب', 'warn'); paint();
                  });
                } })
              ]);
            } }
          ], rows: list, empty: 'لا طلبات.'
        });
      }

      paint();
    }
  });
})();
