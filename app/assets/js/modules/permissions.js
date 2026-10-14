/* =============================================================================
   permissions.js — الاستئذان وتصاريح الخروج
   ---------------------------------------------------------------------------
   الرحلة: يرفع موجّه التوجيه والإرشاد طلب استئذان للطالب (طالب + حصة/مادة +
   تاريخ + سبب) ← يتحوّل الطلب إلى الوكيل ← يمنحه الوكيل (منصة / تطبيق الجوال /
   تلقرام) فيُصدر تصريح خروج بباركود ← يُطبع التصريح ويُبرز عند بوابة الخروج.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var VIA = [
    { value: 'platform', label: 'منصة تابعني' },
    { value: 'app', label: 'تطبيق الجوال' },
    { value: 'telegram', label: 'تلقرام' }
  ];
  var VIA_LABEL = { platform: 'منصة تابعني', app: 'تطبيق الجوال', telegram: 'تلقرام' };
  var STATUS = {
    deputy_pending: { label: 'بانتظار الوكيل', tone: 'amber' },
    granted: { label: 'ممنوح', tone: 'mint' }
  };

  /* ------------------------------------------------------------- مساعدات */
  function studentName(id) { var s = S.find('students', id); return s ? s.name : '—'; }
  /** يبني تاريخًا محليًا من نص ISO (yyyy-mm-dd) دون انزياح المنطقة الزمنية. */
  function dayDate(v) {
    var p = String(v || '').slice(0, 10).split('-');
    if (p.length === 3 && p[0]) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return new Date(v);
  }
  function className(id) { var k = S.find('classes', id); return k ? k.name : '—'; }
  function periodText(id) {
    var p = S.period(id); if (!p) return '—';
    return p.label + ' (' + p.start + ' — ' + p.end + ')';
  }
  function statusBadge(p) {
    var s = STATUS[p.status] || { label: p.status, tone: 'plain' };
    return UI.badge(s.label, s.tone);
  }
  function printedReport(p) {
    return S.list('reports').find(function (r) {
      return r.type === 'permission' && r.refId === p.id && (r.prints || 0) > 0;
    }) || null;
  }
  /** مسار الحالة: محوّل للوكيل ← ممنوح ← طُبع */
  function flow(p) {
    var granted = p.status === 'granted';
    var printed = !!printedReport(p);
    var step = function (label, cls) { return h('span', { class: 'flow-step ' + (cls || ''), text: label }); };
    return h('div', { class: 'status-flow' }, [
      step('محوّل للوكيل', granted ? 'is-done' : 'is-current'),
      h('span', { class: 'muted', text: '←' }),
      step('ممنوح', printed ? 'is-done' : (granted ? 'is-current' : '')),
      h('span', { class: 'muted', text: '←' }),
      step('طُبع', printed ? 'is-done' : '')
    ]);
  }
  function kvRows(pairs) {
    return h('dl', { class: 'kv' }, pairs.reduce(function (acc, pr) {
      acc.push(h('dt', { text: pr[0] }));
      acc.push(h('dd', { text: (pr[1] == null || pr[1] === '') ? '—' : String(pr[1]) }));
      return acc;
    }, []));
  }
  /** زر طباعة تقرير + إعادة رسم اللوحة بعده ليتحدّث مسار الحالة. */
  function printButton(build, opts, after) {
    var btn = UI.reportButton(build, opts);
    if (after) btn.addEventListener('click', function () { setTimeout(after, 100); });
    return btn;
  }
  function permitRowData(p) {
    var via = (p.granted && p.granted.via) ? (VIA_LABEL[p.granted.via] || p.granted.via) : '—';
    return [
      ['رقم التصريح', p.exitNo],
      ['رقم طلب الاستئذان', p.number],
      ['اسم الطالب', studentName(p.studentId)],
      ['الصف والفصل', className(p.classId)],
      ['الحصة التي عنده', periodText(p.periodId)],
      ['وقت الخروج', p.granted ? UI.fmtTime(p.granted.at) : '—'],
      ['التاريخ الميلادي والهجري', UI.dateLabel(dayDate(p.date))],
      ['طريقة المنح', via],
      ['الجهة المُصدِرة', 'وكيل شؤون الطلاب']
    ];
  }
  function permitReport(p) {
    var rep = S.registerReport('permission', p.id, { title: 'تصريح خروج — ' + p.exitNo });
    return {
      type: 'permission', refId: p.id, id: rep.id, code: rep.code,
      title: 'تصريح خروج طالب',
      subtitle: 'رقم التصريح: ' + p.exitNo,
      meta: [
        { label: 'اسم الطالب', value: studentName(p.studentId) },
        { label: 'الصف والفصل', value: className(p.classId) },
        { label: 'الحصة', value: periodText(p.periodId) },
        { label: 'التاريخ', value: UI.dateLabel(dayDate(p.date)) }
      ],
      sections: [
        { heading: 'بيانات التصريح', table: { cols: ['البند', 'التفصيل'], rows: permitRowData(p) } },
        { heading: 'إقرار', text: 'هذا التصريح صادر من وكيل شؤون الطلاب، ويجب إبرازه عند بوابة الخروج. صلاحيته محصورة في التاريخ والحصة الموضحين، ولا يُسمح للطالب بالخروج دون هذا التصريح.' }
      ],
      qrNote: 'امسح الباركود للتحقق من تصريح الخروج رقم ' + p.exitNo + '. التصريح صادر من وكيل شؤون الطلاب ويُبرز عند بوابة الخروج.',
      signatures: ['وكيل شؤون الطلاب', 'حارس البوابة']
    };
  }

  /* ========================================================= دور التوجيه والإرشاد */
  function renderGuidance(view) {
    var schoolId = S.session.schoolId;
    var classes = S.list('classes', { schoolId: schoolId });
    var subjects = [];
    S.subjectsFor(classes.map(function (c) { return c.stage; })).forEach(function (s) {
      if (subjects.indexOf(s) === -1) subjects.push(s);
    });
    var studentOpts = [];
    classes.forEach(function (c) {
      S.studentsOf(c.id).forEach(function (st) {
        studentOpts.push({ value: st.id, label: c.name + ' — ' + st.name });
      });
    });
    var periodOpts = S.periodsOf(schoolId).map(function (p) {
      return { value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ')' };
    });

    var listSlot = h('div');

    function drawList() {
      clear(listSlot);
      var mine = S.list('permissions').filter(function (p) { return p.requestedBy === S.session.userId; });
      listSlot.appendChild(UI.panel('الطلبات التي حوّلتها إلى الوكيل', 'تُتابع هنا حالة كل طلب حتى المنح.', null, [
        mine.length ? UI.table({
          cols: [
            { label: 'رقم الطلب', render: function (p) { return p.number; } },
            { label: 'الطالب', render: function (p) { return studentName(p.studentId); } },
            { label: 'الفصل', render: function (p) { return className(p.classId); } },
            { label: 'الحصة', render: function (p) { return periodText(p.periodId); } },
            { label: 'التاريخ', render: function (p) { return UI.fmtDate(p.date); } },
            { label: 'السبب', render: function (p) { return p.reason; } },
            { label: 'الحالة', render: function (p) { return statusBadge(p); } },
            { label: 'المسار', render: function (p) { return flow(p); } }
          ], rows: mine, empty: 'لم تحوّل أي طلب بعد.'
        }) : UI.empty('لم تحوّل أي طلب بعد — استخدم زر التحويل أعلاه.')
      ]));
    }

    function openForm() {
      UI.formModal({
        title: 'تحويل طلب استئذان إلى وكيل شؤون الطلاب', wide: true, submitLabel: 'تحويل الطلب',
        intro: 'يُسجَّل الطلب هنا ثم يُحوَّل إلى طابور الوكيل لمنح تصريح الخروج.',
        fields: [
          { name: 'studentId', label: 'الطالب', type: 'select', required: true, options: studentOpts,
            placeholder: studentOpts.length ? 'اختر الطالب (مجمّعين حسب الفصل)' : 'لا طلاب مسجّلون' },
          { name: 'subject', label: 'المادة', type: 'select', required: true, half: true,
            placeholder: subjects.length ? 'اختر المادة' : 'لا مواد',
            options: subjects.map(function (s) { return { value: s, label: s }; }) },
          { name: 'periodId', label: 'الحصة', type: 'select', required: true, half: true,
            placeholder: periodOpts.length ? 'اختر الحصة' : 'لا حصص', options: periodOpts },
          { name: 'date', label: 'التاريخ', type: 'date', required: true, value: UI.today(), half: true },
          { name: 'reason', label: 'سبب الاستئذان', type: 'textarea', required: true, rows: 3,
            placeholder: 'مثال: مراجعة طبية في مستشفى الملك فهد' }
        ],
        onSubmit: function (data) {
          var st = S.find('students', data.studentId) || {};
          S.createPermission({
            studentId: data.studentId, classId: st.classId, subject: data.subject,
            periodId: data.periodId, date: data.date, reason: data.reason,
            requestedBy: S.session.userId, status: 'deputy_pending'
          });
          UI.toast('حُوّل طلب الاستئذان إلى وكيل شؤون الطلاب', 'ok');
          drawList();
          return true;
        }
      });
    }

    view.appendChild(UI.panel('تحويل استئذان', 'يُسجَّل الطلب من التوجيه والإرشاد ثم يُحوَّل إلى الوكيل لمنحه.', [
      h('button', { class: 'btn btn-primary', type: 'button', text: 'تحويل طلب استئذان للوكيل', onClick: openForm })
    ], [
      h('p', { class: 'muted', text: 'اختر الطالب والحصة والمادة والتاريخ، واكتب سبب الاستئذان؛ ثم يُحوَّل الطلب مباشرة إلى طابور وكيل شؤون الطلاب.' })
    ]));
    view.appendChild(listSlot);
    drawList();
  }

  /* =============================================================== دور الوكيل */
  function renderDeputy(view) {
    function pending() { return S.list('permissions').filter(function (p) { return p.status === 'deputy_pending'; }); }
    function grantedList() { return S.list('permissions').filter(function (p) { return p.status === 'granted'; }); }

    var statsSlot = h('div'), queueSlot = h('div'), permitSlot = h('div'), grantedSlot = h('div');
    var openPermitId = null;

    function drawStats() {
      clear(statsSlot);
      var g = grantedList();
      var printedN = g.filter(function (p) { return printedReport(p); }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('بانتظار المنح', String(pending().length), 'طلب', pending().length ? 'gold' : null),
        UI.statCard('تصاريح ممنوحة', String(g.length)),
        UI.statCard('تصاريح مطبوعة', String(printedN))
      ]));
    }

    function drawQueue() {
      clear(queueSlot);
      var rows = pending();
      queueSlot.appendChild(UI.panel('بانتظار المنح', rows.length ? rows.length + ' طلب بانتظار قرارك' : null, null, [
        rows.length ? UI.table({
          cols: [
            { label: 'رقم الطلب', render: function (p) { return p.number; } },
            { label: 'الطالب', render: function (p) { return studentName(p.studentId); } },
            { label: 'الفصل', render: function (p) { return className(p.classId); } },
            { label: 'الحصة', render: function (p) { return periodText(p.periodId); } },
            { label: 'التاريخ', render: function (p) { return UI.fmtDate(p.date); } },
            { label: 'السبب', render: function (p) { return p.reason; } },
            { label: '', render: function (p) {
              return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'منح الاستئذان', onClick: function () { openGrant(p); } });
            } }
          ], rows: rows, empty: 'لا طلبات بانتظار المنح.'
        }) : UI.empty('لا طلبات بانتظار المنح — كل الطلبات مُعالجة.')
      ]));
    }

    function openGrant(p) {
      UI.formModal({
        title: 'منح الاستئذان — ' + p.number, submitLabel: 'منح وتحرير تصريح الخروج',
        intro: studentName(p.studentId) + ' · ' + className(p.classId) + ' · ' + periodText(p.periodId),
        fields: [
          { name: 'via', label: 'طريقة المنح', type: 'select', required: true, value: 'platform', options: VIA }
        ],
        onSubmit: function (data) {
          var x = S.grantPermission(p.id, data.via);
          if (!x) { UI.toast('تعذّر منح الاستئذان', 'err'); return false; }
          openPermitId = x.id;
          UI.toast('مُنح الاستئذان وأُصدر تصريح الخروج ' + x.exitNo, 'ok');
          drawAll();
          setTimeout(function () { permitSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
          return true;
        }
      });
    }

    function drawPermit() {
      clear(permitSlot);
      var p = openPermitId ? S.find('permissions', openPermitId) : null;
      if (!p || p.status !== 'granted') return;
      permitSlot.appendChild(UI.panel('تصريح الخروج — ' + p.exitNo, 'صادر من وكيل شؤون الطلاب · يُبرز عند بوابة الخروج.', [
        printButton(function () { return permitReport(p); }, { label: 'طباعة تصريح الخروج', class: 'btn-primary' }, drawAll)
      ], [
        UI.qrBox(p.exitNo, 'رمز تصريح الخروج', 110),
        h('div', { style: { marginTop: '12px' } }, [kvRows(permitRowData(p))]),
        flow(p),
        h('div', { class: 'muted-block', style: { marginTop: '10px' },
          text: 'يجب إبراز هذا التصريح عند بوابة الخروج. لا يُسمح بالخروج دون تصريح ساري مطابق لتاريخ ووقت الخروج أعلاه.' })
      ]));
    }

    function drawGranted() {
      clear(grantedSlot);
      var rows = grantedList();
      grantedSlot.appendChild(UI.panel('التصاريح الممنوحة', 'إعادة عرض أو طباعة أي تصريح صادر.', null, [
        rows.length ? UI.table({
          cols: [
            { label: 'رقم التصريح', render: function (p) { return p.exitNo; } },
            { label: 'الطالب', render: function (p) { return studentName(p.studentId); } },
            { label: 'الفصل', render: function (p) { return className(p.classId); } },
            { label: 'الحصة', render: function (p) { return periodText(p.periodId); } },
            { label: 'التاريخ', render: function (p) { return UI.fmtDate(p.date); } },
            { label: 'طريقة المنح', render: function (p) { return (p.granted && p.granted.via) ? (VIA_LABEL[p.granted.via] || p.granted.via) : '—'; } },
            { label: 'الطباعة', render: function (p) { return printedReport(p) ? UI.badge('طُبع', 'mint') : UI.badge('لم يُطبع', 'plain'); } },
            { label: '', render: function (p) {
              return h('button', { class: 'mini-btn', type: 'button', text: 'عرض وإعادة طباعة', onClick: function () {
                openPermitId = p.id;
                drawPermit();
                setTimeout(function () { permitSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
              } });
            } }
          ], rows: rows, empty: 'لا تصاريح ممنوحة بعد.'
        }) : UI.empty('لا تصاريح ممنوحة بعد.')
      ]));
    }

    function drawAll() { drawStats(); drawQueue(); drawGranted(); drawPermit(); }

    view.appendChild(statsSlot);
    view.appendChild(queueSlot);
    view.appendChild(permitSlot);
    view.appendChild(grantedSlot);
    drawAll();
  }

  /* =============================================================== دور الطالب */
  function renderStudent(view) {
    var mine = S.list('permissions').filter(function (p) { return p.studentId === S.session.userId; });
    var grantedN = mine.filter(function (p) { return p.status === 'granted'; }).length;
    var printedN = mine.filter(function (p) { return printedReport(p); }).length;

    view.appendChild(h('div', { class: 'stat-row' }, [
      UI.statCard('طلباتي', String(mine.length)),
      UI.statCard('ممنوحة', String(grantedN), null, grantedN ? 'gold' : null),
      UI.statCard('تصاريح مطبوعة', String(printedN))
    ]));

    view.appendChild(UI.panel('طلباتي', null, null, [
      mine.length ? UI.table({
        cols: [
          { label: 'النوع', render: function () { return 'استئذان خروج'; } },
          { label: 'الحصة', render: function (p) { return periodText(p.periodId); } },
          { label: 'التاريخ', render: function (p) { return UI.fmtDate(p.date); } },
          { label: 'الحالة', render: function (p) { return statusBadge(p); } },
          { label: 'رقم التصريح', render: function (p) { return p.exitNo || '—'; } },
          { label: 'المسار', render: function (p) { return flow(p); } }
        ], rows: mine, empty: 'لا توجد طلبات لك.'
      }) : UI.empty('لا توجد طلبات لك حتى الآن.')
    ]));

    view.appendChild(h('div', { class: 'muted-block',
      text: 'يُحوَّل طلب الاستئذان من التوجيه والإرشاد إلى وكيل شؤون الطلاب، ولا يُمنح إلا من الوكيل. عند المنح يُصدر تصريح خروج بباركود يُبرز عند بوابة الخروج.' }));
  }

  App.register({
    id: 'permissions',
    label: 'الاستئذان وتصاريح الخروج',
    icon: '&#128682;',
    roles: ['guidance', 'deputy', 'student'],
    render: function (view) {
      var role = S.session.role;
      if (role === 'guidance') { renderGuidance(view); return; }
      if (role === 'deputy') { renderDeputy(view); return; }
      renderStudent(view);
    }
  });
})();
