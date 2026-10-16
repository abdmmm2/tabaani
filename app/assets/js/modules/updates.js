/* ==========================================================================
   تحديثات المنصة — نشر + إشعار حقيقي (تلقرام + إيميل) + لافتة عند الدخول
   --------------------------------------------------------------------------
   • المشرف العام: يرى كل التحديثات، وينشر تحديثًا لفئة أو لقسم (وحدات).
   • بقية الأدوار: لا يصلهم إلا تحديث **أقسامهم** التي يفتحونها.
   • الإرسال حقيقي: تلقرام (bot) + إيميل (نقطة Apps Script) — ولا نجاح كاذب.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /** هل دور ما يفتح هذه الوحدات؟ (نتيجة تُحسب من سجل الوحدات نفسه) */
  function allMods() {
    var reg = App.modules || {};
    return Object.keys(reg).map(function (k) { return reg[k]; });
  }
  function canSeeModules(role, modIds) {
    var reg = App.modules || {};
    return (modIds || []).some(function (id) {
      var mod = reg[id];
      return !!mod && (mod.roles || []).indexOf(role) > -1;
    });
  }

  function updText(u) {
    return '🔔 تحديث تابعني' + (u.version ? ' (v' + u.version + ')' : '') + '\n' + u.title +
      (u.body ? '\n' + u.body : '') +
      '\n\nللمزيد زُر حسابك في المنصة: ' + location.origin + location.pathname;
  }

  /** إرسال تحديث لأصحابه: تلقرام + إيميل (يُعيد تقريرًا صريحًا) */
  App.sendUpdate = function (u, via, cb) {
    via = via || 'both';
    var targets = S.updateTargets(u, canSeeModules);
    if (!targets.length) { if (cb) cb({ ok: false, error: 'لا مستخدمين في هذه الفئة', sent: 0 }); return; }
    var report = { ok: true, tg: 0, mail: 0, failed: [], total: targets.length };
    var jobs = [];
    targets.forEach(function (t) {
      if (via === 'tg' || via === 'both') {
        jobs.push(function (next) {
          var chat = t.telegramChatId || t.telegram || '';
          if (!chat) { report.failed.push(t.name + ': بلا معرّف تلقرام'); return next(); }
          Promise.resolve(S.telegramSend(updText(u), t.schoolId || '', chat)).then(function (r) {
            if (r && r.ok) { report.tg++; S.markUpdateSent(u.id, t.id + ':tg'); }
            else report.failed.push(t.name + ': ' + ((r && (r.error || r.note)) || 'فشل تلقرام'));
            next();
          }).catch(function () { report.failed.push(t.name + ': تعذّر تلقرام'); next(); });
        });
      }
      if (via === 'mail' || via === 'both') {
        jobs.push(function (next) {
          if (!t.email) { report.failed.push(t.name + ': بلا بريد'); return next(); }
          if (!S.driveConfigured()) { report.failed.push('نقطة الإرسال غير مربوطة'); return next(); }
          App.cloud.mail({ to: t.email, subject: 'تابعني — تحديث المنصة: ' + u.title, body: updText(u),
            html: '<div dir="rtl" style="font-family:Tahoma"><h3>' + u.title + '</h3><p>' +
              String(u.body || '').replace(/\n/g, '<br>') + '</p><p>للمزيد زُر حسابك في المنصة.</p></div>' },
            function (err) {
              if (err) report.failed.push(t.name + ': ' + (err.message || 'فشل البريد'));
              else { report.mail++; S.markUpdateSent(u.id, t.id + ':mail'); }
              next();
            });
        });
      }
    });
    (function run(i) {
      if (i >= jobs.length) {
        report.ok = (report.tg + report.mail) > 0;
        if (cb) cb(report);
        return;
      }
      jobs[i](function () { run(i + 1); });
    })(0);
  };

  /** لافتة تظهر أعلى المنصة عند وجود تحديثات لم تُقرأ */
  App.updatesBanner = function (list, onSeen) {
    var u = list[0];
    var bar = h('div', { class: 'update-banner' }, [
      h('span', { class: 'ub-ic', html: '&#128276;' }),
      h('div', { class: 'ub-txt' }, [
        h('strong', { text: list.length > 1 ? (list.length + ' تحديثات جديدة للمنصة') : ('تحديث جديد: ' + u.title) }),
        h('span', { text: ' — ' + String(u.body || u.title).slice(0, 160) })
      ]),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تم ✓', onClick: function () {
        list.forEach(function (x) { S.markUpdateSeen(x.id); });
        bar.remove();
        if (onSeen) onSeen();
      } }),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'التفاصيل', onClick: function () {
        UI.modal({ title: 'تحديثات المنصة', wide: true, body: [
          h('ul', { class: 'promo-steps' }, list.map(function (x) {
            return h('li', {}, [h('strong', { text: x.title + ' ' }), h('span', { class: 'muted', text: UI.fmtDateTime(x.at) + (x.version ? ' · v' + x.version : '') }),
              h('div', { class: 'muted', text: x.body || '' })]);
          }))
        ], actions: [{ label: 'تم', class: 'btn-primary', onClick: function (close) {
          list.forEach(function (x) { S.markUpdateSeen(x.id); }); bar.remove(); close(); if (onSeen) onSeen();
        } }] });
      } }),
      h('button', { class: 'icon-btn', type: 'button', title: 'إخفاء', html: '&times;', onClick: function () { bar.remove(); } })
    ]);
    return bar;
  };

  App.register({
    id: 'updates',
    label: 'تحديثات المنصة',
    icon: '&#128276;',
    roles: ['super'],
    render: function (view) {
      var host = h('div', { class: 'stack' });

      var titleF = UI.field({ name: 'title', label: 'عنوان التحديث', half: false, required: true, placeholder: 'مثال: بحث شامل جديد في لوحة التحكم' });
      var verF = UI.field({ name: 'ver', label: 'الإصدار', half: true, placeholder: 'v62' });
      var bodyF = UI.field({ name: 'body', label: 'التفاصيل', type: 'textarea', half: false, placeholder: 'ما الجديد؟ جملة أو جملتان.' });
      var toF = UI.field({
        name: 'who', label: 'الجهة المستهدفة', type: 'select', half: true,
        options: [{ value: 'super', label: 'المشرف العام (تنبيه كامل للمنصة)' }, { value: 'all', label: 'كل المستخدمين' }]
          .concat(S.rolesList().filter(function (r) { return r.id !== 'super'; }).map(function (r) { return { value: r.id, label: r.label || r.name }; }), [{ value: 'sections', label: 'حسب الأقسام (وحدات محددة)' }]),
        value: 'super'
      });
      var modBox = h('div', { class: 'chips', style: { marginTop: '8px' } });
      var pickedMods = [];
      {
        allMods().forEach(function (m) {
          var cb = h('input', { type: 'checkbox' });
          cb.addEventListener('change', function () {
            pickedMods = cb.checked ? pickedMods.concat([m.id]) : pickedMods.filter(function (x) { return x !== m.id; });
          });
          modBox.appendChild(h('label', { class: 'checkline' }, [cb, h('span', { text: m.label })]));
        });
      }
      var slider = h('select', { class: 'input' });

      function publish() {
        var who = toF.input.value;
        var u = S.addUpdate({
          title: titleF.input.value, body: bodyF.input.value, version: verF.input.value,
          audience: who === 'sections' ? [] : [who],
          sections: who === 'sections' ? pickedMods : []
        });
        if (!u.ok) { UI.toast(u.error, 'bad'); return null; }
        UI.toast('نُشر التحديث ✓', 'ok');
        return u.update;
      }

      host.appendChild(UI.panel('نشر تحديث جديد', 'المشرف العام يُشعَر فورًا (إيميل + تلقرام)، وبقية الأدوار يصلهم تحديث **أقسامهم** فقط عند الدخول.', [
        h('button', { class: 'btn btn-primary', type: 'button', text: 'انشر وأشعر بالإيميل + تلقرام', onClick: function () {
          var u = publish(); if (!u) return;
          App.sendUpdate(u, 'both', function (r) {
            UI.toast(r.ok ? ('أُرسل — تلقرام: ' + r.tg + ' · إيميل: ' + r.mail) : ('لم يُرسل: ' + (r.error || (r.failed[0] || 'تحقّق من الربط'))), r.ok ? 'ok' : 'warn');
            App.route();
          });
        } }),
        h('button', { class: 'btn btn-outline', type: 'button', text: 'انشر فقط (بلا إرسال)', onClick: function () { if (publish()) App.route(); } })
      ], [
        h('div', { class: 'form-grid' }, [titleF.wrap, verF.wrap, bodyF.wrap, toF.wrap]),
        h('div', { class: 'muted', style: { marginTop: '6px', fontSize: 'var(--fs-xs)' }, text: 'الأقسام (تُستخدم عند اختيار «حسب الأقسام»):' }),
        modBox,
        h('div', { class: 'callout info', text: 'الإرسال حقيقي: تلقرام يحتاج ربط البوت لكل مستخدم، والإيميل يحتاج نقطة Apps Script مربوطة (بيانات تابعني ← الحفظ السحابي).' })
      ]));

      var list = S.updates();
      host.appendChild(UI.panel('سجل التحديثات', list.length + ' تحديثًا', list.length ? [
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'أعد إرسال الأحدث', onClick: function () {
          App.sendUpdate(list[0], 'both', function (r) { UI.toast('تلقرام: ' + r.tg + ' · إيميل: ' + r.mail, r.ok ? 'ok' : 'warn'); });
        } })
      ] : null, [
        UI.table({
          cols: [
            { label: 'العنوان', key: 'title' },
            { label: 'الفئة', render: function (u) { return S.updateAudienceName(u) + ((u.sections || []).length ? ' · ' + u.sections.length + ' قسم' : ''); } },
            { label: 'التاريخ', render: function (u) { return UI.fmtDateTime(u.at); } },
            { label: 'أُرسل إلى', render: function (u) { return String((u.sentTo || []).length) + ' قناة'; } },
            { label: 'قرأه', render: function (u) { return String((u.seenBy || []).length) + ' مستخدمًا'; } }
          ], rows: list, empty: 'لا تحديثات منشورة بعد.'
        })
      ]));
      view.appendChild(host);
    }
  });
})();
