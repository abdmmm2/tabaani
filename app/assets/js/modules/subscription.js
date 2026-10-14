/* =============================================================================
   subscription.js — «الاشتراك والدفع» (مدير المدرسة)
   ---------------------------------------------------------------------------
   يحوّل المدرسة المبلغ بنكيًا ← يرفع صورة سند التحويل مختومة بختم المدرسة ←
   تعتمد إدارة المنصة ← تُفعَّل الباقة آليًا وتصدر الفاتورة الإلكترونية المختومة.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;
  var money = function (n) { return UI.fmtMoney(n) + ' ر.س'; };

  App.register({
    id: 'subscription',
    label: 'الاشتراك والدفع',
    icon: '&#128179;',
    roles: ['principal'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var receipt = { dataUrl: '', meta: null };
      var stamp = { dataUrl: '' };

      function draw() {
        clear(view);
        var st = S.licenseState(schoolId);
        var fees = S.planFees();
        var bank = S.bank();

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الباقة الحالية', st.planName, st.telegram ? 'تشمل تلقرام' : 'بلا تلقرام', 'gold'),
          UI.statCard('الاشتراك السنوي', money(st.annual)),
          UI.statCard('السريان حتى', st.paidUntil || '—', st.daysLeft !== null && st.daysLeft !== undefined ? st.daysLeft + ' يومًا' : 'لا سداد مسجَّل'),
          UI.statCard('رسم التأسيس', money(st.setupFee), st.setupPaid ? 'مسدَّد ✓' : 'غير مسدَّد')
        ]));

        view.appendChild(h('div', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('div', {}, [h('h3', { text: 'باقة المدرسة والاشتراك' }),
              h('p', { class: 'muted', text: st.planName + ' — ' + S.planDef(st.plan).tagline })]),
            App.licenseBadge(schoolId)
          ]),
          h('div', { class: 'panel-body' }, [
            h('div', { class: 'lic-banner is-' + App._licTone(st) }, [App.licenseLine ? App.licenseLine(st) : h('span', { class: 'muted', text: st.label })]),
            st.blocked ? h('div', { class: 'lic-banner is-danger', style: { marginTop: '10px' } }, [
              h('strong', { text: 'دخول المدرسة موقوف' }),
              h('span', { class: 'muted', text: st.reason === 'fees' ? '— الاشتراك غير مسدَّد. حوّل المبلغ وارفع سند التحويل ويعود الدخول فور الاعتماد.' : '— قرار من إدارة المنصة: ' + (st.note || '') })
            ]) : null,
            !st.telegram ? h('div', { class: 'plan-hint', style: { marginTop: '10px' } }, [
              h('span', { html: '&#9733;', style: { color: 'var(--amber-600)' } }),
              h('span', { text: 'باقتك «تابعني كلاسيك»: المنصة كاملة بلا تلقرام. ترقية «برو» تضيف إشعارات تلقرام والتحقق بمرحلتين — اختر «برو» عند رفع سند التحويل وسنتولّى الباقي.' })
            ]) : null
          ])
        ]));

        /* بيانات التحويل */
        view.appendChild(UI.panel('التحويل البنكي', bank.note, null, [
          h('div', { class: 'lic-grid' }, [
            App._licRow('اسم المستفيد', bank.beneficiary),
            App._licRow('البنك', bank.bankName),
            App._licRow('رقم الحساب', bank.account),
            App._licRow('الآيبان (IBAN)', bank.iban),
            App._licRow('رسم التأسيس (مرة واحدة)', money(fees.setupFee)),
            App._licRow('الاشتراك السنوي', 'كلاسيك ' + fees.classic + ' · برو ' + fees.pro + ' ر.س')
          ])
        ]));

        /* رفع السند */
        var kindF = UI.field({ name: 'subKind', label: 'المطلوب', type: 'select', half: true,
          options: [{ value: 'annual', label: 'اشتراك سنوي' }, { value: 'setup', label: 'رسم التأسيس والتهيئة' }], value: 'annual' });
        var planF = UI.field({ name: 'subPlan', label: 'الباقة المطلوبة', type: 'select', half: true,
          options: S.PLANS.map(function (p) { return { value: p.id, label: p.name + ' — ' + S.annualFee(p.id) + ' ر.س سنويًا' }; }), value: st.plan });
        var yearsF = UI.field({ name: 'subYears', label: 'عدد السنوات', type: 'number', half: true, value: '1' });
        var refF = UI.field({ name: 'subRef', label: 'مرجع التحويل (اختياري)', half: true });
        var dateF = UI.field({ name: 'subDate', label: 'تاريخ التحويل', type: 'date', half: true, value: UI.today() });
        var noteF = UI.field({ name: 'subNote', label: 'ملاحظة للإدارة', half: true });

        var preview = h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'لم يُرفع سند بعد.' });
        var receiptInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        receiptInput.addEventListener('change', function () {
          var file = receiptInput.files && receiptInput.files[0];
          if (!file) return;
          UI.compressImage(file, { max: 1100, quality: 0.66 }).then(function (r) {
            receipt.dataUrl = r.dataUrl; receipt.meta = r;
            clear(preview);
            preview.appendChild(h('div', {}, [
              h('img', { src: r.dataUrl, style: { maxWidth: '260px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' } }),
              h('div', { text: 'سند التحويل — ' + r.w + '×' + r.h + ' · ' + r.kb + ' ك.ب ✓' })
            ]));
          }).catch(function (e) { UI.toast(e.message || 'تعذّر ضغط الصورة', 'warn'); });
        });
        var stampInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        var stampNote = h('span', { class: 'muted', text: 'اختياري — إن كان لديك ملف ختم المدرسة منفصلًا.' });
        stampInput.addEventListener('change', function () {
          var file = stampInput.files && stampInput.files[0];
          if (!file) return;
          UI.compressImage(file, { max: 600, quality: 0.7 }).then(function (r) {
            stamp.dataUrl = r.dataUrl;
            stampNote.textContent = 'ختم المدرسة مرفق ✓ (' + r.w + '×' + r.h + ')';
          });
        });

        var amount = h('div', { class: 'lic-row' }, [h('span', { class: 'lr-k', text: 'المبلغ المطلوب' }), h('span', { class: 'lr-v', text: money(S.annualFee(st.plan)) })]);
        function refreshAmount() {
          var kind = kindF.input.value, plan = planF.input.value, y = Math.max(1, parseInt(yearsF.input.value, 10) || 1);
          var total = kind === 'setup' ? fees.setupFee : S.annualFee(plan) * y;
          clear(amount);
          amount.appendChild(h('span', { class: 'lr-k', text: 'المبلغ المطلوب تحويله' }));
          amount.appendChild(h('span', { class: 'lr-v', text: money(total) }));
          planF.wrap.hidden = kind === 'setup';
          yearsF.wrap.hidden = kind === 'setup';
        }
        kindF.input.addEventListener('change', refreshAmount);
        planF.input.addEventListener('change', refreshAmount);
        yearsF.input.addEventListener('change', refreshAmount);
        refreshAmount();

        view.appendChild(UI.panel('رفع سند التحويل وطلب التفعيل',
          'حوّل المبلغ على الحساب أعلاه، ثم ارفع صورة سند التحويل مختومًا بختم المدرسة — وبعد الاعتماد تُصدر فاتورتك الإلكترونية وتُفعَّل الباقة آليًا.',
          [h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إرسال الطلب', onClick: function () {
            if (!receipt.dataUrl) { UI.toast('ارفع صورة سند التحويل أولًا', 'warn'); return; }
            var p = S.createPaymentRequest({
              schoolId: schoolId, kind: kindF.input.value, plan: planF.input.value,
              years: yearsF.input.value, transferRef: refF.input.value, transferDate: dateF.input.value,
              note: noteF.input.value, receipt: receipt.dataUrl, schoolStamp: stamp.dataUrl || receipt.dataUrl
            });
            if (!p.ok) { UI.toast(p.error, 'warn'); return; }
            UI.toast('أُرسل الطلب — وصل لإدارة المنصة والمحاسب المالي ✓', 'ok');
            receipt.dataUrl = ''; draw();
          } })],
          [
            h('div', { class: 'form-grid' }, [kindF.wrap, planF.wrap, yearsF.wrap, refF.wrap, dateF.wrap, noteF.wrap]),
            h('div', { class: 'grid-2-app', style: { marginTop: '10px' } }, [
              h('div', {}, [
                h('label', { class: 'checkline', text: '' }),
                h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'اختيار صورة سند التحويل (مختوم بختم المدرسة)', onClick: function () { receiptInput.click(); } }),
                receiptInput, preview
              ]),
              h('div', {}, [
                h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'رفع صورة ختم المدرسة (اختياري)', onClick: function () { stampInput.click(); } }),
                stampInput, h('div', { style: { fontSize: 'var(--fs-xs)', marginTop: '6px' } }, [stampNote])
              ])
            ]),
            h('div', { style: { marginTop: '10px' } }, [amount])
          ]));

        /* طلباتي */
        var reqs = S.paymentRequests({ schoolId: schoolId });
        view.appendChild(UI.panel('طلبات السداد', 'حالة كل طلب — والاعتماد يُفعّل الباقة ويصدر الفاتورة.', null, [
          reqs.length ? UI.table({
            cols: [
              { label: 'التاريخ', render: function (r) { return UI.fmtDate(r.at); } },
              { label: 'المطلوب', render: function (r) { return S.invoiceTitle(r); } },
              { label: 'المبلغ', render: function (r) { return money(r.amount); } },
              { label: 'الحالة', render: function (r) {
                  var map = { pending: ['بانتظار الاعتماد', 'warn'], approved: ['مُعتمد ومُفعَّل', 'ok'], rejected: ['مرفوض', 'danger'] };
                  var m = map[r.status] || ['—', 'plain'];
                  return UI.badge(m[0], m[1]);
                } },
              { label: 'ملاحظات', render: function (r) { return r.status === 'rejected' ? (r.rejectReason || '—') : (r.decidedBy ? 'بواسطة ' + r.decidedBy : '—'); } },
              { label: '', class: 'row-actions', render: function (r) {
                  var inv = r.invoiceId ? S.invoice(r.invoiceId) : null;
                  return inv ? h('button', { class: 'mini-btn is-primary', type: 'button', text: 'طباعة الفاتورة', onClick: function () { UI.printInvoice(inv); } }) : h('span', { class: 'muted', text: '—' });
                } }
            ], rows: reqs, empty: 'لا طلبات.'
          }) : UI.empty('لا طلبات سداد بعد.')
        ]));

        /* فواتيري */
        var invs = S.invoices(schoolId);
        view.appendChild(UI.panel('فواتيري الإلكترونية',
          'كل فاتورة مختومة بختم «تابعني للخدمات التعليمية» — برقم الفاتورة والتاريخ والوقت.', null, [
          invs.length ? UI.table({
            cols: [
              { label: 'رقم الفاتورة', render: function (i) { return h('code', { text: i.no }); } },
              { label: 'البند', render: function (i) { return S.invoiceTitle(i); } },
              { label: 'المبلغ', render: function (i) { return money(i.amount); } },
              { label: 'التاريخ', render: function (i) { return UI.fmtDate(i.at) + ' · ' + UI.fmtTime(i.at); } },
              { label: 'سريان الاشتراك', render: function (i) { return i.paidUntil || '—'; } },
              { label: '', class: 'row-actions', render: function (i) {
                  return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'طباعة', onClick: function () { UI.printInvoice(i); } });
                } }
            ], rows: invs, empty: 'لا فواتير بعد.'
          }) : UI.empty('لا فواتير بعد — تصدر تلقائيًا بعد اعتماد سند التحويل.')
        ]));
      }

      draw();
    }
  });
})();
