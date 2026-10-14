/* =============================================================================
   analytics.js — التقارير التحليلية (مركز التقارير الدورية لكل الأطراف)
   ---------------------------------------------------------------------------
   خمسة تبويبات: تقرير تابعني العام · تفعيل المعلمين · الغياب والحرمان ·
   الخدمات (المخالفات/الاستئذان/التطوع/النشاط) · الفصول الدراسية (يحدّد مدير
   المدرسة بداية كل فصل ونهايته ونسبة الحرمان).
   منتقي فترة موحّد (يومي/أسبوعي/شهري/نهاية الفصل) عبر S.rangeOf، ورسوم بيانية
   SVG داخل الشاشة والتقارير المطبوعة، وكل تقرير يُصدَّر PDF بترويسة المدرسة
   وباركود (TBN-ANL) ووقت الطباعة.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ------------------------------------------------------------- ثوابت */
  var PERIODS = [
    { key: 'day', label: 'يومي' },
    { key: 'week', label: 'أسبوعي' },
    { key: 'month', label: 'شهري' },
    { key: 'term', label: 'نهاية الفصل' }
  ];
  var TABS = [
    { key: 'overview', label: 'تقرير تابعني العام' },
    { key: 'teachers', label: 'تفعيل المعلمين' },
    { key: 'absence', label: 'الغياب والحرمان' },
    { key: 'services', label: 'الخدمات' },
    { key: 'terms', label: 'الفصول الدراسية' }
  ];
  var COLORS = { present: '#1E7A5A', late: '#C97F2C', absent: '#C2593F', excused: '#6B6152' };
  var LEVEL_TONE = { 'متميّز': 'mint', 'منتظم': 'amber', 'ضعيف التفعيل': 'brand', 'لم يفعّل تابعني': 'plain' };
  var VIO_STATUS = { guidance_pending: 'بانتظار التوجيه', deputy_pending: 'بانتظار الوكيل', closed: 'مغلقة' };
  var PERM_STATUS = { deputy_pending: 'بانتظار الوكيل', granted: 'ممنوح' };
  var REQ_STATUS = { pending: 'بانتظار القرار', approved: 'مقبول', rejected: 'معتذر' };

  /* ------------------------------------------------------------ مساعدات */
  function roleName() {
    var r = S.roles.find(function (x) { return x.id === S.session.role; });
    return r ? r.name : S.session.role;
  }
  function n(v) { return h('span', { class: 'nums', text: String(v) }); }
  function inRange(dateStr, range) {
    if (!dateStr) return false;
    var d = String(dateStr).slice(0, 10);
    return d >= range.from && d <= range.to;
  }
  function parseD(s) { var p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function dayDiff(a, b) { return Math.round((parseD(b).getTime() - parseD(a).getTime()) / 864e5); }
  function pctText(v) { return v + '٪'; }
  function shortName(name) {
    return String(name || '').replace(/^(أ\.|د\.|م\.|أستاذ|الأستاذ)\s*/u, '').trim();
  }
  function termInfo(t) {
    if (!t || !t.from || !t.to) return { status: 'غير محدّد', tone: 'plain', total: 0, remaining: null, elapsed: 0, pct: 0 };
    var total = dayDiff(t.from, t.to) + 1;
    var today = UI.today(), status, tone, remaining, elapsed;
    if (today < t.from) { status = 'لم يبدأ'; tone = 'amber'; elapsed = 0; remaining = total; }
    else if (today > t.to) { status = 'منتهٍ'; tone = 'brand'; elapsed = total; remaining = 0; }
    else { status = 'جارٍ'; tone = 'mint'; elapsed = dayDiff(t.from, today) + 1; remaining = dayDiff(today, t.to); }
    return { status: status, tone: tone, total: total, remaining: remaining, elapsed: elapsed,
      pct: total > 0 ? Math.round((elapsed / total) * 100) : 0 };
  }
  function tally(list, keyOf) {
    var map = {};
    list.forEach(function (x) { var k = keyOf(x); if (k == null || k === '') return; map[k] = (map[k] || 0) + 1; });
    return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  /* ------------------------------------------------ بُناة مواصفات الرسوم */
  function specTrend(trend) {
    var cap = trend.slice(-20);
    return {
      type: 'bar',
      labels: cap.map(function (d) { return String(d.date).slice(5); }),
      series: [
        { name: 'حاضر', values: cap.map(function (d) { return d.present; }), color: COLORS.present },
        { name: 'متأخر', values: cap.map(function (d) { return d.late; }), color: COLORS.late },
        { name: 'غائب', values: cap.map(function (d) { return d.absent; }), color: COLORS.absent }
      ],
      showValues: cap.length <= 11
    };
  }
  function statusTotals(trend) {
    return trend.reduce(function (a, d) {
      a.present += d.present || 0; a.late += d.late || 0; a.absent += d.absent || 0; a.excused += d.excused || 0;
      return a;
    }, { present: 0, late: 0, absent: 0, excused: 0 });
  }
  function statusEntries(totals) {
    return [
      { label: 'حاضر', value: totals.present, color: COLORS.present },
      { label: 'متأخر', value: totals.late, color: COLORS.late },
      { label: 'غائب', value: totals.absent, color: COLORS.absent },
      { label: 'بعذر', value: totals.excused, color: COLORS.excused }
    ];
  }
  function specStatus(totals) {
    return { type: 'donut', series: [{ name: 'حالات الطلاب',
      values: [totals.present, totals.late, totals.absent, totals.excused],
      colors: [COLORS.present, COLORS.late, COLORS.absent, COLORS.excused] }] };
  }
  function specClasses(daily) {
    return {
      type: 'bar', showValues: true,
      labels: daily.map(function (c) { return c.className; }),
      series: [
        { name: 'حاضر', values: daily.map(function (c) { return c.present; }), color: COLORS.present },
        { name: 'غائب', values: daily.map(function (c) { return c.absent; }), color: COLORS.absent }
      ]
    };
  }
  function specTeacherRates(act) {
    return {
      type: 'bar', showValues: true,
      labels: act.map(function (x) { return shortName(x.name); }),
      series: [{ name: 'نسبة التفعيل', values: act.map(function (x) { return x.loginRate; }), color: '#CE9433' }]
    };
  }
  function specAbsence(rows) {
    return {
      type: 'bar',
      labels: rows.map(function (r) { return shortName(r.name); }),
      series: [
        { name: 'غياب', values: rows.map(function (r) { return r.absent; }), color: COLORS.absent },
        { name: 'تأخر', values: rows.map(function (r) { return r.late; }), color: COLORS.late }
      ],
      showValues: rows.length <= 10
    };
  }
  function specCounts(pairs, name) {
    return {
      type: 'bar', showValues: true,
      labels: pairs.map(function (p) { return p.label; }),
      series: [{ name: name || 'العدد', values: pairs.map(function (p) { return p.value; }), color: '#CE9433' }]
    };
  }

  /* -------------------------------------------------- مكوّنات عرض مساعدة */
  function chartPanel(title, sub, spec) {
    return UI.panel(title, sub, null, [UI.chart(spec)]);
  }
  function emptyPanel(title, msg) {
    return UI.panel(title, null, null, [UI.empty(msg)]);
  }
  function countPanel(title, pairs, emptyMsg) {
    if (!pairs || !pairs.length) return emptyPanel(title, emptyMsg);
    return chartPanel(title, null, specCounts(pairs.slice(0, 8)));
  }
  function donutPanel(title, sub, entries, spec) {
    var legend = h('div', { class: 'ui-legend' }, entries.map(function (e) {
      return h('span', { class: 'ui-legend-item' }, [
        h('i', { style: { background: e.color } }),
        h('span', { text: e.label + ' · ' + e.value })
      ]);
    }));
    return UI.panel(title, sub, null, [UI.chart(spec), legend]);
  }
  function barMeter(pct) {
    var tone = pct >= 70 ? 'mint' : (pct >= 25 ? null : 'danger');
    return h('div', { style: { minWidth: '120px', display: 'grid', gap: '4px' } }, [
      UI.progressBar(pct, tone),
      h('span', { class: 'muted nums', style: { fontSize: 'var(--fs-xs)' }, text: pctText(pct) })
    ]);
  }

  /* ============================================================ الوحدة */
  App.register({
    id: 'analytics',
    label: 'التقارير التحليلية',
    icon: '&#128200;',
    roles: ['principal', 'deputy', 'guidance', 'teachers_deputy', 'activity', 'volunteer'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var isPrincipal = S.session.role === 'principal';
      var state = { tab: 'overview', period: 'day', refDate: UI.today() };

      function range() { return S.rangeOf(state.period, state.refDate); }

      /* ================================================== معالجات البيانات */
      function openTermForm(term) {
        UI.formModal({
          title: term ? 'تعديل فصل دراسي' : 'إضافة فصل دراسي',
          intro: 'حدّد اسم الفصل وتاريخ بدايته ونهايته؛ يظهر النطاق فورًا في منتقي الفترة وفي «نهاية الفصل».',
          fields: [
            { name: 'name', label: 'اسم الفصل الدراسي', type: 'text', value: term ? term.name : '', required: true,
              placeholder: 'مثال: الفصل الدراسي الأول' },
            { name: 'from', label: 'تاريخ البداية', type: 'date', value: term ? term.from : '', required: true },
            { name: 'to', label: 'تاريخ النهاية', type: 'date', value: term ? term.to : '', required: true }
          ],
          submitLabel: term ? 'حفظ التعديل' : 'إضافة الفصل',
          onSubmit: function (data) {
            if (data.to < data.from) { UI.toast('تاريخ النهاية يجب أن يكون بعد تاريخ البداية', 'err'); return false; }
            var before = S.terms(schoolId).length;
            if (term) {
              S.saveTerm({ id: term.id, name: data.name, from: data.from, to: data.to });
              UI.toast('عُدّل الفصل الدراسي: ' + data.name, 'ok');
            } else {
              var created = S.saveTerm({ name: data.name, from: data.from, to: data.to });
              if (!S.db.settings.activeTermId || before === 0) S.setActiveTerm(created.id);
              UI.toast('أُضيف الفصل الدراسي: ' + data.name, 'ok');
            }
            draw();
            return true;
          }
        });
      }

      function removeTerm(term) {
        UI.confirm('حذف «' + term.name + '»؟ لا يمكن التراجع عن الحذف.', { ok: 'حذف', danger: true }).then(function (ok) {
          if (!ok) return;
          S.remove('terms', term.id);
          if (S.db.settings.activeTermId === term.id) {
            var rest = S.terms(schoolId);
            S.db.settings.activeTermId = rest.length ? rest[0].id : null;
            S.list('terms').forEach(function (x) { x.active = (x.id === S.db.settings.activeTermId); });
            S.save();
          }
          UI.toast('حُذف الفصل الدراسي', 'ok');
          draw();
        });
      }

      function saveDeprivation(input) {
        var v = Number(input.value);
        if (!v || v < 1 || v > 100) { UI.toast('أدخل نسبة بين 1 و 100', 'warn'); return; }
        S.db.settings.deprivationPct = Math.round(v);
        S.save();
        UI.toast('حُفظت نسبة الحرمان: ' + Math.round(v) + '٪', 'ok');
        draw();
      }

      function sendTeacherReport(r, act) {
        var excellent = act.filter(function (x) { return x.level === 'متميّز'; });
        var notActive = act.filter(function (x) { return x.logins === 0; });
        var rep = S.registerReport('ANL', 'teacher-activity', { title: 'تقرير تفعيل المعلمين — ' + r.label });
        S.notify({
          kind: 'analytics', ref: rep.id, title: 'تقرير تفعيل المعلمين لتابعني',
          body: r.label + ' (' + r.from + ' ← ' + r.to + ') · عدد المعلمين: ' + act.length +
            ' · متميّزون: ' + excellent.length + ' · لم يفعّلوا تابعني: ' + notActive.length,
          to: ['principal']
        });
        S.tg({ to: 'principal', text: 'تقرير تفعيل المعلمين لتابعني\n' + r.label + ' (' + r.from + ' ← ' + r.to + ')' +
          '\nعدد المعلمين: ' + act.length + '\nمتميّزون: ' + excellent.length +
          '\nلم يفعّلوا تابعني: ' + notActive.length + '\nرقم التقرير: ' + rep.code });
        UI.printReport(buildTeacherReport(r, act, rep.code));
        S.markPrinted(rep.id);
        UI.toast('أُرسل التقرير إلى مدير المدرسة وطُبعت نسخة PDF', 'ok');
        draw();
      }

      /* ==================================================== بُناة التقارير */
      function buildPlatformReport(r, s) {
        var trend = S.attendanceTrend(r);
        var totals = statusTotals(trend);
        var sections = [
          { heading: 'مؤشرات تابعني', table: { cols: ['المؤشر', 'القيمة'], rows: [
            ['دخولات تابعني', s.logins], ['مستخدمون نشطون', s.activeUsers],
            ['حصص مغلقة', s.closedSessions], ['إجمالي الحصص', s.sessions],
            ['حالات الغياب', s.absent], ['حالات التأخر', s.late],
            ['المخالفات المسجّلة', s.violations], ['الاستئذانات', s.permissions], ['التقارير المُصدرة', s.reports]
          ] } },
          { heading: 'الملخّص', text: 'الفترة: ' + r.label + ' — من ' + r.from + ' إلى ' + r.to +
            '\nإجمالي الحضور: ' + totals.present + ' · متأخر: ' + totals.late + ' · غائب: ' + totals.absent + ' · بعذر: ' + totals.excused }
        ];
        if (trend.length) sections.push({ heading: 'اتجاه الحضور والغياب اليومي', chart: specTrend(trend) });
        sections.push({ heading: 'توزيع حالات الطلاب', text: 'حاضر: ' + totals.present + ' · متأخر: ' + totals.late +
          ' · غائب: ' + totals.absent + ' · بعذر: ' + totals.excused, chart: specStatus(totals) });
        return {
          type: 'ANL', refId: 'platform', title: 'التقرير التحليلي العام لتابعني',
          subtitle: r.label + ' — من ' + r.from + ' إلى ' + r.to,
          meta: [
            { label: 'الفصل الدراسي', value: (S.activeTerm() || {}).name || 'غير محدّد' },
            { label: 'النطاق', value: r.from + ' ← ' + r.to },
            { label: 'المستخدمون النشطون', value: String(s.activeUsers) },
            { label: 'إعداد المتجر', value: 'تابعني' }
          ],
          sections: sections,
          qrNote: 'امسح الباركود للتحقق من التقرير التحليلي العام لتابعني.',
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function buildTeacherReport(r, act, code) {
        var excellent = act.filter(function (x) { return x.level === 'متميّز'; });
        var notActive = act.filter(function (x) { return x.logins === 0; });
        return {
          type: 'ANL', refId: 'teacher-activity', code: code,
          title: 'تقرير تفعيل المعلمين لتابعني',
          subtitle: r.label + ' — من ' + r.from + ' إلى ' + r.to,
          meta: [
            { label: 'الفصل الدراسي', value: (S.activeTerm() || {}).name || 'غير محدّد' },
            { label: 'عدد المعلمين', value: String(act.length) },
            { label: 'متميّزون', value: String(excellent.length) },
            { label: 'لم يفعّلوا تابعني', value: String(notActive.length) },
            { label: 'النطاق', value: r.from + ' ← ' + r.to }
          ],
          sections: [
            { heading: 'نسب تفعيل المعلمين', chart: specTeacherRates(act) },
            { heading: 'تفصيل تفعيل المعلمين', table: {
              cols: ['المعلم', 'المواد', 'عدد الدخولات', 'نسبة التفعيل', 'آخر دخول', 'حصص أغلقتها', 'مخالفات سجّلها', 'قرارات نشاط', 'التقدير'],
              rows: act.map(function (x) {
                return [x.name, x.subjects || '—', x.logins, x.loginRate + '٪',
                  x.lastLogin ? UI.fmtDateTime(x.lastLogin) : '—', x.closed, x.violations, x.decisions, x.level];
              }) } },
            { heading: 'المتميزون في تفعيل تابعني', list: excellent.length
              ? excellent.map(function (x) { return x.name + ' — ' + x.loginRate + '٪ · ' + x.closed + ' حصة مغلقة'; })
              : ['لا يوجد معلمون بمستوى «متميّز» في هذا النطاق.'] },
            { heading: 'من لم يفعّل تابعني', list: notActive.length
              ? notActive.map(function (x) { return x.name + (x.subjects ? ' — ' + x.subjects : ''); })
              : ['كل المعلمين فعّلوا تابعني في هذا النطاق.'] }
          ],
          qrNote: 'امسح الباركود للتحقق من تقرير تفعيل المعلمين.',
          signatures: ['وكيل شؤون المعلمين', 'مدير المدرسة']
        };
      }

      function buildAbsenceReport(r, sum, depr, top) {
        return {
          type: 'ANL', refId: 'absence-deprivation', title: 'تقرير الغياب والحرمان',
          subtitle: r.label + ' — من ' + r.from + ' إلى ' + r.to,
          meta: [
            { label: 'الفصل الدراسي', value: (S.activeTerm() || {}).name || 'غير محدّد' },
            { label: 'عدد الطلاب ذوي السجلات', value: String(sum.students) },
            { label: 'عدد الجلسات', value: String(sum.sessions) },
            { label: 'نسبة الحرمان المعتمدة', value: depr.threshold + '٪' },
            { label: 'من بلغوا الحرمان', value: String(depr.rows.length) }
          ],
          sections: [
            { heading: 'الأكثر غيابًا وتأخرًا', chart: specAbsence(top.slice(0, 10)) },
            { heading: 'كشف الأكثر غيابًا وتأخرًا (أعلى 15)', table: {
              cols: ['م', 'الطالب', 'الفصل', 'الغياب', 'التأخر', 'بعذر', 'الإجمالي', 'نسبة الغياب'],
              rows: top.map(function (x, i) {
                return [i + 1, x.name, x.className, x.absent, x.late, x.excused, x.total, x.absencePct + '٪'];
              }) } },
            { heading: 'قائمة الحرمان (نسبة الحرمان ' + depr.threshold + '٪)', table: {
              cols: ['الطالب', 'الفصل', 'الغياب / الإجمالي', 'نسبة الغياب', 'الحالة'],
              rows: depr.rows.map(function (x) {
                return [x.name, x.className, x.absent + ' / ' + x.total, x.absencePct + '٪', 'بلغ نسبة الحرمان'];
              }) } }
          ],
          qrNote: 'امسح الباركود للتحقق من تقرير الغياب والحرمان.',
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function buildServicesReport(r, svc) {
        return {
          type: 'ANL', refId: 'services', title: 'تقرير الخدمات المدرسية',
          subtitle: r.label + ' — من ' + r.from + ' إلى ' + r.to,
          meta: [
            { label: 'المخالفات', value: String(svc.violations.length) },
            { label: 'الاستئذانات', value: String(svc.perms.length) },
            { label: 'ساعات التطوع المعتمدة', value: String(svc.hours) },
            { label: 'طلبات النشاط', value: String(svc.reqs.length) },
            { label: 'الأنشطة المقامة', value: String(svc.acts.length) }
          ],
          sections: [
            { heading: 'المخالفات حسب النوع', text: 'الإجمالي: ' + svc.violations.length, chart: svc.vioByType.length ? specCounts(svc.vioByType) : null },
            { heading: 'الاستئذان حسب الحالة', text: 'الإجمالي: ' + svc.perms.length, chart: svc.permByStatus.length ? specCounts(svc.permByStatus) : null },
            { heading: 'ساعات التطوع المعتمدة حسب البرنامج', text: 'إجمالي الساعات: ' + svc.hours, chart: svc.hoursByProgram.length ? specCounts(svc.hoursByProgram) : null },
            { heading: 'طلبات النشاط حسب الحالة', text: 'الإجمالي: ' + svc.reqs.length, chart: svc.reqByStatus.length ? specCounts(svc.reqByStatus) : null },
            { heading: 'الجدول الموجز', table: { cols: ['الخدمة', 'العدد في النطاق', 'التفصيل'], rows: [
              ['المخالفات السلوكية', svc.violations.length, 'مغلقة: ' + svc.vioClosed + ' · مفتوحة: ' + (svc.violations.length - svc.vioClosed)],
              ['الاستئذان', svc.perms.length, 'ممنوح: ' + svc.permGranted + ' · بانتظار الوكيل: ' + (svc.perms.length - svc.permGranted)],
              ['التطوع', svc.regs.length, 'مسجّلون: ' + svc.regs.length + ' · ساعات معتمدة: ' + svc.hours],
              ['النشاط الطلابي', svc.reqs.length, 'أنشطة مقامة: ' + svc.acts.length + ' · طلبات مقبولة: ' + svc.reqApproved]
            ] } }
          ],
          qrNote: 'امسح الباركود للتحقق من تقرير الخدمات المدرسية.',
          signatures: ['مسؤول النشاط', 'مسؤول التطوع', 'مدير المدرسة']
        };
      }

      /* ============================================= تحليل بيانات الخدمات */
      function servicesData(r) {
        var violations = S.list('violations').filter(function (v) { return inRange(v.date, r); });
        var perms = S.list('permissions').filter(function (p) { return inRange(p.date, r); });
        var regs = S.list('programRegs').filter(function (x) { return inRange(x.at, r); });
        var reqs = S.list('activityReqs').filter(function (x) { return inRange(x.createdAt, r); });
        var acts = S.list('activities').filter(function (a) { return inRange(a.date, r); });
        var hours = regs.filter(function (x) { return x.status === 'approved'; })
          .reduce(function (a, x) { return a + (x.hours || 0); }, 0);

        var hoursByProgram = {};
        regs.filter(function (x) { return x.status === 'approved'; }).forEach(function (x) {
          var pr = S.find('programs', x.programId) || {};
          var k = pr.title || 'برنامج';
          hoursByProgram[k] = (hoursByProgram[k] || 0) + (x.hours || 0);
        });
        var hoursPairs = Object.keys(hoursByProgram).map(function (k) { return { label: k, value: hoursByProgram[k] }; })
          .sort(function (a, b) { return b.value - a.value; });

        return {
          violations: violations, perms: perms, regs: regs, reqs: reqs, acts: acts, hours: hours,
          vioClosed: violations.filter(function (v) { return v.status === 'closed'; }).length,
          permGranted: perms.filter(function (p) { return p.status === 'granted'; }).length,
          reqApproved: reqs.filter(function (x) { return x.status === 'approved'; }).length,
          vioByType: tally(violations, function (v) { return v.type || 'غير محدّد'; }),
          permByStatus: tally(perms, function (p) { return PERM_STATUS[p.status] || p.status; }),
          reqByStatus: tally(reqs, function (x) { return REQ_STATUS[x.status] || x.status; }),
          hoursByProgram: hoursPairs
        };
      }

      /* ==================================================== تبويب: نظرة عامة */
      function overviewTab() {
        var r = range(), s = S.platformSummary(r);
        var wrap = h('div');
        wrap.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('دخولات تابعني', String(s.logins), r.label),
          UI.statCard('مستخدمون نشطون', String(s.activeUsers)),
          UI.statCard('حصص مغلقة / الإجمالي', s.closedSessions + ' / ' + s.sessions, null, s.sessions ? 'gold' : null),
          UI.statCard('غياب', String(s.absent), 'حالة غياب', s.absent ? 'gold' : null),
          UI.statCard('تأخر', String(s.late)),
          UI.statCard('مخالفات', String(s.violations)),
          UI.statCard('استئذان', String(s.permissions)),
          UI.statCard('تقارير مُصدرة', String(s.reports))
        ]));

        var trend = S.attendanceTrend(r);
        var totals = statusTotals(trend);
        var grid = h('div', { class: 'chart-grid' });
        if (trend.length) {
          grid.appendChild(chartPanel('اتجاه الحضور والغياب اليومي', trend.length > 20 ? 'يُعرض آخر 20 يومًا من النطاق.' : null, specTrend(trend)));
        } else {
          grid.appendChild(emptyPanel('اتجاه الحضور والغياب اليومي', 'لا توجد جلسات تحضير في هذا النطاق.'));
        }
        grid.appendChild(donutPanel('توزيع حالات الطلاب في النطاق', 'مجمّع من جلسات النطاق المحدد.', statusEntries(totals), specStatus(totals)));
        if (state.period === 'day') {
          var daily = S.dailyAttendance(UI.today());
          var hasData = daily.some(function (c) { return c.total > 0; });
          grid.appendChild(hasData
            ? chartPanel('حضور الفصول اليوم (' + UI.fmtDate(UI.today()) + ')', 'أعمدة: الحاضر مقابل الغائب لكل فصل.', specClasses(daily))
            : emptyPanel('حضور الفصول اليوم', 'لا جلسات تحضير مسجّلة اليوم.'));
        }
        wrap.appendChild(grid);

        wrap.appendChild(UI.panel('تصدير تقرير تابعني', 'يُصدَّر بترويسة المدرسة وباركود (TBN-ANL) ووقت الطباعة، مع الرسوم البيانية داخل التقرير.', [
          UI.reportButton(function () { return buildPlatformReport(r, s); }, { label: 'تصدير PDF / طباعة', class: 'btn-soft' })
        ], [
          h('div', { class: 'muted-block', text: 'يشمل التقرير مؤشرات تابعني، واتجاه الحضور والغياب، وتوزيع حالات الطلاب ضمن النطاق: ' + r.from + ' ← ' + r.to + '.' })
        ]));
        return wrap;
      }

      /* ================================================= تبويب: تفعيل المعلمين */
      function teachersTab() {
        var r = range();
        var act = S.teacherActivity(r);
        var excellent = act.filter(function (x) { return x.level === 'متميّز'; });
        var regular = act.filter(function (x) { return x.level === 'منتظم'; });
        var notActive = act.filter(function (x) { return x.logins === 0; });

        var wrap = h('div');
        wrap.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('عدد المعلمين', String(act.length)),
          UI.statCard('متميّزون', String(excellent.length), 'نسبة تفعيل 70٪ وأعلى', excellent.length ? 'gold' : null),
          UI.statCard('منتظمون', String(regular.length), 'نسبة تفعيل 25٪ وأعلى'),
          UI.statCard('لم يفعّلوا تابعني', String(notActive.length), 'بلا أي دخول في النطاق', notActive.length ? 'gold' : null)
        ]));

        var grid = h('div', { class: 'chart-grid' });
        grid.appendChild(act.length
          ? chartPanel('نسب تفعيل المعلمين', 'محسوبة على أيام الدراسة في النطاق.', specTeacherRates(act))
          : emptyPanel('نسب تفعيل المعلمين', 'لا معلمين في المدرسة.'));
        wrap.appendChild(grid);

        var sendBtn = h('button', {
          class: 'btn btn-primary', type: 'button', text: 'إرسال التقرير إلى مدير المدرسة',
          onClick: function () { sendTeacherReport(r, act); }
        });
        var printBtn = UI.reportButton(function () { return buildTeacherReport(r, act, null); }, { label: 'تصدير PDF / طباعة', class: 'btn-soft' });

        wrap.appendChild(UI.panel('تفعيل المعلمين لتابعني',
          r.label + ' — من ' + r.from + ' إلى ' + r.to + ' · التقدير حسب نسبة الدخولات إلى أيام الدراسة.',
          [printBtn, sendBtn],
          [UI.table({
            cols: [
              { label: 'المعلم', render: function (x) { return h('strong', { text: x.name }); } },
              { label: 'المواد', render: function (x) { return x.subjects || '—'; } },
              { label: 'عدد الدخولات', render: function (x) { return n(x.logins); } },
              { label: 'نسبة التفعيل', render: function (x) { return barMeter(x.loginRate); } },
              { label: 'آخر دخول', render: function (x) { return x.lastLogin ? UI.fmtDateTime(x.lastLogin) : '—'; } },
              { label: 'حصص أغلقتها', render: function (x) { return n(x.closed); } },
              { label: 'مخالفات سجّلها', render: function (x) { return n(x.violations); } },
              { label: 'قرارات نشاط', render: function (x) { return n(x.decisions); } },
              { label: 'التقدير', render: function (x) { return UI.badge(x.level, LEVEL_TONE[x.level] || 'plain'); } }
            ],
            rows: act, empty: 'لا يوجد معلمون في هذه المدرسة.'
          })]
        ));

        var mini = h('div');
        mini.appendChild(UI.panel('المتميزون في تفعيل تابعني', 'نسبة تفعيل 70٪ وأعلى.', null, [
          excellent.length ? UI.table({
            cols: [
              { label: 'المعلم', render: function (x) { return x.name; } },
              { label: 'نسبة التفعيل', render: function (x) { return barMeter(x.loginRate); } },
              { label: 'حصص مغلقة', render: function (x) { return n(x.closed); } }
            ], rows: excellent, empty: 'لا يوجد.'
          }) : UI.empty('لا يوجد معلمون بمستوى «متميّز» في هذا النطاق.')
        ]));
        mini.appendChild(UI.panel('من لم يفعّل تابعني', 'بلا أي دخول خلال النطاق — يُنصح بمتابعتهم.', null, [
          notActive.length ? UI.table({
            cols: [
              { label: 'المعلم', render: function (x) { return x.name; } },
              { label: 'المواد', render: function (x) { return x.subjects || '—'; } },
              { label: 'الحالة', render: function (x) { return UI.badge(x.level, 'plain'); } }
            ], rows: notActive, empty: 'لا يوجد.'
          }) : UI.empty('كل المعلمين فعّلوا تابعني في هذا النطاق.')
        ]));
        wrap.appendChild(mini);
        return wrap;
      }

      /* ================================================= تبويب: الغياب والحرمان */
      function absenceTab() {
        var r = range();
        var sum = S.attendanceSummary(r);
        var top = sum.rows.slice(0, 15);
        var depr = S.deprivationList(r);

        var wrap = h('div');
        var totalAbsent = sum.rows.reduce(function (a, x) { return a + x.absent; }, 0);
        var totalLate = sum.rows.reduce(function (a, x) { return a + x.late; }, 0);
        wrap.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('طلاب لديهم سجلات', String(sum.students), 'في ' + sum.sessions + ' جلسة'),
          UI.statCard('حالات الغياب', String(totalAbsent), null, totalAbsent ? 'gold' : null),
          UI.statCard('حالات التأخر', String(totalLate)),
          UI.statCard('بلغوا نسبة الحرمان', String(depr.rows.length), 'نسبة الحرمان ' + depr.threshold + '٪', depr.rows.length ? 'gold' : null)
        ]));

        var grid = h('div', { class: 'chart-grid' });
        grid.appendChild(top.length
          ? chartPanel('الأكثر غيابًا وتأخرًا', 'أعلى 10 طلاب في النطاق: ' + r.from + ' ← ' + r.to + '.', specAbsence(top.slice(0, 10)))
          : emptyPanel('الأكثر غيابًا وتأخرًا', 'لا سجلات حضور في هذا النطاق.'));
        wrap.appendChild(grid);

        var printBtn = UI.reportButton(function () { return buildAbsenceReport(r, sum, depr, top); }, { label: 'تصدير PDF / طباعة', class: 'btn-soft' });

        wrap.appendChild(UI.panel('الأكثر غيابًا وتأخرًا', 'أعلى 15 طالبًا في النطاق المحدد (بعد ترتيب الأكثر غيابًا).', [printBtn], [
          UI.table({
            cols: [
              { label: 'م', render: function (x, i) { return n(i + 1); } },
              { label: 'الطالب', render: function (x) { return x.name; } },
              { label: 'الفصل', render: function (x) { return x.className; } },
              { label: 'الغياب', render: function (x) { return n(x.absent); } },
              { label: 'التأخر', render: function (x) { return n(x.late); } },
              { label: 'بعذر', render: function (x) { return n(x.excused); } },
              { label: 'الإجمالي', render: function (x) { return n(x.total); } },
              { label: 'نسبة الغياب', render: function (x) { return barMeter(x.absencePct); } }
            ],
            rows: top, empty: 'لا يوجد غياب أو تأخر في هذا النطاق.'
          })
        ]));

        wrap.appendChild(UI.panel('قائمة الحرمان', 'الطلاب الذين بلغوا نسبة الحرمان المعتمدة (' + depr.threshold + '٪) مع ثلاثة سجلات على الأقل.', null, [
          depr.rows.length ? UI.table({
            cols: [
              { label: 'الطالب', render: function (x) { return x.name; } },
              { label: 'الفصل', render: function (x) { return x.className; } },
              { label: 'الغياب / الإجمالي', render: function (x) { return n(x.absent + ' / ' + x.total); } },
              { label: 'نسبة الغياب', render: function (x) { return barMeter(x.absencePct); } },
              { label: 'الحالة', render: function () { return UI.badge('بلغ نسبة الحرمان', 'brand'); } }
            ], rows: depr.rows, empty: 'لا يوجد.'
          }) : UI.empty('لا طالب بلغ نسبة الحرمان في هذا النطاق (' + depr.threshold + '٪).')
        ]));
        return wrap;
      }

      /* ==================================================== تبويب: الخدمات */
      function servicesTab() {
        var r = range();
        var svc = servicesData(r);
        var wrap = h('div');

        wrap.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('المخالفات', String(svc.violations.length), 'مغلقة: ' + svc.vioClosed, svc.violations.length ? 'gold' : null),
          UI.statCard('الاستئذان', String(svc.perms.length), 'ممنوح: ' + svc.permGranted),
          UI.statCard('ساعات التطوع المعتمدة', String(svc.hours), 'تسجيلات: ' + svc.regs.length),
          UI.statCard('طلبات النشاط', String(svc.reqs.length), 'أنشطة مقامة: ' + svc.acts.length)
        ]));

        var grid = h('div', { class: 'chart-grid' });
        grid.appendChild(countPanel('المخالفات حسب النوع', svc.vioByType, 'لا مخالفات مسجّلة في هذا النطاق.'));
        grid.appendChild(countPanel('الاستئذان حسب الحالة', svc.permByStatus, 'لا استئذانات في هذا النطاق.'));
        grid.appendChild(countPanel('ساعات التطوع المعتمدة حسب البرنامج', svc.hoursByProgram, 'لا ساعات تطوع معتمدة في هذا النطاق.'));
        grid.appendChild(countPanel('طلبات النشاط حسب الحالة', svc.reqByStatus, 'لا طلبات نشاط في هذا النطاق.'));
        wrap.appendChild(grid);

        var printBtn = UI.reportButton(function () { return buildServicesReport(r, svc); }, { label: 'تصدير PDF / طباعة', class: 'btn-soft' });
        wrap.appendChild(UI.panel('الجدول الموجز للخدمات', 'مجمّع من النطاق: ' + r.from + ' ← ' + r.to + '.', [printBtn], [
          UI.table({
            cols: [
              { label: 'الخدمة', render: function (x) { return x[0]; } },
              { label: 'العدد في النطاق', render: function (x) { return n(x[1]); } },
              { label: 'التفصيل', render: function (x) { return x[2]; } }
            ],
            rows: [
              ['المخالفات السلوكية', svc.violations.length, 'مغلقة: ' + svc.vioClosed + ' · مفتوحة: ' + (svc.violations.length - svc.vioClosed)],
              ['الاستئذان وتصاريح الخروج', svc.perms.length, 'ممنوح: ' + svc.permGranted + ' · بانتظار الوكيل: ' + (svc.perms.length - svc.permGranted)],
              ['التطوع', svc.regs.length, 'مسجّلون: ' + svc.regs.length + ' · ساعات معتمدة: ' + svc.hours],
              ['النشاط الطلابي', svc.reqs.length, 'أنشطة مقامة: ' + svc.acts.length + ' · طلبات مقبولة: ' + svc.reqApproved]
            ],
            empty: 'لا بيانات خدمات في هذا النطاق.'
          })
        ]));
        return wrap;
      }

      /* ============================================ تبويب: الفصول الدراسية */
      function termsTab() {
        var terms = S.terms(schoolId).slice().sort(function (a, b) { return String(a.from).localeCompare(String(b.from)); });
        var active = S.activeTerm();
        var info = termInfo(active);
        var wrap = h('div');

        wrap.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الفصل الحالي', active ? active.name : 'غير محدّد',
            active ? (active.from + ' ← ' + active.to) : 'أضف فصلًا وحدّد بدايته ونهايته', 'gold'),
          UI.statCard('المدة الكلية', String(info.total), 'يومًا'),
          UI.statCard('الأيام المتبقية', info.remaining == null ? '—' : String(info.remaining), info.status),
          UI.statCard('عدد الفصول', String(terms.length), 'مسجّلة في المدرسة')
        ]));

        var addBtn = isPrincipal ? h('button', {
          class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة فصل دراسي',
          onClick: function () { openTermForm(null); }
        }) : null;

        var cols = [
          { label: 'اسم الفصل الدراسي', render: function (t) { return h('strong', { text: t.name }); } },
          { label: 'من', render: function (t) { return n(t.from); } },
          { label: 'إلى', render: function (t) { return n(t.to); } },
          { label: 'المدة', render: function (t) { return n((dayDiff(t.from, t.to) + 1) + ' يومًا'); } },
          { label: 'الحالة', render: function (t) {
            var i = termInfo(t);
            return h('span', { class: 'cluster' }, [
              t.active ? UI.badge('الفصل الحالي', 'mint') : null,
              UI.badge(i.status, i.tone)
            ]);
          } }
        ];
        if (isPrincipal) cols.push({ label: 'إجراءات', render: function (t) {
          return h('div', { class: 'row-actions' }, [
            h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { openTermForm(t); } }),
            t.active ? null : h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تعيين كفصل حالي', onClick: function () {
              S.setActiveTerm(t.id);
              UI.toast('صار «' + t.name + '» الفصل الحالي', 'ok');
              draw();
            } }),
            h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removeTerm(t); } })
          ]);
        } });

        wrap.appendChild(UI.panel('الفصول الدراسية',
          isPrincipal ? 'يحدّد مدير المدرسة بداية كل فصل ونهايته، ويسمّي الفصل الحالي الذي يُبنى عليه نطاق «نهاية الفصل».'
            : 'عرض الفصول الدراسية ونطاقها — التعديل من صلاحيات مدير المدرسة.',
          [addBtn],
          [UI.table({ cols: cols, rows: terms, empty: 'لا فصول دراسية مسجّلة — يضيفها مدير المدرسة.' })]
        ));

        /* إعدادات الفصل ونسبة الحرمان */
        var settings = [];
        if (active) {
          settings.push(h('div', { class: 'stack-sm' }, [
            h('span', { class: 'muted', text: 'منقضي الفصل الحالي: ' + info.pct + '٪ (' + info.elapsed + ' من ' + info.total + ' يومًا)' }),
            UI.progressBar(info.pct, info.pct > 85 ? 'danger' : 'mint')
          ]));
        }
        settings.push(h('div', { class: 'cluster' }, [
          h('span', { class: 'muted', text: 'نسبة الحرمان الحالية:' }),
          h('strong', { class: 'nums', text: S.db.settings.deprivationPct + '٪' })
        ]));
        if (isPrincipal) {
          var pctField = UI.field({ name: 'deprivationPct', label: 'نسبة الحرمان (%)', type: 'number',
            value: String(S.db.settings.deprivationPct), min: 1, max: 100 });
          var saveBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ النسبة',
            onClick: function () { saveDeprivation(pctField.input); } });
          settings.push(h('div', { class: 'inline-form' }, [pctField.wrap, saveBtn,
            h('p', { class: 'hint', text: 'تُطبَّق النسبة على «قائمة الحرمان» في تقرير الغياب والحرمان.' })]));
        } else {
          settings.push(h('div', { class: 'muted-block', text: 'تعديل الفصول الدراسية ونسبة الحرمان من صلاحيات مدير المدرسة.' }));
        }
        wrap.appendChild(UI.panel('إعدادات الفصل ونسبة الحرمان',
          active ? active.name + ' — من ' + active.from + ' إلى ' + active.to : 'لا فصل دراسي محدّد', null, settings));
        return wrap;
      }

      /* ============================================================= الرسم */
      function periodPanel() {
        var r = range();
        var btns = PERIODS.map(function (p) {
          return h('button', {
            class: 'btn btn-sm ' + (state.period === p.key ? 'btn-primary' : 'btn-outline'),
            type: 'button', text: p.label,
            onClick: function () { state.period = p.key; draw(); }
          });
        });
        var dateField = UI.field({ name: 'refDate', label: 'تاريخ المرجع', type: 'date', value: state.refDate });
        dateField.input.addEventListener('change', function () {
          if (dateField.input.value) { state.refDate = dateField.input.value; draw(); }
        });
        return UI.panel('منتقي الفترة',
          'النطاق الفعلي: ' + r.label + ' — من ' + r.from + ' إلى ' + r.to,
          btns,
          [h('div', { class: 'form-grid' }, [dateField.wrap])]);
      }

      function hero() {
        var t = S.activeTerm();
        var info = termInfo(t);
        return h('div', { class: 'panel' }, [h('div', { class: 'panel-body' }, [
          h('div', { class: 'between' }, [
            h('div', {}, [
              h('span', { class: 'eyebrow', text: 'الدور الحالي: ' + roleName() }),
              h('p', { class: 'muted mt-3', text: 'مركز التقارير الدورية: نظرة تابعني، تفعيل المعلمين، الغياب والحرمان، والخدمات — مع طباعة رسمية بالباركود.' })
            ]),
            h('div', { class: 'cluster' }, [
              h('span', { class: 'chip chip-brand', text: t ? ('الفصل الحالي: ' + t.name) : 'لا فصل دراسي محدّد' }),
              t ? h('span', { class: 'chip chip-' + info.tone, text: info.status +
                (info.remaining != null && info.status !== 'منتهٍ' ? ' · متبقٍ ' + info.remaining + ' يومًا' : '') }) : null,
              h('button', { class: 'mini-btn', type: 'button', text: 'التقويم الدراسي',
                onClick: function () { state.tab = 'terms'; draw(); } })
            ])
          ])
        ])]);
      }

      function bodyFor(tab) {
        if (tab === 'teachers') return teachersTab();
        if (tab === 'absence') return absenceTab();
        if (tab === 'services') return servicesTab();
        if (tab === 'terms') return termsTab();
        return overviewTab();
      }

      function draw() {
        clear(view);
        view.appendChild(hero());
        if (state.tab !== 'terms') view.appendChild(periodPanel());
        var bar = UI.tabs(TABS, function (key) { state.tab = key; draw(); });
        Array.prototype.forEach.call(bar.children, function (b, i) {
          b.classList.toggle('is-active', TABS[i].key === state.tab);
        });
        view.appendChild(bar);
        view.appendChild(bodyFor(state.tab));
      }

      draw();
    }
  });
})();
