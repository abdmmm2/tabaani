/* =============================================================================
   volunteer.js — ساعات التطوع
   ---------------------------------------------------------------------------
   مسؤول ساعات التطوع: ينشئ البرامج ويحدّثها، يعتمد تسجيل الطلاب أو يرفضه،
   يسجّل الساعات المنجزة، ويُصدر شهادة ساعات تطوعية بباركود لكل طالب.
   الطالب: يستعرض ساعاته، يبحث عن المسجّل مسبقًا، يسجّل في البرامج المتاحة،
   ويطبع سجل ساعاته.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var REG_STATUS = {
    pending: { label: 'بانتظار الاعتماد', tone: 'amber' },
    approved: { label: 'معتمد', tone: 'mint' },
    declined: { label: 'مرفوض', tone: 'plain' }
  };

  function studentOf(id) { return S.find('students', id) || null; }
  function studentName(id) { var s = studentOf(id); return s ? s.name : '—'; }
  function classNameOf(id) { var s = studentOf(id); var k = s ? S.find('classes', s.classId) : null; return k ? k.name : '—'; }
  function regBadge(status) {
    var s = REG_STATUS[status] || { label: status, tone: 'plain' };
    return UI.badge(s.label, s.tone);
  }
  function programTitle(id) { var p = S.find('programs', id); return p ? p.title : '—'; }
  /** إجمالي الساعات التراكمية المعتمدة لطالب */
  function cumulativeHours(studentId) {
    return S.list('programRegs').filter(function (r) {
      return r.studentId === studentId && r.status === 'approved';
    }).reduce(function (a, r) { return a + (r.hours || 0); }, 0);
  }

  /* ================================================== مسؤول ساعات التطوع */
  function renderOfficer(view) {
    var selectedId = null;
    var statsSlot = h('div'), programsSlot = h('div'), regsSlot = h('div');

    function programs() { return S.list('programs', { schoolId: S.session.schoolId }); }
    function regsOf(pid) { return S.list('programRegs', { programId: pid }); }
    function allRegs() { return S.list('programRegs'); }

    function drawStats() {
      clear(statsSlot);
      var regs = allRegs();
      var approvedHours = regs.filter(function (r) { return r.status === 'approved'; })
        .reduce(function (a, r) { return a + (r.hours || 0); }, 0);
      var pendingN = regs.filter(function (r) { return r.status === 'pending'; }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('البرامج', String(programs().length)),
        UI.statCard('المتسجلون', String(regs.length)),
        UI.statCard('الساعات المعتمدة', String(approvedHours), 'ساعة'),
        UI.statCard('بانتظار الاعتماد', String(pendingN), 'تسجيل', pendingN ? 'gold' : null)
      ]));
    }

    function openProgramForm(prog) {
      UI.formModal({
        title: prog ? 'تعديل برنامج تطوعي' : 'إضافة برنامج تطوعي', wide: true,
        submitLabel: prog ? 'حفظ التعديلات' : 'إضافة البرنامج',
        fields: [
          { name: 'title', label: 'عنوان البرنامج', type: 'text', required: true, value: prog ? prog.title : '' },
          { name: 'hours', label: 'الساعات المعتمدة', type: 'number', required: true, min: 1, half: true, value: prog ? prog.hours : '' },
          { name: 'seats', label: 'عدد المقاعد', type: 'number', required: true, min: 1, half: true, value: prog ? prog.seats : '' },
          { name: 'from', label: 'تاريخ البداية', type: 'date', required: true, half: true, value: prog ? prog.from : UI.today() },
          { name: 'to', label: 'تاريخ النهاية', type: 'date', required: true, half: true, value: prog ? prog.to : UI.today() },
          { name: 'desc', label: 'الوصف', type: 'textarea', required: true, rows: 3, value: prog ? prog.desc : '' }
        ],
        onSubmit: function (data) {
          if (data.to < data.from) { UI.toast('تاريخ النهاية يجب أن يكون بعد تاريخ البداية', 'warn'); return false; }
          if (prog) S.update('programs', prog.id, data);
          else S.insert('programs', { schoolId: S.session.schoolId, officerId: S.session.userId, title: data.title, hours: data.hours, seats: data.seats, from: data.from, to: data.to, desc: data.desc });
          UI.toast(prog ? 'حُدّث البرنامج التطوعي' : 'أُضيف البرنامج التطوعي', 'ok');
          drawAll();
          return true;
        }
      });
    }

    function drawPrograms() {
      clear(programsSlot);
      var rows = programs();
      programsSlot.appendChild(UI.panel('البرامج التطوعية', 'أنشئ البرامج وتابع أعداد المسجلين والساعات المعتمدة.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة برنامج', onClick: function () { openProgramForm(null); } })
      ], [
        rows.length ? UI.table({
          cols: [
            { label: 'البرنامج', render: function (p) { return p.title; } },
            { label: 'الفترة', render: function (p) { return UI.fmtDate(p.from) + ' ← ' + UI.fmtDate(p.to); } },
            { label: 'الساعات', render: function (p) { return String(p.hours); } },
            { label: 'المسجلون / المقاعد', render: function (p) { return regsOf(p.id).length + ' / ' + p.seats; } },
            { label: '', render: function (p) {
              return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'إدارة المسجلين', onClick: function () {
                selectedId = p.id;
                drawAll();
                setTimeout(function () { regsSlot.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
              } });
            } },
            { label: '', render: function (p) {
              return h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { openProgramForm(p); } });
            } },
            { label: '', render: function (p) {
              return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                UI.confirm('سيُحذف البرنامج وكل تسجيلاته. متابعة؟', { ok: 'حذف', danger: true }).then(function (ok) {
                  if (!ok) return;
                  regsOf(p.id).forEach(function (r) { S.remove('programRegs', r.id); });
                  S.remove('programs', p.id);
                  if (selectedId === p.id) selectedId = null;
                  UI.toast('حُذف البرنامج', 'ok');
                  drawAll();
                });
              } });
            } }
          ], rows: rows, empty: 'لا برامج تطوعية بعد — أضف أول برنامج.'
        }) : UI.empty('لا برامج تطوعية بعد — أضف أول برنامج.')
      ]));
    }

    function hoursCell(r) {
      var inp = h('input', { class: 'input', type: 'number', min: 0, value: r.hours || 0, style: { width: '92px' } });
      var btn = h('button', { class: 'mini-btn', type: 'button', text: 'حفظ', onClick: function () {
        var v = Number(inp.value);
        if (isNaN(v) || v < 0) { UI.toast('أدخل عدد ساعات صحيحًا', 'warn'); return; }
        S.update('programRegs', r.id, { hours: v });
        UI.toast('حُفظت الساعات المنجزة', 'ok');
        drawAll();
      } });
      return h('div', { class: 'cluster' }, [inp, btn]);
    }

    function certReport(prog, reg) {
      var stu = studentOf(reg.studentId) || {};
      var total = cumulativeHours(reg.studentId);
      var rep = S.registerReport('volunteer', reg.id, { title: 'شهادة ساعات تطوعية — ' + (stu.name || '') });
      var issued = UI.dateLabel(new Date());
      return {
        type: 'volunteer', refId: reg.id, id: rep.id, code: rep.code,
        title: 'شهادة ساعات تطوعية',
        subtitle: 'البرنامج: ' + prog.title,
        meta: [
          { label: 'اسم الطالب', value: stu.name },
          { label: 'الصف والفصل', value: classNameOf(reg.studentId) },
          { label: 'البرنامج', value: prog.title },
          { label: 'الساعات المعتمدة للبرنامج', value: String(prog.hours) + ' ساعة' },
          { label: 'الساعات المنجزة', value: String(reg.hours || 0) + ' ساعة' },
          { label: 'الإجمالي التراكمي', value: String(total) + ' ساعة' },
          { label: 'تاريخ الإصدار', value: issued }
        ],
        sections: [
          { heading: 'بيانات الشهادة', table: { cols: ['البند', 'التفصيل'], rows: [
            ['اسم الطالب', stu.name],
            ['الصف والفصل', classNameOf(reg.studentId)],
            ['البرنامج', prog.title],
            ['فترة البرنامج', UI.fmtDate(prog.from) + ' ← ' + UI.fmtDate(prog.to)],
            ['الساعات المعتمدة', String(prog.hours) + ' ساعة'],
            ['الساعات المنجزة', String(reg.hours || 0) + ' ساعة'],
            ['الإجمالي التراكمي', String(total) + ' ساعة'],
            ['تاريخ الإصدار', issued]
          ] } },
          { heading: 'إقرار', text: 'تشهد إدارة المدرسة بأن الطالب المذكور أعلاه شارك في البرنامج التطوعي وأنجز الساعات الموضحة. صدرت هذه الشهادة إلكترونيًا من مسؤول ساعات التطوع.' }
        ],
        qrNote: 'امسح الباركود للتحقق من شهادة الساعات التطوعية للطالب ' + (stu.name || '') + '.',
        signatures: ['مسؤول ساعات التطوع', 'مدير المدرسة']
      };
    }

    function drawRegs() {
      clear(regsSlot);
      var prog = selectedId ? S.find('programs', selectedId) : null;
      if (!prog) return;
      var rows = regsOf(prog.id);
      var approved = rows.filter(function (r) { return r.status === 'approved'; }).length;
      regsSlot.appendChild(UI.panel('المسجلون — ' + prog.title,
        approved + ' معتمد من ' + rows.length + ' تسجيل · الساعات المعتمدة للبرنامج ' + prog.hours + ' ساعة', [
          h('button', { class: 'mini-btn', type: 'button', text: 'إغلاق اللوحة', onClick: function () { selectedId = null; drawRegs(); } })
        ], [
        rows.length ? UI.table({
          cols: [
            { label: 'الطالب', render: function (r) { return studentName(r.studentId); } },
            { label: 'الفصل', render: function (r) { return classNameOf(r.studentId); } },
            { label: 'الحالة', render: function (r) { return regBadge(r.status); } },
            { label: 'الساعات المنجزة', render: function (r) { return hoursCell(r); } },
            { label: '', render: function (r) {
              return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'اعتماد', disabled: r.status === 'approved', onClick: function () {
                S.update('programRegs', r.id, { status: 'approved' });
                UI.toast('اعتُمد التسجيل', 'ok');
                drawAll();
              } });
            } },
            { label: '', render: function (r) {
              return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'رفض', disabled: r.status === 'declined', onClick: function () {
                S.update('programRegs', r.id, { status: 'declined' });
                UI.toast('رُفض التسجيل', 'warn');
                drawAll();
              } });
            } },
            { label: '', render: function (r) {
              return UI.reportButton(function () { return certReport(prog, r); }, { label: 'شهادة ساعات تطوعية', class: 'btn-soft btn-sm' });
            } }
          ], rows: rows, empty: 'لا مسجّلين في هذا البرنامج بعد.'
        }) : UI.empty('لا مسجّلين في هذا البرنامج بعد.')
      ]));
    }

    function drawAll() { drawStats(); drawPrograms(); drawRegs(); }

    view.appendChild(statsSlot);
    view.appendChild(programsSlot);
    view.appendChild(regsSlot);
    drawAll();
  }

  /* ============================================================ دور الطالب */
  function renderStudent(view) {
    var me = S.session.userId;
    var statsSlot = h('div'), programsSlot = h('div'), mineSlot = h('div');

    function mine() { return S.list('programRegs').filter(function (r) { return r.studentId === me; }); }

    function myLogReport() {
      var rows = mine();
      var total = cumulativeHours(me);
      var stu = studentOf(me) || {};
      var rep = S.registerReport('volunteer', 'student-' + me, { title: 'سجل ساعات تطوعية — ' + (stu.name || '') });
      return {
        type: 'volunteer', refId: 'student-' + me, id: rep.id, code: rep.code,
        title: 'سجل الساعات التطوعية',
        subtitle: stu.name || '',
        meta: [
          { label: 'اسم الطالب', value: stu.name },
          { label: 'الصف والفصل', value: classNameOf(me) },
          { label: 'عدد التسجيلات', value: String(rows.length) },
          { label: 'الإجمالي التراكمي المعتمد', value: String(total) + ' ساعة' }
        ],
        sections: [
          { heading: 'التسجيلات', table: { cols: ['البرنامج', 'الفترة', 'الحالة', 'الساعات'], rows: rows.map(function (r) {
            var p = S.find('programs', r.programId) || {};
            return [p.title || '—', UI.fmtDate(p.from) + ' ← ' + UI.fmtDate(p.to), (REG_STATUS[r.status] || {}).label || r.status, String(r.hours || 0)];
          }) } },
          { heading: 'الإجمالي', text: 'إجمالي الساعات التطوعية المعتمدة للطالب: ' + total + ' ساعة.' }
        ],
        qrNote: 'امسح الباركود للتحقق من سجل الساعات التطوعية.',
        signatures: ['مسؤول ساعات التطوع', 'مدير المدرسة']
      };
    }

    function drawPrograms() {
      clear(programsSlot);
      var rows = S.list('programs', { schoolId: S.session.schoolId });
      var regs = mine();
      programsSlot.appendChild(UI.panel('البرامج المتاحة', 'تحقق من كونك مسجّلًا مسبقًا ثم سجّل في البرامج المتاحة.', null, [
        rows.length ? UI.table({
          cols: [
            { label: 'البرنامج', render: function (p) { return p.title; } },
            { label: 'الفترة', render: function (p) { return UI.fmtDate(p.from) + ' ← ' + UI.fmtDate(p.to); } },
            { label: 'الساعات', render: function (p) { return String(p.hours); } },
            { label: 'المقاعد', render: function (p) { return String(p.seats); } },
            { label: 'الوصف', render: function (p) { return p.desc; } },
            { label: 'حالتي', render: function (p) {
              var r = regs.find(function (x) { return x.programId === p.id; });
              return r ? regBadge(r.status) : UI.badge('غير مسجّل', 'plain');
            } },
            { label: '', render: function (p) {
              var r = regs.find(function (x) { return x.programId === p.id; });
              if (r) return h('span', { class: 'muted', text: '—' });
              return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'التسجيل', onClick: function () {
                S.registerProgram(p.id, me);
                UI.toast('سُجّل طلبك في البرنامج', 'ok');
                drawAll();
              } });
            } }
          ], rows: rows, empty: 'لا برامج متاحة حاليًا.'
        }) : UI.empty('لا برامج متاحة حاليًا.')
      ]));
    }

    function drawStats() {
      clear(statsSlot);
      var rows = mine();
      var approvedHours = rows.filter(function (r) { return r.status === 'approved'; }).reduce(function (a, r) { return a + (r.hours || 0); }, 0);
      var pendingN = rows.filter(function (r) { return r.status === 'pending'; }).length;
      statsSlot.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('ساعاتي المعتمدة', String(approvedHours), 'ساعة', approvedHours ? 'gold' : null),
        UI.statCard('تسجيلاتي', String(rows.length)),
        UI.statCard('بانتظار الاعتماد', String(pendingN))
      ]));
    }

    function drawMine() {
      clear(mineSlot);
      var rows = mine();
      mineSlot.appendChild(UI.panel('تسجيلاتي', null, [
        UI.reportButton(function () { return myLogReport(); }, { label: 'طباعة سجل ساعاتي', class: 'btn-soft' })
      ], [
        rows.length ? UI.table({
          cols: [
            { label: 'البرنامج', render: function (r) { return programTitle(r.programId); } },
            { label: 'الفترة', render: function (r) {
              var p = S.find('programs', r.programId) || {};
              return UI.fmtDate(p.from) + ' ← ' + UI.fmtDate(p.to);
            } },
            { label: 'الحالة', render: function (r) { return regBadge(r.status); } },
            { label: 'الساعات', render: function (r) { return String(r.hours || 0); } }
          ], rows: rows, empty: 'لا تسجيلات لك بعد.'
        }) : UI.empty('لا تسجيلات لك بعد.')
      ]));
    }

    function drawAll() { drawStats(); drawPrograms(); drawMine(); }

    drawAll();
    view.appendChild(statsSlot);
    view.appendChild(programsSlot);
    view.appendChild(mineSlot);
    view.appendChild(h('div', { class: 'muted-block',
      text: 'يبحث النظام عن تسجيلك المسبق في كل برنامج قبل التسجيل، فلا يُكرَّر التسجيل. تُعتمد الساعات من مسؤول ساعات التطوع بعد إدخال الساعات المنجزة.' }));
  }

  App.register({
    id: 'volunteer',
    label: 'ساعات التطوع',
    icon: '&#129309;',
    roles: ['volunteer', 'student'],
    render: function (view) {
      if (S.session.role === 'student') { renderStudent(view); return; }
      renderOfficer(view);
    }
  });
})();
