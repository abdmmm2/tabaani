/* =============================================================================
   support.js — الدعم الفني: بوت (فارس الحربي · هند المطيري) بنظام شفتين ولهجة
   سعودية + نظام تذاكر يصل «قسم الدعم» و«المشرف العام».
   ---------------------------------------------------------------------------
   كل المستخدمين يفتحون المساعد من الزر العائم (أسفل يسار الشاشة):
   يسأل البوت، ويقبل صورة لقطة شاشة، ويفتح تذكرة متابعة.
   ووحدة «الدعم الفني» (المشرف العام وموظف الدعم) لإدارة التذاكر والردّ فيها.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* --------------------------- صور الموظفين (يسار الاسم) --------------------------- */
  function agentHead(agent, opts) {
    opts = opts || {};
    return h('div', { style: { display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: '10px' } }, [
      h('img', {
        src: agent.img, alt: agent.name, width: opts.size || '42', height: opts.size || '42',
        style: { width: (opts.size || 42) + 'px', height: (opts.size || 42) + 'px', borderRadius: '50%',
                 border: '2px solid var(--amber-500)', objectFit: 'cover', background: 'var(--bg-soft)' }
      }),
      h('div', {}, [
        h('div', { style: { fontWeight: '800' }, text: agent.name }),
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: agent.title || ('الدعم الفني · ' + agent.shift) })
      ])
    ]);
  }

  function bubble(msg) {
    var mine = msg.from === 'user';
    var who = msg.from === 'bot' ? S.agent(msg.agentId || (S.agentNow().id)) : null;
    return h('div', { style: { display: 'flex', gap: '8px', justifyContent: mine ? 'flex-start' : 'flex-start', marginBottom: '10px' } }, [
      msg.from === 'bot' && who ? h('img', { src: who.img, width: '34', height: '34', alt: '',
        style: { width: '34px', height: '34px', borderRadius: '50%', border: '2px solid var(--amber-500)', objectFit: 'cover', flex: '0 0 auto' } }) : null,
      h('div', { style: {
        background: mine ? 'var(--bg-soft)' : (msg.from === 'bot' ? 'var(--amber-50)' : 'var(--mint-100)'),
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 11px',
        maxWidth: '86%', fontSize: 'var(--fs-sm)', lineHeight: '1.9' } }, [
        h('div', { class: 'muted', style: { fontSize: '11px', marginBottom: '2px' },
          text: (msg.from === 'agent' ? ((S.list('users').filter(function (u) { return u.name === msg.name; })[0] || {}).name || msg.name || 'الدعم الفني')
            : (msg.from === 'bot' ? (who ? who.name : 'الدعم الفني') : 'أنا')) + ' · ' + UI.fmtTime(msg.at) }),
        msg.text ? h('div', { text: msg.text }) : null,
        msg.image ? h('a', { href: msg.image, target: '_blank', rel: 'noopener' },
          [h('img', { src: msg.image, alt: 'مرفق', style: { maxWidth: '220px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', display: 'block', marginTop: '6px' } })]) : null
      ])
    ]);
  }

  /* ================================ المساعد (للجميع) ================================ */
  var chat = { session: [], attached: null, attachedMeta: null, ticketId: '' };

  App.openSupport = function (opts) {
    opts = opts || {};
    var agent = S.agentNow();
    var thread = h('div', { style: { maxHeight: '46vh', overflowY: 'auto', padding: '4px 2px' } });
    var ticketSlot = h('div');
    var input = h('textarea', { class: 'input', rows: '2', placeholder: 'اكتب استفسارك… (مثال: ما أقدر أسكّر التحضير)' });
    var attachNote = h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } });
    var attachInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

    function push(msg) {
      chat.session.push(msg);
      clear(thread);
      chat.session.forEach(function (m) { thread.appendChild(bubble(m)); });
      thread.scrollTop = thread.scrollHeight;
    }

    function renderTickets() {
      clear(ticketSlot);
      var mine = S.tickets({ mine: true });
      if (!mine.length) return;
      ticketSlot.appendChild(h('div', { class: 'lic-note', style: { marginTop: '8px' }, text: 'تذاكري (' + mine.length + '):' }));
      mine.slice(0, 4).forEach(function (t) {
        ticketSlot.appendChild(h('div', { class: 'lic-banner is-' + (t.status === 'closed' ? 'ok' : 'warn'), style: { marginTop: '6px' } }, [
          h('strong', { text: t.no + ' — ' + t.subject }),
          h('span', { class: 'muted', text: '· ' + S.ticketStatusName(t.status) + ' · آخر تحديث ' + UI.fmtTime(t.updatedAt) }),
          t.messages.length ? h('button', { class: 'btn-link', type: 'button', text: 'عرض المحادثة', onClick: function () { showTicket(t); } }) : null
        ]));
      });
    }

    function showTicket(t) {
      clear(thread);
      t.messages.forEach(function (m) { thread.appendChild(bubble({ at: m.at, from: m.from, name: m.name, text: m.text, image: m.image, agentId: t.agentId })); });
      thread.scrollTop = thread.scrollHeight;
    }

    function openTicketFromChat(text) {
      var r = S.openTicket({
        subject: chat.lastSubject || 'استفسار من الدعم الفني',
        category: chat.lastCategory || 'other',
        byName: S.session.name, byRole: S.session.role, schoolId: S.session.schoolId || '',
        phone: '', agentId: agent.id,
        messages: chat.session.map(function (m) { return { at: m.at, from: m.from, name: m.name, text: m.text, image: m.image || '' }; })
          .concat([{ at: new Date().toISOString(), from: 'user', name: S.session.name, text: text || 'طلب فتح تذكرة' }])
      });
      if (!r.ok) { UI.toast(r.error, 'warn'); return; }
      chat.ticketId = r.ticket.id;
      push({ at: r.ticket.at, from: 'bot', text: 'تم! فتحت لك تذكرة رقم ' + r.ticket.no + ' ووصلت لقسم الدعم والمشرف العام. أي أحد من الفريق بيردّ عليك هنا — وبيننا وبينك تواصل بأي وقت.', agentId: agent.id });
      UI.toast('فُتحت تذكرة ' + r.ticket.no + ' ✓', 'ok');
      renderTickets();
      App.refreshBadges && App.refreshBadges();
    }

    function send(text, image, meta) {
      var t = String(text || '').trim();
      if (!t && !image) return;
      push({ at: new Date().toISOString(), from: 'user', text: t, image: image || '', name: S.session.name });
      input.value = '';
      chat.attached = null; chat.attachedMeta = null; attachNote.textContent = '';
      clear(thread); chat.session.forEach(function (m) { thread.appendChild(bubble(m)); });
      thread.appendChild(h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: agent.name + ' يكتب…' }));
      setTimeout(function () {
        var r = S.botChat(t, { image: !!image, imageMeta: meta || null, agentId: agent.id });
        chat.lastSubject = r.subject; chat.lastCategory = r.category;
        clear(thread);
        chat.session.forEach(function (m) { thread.appendChild(bubble(m)); });
        push({ at: new Date().toISOString(), from: 'bot', text: r.text, agentId: r.agent.id });
        if (r.offerTicket) {
          thread.appendChild(h('div', { class: 'cluster', style: { margin: '6px 0 10px' } }, [
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'افتح تذكرة متابعة', onClick: function () {
              openTicketFromChat(t || (image ? 'أرفقت صورة للمشكلة' : ''));
            } }),
            h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'تصل «قسم الدعم» و«المشرف العام» فورًا.' })
          ]));
        }
      }, 550);
    }

    push({ at: new Date().toISOString(), from: 'bot', agentId: agent.id,
      text: 'هلا والله ومسهلا! أنا ' + agent.name + ' من الدعم الفني في تابعني (' + agent.shift + '). ' +
            'اسألني عن التحضير أو المخاطر أو التقارير أو الاشتراك… وإذا تبي، ارفع صورة لقطة الشاشة وأنا أفهمها معك وأفتح لك تذكرة.' });

    attachInput.addEventListener('change', function () {
      var file = attachInput.files && attachInput.files[0];
      if (!file) return;
      UI.compressImage(file, { max: 900, quality: 0.6 }).then(function (r) {
        chat.attached = r.dataUrl; chat.attachedMeta = r;
        attachNote.textContent = 'صورة مرفقة ✓ (' + r.w + '×' + r.h + ' · ' + r.kb + ' ك.ب)';
      });
    });

    var dlg = UI.modal({
      title: 'الدعم الفني — تابعني', wide: true,
      body: [
        h('div', { class: 'lic-banner is-ok' }, [agentHead(agent, { size: 46 }),
          h('span', { class: 'muted', text: 'على الشفت الآن — البوت يرد فورًا وبلهجة سعودية.' })]),
        h('div', { class: 'lic-banner', style: { marginTop: '8px' } }, [
          h('span', { class: 'muted', text: 'الشفتان: ' + S.AGENTS[0].name + ' ' + S.AGENTS[0].shift + ' · ' + S.AGENTS[1].name + ' ' + S.AGENTS[1].shift })
        ]),
        thread, ticketSlot,
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px' } }, [
          input,
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'صورة', onClick: function () { attachInput.click(); } }),
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إرسال', onClick: function () { send(input.value, chat.attached, chat.attachedMeta); } })
          ])
        ]),
        attachInput, attachNote
      ],
      actions: [
        { label: 'فتح تذكرة متابعة', class: 'btn-outline', onClick: function () { openTicketFromChat(input.value); } },
        { label: 'إغلاق' }
      ]
    });
    renderTickets();
    if (opts.greet) input.focus();
    return dlg;
  };

  /* ================================ وحدة الدعم الفني ================================ */
  App.register({
    id: 'support',
    label: 'الدعم الفني',
    icon: '&#127911;',
    roles: ['super', 'support'],
    render: function (view) {
      var state = { filter: 'active', open: '' };

      function draw() {
        clear(view);
        var st = S.ticketStats();
        var agent = S.agentNow();
        var rows = S.tickets(state.filter === 'all' ? {} : { status: state.filter === 'active' ? '' : state.filter });
        if (state.filter === 'active') rows = S.tickets().filter(function (t) { return t.status !== 'closed'; });

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('تذاكر جديدة', String(st.open), st.open ? 'تحتاج ردًّا' : 'لا جديد', st.open ? 'gold' : null),
          UI.statCard('قيد المعالجة', String(st.progress)),
          UI.statCard('مغلقة', String(st.closed)),
          UI.statCard('الإجمالي', String(st.total))
        ]));

        view.appendChild(h('div', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('div', {}, [h('h3', { text: 'المساعد الآلي على الشفت الآن' }),
              h('p', { class: 'muted', text: 'يرد بلهجة سعودية ويستقبل صور المشاكل ويفتح التذاكر — والتحويل للفريق عند الحاجة.' })]),
            null
          ]),
          h('div', { class: 'panel-body' }, [
            h('div', { class: 'lic-banner is-ok' }, [agentHead(agent, { size: 52 })]),
            h('div', { class: 'lic-grid', style: { marginTop: '10px' } }, S.AGENTS.map(function (a) {
              var on = a.id === agent.id;
              return h('div', { class: 'lic-row' }, [
                h('span', { class: 'lr-k', text: a.name + (on ? ' — على الشفت الآن ✓' : '') }),
                h('span', { class: 'lr-v', text: a.shift })
              ]);
            })),
            h('div', { class: 'cluster', style: { marginTop: '10px' } }, [
              h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تجربة المساعد', onClick: function () { App.openSupport({ greet: true }); } }),
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '🤖 موظف التسجيل — تسجيل مدرسة', onClick: function () { App.go('regagent'); } })
            ])
          ])
        ]));

        var bar = h('div', { class: 'tabbar' });
        [['active', 'المفتوحة'], ['all', 'الكل'], ['closed', 'المغلقة']].forEach(function (t) {
          bar.appendChild(h('button', {
            class: 'tab' + (state.filter === t[0] ? ' is-active' : ''), type: 'button', text: t[1],
            onClick: function () { state.filter = t[0]; draw(); }
          }));
        });

        view.appendChild(UI.panel('تذاكر الدعم', 'التذاكر الواردة من المدارس والزوار — مع الصور المرفقة كاملة.', null, [
          bar,
          rows.length ? UI.table({
            cols: [
              { label: 'الرقم', render: function (t) { return h('code', { text: t.no }); } },
              { label: 'الموضوع', render: function (t) { return h('strong', { text: t.subject }); } },
              { label: 'من', render: function (t) { return t.byName + (t.schoolId ? ' · ' + ((S.school(t.schoolId) || {}).name || '') : ' · زائر'); } },
              { label: 'التصنيف', render: function (t) { return UI.badge(S.ticketCatName(t.category), 'plain'); } },
              { label: 'الحالة', render: function (t) {
                  var m = { open: ['جديدة', 'warn'], progress: ['قيد المعالجة', 'amber'], waiting: ['بانتظار المستخدم', 'plain'], closed: ['مغلقة', 'ok'] }[t.status] || ['—', 'plain'];
                  return UI.badge(m[0], m[1]);
                } },
              { label: 'الجهة', render: function (t) { return UI.badge(t.assignee === 'super' ? 'المشرف العام' : 'قسم الدعم', 'plain'); } },
              { label: 'آخر تحديث', render: function (t) { return UI.fmtDate(t.updatedAt) + ' · ' + UI.fmtTime(t.updatedAt); } },
              { label: '', class: 'row-actions', render: function (t) {
                  return h('button', { class: 'mini-btn is-primary', type: 'button', text: 'فتح', onClick: function () { state.open = t.id; draw(); } });
                } }
            ], rows: rows, empty: 'لا تذاكر.'
          }) : UI.empty('لا تذاكر في هذا التصنيف.')
        ]));

        var open = state.open ? S.ticket(state.open) : null;
        if (open) view.appendChild(ticketPanel(open, draw));
      }

      function ticketPanel(t, redraw) {
        var thread = h('div', { style: { maxHeight: '42vh', overflowY: 'auto' } });
        t.messages.forEach(function (m) { thread.appendChild(bubble({ at: m.at, from: m.from, name: m.name, text: m.text, image: m.image, agentId: t.agentId })); });
        var reply = h('textarea', { class: 'input', rows: '2', placeholder: 'اكتب الرد… (يصل لصاحب التذكرة ومدير مدرسته)' });
        var attach = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        var att = { url: '' };
        attach.addEventListener('change', function () {
          var f = attach.files && attach.files[0];
          if (!f) return;
          UI.compressImage(f, { max: 900, quality: 0.6 }).then(function (r) { att.url = r.dataUrl; UI.toast('أُرفقت صورة ✓', 'ok'); });
        });
        function replyNow() {
          if (!reply.value.trim() && !att.url) { UI.toast('اكتب ردًّا أو أرفق صورة', 'warn'); return; }
          S.ticketAdd(t.id, { from: 'agent', text: reply.value, image: att.url });
          UI.toast('أُرسل الرد ✓', 'ok');
          redraw();
        }
        reply.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) replyNow(); });

        return h('section', { class: 'panel', style: { marginTop: '14px' } }, [
          h('div', { class: 'panel-head' }, [
            h('div', {}, [h('h3', { text: 'تذكرة ' + t.no + ' — ' + t.subject }),
              h('p', { class: 'muted', text: 'من ' + t.byName + ' (' + (S.roleLabel(t.byRole) || t.byRole) + ')' +
                (t.schoolId ? ' · ' + ((S.school(t.schoolId) || {}).name || '') : ' · زائر') +
                ' · ' + UI.fmtDate(t.at) + ' · ' + UI.fmtTime(t.at) + ' · التصنيف: ' + S.ticketCatName(t.category) })]),
            UI.badge(S.ticketStatusName(t.status), t.status === 'closed' ? 'ok' : 'warn')
          ]),
          h('div', { class: 'panel-body' }, [
            thread,
            h('div', { class: 'cluster', style: { marginTop: '10px' } }, [
              h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: t.status === 'closed' ? 'إعادة الفتح' : 'إغلاق التذكرة',
                onClick: function () { S.ticketStatus(t.id, t.status === 'closed' ? 'open' : 'closed'); UI.toast('حُدّثت حالة التذكرة', 'ok'); redraw(); } }),
              h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'بانتظار المستخدم',
                onClick: function () { S.ticketStatus(t.id, 'waiting'); redraw(); } }),
              h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحويل إلى المشرف العام',
                onClick: function () { S.ticketAssign(t.id, 'super'); S.ticketAdd(t.id, { from: 'agent', text: 'حوّلت التذكرة إلى المشرف العام لمتابعتها.' }); redraw(); } }),
              h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحويل إلى قسم الدعم',
                onClick: function () { S.ticketAssign(t.id, 'support'); redraw(); } }),
              h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'إرفاق صورة', onClick: function () { attach.click(); } }),
              attach
            ]),
            h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'flex-start' } }, [
              reply,
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إرسال الرد', onClick: replyNow })
            ])
          ])
        ]);
      }

      draw();
    }
  });

  /* بادج عدّ التذاكر الجديدة */
  App.__supportBadge = function () { return S.ticketStats().open; };
})();
