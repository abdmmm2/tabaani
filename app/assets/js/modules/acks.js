/* ==========================================================================
   الإقرارات — لكل مستخدم باسمه ووظيفته ومدرسته
   --------------------------------------------------------------------------
   • لا تعمل أي شاشة/زر في المنصة قبل **اعتماد الإقرار**:
       الموظفون والمعلمون: يعتمدهم مدير المدرسة.
       المدير والمختص والمحاسب والدعم: يعتمدهم المشرف العام.
   • البوابة (App.ackGate) تظهر مكان المنصة: طباعة/تصدير الإقرار + «أرسلت
     الإقرار لمدير مدرستي» — ثم يبقى الانتظار حتى تأكيد المدير، فيعمل الحساب تلقائيًا.
   • قسم «الإقرارات»: فلتر بالمدرسة، ومن لم يملأ، وتنبيه جماعي، وتأكيد جماعي.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h;

  var ST = { pending: 'لم يُرسل', submitted: 'بانتظار تأكيد المدير', approved: 'معتمد' };

  function dayLabel() {
    try {
      var d = new Date();
      return {
        wd: new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { weekday: 'long' }).format(d),
        hij: new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(d),
        greg: new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
      };
    } catch (e) { return { wd: '', hij: '', greg: '' }; }
  }

  /** وثيقة إقرار فردية جاهزة للطباعة (شعار المنصة + الاسم والوظيفة والمدرسة + البنود + التوقيعات) */
  App.ackDoc = function (userId) {
    var u = S.user(userId || S.session.userId) || {};
    var sc = S.school(u.schoolId) || {};
    var a = S.ack(u.id);
    var owner = S.platformOwner();
    var d = dayLabel();
    return {
      title: 'إقرار المحافظة على أسرار المدرسة والمنصة — ' + (a.docNo || ''),
      by: owner.name || '',
      meta: [
        { label: 'رقم الإقرار', value: a.docNo || '—' },
        { label: 'الاسم', value: u.name || '—' },
        { label: 'الوظيفة', value: S.roleLabel(u.role, u.schoolId) },
        { label: 'المدرسة', value: sc.name || '—' },
        { label: 'اليوم', value: d.wd },
        { label: 'التاريخ', value: d.hij + ' هـ — ' + d.greg + ' م' },
        { label: 'الحالة', value: ST[a.status] || a.status },
        { label: 'المسؤول عن المنصة', value: owner.name || '—' }
      ],
      sections: [
        { heading: 'البنود', list: S.ACK_TERMS },
        { heading: 'الإقرار', text: 'أُقرّ أنا الموقّع أدناه (المذكور بياناته أعلاه) بأنني قرأت البنود وفهمتها والتزمت بها، وأنني مسؤول عن أي إخلال بها نظاميًا، وأن الأسرار التي أطّلع عليها أمانة في ذمّتي.' }
      ],
      signatures: [
        'المُقرّ (الموظف/المعلم): ' + (u.name || '—') + '  — التوقيع: ..................  التاريخ: ..............'
      ]
    };
  };

  App.ackPrint = function (userId) { UI.printPlatformDoc(App.ackDoc(userId)); };
  App.ackExport = function (userId) {
    var url = URL.createObjectURL(new Blob([UI.platformDoc(App.ackDoc(userId))], { type: 'text/html;charset=utf-8' }));
    window.open(url, '_blank');
    UI.toast('حُفظ الملف — اختر «حفظ ك PDF» من نافذة الطباعة', 'ok');
  };

  /** بوابة الإقرار: تحلّ مكان المنصة كاملة حتى يُعتمد الإقرار */
  App.ackGate = function () {
    var u = S.user(S.session.userId) || {};
    var a = S.ack(u.id);
    var ap = S.ackApprover(u.id);
    var wrap = h('div', { class: 'ack-gate' });

    wrap.appendChild(h('div', { class: 'ack-head' }, [
      h('div', { class: 'ack-badge', html: '&#128274;' }),
      h('div', {}, [
        h('h2', { text: 'إقرارك مطلوب قبل استخدام المنصة' }),
        h('p', { class: 'muted', text: 'حسابك ' + (u.name || '') + ' — ' + S.roleLabel(u.role, u.schoolId) +
          ((S.school(u.schoolId) || {}).name ? ' · ' + S.school(u.schoolId).name : '') + ' · رقم الإقرار ' + (a.docNo || 'يُصدر عند الإرسال') })
      ])
    ]));

    wrap.appendChild(UI.panel('بنود الإقرار', 'اطعَنه، ثم اطبعه ووقّعه وسلّمه لمدير مدرستك.', null, [
      h('ol', { class: 'ack-terms' }, S.ACK_TERMS.map(function (t) { return h('li', { text: String(t).replace(/\*\*/g, '') }); })),
      h('div', { class: 'callout warn', text: 'لن يعمل أي زر في المنصة (ولا شاشة) قبل أن يؤكّد ' + ((ap && ap.name) || 'المعتمد') + ' وصول الإقرار الموقّع.' })
    ]));

    var actions = h('div', { class: 'cluster', style: { marginTop: '12px' } });
    actions.appendChild(h('button', { class: 'btn btn-primary', type: 'button', text: '🖨️ اطبع الإقرار', onClick: function () { App.ackPrint(u.id); } }));
    actions.appendChild(h('button', { class: 'btn btn-outline', type: 'button', text: '📥 تصدير ملف (PDF)', onClick: function () { App.ackExport(u.id); } }));
    if (a.status === 'pending') {
      actions.appendChild(h('button', { class: 'btn btn-primary', type: 'button', text: '✅ أرسلت الإقرار لمدرستي', onClick: function () {
        var r = S.submitAck(u.id);
        UI.toast('سُجّل إرسال إقرارك ✓ — أُشعر ' + (r.approver || 'المعتمد') + (r.sent ? ' (وأُرسل التنبيه)' : ' (تنبيه البوت يحتاج ربط تلقرام)'), 'ok');
        App.route();
      } }));
    } else {
      actions.appendChild(h('button', { class: 'btn btn-outline', type: 'button', text: '🔔 ذكّر المعتمد', onClick: function () {
        S.remindAck(u.id).then(function (r) {
          UI.toast(r && r.ok ? 'أُرسل التذكير ✓' : 'سُجّل التذكير — تنبيه البوت لم يُرسل (تحقّق من ربط تلقرام)', r && r.ok ? 'ok' : 'warn');
        });
      } }));
    }
    actions.appendChild(h('button', { class: 'btn btn-outline', type: 'button', text: 'خروج', onClick: App.logout }));
    wrap.appendChild(UI.panel(a.status === 'submitted' ? 'بانتظار تأكيد ' + ((ap && ap.name) || 'المعتمد') : 'الخطوة الأخيرة',
      a.status === 'submitted' ? 'أُرسل إقرارك. سلّم الورقة الموقّعة، وسيؤكّد المدير وصولها فيعمل حسابك تلقائيًا.' : 'اطبع الإقرار ووقّعه وسلّمه لمدير مدرستك.', null, [actions]));

    return wrap;
  };

  App.register({
    id: 'acks',
    label: 'الإقرارات',
    icon: '&#128394;',
    roles: ['principal', 'super', 'specialist'],
    render: function (view) {
      var role = (S.session || {}).role;
      var isSuper = role === 'super';
      var schoolFilter = isSuper ? (S._ackSchool || '') : ((S.session || {}).schoolId || '');
      var statusFilter = S._ackStatus || '';

      function draw() {
        clear2(host);
        var rows = S.ackList({ schoolId: schoolFilter, status: statusFilter });
        var st = S.ackStats(isSuper ? (schoolFilter || null) : schoolFilter);

        /* لوحة أرقام */
        host.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('إجمالي المُلزَمين', String(st.total), 'حسابات تحتاج إقرارًا', 'brand'),
          UI.statCard('لم يُرسلوا', String(st.pending), 'يجب تنبيههم', 'amber'),
          UI.statCard('بانتظار تأكيدك', String(st.submitted), 'وصلت وتحتاج اعتمادًا', 'mint'),
          UI.statCard('معتمد', String(st.approved), st.pct + '% من المُلزَمين', 'mint')
        ]));

        /* الفلاتر */
        var sc = h('select', { class: 'input', style: { maxWidth: '240px' } });
        sc.appendChild(h('option', { value: '', text: 'كل المدارس' }));
        S.list('schools').forEach(function (x) { sc.appendChild(h('option', { value: x.id, text: x.name })); });
        sc.value = schoolFilter;
        sc.addEventListener('change', function () { S._ackSchool = sc.value; draw(); });
        var stf = h('select', { class: 'input', style: { maxWidth: '200px' } });
        [['', 'كل الحالات'], ['pending', 'لم يُرسل'], ['submitted', 'بانتظار التأكيد'], ['approved', 'معتمد']].forEach(function (o) {
          stf.appendChild(h('option', { value: o[0], text: o[1] }));
        });
        stf.value = statusFilter;
        stf.addEventListener('change', function () { S._ackStatus = stf.value; draw(); });

        var bar = h('div', { class: 'cluster' }, [isSuper ? sc : null, stf].filter(Boolean));
        host.appendChild(UI.panel('إدارة الإقرارات',
          'المعلمون والموظفون يعتمدهم مدير المدرسة، والمدير والمختص والمحاسب والدعم يعتمدهم المشرف العام.', [bar], []));

        /* جدول الإقرارات */
        host.appendChild(UI.panel('قائمة الإقرارات', rows.length + ' سجلًا', null, [
          UI.table({
            cols: [
              { label: 'الاسم', key: 'name' },
              { label: 'الوظيفة', key: 'roleName' },
              { label: 'المدرسة', key: 'schoolName' },
              { label: 'الحالة', render: function (r) { return ST[r.status] || r.status; } },
              { label: 'رقم الإقرار', render: function (r) { return r.docNo || '—'; } },
              { label: 'أُرسل', render: function (r) { return r.submittedAt ? UI.fmtDateTime(r.submittedAt) : '—'; } },
              { label: 'تنبيهات', render: function (r) { return String(r.reminders || 0); } },
              { label: 'إجراءات', render: function (r) {
                return h('span', { class: 'cluster' }, [
                  h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'اطبع إقراره', onClick: function () { App.ackPrint(r.id); } }),
                  r.status !== 'approved' ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تأكيد الوصول ✓', onClick: function () {
                    S.approveAck(r.id); UI.toast('اعتُمد إقرار ' + r.name + ' — يعمل حسابه تلقائيًا ✓', 'ok'); draw();
                  } }) : null,
                  r.status === 'pending' ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: '🔔 تنبيه', onClick: function () {
                    S.remindAck(r.id).then(function (x) {
                      UI.toast(x && x.ok ? 'أُرسل التنبيه ✓' : 'سُجّل التنبيه — لم يُرسل عبر البوت (لا معرّف تلقرام)', x && x.ok ? 'ok' : 'warn');
                      draw();
                    });
                  } }) : null,
                  r.status === 'approved' ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'إعادة فتح', onClick: function () {
                    S.reopenAck(r.id); draw();
                  } }) : null
                ]);
              } }
            ], rows: rows, empty: 'لا سجلات إقرار.'
          })
        ]));

        /* أدوات جماعية */
        var missing = S.ackList({ schoolId: schoolFilter }).filter(function (r) { return r.status !== 'approved'; });
        host.appendChild(UI.panel('تنبيه جماعي', missing.length + ' لم يُعتمد إقرارهم بعد', [
          h('button', { class: 'btn btn-primary', type: 'button', text: '🔔 أرسل الإقرارات لكل من لم يُرسل', onClick: function () {
            var pend = missing.filter(function (r) { return r.status === 'pending'; });
            if (!pend.length) { UI.toast('لا أحد متأخر ✓', 'ok'); return; }
            var out = { sent: 0, failed: 0 };
            UI.toast('جارٍ الإرسال لـ' + pend.length + ' مستخدمًا…', 'info');
            (function run(i) {
              if (i >= pend.length) {
                UI.toast('انتهى: أُرسل ' + out.sent + ' · تعذّر ' + out.failed + ' (تحقّق من ربط تلقرام)', out.sent ? 'ok' : 'warn');
                draw(); return;
              }
              S.remindAck(pend[i].id).then(function (x) { if (x && x.ok) out.sent++; else out.failed++; run(i + 1); })
                .catch(function () { out.failed++; run(i + 1); });
            })(0);
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: '✅ اعمد كل من أرسل إقراره', onClick: function () {
            var sub = missing.filter(function (r) { return r.status === 'submitted'; });
            if (!sub.length) { UI.toast('لا إقرارات بانتظار الاعتماد', 'warn'); return; }
            sub.forEach(function (r) { S.approveAck(r.id); });
            UI.toast('اعتُمد ' + sub.length + ' إقرارًا ✓ — تعمل حساباتهم تلقائيًا', 'ok'); draw();
          } })
        ], [h('div', { class: 'callout info', text: isSuper
          ? 'المشرف العام يرى كل المدارس: من لم يُرسل إقراره، ومن بانتظار اعتماد.'
          : 'أنت ترى مدرستك فقط.' })]));

        /* المشرف العام: من لم يملأ الإقرار */
        if (isSuper) {
          var bySchool = {};
          S.ackList({}).forEach(function (r) {
            if (r.status === 'approved') return;
            bySchool[r.schoolName || '—'] = bySchool[r.schoolName || '—'] || [];
            bySchool[r.schoolName || '—'].push(r.name + ' (' + r.roleName + ')');
          });
          var names = Object.keys(bySchool);
          host.appendChild(UI.panel('من لم يملأ الإقرار — حسب المدرسة', names.length + ' مدرسة', null, [
            names.length ? h('div', { class: 'stack' }, names.map(function (n) {
              return h('div', { class: 'ack-school-line' }, [h('strong', { text: n + ': ' }), h('span', { text: bySchool[n].join(' · ') })]);
            })) : h('p', { class: 'muted', text: 'أكمل الجميع إقراراتهم ✓' })
          ]));
        }
      }

      var host = h('div', { class: 'stack' });
      function clear2(x) { while (x.firstChild) x.removeChild(x.firstChild); }
      draw();
      view.appendChild(host);
    }
  });
})();
