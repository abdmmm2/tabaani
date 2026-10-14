/* =============================================================================
   telegram-connect.js — لوحة ربط بوت تلقرام (تُدمج داخل وحدة سجل تلقرام)
   ---------------------------------------------------------------------------
   ثلاثة أوضاع: محاكاة · وسيط (relay) · إرسال مباشر. وتدعم:
   • بوت واحد للمنصة + مجموعة لكل مدرسة.
   • بوت مستقل لكل مدرسة (توكن ومجموعة مستقلة) عند تشغيل «إعداد لكل مدرسة».
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, h = UI.h, clear = UI.clear;

  var MODES = [
    { value: 'sim', label: 'محاكاة فقط (بلا إرسال فعلي)' },
    { value: 'relay', label: 'بوت المنصة عبر وسيط — موصى به (التوكن مخفي)' },
    { value: 'direct', label: 'إرسال مباشر برمز البوت — للتجربة السريعة' }
  ];

  function build(onChange) {
    var c = S.telegramConfig();
    var slot = h('div');

    function save(patch, msg) {
      S.saveTelegramConfig(patch);
      if (msg) UI.toast(msg, 'ok');
      if (onChange) onChange();
    }

    function draw() {
      clear(slot);
      var cfg = S.telegramConfig();
      var ready = S.telegramReady();
      var dest = S.telegramFor(S.session.schoolId);

      /* قائمة التحقق */
      var stepsDone = [
        { ok: !!cfg.botToken || !!cfg.relayUrl, label: '١) بيانات الإرسال (رمز البوت أو رابط الوسيط)' },
        { ok: !!(dest.chatId), label: '٢) معرّف محادثة المدرسة (مجموعة أو حساب)' },
        { ok: !!cfg.lastTestOk, label: '٣) رسالة تجريبية وصلت بنجاح' }
      ];
      slot.appendChild(h('div', { class: 'tg-check' }, stepsDone.map(function (st) {
        return h('span', { class: 'tg-check-item ' + (st.ok ? 'is-ok' : '') }, [
          h('span', { class: 'tg-check-box', text: st.ok ? '✓' : '' }),
          h('span', { text: st.label })
        ]);
      })));

      /* حالة الربط */
      slot.appendChild(h('div', { class: 'tg-status ' + (ready ? 'is-on' : 'is-off') }, [
        h('span', { class: 'tg-status-dot', text: '' }),
        h('div', {}, [
          h('strong', { text: ready ? 'الإرسال الفعلي مُفعّل' : 'الوضع الحالي: محاكاة (الرسائل تُسجّل ولا تُرسل)' }),
          h('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '2px' },
            text: ready
              ? ('الوجهة: ' + (dest.chatId ? 'المجموعة ' + dest.chatId : 'لم تُحدَّد مجموعة بعد') + (dest.own ? ' (خاصة بهذه المدرسة)' : ' (إعداد المنصة)') +
                 (cfg.mode === 'direct' ? ' · بوت مستقل: ' + (dest.botToken ? 'نعم' : 'لا') : ' · عبر وسيط'))
              : 'اختر الوضع وأدخل البيانات ثم اضغط «إرسال رسالة تجريبية».' })
        ]),
        cfg.lastTest ? UI.badge(cfg.lastTestOk ? 'آخر تجربة: نجحت' : 'آخر تجربة: فشلت', cfg.lastTestOk ? 'mint' : 'terra') : null
      ]));

      /* هوية البوت + إضافة لمجموعة */
      if (cfg.botUsername) {
        slot.appendChild(h('div', { class: 'tg-bot-id' }, [
          h('span', { html: '&#129302;' }),
          h('strong', { text: cfg.botName || '' }),
          h('code', { dir: 'ltr', text: '@' + cfg.botUsername }),
          h('a', { class: 'btn btn-soft btn-sm', href: 'https://t.me/' + cfg.botUsername + '?startgroup=true',
            target: '_blank', rel: 'noopener', text: 'أضف البوت إلى مجموعة المدرسة' }),
          h('a', { class: 'btn btn-outline btn-sm', href: 'https://t.me/' + cfg.botUsername, target: '_blank',
            rel: 'noopener', text: 'محادثة البوت' })
        ]));
      } else if (cfg.botToken) {
        slot.appendChild(h('div', { class: 'panel-actions' }, [
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تحقّق من الرمز واقرأ هوية البوت', onClick: function () {
            S.saveTelegramConfig({ botToken: cfg.botToken });
            S.telegramBotInfo().then(function (r) {
              UI.toast(r.ok ? ('البوت: @' + r.bot.username + ' — ' + r.bot.first_name) : ('تعذّر: ' + r.error), r.ok ? 'ok' : 'bad');
              draw();
            });
          } })
        ]));
      }

      /* الوضع */
      var modeF = UI.field({ name: 'tgMode', label: 'وضع الإرسال', type: 'select', value: cfg.mode, options: MODES, half: true,
        help: 'الوسيط يخفي توكن البوت عن المتصفح — الأفضل للأمان.' });
      modeF.input.addEventListener('change', function () { save({ mode: modeF.input.value }, 'تغيّر وضع الإرسال'); });

      var perSchool = h('label', { class: 'chk' }, [
        (function () { var i = h('input', { type: 'checkbox' }); i.checked = cfg.perSchool;
          i.addEventListener('change', function () { save({ perSchool: i.checked }); draw(); }); return i; })(),
        h('span', { text: 'إعداد مستقل لكل مدرسة (مجموعة/بوت خاص بها)' })
      ]);

      slot.appendChild(h('div', { class: 'form-grid' }, [modeF.wrap, h('div', { class: 'field' }, [perSchool])]));

      /* بيانات الإرسال */
      if (cfg.mode === 'relay') {
        var urlF = UI.field({ name: 'relayUrl', label: 'رابط الوسيط (Web App URL)', dir: 'ltr', value: cfg.relayUrl, half: true,
          placeholder: 'https://script.google.com/macros/s/…/exec', help: 'رابط خدمة Apps Script أو Cloudflare Worker الذي يحمل التوكن.' });
        var keyF = UI.field({ name: 'relayKey', label: 'المفتاح السري للوسيط', dir: 'ltr', value: cfg.relayKey, half: true,
          help: 'نفس المفتاح المكتوب داخل الوسيط — يمنع أي شخص آخر من استخدامه.' });
        slot.appendChild(h('div', { class: 'form-grid' }, [urlF.wrap, keyF.wrap]));
        slot.appendChild(h('div', { class: 'panel-actions' }, [
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'حفظ بيانات الوسيط', onClick: function () {
            save({ relayUrl: urlF.input.value.trim(), relayKey: keyF.input.value.trim() }, 'حُفظت بيانات الوسيط');
            draw();
          } })
        ]));
      } else if (cfg.mode === 'direct') {
        var tkF = UI.field({ name: 'botToken', label: 'رمز البوت (Bot Token)', type: 'password', dir: 'ltr', value: cfg.botToken, half: true,
          placeholder: '1234567890:AA…', help: 'من @BotFather — يُخزَّن في متصفح هذا الجهاز فقط (الوضع المباشر للتجربة).' });
        var chF = UI.field({ name: 'chatId', label: 'معرّف المجموعة (chat id)', dir: 'ltr', value: cfg.chatId, half: true,
          placeholder: '-1001234567890', help: 'أضف @userinfobot للمجموعة ليخبرك بالمعرّف.' });
        slot.appendChild(h('div', { class: 'form-grid' }, [tkF.wrap, chF.wrap]));
        var found = h('div');
        slot.appendChild(h('div', { class: 'panel-actions' }, [
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'حفظ بيانات البوت', onClick: function () {
            save({ botToken: tkF.input.value.trim(), chatId: chF.input.value.trim() }, 'حُفظت بيانات البوت');
            draw();
          } }),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'اجلب المجموعات تلقائيًا', onClick: function () {
            S.saveTelegramConfig({ botToken: tkF.input.value.trim() });
            clear(found);
            found.appendChild(h('p', { class: 'muted', text: 'يُقرأ من تلقرام…' }));
            S.telegramFindChats().then(function (r) {
              clear(found);
              if (!r.ok) { found.appendChild(h('p', { class: 'muted', text: 'تعذّر الجلب: ' + (r.error || '') })); return; }
              if (!r.chats.length) {
                found.appendChild(h('p', { class: 'muted', html: 'لم يصل البوت لأي محادثة بعد — أضِف البوت إلى مجموعة المدرسة واكتب فيها أي رسالة (مثال: «تجربة») ثم اضغط الزر مرة أخرى.' }));
                return;
              }
              var groups = r.chats.filter(function (x) { return x.type === 'group' || x.type === 'supergroup'; });
              found.appendChild(h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' },
                html: groups.length
                  ? 'اختر <strong>مجموعة المدرسة</strong> لتصلك إشعاراتها في مجموعة القيادة.'
                  : 'لا توجد مجموعات بعد — الظاهر الآن محادثة فردية (حسابك الشخصي). <strong>للمدرسة: أنشئ مجموعة في تلقرام، أضف @Tabaani_bot فيها واجعله مشرفًا</strong>، ثم اضغط «اجلب المجموعات تلقائيًا» مرة أخرى وستظهر المجموعة هنا.' }));
              r.chats.forEach(function (ch) {
                var isGroup = ch.type === 'group' || ch.type === 'supergroup';
                found.appendChild(h('div', { class: 'cluster', style: { marginTop: '6px' } }, [
                  h('span', { text: (isGroup ? '👥 مجموعة' : (ch.type === 'channel' ? '📢 قناة' : '👤 محادثة فردية')) + ': ' + ch.title }),
                  h('code', { dir: 'ltr', text: String(ch.id) }),
                  h('button', { class: 'mini-btn is-primary', type: 'button', text: 'استخدم هذا', onClick: function () {
                    chF.input.value = String(ch.id);
                    save({ chatId: String(ch.id) }, 'حُفظ معرّف المحادثة');
                    draw();
                  } })
                ]));
              });
            });
          } })
        ]));
        slot.appendChild(found);
        slot.appendChild(h('div', { class: 'tg-warn' }, [
          h('strong', { html: '&#9888;&#65039; تنبيه أمان: ' }),
          h('span', { text: 'الوضع المباشر يحفظ رمز البوت داخل متصفح هذا الجهاز — أي شخص يفتح المنصة على نفس الجهاز يستطيع قراءته. للاستخدام الرسمي حوّل إلى «الوسيط» (الرمز يبقى بعيدًا عن المتصفح).' }),
          h('div', { class: 'cluster', style: { marginTop: '8px' } }, [
            cfg.botToken ? h('span', { class: 'muted', dir: 'ltr', style: { fontSize: 'var(--fs-xs)' },
              text: 'الرمز المحفوظ: ' + String(cfg.botToken).slice(0, 5) + '…' + String(cfg.botToken).slice(-4) }) : null,
            h('a', { class: 'btn btn-outline btn-sm', href: '../docs/telegram-relay/apps-script.gs', target: '_blank', rel: 'noopener', text: 'جهّز الوسيط (الأفضل)' }),
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'امسح الرمز من هذا الجهاز', onClick: function () {
              UI.confirm('سيُمسح رمز البوت ومعرّف المحادثة من هذا الجهاز (يتوقف الإرسال حتى تعيد إدخالها أو تستخدم الوسيط). متابعة؟',
                { ok: 'امسح', danger: true }).then(function (ok) {
                if (!ok) return;
                S.saveTelegramConfig({ botToken: '', chatId: '', botUsername: '', botName: '', lastTestOk: false, lastTest: null, lastTestMsg: '' });
                UI.toast('مُسح الرمز من هذا الجهاز', 'ok');
                draw();
              });
            } })
          ])
        ]));
      }

      /* جدول المدارس عند تشغيل الإعداد المستقل */
      if (cfg.perSchool) {
        var schools = S.list('schools');
        var rows = schools.map(function (sc) {
          var chI = h('input', { class: 'input', type: 'text', dir: 'ltr', value: sc.telegramChatId || '', placeholder: '-100…', style: { width: '170px' } });
          var tkI = h('input', { class: 'input', type: 'text', dir: 'ltr', value: sc.telegramBotToken || '', placeholder: 'بوت مستقل (اختياري)', style: { width: '190px' } });
          return h('tr', {}, [
            h('td', { text: sc.name }),
            h('td', {}, [chI]),
            h('td', {}, [tkI]),
            h('td', {}, [h('button', { class: 'mini-btn is-primary', type: 'button', text: 'حفظ', onClick: function () {
              S.setSchoolChatId(sc.id, chI.value.trim());
              S.setSchoolBotToken(sc.id, tkI.value.trim());
              UI.toast('حُفظت وجهة ' + sc.name, 'ok');
              draw();
            } })])
          ]);
        });
        slot.appendChild(h('div', { class: 'table-wrap' }, [
          h('table', { class: 'table' }, [
            h('thead', {}, [h('tr', {}, [h('th', { text: 'المدرسة' }), h('th', { text: 'معرّف المجموعة' }), h('th', { text: 'بوت مستقل (اختياري)' }), h('th', { text: '' })])]),
            h('tbody', {}, rows)
          ])
        ]));
        slot.appendChild(h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' },
          text: 'اترك خانة البوت فارغة لاستخدام بوت المنصة مع مجموعة المدرسة — أو ضع رمز بوت مستقل للمدرسة ليصبح بوتها المستقل تمامًا.' }));
      }

      /* اختبار الإرسال */
      var testF = UI.field({ name: 'tgTest', label: 'نص الرسالة التجريبية', value: 'رسالة تجريبية من منصة تابعني — الإرسال يعمل ✓', dir: 'rtl' });
      slot.appendChild(h('div', { class: 'form-grid' }, [testF.wrap]));
      slot.appendChild(h('div', { class: 'panel-actions' }, [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'إرسال رسالة تجريبية', onClick: function () {
          if (!S.telegramReady()) { UI.toast('أكمل بيانات الإرسال أولًا (الوضع الحالي: محاكاة)', 'warn'); return; }
          UI.toast('يُرسل…', 'info');
          S.telegramTest(testF.input.value).then(function (r) {
            UI.toast(r.ok ? 'وصلت الرسالة إلى تلقرام ✓' : ('فشل الإرسال: ' + (r.detail || 'تحقّق من البيانات')), r.ok ? 'ok' : 'bad');
            draw();
          });
        } }),
        cfg.lastTestMsg ? h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'آخر نتيجة: ' + cfg.lastTestMsg }) : null
      ]));

      /* ملفات الوسيط */
      slot.appendChild(h('div', { class: 'tg-files' }, [
        h('strong', { text: 'ملفات الوسيط الجاهزة (لإخفاء الرمز عن المتصفح + ردود آلية):' }),
        h('div', { class: 'cluster', style: { marginTop: '6px' } }, [
          h('a', { class: 'btn btn-outline btn-sm', href: '../docs/telegram-relay/apps-script.gs', target: '_blank', rel: 'noopener', text: 'Apps Script (رد آلي + إخفاء الرمز)' }),
          h('a', { class: 'btn btn-outline btn-sm', href: '../docs/telegram-relay/worker.js', target: '_blank', rel: 'noopener', text: 'Cloudflare Worker' }),
          h('a', { class: 'btn btn-soft btn-sm', href: '../docs/telegram-relay/README.md', target: '_blank', rel: 'noopener', text: 'الدليل الكامل' })
        ])
      ]));

      /* الخطوات */
      slot.appendChild(h('details', { class: 'tg-help' }, [
        h('summary', { text: 'كيف أجهّز البوت؟ (خطوات مختصرة)' }),
        h('ol', {}, [
          h('li', { text: 'افتح تلقرام → @BotFather → أرسل /newbot → اختر اسمًا ومعرّفًا → انسخ الرمز (Token).' }),
          h('li', { text: 'أنشئ مجموعة للمدرسة (مدارس متعددة؟ مجموعة لكل مدرسة) وأضف البوت عضوًا فيها، واجعله مشرفًا ليتمكن من الإرسال.' }),
          h('li', { text: 'للحصول على معرّف المجموعة: أضف @userinfobot إلى المجموعة، أو استخدم رابط getUpdates على البوت.' }),
          h('li', { text: 'اختر «وسيط» (الأفضل أمنيًا): انشر وسيطًا مجانيًا في Apps Script ثم الصق رابط الـ Web App والمفتاح السري.' }),
          h('li', { text: 'اضغط «إرسال رسالة تجريبية» — إذا وصلت للمجموعة فالإرسال يعمل مع كل تنبيهات المنصة.' })
        ]),
        h('ul', {}, [
          h('li', { text: 'بوت واحد لكل المنصة: أبسط وأقل صيانة — وكل مدرسة لها مجموعتها الخاصة.' }),
          h('li', { text: 'بوت مستقل لكل مدرسة: هويّة وتحكّم كامل لكل مدرسة (رمز خاص بها) — يحتاج إنشاء بوت لكل مدرسة.' }),
          h('li', { text: 'الرمز والمفتاح يُخزَّنان في قاعدة بيانات المنصة على جهازك؛ للإنتاج يُنقلان إلى الخادم.' })
        ])
      ]));
    }

    draw();
    return slot;
  }

  window.TelegramConnect = { build: build };
})();
