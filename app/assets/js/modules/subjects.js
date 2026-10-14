/* =============================================================================
   subjects.js — المواد الدراسية (مدير المدرسة)
   عرض مواد كل مرحلة + إضافة مواد جديدة (تظهر للوكيل في «إسناد المواد»
   وفي «نسب الحرمان» وفي كل القوائم) + حذف المواد المضافة فقط.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  App.register({
    id: 'subjects',
    label: 'المواد الدراسية',
    icon: '&#128218;',
    roles: ['principal'],
    render: function (view) {
      var school = S.school();
      var stages = (school && school.stages && school.stages.length) ? school.stages : ['primary', 'middle', 'secondary'];
      var host = h('div');
      function redraw() { clear(host); draw(); }

      function addForm() {
        var nameF = UI.field({ name: 'subName', label: 'اسم المادة', required: true, placeholder: 'مثال: الذكاء الاصطناعي', half: true });
        var boxes = {};
        var stageBoxes = stages.map(function (st) {
          var cb = h('input', { type: 'checkbox' });
          boxes[st] = cb;
          return h('label', { class: 'checkline' }, [cb, h('span', { text: S.stageName(st) })]);
        });
        return UI.panel('إضافة مادة جديدة', 'اختر المرحلة (أو أكثر من مرحلة) واكتب اسم المادة.', null, [
          h('div', { class: 'form-grid' }, [nameF.wrap]),
          h('div', { class: 'field' }, [h('label', { text: 'المراحل التي تُضاف إليها' }), h('div', { class: 'cluster' }, stageBoxes)]),
          h('div', { class: 'panel-actions' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة المادة', onClick: function () {
              var chosen = stages.filter(function (st) { return boxes[st].checked; });
              var res = S.addSubject({ name: nameF.input.value, stages: chosen });
              if (!res.ok) { UI.toast(res.error, 'bad'); return; }
              UI.toast('أُضيفت المادة إلى ' + res.added + ' مرحلة' + (res.skipped && res.skipped.length ? ' (موجودة مسبقًا في: ' + res.skipped.join('، ') + ')' : ''), 'ok');
              redraw();
            } }),
            h('button', { class: 'btn btn-outline', type: 'button', text: 'تفريغ الحقول', onClick: function () {
              nameF.input.value = ''; stages.forEach(function (st) { boxes[st].checked = false; });
            } })
          ]),
          h('div', { class: 'callout info', text: 'المادة المضافة تظهر فورًا لوكيل شؤون الطلاب في «إسناد المواد» وفي «نسب الحرمان»، وتُحتسب في التقارير مثل بقية المواد.' })
        ]);
      }

      function stagePanel(st) {
        var defaults = S.defaultSubjects(st);
        var custom = S.customSubjects(st);
        var total = S.subjectsFor([st]).length;
        var rows = defaults.map(function (n, i) {
          return { n: String(i + 1), name: n, type: UI.badge('أساسية', 'soft'), act: h('span', { class: 'muted', text: '—' }) };
        }).concat(custom.map(function (c) {
          return {
            n: '', name: c.name, type: UI.badge('مضافة', 'ok'),
            act: h('button', {
              class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                UI.confirm('حذف المادة «' + c.name + '» من ' + S.stageName(st) + '؟ (لن تتأثر الإسنادات المسجّلة)', { ok: 'حذف', danger: true })
                  .then(function (ok) { if (!ok) return; S.removeSubject(c.id); UI.toast('حُذفت المادة', 'warn'); redraw(); });
              }
            })
          };
        }));
        return UI.panel(S.stageName(st) + ' — ' + total + ' مادة', 'المواد الأساسية من نظام نور، والمضافة من مدرستك.', null, [
          rows.length ? UI.table({
            cols: [{ key: 'n', label: 'م' }, { key: 'name', label: 'المادة' }, { key: 'type', label: 'النوع' }, { key: 'act', label: 'إجراء' }],
            rows: rows
          }) : UI.empty('لا مواد في هذه المرحلة — أضف من الأعلى.')
        ]);
      }

      function draw() {
        var all = S.customSubjects();
        host.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('المراحل', String(stages.length), stages.map(function (s) { return S.stageName(s); }).join(' · ')),
          UI.statCard('المواد الأساسية', String(stages.reduce(function (a, s) { return a + S.defaultSubjects(s).length; }, 0)), 'من نظام نور'),
          UI.statCard('المواد المضافة', String(all.length), all.length ? 'من مدرستك' : 'لم تُضف مواد بعد')
        ]));

        host.appendChild(addForm());
        stages.forEach(function (st) { host.appendChild(stagePanel(st)); });

        host.appendChild(UI.panel('ملاحظات', null, null, [
          h('ul', { class: 'promo-steps' }, [
            h('li', { text: 'المواد الأساسية لا يمكن حذفها (تأتي من نظام نور)، والمضافة يمكن حذفها في أي وقت.' }),
            h('li', { text: 'حذف مادة لا يحذف الإسنادات السابقة، لكنها لن تظهر في القوائم الجديدة.' }),
            h('li', { text: 'إن أردت تعديل اسم مادة مضافة: احذفها وأضفها بالاسم الصحيح.' })
          ])
        ]));
      }

      draw();
      view.appendChild(host);
    }
  });
})();
