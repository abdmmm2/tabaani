/* =============================================================================
   letterhead.js — ترويسة التقارير الرسمية (مدير المدرسة)
   يضبط: البسملة · المملكة العربية السعودية · وزارة التعليم · إدارة التعليم (قائمة
   منسدلة) · اسم المدرسة · شعار الوزارة وشعار المدرسة · ملاحظة التذييل.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  App.register({
    id: 'letterhead',
    label: 'ترويسة التقارير',
    icon: '&#128196;',
    roles: ['principal'],
    render: function (view) {
      var lh = S.letterhead();

      /* --------------------------------- المعاينة --------------------------------- */
      function preview() {
        var l = S.letterhead();
        return h('div', { class: 'lh-preview' }, [
          h('div', { class: 'lh-head' }, [
            l.showBasmala !== false ? h('div', { class: 'lh-basmala', text: l.basmala }) : null,
            h('div', { class: 'lh-country', text: l.country }),
            h('div', { class: 'lh-ministry', text: l.ministry }),
            l.educationDept ? h('div', { class: 'lh-dept', text: l.educationDept }) : null,
            h('div', { class: 'lh-school', text: l.schoolLine || (S.school().name) })
          ]),
          h('div', { class: 'lh-row' }, [
            h('div', { class: 'lh-center' }, [
              l.showMinistryLogo !== false ? h('img', { class: 'lh-logo-m', src: l.ministryLogo || 'assets/img/ministry-logo.png', alt: 'شعار وزارة التعليم' }) : null
            ]),
            h('div', { class: 'lh-side' }, [
              (l.showSchoolLogo !== false && (l.schoolLogo || (l._school && l._school.logo)))
                ? h('img', { class: 'lh-logo-s', src: l.schoolLogo || (l._school && l._school.logo), alt: 'شعار المدرسة' })
                : null,
              h('div', { class: 'lh-issue' }, [
                h('span', {}, [h('span', { text: 'تاريخ الإصدار: ' }), h('strong', { text: UI.dateLabel(new Date()) })]),
                h('span', { class: 'lh-code' }, [h('span', { text: 'رقم التقرير: ' }), h('code', { text: 'TBN-XXX-00001-20261013' })]),
                h('div', { class: 'lh-qr', html: UI.qrSvg('TBN-XXX-00001-20261013', 2, 0) })
              ])
            ])
          ]),
          h('h1', { class: 'lh-title', text: 'اسم التقرير يظهر هنا بخط كبير' }),
          h('div', { class: 'lh-sub', text: 'الفصل / المادة / الفترة — سطر توضيحي' }),
          h('div', { class: 'lh-preview-foot' }, [
            h('span', {}, [h('span', { text: 'معد التقرير: ' }), h('strong', { text: S.session.name })]),
            h('span', {}, [h('span', { text: 'التاريخ: ' }), h('strong', { text: UI.dateLabel(new Date()) })]),
            h('span', {}, [h('span', { text: 'الوقت: ' }), h('strong', { text: UI.fmtTime(new Date()) })]),
            h('span', { class: 'muted', text: 'التوقيعات: المعلم · وكيل شؤون الطلاب · مدير المدرسة' })
          ])
        ]);
      }

      /* --------------------------------- الحقول --------------------------------- */
      var f = {
        basmala: UI.field({ name: 'basmala', label: 'البسملة (في المنتصف)', half: true, value: lh.basmala }),
        country: UI.field({ name: 'country', label: 'الدولة (في المنتصف)', half: true, value: lh.country }),
        ministry: UI.field({ name: 'ministry', label: 'الجهة (في المنتصف)', half: true, value: lh.ministry }),
        dept: UI.field({
          name: 'educationDept', label: 'إدارة التعليم (قائمة منسدلة)', type: 'select', half: true, required: true,
          options: S.educationDepts().map(function (d) { return { value: d, label: d }; }), value: lh.educationDept
        }),
        schoolLine: UI.field({ name: 'schoolLine', label: 'اسم المدرسة في الترويسة', half: true, value: lh.schoolLine, help: 'افتراضيًا اسم المدرسة المسجّل' }),
        footerNote: UI.field({ name: 'footerNote', label: 'ملاحظة أسفل التقرير', type: 'textarea', rows: 2, value: lh.footerNote })
      };
      var toggles = {
        showBasmala: h('label', { class: 'checkline' }, [h('input', { type: 'checkbox', checked: lh.showBasmala !== false }), h('span', { text: 'إظهار البسملة' })]),
        showMinistryLogo: h('label', { class: 'checkline' }, [h('input', { type: 'checkbox', checked: lh.showMinistryLogo !== false }), h('span', { text: 'إظهار شعار وزارة التعليم (منتصف الصفحة)' })]),
        showSchoolLogo: h('label', { class: 'checkline' }, [h('input', { type: 'checkbox', checked: lh.showSchoolLogo !== false }), h('span', { text: 'إظهار شعار المدرسة (اختياري — يسار الصفحة)' })])
      };

      function logoField(which, label) {
        var input = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (ev) {
            var patch = {}; patch[which] = ev.target.result;
            S.saveLetterhead(patch);
            UI.toast('حُدِّث ' + label, 'ok'); redraw();
          };
          reader.readAsDataURL(file);
        } });
        var current = which === 'ministryLogo' ? S.letterhead().ministryLogo : S.letterhead().schoolLogo;
        return h('div', { class: 'field' }, [
          h('label', { text: label }),
          h('div', { class: 'cluster' }, [
            h('label', { class: 'btn btn-soft btn-sm', style: { cursor: 'pointer' } }, [h('span', { text: 'رفع صورة' }), input]),
            current ? h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
              var patch = {}; patch[which] = ''; S.saveLetterhead(patch); UI.toast('حُذفت الصورة', 'warn'); redraw();
            } }) : h('span', { class: 'muted', text: 'لم تُرفع صورة — يُستخدم الشكل الافتراضي' })
          ]),
          h('p', { class: 'hint', text: which === 'ministryLogo'
            ? 'شعار وزارة التعليم الرسمي مُضمَّن بخلفية شفافة — ارفع صورة أخرى فقط إن أردت استبداله.'
            : 'اختياري: ارفع شعار المدرسة الرسمي (PNG بخلفية شفافة) ليظهر على يسار الترويسة. إن لم ترفع شيئًا فلن يظهر شعار مدرسة.' })
        ]);
      }

      var host = h('div');
      function redraw() { clear(host); draw(); }

      function draw() {
        var l = S.letterhead();
        host.appendChild(h('div', { class: 'grid-2-app' }, [
          UI.panel('إعدادات الترويسة', 'هذه العناصر تظهر في أعلى كل تقرير مطبوع (PDF أو ورقي).', null, [
            h('div', { class: 'form-grid' }, [f.basmala.wrap, f.country.wrap, f.ministry.wrap, f.dept.wrap, f.schoolLine.wrap, f.footerNote.wrap]),
            h('div', { class: 'cluster', style: { margin: '10px 0 14px' } }, [toggles.showBasmala, toggles.showMinistryLogo, toggles.showSchoolLogo]),
            h('div', { class: 'grid-2-app' }, [logoField('ministryLogo', 'شعار وزارة التعليم'), logoField('schoolLogo', 'شعار المدرسة (اختياري)')]),
            h('div', { class: 'panel-actions', style: { marginTop: '12px' } }, [
              h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ الترويسة', onClick: function () {
                S.saveLetterhead({
                  basmala: f.basmala.input.value, country: f.country.input.value, ministry: f.ministry.input.value,
                  educationDept: f.dept.input.value, schoolLine: f.schoolLine.input.value, footerNote: f.footerNote.input.value,
                  showBasmala: toggles.showBasmala.querySelector('input').checked,
                  showMinistryLogo: toggles.showMinistryLogo.querySelector('input').checked,
                  showSchoolLogo: toggles.showSchoolLogo.querySelector('input').checked
                });
                UI.toast('حُفظت الترويسة وستظهر في كل التقارير', 'ok');
                redraw();
              } }),
              UI.reportButton(function () {
                return {
                  type: 'letterhead', title: 'معاينة ترويسة التقارير',
                  subtitle: 'نموذج تجريبي للتأكد من شكل الترويسة',
                  meta: [
                    { label: 'المدرسة', value: S.school().name },
                    { label: 'إدارة التعليم', value: S.letterhead().educationDept },
                    { label: 'أُعدّ بواسطة', value: S.session.name }
                  ],
                  sections: [
                    { heading: 'بيانات تجريبية', table: { cols: ['م', 'البيان', 'القيمة'], rows: [[1, 'الطلاب', S.studentWord(true)], [2, 'أيام الدراسة', '٤٢ يومًا'], [3, 'الفصول', String(S.list('classes').length)]] } },
                    { heading: 'ملاحظة', text: 'هذا نموذج لمعاينة الترويسة والتذييل فقط — تفاصيل كل تقرير تختلف بحسب نوعه.' }
                  ],
                  signatures: ['أعدّ التقرير', 'وكيل شؤون الطلاب', 'مدير المدرسة']
                };
              }, { label: 'معاينة الطباعة', class: 'btn-outline' })
            ])
          ]),
          UI.panel('معاينة مباشرة', 'شكل الترويسة كما ستُطبع (بحجم مصغّر).', null, [preview(),
            h('p', { class: 'form-note', text: 'الترتيب: البسملة · الدولة · الجهة · إدارة التعليم (من القائمة) · اسم المدرسة في المنتصف، ثم شعار الوزارة وشعار المدرسة (وأسفله تاريخ الإصدار والباركود)، ثم اسم التقرير بخط كبير، وفي الأسفل معد التقرير والتاريخ والوقت.' })
          ])
        ]));
      }
      draw();
      view.appendChild(host);

      view.appendChild(UI.panel('أين تظهر الترويسة؟', null, null, [
        h('div', { class: 'muted-block', text: 'تُطبَّق الترويسة تلقائيًا على كل التقارير الصادرة من تابعني: كشوف التحضير، الغياب والتأخر، سجل المخالفات، تصاريح الخروج، المناوبة، ساعات التطوع، الأنشطة، تقارير الفصول والمدرسة، والتقارير الدورية (اليومي/الأسبوعي/الشهري/نهاية الفصل).' }),
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '8px' }, text: 'شعار وزارة التعليم الرسمي مُضمَّن بخلفية شفافة (نقاط خضراء + «وزارة التعليم») ويظهر في كل التقارير، ويمكن استبداله بأي صورة من الأعلى.' })
      ]));
    }
  });
})();
