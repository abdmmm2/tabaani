/* =============================================================================
   activities.js — النشاط الطلابي
   ---------------------------------------------------------------------------
   الطالب: يطلب المشاركة في نشاط (نشاط + حصة/مادة + مدة خارج الصف + سبب) فيذهب
   الطلب إلى معلم المادة لصفّه إن وُجد وإلا المشرف.
   المعلم: يقبل الطلب أو يعتذر عنه بسبب (درس مهم / اختبار / سبب آخر + ملاحظة).
   مسؤول النشاط: ينشئ الأنشطة ويتابع كل الطلبات وحالتها وملاحظة المعلم.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var STATUS = {
    pending: { label: 'بانتظار ردّ المعلم', tone: 'amber' },
    approved: { label: 'مقبول', tone: 'mint' },
    declined: { label: 'معتذر عنه', tone: 'plain' }
  };
  var CAUSES = [
    { value: 'درس مهم', label: 'درس مهم' },
    { value: 'اختبار', label: 'اختبار' },
    { value: 'سبب آخر', label: 'سبب آخر' }
  ];

  function studentName(id) { var s = S.find('students', id); return s ? s.name : '—'; }
  function studentClassId(id) { var s = S.find('students', id); return s ? s.classId : ''; }
  function className(id) { var k = S.find('classes', id); return k ? k.name : '—'; }
  function activityTitle(id) { var a = S.find('activities', id); return a ? a.title : '—'; }
  function periodText(id) {
    var p = S.period(id); if (!p) return '—';
    return p.label + ' (' + p.start + ' — ' + p.end + ')';
  }
  function statusBadge(r) {
    var s = STATUS[r.status] || { label: r.status, tone: 'plain' };
    return UI.badge(s.label, s.tone);
  }
  function myStudent() { return S.find('students', S.session.userId) || null; }

  /** خيارات «الحصة/المادة» لصف الطالب من إسنادات الفصل. */
  function buildPairs(cls, fallback) {
    var opts = [], map = {};
    if (cls) {
      S.list('assignments').filter(function (a) { return a.classId === cls.id; }).forEach(function (a) {
        (a.periods || []).forEach(function (pi) {
          var pid = 'pd-' + pi;
          if (map[pid]) return;
          map[pid] = { subject: a.subject, teacherId: a.teacherId };
          opts.push({ value: pid, label: 'الحصة ' + pi + ' — ' + a.subject });
        });
      });
      opts.sort(function (x, y) { return Number(x.value.slice(3)) - Number(y.value.slice(3)); });
    }
    if (!opts.length) {
      (fallback || []).forEach(function (p) { opts.push({ value: p.id, label: p.label + ' (' + p.start + ' — ' + p.end + ')' }); });
    }
    return { opts: opts, map: map };
  }

  /* ================================================== مسؤول النشاط الطلابي */
  function renderOfficer(view) {
    var statsSlot = h('div'), activitiesSlot = h('div'), reqsSlot = h('div');

    function activities() { return S.list('activities', { schoolId: S.session.schoolId }); }
    function reqs() { return S.list('activityReqs'); }

    function drawStats() {
      clear(statsSlot);
      var all = reqs();
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('الأنشطة', String(activities().length)),
        UI.statCard('الطلبات', String(all.length)),
        UI.statCard('المقبولة', String(all.filter(function (r) { return r.status === 'approved'; }).length), null, 'gold'),
        UI.statCard('المرفوضة', String(all.filter(function (r) { return r.status === 'declined'; }).length))
      ]));
    }

    function openActivityForm(act) {
      UI.formModal({
        title: act ? 'تعديل نشاط' : 'إضافة نشاط طلابي', wide: true,
        submitLabel: act ? 'حفظ التعديلات' : 'إضافة النشاط',
        fields: [
          { name: 'title', label: 'عنوان النشاط', type: 'text', required: true, value: act ? act.title : '' },
          { name: 'date', label: 'التاريخ', type: 'date', required: true, half: true, value: act ? act.date : UI.today() },
          { name: 'place', label: 'المكان', type: 'text', required: true, half: true, value: act ? act.place : '' },
          { name: 'desc', label: 'الوصف', type: 'textarea', required: true, rows: 3, value: act ? act.desc : '' }
        ],
        onSubmit: function (data) {
          if (act) S.update('activities', act.id, data);
          else S.insert('activities', { schoolId: S.session.schoolId, officerId: S.session.userId, title: data.title, date: data.date, place: data.place, desc: data.desc });
          UI.toast(act ? 'حُدّث النشاط' : 'أُضيف النشاط', 'ok');
          drawAll();
          return true;
        }
      });
    }

    function drawActivities() {
      clear(activitiesSlot);
      var rows = activities();
      activitiesSlot.appendChild(UI.panel('الأنشطة الطلابية', 'أنشئ الأنشطة وحدّث بياناتها.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة نشاط', onClick: function () { openActivityForm(null); } })
      ], [
        rows.length ? UI.table({
          cols: [
            { label: 'العنوان', render: function (a) { return a.title; } },
            { label: 'التاريخ', render: function (a) { return UI.fmtDate(a.date); } },
            { label: 'المكان', render: function (a) { return a.place; } },
            { label: 'الوصف', render: function (a) { return a.desc; } },
            { label: 'الطلبات', render: function (a) { return String(reqs().filter(function (r) { return r.activityId === a.id; }).length); } },
            { label: '', render: function (a) {
              return h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { openActivityForm(a); } });
            } },
            { label: '', render: function (a) {
              return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                UI.confirm('سيُحذف النشاط وكل طلباته. متابعة؟', { ok: 'حذف', danger: true }).then(function (ok) {
                  if (!ok) return;
                  reqs().filter(function (r) { return r.activityId === a.id; }).forEach(function (r) { S.remove('activityReqs', r.id); });
                  S.remove('activities', a.id);
                  UI.toast('حُذف النشاط', 'ok');
                  drawAll();
                });
              } });
            } }
          ], rows: rows, empty: 'لا أنشطة بعد — أضف أول نشاط.'
        }) : UI.empty('لا أنشطة بعد — أضف أول نشاط.')
      ]));
    }

    function drawReqs() {
      clear(reqsSlot);
      var rows = reqs().slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      reqsSlot.appendChild(UI.panel('كل الطلبات', 'حالة كل طلب وملاحظة المعلم.', null, [
        rows.length ? UI.table({
          cols: [
            { label: 'النشاط', render: function (r) { return activityTitle(r.activityId); } },
            { label: 'الطالب', render: function (r) { return studentName(r.studentId); } },
            { label: 'الفصل', render: function (r) { return className(r.classId); } },
            { label: 'الحصة', render: function (r) { return periodText(r.periodId); } },
            { label: 'المدة (دقيقة)', render: function (r) { return String(r.duration); } },
            { label: 'السبب', render: function (r) { return r.reason; } },
            { label: 'الحالة', render: function (r) { return statusBadge(r); } },
            { label: 'ملاحظة المعلم', render: function (r) { return r.note || '—'; } }
          ], rows: rows, empty: 'لا طلبات مشاركة بعد.'
        }) : UI.empty('لا طلبات مشاركة بعد.')
      ]));
    }

    function drawAll() { drawStats(); drawActivities(); drawReqs(); }

    view.appendChild(statsSlot);
    view.appendChild(activitiesSlot);
    view.appendChild(reqsSlot);
    drawAll();
  }

  /* ================================================================ الطالب */
  function renderStudent(view) {
    var me = S.session.userId;
    var cls = myStudent() ? S.find('classes', myStudent().classId) : null;
    var pairs = buildPairs(cls, S.periodsOf(S.session.schoolId));
    var statsSlot = h('div'), availableSlot = h('div'), mineSlot = h('div');

    function activities() { return S.list('activities', { schoolId: S.session.schoolId }); }
    function mine() { return S.list('activityReqs').filter(function (r) { return r.studentId === me; }); }

    function openRequestForm() {
      var acts = activities();
      UI.formModal({
        title: 'طلب مشاركة في نشاط طلابي', wide: true, submitLabel: 'إرسال الطلب',
        intro: 'يُرسَل الطلب إلى معلم المادة لصفّك إن وُجد، وإلا إلى المشرف.',
        fields: [
          { name: 'activityId', label: 'النشاط', type: 'select', required: true,
            placeholder: acts.length ? 'اختر النشاط' : 'لا أنشطة متاحة',
            options: acts.map(function (a) { return { value: a.id, label: a.title + ' — ' + UI.fmtDate(a.date) }; }) },
          { name: 'periodId', label: 'الحصة / المادة', type: 'select', required: true,
            placeholder: pairs.opts.length ? 'اختر الحصة والمادة' : 'لا إسنادات لصفّك',
            options: pairs.opts },
          { name: 'duration', label: 'المدة خارج الصف (بالدقائق)', type: 'number', required: true, min: 1, half: true, value: 15 },
          { name: 'reason', label: 'السبب', type: 'textarea', required: true, rows: 3,
            placeholder: 'مثال: تحضير المجسم قبل التحكيم' }
        ],
        onSubmit: function (data) {
          var act = S.find('activities', data.activityId) || {};
          var pair = pairs.map[data.periodId] || {};
          var teacherId = pair.teacherId || (cls ? cls.supervisorId : act.officerId);
          S.createActivityRequest({
            activityId: data.activityId, studentId: me, classId: cls ? cls.id : '',
            teacherId: teacherId, periodId: data.periodId, subject: pair.subject || '',
            duration: data.duration, reason: data.reason
          });
          UI.toast('أُرسل طلب المشاركة إلى معلم المادة', 'ok');
          drawAll();
          return true;
        }
      });
    }

    function drawAvailable() {
      clear(availableSlot);
      var rows = activities();
      availableSlot.appendChild(UI.panel('الأنشطة المتاحة', 'اطلب المشاركة في أي نشاط مع تحديد الحصة والمدة والسبب.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'طلب مشاركة', onClick: openRequestForm })
      ], [
        rows.length ? UI.table({
          cols: [
            { label: 'العنوان', render: function (a) { return a.title; } },
            { label: 'التاريخ', render: function (a) { return UI.fmtDate(a.date); } },
            { label: 'المكان', render: function (a) { return a.place; } },
            { label: 'الوصف', render: function (a) { return a.desc; } }
          ], rows: rows, empty: 'لا أنشطة متاحة حاليًا.'
        }) : UI.empty('لا أنشطة متاحة حاليًا.')
      ]));
    }

    function drawStats() {
      clear(statsSlot);
      var rows = mine();
      var approvedN = rows.filter(function (r) { return r.status === 'approved'; }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('الأنشطة المتاحة', String(activities().length)),
        UI.statCard('طلباتي', String(rows.length)),
        UI.statCard('المقبولة', String(approvedN), null, approvedN ? 'gold' : null)
      ]));
    }

    function drawMine() {
      clear(mineSlot);
      var rows = mine();
      mineSlot.appendChild(UI.panel('طلباتي', 'حالة كل طلب وسبب الاعتذار إن وُجد.', null, [
        rows.length ? UI.table({
          cols: [
            { label: 'النشاط', render: function (r) { return activityTitle(r.activityId); } },
            { label: 'الحصة', render: function (r) { return periodText(r.periodId); } },
            { label: 'المدة (دقيقة)', render: function (r) { return String(r.duration); } },
            { label: 'السبب', render: function (r) { return r.reason; } },
            { label: 'الحالة', render: function (r) { return statusBadge(r); } },
            { label: 'سبب الرفض / ملاحظة المعلم', render: function (r) { return r.status === 'declined' ? (r.note || '—') : '—'; } }
          ], rows: rows, empty: 'لا طلبات لك بعد.'
        }) : UI.empty('لا طلبات لك بعد — اطلب المشاركة من الأنشطة المتاحة.')
      ]));
    }

    function drawAll() { drawStats(); drawAvailable(); drawMine(); }

    drawAll();
    view.appendChild(statsSlot);
    view.appendChild(availableSlot);
    view.appendChild(mineSlot);
  }

  /* ================================================================ المعلم */
  function renderTeacher(view) {
    var queueSlot = h('div'), decidedSlot = h('div');
    var me = S.session.userId;

    function pending() {
      return S.list('activityReqs').filter(function (r) { return r.teacherId === me && r.status === 'pending'; });
    }
    function decided() {
      return S.list('activityReqs').filter(function (r) { return r.teacherId === me && r.status !== 'pending'; });
    }

    function openDecline(r) {
      UI.formModal({
        title: 'الاعتذار عن طلب مشاركة', submitLabel: 'تأكيد الاعتذار',
        intro: studentName(r.studentId) + ' · ' + activityTitle(r.activityId) + ' · الحصة ' + periodText(r.periodId),
        fields: [
          { name: 'cause', label: 'سبب الاعتذار', type: 'select', required: true, placeholder: 'اختر السبب', options: CAUSES },
          { name: 'note', label: 'ملاحظة', type: 'textarea', required: true, rows: 3,
            placeholder: 'وضّح سبب الاعتذار للطالب' }
        ],
        onSubmit: function (data) {
          S.decideActivityRequest(r.id, 'declined', data.cause + ' — ' + data.note);
          UI.toast('سُجّل الاعتذار وأُبلغ الطالب', 'warn');
          drawAll();
          return true;
        }
      });
    }

    function drawQueue() {
      clear(queueSlot);
      var rows = pending();
      queueSlot.appendChild(UI.panel('طلبات بانتظار ردّي', rows.length ? rows.length + ' طلب' : null, null, [
        rows.length ? UI.table({
          cols: [
            { label: 'الطالب', render: function (r) { return studentName(r.studentId); } },
            { label: 'الفصل', render: function (r) { return className(r.classId); } },
            { label: 'النشاط', render: function (r) { return activityTitle(r.activityId); } },
            { label: 'الحصة / المادة', render: function (r) { return periodText(r.periodId); } },
            { label: 'المدة (دقيقة)', render: function (r) { return String(r.duration); } },
            { label: 'السبب', render: function (r) { return r.reason; } },
            { label: '', render: function (r) {
              return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'قبول', onClick: function () {
                S.decideActivityRequest(r.id, 'approved', 'قبول المشاركة');
                UI.toast('قُبل الطلب وأُبلغ الطالب ومسؤول النشاط', 'ok');
                drawAll();
              } });
            } },
            { label: '', render: function (r) {
              return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'اعتذار', onClick: function () { openDecline(r); } });
            } }
          ], rows: rows, empty: 'لا طلبات بانتظار ردّك.'
        }) : UI.empty('لا طلبات بانتظار ردّك — كل الطلبات مُقرّرة.')
      ]));
    }

    function drawDecided() {
      clear(decidedSlot);
      var rows = decided();
      decidedSlot.appendChild(UI.panel('الطلبات المقرّرة', 'الطلبات التي قبلتها أو اعتذرت عنها.', null, [
        rows.length ? UI.table({
          cols: [
            { label: 'الطالب', render: function (r) { return studentName(r.studentId); } },
            { label: 'النشاط', render: function (r) { return activityTitle(r.activityId); } },
            { label: 'الحصة', render: function (r) { return periodText(r.periodId); } },
            { label: 'المدة (دقيقة)', render: function (r) { return String(r.duration); } },
            { label: 'الحالة', render: function (r) { return statusBadge(r); } },
            { label: 'ملاحظتي', render: function (r) { return r.note || '—'; } },
            { label: 'تاريخ القرار', render: function (r) { return UI.fmtDateTime(r.decidedAt); } }
          ], rows: rows, empty: 'لا طلبات مقرّرة بعد.'
        }) : UI.empty('لا طلبات مقرّرة بعد.')
      ]));
    }

    function drawAll() { drawQueue(); drawDecided(); }

    view.appendChild(queueSlot);
    view.appendChild(decidedSlot);
    drawAll();
  }

  App.register({
    id: 'activities',
    label: 'النشاط الطلابي',
    icon: '&#127917;',
    roles: ['activity', 'student', 'teacher'],
    render: function (view) {
      var role = S.session.role;
      if (role === 'teacher') { renderTeacher(view); return; }
      if (role === 'student') { renderStudent(view); return; }
      renderOfficer(view);
    }
  });
})();
