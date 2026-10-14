/* =============================================================================
   finance.js — المالية والاشتراكات (المشرف العام + المحاسب المالي)
   ---------------------------------------------------------------------------
   أربعة تبويبات: السدادات الواردة (سندات التحويل) · الفواتير الإلكترونية ·
   المصروفات (صيانة · سيرفرات · تشغيل · دومين) · التقارير المالية بكل الفترات.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;
  var money = function (n) { return UI.fmtMoney(n) + ' ر.س'; };

  App.register({
    id: 'finance',
    label: 'المالية والاشتراكات',
    icon: '&#128176;',
    roles: ['super', 'accountant'],
    render: function (view) {
      var state = { tab: 'pending', period: 'monthly' };
      var TABS = [
        { key: 'pending', label: 'السدادات الواردة' },
        { key: 'invoices', label: 'الفواتير' },
        { key: 'expenses', label: 'المصروفات' },
        { key: 'reports', label: 'التقارير المالية' },
        { key: 'bank', label: 'بيانات التحويل' }
      ];
      var body = h('div');

      function paint() {
        clear(view);
        var yr = S.financeSummary('annual');
        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('إيرادات السنة', money(yr.revenue), yr.invoiceCount + ' فاتورة', 'gold'),
          UI.statCard('مصروفات السنة', money(yr.expensesTotal), yr.expenseCount + ' بند'),
          UI.statCard('الصافي', money(yr.net), yr.net >= 0 ? 'ربح' : 'عجز'),
          UI.statCard('طلبات سداد معلّقة', String(yr.pendingCount), yr.pendingCount ? money(yr.pendingAmount) + ' بانتظار الاعتماد' : 'لا طلبات')
        ]));
        var bar = h('div', { class: 'tabbar' });
        TABS.forEach(function (t) {
          bar.appendChild(h('button', {
            class: 'tab' + (state.tab === t.key ? ' is-active' : ''), type: 'button', text: t.label,
            onClick: function () { state.tab = t.key; paint(); }
          }));
        });
        view.appendChild(bar);
        view.appendChild(body);
        clear(body);
        ({ pending: pendingTab, invoices: invoicesTab, expenses: expensesTab, reports: reportsTab, bank: bankTab }[state.tab] || pendingTab)(body, paint);
      }

      /* ------------------------- السدادات الواردة ------------------------- */
      function pendingTab(host, redraw) {
        var rows = S.paymentRequests();
        var pend = rows.filter(function (r) { return r.status === 'pending'; });
        host.appendChild(UI.panel('طلبات تفعيل الباقة (سند التحويل)',
          'المدرسة تحوّل بنكيًا ثم ترفع صورة السند مختومة بختمها. باعتمادك: يُسجَّل السداد وتُفعَّل الباقة آليًا وتصدر الفاتورة الإلكترونية.',
          null,
          [pend.length ? UI.table({
            cols: [
              { label: 'المدرسة', render: function (r) { return h('strong', { text: r.schoolName }); } },
              { label: 'المطلوب', render: function (r) { return S.invoiceTitle(r); } },
              { label: 'المبلغ', render: function (r) { return money(r.amount); } },
              { label: 'المُقدِّم', render: function (r) { return r.byName || '—'; } },
              { label: 'التاريخ', render: function (r) { return UI.fmtDate(r.at) + ' · ' + UI.fmtTime(r.at); } },
              { label: 'مرجع التحويل', render: function (r) { return r.transferRef || '—'; } },
              { label: 'إجراءات', class: 'row-actions', render: function (r) {
                  return h('div', { class: 'cluster', style: { gap: '6px' } }, [
                    h('button', { class: 'mini-btn', type: 'button', text: 'عرض السند', onClick: function () { receiptDialog(r, redraw); } }),
                    h('button', { class: 'mini-btn is-primary', type: 'button', text: 'اعتماد وتفعيل', onClick: function () { approve(r, redraw); } }),
                    h('button', { class: 'mini-btn', type: 'button', text: 'رفض', onClick: function () { reject(r, redraw); } })
                  ]);
                } }
            ], rows: pend, empty: 'لا طلبات.'
          }) : UI.empty('لا طلبات سداد جديدة — تصل هنا طلبات المدارس مع صورة سند التحويل المختومة بختم المدرسة.')]));

        var done = rows.filter(function (r) { return r.status !== 'pending'; });
        if (done.length) {
          host.appendChild(UI.panel('سجل الطلبات المُعالجة', null, null, [
            UI.table({
              cols: [
                { label: 'المدرسة', render: function (r) { return r.schoolName; } },
                { label: 'البند', render: function (r) { return S.invoiceTitle(r); } },
                { label: 'المبلغ', render: function (r) { return money(r.amount); } },
                { label: 'الحالة', render: function (r) {
                    return UI.badge(r.status === 'approved' ? 'مُعتمد ومُفعَّل' : 'مرفوض',
                      r.status === 'approved' ? 'ok' : 'danger') ;
                  } },
                { label: 'بواسطة', render: function (r) { return r.decidedBy || '—'; } },
                { label: 'الفاتورة', render: function (r) {
                    var inv = r.invoiceId ? S.invoice(r.invoiceId) : null;
                    if (!inv) return r.status === 'rejected' ? (r.rejectReason || '—') : '—';
                    return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'طباعة ' + inv.no,
                      onClick: function () { UI.printInvoice(inv); } });
                  } }
              ], rows: done, empty: '—'
            })
          ]));
        }
      }

      function receiptDialog(r, redraw) {
        UI.modal({
          title: 'سند التحويل — ' + r.schoolName, wide: true,
          body: [
            h('div', { class: 'lic-grid' }, [
              App._licRow('البند', S.invoiceTitle(r)),
              App._licRow('المبلغ', money(r.amount)),
              App._licRow('مرجع التحويل', r.transferRef || '—'),
              App._licRow('تاريخ التحويل', r.transferDate || '—'),
              App._licRow('المُقدِّم', (r.byName || '—') + ' · ' + UI.fmtDate(r.at)),
              App._licRow('الحالة', r.status === 'pending' ? 'بانتظار الاعتماد' : (r.status === 'approved' ? 'مُعتمد' : 'مرفوض'))
            ]),
            r.note ? h('p', { class: 'lic-note', text: 'ملاحظة المدرسة: ' + r.note }) : null,
            h('div', { class: 'plan-cards', style: { marginTop: '10px' } }, [
              h('div', { class: 'plan-card' }, [
                h('h4', { text: 'سند التحويل (مختوم بختم المدرسة)' }),
                h('img', { src: r.receipt, alt: 'سند التحويل', style: { width: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' } })
              ]),
              r.schoolStamp && r.schoolStamp !== r.receipt ? h('div', { class: 'plan-card' }, [
                h('h4', { text: 'ختم المدرسة' }),
                h('img', { src: r.schoolStamp, alt: 'ختم المدرسة', style: { width: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' } })
              ]) : null
            ])
          ],
          actions: r.status === 'pending' ? [
            { label: 'اعتماد وتفعيل', class: 'btn-primary', onClick: function (close) { close(); approve(r, redraw); } },
            { label: 'رفض', class: 'btn-danger', onClick: function (close) { close(); reject(r, redraw); } },
            { label: 'إغلاق' }
          ] : [{ label: 'إغلاق' }]
        });
      }

      function approve(r, redraw) {
        UI.confirm('اعتماد سداد ' + r.schoolName + ' بمبلغ ' + money(r.amount) + '؟\n' +
          'سيُسجَّل السداد وتُفعَّل الباقة آليًا، وتُصدر فاتورة إلكترونية مختومة بختم «تابعني للخدمات التعليمية».',
          { ok: 'اعتماد وتفعيل' }).then(function (yes) {
          if (!yes) return;
          var res = S.approvePaymentRequest(r.id);
          if (!res.ok) { UI.toast(res.error, 'warn'); return; }
          UI.toast('فُعّلت باقة ' + r.schoolName + ' — فاتورة ' + res.invoice.no, 'ok');
          UI.modal({
            title: 'فُعّلت الباقة ✓ — فاتورة ' + res.invoice.no,
            body: [
              h('p', { class: 'muted', text: 'صدرت الفاتورة الإلكترونية مختومة بختم المنصة، والسريان حتى ' + ((res.state || {}).paidUntil || '—') + '.' }),
              h('div', { class: 'cluster' }, [
                h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'طباعة الفاتورة', onClick: function () { UI.printInvoice(res.invoice); } }),
                h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'عرض الفاتورة', onClick: function () { invoiceDialog(res.invoice); } })
              ])
            ],
            actions: [{ label: 'تم' }]
          });
          redraw();
        });
      }

      function reject(r, redraw) {
        var why = h('textarea', { class: 'input', rows: '2', placeholder: 'سبب الرفض (يصل لمدير المدرسة)' });
        UI.modal({
          title: 'رفض سند التحويل — ' + r.schoolName,
          body: [h('p', { class: 'muted', text: 'مثال: الصورة غير واضحة · المبلغ غير مطابق · لم يظهر ختم المدرسة.' }), why],
          actions: [
            { label: 'رفض الطلب', class: 'btn-danger', onClick: function (close) {
                S.rejectPaymentRequest(r.id, why.value);
                UI.toast('رُفض الطلب وأُشعرت المدرسة', 'warn'); close(); redraw();
              } },
            { label: 'إلغاء' }
          ]
        });
      }

      function invoiceDialog(inv) {
        UI.modal({
          title: 'فاتورة ' + inv.no, wide: true,
          body: [
            h('div', { class: 'lic-grid' }, [
              App._licRow('المدرسة', inv.schoolName || '—'),
              App._licRow('البند', S.invoiceTitle(inv)),
              App._licRow('المبلغ', money(inv.amount)),
              App._licRow('تاريخ الإصدار', UI.fmtDate(inv.at) + ' · ' + UI.fmtTime(inv.at)),
              App._licRow('بواسطة', inv.by || '—'),
              App._licRow('سريان الاشتراك', inv.paidUntil || '—')
            ]),
            h('p', { class: 'lic-note', text: 'الفاتورة مختومة بختم «تابعني للخدمات التعليمية» وتُطبع بترويسة المنصة ورقم الفاتورة والتاريخ والوقت.' })
          ],
          actions: [
            { label: 'طباعة / حفظ PDF', class: 'btn-primary', onClick: function (close) { UI.printInvoice(inv); close(); } },
            { label: 'إغلاق' }
          ]
        });
      }

      /* ------------------------------ الفواتير ------------------------------ */
      function invoicesTab(host, redraw) {
        var all = S.invoices();
        var total = all.reduce(function (a, i) { return a + (Number(i.amount) || 0); }, 0);
        host.appendChild(UI.panel('الفواتير الإلكترونية',
          'كل فاتورة برقمها وتاريخها ووقتها، مختومة بختم «تابعني للخدمات التعليمية» — جاهزة للطباعة أو الحفظ PDF.',
          [
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تسجيل سداد وفاتورة يدويًا', onClick: manualInvoice }),
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'طباعة كشف الفواتير', onClick: function () { printInvoicesReport(all); } })
          ],
          [
            h('div', { class: 'stat-row', style: { marginBottom: '12px' } }, [
              UI.statCard('عدد الفواتير', String(all.length)),
              UI.statCard('إجمالي المبالغ', money(total), null, 'gold')
            ]),
            all.length ? UI.table({
              cols: [
                { label: 'رقم الفاتورة', render: function (i) { return h('code', { text: i.no }); } },
                { label: 'المدرسة', render: function (i) { return i.schoolName || '—'; } },
                { label: 'البند', render: function (i) { return S.invoiceTitle(i); } },
                { label: 'المبلغ', render: function (i) { return money(i.amount); } },
                { label: 'التاريخ', render: function (i) { return UI.fmtDate(i.at); } },
                { label: 'الوقت', render: function (i) { return UI.fmtTime(i.at); } },
                { label: 'بواسطة', render: function (i) { return i.by || '—'; } },
                { label: '', class: 'row-actions', render: function (i) {
                    return h('div', { class: 'cluster', style: { gap: '6px' } }, [
                      h('button', { class: 'mini-btn is-primary', type: 'button', text: 'طباعة', onClick: function () { UI.printInvoice(i); } }),
                      h('button', { class: 'mini-btn', type: 'button', text: 'تفاصيل', onClick: function () { invoiceDialog(i); } })
                    ]);
                  } }
              ], rows: all, empty: 'لا فواتير بعد.'
            }) : UI.empty('لا فواتير بعد — تُصدر تلقائيًا عند اعتماد سند تحويل من المدارس.')
          ]));
      }

      function manualInvoice() {
        var schools = S.list('schools');
        if (!schools.length) { UI.toast('لا مدارس بعد', 'warn'); return; }
        var f = {
          school: UI.field({ name: 'fiSchool', label: 'المدرسة', type: 'select', half: true,
            options: schools.map(function (s) { return { value: s.id, label: s.name }; }) }),
          kind: UI.field({ name: 'fiKind', label: 'البند', type: 'select', half: true,
            options: [{ value: 'annual', label: 'اشتراك سنوي' }, { value: 'setup', label: 'رسم التأسيس والتهيئة' }], value: 'annual' }),
          plan: UI.field({ name: 'fiPlan', label: 'الباقة', type: 'select', half: true,
            options: S.PLANS.map(function (p) { return { value: p.id, label: p.name + ' — ' + S.annualFee(p.id) + ' ر.س' }; }) }),
          years: UI.field({ name: 'fiYears', label: 'عدد السنوات', type: 'number', half: true, value: '1' }),
          ref: UI.field({ name: 'fiRef', label: 'مرجع التحويل (اختياري)', half: true }),
          note: UI.field({ name: 'fiNote', label: 'ملاحظة على الفاتورة', half: true })
        };
        UI.modal({
          title: 'تسجيل سداد وإصدار فاتورة', wide: true,
          body: [h('div', { class: 'form-grid' }, [f.school.wrap, f.kind.wrap, f.plan.wrap, f.years.wrap, f.ref.wrap, f.note.wrap]),
            h('p', { class: 'lic-note', text: 'سيُسجَّل السداد (َيمدّد الاشتراك ويرفع إيقاف الرسوم إن وُجد) ثم تصدر الفاتورة الإلكترونية.' })],
          actions: [
            { label: 'إصدار الفاتورة', class: 'btn-primary', onClick: function (close) {
                var kind = f.kind.input.value, years = Math.max(1, parseInt(f.years.input.value, 10) || 1);
                var pay = S.recordPayment(f.school.input.value, { kind: kind, years: years });
                if (!pay.ok) { UI.toast(pay.error, 'warn'); return; }
                var inv = S.issueInvoice({
                  schoolId: f.school.input.value, plan: f.plan.input.value, kind: kind, years: years,
                  amount: pay.amount, note: f.note.input.value || 'سداد مُسجَّل يدويًا' + (f.ref.input.value ? ' · مرجع: ' + f.ref.input.value : ''),
                  paidUntil: (pay.state || {}).paidUntil || ''
                });
                UI.toast('صدرت الفاتورة ' + inv.no, 'ok');
                close(); paint(); UI.printInvoice(inv);
              } },
            { label: 'إلغاء' }
          ]
        });
      }

      /* ------------------------------ المصروفات ------------------------------ */
      function expensesTab(host, redraw) {
        var all = S.expenses();
        var inputs = {
          title: UI.field({ name: 'exTitle', label: 'بيان المصروف', half: true, placeholder: 'مثال: استضافة السيرفرات — شهري' }),
          category: UI.field({ name: 'exCat', label: 'الفئة', type: 'select', half: true,
            options: S.EXPENSE_CATS.map(function (c) { return { value: c.id, label: c.name }; }) }),
          amount: UI.field({ name: 'exAmount', label: 'المبلغ (ر.س)', type: 'number', half: true }),
          at: UI.field({ name: 'exAt', label: 'التاريخ', type: 'date', half: true, value: UI.today() }),
          vendor: UI.field({ name: 'exVendor', label: 'الجهة / المورّد', half: true }),
          note: UI.field({ name: 'exNote', label: 'ملاحظة', half: true })
        };
        var sum = function (arr) { return arr.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0); };
        host.appendChild(UI.panel('إضافة مصروف',
          'صيانة المنصة · السيرفرات والاستضافة · التشغيل · الدومين والشهادات — كل مصروف يُقيَّد باسمك ووقته.',
          [h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة المصروف', onClick: function () {
            var r = S.addExpense({
              title: inputs.title.input.value, category: inputs.category.input.value,
              amount: inputs.amount.input.value, at: inputs.at.input.value,
              vendor: inputs.vendor.input.value, note: inputs.note.input.value
            });
            if (!r.ok) { UI.toast(r.error, 'warn'); return; }
            UI.toast('أُضيف مصروف ' + money(r.expense.amount), 'ok');
            paint();
          } })],
          [h('div', { class: 'form-grid' }, [inputs.title.wrap, inputs.category.wrap, inputs.amount.wrap, inputs.at.wrap, inputs.vendor.wrap, inputs.note.wrap])]));

        host.appendChild(UI.panel('سجل المصروفات', 'إجمالي المصروفات المسجّلة: ' + money(sum(all)), null, [
          h('div', { class: 'stat-row', style: { marginBottom: '12px' } }, S.EXPENSE_CATS.map(function (c) {
            var v = sum(all.filter(function (e) { return e.category === c.id; }));
            return UI.statCard(c.name, money(v), all.filter(function (e) { return e.category === c.id; }).length + ' بند');
          })),
          all.length ? UI.table({
            cols: [
              { label: 'التاريخ', render: function (e) { return e.at; } },
              { label: 'الفئة', render: function (e) { return UI.badge(S.expenseCat(e.category), 'plain'); } },
              { label: 'البيان', render: function (e) { return h('strong', { text: e.title }); } },
              { label: 'الجهة', render: function (e) { return e.vendor || '—'; } },
              { label: 'المبلغ', render: function (e) { return money(e.amount); } },
              { label: 'بواسطة', render: function (e) { return e.by || '—'; } },
              { label: '', class: 'row-actions', render: function (e) {
                  return h('button', { class: 'mini-btn', type: 'button', text: 'حذف', onClick: function () {
                    UI.confirm('حذف مصروف «' + e.title + '» بمبلغ ' + money(e.amount) + '؟', { ok: 'حذف', danger: true }).then(function (yes) {
                      if (!yes) return;
                      S.deleteExpense(e.id); UI.toast('حُذف المصروف', 'warn'); paint();
                    });
                  } });
                } }
            ], rows: all, empty: 'لا مصروفات مسجّلة.'
          }) : UI.empty('لا مصروفات مسجّلة بعد.')
        ]));
      }

      /* --------------------------- التقارير المالية --------------------------- */
      function reportsTab(host, redraw) {
        var sum = S.financeSummary(state.period);
        var bar = h('div', { class: 'tabbar' });
        S.PERIODS.forEach(function (p) {
          bar.appendChild(h('button', {
            class: 'tab' + (state.period === p.id ? ' is-active' : ''), type: 'button', text: p.name,
            onClick: function () { state.period = p.id; paint(); }
          }));
        });
        host.appendChild(UI.panel('التقرير المالي — ' + sum.period.name,
          'من ' + UI.fmtDate(sum.period.from) + ' إلى ' + UI.fmtDate(sum.period.to) +
          ' · الإيرادات من الفواتير الصادرة، والمصروفات المسجّلة في نفس الفترة.',
          [h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'طباعة التقرير المالي', onClick: function () { printReport(sum); } })],
          [
            bar,
            h('div', { class: 'stat-row', style: { margin: '12px 0' } }, [
              UI.statCard('رسم التأسيس', money(sum.setup)),
              UI.statCard('الاشتراكات السنوية', money(sum.annual)),
              UI.statCard('إجمالي الإيرادات', money(sum.revenue), sum.invoiceCount + ' فاتورة', 'gold'),
              UI.statCard('إجمالي المصروفات', money(sum.expensesTotal), sum.expenseCount + ' بند'),
              UI.statCard('الصافي', money(sum.net), sum.net >= 0 ? 'فائض' : 'عجز', sum.net >= 0 ? 'gold' : null),
              UI.statCard('طلبات معلّقة', String(sum.pendingCount), money(sum.pendingAmount))
            ]),
            h('h4', { text: 'المصروفات بحسب الفئة' }),
            UI.table({
              cols: [
                { label: 'الفئة', render: function (r) { return r.name; } },
                { label: 'عدد البنود', render: function (r) { return String(r.count); } },
                { label: 'المبلغ', render: function (r) { return money(r.total); } }
              ],
              rows: S.EXPENSE_CATS.map(function (c) {
                var arr = sum.expenses.filter(function (e) { return e.category === c.id; });
                return { name: c.name, count: arr.length, total: arr.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0) };
              }), empty: 'لا بنود.'
            }),
            h('h4', { text: 'فواتير الفترة' }),
            sum.invoices.length ? UI.table({
              cols: [
                { label: 'رقم الفاتورة', render: function (i) { return h('code', { text: i.no }); } },
                { label: 'المدرسة', render: function (i) { return i.schoolName; } },
                { label: 'البند', render: function (i) { return S.invoiceTitle(i); } },
                { label: 'المبلغ', render: function (i) { return money(i.amount); } },
                { label: 'التاريخ', render: function (i) { return UI.fmtDate(i.at); } },
                { label: '', class: 'row-actions', render: function (i) {
                    return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'فاتورة', onClick: function () { UI.printInvoice(i); } });
                  } }
              ], rows: sum.invoices, empty: '—'
            }) : UI.empty('لا فواتير في هذه الفترة.'),

            h('h4', { text: 'كل الفترات — نظرة جامعة' }),
            UI.table({
              cols: ['الفترة', 'الفواتير', 'رسم التأسيس', 'الاشتراكات', 'إجمالي الإيرادات', 'المصروفات', 'الصافي'].map(function (c) { return { label: c }; }),
              rows: S.financeAllPeriods().map(function (p) {
                return [p.period.name, String(p.invoiceCount), money(p.setup), money(p.annual), money(p.revenue), money(p.expensesTotal), money(p.net)];
              }), empty: '—'
            }),
            h('h4', { text: 'أداء المدارس والاشتراكات' }),
            h('div', { class: 'lic-grid' }, [
              App._licRow('التحصيل السنوي المتوقّع', money(sum.annualExpected)),
              App._licRow('المدارس', String(sum.schools)),
              App._licRow('اشتراكات موقوفة', String(sum.suspended)),
              App._licRow('اشتراكات متأخّرة', String(sum.overdue))
            ])
          ]));
      }

      function printReport(sum) {
        var rowsSummary = [
          ['رسم التأسيس والتهيئة', money(sum.setup)],
          ['الاشتراكات السنوية', money(sum.annual)],
          ['إجمالي الإيرادات', money(sum.revenue)],
          ['إجمالي المصروفات', money(sum.expensesTotal)],
          ['الصافي', money(sum.net)]
        ];
        UI.printPlatformDoc({
          title: 'التقرير المالي — ' + sum.period.name,
          subtitle: 'من ' + UI.fmtDate(sum.period.from) + ' إلى ' + UI.fmtDate(sum.period.to),
          by: S.session.name,
          meta: [
            { label: 'الفترة', value: sum.period.name + ' (' + sum.period.days + ' يومًا)' },
            { label: 'عدد الفواتير', value: String(sum.invoiceCount) },
            { label: 'عدد بنود المصروفات', value: String(sum.expenseCount) },
            { label: 'طلبات سداد معلّقة', value: String(sum.pendingCount) + (sum.pendingCount ? ' (' + money(sum.pendingAmount) + ')' : '') }
          ],
          sections: [
            { heading: 'الملخّص المالي', table: { cols: ['البند', 'المبلغ'], rows: rowsSummary } },
            { heading: 'المصروفات بحسب الفئة', table: {
                cols: ['الفئة', 'عدد البنود', 'المبلغ'],
                rows: S.EXPENSE_CATS.map(function (c) {
                  var arr = sum.expenses.filter(function (e) { return e.category === c.id; });
                  return [c.name, String(arr.length), money(arr.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0))];
                })
              } },
            { heading: 'الفواتير الصادرة في الفترة', table: {
                cols: ['رقم الفاتورة', 'المدرسة', 'البند', 'المبلغ', 'التاريخ'],
                rows: sum.invoices.map(function (i) { return [i.no, i.schoolName, S.invoiceTitle(i), money(i.amount), UI.fmtDate(i.at)]; })
              } },
            { heading: 'المصروفات التفصيلية', table: {
                cols: ['التاريخ', 'الفئة', 'البيان', 'الجهة', 'المبلغ'],
                rows: sum.expenses.map(function (e) { return [e.at, S.expenseCat(e.category), e.title, e.vendor || '—', money(e.amount)]; })
              } }
          ],
          signatures: ['المحاسب المالي للمنصة', 'المشرف العام'],
          qr: 'مالية|' + sum.period.id + '|' + Math.round(sum.revenue) + '|' + Math.round(sum.expensesTotal),
          qrNote: 'ملخّص مالي — ' + sum.period.name
        });
      }

      function printInvoicesReport(all) {
        UI.printPlatformDoc({
          title: 'كشف الفواتير الإلكترونية',
          subtitle: 'كل الفواتير الصادرة من منصة تابعني — ' + all.length + ' فاتورة',
          by: S.session.name,
          meta: [{ label: 'عدد الفواتير', value: String(all.length) },
            { label: 'الإجمالي', value: money(all.reduce(function (a, i) { return a + (Number(i.amount) || 0); }, 0)) }],
          sections: [{ heading: 'الفواتير', table: {
            cols: ['رقم الفاتورة', 'المدرسة', 'البند', 'المبلغ', 'التاريخ', 'الوقت', 'بواسطة'],
            rows: all.map(function (i) { return [i.no, i.schoolName, S.invoiceTitle(i), money(i.amount), UI.fmtDate(i.at), UI.fmtTime(i.at), i.by || '—']; })
          } }],
          signatures: ['المحاسب المالي للمنصة', 'المشرف العام']
        });
      }

      /* --------------------------- بيانات التحويل --------------------------- */
      function bankTab(host, redraw) {
        var b = S.bank();
        var f = {
          beneficiary: UI.field({ name: 'bkBen', label: 'اسم المستفيد', half: true, value: b.beneficiary }),
          bankName: UI.field({ name: 'bkBank', label: 'البنك', half: true, value: b.bankName }),
          account: UI.field({ name: 'bkAcc', label: 'رقم الحساب', half: true, value: b.account, dir: 'ltr' }),
          iban: UI.field({ name: 'bkIban', label: 'الآيبان (IBAN)', half: true, value: b.iban, dir: 'ltr' }),
          note: UI.field({ name: 'bkNote', label: 'ملاحظة تظهر للمدرسة', half: true, value: b.note })
        };
        host.appendChild(UI.panel('بيانات التحويل البنكي',
          'تظهر لمدير المدرسة في «الاشتراك والدفع» مع تعليمات رفع سند التحويل المختوم بختم المدرسة.',
          [h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'حفظ البيانات', onClick: function () {
            S.saveBank({
              beneficiary: f.beneficiary.input.value, bankName: f.bankName.input.value,
              account: f.account.input.value, iban: f.iban.input.value, note: f.note.input.value
            });
            UI.toast('حُفظت بيانات الحساب ✓', 'ok');
          } })],
          [h('div', { class: 'form-grid' }, [f.beneficiary.wrap, f.bankName.wrap, f.account.wrap, f.iban.wrap, f.note.wrap]),
            h('div', { class: 'lic-note', text: 'الرسوم: رسم التأسيس ' + S.planFees().setupFee + ' ر.س مرة واحدة · كلاسيك ' + S.planFees().classic + ' ر.س سنويًا · برو ' + S.planFees().pro + ' ر.س سنويًا (تُعدَّل من «بيانات المنصة ← الباقات والرسوم»).' })]));
      }

      paint();
    }
  });
})();
