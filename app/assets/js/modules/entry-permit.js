/* =============================================================================
   entry-permit.js — إذن دخول الفصل (الطالب المتأخر)
   ---------------------------------------------------------------------------
   الرحلة: يصل الطالب متأخرًا ← يُصدر وكيل شؤون الطلاب أو موجّه التوجيه والإرشاد
   «إذن دخول فصل» للمعلم، ويُكتب فيه **سبب تأخّر الطالب** إلزاميًا.
   التسليم ثلاث طرق:
     ١) ورقي  : إذن مطبوع بترويسة المدرسة الرسمية وباركود تحقّق.
     ٢) تلقرام: رسالة فورية للمعلم ببيانات الطالب وسبب التأخّر.
     ٣) المنصة: رسالة خاصة في بريد المعلم + إشعار باسمه في الجرس.
   ويُتابَع الأثر: اطّلاع المعلم ← إقراره باستلام الطالب في الحصة.
   ============================================================================= */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ------------------------------------------------------------- مساعدات */
  function studentName(id) { var s = S.find('students', id); return s ? s.name : '—'; }
  function className(id) { var k = S.find('classes', id); return k ? k.name : '—'; }
  function periodText(id) {
    var p = S.period(id); if (!p) return '—';
    return p.label + ' (' + p.start + ' — ' + p.end + ')';
  }
  function timeNow() { return new Date().toTimeString().slice(0, 5); }
  /** يبني تاريخًا محليًا من نص ISO (yyyy-mm-dd) دون انزياح المنطقة الزمنية. */
  function dayDate(v) {
    var p = String(v || '').slice(0, 10).split('-');
    if (p.length === 3 && p[0]) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return new Date(v);
  }
  function roleName(r) { return S.roleLabel(r) || r || '—'; }

  /** خيارات الطلاب: مجمّعة حسب الفصل */
  function studentOptions() {
    var out = [];
    S.list('classes', { schoolId: S.session.schoolId }).forEach(function (c) {
      S.studentsOf(c.id).forEach(function (st) { out.push({ value: st.id, label: c.name + ' — ' + st.name }); });
    });
    return out;
  }
  /** كل معلمي المدرسة، ومعلمو الفصل المُحدَّد في المقدمة */
  function teacherOptions(classId) {
    var all = S.usersByRole('teacher');
    var mine = [];
    if (classId) {
      S.list('assignments', { classId: classId }).forEach(function (a) {
        if (a.teacherId && mine.indexOf(a.teacherId) === -1) mine.push(a.teacherId);
      });
    }
    mine = mine.filter(function (id) { return all.some(function (t) { return t.id === id; }); });
    var rest = all.filter(function (t) { return mine.indexOf(t.id) === -1; });
    var label = function (t) {
      var subs = (t.subjects || t.qualified || []).join('، ');
      return (mine.indexOf(t.id) > -1 ? '★ ' : '') + t.name + (subs ? ' — ' + subs : '');
    };
    return mine.map(function (id) { return all.filter(function (t) { return t.id === id; })[0]; })
      .concat(rest).map(function (t) { return { value: t.id, label: label(t) }; });
  }
  /** أمثلة أسباب جاهزة لتسريع عمل الوكيل */
  var REASONS = [
    'تأخر عن الطابور الصباحي',
    'تأخر بسبب المواصلات',
    'مراجعة طبية / مستشفى',
    'ظرف عائلي طارئ',
    'تأخر عن الحصة الأولى'
  ];

  function drawOptions(select, options, placeholder) {
    if (!select) return;
    var keep = select.value;
    clear(select);
    if (placeholder) select.appendChild(h('option', { value: '', text: placeholder }));
    options.forEach(function (o) { select.appendChild(h('option', { value: o.value, text: o.label })); });
    if (keep && options.some(function (o) { return o.value === keep; })) select.value = keep;
  }

  /* --------------------------------------------------- الورقي: تقرير رسمي */
  function permitRowData(x) {
    return [
      ['رقم الإذن', x.number],
      ['اسم الطالب', x.studentName],
      ['الصف والفصل', x.className || '—'],
      ['المادة', x.subject || '—'],
      ['الحصة', x.periodLabel || '—'],
      ['المعلم المستلم', x.teacherName],
      ['التاريخ الميلادي والهجري', UI.dateLabel(dayDate(x.date))],
      ['وقت وصول الطالب', x.arrivalTime + (x.lateMinutes ? ' — تأخّر ' + x.lateMinutes + ' دقيقة' : '')],
      ['سبب التأخّر', x.reason],
      ['ملاحظة', x.note || '—'],
      ['صادر من', x.issuedByName + ' (' + roleName(x.issuedByRole) + ')'],
      ['وقت الإصدار', UI.fmtTime(x.issuedAt)]
    ];
  }
  function permitReport(x) {
    var rep = S.registerReport('entryPermit', x.id, { title: 'إذن دخول فصل — ' + x.number });
    return {
      type: 'entryPermit', refId: x.id, id: rep.id, code: rep.code,
      title: 'إذن دخول فصل',
      subtitle: 'رقم الإذن: ' + x.number,
      meta: [
        { label: 'اسم الطالب', value: x.studentName },
        { label: 'الصف والفصل', value: x.className || '—' },
        { label: 'المعلم المستلم', value: x.teacherName },
        { label: 'التاريخ', value: UI.dateLabel(dayDate(x.date)) }
      ],
      sections: [
        { heading: 'بيانات الإذن', table: { cols: ['البند', 'التفصيل'], rows: permitRowData(x) } },
        {
          heading: 'سبب التأخّر',
          text: x.reason + (x.note ? '\nملاحظة: ' + x.note : '')
        },
        {
          heading: 'إقرار',
          text: 'هذا الإذن صادر من ' + x.issuedByName + ' (' + roleName(x.issuedByRole) + ') ويُخوّل الطالب ' +
            x.studentName + ' بدخول الفصل بعد تأخّره عن الحصة، ويُسلَّم للمعلم ' + x.teacherName +
            '. يُحفظ الإذن في سجل المنصة ويُتحقّق من صحّته بالباركود أدناه.'
        }
      ],
      qr: x.number,
      qrTitle: 'رمز إذن الدخول — للتحقّق من الصحة',
      qrHint: 'امسح الرمز للتحقّق من رقم الإذن ' + x.number + ' في سجل منصة تابعني.',
      qrNote: 'رقم الإذن ' + x.number + ' · أُصدر ' + UI.fmtDateTime(x.issuedAt) + ' · صادر من ' + x.issuedByName + '.',
      signatures: ['المعلم المستلم', roleName(x.issuedByRole)]
    };
  }
  /** زر طباعة يعلّم الإذن «مطبوعًا» بعد إخراجه (أثر ورقي) */
  function printButton(x, after) {
    var btn = UI.reportButton(function () { return permitReport(x); }, { label: 'طباعة الإذن (ورقي)', class: 'btn-primary' });
    btn.addEventListener('click', function () {
      setTimeout(function () {
        S.update('entryPermits', x.id, { printed: { at: S.now(), by: S.session.name } });
        if (after) after();
      }, 150);
    });
    return btn;
  }

  /* ==================================================== لوحة الإصدار (الوكيل/التوجيه) */
  function renderIssuer(view) {
    var statsSlot = h('div'), tableSlot = h('div'), boxSlot = h('div');
    var openId = null;

    function mine() {
      /* الوكيل والتوجيه يريان كل أذون المدرسة، وأذون هذا المستخدم أولًا */
      return S.entryPermits({ schoolId: S.session.schoolId });
    }
    function myIssued() { return mine().filter(function (x) { return x.issuedBy === S.session.userId; }); }

    function drawStats() {
      clear(statsSlot);
      var all = mine();
      var today = all.filter(function (x) { return x.date === UI.today(); });
      var waiting = all.filter(function (x) { return !x.ack; }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('أذون اليوم', String(today.length), 'إذن دخول', today.length ? 'gold' : null),
        UI.statCard('أصدرتها أنت', String(myIssued().length), 'منذ البداية'),
        UI.statCard('بانتظار إقرار المعلم', String(waiting), 'لم يُقرّ الاستلام بعد')
      ]));
    }

    function openForm() {
      var fm;
      fm = UI.formModal({
        title: 'إصدار إذن دخول فصل', wide: true, submitLabel: 'إصدار الإذن وتسليمه للمعلم',
        intro: 'يُسجَّل الإذن برقمه، ويُسلَّم للمعلم فورًا: رسالة خاصة في المنصة + إشعار + تلقرام، ويُطبع ورقيًا بتروازة المدرسة وباركود.',
        fields: [
          { name: 'studentId', label: 'الطالب', type: 'select', required: true, options: studentOptions(),
            placeholder: studentOptions().length ? 'اختر الطالب (مجمّعين حسب الفصل)' : 'لا طلاب مسجّلون',
            onChange: function () {
              var st = S.find('students', fm.box.querySelector('[name="studentId"]').value) || {};
              var sel = fm.box.querySelector('[name="teacherId"]');
              drawOptions(sel, teacherOptions(st.classId), 'اختر المعلم المستلم');
              var info = fm.box.querySelector('[data-class-info]');
              if (info) info.textContent = st.classId ? 'الفصل: ' + className(st.classId) : 'الطالب غير مسكّن في فصل';
            } },
          { name: 'subject', label: 'المادة', type: 'select', half: true, placeholder: 'اختر المادة',
            options: (function () {
              var subs = [];
              S.list('classes', { schoolId: S.session.schoolId }).forEach(function (c) {
                S.subjectsFor([c.stage]).forEach(function (s) { if (subs.indexOf(s) === -1) subs.push(s); });
              });
              return subs.map(function (s) { return { value: s, label: s }; });
            })() },
          { name: 'periodId', label: 'الحصة', type: 'select', half: true, placeholder: 'اختر الحصة',
            options: S.periodsOf(S.session.schoolId).map(function (p) {
              return { value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ')' };
            }) },
          { name: 'teacherId', label: 'المعلم المستلم', type: 'select', required: true,
            options: teacherOptions(null), placeholder: 'اختر المعلم المستلم' },
          { name: 'date', label: 'التاريخ', type: 'date', required: true, half: true, value: UI.today() },
          { name: 'arrivalTime', label: 'وقت وصول الطالب', type: 'time', required: true, half: true, value: timeNow() },
          { name: 'lateMinutes', label: 'مدة التأخّر (دقيقة)', type: 'number', min: 0, half: true, placeholder: 'مثال: 10' },
          { name: 'latePreset', label: 'سبب جاهز (اختياري)', type: 'select', half: true, placeholder: 'اختر لتعبئة السبب',
            options: REASONS.map(function (r) { return { value: r, label: r }; }),
            onChange: function (e) {
              if (!e.target.value) return;
              var box = fm.box.querySelector('[name="reason"]');
              if (box) box.value = e.target.value;
            } },
          { name: 'reason', label: 'سبب تأخّر الطالب', type: 'textarea', required: true, rows: 3,
            placeholder: 'مثال: تأخر عن الحصة الثانية بسبب مراجعة طبية في مستشفى الملك فهد' },
          { name: 'note', label: 'ملاحظة للمعلم (اختياري)', type: 'textarea', rows: 2,
            placeholder: 'مثال: أُبلغ ولي الأمر، ويُتابع الطالب أكاديميًا' }
        ],
        extra: h('p', { class: 'hint', 'data-class-info': '', text: 'الفصل: —' }),
        onSubmit: function (d) {
          var r = S.createEntryPermit(d);
          if (!r.ok) { UI.toast(r.error, 'err'); return false; }
          openId = r.permit.id;
          UI.toast('أُصدر الإذن ' + r.permit.number + ' وسُلّم للمعلم ' + r.permit.teacherName, 'ok');
          drawAll();
          setTimeout(function () { boxSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
          return true;
        }
      });
      return fm;
    }

    function drawBox() {
      clear(boxSlot);
      var x = openId ? S.findEntryPermit(openId) : null;
      if (!x) return;
      var st = S.entryPermitState(x);
      boxSlot.appendChild(UI.panel('الإذن الصادر — ' + x.number, 'صادر من ' + x.issuedByName + ' (' + roleName(x.issuedByRole) + ')', [
        printButton(x, drawAll)
      ], [
        h('div', { class: 'stat-row', style: { marginBottom: '12px' } }, [
          UI.statCard('التسليم', '٣ طرق', 'منصة · تلقرام · ورقي', 'gold'),
          UI.statCard('الحالة', st.label, st.at ? UI.fmtDateTime(st.at) : 'بانتظار المعلم', st.id === 'ack' ? 'gold' : null)
        ]),
        UI.qrBox(x.number, 'رمز إذن الدخول', 110),
        h('div', { style: { marginTop: '12px' } }, [kvRows(permitRowData(x))]),
        h('div', { class: 'callout tip', style: { marginTop: '10px' },
          text: 'سُلّم الإذن للمعلم ' + x.teacherName + ' كرسالة خاصة في المنصة مع إشعار باسمه، وأُرسلت نسخة على تلقرام. اطبع النسخة الورقية وسلّمها للمعلم عند البوابة أو الفصل.' })
      ]));
    }
    function kvRows(pairs) {
      return h('dl', { class: 'kv' }, pairs.reduce(function (acc, pr) {
        acc.push(h('dt', { text: pr[0] }));
        acc.push(h('dd', { text: (pr[1] == null || pr[1] === '') ? '—' : String(pr[1]) }));
        return acc;
      }, []));
    }

    function drawTable() {
      clear(tableSlot);
      var rows = mine();
      tableSlot.appendChild(UI.panel('سجل أذون الدخول', rows.length ? rows.length + ' إذن' : 'لم يُصدر أي إذن بعد.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: '\u2795 إصدار إذن دخول', onClick: openForm })
      ], [
        rows.length ? UI.table({
          cols: [
            { label: 'رقم الإذن', render: function (x) { return h('strong', { text: x.number }); } },
            { label: 'الطالب', render: function (x) { return x.studentName; } },
            { label: 'الفصل', render: function (x) { return x.className || '—'; } },
            { label: 'المعلم المستلم', render: function (x) { return x.teacherName; } },
            { label: 'الحصة', render: function (x) { return x.periodLabel || '—'; } },
            { label: 'وقت الوصول', render: function (x) { return x.arrivalTime + (x.lateMinutes ? ' (' + x.lateMinutes + ' د)' : ''); } },
            { label: 'سبب التأخّر', render: function (x) { return x.reason; } },
            { label: 'الحالة', render: function (x) {
                var st = S.entryPermitState(x);
                return UI.badge(st.label, st.tone);
              } },
            { label: 'الطباعة', render: function (x) { return x.printed ? UI.badge('طُبع', 'mint') : UI.badge('لم يُطبع', 'ink'); } },
            { label: 'صادر من', render: function (x) { return x.issuedByName + (x.issuedBy === S.session.userId ? ' (أنت)' : ''); } },
            { label: '', render: function (x) {
                return h('button', { class: 'mini-btn', type: 'button', text: 'عرض وطباعة', onClick: function () {
                  openId = x.id;
                  drawBox();
                  setTimeout(function () { boxSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
                } });
              } }
          ], rows: rows, empty: 'لم يُصدر أي إذن دخول بعد.'
        }) : UI.empty('لا أذون بعد — اضغط «إصدار إذن دخول» لتسجيل أول إذن لطالب متأخر.')
      ]));
    }

    function drawAll() { drawStats(); drawTable(); drawBox(); }
    view.appendChild(statsSlot);
    view.appendChild(tableSlot);
    view.appendChild(boxSlot);
    drawAll();
  }

  /* ==================================================== لوحة المعلم (المستلم) */
  function renderTeacher(view) {
    var statsSlot = h('div'), listSlot = h('div');

    function mine() { return S.entryPermits({ schoolId: S.session.schoolId, teacherId: S.session.userId }); }

    function drawStats() {
      clear(statsSlot);
      var all = mine();
      var fresh = all.filter(function (x) { return !x.seen; }).length;
      var unacked = all.filter(function (x) { return !x.ack; }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('أذون دخول وصلتني', String(all.length)),
        UI.statCard('جديد لم يُفتح', String(fresh), 'إذن', fresh ? 'gold' : null),
        UI.statCard('بانتظار إقراري', String(unacked))
      ]));
    }

    function drawList() {
      clear(listSlot);
      var rows = mine();
      listSlot.appendChild(UI.panel('أذون دخول الفصل', 'تُصدر من وكيل شؤون الطلاب أو التوجيه والإرشاد، وتصلك كرسالة خاصة مع إشعار.', null, [
        rows.length ? h('div', { class: 'stack' }, rows.map(function (x) {
          var st = S.entryPermitState(x);
          return h('div', { class: 'callout' + (x.ack ? '' : (x.seen ? '' : ' is-new')), style: { marginBottom: '10px' } }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, [
              h('strong', { text: 'إذن دخول — ' + x.studentName + ' · ' + x.number }),
              UI.badge(st.label, st.tone)
            ]),
            h('div', { class: 'muted', style: { marginTop: '6px' },
              text: (x.className || '—') + (x.subject ? ' · ' + x.subject : '') + (x.periodLabel ? ' · ' + x.periodLabel : '') +
                ' · وقت الوصول: ' + x.arrivalTime }),
            h('div', { style: { marginTop: '6px' } }, [h('strong', { text: 'سبب التأخّر: ' }), h('span', { text: x.reason })]),
            x.note ? h('div', { class: 'muted', style: { marginTop: '4px' }, text: 'ملاحظة: ' + x.note }) : null,
            h('div', { class: 'muted', style: { marginTop: '6px' }, text: 'صادر من ' + x.issuedByName + ' (' + roleName(x.issuedByRole) + ') · ' + UI.fmtDateTime(x.issuedAt) }),
            h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
              x.ack ? h('span', { class: 'duty-chip', text: 'أقررت الاستلام · ' + UI.fmtTime(x.ack.at) })
                    : h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'أُقرّ باستلام الطالب', onClick: function () {
                        S.ackEntryPermit(x.id);
                        UI.toast('سُجّل إقرارك باستلام الطالب', 'ok');
                        drawAll();
                      } }),
              printButton(x, drawAll)
            ])
          ]);
        })) : UI.empty('لا أذون دخول لك بعد. تصل إليك تلقائيًا عند تسجيل طالب متأخر.')
      ]));
    }

    function drawAll() { drawStats(); drawList(); }
    view.appendChild(statsSlot);
    view.appendChild(listSlot);
    drawAll();
    /* يُسجَّل اطّلاع المعلم على الأذون بمجرد فتح الوحدة (أثر متابعة) */
    mine().forEach(function (x) { if (!x.seen) S.seenEntryPermit(x.id); });
  }

  /* ==================================================== لوحة المدير (متابعة) */
  function renderPrincipal(view) {
    var rows = S.entryPermits({ schoolId: S.session.schoolId });
    view.appendChild(h('div', { class: 'stat-row' }, [
      UI.statCard('أذون الدخول', String(rows.length), 'كل المدرسة'),
      UI.statCard('أُقِرّ استلامها', String(rows.filter(function (x) { return x.ack; }).length)),
      UI.statCard('بانتظار إقرار المعلم', String(rows.filter(function (x) { return !x.ack; }).length))
    ]));
    view.appendChild(UI.panel('سجل أذون دخول الفصل', 'للاطلاع والمتابعة — الإصدار من وكيل شؤون الطلاب والتوجيه والإرشاد.', null, [
      rows.length ? UI.table({
        cols: [
          { label: 'رقم الإذن', render: function (x) { return x.number; } },
          { label: 'التاريخ', render: function (x) { return UI.fmtDate(x.date) + ' · ' + x.arrivalTime; } },
          { label: 'الطالب', render: function (x) { return x.studentName; } },
          { label: 'الفصل', render: function (x) { return x.className || '—'; } },
          { label: 'المعلم المستلم', render: function (x) { return x.teacherName; } },
          { label: 'سبب التأخّر', render: function (x) { return x.reason; } },
          { label: 'صادر من', render: function (x) { return x.issuedByName + ' (' + roleName(x.issuedByRole) + ')'; } },
          { label: 'الحالة', render: function (x) { var st = S.entryPermitState(x); return UI.badge(st.label, st.tone); } },
          { label: '', render: function (x) { return printButton(x, null); } }
        ], rows: rows, empty: 'لا أذون دخول.'
      }) : UI.empty('لا أذون دخول مسجّلة بعد.')
    ]));
  }

  /* يُتاح بنّاء الإذن الورقي لوحدة «الرسائل الخاصة» (إعادة طباعة الإذن من الرسالة) */
  App.entryPermitReport = permitReport;

  App.register({
    id: 'entry-permit',
    label: 'إذن دخول الفصل',
    icon: '&#127903;',
    roles: ['deputy', 'guidance', 'teacher', 'principal'],
    render: function (view) {
      var role = S.session.role;
      if (role === 'teacher') { renderTeacher(view); return; }
      if (role === 'principal') { renderPrincipal(view); return; }
      renderIssuer(view);
    }
  });
})();
