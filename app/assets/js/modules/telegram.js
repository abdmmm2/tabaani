/* =============================================================================
   telegram.js — سجل تلقرام
   ---------------------------------------------------------------------------
   محاكاة إرسال رسائل تلقرام في المنصة: استعراض الرسائل المُسجّلة وتصفيتها،
   مسح السجل، ربط معرّف محادثة (chat id) لكل مستخدم، وخطوات تفعيل الإرسال
   الحقيقي عبر بوت تلقرام وقوالب الرسائل الجاهزة.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* الأدوار التي تُستهدف بالرسائل، مرتّبة: القيادة ثم المعلمون */
  var ROLE_ORDER = ['principal', 'deputy', 'guidance', 'volunteer', 'activity', 'teacher'];
  function roleName(id) {
    var r = S.roles.find(function (x) { return x.id === id; });
    return r ? r.name : id;
  }

  App.register({
    id: 'telegram',
    label: 'سجل تلقرام',
    pro: true,
    icon: '&#9992;&#65039;',
    roles: ['principal', 'deputy', 'guidance'],
    render: function (view) {
      var state = { to: '' };
      var previewSlot = h('div');
      var listSlot = h('div');
      var counter = h('p', { class: 'muted' });

      /* ------------------------------------------------ مساعدات السجل */
      function messages() { return S.list('telegram'); }

      function recipients() {
        var map = {};
        messages().forEach(function (m) { if (!map[m.to]) map[m.to] = m.toName || m.to; });
        return Object.keys(map).map(function (k) { return { value: k, label: map[k] }; });
      }

      function countOf(id) {
        return messages().filter(function (m) { return m.to === id; }).length;
      }

      var filterField = UI.field({ name: 'tgto', label: 'تصفية بالمستلم', type: 'select', value: '',
        placeholder: 'كل المستلمين', options: [] });
      filterField.input.addEventListener('change', function () { state.to = filterField.input.value; paintList(); });

      function syncFilter() {
        var current = state.to;
        var rs = recipients();
        clear(filterField.input);
        filterField.input.appendChild(h('option', { value: '', text: 'كل المستلمين' }));
        rs.forEach(function (o) {
          filterField.input.appendChild(h('option', { value: o.value, text: o.label + ' (' + countOf(o.value) + ')' }));
        });
        filterField.input.value = rs.some(function (o) { return o.value === current; }) ? current : '';
        state.to = filterField.input.value;
      }

      function paintList() {
        UI.renderTelegram(listSlot);
        if (state.to) {
          var rows = messages();
          var items = listSlot.querySelectorAll('.tg-item');
          var shown = 0;
          Array.prototype.forEach.call(items, function (el, i) {
            var m = rows[i];
            var match = !!m && m.to === state.to;
            el.hidden = !match;
            if (match) shown++;
          });
          if (!shown) listSlot.appendChild(h('p', { class: 'muted mt-3', text: 'لا رسائل لهذا المستلم.' }));
        }
        counter.textContent = 'عدد الرسائل: ' + (state.to ? countOf(state.to) : messages().length) +
          ' من إجمالي ' + messages().length;
      }

      function drawPreview() {
        clear(previewSlot);
        var rows = messages().slice(0, 5);
        previewSlot.appendChild(UI.panel('آخر 5 رسائل (معاينة)', 'أحدث الرسائل المُسجّلة في السجل.', null, [
          rows.length ? h('div', { class: 'tg-list' }, rows.map(function (m) {
            var text = String(m.text || '');
            return h('article', { class: 'tg-item' }, [
              h('header', {}, [
                h('span', { class: 'tg-to', text: 'إلى: ' + (m.toName || m.to) }),
                h('span', { class: 'tg-at muted', text: UI.fmtDateTime(m.at) })
              ]),
              h('p', { class: 'muted', style: { margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.7' },
                text: text.length > 160 ? text.slice(0, 160) + '…' : text })
            ]);
          })) : UI.empty('لا رسائل مُسجّلة بعد — نفّذ إجراءً يُرسل رسالة (تحضير، مخالفة، استئذان…) لتظهر هنا.')
        ]));
      }

      function refresh() {
        syncFilter();
        paintList();
        drawPreview();
      }

      /* ===================================== ٠) ربط البوت (المدير) */
      if (S.session.role === 'principal' && window.TelegramConnect) {
        var connectSlot = h('div');
        function drawConnect() {
          clear(connectSlot);
          connectSlot.appendChild(UI.panel('ربط بوت تلقرام',
            'شغّل الإرسال الفعلي: بوت واحد للمنصة مع مجموعة لكل مدرسة، أو بوت مستقل لكل مدرسة.',
            null, [window.TelegramConnect.build(function () { drawConnect(); refresh(); })]));
        }
        drawConnect();
        view.appendChild(connectSlot);
      }

      /* ===================================== ١) معاينة آخر 5 رسائل */
      view.appendChild(previewSlot);

      /* ===================================== ٢) سجل الرسائل (محاكاة) */
      view.appendChild(UI.panel('سجل الرسائل (محاكاة)',
        'الرسائل تُسجَّل هنا بدل الإرسال الفعلي. في الإنتاج تُرسَل عبر بوت تلقرام إلى محادثة كل مستخدم.',
        h('div', { class: 'cluster' }, [
          h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحديث', onClick: function () {
            refresh();
            UI.toast('حُدّث سجل الرسائل', 'ok');
          } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'مسح السجل', onClick: function () {
            UI.confirm('سيُمسح كل سجل الرسائل المُحاكاة نهائيًا. متابعة؟', { ok: 'مسح السجل', danger: true }).then(function (ok) {
              if (!ok) return;
              if (S.db.telegram) S.db.telegram.length = 0;
              S.save();
              refresh();
              UI.toast('مُسح سجل الرسائل', 'ok');
            });
          } })
        ]),
        [
          h('div', { class: 'form-grid' }, [h('div', { class: 'field' }, [filterField.wrap])]),
          h('div', { class: 'mt-3', style: { display: 'grid', gap: '10px' } }, [counter, listSlot])
        ]));

      /* ===================================== ٣) ربط حسابات تلقرام */
      function staffUsers() {
        return S.list('users').filter(function (u) {
          return u.schoolId === S.session.schoolId && ROLE_ORDER.indexOf(u.role) > -1;
        }).sort(function (a, b) { return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role); });
      }

      function chatCell(u) {
        var inp = h('input', { class: 'input', type: 'text', dir: 'ltr', value: u.telegram || '',
          placeholder: '123456789 أو @username', 'aria-label': 'معرّف محادثة ' + u.name,
          style: { width: '180px', maxWidth: '100%' } });
        var btn = h('button', { class: 'mini-btn is-primary', type: 'button', text: 'حفظ', onClick: function () {
          var v = inp.value.trim();
          S.update('users', u.id, { telegram: v });
          UI.toast('حُفظ معرّف محادثة ' + u.name, 'ok');
        } });
        return h('div', { class: 'cluster' }, [inp, btn]);
      }

      var usersSlot = h('div');
      function drawUsers() {
        clear(usersSlot);
        var rows = staffUsers();
        usersSlot.appendChild(UI.table({
          cols: [
            { label: 'الاسم', render: function (u) { return u.name; } },
            { label: 'الدور', render: function (u) { return roleName(u.role); } },
            { label: 'البريد', render: function (u) { return u.email || '—'; } },
            { label: 'معرّف محادثة تلقرام (chat id)', render: function (u) { return chatCell(u); } }
          ],
          rows: rows,
          empty: 'لا مستخدمين قابلين للربط في هذه المدرسة.'
        }));
      }

      view.appendChild(UI.panel('ربط حسابات تلقرام', 'أدخل معرّف محادثة كل مستخدم ليصله ما يخصّه من الرسائل.',
        h('button', { class: 'mini-btn', type: 'button', text: 'تحديث القائمة', onClick: function () { drawUsers(); UI.toast('حُدّثت القائمة', 'ok'); } }),
        [
          h('p', { class: 'muted', text: 'يُستخدم المعرّف لاستهداف محادثة المستخدم. يمكن إدخال رقم المحادثة (chat id) أو اسم المستخدم على تلقرام (@username).' }),
          usersSlot
        ]));

      /* ===================================== ٤) متطلبات الإرسال الحقيقي */
      var steps = [
        'إنشاء بوت عبر BotFather والحصول على التوكن (Token).',
        'أن يبدأ كل مستخدم محادثة مع البوت مرة واحدة للحصول على معرّف المحادثة chat id.',
        'تخزين التوكن في الخادم وليس في الواجهة، وإبقاؤه خارج ملفات المتصفح.',
        'إرسال الرسائل من الخادم عبر تلقرام Bot API (sendMessage) أو عبر webhook عند وقوع حدث.',
        'قوالب الرسائل الجاهزة: تحضير، مخالفة جديدة، رد التوجيه، إغلاق مخالفة، استئذان، اعتماد تطوع، طلب نشاط.'
      ];
      view.appendChild(UI.panel('ما يلزم لتفعيل الإرسال الحقيقي', null, null, [
        h('div', { class: 'muted-block' }, [
          h('ol', { style: { paddingInlineStart: '20px', lineHeight: '2' } }, steps.map(function (t) {
            return h('li', { text: t });
          }))
        ])
      ]));

      /* ============================= ٥) كيف تُنشئ التوكن خطوة بخطوة */
      var tokenSteps = [
        'افتح تلقرام وابحث عن @BotFather ثم أرسل الأمر /newbot.',
        'أدخل اسمًا للبوت ثم اسم مستخدم ينتهي بـ bot (مثل tabaani_school_bot).',
        'سيردّ BotFather برسالة فيها التوكن بالشكل 123456789:AAE... — انسخه وضعه في الخادم (متغيّر بيئة) ولا تضعه في الواجهة.',
        'لكل مستخدم: يفتح محادثة البوت ويضغط Start ثم يرسل /start.',
        'للحصول على chat id: افتح في المتصفح رابط getUpdates واقرأ القيمة result[].message.chat.id — أو أرسل رسالة للبوت ثم حدّث الصفحة.',
        'اختبار الإرسال: افتح رابط sendMessage الجاهز أدناه — إن وصلتك الرسالة فالإعداد صحيح.',
        'في المنصة: ضع chat id لكل مستخدم في جدول «ربط حسابات تلقرام» أعلاه.'
      ];

      var GET_UPDATES_URL = 'https://api.telegram.org/bot<TOKEN>/getUpdates';
      var SEND_MESSAGE_URL = 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=مرحبًا';

      /* نسخ نص إلى الحافظة مع بديل آمن في سياقات غير الآمنة */
      function copyText(text, label) {
        function fallback() {
          try {
            var ta = h('textarea', { readonly: true, style: { position: 'fixed', opacity: '0', pointerEvents: 'none' } });
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            ta.remove();
            finish(ok);
          } catch (e) { finish(false); }
        }
        function finish(ok) {
          if (ok) UI.toast('نُسخ ' + label, 'ok');
          else UI.toast('تعذّر النسخ تلقائيًا — انسخ النص يدويًا', 'warn');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { finish(true); }, fallback);
        } else fallback();
      }

      function linkRow(label, url) {
        return h('div', {
          class: 'link-row',
          style: { display: 'grid', gap: '6px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', padding: '10px' }
        }, [
          h('div', { class: 'cluster', style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [
            h('span', { class: 'muted', text: label }),
            h('button', { class: 'mini-btn is-primary', type: 'button', text: 'نسخ', onClick: function () { copyText(url, label); } })
          ]),
          h('code', { class: 'copy-text', text: url, style: { direction: 'ltr', display: 'block', wordBreak: 'break-all', textAlign: 'start' } })
        ]);
      }

      view.appendChild(UI.panel('كيف تُنشئ التوكن خطوة بخطوة', 'من إنشاء البوت في BotFather حتى اختبار الإرسال الفعلي.', null, [
        h('div', { class: 'muted-block' }, [
          h('ol', { style: { paddingInlineStart: '20px', lineHeight: '2' } }, tokenSteps.map(function (t) {
            return h('li', { text: t });
          }))
        ]),
        h('div', { class: 'mt-4', style: { display: 'grid', gap: '10px' } }, [
          linkRow('رابط قراءة المحادثات (getUpdates)', GET_UPDATES_URL),
          linkRow('رابط اختبار الإرسال (sendMessage)', SEND_MESSAGE_URL)
        ]),
        h('p', { class: 'muted mt-3', text: 'ملاحظة: النموذج الحالي يُسجّل الرسائل بدل الإرسال حتى يربطها الخادم بالتوكن عبر متغيّر بيئة؛ استبدل <TOKEN> و<CHAT_ID> بالقيم الفعلية عند الاختبار.' })
      ]));

      /* ------------------------------------------- التحقق بمرحلتين (2FA) */
      var tfSlot = h('div');

      function drawTwoFactor() {
        clear(tfSlot);
        var c = S.twoFactorConfig();
        var staff = S.list('users').filter(function (u) { return u.role !== 'student' && u.status === 'active'; });
        var linked = staff.filter(function (u) { return String(u.telegramChatId || '').trim(); });
        var unlinked = staff.filter(function (u) { return !String(u.telegramChatId || '').trim(); });

        function toggle(label, checked, onChange, help) {
          var cb = h('input', { type: 'checkbox', checked: !!checked });
          cb.addEventListener('change', function () { onChange(cb.checked); drawTwoFactor(); });
          return h('label', { class: 'checkline' }, [cb, h('span', { text: label }),
            help ? h('span', { class: 'muted', text: ' — ' + help }) : null]);
        }
        function numField(label, key, value, min, max, help) {
          var f = UI.field({ name: key, label: label, type: 'number', value: value, min: min,
            half: true, help: help, onChange: function () {
              var v = parseInt(f.input.value, 10);
              if (!v || v < min || v > max) { f.input.value = S.twoFactorConfig()[key]; return; }
              S.saveTwoFactorConfig((function () { var o = {}; o[key] = v; return o; })());
              UI.toast('حُفظ الإعداد', 'ok');
            } });
          return f;
        }

        var ttl = numField('صلاحية الرمز (دقائق)', 'ttl', c.ttl, 1, 60, 'يُرفض الرمز بعد انتهائها.');
        var att = numField('أقصى عدد محاولات', 'attempts', c.attempts, 1, 10, 'ثم يلزم رمز جديد.');

        tfSlot.appendChild(UI.panel('التحقق بمرحلتين عند الدخول',
          'كلمة المرور أوّلًا، ثم رمز من ٦ أرقام يُرسل إلى محادثة الموظف الشخصية على تلقرام.', null, [
          h('div', { class: 'stat-row' }, [
            UI.statCard('موظفون نشطون', String(staff.length)),
            UI.statCard('لديهم محادثة مربوطة', String(linked.length), 'سيُلزمون بالرمز', linked.length ? 'gold' : null),
            UI.statCard('بلا محادثة', String(unlinked.length), c.enforce ? 'لا يستطيعون الدخول' : 'يدخلون بكلمة المرور فقط')
          ]),
          h('div', { class: 'stack-sm', style: { marginTop: '12px' } }, [
            toggle('تشغيل التحقق بمرحلتين', c.enabled, function (v) {
              S.saveTwoFactorConfig({ enabled: v });
              UI.toast(v ? 'فُعّل التحقق بمرحلتين' : 'أُوقف التحقق بمرحلتين', v ? 'ok' : 'warn');
            }, 'يُطبَّق على من ربط محادثته الشخصية'),
            toggle('إلزام كل الموظفين', c.enforce, function (v) {
              S.saveTwoFactorConfig({ enforce: v });
              UI.toast(v ? 'صار التحقق إلزاميًا لكل الموظفين' : 'صار التحقق اختياريًا لمن ربط محادثته', v ? 'warn' : 'ok');
            }, 'يمنع دخول من لم يربط محادثة — احرص على ربط المدير لنفسه أولًا')
          ]),
          h('div', { class: 'form-grid', style: { marginTop: '10px' } }, [ttl.wrap, att.wrap]),
          h('div', { class: 'callout', style: { marginTop: '10px' } }, [
            h('strong', { text: 'لتفعيل التحقق لكل موظف: ' }),
            h('span', { text: 'اربط محادثته الشخصية (chat_id). يُضبط من «الموظفون والحسابات» عند مدير المدرسة، أو من «الرسائل الخاصة ← ربط تلقرام» عند الموظف نفسه.' }),
            unlinked.length ? h('div', { class: 'muted', style: { marginTop: '6px' },
              text: 'بلا محادثة حتى الآن (' + unlinked.length + '): ' + unlinked.slice(0, 6).map(function (u) { return u.name; }).join('، ') + (unlinked.length > 6 ? '…' : '') }) : null
          ]),
          h('p', { class: 'muted mt-3', style: { fontSize: 'var(--fs-xs)' },
            text: 'الرمز يُستهلك مرة واحدة، وينتهي بعد المدة أعلاه، ويُقطع بعد المحاولات المحدّدة. ولا يخضع الطلاب لهذه المرحلة. وكل رمز يُقيَّد في «سجل تلقرام» موسومًا بـ«خاصة».' })
        ]));
      }

      view.appendChild(tfSlot);
      drawTwoFactor();

      /* ------------------------------------------------------- أول رسم */
      drawUsers();
      refresh();
    }
  });
})();
