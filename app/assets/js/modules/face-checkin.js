/* =============================================================================
   face-checkin.js — بصمة الوجه (المعلم)
   ---------------------------------------------------------------------------
   تسجيل بصمة وجه المعلم، ثم تسجيل حضور الحصة بتمرير الوجه.
   التعرّف يجري محليًا على الجهاز (قياس هندسي لملامح الوجه) — لا تُخزَّن صورة،
   بل وصف رقمي فقط. نموذج أولي شرطي لا يُعتمد كبصمة رسمية.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* عتبة القبول: مسافة إقليدية أصغر = تطابق أقوى */
  var FACE_THRESHOLD = 0.5;

  /* حالة مشتركة بين عمليات الرسم: كاميرا نشطة + الفترة المختارة في السجل */
  var live = { panel: null, range: 'week' };

  function stopLive() {
    if (live.panel && typeof live.panel.stop === 'function') {
      try { live.panel.stop(); } catch (e) { /* لا شيء — الكاميرا قد تكون أُغلقت */ }
    }
    live.panel = null;
  }

  function klassName(id) { var k = id ? S.klass(id) : null; return (k && k.name) || '—'; }
  function periodLabel(id) { var p = id ? S.period(id) : null; return p ? p.label : '—'; }

  App.register({
    id: 'face-checkin',
    label: 'بصمة الوجه',
    icon: '&#128100;',
    roles: ['teacher'],

    render: function (view) {
      stopLive();

      var uid = S.session.userId;
      var schoolId = S.session.schoolId;
      var me = S.user(uid) || {};
      var today = UI.today();

      /* لا يرى المعلم إلا الفصول المثبّتة، وإن لم تُثبَّت بعد فكل إسناداته */
      var assignments = S.lockedAssignmentsOf(uid);
      if (!assignments.length) assignments = S.assignmentsOf(uid);
      var periods = S.periodsOf(schoolId);

      function redraw() { stopLive(); clear(view); draw(); }

      /* ---------------------------------------------------- 1) حالة بصمتي */
      function myFacePanel() {
        var enrolled = S.hasFace(uid);
        var mount = h('div', { class: 'stack-sm mt-4' });
        var right = enrolled
          ? h('button', {
              class: 'btn btn-outline', type: 'button', text: 'إزالة البصمة',
              onClick: function () {
                UI.confirm('سيُحذف وصف بصمة وجهك المخزَّن، وستحتاج إلى تسجيله من جديد لاحقًا. متابعة؟',
                  { title: 'إزالة بصمة الوجه', ok: 'إزالة البصمة' }).then(function (ok) {
                  if (!ok) return;
                  S.clearFace(uid);
                  UI.toast('أُزيلت بصمة الوجه', 'ok');
                  redraw();
                });
              }
            })
          : h('button', {
              class: 'btn btn-primary', type: 'button', text: 'تسجيل بصمة وجهي',
              onClick: function () {
                if (!window.Face) { UI.toast('مكوّن التقاط الوجه غير متاح', 'warn'); return; }
                var panel = window.Face.capturePanel({
                  buttonText: 'التقاط وتسجيل البصمة',
                  onDescriptor: function (res) {
                    S.saveFace(uid, res.descriptor, { device: navigator.platform || 'غير معروف' });
                    UI.toast('سُجّلت بصمة وجهك بنجاح', 'ok');
                    redraw();
                  }
                });
                live.panel = panel;
                clear(mount);
                mount.appendChild(panel.el);
              }
            });

        var head = h('div', { class: 'between' }, [
          h('div', { class: 'cluster' }, [
            enrolled ? UI.badge('بصمة مسجّلة', 'mint') : UI.badge('لا توجد بصمة', 'amber'),
            enrolled && me.faceEnrolledAt
              ? h('span', { class: 'muted nums', text: 'تاريخ التسجيل: ' + UI.fmtDateTime(me.faceEnrolledAt) })
              : null,
            enrolled && me.faceMeta && me.faceMeta.device
              ? h('span', { class: 'muted', text: 'جهاز التسجيل: ' + me.faceMeta.device })
              : null
          ]),
          right
        ]);

        return UI.panel(
          'حالة بصمتي',
          enrolled ? 'بصمتك مسجّلة — يمكنك تسجيل حضور الحصص بتمرير الوجه.'
                   : 'لم تُسجَّل بصمة وجهك بعد؛ سجّلها لتفعيل حضور الحصص بتمرير الوجه.',
          null,
          [
            head,
            !enrolled ? h('div', { class: 'muted-block mt-4' }, [
              h('strong', { text: 'قبل التسجيل: ' }),
              h('span', { text: 'اجلس في إضاءة جيدة، وانظر مباشرة إلى الكاميرا، ولا تتحرك أثناء الالتقاط. يُخزَّن وصف رقمي لملامح وجهك فقط ولا تُحفظ أي صورة.' })
            ]) : null,
            enrolled ? h('div', { class: 'muted-block mt-4', text: 'البصمة مسجّلة: سيطلب النظام تمرير الوجه عند الدخول للمنصة، وعند تسجيل حضور الحصة. في هذا النموذج الأولي يُطبَّق التمرير عبر هذه الشاشة.' }) : null,
            mount
          ]
        );
      }

      /* ------------------------------------- 2) حضور الحصة ببصمة الوجه */
      function periodPanel() {
        var classSel = UI.field({
          name: 'class', label: 'الفصل', type: 'select', required: true,
          options: assignments.map(function (a) {
            return { value: a.id, label: klassName(a.classId) + ' — ' + a.subject };
          }),
          placeholder: assignments.length ? 'اختر الإسناد' : 'لا إسنادات لك بعد — راجع الوكيل'
        });
        var periodSel = UI.field({
          name: 'period', label: 'الحصة', type: 'select', required: true,
          options: periods.map(function (p) {
            return { value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ')' };
          }),
          placeholder: periods.length ? 'اختر الحصة' : 'لا حصص في جدول المدرسة'
        });

        var rows = periods.map(function (p) { return { p: p, scan: S.periodCheckinOf(uid, today, p.id) }; });
        var doneCount = rows.filter(function (r) { return !!r.scan; }).length;

        var checkMount = h('div', { class: 'mt-4' });
        var checkBtn = h('button', {
          class: 'btn btn-primary', type: 'button', text: 'تمرير الوجه وتسجيل الحضور',
          disabled: !assignments.length || !periods.length,
          onClick: function () {
            var asg = assignments.filter(function (a) { return a.id === classSel.input.value; })[0];
            var pid = periodSel.input.value;
            if (!asg) { UI.toast('اختر الفصل أولًا', 'warn'); return; }
            if (!pid) { UI.toast('اختر الحصة أولًا', 'warn'); return; }
            if (!window.Face) { UI.toast('مكوّن التقاط الوجه غير متاح', 'warn'); return; }

            var feedback = h('p', { class: 'hint', text: 'جارٍ تجهيز الكاميرا…' });
            var panel = window.Face.capturePanel({
              buttonText: 'الالتقاط والمطابقة',
              onDescriptor: function (res) {
                var match = S.faceMatch(res.descriptor, [S.user(uid)], FACE_THRESHOLD);
                if (match.ok) {
                  S.teacherPeriodCheckin(uid, asg.classId, pid, match.score);
                  UI.toast('سُجّل حضور ' + klassName(asg.classId) + ' — ' + periodLabel(pid) + ' (تشابه ' + match.score + '%)', 'ok');
                  redraw();
                  return;
                }
                feedback.className = 'hint hint-error';
                feedback.textContent = (match.distance == null)
                  ? 'لم تُسجَّل بصمة وجهك بعد — سجّلها من لوحة «حالة بصمتي» ثم أعد المحاولة. لم يُسجَّل الحضور.'
                  : 'لم تطابق البصمة وصف وجهك المسجَّل (نسبة التشابه ' + match.score + '%) — لم يُسجَّل الحضور؛ أعد المحاولة بإضاءة وزاوية أفضل.';
                UI.toast('لم تُطابق البصمة — لم يُسجَّل الحضور', 'warn');
              }
            });
            live.panel = panel;
            clear(checkMount);
            checkMount.appendChild(panel.el);
            checkMount.appendChild(feedback);
          }
        });

        return UI.panel(
          'حضور الحصة ببصمة الوجه',
          'اختر الفصل والحصة، ثم اضغط الزر ومرّر وجهك للمطابقة وتسجيل الحضور.',
          null,
          [
            h('div', { class: 'form-grid' }, [classSel.wrap, periodSel.wrap]),
            h('div', { class: 'stat-row mt-4' }, [
              UI.statCard('حصص اليوم المسجّلة', doneCount + ' / ' + periods.length)
            ]),
            rows.length ? UI.table({
              cols: [
                { label: 'الحصة', render: function (r) { return r.p.label; } },
                { label: 'الوقت', render: function (r) { return r.p.start + ' — ' + r.p.end; } },
                { label: 'الفصل', render: function (r) { return r.scan ? klassName(r.scan.classId) : '—'; } },
                { label: 'الحالة', render: function (r) { return r.scan ? UI.badge('مسجّل', 'mint') : UI.badge('غير مسجّل', 'amber'); } },
                { label: 'النسبة', render: function (r) { return r.scan && r.scan.score != null ? r.scan.score + '%' : '—'; } }
              ], rows: rows, empty: 'لا حصص في جدول المدرسة.'
            }) : UI.empty('لا حصص في جدول المدرسة بعد.', null),
            assignments.length ? null : h('div', { class: 'muted-block mt-3', text: 'لا إسنادات مثبّتة لك بعد — يثبّتها وكيل شؤون الطلاب، ثم تظهر فصولك هنا.' }),
            checkMount,
            checkBtn
          ]
        );
      }

      /* --------------------------------------------------- 3) سجل عملياتي */
      function logPanel() {
        var rangeSel = UI.field({
          name: 'range', label: 'الفترة', type: 'select',
          value: live.range,
          options: [
            { value: 'day', label: 'يومي' },
            { value: 'week', label: 'أسبوعي' },
            { value: 'month', label: 'شهري' },
            { value: 'term', label: 'الفصل الدراسي' }
          ]
        });
        rangeSel.input.addEventListener('change', function () {
          live.range = rangeSel.input.value || 'week';
          redraw();
        });

        var range = S.rangeOf(live.range);
        var scans = S.faceScansOf(uid, range);
        var okCount = scans.filter(function (s) { return s.ok; }).length;
        var pct = scans.length ? Math.round(okCount / scans.length * 100) : 0;
        var tone = pct >= 80 ? 'mint' : (pct >= 50 ? 'warn' : (scans.length ? 'danger' : 'mint'));

        return UI.panel(
          'سجل عملياتي',
          'عمليات بصمة الوجه المسجّلة لك ضمن الفترة المختارة.',
          null,
          [
            h('div', { class: 'form-grid' }, [rangeSel.wrap]),
            h('div', { class: 'stack-sm mt-4' }, [
              h('div', { class: 'between' }, [
                h('span', { class: 'muted', text: (range && range.label) || '' }),
                h('span', { class: 'nums', text: okCount + ' / ' + scans.length })
              ]),
              UI.progressBar(pct, tone),
              h('span', { class: 'muted nums', text: 'نسبة النجاح: ' + pct + '%' })
            ]),
            UI.table({
              cols: [
                { label: 'التاريخ', render: function (s) { return UI.fmtDate(s.date) + ' · ' + UI.fmtTime(s.at); } },
                { label: 'النوع', render: function (s) { return s.kind || 'عملية'; } },
                { label: 'الفصل', render: function (s) { return klassName(s.classId); } },
                { label: 'الحصة', render: function (s) { return periodLabel(s.periodId); } },
                { label: 'النتيجة', render: function (s) { return s.ok ? UI.badge('مطابق', 'mint') : UI.badge('مرفوض', 'plain'); } },
                { label: 'النسبة', render: function (s) { return s.score != null ? s.score + '%' : '—'; } }
              ], rows: scans, empty: 'لا عمليات في هذه الفترة.'
            })
          ]
        );
      }

      /* --------------------------------------------------------- الرسم */
      function draw() {
        view.appendChild(myFacePanel());
        view.appendChild(periodPanel());
        view.appendChild(logPanel());
        view.appendChild(UI.panel('ملاحظة مهمة', null, null, [
          h('div', { class: 'muted-block' }, [
            h('strong', { text: 'نموذج أولي شرطي: ' }),
            h('span', { text: 'التعرّف يعمل محليًا على الجهاز بقياس هندسي لملامح الوجه، ولا يُعتمد كبصمة رسمية (يحتاج نظامًا معتمدًا ومضادًا للتحايل). ويحتاج تشغيلًا عبر خادم محلي (python3 -m http.server) لأن الكاميرا والنماذج لا تعملان على file://. ولا تُخزَّن أي صورة، بل وصف رقمي فقط.' })
          ])
        ]));
      }

      draw();
    }
  });
})();
