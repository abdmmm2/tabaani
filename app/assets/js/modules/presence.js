/* ==========================================================================
   presence.js — المتواجدون الآن
   • كل مستخدم يرسل نبضة كل ٤٥ ثانية (وضع السحابة) ⇒ الخادم يعرف من المتصل.
   • المشرف العام: المدارس المتصلة (نور أخضر) + آخر ظهور للمنقطعة.
   • المدير/الوكيل: أدوار مدرسته فقط، والمتصلون في كل دور + مدة الاتصال.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h;
  var DEFAULT_URL = 'https://tabaani.tabaani.workers.dev';
  var REFRESH_MS = 30000, PING_MS = 45000;
  var timer = null, poll = null, lastData = null;

  function baseUrl() {
    try { var c = S.syncCfg(); if (c && c.url) return c.url; } catch (e) {}
    return DEFAULT_URL;
  }
  function token() {
    try { var c = S.cloudSession && S.cloudSession(); return c && c.token; } catch (e) { return ''; }
  }
  function api(path, opts) {
    var t = token();
    if (!t) return Promise.resolve(null);
    opts = opts || {};
    opts.headers = Object.assign({ authorization: 'Bearer ' + t }, opts.headers || {});
    return fetch(baseUrl().replace(/\/$/, '') + path, opts)
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .catch(function () { return null; });
  }

  /* ------------------------------- النبضة ------------------------------- */
  App.presencePing = function () {
    if (!(S.cloudMode && S.cloudMode())) return;
    api('/api/me/ping', { method: 'POST' });
  };
  App.presenceStart = function () {
    if (!(S.cloudMode && S.cloudMode())) return;
    App.presencePing();
    if (timer) return;
    timer = setInterval(function () { if (!document.hidden) App.presencePing(); }, PING_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) App.presencePing(); });
  };

  /* ---------------------------- تنسيق الوقت ---------------------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtTime(sec) {
    if (!sec) return '—';
    var d = new Date(sec * 1000);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtLast(sec) {
    if (!sec) return 'لم يدخل بعد';
    var d = new Date(sec * 1000), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var y = new Date(now.getTime() - 864e5);
    var isYest = d.toDateString() === y.toDateString();
    return (sameDay ? 'اليوم ' : (isYest ? 'أمس ' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ')) + fmtTime(sec);
  }
  function fmtDur(sec) {
    if (!sec || sec < 0) return 'الآن';
    var m = Math.floor(sec / 60);
    if (m < 1) return 'أقل من دقيقة';
    if (m < 60) return m + ' دقيقة';
    var hh = Math.floor(m / 60), mm = m % 60;
    return hh + ' ساعة' + (mm ? ' و' + mm + ' د' : '');
  }

  var ROLE_LABEL = {
    principal: 'مدير المدرسة', deputy: 'وكيل', guidance: 'موجّه التوجيه', teacher: 'المعلمون',
    student: 'الطلاب', accountant: 'المحاسب', support: 'الدعم الفني', specialist: 'مختص تابعني',
    employee: 'الموظفون', supervisor: 'المشرفون'
  };

  /* ------------------------------- اللوحة ------------------------------- */
  App.presencePanel = function () {
    if (!(S.cloudMode && S.cloudMode())) return null;
    var role = S.session.role;
    if (['super', 'principal', 'deputy'].indexOf(role) === -1) return null;

    var host = h('div', { class: 'presence', id: 'presence-panel' });
    var expanded = {};

    function render(j) {
      UI.clear(host);
      host.appendChild(h('div', { class: 'presence-head' }, [
        h('span', { class: 'dot on', style: { marginInlineEnd: '6px' } }),
        h('strong', { text: 'المتواجدون الآن' })
      ]));
      if (!j || !j.ok) {
        host.appendChild(h('div', { class: 'presence-empty', text: '—' }));
        return;
      }
      if (j.scope === 'schools') {
        (j.rows || []).sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.lastSeen - a.lastSeen); })
          .forEach(function (r) {
            host.appendChild(h('div', { class: 'presence-row' }, [
              h('span', { class: 'dot ' + (r.online ? 'on' : 'off') }),
              h('span', { class: 'presence-name', text: r.name || r.schoolId }),
              h('span', { class: 'presence-meta', text: r.online ? (r.onlineCount + ' متصل') : ('آخر ظهور: ' + fmtLast(r.lastSeen)) })
            ]));
          });
        if (!(j.rows || []).length) host.appendChild(h('div', { class: 'presence-empty', text: 'لا مدارس بعد' }));
        return;
      }
      /* مدرسة واحدة: الأدوار */
      var rows = j.rows || [];
      var groups = {};
      rows.forEach(function (r) { (groups[r.role] = groups[r.role] || []).push(r); });
      var order = ['principal', 'deputy', 'guidance', 'teacher', 'student', 'accountant', 'support', 'specialist']
        .filter(function (k) { return groups[k]; });
      Object.keys(groups).forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
      order.forEach(function (k) {
        var list = groups[k];
        var on = list.filter(function (x) { return x.online; });
        var isOpen = !!expanded[k];
        var head = h('div', { class: 'presence-row presence-group' + (on.length ? ' has-on' : ''), onClick: function () { expanded[k] = !expanded[k]; render(j); } }, [
          h('span', { class: 'dot ' + (on.length ? 'on' : 'off') }),
          h('span', { class: 'presence-name', text: ROLE_LABEL[k] || k }),
          h('span', { class: 'presence-meta', text: on.length + '/' + list.length + (on.length ? ' متصل' : '') }),
          h('span', { class: 'presence-caret', text: isOpen ? '▾' : '▸' })
        ]);
        host.appendChild(head);
        if (isOpen) {
          list.sort(function (a, b) { return (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.name).localeCompare(String(b.name)); })
            .forEach(function (x) {
              host.appendChild(h('div', { class: 'presence-sub' }, [
                h('span', { class: 'dot ' + (x.online ? 'on' : 'off') }),
                h('span', { class: 'presence-name', text: x.name || x.username }),
                h('span', { class: 'presence-meta', text: x.online ? ('متصل منذ ' + fmtDur((j.now || 0) - (x.since || 0))) : ('آخر ظهور: ' + fmtLast(x.lastSeen)) })
              ]));
            });
        }
      });
      if (!order.length) host.appendChild(h('div', { class: 'presence-empty', text: 'لا مستخدمين' }));
    }

    function load() {
      api('/api/presence').then(function (j) { lastData = j; render(j); });
    }
    load();
    if (poll) clearInterval(poll);
    poll = setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
    return host;
  };
})();
