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

      function drawAll() { drawStats(); drawInbox(); drawOutbox(); }
      view.appendChild(statSlot);
      view.appendChild(inSlot);
      view.appendChild(outSlot);
      drawAll();

      /* يُسجَّل الاطلاع بمجرد فتح الصندوق (أثر متابعة) */
      S.readAllMessages(uid);
      S.markRead();
      setTimeout(App.refreshBadges, 50);
    }
  });
})();
