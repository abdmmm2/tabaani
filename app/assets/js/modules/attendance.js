/* =============================================================================
   attendance.js — وحدة التحضير (المعلم)
   ---------------------------------------------------------------------------
   الرحلة: يختار المعلم الفصل/المادة/الحصة/التاريخ ← يفتح التحضير ← يضبط حالة كل
   طالب (حاضر/متأخر/غائب/بعذر) ← يُغلق التحضير (لا يُسمح قبل منتصف الحصة أو
   نهايتها حسب قاعدة الوكيل) ← يُرسَل تقرير للوكيل ومدير المدرسة + رسالة تلقرام.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var STATUS = [
    { id: 'present', label: 'حاضر', cls: 'is-present' },
    { id: 'late', label: 'متأخر', cls: 'is-late' },
    { id: 'absent', label: 'غائب', cls: 'is-absent' },
    { id: 'excused', label: 'بعذر', cls: 'is-excused' }
  ];
  var LABEL = { present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'بعذر' };

  App.register({
    id: 'attendance',
    label: 'التحضير',
    icon: '&#10003;',
    roles: ['teacher'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var teacherId = S.session.userId;
      var me = S.user(teacherId) || {};
      /* لا تظهر للمعلم إلا الفصول التي ثبّتها وكيل شؤون الطلاب */
      var assignments = S.lockedAssignmentsOf(teacherId);

      /* ------------------------------------------------ اختيار الفصل والحصة */
      var title = S.school(schoolId) ? { name: '' } : null; void title;
      var classSel = UI.field({
        name: 'class', label: 'الفصل', type: 'select', required: true,
        options: assignments.map(function (a) {
          var k = S.klass(a.classId) || {};
          return { value: a.id, label: k.name + ' — ' + a.subject };
        }),
        placeholder: assignments.length ? 'اختر الإسناد' : 'لا إسنادات لك بعد — راجع الوكيل'
      });
      var periodSel = UI.field({
        name: 'period', label: 'الحصة', type: 'select', required: true,
        options: S.periodsOf(schoolId).map(function (p) {
          return { value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ') · إغلاق: ' + (p.closeRule === 'mid' ? 'منتصف الحصة' : 'نهاية الحصة') };
        })
      });
      var dateInp = UI.field({ name: 'date', label: 'التاريخ', type: 'date', value: UI.today(), required: true });

      var board = h('div');
      var state = { session: null, records: [] };

      function currentAssignment() { return assignments.find(function (a) { return a.id === classSel.input.value; }); }

      /* ------------------------------------------------------------- اللوحة */
      function openBoard(auto) {
        var asg = currentAssignment();
        var pid = periodSel.input.value, date = dateInp.input.value;
        if (!asg || !pid || !date) { if (!auto) UI.toast('اختر الإسناد والحصة والتاريخ', 'warn'); return; }
        var cls = S.klass(asg.classId);
        var period = S.period(pid);
        var students = S.studentsOf(asg.classId);

        state.session = S.sessionFor(asg.classId, pid, date) || S.openSession({
          classId: asg.classId, subject: asg.subject, teacherId: S.session.userId, periodId: pid, date: date
        });
        /* تهيئة السجلات */
        var existing = {};
        (state.session.records || []).forEach(function (r) { existing[r.studentId] = r; });
        state.records = students.map(function (st) {
          return { studentId: st.id, name: st.name, seat: st.seat, status: (existing[st.id] || {}).status || 'present', note: (existing[st.id] || {}).note || '' };
        });

        drawBoard(cls, period, students.length);
      }

      function counters() {
        return {
          present: state.records.filter(function (r) { return r.status === 'present'; }).length,
          late: state.records.filter(function (r) { return r.status === 'late'; }).length,
          absent: state.records.filter(function (r) { return r.status === 'absent'; }).length,
          excused: state.records.filter(function (r) { return r.status === 'excused'; }).length
        };
      }

      function drawBoard(cls, period, total) {
        clear(board);
        var win = S.closeWindow(period, dateInp.input.value + 'T' + new Date().toTimeString().slice(0, 8));
        var closed = state.session.status === 'closed';
        var c = counters();

        board.appendChild(UI.panel(
          cls.name + ' — ' + state.session.subject,
          'الحصة ' + period.index + ' · ' + period.start + '—' + period.end + ' · ' + UI.fmtDate(dateInp.input.value),
          [
            h('span', { class: 'chip ' + (closed ? 'chip-mint' : (win.allowed ? 'chip-amber' : 'chip-plain')),
              text: closed ? 'مُغلق ومُرسل' : (win.allowed ? 'جاهز للإغلاق' : 'مفتوح — يُقفل بعد ' + win.limitLabel) }),
            UI.reportButton(function () {
              var rows = state.records.map(function (r) { return [r.seat, r.name, LABEL[r.status], r.note || '—']; });
              var rep = S.registerReport('attendance', state.session.id, { title: 'تقرير تحضير — ' + cls.name + ' / ' + state.session.subject });
              return {
                type: 'attendance', refId: state.session.id, code: rep.code,
                title: 'تقرير حضور وغياب الطلاب', subtitle: cls.name + ' — ' + state.session.subject,
                meta: [
                  { label: 'المعلم', value: S.session.name },
                  { label: 'الصف والفصل', value: cls.name },
                  { label: 'المادة', value: state.session.subject },
                  { label: 'الحصة', value: period.label + ' (' + period.start + ' — ' + period.end + ')' },
                  { label: 'التاريخ', value: UI.fmtDate(dateInp.input.value) + ' — ' + UI.greg(new Date(dateInp.input.value)) },
                  { label: 'الحالة', value: closed ? 'مُغلق' : 'قيد التحضير' },
                  { label: 'الملخّص', value: 'حاضر ' + c.present + ' · متأخر ' + c.late + ' · غائب ' + c.absent + ' · بعذر ' + c.excused }
                ],
                sections: [{ heading: 'كشف التحضير', table: { cols: ['م', 'اسم الطالب', 'الحالة', 'ملاحظة'], rows: rows } }]
              };
            }, { label: 'طباعة الكشف', class: 'btn-outline' })
          ],
          state.records.map(function (r, idx) {
            var group = h('div', { class: 'att-status' }, STATUS.map(function (s) {
              return h('button', {
                class: 'att-btn ' + s.cls + (r.status === s.id ? ' is-active' : ''), type: 'button', text: s.label,
                disabled: closed,
                onClick: function () {
                  r.status = s.id;
                  S.saveAttendance(state.session.id, state.records);
                  drawBoard(cls, period, total);
                }
              });
            }));
            return h('div', { class: 'att-row', style: { display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: '10px', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' } }, [
              h('span', { class: 'muted nums', text: String(r.seat) }),
              h('strong', { style: { fontWeight: '500' }, text: r.name }),
              group
            ]);
          })
        ));

        /* الملخّص والإغلاق */
        var summary = h('div', { class: 'stat-row' }, [
          UI.statCard('حاضر', String(c.present)),
          UI.statCard('متأخر', String(c.late)),
          UI.statCard('غائب', String(c.absent), null, c.absent ? 'gold' : null),
          UI.statCard('بعذر', String(c.excused))
        ]);
        board.appendChild(summary);

        var closeBtn = h('button', {
          class: 'btn btn-primary', type: 'button', text: closed ? 'التحضير مُغلق' : 'إغلاق التحضير وإرسال التقارير',
          disabled: closed || !win.allowed,
          onClick: function () {
            UI.confirm('بعد الإغلاق يُرسل التقرير لوكيل شؤون الطلاب ومدير المدرسة + رسالة تلقرام. متابعة؟', { ok: 'إغلاق وإرسال' }).then(function (ok) {
              if (!ok) return;
              S.saveAttendance(state.session.id, state.records);
              S.closeSession(state.session.id);
              UI.toast('أُغلق التحضير وأُرسلت التقارير', 'ok');
              App.go('attendance-reports');
            });
          }
        });
        var note = closed
          ? h('span', { class: 'chip chip-mint', text: 'أُرسل إلى: وكيل شؤون الطلاب · مدير المدرسة' })
          : h('span', { class: 'muted', text: win.allowed
            ? 'يمكن الإغلاق الآن (' + win.limitLabel + ').'
            : 'لا يمكن الإغلاق قبل ' + win.limit.toTimeString().slice(0, 5) + ' (' + win.limitLabel + ').' });

        board.appendChild(UI.panel('الإغلاق والإرسال', null, null, [
          h('div', { class: 'between' }, [
            h('div', { class: 'stack-sm' }, [note, h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'قاعدة الإغلاق يضبطها وكيل شؤون الطلاب في «جدول الحصص».' })]),
            closeBtn
          ]),
          h('div', { class: 'muted-block mt-4', text: 'ملاحظة: تُسجَّل حالة كل طالب لحظيًا؛ وبعد الإغلاق تتحوّل الشاشة إلى وضع القراءة، ويظهر التقرير في «تقارير التحضير» لدى الوكيل والإدارة.' })
        ]));
      }

      /* ------------------------------------------------------------ التجميع */
      if (!me.locked) {
        view.appendChild(UI.panel('بانتظار تثبيت وكيل شؤون الطلاب', null, null, [
          h('div', { class: 'muted-block' },
            [h('strong', { text: 'لم يُثبّت الوكيل إسنادك بعد. ' }),
             h('span', { text: 'يختار مدير المدرسة فصولك وموادك، ثم يثبّتها وكيل شؤون الطلاب — وبعدها تظهر فصولك هنا فقط. راجع الوكيل إن تأخّر التثبيت.' })])
        ]));
      } else if (!assignments.length) {
        view.appendChild(UI.panel('لا توجد فصول مُثبّتة', null, null, [
          h('div', { class: 'muted-block', text: 'ثُبّت إسنادك لكن دون فصول أو مواد — راجع وكيل شؤون الطلاب.' })
        ]));
      }
      view.appendChild(UI.panel('اختيار الحصة', 'حدّد الفصل والحصة والتاريخ ثم افتح كشف التحضير.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'فتح كشف التحضير', onClick: function () { openBoard(false); } })
      ], [
        h('div', { class: 'form-grid' }, [classSel.wrap, periodSel.wrap, dateInp.wrap])
      ]));
      view.appendChild(board);

      /* اليوم: كل حصص المعلم */
      var today = UI.today();
      var todaySessions = S.list('sessions', { teacherId: teacherId, date: today })
        .filter(function (s) { return !me.locked || assignments.some(function (a) { return a.classId === s.classId; }); });
      view.appendChild(UI.panel('حصص اليوم', 'الحصص التي فُتح لها تحضير اليوم.', null, [
        todaySessions.length ? UI.table({
          cols: [
            { label: 'الفصل', render: function (s) { return (S.klass(s.classId) || {}).name; } },
            { label: 'المادة', key: 'subject' },
            { label: 'الحصة', render: function (s) { return (S.period(s.periodId) || {}).label; } },
            { label: 'الحالة', render: function (s) { return UI.badge(s.status === 'closed' ? 'مُغلق' : 'مفتوح', s.status === 'closed' ? 'mint' : 'amber'); } },
            { label: 'الغياب', render: function (s) { return String((s.records || []).filter(function (r) { return r.status === 'absent'; }).length); } },
            { label: '', render: function (s) { return h('button', { class: 'mini-btn', type: 'button', text: 'عرض', onClick: function () {
              classSel.input.value = (S.assignmentsOf(teacherId).find(function (a) { return a.classId === s.classId; }) || {}).id || '';
              periodSel.input.value = s.periodId; dateInp.input.value = s.date; openBoard(false);
            } }); } }
          ], rows: todaySessions, empty: 'لم تفتح أي تحضير اليوم بعد.'
        }) : UI.empty('لم تفتح أي تحضير اليوم بعد.', null)
      ]));
    }
  });
})();
