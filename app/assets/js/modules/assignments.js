/* =============================================================================
   assignments.js — إسناد الفصول والمواد + تثبيت الوكيل (وكيل شؤون الطلاب)
   ---------------------------------------------------------------------------
   الرحلة الكاملة: مدير المدرسة يختار فصول المعلم ومواده (حساب المعلم) ← يثبّتها
   وكيل شؤون الطلاب من هنا فيُنشأ إسناد لكل (فصل × مادة) ولا يظهر للمعلم في
   التحضير إلا فصوله ← ثم تُسند الحصص الأسبوعية يدويًا أو برفع جدول الحصص.
   ويبقى الإسناد اليدوي المباشر (فصل + مادة + معلم + حصص) عاملًا كما كان.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* --------------------------------------------------------------- مساعدات */
  function teacherOptions(schoolId) {
    return S.usersByRole('teacher', schoolId).map(function (u) {
      var subs = (u.subjects || u.qualified || []);
      return { value: u.id, label: u.name + (subs.length ? ' (' + subs.join('، ') + ')' : '') };
    });
  }
  function teacherName(id) { var u = S.user(id); return u ? u.name : '—'; }
  function unique(arr) {
    var out = [];
    arr.forEach(function (x) { if (x && out.indexOf(x) === -1) out.push(x); });
    return out;
  }
  function setOptions(sel, list, placeholder) {
    clear(sel);
    if (placeholder != null) sel.appendChild(h('option', { value: '', text: placeholder }));
    (list || []).forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
  }
  /* مصدر الإسناد: يدوي (افتراضي) · تثبيت الوكيل · مستورد من جدول الحصص */
  function sourceText(a) {
    if (!a) return '—';
    if (a.source === 'deputy-lock') return 'تثبيت الوكيل';
    if (a.source === 'schedule-import') return 'مستورد من الجدول';
    return 'يدوي';
  }
  function sourceBadge(a) {
    if (a && a.source === 'deputy-lock') return UI.badge('تثبيت الوكيل', 'mint');
    if (a && a.source === 'schedule-import') return UI.badge('مستورد من الجدول', 'amber');
    return UI.badge('يدوي', 'brand');
  }

  App.register({
    id: 'assignments',
    label: 'إسناد الفصول والمواد',
    icon: '&#128203;',
    roles: ['deputy'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var yearFilter = '', subjectFilter = '';
      var state = { tab: 'manual' };   /* manual | lock | all */

      function classes() { return S.list('classes', { schoolId: schoolId }); }
      function assignments() { return S.list('assignments', { schoolId: schoolId }); }
      function subjectsOfSchool() { return unique(S.subjectsFor(S.school(schoolId).stages || [])); }
      function periods() { return S.periodsOf(schoolId); }

      /* =========================================================== الرسم */
      function draw() {
        clear(view);

        /* ملاحظة بارزة تشرح تسلسل الإسناد */
        view.appendChild(h('div', { class: 'muted-block', style: { marginBottom: '18px' } }, [
          h('strong', { text: 'تسلسل الإسناد: ' }),
          h('span', { text: 'مدير المدرسة يختار الفصول والمواد ← الوكيل يثبّت ← المعلم لا يرى في التحضير إلا فصوله ← ثم تُسند الحصص الأسبوعية يدويًا أو برفع جدول الحصص.' })
        ]));

        var items = [
          { key: 'manual', label: 'الإسناد اليدوي' },
          { key: 'lock', label: 'تثبيت الإسناد' },
          { key: 'all', label: 'كل الإسنادات' }
        ];
        var body = h('div');
        function paint() {
          clear(body);
          if (state.tab === 'lock') body.appendChild(lockPanel());
          else if (state.tab === 'all') body.appendChild(listPanel());
          else body.appendChild(manualPanel());
        }
        var bar = UI.tabs(items, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', items[i].key === state.tab); });

        view.appendChild(UI.panel('إسناد الفصول والمواد', 'من صلاحيات وكيل شؤون الطلاب: الإسناد اليدوي، وتثبيت إسناد المعلمين، واستعراض كل الإسنادات.', null, [bar, body]));
        paint();
      }

      /* ------------------------------------------ تبويب الإسناد اليدوي */
      function manualPanel() {
        return h('div', {}, [statsRow(), newPanel(), listPanel()]);
      }

      function statsRow() {
        var asgs = assignments();
        var teachers = S.usersByRole('teacher', schoolId);
        var assignedIds = unique(asgs.map(function (a) { return a.teacherId; }));
        var noAssign = teachers.filter(function (t) { return assignedIds.indexOf(t.id) === -1; }).length;
        var usedSubjects = unique(asgs.map(function (a) { return a.subject; }));
        var noTeacher = subjectsOfSchool().filter(function (s) { return usedSubjects.indexOf(s) === -1; }).length;
        var avgWeekly = asgs.length ? asgs.reduce(function (a, x) { return a + (x.periods || []).length; }, 0) / asgs.length : 0;
        avgWeekly = Math.round(avgWeekly * 10) / 10;

        return h('div', { class: 'stat-row' }, [
          UI.statCard('عدد الإسنادات', String(asgs.length)),
          UI.statCard('معلمون بلا إسناد', String(noAssign), 'من أصل ' + teachers.length, noAssign ? 'gold' : null),
          UI.statCard('مواد بلا معلم', String(noTeacher), null, noTeacher ? 'gold' : null),
          UI.statCard('متوسط الحصص الأسبوعية', String(avgWeekly))
        ]);
      }

      /* ------------------------------------------------ لوحة إسناد جديد */
      function newPanel() {
        var cls = classes();
        var classSel = UI.field({
          name: 'class', label: 'الفصل', type: 'select', required: true,
          options: cls.map(function (k) { return { value: k.id, label: k.name + ' — ' + S.stageName(k.stage) }; }),
          placeholder: cls.length ? 'اختر الفصل' : 'لا فصول بعد'
        });
        var subjectSel = UI.field({ name: 'subject', label: 'المادة', type: 'select', required: true, options: [], placeholder: 'اختر الفصل أولًا' });
        var teacherSel = UI.field({
          name: 'teacher', label: 'المعلم', type: 'select', required: true,
          options: teacherOptions(schoolId), placeholder: 'اختر المعلم'
        });
        var classHint = h('p', { class: 'muted', text: 'لم يُختر فصل بعد.' });
        var teacherHint = h('p', { class: 'muted', text: 'يعرض كل معلم مواده المؤهلة بين قوسين.' });

        function refreshSubject() {
          var k = S.klass(classSel.input.value);
          if (!k) {
            setOptions(subjectSel.input, [], 'اختر الفصل أولًا');
            classHint.textContent = 'لم يُختر فصل بعد.';
            return;
          }
          var subs = S.subjectsFor([k.stage]);
          setOptions(subjectSel.input, subs.map(function (s) { return { value: s, label: s }; }), 'اختر المادة');
          classHint.textContent = 'المرحلة: ' + S.stageName(k.stage) + ' · الصف: ' + k.grade + ' · الصفوف تُقيَّد بمواد هذه المرحلة (' + subs.length + ' مادة).';
        }
        classSel.input.addEventListener('change', refreshSubject);
        teacherSel.input.addEventListener('change', function () {
          var u = S.user(teacherSel.input.value);
          var subs = u ? (u.subjects || u.qualified || []) : [];
          teacherHint.textContent = u ? ('المواد المؤهلة: ' + (subs.length ? subs.join('، ') : 'غير محدّدة')) : 'يعرض كل معلم مواده المؤهلة بين قوسين.';
        });

        var boxes = periods().map(function (p) {
          var cb = h('input', { type: 'checkbox', value: String(p.index) });
          return { p: p, cb: cb };
        });
        var pick = h('div', { class: 'pick-list' }, boxes.map(function (b) {
          return h('label', {}, [b.cb, h('span', { text: b.p.label + ' (' + b.p.start + ' — ' + b.p.end + ')' })]);
        }));

        var submit = h('button', { class: 'btn btn-primary', type: 'button', text: 'إسناد', onClick: function () {
          var classId = classSel.input.value, sub = subjectSel.input.value, tid = teacherSel.input.value;
          var picked = boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.p.index; });
          if (!classId || !sub || !tid) { UI.toast('اختر الفصل والمادة والمعلم', 'warn'); return; }
          if (!picked.length) { UI.toast('اختر حصة واحدة على الأقل', 'warn'); return; }
          var k = S.klass(classId);
          if (S.subjectsFor([k.stage]).indexOf(sub) === -1) {
            UI.toast('المادة «' + sub + '» ليست من مواد ' + S.stageName(k.stage) + ' — راجع المرحلة', 'err');
            return;
          }
          var dup = assignments().some(function (a) { return a.classId === classId && a.subject === sub && a.teacherId === tid; });
          if (dup) { UI.toast('هذا الإسناد موجود مسبقًا لنفس الفصل والمادة والمعلم', 'warn'); return; }
          S.insert('assignments', { schoolId: schoolId, teacherId: tid, subject: sub, classId: classId, periods: picked, weekly: picked.length, source: 'manual', createdAt: S.now() });
          UI.toast('أُضيف الإسناد', 'ok');
          draw();
        } });

        return UI.panel('إسناد جديد', 'اختر الفصل لتُقيَّد المواد بمرحلته، ثم المعلم والحصص الأسبوعية.', [submit], [
          h('div', { class: 'form-grid' }, [classSel.wrap, subjectSel.wrap, teacherSel.wrap, h('div', { class: 'field' }, [h('label', { text: 'الحصص الأسبوعية' }), pick])]),
          h('div', { class: 'stack-sm mt-4' }, [classHint, teacherHint])
        ]);
      }

      /* ================================= تبويب تثبيت إسناد المعلمين */
      function lockPanel() {
        var teachers = S.usersByRole('teacher', schoolId);
        var locked = teachers.filter(function (t) { return !!t.locked; });
        var waiting = teachers.filter(function (t) { return !t.locked; });
        var noClasses = teachers.filter(function (t) { return !S.teacherPlan(t.id).classes.length; });
        var noSubjects = teachers.filter(function (t) { return !S.teacherPlan(t.id).subjects.length; });

        var cards = h('div', { class: 'stat-row' }, [
          UI.statCard('معلمون مثبّتون', String(locked.length), 'من أصل ' + teachers.length),
          UI.statCard('بانتظار التثبيت', String(waiting.length), 'اختيار المدير جاهز للتثبيت', waiting.length ? 'gold' : null),
          UI.statCard('معلمون بلا فصول', String(noClasses.length), 'لم تُختَر لهم فصول', noClasses.length ? 'gold' : null),
          UI.statCard('معلمون بلا مواد', String(noSubjects.length), 'لم تُحدَّد لهم مواد', noSubjects.length ? 'gold' : null)
        ]);

        var rows = teachers.map(function (t) { return t; });
        var table = rows.length ? UI.table({
          cols: [
            { label: 'المعلم', render: function (t) { return h('strong', { style: { fontWeight: '600' }, text: t.name }); } },
            { label: 'الفصول المُختارة', render: function (t) {
              var cs = S.teacherPlan(t.id).classes;
              if (!cs.length) return UI.badge('بلا فصول', 'amber');
              return h('span', { text: cs.map(function (c) { return c.name; }).join('، ') });
            } },
            { label: 'المواد', render: function (t) {
              var ss = S.teacherPlan(t.id).subjects;
              if (!ss.length) return UI.badge('بلا مواد', 'amber');
              return h('span', { text: ss.join('، ') });
            } },
            { label: 'الإسنادات الحالية', render: function (t) { return h('span', { class: 'nums', text: String(S.assignmentsOf(t.id).length) }); } },
            { label: 'الحالة', render: function (t) { return UI.badge(t.locked ? 'مثبّت' : 'بانتظار التثبيت', t.locked ? 'mint' : 'amber'); } },
            { label: 'إجراءات', class: 'row-actions', render: function (t) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تثبيت الإسناد', onClick: function () { lockTeacher(t); } }),
                h('button', { class: 'mini-btn', type: 'button', text: 'عرض إسناداته', onClick: function () { viewTeacher(t); } }),
                t.locked ? h('button', { class: 'mini-btn is-danger', type: 'button', text: 'فك التثبيت', onClick: function () { unlockTeacher(t); } }) : null
              ]);
            } }
          ], rows: rows, empty: 'لا يوجد معلمون في هذه المدرسة بعد.'
        }) : UI.empty('لا يوجد معلمون في هذه المدرسة بعد — أضِف الحسابات من «حسابات ومهام المدرسة».', null);

        return h('div', {}, [
          cards,
          UI.panel('تثبيت إسناد المعلمين', 'يثبّت الوكيل اختيار مدير المدرسة (الفصول × المواد) فيُنشأ إسناد لكل توليفة، ولا يرى المعلم في التحضير إلا فصوله.', null, [
            h('div', { class: 'muted-block', style: { marginBottom: '14px' }, text: 'المعلم بلا فصول أو بلا مواد لا يمكن تثبيت إسناده — يظهر الخطأ عند الضغط على «تثبيت الإسناد» حتى يُضبط اختياره أولًا.' }),
            table
          ])
        ]);
      }

      function lockTeacher(t) {
        var plan = S.teacherPlan(t.id);
        var warning = 'سيُنشئ النظام إسنادات لكل (فصل × مادة) ويثبّتها — وبعدها لا يظهر للمعلم في التحضير إلا فصوله.';
        var details = 'المعلم: ' + t.name +
          ' · الفصول: ' + (plan.classes.length ? plan.classes.map(function (c) { return c.name; }).join('، ') : 'لا فصول') +
          ' · المواد: ' + (plan.subjects.length ? plan.subjects.join('، ') : 'لا مواد') +
          ' · الحد الأقصى للإسنادات الجديدة: ' + (plan.classes.length * plan.subjects.length) + '.';

        UI.formModal({
          title: 'تثبيت إسناد المعلم — ' + t.name,
          intro: warning,
          fields: [
            { name: 'note', label: 'ملاحظة التثبيت (اختياري)', type: 'textarea', rows: 2, half: false,
              placeholder: 'مثال: وفق اختيار مدير المدرسة للفصل الدراسي الأول', help: details }
          ],
          submitLabel: 'تثبيت الإسناد',
          onSubmit: function (data, ctx) {
            var res = S.lockTeacherAssignments(t.id, (data && data.note) || '');
            var errEl = ctx && ctx.box ? ctx.box.querySelector('.hint-error') : null;
            if (!res || !res.ok) {
              var msg = (res && res.error) || 'تعذّر تثبيت الإسناد';
              /* سببان: خطأ من المخزن، أو فشل تحقّق الحقول — يُعرض السبب داخل النافذة المفتوحة والأثر في التنبيه */
              if (errEl) { errEl.hidden = false; errEl.textContent = msg; }
              UI.toast(msg, 'err');
              return false;   /* يُبقي النافذة مفتوحة لعرض سبب الخطأ */
            }
            if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
            UI.toast('ثُبّت إسناد ' + t.name + ': أُنشئ ' + res.created + ' · موجود مسبقًا ' + res.existing +
              ' (فصول ' + res.classes + ' × مواد ' + res.subjects + ')', 'ok');
            draw();
          }
        });
      }

      function unlockTeacher(t) {
        UI.confirm('فك تثبيت إسناد «' + t.name + '»؟ ستتوقف إسناداته عن الظهور في حساب المعلم في التحضير (وتبقى محفوظة لدى الوكيل ويمكن إعادة التثبيت).',
          { ok: 'فك التثبيت', danger: true }).then(function (ok) {
          if (!ok) return;
          S.unlockTeacher(t.id);
          UI.toast('فُكّ تثبيت إسناد ' + t.name + ' — لن تظهر إسناداته في حساب المعلم', 'ok');
          draw();
        });
      }

      function viewTeacher(t) {
        var host = h('div');

        function renderRows() {
          clear(host);
          var rows = S.assignmentsOf(t.id);
          if (!rows.length) {
            host.appendChild(UI.empty('لا توجد إسنادات لهذا المعلم بعد — ثبّت الإسناد من الجدول.', null));
            return;
          }
          var ps = periods();
          host.appendChild(UI.table({
            cols: [
              { label: 'الفصل', render: function (a) { return (S.klass(a.classId) || {}).name || '—'; } },
              { label: 'المادة', render: function (a) { return h('strong', { style: { fontWeight: '600' }, text: a.subject }); } },
              { label: 'المصدر', render: function (a) { return sourceBadge(a); } },
              { label: 'الحصص الأسبوعية', render: function (a) {
                var boxes = ps.map(function (p) {
                  var cb = h('input', { type: 'checkbox', value: String(p.index) });
                  cb.checked = (a.periods || []).indexOf(p.index) > -1;
                  return { p: p, cb: cb };
                });
                var pick = h('div', { class: 'pick-list', style: { maxHeight: 'none', minWidth: '220px' } }, boxes.map(function (b) {
                  return h('label', {}, [b.cb, h('span', { text: b.p.label + ' (' + b.p.start + ' — ' + b.p.end + ')' })]);
                }));
                var save = h('button', { class: 'mini-btn is-primary', type: 'button', text: 'حفظ الحصص', onClick: function () {
                  var picked = boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.p.index; });
                  var sorted = picked.slice().sort(function (x, y) { return x - y; });   /* الحصص مرتّبة تصاعديًا */
                  S.update('assignments', a.id, { periods: sorted, weekly: sorted.length });
                  UI.toast('حُفظت حصص «' + a.subject + '» (' + sorted.length + ' حصة)', 'ok');
                  renderRows();
                } });
                return h('div', { class: 'stack-sm' }, [
                  pick,
                  h('div', { class: 'cluster' }, [save, h('span', { class: 'muted nums', text: 'أسبوعيًا: ' + ((a.periods || []).length) })])
                ]);
              } }
            ], rows: rows, empty: 'لا توجد إسنادات.'
          }));
        }

        renderRows();
        UI.modal({
          title: 'إسنادات المعلم — ' + t.name,
          wide: true,
          body: [ host ],
          actions: [{ label: 'إغلاق', class: 'btn-outline', onClick: function (close) { close(); } }]
        });
      }

      /* ---------------------------------------------- لوحة الإسنادات الحالية */
      function listPanel() {
        var asgs = assignments();

        var years = unique(asgs.map(function (a) { var k = S.klass(a.classId); return k ? k.grade : null; })).sort();
        var subs = unique(asgs.map(function (a) { return a.subject; })).sort();

        var yearSel = UI.field({ name: 'fy', label: 'الصف (السنة)', type: 'select', options: years.map(function (y) { return { value: y, label: y }; }), value: yearFilter, placeholder: 'الكل' });
        var subSel = UI.field({ name: 'fs', label: 'المادة', type: 'select', options: subs.map(function (s) { return { value: s, label: s }; }), value: subjectFilter, placeholder: 'الكل' });

        var host = h('div');
        function renderRows() {
          clear(host);
          var filtered = asgs.filter(function (a) {
            var k = S.klass(a.classId) || {};
            if (yearFilter && k.grade !== yearFilter) return false;
            if (subjectFilter && a.subject !== subjectFilter) return false;
            return true;
          });
          if (!asgs.length) { host.appendChild(UI.empty('لا توجد إسنادات بعد — أنشئ أول إسناد من «الإسناد اليدوي» أو ثبّت إسناد معلم من «تثبيت الإسناد».', null)); return; }
          if (!filtered.length) { host.appendChild(UI.empty('لا نتائج مطابقة للتصفية الحالية.', null)); return; }
          host.appendChild(UI.table({
            cols: [
              { label: 'الفصل', render: function (a) { return (S.klass(a.classId) || {}).name || '—'; } },
              { label: 'الصف / المرحلة', render: function (a) { var k = S.klass(a.classId) || {}; return (k.grade || '—') + ' · ' + S.stageName(k.stage); } },
              { label: 'المادة', render: function (a) { return h('strong', { style: { fontWeight: '600' }, text: a.subject }); } },
              { label: 'المعلم', render: function (a) { return teacherName(a.teacherId); } },
              { label: 'المصدر', render: function (a) { return sourceBadge(a); } },
              { label: 'الحصص', render: function (a) { return (a.periods || []).join('، ') || '—'; } },
              { label: 'الحصص الأسبوعية', render: function (a) { return h('span', { class: 'nums', text: String((a.periods || []).length) }); } },
              { label: 'إجراءات', class: 'row-actions', render: function (a) {
                return h('div', { class: 'row-actions' }, [
                  h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { editAssignment(a); } }),
                  h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removeAssignment(a); } })
                ]);
              } }
            ], rows: filtered, empty: 'لا توجد إسنادات.'
          }));
        }

        yearSel.input.addEventListener('change', function () { yearFilter = yearSel.input.value; renderRows(); });
        subSel.input.addEventListener('change', function () { subjectFilter = subSel.input.value; renderRows(); });

        var actions = [
          UI.reportButton(function () { return assignReport(); }, { label: 'طباعة توزيع الإسناد', class: 'btn-soft' }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: function () { exportAssignments(asgs); } })
        ];

        var panel = UI.panel('الإسنادات الحالية', 'يمكن التصفية بالصف (السنة) والمادة، ثم التعديل أو الحذف. يوضّح عمود «المصدر» أصل كل إسناد.', actions, [
          h('div', { class: 'form-grid' }, [yearSel.wrap, subSel.wrap]),
          h('div', { class: 'mt-4' }, [host])
        ]);
        renderRows();
        return panel;
      }

      /* ==================================================== تعديل/حذف */
      function editAssignment(a) {
        var tSel = UI.field({ name: 'teacher', label: 'المعلم', type: 'select', required: true, options: teacherOptions(schoolId), value: a.teacherId });
        var boxes = periods().map(function (p) {
          var cb = h('input', { type: 'checkbox', value: String(p.index) });
          cb.checked = (a.periods || []).indexOf(p.index) > -1;
          return { p: p, cb: cb };
        });
        var pick = h('div', { class: 'pick-list' }, boxes.map(function (b) {
          return h('label', {}, [b.cb, h('span', { text: b.p.label + ' (' + b.p.start + ' — ' + b.p.end + ')' })]);
        }));
        UI.modal({
          title: 'تعديل الإسناد',
          body: [
            h('p', { class: 'muted', text: (S.klass(a.classId) || {}).name + ' — ' + a.subject + ' · المصدر: ' + sourceText(a) }),
            h('div', { class: 'form-grid' }, [tSel.wrap]),
            h('div', { class: 'field' }, [h('label', { text: 'الحصص الأسبوعية' }), pick])
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            { label: 'حفظ', class: 'btn-primary', onClick: function (close) {
              var picked = boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.p.index; });
              if (!picked.length) { UI.toast('اختر حصة واحدة على الأقل', 'warn'); return; }
              var sorted = picked.slice().sort(function (x, y) { return x - y; });   /* الحصص مرتّبة تصاعديًا */
              S.update('assignments', a.id, { teacherId: tSel.input.value, periods: sorted, weekly: sorted.length });
              UI.toast('حُدّث الإسناد', 'ok');
              close();
              draw();
            } }
          ]
        });
      }

      function removeAssignment(a) {
        var k = S.klass(a.classId) || {};
        UI.confirm('حذف إسناد «' + a.subject + '» لـ«' + (k.name || '') + '» عن ' + teacherName(a.teacherId) + '؟', { ok: 'حذف', danger: true }).then(function (ok) {
          if (!ok) return;
          S.remove('assignments', a.id);
          UI.toast('حُذف الإسناد', 'ok');
          draw();
        });
      }

      /* ================================================= تصدير / طباعة */
      function exportAssignments(asgs) {
        if (!asgs.length) { UI.toast('لا توجد إسنادات لتصديرها', 'warn'); return; }
        var rows = asgs.map(function (a) {
          var k = S.klass(a.classId) || {};
          return {
            'الفصل': k.name || '', 'المرحلة': S.stageName(k.stage), 'الصف': k.grade || '',
            'المادة': a.subject, 'المعلم': teacherName(a.teacherId), 'المصدر': sourceText(a),
            'الحصص': (a.periods || []).join(' '), 'الحصص الأسبوعية': (a.periods || []).length
          };
        });
        UI.downloadCsv(rows, 'توزيع-الإسناد.csv');
        UI.toast('بدأ تنزيل ملف CSV', 'ok');
      }

      function assignReport() {
        var asgs = assignments().slice().sort(function (a, b) {
          return teacherName(a.teacherId).localeCompare(teacherName(b.teacherId));
        });
        var rep = S.registerReport('asg', '', { title: 'توزيع الإسناد' });
        return {
          type: 'asg', refId: '', code: rep.code,
          title: 'توزيع الإسناد', subtitle: (S.school(schoolId) || {}).name,
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'عدد الإسنادات', value: String(asgs.length) },
            { label: 'عدد المعلمين', value: String(unique(asgs.map(function (a) { return a.teacherId; })).length) }
          ],
          sections: [{
            heading: 'جدول التوزيع (المعلم × المادة × الفصل × الحصص)',
            table: {
              cols: ['المعلم', 'المادة', 'الفصل', 'الصف / المرحلة', 'المصدر', 'الحصص', 'أسبوعيًا'],
              rows: asgs.map(function (a) {
                var k = S.klass(a.classId) || {};
                return [teacherName(a.teacherId), a.subject, k.name || '—', (k.grade || '—') + ' · ' + S.stageName(k.stage), sourceText(a), (a.periods || []).join('، '), (a.periods || []).length];
              })
            }
          }]
        };
      }

      draw();
    }
  });
})();
