/* =============================================================================
   duties.js — وحدة المناوبة (وكيل شؤون المعلمين)
   ---------------------------------------------------------------------------
   الرحلة: يضبط أماكن المناوبة ← يوزّع المناوبين آليًّا (عدل بين المعلمين، بلا
   تكرار لنفس المعلم في اليوم) أو يضيف مناوبة يدويًا ← يتابع مناوبي اليوم
   ويغيّر المكان/التوقيت أو يحذف أو يسجّل الاستلام ← تُرسَل تذكيرات الغد عبر
   تلقرام آليًّا، ويطبع الجدول الأسبوعي (TBN-DUT) أو يصدّره CSV.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var SHIFTS = ['الاستراحة الأولى', 'الاستراحة الثانية'];
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  /* الافتراضي في الإضافة اليدوية: الفسحة + بين الحصص (نهاية اليوم تُسند غالبًا للأول آليًّا) */
  var DEFAULT_SLOTS = ['break', 'transitions'];

  /* ------------------------------------------------------- مساعدات التواريخ */
  function parseIso(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtIso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDaysIso(s, n) { var d = parseIso(s); d.setDate(d.getDate() + n); return fmtIso(d); }
  function weekdayName(s) { return DAYS[parseIso(s).getDay()] || ''; }

  /* ---------------------------------------------------- فترات المناوبة */
  /** فترات المناوبة من المتجر (يتحمّل أن كان مصفوفة أو دالة) */
  function dutySlots() { return typeof S.dutySlots === 'function' ? S.dutySlots() : (S.dutySlots || []); }
  /** هل المناوبة تشمل فترة نهاية اليوم (خروج الطلاب)؟ */
  function hasExit(d) { return (d.slots || []).indexOf('exit') > -1; }

  /** مجموعة checkboxes لفترات المناوبة من dutySlots() */
  function slotsPicker(selected) {
    var current = (selected && selected.length) ? selected.slice() : DEFAULT_SLOTS.slice();
    var boxes = dutySlots().map(function (s) {
      var cb = h('input', { type: 'checkbox', value: s.id });
      cb.checked = current.indexOf(s.id) > -1;
      return { s: s, cb: cb };
    });
    var wrap = h('div', { class: 'field full' }, [
      h('label', { text: 'فترات المناوبة' }),
      h('div', { class: 'pick-list' }, boxes.map(function (b) {
        return h('label', {}, [b.cb, h('span', { text: b.s.name + ' — ' + b.s.desc })]);
      })),
      h('p', { class: 'hint', text: 'حدّد الفترات التي تغطّيها المناوبة: الفسحة · بين الحصص (٥ دقائق) · نهاية اليوم (خروج الطلاب).' })
    ]);
    return { wrap: wrap, selected: function () {
      return boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.s.id; });
    } };
  }

  /** نافذة نموذج موحّدة (حقول + فترات المناوبة) تُغني عن formModal عند الحاجة للفترات */
  function dutyModal(opts) {
    var fields = (opts.fields || []).map(function (f) {
      var ff = UI.field(f);
      ff.wrap.classList.toggle('full', !f.half);
      return ff;
    });
    var slots = slotsPicker(opts.slots);
    var grid = h('div', { class: 'form-grid' }, fields.map(function (f) { return f.wrap; }).concat([slots.wrap]));
    var error = h('p', { class: 'hint hint-error', hidden: true });
    UI.modal({
      title: opts.title, wide: opts.wide,
      body: [
        opts.intro ? h('p', { class: 'muted', style: { marginBottom: '14px' }, text: opts.intro }) : null,
        grid, error
      ],
      actions: [
        { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
        { label: opts.submitLabel || 'حفظ', class: 'btn-primary', onClick: function (close, box) {
            var data = {}, ok = true;
            fields.forEach(function (f) {
              var v = String(f.input.value == null ? '' : f.input.value).trim();
              if (f.spec.required && !v) { ok = false; f.wrap.classList.add('has-error'); }
              else f.wrap.classList.remove('has-error');
              data[f.name] = v;
            });
            if (!ok) { error.hidden = false; error.textContent = 'يرجى إكمال الحقول المطلوبة.'; return; }
            data.slots = slots.selected();
            if (!data.slots.length) { error.hidden = false; error.textContent = 'اختر فترة مناوبة واحدة على الأقل.'; return; }
            var keep = opts.onSubmit(data, { close: close, box: box });
            if (keep !== false) close();
          } }
      ]
    });
  }

  App.register({
    id: 'duties',
    label: 'المناوبة',
    icon: '&#128204;',
    roles: ['teachers_deputy'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var state = { date: UI.today() };

      var teacherName = function (id) { return (S.user(id) || {}).name || '—'; };
      var locations = function () { return S.dutyLocations(schoolId); };
      var teachers = function () { return S.usersByRole('teacher', schoolId); };
      /** يجد تقريرًا سابقًا من نفس النوع وإلا يُنشئ واحدًا (حتى لا يتغيّر رمز الباركود) */
      function ensureReport(type, refId, title) {
        var found = S.list('reports').filter(function (r) { return r.type === type && r.refId === refId; })
          .sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); })[0];
        return found || S.registerReport(type, refId, { title: title });
      }

      /* ======================================================= 1) البطاقات */
      function statsRow() {
        var st = S.dutyStats(schoolId);
        return h('div', { class: 'stat-row' }, [
          UI.statCard('مناوبات اليوم', String(st.today), null, st.today ? 'gold' : null),
          UI.statCard('مناوبات الأسبوع', String(st.week)),
          UI.statCard('مناوبات الشهر', String(st.month)),
          UI.statCard('أماكن المناوبة', String(st.locations)),
          UI.statCard('تذكيرات لم تُرسل', String(st.unreminded), st.unreminded ? 'بانتظار الإرسال' : 'كل التذكيرات أُرسلت',
            st.unreminded ? 'gold' : null)
        ]);
      }

      /* =============================================== 2) مناوبو اليوم */
      function changeDuty(d) {
        var locs = locations();
        dutyModal({
          title: 'تغيير المكان أو التوقيت',
          intro: teacherName(d.teacherId) + ' — ' + UI.dateLabel(d.date),
          fields: [
            {
              name: 'location', label: 'المكان', type: 'select', required: true, value: d.locationId,
              options: locs.map(function (l) { return { value: l.id, label: l.name }; }),
              placeholder: locs.length ? 'اختر المكان' : 'أضف أماكن المناوبة أولًا'
            },
            {
              name: 'shift', label: 'التوقيت', type: 'select', required: true, value: d.shift,
              options: SHIFTS.map(function (s) { return { value: s, label: s }; })
            }
          ],
          slots: hasExit(d) || (d.slots && d.slots.length) ? d.slots : DEFAULT_SLOTS,
          submitLabel: 'حفظ',
          onSubmit: function (data) {
            S.setDuty({ date: d.date, teacherId: d.teacherId, locationId: data.location, shift: data.shift, slots: data.slots });
            UI.toast('حُدّثت المناوبة وفتراتها', 'ok');
            draw();
          }
        });
      }

      function removeDuty(d) {
        UI.confirm('حذف مناوبة «' + teacherName(d.teacherId) + '» بتاريخ ' + UI.fmtDate(d.date) + '؟', { ok: 'حذف', danger: true })
          .then(function (ok) {
            if (!ok) return;
            S.removeDuty(d.id);
            UI.toast('حُذفت المناوبة', 'ok');
            draw();
          });
      }

      function todayPanel() {
        var dateF = UI.field({ name: 'date', label: 'تاريخ المناوبة', type: 'date', value: state.date });
        dateF.input.addEventListener('change', function () {
          state.date = dateF.input.value || UI.today();
          draw();
        });

        var list = S.dutiesOf(state.date, schoolId).slice().sort(function (a, b) {
          return teacherName(a.teacherId).localeCompare(teacherName(b.teacherId));
        });

        var table = UI.table({
          cols: [
            { label: 'المعلم', render: function (d) { return h('strong', { style: { fontWeight: '600' }, text: teacherName(d.teacherId) }); } },
            { label: 'المكان', render: function (d) { return S.locationName(d.locationId); } },
            { label: 'التوقيت / الاستراحة', render: function (d) { return d.shift || '—'; } },
            { label: 'الفترات', render: function (d) {
              return h('div', { class: 'cluster' }, [
                h('span', { text: S.slotsLabel(d.slots) }),
                hasExit(d) ? UI.badge('خروج الطلاب', 'brand') : null
              ]);
            } },
            { label: 'الحالة', render: function (d) {
              return d.ackAt ? UI.badge('تم الاستلام', 'mint') : UI.badge('مجدولة', 'amber');
            } },
            { label: 'حالة التذكير', render: function (d) {
              return d.reminderAt ? UI.badge('أُرسل · ' + UI.fmtTime(d.reminderAt), 'mint') : UI.badge('لم يُرسل', 'plain');
            } },
            { label: 'إجراءات', class: 'row-actions', render: function (d) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn', type: 'button', text: 'تغيير المكان/التوقيت', onClick: function () { changeDuty(d); } }),
                d.ackAt ? null : h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تسجيل الاستلام', onClick: function () {
                  S.ackDuty(d.id);
                  UI.toast('سُجّل استلام المناوبة', 'ok');
                  draw();
                } }),
                h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removeDuty(d); } })
              ]);
            } }
          ],
          rows: list,
          empty: 'لا مناوبات في هذا التاريخ — وزّع آليًّا أو أضف مناوبة يدويًّا.'
        });

        return UI.panel(
          'مناوبو اليوم',
          'اختر تاريخًا لعرض مناوبات يومه، وعدّل المكان أو التوقيت أو سجّل الاستلام.',
          null,
          [
            h('div', { class: 'form-grid' }, [dateF.wrap]),
            h('div', { class: 'cluster mt-4' }, [
              UI.badge('مناوبات اليوم المختار: ' + list.length, list.length ? 'brand' : 'plain'),
              UI.badge('مُستلمة: ' + list.filter(function (d) { return d.ackAt; }).length, 'mint')
            ]),
            h('div', { class: 'mt-4' }, [table])
          ]
        );
      }

      /* ============================================ 3) توزيع المناوبين */
      function addManualDuty() {
        var ts = teachers(), locs = locations();
        dutyModal({
          title: 'إضافة مناوبة يدويًّا',
          intro: 'تُضاف مناوبة لمعلم واحد في يوم واحد؛ ولا يُقبل تكرار نفس المعلم في اليوم نفسه. اختر فترات المناوبة (الفسحة · بين الحصص · نهاية اليوم/خروج الطلاب).',
          fields: [
            { name: 'date', label: 'التاريخ', type: 'date', value: UI.today(), required: true },
            {
              name: 'teacher', label: 'المعلم', type: 'select', required: true,
              options: ts.map(function (t) { return { value: t.id, label: t.name }; }),
              placeholder: ts.length ? 'اختر المعلم' : 'لا يوجد معلمون'
            },
            {
              name: 'location', label: 'المكان', type: 'select', required: true,
              options: locs.map(function (l) { return { value: l.id, label: l.name }; }),
              placeholder: locs.length ? 'اختر المكان' : 'أضف أماكن المناوبة أولًا'
            },
            {
              name: 'shift', label: 'التوقيت', type: 'select', required: true,
              options: SHIFTS.map(function (s) { return { value: s, label: s }; })
            }
          ],
          slots: DEFAULT_SLOTS,
          submitLabel: 'إضافة',
          onSubmit: function (data) {
            if (!data.location) { UI.toast('أضف أماكن المناوبة أولًا', 'warn'); return false; }
            if (!data.teacher) { UI.toast('اختر المعلم', 'warn'); return false; }
            if (S.dutyFor(data.teacher, data.date)) {
              UI.toast('هذا المعلم لديه مناوبة في اليوم نفسه — لا يمكن تكراره', 'warn');
              return false;
            }
            S.setDuty({ date: data.date, teacherId: data.teacher, locationId: data.location, shift: data.shift, slots: data.slots });
            UI.toast('أُضيفت المناوبة', 'ok');
            draw();
          }
        });
      }

      function distributePanel() {
        var from = UI.today(), to = addDaysIso(UI.today(), 4);
        var fromF = UI.field({ name: 'from', label: 'من تاريخ', type: 'date', value: from, required: true });
        var toF = UI.field({ name: 'to', label: 'إلى تاريخ', type: 'date', value: to, required: true });
        var perDayF = UI.field({ name: 'perDay', label: 'عدد المناوبين في اليوم', type: 'number', value: 2, min: 1, max: 10, required: true });
        var shiftF = UI.field({
          name: 'shift', label: 'التوقيت', type: 'select', required: true,
          options: SHIFTS.map(function (s) { return { value: s, label: s }; })
        });
        /* فترات المناوبة: افتراضيًّا اليوم كامل (الفسحة · بين الحصص · نهاية اليوم) */
        var slotsPick = slotsPicker(dutySlots().map(function (s) { return s.id; }));

        var locs = locations();
        var locBoxes = locs.map(function (l) {
          var cb = h('input', { type: 'checkbox', value: l.id });
          cb.checked = true;
          return { l: l, cb: cb };
        });
        var locPick = locBoxes.length
          ? h('div', { class: 'pick-list' }, locBoxes.map(function (b) {
              return h('label', {}, [b.cb, h('span', { text: b.l.name + (b.l.note ? ' — ' + b.l.note : '') })]);
            }))
          : h('p', { class: 'muted', text: 'لا توجد أماكن مناوبة بعد — أضفها من قسم «أماكن المناوبة».' });

        var weekend = h('input', { type: 'checkbox' });
        weekend.checked = true;
        var weekendLine = h('label', { class: 'checkline' }, [weekend, h('span', { text: 'تضمين الجمعة والسبت في التوزيع' })]);

        var ts = teachers();
        var exBoxes = ts.map(function (t) {
          var cb = h('input', { type: 'checkbox', value: t.id });
          return { t: t, cb: cb };
        });
        var exPick = ts.length
          ? h('div', { class: 'pick-list' }, exBoxes.map(function (b) {
              return h('label', {}, [b.cb, h('span', { text: b.t.name + ' — مناوباته السابقة: ' + S.list('duties', { teacherId: b.t.id }).length })]);
            }))
          : h('p', { class: 'muted', text: 'لا يوجد معلمون في المدرسة.' });

        var autoBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'توزيع آلي عادل', onClick: function () {
          var f = fromF.input.value, t = toF.input.value;
          if (!f || !t) { UI.toast('حدّد نطاق التاريخ', 'warn'); return; }
          if (f > t) { UI.toast('تاريخ البداية بعد تاريخ النهاية', 'err'); return; }
          var locIds = locBoxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.l.id; });
          if (!locIds.length) { UI.toast('اختر مكان مناوبة واحدًا على الأقل', 'warn'); return; }
          var excludeIds = exBoxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.t.id; });
          var slotIds = slotsPick.selected();
          if (!slotIds.length) { UI.toast('اختر فترة مناوبة واحدة على الأقل', 'warn'); return; }
          var res = S.autoDistribute({
            from: f, to: t, teachersPerDay: Number(perDayF.input.value) || 2,
            locationIds: locIds, shift: shiftF.input.value, includeWeekend: weekend.checked, excludeIds: excludeIds,
            slots: slotIds
          });
          if (!res || !res.ok) { UI.toast((res && res.error) || 'تعذّر التوزيع الآلي', 'err'); return; }
          UI.toast('وزّع ' + res.placed + ' مناوبة في ' + res.days + ' يومًا' + (res.skipped ? ' — تخطّي ' + res.skipped : ''), 'ok');
          draw();
        } });
        var manualBtn = h('button', { class: 'btn btn-outline', type: 'button', text: 'إضافة مناوبة يدويًّا', onClick: addManualDuty });

        return UI.panel(
          'توزيع المناوبين',
          'يوزّع النظام المعلمين عدلًا (الأقل مناوبات أولًا) بلا تكرار لنفس المعلم في اليوم نفسه، ويُراعي أيام العمل. الأول في كل يوم يحمل فترة «نهاية اليوم» (خروج الطلاب)، والباقي على الفسحة وبين الحصص.',
          [autoBtn, manualBtn],
          [
            h('div', { class: 'form-grid' }, [fromF.wrap, toF.wrap, perDayF.wrap, shiftF.wrap]),
            h('div', { class: 'form-grid mt-4' }, [
              slotsPick.wrap,
              h('div', { class: 'field full' }, [h('label', { text: 'أماكن المناوبة المختارة' }), locPick]),
              h('div', { class: 'field full' }, [weekendLine]),
              h('div', { class: 'field full' }, [
                h('label', { text: 'معلمون مستثنون من التوزيع' }),
                exPick,
                h('p', { class: 'hint', text: 'علّم المعلمين الذين لا تريد إدخالهم في التوزيع (إجازة أو تكليف آخر).' })
              ])
            ]),
            h('div', { class: 'muted-block mt-4' },
              [h('strong', { text: 'كيف تُوزّع الفترات؟ ' }),
               h('span', { text: 'الأول في كل يوم يحمل فترة «نهاية اليوم» (مناوبة خروج الطلاب) مع بقية الفترات المختارة، أما بقية المناوبين في اليوم فيحملون الفسحة وبين الحصص فقط. يمكنك تحديد فترة واحدة أو أكثر لكل توزيع.' })])
          ]
        );
      }

      /* ============================================ 4) أماكن المناوبة */
      function addLocation() {
        UI.formModal({
          title: 'إضافة مكان مناوبة',
          fields: [
            { name: 'name', label: 'اسم المكان', required: true, placeholder: 'بجوار المقصف' },
            { name: 'note', label: 'ملاحظة', required: false, placeholder: 'اختياري — مثال: يُغطّى في الاستراحة الثانية' }
          ],
          submitLabel: 'إضافة',
          onSubmit: function (data) {
            if (S.dutyLocations(schoolId).some(function (l) { return l.name === data.name; })) {
              UI.toast('هذا المكان موجود بالفعل', 'warn');
              return false;
            }
            S.addDutyLocation(data.name, data.note);
            UI.toast('أُضيف مكان المناوبة', 'ok');
            draw();
          }
        });
      }

      function removeLocation(l) {
        var used = S.list('duties', { locationId: l.id }).length;
        var msg = 'حذف مكان «' + l.name + '»؟' +
          (used ? ' تنبيه: هذا المكان مستخدم في ' + used + ' مناوبة قائمة، وستبقى تلك المناوبات دون مكان معروف.' : '');
        UI.confirm(msg, { ok: 'حذف', danger: true }).then(function (ok) {
          if (!ok) return;
          S.removeDutyLocation(l.id);
          UI.toast('حُذف مكان المناوبة', 'ok');
          draw();
        });
      }

      function locationsPanel() {
        var locs = locations();
        var table = UI.table({
          cols: [
            { label: 'المكان', render: function (l) { return h('strong', { style: { fontWeight: '600' }, text: l.name }); } },
            { label: 'ملاحظة', render: function (l) { return l.note || '—'; } },
            { label: 'المناوبات', render: function (l) { return h('span', { class: 'nums', text: String(S.list('duties', { locationId: l.id }).length) }); } },
            { label: 'إجراءات', class: 'row-actions', render: function (l) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () { removeLocation(l); } })
              ]);
            } }
          ],
          rows: locs,
          empty: 'لا أماكن مناوبة بعد — أضف أول مكان.'
        });
        return UI.panel(
          'أماكن المناوبة',
          'أماكن وقوف المناوبين داخل المدرسة، تُستخدم في التوزيع الآلي واليدوي.',
          [h('button', { class: 'btn btn-soft', type: 'button', text: 'إضافة مكان', onClick: addLocation })],
          [
            h('div', { class: 'muted-block' },
              [h('strong', { text: 'أمثلة على أسماء الأماكن: ' }),
               h('span', { text: 'بجوار المقصف، ساحة المقصف، الدور الأول، الجهة الجنوبية، البوابة الرئيسية، المصلى…' })]),
            h('div', { class: 'mt-4' }, [table])
          ]
        );
      }

      /* ============================================ 5) التذكيرات الآلية */
      function remindersPanel() {
        var sendBtn = h('button', { class: 'btn btn-primary', type: 'button', text: 'إرسال تذكيرات الغد', onClick: function () {
          var res = S.sendDutyReminders();
          if (!res.total) UI.toast('لا توجد مناوبات غدًا لإرسال تذكير لها', 'warn');
          else if (!res.sent) UI.toast('كل تذكيرات الغد أُرسلت سابقًا (' + res.total + ' مناوبة)', 'warn');
          else UI.toast('أُرسل ' + res.sent + ' تذكيرًا من أصل ' + res.total + ' مناوبة غدًا', 'ok');
          draw();
        } });
        var exportBtn = h('button', { class: 'btn btn-outline', type: 'button', text: 'تصدير CSV', onClick: exportWeekly });

        var from = UI.today(), to = addDaysIso(UI.today(), 6);
        var upcoming = S.dutiesBetween(from, to, schoolId);
        var table = UI.table({
          cols: [
            { label: 'التاريخ', render: function (d) { return h('span', { class: 'nums', text: UI.fmtDate(d.date) }); } },
            { label: 'اليوم', render: function (d) { return weekdayName(d.date); } },
            { label: 'المعلم', render: function (d) { return teacherName(d.teacherId); } },
            { label: 'المكان', render: function (d) { return S.locationName(d.locationId); } },
            { label: 'التوقيت', render: function (d) { return d.shift || '—'; } },
            { label: 'الفترات', render: function (d) {
              return h('div', { class: 'cluster' }, [
                h('span', { text: S.slotsLabel(d.slots) }),
                hasExit(d) ? UI.badge('خروج الطلاب', 'brand') : null
              ]);
            } },
            { label: 'حالة التذكير', render: function (d) {
              return d.reminderAt ? UI.badge('أُرسل · ' + UI.fmtTime(d.reminderAt), 'mint') : UI.badge('لم يُرسل', 'amber');
            } },
            { label: 'إجراء', class: 'row-actions', render: function (d) {
              return h('div', { class: 'row-actions' }, [
                h('button', { class: 'mini-btn', type: 'button', text: 'تنبيه على الجوال', onClick: function () {
                  var body = teacherName(d.teacherId) + ' — المكان: ' + S.locationName(d.locationId) +
                    (d.shift ? ' · التوقيت: ' + d.shift : '') + ' · الفترات: ' + S.slotsLabel(d.slots) +
                    (hasExit(d) ? ' ⚠️ عليك مناوبة خروج الطلاب' : '') + ' · ' + UI.fmtDate(d.date);
                  var shown = S.pushMobile('تذكير بالمناوبة', body);
                  UI.toast(shown ? 'أُرسل تنبيه للجوال' : 'لم يُمنح إذن التنبيهات — معاينة داخل المنصة فقط',
                    shown ? 'ok' : 'warn');
                } })
              ]);
            } }
          ],
          rows: upcoming,
          empty: 'لا مناوبات في الأيام السبعة القادمة.'
        });

        return UI.panel(
          'التذكيرات الآلية',
          'يُرسل للمعلم تلقائيًّا تذكير قبل مناوبته بيوم واحد عبر تلقرام.',
          [sendBtn, exportBtn],
          [
            h('div', { class: 'muted-block' },
              [h('strong', { text: 'كيف يعمل التذكير؟ ' }),
               h('span', { text: 'في اليوم السابق لمناوبة المعلم يُرسل له تنبيه عبر تلقرام باسم المدرسة يحوي التاريخ والمكان والتوقيت وفترات المناوبة (الفسحة · بين الحصص · نهاية اليوم). ومن كانت مناوبته تشمل نهاية اليوم يُضاف في رسالته سطر تحذيري نصّه «⚠️ عليك مناوبة خروج الطلاب». ويتحقق النظام من ذلك عند تشغيل المنصة. زرّ «إرسال تذكيرات الغد» يعيد المحاولة يدويًّا للمناوبات التي لم يُرسل لها تذكير.' })]),
            h('div', { class: 'mt-4' }, [table])
          ]
        );
      }

      /* ==================================== 6.5) مناوبو خروج الطلاب (نهاية اليوم) */
      /** صفوف مناوبة خروج الطلاب للأيام السبعة القادمة */
      function exitRows() {
        var rows = [];
        for (var i = 0; i < 7; i++) {
          var date = addDaysIso(UI.today(), i);
          var list = S.exitDutyOf(date).slice().sort(function (a, b) {
            return teacherName(a.teacherId).localeCompare(teacherName(b.teacherId));
          });
          if (!list.length) {
            rows.push({ date: date, day: weekdayName(date), teacher: '—', place: '—', covered: false });
          } else {
            list.forEach(function (d) {
              rows.push({ date: date, day: weekdayName(date), teacher: teacherName(d.teacherId), place: S.locationName(d.locationId), covered: true });
            });
          }
        }
        return rows;
      }

      function exitPanel() {
        var rows = exitRows();
        var covered = rows.filter(function (r) { return r.covered; }).length;
        var table = UI.table({
          cols: [
            { label: 'التاريخ', render: function (r) { return h('span', { class: 'nums', text: UI.fmtDate(r.date) }); } },
            { label: 'اليوم', render: function (r) { return r.day + (r.date === UI.today() ? ' — اليوم' : ''); } },
            { label: 'المعلم', render: function (r) {
              return r.covered ? h('strong', { style: { fontWeight: '600' }, text: r.teacher }) : UI.badge('لا يوجد مناوب خروج', 'plain');
            } },
            { label: 'المكان', render: function (r) { return r.place; } }
          ],
          rows: rows,
          empty: 'لا مناوبة خروج مسجّلة في الأيام السبعة القادمة.'
        });
        return UI.panel(
          'مناوبو خروج الطلاب',
          'مناوبة نهاية اليوم (خروج الطلاب): الأول في كل يوم من التوزيع الآلي يحمل هذه الفترة، ويمكن إسنادها يدويًّا لفترة «نهاية اليوم».',
          null,
          [
            h('div', { class: 'cluster' }, [
              UI.badge('مناوبات خروج مجدولة: ' + covered, covered ? 'brand' : 'amber')
            ]),
            h('div', { class: 'mt-4' }, [table])
          ]
        );
      }

      /* ==================================== 7) الجدول الأسبوعي للطباعة/التصدير */
      function weeklyRows() {
        var rows = [];
        for (var i = 0; i < 7; i++) {
          var date = addDaysIso(UI.today(), i);
          var list = S.dutiesOf(date, schoolId).slice().sort(function (a, b) {
            return teacherName(a.teacherId).localeCompare(teacherName(b.teacherId));
          });
          if (!list.length) {
            rows.push({ date: date, day: weekdayName(date), teacher: '—', place: '—', shift: '—', slots: '—', status: '—' });
          } else {
            list.forEach(function (d) {
              rows.push({
                date: date, day: weekdayName(date), teacher: teacherName(d.teacherId),
                place: S.locationName(d.locationId), shift: d.shift || '—', slots: S.slotsLabel(d.slots),
                status: d.ackAt ? 'تم الاستلام' : (d.reminderAt ? 'أُرسل التذكير' : 'لم يُرسل التذكير')
              });
            });
          }
        }
        return rows;
      }

      function exportWeekly() {
        var rows = weeklyRows();
        if (!rows.length) { UI.toast('لا توجد مناوبات لتصديرها', 'warn'); return; }
        UI.downloadCsv(rows.map(function (r) {
          return { 'التاريخ': r.date, 'اليوم': r.day, 'المعلم': r.teacher, 'المكان': r.place, 'التوقيت': r.shift, 'الفترات': r.slots, 'الحالة': r.status };
        }), 'جدول-المناوبة.csv');
        UI.toast('بدأ تنزيل ملف CSV', 'ok');
      }

      function weeklyReport() {
        var rows = weeklyRows();
        var from = UI.today(), to = addDaysIso(UI.today(), 6);
        var rep = ensureReport('dut', '', 'جدول المناوبة الأسبوعي');
        return {
          type: 'dut', refId: '', code: rep.code,
          title: 'جدول المناوبة الأسبوعي',
          subtitle: (S.school(schoolId) || {}).name,
          meta: [
            { label: 'المدرسة', value: (S.school(schoolId) || {}).name },
            { label: 'الفترة', value: UI.fmtDate(from) + ' — ' + UI.fmtDate(to) },
            { label: 'عدد أيام المناوبة', value: String(rows.length) }
          ],
          sections: [{
            heading: 'الأيام السبعة القادمة — المناوبون وأماكنهم',
            table: {
              cols: ['التاريخ', 'اليوم', 'المعلم', 'المكان', 'التوقيت', 'الفترات', 'الحالة'],
              rows: rows.map(function (r) { return [r.date, r.day, r.teacher, r.place, r.shift, r.slots, r.status]; })
            }
          }, {
            heading: 'مناوبة خروج الطلاب نهاية اليوم',
            table: {
              cols: ['التاريخ', 'اليوم', 'المعلم', 'المكان'],
              rows: exitRows().map(function (r) {
                return [r.date, r.day, r.covered ? r.teacher : 'لا يوجد مناوب خروج', r.covered ? r.place : '—'];
              })
            }
          }]
        };
      }

      function weeklyPanel() {
        var grid = h('div', { class: 'duty-grid' });
        var total = 0;
        for (var i = 0; i < 7; i++) {
          var date = addDaysIso(UI.today(), i);
          var list = S.dutiesOf(date, schoolId).slice().sort(function (a, b) {
            return teacherName(a.teacherId).localeCompare(teacherName(b.teacherId));
          });
          total += list.length;
          var head = h('header', { class: date === UI.today() ? 'is-today' : null }, [
            h('span', { text: weekdayName(date) + (date === UI.today() ? ' — اليوم' : '') }),
            h('span', { class: 'nums', text: UI.fmtDate(date) })
          ]);
          var body = list.length
            ? h('ul', {}, list.map(function (d) {
                return h('li', {}, [
                  h('b', { text: teacherName(d.teacherId) }),
                  h('i', { text: S.locationName(d.locationId) }),
                  h('span', { class: 'muted', text: d.shift || '' }),
                  h('span', { class: 'cluster' }, [
                    h('span', { class: 'muted', text: S.slotsLabel(d.slots) }),
                    hasExit(d) ? UI.badge('خروج الطلاب', 'brand') : null
                  ])
                ]);
              }))
            : h('ul', {}, [h('li', {}, [h('span', { class: 'muted', text: 'لا مناوبات' })])]);
          grid.appendChild(h('div', { class: 'duty-day' }, [head, body]));
        }

        var content = total
          ? grid
          : UI.empty('لا مناوبات في الأيام السبعة القادمة — وزّع المناوبين آليًّا.', null);

        return UI.panel(
          'الجدول الأسبوعي للمناوبة',
          'الأيام السبعة القادمة مع المناوبين وأماكنهم وتوقيتاتهم.',
          [
            UI.reportButton(function () { return weeklyReport(); }, { label: 'طباعة جدول المناوبة' }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: exportWeekly })
          ],
          [content]
        );
      }

      /* ============================================================ الرسم */
      function draw() {
        clear(view);
        view.appendChild(statsRow());
        view.appendChild(todayPanel());
        view.appendChild(exitPanel());
        view.appendChild(distributePanel());
        view.appendChild(locationsPanel());
        view.appendChild(remindersPanel());
        view.appendChild(weeklyPanel());
      }

      draw();
    }
  });
})();
