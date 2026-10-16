/* =============================================================================
   platform.js — بيانات تابعني (مشرف عام)
   حالة البيانات · إعادة بيانات العرض التجريبية · البدء من الصفر ·
   نسخة احتياطية (تنزيل/استرجاع).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  App.register({
    id: 'platform',
    label: 'بيانات تابعني',
    icon: '&#128451;',
    roles: ['super'],
    render: function (view) {
      var host = h('div');
      function redraw() { clear(host); draw(); }

      function stat(label, val, sub) { return UI.statCard(label, String(val), sub); }

      function draw() {
        var st = S.dataStats();

        host.appendChild(h('div', { class: 'stat-row' }, [
          stat('المدارس', st.schools, st.schools ? 'مؤسَّسة' : 'لا مدارس بعد'),
          stat('الطلاب', st.students, st.classes + ' فصول'),
          stat('المستخدمون', st.users, 'حسابات تابعني'),
          stat('سجلات الحضور', st.sessions, st.permutations = 'جلسة تحضير')
        ]));

        host.appendChild(UI.panel('حالة البيانات', st.empty
          ? 'النظام فارغ (بدأت من الصفر). أسّس مدرستك من «المناطق والمدن والمدارس».'
          : 'هذه بيانات العرض التجريبية أو بياناتك الحالية — يمكنك أخذ نسخة احتياطية قبل أي تغيير.', null, [
          h('div', { class: 'tbl-wrap' }, [
            h('table', { class: 'dt' }, [
              h('caption', { text: 'ملخص ما في النظام الآن' }),
              h('tbody', {}, [
                h('tr', {}, [h('th', { text: 'المدارس' }), h('td', { text: String(st.schools) })]),
                h('tr', {}, [h('th', { text: 'الفصول' }), h('td', { text: String(st.classes) })]),
                h('tr', {}, [h('th', { text: 'الطلاب' }), h('td', { text: String(st.students) })]),
                h('tr', {}, [h('th', { text: 'المستخدمون' }), h('td', { text: String(st.users) })]),
                h('tr', {}, [h('th', { text: 'جلسات التحضير' }), h('td', { text: String(st.sessions) })]),
                h('tr', {}, [h('th', { text: 'المخالفات' }), h('td', { text: String(st.violations) })]),
                h('tr', {}, [h('th', { text: 'تصاريح الخروج' }), h('td', { text: String(st.permissions) })]),
                h('tr', {}, [h('th', { text: 'إذن خروج منتهٍ' }), h('td', { text: String(st.exits) })]),
                h('tr', {}, [h('th', { text: 'مواد مضافة' }), h('td', { text: String(st.subjects) })])
              ])
            ])
          ])
        ]));

        /* ---------------- الباقات والاشتراكات (كلاسيك · برو) ---------------- */
        var ls = S.licenseStats(), fees = ls.fees;
        var feeIn = {
          setup: h('input', { class: 'input', type: 'number', min: '0', step: '50', value: String(fees.setupFee), style: { width: '130px' } }),
          classic: h('input', { class: 'input', type: 'number', min: '0', step: '50', value: String(fees.classic), style: { width: '130px' } }),
          pro: h('input', { class: 'input', type: 'number', min: '0', step: '50', value: String(fees.pro), style: { width: '130px' } })
        };
        host.appendChild(UI.panel('الباقات والرسوم',
          'باقتان: «تابعني كلاسيك» — كل الوحدات بلا تلقرام · «تابعني برو» — كل الخدمات مع تلقرام. ويُدفع رسم تأسيس وتهيئة مرة واحدة عند البدء.',
          [
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'حفظ الرسوم', onClick: function () {
              S.savePlanFees({ setupFee: feeIn.setup.value, classic: feeIn.classic.value, pro: feeIn.pro.value });
              UI.toast('حُفظت الرسوم ✓', 'ok'); draw();
            } })
          ], [
            h('div', { class: 'stat-row' }, [
              UI.statCard('مدارس على «برو»', String(ls.pro), ls.total ? 'من ' + ls.total + ' مدرسة' : 'لا مدارس'),
              UI.statCard('مدارس على «كلاسيك»', String(ls.classic)),
              UI.statCard('اشتراكات موقوفة', String(ls.suspended),
                ls.suspendedFees ? ls.suspendedFees + ' بسبب عدم السداد' : 'لا إيقاف بسبب الرسوم',
                ls.suspended ? 'gold' : null),
              UI.statCard('التحصيل السنوي المتوقّع', String(ls.annualExpected) + ' ر.س',
                ls.setupExpected ? 'ومتأخّر تأسيس: ' + ls.setupExpected + ' ر.س' : 'رسوم التأسيس مسدَّدة')
            ]),
            h('div', { class: 'form-grid mt-3' }, [
              h('div', { class: 'field' }, [h('label', { text: 'رسم التأسيس والتهيئة (مرة واحدة)' }), feeIn.setup]),
              h('div', { class: 'field' }, [h('label', { text: 'اشتراك «تابعني كلاسيك» السنوي' }), feeIn.classic]),
              h('div', { class: 'field' }, [h('label', { text: 'اشتراك «تابعني برو» السنوي' }), feeIn.pro])
            ]),
            h('p', { class: 'lic-note', text: 'الإيقاف بيد المشرف العام وحده: عدم سداد الرسوم السنوية أو مشكلة تشغيلية — ويُرفع عند السداد أو القرار.' }),
            ls.rows.length ? UI.table({
              cols: [
                { label: 'المدرسة', render: function (r) { return h('strong', { text: r.name }); } },
                { label: 'الباقة', render: function (r) { return S.planDef(r.plan).name; } },
                { label: 'الاشتراك', render: function (r) { return UI.badge(r.label, r.tone); } },
                { label: 'السريان حتى', render: function (r) {
                    return r.paidUntil ? (r.paidUntil + (r.daysLeft !== null ? ' (' + r.daysLeft + ' يومًا)' : '')) : 'لا سداد مسجَّل';
                  } },
                { label: 'السنوي', render: function (r) { return r.annual + ' ر.س'; } },
                { label: 'إجراءات', class: 'row-actions', render: function (r) {
                    var btns = [h('button', { class: 'mini-btn is-primary', type: 'button', text: 'سداد سنة',
                      onClick: function () { App.payFlow(r.schoolId); } })];
                    btns.push(r.suspended
                      ? h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تفعيل', onClick: function () { App.activateFlow(r.schoolId, draw); } })
                      : h('button', { class: 'mini-btn', type: 'button', text: 'إيقاف', onClick: function () { App.suspendFlow(r.schoolId, draw); } }));
                    btns.push(h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { App.licenseDialog(r.schoolId, draw); } }));
                    return h('div', { class: 'cluster', style: { gap: '6px' } }, btns);
                  } }
              ], rows: ls.rows
            }) : UI.empty('لا مدارس بعد — أسّس أول مدرسة من «المناطق والمدن والمدارس».')
          ]));

        /* ---------------- إعادة بيانات العرض التجريبية ---------------- */
        host.appendChild(UI.panel('إعادة بيانات العرض التجريبية', 'ترجّع تابعني إلى بيئة عرض جاهزة: مدرسة و٦ معلمين و٤ فصول و٤٨ طالبًا و٤٢ يومًا من سجل التحضير.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'إعادة بيانات العرض التجريبية', onClick: function () {
            UI.confirm('سيُمسح كل ما في النظام محليًا (مدارس · طلاب · حضور · مخالفات · حسابات · مواد) وتُستعاد بيانات العرض التجريبية. هل أخذت نسخة احتياطية؟', { ok: 'متابعة', danger: true })
              .then(function (ok) {
                if (!ok) return;
                UI.confirm('تأكيد أخير: لا يمكن التراجع عن هذه العملية.', { ok: 'نعم، أعِد بيانات العرض', danger: true }).then(function (ok2) {
                  if (!ok2) return;
                  App.resetFlow({ kind: 'demo' });
                  UI.toast('أُعيدت بيانات العرض التجريبية — سيُحدَّث النظام', 'ok');
                  setTimeout(function () { location.reload(); }, 900);
                });
              });
          } })
        ], [
          h('div', { class: 'callout info', text: 'مناسبة للعرض والتجربة والتدريب: تفتح تابعني على بيانات كاملة بلا إعداد.' })
        ]));

        /* ---------------- البدء من الصفر ---------------- */
        host.appendChild(UI.panel('البدء من الصفر (تابعني فارغة)', 'يمسح كل شيء ويترك النظام فارغًا: لا مدرسة ولا طلاب ولا معلمين — وأنت من يؤسّس مدرسته ويُنشئ حساباتها. حساب المشرف العام يبقى.', [
          h('button', { class: 'btn btn-danger', type: 'button', text: 'البدء من الصفر', onClick: function () {
            UI.confirm('سيُمسح كل شيء في هذا المتصفح وتُبنى تابعني من جديد بيدك. متابعة؟', { ok: 'متابعة', danger: true }).then(function (ok) {
              if (!ok) return;
              UI.confirm('تأكيد أخير: سيفقد النظام كل المدارس والحسابات والبيانات.', { ok: 'نعم، ابدأ من الصفر', danger: true }).then(function (ok2) {
                if (!ok2) return;
                App.resetFlow({ kind: 'empty' });
                UI.toast('صار النظام فارغًا — ابدأ بتأسيس مدرستك', 'ok');
                setTimeout(function () { location.reload(); }, 900);
              });
            });
          } })
        ], [
          h('div', { class: 'callout warn', text: 'لا تستخدم هذا الخيار قبل أخذ نسخة احتياطية إن كانت لديك بيانات تريدها.' })
        ]));

        /* ---------------- إعدادات: مدة صلاحية تصريح الخروج ---------------- */
        var minsF = UI.field({ name: 'permitMinutes', label: 'مدة صلاحية تصريح الخروج (دقيقة)', type: 'number', dir: 'ltr', value: String(S.permitMinutes()), half: true,
          help: 'الافتراضي ٢٠ دقيقة — التصريح يُستخدم مرة واحدة ثم يُلغى.' });
        host.appendChild(UI.panel('مدة صلاحية تصريح الخروج', 'تسري على كل التصاريح الجديدة من لحظة المنح.', null, [
          h('div', { class: 'form-grid' }, [minsF.wrap]),
          h('div', { class: 'panel-actions' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ المدة', onClick: function () {
              var v = parseInt(minsF.input.value, 10);
              if (!v || v < 1) { UI.toast('اكتب مدة صحيحة بالدقائق', 'warn'); return; }
              S.saveSettings({ permitMinutes: v });
              UI.toast('مدة صلاحية التصريح: ' + v + ' دقيقة', 'ok');
              redraw();
            } })
          ]),
          h('div', { class: 'callout info', text: 'التصريح يُستخدم مرة واحدة فقط: بمجرد مسحه عند البوابة يُلغى ولا يُقبل مرة أخرى — وبعد انتهاء المدة يُرفض تلقائيًا.' })
        ]));

        /* ---------------- نسخة احتياطية ---------------- */
        var fileIn = h('input', {
          type: 'file', accept: '.json,application/json', class: 'input',
          onchange: function (e) {
            var f = e.target.files && e.target.files[0];
            if (!f) return;
            UI.confirm('سيُستبدل ما في النظام ببيانات الملف «' + f.name + '». متابعة؟', { ok: 'استرجاع', danger: true }).then(function (ok) {
              if (!ok) { fileIn.value = ''; return; }
              var rd = new FileReader();
              rd.onload = function (ev) {
                var r = S.restoreJson(ev.target.result);
                if (!r.ok) { UI.toast(r.error, 'bad'); return; }
                UI.toast('أُعيدت النسخة الاحتياطية — ' + r.stats.students + ' طالبًا · ' + r.stats.schools + ' مدرسة', 'ok');
                setTimeout(function () { location.reload(); }, 900);
              };
              rd.readAsText(f, 'utf-8');
            });
          }
        });

        host.appendChild(UI.panel('النسخة الاحتياطية', 'احفظ بيانات تابعني في ملف، أو استعِدها من ملف على أي جهاز.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'تنزيل نسخة احتياطية', onClick: function () {
            var name = 'tabaani-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            UI.downloadText(S.backupJson(), name, 'application/json');
          } }),
          h('label', { class: 'btn btn-outline', style: { cursor: 'pointer' } }, [h('span', { text: 'استرجاع من ملف' }), fileIn])
        ], [
          h('div', { class: 'callout tip', text: 'النسخة تحتوي كل شيء (المدارس · الطلاب · الحضور · المخالفات · الاستئذان · الحسابات · الإعدادات). خذها قبل أي تصفير أو قبل تغيير الجهاز.' })
        ]));

        /* ---------------- الحفظ السحابي في Google Drive ---------------- */
        var dc = S.driveConfig();
        var dlog = S.driveLog();
        var logTbl = h('table', { class: 'dt' }, [
          h('caption', { text: 'آخر عمليات الرفع' }),
          h('thead', {}, [h('tr', {}, [
            h('th', { text: 'الوقت' }), h('th', { text: 'الملف' }), h('th', { text: 'الحجم' }), h('th', { text: 'النتيجة' })
          ])]),
          h('tbody', {}, dlog.slice(0, 10).map(function (e) {
            return h('tr', {}, [
              h('td', { text: UI.fmtDateTime(e.at) }),
              h('td', { dir: 'ltr', text: e.name }),
              h('td', { text: (e.size / 1024).toFixed(0) + ' ك.ب' }),
              h('td', {}, [UI.badge(e.note, e.ok ? 'mint' : 'terra')])
            ]);
          }).concat(dlog.length ? [] : [h('tr', {}, [h('td', { colspan: 4, class: 'table-empty', text: 'لا عمليات رفع بعد.' })])]))
        ]);
        var pend = S.drivePending();
        host.appendChild(UI.panel('الحفظ السحابي في Google Drive',
          'اربطه مرة واحدة، وبعدها كل نسخة احتياطية تُرفع تلقائيًا إلى مجلد «' + App.cloud.folderName + '» في درايفك (يحتفظ بآخر ١٢ نسخة).',
          [
            h('button', { class: 'btn btn-primary', type: 'button', text: dc.url ? 'تعديل الربط / اختبار' : 'إعداد الربط', onClick: function () { App.cloud.wizard(draw); } }),
            h('button', { class: 'btn btn-outline', type: 'button', text: 'ارفع آخر نسخة الآن', onClick: function () {
              if (!S.driveConfigured()) { UI.toast('اربط Google Drive أولًا', 'warn'); return; }
              var pl = App.backupPayload();
              UI.toast('جارٍ الرفع…', 'ok');
              App.cloud.upload(pl.text, pl.name, function (err, res, e) {
                UI.toast(err ? ('تعذّر الرفع: ' + err.message) : '✓ ' + e.note, err ? 'bad' : 'ok');
                draw();
              });
            } }),
            dc.folder ? h('a', { class: 'btn btn-outline', href: dc.folder, target: '_blank', rel: 'noopener', text: 'افتح مجلد النسخ في درايف' }) : null,
            dc.url ? h('button', { class: 'btn btn-outline', type: 'button', text: 'افصل الربط', onClick: function () {
              UI.confirm('فصل الربط؟ ستتوقّف الرفوعات التلقائية (النسخ المحلية كما هي).', { ok: 'افصل', danger: true }).then(function (ok) {
                if (!ok) return;
                S.saveDriveConfig({ url: '', enabled: false }); UI.toast('فُصل الربط', 'ok'); draw();
              });
            } }) : null
          ], [
            h('div', { class: 'stat-row' }, [
              UI.statCard('حالة الربط', dc.url ? (dc.enabled ? 'مربوط ومفعّل' : 'مربوط (متوقّف)') : 'غير مربوط',
                dc.url ? (dc.folder ? 'المجلد: ' + App.cloud.folderName : 'اضغط «اختبار» للتأكد') : 'اضغط «إعداد الربط» — خمس دقائق', dc.url ? 'mint' : 'amber'),
              UI.statCard('أُرفعت', String(dc.count) + ' نسخة', dc.lastOk ? 'آخر رفع: ' + UI.fmtDateTime(dc.lastOk) : 'لا رفع بعد', 'gold')
            ]),
            dc.lastError ? h('div', { class: 'callout warn', text: 'آخر خطأ: ' + dc.lastError }) : null,
            pend ? h('div', { class: 'callout warn', text: 'توجد نسخة معلّقة (لم يُتِح الإنترنت رفعها) — تُرفع تلقائيًا عند عودة الاتصال.' }) : null,
            logTbl,
            h('div', { class: 'callout info', text: 'الحفظ السحابي إضافة فوق نسختك المحلية: تبقى المنصة تعمل بلا إنترنت، وتُرفع النسخة عند توفّره.' })
          ]));

        /* ---------------- موعد النسخة الأسبوعية ---------------- */
        var bs = S.backupSchedule();
        function hourLabel(h) { return h < 12 ? (h + ' صباحًا') : (h === 12 ? '١٢ ظهرًا' : ((h - 12) + ' مساءً')); }
        var bkDay = UI.field({ name: 'bkDay', label: 'يوم النسخة', type: 'select', half: true,
          options: S.WEEKDAYS.map(function (n, i) { return { value: String(i), label: n }; }), value: String(bs.weekday) });
        var bkHour = UI.field({ name: 'bkHour', label: 'الساعة', type: 'select', half: true,
          options: (function () { var o = []; for (var x = 0; x < 24; x++) o.push({ value: String(x), label: hourLabel(x) }); return o; })(), value: String(bs.hour) });
        var bkOn = h('input', { type: 'checkbox', checked: bs.enabled });
        var dueNow = S.backupDue();
        host.appendChild(UI.panel('موعد النسخة الاحتياطية',
          'تذكير أسبوعي يظهر داخل تابعني عند أول فتح بعد الموعد — وبضغطة واحدة تُنزَّل النسخة. (المتصفح لا يشغّل المنصة وهي مغلقة.)',
          [
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'حفظ الموعد', onClick: function () {
              S.saveBackupSchedule({ weekday: bkDay.input.value, hour: bkHour.input.value, enabled: bkOn.checked, snoozeUntil: '' });
              UI.toast('حُفظ الموعد: ' + S.scheduleLabel(), 'ok');
              draw();
            } }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تنزيل نسخة الآن', onClick: function () { App.backupNow(); } })
          ], [
            h('div', { class: 'form-grid' }, [bkDay.wrap, bkHour.wrap]),
            h('label', { class: 'checkline', style: { marginTop: '10px' } }, [bkOn, h('span', { text: 'فعّل تذكير النسخة الأسبوعية' })]),
            h('div', { class: 'stat-row', style: { marginTop: '12px' } }, [
              UI.statCard('الموعد الحالي', S.scheduleLabel(), bs.enabled ? 'التذكير مفعّل' : 'التذكير مُعطَّل'),
              UI.statCard('آخر نسخة', S.lastBackupAt() ? UI.fmtDate(S.lastBackupAt()) + ' · ' + UI.fmtTime(S.lastBackupAt()) : 'لم تُؤخذ بعد',
                dueNow.label, dueNow.due ? 'gold' : null)
            ]),
            h('div', { class: 'callout tip' }, [
              h('strong', { text: 'احفظ النسخة في السحابة تلقائيًا: ' }),
              h('span', { text: 'في كروم (كمبيوتر): الإعدادات ← التنزيلات ← اجعل مكان الحفظ مجلد «Google Drive» — فتذهب كل نسخة إلى درايف وحدها بلا أي خطوة إضافية.' }),
              h('br'),
              h('span', { text: 'وعلى الآيباد (سفاري): الإعدادات ← سفاري ← التنزيلات ← «iCloud Drive»؛ أو انقل الملف إلى Google Drive من تطبيق «الملفات».' })
            ]),
            h('div', { class: 'callout info', text: 'الموعد الافتراضي: الخميس ٤ مساءً. وبعد أخذ النسخة يمكنك استرجاع كل شيء على أي جهاز من «استرجاع من ملف» — فاحفظ الملف في مكان آمن لا يضيع.' })
          ]));

        /* المسؤول عن المنصة — يظهر على التعهدات والوثائق الرسمية */
        var own = S.platformOwner();
        var oName = UI.field({ name: 'oName', label: 'المسؤول عن المنصة', half: true, value: own.name, placeholder: 'الاسم الكامل' });
        var oTitle = UI.field({ name: 'oTitle', label: 'الصفة', half: true, value: own.title });
        var oPhone = UI.field({ name: 'oPhone', label: 'الجوال', half: true, value: own.phone });
        var oMail = UI.field({ name: 'oMail', label: 'البريد', half: true, value: own.email });
        var oBot = UI.field({ name: 'oBot', label: 'اسم البوت المراسل', half: true, value: S.botName() });
        host.appendChild(UI.panel('المسؤول عن المنصة', 'يُطبع هذا الاسم على التعهدات والوثائق الرسمية (خدمة التعهدات).', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ', onClick: function () {
            S.savePlatformOwner({ name: oName.input.value, title: oTitle.input.value, phone: oPhone.input.value, email: oMail.input.value });
            S.saveBotName(oBot.input.value);
            UI.toast('حُفظ ✓', 'ok');
          } })
        ], [h('div', { class: 'form-grid' }, [oName.wrap, oTitle.wrap, oPhone.wrap, oMail.wrap, oBot.wrap])]));

        host.appendChild(UI.panel('ملاحظات مهمة', null, null, [
          h('ul', { class: 'promo-steps' }, [
            h('li', { text: 'البيانات محفوظة في متصفح هذا الجهاز فقط (لا خادم بعد) — ولهذا النسخة الاحتياطية مهمة.' }),
            h('li', { text: 'العمليات هنا نهائية ولا يمكن التراجع عنها إلا بالنسخة الاحتياطية.' }),
            h('li', { text: 'عند الانتقال لجهاز آخر: نزّل النسخة من هنا، ثم استعِدها هناك من نفس الشاشة.' })
          ])
        ]));
      }

      draw();
      view.appendChild(host);
    }
  });
})();
