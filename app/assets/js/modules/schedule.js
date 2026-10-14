/* =============================================================================
   schedule.js — جدول الحصص (وكيل شؤون الطلاب)
   ---------------------------------------------------------------------------
   الرحلة: يضبط الوكيل أوقات الحصص اليومية وقاعدة إغلاق التحضير لكل حصة
   (منتصف الحصة أو نهايتها) ← يرفع جدول الحصص من ملف Excel/CSV أو من ملف PDF
   (استخراج نصّي بلا إنترنت) ← يُربط كل صف تلقائيًا بالفصل والمادة والمعلم
   الموجودين وتُسند الحصص ← يستعرض الجدول الأسبوعي لمصفوفة (الأحد–الخميس) ×
   الحصص بحسب الفصل أو المعلم ← يطبع الجدول بترويسة المدرسة وباركود (TBN-SCH…).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  var PALETTE = ['#CE9433', '#2FA37A', '#C97F2C', '#C2593F', '#4A7FB5', '#8A5A1E', '#1E7A5A', '#7A3F12'];

  var PDF_HELP = 'لم نستطع قراءة نص الجدول من هذا الـ PDF (قد يكون ملصقًا مصورًا بلا نص، أو فُتحت الصفحة عبر file://).';
  var PDF_HELP_2 = ' استخدم ملف Excel/CSV، أو شغّل المنصة عبر الأمر ';
  var PDF_HELP_3 = ' ثم افتحها من العنوان المحلي لقراءة PDF.';

  /* --------------------------------------------------------------- مساعدات */
  function colorFor(subject) {
    var s = String(subject || ''), sum = 0;
    for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return PALETTE[sum % PALETTE.length];
  }
  function teacherName(id) { var u = S.user(id); return u ? u.name : '—'; }
  function ruleLabel(r) { return r === 'mid' ? 'منتصف الحصة' : 'نهاية الحصة'; }
  function cell(v) { return v == null ? '' : String(v).trim(); }

  /** تحويل الأرقام العربية-الهندية إلى لاتينية */
  function toLatinDigits(v) {
    return String(v == null ? '' : v)
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }

  /** تطبيع عربي متسامح للمطابقة داخل نصوص الـ PDF (بلا قصّ لام التعريف) */
  function fold(v) {
    var s = String(v == null ? '' : v);
    try { s = s.normalize('NFKC'); } catch (e) {}
    return s
      .replace(/[\u064B-\u0652\u0670\u0640\u200f\u200e\u200c\u200d\u061c]/g, '')
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function revStr(s) { return String(s == null ? '' : s).split('').reverse().join(''); }

  /** صيغ النص الاحتمالية (الترتيب الطبيعي / معكوس التسلسل / بلا فراغات) لتحمّل اتجاهات PDF */
  function variants(s) {
    var f = fold(s), r = fold(revStr(s));
    return [f, r, f.replace(/\s+/g, ''), r.replace(/\s+/g, '')];
  }
  function hit(vars, needle) {
    var n = fold(needle);
    if (!n) return false;
    for (var i = 0; i < vars.length; i++) { if (vars[i].indexOf(n) > -1) return true; }
    return false;
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
  function setOptions(sel, list, placeholder) {
    clear(sel);
    if (placeholder != null) sel.appendChild(h('option', { value: '', text: placeholder }));
    (list || []).forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
  }
  function pushUniq(arr, seen, v) { if (v == null || v === '') return; if (seen[v]) return; seen[v] = true; arr.push(v); }

  /* -------------------------------------------------- تحميل pdf.js عند الطلب */
  var pdfWaiters = null;
  function loadPdfJs() {
    return new Promise(function (resolve, reject) {
      if (window.pdfjsLib) { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/js/vendor/pdf.worker.min.js'; } catch (e) {} resolve(window.pdfjsLib); return; }
      if (pdfWaiters) { pdfWaiters.push({ resolve: resolve, reject: reject }); return; }
      pdfWaiters = [{ resolve: resolve, reject: reject }];
      var s = document.createElement('script');
      s.src = 'assets/js/vendor/pdf.min.js';
      s.onload = function () {
        var lib = window.pdfjsLib;
        try { if (lib) lib.GlobalWorkerOptions.workerSrc = 'assets/js/vendor/pdf.worker.min.js'; } catch (e) {}
        var w = pdfWaiters; pdfWaiters = null;
        (w || []).forEach(function (p) { lib ? p.resolve(lib) : p.reject(new Error('pdfjsLib غير متاح')); });
      };
      s.onerror = function () {
        var w = pdfWaiters; pdfWaiters = null;
        (w || []).forEach(function (p) { p.reject(new Error('فشل تحميل محرّك pdf.js')); });
      };
      document.head.appendChild(s);
    });
  }

  /* --------------------------------- تجميع عناصر نص الـ PDF في أسطر مقروءة */
  function groupLines(items) {
    var lines = [];
    (items || []).forEach(function (it) {
      var str = it && it.str != null ? String(it.str) : '';
      if (!str.trim()) return;
      var tf = it.transform || [1, 0, 0, 1, 0, 0];
      var x = tf[4], y = tf[5];
      var line = null;
      for (var i = 0; i < lines.length; i++) { if (Math.abs(lines[i].y - y) <= 4) { line = lines[i]; break; } }
      if (!line) { line = { y: y, parts: [] }; lines.push(line); }
      line.parts.push({ x: x, w: it.width || 0, str: str });
    });
    lines.forEach(function (l) {
      l.parts.sort(function (a, b) { return b.x - a.x; });   /* x تنازليًا: قراءة عربية RTL */
      /* وصل الأجزاء بلا فراغ بين الحروف المتلاصقة، وفراغ عند وجود فجوة أفقية (بين الكلمات/الأعمدة) */
      var text = '', prev = null;
      l.parts.forEach(function (p) {
        if (prev) {
          var gap = prev.x - (p.x + p.w);
          if (gap > 1.5) text += ' ';
        }
        text += p.str;
        prev = p;
      });
      l.text = text.replace(/\s+/g, ' ').trim();
    });
    lines.sort(function (a, b) { return b.y - a.y; });       /* من أعلى الصفحة إلى أسفلها */
    return lines.map(function (l) { return l.text; }).filter(Boolean);
  }

  /* ------------------------- استخراج صف جدول تقريبي من سطر نصّي واحد */
  function extractRow(line, ctx) {
    var vars = variants(line);
    var digits = toLatinDigits(line).match(/\d+/g) || [];
    var period = '';
    if (digits.length) {
      var inRange = digits.filter(function (d) { var v = parseInt(d, 10); return v >= 1 && v <= ctx.maxPeriod; });
      period = String(parseInt(inRange.length ? inRange[0] : digits[digits.length - 1], 10));
    }
    var cls = null, clsScore = 0;
    ctx.classes.forEach(function (k) {
      [fold(k.name), fold(k.grade) + ' ' + fold(k.section), fold(k.grade) + fold(k.section)].forEach(function (c) {
        if (c && hit(vars, c) && c.length > clsScore) { clsScore = c.length; cls = k; }
      });
    });
    var subject = '', subScore = 0;
    ctx.subjects.forEach(function (s) {
      var f = fold(s);
      if (f.length >= 3 && hit(vars, f) && f.length > subScore) { subScore = f.length; subject = s; }
    });
    var teacher = null, tScore = 0;
    ctx.teachers.forEach(function (t) {
      var f = fold(t.name);
      if (f.length >= 4 && hit(vars, f) && f.length > tScore) { tScore = f.length; teacher = t; }
    });
    if (!teacher) {
      ctx.teachers.forEach(function (t) {
        var toks = fold(t.name).split(' ').filter(function (w) {
          return w && w.length >= 3 && w !== 'بن' && w !== 'بنت';
        });
        if (toks.length < 2) return;
        var score = 0;
        toks.forEach(function (tok) { if (hit(vars, tok)) score += 2; });
        if (score > tScore) { tScore = score; teacher = t; }
      });
      if (tScore < 4) teacher = null;
    }
    var day = '';
    DAYS.forEach(function (d) { if (!day && hit(vars, d)) day = d; });
    var score = (period ? 1 : 0) + (cls ? 1 : 0) + (subject ? 1 : 0) + (teacher ? 1 : 0);
    if (score < 2) return null;
    return {
      day: day, period: period, className: cls ? cls.name : '',
      subject: subject, teacherName: teacher ? teacher.name : '', raw: line
    };
  }

  /* -------------------- حلّ صفوف مصدرها الرفع إلى فصول/مواد/معلمين + تجميع */
  function resolveRows(rows, schoolId) {
    var classes = S.list('classes', { schoolId: schoolId });
    var teachers = S.usersByRole('teacher', schoolId);
    var subjects = S.subjectsFor(S.stagesOf(schoolId));
    var periods = S.periodsOf(schoolId);
    var unmatched = { cls: [], teacher: [], subject: [], period: [] };
    var seen = { cls: {}, teacher: {}, subject: {}, period: {} };
    var groups = {}, order = [];
    (rows || []).forEach(function (r) {
      var k = S.matchByName(classes, r.className);
      var t = S.matchByName(teachers, r.teacherName);
      var subj = null;
      if (r.subject) {
        var m = S.matchByName(subjects.map(function (s) { return { name: s }; }), r.subject);
        subj = m ? m.name : cell(r.subject);
        if (!m) pushUniq(unmatched.subject, seen.subject, cell(r.subject));
      }
      var pIdx = null;
      if (r.period) {
        var p = periods.find(function (x) { return String(x.index) === String(r.period) || S.normalizeAr(x.label) === S.normalizeAr(r.period); });
        pIdx = p ? p.index : (parseInt(r.period, 10) || null);
        if (!p) pushUniq(unmatched.period, seen.period, cell(r.period));
      }
      if (!k) pushUniq(unmatched.cls, seen.cls, cell(r.className) || '—');
      if (!t) pushUniq(unmatched.teacher, seen.teacher, cell(r.teacherName) || '—');
      if (!k || !t) return;
      var key = t.id + '|' + k.id + '|' + (subj || 'غير محددة');
      if (!groups[key]) { groups[key] = { teacher: t.name, className: k.name, subject: subj || 'غير محددة', periods: [] }; order.push(key); }
      if (pIdx && groups[key].periods.indexOf(pIdx) === -1) groups[key].periods.push(pIdx);
    });
    return {
      groups: order.map(function (key) {
        var g = groups[key];
        g.periods.sort(function (a, b) { return a - b; });
        return g;
      }),
      unmatched: unmatched
    };
  }

  /* ========================================================================= */
  App.register({
    id: 'schedule',
    label: 'جدول الحصص',
    icon: '&#128337;',
    roles: ['deputy'],
    render: function (view) {
      var schoolId = S.session.schoolId;

      var state = {
        tab: 'periods',            /* periods | upload | weekly */
        mode: 'class',             /* class | teacher (الجدول الأسبوعي) */
        selClass: null, selTeacher: null,
        imp: { rows: [], cols: [], fileName: '', guess: {}, map: {} },   /* Excel/CSV */
        pdf: { rows: [], lines: [], name: '', pages: 0, busy: false, error: false }, /* PDF */
        result: null               /* نتيجة آخر إسناد */
      };

      function classes() { return S.list('classes', { schoolId: schoolId }); }
      function teachers() { return S.usersByRole('teacher', schoolId); }
      function periods() { return S.periodsOf(schoolId); }

      /* =========================================================== الرسم */
      function draw() {
        clear(view);
        var items = [
          { key: 'periods', label: 'الحصص وقاعدة الإغلاق' },
          { key: 'upload', label: 'رفع الجدول' },
          { key: 'weekly', label: 'الجدول الأسبوعي' }
        ];
        var body = h('div');
        function paint() {
          clear(body);
          if (state.tab === 'upload') body.appendChild(uploadPanel());
          else if (state.tab === 'weekly') body.appendChild(weeklyPanel());
          else body.appendChild(periodsPanel());
        }
        var bar = UI.tabs(items, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', items[i].key === state.tab); });
        view.appendChild(UI.panel(
          'جدول الحصص',
          'ضبط الحصص اليومية وقاعدة الإغلاق، ورفع الجدول من Excel/CSV أو PDF وربطه تلقائيًا، ثم مصفوفة الأسبوع (الأحد–الخميس).',
          null, [bar, body]
        ));
        paint();
      }

      /* ------------------------------ الحصص اليومية وقاعدة الإغلاق */
      function periodsPanel() {
        var ps = periods();
        var rows = ps.map(function (p) {
          var start = h('input', { class: 'input', type: 'time', value: p.start, style: { minWidth: '104px' } });
          var end = h('input', { class: 'input', type: 'time', value: p.end, style: { minWidth: '104px' } });
          var rule = h('select', { class: 'input', style: { minWidth: '150px' } }, [
            h('option', { value: 'mid', text: 'منتصف الحصة' }),
            h('option', { value: 'end', text: 'نهاية الحصة' })
          ]);
          rule.value = p.closeRule === 'mid' ? 'mid' : 'end';
          return { p: p, start: start, end: end, rule: rule };
        });

        var save = h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'حفظ التعديلات', onClick: function () {
          var ok = rows.every(function (r) { return r.start.value && r.end.value && r.start.value < r.end.value; });
          if (!ok) { UI.toast('تحقق من الأوقات: يجب أن تسبق البداية النهاية في كل حصة', 'warn'); return; }
          rows.forEach(function (r) {
            S.update('periods', r.p.id, { start: r.start.value, end: r.end.value, closeRule: r.rule.value, label: 'الحصة ' + r.p.index });
          });
          UI.toast('حُفظت تعديلات الحصص', 'ok');
          draw();
        } });

        var add = h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إضافة حصة', onClick: addPeriod });

        return UI.panel('الحصص اليومية وقاعدة الإغلاق', 'تُطبَّق قاعدة الإغلاق على كل حصة على حدة في وحدة التحضير.', [add, save], [
          h('div', { class: 'muted-block', text: 'لا يُغلق المعلم التحضير إلا عند الحد المحدد — منتصف الحصة أو نهايتها. اضبط وقت البداية والنهاية وقاعدة الإغلاق ثم احفظ.' }),
          h('div', { class: 'mt-4' }, [
            ps.length ? UI.table({
              cols: [
                { label: 'الحصة', render: function (r) { return h('strong', { text: r.p.label }); } },
                { label: 'وقت البداية', render: function (r) { return r.start; } },
                { label: 'وقت النهاية', render: function (r) { return r.end; } },
                { label: 'قاعدة الإغلاق', render: function (r) { return r.rule; } },
                { label: 'إجراءات', class: 'row-actions', render: function (r) {
                  return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removePeriod(r.p); } });
                } }
              ], rows: rows, empty: 'لا حصص في الجدول.'
            }) : UI.empty('لا حصص في الجدول اليومي — أضف حصة.', null)
          ])
        ]);
      }

      function addPeriod() {
        var maxIndex = periods().reduce(function (m, p) { return Math.max(m, p.index || 0); }, 0);
        UI.formModal({
          title: 'إضافة حصة',
          fields: [
            { name: 'start', label: 'وقت البداية', type: 'time', required: true, value: '07:00' },
            { name: 'end', label: 'وقت النهاية', type: 'time', required: true, value: '07:45' },
            { name: 'closeRule', label: 'قاعدة الإغلاق', type: 'select', required: true, options: [
              { value: 'mid', label: 'منتصف الحصة' }, { value: 'end', label: 'نهاية الحصة' }
            ], value: 'end' }
          ],
          submitLabel: 'إضافة',
          onSubmit: function (data) {
            if (data.start >= data.end) { UI.toast('وقت البداية يجب أن يسبق وقت النهاية', 'warn'); return false; }
            var idx = maxIndex + 1;
            S.insert('periods', { schoolId: schoolId, index: idx, start: data.start, end: data.end, closeRule: data.closeRule, label: 'الحصة ' + idx });
            UI.toast('أُضيفت الحصة', 'ok');
            draw();
          }
        });
      }

      function removePeriod(p) {
        UI.confirm('حذف «' + p.label + '» من الجدول اليومي؟ قد تتأثر تقارير تحضير سابقة تستخدم هذه الحصة.', { ok: 'حذف', danger: true }).then(function (ok) {
          if (!ok) return;
          S.remove('periods', p.id);
          UI.toast('حُذفت الحصة', 'ok');
          draw();
        });
      }

      /* ========================================== (2) تبويب رفع الجدول */
      function uploadPanel() {
        var wrap = h('div');
        var excelHost = h('div');
        var pdfHost = h('div');
        var assignHost = h('div');
        var ctl = {};
        ctl.renderExcel = function () { clear(excelHost); excelHost.appendChild(excelPanel(ctl)); };
        ctl.renderPdf = function () { clear(pdfHost); pdfHost.appendChild(pdfPanel(ctl)); };
        ctl.renderAssign = function () { clear(assignHost); assignHost.appendChild(assignPanel()); };
        ctl.renderExcel(); ctl.renderPdf(); ctl.renderAssign();
        wrap.appendChild(excelHost);
        wrap.appendChild(pdfHost);
        wrap.appendChild(assignHost);
        return wrap;
      }

      /* ------------------------------------ رفع Excel/CSV + مطابقة الأعمدة */
      function excelPanel(ctl) {
        var imp = state.imp;

        var tplBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تنزيل قالب الجدول', onClick: function () {
          UI.downloadCsv([
            { 'اليوم': 'الأحد', 'الحصة': '1', 'الفصل': 'الأول الثانوي / أ', 'المادة': 'الرياضيات', 'المعلم': 'أ. سعد بن إبراهيم المطيري' },
            { 'اليوم': 'الأحد', 'الحصة': '2', 'الفصل': 'الأول الثانوي / أ', 'المادة': 'الفيزياء', 'المعلم': 'أ. عبدالعزيز بن خالد الزهراني' },
            { 'اليوم': 'الاثنين', 'الحصة': '1', 'الفصل': 'الأول الثانوي / ب', 'المادة': 'الكيمياء', 'المعلم': 'أ. عبدالعزيز بن خالد الزهراني' },
            { 'اليوم': 'الثلاثاء', 'الحصة': '3', 'الفصل': 'الثاني الثانوي / أ', 'المادة': 'الأحياء', 'المعلم': 'أ. هند بنت فهد السبيعي' }
          ], 'قالب-جدول-الحصص.csv');
          UI.toast('بدأ تنزيل قالب الجدول', 'ok');
        } });

        var status = h('p', { class: 'muted', text: imp.rows.length
          ? 'الملف الحالي: ' + imp.fileName + ' · ' + imp.rows.length + ' صفًا · ' + imp.cols.length + ' عمودًا.'
          : 'اختر ملف Excel أو CSV؛ يجب أن يحمل الصف الأول عناوين الأعمدة: اليوم / الحصة / الفصل / المادة / المعلم.' });

        var fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
        var drop = h('label', { class: 'file-drop' }, [
          h('strong', { text: 'ملف جدول الحصص (Excel أو CSV)' }),
          h('span', { text: 'اسحب الملف هنا أو اضغط للاختيار — الصيغ المدعومة: xlsx / xls / csv' }),
          fileInput
        ]);

        var fDay = UI.field({ name: 'sDay', label: 'عمود اليوم', type: 'select', placeholder: '— اختر العمود —' });
        var fPeriod = UI.field({ name: 'sPeriod', label: 'عمود الحصة', type: 'select', placeholder: '— اختر العمود —' });
        var fClass = UI.field({ name: 'sClass', label: 'عمود الفصل', type: 'select', required: true, placeholder: '— اختر العمود —' });
        var fSubject = UI.field({ name: 'sSubject', label: 'عمود المادة', type: 'select', placeholder: '— اختر العمود —' });
        var fTeacher = UI.field({ name: 'sTeacher', label: 'عمود المعلم', type: 'select', required: true, placeholder: '— اختر العمود —' });
        var mapFields = [
          { key: 'day', f: fDay }, { key: 'period', f: fPeriod }, { key: 'cls', f: fClass },
          { key: 'subject', f: fSubject }, { key: 'teacher', f: fTeacher }
        ];
        var mapGrid = h('div', { class: 'form-grid mt-4' });
        var previewHost = h('div');

        function colList() { return (imp.cols || []).map(function (c) { return { value: c, label: c }; }); }
        function applyGuess() {
          mapFields.forEach(function (item) {
            setOptions(item.f.input, colList(), '— اختر العمود —');
            var has = Object.prototype.hasOwnProperty.call(imp.map, item.key);
            var v = has ? imp.map[item.key] : (imp.guess[item.key] || '');
            imp.map[item.key] = v;
            item.f.input.value = v;
          });
        }
        mapFields.forEach(function (item) {
          item.f.input.addEventListener('change', function () { imp.map[item.key] = item.f.input.value; ctl.renderAssign(); });
        });

        if (imp.rows.length) {
          mapFields.forEach(function (item) { mapGrid.appendChild(item.f.wrap); });
          applyGuess();
          previewHost.appendChild(h('h4', { style: { margin: '16px 0 8px', fontSize: 'var(--fs-sm)' }, text: 'معاينة أول ' + Math.min(8, imp.rows.length) + ' صفًا' }));
          previewHost.appendChild(h('div', { class: 'import-preview' }, [UI.table({
            cols: imp.cols.map(function (c) { return { label: c, key: c }; }),
            rows: imp.rows.slice(0, 8), empty: 'لا صفوف.'
          })]));
        }

        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          status.textContent = 'جارٍ قراءة الملف: ' + file.name + ' …';
          UI.readExcel(file).then(function (res) {
            var rows = (res.rows || []).filter(function (r) {
              return Object.keys(r).some(function (key) { return cell(r[key]) !== ''; });
            });
            if (!rows.length) { status.textContent = 'الملف لا يحتوي صفوفًا صالحة.'; UI.toast('لا صفوف صالحة في الملف', 'warn'); return; }
            var cols = Object.keys(rows[0]);
            imp.rows = rows; imp.cols = cols; imp.fileName = file.name; imp.map = {};
            imp.guess = {
              day: guessCol(cols, ['اليوم', 'يوم']),
              period: guessCol(cols, ['الحصة', 'حصة']),
              cls: guessCol(cols, ['الفصل', 'الشعبة', 'شعبة', 'فصل']),
              subject: guessCol(cols, ['المادة', 'مادة']),
              teacher: guessCol(cols, ['المعلم', 'معلم', 'الأستاذ', 'أستاذ', 'الاستاذ', 'استاذ'])
            };
            UI.toast('قُرئ الملف: ' + rows.length + ' صفًا', 'ok');
            ctl.renderExcel(); ctl.renderAssign();
          }).catch(function () {
            status.textContent = 'تعذّر قراءة الملف — تأكد من صيغته.';
            UI.toast('تعذّر قراءة الملف', 'err');
          });
        });

        return UI.panel('رفع جدول الحصص من Excel/CSV', 'يُربط كل صف تلقائيًا بالفصل والمادة والمعلم الموجودين، ثم يُسند رقم الحصة.', [tplBtn], [
          drop, h('div', { class: 'mt-4' }, [status]), mapGrid, previewHost
        ]);
      }

      /* ------------------------------------------------ منطقة الـ PDF المستقلة */
      function pdfPanel(ctl) {
        var pdf = state.pdf;
        var fileInput = h('input', { type: 'file', accept: '.pdf' });
        var drop = h('label', { class: 'file-drop' }, [
          h('strong', { text: 'ملف جدول الحصص (PDF)' }),
          h('span', { text: 'اسحب ملف PDF هنا أو اضغط للاختيار — يُقرأ نص الجدول ويكون قابلًا للتعديل' }),
          fileInput
        ]);
        var host = h('div');

        function errorBlock() {
          return h('div', { class: 'muted-block' }, [
            h('strong', { text: PDF_HELP }),
            h('span', { text: PDF_HELP_2 }),
            h('code', { text: 'python3 -m http.server' }),
            h('span', { text: PDF_HELP_3 })
          ]);
        }

        function inputFor(r, key, ph) {
          var inp = h('input', { class: 'input', type: 'text', value: r[key] || '', placeholder: ph, title: r.raw || '', style: { width: '100%' } });
          inp.addEventListener('input', function () { r[key] = inp.value; });
          return inp;
        }

        function editable(rows) {
          return UI.table({
            cols: [
              { label: 'اليوم', width: '110px', render: function (r) { return inputFor(r, 'day', 'اليوم'); } },
              { label: 'الحصة', width: '92px', render: function (r) { return inputFor(r, 'period', 'الحصة'); } },
              { label: 'الفصل', width: '170px', render: function (r) { return inputFor(r, 'className', 'الأول الثانوي / أ'); } },
              { label: 'المادة', width: '150px', render: function (r) { return inputFor(r, 'subject', 'المادة'); } },
              { label: 'المعلم', width: '200px', render: function (r) { return inputFor(r, 'teacherName', 'المعلم'); } },
              { label: 'إجراءات', class: 'row-actions', render: function (r) {
                return h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                  var i = pdf.rows.indexOf(r);
                  if (i > -1) pdf.rows.splice(i, 1);
                  UI.toast('حُذف الصف', 'ok');
                  body(); ctl.renderAssign();
                } });
              } }
            ], rows: rows, empty: 'لا صفوف.'
          });
        }

        function body() {
          clear(host);
          if (pdf.busy) { host.appendChild(h('p', { class: 'muted', text: 'جارٍ قراءة ملف الـ PDF واستخراج الأسطر النصية…' })); return; }
          if (pdf.error) { host.appendChild(errorBlock()); return; }
          if (!pdf.lines.length && !pdf.rows.length) { host.appendChild(h('div', { class: 'muted-block', text: 'لم يُرفع ملف PDF بعد.' })); return; }

          host.appendChild(h('p', { class: 'muted', text:
            'الملف: ' + pdf.name + ' · الصفحات: ' + pdf.pages + ' · الأسطر النصية المستخرجة: ' + pdf.lines.length + ' · الصفوف المرشّحة: ' + pdf.rows.length }));

          if (pdf.lines.length) {
            host.appendChild(h('div', { class: 'muted-block mt-4' }, [
              h('strong', { text: 'الأسطر النصية المستخرجة (' + pdf.lines.length + ')' }),
              h('div', { style: { marginTop: '6px', maxHeight: '180px', overflow: 'auto' } },
                pdf.lines.slice(0, 60).map(function (l, i) {
                  return h('div', { style: { fontSize: 'var(--fs-xs)' }, text: (i + 1) + '. ' + l });
                }))
            ]));
          }

          if (pdf.rows.length) {
            host.appendChild(h('h4', { style: { margin: '16px 0 8px', fontSize: 'var(--fs-sm)' }, text: 'جدول قابل للتعديل — راجع الصفوف وعدّل ما يلزم' }));
            host.appendChild(editable(pdf.rows));
          } else {
            host.appendChild(h('div', { class: 'muted-block mt-4', text: 'استُخرج نص من الملف لكن لم نتبيّن صفوف جدول واضحة — عدّل الأعمدة يدويًا أو استخدم ملف Excel/CSV.' }));
          }
        }

        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          pdf.name = file.name; pdf.busy = true; pdf.error = false; pdf.rows = []; pdf.lines = []; pdf.pages = 0;
          body();
          var fr = new FileReader();
          fr.onload = function () {
            loadPdfJs().then(function (lib) {
              return lib.getDocument({ data: fr.result }).promise;
            }).then(function (doc) {
              pdf.pages = doc.numPages;
              var allLines = [];
              var chain = Promise.resolve();
              for (var pg = 1; pg <= doc.numPages; pg++) {
                (function (n) {
                  chain = chain.then(function () { return doc.getPage(n); })
                    .then(function (page) { return page.getTextContent(); })
                    .then(function (tc) {
                      allLines = allLines.concat(groupLines((tc && tc.items) || []));
                    });
                })(pg);
              }
              return chain.then(function () { return allLines; });
            }).then(function (lines) {
              pdf.lines = lines;
              var ctx = { classes: classes(), teachers: teachers(), subjects: S.subjectsFor(S.stagesOf(schoolId)), maxPeriod: periods().length || 7 };
              pdf.rows = lines.map(function (l) { return extractRow(l, ctx); }).filter(Boolean);
              pdf.busy = false;
              if (!pdf.lines.length) {
                pdf.error = true;
                UI.toast('لم نستطع قراءة نص من الـ PDF', 'warn');
              } else {
                UI.toast('استُخرجت ' + pdf.lines.length + ' سطرًا · ' + pdf.rows.length + ' صفًا مرشّحًا', 'ok');
              }
              body(); ctl.renderAssign();
            }).catch(function () {
              pdf.busy = false; pdf.error = true; pdf.rows = []; pdf.lines = [];
              UI.toast('تعذّر قراءة نص الـ PDF', 'warn');
              body(); ctl.renderAssign();
            });
          };
          fr.onerror = function () {
            pdf.busy = false; pdf.error = true;
            UI.toast('تعذّر فتح ملف الـ PDF', 'warn');
            body(); ctl.renderAssign();
          };
          fr.readAsArrayBuffer(file);
        });

        body();
        return UI.panel('رفع جدول الحصص من PDF', 'منطقة مستقلة لملفات PDF — يُحمَّل محرّك القراءة مرة واحدة عند أول استخدام فقط.', null, [
          drop, h('div', { class: 'mt-4' }, [host])
        ]);
      }

      /* -------------------------- بناء الصفوف الموحّدة من مصادر الرفع */
      function buildRows() {
        var imp = state.imp, pdf = state.pdf, out = [];
        var map = imp.map || {};
        if (imp.rows.length) {
          var cD = map.day || imp.guess.day, cP = map.period || imp.guess.period, cC = map.cls || imp.guess.cls;
          var cS = map.subject || imp.guess.subject, cT = map.teacher || imp.guess.teacher;
          imp.rows.forEach(function (r) {
            var o = {
              day: cD ? cell(r[cD]) : '', period: cP ? toLatinDigits(cell(r[cP])) : '',
              className: cC ? cell(r[cC]) : '', subject: cS ? cell(r[cS]) : '', teacherName: cT ? cell(r[cT]) : '', src: 'ملف'
            };
            if (!o.className && !o.teacherName && !o.subject && !o.period) return;
            out.push(o);
          });
        }
        (pdf.rows || []).forEach(function (r) {
          var o = {
            day: cell(r.day), period: toLatinDigits(cell(r.period)), className: cell(r.className),
            subject: cell(r.subject), teacherName: cell(r.teacherName), src: 'PDF'
          };
          if (!o.className && !o.teacherName && !o.subject && !o.period) return;
          out.push(o);
        });
        return out;
      }

      /* ----------------------------------- إسناد الحصص + الملخّص والجداول */
      function assignPanel() {
        var rows = buildRows();
        var fromFile = rows.filter(function (r) { return r.src === 'ملف'; }).length;
        var fromPdf = rows.filter(function (r) { return r.src === 'PDF'; }).length;
        var res = state.result;

        var assignBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'إسناد الحصص للمعلمين', onClick: doAssign });
        var refreshBtn = h('button', { class: 'btn btn-outline', type: 'button', text: 'عرض الجدول الأسبوعي', onClick: function () {
          state.tab = 'weekly'; draw(); UI.toast('فُتح الجدول الأسبوعي بالبيانات المحدّثة', 'ok');
        } });

        var nodes = [
          h('p', { class: 'muted', text: rows.length
            ? 'جاهز للإسناد: ' + rows.length + ' صفًا (ملف: ' + fromFile + ' · PDF: ' + fromPdf + ').'
            : 'لا صفوف جاهزة — ارفع ملف Excel/CSV أو استخرج صفوفًا من PDF أولًا.' })
        ];

        if (res) {
          var sm = res.summary;
          var existing = Math.max(0, sm.assigned - sm.created);
          nodes.push(h('div', { class: 'cluster mt-4' }, [
            UI.badge('أُسند: ' + sm.assigned, 'mint'),
            UI.badge('إسنادات جديدة: ' + sm.created, 'brand'),
            UI.badge('على إسنادات موجودة: ' + existing, 'plain'),
            UI.badge('تُخطّي: ' + sm.skipped, sm.skipped ? 'amber' : 'plain'),
            UI.badge('إجمالي الصفوف: ' + sm.total, 'plain')
          ]));

          var un = [];
          [['فصل غير مطابق', res.unmatched.cls], ['معلم غير مطابق', res.unmatched.teacher],
           ['مادة غير مدرجة', res.unmatched.subject], ['حصة غير معروفة', res.unmatched.period]].forEach(function (pair) {
            pair[1].forEach(function (v) { un.push({ kind: pair[0], value: v }); });
          });
          nodes.push(h('h4', { style: { margin: '16px 0 8px', fontSize: 'var(--fs-sm)' }, text: 'ما لم تُطابقه' }));
          nodes.push(un.length ? UI.table({
            cols: [
              { label: 'النوع', render: function (u) { return UI.badge(u.kind, 'amber'); } },
              { label: 'القيمة في الملف', render: function (u) { return h('strong', { style: { fontWeight: '600' }, text: u.value }); } },
              { label: 'الإجراء', render: function () { return h('span', { class: 'muted', text: 'راجع الفصول/المعلمين/المواد أو صحّح قيمة الصف' }); } }
            ], rows: un, empty: 'لا شيء.'
          }) : h('div', { class: 'muted-block', text: 'طوبقت كل صفوف الرفع — لا فصول أو معلمون أو مواد غير مطابقة.' }));

          nodes.push(h('h4', { style: { margin: '16px 0 8px', fontSize: 'var(--fs-sm)' }, text: 'أُسند فعلًا' }));
          nodes.push(res.groups.length ? UI.table({
            cols: [
              { label: 'المعلم', render: function (g) { return h('strong', { style: { fontWeight: '600' }, text: g.teacher }); } },
              { label: 'الفصل', key: 'className' },
              { label: 'المادة', key: 'subject' },
              { label: 'الحصص', render: function (g) { return h('span', { class: 'nums', text: g.periods.join('، ') || '—' }); } },
              { label: 'عدد الحصص', render: function (g) { return h('span', { class: 'nums', text: String(g.periods.length) }); } }
            ], rows: res.groups, empty: 'لا نتائج.'
          }) : h('div', { class: 'muted-block', text: 'لم يُسند أي صف — راجع الجداول أعلاه.' }));
        }

        return UI.panel('إسناد الحصص للمعلمين',
          'يُربط كل صف تلقائيًا بالفصل والمادة والمعلم الموجودين، ويُسند رقم الحصة إلى إسنادهم.',
          [assignBtn, refreshBtn], nodes);
      }

      function doAssign() {
        var imp = state.imp;
        var map = imp.map || {}, guess = imp.guess || {};
        if (imp.rows.length && !(map.cls || guess.cls) ) {
          UI.toast('حدّد عمود الفصل لملف Excel/CSV أولًا', 'warn');
          return;
        }
        if (imp.rows.length && !(map.teacher || guess.teacher)) {
          UI.toast('حدّد عمود المعلم لملف Excel/CSV أولًا', 'warn');
          return;
        }
        var rows = buildRows();
        if (!rows.length) { UI.toast('لا صفوف للإسناد — ارفع ملفًا أو استخرج صفوفًا من PDF', 'warn'); return; }
        var summary = S.importSchedule(rows.map(function (r) {
          return { day: r.day, period: r.period, className: r.className, subject: r.subject, teacherName: r.teacherName };
        }));
        UI.toast('أُسند ' + summary.assigned + ' · أُنشئ ' + summary.created + ' · تُخطّي ' + summary.skipped, summary.assigned ? 'ok' : 'warn');
        var resolved = resolveRows(rows, schoolId);
        state.result = { summary: summary, groups: resolved.groups, unmatched: resolved.unmatched };
        draw();
        UI.toast('حُدّث الجدول الأسبوعي — افتح تبويب «الجدول الأسبوعي» لمراجعته', 'info');
      }

      /* ---------------------------------------------- الجدول الأسبوعي */
      function currentSource() {
        if (state.mode === 'teacher') {
          var u = S.user(state.selTeacher);
          return {
            label: u ? u.name : 'معلم',
            items: S.assignmentsOf(state.selTeacher).map(function (a) {
              var k = S.klass(a.classId) || {};
              return { subject: a.subject, sub: k.name || '—', periods: a.periods || [] };
            })
          };
        }
        var k2 = S.klass(state.selClass) || {};
        return {
          label: k2.name || 'فصل',
          items: S.list('assignments', { classId: state.selClass }).map(function (a) {
            return { subject: a.subject, sub: teacherName(a.teacherId), periods: a.periods || [] };
          })
        };
      }

      function buildGrid(items) {
        var ps = periods();
        var grid = ps.map(function () { var r = []; for (var d = 0; d < DAYS.length; d++) r.push(null); return r; });
        var pos = {}; ps.forEach(function (p, i) { pos[p.index] = i; });
        if (!ps.length) return { ps: ps, grid: grid };
        var cursor = 0;
        items.forEach(function (it) {
          (it.periods || []).forEach(function (pnum) {
            var row = pos[pnum] != null ? pos[pnum] : (pnum - 1);
            if (row < 0 || row >= ps.length) row = 0;
            var placed = false;
            for (var d = 0; d < DAYS.length && !placed; d++) {
              var dd = (cursor + d) % DAYS.length;
              if (!grid[row][dd]) { grid[row][dd] = it; placed = true; }
            }
            if (!placed) {
              for (var r = 0; r < ps.length && !placed; r++) {
                for (var d2 = 0; d2 < DAYS.length && !placed; d2++) {
                  if (!grid[r][d2]) { grid[r][d2] = it; placed = true; }
                }
              }
            }
            cursor++;
          });
        });
        return { ps: ps, grid: grid };
      }

      function weeklyPanel() {
        var cls = classes();
        var ts = teachers();
        if (!S.klass(state.selClass)) state.selClass = cls.length ? cls[0].id : null;
        if (!S.user(state.selTeacher)) state.selTeacher = ts.length ? ts[0].id : null;

        var toggles = h('div', { class: 'cluster' }, [
          h('button', { class: 'filter-btn', type: 'button', 'aria-pressed': state.mode === 'class' ? 'true' : 'false', text: 'جدول الفصل', onClick: function () { state.mode = 'class'; draw(); } }),
          h('button', { class: 'filter-btn', type: 'button', 'aria-pressed': state.mode === 'teacher' ? 'true' : 'false', text: 'جدول المعلم', onClick: function () { state.mode = 'teacher'; draw(); } })
        ]);

        var controls;
        if (state.mode === 'class') {
          var cSel = UI.field({
            name: 'wclass', label: 'الفصل', type: 'select', value: state.selClass || '', placeholder: cls.length ? 'اختر الفصل' : 'لا فصول بعد',
            options: cls.map(function (k) { return { value: k.id, label: k.name + ' — ' + S.stageName(k.stage) }; })
          });
          cSel.input.addEventListener('change', function () { state.selClass = cSel.input.value; renderMatrix(); });
          controls = h('div', { class: 'form-grid' }, [cSel.wrap]);
        } else {
          var tSel = UI.field({
            name: 'wteacher', label: 'المعلم', type: 'select', value: state.selTeacher || '', placeholder: ts.length ? 'اختر المعلم' : 'لا معلمون بعد',
            options: ts.map(function (u) { return { value: u.id, label: u.name }; })
          });
          tSel.input.addEventListener('change', function () { state.selTeacher = tSel.input.value; renderMatrix(); });
          controls = h('div', { class: 'form-grid' }, [tSel.wrap]);
        }

        var host = h('div');
        var hint = h('p', { class: 'muted' });

        function renderMatrix() {
          clear(host);
          var src = currentSource();
          hint.textContent = 'العرض الحالي: ' + (state.mode === 'class' ? 'الفصل ' + src.label : 'المعلم ' + src.label) + ' · ' + src.items.length + ' إسنادًا.';
          if (!src.items.length) {
            host.appendChild(UI.empty('لا توجد إسنادات لهذا ' + (state.mode === 'class' ? 'الفصل' : 'المعلم') + ' بعد — أنشئها من وحدة «الإسناد» أو ارفع الجدول من تبويب «رفع الجدول».', null));
            return;
          }
          var g = buildGrid(src.items);
          var cols = [{
            label: 'الحصة', render: function (row) {
              return h('div', {}, [
                h('strong', { text: row.p.label }),
                h('span', { class: 'muted', style: { display: 'block', fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }, text: row.p.start + ' — ' + row.p.end })
              ]);
            }
          }];
          DAYS.forEach(function (day, di) {
            cols.push({ label: day, render: function (row) {
              var it = g.grid[row.i][di];
              if (!it) return h('span', { class: 'muted', text: '—' });
              return h('div', { style: { borderInlineStart: '4px solid ' + colorFor(it.subject), paddingInlineStart: '8px' } }, [
                h('strong', { style: { fontWeight: '600', display: 'block' }, text: it.subject }),
                h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: it.sub })
              ]);
            } });
          });
          host.appendChild(UI.table({ cols: cols, rows: g.ps.map(function (p, i) { return { p: p, i: i }; }), empty: 'لا حصص في الجدول.' }));
        }

        var panel = UI.panel('الجدول الأسبوعي', 'مصفوفة الأيام (الأحد–الخميس) × الحصص بحسب إسنادات الفصل أو المعلم، مع شريط لوني لكل مادة.', [
          UI.reportButton(function () { return scheduleReport(); }, { label: 'طباعة الجدول', class: 'btn-soft' })
        ], [
          toggles,
          h('div', { class: 'mt-4' }, [controls]),
          hint,
          h('div', { class: 'mt-4' }, [host])
        ]);
        renderMatrix();
        return panel;
      }

      /* --------------------------------------------------- تقرير الجدول */
      function scheduleReport() {
        var src = currentSource();
        var g = buildGrid(src.items);
        var ps = periods();
        var rep = S.registerReport('sch', '', { title: 'الجدول الأسبوعي — ' + src.label });
        return {
          type: 'sch', refId: '', code: rep.code,
          title: 'الجدول الأسبوعي',
          subtitle: (state.mode === 'class' ? 'الفصل: ' : 'المعلم: ') + src.label,
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'نوع العرض', value: state.mode === 'class' ? 'جدول الفصل' : 'جدول المعلم' },
            { label: 'عدد الإسنادات', value: String(src.items.length) }
          ],
          sections: [
            {
              heading: 'مصفوفة الأسبوع (الأحد–الخميس)',
              table: {
                cols: ['الحصة'].concat(DAYS),
                rows: ps.map(function (p, i) {
                  return [p.label].concat(DAYS.map(function (_, di) {
                    var it = g.grid[i][di];
                    return it ? (it.subject + ' — ' + it.sub) : '—';
                  }));
                })
              }
            },
            {
              heading: 'الحصص اليومية وقاعدة الإغلاق',
              table: {
                cols: ['الحصة', 'وقت البداية', 'وقت النهاية', 'قاعدة الإغلاق'],
                rows: ps.map(function (p) { return [p.label, p.start, p.end, ruleLabel(p.closeRule)]; })
              }
            }
          ]
        };
      }

      draw();
    }
  });
})();
