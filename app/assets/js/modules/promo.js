/* =============================================================================
   promo.js — الإعلان الافتتاحي للموقع (مشرف تابعني)
   تفعيل/إيقاف الإعلان · إضافة/تعديل/حذف إعلانات · اختيار الإعلان النشط أو التدوير ·
   تكرار العرض والإغلاق التلقائي · معاينة · وتصدير ملف promo-config.js للزوار.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* تصغير صورة مرفوعة إلى 1080px وتحويلها JPEG لتُخزَّن بسهولة */
  function shrinkImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1080 / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#14100A'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.86), cv.width + '×' + cv.height);
      };
      img.onerror = function () { UI.toast('تعذّر قراءة الصورة', 'bad'); };
      img.src = e.target.result;
    };
    reader.onerror = function () { UI.toast('تعذّر قراءة الملف', 'bad'); };
    reader.readAsDataURL(file);
  }

  function adThumb(ad) {
    return h('img', { class: 'promo-thumb', src: ad.image, alt: ad.title || 'إعلان', loading: 'lazy' });
  }

  App.register({
    id: 'promo',
    label: 'الإعلان الافتتاحي',
    icon: '&#128227;',
    roles: ['super'],
    render: function (view) {
      var host = h('div');
      function redraw() { clear(host); draw(); }

      /* ------------------------------ محرّر الإعلان ------------------------------ */
      function adEditor(ad) {
        var isNew = !ad;
        var cur = ad || { title: '', image: '', webp: '', link: '', active: false };
        var preview = h('img', { class: 'promo-preview-img', src: cur.image || 'assets/img/promo-offer.jpg', alt: 'معاينة' });
        var f = {
          title: UI.field({ name: 'adTitle', label: 'عنوان الإعلان', required: true, value: cur.title, help: 'يظهر في شريط الإعلان وتُقرأ به الشاشة القارئة.' }),
          link: UI.field({ name: 'adLink', label: 'رابط «اعرف أكثر» (اختياري)', value: cur.link, help: 'مثال: https://tabaani.com/pricing.html أو رابط واتساب.' }),
          path: UI.field({ name: 'adPath', label: 'أو مسار صورة داخل الموقع', value: cur.image && cur.image.indexOf('data:') !== 0 ? cur.image : '', help: 'مثال: assets/img/promo-offer.jpg (أنسب للصور الكبيرة).' })
        };
        var fileInput = h('input', {
          type: 'file', accept: 'image/*', class: 'input', onchange: function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            shrinkImage(file, function (dataUrl, size) {
              cur.image = dataUrl; cur.webp = '';
              preview.src = dataUrl;
              f.path.input.value = '';
              UI.toast('حُضّرت الصورة ' + size + ' (تُخزَّن داخل الإعداد)', 'ok');
            });
          }
        });
        var activeBox = h('input', { type: 'checkbox', checked: !!cur.active });

        var m = UI.modal({
          title: isNew ? 'إضافة إعلان جديد' : 'تعديل الإعلان',
          wide: true,
          body: [
            h('div', { class: 'grid-2-app' }, [
              h('div', {}, [f.title.wrap, f.path.wrap,
                h('div', { class: 'field' }, [h('label', { text: 'أو ارفع صورة من جهازك (تُصغَّر تلقائيًا)' }), fileInput]),
                h('label', { class: 'checkline' }, [activeBox, h('span', { text: 'اجعله الإعلان النشط' })])
              ]),
              h('div', { class: 'field' }, [h('label', { text: 'معاينة' }), preview])
            ])
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            { label: isNew ? 'إضافة الإعلان' : 'حفظ التعديل', class: 'btn-primary', onClick: function (close) {
              var image = f.path.input.value.trim() || cur.image;
              if (!f.title.input.value.trim()) { UI.toast('اكتب عنوان الإعلان', 'warn'); return; }
              if (!image) { UI.toast('اختر صورة للإعلان', 'warn'); return; }
              S.savePromoAd({
                id: cur.id, title: f.title.input.value.trim(), image: image,
                webp: image === cur.image ? (cur.webp || '') : '', link: f.link.input.value.trim(),
                active: activeBox.checked
              });
              UI.toast(isNew ? 'أُضيف الإعلان' : 'حُفظ التعديل', 'ok');
              close(); redraw();
            } }
          ]
        });
        void m;
      }

      /* -------------------------------- المعاينة -------------------------------- */
      function preview() {
        var c = S.promoConfig();
        var ad = c.mode === 'rotate' ? (c.ads[0] || {}) : (c.ads.filter(function (x) { return x.active; })[0] || c.ads[0] || {});
        if (!ad.image) { UI.toast('لا يوجد إعلان للمعاينة', 'warn'); return; }
        UI.modal({
          title: 'معاينة الإعلان كما يظهر للزائر',
          wide: true,
          body: [
            h('p', { class: 'muted', style: { marginBottom: '10px' }, text: 'يظهر فوق الواجهة بطبقة معتمة مع زر إغلاق، ويُغلق بالنقر خارجها أو بزر Esc.' }),
            h('div', { class: 'promo-preview-splash' }, [
              h('img', { src: ad.image, alt: ad.title || 'إعلان' }),
              h('div', { class: 'promo-preview-bar' }, [
                h('span', { text: ad.title || 'تابعني — تابعني للخدمات الذكية' }),
                ad.link ? h('a', { href: ad.link, target: '_blank', rel: 'noopener', text: 'اعرف أكثر' }) : null,
                h('span', { class: 'promo-preview-btn', text: 'إغلاق' })
              ])
            ])
          ]
        });
      }

      /* --------------------------------- الرسم --------------------------------- */
      function draw() {
        var c = S.promoConfig();
        var mins = function (txt, v) { return h('span', { class: 'promo-mini' }, [h('strong', { text: txt }), h('span', { text: v })]); };

        host.appendChild(h('div', { class: 'grid-3-app' }, [
          UI.statCard('حالة الإعلان', c.enabled ? 'مُفعّل' : 'موقوف', c.enabled ? 'يظهر للزائرين' : 'لا يظهر', c.enabled ? 'gold' : ''),
          UI.statCard('عدد الإعلانات', String(c.ads.length), c.mode === 'rotate' ? 'تدوير بالتناوب' : 'النشط فقط'),
          UI.statCard('تكرار العرض', S.promoFreqs[c.frequency] || c.frequency, c.autoClose ? 'إغلاق تلقائي بعد ' + c.autoClose + ' ثانية' : 'إغلاق يدوي')
        ]));

        /* لوحة ١: الحالة والعرض */
        host.appendChild(UI.panel('حالة الإعلان وطريقة العرض', 'تحكّم مباشر في ظهور الإعلان الافتتاحي على موقع تابعني.', [
          h('button', { class: 'btn ' + (c.enabled ? 'btn-danger' : 'btn-primary'), type: 'button',
            text: c.enabled ? 'إيقاف الإعلان الافتتاحي' : 'تفعيل الإعلان الافتتاحي',
            onClick: function () {
              var next = !S.promoConfig().enabled;
              S.savePromoConfig({ enabled: next });
              UI.toast(next ? 'فُعّل الإعلان الافتتاحي' : 'أُوقف الإعلان الافتتاحي', next ? 'ok' : 'warn');
              redraw();
            } }),
          UI.reportButton ? h('span') : null
        ], [
          h('div', { class: 'form-grid' }, [
            UI.field({ name: 'freq', label: 'متى يظهر للزائر', type: 'select',
              options: Object.keys(S.promoFreqs).map(function (k) { return { value: k, label: S.promoFreqs[k] }; }), value: c.frequency }).wrap,
            UI.field({ name: 'mode', label: 'أي إعلان يُعرض', type: 'select',
              options: Object.keys(S.promoModes).map(function (k) { return { value: k, label: S.promoModes[k] }; }), value: c.mode }).wrap,
            UI.field({ name: 'autoClose', label: 'إغلاق تلقائي بعد (ثوانٍ)', type: 'number', value: String(c.autoClose || 0), help: '0 = يبقى حتى يغلقه الزائر.' }).wrap
          ]),
          h('div', { class: 'panel-actions' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ إعدادات العرض', onClick: function () {
              var g = function (n) { return host.querySelector('[name=' + n + ']'); };
              S.savePromoConfig({
                frequency: g('freq').value, mode: g('mode').value,
                autoClose: Math.max(0, parseInt(g('autoClose').value, 10) || 0)
              });
              UI.toast('حُفظت إعدادات العرض', 'ok'); redraw();
            } }),
            h('button', { class: 'btn btn-outline', type: 'button', text: 'معاينة الإعلان', onClick: preview })
          ])
        ]));

        /* لوحة ٢: الإعلانات */
        var cards = c.ads.map(function (ad) {
          return h('div', { class: 'promo-card' + (ad.active ? ' is-active' : '') }, [
            adThumb(ad),
            h('div', { class: 'promo-card-body' }, [
              h('div', { class: 'row-between' }, [
                h('strong', { text: ad.title || '(بلا عنوان)' }),
                ad.active ? UI.badge('نشط', 'ok') : null
              ]),
              h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' },
                text: ad.image && ad.image.indexOf('data:') === 0 ? 'صورة مضمّنة (مرفوعة)' : (ad.image || '') }),
              ad.link ? h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'الرابط: ' + ad.link }) : null
            ]),
            h('div', { class: 'promo-card-actions' }, [
              ad.active ? h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'يُعرض الآن' })
                : h('button', { class: 'mini-btn', type: 'button', text: 'اجعله النشط', onClick: function () {
                    S.activatePromoAd(ad.id); UI.toast('صار الإعلان النشط', 'ok'); redraw();
                  } }),
              h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { adEditor(ad); } }),
              h('button', { class: 'mini-btn is-danger', type: 'button', text: 'حذف', onClick: function () {
                UI.confirm('حذف الإعلان «' + (ad.title || '') + '»؟', { ok: 'حذف', danger: true }).then(function (ok) {
                  if (!ok) return;
                  S.removePromoAd(ad.id); UI.toast('حُذف الإعلان', 'warn'); redraw();
                });
              } })
            ])
          ]);
        });

        host.appendChild(UI.panel('الإعلانات (' + c.ads.length + ')', 'يمكنك إضافة أكثر من إعلان، ويُعرض النشط أو يتم التدوير بينها.',
          [h('button', { class: 'btn btn-primary', type: 'button', text: 'إضافة إعلان جديد', onClick: function () { adEditor(null); } })],
          c.ads.length ? [h('div', { class: 'promo-grid' }, cards)] : [UI.empty('لا توجد إعلانات — أضف أول إعلان.')]
        ));

        /* لوحة ٣: النشر */
        host.appendChild(UI.panel('نشر الإعلان على الموقع', 'حتى يراه الزائرون على الموقع المنشور.', [
          h('button', { class: 'btn btn-primary', type: 'button', text: 'تنزيل promo-config.js', onClick: function () {
            UI.downloadText(S.promoConfigFile(), 'promo-config.js', 'application/javascript');
          } }),
          h('button', { class: 'btn btn-outline', type: 'button', text: 'نسخ الإعدادات', onClick: function () {
            var txt = S.promoConfigJson();
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(txt).then(function () { UI.toast('نُسخت الإعدادات', 'ok'); }, function () { UI.toast('تعذّر النسخ', 'bad'); });
            } else UI.downloadText(txt, 'promo-config.json', 'application/json');
          } })
        ], [
          h('ol', { class: 'promo-steps' }, [
            h('li', { text: 'اضبط الإعلان هنا (تفعيل · صور · تكرار العرض).' }),
            h('li', { text: 'اضغط «تنزيل promo-config.js».' }),
            h('li', {}, [h('span', { text: 'ضع الملف في المستودع بالمسار: ' }), h('code', { text: 'site/assets/data/promo-config.js' })]),
            h('li', { text: 'أعد نشر الموقع — يظهر الإعلان لكل الزائرين حسب الإعداد.' })
          ]),
          h('div', { class: 'callout' }, [
            h('strong', { text: 'ملاحظة مهمة: ' }),
            h('span', { text: 'التعديل في هذه اللوحة يُطبَّق فورًا على هذا المتصفح للتجربة (الموقع وتابعني على نفس النطاق). أما ظهوره لجميع الزوار فعبر ملف promo-config.js المصدَّر.' })
          ]),
          h('details', { class: 'promo-code' }, [
            h('summary', { text: 'عرض محتوى ملف الإعداد' }),
            h('pre', { text: S.promoConfigFile() })
          ])
        ]));
      }

      draw();
      view.appendChild(host);

      view.appendChild(UI.panel('أين يظهر الإعلان؟', null, null, [
        h('div', { class: 'muted-block', text: 'يظهر فوق واجهة موقع تابعني عند فتح الموقع كطبقة معتمة، مع زر إغلاق، ويُغلق بالنقر خارج الإعلان أو بزر Esc، وبإمكانك جعله يُغلق تلقائيًا بعد ثوانٍ. وللمعاينة السريعة أضف ?splash=1 إلى رابط الموقع، ولمنعه ?splash=0.' })
      ]));
    }
  });
})();
