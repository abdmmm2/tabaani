/* =============================================================================
   reports.js — مركز التقارير
   ---------------------------------------------------------------------------
   مركز موحّد لكل تقارير المنصة: توليد تقارير جاهزة من بيانات المدرسة الحالية
   وطباعتها بباركود ورقم فريد (TBN-…)، التحقق من أي تقرير برقمه، متابعة عدد
   الطبعات وآخر طبعة، تصدير CSV، وتصفية السجل بالنوع أو بالبحث النصّي.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ---------------------------------------------------------- أنواع التقارير */
  var TYPE_LABEL = {
    attendance: 'تحضير',
    'attendance-summary': 'غياب وتأخر',
    violation: 'مخالفة سلوكية',
    permission: 'استئذان وتصريح خروج',
    entryPermit: 'إذن دخول فصل',
    volunteer: 'ساعات تطوع',
    activity: 'نشاط طلابي',
    cls: 'كشف فصل',
    class: 'كشف فصل',
    school: 'بيانات المدرسة',
    schools: 'المدارس',
    students: 'كشف الطلاب',
    staff: 'الموظفون',
    asg: 'توزيع الإسناد',
    sch: 'الجدول الأسبوعي',
    prd: 'تقرير دوري',
    tac: 'تفعيل المعلمين',
    tlg: 'دخول المعلمين للمنصة',
    tch: 'كشف معلم',
    custom: 'تقرير'
  };
  var TYPE_TONE = {
    attendance: 'mint',
    'attendance-summary': 'amber',
    violation: 'brand',
    permission: 'amber',
    entryPermit: 'brand',
    volunteer: 'mint',
    activity: 'brand',
    prd: 'brand',
    tac: 'mint',
    tlg: 'amber',
    tch: 'mint'
  };
  function typeLabel(t) { return TYPE_LABEL[t] || t || '—'; }
  function typeTone(t) { return TYPE_TONE[t] || 'plain'; }

  /* ---------------------------------------------------------------- مساعدات */
  function className(id) { var k = S.klass(id); return k ? k.name : '—'; }
  function studentName(id) { var s = S.student(id); return s ? s.name : '—'; }
  function studentClass(id) { var s = S.student(id); return s ? s.classId : ''; }
  function teacherName(id) { var u = S.user(id); return u ? u.name : '—'; }
  function periodLabel(id) {
    var p = S.period(id);
    return p ? p.label + ' (' + p.start + ' — ' + p.end + ')' : '—';
  }
  function stageName(id) { return S.stageName(id); }
  function schoolName() { var sc = S.school(S.session.schoolId); return sc ? sc.name : 'المدرسة'; }
  function metaOf(source, period, count) {
    return [
      { label: 'المصدر', value: source },
      { label: 'الفترة', value: period },
      { label: 'عدد السجلات', value: String(count) }
    ];
  }
  function kv(pairs) {
    return h('dl', { class: 'kv' }, pairs.reduce(function (acc, pr) {
      acc.push(h('dt', { text: pr[0] }));
      acc.push(h('dd', { text: (pr[1] == null || pr[1] === '') ? '—' : String(pr[1]) }));
      return acc;
    }, []));
  }

  var VIA_LABEL = { platform: 'منصة تابعني', app: 'تطبيق الجوال', telegram: 'تلقرام' };
  var V_STATUS = { deputy_pending: 'بانتظار الوكيل', granted: 'ممنوح' };
  var VIO_STATUS = { guidance_pending: 'بانتظار التوجيه', deputy_pending: 'بانتظار الوكيل', closed: 'مغلقة' };

  /* ============================================ مولّدات التقارير الجاهزة */

  /* ١) كشوف التحضير اليوم */
  function attendanceTodayReport() {
    var today = UI.today();
    var sessions = S.list('sessions').filter(function (s) { return s.date === today; });
    var total = 0, absent = 0, late = 0;
    sessions.forEach(function (s) {
      (s.records || []).forEach(function (r) {
        total++;
        if (r.status === 'absent') absent++;
        if (r.status === 'late') late++;
      });
    });
    var rows = sessions.map(function (s) {
      var recs = s.records || [];
      var ab = recs.filter(function (r) { return r.status === 'absent'; }).length;
      var lt = recs.filter(function (r) { return r.status === 'late'; }).length;
      return [className(s.classId), s.subject, teacherName(s.teacherId), periodLabel(s.periodId),
        s.status === 'closed' ? 'مُغلقة' : 'مفتوحة', ab + ' / ' + recs.length, String(lt)];
    });
    return {
      type: 'attendance', refId: 'attendance-today',
      title: 'تقرير كشوف التحضير اليوم',
      subtitle: schoolName() + ' — ' + UI.dateLabel(new Date()),
      meta: metaOf('سجل التحضير (حصص اليوم)', UI.fmtDate(today) + ' — ' + UI.greg(new Date()), sessions.length).concat([
        { label: 'عدد الطلاب', value: String(total) },
        { label: 'الغائبون', value: String(absent) },
        { label: 'المتأخرون', value: String(late) }
      ]),
      sections: [
        { heading: 'كشوف حصص اليوم', table: {
          cols: ['الفصل', 'المادة', 'المعلم', 'الحصة', 'الحالة', 'الغائبون / الطلاب', 'المتأخرون'], rows: rows } },
        { heading: 'الملخّص', text: 'عدد الحصص: ' + sessions.length + ' · عدد الطلاب المحضَّرين: ' + total +
          ' · الغائبون: ' + absent + ' · المتأخرون: ' + late }
      ],
      qrNote: 'امسح الباركود للتحقق من تقرير كشوف التحضير اليوم.',
      signatures: ['معلمو المواد', 'وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }

  /* ٢) الغياب والتأخر (مجمّع) */
  function absenceReport() {
    var map = {};
    S.list('sessions').forEach(function (s) {
      (s.records || []).forEach(function (r) {
        if (r.status !== 'absent' && r.status !== 'late') return;
        if (!map[r.studentId]) map[r.studentId] = { absent: 0, late: 0, classId: s.classId, last: '' };
        if (r.status === 'absent') map[r.studentId].absent++;
        else map[r.studentId].late++;
        if (String(s.date) > map[r.studentId].last) map[r.studentId].last = s.date;
      });
    });
    var keys = Object.keys(map).sort(function (a, b) {
      return (map[b].absent - map[a].absent) || (map[b].late - map[a].late) ||
        String(map[b].last).localeCompare(String(map[a].last));
    });
    var rows = keys.map(function (id, i) {
      var m = map[id];
      return [i + 1, studentName(id), className(m.classId), String(m.absent), String(m.late), UI.fmtDate(m.last)];
    });
    var totA = keys.reduce(function (a, k) { return a + map[k].absent; }, 0);
    var totL = keys.reduce(function (a, k) { return a + map[k].late; }, 0);
    return {
      type: 'attendance-summary', refId: 'absence-summary',
      title: 'تقرير الغياب والتأخر',
      subtitle: 'مجمّع من كل جلسات التحضير المسجّلة',
      meta: metaOf('سجل التحضير (كل الجلسات)', 'كل التواريخ', keys.length).concat([
        { label: 'إجمالي حالات الغياب', value: String(totA) },
        { label: 'إجمالي حالات التأخر', value: String(totL) }
      ]),
      sections: [{ heading: 'كشف الغياب والتأخر المجمّع', table: {
        cols: ['م', 'الطالب', 'الفصل', 'عدد الغياب', 'عدد التأخر', 'آخر تاريخ'], rows: rows } }],
      qrNote: 'امسح الباركود للتحقق من تقرير الغياب والتأخر.',
      signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }

  /* ٣) سجل المخالفات السلوكية */
  function violationsReport() {
    var list = S.list('violations').slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    var rows = list.map(function (v) {
      return [v.number, studentName(v.studentId), className(v.classId), v.type, v.degree,
        VIO_STATUS[v.status] || v.status, UI.fmtDate(v.date)];
    });
    var closed = list.filter(function (v) { return v.status === 'closed'; }).length;
    return {
      type: 'violation', refId: 'violations-log',
      title: 'سجل المخالفات السلوكية',
      subtitle: 'جميع المخالفات المسجّلة وحالتها',
      meta: metaOf('سجل المخالفات', 'كل التواريخ', list.length).concat([
        { label: 'المغلقة', value: String(closed) }
      ]),
      sections: [{ heading: 'المخالفات', table: {
        cols: ['الرقم', 'الطالب', 'الفصل', 'النوع', 'الدرجة', 'الحالة', 'التاريخ'], rows: rows } }],
      qrNote: 'امسح الباركود للتحقق من سجل المخالفات السلوكية.',
      signatures: ['موجّه التوجيه والإرشاد', 'وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }

  /* ٤) تصاريح الخروج اليوم */
  function permitsTodayReport() {
    var today = UI.today();
    var list = S.list('permissions').filter(function (p) { return p.date === today; });
    var rows = list.map(function (p) {
      var via = (p.granted && p.granted.via) ? (VIA_LABEL[p.granted.via] || p.granted.via) : '—';
      return [p.number, p.exitNo || '—', studentName(p.studentId), className(p.classId),
        periodLabel(p.periodId), p.reason, V_STATUS[p.status] || p.status, via];
    });
    var grantedN = list.filter(function (p) { return p.status === 'granted'; }).length;
    return {
      type: 'permission', refId: 'permits-today',
      title: 'تقرير تصاريح الخروج اليوم',
      subtitle: schoolName() + ' — ' + UI.dateLabel(new Date()),
      meta: metaOf('سجل الاستئذان (اليوم)', UI.fmtDate(today) + ' — ' + UI.greg(new Date()), list.length).concat([
        { label: 'الممنوحة', value: String(grantedN) }
      ]),
      sections: [{ heading: 'استئذانات وتصاريح اليوم', table: {
        cols: ['رقم الطلب', 'رقم التصريح', 'الطالب', 'الفصل', 'الحصة', 'السبب', 'الحالة', 'طريقة المنح'], rows: rows } }],
      qrNote: 'امسح الباركود للتحقق من تقرير تصاريح الخروج اليوم.',
      signatures: ['وكيل شؤون الطلاب', 'حارس البوابة']
    };
  }

  /* ٥) ساعات التطوع المعتمدة */
  function volunteerHoursReport() {
    var regs = S.list('programRegs').filter(function (r) { return r.status === 'approved'; });
    var rows = regs.map(function (r) {
      var p = S.find('programs', r.programId) || {};
      return [studentName(r.studentId), className(studentClass(r.studentId)), p.title || '—', String(r.hours || 0)];
    });
    var total = regs.reduce(function (a, r) { return a + (r.hours || 0); }, 0);
    return {
      type: 'volunteer', refId: 'volunteer-hours',
      title: 'تقرير ساعات التطوع المعتمدة',
      subtitle: 'الساعات المعتمدة لكل طالب في البرامج التطوعية',
      meta: metaOf('سجل التطوع (المعتمد)', 'كل البرامج', regs.length).concat([
        { label: 'إجمالي الساعات', value: String(total) }
      ]),
      sections: [
        { heading: 'الساعات المعتمدة', table: { cols: ['الطالب', 'الفصل', 'البرنامج', 'الساعات'], rows: rows } },
        { heading: 'الإجمالي', text: 'إجمالي الساعات التطوعية المعتمدة: ' + total + ' ساعة.' }
      ],
      qrNote: 'امسح الباركود للتحقق من سجل ساعات التطوع المعتمدة.',
      signatures: ['مسؤول ساعات التطوع', 'مدير المدرسة']
    };
  }

  /* ٦) سجل الأنشطة وطلباتها */
  function activitiesReport() {
    var acts = S.list('activities');
    var reqs = S.list('activityReqs');
    var rows = acts.map(function (a) {
      var rs = reqs.filter(function (r) { return r.activityId === a.id; });
      return [a.title, UI.fmtDate(a.date), a.place, String(rs.length),
        String(rs.filter(function (r) { return r.status === 'approved'; }).length),
        String(rs.filter(function (r) { return r.status === 'pending'; }).length)];
    });
    return {
      type: 'activity', refId: 'activities-log',
      title: 'سجل الأنشطة وطلبات المشاركة',
      subtitle: 'الأنشطة وحالة طلبات المشاركة فيها',
      meta: metaOf('سجل الأنشطة', 'كل الأنشطة', acts.length).concat([
        { label: 'طلبات المشاركة', value: String(reqs.length) }
      ]),
      sections: [{ heading: 'الأنشطة', table: {
        cols: ['النشاط', 'التاريخ', 'المكان', 'الطلبات', 'المقبولة', 'المعلّقة'], rows: rows } }],
      qrNote: 'امسح الباركود للتحقق من سجل الأنشطة وطلباتها.',
      signatures: ['مسؤول النشاط الطلابي', 'مدير المدرسة']
    };
  }

  /* ٧) بيانات المدرسة والمراحل والفصول */
  function schoolReport() {
    var sc = S.school(S.session.schoolId) || {};
    var classes = S.list('classes', { schoolId: S.session.schoolId });
    var rows = classes.map(function (k) {
      return [k.name, stageName(k.stage), k.room || '—', teacherName(k.supervisorId), String(S.studentsOf(k.id).length)];
    });
    var info = [
      ['اسم المدرسة', sc.name],
      ['رمز المدرسة', sc.code],
      ['المنطقة التعليمية', sc.regionName],
      ['المدينة', sc.city],
      ['العنوان', sc.address],
      ['الهاتف', sc.phone],
      ['البريد الإلكتروني', sc.email],
      ['المراحل', (sc.stages || []).map(stageName).join(' · ')]
    ];
    return {
      type: 'school', refId: 'school-data',
      title: 'تقرير بيانات المدرسة والمراحل والفصول',
      subtitle: sc.name || schoolName(),
      meta: metaOf('بيانات المدرسة', 'الوضع الحالي', classes.length),
      sections: [
        { heading: 'بيانات المدرسة', table: { cols: ['البند', 'التفصيل'], rows: info } },
        { heading: 'المراحل والفصول', table: {
          cols: ['الفصل', 'المرحلة', 'القاعة', 'المشرف', 'عدد الطلاب'], rows: rows } }
      ],
      qrNote: 'امسح الباركود للتحقق من بيانات المدرسة.',
      signatures: ['مدير المدرسة']
    };
  }

  /* ٨) كشف طلاب المدرسة */
  function studentsReport() {
    var classes = S.list('classes', { schoolId: S.session.schoolId });
    var rows = [];
    classes.forEach(function (k) {
      S.studentsOf(k.id).forEach(function (st) {
        rows.push([String(st.seat), st.name, k.name, st.nationalId, st.guardianPhone || '—']);
      });
    });
    return {
      type: 'students', refId: 'students-roster',
      title: 'تقرير كشف طلاب المدرسة',
      subtitle: schoolName(),
      meta: metaOf('سجل الطلاب', 'الوضع الحالي', rows.length).concat([
        { label: 'عدد الفصول', value: String(classes.length) }
      ]),
      sections: [{ heading: 'كشف الطلاب', table: {
        cols: ['م', 'اسم الطالب', 'الفصل', 'رقم الهوية', 'هاتف ولي الأمر'], rows: rows } }],
      qrNote: 'امسح الباركود للتحقق من كشف طلاب المدرسة.',
      signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }

  var READY = [
    { title: 'كشوف التحضير اليوم', desc: 'كل حصص اليوم مع حالات الغياب والتأخر لكل فصل.', label: 'طباعة كشوف اليوم', build: attendanceTodayReport },
    { title: 'تقرير الغياب والتأخر', desc: 'مجمّع من كل الجلسات المسجّلة مرتّبًا بحسب عدد الغياب.', label: 'طباعة تقرير الغياب', build: absenceReport },
    { title: 'سجل المخالفات السلوكية', desc: 'المخالفات المسجّلة ودورتها ودرجتها وحالتها.', label: 'طباعة سجل المخالفات', build: violationsReport },
    { title: 'تقرير تصاريح الخروج اليوم', desc: 'استئذانات اليوم وحالتها وطريقة المنح ورقم التصريح.', label: 'طباعة التصاريح', build: permitsTodayReport },
    { title: 'ساعات التطوع المعتمدة', desc: 'الساعات المعتمدة لكل طالب وبرنامج مع الإجمالي.', label: 'طباعة ساعات التطوع', build: volunteerHoursReport },
    { title: 'سجل الأنشطة وطلباتها', desc: 'الأنشطة وطلبات المشاركة وحالتها.', label: 'طباعة سجل الأنشطة', build: activitiesReport },
    { title: 'بيانات المدرسة والمراحل والفصول', desc: 'بيانات المدرسة والمراحل وقائمة الفصول ومشرفيها.', label: 'طباعة بيانات المدرسة', build: schoolReport },
    { title: 'كشف طلاب المدرسة', desc: 'قائمة الطلاب مجمّعة حسب الفصل مع بيانات التواصل.', label: 'طباعة كشف الطلاب', build: studentsReport }
  ];

  /* ===================== التقارير الدورية وكشوف المعلمين (إضافات) ===================== */
  var PERIODIC = [
    { kind: 'day', title: 'التقرير اليومي', desc: 'ملخّص اليوم الدراسي: الدخول والحصص والغياب والتأخر والمخالفات والاستئذان.' },
    { kind: 'week', title: 'التقرير الأسبوعي', desc: 'ملخّص الأسبوع الدراسي (الأحد — الخميس) مع اتجاه الغياب والتأخر اليومي.' },
    { kind: 'month', title: 'التقرير الشهري', desc: 'ملخّص الشهر مع حضور الفصول والمخالفات والاستئذان والتفعيل.' },
    { kind: 'term', title: 'تقرير نهاية الفصل', desc: 'ملخّص الفصل الدراسي النشط كاملًا مع حضور الفصول وتفعيل المعلمين.' }
  ];
  var MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  /** يعيد تقريرًا مسجّلًا بنفس (النوع + المرجع) أو يُسجّله أول مرة (تجنّب تكرار الرموز). */
  function ensureReport(type, refId, title) {
    var found = S.list('reports').find(function (r) { return r.type === type && r.refId === refId; });
    return found || S.registerReport(type, refId, { title: title });
  }
  function rangeLabel(range) { return UI.fmtDate(range.from) + ' — ' + UI.fmtDate(range.to); }
  function monthLabel(key) { var p = String(key).split('-'); return (MONTHS_AR[Number(p[1]) - 1] || key) + ' ' + p[0]; }
  function shortName(n) { var parts = String(n || '').replace(/^(د\.|أ\.)\s*/, '').split(' '); return parts.slice(0, 2).join(' '); }
  function pct(n) { return (n == null ? 0 : n) + '٪'; }
  /** طابع زمني بأرقام لاتينية (تجنّب صيغة Date الإنجليزية في fmtDateTime). */
  function stamp(d) { return d ? UI.fmtDate(d) + ' · ' + UI.fmtTime(d) : '—'; }

  /** حضور الفصول مجمّعًا على نطاق زمني (للتقارير الدورية). */
  function classAttendance(range) {
    var sessions = S.sessionsInRange(range);
    return S.list('classes').map(function (k) {
      var cls = sessions.filter(function (s) { return s.classId === k.id; });
      var recs = cls.reduce(function (a, s) { return a.concat(s.records || []); }, []);
      var count = function (st) { return recs.filter(function (r) { return r.status === st; }).length; };
      return { name: k.name, sessions: cls.length, present: count('present'), absent: count('absent'), late: count('late') };
    }).filter(function (r) { return r.sessions > 0; });
  }

  /** سلاسل الرسوم ومصفوفة حضور الفصول لنطاق زمني. */
  function rangeSeries(range) {
    var trend = S.attendanceTrend(range);
    return {
      labels: trend.map(function (d) { return UI.fmtDate(d.date).slice(5); }),
      absent: trend.map(function (d) { return d.absent; }),
      late: trend.map(function (d) { return d.late; }),
      classRows: classAttendance(range).map(function (r) {
        return [r.name, String(r.sessions), String(r.present), String(r.absent), String(r.late)];
      })
    };
  }

  /* ---------------------------------------------------------- تقرير دوري */
  function periodicSpec(kind, plain) {
    var range = S.rangeOf(kind);
    var sum = S.platformSummary(range);
    var data = rangeSeries(range);
    var acts = S.teacherActivity(range);
    var actRows = acts.map(function (t) {
      return [t.name, t.subjects || '—', String(t.logins), pct(t.loginRate), t.level];
    });
    var rep = plain ? null : ensureReport('prd', 'periodic-' + kind + '-' + range.from, range.label);
    return {
      type: 'prd', refId: 'periodic-' + kind + '-' + range.from, code: rep ? rep.code : null,
      title: range.label, subtitle: schoolName() + ' — ' + rangeLabel(range),
      periodLabel: range.label + ' (' + rangeLabel(range) + ')',
      summary: sum,
      meta: [
        { label: 'نوع التقرير', value: range.label },
        { label: 'الفترة', value: rangeLabel(range) },
        { label: 'الدخولات', value: String(sum.logins) },
        { label: 'مستخدمون نشطون', value: String(sum.activeUsers) },
        { label: 'الحصص', value: String(sum.sessions) + ' (مغلقة ' + sum.closedSessions + ')' },
        { label: 'الغياب', value: String(sum.absent) },
        { label: 'التأخر', value: String(sum.late) },
        { label: 'المخالفات', value: String(sum.violations) },
        { label: 'الاستئذان', value: String(sum.permissions) }
      ],
      sections: [
        { heading: 'ملخّص الفترة',
          text: 'عدد الدخولات: ' + sum.logins + ' · المستخدمون النشطون: ' + sum.activeUsers +
            ' · الحصص: ' + sum.sessions + ' (منها ' + sum.closedSessions + ' مغلقة)' +
            '\nالغياب: ' + sum.absent + ' · التأخر: ' + sum.late + ' · المخالفات: ' + sum.violations +
            ' · الاستئذان: ' + sum.permissions + ' · التقارير الصادرة: ' + sum.reports },
        { heading: 'الغياب والتأخر اليومي', chart: {
          type: 'line', labels: data.labels,
          series: [
            { name: 'غياب', values: data.absent, color: '#C2593F' },
            { name: 'تأخر', values: data.late, color: '#CE9433' }
          ] } },
        { heading: 'حضور الفصول', table: {
          cols: ['الفصل', 'عدد الحصص', 'حاضر', 'غائب', 'متأخر'], rows: data.classRows } },
        { heading: 'تفعيل المعلمين', table: {
          cols: ['المعلم', 'المواد', 'الدخولات', 'نسبة التفعيل', 'التقدير'], rows: actRows } }
      ],
      qrNote: 'امسح الباركود للتحقق من ' + range.label + ' — منصة تابعني.',
      signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }

  /* --------------------------------------------------- تفعيل المعلمين */
  function teacherActivitySpec(range, plain) {
    var acts = S.teacherActivity(range);
    var rep = plain ? null : ensureReport('tac', 'teacher-activity-' + range.from, 'تقرير تفعيل المعلمين');
    return {
      type: 'tac', refId: 'teacher-activity-' + range.from, code: rep ? rep.code : null,
      title: 'تقرير تفعيل المعلمين للمنصة',
      subtitle: schoolName() + ' — ' + rangeLabel(range),
      periodLabel: rangeLabel(range),
      meta: [
        { label: 'الفترة', value: rangeLabel(range) },
        { label: 'عدد المعلمين', value: String(acts.length) },
        { label: 'متميّزون', value: String(acts.filter(function (t) { return t.level === 'متميّز'; }).length) },
        { label: 'لم يفعّلوا', value: String(acts.filter(function (t) { return t.logins === 0; }).length) }
      ],
      sections: [
        { heading: 'نسبة تفعيل كل معلم', chart: {
          type: 'bar', labels: acts.map(function (t) { return shortName(t.name); }),
          series: [{ name: 'نسبة التفعيل', values: acts.map(function (t) { return t.loginRate; }), color: '#CE9433' }] } },
        { heading: 'كشف تفعيل المعلمين', table: {
          cols: ['المعلم', 'المواد', 'الدخولات', 'نسبة التفعيل', 'الحصص', 'المغلقة', 'المخالفات', 'القرارات', 'آخر دخول', 'التقدير'],
          rows: acts.map(function (t) {
            return [t.name, t.subjects || '—', String(t.logins), pct(t.loginRate), String(t.sessions), String(t.closed),
              String(t.violations), String(t.decisions), t.lastLogin ? stamp(t.lastLogin) : 'لم يدخل', t.level];
          }) } }
      ],
      qrNote: 'امسح الباركود للتحقق من تقرير تفعيل المعلمين.',
      signatures: ['وكيل شؤون المعلمين', 'مدير المدرسة']
    };
  }

  /* --------------------------------------------- دخول المعلمين للمنصة */
  function teacherLoginSpec(range, plain) {
    var acts = S.teacherActivity(range);
    var avg = acts.length ? Math.round(acts.reduce(function (a, t) { return a + t.loginRate; }, 0) / acts.length) : 0;
    var top = acts.filter(function (t) { return t.level === 'متميّز'; });
    var none = acts.filter(function (t) { return t.logins === 0; });
    var low = acts.filter(function (t) { return t.logins > 0 && t.level !== 'متميّز'; });
    var rep = plain ? null : ensureReport('tlg', 'teacher-login-' + range.from, 'تقرير دخول المعلمين للمنصة');
    return {
      type: 'tlg', refId: 'teacher-login-' + range.from, code: rep ? rep.code : null,
      title: 'تقرير دخول المعلمين للمنصة',
      subtitle: schoolName() + ' — ' + rangeLabel(range),
      periodLabel: rangeLabel(range),
      meta: [
        { label: 'الفترة', value: rangeLabel(range) },
        { label: 'المعلمون', value: String(acts.length) },
        { label: 'متوسط نسبة الدخول', value: pct(avg) },
        { label: 'المتميّزون', value: String(top.length) },
        { label: 'لم يفعّلوا', value: String(none.length) }
      ],
      sections: [
        { heading: 'توزيع مستويات الدخول', chart: {
          type: 'donut', labels: ['متميّز', 'دون المتميّز', 'لم يفعّل'],
          series: [{ name: 'المستويات', values: [top.length, low.length, none.length], colors: ['#1E7A5A', '#CE9433', '#C2593F'] }] } },
        { heading: 'نسبة دخول كل معلم', chart: {
          type: 'bar', labels: acts.map(function (t) { return shortName(t.name); }),
          series: [{ name: 'نسبة الدخول', values: acts.map(function (t) { return t.loginRate; }), color: '#8A5A1E' }] } },
        { heading: 'المتميّزون في الدخول', table: {
          cols: ['المعلم', 'الدخولات', 'نسبة الدخول', 'آخر دخول'],
          rows: top.map(function (t) { return [t.name, String(t.logins), pct(t.loginRate), t.lastLogin ? stamp(t.lastLogin) : '—']; }) } },
        { heading: 'من لم يفعّل المنصة', table: {
          cols: ['المعلم', 'المواد', 'الحصص', 'آخر دخول'],
          rows: none.map(function (t) { return [t.name, t.subjects || '—', String(t.sessions), t.lastLogin ? stamp(t.lastLogin) : 'لم يدخل']; }) } }
      ],
      qrNote: 'امسح الباركود للتحقق من تقرير دخول المعلمين للمنصة.',
      signatures: ['وكيل شؤون المعلمين', 'مدير المدرسة']
    };
  }

  /* --------------------------------------------------- كشف معلم مفصّل */
  function avgTime(list, key) {
    var mins = list.filter(function (c) { return c[key]; }).map(function (c) {
      var t = String(c[key]).slice(11, 16).split(':');
      return Number(t[0]) * 60 + Number(t[1]);
    });
    if (!mins.length) return '—';
    var a = Math.round(mins.reduce(function (x, y) { return x + y; }, 0) / mins.length);
    return String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }

  /** نشاط المعلم الأسبوعي: آخر ٦ أسابيع (الأحد — الخميس) من سجل الدخول والحصص. */
  function teacherWeekly(teacherId) {
    var out = [], base = new Date();
    var iso = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).toISOString().slice(0, 10); };
    for (var w = 5; w >= 0; w--) {
      var start = new Date(base); start.setDate(base.getDate() - base.getDay() - w * 7);
      var end = new Date(start); end.setDate(start.getDate() + 4);
      var from = iso(start), to = iso(end);
      out.push({
        label: UI.fmtDate(from).slice(5), from: from, to: to,
        logins: S.activities({ userId: teacherId, type: 'login', from: from, to: to }).length,
        closed: S.sessionsInRange({ from: from, to: to }, { teacherId: teacherId })
          .filter(function (s) { return s.status === 'closed'; }).length
      });
    }
    return out;
  }

  /** بيانات كشف المعلم مجمّعة من S.checkinsOf و S.teacherActivity لنفس الشخص. */
  function teacherData(teacherId, range) {
    var t = S.user(teacherId) || {};
    var acts = S.teacherActivity(range);
    var act = null;
    acts.some(function (a) { if (a.teacherId === teacherId) { act = a; return true; } return false; });
    if (!act) act = { logins: 0, loginRate: 0, lastLogin: null, sessions: 0, closed: 0, violations: 0, decisions: 0, level: 'لم يفعّل المنصة' };
    var cks = S.checkinsOf(teacherId, range);
    var months = {};
    cks.forEach(function (c) { var m = String(c.date).slice(0, 7); months[m] = (months[m] || 0) + 1; });
    var monthKeys = Object.keys(months).sort();
    var asg = S.assignmentsOf(teacherId);
    var classIds = [];
    asg.forEach(function (a) { if (a.classId && classIds.indexOf(a.classId) === -1) classIds.push(a.classId); });
    (t.classIds || []).forEach(function (id) { if (classIds.indexOf(id) === -1) classIds.push(id); });
    var subjects = (t.subjects || []).slice();
    asg.forEach(function (a) { if (a.subject && subjects.indexOf(a.subject) === -1) subjects.push(a.subject); });
    return {
      teacher: t, range: range, activity: act, checkins: cks,
      months: monthKeys, monthCounts: monthKeys.map(function (m) { return months[m]; }),
      weekly: teacherWeekly(teacherId),
      closed: act.closed, violations: act.violations, decisions: act.decisions,
      loginRate: act.loginRate, lastLogin: act.lastLogin, level: act.level, logins: act.logins,
      avgIn: avgTime(cks, 'checkIn'), avgOut: avgTime(cks, 'checkOut'),
      classes: classIds.map(function (id) { return (S.klass(id) || {}).name || '—'; }),
      subjects: subjects, assignments: asg
    };
  }

  function teacherSpec(teacherId, range, plain) {
    var d = teacherData(teacherId, range);
    var rep = plain ? null : ensureReport('tch', 'teacher-' + teacherId, 'كشف المعلم — ' + d.teacher.name);
    return {
      type: 'tch', refId: 'teacher-' + teacherId, code: rep ? rep.code : null,
      title: 'كشف المعلم', subtitle: (d.teacher.name || '') + ' — ' + schoolName(),
      periodLabel: rangeLabel(range),
      meta: [
        { label: 'المعلم', value: d.teacher.name },
        { label: 'الفترة', value: rangeLabel(range) },
        { label: 'المواد', value: d.subjects.join('، ') || '—' },
        { label: 'الفصول', value: d.classes.join('، ') || '—' }
      ],
      sections: [
        { heading: 'بيانات المعلم', table: { cols: ['البند', 'التفصيل'], rows: [
          ['الاسم', d.teacher.name], ['رقم الهوية', d.teacher.nationalId || '—'], ['الجوال', d.teacher.phone || '—'],
          ['البريد الإلكتروني', d.teacher.email || '—'], ['المواد', d.subjects.join('، ') || '—'],
          ['الفصول', d.classes.join('، ') || '—'], ['عدد الإسنادات', String(d.assignments.length)],
          ['حالة الإسناد', d.teacher.locked ? 'مثبّت من الوكيل' : 'بانتظار الوكيل'] ] } },
        { heading: 'ملخّص الحضور والانصراف',
          text: 'أيام الحضور: ' + d.checkins.length + ' · متوسط الحضور: ' + d.avgIn + ' · متوسط الانصراف: ' + d.avgOut },
        { heading: 'اتجاه الحضور الشهري', chart: {
          type: 'line', labels: d.months.map(monthLabel),
          series: [{ name: 'أيام الحضور', values: d.monthCounts, color: '#1E7A5A' }] } },
        { heading: 'الأداء والتفعيل', table: { cols: ['البند', 'القيمة'], rows: [
          ['الحصص التي أغلقها', String(d.closed)], ['المخالفات المسجّلة', String(d.violations)],
          ['قرارات طلبات النشاط', String(d.decisions)], ['دخولاته للمنصة', String(d.logins)],
          ['نسبة دخوله للمنصة', pct(d.loginRate)], ['آخر دخول', d.lastLogin ? stamp(d.lastLogin) : 'لم يدخل'],
          ['التقدير', d.level] ] } },
        { heading: 'نشاطه الأسبوعي', chart: {
          type: 'bar', labels: d.weekly.map(function (w) { return w.label; }),
          series: [
            { name: 'حصص مغلقة', values: d.weekly.map(function (w) { return w.closed; }), color: '#CE9433' },
            { name: 'دخولات', values: d.weekly.map(function (w) { return w.logins; }), color: '#1E7A5A' }
          ] } },
        { heading: 'سجل الحضور والانصراف', table: {
          cols: ['التاريخ', 'الحضور', 'الانصراف', 'المصدر'],
          rows: d.checkins.slice(0, 40).map(function (c) {
            return [UI.fmtDate(c.date), UI.fmtTime(c.checkIn), c.checkOut ? UI.fmtTime(c.checkOut) : '—',
              c.source === 'platform' ? 'المنصة' : '—'];
          }) } }
      ],
      qrNote: 'امسح الباركود للتحقق من كشف المعلم.',
      signatures: ['المعلم', 'وكيل شؤون المعلمين', 'مدير المدرسة']
    };
  }

  /* ================================================================ الوحدة */
  App.register({
    id: 'reports',
    label: 'مركز التقارير',
    icon: '&#128209;',
    roles: ['super', 'principal', 'deputy', 'guidance', 'teacher', 'volunteer', 'activity', 'teachers_deputy'],
    render: function (view) {
      /* التبويبات تُبنى في الخارج، والمحتوى الحالي يبقى في تبويب «المركز» */
      var host = view;
      view = h('div', { class: 'tab-pane' });

      var state = { type: '', query: '', lastCode: '' };

      /* ---------------------------------------------------- slots الحيّة */
      var checkSlot = h('div');
      var statsSlot = h('div');
      var rowsSlot = h('div');
      var countLine = h('p', { class: 'muted' });

      /* ================================= ١) التحقّق من تقرير بالباركود */
      function normalizeCode(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }

      var codeInput = h('input', {
        class: 'input', type: 'text', dir: 'ltr', autocomplete: 'off',
        placeholder: 'TBN-XXX-00000-00000000', 'aria-label': 'رقم التقرير',
        style: { fontSize: '1.25rem', textAlign: 'center', letterSpacing: '1.5px', paddingTop: '14px', paddingBottom: '14px' }
      });

      function searchButton(label, cls, onClick) {
        return h('button', { class: 'btn ' + (cls || 'btn-primary'), type: 'button', text: label, onClick: onClick });
      }

      function reprintSpec(rep) {
        return {
          title: rep.title || (typeLabel(rep.type) + ' — تقرير'),
          subtitle: 'إعادة طباعة — ' + rep.code,
          code: rep.code, type: rep.type, refId: rep.refId,
          meta: [
            { label: 'نوع التقرير', value: typeLabel(rep.type) },
            { label: 'رقم التقرير', value: rep.code },
            { label: 'أصدره', value: rep.by || '—' },
            { label: 'عدد الطبعات قبل هذه', value: String(rep.prints || 0) }
          ],
          sections: [{ heading: 'بيانات التقرير', table: { cols: ['البند', 'التفصيل'], rows: [
            ['رقم التقرير', rep.code],
            ['نوع التقرير', typeLabel(rep.type)],
            ['عنوان التقرير', rep.title || '—'],
            ['الجهة المُصدِرة', rep.by || '—'],
            ['تاريخ الإصدار', UI.fmtDateTime(rep.at)],
            ['هذه النسخة', 'إعادة طباعة من أصل محفوظ في مركز التقارير']
          ] } }],
          qrNote: 'امسح الباركود للتحقق من التقرير رقم ' + rep.code + '.',
          signatures: ['مسؤول مركز التقارير', 'مدير المدرسة']
        };
      }

      function refreshDynamic() {
        drawStats();
        syncTypeOptions();
        drawRows();
      }

      function reprint(rep) {
        UI.printReport(reprintSpec(rep));
        S.markPrinted(rep.id);
        UI.toast('أُعيدت طباعة التقرير وسُجّلت الطبعة', 'ok');
        App.refreshBadges();
        refreshDynamic();
        if (state.lastCode) {
          var again = S.findReport(state.lastCode);
          if (again) showResult(again);
        }
      }

      function detailsModal(rep) {
        UI.modal({
          title: 'تفاصيل التقرير — ' + rep.code, wide: true,
          body: [
            kv([
              ['رقم التقرير', rep.code],
              ['نوع التقرير', typeLabel(rep.type)],
              ['العنوان', rep.title || '—'],
              ['من أصدره', rep.by || '—'],
              ['تاريخ الإصدار', UI.fmtDateTime(rep.at)],
              ['عدد الطبعات', String(rep.prints || 0)],
              ['آخر طبعة', rep.lastPrint ? UI.fmtDateTime(rep.lastPrint) : 'لم يُطبع بعد']
            ]),
            h('div', { class: 'muted-block mt-3',
              text: 'هذا السجل يمثّل تقريرًا رسميًا صادرًا من المنصة يحمل رقمًا فريدًا وباركودًا. إعادة الطباعة تُنشئ نسخة مطابقة وتزيد عدّاد الطبعات.' })
          ],
          actions: [
            { label: 'إعادة الطباعة', class: 'btn-soft', onClick: function (close) { close(); reprint(rep); } },
            { label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }
          ]
        });
      }

      function showResult(rep) {
        clear(checkSlot);
        var pairs = [
          ['نوع التقرير', typeLabel(rep.type)],
          ['العنوان', rep.title || '—'],
          ['رقم التقرير', rep.code],
          ['من أصدره', rep.by || '—'],
          ['تاريخ الإصدار', UI.fmtDateTime(rep.at)],
          ['عدد الطبعات', String(rep.prints || 0)],
          ['آخر طبعة', rep.lastPrint ? UI.fmtDateTime(rep.lastPrint) : 'لم يُطبع بعد']
        ];
        checkSlot.appendChild(h('div', { class: 'panel mt-3', style: { marginBottom: 0, borderColor: 'var(--brand-400)' } }, [
          h('div', { class: 'panel-body' }, [
            h('div', { class: 'between' }, [
              h('div', {}, [
                UI.badge('تقرير صالح ومُوثّق', 'mint'),
                h('h3', { style: { marginTop: '8px' }, text: rep.title || typeLabel(rep.type) }),
                h('p', { class: 'muted', text: 'رقم التقرير: ' + rep.code })
              ]),
              h('div', { class: 'cluster' }, [
                searchButton('إعادة الطباعة', 'btn-soft', function () { reprint(rep); }),
                searchButton('عرض التفاصيل', 'btn-outline', function () { detailsModal(rep); })
              ])
            ]),
            h('div', { class: 'mt-3' }, [kv(pairs)])
          ])
        ]));
      }

      function doSearch() {
        var code = normalizeCode(codeInput.value);
        clear(checkSlot);
        if (!code) {
          UI.toast('أدخل رقم التقرير أولًا', 'warn');
          checkSlot.appendChild(h('p', { class: 'hint mt-3', text: 'أدخل رقم التقرير المطبوع أسفل الباركود ثم اضغط «بحث».' }));
          return;
        }
        var rep = S.findReport(code);
        if (!rep) {
          state.lastCode = '';
          checkSlot.appendChild(h('div', { class: 'muted-block mt-3', style: { borderColor: '#EBC3CB' },
            text: 'لا يوجد تقرير بالرقم: ' + code + '. تأكد من كتابة الرقم كما هو مطبوع أسفل الباركود دون تعديل.' }));
          UI.toast('لم يُعثر على تقرير بهذا الرقم', 'err');
          return;
        }
        state.lastCode = rep.code;
        showResult(rep);
        UI.toast('عُثر على التقرير: ' + typeLabel(rep.type), 'ok');
      }

      codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

      view.appendChild(UI.panel('تحقّق من تقرير بالباركود', 'أدخل رقم التقرير للتحقق من أصالته وبياناته وعدد طبعاته.', null, [
        h('div', { class: 'field full' }, [
          h('label', { text: 'رقم التقرير' }),
          codeInput,
          h('p', { class: 'hint', text: 'حقل كبير يستوعب الرقم كاملًا؛ تُزال المسافات تلقائيًا عند البحث.' })
        ]),
        h('div', { class: 'cluster mt-3' }, [
          searchButton('بحث', 'btn-primary', doSearch),
          searchButton('تفريغ الحقل', 'btn-outline', function () {
            codeInput.value = ''; state.lastCode = ''; clear(checkSlot); codeInput.focus();
          })
        ]),
        h('p', { class: 'hint mt-3',
          text: 'الباركود المطبوع على كل تقرير يشفّر هذا الرقم، ويمكن مسحه بكاميرا الجوال ثم البحث به هنا للتحقق من التقرير.' }),
        checkSlot
      ]));

      /* ========================================== ٢) بطاقات الإحصاء */
      function computeStats() {
        var reports = S.list('reports');
        var today = UI.today();
        var counts = {};
        reports.forEach(function (r) { counts[r.type] = (counts[r.type] || 0) + 1; });
        var top = null;
        Object.keys(counts).forEach(function (k) { if (top === null || counts[k] > counts[top]) top = k; });
        return {
          total: reports.length,
          today: reports.filter(function (r) { return String(r.at || '').slice(0, 10) === today; }).length,
          topType: top, topCount: top === null ? 0 : counts[top],
          prints: reports.reduce(function (a, r) { return a + (r.prints || 0); }, 0),
          types: Object.keys(counts)
        };
      }
      function drawStats() {
        clear(statsSlot);
        var s = computeStats();
        statsSlot.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('إجمالي التقارير', String(s.total), 'تقرير مسجّل'),
          UI.statCard('تقارير اليوم', String(s.today), UI.fmtDate(UI.today())),
          UI.statCard('الأكثر نوعًا', s.topType ? typeLabel(s.topType) : '—',
            s.topType ? s.topCount + ' تقرير' : 'لا تقارير', s.topType ? 'gold' : null),
          UI.statCard('عدد الطبعات', String(s.prints), 'مرّة طباعة')
        ]));
      }

      /* ============================================ ٣) جدول التقارير */
      var typeField = UI.field({ name: 'rtype', label: 'تصفية بالنوع', type: 'select', value: state.type,
        placeholder: 'كل الأنواع', options: [] });
      typeField.input.addEventListener('change', function () { state.type = typeField.input.value; drawRows(); });

      var searchInput = h('input', { class: 'input', type: 'search', value: state.query,
        placeholder: 'ابحث بالرقم أو العنوان أو الجهة…', 'aria-label': 'بحث في التقارير' });
      searchInput.addEventListener('input', function () { state.query = searchInput.value; drawRows(); });

      function syncTypeOptions() {
        var current = state.type;
        var types = computeStats().types;
        clear(typeField.input);
        typeField.input.appendChild(h('option', { value: '', text: 'كل الأنواع' }));
        types.forEach(function (t) { typeField.input.appendChild(h('option', { value: t, text: typeLabel(t) })); });
        typeField.input.value = types.indexOf(current) > -1 ? current : '';
        state.type = typeField.input.value;
      }

      function filteredReports() {
        var q = state.query.trim().toLowerCase();
        var rows = S.list('reports').slice().sort(function (a, b) {
          return String(b.at || '').localeCompare(String(a.at || ''));
        });
        if (state.type) rows = rows.filter(function (r) { return r.type === state.type; });
        if (q) rows = rows.filter(function (r) {
          return [r.code, r.title, r.by, typeLabel(r.type)].join(' ').toLowerCase().indexOf(q) > -1;
        });
        return rows;
      }

      function exportCsv() {
        var rows = filteredReports().map(function (r) {
          return {
            'الرقم': r.code,
            'النوع': typeLabel(r.type),
            'العنوان': r.title || '',
            'المصدر': r.by || '',
            'التاريخ': UI.fmtDateTime(r.at),
            'الطبعات': r.prints || 0,
            'آخر طبعة': r.lastPrint ? UI.fmtDateTime(r.lastPrint) : ''
          };
        });
        if (!rows.length) { UI.toast('لا توجد تقارير للتصدير', 'warn'); return; }
        UI.downloadCsv(rows, 'مركز-التقارير.csv');
        UI.toast('صُدِّر سجل التقارير بصيغة CSV', 'ok');
      }

      function drawRows() {
        clear(rowsSlot);
        var rows = filteredReports();
        countLine.textContent = 'عدد التقارير المعروضة: ' + rows.length + ' من ' + S.list('reports').length;
        rowsSlot.appendChild(UI.table({
          cols: [
            { label: 'الرقم', render: function (r) { return h('code', { text: r.code }); } },
            { label: 'النوع', render: function (r) { return UI.badge(typeLabel(r.type), typeTone(r.type)); } },
            { label: 'العنوان', render: function (r) { return r.title || '—'; } },
            { label: 'المصدر', render: function (r) { return r.by || '—'; } },
            { label: 'التاريخ', render: function (r) { return UI.fmtDateTime(r.at); } },
            { label: 'الطبعات', render: function (r) { return h('span', { class: 'nums', text: String(r.prints || 0) }); } },
            { label: 'آخر طبعة', render: function (r) { return r.lastPrint ? UI.fmtDateTime(r.lastPrint) : '—'; } },
            { label: 'إجراءات', render: function (r) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn', type: 'button', text: 'إعادة طباعة', onClick: function () { reprint(r); } }),
                h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(r); } })
              ]);
            } }
          ],
          rows: rows,
          empty: 'لا تقارير مطابقة — وَلّد تقريرًا من «تقارير جاهزة للطباعة» أو غيّر التصفية.'
        }));
      }

      view.appendChild(statsSlot);

      view.appendChild(UI.panel('كل التقارير', 'سجل تقارير المنصة مرتّبًا من الأحدث، مع التصفية والبحث والتصدير.',
        h('div', { class: 'cluster' }, [
          h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تصدير CSV', onClick: exportCsv }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصفير التصفية', onClick: function () {
            state.type = ''; state.query = ''; searchInput.value = ''; syncTypeOptions(); drawRows();
          } })
        ]),
        [
          h('div', { class: 'form-grid' }, [
            h('div', { class: 'field' }, [h('label', { for: 'rep-search', text: 'بحث نصّي' }), searchInput]),
            typeField.wrap
          ]),
          h('div', { class: 'mt-3', style: { display: 'grid', gap: '10px' } }, [countLine, rowsSlot])
        ]));

      /* ================================= ٤) تقارير جاهزة للطباعة */
      var cards = READY.map(function (cfg) {
        var btn = UI.reportButton(cfg.build, { label: cfg.label, class: 'btn-soft' });
        btn.addEventListener('click', function () { setTimeout(refreshDynamic, 60); });
        return h('div', { class: 'panel', style: { marginBottom: 0 } }, [
          h('div', { class: 'panel-body' }, [
            h('h4', { text: cfg.title }),
            h('p', { class: 'muted', style: { marginTop: '6px' }, text: cfg.desc }),
            h('div', { class: 'mt-3' }, [btn])
          ])
        ]);
      });
      view.appendChild(UI.panel('تقارير جاهزة للطباعة', 'كل تقرير يُنشأ من البيانات الحالية ويُسجَّل برقم فريد، ويُطبع مع باركود قابل للمسح.', null, [
        h('div', { class: 'grid-2-app' }, cards)
      ]));

      /* ================================= ٥) عن الباركود والتقارير */
      view.appendChild(UI.panel('عن الباركود والتقارير', null, null, [
        h('div', { class: 'muted-block' }, [
          h('p', { text: 'كل تقرير يُصدر برقم فريد بالصيغة: TBN-النوع-التسلسل-التاريخ، ويُطبع معه باركود يشفّر هذا الرقم بالكامل.' }),
          h('p', { class: 'mt-3', text: 'تُسجَّل كل طبعة بوقت وتاريخ الهجري والميلادي في سجل التقارير، ويظهر لكل تقرير عدد الطبعات وآخر طبعة.' }),
          h('p', { class: 'mt-3', text: 'يمكن التحقق من أي تقرير لاحقًا من هذه الصفحة: امسح الباركود من التقرير المطبوع بكاميرا الجوال، ثم أدخل الرقم في حقل «تحقّق من تقرير بالباركود» أعلاه واضغط «بحث».' })
        ])
      ]));

      /* ============================ ٦) تبويب التقارير الدورية ============================ */
      function chipKV(label, value) {
        return h('span', { class: 'duty-chip' }, [h('b', { text: label + ': ' }), h('span', { text: String(value) })]);
      }
      function sumChips(sum) {
        return h('div', { class: 'kpi-row' }, [
          chipKV('دخولات', sum.logins), chipKV('نشطون', sum.activeUsers), chipKV('حصص', sum.sessions),
          chipKV('غياب', sum.absent), chipKV('تأخر', sum.late), chipKV('مخالفات', sum.violations), chipKV('استئذان', sum.permissions)
        ]);
      }
      /* زر إرسال التقرير إلى مدير المدرسة: تسجيل + إشعار + تلقرام + تنبيه */
      function sendButton(specFactory, label) {
        return h('button', { class: 'btn btn-outline', type: 'button', text: label || 'إرسال إلى مدير المدرسة', onClick: function () {
          var spec = specFactory();
          var rep = S.registerReport(spec.type, spec.refId, { title: spec.title });
          S.notify({ kind: 'report', ref: rep.id, title: 'تقرير جديد: ' + spec.title,
            body: (spec.subtitle || '') + ' — الفترة ' + (spec.periodLabel || ''), to: ['principal'] });
          S.tg({ to: 'principal', text: 'تقرير جديد بانتظار مراجعتك\n' + spec.title + '\n' + (spec.subtitle || '') + '\nرقم التقرير: ' + rep.code });
          UI.toast('أُرسل التقرير إلى مدير المدرسة وسُجّل برقم ' + rep.code, 'ok');
          App.refreshBadges();
          refreshDynamic();
        } });
      }

      function periodicCard(cfg) {
        var range = S.rangeOf(cfg.kind);
        var sum = S.platformSummary(range);
        var data = rangeSeries(range);
        var factory = function () { return periodicSpec(cfg.kind); };
        var sendFactory = function () { return periodicSpec(cfg.kind, true); };
        return h('div', { class: 'panel', style: { marginBottom: 0 } }, [
          h('div', { class: 'panel-body' }, [
            h('div', { class: 'between' }, [
              h('div', {}, [h('h4', { text: cfg.title }), h('p', { class: 'muted', style: { marginTop: '4px' }, text: cfg.desc })]),
              UI.badge(rangeLabel(range), 'plain')
            ]),
            h('div', { class: 'mt-3' }, [sumChips(sum)]),
            h('div', { class: 'mt-3' }, [UI.chart({ type: 'line', labels: data.labels,
              series: [{ name: 'غياب', values: data.absent, color: '#C2593F' }, { name: 'تأخر', values: data.late, color: '#CE9433' }] })]),
            h('div', { class: 'cluster mt-3' }, [
              UI.reportButton(factory, { label: 'تصدير PDF / طباعة', class: 'btn-soft' }),
              sendButton(sendFactory)
            ])
          ])
        ]);
      }

      function buildPeriodic(pane) {
        pane.appendChild(UI.panel('التقارير الرسمية الدورية',
          'تقارير جاهزة مبنية من نطاق الفترة وملخّص المنصة، تُطبع بترويسة المدرسة وباركود ويمكن إرسالها إلى مدير المدرسة.',
          null, [h('div', { class: 'grid-2-app' }, PERIODIC.map(periodicCard))]));

        var actRange = S.rangeOf('month');
        var acts = S.teacherActivity(actRange);
        var avg = acts.length ? Math.round(acts.reduce(function (a, t) { return a + t.loginRate; }, 0) / acts.length) : 0;
        var actFactory = function () { return teacherActivitySpec(actRange); };
        var actSend = function () { return teacherActivitySpec(actRange, true); };
        var actCols = [
          { label: 'المعلم', render: function (t) { return t.name; } },
          { label: 'المواد', render: function (t) { return t.subjects || '—'; } },
          { label: 'الدخولات', render: function (t) { return h('span', { class: 'nums', text: String(t.logins) }); } },
          { label: 'نسبة التفعيل', render: function (t) { return pct(t.loginRate); } },
          { label: 'الحصص المغلقة', render: function (t) { return h('span', { class: 'nums', text: String(t.closed) }); } },
          { label: 'المخالفات', render: function (t) { return h('span', { class: 'nums', text: String(t.violations) }); } },
          { label: 'آخر دخول', render: function (t) { return t.lastLogin ? stamp(t.lastLogin) : 'لم يدخل'; } },
          { label: 'التقدير', render: function (t) { return UI.badge(t.level, t.level === 'متميّز' ? 'mint' : (t.logins ? 'amber' : 'brand')); } }
        ];
        pane.appendChild(UI.panel('تقرير تفعيل المعلمين',
          'نسب التفعيل والتقدير لكل معلم — الفترة ' + rangeLabel(actRange),
          h('div', { class: 'cluster' }, [
            UI.reportButton(actFactory, { label: 'تصدير PDF / طباعة', class: 'btn-soft btn-sm' }),
            sendButton(actSend)
          ]), [
          h('div', { class: 'stat-row' }, [
            UI.statCard('عدد المعلمين', String(acts.length)),
            UI.statCard('متميّزون', String(acts.filter(function (t) { return t.level === 'متميّز'; }).length), 'نسبة تفعيل ٧٠٪ وأكثر', 'gold'),
            UI.statCard('لم يفعّلوا', String(acts.filter(function (t) { return t.logins === 0; }).length), 'بلا دخول للمنصة'),
            UI.statCard('متوسط التفعيل', pct(avg))
          ]),
          UI.chart({ type: 'bar', labels: acts.map(function (t) { return shortName(t.name); }),
            series: [{ name: 'نسبة التفعيل', values: acts.map(function (t) { return t.loginRate; }), color: '#CE9433' }] }),
          UI.table({ cols: actCols, rows: acts, empty: 'لا يوجد معلمون مسجّلون.' })
        ]));

        var top = acts.filter(function (t) { return t.level === 'متميّز'; });
        var none = acts.filter(function (t) { return t.logins === 0; });
        var low = acts.filter(function (t) { return t.logins > 0 && t.level !== 'متميّز'; });
        var logFactory = function () { return teacherLoginSpec(actRange); };
        var logSend = function () { return teacherLoginSpec(actRange, true); };
        pane.appendChild(UI.panel('تقرير دخول المعلمين للمنصة',
          'نسبة الدخول والمتميّزون ومن لم يفعّل المنصة — الفترة ' + rangeLabel(actRange),
          h('div', { class: 'cluster' }, [
            UI.reportButton(logFactory, { label: 'تصدير PDF / طباعة', class: 'btn-soft btn-sm' }),
            sendButton(logSend)
          ]), [
          h('div', { class: 'stat-row' }, [
            UI.statCard('متوسط نسبة الدخول', pct(avg)),
            UI.statCard('المتميّزون', String(top.length), 'نسبة تفعيل ٧٠٪ وأكثر', 'gold'),
            UI.statCard('دون المتميّز', String(low.length)),
            UI.statCard('لم يفعّلوا المنصة', String(none.length), null, none.length ? 'ink' : null)
          ]),
          h('div', { class: 'grid-2-app' }, [
            UI.chart({ type: 'donut', labels: ['متميّز', 'دون المتميّز', 'لم يفعّل'],
              series: [{ name: 'المستويات', values: [top.length, low.length, none.length], colors: ['#1E7A5A', '#CE9433', '#C2593F'] }] }),
            UI.chart({ type: 'bar', labels: acts.map(function (t) { return shortName(t.name); }),
              series: [{ name: 'نسبة الدخول', values: acts.map(function (t) { return t.loginRate; }), color: '#8A5A1E' }] })
          ]),
          UI.table({ cols: [
            { label: 'المعلم', render: function (t) { return t.name; } },
            { label: 'المواد', render: function (t) { return t.subjects || '—'; } },
            { label: 'الدخولات', render: function (t) { return h('span', { class: 'nums', text: String(t.logins) }); } },
            { label: 'نسبة الدخول', render: function (t) { return pct(t.loginRate); } },
            { label: 'آخر دخول', render: function (t) { return t.lastLogin ? stamp(t.lastLogin) : 'لم يدخل'; } },
            { label: 'الحالة', render: function (t) { return UI.badge(t.level, t.level === 'متميّز' ? 'mint' : (t.logins ? 'amber' : 'brand')); } }
          ], rows: acts, empty: 'لا يوجد معلمون مسجّلون.' })
        ]));
      }

      /* ============================ ٧) تبويب كشوف المعلمين ============================ */
      function buildTeachers(pane) {
        var teachers = S.usersByRole('teacher');
        var picked = teachers.length ? teachers[0].id : '';
        var range = S.rangeOf('term');
        var body = h('div');
        var sel = UI.field({ name: 'teacher', label: 'المعلم', type: 'select', value: picked,
          placeholder: teachers.length ? 'اختر المعلم' : 'لا يوجد معلمون',
          options: teachers.map(function (t) {
            return { value: t.id, label: t.name + (t.subjects && t.subjects.length ? ' — ' + t.subjects.join('، ') : '') };
          }) });
        function factory() { return teacherSpec(picked, range); }
        function sendFactory() { return teacherSpec(picked, range, true); }
        function exportCsv() {
          var d = teacherData(picked, range);
          var rows = d.checkins.map(function (c) {
            return { 'المعلم': d.teacher.name, 'التاريخ': UI.fmtDate(c.date), 'الحضور': UI.fmtTime(c.checkIn),
              'الانصراف': c.checkOut ? UI.fmtTime(c.checkOut) : '', 'المصدر': c.source === 'platform' ? 'المنصة' : '' };
          });
          if (!rows.length) { UI.toast('لا سجلات حضور لتصديرها', 'warn'); return; }
          UI.downloadCsv(rows, 'كشف-معلم.csv');
          UI.toast('صُدِّر كشف المعلم بصيغة CSV', 'ok');
        }
        function draw() {
          clear(body);
          if (!picked) { body.appendChild(UI.empty('لا يوجد معلمون في هذه المدرسة.')); return; }
          var d = teacherData(picked, range);
          body.appendChild(h('div', { class: 'stat-row' }, [
            UI.statCard('أيام الحضور', String(d.checkins.length), rangeLabel(range)),
            UI.statCard('متوسط الحضور', d.avgIn), UI.statCard('متوسط الانصراف', d.avgOut),
            UI.statCard('الحصص التي أغلقها', String(d.closed)),
            UI.statCard('المخالفات المسجّلة', String(d.violations)),
            UI.statCard('قرارات طلبات النشاط', String(d.decisions)),
            UI.statCard('نسبة دخوله للمنصة', pct(d.loginRate)),
            UI.statCard('آخر دخول', d.lastLogin ? stamp(d.lastLogin) : 'لم يدخل'),
            UI.statCard('تقديره', d.level, 'المواد: ' + (d.subjects.join('، ') || '—'), 'gold')
          ]));
          body.appendChild(h('div', { class: 'muted-block mt-3' }, [
            h('p', { text: 'الفصول: ' + (d.classes.join('، ') || '—') }),
            h('p', { class: 'mt-3', text: 'المواد: ' + (d.subjects.join('، ') || '—') + ' · الإسنادات: ' + d.assignments.length +
              ' · حالة الإسناد: ' + (d.teacher.locked ? 'مثبّت من الوكيل' : 'بانتظار الوكيل') })
          ]));
          body.appendChild(h('div', { class: 'cluster mt-3' }, [
            UI.reportButton(factory, { label: 'طباعة كشف المعلم', class: 'btn-soft' }),
            h('button', { class: 'btn btn-outline', type: 'button', text: 'تصدير CSV', onClick: exportCsv }),
            sendButton(sendFactory)
          ]));
          body.appendChild(h('div', { class: 'chart-grid mt-3' }, [
            UI.chart({ title: 'اتجاه الحضور الشهري', type: 'line', labels: d.months.map(monthLabel),
              series: [{ name: 'أيام الحضور', values: d.monthCounts, color: '#1E7A5A' }] }),
            UI.chart({ title: 'النشاط الأسبوعي', type: 'bar', labels: d.weekly.map(function (w) { return w.label; }),
              series: [{ name: 'حصص مغلقة', values: d.weekly.map(function (w) { return w.closed; }), color: '#CE9433' },
                       { name: 'دخولات', values: d.weekly.map(function (w) { return w.logins; }), color: '#1E7A5A' }] })
          ]));
          body.appendChild(h('div', { class: 'mt-3' }, [UI.table({ cols: [
            { label: 'التاريخ', render: function (c) { return UI.fmtDate(c.date); } },
            { label: 'الحضور', render: function (c) { return UI.fmtTime(c.checkIn); } },
            { label: 'الانصراف', render: function (c) { return c.checkOut ? UI.fmtTime(c.checkOut) : '—'; } },
            { label: 'المصدر', render: function (c) { return c.source === 'platform' ? 'المنصة' : '—'; } }
          ], rows: d.checkins.slice(0, 30), empty: 'لا سجلات حضور للمعلم في هذه الفترة.' })]));
        }
        sel.input.addEventListener('change', function () { picked = sel.input.value; draw(); });
        pane.appendChild(UI.panel('كشوف المعلمين',
          'اختر معلمًا لعرض كشفه التفصيلي: بياناته ومواده وفصوله، حضورُه وانصرافه، حصصه ومخالفاته، ونسب دخوله للمنصة.',
          null, [h('div', { class: 'form-grid' }, [sel.wrap]), body]));
        draw();
      }

      /* ------------------------------------------------------ أول رسم */
      drawStats();
      syncTypeOptions();
      drawRows();

      /* ------------------------------------------------------ التبويبات */
      var periodicPane = h('div', { class: 'tab-pane' });
      var teachersPane = h('div', { class: 'tab-pane' });
      buildPeriodic(periodicPane);
      buildTeachers(teachersPane);
      var panes = { center: view, periodic: periodicPane, teachers: teachersPane };
      host.appendChild(UI.tabs([
        { key: 'center', label: 'المركز' },
        { key: 'periodic', label: 'التقارير الدورية' },
        { key: 'teachers', label: 'كشوف المعلمين' }
      ], function (key) {
        Object.keys(panes).forEach(function (k) { panes[k].hidden = (k !== key); });
      }));
      host.appendChild(view);
      host.appendChild(periodicPane);
      host.appendChild(teachersPane);
      panes.periodic.hidden = true;
      panes.teachers.hidden = true;
    }
  });
})();
