/* =============================================================================
   my-reports.js — تقاريري
   ---------------------------------------------------------------------------
   واجهتان منفصلتان بحسب الدور:
   • المعلم: حضور وانصراف المعلم + كشوفه الخاصة (غياب/تأخر/انتظام/حرمان) مقيّدة
     بفصوله وحصصه فقط + نشاطه في المنصة.
   • الطالب: كشفه الخاص فقط (حضور/تأخر/غياب/نسبة الحرمان + الحضور التفصيلي +
     التطوع والأنشطة) وطباعة كشف حضوره.
   لا يرى المعلم بيانات معلم آخر، ولا يرى الطالب إلا سجلاته.
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
  var COL = { present: '#1E7A5A', late: '#CE9433', absent: '#C2593F', excused: '#8A5A1E' };
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var RANGE_OPTS = [
    { value: 'day', label: 'يومي' },
    { value: 'week', label: 'أسبوعي' },
    { value: 'month', label: 'شهري' },
    { value: 'term', label: 'الفصل الدراسي' }
  ];

  /* ------------------------------------------------------------- مساعدات */
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function attLabel(id) { return (ATT[id] || {}).label || '—'; }
  function attBadge(id) { return ATT[id] ? UI.badge(ATT[id].label, ATT[id].tone) : '—'; }
  function monthName(key) {
    var p = String(key).split('-');
    return (MONTHS[Number(p[1]) - 1] || p[1]) + ' ' + p[0];
  }
  /** يحلّل طابعًا زمنيًا محليًا بمرونة (يتقبّل الدقائق بخانة واحدة مثل «13:5:00») */
  function parseWhen(s) {
    var m = String(s == null ? '' : s).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  function toMins(iso) {
    var d = parseWhen(iso);
    return d ? d.getHours() * 60 + d.getMinutes() : null;
  }
  function minsToClock(v) {
    if (v == null) return '—';
    var m = Math.round(v) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  /** وقت (HH:MM) من طابع زمني، بتحليل متسامح لا يعتمد على Date */
  function clock(iso) { return minsToClock(toMins(iso)); }
  function avgClock(list) {
    var vals = list.map(toMins).filter(function (v) { return v != null; });
    if (!vals.length) return '—';
    return minsToClock(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }
  function hoursBetween(a, b) {
    var x = parseWhen(a), y = parseWhen(b);
    if (!x || !y) return null;
    var d = (y.getTime() - x.getTime()) / 36e5;
    return d < 0 ? null : Math.round(d * 10) / 10;
  }
  function schoolDays(range) {
    var today = new Date().toISOString().slice(0, 10);
    var from = range.from, to = range.to > today ? today : range.to;
    var n = 0;
    for (var d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 5 && d.getDay() !== 6) n++;      /* الجمعة والسبت نهاية أسبوع */
    }
    return n;
  }
  function pctTone(p, limit) {
    if (limit && p >= limit) return 'danger';
    if (limit && p >= limit - 8) return 'warn';
    if (p <= 5) return 'mint';
    return 'warn';
  }
  function periodField(kind, onPick) {
    var f = UI.field({ name: 'period', label: 'الفترة', type: 'select', value: kind, options: RANGE_OPTS });
    f.input.addEventListener('change', function () { onPick(f.input.value); });
    return f;
  }
  function tableOrEmpty(rows, tableSpec, emptyMsg) {
    return rows.length ? UI.table(tableSpec) : UI.empty(emptyMsg, null);
  }
  function rangeLabel(kind, rng) {
    return (RANGE_OPTS.find(function (o) { return o.value === kind; }) || {}).label + ' — ' + rng.label + ' (' + rng.from + ' ← ' + rng.to + ')';
  }
  /** زر تقرير يعمل فعلًا (يفتح إطار الطباعة) ويؤكّد بتبليغ */
  function reportBtn(buildSpec, opts) {
    var b = UI.reportButton(buildSpec, opts || {});
    b.addEventListener('click', function () { UI.toast('جُهّز الكشف للطباعة / التصدير', 'ok'); });
    return b;
  }

  /* ============================================================ واجهة المعلم */
  function renderTeacher(view) {
    var teacherId = S.session.userId;
    var me = S.user(teacherId) || {};

    /* فصوله المثبّتة (وعند عدم التثبيت نعتمد إسناداته القائمة) */
    var locked = S.lockedAssignmentsOf(teacherId);
    var asgs = locked.length ? locked : S.assignmentsOf(teacherId);
    var myClassIds = uniq(asgs.map(function (a) { return a.classId; }));
    var classes = myClassIds.map(function (id) { return S.klass(id); }).filter(Boolean);

    var state = { kind: 'month' };
    function rng() { return S.rangeOf(state.kind); }
    function paint() { clear(view); build(); }

    /* ------------------------------------------------ كشف عام قابل للطباعة */
    function makeReport(spec) {
      return reportBtn(function () { return spec(); }, { label: 'تصدير PDF / طباعة', class: 'btn-outline' });
    }
    function kashfReport(o) {
      return function () {
        var r = rng();
        return {
          type: o.type, refId: teacherId + '-' + r.from + '-' + r.to,
          title: o.title, subtitle: o.subtitle,
          meta: [
            { label: 'المعلم', value: me.name },
            { label: 'الفصول', value: classes.map(function (c) { return c.name; }).join('، ') || '—' },
            { label: 'الفترة', value: rangeLabel(state.kind, r) },
            { label: 'عدد الطلاب في الكشف', value: String(o.rows.length) }
          ],
          sections: [].concat(
            o.chart ? [{ heading: o.chartHeading || 'الرسم البياني', chart: o.chart }] : [],
            [{ heading: o.heading, table: { cols: o.cols, rows: o.rows } }],
            o.note ? [{ heading: 'ملاحظة', text: o.note }] : []
          ),
          signatures: o.signatures || ['معلم المادة', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      };
    }

    /* ------------------------------------------------------------ البيانات */
    function tally(sessions) {
      var c = { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
      sessions.forEach(function (s) {
        (s.records || []).forEach(function (r) { if (c[r.status] != null) c[r.status]++; c.total++; });
      });
      return c;
    }

    function build() {
      var r = rng();
      var checkins = S.checkinsOf(teacherId, r);
      var withIn = checkins.filter(function (c) { return c.checkIn; });
      var withOut = checkins.filter(function (c) { return c.checkOut; });
      var sessions = S.sessionsInRange(r, { teacherId: teacherId });
      var closed = sessions.filter(function (s) { return s.status === 'closed'; });
      var sd = schoolDays(r);
      var attended = uniq(withIn.map(function (c) { return c.date; })).length;
      var compliance = sd ? Math.min(100, Math.round((attended / sd) * 100)) : 0;

      /* الترويسة */
      view.appendChild(h('div', { class: 'panel' }, [h('div', { class: 'panel-body' }, [
        h('div', { class: 'between' }, [
          h('div', {}, [
            h('span', { class: 'eyebrow', text: 'الدور الحالي: معلم' }),
            h('p', { class: 'muted mt-3', text: 'تقريري عن حضور وانصراف المعلم، وكشوفي الخاصة بتقارير الطلاب في فصولي وحصصي فقط.' })
          ]),
          h('div', { class: 'cluster' }, [
            UI.badge(me.name || '—', 'plain'),
            UI.badge((me.subjects || []).join('، ') || 'لا مواد مثبّتة', 'mint')
          ])
        ])
      ])]));

      /* اختيار الفترة */
      view.appendChild(UI.panel('الفترة', 'اختر النطاق لتُحدَّث البطاقات والكشوف والرسوم تلقائيًا.', null, [
        h('div', { class: 'form-grid' }, [periodField(state.kind, function (v) { state.kind = v; paint(); }).wrap])
      ]));

      /* ٢) البطاقات */
      view.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('أيام حضوري', String(attended), 'يوم مسجّل فيه دخول'),
        UI.statCard('أيام انصرافي المسجّل', String(withOut.length), 'يوم مكتمل'),
        UI.statCard('متوسط وقت الدخول', avgClock(withIn.map(function (c) { return c.checkIn; })), 'من ' + checkins.length + ' سجل'),
        UI.statCard('متوسط وقت الانصراف', avgClock(withOut.map(function (c) { return c.checkOut; })), withOut.length + ' انصراف'),
        UI.statCard('حصصي المغلقة', closed.length + ' / ' + sessions.length, 'مغلقة / الإجمالي'),
        UI.statCard('نسبة التزامي بالتسجيل', compliance + '٪', attended + ' من ' + sd + ' يوم دراسي', compliance >= 80 ? 'gold' : null)
      ]));

      /* ٣) جدول الحضور والانصراف */
      view.appendChild(UI.panel('سجل حضوري وانصرافي', 'من ' + r.from + ' إلى ' + r.to + '.', [
        makeReport(function () {
          var rr = rng();
          return {
            type: 'teacher-checkin', refId: teacherId + '-' + rr.from + '-' + rr.to,
            title: 'تقرير حضور وانصراف المعلم', subtitle: me.name,
            meta: [
              { label: 'المعلم', value: me.name },
              { label: 'الفترة', value: rangeLabel(state.kind, rr) },
              { label: 'أيام الحضور', value: String(attended) },
              { label: 'نسبة الالتزام', value: compliance + '٪' }
            ],
            sections: [{
              heading: 'كشف الحضور والانصراف',
              table: {
                cols: ['التاريخ', 'وقت الدخول', 'وقت الانصراف', 'عدد الساعات', 'الحالة'],
                rows: S.checkinsOf(teacherId, rr).map(function (c) {
                  var hrs = hoursBetween(c.checkIn, c.checkOut);
                  return [UI.fmtDate(c.date), clock(c.checkIn), c.checkOut ? clock(c.checkOut) : '—',
                          hrs == null ? '—' : hrs, c.checkOut ? 'مكتمل' : 'بلا انصراف'];
                })
              }
            }],
            signatures: ['المعلم', 'وكيل شؤون المعلمين', 'مدير المدرسة']
          };
        })
      ], [
        tableOrEmpty(checkins, {
          cols: [
            { label: 'التاريخ', render: function (c) { return UI.fmtDate(c.date); } },
            { label: 'وقت الدخول', render: function (c) { return h('span', { class: 'nums', text: clock(c.checkIn) }); } },
            { label: 'وقت الانصراف', render: function (c) { return h('span', { class: 'nums', text: c.checkOut ? clock(c.checkOut) : '—' }); } },
            { label: 'عدد الساعات', render: function (c) {
              var hrs = hoursBetween(c.checkIn, c.checkOut);
              return h('span', { class: 'nums', text: hrs == null ? '—' : String(hrs) });
            } },
            { label: 'الحالة', render: function (c) { return UI.badge(c.checkOut ? 'مكتمل' : 'بلا انصراف', c.checkOut ? 'mint' : 'amber'); } }
          ],
          rows: checkins, empty: 'لا سجلات حضور وانصراف في هذه الفترة.'
        }, 'لا سجلات حضور وانصراف في هذه الفترة.')
      ]));

      /* ٤) الرسوم البيانية الإلزامية */
      var trend = S.attendanceTrend(r, { teacherId: teacherId });
      var lineChart = trend.length ? UI.chart({
        type: 'line', title: 'الغياب اليومي في فصولي',
        labels: trend.map(function (d) { return String(d.date).slice(5); }),
        series: [{ name: 'عدد الغياب', values: trend.map(function (d) { return d.absent || 0; }), color: COL.absent }]
      }) : UI.empty('لا توجد حصص مسجّلة في هذه الفترة لعرض اتجاه الغياب.', null);

      var byClass = classes.map(function (c) {
        var ss = sessions.filter(function (s) { return s.classId === c.id; });
        var t = tally(ss);
        return { name: c.name, present: t.present, late: t.late, absent: t.absent };
      });
      var barsChart = byClass.length ? UI.chart({
        title: 'حالات الحضور لكل فصل أُدرّسه',
        labels: byClass.map(function (x) { return x.name; }),
        showValues: false,
        series: [
          { name: 'حاضر', values: byClass.map(function (x) { return x.present; }), color: COL.present },
          { name: 'متأخر', values: byClass.map(function (x) { return x.late; }), color: COL.late },
          { name: 'غائب', values: byClass.map(function (x) { return x.absent; }), color: COL.absent }
        ]
      }) : UI.empty('لا فصول مثبّتة لعرض مقارنة الحالات.', null);

      var tot = tally(sessions);
      var donutChart = UI.chart({
        type: 'donut', title: 'نسب حالات الحضور في حصصي',
        labels: ['حاضر', 'متأخر', 'غائب', 'بعذر'],
        series: [{ name: 'الحالات', values: [tot.present, tot.late, tot.absent, tot.excused],
                   colors: [COL.present, COL.late, COL.absent, COL.excused] }]
      });
      var donutLegend = h('div', { class: 'ui-legend' }, ['present', 'late', 'absent', 'excused'].map(function (k) {
        return h('span', { class: 'ui-legend-item' }, [
          h('i', { style: { background: COL[k] } }),
          h('span', { text: attLabel(k) + ' · ' + tot[k] })
        ]);
      }));

      view.appendChild(UI.panel('الرسوم البيانية', 'اتجاه الغياب، ومقارنة الحالات لكل فصل، ونسب الحالات في حصصي.', null, [
        lineChart,
        h('div', { class: 'grid-2-app' }, [barsChart, h('div', {}, [donutChart, donutLegend])])
      ]));

      /* ٥) الكشوف الخاصة */
      var sum = S.attendanceSummary(r, { teacherId: teacherId });
      var limit = S.db.settings.deprivationPct;
      var rowsAll = sum.rows;

      var topAbsent = rowsAll.filter(function (x) { return x.absent > 0; })
        .slice().sort(function (a, b) { return b.absent - a.absent || b.absencePct - a.absencePct; }).slice(0, 10);
      var topLate = rowsAll.filter(function (x) { return x.late > 0; })
        .slice().sort(function (a, b) { return b.late - a.late || b.absencePct - a.absencePct; }).slice(0, 10);
      var regular = rowsAll.filter(function (x) { return x.total >= 3; })
        .slice().sort(function (a, b) { return b.attendancePct - a.attendancePct || a.absent - b.absent; }).slice(0, 10);

      var dep = S.deprivationList(r);
      var depRows = dep.rows.filter(function (x) { return myClassIds.indexOf(x.classId) > -1; })
        .slice().sort(function (a, b) { return b.absencePct - a.absencePct; });

      function studentCell(x) { return h('strong', { style: { fontWeight: '500' }, text: x.name }); }
      function barCell(x, p) { return h('div', { class: 'cluster' }, [UI.progressBar(p, pctTone(p, limit)), h('span', { class: 'nums', text: p + '٪' })]); }

      var kashfDefs = [
        {
          title: 'الطلاب الأكثر غيابًا', sub: 'أعلى 10 طلاب من فصولي في نطاق التقرير.',
          rows: topAbsent, empty: 'لا غياب مسجّل في فصولي خلال هذه الفترة.',
          type: 'teacher-absence', reportTitle: 'كشف الطلاب الأكثر غيابًا',
          cols: [
            { label: 'الطالب', render: studentCell },
            { label: 'الفصل', render: function (x) { return x.className; } },
            { label: 'عدد الغياب', render: function (x) { return h('span', { class: 'nums', text: String(x.absent) }); } },
            { label: 'نسبة الغياب', render: function (x) { return barCell(x, x.absencePct); } }
          ],
          reportRows: function () { return topAbsent.map(function (x) { return [x.name, x.className, x.absent, x.absencePct + '٪', x.total]; }); },
          reportCols: ['الطالب', 'الفصل', 'عدد الغياب', 'نسبة الغياب', 'إجمالي الحصص'],
          chart: function () { return { type: 'bar', title: 'أعلى 10 غيابًا', labels: topAbsent.map(function (x) { return x.name; }),
            series: [{ name: 'عدد الغياب', values: topAbsent.map(function (x) { return x.absent; }), color: COL.absent }] }; }
        },
        {
          title: 'الطلاب الأكثر تأخرًا', sub: 'أعلى 10 طلاب تأخرًا من فصولي في نطاق التقرير.',
          rows: topLate, empty: 'لا تأخر مسجّل في فصولي خلال هذه الفترة.',
          type: 'teacher-late', reportTitle: 'كشف الطلاب الأكثر تأخرًا',
          cols: [
            { label: 'الطالب', render: studentCell },
            { label: 'الفصل', render: function (x) { return x.className; } },
            { label: 'عدد التأخر', render: function (x) { return h('span', { class: 'nums', text: String(x.late) }); } },
            { label: 'نسبة الالتزام', render: function (x) { return barCell(x, x.attendancePct); } }
          ],
          reportRows: function () { return topLate.map(function (x) { return [x.name, x.className, x.late, x.attendancePct + '٪', x.total]; }); },
          reportCols: ['الطالب', 'الفصل', 'عدد التأخر', 'نسبة الالتزام', 'إجمالي الحصص'],
          chart: function () { return { type: 'bar', title: 'أعلى 10 تأخرًا', labels: topLate.map(function (x) { return x.name; }),
            series: [{ name: 'عدد التأخر', values: topLate.map(function (x) { return x.late; }), color: COL.late }] }; }
        },
        {
          title: 'الطلاب الأكثر حضورًا (المنتظمون)', sub: 'أعلى 10 طلاب انتظامًا من فصولي (لا يقل مجموع حصصهم عن 3).',
          rows: regular, empty: 'لا توجد سجلات كافية لعرض المنتظمين.',
          type: 'teacher-regular', reportTitle: 'كشف الطلاب المنتظمين',
          cols: [
            { label: 'الطالب', render: studentCell },
            { label: 'الفصل', render: function (x) { return x.className; } },
            { label: 'حاضر', render: function (x) { return h('span', { class: 'nums', text: String(x.present) }); } },
            { label: 'نسبة الالتزام', render: function (x) { return barCell(x, x.attendancePct); } }
          ],
          reportRows: function () { return regular.map(function (x) { return [x.name, x.className, x.present, x.late, x.attendancePct + '٪']; }); },
          reportCols: ['الطالب', 'الفصل', 'حاضر', 'متأخر', 'نسبة الالتزام'],
          chart: function () { return { type: 'bar', title: 'أعلى 10 انتظامًا', labels: regular.map(function (x) { return x.name; }),
            series: [{ name: 'نسبة الالتزام', values: regular.map(function (x) { return x.attendancePct; }), color: COL.present }] }; }
        },
        {
          title: 'الطلاب بلغوا نسبة الحرمان', sub: 'من فصولي — الحد النظامي: ' + limit + '٪ · القائمة اللائحية.',
          rows: depRows, empty: 'لا طالب من فصولي بلغ نسبة الحرمان في هذه الفترة.',
          type: 'teacher-deprivation', reportTitle: 'كشف الطلاب بلغوا نسبة الحرمان',
          note: 'يُدرج الطالب في قائمة الحرمان عند بلوغ نسبة غيابه الحد النظامي (' + limit + '٪) فأكثر، ويُطبَّق بحقه ما ورد في لائحة المواظبة والسلوك.',
          cols: [
            { label: 'الطالب', render: studentCell },
            { label: 'الفصل', render: function (x) { return x.className; } },
            { label: 'نسبة الغياب', render: function (x) { return barCell(x, x.absencePct); } },
            { label: 'الغياب / الإجمالي', render: function (x) { return h('span', { class: 'nums', text: x.absent + ' / ' + x.total }); } },
            { label: 'الحالة', render: function () { return UI.badge('بلغ الحد', 'brand'); } }
          ],
          reportRows: function () { return depRows.map(function (x) { return [x.name, x.className, x.absencePct + '٪', x.absent, x.total, 'بلغ الحد النظامي']; }); },
          reportCols: ['الطالب', 'الفصل', 'نسبة الغياب', 'الغياب', 'إجمالي الحصص', 'الحالة'],
          chart: function () { return { type: 'bar', title: 'نسب الغياب (بلغوا الحد)', labels: depRows.map(function (x) { return x.name; }),
            series: [{ name: 'نسبة الغياب', values: depRows.map(function (x) { return x.absencePct; }), color: COL.absent }] }; }
        }
      ];

      kashfDefs.forEach(function (d) {
        var btn = makeReport(kashfReport({
          type: d.type, title: d.reportTitle, subtitle: d.sub, heading: 'الكشف',
          cols: d.reportCols, rows: d.reportRows(), chart: d.chart(), note: d.note
        }));
        view.appendChild(UI.panel(d.title, d.sub, [btn], [
          tableOrEmpty(d.rows, {
            cols: d.cols, rows: d.rows, empty: d.empty
          }, d.empty)
        ]));
      });

      /* ٦) نشاطي في المنصة */
      var logins = S.activities({ userId: teacherId, from: r.from, to: r.to, type: 'login' }).length;
      var loginRate = sd ? Math.min(100, Math.round((logins / sd) * 100)) : 0;
      var violations = S.list('violations').filter(function (v) {
        return v.teacherId === teacherId && v.date >= r.from && v.date <= r.to;
      }).length;
      var decided = S.list('activityReqs').filter(function (a) {
        return a.decidedBy === S.session.name && a.decidedAt &&
          a.decidedAt.slice(0, 10) >= r.from && a.decidedAt.slice(0, 10) <= r.to;
      }).length;
      var level = loginRate >= 70 ? 'متميّز' : (loginRate >= 25 ? 'منتظم' : (logins > 0 ? 'ضعيف التفعيل' : 'لم يفعّل المنصة'));

      view.appendChild(UI.panel('نشاطي في المنصة', 'مؤشرات تفعيلك للمنصة خلال نطاق التقرير.', [
        makeReport(function () {
          var rr = rng();
          return {
            type: 'teacher-activity', refId: teacherId + '-act-' + rr.from + '-' + rr.to,
            title: 'كشف نشاط المعلم في المنصة', subtitle: me.name,
            meta: [
              { label: 'المعلم', value: me.name },
              { label: 'الفترة', value: rangeLabel(state.kind, rr) },
              { label: 'التقييم', value: level }
            ],
            sections: [{
              heading: 'مؤشرات النشاط',
              table: { cols: ['المؤشر', 'القيمة'], rows: [
                ['عدد الدخولات', logins],
                ['نسبة تفعيل الدخول', loginRate + '٪'],
                ['حصصي المغلقة', closed.length],
                ['المخالفات المسجّلة', violations],
                ['طلبات النشاط التي رُدّ عليها', decided]
              ] }
            }, { heading: 'التقييم', text: 'تقييم التفعيل: ' + level + ' — نسبة الدخول ' + loginRate + '٪ من ' + sd + ' يوم دراسي.' }],
            signatures: ['المعلم', 'مدير المدرسة']
          };
        })
      ], [
        h('div', { class: 'stat-row' }, [
          UI.statCard('دخولاتي في النطاق', String(logins), 'دخول'),
          UI.statCard('حصصي المغلقة', String(closed.length), 'حصة مغلقة'),
          UI.statCard('مخالفاتي المسجّلة', String(violations), 'مخالفة'),
          UI.statCard('طلبات النشاط التي ردّيت عليها', String(decided), 'طلب')
        ]),
        h('div', { class: 'muted-block mt-3', text: 'التقييم المختصر: ' + level + ' · نسبة الدخول ' + loginRate + '٪ من ' + sd + ' يوم دراسي المسجّلة في هذه الفترة.' })
      ]));
    }

    if (!asgs.length) {
      view.appendChild(UI.panel('لا إسنادات بعد', null, null, [
        h('div', { class: 'muted-block', text: 'لم يُثبّت وكيل شؤون الطلاب فصولك بعد؛ ستظهر كشوفك الخاصة بعد التثبيت. ويمكنك متابعة سجل حضورك وانصرافك ونشاطك أدناه.' })
      ]));
    }
    build();
  }

  /* ============================================================ واجهة الطالب */
  function renderStudent(view) {
    var me = S.find('students', S.session.userId) || null;
    var classId = me ? me.classId : null;
    var cls = classId ? S.klass(classId) : null;

    var state = { kind: 'term' };
    function rng() { return S.rangeOf(state.kind); }
    function paint() { clear(view); build(); }

    function build() {
      var r = rng();
      var limit = S.db.settings.deprivationPct;

      var sum = classId ? S.attendanceSummary(r, { classId: classId }) : { rows: [] };
      var row = sum.rows.find(function (x) { return me && x.studentId === me.id; }) ||
        { studentId: me ? me.id : '', name: me ? me.name : '—', classId: classId,
          className: cls ? cls.name : '—', present: 0, late: 0, absent: 0, excused: 0, total: 0, absencePct: 0, attendancePct: 0 };

      var status = row.absencePct >= limit ? { label: 'بلغت نسبة الحرمان', tone: 'brand' }
        : (row.absencePct >= limit - 8 ? { label: 'قريب من نسبة الحرمان', tone: 'amber' }
        : { label: 'دون نسبة الحرمان', tone: 'mint' });

      /* سجلات الطالب التفصيلية */
      var sessions = classId ? S.sessionsInRange(r, { classId: classId }).slice().sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date));
      }) : [];
      var myRecs = [];
      sessions.forEach(function (s) {
        var rec = (s.records || []).find(function (x) { return me && x.studentId === me.id; });
        if (rec) myRecs.push({ date: s.date, subject: s.subject, status: rec.status });
      });

      /* الترويسة */
      view.appendChild(h('div', { class: 'panel' }, [h('div', { class: 'panel-body' }, [
        h('div', { class: 'between' }, [
          h('div', {}, [
            h('span', { class: 'eyebrow', text: 'الدور الحالي: طالب' }),
            h('p', { class: 'muted mt-3', text: 'كشفي الخاص: حضوري وتأخري وغيابي وحالتي من نسبة الحرمان، إضافة إلى تطوعي وأنشطتي.' })
          ]),
          h('div', { class: 'cluster' }, [
            UI.badge(me ? me.name : '—', 'plain'),
            UI.badge(cls ? cls.name : 'غير مسكّن', 'mint')
          ])
        ])
      ])]));

      /* اختيار الفترة (افتراضيًا الفصل الحالي) */
      view.appendChild(UI.panel('الفترة', 'افتراضيًا كامل الفصل الدراسي الحالي.', null, [
        h('div', { class: 'form-grid' }, [periodField(state.kind, function (v) { state.kind = v; paint(); }).wrap])
      ]));

      /* ٢) البطاقات */
      view.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('عدد حصصي', String(row.total), 'سجل حضور'),
        UI.statCard('الحضور', String(row.present), 'حاضر'),
        UI.statCard('التأخر', String(row.late), 'متأخر'),
        UI.statCard('الغياب', String(row.absent), 'غائب', row.absent ? 'gold' : null),
        UI.statCard('نسبة الغياب', row.absencePct + '٪', row.absent + ' من ' + row.total),
        UI.statCard('حالتي من نسبة الحرمان', status.label, 'الحد النظامي: ' + limit + '٪', status.tone === 'brand' ? 'gold' : null)
      ]));

      view.appendChild(h('div', { class: 'cluster', style: { marginBottom: '18px' } }, [
        UI.badge(status.label, status.tone),
        h('span', { class: 'muted', text: 'نسبة الالتزام بالحضور: ' + row.attendancePct + '٪ · الحد النظامي للحرمان: ' + limit + '٪' })
      ]));

      /* ٣) جدول تفصيلي بسجلات الحضور */
      view.appendChild(UI.panel('سجلات حضوري التفصيلية', 'من ' + r.from + ' إلى ' + r.to + '.', [
        makeStudentReportBtn(function () { return attendanceSpec(); })
      ], [
        tableOrEmpty(myRecs, {
          cols: [
            { label: 'التاريخ', render: function (x) { return UI.fmtDate(x.date); } },
            { label: 'المادة', render: function (x) { return x.subject || '—'; } },
            { label: 'الحالة', render: function (x) { return attBadge(x.status); } }
          ],
          rows: myRecs, empty: 'لا سجلات حضور لك في هذه الفترة.'
        }, 'لا سجلات حضور لك في هذه الفترة.')
      ]));

      /* ٤) الرسوم */
      var donut = UI.chart({
        type: 'donut', title: 'حالات حضوري',
        labels: ['حاضر', 'متأخر', 'غائب', 'بعذر'],
        series: [{ name: 'حالاتي', values: [row.present, row.late, row.absent, row.excused],
                   colors: [COL.present, COL.late, COL.absent, COL.excused] }]
      });
      var legend = h('div', { class: 'ui-legend' }, ['present', 'late', 'absent', 'excused'].map(function (k) {
        return h('span', { class: 'ui-legend-item' }, [
          h('i', { style: { background: COL[k] } }),
          h('span', { text: attLabel(k) + ' · ' + (row[k] || 0) })
        ]);
      }));

      var monthMap = {};
      myRecs.forEach(function (x) {
        if (x.status !== 'absent') return;
        var key = String(x.date).slice(0, 7);
        monthMap[key] = (monthMap[key] || 0) + 1;
      });
      var monthKeys = Object.keys(monthMap).sort();
      var bars = UI.chart({
        type: 'bar', title: 'غيابي الشهري',
        labels: monthKeys.map(monthName),
        series: [{ name: 'عدد أيام الغياب', values: monthKeys.map(function (k) { return monthMap[k]; }), color: COL.absent }]
      });

      view.appendChild(UI.panel('الرسوم البيانية', 'نسب حالاتي وغيابي الشهري.', null, [
        h('div', { class: 'grid-2-app' }, [h('div', {}, [donut, legend]), bars])
      ]));

      /* ٥) أنشطتي وتطوعي */
      var regs = S.list('programRegs').filter(function (x) { return me && x.studentId === me.id && x.status === 'approved'; });
      var hours = regs.reduce(function (a, x) { return a + (x.hours || 0); }, 0);
      var reqs = S.list('activityReqs').filter(function (x) { return me && x.studentId === me.id; });

      view.appendChild(UI.panel('أنشطتي وتطوعي', 'ساعات التطوع المعتمدة ومشاركاتي في الأنشطة وحالتها.', null, [
        h('div', { class: 'stat-row' }, [
          UI.statCard('ساعات التطوع المعتمدة', String(hours), regs.length + ' برنامج', hours ? 'gold' : null),
          UI.statCard('مشاركاتي في الأنشطة', String(reqs.length), 'طلب مشاركة')
        ]),
        tableOrEmpty(reqs, {
          cols: [
            { label: 'النشاط', render: function (x) { var a = S.find('activities', x.activityId); return a ? a.title : '—'; } },
            { label: 'المدة خارج الصف', render: function (x) { return h('span', { class: 'nums', text: (x.duration || 0) + ' دقيقة' }); } },
            { label: 'السبب', render: function (x) { return x.reason || '—'; } },
            { label: 'الحالة', render: function (x) {
              var map = { pending: { l: 'بانتظار ردّ المعلم', t: 'amber' }, approved: { l: 'مقبول', t: 'mint' }, declined: { l: 'معتذر عنه', t: 'plain' } };
              var s = map[x.status] || { l: x.status, t: 'plain' };
              return UI.badge(s.l, s.t);
            } },
            { label: 'ملاحظة المعلم', render: function (x) { return x.note || '—'; } }
          ],
          rows: reqs, empty: 'لا مشاركات في الأنشطة بعد.'
        }, 'لا مشاركات في الأنشطة بعد.')
      ]));

      /* ٦) طباعة كشف حضوري */
      view.appendChild(UI.panel('طباعة كشف حضوري', 'كشف رسمي بترويسة المدرسة وباركود، باسم الطالب وصفه.', [
        makeStudentReportBtn(function () { return attendanceSpec(); }, 'طباعة كشف حضوري')
      ], [
        h('div', { class: 'muted-block', text: 'يتضمّن الكشف بيانات الطالب وصفه وحالات الحضور والغياب والملخص الرسومي، ويحمل رقم تقرير وباركود للتحقق.' })
      ]));

      function attendanceSpec() {
        return {
          type: 'student-attendance', refId: (me ? me.id : 'student') + '-' + r.from + '-' + r.to,
          title: 'كشف حضور الطالب', subtitle: (me ? me.name : '—') + ' — ' + (cls ? cls.name : 'غير مسكّن'),
          meta: [
            { label: 'اسم الطالب', value: me ? me.name : '—' },
            { label: 'الصف والفصل', value: cls ? cls.name : 'غير مسكّن' },
            { label: 'رقم الهوية', value: me ? me.nationalId : '—' },
            { label: 'الفترة', value: rangeLabel(state.kind, r) },
            { label: 'حالتي من الحرمان', value: status.label }
          ],
          sections: [
            { heading: 'الملخّص', text: 'إجمالي الحصص: ' + row.total + ' · حاضر: ' + row.present + ' · متأخر: ' + row.late +
              ' · غائب: ' + row.absent + ' · بعذر: ' + row.excused + '\nنسبة الغياب: ' + row.absencePct + '٪ · نسبة الالتزام: ' + row.attendancePct + '٪' },
            { heading: 'حالات حضوري', chart: { type: 'donut', labels: ['حاضر', 'متأخر', 'غائب', 'بعذر'],
              series: [{ name: 'حالاتي', values: [row.present, row.late, row.absent, row.excused], colors: [COL.present, COL.late, COL.absent, COL.excused] }] } },
            { heading: 'سجل الحضور التفصيلي', table: {
              cols: ['التاريخ', 'المادة', 'الحالة'],
              rows: myRecs.map(function (x) { return [UI.fmtDate(x.date), x.subject || '—', attLabel(x.status)]; })
            } }
          ],
          signatures: ['معلم المادة', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }
    }

    function makeStudentReportBtn(specFn, label) {
      return reportBtn(specFn, { label: label || 'تصدير PDF / طباعة', class: 'btn-outline' });
    }

    if (!me) {
      view.appendChild(UI.panel('لا ملف طالب مرتبط', null, null, [
        h('div', { class: 'muted-block', text: 'حسابك غير مرتبط بملف طالب — راجع وكيل شؤون الطلاب.' })
      ]));
      return;
    }
    build();
  }

  App.register({
    id: 'my-reports',
    label: 'تقاريري',
    icon: '&#128209;',
    roles: ['teacher', 'student'],
    render: function (view) {
      if (S.session.role === 'teacher') renderTeacher(view);
      else renderStudent(view);
    }
  });
})();
