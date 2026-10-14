/* =============================================================================
   Tabaa'ni — site interactions (vanilla, no dependencies)
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* --- theme ---------------------------------------------------------------- */
  var THEME_KEY = 'tabaani-theme';
  function setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    $$('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', mode === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن');
      b.innerHTML = mode === 'dark'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
    });
  }
  (function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(stored || (prefersDark ? 'dark' : 'light'));
  })();
  $$('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  });

  /* --- header state -------------------------------------------------------- */
  var header = $('.site-header');
  var toTop = $('.to-top');
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (header) header.classList.toggle('is-stuck', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > 600);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* --- mobile drawer -------------------------------------------------------- */
  var drawer = $('[data-drawer]');
  function closeDrawer() {
    if (!drawer) return;
    drawer.setAttribute('open-state', 'closed');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  $$('[data-drawer-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!drawer) return;
      drawer.setAttribute('open-state', 'open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      var first = $('.drawer-panel a', drawer);
      if (first) first.focus();
    });
  });
  $$('[data-drawer-close]').forEach(function (b) { b.addEventListener('click', closeDrawer); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  /* --- reveal on scroll ----------------------------------------------------- */
  var revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window && revealables.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var delay = en.target.getAttribute('data-reveal-delay') || 0;
          setTimeout(function () { en.target.classList.add('is-in'); }, Number(delay));
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* --- animated counters ---------------------------------------------------- */
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var dec = (el.getAttribute('data-decimals') | 0);
        if (reduce) { el.textContent = target.toLocaleString('en-US'); co.unobserve(el); return; }
        var start = performance.now(), dur = 1400;
        (function step(now) {
          var p = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          if (p < 1) requestAnimationFrame(step);
        })(start);
        co.unobserve(el);
      });
    }, { threshold: .4 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* --- generic filter groups ------------------------------------------------ */
  $$('[data-filter-group]').forEach(function (group) {
    var targetSel = group.getAttribute('data-filter-target');
    var items = $$(targetSel || '[data-filter-item]');
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;
      $$('.filter-btn', group).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      var val = btn.getAttribute('data-filter');
      items.forEach(function (item) {
        var tags = (item.getAttribute('data-tags') || '').split(/\s+/);
        var show = val === 'all' || tags.indexOf(val) !== -1;
        item.style.display = show ? '' : 'none';
        if (show) { item.removeAttribute('hidden'); } else { item.setAttribute('hidden', ''); }
      });
      var empty = $('[data-filter-empty]');
      if (empty) {
        var visible = items.filter(function (i) { return i.style.display !== 'none'; }).length;
        empty.hidden = visible !== 0;
      }
    });
  });

  /* --- pricing period toggle ------------------------------------------------ */
  $$('[data-period-toggle]').forEach(function (toggle) {
    var amounts = $$('[data-price-monthly]');
    toggle.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      $$('button', toggle).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      var period = btn.getAttribute('data-period');
      amounts.forEach(function (a) {
        var m = a.getAttribute('data-price-monthly');
        var y = a.getAttribute('data-price-yearly');
        a.textContent = period === 'yearly' ? y : m;
      });
      $$('[data-period-suffix]').forEach(function (s) {
        s.textContent = period === 'yearly' ? '/سنة' : '/شهر';
      });
      $$('[data-period-note]').forEach(function (n) {
        n.textContent = period === 'yearly' ? 'تُدفع سنوياً — توفير 20%' : 'تُدفع شهرياً — إلغاء في أي وقت';
      });
    });
  });

  /* --- form validation (demo forms, no backend) ----------------------------- */
  $$('form[data-validate]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', form).forEach(function (input) {
        var msg = $('[data-error-for="' + input.id + '"]');
        var valid = input.checkValidity() && input.value.trim() !== '';
        if (!valid) { ok = false; input.setAttribute('aria-invalid', 'true'); }
        else { input.removeAttribute('aria-invalid'); }
        if (msg) msg.hidden = valid;
      });
      var status = $('[data-form-status]', form);
      if (status) {
        status.hidden = false;
        status.textContent = ok
          ? 'تم الاستلام — سيتواصل معك فريق تابعني خلال ٢٤ ساعة.'
          : 'يرجى تصحيح الحقول المُعلَّمة قبل الإرسال.';
        status.className = ok ? 'chip chip-mint mt-4' : 'chip chip-amber mt-4';
      }
      if (ok) form.reset();
    });
  });

  /* --- year in footers ------------------------------------------------------ */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
