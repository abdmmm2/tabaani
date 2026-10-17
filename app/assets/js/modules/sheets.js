/* =============================================================================
   sheets.js — صانع الكشوفات
   ---------------------------------------------------------------------------
   • وكيل شؤون الطلاب (والمدير) ينشئ كشفًا من بيانات المدرسة:
     قائمة طلاب · درجات ومشاركات · حضور وغياب · مخالفات سلوكية.
   • يحدّد الفصل والمادة والفترة والأعمدة، ثم يحفظ الكشف.
   • يظهر الكشف للوكيل والمدير (كل المدرسة) وللمعلم (فصوله فقط) — للطباعة/CSV.
   • لا يدخل المعلم أي بيانات هنا: الكشف قراءة وطباعة فقط.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var SOURCES = [
    { id: 'students', label: 'قائمة الطلاب', icon: '👥',
      cols: [
        { id: 'seat', label: 'المقعد' }, { id: 'class', label: 'الفصل' },
        { id: 'nationalId', label: 'الهوية' }, { id: 'guardianPhone', label: 'جوال ولي الأمر' },
        { id: 'status', label: 'الحالة' }
      ] },
    { id: 'grades', label: 'درجات ومشاركات', icon: '📊', cols: [] },
    { id: 'attendance', label: 'حضور وغياب', icon: '🗓️',
      cols: [
        { id: 'present', label: 'حاضر' }, { id: 'late', label: 'متأخر' },
        { id: 'absent', label: 'غائب' }, { id: 'excused', label: 'بعذر' }, { id: 'pct', label: 'نسبة الحضور' }
      ] },
    { id: 'violations', label: 'مخالفات سلوكية', icon: '⚠️',
      cols: [
        { id: 'date', label: 'التاريخ' }, { id: 'type', label: 'النوع' },
        { id: 'degree', label: 'الدرجة' }, { id: 'status', label: 'الحالة' }, { id: 'action', label: 'الإجراء' }
      ] }
  ];
  var VSTATUS = { guidance_pending: 'بانتظار التوجيه', deputy_pending: 'بانتظار الوكيل', closed: 'مغلقة' };

  function sourceOf(id) {
    return SOURCES.filter(function (s) { return s.id === id; })[0] || SOURCES[0];
  }
  function colsOf(id) {
    if (id === 'grades') {
      return S.GRADE_COLUMNS.map(function (c) { return { id: c.id, label: c.label }; });
    }
    return sourceOf(id).cols.slice();
  }
  function colLabel(sourceId, colId) {
    var c = colsOf(sourceId).filter(function (x) { return x.id === colId; })[0];
    return c ? c.label : colId;
  }
  function classLabel(id) {
    var k = S.klass(id);
    if (!k) return 'كل الفصول';
    return (k.grade || '') + ' / ' + (k.section || '') + (k.room ? ' — قاعة ' + k.room : '');
  }
  function schoolClasses() {
    return S.list('classes', { schoolId: S.session.schoolId });
  }
  function teacherClassIds() {
    return S.teacherClassIds ? S.teacherClassIds(S.session.userId) : [];
  }
  function classesOf(sheet) {
    var ids = (sheet.classIds && sheet.classIds.length) ? sheet.classIds.slice()
      : (sheet.classId ? [sheet.classId] : []);
    if (!ids.length) ids = schoolClasses().map(function (k) { return k.id; });
    if (S.session.role === 'teacher') {
      var mine = teacherClassIds();
      ids = ids.filter(function (id) { return mine.indexOf(id) > -1; });
    }
    return ids;
  }
  function inRange(d, sh) {
    if (!d) return true;
    if (sh.from && d < sh.from) return false;
    if (sh.to && d > sh.to) return false;
    return true;
  }

  /* ------------------------------ بناء صفوف الكشف ------------------------------ */
  function buildSheet(sh) {
    var src = sh.source || 'students';
    var cids = classesOf(sh);
    var cols = (sh.columns && sh.columns.length ? sh.columns : colsOf(src).map(function (c) { return c.id; }))
      .filter(function (id) { return colsOf(src).some(function (c) { return c.id === id; }); });
    var labels = ['#', 'اسم الطالب'].concat(cols.map(function (id) { return colLabel(src, id); }));
    var students = [];
    cids.forEach(function (cid) { students = students.concat(S.list('students', { classId: cid })); });

    if (src === 'students') {
      return { labels: labels, rows: students.map(function (st, i) {
        return [String(i + 1), st.name].concat(cols.map(function (id) {
          if (id === 'seat') return String(st.seat || '');
          if (id === 'class') return classLabel(st.classId);
          if (id === 'nationalId') return st.nationalId || '';
          if (id === 'guardianPhone') return st.guardianPhone || '';
          if (id === 'status') return st.status === 'suspended' ? 'موقوف' : 'نشط';
          return '';
        }));
      }) };
    }

    if (src === 'grades') {
      var gLabels = ['#', 'اسم الطالب', 'الفصل'].concat(cols.map(function (id) { return colLabel('grades', id); }));
      if (cols.length > 1) gLabels.push('المجموع');
      return { labels: gLabels, rows: students.map(function (st, i) {
        var vals = cols.map(function (id) { return String(S.studentPoints(st.id, id) || 0); });
        var tot = cols.reduce(function (n, id) { return n + (Number(S.studentPoints(st.id, id)) || 0); }, 0);
        var row = [String(i + 1), st.name, classLabel(st.classId)].concat(vals);
        if (cols.length > 1) row.push(String(tot));
        return row;
      }) };
    }

    if (src === 'attendance') {
      var sessions = [];
      cids.forEach(function (cid) {
        sessions = sessions.concat(S.list('sessions', { classId: cid }).filter(function (ss) { return inRange(ss.date, sh); }));
      });
      var aLabels = ['#', 'اسم الطالب', 'الفصل'].concat(cols.map(function (id) { return colLabel('attendance', id); }));
      return { labels: aLabels, rows: students.map(function (st, i) {
        var mine = [];
        sessions.forEach(function (ss) {
          (ss.records || []).forEach(function (r) { if (r.studentId === st.id) mine.push(r.status); });
        });
        var n = { present: 0, late: 0, absent: 0, excused: 0 };
        mine.forEach(function (x) { if (n[x] != null) n[x]++; });
        var total = mine.length || 0;
        var pct = total ? Math.round(((n.present + n.late) / total) * 100) + '٪' : '—';
        return [String(i + 1), st.name, classLabel(st.classId)].concat(cols.map(function (id) {
          return id === 'pct' ? pct : String(n[id] || 0);
        }));
      }) };
    }

    /* المخالفات: صف لكل مخالفة */
    var vio = S.list('violations').filter(function (v) {
      return cids.indexOf(v.classId) > -1 && inRange(v.date, sh);
    }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var vLabels = ['#', 'اسم الطالب', 'الفصل'].concat(cols.map(function (id) { return colLabel('violations', id); }));
    return { labels: vLabels, rows: vio.map(function (v, i) {
      var st = S.student(v.studentId) || {};
      var action = (v.action && (v.action.label || v.action.type)) || v.procedure || '';
      return [String(i + 1), st.name || '—', classLabel(v.classId)].concat(cols.map(function (id) {
        if (id === 'date') return v.date || '';
        if (id === 'type') return v.type || '';
        if (id === 'degree') return v.degree || '';
        if (id === 'status') return VSTATUS[v.status] || v.status || '';
        if (id === 'action') return action;
        return '';
      }));
    }) };
  }

  /* ---------------------------------- الطباعة ---------------------------------- */
  function printSheet(sh, built) {
    built = built || buildSheet(sh);
    UI.printPlatformDoc({
      title: sh.title || 'كشف',
      subtitle: (S.school(sh.schoolId) || {}).name || '',
      by: sh.createdByName || '',
      meta: [
        { label: 'نوع الكشف', value: sourceOf(sh.source).label },
        { label: 'الفصل', value: sh.classId ? classLabel(sh.classId) : 'كل الفصول' },
        { label: 'المادة', value: sh.subject || '—' },
        { label: 'الفترة', value: (sh.from || sh.to) ? ((sh.from || '—') + ' ← ' + (sh.to || '—')) : 'كل الفترة' },
        { label: 'عدد الصفوف', value: String(built.rows.length) }
      ],
      sections: [{ heading: '', text: sh.note || '', table: { cols: built.labels, rows: built.rows } }],
      signatures: ['إعداد: ' + (sh.createdByName || '—'), 'وكيل شؤون الطلاب', 'مدير المدرسة']
    });
  }
  function exportCsv(sh, built) {
    built = built || buildSheet(sh);
    var objs = built.rows.map(function (r) {
      var o = {};
      built.labels.forEach(function (label, i) { o[label] = r[i]; });
      return o;
    });
    if (!objs.length) { UI.toast('لا صفوف لتصديرها', 'warn'); return; }
    UI.downloadCsv(objs, (sh.title || 'كشف').replace(/[\\/:*?"<>|]/g, '-') + '.csv');
  }

  /* --------------------------------- الوحدة --------------------------------- */
  App.register({
    id: 'sheets',
    label: 'صانع الكشوفات',
    icon: '&#128196;',
    roles: ['deputy', 'principal', 'teacher'],
    render: function (view) {
      var me = S.session || {};
      var canCreate = me.role === 'deputy' || me.role === 'principal';
      var myClassIds = me.role === 'teacher' ? teacherClassIds() : null;
      var state = {
        title: '', source: 'students', classId: '', subject: '',
        from: '', to: '', columns: colsOf('students').map(function (c) { return c.id; }), note: ''
      };
      var host = h('div', { class: 'stack' });
      var formSlot = h('div');
      var listSlot = h('div');

      function visibleSheets() {
        var all = S.list('sheets', { schoolId: me.schoolId }).slice();
        if (me.role === 'teacher') {
          all = all.filter(function (sh) {
            if (sh.teacherIds && sh.teacherIds.indexOf(me.userId) > -1) return true;
            var ids = (sh.classIds && sh.classIds.length) ? sh.classIds : (sh.classId ? [sh.classId] : []);
            return !ids.length || ids.some(function (id) { return myClassIds.indexOf(id) > -1; });
          });
        }
        return all.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
      }

      function resetColumns() { state.columns = colsOf(state.source).map(function (c) { return c.id; }); }

      function drawForm() {
        clear(formSlot);
        if (!canCreate) return;
        var sc = schoolClasses();
        var srcF = UI.field({
          name: 'sheetSource', label: 'نوع الكشف', type: 'select', half: true, value: state.source,
          options: SOURCES.map(function (s) { return { value: s.id, label: s.icon + ' ' + s.label }; })
        });
        var clsF = UI.field({
          name: 'sheetClass', label: 'الفصل', type: 'select', half: true, value: state.classId,
          options: [{ value: '', label: 'كل الفصول' }].concat(sc.map(function (k) { return { value: k.id, label: classLabel(k.id) }; }))
        });
        var titleF = UI.field({ name: 'sheetTitle', label: 'عنوان الكشف', required: true, value: state.title, half: true,
          placeholder: 'مثال: كشف متابعة المشاركة — الفصل الأول' });
        var subjectF = UI.field({ name: 'sheetSubject', label: 'المادة (للدرجات)', half: true, value: state.subject, placeholder: 'مثال: رياضيات' });
        var fromF = UI.field({ name: 'sheetFrom', label: 'من تاريخ', type: 'date', half: true, value: state.from });
        var toF = UI.field({ name: 'sheetTo', label: 'إلى تاريخ', type: 'date', half: true, value: state.to });
        var noteF = UI.field({ name: 'sheetNote', label: 'ملاحظة تظهر أعلى الكشف', type: 'textarea', rows: 2, value: state.note });

        srcF.input.addEventListener('change', function () {
          state.source = srcF.input.value; resetColumns(); drawForm();
        });
        clsF.input.addEventListener('change', function () { state.classId = clsF.input.value; });
        titleF.input.addEventListener('input', function () { state.title = titleF.input.value; });
        subjectF.input.addEventListener('input', function () { state.subject = subjectF.input.value; });
        fromF.input.addEventListener('change', function () { state.from = fromF.input.value; });
        toF.input.addEventListener('change', function () { state.to = toF.input.value; });
        noteF.input.addEventListener('input', function () { state.note = noteF.input.value; });

        var colBoxes = h('div', { class: 'cluster' });
        colsOf(state.source).forEach(function (c) {
          var cb = h('input', { type: 'checkbox' });
          cb.checked = state.columns.indexOf(c.id) > -1;
          cb.addEventListener('change', function () {
            var i = state.columns.indexOf(c.id);
            if (cb.checked && i === -1) state.columns.push(c.id);
            if (!cb.checked && i > -1) state.columns.splice(i, 1);
          });
          colBoxes.appendChild(h('label', { class: 'checkline' }, [cb, h('span', { text: c.label })]));
        });

        var grid = [titleF.wrap, srcF.wrap, clsF.wrap,
          state.source === 'grades' ? subjectF.wrap : null,
          (state.source === 'attendance' || state.source === 'violations') ? fromF.wrap : null,
          (state.source === 'attendance' || state.source === 'violations') ? toF.wrap : null,
          noteF.wrap];

        formSlot.appendChild(UI.panel('إنشاء كشف جديد', 'اختر المصدر والفصل والأعمدة — ثم احفظ ليظهر للمعلمين.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: '💾 حفظ الكشف', onClick: function () {
            if (!state.title.trim()) { UI.toast('اكتب عنوان الكشف أولًا', 'warn'); return; }
            if (!state.columns.length) { UI.toast('اختر عمودًا واحدًا على الأقل', 'warn'); return; }
            var ids = state.classId ? [state.classId] : schoolClasses().map(function (k) { return k.id; });
            S.insert('sheets', {
              schoolId: me.schoolId, title: state.title.trim(), source: state.source,
              classId: state.classId || '', classIds: ids,
              subject: state.subject.trim(), from: state.from, to: state.to,
              columns: state.columns.slice(), note: state.note.trim(),
              createdBy: me.userId, createdByName: me.name, status: 'active'
            });
            UI.toast('حُفظ الكشف ✓ — ظهر الآن للمعلمين', 'ok');
            state.title = ''; state.note = '';
            drawForm(); drawList();
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🧹 تفريغ النموذج', onClick: function () {
            state.title = ''; state.subject = ''; state.note = ''; state.from = ''; state.to = '';
            drawForm();
          } })
        ], [
          h('div', { class: 'form-grid' }, grid.filter(Boolean)),
          h('div', { class: 'field full' }, [
            h('label', { text: 'الأعمدة' }),
            colBoxes
          ])
        ]));
      }

      function drawList() {
        clear(listSlot);
        var sheets = visibleSheets();
        var totalRows = sheets.reduce(function (n, sh) { try { return n + buildSheet(sh).rows.length; } catch (e) { return n; } }, 0);
        listSlot.appendChild(h('div', { class: 'grid-3-app' }, [
          UI.statCard('الكشوفات', String(sheets.length), canCreate ? 'أنشأتها للمعلمين' : 'المتاحة لك'),
          UI.statCard('إجمالي الصفوف', String(totalRows), 'عبر كل الكشوف'),
          UI.statCard('آخر كشف', sheets[0] ? UI.fmtDate((sheets[0].createdAt || '').slice(0, 10)) : '—', sheets[0] ? sheets[0].title : 'لا كشوف بعد')
        ]));

        listSlot.appendChild(UI.panel(canCreate ? 'الكشوفات المحفوظة' : 'كشوف فصولك', sheets.length + ' كشفًا', null, [
          UI.table({
            cols: [
              { label: 'العنوان', render: function (sh) { return h('strong', { text: sh.title }); } },
              { label: 'النوع', render: function (sh) { return sourceOf(sh.source).icon + ' ' + sourceOf(sh.source).label; } },
              { label: 'الفصل', render: function (sh) { return sh.classId ? classLabel(sh.classId) : 'كل الفصول'; } },
              { label: 'بواسطة', render: function (sh) { return sh.createdByName || '—'; } },
              { label: 'التاريخ', render: function (sh) { return UI.fmtDate((sh.createdAt || '').slice(0, 10)); } },
              { label: 'الصفوف', render: function (sh) { try { return String(buildSheet(sh).rows.length); } catch (e) { return '—'; } } },
              { label: 'إجراءات', render: function (sh) {
                var btns = [
                  h('button', { class: 'mini-btn is-primary', type: 'button', text: 'معاينة', onClick: function () { preview(sh); } }),
                  h('button', { class: 'mini-btn', type: 'button', text: 'CSV', onClick: function () { exportCsv(sh); } })
                ];
                if (canCreate) {
                  btns.push(h('button', { class: 'mini-btn', type: 'button', text: 'حذف', onClick: function () {
                    UI.confirm('حذف كشف «' + sh.title + '»؟', { ok: 'حذف', danger: true }).then(function (yes) {
                      if (!yes) return;
                      S.remove('sheets', sh.id);
                      UI.toast('حُذف الكشف', 'ok');
                      drawList();
                    });
                  } }));
                }
                return h('div', { class: 'row-actions' }, btns);
              } }
            ],
            rows: sheets,
            empty: canCreate ? 'لا كشوف بعد — أنشئ أول كشف من الأعلى.' : 'لم يُنشئ الوكيل كشوفًا لفصولك بعد.'
          })
        ]));

        if (!canCreate && me.role === 'teacher') {
          listSlot.appendChild(h('div', { class: 'callout info', text: 'تظهر لك الكشوف التي أنشأها وكيل شؤون الطلاب لفصولك. للطباعة اضغط «معاينة» ثم «طباعة / PDF».' }));
        }
      }

      function preview(sh) {
        var built = buildSheet(sh);
        var m = UI.modal({
          title: sh.title,
          wide: true,
          body: [
            h('div', { class: 'muted', style: { marginBottom: '8px' }, text: sourceOf(sh.source).label + ' · ' + (sh.classId ? classLabel(sh.classId) : 'كل الفصول') + (sh.subject ? ' · ' + sh.subject : '') + ' · ' + built.rows.length + ' صفًا' }),
            UI.table({
              cols: built.labels.map(function (l, i) { return { label: l, key: String(i) }; }),
              rows: built.rows.map(function (r) { var o = {}; r.forEach(function (v, i) { o[String(i)] = v; }); return o; }),
              empty: 'لا بيانات في هذه الفترة'
            }),
            h('div', { class: 'cluster', style: { marginTop: '10px' } }, [
              h('button', { class: 'btn btn-primary', type: 'button', text: '🖨️ طباعة / PDF', onClick: function () { printSheet(sh, built); } }),
              h('button', { class: 'btn btn-outline', type: 'button', text: '⬇️ CSV', onClick: function () { exportCsv(sh, built); } })
            ])
          ],
          actions: [{ label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }]
        });
        void m;
      }

      host.appendChild(h('div', { class: 'panel' }, [
        h('div', { class: 'panel-body' }, [
          h('span', { class: 'eyebrow', text: canCreate ? 'إنشاء وتوزيع' : 'كشوف فصولك' }),
          h('p', { class: 'muted mt-3', text: canCreate
            ? 'أنشئ كشفًا من بيانات المدرسة (طلاب · درجات · حضور · مخالفات) فيظهر فورًا للمعلمين أصحاب الفصل، وللمدير.'
            : 'هذه الكشوف أنشأها وكيل شؤون الطلاب لفصولك — يمكنك معاينتها وطباعتها وتصديرها.' })
        ])
      ]));
      host.appendChild(formSlot);
      host.appendChild(listSlot);
      view.appendChild(host);
      drawForm();
      drawList();
    }
  });
})();
