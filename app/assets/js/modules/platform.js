/* =============================================================================
   platform.js — بيانات المنصة (مشرف عام)
   حالة البيانات · إعادة بيانات العرض التجريبية · البدء من الصفر ·
   نسخة احتياطية (تنزيل/استرجاع).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  App.register({
    id: 'platform',
    label: 'بيانات المنصة',
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
          stat('المستخدمون', st.users, 'حسابات المنصة'),
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

        /* ---------------- إعادة بيانات العرض التجريبية ---------------- */
        host.appendChild(UI.panel('إعادة بيانات العرض التجريبية', 'ترجّع المنصة إلى بيئة عرض جاهزة: مدرسة و٦ معلمين و٤ فصول و٤٨ طالبًا و٤٢ يومًا من سجل التحضير.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'إعادة بيانات العرض التجريبية', onClick: function () {
            UI.confirm('سيُمسح كل ما في النظام محليًا (مدارس · طلاب · حضور · مخالفات · حسابات · مواد) وتُستعاد بيانات العرض التجريبية. هل أخذت نسخة احتياطية؟', { ok: 'متابعة', danger: true })
              .then(function (ok) {
                if (!ok) return;
                UI.confirm('تأكيد أخير: لا يمكن التراجع عن هذه العملية.', { ok: 'نعم، أعِد بيانات العرض', danger: true }).then(function (ok2) {
                  if (!ok2) return;
                  S.reset();
                  UI.toast('أُعيدت بيانات العرض التجريبية — سيُحدَّث النظام', 'ok');
                  setTimeout(function () { location.reload(); }, 900);
                });
              });
          } })
        ], [
          h('div', { class: 'callout info', text: 'مناسبة للعرض والتجربة والتدريب: تفتح المنصة على بيانات كاملة بلا إعداد.' })
        ]));

        /* ---------------- البدء من الصفر ---------------- */
        host.appendChild(UI.panel('البدء من الصفر (منصة فارغة)', 'يمسح كل شيء ويترك النظام فارغًا: لا مدرسة ولا طلاب ولا معلمين — وأنت من يؤسّس مدرسته ويُنشئ حساباتها. حساب المشرف العام يبقى.', [
          h('button', { class: 'btn btn-danger', type: 'button', text: 'البدء من الصفر', onClick: function () {
            UI.confirm('سيُمسح كل شيء في هذا المتصفح وتُبنى المنصة من جديد بيدك. متابعة؟', { ok: 'متابعة', danger: true }).then(function (ok) {
              if (!ok) return;
              UI.confirm('تأكيد أخير: سيفقد النظام كل المدارس والحسابات والبيانات.', { ok: 'نعم، ابدأ من الصفر', danger: true }).then(function (ok2) {
                if (!ok2) return;
                S.resetEmptyAll();
                UI.toast('صار النظام فارغًا — ابدأ بتأسيس مدرستك', 'ok');
                setTimeout(function () { location.reload(); }, 900);
              });
            });
          } })
        ], [
          h('div', { class: 'callout warn', text: 'لا تستخدم هذا الخيار قبل أخذ نسخة احتياطية إن كانت لديك بيانات تريدها.' })
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

        host.appendChild(UI.panel('النسخة الاحتياطية', 'احفظ بيانات المنصة في ملف، أو استعِدها من ملف على أي جهاز.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'تنزيل نسخة احتياطية', onClick: function () {
            var name = 'tabaani-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            UI.downloadText(S.backupJson(), name, 'application/json');
          } }),
          h('label', { class: 'btn btn-outline', style: { cursor: 'pointer' } }, [h('span', { text: 'استرجاع من ملف' }), fileIn])
        ], [
          h('div', { class: 'callout tip', text: 'النسخة تحتوي كل شيء (المدارس · الطلاب · الحضور · المخالفات · الاستئذان · الحسابات · الإعدادات). خذها قبل أي تصفير أو قبل تغيير الجهاز.' })
        ]));

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
