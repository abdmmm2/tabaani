/* =============================================================================
   splash.js — الإعلان الافتتاحي (Splash) لموقع تابعني
   يقرأ الإعداد من (بهذا الترتيب):
     1) localStorage['tabaani_promo_config']  ← ما يضبطه مشرف المنصة من لوحة التحكم
        (يسري على هذا المتصفح مباشرة عند وجود الموقع والمنصة على نفس النطاق)
     2) window.TABAANI_PROMO  من الملف site/assets/data/promo-config.js  ← للزوار
     3) الإعداد الافتراضي المدمج داخل هذا الملف

   تحكّم سريع عبر الرابط:  ?splash=1 (أظهرها دائمًا) · ?splash=0 (لا تُظهرها)
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'tabaani_promo_config';
  var SEEN_SESSION = 'tabaani_promo_seen';
  var SEEN_ONCE = 'tabaani_promo_seen_once';
  var ROTATE_IDX = 'tabaani_promo_rotate';
  var DELAY = 500;                        /* مهلة الظهور بعد التحميل (ms) */

  var DEFAULTS = {
    enabled: true, mode: 'active', frequency: 'session', autoClose: 0,
    ads: [{ id: 'ad-1', title: 'مجانًا ولفترة محدودة', image: 'assets/img/promo-offer.jpg', webp: 'assets/img/promo-offer.webp', link: '', active: true }]
  };

  var params = new URLSearchParams(location.search);
  if (params.get('splash') === '0') return;
  var force = params.get('splash') === '1';

  function readStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function readSession(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function writeSession(key, v) { try { sessionStorage.setItem(key, v); } catch (e) {} }
  function writeStored(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

  function pickConfig() {
    var raw = readStored(STORE_KEY);
    if (raw) { try { var c = JSON.parse(raw); if (c && c.ads && c.ads.length) return c; } catch (e) {} }
    if (window.TABAANI_PROMO && window.TABAANI_PROMO.ads && window.TABAANI_PROMO.ads.length) return window.TABAANI_PROMO;
    return DEFAULTS;
  }

  var cfg = pickConfig();
  if (!cfg.enabled && !force) return;

  /* تكرار العرض */
  if (!force) {
    if (cfg.frequency === 'once' && readStored(SEEN_ONCE) === '1') return;
    if (cfg.frequency !== 'always' && cfg.frequency !== 'once' && readSession(SEEN_SESSION) === '1') return;
  }

  /* اختيار الإعلان: النشط، أو تدوير بين الإعلانات */
  var ads = (cfg.ads || []).filter(function (a) { return a && a.image; });
  if (!ads.length) return;
  var ad;
  if (cfg.mode === 'rotate') {
    var idx = parseInt(readStored(ROTATE_IDX) || '0', 10);
    if (isNaN(idx)) idx = 0;
    ad = ads[((idx % ads.length) + ads.length) % ads.length];
    writeStored(ROTATE_IDX, String(idx + 1));
  } else {
    ad = ads.filter(function (a) { return a.active; })[0] || ads[0];
  }

  var AUTO = parseInt(cfg.autoClose || 0, 10) || 0;

  var CSS = ''
    + '.tb-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;'
    + 'background:rgba(20,16,10,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .28s ease}'
    + '.tb-splash.is-open{opacity:1}'
    + '.tb-splash[hidden]{display:none}'
    + '.tb-splash-card{position:relative;width:min(92vw,520px);max-height:90vh;display:flex;flex-direction:column;'
    + 'border-radius:18px;overflow:hidden;background:#14100A;box-shadow:0 26px 70px rgba(0,0,0,.5),0 0 0 1px rgba(235,203,116,.35);'
    + 'transform:translateY(14px) scale(.97);transition:transform .32s cubic-bezier(.2,.75,.3,1)}'
    + '.tb-splash.is-open .tb-splash-card{transform:none}'
    + '.tb-splash-card picture{display:block;overflow:auto}'
    + '.tb-splash-card img{display:block;width:100%;height:auto;max-height:74vh;object-fit:contain;background:#14100A}'
    + '.tb-splash-close{position:absolute;inset-block-start:10px;inset-inline-end:10px;width:38px;height:38px;border:0;border-radius:50%;'
    + 'background:rgba(20,16,10,.62);color:#EBCB74;font-size:22px;line-height:1;cursor:pointer;display:grid;place-items:center;z-index:2;'
    + 'box-shadow:0 2px 10px rgba(0,0,0,.35)}'
    + '.tb-splash-close:hover{background:#14100A;color:#fff}'
    + '.tb-splash-close:focus-visible{outline:3px solid #EBCB74;outline-offset:2px}'
    + '.tb-splash-foot{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:11px 14px;background:#14100A;border-block-start:1px solid rgba(235,203,116,.28)}'
    + '.tb-splash-foot span{color:#C9C0AE;font-size:.8rem}'
    + '.tb-splash-foot button,.tb-splash-foot a{font:inherit;cursor:pointer;border:1px solid rgba(235,203,116,.5);background:transparent;color:#EBCB74;'
    + 'border-radius:999px;padding:7px 18px;font-size:.85rem;font-weight:700;text-decoration:none}'
    + '.tb-splash-foot button:hover,.tb-splash-foot a:hover{background:#CE9433;border-color:#CE9433;color:#1A1206}'
    + '.tb-splash-bar{position:absolute;inset-block-start:0;inset-inline:0;height:3px;background:rgba(235,203,116,.25);z-index:2}'
    + '.tb-splash-bar i{display:block;height:100%;background:#CE9433;width:0;animation:tbSplashBar linear forwards}'
    + '@keyframes tbSplashBar{to{width:100%}}'
    + '@media (max-width:520px){.tb-splash{padding:12px}.tb-splash-card{width:100%}.tb-splash-card img{max-height:66vh}}'
    + '@media (prefers-reduced-motion:reduce){.tb-splash,.tb-splash-card{transition:none}.tb-splash-bar{display:none}}'
    + 'body.tb-splash-lock{overflow:hidden}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var imgTag = ad.webp
      ? '<picture><source srcset="' + esc(ad.webp) + '" type="image/webp"><img src="' + esc(ad.image) + '" alt="' + esc(ad.title || 'إعلان تابعني') + '"></picture>'
      : '<picture><img src="' + esc(ad.image) + '" alt="' + esc(ad.title || 'إعلان تابعني') + '"></picture>';

    var wrap = document.createElement('div');
    wrap.className = 'tb-splash';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', ad.title || 'إعلان تابعني');
    wrap.hidden = true;
    wrap.innerHTML = ''
      + '<div class="tb-splash-card">'
      +   (AUTO > 0 ? '<div class="tb-splash-bar"><i style="animation-duration:' + AUTO + 's"></i></div>' : '')
      +   '<button class="tb-splash-close" type="button" aria-label="إغلاق الإعلان">&times;</button>'
      +   imgTag
      +   '<div class="tb-splash-foot">'
      +     '<span>' + esc(ad.title || 'تابعني — منصة الخدمات التعليمية') + '</span>'
      +     (ad.link ? '<a href="' + esc(ad.link) + '" target="_blank" rel="noopener">اعرف أكثر</a>' : '')
      +     '<button type="button" data-close>إغلاق</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(wrap);

    var img = wrap.querySelector('img');
    var lastFocus = null, shown = false, timer = null;

    function markSeen() {
      if (force) return;
      if (cfg.frequency === 'once') writeStored(SEEN_ONCE, '1');
      else writeSession(SEEN_SESSION, '1');
    }

    function open() {
      if (shown) return;
      shown = true;
      lastFocus = document.activeElement;
      wrap.hidden = false;
      document.body.classList.add('tb-splash-lock');
      requestAnimationFrame(function () { wrap.classList.add('is-open'); });
      markSeen();
      var btn = wrap.querySelector('.tb-splash-close');
      if (btn) btn.focus();
      if (AUTO > 0) timer = setTimeout(close, AUTO * 1000);
    }

    function close() {
      if (timer) { clearTimeout(timer); timer = null; }
      wrap.classList.remove('is-open');
      document.body.classList.remove('tb-splash-lock');
      var done = function () { wrap.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); };
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) done(); else setTimeout(done, 280);
    }

    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-close], .tb-splash-close')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wrap.hidden) close(); });

    /* لا تُظهر إعلانًا بلا صورة */
    if (img && img.complete && img.naturalWidth > 0) setTimeout(open, DELAY);
    else if (img) { img.addEventListener('load', function () { setTimeout(open, DELAY); }); img.addEventListener('error', function () {}); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
