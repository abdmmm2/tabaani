/* ==========================================================================
   كشوف الدرجات والمشاركات — إدخال يدوي · صوتي · صورة
   --------------------------------------------------------------------------
   المعلم يختار الطريقة:
     ١) يدوي  : جدول الطلاب ويُكتب الرقم في الخانة.
     ٢) صوتي  : «محمد عبدالله النفيعي، ثلاث درجات، مشاركة» → تُضاف للعمود المطلوب.
     ٣) صورة  : اطبع كشفًا فارغًا من الموقع، اكتب فيه، وارفع صورته → تظهر كبيرة
                بجانب الحقول ليقرأها المعلم/البوت بسرعة (بلا نجاح كاذب في القراءة).
   ثم: معاينة ← حفظ ← طباعة / تصدير PDF.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* ------------------------------ محلّل الكلام العربي ------------------------------ */
  var WORD_NUM = {
    'صفر': 0, 'واحد': 1, 'واحده': 1, 'درجه': 1, 'درجهواحده': 1, 'اثنان': 2, 'اثنين': 2, 'درجتان': 2, 'درجتين': 2,
    'ثلاث': 3, 'ثلاثه': 3, 'ثلاثة': 3, 'اربع': 4, 'اربعه': 4, 'أربع': 4, 'أربعة': 4, 'خمس': 5, 'خمسه': 5, 'خمسة': 5,
    'ست': 6, 'سته': 6, 'ستة': 6, 'سبع': 7, 'سبعه': 7, 'سبعة': 7, 'ثمان': 8, 'ثمانيه': 8, 'ثمانية': 8, 'تسع': 9, 'تسعه': 9, 'تسعة': 9,
    'عشر': 10, 'عشره': 10, 'عشرة': 10, 'خمسطعشر': 15, 'عشرين': 20
  };
  function normAr(t) {
    return String(t || '')
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[،,:؛]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** يُحلّل جملة صوتية إلى {name, value, column} */
  function parseVoice(text) {
    var t = normAr(text);
    var out = { raw: text, name: '', value: null, column: null, words: null };
    /* العمود (مشاركة/واجب/اختبار/تسميع/سلوك/مشروع/مهام) */
    var COLS = S.GRADE_COLUMNS;
    for (var i = 0; i < COLS.length; i++) {
      var c = COLS[i], k = normAr(c.label), sh = normAr(c.short);
      if (t.indexOf(k) > -1 || (sh && t.indexOf(sh) > -1)) { out.column = c.id; t = t.replace(k, ' ').replace(sh, ' '); break; }
    }
    /* درجة / درجات (كلمة عامة) — بلا \b لأن حدود الكلمة في JS لا تعرف العربية */
    t = t.replace(/درجات?|نقاط?|علامه?|علامة?/g, ' ');
    /* الرقم: أرقام أو كلمات */
    var numMatch = t.match(/(\d+(?:[.,]\d+)?)/);
    if (numMatch) { out.value = parseFloat(String(numMatch[1]).replace(',', '.')); t = t.replace(numMatch[0], ' '); }
    else {
      var words = t.split(' ').filter(Boolean), found = null;
      for (var w = 0; w < words.length; w++) {
        var key = words[w].replace(/^و/, '');
        if (WORD_NUM[key] !== undefined) { found = { idx: w, val: WORD_NUM[key] }; break; }
        /* درجتان/درجتين/ثلاث درجات مكتوبة ملتصقة */
        var m = key.match(/^(درجتان|درجتين|درجتان|درجتان)$/);
        if (m) { found = { idx: w, val: 2 }; break; }
      }
      if (found) { out.value = found.val; out.words = words[found.idx]; t = words.filter(function (x, idx) { return idx !== found.idx; }).join(' '); }
    }
    out.name = t.replace(/\s+/g, ' ').trim();
    return out;
  }

  /** الإدخال الصوتي: يطابق الاسم مع طلاب الفصول المتاحة */
  function voiceMatch(text, classIds) {
    var p = parseVoice(text);
    var hit = p.name ? S.findStudentByName(p.name, classIds) : null;
    p.student = hit ? hit.student : null;
    p.score = hit ? hit.score : 0;
    p.confident = !!(hit && hit.confident && p.value !== null);
    if (p.value === null) p.hint = 'لم أسمع الرقم — قل مثلًا: «محمد عبدالله النفيعي، ثلاث درجات، مشاركة».';
    else if (!p.student) p.hint = 'لم أتعرّف على الطالب «' + p.name + '» — تأكّد أنه في فصلك.';
    else if (!p.confident) p.hint = 'الاسم قريب من «' + p.student.name + '» — راجعه قبل الإضافة.';
    return p;
  }

  App.grades = { parseVoice: parseVoice, voiceMatch: voiceMatch, normAr: normAr };

  /** كشف ورقي فارغ للطباعة (لطريقة الصورة) */
  function blankSheet(spec) {
    var rows = (spec.students || []).map(function (st, i) {
      return ((i + 1) + '. ' + st.name + '||' + (st.seat || (i + 1)) + '||');
    });
    return {
      title: 'كشف ' + (spec.columnLabel || 'درجات') + ' — ' + (spec.className || '') + (spec.subject ? ' · ' + spec.subject : ''),
      by: '', stamp: false,
      meta: [{ label: 'المدرسة', value: spec.schoolName || '—' }, { label: 'الفصل', value: spec.className || '—' },
        { label: 'المادة', value: spec.subject || '—' }, { label: 'التاريخ', value: new Date().toLocaleDateString('ar-SA-u-ca-gregory') },
        { label: 'المعلم', value: spec.teacherName || '—' }],
      sections: [{ heading: 'اكتب الدرجات في العمود الأخير (اقرأها بالجوال ثم ارفع الصورة)',
        table: { cols: ['#', 'اسم الطالب', 'المقعد', spec.columnLabel || 'الدرجة'], rows: rows } }],
      signatures: ['توقيع المعلم: ..............................']
    };
  }

  App.register({
    id: 'grades',
    label: 'كشوف الدرجات',
    icon: '&#128203;',
    roles: ['teacher', 'principal', 'deputy', 'super'],
    render: function (view) {
      var me = S.session || {};
      var sc = S.searchScope();
      /* الفصول المتاحة */
      var myClasses;
      if (sc.kind === 'self') myClasses = S.teacherClassIds(me.userId).map(function (id) { return S.klass(id); }).filter(Boolean);
      else if (sc.kind === 'school') myClasses = S.list('classes', { schoolId: sc.schoolId });
      else myClasses = S.list('classes');
      if (!myClasses.length) { view.appendChild(UI.empty('لا فصول متاحة لك بعد.')); return; }

      var state = { classId: myClasses[0].id, subject: '', column: 'participation', rows: {}, how: 'يدوي', photo: null, lastSheet: null };

      function curClass() { return S.klass(state.classId) || myClasses[0]; }
      function students() { return S.studentsOf(state.classId); }

      var host = h('div', { class: 'stack' });
      var entrySlot = h('div');
      var previewSlot = h('div');
      var voiceSlot = h('div', { class: 'stack' });

      /* ------------------------------- إعدادات الكشف ------------------------------- */
      var clsF = UI.field({ name: 'cls', label: 'الفصل', type: 'select', half: true, value: state.classId,
        options: myClasses.map(function (k) { return { value: k.id, label: (k.grade || '') + ' / ' + (k.section || '') + (k.room ? ' — قاعة ' + k.room : '') }; }) });
      var colF = UI.field({ name: 'col', label: 'العمود (نوع الدرجة)', type: 'select', half: true, value: state.column,
        options: S.GRADE_COLUMNS.map(function (c) { return { value: c.id, label: c.label }; }) });
      var subjF = UI.field({ name: 'subj', label: 'المادة (اختياري)', half: true, value: state.subject });
      var cs = clsF.input, colSel = colF.input, subj = subjF.input;
      cs.addEventListener('change', function () { state.classId = cs.value; state.rows = {}; state.photo = null; drawEntry(); drawPreview(); });
      colSel.addEventListener('change', function () { state.column = colSel.value; drawEntry(); drawPreview(); });
      subj.addEventListener('change', function () { state.subject = subj.value; });

      host.appendChild(UI.panel('إعداد الكشف', 'اختر الفصل والعمود (نوع الدرجة) والمادة.', [
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🖨️ اطبع كشفًا فارغًا (لطريقة الصورة)', onClick: function () {
          UI.printPlatformDoc(blankSheet({
            students: students(), className: (curClass().grade || '') + ' / ' + (curClass().section || ''),
            subject: state.subject, columnLabel: S.gradeColumn(state.column).label,
            schoolName: (S.school(curClass().schoolId) || {}).name, teacherName: me.name
          }));
        } })
      ], [h('div', { class: 'form-grid' }, [clsF.wrap, colF.wrap, subjF.wrap])]));

      /* ------------------------------- جدول الإدخال ------------------------------- */
      function entryTable() {
        var rows = students();
        if (!rows.length) return UI.empty('لا طلاب في هذا الفصل.');
        return UI.table({
          cols: [
            { label: '#', render: function (st, i) { return String(i + 1); } },
            { label: 'الطالب', key: 'name' },
            { label: 'المقعد', render: function (st) { return String(st.seat || '—'); } },
            { label: 'سابق', render: function (st) { return String(S.studentPoints(st.id, state.column) || 0); } },
            { label: S.gradeColumn(state.column).label + ' (الجديد)', render: function (st) {
              var inp = h('input', { class: 'input tg-in', type: 'number', step: '0.5', style: { maxWidth: '110px' } });
              inp.value = state.rows[st.id] === undefined ? '' : state.rows[st.id];
              inp.addEventListener('input', function () {
                if (inp.value === '') delete state.rows[st.id];
                else state.rows[st.id] = Number(inp.value);
                state.how = 'يدوي';
                drawPreview();
              });
              return inp;
            } },
            { label: 'الحالة', render: function (st) {
              var v = state.rows[st.id];
              return v === undefined ? h('span', { class: 'muted', text: '—' }) : h('span', { class: 'chip chip-ok', text: '+ ' + v });
            } }
          ], rows: rows, empty: 'لا طلاب.'
        });
      }
      function drawEntry() {
        clear(entrySlot);
        entrySlot.appendChild(UI.panel('إدخال يدوي', 'اكتب الدرجة أمام كل طالب — أو استخدم الصوت/الصورة بالأسفل.', null, [entryTable()]));
      }

      /* ------------------------------- المعاينة + الحفظ + الطباعة ------------------------------- */
      function collect() {
        return Object.keys(state.rows).map(function (sid) {
          var st = S.student(sid) || {};
          return { studentId: sid, name: st.name, value: state.rows[sid], before: S.studentPoints(sid, state.column) };
        });
      }
      function drawPreview() {
        clear(previewSlot);
        var rows = collect();
        var col = S.gradeColumn(state.column);
        previewSlot.appendChild(UI.panel('المعاينة قبل الحفظ', rows.length + ' طالبًا · العمود: ' + col.label + (state.subject ? ' · ' + state.subject : '') + ' · الطريقة: ' + state.how, [
          h('button', { class: 'btn btn-primary', type: 'button', text: '💾 حفظ الدرجات', onClick: function () {
            if (!rows.length) { UI.toast('لا درجات لإدخالها', 'warn'); return; }
            var r = S.saveGradeSheet({ classId: state.classId, subject: state.subject, column: state.column, how: state.how, rows: rows });
            if (!r.ok) { UI.toast(r.error, 'bad'); return; }
            state.lastSheet = r.sheet; state.rows = {};
            UI.toast('حُفظ الكشف ✓ — يمكنك طباعته الآن', 'ok');
            drawEntry(); drawPreview();
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🖨️ طباعة / تصدير PDF', onClick: function () {
            var sheet = state.lastSheet || { classId: state.classId, subject: state.subject, column: state.column, rows: rows, at: new Date().toISOString(), columnLabel: col.label };
            printSheet(sheet, true);
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🧹 إفراغ الخانات', onClick: function () { state.rows = {}; drawEntry(); drawPreview(); } })
        ], [rows.length ? UI.table({ cols: [
          { label: 'الطالب', key: 'name' }, { label: 'سابق', render: function (r) { return String(r.before || 0); } },
          { label: 'الجديد', render: function (r) { return '+ ' + r.value; } },
          { label: 'المجموع', render: function (r) { return String((Number(r.before) || 0) + Number(r.value)); } }
        ], rows: rows }) : h('p', { class: 'muted', text: 'لم تُدخل أي درجة بعد.' })]));
      }

      function printSheet(sheet, withValues) {
        var k = curClass();
        S.gradeColumn(sheet.column);
        var colLabel = sheet.columnLabel || S.gradeColumn(sheet.column).label;
        var map = {};
        (sheet.rows || []).forEach(function (r) { map[r.studentId] = r; });
        var studentsList = students();
        var rows = studentsList.map(function (st, i) {
          var r = map[st.id];
          return String(i + 1) + '. ' + st.name;
        }).map(function (label, i) {
          var st = studentsList[i], r = map[st.id];
          return label + '||' + (st.seat || '') + '||' + (withValues && r ? String(r.value) : '');
        });
        UI.printPlatformDoc({
          title: 'كشف ' + colLabel + ' — ' + (k.grade || '') + ' / ' + (k.section || '') + (sheet.subject ? ' · ' + sheet.subject : ''),
          stamp: false, by: '',
          meta: [
            { label: 'المدرسة', value: (S.school(k.schoolId) || {}).name || '—' },
            { label: 'الفصل', value: (k.grade || '') + ' / ' + (k.section || '') },
            { label: 'المادة', value: sheet.subject || '—' },
            { label: 'العمود', value: colLabel },
            { label: 'المعلم', value: sheet.byName || me.name },
            { label: 'التاريخ', value: UI.dateLabel ? UI.dateLabel(new Date().toISOString().slice(0, 10)) : new Date().toLocaleDateString('ar-SA') }
          ],
          sections: [{ heading: 'الدرجات', table: { cols: ['#', 'اسم الطالب', 'المقعد', colLabel], rows: rows } }],
          signatures: ['توقيع المعلم: ' + (sheet.byName || me.name) + '  —  .............................']
        });
      }

      /* ------------------------------- الإدخال الصوتي ------------------------------- */
      function drawVoice() {
        clear(voiceSlot);
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var log = h('div', { class: 'stack' });
        var pending = [];
        var box = h('textarea', { class: 'input', rows: '3', placeholder: 'مثال: محمد عبدالله النفيعي ثلاث درجات مشاركة' });
        var micBtn = h('button', { class: 'btn btn-primary', type: 'button', text: '🎙️ ابدأ الإملاء الصوتي' });

        function addFromText(txt) {
          var m = App.grades.voiceMatch(txt, myClasses.map(function (k) { return k.id; }));
          if (m.column && !state.rows[m.studentId]) { /* العمود تُحدّده الجملة */ }
          var col = m.column ? S.gradeColumn(m.column) : S.gradeColumn(state.column);
          var card = h('div', { class: 'callout ' + (m.student && m.value !== null ? (m.confident ? 'ok' : 'warn') : 'warn') }, [
            h('div', { html: '<b>' + (m.student ? m.student.name : 'لم أتعرّف على الطالب') + '</b> — ' + (m.value === null ? '؟' : m.value) + ' · العمود: ' + col.label }),
            h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: '«' + txt + '»' + (m.hint ? ' — ' + m.hint : '') }),
            h('div', { class: 'cluster', style: { marginTop: '6px' } }, [
              (m.student && m.value !== null) ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'أضف ✓', onClick: function () {
                state.rows[m.student.id] = (state.rows[m.student.id] || 0) + m.value;
                state.column = col.id; state.how = 'صوتي';
                colSel.value = col.id;
                if (m.student.classId !== state.classId) { state.classId = m.student.classId; cs.value = m.student.classId; }
                UI.toast('أُضيفت ' + m.value + ' لـ' + m.student.name, 'ok');
                drawEntry(); drawPreview(); micBtn.textContent = '🎙️ ابدأ الإملاء الصوتي';
              } }) : null,
              m.student ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'ليس هو', onClick: function () {
                var alt = S.list('students', { classId: m.student.classId });
                var pick = window.prompt('اختر الطالب (اكتب جزءًا من الاسم):\n' + alt.slice(0, 40).map(function (x) { return x.name; }).join(' · '));
                if (!pick) return;
                var hit = S.findStudentByName(pick, myClasses.map(function (k) { return k.id; }));
                if (hit) { state.rows[hit.student.id] = (state.rows[hit.student.id] || 0) + (m.value || 0); state.column = col.id; state.how = 'صوتي'; colSel.value = col.id; drawEntry(); drawPreview(); UI.toast('أُضيف لـ' + hit.student.name, 'ok'); }
                else UI.toast('لم أجد الطالب', 'warn');
              } }) : null
            ])
          ]);
          log.insertBefore(card, log.firstChild);
        }

        function manual() {
          if (!box.value.trim()) return;
          box.value.split('\n').filter(function (x) { return x.trim(); }).forEach(addFromText);
          box.value = '';
        }

        micBtn.addEventListener('click', function () {
          if (!SR) { UI.toast('المتصفح لا يدعم الإملاء الصوتي — استخدم الإدخال اليدوي أو الصورة', 'warn'); return; }
          var rec = new SR();
          rec.lang = 'ar-SA'; rec.continuous = false; rec.interimResults = true;
          var started = false;
          micBtn.textContent = '⏹️ أتكلّم الآن… (اضغط للإيقاف)';
          rec.onresult = function (e) {
            var txt = '';
            for (var i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
            box.value = txt;
            if (e.results[e.results.length - 1].isFinal) { started = true; addFromText(txt); box.value = ''; }
          };
          rec.onerror = function (e) {
            micBtn.textContent = '🎙️ ابدأ الإملاء الصوتي';
            UI.toast('تعذّر الإملاء: ' + ((e && e.error) || '') + ' — تأكّد من إذن الميكروفون', 'warn');
          };
          rec.onend = function () { micBtn.textContent = '🎙️ ابدأ الإملاء الصوتي'; if (!started && box.value.trim()) manual(); };
          try { rec.start(); } catch (e) { micBtn.textContent = '🎙️ ابدأ الإملاء الصوتي'; }
          micBtn.addEventListener('dblclick', function () { try { rec.stop(); } catch (e) {} });
        });

        voiceSlot.appendChild(UI.panel('إدخال صوتي', 'قل: «محمد عبدالله النفيعي، ثلاث درجات، مشاركة» — وسيُقترح الطالب والعمود للتأكيد.', [
          micBtn,
          h('button', { class: 'btn btn-outline', type: 'button', text: '✍️ أضف المكتوب', onClick: manual })
        ], [
          h('div', { class: 'callout info', text: 'يعمل الصوت في Chrome (آندرويد/كمبيوتر) وSafari (آيفون/آيباد iOS 14.5+). وإن لم يعمل، اكتب الجملة في الصندوق وأضفها.' }),
          box, log
        ]));
        void pending;
      }

      /* ------------------------------- الصورة ------------------------------- */
      function drawPhoto() {
        var file = h('input', { class: 'input', type: 'file', accept: 'image/*' });
        var prev = h('div');
        file.addEventListener('change', function () {
          var f = file.files && file.files[0];
          if (!f) return;
          UI.compressImage(f, { max: 1400, quality: 0.7 }).then(function (img) {
            state.photo = img;
            clear(prev);
            prev.appendChild(h('div', { class: 'stack' }, [
              h('img', { src: img.dataUrl, alt: 'صورة الكشف', style: { width: '100%', maxWidth: '720px', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' } }),
              h('div', { class: 'muted', text: 'الصورة محفوظة مع الكشف (بحجم ' + Math.round((img.kb || 0)) + ' ك.ب) — اقرأ منها وأكمل بالصوت أو اليد.' })
            ]));
            state.how = state.how === 'يدوي' ? 'صورة' : state.how;
          }, function () { UI.toast('تعذّر قراءة الصورة', 'bad'); });
        });
        var photoSlot = h('div', { class: 'stack' }, [
          h('div', { class: 'callout info', text: 'الطريقة: «اطبع كشفًا فارغًا» من أعلى الصفحة → اكتب الدرجات بخط واضح → صوّره بالجوال → ارفعه هنا → تظهر الصورة كبيرة وتُكمل الإدخال بالصوت/اليد، ثم معاينة ← حفظ.' }),
          file, prev
        ]);
        return photoSlot;
      }

      /* ------------------------------- الطرق الثلاث ------------------------------- */
      host.appendChild(UI.panel('طريقة الإدخال', 'اختر ما يناسبك — النتيجة واحدة: معاينة ← حفظ ← طباعة.', null, [
        h('div', { class: 'cluster' }, [
          h('button', { class: 'btn btn-outline', type: 'button', text: '✍️ إدخال يدوي', onClick: function () { document.getElementById('grades-manual').scrollIntoView({ behavior: 'smooth' }); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🎙️ إدخال صوتي', onClick: function () { document.getElementById('grades-voice').scrollIntoView({ behavior: 'smooth' }); } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '🖼️ إرفاق صورة', onClick: function () { document.getElementById('grades-photo').scrollIntoView({ behavior: 'smooth' }); } })
        ])
      ]));

      entrySlot.id = 'grades-manual';
      voiceSlot.id = 'grades-voice';
      host.appendChild(entrySlot);
      var photoPanel = h('div', { id: 'grades-photo' }, [drawPhoto()]);
      host.appendChild(photoPanel);
      host.appendChild(voiceSlot);
      host.appendChild(UI.panel('معاينة وحفظ وطباعة', 'يُحفظ الكشف باسم مدرستك — ويُطبع أو يُصدَّر PDF بضغطة.', null, [h('div', { class: 'muted', text: 'الحفظ لا يتم إلا بعد مراجعتك للمعاينة ✓' })]));
      host.appendChild(previewSlot);

      /* آخر الكشوف */
      var last = S.gradeSheets({ classId: state.classId });
      host.appendChild(UI.panel('آخر كشوفك', last.length + ' كشفًا', null, [
        UI.table({ cols: [
          { label: 'التاريخ', render: function (g) { return UI.fmtDateTime(g.at); } },
          { label: 'العمود', render: function (g) { return g.columnLabel || S.gradeColumn(g.column).label; } },
          { label: 'المادة', render: function (g) { return g.subject || '—'; } },
          { label: 'عدد الطلاب', render: function (g) { return String((g.rows || []).length); } },
          { label: 'الطريقة', render: function (g) { return g.how || 'يدوي'; } },
          { label: 'إجراء', render: function (g) { return h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'طباعة', onClick: function () { state.lastSheet = g; state.classId = g.classId; cs.value = g.classId; printSheet(g, true); } }); } }
        ], rows: last.slice(0, 10), empty: 'لا كشوف محفوظة بعد.' })
      ]));

      drawEntry(); drawVoice(); drawPreview();
      view.appendChild(host);
    }
  });
})();
