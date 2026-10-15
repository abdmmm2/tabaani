/* ==========================================================================
   التأسيس الآلي (موظف الأتمتة)
   --------------------------------------------------------------------------
   يأسّس مدرسة كاملة من الصفر: المدرسة والرخصة والمدير والفصول والموظفين
   (بحسابات دخول جاهزة) والطلاب — من ملفات Excel/CSV للعميل.
   بلا خادم وبلا إرسال أي بيانات لأي جهة: كل شيء يُقرأ ويُنشأ داخل جهازك.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var state = { school: {}, principal: {}, files: {}, result: null, error: '' };

  App.register({
    id: 'onboard',
    label: 'التأسيس الآلي',
    icon: '&#129302;',
    roles: ['super'],
    render: function (view) {
      var host = h('div', { class: 'stack' });

      /* ---------------------------------------------- ١) بيانات المدرسة */
      function schoolPanel() {
        var sc = state.school;
        var regionSel = UI.field({
          name: 'region', label: 'المنطقة', type: 'select', half: true,
          options: [{ value: '', label: '— اختر منطقة —' }].concat(S.regions.map(function (r) { return { value: r.id, label: r.name }; }))
            .concat([{ value: '__new', label: '➕ منطقة جديدة…' }]),
          value: sc.regionId || '', placeholder: 'اختر المنطقة'
        });
        var regionNew = UI.field({ name: 'regionNew', label: 'اسم المنطقة الجديدة', half: true, value: sc.regionName || '' });
        var citySel = UI.field({ name: 'city', label: 'المدينة', type: 'select', half: true, placeholder: 'اختر المدينة' });
        var cityNew = UI.field({ name: 'cityNew', label: 'مدينة جديدة', half: true, value: '' });
        function fillCities(keep) {
          var rid = regionSel.input.value === '__new' ? '' : regionSel.input.value;
          var cities = rid ? S.citiesOf(rid) : [];
          UI.clear(citySel.input);
          citySel.input.appendChild(h('option', { value: '', text: 'اختر المدينة' }));
          cities.forEach(function (c) { citySel.input.appendChild(h('option', { value: c, text: c })); });
          if (keep && cities.indexOf(keep) > -1) citySel.input.value = keep;
          cityNew.wrap.hidden = !cities.length;
        }
        regionSel.input.addEventListener('change', function () { fillCities(); });
        fillCities(sc.city);
        if (citySel.input.value === '' && sc.city && S.citiesOf(sc.regionId).indexOf(sc.city) === -1) citySel.input.value = '';

        var cols = ['name', 'code', 'phone', 'email', 'address'];
        var nameF = UI.field({ name: 'name', label: 'اسم المدرسة', half: true, required: true, value: sc.name || '' });
        var codeF = UI.field({ name: 'code', label: 'رمز المدرسة', half: true, value: sc.code || '' });
        var genderF = UI.field({ name: 'gender', label: 'جنس المدرسة', type: 'select', half: true,
          options: [{ value: 'boys', label: 'بنين' }, { value: 'girls', label: 'بنات' }], value: sc.gender || 'boys' });
        var phoneF = UI.field({ name: 'phone', label: 'هاتف المدرسة', half: true, value: sc.phone || '' });
        var emailF = UI.field({ name: 'email', label: 'بريد المدرسة', half: true, value: sc.email || '' });
        var addrF = UI.field({ name: 'address', label: 'العنوان', half: true, value: sc.address || '' });

        /* المراحل */
        var stageBox = h('div', { class: 'chips' });
        var stagePick = (sc.stages || []).slice();
        S.stages.forEach(function (st) {
          var cb = h('input', { type: 'checkbox', checked: stagePick.indexOf(st.id) > -1 });
          cb.addEventListener('change', function () {
            stagePick = S.stages.filter(function (x) {
              return x.id === st.id ? cb.checked : stagePick.indexOf(x.id) > -1;
            }).map(function (x) { return x.id; });
          });
          stageBox.appendChild(h('label', { class: 'checkline' }, [cb, h('span', { text: st.name })]));
        });

        /* الباقة */
        var planF = UI.field({ name: 'plan', label: 'باقة المدرسة', type: 'select', half: true,
          options: S.PLANS.map(function (p) { return { value: p.id, label: p.name + ' — ' + (p.id === 'pro' ? S.planFees().pro : S.planFees().classic) + ' ر.س/سنويًا' }; }),
          value: sc.plan || 'pro' });
        var paidCb = h('input', { type: 'checkbox', checked: sc.setupPaid !== false });

        /* المدير */
        var pName = UI.field({ name: 'pName', label: 'اسم مدير المدرسة', half: true, value: state.principal.name || '' });
        var pPhone = UI.field({ name: 'pPhone', label: 'جوال المدير', half: true, value: state.principal.phone || '' });
        var pEmail = UI.field({ name: 'pEmail', label: 'بريد المدير', half: true, value: state.principal.email || '' });

        var btn = h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ بيانات المدرسة', onClick: function () {
          var rid = regionSel.input.value;
          state.school = {
            name: nameF.input.value.trim(),
            code: codeF.input.value.trim(),
            regionId: rid === '__new' ? '' : rid,
            regionName: rid === '__new' ? regionNew.input.value.trim() : '',
            city: (citySel.input.value || cityNew.input.value || '').trim(),
            gender: genderF.input.value,
            phone: phoneF.input.value.trim(),
            email: emailF.input.value.trim(),
            address: addrF.input.value.trim(),
            stages: stagePick,
            plan: planF.input.value,
            setupPaid: paidCb.checked
          };
          state.principal = { name: pName.input.value.trim(), phone: pPhone.input.value.trim(), email: pEmail.input.value.trim() };
          if (!state.school.name) { UI.toast('اكتب اسم المدرسة', 'warn'); return; }
          if (!state.school.regionId && !state.school.regionName) { UI.toast('اختر منطقة أو اكتب منطقة جديدة', 'warn'); return; }
          UI.toast('حُفظت بيانات المدرسة ✓', 'ok');
          draw();
        } });

        return UI.panel('١) بيانات المدرسة', 'تُنشأ المدرسة + الرخصة + حساب مدير المدرسة — والمنطقة/المدينة تُضاف تلقائيًا إن لم تكن موجودة.', [btn], [
          h('div', { class: 'form-grid' }, [nameF.wrap, codeF.wrap, regionSel.wrap, regionNew.wrap, citySel.wrap, cityNew.wrap,
            genderF.wrap, phoneF.wrap, emailF.wrap, addrF.wrap, planF.wrap]),
          h('div', { class: 'mt-3' }, [h('strong', { text: 'المراحل: ' }), stageBox]),
          h('label', { class: 'checkline', style: { marginTop: '10px' } }, [paidCb, h('span', { text: 'تم سداد رسم التأسيس 1000 ر.س' })]),
          h('div', { class: 'section-head-sm', style: { marginTop: '14px' }, text: 'مدير المدرسة' }),
          h('div', { class: 'form-grid' }, [pName.wrap, pPhone.wrap, pEmail.wrap]),
          h('div', { class: 'callout info', text: 'سيُنشأ للمدير اسم مستخدم وكلمة مرور تلقائيًا، وتظهر في كشف كلمات المرور بعد التأسيس.' })
        ]);
      }

      /* ---------------------------------------------- ٢) ملفات العميل */
      function filesPanel() {
        function fileSlot(key, label, hint, template) {
          var inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
          var info = h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '4px' } });
          function refresh() {
            var f = state.files[key];
            UI.clear(info);
            if (f && f.rows) {
              var map = f.map || {};
              var mapped = Object.keys(map).filter(function (k) { return map[k]; }).length;
              info.appendChild(h('span', { text: f.rows.length + ' صفًا · ' + (f.fileName || '') + ' · أعمدة معروفة: ' + mapped }));
            } else info.appendChild(h('span', { text: 'لم يُرفع ملف' }));
          }
          inp.addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (!f) return;
            UI.readExcel(f).then(function (res) {
              var rows = (res && res.rows) || [];
              if (!rows.length) { UI.toast('الملف لا يحتوي صفوفًا', 'warn'); return; }
              var keys = Object.keys(rows[0]);
              var map = key === 'staff' ? S.guessStaffMap(keys) : (key === 'classes' ? S.guessClassMap(keys) : S.guessStudentMap(keys));
              state.files[key] = { rows: rows, map: map, fileName: f.name };
              UI.toast('قُرئ ' + rows.length + ' صفًا من ' + f.name, 'ok');
              refresh();
            }).catch(function (err) {
              UI.toast('تعذّر قراءة الملف: ' + ((err && err.message) || 'صيغة غير مدعومة'), 'bad');
            });
          });
          refresh();
          return h('div', { class: 'mb-3' }, [
            h('div', { class: 'between' }, [
              h('strong', { text: label }),
              h('div', { class: 'cluster' }, [
                h('label', { class: 'btn btn-outline btn-sm', style: { cursor: 'pointer' } }, [h('span', { text: 'اختر ملف' }), inp]),
                h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'قالب', onClick: function () {
                  UI.downloadCsv(template, 'قالب-' + key + '.csv'); UI.toast('نُزّل القالب', 'ok');
                } })
              ])
            ]),
            h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: hint }),
            info
          ]);
        }
        return UI.panel('٢) ملفات العميل (Excel/CSV)', 'ارفع ما توفّر — الأعمدة تُتعرَّف تلقائيًا. الطلاب وحدهم يكفون لاستنتاج الفصول (مرحلة · صف · شعبة).', [], [
          fileSlot('classes', 'ملف الفصول', 'أعمدة: المرحلة · الصف · الشعبة · الغرفة',
            [{ 'المرحلة': 'المرحلة المتوسطة', 'الصف': 'الأول المتوسط', 'الشعبة': 'أ', 'الغرفة': 'م-101' },
             { 'المرحلة': 'المرحلة الثانوية', 'الصف': 'الأول الثانوي', 'الشعبة': 'أ', 'الغرفة': 'ث-101' }]),
          fileSlot('staff', 'ملف الموظفين', 'أعمدة: الاسم · الدور · المادة · رقم الهوية · الجوال · البريد (يُولَّد لكل واحد حساب دخول)',
            S.staffTemplate()),
          fileSlot('students', 'ملف الطلاب', 'أعمدة: الاسم · رقم الهوية · الجوال · المرحلة · الصف · الشعبة',
            [{ 'الاسم': 'محمد بن سعد', 'رقم الهوية': '1122334455', 'الجوال': '+966501234567', 'المرحلة': 'المرحلة المتوسطة', 'الصف': 'الأول المتوسط', 'الشعبة': 'أ' }]),
          h('div', { class: 'callout warn', text: 'استيراد ملفات PDF غير مدعوم بعد — حوّل ملف العميل إلى Excel/CSV (من Adobe أو أي محوّل) أو اطلب منه نسخة Excel. كل القراءة تحدث داخل جهازك ولا يُرسل شيء لأي جهة.' })
        ]);
      }

      /* ---------------------------------------------- ٣) التأسيس */
      function runPanel() {
        var ready = !!state.school.name && (!!state.school.regionId || !!state.school.regionName);
        var filesCount = Object.keys(state.files).filter(function (k) { return state.files[k] && state.files[k].rows; }).length;
        var btn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'أسّس المدرسة الآن (من الصفر إلى العمل)', onClick: function () {
          var r = S.onboardSchool({ school: state.school, principal: state.principal }, state.files);
          if (!r.ok) { state.error = r.error; UI.toast(r.error, 'bad'); draw(); return; }
          state.result = r; state.error = '';
          UI.toast('أُسّست المدرسة ✓ — ' + r.stats.classes + ' فصلًا · ' + r.stats.students + ' طالبًا · ' + r.stats.staff + ' موظفًا', 'ok');
          if (r.creds && r.creds.length) UI.passwordSheet(r.creds, { title: 'حسابات المدرسة الجديدة' });
          draw();
        } });
        var res = null;
        if (state.result) {
          var r = state.result;
          res = h('div', { class: 'mt-3' }, [
            h('div', { class: 'stat-row' }, [
              UI.statCard('الفصول', String(r.stats.classes), 'أُنشئت تلقائيًا من الملف'),
              UI.statCard('الطلاب', String(r.stats.students), r.stats.studentsSkipped ? r.stats.studentsSkipped + ' مُتخطّى' : 'بلا تكرار'),
              UI.statCard('الموظفون', String(r.stats.staff), r.stats.staffSkipped ? r.stats.staffSkipped + ' مُتخطّى' : 'مع حسابات دخول'),
              UI.statCard('حسابات جاهزة', String(r.stats.credentials), 'اسم مستخدم + كلمة مرور', 'gold')
            ]),
            (r.warnings && r.warnings.length) ? h('div', { class: 'callout warn' }, [
              h('strong', { text: 'ملاحظات: ' }), h('ul', { class: 'promo-steps' }, r.warnings.map(function (w) { return h('li', { text: w }); }))
            ]) : h('div', { class: 'callout tip', text: 'تم التأسيس بلا ملاحظات ✓' }),
            h('div', { class: 'cluster mt-3' }, [
              h('button', { class: 'btn btn-primary', type: 'button', text: 'كشف كلمات المرور', onClick: function () { UI.passwordSheet(r.creds, { title: 'حسابات المدرسة الجديدة' }); } }),
              h('button', { class: 'btn btn-outline', type: 'button', text: 'تنزيل ملف التهيئة (نسخة احتياطية)', onClick: function () {
                UI.downloadText(S.backupJson(), 'تهيئة-' + (state.school.name || 'مدرسة') + '-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
              } }),
              h('button', { class: 'btn btn-soft', type: 'button', text: 'افتح وحدة المدارس والفصول', onClick: function () { App.go('schools'); } }),
              h('button', { class: 'btn btn-outline', type: 'button', text: 'تأسيس مدرسة أخرى', onClick: function () { state = { school: {}, principal: {}, files: {}, result: null, error: '' }; draw(); } })
            ])
          ]);
        }
        return UI.panel('٣) التأسيس', 'ينشئ كل شيء دفعة واحدة: المدرسة · الرخصة · المدير · الفصول · الموظفين (بحساباتهم) · الطلاب — ويصلح لتسليم المدرسة جاهزة.', [btn], [
          h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' }, text:
            (ready ? '✓ بيانات المدرسة جاهزة' : '✗ لم تُحفظ بيانات المدرسة بعد') + ' · ' + filesCount + ' ملف عميل مرفوع' }),
          state.error ? h('div', { class: 'callout warn', text: state.error }) : null,
          res
        ]);
      }

      function draw() {
        clear(host);
        host.appendChild(h('div', { class: 'stack' }, [
          h('div', { class: 'callout info' }, [
            h('strong', { text: 'موظف الأتمتة: ' }),
            h('span', { text: 'استلم ملفات العميل، أسّس مدرسته من الصفر (فصول · موظفون بحساباتهم · طلاب)، وسلّمه بيانات الدخول وكشف جاهز للطباعة — كل ذلك داخل جهازك بلا خادم.' })
          ]),
          schoolPanel(), filesPanel(), runPanel()
        ]));
      }
      draw();
      view.appendChild(host);
    }
  });
})();
