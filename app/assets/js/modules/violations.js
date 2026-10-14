/* =============================================================================
   violations.js — المخالفات السلوكية
   ---------------------------------------------------------------------------
   دورة كاملة: المعلم يسجّل → التوجيه يردّ بالإجراء المقترح → الوكيل ينفّذ اللائحة
   ويُغلق → المدير يتابع السجل الكامل ويطبع التقارير بالباركود.
   الواجهة تتغيّر بحسب الدور: teacher / guidance / deputy / principal.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ------------------------------------------------------------------ ثوابت */
  var TYPES = ['إخلال بالنظام الصفي', 'عدم إحضار الأدوات', 'التأخر عن الحصة', 'التنمر', 'إتلاف ممتلكات', 'استخدام الجوال', 'أخرى'];
  var DEGREES = ['بسيطة', 'متوسطة', 'جسيمة'];
  var PROCEDURES = ['تنبيه شفهي', 'إشعار ولي الأمر', 'تعهد كتابي', 'استدعاء ولي الأمر', 'مجلس طلابي'];
  var GUIDE_OPTIONS = ['خصم درجات سلوك', 'إشعار ولي الأمر', 'تعهد', 'إحالة لمجلس التوجيه', 'متابعة أسبوعية'];
  var ACTION_LABELS = ['خصم درجات سلوك', 'إشعار ولي الأمر', 'تعهد كتابي', 'استدعاء ولي الأمر', 'مجلس طلابي', 'إحالة لمجلس التوجيه', 'أخرى'];

  var STATUS_LABEL = { guidance_pending: 'بانتظار ردّ التوجيه', deputy_pending: 'بانتظار إجراء الوكيل', closed: 'مغلقة' };
  var STATUS_TONE = { guidance_pending: 'amber', deputy_pending: 'brand', closed: 'mint' };
  var STEPS = ['مسجّلة', 'ردّ التوجيه', 'إجراء الوكيل', 'مغلقة'];
  var CUR = { guidance_pending: 1, deputy_pending: 2, closed: 3 };

  /* -------------------------------------------------------------- مساعدات */
  function roleName() { return (S.roles.find(function (r) { return r.id === S.session.role; }) || {}).name || ''; }
  function sName(id) { var s = S.student(id); return s ? s.name : '—'; }
  function cName(id) { var c = S.klass(id); return c ? c.name : '—'; }
  function pLabel(id) { var p = S.period(id); return p ? p.label : '—'; }
  function statusBadge(v) { return UI.badge(STATUS_LABEL[v.status] || v.status, STATUS_TONE[v.status] || 'plain'); }
  function degreeBadge(d) { return UI.badge(d, d === 'جسيمة' ? 'brand' : (d === 'متوسطة' ? 'amber' : 'plain')); }

  function flowEl(status) {
    var cur = CUR[status] == null ? 0 : CUR[status];
    var parts = [];
    STEPS.forEach(function (s, i) {
      if (i) parts.push(h('span', { class: 'muted', html: '&#8594;' }));
      parts.push(h('span', {
        class: 'flow-step' + (i < cur ? ' is-done' : (i === cur ? ' is-current' : '')),
        text: s
      }));
    });
    return h('div', { class: 'status-flow' }, parts);
  }

  function roleBanner(hint, actions) {
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-body' }, [
        h('div', { class: 'between' }, [
          h('div', {}, [
            h('span', { class: 'eyebrow', text: 'الدور الحالي: ' + roleName() }),
            h('p', { class: 'muted mt-3', text: hint })
          ]),
          actions ? h('div', { class: 'cluster' }, [].concat(actions)) : null
        ])
      ])
    ]);
  }

  function kvBlock(pairs) {
    return h('dl', { class: 'kv' }, pairs.reduce(function (acc, p) {
      acc.push(h('dt', { text: p[0] }), h('dd', { text: p[1] == null || p[1] === '' ? '—' : String(p[1]) }));
      return acc;
    }, []));
  }

  function checkList(items, store) {
    var box = h('div', { class: 'pick-list' });
    items.forEach(function (label) {
      var cb = h('input', { type: 'checkbox' });
      cb.addEventListener('change', function () {
        var i = store.values.indexOf(label);
        if (cb.checked && i === -1) store.values.push(label);
        if (!cb.checked && i > -1) store.values.splice(i, 1);
      });
      box.appendChild(h('label', {}, [cb, h('span', { text: label })]));
    });
    return box;
  }

  function ensureReport(type, refId, title) {
    var found = S.list('reports').find(function (r) { return r.type === type && r.refId === refId; });
    return found || S.registerReport(type, refId, { title: title });
  }

  /* ------------------------------------------------------- تقرير المخالفة */
  function buildViolationReport(v) {
    var rep = ensureReport('violation', v.id, 'تقرير مخالفة سلوكية — ' + v.number);
    var g = v.guidance, a = v.action;
    var guideText = g
      ? g.procedure + (g.options && g.options.length ? '\n' + g.options.map(function (o) { return '• ' + o; }).join('\n') : '')
      : 'لم يصدر رد التوجيه والإرشاد بعد.';
    var actionText = a
      ? (a.label || 'تنفيذ لائحة') + (a.deduct ? ' — خصم ' + a.deduct + ' درجة' : '') + (a.note ? '\nملاحظة الترويسة: ' + a.note : '')
      : 'لم يُنفَّذ إجراء الوكيل بعد.';
    return {
      type: 'violation', refId: v.id, code: rep ? rep.code : null,
      title: 'تقرير مخالفة سلوكية', subtitle: 'رقم القضية: ' + v.number,
      meta: [
        { label: 'رقم القضية', value: v.number },
        { label: 'الطالب', value: sName(v.studentId) },
        { label: 'الصف / الفصل', value: cName(v.classId) },
        { label: 'المادة', value: v.subject },
        { label: 'الحصة', value: pLabel(v.periodId) },
        { label: 'التاريخ', value: UI.fmtDate(v.date) + ' — ' + UI.greg(new Date(v.date)) },
        { label: 'نوع المخالفة', value: v.type },
        { label: 'درجة المخالفة', value: v.degree },
        { label: 'الحالة', value: STATUS_LABEL[v.status] || v.status }
      ],
      sections: [
        { heading: 'وصف المخالفة', text: v.description },
        { heading: 'رد التوجيه والإرشاد', text: guideText },
        { heading: 'إجراء وكيل شؤون الطلاب', text: actionText },
        { heading: 'محاضر المخالفة', table: { cols: ['التاريخ والوقت', 'الجهة', 'الحدث'], rows: (v.timeline || []).map(function (t) { return [UI.fmtDateTime(t.at), t.by || '—', t.text]; }) } },
        { heading: 'تواريخ المتابعة', table: { cols: ['المرحلة', 'التاريخ'], rows: [
          ['التسجيل', UI.fmtDateTime(v.createdAt)],
          ['رد التوجيه', g ? UI.fmtDateTime(g.at) : '—'],
          ['إجراء الوكيل', a ? UI.fmtDateTime(a.at) : '—'],
          ['الإغلاق', v.closedAt ? UI.fmtDateTime(v.closedAt) : '—']
        ] } }
      ],
      signatures: ['المعلم', 'موجّه التوجيه والإرشاد', 'وكيل شؤون الطلاب', 'مدير المدرسة']
    };
  }
  function reportEl(v, label, cls) {
    return UI.reportButton(function () { return buildViolationReport(v); }, { label: label, class: cls || 'btn-outline' });
  }

  /* ---------------------------------------------------------- تفاصيل القضية */
  function detailsModal(v) {
    var g = v.guidance, a = v.action;
    var body = [
      h('div', { class: 'between' }, [flowEl(v.status), statusBadge(v)]),
      h('div', { class: 'mt-4' }, [kvBlock([
        ['رقم القضية', v.number],
        ['الطالب', sName(v.studentId)],
        ['الصف / الفصل', cName(v.classId)],
        ['المادة', v.subject],
        ['الحصة', pLabel(v.periodId)],
        ['التاريخ', UI.fmtDate(v.date)],
        ['نوع المخالفة', v.type],
        ['درجة المخالفة', v.degree]
      ])]),
      UI.panel('وصف المخالفة', null, null, [h('p', { text: v.description })]),
      UI.panel('المحاضر وردود الجهات', null, null, [
        kvBlock([
          ['رد التوجيه', g ? g.procedure : 'لم يصدر بعد'],
          ['إجراءات التوجيه', g && g.options && g.options.length ? g.options.join(' · ') : '—'],
          ['إجراء الوكيل', a ? (a.label || 'تنفيذ لائحة') : 'لم يُنفَّذ بعد'],
          ['الدرجة المخصومة', a && a.deduct ? a.deduct : 'لا يوجد'],
          ['ملاحظة الترويسة', a && a.note ? a.note : '—'],
          ['الإغلاق', v.closedAt ? UI.fmtDateTime(v.closedAt) : '—']
        ]),
        h('div', { class: 'mt-4' }, [UI.timeline(v.timeline || [])])
      ])
    ];
    var m = UI.modal({
      title: 'تفاصيل المخالفة ' + v.number, wide: true, body: body,
      actions: [
        { label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }
      ]
    });
    /* زر إعادة الطباعة داخل نافذة التفاصيل */
    m.body.appendChild(h('div', { class: 'cluster mt-4' }, [reportEl(v, 'إعادة طباعة تقرير المخالفة', 'btn-primary')]));
  }

  /* ============================================================ وحدة التسجيل */
  var ROLES = ['teacher', 'guidance', 'deputy', 'principal'];

  App.register({
    id: 'violations',
    label: 'المخالفات السلوكية',
    icon: '&#9888;&#65039;',
    roles: ROLES,
    render: function (view) {
      function paint() { clear(view); build(); }

      function all() { return S.list('violations').sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }); }

      function build() {
        var role = S.session.role;
        if (role === 'teacher') renderTeacher();
        else if (role === 'guidance') renderGuidance();
        else if (role === 'deputy') renderDeputy();
        else if (role === 'principal') renderPrincipal();
        else view.appendChild(UI.empty('هذه الوحدة غير متاحة لدورك.'));
      }

      /* ---------------------------------------------------------- المعلم */
      function myClassIds() {
        var ids = [];
        S.assignmentsOf(S.session.userId).forEach(function (a) { if (ids.indexOf(a.classId) === -1) ids.push(a.classId); });
        return ids;
      }
      function studentOptions() {
        var opts = [];
        myClassIds().forEach(function (cid) {
          var klass = S.klass(cid) || {};
          S.studentsOf(cid).forEach(function (st) { opts.push({ value: st.id, label: st.name + ' — ' + klass.name }); });
        });
        return opts;
      }
      function subjectOptions() {
        var out = [];
        S.assignmentsOf(S.session.userId).forEach(function (a) { if (out.indexOf(a.subject) === -1) out.push(a.subject); });
        return out;
      }

      function openCreateForm() {
        var students = studentOptions();
        if (!students.length) { UI.toast('لا يوجد طلاب في فصولك — راجع وكيل شؤون الطلاب', 'warn'); return; }
        UI.formModal({
          title: 'تسجيل مخالفة سلوكية', wide: true, submitLabel: 'تسجيل المخالفة',
          intro: 'تُرسل المخالفة فور تسجيلها إلى موجّه التوجيه والإرشاد ووكيل شؤون الطلاب.',
          fields: [
            { name: 'studentId', label: 'الطالب', type: 'select', required: true, half: true, placeholder: 'اختر الطالب', options: students },
            { name: 'subject', label: 'المادة', type: 'select', required: true, half: true, placeholder: 'اختر المادة', options: subjectOptions() },
            { name: 'periodId', label: 'الحصة', type: 'select', required: true, half: true, placeholder: 'اختر الحصة', options: S.periodsOf(S.session.schoolId).map(function (p) { return { value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ')' }; }) },
            { name: 'type', label: 'نوع المخالفة', type: 'select', required: true, half: true, placeholder: 'اختر النوع', options: TYPES },
            { name: 'degree', label: 'درجة المخالفة', type: 'select', required: true, half: true, placeholder: 'اختر الدرجة', options: DEGREES },
            { name: 'date', label: 'التاريخ', type: 'date', required: true, half: true, value: UI.today() },
            { name: 'description', label: 'وصف المخالفة', type: 'textarea', required: true, rows: 4, placeholder: 'اكتب وصفًا دقيقًا للمخالفة وما سبقها من تنبيهات.' }
          ],
          onSubmit: function (d) {
            var st = S.student(d.studentId);
            S.createViolation({
              studentId: d.studentId, classId: st ? st.classId : null, subject: d.subject,
              teacherId: S.session.userId, periodId: d.periodId, date: d.date,
              type: d.type, degree: d.degree, description: d.description
            });
            UI.toast('سُجّلت المخالفة وأُرسلت إلى التوجيه والوكيل', 'ok');
            paint();
          }
        });
      }

      function renderTeacher() {
        var mine = all().filter(function (v) { return v.teacherId === S.session.userId; });
        var open = mine.filter(function (v) { return v.status !== 'closed'; });
        var month = UI.today().slice(0, 7);
        var closedMonth = mine.filter(function (v) { return v.status === 'closed' && v.closedAt && v.closedAt.slice(0, 7) === month; });

        view.appendChild(roleBanner('تسجّل المخالفة، ثم يتابعها التوجيه والوكيل حتى الإغلاق.',
          h('button', { class: 'btn btn-primary', type: 'button', text: 'تسجيل مخالفة', onClick: openCreateForm })));

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('مخالفاتي', String(mine.length)),
          UI.statCard('غير مغلقة', String(open.length), null, open.length ? 'gold' : null),
          UI.statCard('مغلقة هذا الشهر', String(closedMonth.length))
        ]));

        view.appendChild(UI.panel('مخالفاتي', 'الحالة الحالية لكل مخالفة سجّلتها.', null, [
          UI.table({
            cols: [
              { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
              { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
              { label: 'الفصل', render: function (v) { return cName(v.classId); } },
              { label: 'النوع', key: 'type' },
              { label: 'الدرجة', render: function (v) { return degreeBadge(v.degree); } },
              { label: 'الحصة', render: function (v) { return pLabel(v.periodId); } },
              { label: 'التاريخ', render: function (v) { return UI.fmtDate(v.date); } },
              { label: 'الحالة', render: statusBadge },
              { label: 'إجراءات', render: function (v) { return h('div', { class: 'row-actions' }, [h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } })]); } }
            ],
            rows: mine, empty: 'لم تسجّل أي مخالفة بعد.'
          })
        ]));
      }

      /* ----------------------------------------------------------- التوجيه */
      function openGuidanceForm(v) {
        var proc = UI.field({ name: 'procedure', label: 'الإجراء المقترح', type: 'select', required: true, placeholder: 'اختر الإجراء المقترح', options: PROCEDURES });
        var notes = UI.field({ name: 'notes', label: 'ملاحظات التوجيه', type: 'textarea', rows: 3, placeholder: 'ملاحظات تُرفق مع الرد وتظهر في محاضر القضية.' });
        var store = { values: [] };
        var checks = checkList(GUIDE_OPTIONS, store);
        var err = h('p', { class: 'hint hint-error', hidden: true, text: 'يرجى اختيار الإجراء المقترح.' });
        UI.modal({
          title: 'الرد والإجراء المقترح — ' + v.number, wide: true,
          body: [
            flowEl(v.status),
            h('div', { class: 'mt-4' }, [kvBlock([['الطالب', sName(v.studentId)], ['الفصل', cName(v.classId)], ['النوع', v.type], ['الدرجة', v.degree]])]),
            proc.wrap,
            h('div', { class: 'field full' }, [h('label', { text: 'الإجراءات الممكنة (يمكن اختيار أكثر من إجراء)' }), checks]),
            notes.wrap,
            err
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            {
              label: 'إرسال الرد إلى الوكيل', class: 'btn-primary', onClick: function (close) {
                if (!proc.input.value) { err.hidden = false; return; }
                var opts = store.values.slice();
                var nt = notes.input.value.trim();
                if (nt) opts.push('ملاحظات التوجيه: ' + nt);
                S.guidanceRespond(v.id, proc.input.value, opts);
                close();
                UI.toast('أُرسل ردّ التوجيه إلى وكيل شؤون الطلاب', 'ok');
                paint();
              }
            }
          ]
        });
      }

      function renderGuidance() {
        var allV = all();
        var queue = allV.filter(function (v) { return v.status === 'guidance_pending'; });
        var done = allV.filter(function (v) { return v.guidance; });

        view.appendChild(roleBanner('تستقبل المخالفات من المعلمين، وتقترح الإجراء الإرشادي وتحوّله للوكيل لتنفيذ اللائحة.'));

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('بانتظار ردّي', String(queue.length), 'مخالفة', queue.length ? 'gold' : null),
          UI.statCard('مُعالجة', String(done.length)),
          UI.statCard('مغلقة', String(allV.filter(function (v) { return v.status === 'closed'; }).length))
        ]));

        view.appendChild(UI.panel('بانتظار ردّي', 'مخالفات تحتاج إجراءً إرشاديًا مقترحًا.', null, [
          UI.table({
            cols: [
              { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
              { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
              { label: 'الفصل', render: function (v) { return cName(v.classId); } },
              { label: 'النوع', key: 'type' },
              { label: 'الدرجة', render: function (v) { return degreeBadge(v.degree); } },
              { label: 'سجّلها', render: function (v) { var t = S.user(v.teacherId); return t ? t.name : '—'; } },
              { label: 'الوصف', render: function (v) { return h('span', { class: 'muted', text: v.description }); } },
              { label: 'إجراء', render: function (v) { return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn is-primary', type: 'button', text: 'الرد والإجراء المقترح', onClick: function () { openGuidanceForm(v); } }),
                h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } })
              ]); } }
            ],
            rows: queue, empty: 'لا مخالفات بانتظار ردّك.'
          })
        ]));

        view.appendChild(UI.panel('مُعالجة', 'سجل المخالفات التي أصدرتَ فيها ردًّا.', null, [
          UI.table({
            cols: [
              { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
              { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
              { label: 'الإجراء المقترح', render: function (v) { return v.guidance ? v.guidance.procedure : '—'; } },
              { label: 'الإجراءات', render: function (v) { return v.guidance && v.guidance.options && v.guidance.options.length ? v.guidance.options.join(' · ') : '—'; } },
              { label: 'الحالة', render: statusBadge },
              { label: 'إجراءات', render: function (v) { return h('div', { class: 'row-actions' }, [h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } })]); } }
            ],
            rows: done, empty: 'لا يوجد سجل معالجة بعد.'
          })
        ]));
      }

      /* ------------------------------------------------------------- الوكيل */
      function openActionForm(v) {
        var chk = h('input', { type: 'checkbox' });
        var chkLine = h('label', { class: 'checkline' }, [chk, h('span', { text: 'خصم درجات سلوك' })]);
        var numF = UI.field({ name: 'deduct', label: 'عدد الدرجات المخصومة', type: 'number', min: 1, max: 30, value: '1' });
        numF.wrap.hidden = true;
        chk.addEventListener('change', function () { numF.wrap.hidden = !chk.checked; });
        var act = UI.field({ name: 'label', label: 'الإجراء المتخذ', type: 'select', required: true, placeholder: 'اختر الإجراء المتخذ', options: ACTION_LABELS });
        var note = UI.field({ name: 'note', label: 'ملاحظة الترويسة', type: 'textarea', rows: 2, placeholder: 'ملاحظة إدارية تُدرج في ترويسة تقرير القضية.' });
        var err = h('p', { class: 'hint hint-error', hidden: true, text: 'يرجى اختيار الإجراء المتخذ.' });

        UI.modal({
          title: 'تنفيذ اللائحة والإغلاق — ' + v.number, wide: true,
          body: [
            flowEl(v.status),
            h('div', { class: 'mt-4' }, [kvBlock([
              ['الطالب', sName(v.studentId)], ['الفصل', cName(v.classId)], ['النوع', v.type], ['الدرجة', v.degree],
              ['الإجراء المقترح من التوجيه', v.guidance ? v.guidance.procedure : '—'],
              ['إجراءات التوجيه', v.guidance && v.guidance.options && v.guidance.options.length ? v.guidance.options.join(' · ') : '—']
            ])]),
            h('div', { class: 'field full' }, [chkLine]),
            numF.wrap,
            act.wrap,
            note.wrap,
            err
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            {
              label: 'تنفيذ الإغلاق', class: 'btn-primary', onClick: function (close) {
                if (!act.input.value) { err.hidden = false; return; }
                var deduct = chk.checked ? Number(numF.input.value || 0) : 0;
                if (chk.checked && (!deduct || deduct <= 0)) { err.hidden = false; err.textContent = 'أدخل عدد الدرجات المخصومة.'; return; }
                var res = S.applyViolationAction(v.id, { deduct: deduct, note: note.input.value.trim(), label: act.input.value });
                close();
                UI.toast('أُغلقت المخالفة وأُرسل إشعار إلى: المعلم · التوجيه · مدير المدرسة', 'ok');
                paint();
                if (res && res.violation) closedSummary(res.violation);
              }
            }
          ]
        });
      }

      function closedSummary(v) {
        var body = [
          h('div', { class: 'between' }, [flowEl(v.status), statusBadge(v)]),
          h('div', { class: 'mt-4' }, [kvBlock([
            ['الطالب', sName(v.studentId)],
            ['الإجراء المتخذ', v.action ? v.action.label : '—'],
            ['الدرجة المخصومة', v.action && v.action.deduct ? v.action.deduct : 'لا يوجد'],
            ['ملاحظة الترويسة', v.action && v.action.note ? v.action.note : '—'],
            ['تاريخ الإغلاق', v.closedAt ? UI.fmtDateTime(v.closedAt) : '—']
          ])]),
          h('p', { class: 'muted', text: 'أُرسل إشعار الإغلاق إلى المعلم وموجّه التوجيه ومدير المدرسة، وسُجِّل التقرير في مركز التقارير.' }),
          h('div', { class: 'cluster mt-4' }, [reportEl(v, 'طباعة تقرير مخالفة سلوكية', 'btn-primary')])
        ];
        UI.modal({ title: 'تم تنفيذ اللائحة وإغلاق المخالفة', wide: true, body: body, actions: [{ label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }] });
      }

      function renderDeputy() {
        var allV = all();
        var queue = allV.filter(function (v) { return v.status === 'deputy_pending'; });
        var closed = allV.filter(function (v) { return v.status === 'closed'; });

        view.appendChild(roleBanner('تنفّذ لائحة السلوك على المخالفات التي ردّ عليها التوجيه، وتُغلق القضية مع تقرير مفصل بالباركود.'));

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('بانتظار تنفيذ اللائحة', String(queue.length), 'قضية', queue.length ? 'gold' : null),
          UI.statCard('مغلقة', String(closed.length)),
          UI.statCard('إجمالي المخالفات', String(allV.length))
        ]));

        view.appendChild(UI.panel('بانتظار تنفيذ اللائحة', 'قضايا جاهزة للإجراء بعد ردّ التوجيه والإرشاد.', null, [
          UI.table({
            cols: [
              { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
              { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
              { label: 'الفصل', render: function (v) { return cName(v.classId); } },
              { label: 'النوع', key: 'type' },
              { label: 'الدرجة', render: function (v) { return degreeBadge(v.degree); } },
              { label: 'الإجراء المقترح', render: function (v) { return v.guidance ? v.guidance.procedure : '—'; } },
              { label: 'إجراء', render: function (v) { return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تنفيذ اللائحة والإغلاق', onClick: function () { openActionForm(v); } }),
                h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } })
              ]); } }
            ],
            rows: queue, empty: 'لا قضايا بانتظار تنفيذ اللائحة.'
          })
        ]));

        view.appendChild(UI.panel('المخالفات المغلقة', 'قضايا نُفِّذت لائحتها؛ يمكن إعادة طباعة تقاريرها.', null, [
          UI.table({
            cols: [
              { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
              { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
              { label: 'الإجراء المتخذ', render: function (v) { return v.action ? v.action.label : '—'; } },
              { label: 'الدرجة المخصومة', render: function (v) { return v.action && v.action.deduct ? String(v.action.deduct) : '—'; } },
              { label: 'الإغلاق', render: function (v) { return v.closedAt ? UI.fmtDateTime(v.closedAt) : '—'; } },
              { label: 'إجراءات', render: function (v) { return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } }),
                reportEl(v, 'طباعة التقرير')
              ]); } }
            ],
            rows: closed, empty: 'لا مخالفات مغلقة بعد.'
          })
        ]));
      }

      /* ------------------------------------------------------------ المدير */
      function avgClosure() {
        var done = all().filter(function (v) { return v.status === 'closed' && v.closedAt && v.createdAt; });
        if (!done.length) return '—';
        var sum = done.reduce(function (a, v) { return a + (new Date(v.closedAt) - new Date(v.createdAt)); }, 0);
        var hrs = sum / done.length / 36e5;
        if (hrs >= 48) return (hrs / 24).toFixed(1) + ' يوم';
        return hrs.toFixed(1) + ' ساعة';
      }

      function logReport(rows, filtersLabel) {
        return {
          type: 'violations', refId: 'log-' + UI.today(),
          title: 'سجل المخالفات السلوكية', subtitle: filtersLabel,
          meta: [
            { label: 'عدد القضايا', value: rows.length },
            { label: 'مغلقة', value: rows.filter(function (v) { return v.status === 'closed'; }).length },
            { label: 'غير مغلقة', value: rows.filter(function (v) { return v.status !== 'closed'; }).length },
            { label: 'معدّل زمن الإغلاق', value: avgClosure() }
          ],
          sections: [{
            heading: 'كشف المخالفات', table: {
              cols: ['الرقم', 'الطالب', 'الفصل', 'النوع', 'الدرجة', 'التاريخ', 'الحالة', 'الإجراء'],
              rows: rows.map(function (v) { return [v.number, sName(v.studentId), cName(v.classId), v.type, v.degree, UI.fmtDate(v.date), STATUS_LABEL[v.status] || v.status, v.action ? (v.action.label || '—') : '—']; })
            }
          }],
          signatures: ['وكيل شؤون الطلاب', 'موجّه التوجيه والإرشاد', 'مدير المدرسة']
        };
      }

      function renderPrincipal() {
        var state = { status: '', type: '', classId: '' };
        var filtersRow = h('div');
        var tableRow = h('div');

        var statusSel = UI.field({ name: 'status', label: 'الحالة', type: 'select', placeholder: 'كل الحالات', options: [{ value: 'guidance_pending', label: STATUS_LABEL.guidance_pending }, { value: 'deputy_pending', label: STATUS_LABEL.deputy_pending }, { value: 'closed', label: STATUS_LABEL.closed }] });
        var typeSel = UI.field({ name: 'type', label: 'النوع', type: 'select', placeholder: 'كل الأنواع', options: TYPES });
        var classSel = UI.field({ name: 'class', label: 'الفصل', type: 'select', placeholder: 'كل الفصول', options: S.list('classes').map(function (c) { return { value: c.id, label: c.name }; }) });
        [statusSel, typeSel, classSel].forEach(function (f) {
          f.input.addEventListener('change', function () { state[f.name === 'class' ? 'classId' : f.name] = f.input.value; drawTable(); });
        });

        drawFilters();
        function drawFilters() {
          clear(filtersRow);
          filtersRow.appendChild(UI.panel('تصفية السجل', 'اختر الحالة أو النوع أو الفصل لعرض المخالفات المطابقة.', null, [
            h('div', { class: 'form-grid' }, [statusSel.wrap, typeSel.wrap, classSel.wrap])
          ]));
        }

        function filtered() {
          return all().filter(function (v) {
            if (state.status && v.status !== state.status) return false;
            if (state.type && v.type !== state.type) return false;
            if (state.classId && v.classId !== state.classId) return false;
            return true;
          });
        }

        function drawTable() {
          var rows = filtered();
          clear(tableRow);
          tableRow.appendChild(UI.panel('سجل المخالفات الكامل', 'عدد النتائج: ' + rows.length, [
            UI.reportButton(function () { return logReport(rows, labelOf()); }, { label: 'طباعة سجل المخالفات', class: 'btn-soft' })
          ], [
            UI.table({
              cols: [
                { label: 'الرقم', render: function (v) { return h('span', { class: 'nums', text: v.number }); } },
                { label: 'الطالب', render: function (v) { return sName(v.studentId); } },
                { label: 'الفصل', render: function (v) { return cName(v.classId); } },
                { label: 'النوع', key: 'type' },
                { label: 'الدرجة', render: function (v) { return degreeBadge(v.degree); } },
                { label: 'التاريخ', render: function (v) { return UI.fmtDate(v.date); } },
                { label: 'الحالة', render: statusBadge },
                { label: 'إجراءات', render: function (v) { return h('div', { class: 'row-actions' }, [h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { detailsModal(v); } })]); } }
              ],
              rows: rows, empty: 'لا نتائج مطابقة للتصفية.'
            })
          ]));
        }
        function labelOf() {
          var bits = [];
          if (state.status) bits.push('الحالة: ' + STATUS_LABEL[state.status]);
          if (state.type) bits.push('النوع: ' + state.type);
          if (state.classId) bits.push('الفصل: ' + cName(state.classId));
          return bits.length ? bits.join(' · ') : 'كل المخالفات';
        }

        function drawStats() {
          var rows = all();
          var by = function (d) { return rows.filter(function (v) { return v.degree === d; }).length; };
          clear(statsRow);
          statsRow.appendChild(h('div', { class: 'stat-row' }, [
            UI.statCard('إجمالي المخالفات', String(rows.length)),
            UI.statCard('بسيطة', String(by('بسيطة'))),
            UI.statCard('متوسطة', String(by('متوسطة')), null, 'gold'),
            UI.statCard('جسيمة', String(by('جسيمة')), null, by('جسيمة') ? 'ink' : null),
            UI.statCard('معدّل زمن الإغلاق', avgClosure(), 'من التسجيل حتى تنفيذ اللائحة')
          ]));
        }

        var statsRow = h('div');
        drawStats();
        view.appendChild(roleBanner('متابعة شاملة للمخالفات السلوكية وإحصاءاتها، مع طباعة السجل الرسمي بالباركود.'));
        view.appendChild(statsRow);
        view.appendChild(filtersRow);
        view.appendChild(tableRow);
        drawTable();
      }

      build();
    }
  });
})();
