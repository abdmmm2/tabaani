/* =============================================================================
   classes.js — الفصول والطلاب (وكيل شؤون الطلاب)
   ---------------------------------------------------------------------------
   الرحلة: يحصر الوكيل طلاب المدرسة ← يستوردهم من ملف Excel/CSV (نور) مع مطابقة
   الأعمدة ومنع التكرار ← يُسكّن غير المسكّنين في الفصول ← ينقل الطلاب بين الفصول
   بسببٍ مُسجَّل ← يتابع كل ذلك في «سجل النقل»، ويصدّر أو يطبع الكشوف بالباركود.
   الصلاحية: وكيل شؤون الطلاب فقط.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var SECTIONS = ['أ', 'ب', 'ج', 'د'];

  /* --------------------------------------------------------------- مساعدات */
  function stageOptions(schoolId) {
    return (S.school(schoolId).stages || []).map(function (id) { return { value: id, label: S.stageName(id) }; });
  }
  function gradeOptions(stage) {
    return (S.grades[stage] || []).map(function (g) { return { value: g, label: g }; });
  }
  function teacherOptions(schoolId) {
    return S.usersByRole('teacher', schoolId).map(function (u) { return { value: u.id, label: u.name }; });
  }
  function setOptions(sel, list, placeholder) {
    clear(sel);
    if (placeholder != null) sel.appendChild(h('option', { value: '', text: placeholder }));
    (list || []).forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
  }
  function teacherName(id) { var u = S.user(id); return u ? u.name : '—'; }
  function studentName(id) { var s = S.student(id); return s ? s.name : '—'; }
  function cell(v) { return v == null ? '' : String(v).trim(); }
  function normAr(v) {
    return cell(v).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
  }
  /** تخمين عمود من عناوين الأعمدة العربية */
  function guessCol(cols, keys, avoid) {
    for (var i = 0; i < cols.length; i++) {
      var c = cell(cols[i]).replace(/\s+/g, ' ');
      if (avoid && avoid.some(function (a) { return c.indexOf(a) > -1; })) continue;
      for (var j = 0; j < keys.length; j++) { if (c.indexOf(keys[j]) > -1) return cols[i]; }
    }
    return '';
  }
  function fmtNum(v) { return v == null ? '—' : String(v); }

  App.register({
    id: 'classes',
    label: 'الفصول والطلاب',
    icon: '&#128218;',
    roles: ['deputy'],
    render: function (view) {
      var schoolId = S.session.schoolId;

      var state = {
        tab: 'classes',
        selected: null,               /* الفصل المفتوح في تبويب الفصول */
        q: '',                        /* بحث جدول الطلاب */
        classFilter: '',              /* تصفية بالفصل */
        picked: {},                   /* تحديد جدول كل الطلاب: studentId -> true */
        pickedUnhoused: {},           /* تحديد لوحة غير المسكّنين */
        imp: { rows: [], cols: [], fileName: '', guess: {}, map: {}, mode: 'one', result: null, summary: null },
        trFilter: { studentId: '', classId: '' }
      };

      function classes() { return S.list('classes', { schoolId: schoolId }); }
      function studentCount(k) { return S.studentsOf(k.id).length; }
      function schoolStudents() { return S.list('students', { schoolId: schoolId }); }
      function classOptions(excludeId) {
        return classes().map(function (k) { return { value: k.id, label: k.name + (k.room ? ' — ' + k.room : '') }; })
          .filter(function (o) { return o.value !== excludeId; });
      }
      /** مطابقة الصف+الشعبة (+المرحلة) مع الفصول الموجودة */
      function matchClass(grade, section, stage) {
        var ng = normAr(grade), ns = normAr(section), nst = normAr(stage);
        if (!ng && !ns) return null;
        var cands = classes().filter(function (k) {
          var kg = normAr(k.grade), ks = normAr(k.section);
          if (ng && kg !== ng && ng.indexOf(kg) === -1 && kg.indexOf(ng) === -1) return false;
          if (ns && ks !== ns && ns.indexOf(ks) === -1) return false;
          return true;
        });
        if (nst) {
          var byStage = cands.filter(function (k) { return normAr(S.stageName(k.stage)).indexOf(nst) > -1; });
          if (byStage.length) cands = byStage;
        }
        return cands.length === 1 ? cands[0] : null;
      }

      /* ============================================================ الرسم */
      function draw() {
        clear(view);
        var items = [
          { key: 'classes', label: 'الفصول' },
          { key: 'students', label: 'الطلاب والإسكان والنقل' },
          { key: 'transfers', label: 'سجل النقل' }
        ];
        var body = h('div');
        function paint() {
          clear(body);
          if (state.tab === 'students') body.appendChild(studentsTab());
          else if (state.tab === 'transfers') body.appendChild(transfersTab());
          else body.appendChild(classesTab());
        }
        var bar = UI.tabs(items, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', items[i].key === state.tab); });
        view.appendChild(UI.panel('الفصول والطلاب', 'حصر الطلاب وإسكانهم ونقلهم — من صلاحيات وكيل شؤون الطلاب.', null, [bar, body]));
        paint();
      }

      /* ============================================ (1) تبويب الفصول */
      function classesTab() {
        var box = h('div');
        function redraw() {
          clear(box);
          var ks = classes();
          var total = ks.reduce(function (a, k) { return a + studentCount(k); }, 0);
          var noSup = ks.filter(function (k) { return !k.supervisorId; }).length;
          var avg = ks.length ? Math.round(total / ks.length) : 0;
          box.appendChild(h('div', { class: 'stat-row' }, [
            UI.statCard('عدد الفصول', String(ks.length)),
            UI.statCard('عدد الطلاب', String(total)),
            UI.statCard('فصول بلا مشرف', String(noSup), null, noSup ? 'gold' : null),
            UI.statCard('متوسط الطلاب لكل فصل', String(avg))
          ]));

          box.appendChild(UI.panel('الفصول', 'فصول المدرسة ومراحلها ومشرفوها.', [
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة فصل', onClick: function () { classForm(null, redraw); } })
          ], [
            ks.length ? UI.table({
              cols: [
                { label: 'المرحلة', render: function (k) { return S.stageName(k.stage); } },
                { label: 'الصف', key: 'grade' },
                { label: 'الفصل', key: 'section' },
                { label: 'الغرفة', render: function (k) { return k.room || '—'; } },
                { label: 'المشرف', render: function (k) { return k.supervisorId ? teacherName(k.supervisorId) : UI.badge('بلا مشرف', 'amber'); } },
                { label: 'عدد الطلاب', render: function (k) { return String(studentCount(k)); } },
                { label: 'إجراءات', class: 'row-actions', render: function (k) {
                  return h('div', { class: 'row-actions' }, [
                    h('button', { class: 'mini-btn is-primary', type: 'button', text: 'عرض الطلاب', onClick: function () { state.selected = k.id; redraw(); } }),
                    h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { classForm(k, redraw); } }),
                    h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removeClass(k, redraw); } })
                  ]);
                } }
              ], rows: ks, empty: 'لا توجد فصول بعد.'
            }) : UI.empty('لا توجد فصول بعد — أضف أول فصل.', h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة فصل', onClick: function () { classForm(null, redraw); } }))
          ]));

          if (state.selected) {
            var k = S.klass(state.selected);
            if (!k) { state.selected = null; return; }
            var students = S.studentsOf(k.id).slice().sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
            box.appendChild(UI.panel(
              'طلاب الفصل — ' + k.name,
              [S.stageName(k.stage), k.grade, k.room ? 'الغرفة ' + k.room : null].filter(Boolean).join(' · '),
              [
                h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة طالب', onClick: function () { studentForm(k, null, redraw); } }),
                h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: function () { exportClassStudents(k, students); } }),
                UI.reportButton(function () { return classReport(k); }, { label: 'طباعة كشف الفصل', class: 'btn-soft' })
              ],
              [
                h('p', { class: 'muted', style: { marginBottom: '12px' }, text: 'لإسكان دفعة من ملف أو نقل الطلاب، استخدم تبويب «الطلاب والإسكان والنقل».' }),
                students.length ? UI.table({
                  cols: [
                    { label: 'م', render: function (s, i) { return String(i + 1); } },
                    { label: 'الاسم', render: function (s) { return h('strong', { style: { fontWeight: '600' }, text: s.name }); } },
                    { label: 'رقم الهوية', render: function (s) { return h('span', { class: 'nums', text: s.nationalId || '—' }); } },
                    { label: 'جوال ولي الأمر', render: function (s) { return h('span', { class: 'nums', text: s.guardianPhone || '—' }); } },
                    { label: 'المقعد', render: function (s) { return h('span', { class: 'nums', text: fmtNum(s.seat) }); } },
                    { label: 'إجراءات', class: 'row-actions', render: function (s) {
                      return h('div', { class: 'row-actions' }, [
                        h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { studentForm(k, s, redraw); } }),
                        h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                          UI.confirm('حذف الطالب «' + s.name + '» من «' + k.name + '»؟', { ok: 'حذف', danger: true }).then(function (ok) {
                            if (!ok) return;
                            S.remove('students', s.id);
                            S.update('classes', k.id, { students: S.studentsOf(k.id).length });
                            UI.toast('حُذف الطالب', 'ok');
                            redraw();
                            App.refreshBadges();
                          });
                        } })
                      ]);
                    } }
                  ], rows: students, empty: 'لا يوجد طلاب في هذا الفصل بعد.'
                }) : UI.empty('لا يوجد طلاب في هذا الفصل — أضفهم يدويًا أو استوردهم من تبويب «الطلاب والإسكان والنقل».', null)
              ]
            ));
          }
        }
        redraw();
        return box;
      }

      /* ============================================ (2) تبويب الطلاب */
      function studentsTab() {
        var box = h('div');
        var ks = classes();
        var all = schoolStudents();
        var unhoused = S.unhoused(schoolId);
        var housed = all.filter(function (s) { return !!s.classId; }).length;
        var avg = ks.length ? Math.round(all.length / ks.length) : 0;
        box.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('إجمالي الطلاب', String(all.length)),
          UI.statCard('غير مسكّنين', String(unhoused.length), unhoused.length ? 'بحاجة إلى فصل' : 'الكل مسكّن', unhoused.length ? 'gold' : null),
          UI.statCard('موزّعون على الفصول', String(housed)),
          UI.statCard('متوسط الطلاب لكل فصل', String(avg))
        ]));
        box.appendChild(importPanel());
        box.appendChild(unhousedPanel());
        box.appendChild(allStudentsPanel());
        return box;
      }

      /* -------------------------------------------- استيراد الطلاب */
      function importPanel() {
        var imp = state.imp;
        var status = h('p', { class: 'muted', text: imp.rows.length
          ? 'الملف الحالي: ' + imp.fileName + ' · ' + imp.rows.length + ' صفًا · ' + imp.cols.length + ' عمودًا.'
          : 'اختر ملف Excel أو CSV؛ يجب أن يحتوي الصف الأول على عناوين الأعمدة.' });
        var mapGrid = h('div', { class: 'form-grid mt-4' });
        var previewHost = h('div');
        var resultHost = h('div');

        var fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
        var drop = h('label', { class: 'file-drop' }, [
          h('strong', { text: 'اختر ملف Excel أو CSV' }),
          h('span', { text: 'اسحب الملف هنا أو اضغط للاختيار — الصيغ المدعومة: xlsx / xls / csv' }),
          fileInput
        ]);

        var fName = UI.field({ name: 'impName', label: 'عمود اسم الطالب', type: 'select', required: true, placeholder: '— اختر العمود —' });
        var fId = UI.field({ name: 'impId', label: 'عمود رقم الهوية', type: 'select', placeholder: '— اختر العمود —' });
        var fPhone = UI.field({ name: 'impPhone', label: 'عمود جوال ولي الأمر', type: 'select', placeholder: '— اختر العمود —' });
        var fGrade = UI.field({ name: 'impGrade', label: 'عمود الصف', type: 'select', placeholder: '— اختر العمود —' });
        var fSec = UI.field({ name: 'impSec', label: 'عمود الفصل / الشعبة', type: 'select', placeholder: '— اختر العمود —' });
        var fStage = UI.field({ name: 'impStage', label: 'عمود المرحلة (اختياري)', type: 'select', placeholder: '— اختر العمود —' });

        var targetField = UI.field({ name: 'impTargetClass', label: 'الفصل المستهدف', type: 'select', options: classOptions(), placeholder: 'اختر الفصل' });
        var hintFile = h('div', { class: 'muted-block', text: 'سيُطابق الصف والشعبة المذكوران في الملف مع الفصول الموجودة، وما لا يُطابق يبقى «غير مسكّن» حتى تُسكنه.' });
        var modeOne = h('input', { type: 'radio', name: 'impMode', value: 'one', checked: imp.mode !== 'file' ? true : null });
        var modeFile = h('input', { type: 'radio', name: 'impMode', value: 'file', checked: imp.mode === 'file' ? true : null });
        function syncMode() {
          var fileMode = modeFile.checked;
          imp.mode = fileMode ? 'file' : 'one';
          targetField.wrap.hidden = fileMode;
          hintFile.hidden = !fileMode;
        }
        modeOne.addEventListener('change', syncMode);
        modeFile.addEventListener('change', syncMode);

        var importBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', disabled: imp.rows.length ? null : true });
        function labelImport() {
          importBtn.textContent = imp.rows.length ? 'استيراد ' + imp.rows.length + ' طالبًا' : 'استيراد';
        }
        labelImport();

        var allCols = imp.cols || [];
        function colList() { return allCols.map(function (c) { return { value: c, label: c }; }); }
        function applyGuess() {
          var g = imp.guess || {}, m = imp.map || {};
          setOptions(fName.input, colList(), '— اختر العمود —'); fName.input.value = m.impName != null ? m.impName : (g.name || '');
          setOptions(fId.input, colList(), '— اختر العمود —'); fId.input.value = m.impId != null ? m.impId : (g.id || '');
          setOptions(fPhone.input, colList(), '— اختر العمود —'); fPhone.input.value = m.impPhone != null ? m.impPhone : (g.phone || '');
          setOptions(fGrade.input, colList(), '— اختر العمود —'); fGrade.input.value = m.impGrade != null ? m.impGrade : (g.grade || '');
          setOptions(fSec.input, colList(), '— اختر العمود —'); fSec.input.value = m.impSec != null ? m.impSec : (g.sec || '');
          setOptions(fStage.input, colList(), '— اختر العمود —'); fStage.input.value = m.impStage != null ? m.impStage : (g.stage || '');
        }
        [fName, fId, fPhone, fGrade, fSec, fStage].forEach(function (f) {
          f.input.addEventListener('change', function () { imp.map[f.name] = f.input.value; });
        });
        if (imp.rows.length) {
          [fName, fId, fPhone, fGrade, fSec, fStage].forEach(function (f) { mapGrid.appendChild(f.wrap); });
          applyGuess();
        }

        /* معاينة أول 8 صفوف */
        function drawPreview() {
          clear(previewHost);
          if (!imp.rows.length) return;
          previewHost.appendChild(h('h4', { style: { margin: '16px 0 8px', fontSize: 'var(--fs-sm)' }, text: 'معاينة أول ' + Math.min(8, imp.rows.length) + ' صفًا' }));
          previewHost.appendChild(h('div', { class: 'import-preview' }, [UI.table({
            cols: imp.cols.map(function (c) { return { label: c, key: c }; }),
            rows: imp.rows.slice(0, 8), empty: 'لا صفوف.'
          })]));
        }
        drawPreview();

        /* نتيجة الاستيراد */
        function drawResult() {
          clear(resultHost);
          if (!imp.result) return;
          var sm = imp.summary || {};
          resultHost.appendChild(UI.panel('نتيجة الاستيراد', 'ملخّص العملية وتفصيل الصفوف المعالجة.', null, [
            h('div', { class: 'cluster', style: { marginBottom: '12px' } }, [
              UI.badge('مضاف: ' + (sm.added || 0), 'mint'),
              UI.badge('متخطّى: ' + ((sm.dup || 0) + (sm.blank || 0)), 'amber'),
              UI.badge('غير مسكّن: ' + (sm.unhoused || 0), 'brand'),
              UI.badge('إجمالي الصفوف: ' + (sm.total || 0), 'plain')
            ]),
            UI.table({
              cols: [
                { label: 'اسم الطالب', render: function (r) { return h('strong', { style: { fontWeight: '600' }, text: r.name }); } },
                { label: 'رقم الهوية', render: function (r) { return h('span', { class: 'nums', text: r.nid || '—' }); } },
                { label: 'الفصل', render: function (r) { return r.cls; } },
                { label: 'الحالة', render: function (r) { return UI.badge(r.state, r.state === 'مسكّن' ? 'mint' : (r.state === 'مكرر' ? 'amber' : 'brand')); } }
              ], rows: imp.result.slice(0, 100), empty: 'لا نتائج.'
            })
          ]));
        }
        drawResult();

        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          status.textContent = 'جارٍ قراءة الملف: ' + file.name + ' …';
          UI.readExcel(file).then(function (res) {
            var rows = (res.rows || []).filter(function (r) {
              return Object.keys(r).some(function (key) { return cell(r[key]) !== ''; });
            });
            if (!rows.length) { status.textContent = 'الملف لا يحتوي صفوفًا صالحة.'; importBtn.disabled = true; return; }
            var cols = Object.keys(rows[0]);
            imp.rows = rows; imp.cols = cols; imp.fileName = file.name; imp.result = null; imp.summary = null; imp.map = {};
            imp.guess = {
              name: guessCol(cols, ['اسم الطالب', 'اسم', 'الطالب']),
              id: guessCol(cols, ['هوية']),
              phone: guessCol(cols, ['جوال', 'هاتف', 'ولي']),
              grade: guessCol(cols, ['الصف'], ['فصل', 'شعبة', 'شعبه']),
              sec: guessCol(cols, ['الفصل', 'شعبة', 'شعبه']),
              stage: guessCol(cols, ['المرحلة'])
            };
            UI.toast('قُرئ الملف: ' + rows.length + ' صفًا', 'ok');
            draw();
          }).catch(function () {
            status.textContent = 'تعذّر قراءة الملف — تأكد من صيغته.';
            importBtn.disabled = true;
          });
        });

        importBtn.addEventListener('click', function () {
          var cName = fName.input.value, cId = fId.input.value, cPhone = fPhone.input.value;
          var cGrade = fGrade.input.value, cSec = fSec.input.value, cStage = fStage.input.value;
          if (!cName) { UI.toast('حدّد عمود اسم الطالب أولًا', 'warn'); return; }
          if (!imp.rows.length) { UI.toast('لم يُقرأ ملف بعد', 'warn'); return; }
          var fileMode = modeFile.checked;
          var targetId = targetField.input.value;
          /* تلقائيًا: إن كان الملف يحمل أعمدة الصف/الشعبة ولم يُختر فصل مستهدف،
             نقرأ الفصل من الملف بدل إجبار المستخدم على تبديل الوضع يدويًا */
          if (!fileMode && !targetId && (cGrade || cSec)) {
            modeFile.checked = true; fileMode = true;
            UI.toast('قُرئ الصف والشعبة من الملف تلقائيًا', 'info');
          }
          if (!fileMode && !targetId) { UI.toast('اختر الفصل المستهدف أو فعّل قراءة الصف والشعبة من الملف', 'warn'); return; }

          var existing = schoolStudents();
          var seenId = {}, seenNP = {};
          existing.forEach(function (s) {
            if (s.nationalId) seenId[s.nationalId] = true;
            else seenNP[(s.name || '') + '\u0000' + (s.guardianPhone || '')] = true;
          });

          var added = 0, dup = 0, blank = 0, unhoused = 0, results = [];
          imp.rows.forEach(function (r) {
            var name = cell(r[cName]);
            var nid = cId ? cell(r[cId]) : '';
            var phone = cPhone ? cell(r[cPhone]) : '';
            var grade = cGrade ? cell(r[cGrade]) : '';
            var sec = cSec ? cell(r[cSec]) : '';
            var stage = cStage ? cell(r[cStage]) : '';
            if (!name) { blank++; return; }
            if (nid && seenId[nid]) { dup++; results.push({ name: name, nid: nid, cls: '—', state: 'مكرر' }); return; }
            if (!nid && seenNP[name + '\u0000' + phone]) { dup++; results.push({ name: name, nid: nid, cls: '—', state: 'مكرر' }); return; }

            var k = fileMode ? matchClass(grade, sec, stage) : S.klass(targetId);
            var classId = k ? k.id : null;
            var seat = classId ? S.studentsOf(classId).length + 1 : null;
            S.insert('students', {
              schoolId: schoolId, classId: classId, name: name, nationalId: nid, guardianPhone: phone,
              seat: seat, status: 'active',
              stage: k ? k.stage : (stage || null), grade: grade || (k ? k.grade : null), section: sec || (k ? k.section : null)
            });
            if (nid) seenId[nid] = true; else seenNP[name + '\u0000' + phone] = true;
            if (classId) S.update('classes', classId, { students: S.studentsOf(classId).length });
            added++;
            if (!classId) unhoused++;
            results.push({ name: name, nid: nid, cls: k ? k.name : 'غير مسكّن', state: classId ? 'مسكّن' : 'غير مسكّن' });
          });

          imp.result = results; imp.summary = { added: added, dup: dup, blank: blank, unhoused: unhoused, total: imp.rows.length };
          var msg = 'أُضيف ' + added + ' طالبًا';
          if (dup) msg += ' · تُخطّي ' + dup + ' مكررًا';
          if (blank) msg += ' · ' + blank + ' صفًا بلا اسم';
          if (unhoused) msg += ' · ' + unhoused + ' بلا فصل';
          UI.toast(msg, added ? 'ok' : 'warn');
          draw();
          App.refreshBadges();
        });

        return UI.panel('استيراد الطلاب من Excel أو CSV', 'حصر طلاب المدرسة وإسكانهم من ملف نور أو قالب الأعمدة.', [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تنزيل قالب الأعمدة', onClick: function () {
            UI.downloadCsv([{ 'اسم الطالب': '', 'رقم الهوية': '', 'جوال ولي الأمر': '', 'المرحلة': '', 'الصف': '', 'الفصل': '' }], 'قالب-استيراد-الطلاب.csv');
            UI.toast('بدأ تنزيل قالب الأعمدة', 'ok');
          } })
        ], [
          drop,
          h('div', { class: 'mt-4' }, [status]),
          mapGrid,
          h('div', { class: 'mt-4' }, [
            h('h4', { style: { marginBottom: '8px', fontSize: 'var(--fs-sm)' }, text: 'طريقة الإسكان' }),
            h('div', { class: 'stack-sm' }, [
              h('label', { class: 'checkline' }, [modeOne, h('span', { text: 'الفصل المحدّد لكل الصفوف' })]),
              h('div', { class: 'form-grid' }, [targetField.wrap]),
              h('label', { class: 'checkline' }, [modeFile, h('span', { text: 'قراءة الصف والشعبة من الملف' })]),
              hintFile
            ])
          ]),
          h('div', { class: 'cluster mt-4' }, [importBtn]),
          previewHost,
          resultHost
        ]);
      }

      /* -------------------------------------------- لوحة غير المسكّنين */
      function unhousedPanel() {
        var host = h('div');
        function redraw() {
          clear(host);
          var list = S.unhoused(schoolId);
          if (!list.length) {
            host.appendChild(UI.panel('غير مسكّنين', 'طلاب المدرسة بلا فصل.', null, [
              h('div', { class: 'cluster' }, [UI.badge('تم إسكان جميع الطلاب', 'mint')]),
              UI.empty('لا يوجد طلاب غير مسكّنين — كل الطلاب موزّعون على الفصول.', null)
            ]));
            return;
          }
          var picked = list.filter(function (s) { return state.pickedUnhoused[s.id]; });
          host.appendChild(UI.panel('غير مسكّنين (' + list.length + ')', 'حدّد الطلاب ثم أسكِنهم دفعة واحدة في فصل.', [
            h('button', {
              class: 'btn btn-primary btn-sm', type: 'button',
              text: 'إسكان المحدّدين (' + picked.length + ') في فصل…',
              disabled: picked.length ? null : true,
              onClick: function () { houseModal(picked.map(function (s) { return s.id; }), redraw); }
            })
          ], [
            UI.table({
              cols: [
                { label: 'تحديد', class: 'row-actions', render: function (s) {
                  return h('input', {
                    type: 'checkbox', checked: state.pickedUnhoused[s.id] ? true : null,
                    onChange: function (e) {
                      if (e.target.checked) state.pickedUnhoused[s.id] = true; else delete state.pickedUnhoused[s.id];
                      redraw();
                    }
                  });
                } },
                { label: 'الاسم', render: function (s) { return h('strong', { style: { fontWeight: '600' }, text: s.name }); } },
                { label: 'رقم الهوية', render: function (s) { return h('span', { class: 'nums', text: s.nationalId || '—' }); } },
                { label: 'جوال ولي الأمر', render: function (s) { return h('span', { class: 'nums', text: s.guardianPhone || '—' }); } },
                { label: 'الصف من الملف', render: function (s) { return [s.grade, s.section].filter(Boolean).join(' / ') || '—'; } },
                { label: 'إجراءات', class: 'row-actions', render: function (s) {
                  return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'إسكان', onClick: function () { houseModal([s.id], redraw); } });
                } }
              ], rows: list, empty: 'لا يوجد طلاب غير مسكّنين.'
            })
          ]));
        }
        redraw();
        return host;
      }

      /* -------------------------------------------- كل طلاب المدرسة */
      function allStudentsPanel() {
        var host = h('div');
        var tableHost = h('div');

        function filtered() {
          var q = cell(state.q).toLowerCase();
          return schoolStudents().filter(function (s) {
            if (state.classFilter === 'none') { if (s.classId) return false; }
            else if (state.classFilter) { if (s.classId !== state.classFilter) return false; }
            if (q) {
              var hay = ((s.name || '') + ' ' + (s.nationalId || '')).toLowerCase();
              if (hay.indexOf(q) === -1) return false;
            }
            return true;
          });
        }

        function exportRows() {
          return filtered().map(function (s, i) {
            var k = S.studentClass(s.id);
            return {
              'م': i + 1, 'اسم الطالب': s.name, 'رقم الهوية': s.nationalId || '',
              'جوال ولي الأمر': s.guardianPhone || '', 'المرحلة': k ? S.stageName(k.stage) : '',
              'الصف': s.grade || (k ? k.grade : ''), 'الفصل الحالي': k ? k.name : 'غير مسكّن'
            };
          });
        }

        function redrawTable() {
          clear(tableHost);
          var rows = filtered();
          var picked = rows.filter(function (s) { return state.picked[s.id]; });
          tableHost.appendChild(h('div', { class: 'between mt-4' }, [
            h('span', { class: 'muted', text: 'المعروضون: ' + rows.length + ' · المحدّدون: ' + picked.length }),
            h('div', { class: 'cluster' }, [
              h('button', { class: 'mini-btn', type: 'button', text: 'تحديد كل المعروضين', onClick: function () {
                rows.forEach(function (s) { state.picked[s.id] = true; }); redrawTable();
              } }),
              h('button', { class: 'mini-btn', type: 'button', text: 'إلغاء التحديد', onClick: function () {
                state.picked = {}; redrawTable();
              } })
            ])
          ]));
          if (picked.length) {
            tableHost.appendChild(h('div', { class: 'between mt-4' }, [
              h('span', { class: 'chip chip-brand', text: 'محدّدون: ' + picked.length }),
              h('button', {
                class: 'btn btn-primary btn-sm', type: 'button', text: 'نقل المحدّدين (' + picked.length + ') إلى فصل…',
                onClick: function () { transferModal(picked.map(function (s) { return s.id; })); }
              })
            ]));
          }
          tableHost.appendChild(h('div', { class: 'mt-4' }, [
            UI.table({
              cols: [
                { label: 'تحديد', class: 'row-actions', render: function (s) {
                  return h('input', {
                    type: 'checkbox', checked: state.picked[s.id] ? true : null,
                    onChange: function (e) {
                      if (e.target.checked) state.picked[s.id] = true; else delete state.picked[s.id];
                      redrawTable();
                    }
                  });
                } },
                { label: 'الاسم', render: function (s) { return h('strong', { style: { fontWeight: '600' }, text: s.name }); } },
                { label: 'رقم الهوية', render: function (s) { return h('span', { class: 'nums', text: s.nationalId || '—' }); } },
                { label: 'جوال ولي الأمر', render: function (s) { return h('span', { class: 'nums', text: s.guardianPhone || '—' }); } },
                { label: 'الفصل الحالي', render: function (s) {
                  var k = S.studentClass(s.id);
                  return k ? UI.badge(k.name, 'mint') : UI.badge('غير مسكّن', 'amber');
                } },
                { label: 'الصف', render: function (s) { var k = S.studentClass(s.id); return s.grade || (k ? k.grade : '—'); } },
                { label: 'إجراءات', class: 'row-actions', render: function (s) {
                  return h('button', { class: 'mini-btn', type: 'button', text: 'نقل إلى فصل…', onClick: function () { transferModal([s.id]); } });
                } }
              ], rows: rows, empty: 'لا يوجد طلاب مطابقون للبحث أو التصفية.'
            })
          ]));
        }

        var qField = UI.field({ name: 'stuQ', label: 'بحث بالاسم أو رقم الهوية', type: 'search', value: state.q, placeholder: 'اكتب اسمًا أو رقم هوية' });
        qField.input.addEventListener('input', function () { state.q = qField.input.value; redrawTable(); });
        var cField = UI.field({
          name: 'stuClass', label: 'تصفية بالفصل', type: 'select', value: state.classFilter, placeholder: 'كل الفصول',
          options: [{ value: 'none', label: 'غير المسكّنين' }].concat(classOptions())
        });
        cField.input.addEventListener('change', function () { state.classFilter = cField.input.value; redrawTable(); });

        host.appendChild(UI.panel('كل طلاب المدرسة', 'بحث وتصفية، وعرض الفصل الحالي، ونقل الطلاب فرديًا أو جماعيًا.', [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: function () {
            var rows = exportRows();
            if (!rows.length) { UI.toast('لا يوجد طلاب لتصديرهم', 'warn'); return; }
            UI.downloadCsv(rows, 'طلاب-المدرسة.csv');
            UI.toast('بدأ تنزيل ملف CSV', 'ok');
          } }),
          UI.reportButton(function () { return studentsReport(); }, { label: 'طباعة كشف الطلاب', class: 'btn-soft' })
        ], [
          h('div', { class: 'form-grid' }, [qField.wrap, cField.wrap]),
          tableHost
        ]));
        redrawTable();
        return host;
      }

      /* ============================================ (3) تبويب سجل النقل */
      function transfersTab() {
        var host = h('div');
        var tableHost = h('div');

        function studentFilterOptions() {
          var seen = {};
          S.transfersOf().forEach(function (t) { seen[t.studentId] = t.studentName || studentName(t.studentId); });
          return Object.keys(seen).map(function (id) { return { value: id, label: seen[id] }; });
        }
        function filtered() {
          var rows = S.transfersOf();
          if (state.trFilter.studentId) rows = rows.filter(function (t) { return t.studentId === state.trFilter.studentId; });
          if (state.trFilter.classId) rows = rows.filter(function (t) { return t.fromClassId === state.trFilter.classId || t.toClassId === state.trFilter.classId; });
          return rows;
        }
        function redrawTable() {
          clear(tableHost);
          var rows = filtered();
          tableHost.appendChild(h('div', { class: 'mt-4' }, [
            rows.length ? UI.table({
              cols: [
                { label: 'الطالب', render: function (t) { return h('strong', { style: { fontWeight: '600' }, text: t.studentName || studentName(t.studentId) }); } },
                { label: 'من فصل', render: function (t) { return t.fromClassId ? t.fromName : UI.badge('غير مسكّن', 'amber'); } },
                { label: 'إلى فصل', render: function (t) { return UI.badge(t.toName, 'mint'); } },
                { label: 'التاريخ والوقت', render: function (t) { return h('span', { class: 'nums', text: UI.fmtDateTime(t.at) }); } },
                { label: 'بواسطة', render: function (t) { return t.by || '—'; } },
                { label: 'ملاحظة', render: function (t) { return t.note || '—'; } }
              ], rows: rows, empty: 'لا توجد عمليات نقل مطابقة.'
            }) : UI.empty('لا توجد عمليات نقل مسجّلة بعد.', null)
          ]));
        }

        var sField = UI.field({ name: 'trStudent', label: 'تصفية بالطالب', type: 'select', value: state.trFilter.studentId, placeholder: 'كل الطلاب', options: studentFilterOptions() });
        sField.input.addEventListener('change', function () { state.trFilter.studentId = sField.input.value; redrawTable(); });
        var cField = UI.field({ name: 'trClass', label: 'تصفية بالفصل', type: 'select', value: state.trFilter.classId, placeholder: 'كل الفصول', options: classOptions() });
        cField.input.addEventListener('change', function () { state.trFilter.classId = cField.input.value; redrawTable(); });

        host.appendChild(UI.panel('سجل النقل', 'كل عمليات الإسكان والنقل بين الفصول — الأحدث أولًا.', [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: function () {
            var rows = filtered();
            if (!rows.length) { UI.toast('لا يوجد سجل لتصديره', 'warn'); return; }
            UI.downloadCsv(rows.map(function (t, i) {
              return {
                'م': i + 1, 'الطالب': t.studentName || studentName(t.studentId), 'من فصل': t.fromClassId ? t.fromName : 'غير مسكّن',
                'إلى فصل': t.toName, 'التاريخ والوقت': UI.fmtDateTime(t.at), 'بواسطة': t.by || '', 'ملاحظة': t.note || ''
              };
            }), 'سجل-النقل.csv');
            UI.toast('بدأ تنزيل ملف CSV', 'ok');
          } }),
          UI.reportButton(function () { return transfersReport(); }, { label: 'طباعة سجل تنقلات الطلاب', class: 'btn-soft' })
        ], [
          h('div', { class: 'form-grid' }, [sField.wrap, cField.wrap]),
          tableHost
        ]));
        redrawTable();
        return host;
      }

      /* ==================================================== نماذج الفصول */
      function classForm(existing, after) {
        var stage = existing ? existing.stage : (S.school(schoolId).stages[0] || '');
        var m = UI.formModal({
          title: existing ? 'تعديل فصل' : 'إضافة فصل',
          intro: 'اختر المرحلة ثم الصف؛ تتغيّر قائمة الصفوف تلقائيًا بحسب المرحلة.',
          fields: [
            { name: 'stage', label: 'المرحلة', type: 'select', required: true, options: stageOptions(schoolId), value: stage, placeholder: 'اختر المرحلة' },
            { name: 'grade', label: 'الصف', type: 'select', required: true, options: gradeOptions(stage), value: existing ? existing.grade : null, placeholder: 'اختر الصف' },
            { name: 'section', label: 'الفصل', type: 'select', required: true, options: SECTIONS.map(function (s) { return { value: s, label: s }; }), value: existing ? existing.section : null, placeholder: 'اختر الفصل' },
            { name: 'room', label: 'الغرفة', type: 'text', value: existing ? existing.room : '', placeholder: 'مثال: م-101' },
            { name: 'supervisorId', label: 'المشرف', type: 'select', options: teacherOptions(schoolId), value: existing ? existing.supervisorId : '', placeholder: 'بدون مشرف' }
          ],
          submitLabel: existing ? 'حفظ التعديلات' : 'إضافة',
          onSubmit: function (data) {
            var dup = classes().some(function (k) {
              return k.id !== (existing && existing.id) && k.stage === data.stage && k.grade === data.grade && k.section === data.section;
            });
            if (dup) { UI.toast('يوجد فصل بنفس المرحلة والصف والشعبة', 'warn'); return false; }
            var patch = {
              stage: data.stage, grade: data.grade, section: data.section,
              room: data.room || '', supervisorId: data.supervisorId || '',
              name: data.grade + ' / ' + data.section
            };
            if (existing) { S.update('classes', existing.id, patch); UI.toast('حُفظت بيانات الفصل', 'ok'); }
            else { S.insert('classes', Object.assign({ schoolId: schoolId, students: 0 }, patch)); UI.toast('أُضيف الفصل', 'ok'); }
            if (after) after(); else draw();
            App.refreshBadges();
          }
        });
        var st = m.box.querySelector('[name="stage"]');
        var gr = m.box.querySelector('[name="grade"]');
        st.addEventListener('change', function () {
          setOptions(gr, gradeOptions(st.value), 'اختر الصف');
          gr.value = '';
        });
      }

      function removeClass(k, after) {
        var n = studentCount(k);
        UI.confirm('سيُحذف الفصل «' + k.name + '»' + (n ? ' مع ' + n + ' طالبًا مسجّلًا فيه' : '') + '. متابعة؟', { ok: 'حذف', danger: true }).then(function (ok) {
          if (!ok) return;
          S.studentsOf(k.id).forEach(function (s) { S.remove('students', s.id); });
          S.remove('classes', k.id);
          if (state.selected === k.id) state.selected = null;
          UI.toast('حُذف الفصل', 'ok');
          if (after) after(); else draw();
          App.refreshBadges();
        });
      }

      /* ==================================================== نماذج الطلاب */
      function studentForm(k, existing, after) {
        var nextSeat = S.studentsOf(k.id).length + 1;
        UI.formModal({
          title: existing ? 'تعديل بيانات الطالب' : 'إضافة طالب — ' + k.name,
          fields: [
            { name: 'name', label: 'اسم الطالب', type: 'text', required: true, value: existing ? existing.name : '' },
            { name: 'nationalId', label: 'رقم الهوية', type: 'text', value: existing ? existing.nationalId : '', placeholder: '10xxxxxxxx' },
            { name: 'guardianPhone', label: 'جوال ولي الأمر', type: 'text', value: existing ? existing.guardianPhone : '', placeholder: '+9665xxxxxxxx' },
            { name: 'seat', label: 'المقعد', type: 'number', value: existing ? existing.seat : nextSeat }
          ],
          submitLabel: existing ? 'حفظ' : 'إضافة',
          onSubmit: function (data) {
            var seat = data.seat == null ? (existing ? existing.seat : nextSeat) : data.seat;
            if (existing) {
              S.update('students', existing.id, { name: data.name, nationalId: data.nationalId || '', guardianPhone: data.guardianPhone || '', seat: seat });
              UI.toast('حُدّثت بيانات الطالب', 'ok');
            } else {
              S.insert('students', { schoolId: schoolId, classId: k.id, name: data.name, nationalId: data.nationalId || '', guardianPhone: data.guardianPhone || '', seat: seat, status: 'active', stage: k.stage, grade: k.grade, section: k.section });
              S.update('classes', k.id, { students: S.studentsOf(k.id).length });
              UI.toast('أُضيف الطالب', 'ok');
            }
            if (after) after(); else draw();
            App.refreshBadges();
          }
        });
      }

      /* ----------------------------------------- نافذة الإسكان الجماعي */
      function houseModal(ids, after) {
        if (!ids.length) { UI.toast('حدّد طالبًا واحدًا على الأقل', 'warn'); return; }
        UI.formModal({
          title: 'إسكان ' + ids.length + ' طالبًا في فصل',
          intro: 'سيُعيَّن الطلاب في الفصل المختار ويُحدَّث عدد طلاب الفصل، وتُسجَّل العملية في «سجل النقل».',
          fields: [
            { name: 'toClass', label: 'الفصل', type: 'select', required: true, options: classOptions(), placeholder: 'اختر الفصل' },
            { name: 'note', label: 'ملاحظة (اختياري)', type: 'text', placeholder: 'مثال: توزيع الدفعة المستوردة' }
          ],
          submitLabel: 'إسكان',
          onSubmit: function (d) {
            var res = S.houseStudents(ids, d.toClass, d.note ? d.note.trim() : '');
            var target = S.klass(d.toClass);
            if (res.ok) {
              UI.toast('أُسكن ' + res.ok + ' طالبًا في «' + (target ? target.name : '') + '»' + (res.errors.length ? ' · تعذّر ' + res.errors.length : ''), res.errors.length ? 'warn' : 'ok');
            } else {
              UI.toast(res.errors[0] || 'تعذّر الإسكان', 'err');
            }
            ids.forEach(function (id) { delete state.pickedUnhoused[id]; });
            if (after) after();
            draw();
            App.refreshBadges();
          }
        });
      }

      /* ------------------------------ نافذة النقل (فردي/جماعي) */
      function transferModal(ids) {
        if (!ids.length) { UI.toast('حدّد طالبًا واحدًا على الأقل', 'warn'); return; }
        var single = ids.length === 1 ? S.student(ids[0]) : null;
        var opts = classOptions(single ? single.classId : null);
        UI.formModal({
          title: single ? 'نقل الطالب «' + single.name + '»' : 'نقل ' + ids.length + ' طالبًا إلى فصل',
          intro: 'النقل يُحدّث أعداد الفصلين (المصدر والهدف) ويُسجَّل في «سجل النقل» باسمك. سبب النقل مطلوب.',
          fields: [
            { name: 'toClass', label: 'الفصل الهدف', type: 'select', required: true, options: opts, placeholder: 'اختر الفصل' },
            { name: 'note', label: 'سبب النقل / ملاحظة', type: 'textarea', required: true, rows: 3, placeholder: 'مثال: تعديل توزيع الشعبة بناءً على طلب ولي الأمر' }
          ],
          submitLabel: 'نقل',
          onSubmit: function (d) {
            var note = d.note.trim();
            if (single) {
              var r = S.transferStudent(single.id, d.toClass, note);
              if (!r.ok) { UI.toast(r.error, 'err'); return false; }
              UI.toast('نُقل «' + single.name + '» إلى «' + r.record.toName + '»', 'ok');
            } else {
              var ok = 0, errs = [];
              ids.forEach(function (id) {
                var res = S.transferStudent(id, d.toClass, note);
                if (res.ok) ok++; else errs.push(studentName(id) + ': ' + res.error);
              });
              if (ok) UI.toast('نُقل ' + ok + ' طالبًا إلى «' + (S.klass(d.toClass) || {}).name + '»' + (errs.length ? ' · تعذّر ' + errs.length : ''), errs.length ? 'warn' : 'ok');
              else UI.toast(errs[0] || 'تعذّر النقل', 'err');
            }
            state.picked = {};
            draw();
            App.refreshBadges();
          }
        });
      }

      /* ================================================= تصدير / طباعة */
      function exportClassStudents(k, students) {
        if (!students.length) { UI.toast('لا يوجد طلاب لتصديرهم', 'warn'); return; }
        var rows = students.map(function (s, i) {
          return { 'م': i + 1, 'الاسم': s.name, 'رقم الهوية': s.nationalId || '', 'جوال ولي الأمر': s.guardianPhone || '', 'المقعد': s.seat == null ? '' : s.seat };
        });
        UI.downloadCsv(rows, 'طلاب-' + k.grade + '-' + k.section + '.csv');
        UI.toast('بدأ تنزيل ملف CSV', 'ok');
      }

      function classReport(k) {
        var students = S.studentsOf(k.id).slice().sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
        return {
          type: 'cls', refId: k.id,
          title: 'كشف طلاب الفصل', subtitle: k.name + ' — ' + S.stageName(k.stage),
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'المرحلة', value: S.stageName(k.stage) },
            { label: 'الصف', value: k.grade },
            { label: 'الفصل', value: k.section },
            { label: 'الغرفة', value: k.room || '—' },
            { label: 'المشرف', value: k.supervisorId ? teacherName(k.supervisorId) : 'بلا مشرف' },
            { label: 'عدد الطلاب', value: String(students.length) }
          ],
          sections: [{
            heading: 'كشف الطلاب',
            table: {
              cols: ['م', 'اسم الطالب', 'رقم الهوية', 'جوال ولي الأمر', 'المقعد'],
              rows: students.map(function (s, i) { return [i + 1, s.name, s.nationalId || '—', s.guardianPhone || '—', s.seat == null ? '—' : s.seat]; })
            }
          }]
        };
      }

      function studentsReport() {
        var all = schoolStudents();
        var unhoused = S.unhoused(schoolId);
        var ks = classes();
        var sorted = all.slice().sort(function (a, b) {
          var ka = S.studentClass(a.id), kb = S.studentClass(b.id);
          var na = ka ? ka.name : 'غير مسكّن', nb = kb ? kb.name : 'غير مسكّن';
          return na.localeCompare(nb) || (a.seat || 0) - (b.seat || 0);
        });
        return {
          type: 'students',
          title: 'كشف طلاب المدرسة', subtitle: (S.school(schoolId) || {}).name + ' — إجمالي ' + all.length + ' طالبًا',
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'عدد الفصول', value: String(ks.length) },
            { label: 'إجمالي الطلاب', value: String(all.length) },
            { label: 'الموزّعون على الفصول', value: String(all.length - unhoused.length) },
            { label: 'غير المسكّنين', value: String(unhoused.length) }
          ],
          sections: [{
            heading: 'كشف الطلاب',
            table: {
              cols: ['م', 'اسم الطالب', 'رقم الهوية', 'جوال ولي الأمر', 'المرحلة', 'الصف', 'الفصل الحالي'],
              rows: sorted.map(function (s, i) {
                var k = S.studentClass(s.id);
                return [i + 1, s.name, s.nationalId || '—', s.guardianPhone || '—', k ? S.stageName(k.stage) : '—', s.grade || (k ? k.grade : '—'), k ? k.name : 'غير مسكّن'];
              })
            }
          }]
        };
      }

      function transfersReport() {
        var rows = S.transfersOf();
        return {
          type: 'transfers',
          title: 'سجل تنقلات الطلاب', subtitle: (S.school(schoolId) || {}).name + ' — ' + rows.length + ' عملية',
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'عدد عمليات النقل', value: String(rows.length) },
            { label: 'أحدث عملية', value: rows.length ? UI.fmtDateTime(rows[0].at) : '—' }
          ],
          sections: [{
            heading: 'عمليات النقل (الأحدث أولًا)',
            table: {
              cols: ['م', 'الطالب', 'من فصل', 'إلى فصل', 'التاريخ والوقت', 'بواسطة', 'ملاحظة'],
              rows: rows.map(function (t, i) {
                return [i + 1, t.studentName || studentName(t.studentId), t.fromClassId ? t.fromName : 'غير مسكّن', t.toName, UI.fmtDateTime(t.at), t.by || '—', t.note || '—'];
              })
            }
          }]
        };
      }

      draw();
    }
  });
})();
