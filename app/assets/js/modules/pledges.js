/* ==========================================================================
   خدمة التعهدات — دور «مختص تابعني» (الوكيل الوحيد للتواصل مع تابعني)
   --------------------------------------------------------------------------
   القاعدة: لا خدمة لأي مدرسة إلا بطلب من مديرها، يوافق عليه المشرف العام،
   ثم ينفّذه مختص تابعني بتعهد يوقّعه هو ومدير المدرسة، ويُرسل عبر بوت
   «مساعد مدير المدرسة»، ويُرفع التقرير هنا تحت «خدمة التعهدات».
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h;

  var STATUS = { 'new': 'جديد', 'approved': 'معتمد', 'rejected': 'مرفوض', 'done': 'منجز' };
  var PSTATUS = { 'draft': 'مسوّدة', 'partial': 'بانتظار توقيع', 'signed': 'موقّع من الطرفين' };

  function dayLabel() {
    try {
      var d = new Date();
      var wd = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { weekday: 'long' }).format(d);
      var hij = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      var greg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      return { wd: wd, hij: hij, greg: greg };
    } catch (e) { return { wd: '', hij: '', greg: '' }; }
  }

  /** وثيقة التعهد: شعار المنصة + التاريخ واليوم + المسؤول عن المنصة + التوقيعان */
  function pledgeDoc(p) {
    var sc = S.school(p.schoolId) || {};
    var owner = S.platformOwner();
    var d = dayLabel();
    return {
      title: 'تعهد ومواثيق استخدام منصة تابعني — ' + p.no,
      by: owner.name || '',
      meta: [
        { label: 'رقم التعهد', value: p.no },
        { label: 'المدرسة', value: sc.name || '—' },
        { label: 'اليوم', value: d.wd },
        { label: 'التاريخ', value: d.hij + ' هـ — ' + d.greg + ' م' },
        { label: 'المختص/الوكيل المعتمد', value: (p.specialistName || '—') + (p.specialistIdNo ? ' — هوية ' + p.specialistIdNo : '') },
        { label: 'مدير المدرسة', value: (p.principalName || '—') + (p.principalIdNo ? ' — هوية ' + p.principalIdNo : '') },
        { label: 'المسؤول عن المنصة', value: owner.name || '—' },
        { label: 'الحالة', value: PSTATUS[p.status] || p.status }
      ],
      sections: [
        { heading: 'البنود', list: p.terms || [] },
        { heading: 'الإقرار', text: 'أقرّ أنا الموقّع أدناه بصحّة بياناتي، وبأنني قرأت البنود أعلاه وفهمتها، وأتعهد بالالتزام بها، وأن منصة «تابعني للخدمات الذكية» وكل مكوّناتها حق فكري مملوك لها، ويعاقبني النظام عند الإخلال.' }
      ],
      signatures: [
        'المختص/الوكيل المعتمد: ' + (p.specialistName || '—') + ((p.signs && p.signs.specialist) ? '  (موقّع إلكترونيًا — ' + (p.signs.specialist.at || '').slice(0, 16).replace('T', ' ') + ')' : '  (بانتظار التوقيع)'),
        'مدير المدرسة: ' + (p.principalName || '—') + ((p.signs && p.signs.principal) ? '  (موقّع إلكترونيًا — ' + (p.signs.principal.at || '').slice(0, 16).replace('T', ' ') + ')' : '  (بانتظار التوقيع)')
      ]
    };
  }

  function printPledge(p) { UI.printPlatformDoc(pledgeDoc(p)); }

  /** تنزيل الوثيقة كملف (يفتح تبويبًا جديدًا يمكن حفظه PDF من الطابعة) */
  function exportPledge(p) {
    var html = UI.platformDoc ? UI.platformDoc(pledgeDoc(p)) : null;
    if (!html) { UI.toast('تعذّر توليد الملف', 'bad'); return; }
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank');
    UI.toast('حُفظ الملف — من نافذة الطباعة اختر «حفظ ك PDF»', 'ok');
  }

  function sendPledge(p, cb) {
    S.assistantSend(S.pledgeText(p), p.schoolId).then(function (r) {
      if (r && r.ok) S.markPledgeSent(p.id, 'telegram');
      UI.toast(r && r.ok ? ('أُرسل عبر ' + S.botName()) : ('لم يُرسل: ' + ((r && (r.error || r.note)) || 'تحقّق من ربط تلقرام')), r && r.ok ? 'ok' : 'warn');
      if (cb) cb(r);
    }).catch(function () { UI.toast('تعذّر الإرسال — تحقّق من الاتصال', 'warn'); if (cb) cb(null); });
  }

  App.register({
    id: 'pledges',
    label: 'خدمة التعهدات',
    icon: '&#129309;',
    roles: ['super', 'specialist', 'principal'],
    render: function (view) {
      var role = (S.session || {}).role;
      var host = h('div', { class: 'stack' });

      /* ---------- مدير المدرسة: طلب خدمة + حالة طلباته ---------- */
      if (role === 'principal') {
        var sj = UI.field({ name: 'sj', label: 'موضوع الطلب', required: true, placeholder: 'مثال: طلب تدريب المعلمين على التقارير' });
        var dt = UI.field({ name: 'dt', label: 'التفاصيل', type: 'textarea', placeholder: 'اشرح ما تحتاجه بدقة…' });
        host.appendChild(UI.panel('طلب خدمة من تابعني', 'لا تُقدَّم أي خدمة إلا بطلب من مدير المدرسة يصل للمشرف العام.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'أرسل الطلب للمشرف العام', onClick: function () {
            var r = S.requestService({ subject: sj.input.value, details: dt.input.value });
            if (!r.ok) { UI.toast(r.error, 'bad'); return; }
            S.assistantSend('📩 طلب خدمة جديد من مدرسة ' + ((S.school(r.request.schoolId) || {}).name || '—') +
              '\nالموضوع: ' + r.request.subject + (r.request.details ? '\nالتفاصيل: ' + r.request.details : '') +
              '\nمقدّم الطلب: ' + r.request.byName, r.request.schoolId).then(function (x) {
              UI.toast(x && x.ok ? 'أُرسل الطلب ووصل للمشرف العام ✓' : 'حُفظ الطلب — تنبيه تلقرام لم يُرسل (تحقّق من الربط)', x && x.ok ? 'ok' : 'warn');
            });
            App.route();
          } })
        ], [h('div', { class: 'form-grid' }, [sj.wrap, dt.wrap]),
          h('div', { class: 'callout info', text: 'الطلبات تُراجَع من المشرف العام، ثم ينفّذها «مختص تابعني» المعتمد للمدرسة.' })]));

        var mine = S.serviceRequests({ schoolId: (S.session || {}).schoolId });
        host.appendChild(UI.panel('طلبات مدرستي', mine.length + ' طلبًا', null, [
          UI.table({ cols: [
            { label: 'التاريخ', render: function (r) { return UI.fmtDateTime(r.at); } },
            { label: 'الموضوع', key: 'subject' },
            { label: 'الحالة', render: function (r) { return STATUS[r.status] || r.status; } },
            { label: 'ملاحظة المشرف', key: 'note' },
            { label: 'تعاقد', render: function (r) { return r.pledgeNo || '—'; } }
          ], rows: mine, empty: 'لا طلبات بعد.' })
        ]));
      }

      /* ---------- المشرف العام: مراجعة الطلبات + كل التعهدات ---------- */
      if (role === 'super') {
        var all = S.serviceRequests();
        host.appendChild(UI.panel('طلبات الخدمة الواردة', all.length + ' طلبًا', null, [
          UI.table({ cols: [
            { label: 'المدرسة', render: function (r) { return (S.school(r.schoolId) || {}).name || '—'; } },
            { label: 'الموضوع', key: 'subject' },
            { label: 'من', key: 'byName' },
            { label: 'الحالة', render: function (r) { return STATUS[r.status] || r.status; } },
            { label: 'إجراء', render: function (r) {
              if (r.status === 'new') {
                return h('span', { class: 'cluster' }, [
                  h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'اعتمد', onClick: function () {
                    S.decideServiceRequest(r.id, 'approved'); UI.toast('اعتُمد الطلب ✓', 'ok'); App.route();
                  } }),
                  h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'ارفض', onClick: function () {
                    var note = window.prompt('سبب الرفض؟') || '';
                    S.decideServiceRequest(r.id, 'rejected', { note: note }); App.route();
                  } })
                ]);
              }
              if (r.status === 'approved') {
                return h('span', { class: 'cluster' }, [
                  h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تعيين مختص', onClick: function () {
                    var sp = S.specialists();
                    if (!sp.length) { UI.toast('أضف حساب «مختص تابعني» أولًا من إدارة المستخدمين', 'warn'); return; }
                    var id = sp[0].id;
                    if (sp.length > 1) { var n = window.prompt('اسم المختص:\n' + sp.map(function (x) { return x.name; }).join('\n'), sp[0].name); if (n) { var f = sp.filter(function (x) { return x.name === n; })[0]; id = f ? f.id : id; } }
                    S.decideServiceRequest(r.id, 'approved', { specialistId: id });
                    UI.toast('أُسند لـ' + ((S.user(id) || {}).name || ''), 'ok'); App.route();
                  } }),
                  h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'أُنجز', onClick: function () {
                    S.decideServiceRequest(r.id, 'done'); App.route();
                  } })
                ]);
              }
              return h('span', { class: 'muted', text: STATUS[r.status] || '' });
            } }
          ], rows: all, empty: 'لا طلبات خدمة.' })
        ]));

        /* إعدادات: اسم البوت + المسؤول عن المنصة */
        var bn = UI.field({ name: 'bn', label: 'اسم البوت الذي يُرسل منه', half: true, value: S.botName() });
        var ow = S.platformOwner();
        var on = UI.field({ name: 'on', label: 'المسؤول عن المنصة (يُطبع على التعهدات)', half: true, value: ow.name });
        var ot = UI.field({ name: 'ot', label: 'صفته', half: true, value: ow.title });
        var op = UI.field({ name: 'op', label: 'جواله', half: true, value: ow.phone });
        host.appendChild(UI.panel('إعدادات التعهدات', 'اسم البوت وبيانات المسؤول عن المنصة (تظهر على كل تعهد).', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ', onClick: function () {
            S.saveBotName(bn.input.value);
            S.savePlatformOwner({ name: on.input.value, title: ot.input.value, phone: op.input.value });
            UI.toast('حُفظت الإعدادات ✓', 'ok');
          } })
        ], [h('div', { class: 'form-grid' }, [bn.wrap, on.wrap, ot.wrap, op.wrap])]));
      }

      /* ---------- قائمة التعهدات (المشرف العام + المختص) ---------- */
      var scope = role === 'specialist' ? { specialistId: S.session.userId } : {};
      var pls = S.list('pledges').filter(function (p) {
        if (scope.specialistId && p.specialistId !== scope.specialistId) return false;
        return true;
      }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

      var pj = UI.field({ name: 'pj', label: 'مدير المدرسة (اسمه)', required: true });
      var pk = UI.field({ name: 'pk', label: 'رقم هويته', half: true });
      var pi = UI.field({ name: 'pi', label: 'رقم هويتك كمختص', half: true });
      var psc = UI.field({ name: 'psc', label: 'المدرسة', type: 'select', half: true,
        options: S.list('schools').map(function (x) { return { value: x.id, label: x.name }; }) });
      if (role === 'specialist') {
        var approved = S.serviceRequests({ specialistId: S.session.userId }).concat(S.serviceRequests({ status: 'approved' }));
        var seen = {};
        approved = approved.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return r.status === 'approved'; });
        host.appendChild(UI.panel('إنشاء تعهد جديد', 'يُوقّعه المختص ومدير المدرسة، ويُرسل عبر ' + S.botName() + '.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'أنشئ التعهد', onClick: function () {
            var r = S.addPledge({ schoolId: psc.input.value, principalName: pj.input.value, principalIdNo: pk.input.value, specialistIdNo: pi.input.value });
            if (!r.ok) { UI.toast('تعذّر الإنشاء', 'bad'); return; }
            UI.toast('أُنشئ التعهد ' + r.pledge.no + ' — وقّعه الآن', 'ok');
            App.route();
          } })
        ], [
          approved.length ? h('div', { class: 'callout info', text: 'طلبات معتمدة لك: ' + approved.map(function (r) { return r.subject + ' — ' + ((S.school(r.schoolId) || {}).name || ''); }).join(' · ') }) : null,
          h('div', { class: 'form-grid' }, [psc.wrap, pj.wrap, pk.wrap, pi.wrap])
        ]));
      }

      host.appendChild(UI.panel('التعهدات المرفوعة', pls.length + ' تعهدًا', null, pls.length ? [
        UI.table({ cols: [
          { label: 'الرقم', render: function (p) { return p.no; } },
          { label: 'المدرسة', render: function (p) { return (S.school(p.schoolId) || {}).name || '—'; } },
          { label: 'المختص', key: 'specialistName' },
          { label: 'المدير', key: 'principalName' },
          { label: 'الحالة', render: function (p) { return PSTATUS[p.status] || p.status; } },
          { label: 'إجراءات', render: function (p) {
            var canSignSpec = role === 'specialist' || role === 'super';
            var canSignPrin = role === 'principal' || role === 'super';
            return h('span', { class: 'cluster' }, [
              (canSignSpec && !(p.signs || {}).specialist) ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'توقيعي (مختص)', onClick: function () {
                S.signPledge(p.id, 'specialist', S.session.name); UI.toast('وُقّع ✓', 'ok'); App.route();
              } }) : null,
              (canSignPrin && !(p.signs || {}).principal) ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'توقيعي (مدير)', onClick: function () {
                S.signPledge(p.id, 'principal', S.session.name); UI.toast('وُقّع ✓', 'ok'); App.route();
              } }) : null,
              h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'طباعة', onClick: function () { printPledge(p); } }),
              h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير ملف', onClick: function () { exportPledge(p); } }),
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'أرسل عبر ' + S.botName(), onClick: function () { sendPledge(p, function () { App.route(); }); } })
            ]);
          } }
        ], rows: pls
        }), h('div', { class: 'muted', style: { marginTop: '8px', fontSize: 'var(--fs-xs)' },
          text: 'الوثيقة المطبوعة تحمل شعار المنصة، واليوم والتاريخ (هجري ثم ميلادي)، واسم المسؤول عن المنصة، والتوقيعات.' })
      ] : [h('p', { class: 'muted', text: 'لا تعهدات بعد.' })]));

      view.appendChild(host);
    }
  });
})();
