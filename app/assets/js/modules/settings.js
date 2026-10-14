/* =============================================================================
   settings.js — إعدادات وكيل شؤون الطلاب
   ---------------------------------------------------------------------------
   لوحة إعدادات الوكيل بثلاثة تبويبات:
     • نسب الحرمان : جدول كل مواد مراحل المدرسة، لكل مادة نسبة، + النسبة الافتراضية.
                     الحفظ عبر S.setDeprivation (مادة بمادة، والافتراضية بلا مادة).
     • معاينة الأثر: منتقي فترة (يومي/أسبوعي/شهري/نهاية الفصل عبر S.rangeOf) يبيّن
                     أثر النسب فورًا: بطاقات + S.deprivationList + S.absenceBySubject
                     + تنبيه واضح على وضع الاحتساب (general أم per-subject).
     • إعدادات عامة: ملخّص للقراءة فقط (الفصل، المناوبة، الجدول، الفصول والطلاب)
                     + إعادة تعيين بيانات العرض (S.reset ثم إعادة التحميل).
   وزر «طباعة سياسة الحرمان» (ترويسة + باركود + جدول المواد ونسبها).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var KINDS = [
    { key: 'day', label: 'يومي' },
    { key: 'week', label: 'أسبوعي' },
    { key: 'month', label: 'شهري' },
    { key: 'term', label: 'نهاية الفصل' }
  ];
  var TABS = [
    { key: 'rates', label: 'نسب الحرمان' },
    { key: 'impact', label: 'معاينة الأثر' },
    { key: 'general', label: 'إعدادات عامة' }
  ];

  function pct(v) { return Math.max(0, Math.min(100, Math.round(Number(v) || 0))); }
  function daysBetween(a, b) {
    var p = function (x) { var q = String(x).split('-'); return new Date(+q[0], +q[1] - 1, +q[2]); };
    return Math.round((p(b) - p(a)) / 864e5) + 1;
  }

  App.register({
    id: 'settings',
    label: 'إعدادات الوكيل',
    icon: '&#9881;&#65039;',
    roles: ['deputy'],
    render: function (view) {
      var school = S.school(S.session.schoolId) || {};
      var state = { tab: 'rates', kind: 'month', ref: UI.today() };

      function paint() { clear(view); build(); }
      function stages() { return school.stages || []; }
      function customMap() { return (S.db.settings && S.db.settings.deprivationBySubject) || {}; }
      function isCustom(subject) { return customMap()[subject] != null; }
      function range() { return S.rangeOf(state.kind, state.ref); }
      function rangeLabel() { var r = range(); return r.label + ' — ' + UI.fmtDate(r.from) + ' إلى ' + UI.fmtDate(r.to); }

      /* ---------------------------------------------- فهرس المواد والمراحل */
      /* يعتمد على S.subjectsFor(S.school().stages) ثم يضيف مرحلة كل مادة بلا تكرار. */
      function subjectsCatalog() {
        var map = {}, order = [];
        S.subjectsFor(stages()).forEach(function (sub) {
          if (!map[sub]) { map[sub] = { subject: sub, stages: [] }; order.push(sub); }
        });
        stages().forEach(function (sid) {
          var nm = S.stageName(sid);
          S.subjectsFor([sid]).forEach(function (sub) {
            if (map[sub] && map[sub].stages.indexOf(nm) === -1) map[sub].stages.push(nm);
          });
        });
        return order.map(function (s) { return map[s]; });
      }

      function numInput(value, label) {
        return h('input', {
          class: 'input', type: 'number', dir: 'ltr', min: '0', max: '100', step: '1',
          value: String(value), 'aria-label': label, style: { maxWidth: '110px' }
        });
      }

      /* ---------------------------------------------- تقرير سياسة الحرمان */
      function buildPolicyReport() {
        var cat = subjectsCatalog();
        var term = S.activeTerm();
        return {
          type: 'settings-deprivation', refId: 'deprivation-policy',
          title: 'سياسة الحرمان بالغياب',
          subtitle: 'نسب الحرمان المعتمدة لكل مادة — ' + (term ? term.name : ''),
          meta: [
            { label: 'المدرسة', value: school.name || '—' },
            { label: 'المراحل', value: stages().map(S.stageName).join(' · ') || '—' },
            { label: 'النسبة الافتراضية', value: S.deprivationFor(null) + '٪' },
            { label: 'عدد المواد', value: cat.length },
            { label: 'مواد بنسبة خاصة', value: Object.keys(customMap()).length }
          ],
          sections: [
            {
              heading: 'نسب الحرمان لكل مادة',
              table: {
                cols: ['م', 'المادة', 'المرحلة', 'النسبة المعتمدة', 'المصدر'],
                rows: cat.map(function (x, i) {
                  return [i + 1, x.subject, x.stages.join('، ') || '—', S.deprivationFor(x.subject) + '٪', isCustom(x.subject) ? 'خاصة بالمادة' : 'افتراضية'];
                })
              }
            },
            {
              heading: 'القاعدة المعتمدة',
              text: 'يُحتسب لكل مادة بنسبتها؛ والطالب الذي يبلغ نسبة أي مادة يُدرج في قائمة الحرمان.\n' +
                'المواد غير المحدّدة بنسبة خاصة تُحتسب بالنسبة الافتراضية (' + S.deprivationFor(null) + '٪).'
            }
          ],
          signatures: ['وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      /* ================================================== تبويب نسب الحرمان */
      function saveRates(entries) {
        var changed = 0, bad = 0;
        entries.forEach(function (e) {
          var raw = String(e.input.value).trim();
          if (raw === '') return;
          var n = Number(raw);
          if (isNaN(n)) { bad++; return; }
          n = pct(n);
          if (n !== S.deprivationFor(e.subject)) { S.setDeprivation(e.subject, n); changed++; }
        });
        if (bad) UI.toast('بعض القيم غير صحيحة ولم تُحفظ', 'warn');
        if (changed) {
          S.log('settings', { action: 'deprivation-rates', changed: changed });
          UI.toast('حُفظت نسب الحرمان لـ ' + changed + ' مادة', 'ok');
        } else if (!bad) {
          UI.toast('لا توجد تغييرات لحفظها', 'warn');
        }
        paint();
      }

      function ratesTab() {
        var out = h('div');
        var cat = subjectsCatalog();
        var entries = [];

        var rows = cat.map(function (x) {
          var inp = numInput(S.deprivationFor(x.subject), 'نسبة حرمان مادة ' + x.subject);
          entries.push({ subject: x.subject, input: inp });
          return { subject: x.subject, stages: x.stages, custom: isCustom(x.subject), input: inp };
        });

        out.appendChild(UI.panel(
          'نسب الحرمان لكل مادة',
          'عدد المواد: ' + cat.length + ' — المراحل: ' + (stages().map(S.stageName).join(' · ') || 'لا مراحل'),
          [
            UI.reportButton(buildPolicyReport, { label: 'طباعة سياسة الحرمان', class: 'btn-soft' }),
            h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ نسب المواد', onClick: function () { saveRates(entries); } })
          ],
          [
            UI.table({
              cols: [
                { label: 'المادة', render: function (r) { return h('strong', { text: r.subject }); } },
                { label: 'المرحلة', render: function (r) { return r.stages.join(' · ') || '—'; } },
                { label: 'نسبة الحرمان (٪)', render: function (r) { return h('div', { class: 'cluster' }, [r.input, h('span', { class: 'muted', text: '٪' })]); } },
                { label: 'المصدر', render: function (r) { return UI.badge(r.custom ? 'خاصة بالمادة' : 'افتراضية', r.custom ? 'mint' : 'plain'); } }
              ],
              rows: rows, empty: 'لا مواد في مراحل هذه المدرسة.'
            }),
            h('div', { class: 'muted-block mt-4' }, [
              h('strong', { text: 'القاعدة: ' }),
              h('span', { text: 'يُحتسب لكل مادة بنسبتها؛ والطالب الذي يبلغ نسبة أي مادة يُدرج في قائمة الحرمان. أي تعديل يظهر فورًا في «معاينة الأثر».' })
            ])
          ]
        ));

        /* ---------------------------------------------- النسبة الافتراضية */
        var defField = UI.field({
          name: 'deprivation-default', label: 'النسبة الافتراضية للحرمان (٪)', type: 'number', dir: 'ltr',
          value: S.deprivationFor(null), min: 0, max: 100, step: 1,
          help: 'تُستخدم للمواد غير المحدّدة بنسبة خاصة.'
        });
        function saveDefault() {
          var raw = String(defField.input.value).trim();
          if (raw === '' || isNaN(Number(raw))) { UI.toast('أدخل نسبة صحيحة بين 0 و100', 'warn'); return; }
          var n = pct(raw);
          S.setDeprivation(null, n);
          S.log('settings', { action: 'deprivation-default', pct: n });
          UI.toast('حُفظت النسبة الافتراضية ' + n + '٪', 'ok');
          paint();
        }
        out.appendChild(UI.panel(
          'النسبة الافتراضية',
          'تُطبّق على كل مادة غير محدّدة بنسبة خاصة.',
          null,
          [
            h('div', { class: 'inline-form' }, [
              defField.wrap,
              h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ النسبة الافتراضية', onClick: saveDefault })
            ]),
            h('div', { class: 'muted-block mt-4', text: 'يُحتسب لكل مادة بنسبتها؛ والطالب الذي يبلغ نسبة أي مادة يُدرج في قائمة الحرمان. المواد التي تتركها «افتراضية» تُحتسب بهذه النسبة.' })
          ]
        ));
        return out;
      }

      /* ================================================== تبويب معاينة الأثر */
      function statusBadge(x) {
        if (x.absencePct > x.threshold) return UI.badge('متجاوز الحد', 'brand');
        if (x.absencePct === x.threshold) return UI.badge('بلغ الحد', 'amber');
        return UI.badge('قريب من الحد', 'plain');
      }
      function subjectAgg(abs) {
        var map = {};
        (abs || []).forEach(function (x) {
          var row = map[x.subject] || (map[x.subject] = { subject: x.subject, threshold: x.threshold, students: 0, exceeded: 0, maxPct: 0 });
          row.students++;
          if (x.absencePct > row.maxPct) row.maxPct = x.absencePct;
          if (x.exceeded) row.exceeded++;
        });
        return Object.keys(map).map(function (k) { return map[k]; })
          .sort(function (a, b) { return b.exceeded - a.exceeded || b.maxPct - a.maxPct; });
      }
      function mostIncluded(rows, abs, isPer) {
        var map = {};
        if (isPer) rows.forEach(function (x) { if (x.subject) map[x.subject] = (map[x.subject] || 0) + 1; });
        else (abs || []).forEach(function (x) { if (x.exceeded) map[x.subject] = (map[x.subject] || 0) + 1; });
        var name = '—', count = 0;
        Object.keys(map).forEach(function (k) { if (map[k] > count) { count = map[k]; name = k; } });
        return { name: name, count: count };
      }

      function impactTab() {
        var out = h('div');
        var r = range();
        var dep = S.deprivationList(r);
        var rows = dep.rows || [];
        var abs = S.absenceBySubject(r);
        var isPer = dep.mode === 'per-subject';
        var customCount = Object.keys(customMap()).length;

        var kindBar = h('div', { class: 'cluster' }, KINDS.map(function (k) {
          return h('button', {
            class: 'mini-btn' + (state.kind === k.key ? ' is-primary' : ''), type: 'button', text: k.label,
            onClick: function () { state.kind = k.key; paint(); }
          });
        }));
        var refField = UI.field({ name: 'ref', label: 'تاريخ المرجع', type: 'date', value: state.ref });
        refField.input.addEventListener('change', function () { state.ref = refField.input.value || UI.today(); paint(); });

        out.appendChild(UI.panel('فترة المعاينة', rangeLabel(), null, [
          h('div', { class: 'between' }, [kindBar, h('span', { class: 'muted nums', text: r.from + ' → ' + r.to })]),
          h('div', { class: 'form-grid mt-4' }, [
            refField.wrap,
            h('div', { class: 'muted-block' }, [
              h('strong', { text: 'ملاحظة: ' }),
              h('span', { text: 'تعرض هذه المعاينة أثر تعديل نسب الحرمان فورًا على قوائم هذه الفترة قبل اعتمادها رسميًا.' })
            ])
          ])
        ]));

        var maxRow = rows.slice().sort(function (a, b) { return b.absencePct - a.absencePct; })[0];
        var top = mostIncluded(rows, abs, isPer);
        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('بلغوا نسبة الحرمان', String(rows.length), 'طالب في ' + r.label, rows.length ? 'gold' : null),
          UI.statCard('أعلى نسبة', (maxRow ? maxRow.absencePct : 0) + '٪', maxRow ? (maxRow.name + ' — ' + maxRow.className) : 'لا يوجد'),
          UI.statCard('المادة الأكثر إدراجًا', top.name, top.count ? (top.count + ' إدراج') : 'لا إدراج'),
          UI.statCard('حالة الاحتساب', isPer ? 'لكل مادة' : 'نسبة عامة', isPer ? ('نسب خاصة لـ ' + customCount + ' مادة') : ('الجميع على ' + dep.threshold + '٪'))
        ]));

        out.appendChild(UI.panel(
          'حالة الاحتساب',
          null,
          [UI.badge(isPer ? 'per-subject — لكل مادة بنسبتها' : 'general — نسبة عامة موحّدة', isPer ? 'mint' : 'amber')],
          [
            h('div', { class: 'muted-block' }, [
              h('strong', { text: 'الوضع الحالي: ' + (isPer ? 'per-subject. ' : 'general. ') }),
              h('span', { text: isPer
                ? 'تُقارن نسبة غياب الطالب في كل مادة بحدّها الخاص، ويُدرج الطالب بمادته الأسوأ (أكبر فرق عن الحد).'
                : 'لا توجد نسب مخصّصة، فتُحتسب كل المواد بالنسبة الافتراضية (' + dep.threshold + '٪). اضبط نسب المواد من تبويب «نسب الحرمان» لتغيير الوضع.' })
            ])
          ]
        ));

        out.appendChild(UI.panel('قائمة الحرمان', 'الطلاب الذين بلغوا حدّ الحرمان خلال ' + r.label + ' — ' + rows.length + ' طالب.', null, [
          UI.table({
            cols: [
              { label: 'الطالب', key: 'name' },
              { label: 'الفصل', key: 'className' },
              { label: 'المادة', render: function (x) { return x.subject || '—'; } },
              { label: 'الغياب / الإجمالي', render: function (x) { return h('span', { class: 'nums', dir: 'ltr', text: x.absent + ' / ' + x.total }); } },
              { label: 'النسبة', render: function (x) { return h('div', { class: 'cluster' }, [h('span', { class: 'nums', text: x.absencePct + '٪' }), UI.progressBar(x.absencePct, 'danger')]); } },
              { label: 'الحد', render: function (x) { return h('span', { class: 'nums', text: x.threshold + '٪' }); } },
              { label: 'الحالة', render: function (x) { return statusBadge(x); } }
            ],
            rows: rows, empty: 'لا يوجد طالب بلغ نسبة الحرمان في هذه الفترة.'
          })
        ]));

        out.appendChild(UI.panel('الغياب بحسب المواد', 'عدد الطلاب البالغين لحدّ الحرمان في كل مادة — خلال ' + r.label + '.', null, [
          UI.table({
            cols: [
              { label: 'المادة', render: function (x) { return h('strong', { text: x.subject }); } },
              { label: 'الحد المعتمد', render: function (x) { return h('span', { class: 'nums', text: x.threshold + '٪' }); } },
              { label: 'الطلاب البالغون', render: function (x) { return h('span', { class: 'nums', text: String(x.exceeded) }); } },
              { label: 'أعلى نسبة', render: function (x) { return h('span', { class: 'nums', text: x.maxPct + '٪' }); } },
              { label: 'طلاب المادة', render: function (x) { return h('span', { class: 'nums', text: String(x.students) }); } }
            ],
            rows: subjectAgg(abs), empty: 'لا توجد بيانات غياب بحسب المواد في هذه الفترة.'
          })
        ]));
        return out;
      }

      /* ================================================== تبويب إعدادات عامة */
      function doReset() {
        UI.confirm('سيُعاد زرع البيانات الافتراضية لتابعني وتُفقد كل التغييرات المحفوظة في المتصفح (التحضير والمخالفات والاستئذان والإعدادات). متابعة؟',
          { title: 'إعادة تعيين بيانات العرض', ok: 'إعادة التعيين', danger: true }).then(function (ok) {
            if (!ok) return;
            S.reset();
            UI.toast('أُعيدت بيانات العرض الافتراضية', 'ok');
            location.reload();
          });
      }

      function generalTab() {
        var out = h('div');
        var term = S.activeTerm();
        var periods = S.periodsOf(S.session.schoolId);
        var midCount = periods.filter(function (p) { return p.closeRule === 'mid'; }).length;
        var endCount = periods.length - midCount;
        var classes = S.list('classes', { schoolId: S.session.schoolId });
        var students = S.list('students', { schoolId: S.session.schoolId });
        var halls = S.dutyLocations(S.session.schoolId);
        var termDays = term ? daysBetween(term.from, term.to) : 0;

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الفصل الدراسي الحالي', term ? term.name : '—', term ? ('مدّته ' + termDays + ' يومًا') : '', 'gold'),
          UI.statCard('أماكن المناوبة', String(halls.length), 'مكانًا معتمدًا'),
          UI.statCard('حصص الجدول', String(periods.length), 'منتصف الحصة: ' + midCount + ' · نهاية الحصة: ' + endCount),
          UI.statCard('فصول المدرسة', String(classes.length), students.length + ' طالبًا مسجّلًا')
        ]));

        out.appendChild(UI.panel('ملخّص الإعدادات', 'قراءة فقط — تُدار هذه القيم من وحداتها المختصة.', null, [
          UI.table({
            cols: [
              { label: 'البند', key: 'k' },
              { label: 'القيمة', key: 'v' }
            ],
            rows: [
              { k: 'المدرسة', v: (school.name || '—') + (school.code ? ' (' + school.code + ')' : '') },
              { k: 'المراحل', v: stages().map(S.stageName).join(' · ') || '—' },
              { k: 'الفصل الدراسي الحالي ومدّته', v: term ? (term.name + ' — ' + UI.fmtDate(term.from) + ' إلى ' + UI.fmtDate(term.to) + ' (' + termDays + ' يومًا)') : '—' },
              { k: 'أماكن المناوبة', v: halls.length + ' مكانًا: ' + (halls.map(function (l) { return l.name; }).join(' · ') || '—') },
              { k: 'حصص الجدول وقواعد الإغلاق', v: periods.length + ' حصة — إغلاق منتصف الحصة: ' + midCount + '، إغلاق نهاية الحصة: ' + endCount },
              { k: 'فصول المدرسة وطلابها', v: classes.length + ' فصلًا — ' + students.length + ' طالبًا' },
              { k: 'نسب الحرمان', v: Object.keys(customMap()).length + ' مادة بنسبة خاصة · الافتراضية ' + S.deprivationFor(null) + '٪' }
            ],
            empty: 'لا بيانات.'
          })
        ]));

        out.appendChild(UI.panel('إعادة تعيين بيانات العرض', 'تعيد زرع البيانات الافتراضية وتفقد كل التغييرات المحفوظة في المتصفح.', null, [
          h('div', { class: 'between' }, [
            h('div', { class: 'muted-block' }, [
              h('strong', { text: 'تنبيه: ' }),
              h('span', { text: 'سيُفقد التحضير والمخالفات والاستئذان وكل الإعدادات. تُستخدم لإعادة العرض إلى حالته الأولى.' })
            ]),
            h('button', { class: 'btn btn-outline', type: 'button', text: 'إعادة تعيين بيانات العرض', onClick: doReset })
          ])
        ]));
        return out;
      }

      /* ============================================================= البناء */
      function build() {
        var roleName = (S.roles.find(function (x) { return x.id === S.session.role; }) || {}).name || '';
        view.appendChild(h('div', { class: 'panel' }, [h('div', { class: 'panel-body' }, [
          h('div', { class: 'between' }, [
            h('div', {}, [
              h('span', { class: 'eyebrow', text: 'الدور الحالي: ' + roleName }),
              h('p', { class: 'muted mt-3', text: 'ضبط نسب الحرمان لكل مادة، ومعاينة أثرها فورًا على قوائم الحرمان، ومراجعة الإعدادات العامة للمدرسة.' })
            ]),
            h('span', { class: 'chip chip-plain', text: school.name || 'المدرسة' })
          ])
        ])]));

        var bar = UI.tabs(TABS, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', TABS[i].key === state.tab); });
        view.appendChild(bar);

        var body = h('div');
        if (state.tab === 'impact') body.appendChild(impactTab());
        else if (state.tab === 'general') body.appendChild(generalTab());
        else body.appendChild(ratesTab());
        view.appendChild(body);
      }

      build();
    }
  });
})();
