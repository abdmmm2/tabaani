/* =============================================================================
   attendance-reports.js — تقارير التحضير والتحليلات والحرمان
   ---------------------------------------------------------------------------
   لوحة متابعة للوكيل ومدير المدرسة، بثلاثة تبويبات يغذّيها شريط فترة موحّد
   (يومي · أسبوعي · شهري · نهاية الفصل) مع منتقي تاريخ وتصفية بالفصل/المعلم:
     • الحصص      : بطاقات اليوم، جدول الجلسات (كشف + PDF + CSV)، التقارير الرسمية.
     • التحليلات  : بطاقات ورسوم (اتجاه يومي، أعمدة الفصول، توزيع الحالات، المواد).
     • الحرمان    : قائمة الطلاب الذين بلغوا نسبة الحرمان + إشعار ولي الأمر + طباعة.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var ATT = {
    present: { label: 'حاضر', tone: 'mint' },
    late: { label: 'متأخر', tone: 'amber' },
    absent: { label: 'غائب', tone: 'brand' },
    excused: { label: 'بعذر', tone: 'plain' }
  };
  var COLORS = { present: '#1E7A5A', late: '#CE9433', absent: '#C2593F', excused: '#8A5A1E' };
  var KINDS = [
    { key: 'day', label: 'يومي' },
    { key: 'week', label: 'أسبوعي' },
    { key: 'month', label: 'شهري' },
    { key: 'term', label: 'نهاية الفصل' }
  ];
  var TABS = [
    { key: 'sessions', label: 'الحصص' },
    { key: 'analytics', label: 'التحليلات' },
    { key: 'deprivation', label: 'الحرمان' }
  ];

  function attLabel(id) { return (ATT[id] || {}).label || '—'; }
  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }

  function ensureReport(type, refId, title) {
    var found = S.list('reports').find(function (r) { return r.type === type && r.refId === refId; });
    return found || S.registerReport(type, refId, { title: title });
  }
  function sessionsSorted() {
    return S.list('sessions').slice().sort(function (a, b) {
      var d = String(b.date || '').localeCompare(String(a.date || ''));
      if (d) return d;
      var pa = (S.period(a.periodId) || {}).index || 0, pb = (S.period(b.periodId) || {}).index || 0;
      return pb - pa;
    });
  }
  function totalsFromRows(rows) {
    var t = { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
    (rows || []).forEach(function (r) {
      t.present += r.present || 0; t.late += r.late || 0;
      t.absent += r.absent || 0; t.excused += r.excused || 0; t.total += r.total || 0;
    });
    return t;
  }

  App.register({
    id: 'attendance-reports',
    label: 'تقارير التحضير',
    icon: '&#128202;',
    roles: ['deputy', 'principal'],
    render: function (view) {
      /* تصفير شارة القائمة الجانبية: وسم جلسات التحضير المغلقة كمقروءة */
      var fresh = {};
      S.list('sessions').forEach(function (s) {
        if (s.status === 'closed' && !s.seen) { fresh[s.id] = true; S.update('sessions', s.id, { seen: true }); }
      });
      App.refreshBadges();

      var state = { tab: 'sessions', kind: 'day', ref: UI.today(), classId: '', teacherId: '' };

      function range() { return S.rangeOf(state.kind, state.ref); }
      function filter() {
        var f = {};
        if (state.classId) f.classId = state.classId;
        if (state.teacherId) f.teacherId = state.teacherId;
        return f;
      }
      function rangeLabel() {
        var r = range();
        return r.label + ' — ' + UI.fmtDate(r.from) + ' إلى ' + UI.fmtDate(r.to);
      }
      function paint() { clear(view); build(); }

      /* --------------------------------------------------- كشف جلسة واحدة */
      function rosterRows(s) {
        var recs = {};
        (s.records || []).forEach(function (r) { recs[r.studentId] = r; });
        return S.studentsOf(s.classId).map(function (st, i) {
          var r = recs[st.id] || {};
          return { seat: st.seat || i + 1, name: st.name, status: r.status || '', note: r.note || '' };
        });
      }
      function tally(s) {
        var c = { present: 0, late: 0, absent: 0, excused: 0 };
        (s.records || []).forEach(function (r) { if (c[r.status] != null) c[r.status]++; });
        c.total = (s.records || []).length;
        return c;
      }
      function absentPct(s) {
        var c = tally(s);
        return c.total ? Math.round((c.absent / c.total) * 100) : 0;
      }
      function sessionMeta(s) {
        return {
          cls: S.klass(s.classId) || {}, teacher: S.user(s.teacherId) || {}, period: S.period(s.periodId) || {}
        };
      }

      function openRoster(s) {
        var meta = sessionMeta(s);
        var rows = rosterRows(s);
        var c = tally(s);
        UI.modal({
          title: 'كشف التحضير — ' + meta.cls.name + ' / ' + s.subject, wide: true,
          body: [
            h('div', { class: 'stat-row' }, [
              UI.statCard('حاضر', String(c.present)),
              UI.statCard('متأخر', String(c.late)),
              UI.statCard('غائب', String(c.absent), null, c.absent ? 'gold' : null),
              UI.statCard('بعذر', String(c.excused))
            ]),
            UI.table({
              cols: [
                { label: 'م', render: function (r) { return h('span', { class: 'nums', text: String(r.seat) }); } },
                { label: 'اسم الطالب', key: 'name' },
                { label: 'الحالة', render: function (r) { return r.status ? UI.badge(attLabel(r.status), (ATT[r.status] || {}).tone) : '—'; } },
                { label: 'ملاحظة', render: function (r) { return r.note || '—'; } }
              ],
              rows: rows, empty: 'لا يوجد طلاب في هذا الفصل.'
            })
          ],
          actions: [{ label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }]
        });
      }

      /* ------------------------------------------------------ تقرير الطباعة */
      function buildSessionReport(s) {
        var meta = sessionMeta(s);
        var rows = rosterRows(s);
        var c = tally(s);
        var rep = ensureReport('attendance', s.id, 'تقرير تحضير — ' + meta.cls.name + ' / ' + s.subject);
        return {
          type: 'attendance', refId: s.id, code: rep ? rep.code : null,
          title: 'تقرير التحضير', subtitle: meta.cls.name + ' — ' + s.subject,
          meta: [
            { label: 'الفصل', value: meta.cls.name },
            { label: 'المادة', value: s.subject },
            { label: 'المعلم', value: meta.teacher.name },
            { label: 'الحصة', value: meta.period.label + (meta.period.start ? ' (' + meta.period.start + ' — ' + meta.period.end + ')' : '') },
            { label: 'التاريخ', value: UI.fmtDate(s.date) },
            { label: 'الحالة', value: s.status === 'closed' ? 'مُغلقة' : 'مفتوحة' },
            { label: 'نسبة الغياب', value: absentPct(s) + '٪' }
          ],
          sections: [
            { heading: 'كشف التحضير', table: { cols: ['م', 'اسم الطالب', 'الحالة', 'ملاحظة'], rows: rows.map(function (r) { return [r.seat, r.name, attLabel(r.status), r.note || '—']; }) } },
            { heading: 'الملخّص', text: 'حاضر: ' + c.present + ' · متأخر: ' + c.late + ' · غائب: ' + c.absent + ' · بعذر: ' + c.excused + '\nإجمالي الطلاب: ' + c.total + ' · نسبة الغياب: ' + absentPct(s) + '٪' }
          ],
          signatures: ['معلم المادة', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }
      function reportButtonFor(s, label, cls) {
        return UI.reportButton(function () { return buildSessionReport(s); }, { label: label || 'طباعة / PDF', class: cls || 'btn-outline' });
      }

      function exportCsv(s) {
        var rows = rosterRows(s).map(function (r) {
          return { 'م': r.seat, 'اسم الطالب': r.name, 'الحالة': attLabel(r.status), 'ملاحظة': r.note || '' };
        });
        if (!rows.length) { UI.toast('لا يوجد كشف للتصدير', 'warn'); return; }
        var cls = S.klass(s.classId) || {};
        UI.downloadCsv(rows, 'كشف-' + String(cls.name || '').replace(/[\/\s]+/g, '-') + '-' + s.date + '.csv');
        UI.toast('صُدِّر كشف الصف بصيغة CSV', 'ok');
      }

      /* --------------------------------------------- تجميعات مشتركة للنطاق */
      function classStats(r, f) {
        var sessions = S.sessionsInRange(r, f);
        var map = {};
        sessions.forEach(function (s) {
          var k = S.klass(s.classId) || { name: '—' };
          var row = map[s.classId] || (map[s.classId] = {
            classId: s.classId, name: k.name, sessions: 0, closed: 0,
            present: 0, late: 0, absent: 0, excused: 0, total: 0
          });
          row.sessions++;
          if (s.status === 'closed') row.closed++;
          (s.records || []).forEach(function (x) { if (row[x.status] != null) row[x.status]++; row.total++; });
        });
        return Object.keys(map).map(function (k) { return map[k]; }).map(function (row) {
          row.attendancePct = pct(row.present + row.late, row.total);
          row.absencePct = pct(row.absent, row.total);
          return row;
        }).sort(function (a, b) { return a.attendancePct - b.attendancePct; });
      }
      function classBarsFromSummary(r, f) {
        var map = {};
        S.attendanceSummary(r, f).rows.forEach(function (x) {
          var key = x.classId || x.className;
          var row = map[key] || (map[key] = { name: x.className, present: 0, late: 0, absent: 0, excused: 0 });
          row.present += x.present; row.late += x.late; row.absent += x.absent; row.excused += x.excused;
        });
        var rows = Object.keys(map).map(function (k) { return map[k]; });
        return {
          type: 'bars',
          labels: rows.map(function (x) { return x.name; }),
          series: [
            { name: 'حاضر', values: rows.map(function (x) { return x.present; }), color: COLORS.present },
            { name: 'متأخر', values: rows.map(function (x) { return x.late; }), color: COLORS.late },
            { name: 'غائب', values: rows.map(function (x) { return x.absent; }), color: COLORS.absent },
            { name: 'بعذر', values: rows.map(function (x) { return x.excused; }), color: COLORS.excused }
          ]
        };
      }
      function classBarsFromStats(cs) {
        return {
          type: 'bars',
          labels: cs.map(function (c) { return c.name; }),
          series: [
            { name: 'حاضر', values: cs.map(function (c) { return c.present; }), color: COLORS.present },
            { name: 'متأخر', values: cs.map(function (c) { return c.late; }), color: COLORS.late },
            { name: 'غائب', values: cs.map(function (c) { return c.absent; }), color: COLORS.absent },
            { name: 'بعذر', values: cs.map(function (c) { return c.excused; }), color: COLORS.excused }
          ]
        };
      }
      function lineTrend(trend) {
        return {
          type: 'line',
          labels: trend.map(function (x) { return UI.fmtDate(x.date).slice(5); }),
          series: [
            { name: 'غياب', values: trend.map(function (x) { return x.absent; }), color: COLORS.absent },
            { name: 'تأخر', values: trend.map(function (x) { return x.late; }), color: COLORS.late }
          ]
        };
      }
      function donutTotals(t) {
        return {
          type: 'donut',
          labels: ['حاضر', 'متأخر', 'غائب', 'بعذر'],
          series: [{ name: 'توزيع الحالات', values: [t.present, t.late, t.absent, t.excused], colors: [COLORS.present, COLORS.late, COLORS.absent, COLORS.excused] }]
        };
      }
      function subjectAbsence(r, f) {
        var map = {};
        S.sessionsInRange(r, f).forEach(function (s) {
          var n = (s.records || []).filter(function (x) { return x.status === 'absent'; }).length;
          if (n) map[s.subject] = (map[s.subject] || 0) + n;
        });
        return Object.keys(map).map(function (k) { return { subject: k, absent: map[k] }; })
          .sort(function (a, b) { return b.absent - a.absent; });
      }
      function topSubjectFor(studentId, r, f) {
        var map = {};
        S.sessionsInRange(r, f).forEach(function (s) {
          (s.records || []).forEach(function (x) {
            if (x.studentId !== studentId || x.status !== 'absent') return;
            map[s.subject] = (map[s.subject] || 0) + 1;
          });
        });
        var best = null;
        Object.keys(map).forEach(function (k) { if (!best || map[k] > map[best]) best = k; });
        return best || '—';
      }

      /* --------------------------------------------------- تقارير نطاق رسمية */
      function buildDailyReport() {
        var date = state.ref || UI.today();
        var rows = S.dailyAttendance(date).filter(function (x) { return x.sessions > 0; });
        var tot = rows.reduce(function (a, x) {
          a.present += x.present; a.late += x.late; a.absent += x.absent; a.total += x.total; return a;
        }, { present: 0, late: 0, absent: 0, total: 0 });
        return {
          type: 'attendance-daily', refId: 'daily-' + date,
          title: 'تقرير الحضور اليومي للفصول', subtitle: 'اليوم: ' + UI.fmtDate(date),
          meta: [
            { label: 'التاريخ', value: UI.fmtDate(date) },
            { label: 'عدد الفصول', value: rows.length },
            { label: 'إجمالي الحصص', value: rows.reduce(function (a, x) { return a + x.sessions; }, 0) },
            { label: 'نسبة الحضور', value: pct(tot.present + tot.late, tot.total) + '٪' },
            { label: 'الغائبون', value: tot.absent },
            { label: 'المتأخرون', value: tot.late }
          ],
          sections: [
            { heading: 'كشف الفصول', table: { cols: ['الفصل', 'الحصص', 'المغلقة', 'حاضر', 'متأخر', 'غائب', 'الإجمالي'], rows: rows.map(function (x) { return [x.className, x.sessions, x.closed, x.present, x.late, x.absent, x.total]; }) } },
            { heading: 'رسم بياني: حضور الفصول', chart: classBarsFromStats(rows.map(function (x) {
              return { name: x.className, present: x.present, late: x.late, absent: x.absent, excused: 0 };
            })) }
          ],
          signatures: ['معلمو المواد', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function buildRangeReport(kind) {
        var r = S.rangeOf(kind, state.ref);
        var f = filter();
        var cs = classStats(r, f);
        var trend = S.attendanceTrend(r, f);
        var t = totalsFromRows(S.attendanceSummary(r, f).rows);
        var chart = kind === 'weekly' ? lineTrend(trend) : (kind === 'term' ? donutTotals(t) : classBarsFromStats(cs));
        return {
          type: 'attendance-' + kind, refId: 'range-' + kind + '-' + r.from,
          title: r.label, subtitle: 'من ' + UI.fmtDate(r.from) + ' إلى ' + UI.fmtDate(r.to),
          meta: [
            { label: 'من', value: UI.fmtDate(r.from) },
            { label: 'إلى', value: UI.fmtDate(r.to) },
            { label: 'عدد الحصص', value: S.sessionsInRange(r, f).length },
            { label: 'نسبة الحضور', value: pct(t.present + t.late, t.total) + '٪' },
            { label: 'حالات الغياب', value: t.absent },
            { label: 'حالات التأخر', value: t.late }
          ],
          sections: [
            { heading: 'أداء الفصول', table: { cols: ['الفصل', 'الحصص', 'المغلقة', 'حاضر', 'متأخر', 'غائب', 'نسبة الحضور'], rows: cs.map(function (c) { return [c.name, c.sessions, c.closed, c.present, c.late, c.absent, c.attendancePct + '٪']; }) } },
            { heading: 'رسم بياني', chart: chart }
          ],
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      /* ------------------------------------------------ لوحة المتأخرين والغائبين */
      function aggregate(sessions) {
        var map = {};
        sessions.forEach(function (s) {
          (s.records || []).forEach(function (r) {
            if (r.status !== 'absent' && r.status !== 'late') return;
            var key = r.studentId;
            if (!map[key]) map[key] = { studentId: key, absent: 0, late: 0, last: '', classId: s.classId };
            if (r.status === 'absent') map[key].absent++; else map[key].late++;
            if (String(s.date) > map[key].last) map[key].last = s.date;
          });
        });
        return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
          return (b.absent - a.absent) || (b.late - a.late) || String(b.last).localeCompare(String(a.last));
        });
      }
      function aggReport(rows, label) {
        return {
          type: 'attendance-summary', refId: 'agg-' + range().from + '-' + range().to,
          title: 'تقرير الغياب والتأخر', subtitle: label,
          meta: [
            { label: 'عدد الطلاب', value: rows.length },
            { label: 'إجمالي حالات الغياب', value: rows.reduce(function (a, r) { return a + r.absent; }, 0) },
            { label: 'إجمالي حالات التأخر', value: rows.reduce(function (a, r) { return a + r.late; }, 0) }
          ],
          sections: [{
            heading: 'كشف الغياب والتأخر المجمّع', table: {
              cols: ['الطالب', 'الفصل', 'عدد الغياب', 'عدد التأخر', 'آخر تاريخ'],
              rows: rows.map(function (r) { return [S.student(r.studentId) ? S.student(r.studentId).name : '—', (S.klass(r.classId) || {}).name || '—', r.absent, r.late, UI.fmtDate(r.last)]; })
            }
          }],
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      /* --------------------------------------------------- إشعار ولي الأمر */
      function notifyGuardian(row, th) {
        var defaultMsg = 'حضرة ولي أمر الطالب/ة ' + row.name + ' (' + row.className + '):\n' +
          'نفيدكم بأن نسبة الغياب بلغت ' + row.absencePct + '٪ (' + row.absent + ' من ' + row.total + ' حصة) خلال ' + rangeLabel() + '، ' +
          'وهي عند حد الحرمان المعتمد (' + th + '٪). نأمل التعاون بمتابعة الحضور ومراجعة وكيل شؤون الطلاب.';
        UI.formModal({
          title: 'إشعار ولي الأمر — ' + row.name,
          intro: 'اختر قناة الإبلاغ وحرّر نص الرسالة، ثم أرسل. يُسجَّل الإشعار في سجل المنصة وسجل تلقرام.',
          fields: [
            {
              name: 'channel', label: 'قناة الإبلاغ', type: 'select', required: true,
              value: 'telegram',
              options: [{ value: 'platform', label: 'منصة' }, { value: 'telegram', label: 'تلقرام' }, { value: 'sms', label: 'جوال' }]
            },
            { name: 'message', label: 'نص الرسالة', type: 'textarea', rows: 6, required: true, value: defaultMsg }
          ],
          submitLabel: 'إرسال الإشعار',
          onSubmit: function (data) {
            var chLabel = { platform: 'منصة', telegram: 'تلقرام', sms: 'جوال' }[data.channel] || 'منصة';
            S.tg({
              to: 'deputy',
              text: 'إشعار ولي أمر (' + chLabel + ')\n' + row.name + ' — ' + row.className +
                '\nنسبة الغياب: ' + row.absencePct + '٪ (' + row.absent + '/' + row.total + ')\n' + data.message
            });
            S.notify({
              kind: 'attendance', ref: row.studentId,
              title: 'إشعار ولي أمر — ' + row.name,
              body: data.message, to: ['deputy', 'principal']
            });
            UI.toast('أُرسل إشعار ولي الأمر عبر ' + chLabel, 'ok');
            paint();
          }
        });
      }

      /* ============================================================ الأجزاء */
      function headerPanel() {
        var roleName = (S.roles.find(function (r) { return r.id === S.session.role; }) || {}).name || '';
        return h('div', { class: 'panel' }, [h('div', { class: 'panel-body' }, [
          h('div', { class: 'between' }, [
            h('div', {}, [
              h('span', { class: 'eyebrow', text: 'الدور الحالي: ' + roleName }),
              h('p', { class: 'muted mt-3', text: 'متابعة تحضير الحصص، تحليلات الحضور والغياب، وقوائم الحرمان الرسمية.' })
            ]),
            h('span', { class: 'chip chip-plain', text: rangeLabel() })
          ])
        ])]);
      }

      function periodPanel() {
        var kindBar = h('div', { class: 'cluster' }, KINDS.map(function (k) {
          return h('button', {
            class: 'mini-btn' + (state.kind === k.key ? ' is-primary' : ''), type: 'button', text: k.label,
            onClick: function () { state.kind = k.key; paint(); }
          });
        }));
        var refField = UI.field({ name: 'ref', label: 'تاريخ المرجع', type: 'date', value: state.ref });
        var classField = UI.field({
          name: 'class', label: 'الفصل', type: 'select', value: state.classId, placeholder: 'كل الفصول',
          options: S.list('classes').map(function (c) { return { value: c.id, label: c.name }; })
        });
        var teacherField = UI.field({
          name: 'teacher', label: 'المعلم', type: 'select', value: state.teacherId, placeholder: 'كل المعلمين',
          options: S.usersByRole('teacher').map(function (u) { return { value: u.id, label: u.name }; })
        });
        refField.input.addEventListener('change', function () { state.ref = refField.input.value || UI.today(); paint(); });
        classField.input.addEventListener('change', function () { state.classId = classField.input.value; paint(); });
        teacherField.input.addEventListener('change', function () { state.teacherId = teacherField.input.value; paint(); });

        var resetBtn = h('button', {
          class: 'btn btn-outline btn-sm', type: 'button', text: 'تصفير الفترة',
          onClick: function () { state = { tab: state.tab, kind: 'day', ref: UI.today(), classId: '', teacherId: '' }; paint(); }
        });

        return UI.panel('شريط الفترة', rangeLabel(), resetBtn, [
          h('div', { class: 'between' }, [
            kindBar,
            h('span', { class: 'muted nums', text: range().from + ' → ' + range().to })
          ]),
          h('div', { class: 'form-grid mt-4' }, [refField.wrap, classField.wrap, teacherField.wrap,
            h('div', { class: 'muted-block' }, [h('strong', { text: 'ملاحظة: ' }), h('span', { text: 'الشريط الموحّد يغذّي التبويبات الثلاثة (الحصص · التحليلات · الحرمان).' })])
          ])
        ]);
      }

      /* ----------------------------------------------------- تبويب «الحصص» */
      function sessionsTab() {
        var out = h('div');
        var r = range(), f = filter();
        var today = UI.today();
        var month = today.slice(0, 7);
        var allSessions = sessionsSorted();

        var todaySessions = allSessions.filter(function (s) { return s.date === today; });
        var todayClosed = todaySessions.filter(function (s) { return s.status === 'closed'; }).length;
        var todayAbsent = todaySessions.reduce(function (a, s) { return a + (s.records || []).filter(function (x) { return x.status === 'absent'; }).length; }, 0);
        var todayLate = todaySessions.reduce(function (a, s) { return a + (s.records || []).filter(function (x) { return x.status === 'late'; }).length; }, 0);
        var todayTotal = todaySessions.reduce(function (a, s) { return a + (s.records || []).length; }, 0);
        var monthRows = aggregate(allSessions.filter(function (s) { return String(s.date).slice(0, 7) === month; }))
          .filter(function (x) { return x.absent > 0; }).slice(0, 3);

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('حصص مُحضّرة اليوم', todayClosed + ' / ' + todaySessions.length, 'مغلقة / الإجمالي', todaySessions.length ? 'gold' : null),
          UI.statCard('نسبة الغياب اليوم', pct(todayAbsent, todayTotal) + '٪', todayAbsent + ' غائب من ' + todayTotal),
          UI.statCard('متأخرون اليوم', String(todayLate), 'طالب'),
          UI.statCard('أكثر 3 طلاب غيابًا هذا الشهر', monthRows.length ? String(monthRows[0].absent) : '0',
            monthRows.length ? monthRows.map(function (x) { return (S.student(x.studentId) || {}).name; }).join(' · ') : 'لا يوجد')
        ]));

        /* الجلسات في نطاق الفترة */
        var sessions = allSessions.filter(function (s) {
          if (s.date < r.from || s.date > r.to) return false;
          if (f.classId && s.classId !== f.classId) return false;
          if (f.teacherId && s.teacherId !== f.teacherId) return false;
          return true;
        });

        out.appendChild(UI.panel('جلسات التحضير في الفترة', 'عدد الجلسات: ' + sessions.length + ' · ' + rangeLabel(), null, [
          UI.table({
            cols: [
              { label: 'الفصل', render: function (s) { return (S.klass(s.classId) || {}).name || '—'; } },
              { label: 'المادة', key: 'subject' },
              { label: 'المعلم', render: function (s) { var u = S.user(s.teacherId); return u ? u.name : '—'; } },
              { label: 'الحصة', render: function (s) { return (S.period(s.periodId) || {}).label || '—'; } },
              { label: 'التاريخ', render: function (s) { return UI.fmtDate(s.date); } },
              { label: 'الحالة', render: function (s) { return h('span', { class: 'cluster' }, [
                UI.badge(s.status === 'closed' ? 'مُغلقة' : 'مفتوحة', s.status === 'closed' ? 'mint' : 'amber'),
                fresh[s.id] && s.status === 'closed' ? UI.badge('جديدة', 'brand') : null
              ]); } },
              { label: 'الغائبون / الإجمالي', render: function (s) { var rec = (s.records || []); return rec.filter(function (x) { return x.status === 'absent'; }).length + ' / ' + rec.length; } },
              { label: 'إجراءات', render: function (s) { return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn', type: 'button', text: 'عرض الكشف', onClick: function () { openRoster(s); } }),
                reportButtonFor(s, 'طباعة / PDF'),
                h('button', { class: 'mini-btn', type: 'button', text: s.seen ? 'مقروءة' : 'وسم كمقروء', disabled: !!s.seen, onClick: function () {
                  S.update('sessions', s.id, { seen: true });
                  UI.toast('وُسمت الجلسة كمقروءة', 'ok');
                  App.refreshBadges();
                  paint();
                } }),
                h('button', { class: 'mini-btn', type: 'button', text: 'تصدير CSV', onClick: function () { exportCsv(s); } })
              ]); } }
            ],
            rows: sessions, empty: 'لا توجد جلسات في هذه الفترة — جرّب توسيع الفترة أو تصفيرها.'
          })
        ]));

        /* التقارير الرسمية من النطاق */
        out.appendChild(UI.panel('تقارير الحضور الرسمية', 'كل تقرير PDF بترويسة المدرسة والباركود، ويتضمّن جدولًا ورسمًا بيانيًا مبنيًّا من نطاق الفترة المناسب.', null, [
          h('div', { class: 'cluster' }, [
            UI.reportButton(function () { return buildDailyReport(); }, { label: 'تقرير الحضور اليومي للفصول', class: 'btn-soft' }),
            UI.reportButton(function () { return buildRangeReport('week'); }, { label: 'التقرير الأسبوعي', class: 'btn-soft' }),
            UI.reportButton(function () { return buildRangeReport('month'); }, { label: 'التقرير الشهري', class: 'btn-soft' }),
            UI.reportButton(function () { return buildRangeReport('term'); }, { label: 'تقرير نهاية الفصل', class: 'btn-soft' })
          ]),
          h('div', { class: 'muted-block mt-4', text: 'التقرير اليومي يُبنى من كشف الفصول ليوم تاريخ المرجع، والأسبوعي/الشهري/نهاية الفصل تُبنى من نطاق مجموعة الفترة (S.rangeOf) المطابق.' })
        ]));

        /* لوحة المتأخرين والغائبين */
        var agg = aggregate(sessions);
        var label = rangeLabel() + (f.classId ? ' · ' + ((S.klass(f.classId) || {}).name || '') : '') + (f.teacherId ? ' · ' + ((S.user(f.teacherId) || {}).name || '') : '');
        out.appendChild(UI.panel('الطلاب المتأخرون والغائبون', 'مجمّع من جلسات الفترة: ' + label, [
          UI.reportButton(function () { return aggReport(agg, label); }, { label: 'طباعة تقرير الغياب والتأخر', class: 'btn-soft' })
        ], [
          UI.table({
            cols: [
              { label: 'الطالب', render: function (x) { var st = S.student(x.studentId); return st ? st.name : '—'; } },
              { label: 'الفصل', render: function (x) { return (S.klass(x.classId) || {}).name || '—'; } },
              { label: 'عدد الغياب', render: function (x) { return h('span', { class: 'nums', text: String(x.absent) }); } },
              { label: 'عدد التأخر', render: function (x) { return h('span', { class: 'nums', text: String(x.late) }); } },
              { label: 'آخر تاريخ', render: function (x) { return UI.fmtDate(x.last); } }
            ],
            rows: agg, empty: 'لا غياب أو تأخر في هذه الفترة.'
          })
        ]));

        return out;
      }

      /* ------------------------------------------------- تبويب «التحليلات» */
      function analyticsTab() {
        var out = h('div');
        var r = range(), f = filter();
        var sum = S.attendanceSummary(r, f);
        var t = totalsFromRows(sum.rows);
        var cs = classStats(r, f);
        var trend = S.attendanceTrend(r, f);
        var subs = subjectAbsence(r, f);
        var behind = cs.filter(function (c) { return c.total > 0 && c.attendancePct < 90; });
        var attPct = pct(t.present + t.late, t.total);

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('نسبة الحضور', attPct + '٪', t.present + ' حاضر · ' + t.late + ' متأخر', 'gold'),
          UI.statCard('الغياب', String(t.absent), pct(t.absent, t.total) + '٪ من الحالات'),
          UI.statCard('التأخر', String(t.late), pct(t.late, t.total) + '٪ من الحالات'),
          UI.statCard('بعذر', String(t.excused), pct(t.excused, t.total) + '٪ من الحالات'),
          UI.statCard('عدد الحصص', String(sum.sessions), 'جلسة تحضير في الفترة'),
          UI.statCard('الفصول المتأخرة', String(behind.length) + ' / ' + cs.length, behind.length ? behind.map(function (c) { return c.name; }).join(' · ') : 'لا فصل دون 90٪')
        ]));

        out.appendChild(UI.panel('رسوم الفترة', rangeLabel(), null, [
          h('div', { class: 'chart-grid' }, [
            h('div', {}, [UI.chart(Object.assign({ title: 'اتجاه الغياب والتأخر اليومي' }, lineTrend(trend)))]),
            h('div', {}, [UI.chart(Object.assign({ title: 'توزيع الحالات' }, donutTotals(t)))]),
            h('div', {}, [UI.chart(Object.assign({ title: 'حاضر / متأخر / غائب / بعذر لكل فصل' }, classBarsFromSummary(r, f)))]),
            h('div', {}, [UI.chart(Object.assign({ title: 'المواد الأكثر غيابًا' }, {
              type: 'bars',
              labels: subs.slice(0, 6).map(function (x) { return x.subject; }),
              series: [{ name: 'حالات الغياب', values: subs.slice(0, 6).map(function (x) { return x.absent; }), color: COLORS.absent }]
            }))])
          ])
        ]));

        out.appendChild(UI.panel('أداء الفصول', 'مرتّبة من الأدنى نسبة حضور إلى الأعلى — ' + rangeLabel(), null, [
          UI.table({
            cols: [
              { label: 'الفصل', key: 'name' },
              { label: 'حصص', render: function (c) { return h('span', { class: 'nums', text: String(c.sessions) }); } },
              { label: 'مغلقة', render: function (c) { return h('span', { class: 'nums', text: String(c.closed) }); } },
              { label: 'غياب', render: function (c) { return h('span', { class: 'nums', text: String(c.absent) }); } },
              { label: 'تأخر', render: function (c) { return h('span', { class: 'nums', text: String(c.late) }); } },
              { label: 'نسبة الحضور', render: function (c) { return h('div', { class: 'cluster' }, [h('span', { class: 'nums', text: c.attendancePct + '٪' }), UI.progressBar(c.attendancePct, c.attendancePct < 90 ? 'danger' : 'mint')]); } }
            ],
            rows: cs, empty: 'لا توجد حصص في هذه الفترة.'
          })
        ]));

        if (trend.length) {
          out.appendChild(UI.panel('سجل الحضور اليومي', 'حالات الغياب والتأخر لكل يوم في الفترة.', null, [
            UI.table({
              cols: [
                { label: 'التاريخ', render: function (x) { return UI.fmtDate(x.date); } },
                { label: 'الحصص', render: function (x) { return h('span', { class: 'nums', text: String(x.sessions) }); } },
                { label: 'حاضر', render: function (x) { return h('span', { class: 'nums', text: String(x.present) }); } },
                { label: 'متأخر', render: function (x) { return h('span', { class: 'nums', text: String(x.late) }); } },
                { label: 'غائب', render: function (x) { return h('span', { class: 'nums', text: String(x.absent) }); } },
                { label: 'بعذر', render: function (x) { return h('span', { class: 'nums', text: String(x.excused) }); } },
                { label: 'نسبة الغياب', render: function (x) { return pct(x.absent, x.present + x.late + x.absent + x.excused) + '٪'; } }
              ],
              rows: trend.slice().reverse(), empty: 'لا بيانات.'
            })
          ]));
        }
        return out;
      }

      /* -------------------------------------------------- تبويب «الحرمان» */
      function buildDeprivationReport(rows, th) {
        var r = range();
        var top = rows.slice().sort(function (a, b) { return b.absencePct - a.absencePct; }).slice(0, 10);
        return {
          type: 'attendance-deprivation', refId: 'dep-' + r.from + '-' + r.to,
          title: 'قائمة الحرمان بالغياب',
          subtitle: 'الحد المعتمد ' + th + '٪ — ' + r.label + ' (' + UI.fmtDate(r.from) + ' إلى ' + UI.fmtDate(r.to) + ')',
          meta: [
            { label: 'الحد المعتمد', value: th + '٪' },
            { label: 'عدد الطلاب', value: rows.length },
            { label: 'أعلى نسبة غياب', value: (top[0] ? top[0].absencePct + '٪ — ' + top[0].name : '—') },
            { label: 'من', value: UI.fmtDate(r.from) },
            { label: 'إلى', value: UI.fmtDate(r.to) }
          ],
          sections: [
            { heading: 'الطلاب الذين بلغوا نسبة الحرمان', table: { cols: ['م', 'الطالب', 'الفصل', 'الغياب', 'الإجمالي', 'نسبة الغياب', 'المادة الأكثر غيابًا'], rows: rows.map(function (x, i) { return [i + 1, x.name, x.className, x.absent, x.total, x.absencePct + '٪', x.topSubject]; }) } },
            { heading: 'رسم بياني: أعلى نسب الغياب', chart: { type: 'bars', labels: top.map(function (x) { return x.name; }), series: [{ name: 'نسبة الغياب ٪', values: top.map(function (x) { return x.absencePct; }), color: COLORS.absent }] } }
          ],
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function deprivationTab() {
        var out = h('div');
        var r = range();
        var dep = S.deprivationList(r);
        var th = dep.threshold;
        var rows = dep.rows.map(function (x) {
          return Object.assign({}, x, { topSubject: topSubjectFor(x.studentId, r, filter()) });
        });
        var sumAll = S.attendanceSummary(r);
        var near = sumAll.rows.filter(function (x) { return x.total >= 3 && x.absencePct < th && x.absencePct >= th - 5; }).length;
        var maxRow = rows.slice().sort(function (a, b) { return b.absencePct - a.absencePct; })[0];
        var chartRows = rows.slice().sort(function (a, b) { return b.absencePct - a.absencePct; }).slice(0, 8);

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الحد المعتمد من الإعدادات', th + '٪', 'نسبة الغياب الموجبة للحرمان', 'gold'),
          UI.statCard('بلغوا نسبة الحرمان', String(rows.length), 'طالب في ' + r.label),
          UI.statCard('أعلى نسبة غياب', maxRow ? maxRow.absencePct + '٪' : '0٪', maxRow ? maxRow.name + ' — ' + maxRow.className : 'لا يوجد'),
          UI.statCard('مُنذرون قريبًا', String(near), 'نسبة بين ' + Math.max(0, th - 5) + '٪ و' + (th - 1) + '٪')
        ]));

        out.appendChild(UI.panel('قائمة الحرمان بالغياب', 'الطلاب الذين بلغوا الحد المعتمد (' + th + '٪) خلال ' + rangeLabel() + '. القائمة تُحسب على كامل المدرسة عبر S.deprivationList.', [
          UI.reportButton(function () { return buildDeprivationReport(rows, th); }, { label: 'طباعة قائمة الحرمان', class: 'btn-soft' })
        ], [
          UI.table({
            cols: [
              { label: 'الطالب', key: 'name' },
              { label: 'الفصل', key: 'className' },
              { label: 'الغياب / الإجمالي', render: function (x) { return h('span', { class: 'nums', dir: 'ltr', text: x.absent + ' / ' + x.total }); } },
              { label: 'نسبة الغياب', render: function (x) { return h('div', { class: 'cluster' }, [h('span', { class: 'nums', text: x.absencePct + '٪' }), UI.progressBar(x.absencePct, 'danger')]); } },
              { label: 'المادة الأكثر غيابًا', render: function (x) { return x.topSubject || '—'; } },
              { label: 'إجراء', render: function (x) { return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'إشعار ولي الأمر', onClick: function () { notifyGuardian(x, th); } }); } }
            ],
            rows: rows, empty: 'لا يوجد طلاب بلغوا نسبة الحرمان في هذه الفترة.'
          })
        ]));

        out.appendChild(UI.panel('أعلى نسب الغياب', 'الطلاب الأقرب لبلوغ حد الحرمان أو المتجاوزون له — ' + rangeLabel(), null, [
          UI.chart({
            type: 'bars',
            title: 'نسبة الغياب لكل طالب (٪)',
            labels: chartRows.map(function (x) { return x.name; }),
            series: [{ name: 'نسبة الغياب', values: chartRows.map(function (x) { return x.absencePct; }), color: COLORS.absent }]
          })
        ]));

        return out;
      }

      /* ============================================================== البناء */
      function build() {
        view.appendChild(headerPanel());
        view.appendChild(periodPanel());

        var body = h('div');
        var bar = UI.tabs(TABS, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', TABS[i].key === state.tab); });

        view.appendChild(bar);
        if (state.tab === 'analytics') body.appendChild(analyticsTab());
        else if (state.tab === 'deprivation') body.appendChild(deprivationTab());
        else body.appendChild(sessionsTab());
        view.appendChild(body);
      }

      build();
    }
  });
})();
