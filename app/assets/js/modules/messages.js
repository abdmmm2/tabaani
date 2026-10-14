/* =============================================================================
   messages.js — الرسائل الخاصة
   ---------------------------------------------------------------------------
   بريد داخلي بين مستخدمي المنصة (من مستخدم إلى مستخدم بعينه).
   تُستخدم – من بين ما تُستخدم – لتسليم «إذن دخول الفصل» إلى المعلم:
   تصل الرسالة في صندوقه مع إشعار باسمه في الجرس، ويستطيع إعادة طباعة الإذن الورقي.
   ============================================================================= */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  var KIND = {
    'entry-permit': { label: 'إذن دخول فصل', tone: 'brand' },
    'note': { label: 'رسالة', tone: 'ink' }
  };

  function kindBadge(k) {
    var m = KIND[k] || { label: k || 'رسالة', tone: 'ink' };
    return UI.badge(m.label, m.tone);
  }
  function userLabel(id) { var u = S.user(id); return u ? u.name + ' (' + S.roleLabel(u.role) + ')' : '—'; }

  /** يبني زر طباعة «إذن دخول» من رسالة مرتبطة به، إن كان الإذن موجودًا */
  function permitPrintButton(refId) {
    if (!refId || typeof App.entryPermitReport !== 'function') return null;
    var x = S.findEntryPermit(refId);
    if (!x) return null;
    return UI.reportButton(function () { return App.entryPermitReport(x); },
      { label: 'طباعة الإذن (ورقي)', class: 'btn-soft' });
  }

  App.register({
    id: 'messages',
    label: 'الرسائل الخاصة',
    icon: '&#9993;',
    render: function (view) {
      var inSlot = h('div'), outSlot = h('div'), statSlot = h('div');
      var uid = S.session.userId;

      function inbox() { return S.messagesFor(uid); }
      function outbox() { return S.sentMessages(uid); }

      function drawStats() {
        clear(statSlot);
        var all = inbox();
        var unread = all.filter(function (m) { return !m.read; }).length;
        statSlot.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الرسائل الواردة', String(all.length)),
          UI.statCard('غير مقروءة', String(unread), 'رسالة', unread ? 'gold' : null),
          UI.statCard('الرسائل المُرسلة', String(outbox().length))
        ]));
      }

      function drawInbox() {
        clear(inSlot);
        var rows = inbox();
        inSlot.appendChild(UI.panel('الوارد', rows.length ? rows.length + ' رسالة' : 'لا رسائل واردة بعد.', [
          rows.length ? h('button', { class: 'btn btn-soft', type: 'button', text: 'تعليم الكل كمقروء', onClick: function () {
            S.readAllMessages(uid); S.markRead(); drawAll(); App.refreshBadges();
            UI.toast('عُلّمت كل الرسائل كمقروءة', 'ok');
          } }) : null
        ], [
          rows.length ? h('div', { class: 'stack' }, rows.map(function (m) {
            var pr = m.kind === 'entry-permit' ? permitPrintButton(m.refId) : null;
            return h('div', { class: 'callout' + (m.read ? '' : ' is-new'), style: { marginBottom: '10px' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, [
                h('strong', { text: (m.read ? '' : '● ') + (m.subject || 'رسالة خاصة') }),
                h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
                  kindBadge(m.kind),
                  m.read ? UI.badge('مقروءة', 'ink') : UI.badge('جديدة', 'amber')
                ])
              ]),
              h('div', { class: 'muted', style: { marginTop: '6px' },
                text: 'من ' + (m.fromName || '—') + ' (' + S.roleLabel(m.fromRole) + ') · ' + UI.fmtDateTime(m.at) }),
              h('div', { style: { whiteSpace: 'pre-wrap', marginTop: '8px', lineHeight: '1.9' }, text: m.body || '' }),
              h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                pr,
                m.read ? null : h('button', { class: 'btn btn-sm btn-soft', type: 'button', text: 'تمّ الاطلاع', onClick: function () {
                  S.readMessage(m.id); S.markRead(); drawAll(); App.refreshBadges();
                } })
              ])
            ]);
          })) : UI.empty('لا رسائل واردة — تصل إليك رسائل المنصة الخاصة هنا (مثل أذون دخول الفصل).')
        ]));
      }

      function drawOutbox() {
        clear(outSlot);
        var rows = outbox();
        if (!rows.length) return;
        outSlot.appendChild(UI.panel('المُرسَل', 'الرسائل التي أرسلتها أنت.', null, [
          UI.table({
            cols: [
              { label: 'إلى', render: function (m) { return m.toName + ' (' + S.roleLabel(m.toRole) + ')'; } },
              { label: 'العنوان', render: function (m) { return m.subject || 'رسالة'; } },
              { label: 'النوع', render: function (m) { return kindBadge(m.kind); } },
              { label: 'التاريخ', render: function (m) { return UI.fmtDateTime(m.at); } },
              { label: 'الحالة', render: function (m) { return m.read ? UI.badge('قُرئت', 'mint') : UI.badge('لم تُقرأ', 'ink'); } }
            ], rows: rows, empty: '—'
          })
        ]));
      }

      /* ----------------------- ربط تلقرام (لتصلك الرسائل خاصة) ----------------------- */
      var tgSlot = h('div');
      function drawTelegram() {
        clear(tgSlot);
        if (S.session.role === 'student') return;
        var me = S.user(uid) || {};
        var linked = String(me.telegramChatId || '').trim();
        var canSend = S.telegramSendable();
        var f = UI.field({
          name: 'tgChat', label: 'محادثة تلقرام الشخصية (chat_id)', value: linked,
          placeholder: 'مثال: 123456789',
          help: 'الصق معرّف محادثتك الرقمية. اتركه فارغًا لإلغاء الربط الشخصي.'
        });
        function save() {
          S.setTelegramChatId(uid, f.input.value);
          UI.toast(String(f.input.value || '').trim() ? 'رُبطت محادثتك الشخصية — الرسائل الخاصة تصلك وحدك' : 'أُلغي الربط الشخصي — ستعود الرسائل لمجموعة المدرسة', 'ok');
          drawTelegram();
        }
        function test() {
          var chat = String(f.input.value || '').trim();
          if (!chat) { UI.toast('أدخل chat_id أولًا', 'warn'); return; }
          if (!canSend) { UI.toast('الإرسال الفعلي غير مفعّل — فعّله من «سجل تلقرام ← ربط البوت»', 'warn'); return; }
          S.setTelegramChatId(uid, chat);
          S.telegramSendTo(chat, 'اختبار ربط: رسالة من منصة تابعني — وصلتك خاصة ✓').then(function (r) {
            UI.toast(r.ok ? 'وصلت الرسالة ✓ تحقّق من تلقرام' : ('لم تُرسل: ' + (r.detail || 'خطأ غير معروف')), r.ok ? 'ok' : 'err');
            drawTelegram();
          });
        }
        tgSlot.appendChild(UI.panel('ربط تلقرام (رسائل خاصة)', 'لتصلك أذون دخول الفصل والرسائل الخاصة على جوالك وحدك، لا في مجموعة المدرسة.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ', onClick: save }),
          h('button', { class: 'btn btn-soft', type: 'button', text: 'إرسال رسالة تجريبية', onClick: test })
        ], [
          h('div', { class: 'grid-2-app' }, [f.wrap]),
          h('div', { class: 'muted', style: { marginTop: '6px' },
            text: linked ? 'الحالة: مرتبطة ✓ — الرسائل الخاصة تصلك وحدك.' : 'الحالة: غير مرتبطة — تصلك التنبيهات في مجموعة المدرسة.' }),
          h('ol', { class: 'muted', style: { marginTop: '10px', paddingInlineStart: '18px', lineHeight: '1.9' } }, [
            h('li', { text: 'افتح بوت المنصة في تلقرام واضغط «ابدأ» (Start) — أو أرسل /start.' }),
            h('li', { text: 'افتح @userinfobot في تلقرام وأرسل أي رسالة — سيرد بمعرّفك الرقمي (chat_id).' }),
            h('li', { text: 'الصق الرقم أعلاه واضغط «حفظ»، ثم «إرسال رسالة تجريبية» للتأكد أنها تصلك وحدك.' })
          ]),
          !canSend ? h('div', { class: 'callout', style: { marginTop: '10px' },
            text: 'تنبيه: الإرسال الفعلي إلى تلقرام غير مفعّل حاليًا (الوضع: محاكاة). تُسجَّل الرسائل داخل المنصة فقط حتى يُفعّله مدير المدرسة من «سجل تلقرام ← ربط البوت».' }) : null
        ]));
      }

      function drawAll() { drawStats(); drawInbox(); drawOutbox(); }
      view.appendChild(statSlot);
      view.appendChild(inSlot);
      view.appendChild(outSlot);
      view.appendChild(tgSlot);
      drawAll();
      drawTelegram();

      /* يُسجَّل الاطلاع بمجرد فتح الصندوق (أثر متابعة) */
      S.readAllMessages(uid);
      S.markRead();
      setTimeout(App.refreshBadges, 50);
    }
  });
})();
