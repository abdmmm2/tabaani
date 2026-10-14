/* =============================================================================
   schools.js — المناطق والمدن والمدارس (مشرف المنصة)
   ---------------------------------------------------------------------------
   الرحلة: يضيف المشرف منطقة ومدينة (ربط انزلاقي بينهما) ← يؤسّس مدرسة ويحدّد
   مراحلها ← ينشئ حساب مدير المدرسة ← تظهر المدرسة في الجدول بحالة «نشطة»
   ويمكن تعديلها أو إيقافها أو حذفها.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var STAGE_TONE = { kg: 'amber', primary: 'brand', middle: 'mint', secondary: 'plain' };

  /* حساب «مشرف المنصة»: هذه الوحدة مسؤولة عن الدور super، والزرع الافتراضي
     لا يتضمّن حسابًا له — نضمن وجوده مرة واحدة ليعمل الدخول ولوحة المشرف. */
  if (!S.list('users', { role: 'super' }).length) {
    S.insert('users', {
      id: 'u-super-1', schoolId: null, role: 'super', name: 'مشرف المنصة',
      nationalId: '', phone: '', email: 'super@tabaani.sa', status: 'active', canLogin: true
    });
  }

  /* إعادة بناء قائمة المدن من المنطقة المختارة (ربط انزلاقي) */
  function fillCity(cityEl, regionId, keep) {
    clear(cityEl);
    cityEl.appendChild(h('option', { value: '', text: 'اختر المدينة' }));
    S.citiesOf(regionId).forEach(function (c) {
      cityEl.appendChild(h('option', { value: c, text: c }));
    });
    if (keep) cityEl.value = keep;
  }

  App.register({
    id: 'schools', label: 'المناطق والمدن والمدارس', icon: '&#127979;', roles: ['super'],
    render: function (view) {
      var state = { regionId: (S.regions[0] || {}).id || '' };

      function regionName(s) {
        return s.regionName || (S.regions.find(function (r) { return r.id === s.regionId; }) || {}).name || '—';
      }

      /* ------------------------------------------------------------ اللوحة */
      function draw() {
        clear(view);
        var schools = S.list('schools');
        var cities = S.regions.reduce(function (a, r) { return a + r.cities.length; }, 0);
        var active = schools.filter(function (s) { return s.status === 'established'; }).length;

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('عدد المدارس', String(schools.length)),
          UI.statCard('المناطق التعليمية', String(S.regions.length)),
          UI.statCard('المدن الإجمالية', String(cities)),
          UI.statCard('المدارس النشطة', String(active), null, 'gold')
        ]));

        view.appendChild(regionPanel());
        view.appendChild(addSchoolPanel());
        view.appendChild(schoolsPanel(schools));
      }

      /* --------------------------------------------- المنطقة والمدينة */
      function regionPanel() {
        var regionSel = UI.field({
          name: 'panelRegion', label: 'المنطقة', type: 'select',
          options: S.regions.map(function (r) { return { value: r.id, label: r.name }; }),
          value: state.regionId, placeholder: 'اختر المنطقة'
        });
        var citySel = UI.field({ name: 'panelCity', label: 'المدينة', type: 'select', placeholder: 'اختر المدينة' });
        var count = h('span', { class: 'chip chip-brand' });

        function fill() {
          state.regionId = regionSel.input.value;
          fillCity(citySel.input, state.regionId, '');
          count.textContent = 'عدد مدن المنطقة: ' + S.citiesOf(state.regionId).length;
        }
        regionSel.input.addEventListener('change', fill);
        fill();

        return UI.panel('المنطقة والمدينة', 'قائمة المدن تُبنى فورًا من المنطقة المختارة (ربط انزلاقي).', [
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة منطقة', onClick: addRegionModal }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إضافة مدينة', onClick: addCityModal })
        ], [
          h('div', { class: 'form-grid' }, [regionSel.wrap, citySel.wrap]),
          h('div', { class: 'cluster mt-4' }, [count])
        ]);
      }

      function addRegionModal() {
        UI.formModal({
          title: 'إضافة منطقة تعليمية', submitLabel: 'إضافة',
          fields: [{ name: 'name', label: 'اسم المنطقة', required: true, half: true, placeholder: 'مثال: منطقة تبوك' }],
          onSubmit: function (d) {
            var name = d.name.trim();
            if (S.regions.some(function (r) { return r.name === name; })) { UI.toast('المنطقة موجودة مسبقًا', 'warn'); return false; }
            addRegion(name);
            return true;
          }
        });
      }
      function addRegion(name) {
        S.regions.push({ id: S.uid('rg'), name: name, cities: [] });
        S.save();
        UI.toast('أُضيفت المنطقة: ' + name, 'ok');
        draw();
      }

      function addCityModal() {
        UI.formModal({
          title: 'إضافة مدينة', submitLabel: 'إضافة',
          fields: [
            {
              name: 'regionId', label: 'المنطقة', type: 'select', required: true, half: true,
              options: S.regions.map(function (r) { return { value: r.id, label: r.name }; }),
              value: state.regionId, placeholder: 'اختر المنطقة'
            },
            { name: 'name', label: 'اسم المدينة', required: true, half: true }
          ],
          onSubmit: function (d) {
            var region = S.regions.find(function (r) { return r.id === d.regionId; });
            if (!region) { UI.toast('اختر المنطقة أولًا', 'warn'); return false; }
            var name = d.name.trim();
            if (region.cities.indexOf(name) > -1) { UI.toast('المدينة موجودة في هذه المنطقة', 'warn'); return false; }
            addCity(region, name);
            return true;
          }
        });
      }
      function addCity(region, name) {
        region.cities.push(name);
        S.save();
        UI.toast('أُضيفت المدينة: ' + name + ' إلى ' + region.name, 'ok');
        draw();
      }

      /* --------------------------------------------- إضافة مدرسة وتأسيسها */
      function addSchoolPanel() {
        return UI.panel('إضافة مدرسة وتأسيسها', 'أنشئ المدرسة وحدّد مراحلها، وأنشئ حساب مديرها إن رغبت.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة مدرسة', onClick: schoolCreateModal })
        ], [
          h('p', { class: 'muted', text: 'بعد التأسيس تظهر المدرسة في الجدول أدناه، ويمكن لحساب مدير المدرسة إنشاء بقية الحسابات وإسناد المواد.' })
        ]);
      }

      function baseFields(school) {
        return [
          { name: 'name', label: 'اسم المدرسة', required: true, half: true, value: school ? school.name : '' },
          { name: 'code', label: 'رمز المدرسة', half: true, value: school ? school.code || '' : '', help: 'مثال: RYD-11024' },
          {
            name: 'regionId', label: 'المنطقة', type: 'select', half: true, placeholder: 'اختر المنطقة',
            options: S.regions.map(function (r) { return { value: r.id, label: r.name }; }),
            value: school ? school.regionId : (S.regions[0] && S.regions[0].id)
          },
          { name: 'city', label: 'المدينة', type: 'select', half: true, placeholder: 'اختر المدينة', value: school ? school.city : '' },
          { name: 'address', label: 'العنوان', half: true, value: school ? school.address || '' : '' },
          { name: 'location', label: 'الموقع (رابط أو إحداثيات)', half: true, value: school ? school.location || '' : '' },
          { name: 'phone', label: 'الهاتف', half: true, value: school ? school.phone || '' : '' },
          { name: 'email', label: 'البريد الإلكتروني', half: true, value: school ? school.email || '' : '' },
          {
            name: 'gender', label: 'جنس المدرسة', type: 'select', half: true, required: true,
            help: 'يحدّد المسمّيات في المنصة: طلاب ← وكيل/معلم/مدير · طالبات ← وكيلة/معلمة/مديرة',
            options: S.genders.map(function (g) { return { value: g.id, label: g.name }; }),
            value: school ? (school.gender || 'boys') : 'boys'
          }
        ];
      }

      function stagesPicker(selected) {
        var boxes = {};
        var list = S.stages.map(function (st) {
          var cb = h('input', { type: 'checkbox', value: st.id, checked: (selected || []).indexOf(st.id) > -1 });
          boxes[st.id] = cb;
          return h('label', {}, [cb, h('span', { text: st.name + ' — ' + st.short })]);
        });
        var el = h('div', { class: 'field full' }, [
          h('label', { text: 'المراحل (مرحلة واحدة على الأقل)' }),
          h('div', { class: 'pick-list' }, list)
        ]);
        return {
          el: el,
          values: function () {
            return S.stages.filter(function (st) { return boxes[st.id].checked; }).map(function (st) { return st.id; });
          }
        };
      }

      function schoolCreateModal() {
        var picker = stagesPicker([]);
        var pstate = { create: false };
        var pName = UI.field({ name: 'principalName', label: 'اسم مدير المدرسة', half: true });
        var pPhone = UI.field({ name: 'principalPhone', label: 'جوال مدير المدرسة', half: true });
        var pEmail = UI.field({ name: 'principalEmail', label: 'بريد مدير المدرسة', half: true });
        var pBlock = h('div', { class: 'form-grid mt-3', hidden: true }, [pName.wrap, pPhone.wrap, pEmail.wrap]);
        var pToggle = h('input', { type: 'checkbox' });
        pToggle.addEventListener('change', function () { pstate.create = pToggle.checked; pBlock.hidden = !pToggle.checked; });

        var fm = UI.formModal({
          title: 'إضافة مدرسة وتأسيسها', wide: true, submitLabel: 'تأسيس المدرسة',
          intro: 'الحقول المعلَّمة بـ * إلزامية. تُحفظ المدرسة بالحالة «نشطة» مباشرة.',
          fields: baseFields(null),
          onSubmit: function (d) {
            var stages = picker.values();
            if (!stages.length) { UI.toast('اختر مرحلة واحدة على الأقل', 'warn'); return false; }
            if (pstate.create && !pName.input.value.trim()) { UI.toast('اسم مدير المدرسة مطلوب لإنشاء الحساب', 'warn'); return false; }
            var region = S.regions.find(function (r) { return r.id === d.regionId; }) || null;
            var school = S.insert('schools', {
              name: d.name.trim(), code: d.code, regionId: d.regionId, regionName: region ? region.name : '',
              city: d.city, address: d.address, location: d.location, phone: d.phone, email: d.email,
              stages: stages, status: 'established', logo: '', createdBy: S.session.userId
            });
            if (pstate.create) {
              S.insert('users', {
                schoolId: school.id, role: 'principal', name: pName.input.value.trim(),
                phone: pPhone.input.value.trim(), email: pEmail.input.value.trim(),
                status: 'active', canLogin: true, subjects: []
              });
            }
            S.notify({
              kind: 'school', ref: school.id, title: 'تأسيس مدرسة: ' + school.name,
              body: regionName(school) + ' — ' + (school.city || '') + (pstate.create ? ' · أُنشئ حساب مدير المدرسة' : ''),
              to: ['super']
            });
            UI.toast('أُسست المدرسة: ' + school.name, 'ok');
            draw();
            return true;
          }
        });

        fm.body.appendChild(picker.el);
        fm.body.appendChild(h('label', { class: 'checkbox mt-3' }, [pToggle, h('span', { text: 'إنشاء حساب مدير المدرسة الآن' })]));
        fm.body.appendChild(pBlock);

        var regionEl = fm.box.querySelector('[name="regionId"]');
        var cityEl = fm.box.querySelector('[name="city"]');
        fillCity(cityEl, regionEl.value, '');
        regionEl.addEventListener('change', function () { fillCity(cityEl, regionEl.value, ''); });
      }

      function schoolEditModal(school) {
        var picker = stagesPicker(school.stages || []);
        var fm = UI.formModal({
          title: 'تعديل بيانات المدرسة', wide: true, submitLabel: 'حفظ التعديلات',
          fields: baseFields(school),
          onSubmit: function (d) {
            var stages = picker.values();
            if (!stages.length) { UI.toast('اختر مرحلة واحدة على الأقل', 'warn'); return false; }
            var region = S.regions.find(function (r) { return r.id === d.regionId; }) || null;
            S.update('schools', school.id, {
              name: d.name.trim(), code: d.code, regionId: d.regionId, regionName: region ? region.name : '',
              city: d.city, address: d.address, location: d.location, phone: d.phone, email: d.email, stages: stages
            });
            UI.toast('حُدّثت بيانات المدرسة', 'ok');
            draw();
            return true;
          }
        });
        fm.body.appendChild(picker.el);
        var regionEl = fm.box.querySelector('[name="regionId"]');
        var cityEl = fm.box.querySelector('[name="city"]');
        fillCity(cityEl, regionEl.value, school.city);
        regionEl.addEventListener('change', function () { fillCity(cityEl, regionEl.value, ''); });
      }

      /* --------------------------------------------- جدول المدارس */
      function actions(s) {
        return h('div', { class: 'row-actions' }, [
          h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { schoolEditModal(s); } }),
          h('button', {
            class: 'mini-btn', type: 'button', text: s.status === 'established' ? 'إيقاف' : 'تأسيس',
            onClick: function () {
              var suspend = s.status === 'established';
              S.update('schools', s.id, { status: suspend ? 'suspended' : 'established' });
              UI.toast(suspend ? 'أُوقفت المدرسة' : 'أُعيد تأسيس المدرسة', 'ok');
              draw();
            }
          }),
          h('button', {
            class: 'mini-btn is-danger', type: 'button', text: 'حذف',
            onClick: function () {
              UI.confirm('حذف المدرسة «' + s.name + '» إجراء لا يمكن التراجع عنه. متابعة؟', { ok: 'حذف', danger: true }).then(function (ok) {
                if (!ok) return;
                S.remove('schools', s.id);
                UI.toast('حُذفت المدرسة', 'warn');
                draw();
              });
            }
          })
        ]);
      }

      function schoolsPanel(schools) {
        var reportBtn = UI.reportButton(function () {
          var rep = S.registerReport('schools', 'all', { title: 'تقرير المدارس المسجّلة' });
          return {
            type: 'schools', refId: 'all', code: rep.code,
            title: 'تقرير المدارس المسجّلة', subtitle: 'المناطق والمدن والمراحل',
            meta: [
              { label: 'عدد المدارس', value: schools.length },
              { label: 'المدارس النشطة', value: schools.filter(function (s) { return s.status === 'established'; }).length },
              { label: 'المناطق', value: S.regions.length },
              { label: 'المدن', value: S.regions.reduce(function (a, r) { return a + r.cities.length; }, 0) }
            ],
            sections: [{
              heading: 'بيانات المدارس',
              table: {
                cols: ['م', 'اسم المدرسة', 'المنطقة', 'المدينة', 'المراحل', 'مدير المدرسة', 'الحالة'],
                rows: schools.map(function (s, i) {
                  var p = S.list('users', { schoolId: s.id, role: 'principal' })[0];
                  return [i + 1, s.name, regionName(s), s.city || '—',
                    (s.stages || []).map(function (id) { return S.stageName(id); }).join(' · '),
                    p ? p.name : '—', s.status === 'established' ? 'نشطة' : 'موقوفة'];
                })
              }
            }],
            signatures: ['مشرف المنصة']
          };
        }, { label: 'طباعة التقرير', class: 'btn-outline' });

        var body = schools.length ? UI.table({
          cols: [
            { label: 'اسم المدرسة', render: function (s) { return h('strong', { text: s.name }); } },
            { label: 'المنطقة', render: function (s) { return regionName(s); } },
            { label: 'المدينة', render: function (s) { return s.city || '—'; } },
            {
              label: 'الجنس', render: function (s) {
                var girls = (s.gender === 'girls');
                return UI.badge(girls ? 'طالبات' : 'طلاب', girls ? 'plain' : 'mint');
              }
            },
            {
              label: 'المراحل', render: function (s) {
                var st = s.stages || [];
                if (!st.length) return '—';
                return h('div', { class: 'cluster', style: { gap: '6px' } }, st.map(function (id) {
                  return UI.badge(S.stageName(id), STAGE_TONE[id] || 'plain');
                }));
              }
            },
            {
              label: 'مدير المدرسة', render: function (s) {
                var p = S.list('users', { schoolId: s.id, role: 'principal' })[0];
                return p ? p.name : '—';
              }
            },
            {
              label: 'الحالة', render: function (s) {
                return UI.badge(s.status === 'established' ? 'نشطة' : 'موقوفة', s.status === 'established' ? 'mint' : 'amber');
              }
            },
            {
              label: 'تبديل الجنس', render: function (s) {
                return h('button', {
                  class: 'mini-btn', type: 'button',
                  text: (s.gender === 'girls') ? 'اجعله طلابًا' : 'اجعله طالبات',
                  onClick: function () {
                    var next = (s.gender === 'girls') ? 'boys' : 'girls';
                    UI.confirm('تحويل "' + s.name + '" إلى مدرسة ' + (next === 'girls' ? 'طالبات' : 'طلاب') + '؟ ستتغيّر المسمّيات (وكيل/وكيلة، معلم/معلمة…) في كل المنصة لهذه المدرسة.',
                      { ok: 'تحويل', danger: false }).then(function (ok) {
                      if (!ok) return;
                      S.setSchoolGender(s.id, next);
                      UI.toast('حُدِّث جنس المدرسة', 'ok');
                      if (S.session.schoolId === s.id) { App.shell(); }
                      else draw();
                    });
                  }
                });
              }
            },
            { label: 'إجراءات', render: function (s) { return actions(s); } }
          ], rows: schools,
          empty: 'لا توجد مدارس بعد.'
        }) : UI.empty('لا توجد مدارس بعد — ابدأ بتأسيس أول مدرسة.', h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة مدرسة', onClick: schoolCreateModal }));

        return UI.panel('المدارس المسجّلة', 'كل مدارس المنصة مرتّبة بحسب المنطقة والمدينة.', [reportBtn], [body]);
      }

      draw();
    }
  });
})();
