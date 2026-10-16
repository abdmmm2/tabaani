/* =============================================================================
   landing.js — واجهة الموقع العامة (صفحات منفصلة، لا صفحة واحدة طويلة)
   ---------------------------------------------------------------------------
   • صفحات: الرئيسية · مميزاتنا · المدارس الذكية · حول مدرستك · الأسعار ·
     عن تابعني · الدعم الفني · تواصل معنا.
   • ترويسة ثابتة: اللوغو والاسم يمينًا · التنقّل في الوسط · الدخول وثلاثة خطوط يسارًا.
   • الإعلان يظهر في الصفحة الرئيسية فقط: قابل للإغلاق، ويتلاشى تلقائيًا بعد مدة
     (تُضبط من: تابعني ← الإعلان الافتتاحي ← إغلاق تلقائي).
   • التصميم: أبيض + أخضر زمردي + ذهبي محدود — بتناسق واحد بلا خلفيات داكنة.
   ========================================================================== */
(function (global) {
  'use strict';
  var S = global.Store, UI = global.UI, App = global.App, h = UI.h, clear = UI.clear;

  var BRAND = 'تابعني للخدمات الذكية';
  var PAGES = [
    { id: 'home', label: 'الرئيسية', nav: false, title: 'الرئيسية' },
    { id: 'features', label: 'مميزاتنا', nav: true, title: 'مميزاتنا' },
    { id: 'smart', label: 'المدارس الذكية', nav: true, title: 'المدارس الذكية' },
    { id: 'compare', label: 'حول مدرستك', nav: true, title: 'حول مدرستك' },
    { id: 'pricing', label: 'الأسعار', nav: true, title: 'الأسعار والباقات' },
    { id: 'support', label: 'الدعم الفني', nav: true, title: 'الدعم الفني' },
    { id: 'about', label: 'عن تابعني', nav: false, title: 'عن تابعني' },
    { id: 'contact', label: 'تواصل معنا', nav: true, title: 'تواصل معنا' }
  ];

  var FEATURES = [
    ['&#127979;', 'تأسيس المدرسة والحسابات', 'مناطق ومدن، ثم مدرسة وحساباتها في دقائق.'],
    ['&#128100;', 'ثلاثة عشر دورًا مدرسيًا', 'كل دور يرى ما يخصّه فقط — بلا تشتيت.'],
    ['&#128197;', 'الجدول والتحضير', 'جدول الحصص، وتحضير لكل حصة مع منع الإغلاق قبل وقتها.'],
    ['&#128221;', 'المخالفات والاستئذان', 'دورة موثّقة من المعلم إلى الوكيل، واستئذان بتصريح خروج.'],
    ['&#128273;', 'إذن دخول الفصل', 'للطالب المتأخر: إذن بسبب إلزامي وباركود ومتابعة الإقرار.'],
    ['&#128202;', 'تقارير رسمية', 'بترويسة الوزارة واسم المدرسة وشعارها وباركود تحقّق.'],
    ['&#129302;', 'بصمة الوجه والتثبيت', 'حضور ببصمة الوجه، وتطبيق على الجوال يعمل بلا إنترنت.'],
    ['&#128176;', 'المالية والفواتير', 'سند تحويل مختوم، وفاتورة إلكترونية، ومصروفات، وتقارير مالية.']
  ];

  var COMPARE = [
    ['سجل الطلاب والحضور', 'دفاتر وملفات Excel متفرقة', 'سجل واحد لكل طالب وحصة'],
    ['غياب اليوم', 'يُعرف بعد الحصة الأولى', 'يظهر لحظيًا مع قائمة الحرمان'],
    ['المخالفات', 'ورقة تنتقل وتضيع بين الأقسام', 'دورة موثّقة بإجراء وتاريخ ومسؤول'],
    ['تصاريح الخروج', 'ورقة بتوقيع قابلة للفقدان', 'باركود بتحقّق فوري وسجل زمني'],
    ['التقارير الرسمية', 'تُجمَّع يدويًا آخر الفصل', 'بضغطة، بترويسة الوزارة وباركود'],
    ['التواصل مع الفريق', 'مجموعات واتساب متفرّقة', 'إشعارات وتذاكر دعم منظّمة'],
    ['البيانات', 'أوراق قابلة للفقدان', 'نسخ احتياطي وصلاحيات لكل دور'],
    ['وقت الإدارة', 'ساعات تجميع متكرّرة', 'أتمتة توفّر الوقت وتمنع التكرار']
  ];

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function closeAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal-backdrop'), function (b) { b.remove(); });
  }
  function pageOf(id) { return PAGES.filter(function (p) { return p.id === id; })[0] || PAGES[0]; }
  function currentPage() {
    var m = String(location.hash || '').match(/^#\/([a-z-]+)/);
    var id = m ? m[1] : 'home';
    return pageOf(id).id;
  }

  /* ------------------------------------------------------------ نموذج الدخول */
  App.loginPanel = function () {
    var user = UI.field({ name: 'username', label: 'اسم المستخدم أو البريد', required: true, placeholder: 'principal', autocomplete: 'username' });
    var pass = UI.field({ name: 'password', label: 'كلمة المرور', type: 'password', required: true, placeholder: '••••••••', autocomplete: 'current-password' });
    var err = h('p', { class: 'hint hint-error', hidden: true });
    return h('form', { class: 'stack', onsubmit: function (e) {
      e.preventDefault();
      var res = S.authenticate(user.input.value, pass.input.value);
      if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
      var tf = S.twoFactorFor(res.user);
      if (tf.blocked) { err.hidden = false; err.textContent = tf.reason; return; }
      err.hidden = true;
      function afterAuth() {
        closeAll();
        App.enter(res.user.id);
        if (res.user.mustChange) App.firstLoginPassword(res.user);
      }
      if (tf.applies) { App.twoFactorScreen(res.user, afterAuth); return; }
      afterAuth();
    } }, [
      user.wrap, pass.wrap, err,
      h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'تسجيل الدخول' }),
      h('div', { class: 'between' }, [
        h('button', { class: 'btn-link', type: 'button', text: 'نسيت كلمة المرور؟', onClick: function () { closeAll(); App.forgot(); } }),
        h('button', { class: 'btn-link', type: 'button', text: 'إنشاء حساب جديد', onClick: function () { closeAll(); App.openRegister(); } })
      ])
    ]);
  };

  App.openLogin = function () {
    if (S.needsSetup()) {
      UI.modal({
        title: 'تهيئة تابعني', body: [
          h('p', { class: 'muted', text: 'هذه أول مرة تُفتح فيها تابعني على هذا الجهاز — أنشئ حساب المشرف العام أولًا ثم سجّل دخولك.' }),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'إنشاء حساب المشرف العام',
            onClick: function () { closeAll(); App.setupScreen(); } })
        ]
      });
      return;
    }
    UI.modal({
      title: 'تسجيل الدخول',
      body: [
        h('div', { class: 'lp-note' }, [h('strong', { text: 'دخول المدارس والأدوار' }),
          h('span', { text: ' — لكل دور شاشته وصلاحياته.' })]),
        App.loginPanel()
      ]
    });
  };

  /* ---------------------------------------------------------------- الصفحة */
  App.landing = function (opts) {
    opts = opts || {};
    if (App.setTitle) App.setTitle('');                 /* العنوان الأساسي للواجهة العامة */
    App._removeSupportFab();
    var root = document.getElementById('app');
    var old = document.querySelector('.login-wrap');
    if (old) old.remove();
    clear(root);
    document.body.classList.remove('app-body');
    document.body.classList.add('landing-body');

    var here = currentPage();

    /* الترويسة */
    var nav = h('nav', { class: 'lp-nav', 'aria-label': 'أقسام الموقع' });
    PAGES.filter(function (p) { return p.nav; }).forEach(function (p) {
      nav.appendChild(h('a', {
        class: 'lp-nl' + (here === p.id ? ' is-on' : ''), href: '#/' + p.id,
        onClick: function (e) { e.preventDefault(); goPage(p.id); }, text: p.label
      }));
    });

    var drawer = h('aside', { class: 'lp-drawer' }, PAGES.map(function (p) {
      return h('a', {
        class: 'lp-dnav' + (here === p.id ? ' is-on' : ''), href: '#/' + p.id,
        onClick: function (e) { e.preventDefault(); closeDrawer(); goPage(p.id); }
      }, [h('span', { class: 'lp-dot' }), h('span', { text: p.label })]);
    }).concat([
      h('div', { class: 'lp-dsec', text: 'ابدأ الآن' }),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'تسجيل الدخول',
        onClick: function () { closeDrawer(); App.openLogin(); } }),
      h('a', { class: 'btn btn-outline btn-block', href: '#/contact', onClick: function (e) { e.preventDefault(); closeDrawer(); goPage('contact'); }, text: 'تواصل معنا' })
    ]));

    var head = h('header', { class: 'lp-head' }, [
      h('a', { class: 'lp-brand', href: '#/home', onClick: function (e) { e.preventDefault(); goPage('home'); } }, [
        h('img', { src: 'assets/img/logo-mark.png', alt: 'تابعني', class: 'lp-logo' }),
        h('span', { class: 'lp-brand-txt' }, [
          h('span', { class: 'lp-brand-name', text: 'تابعني' }),
          h('span', { class: 'lp-brand-sub', text: 'للخدمات الذكية' })
        ])
      ]),
      nav,
      h('div', { class: 'lp-hact' }, [
        h('button', { class: 'lp-login', type: 'button', 'data-login': '1', onClick: function () { App.openLogin(); } },
          [h('span', { class: 'lp-ic', html: '&#128274;' }), h('span', { text: 'تسجيل الدخول' })]),
        h('button', { class: 'lp-burger', type: 'button', 'aria-label': 'القائمة', onClick: function () {
          document.body.classList.toggle('lp-open');
        } }, [h('span'), h('span'), h('span')])
      ])
    ]);

    /* التذييل */
    var foot = h('footer', { class: 'lp-foot' }, [
      h('div', { class: 'lp-foot-in' }, [
        h('div', { class: 'lp-foot-brand' }, [
          h('img', { src: 'assets/img/logo-mark.png', alt: '', class: 'lp-logo-sm' }),
          h('div', {}, [h('strong', { text: BRAND }), h('span', { class: 'lp-mut', text: 'نظام تشغيل مدرسي — يعمل بلا إنترنت' })])
        ]),
        h('nav', { class: 'lp-foot-nav' }, PAGES.map(function (p) {
          return h('a', { href: '#/' + p.id, onClick: function (e) { e.preventDefault(); goPage(p.id); }, text: p.label });
        })),
        h('nav', { class: 'lp-foot-nav' }, [
          h('a', { href: '../d21448/index.html', text: 'الأدلة (PDF · Word)' }),
          h('a', { href: '../screens/index.html', text: 'معرض الشاشات' }),
          h('button', { class: 'lp-flink', type: 'button', text: 'تسجيل الدخول', 'data-login': '1', onClick: function () { App.openLogin(); } })
        ])
      ]),
      h('div', { class: 'lp-foot-base' }, [
        h('span', { text: '© ' + new Date().getFullYear() + ' — جميع الحقوق محفوظة.' }),
        h('span', { class: 'lp-mut', text: 'الإصدار ' + App.version() })
      ])
    ]);

    var main = h('main', { class: 'lp-main' });
    var setupBar = S.needsSetup() ? h('div', { class: 'lp-setupbar' }, [
      h('span', { html: '&#9888;&#65039;' }),
      h('span', { text: 'هذا الجهاز غير مُهيّأ — أنشئ حساب المشرف العام لتبدأ.' }),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تهيئة تابعني', onClick: function () { App.setupScreen(); } })
    ]) : null;

    var page = h('div', { class: 'lp' }, [
      setupBar, head,
      h('div', { class: 'lp-veil', onClick: closeDrawer }),
      drawer,
      main,
      foot
    ]);
    root.appendChild(page);
    renderPage(here, main);

    /* تنقّل داخلي بلا إعادة تحميل */
    if (App._lpHash) global.removeEventListener('hashchange', App._lpHash);
    App._lpHash = function () {
      var id = currentPage();
      if (!document.querySelector('.lp')) return;
      closeDrawer();
      renderPage(id, main);
      nav.querySelectorAll('.lp-nl').forEach(function (a, i) {
        var pid = PAGES.filter(function (p) { return p.nav; })[i].id;
        a.classList.toggle('is-on', pid === id);
      });
      global.scrollTo({ top: 0, behavior: 'smooth' });
    };
    global.addEventListener('hashchange', App._lpHash);

    if (opts.login) App.openLogin();
    return page;

    function closeDrawer() { document.body.classList.remove('lp-open'); }
    function goPage(id) {
      if (currentPage() === id) { closeDrawer(); return; }
      location.hash = '#/' + id;
    }
  };

  /* ------------------------------------------------------------ صفحات الموقع */
  function renderPage(id, host) {
    clear(host);
    ({ home: homePage, features: featuresPage, smart: smartPage, compare: comparePage,
       pricing: pricingPage, support: supportPage, about: aboutPage, contact: contactPage }[id] || homePage)(host);
  }

  function head2(t, s) {
    return h('div', { class: 'lp-phead' }, [h('h1', { text: t }), s ? h('p', { text: s }) : null]);
  }
  function card(ic, t, d) {
    return h('article', { class: 'lp-card' }, [
      h('span', { class: 'lp-tile', html: ic }), h('h3', { text: t }), d ? h('p', { text: d }) : null
    ]);
  }

  /* الرئيسية */
  function homePage(host) {
    host.appendChild(h('section', { class: 'lp-hero' }, [
      h('div', { class: 'lp-hero-txt' }, [
        h('h1', { class: 'lp-h1', text: BRAND }),
        h('p', { class: 'lp-lead', text: 'نظام واحد يدير الحضور والمخالفات والاستئذان والجدول والمناوبة والتقارير الرسمية — من الجوال وبلا إنترنت.' }),
        h('div', { class: 'lp-cta' }, [
          h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'تسجيل الدخول', 'data-login': '1', onClick: function () { App.openLogin(); } }),
          h('a', { class: 'btn btn-outline btn-lg', href: '#/pricing', onClick: function (e) { e.preventDefault(); location.hash = '#/pricing'; }, text: 'الأسعار والباقات' })
        ])
      ])
    ]));
    var band = promoBand();
    if (band) host.appendChild(band);
    else probePromo(function (cfg) {
      var b = cfg ? promoBand(cfg) : null;
      if (b && host.firstChild) host.insertBefore(b, host.firstChild.nextSibling || null);
      else if (b) host.appendChild(b);
    });
    host.appendChild(h('section', { class: 'lp-sec' }, [
      h('div', { class: 'lp-grid lp-grid-3' }, [
        card('&#128200;', 'قرار من بيانات لحظية', 'من غاب؟ من تأخّر؟ أين المخالفة الآن؟ — أمامك مباشرة.'),
        card('&#128274;', 'صلاحيات مضبوطة', 'كل دور يرى ما يخصّه فقط، والبيانات محفوظة بنسخ احتياطي.'),
        card('&#9889;', 'توفير لوقت الإدارة', 'أذون وتقارير وإشعارات بضغطة، بدل ساعات تجميع في نهاية الفصل.')
      ])
    ]));
    host.appendChild(h('section', { class: 'lp-band' }, [
      h('div', {}, [h('strong', { text: 'جاهز لتفعيل مدرستك؟' }),
        h('p', { text: 'رسم تأسيس ' + UI.fmtMoney(S.planFees().setupFee) + ' ر.س مرة واحدة، ثم اشتراك سنوي لكل مدرسة.' })]),
      h('a', { class: 'btn btn-gold', href: '#/pricing', onClick: function (e) { e.preventDefault(); location.hash = '#/pricing'; }, text: 'اطّلع على الباقات' })
    ]));
  }

  /* مميزاتنا */
  function featuresPage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('مميزاتنا', 'كل ما تحتاجه المدرسة في نظام واحد — بلا أوراق متفرقة.'),
      h('div', { class: 'lp-grid lp-grid-4' }, FEATURES.map(function (f) { return card(f[0], f[1], f[2]); }))
    ]));
  }

  /* المدارس الذكية */
  function smartPage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('المدارس الذكية', 'ليست أجهزة فخمة — بل قرار يُتخذ من بيانات لحظية.'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        card('&#128200;', 'بيانات لحظية', 'الحضور والمخالفة والاستئذان تُسجَّل وقت حدوثها.'),
        card('&#128274;', 'صلاحيات مضبوطة', 'المعلم فصوله، والوكيل مدرسته، والطالب كشوفه.'),
        card('&#9889;', 'وقت أقل', 'أتمتة تُغني عن التجميع اليدوي والتكرار.')
      ]),
      h('div', { class: 'lp-stats' }, [
        [String(S.rolesList ? 13 : 13), 'دورًا مدرسيًا'],
        ['26', 'وحدة خدمة'],
        ['24/7', 'بلا إنترنت'],
        ['0', 'ريال للطلاب']
      ].map(function (x) { return h('div', { class: 'lp-stat' }, [h('b', { text: x[0] }), h('span', { text: x[1] })]); }))
    ]));
  }

  /* حول مدرستك */
  function comparePage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('حول مدرستك', 'نفس المدرسة ونفس الفريق — والفرق في طريقة إدارة المعلومة.'),
      h('div', { class: 'lp-tbl-wrap' }, [
        h('table', { class: 'lp-tbl' }, [
          h('thead', {}, [h('tr', {}, [
            h('th', { text: 'المجال' }),
            h('th', { text: 'المدرسة التقليدية' }),
            h('th', { class: 'is-smart', text: 'المدرسة الذكية مع تابعني' })
          ])]),
          h('tbody', {}, COMPARE.map(function (r) {
            return h('tr', {}, [
              h('td', {}, [h('strong', { text: r[0] })]),
              h('td', { class: 'is-old' }, [h('span', { class: 'ic-x', html: '&times;' }), h('span', { text: r[1] })]),
              h('td', { class: 'is-smart' }, [h('span', { class: 'ic-v', html: '&#10003;' }), h('span', { text: r[2] })])
            ]);
          }))
        ])
      ])
    ]));
  }

  /* الأسعار */
  function pricingPage(host) {
    var f = S.planFees();
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('الأسعار والباقات', 'باقة واحدة للمدرسة كلها — بلا حدّ للحسابات ولا للطلاب.'),
      h('div', { class: 'lp-plans' }, S.PLANS.map(function (p) {
        var fee = p.id === 'pro' ? f.pro : f.classic;
        return h('article', { class: 'lp-plan' + (p.id === 'pro' ? ' is-best' : '') }, [
          p.id === 'pro' ? h('span', { class: 'lp-ribbon', text: 'كل الخدمات' }) : null,
          h('h3', { text: p.name }),
          h('p', { class: 'lp-mut', text: p.tagline }),
          h('div', { class: 'lp-price' }, [h('b', { class: 'nums', text: UI.fmtMoney(fee) }), h('span', { text: ' ر.س / سنويًا' })]),
          h('ul', { class: 'lp-list' }, p.features.map(function (t) {
            return h('li', {}, [h('span', { class: 'ic-v', html: '&#10003;' }), h('span', { text: t })]);
          })),
          h('a', { class: 'btn ' + (p.id === 'pro' ? 'btn-primary' : 'btn-outline') + ' btn-block', href: '#/contact',
            onClick: function (e) { e.preventDefault(); location.hash = '#/contact'; }, text: 'اطلب تفعيل مدرستك' })
        ]);
      })),
      h('div', { class: 'lp-setup' }, [
        h('div', {}, [
          h('h3', { text: 'رسم التأسيس والتهيئة: ' + UI.fmtMoney(f.setupFee) + ' ر.س' }),
          h('p', { text: 'مرة واحدة عند البدء: الحسابات والأدوار، الفصول والطلاب، بيانات السنة، وتدريب فريقك.' })
        ]),
        h('div', {}, [
          h('h3', { text: 'طريقة السداد' }),
          h('p', { text: 'تحويل بنكي ← ترفع المدرسة صورة السند مختومة بختمها ← يُعتمد ← تصدر فاتورة إلكترونية مختومة وتُفعَّل الباقة آليًا.' })
        ])
      ])
    ]));
  }

  /* الدعم الفني */
  function supportPage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('الدعم الفني', 'شفتان تغطّيان اليوم كاملًا — بلهجة سعودية وردّ فوري.'),
      h('div', { class: 'lp-agents' }, S.AGENTS.map(function (a) {
        var on = S.agentNow().id === a.id;
        return h('article', { class: 'lp-agent' + (on ? ' is-on' : '') }, [
          h('img', { src: a.img, alt: a.name, class: 'lp-agent-img' }),
          h('div', {}, [
            h('h3', { text: a.name }),
            h('p', { class: 'lp-mut', text: a.shift }),
            h('span', { class: 'lp-state', text: on ? 'متصل الآن' : 'يستلم الشفت التالي' })
          ])
        ]);
      })),
      h('div', { class: 'lp-band' }, [
        h('div', {}, [h('strong', { text: 'كيف يعمل الدعم؟' }),
          h('p', { text: 'اسأل البوت، وارفع صورة للمشكلة، فيُفتح لك رقم تذكرة يتابعه قسم الدعم والمشرف العام حتى الإغلاق.' })]),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'ابدأ المحادثة', onClick: function () { App.openSupport({ greet: true }); } })
      ])
    ]));
  }

  /* عن تابعني */
  function aboutPage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('عن تابعني', 'نبني نظام تشغيل المدرسة العربية — من داخل المدرسة لا من خارجها.'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        card('&#127760;', 'عربي بالكامل', 'كل الشاشات والتقارير بالعربية، ومسمّيات تتأنّث تلقائيًا في مدارس البنات.'),
        card('&#128241;', 'يعمل كتطبيق', 'ثبّته على الجوال أو الآيباد، ويفتح بملء الشاشة وبلا إنترنت بعد أول مرة.'),
        card('&#128221;', 'قابل للتخصيص', 'ترويسة التقارير وفترات المناوبة وأذون الدخول والإعلانات — تُضبط من داخل تابعني.')
      ])
    ]));
  }

  /* تواصل معنا */
  function contactPage(host) {
    host.appendChild(h('section', { class: 'lp-sec' }, [
      head2('تواصل معنا', 'أسرع طريقة: محادثة الدعم الفني — تفتح لك تذكرة برقم متابعة.'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        card('&#128172;', 'محادثة الدعم الفني', 'فارس الحربي وهند المطيري — شفتان على مدار اليوم.'),
        card('&#128231;', 'البريد الإلكتروني', 'info@tabaani.sa'),
        card('&#127970;', 'تفعيل مدرسة جديدة', 'نُهيّئ تابعني وننشئ حساب مدير المدرسة وندرّب فريقك.')
      ]),
      h('div', { class: 'lp-band' }, [
        h('div', {}, [h('strong', { text: 'تفعيل مدرسة أو ترقية باقة' }), h('p', { text: 'راسلنا في المحادثة ونكمل معك خلال دقائق.' })]),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'ابدأ المحادثة', onClick: function () { App.openSupport({ greet: true }); } })
      ])
    ]));
  }

  /* ------------------------------------------------------------ شريط الإعلان */
  /** يقرأ إعلان تابعني: يُغلق، ويتلاشى بعد مدة (autoClose)، ويحترم تكرار العرض */
  /** يقرأ ملف الإعلان المنشور للموقع (site/assets/data/promo-config.js) — للزوار */
  function probePromo(cb) {
    try {
      fetch('../site/assets/data/promo-config.js', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('no-file');
        return r.text();
      }).then(function (txt) {
        var fake = {};
        /* آمن: sandbox-promo — يُنفَّذ **ملف إعلان محلّي من أصل الموقع نفسه** فقط، داخل صندوق رملي
           بأسماء محدودة (window/self/globalThis/document/fetch/localStorage) وبلا أي مدخل من المستخدم. */
        try {
          (new Function('window', 'self', 'globalThis', 'document', 'fetch', 'localStorage', txt))(
            fake, fake, fake, undefined, undefined, undefined);
        } catch (e) { return cb(null); }
        cb(fake.TABAANI_PROMO || null);
      }).catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  function promoBand(given) {
    var cfg = given || null;
    /* الإعداد المحلّي يُستخدم فقط إذا لم يُمرَّر إعداد جاهز (ملف الموقع مثلًا) */
    if (!cfg) { try { if (S && S.promoConfig) cfg = S.promoConfig(); } catch (e) {} }
    if (!cfg || !cfg.ads || !cfg.ads.length) {
      try { var raw = localStorage.getItem('tabaani_promo_config'); if (raw) cfg = JSON.parse(raw); } catch (e) {}
    }
    if (!cfg && global.TABAANI_PROMO) cfg = global.TABAANI_PROMO;
    if (!cfg || cfg.enabled === false) return null;
    var ads = (cfg.ads || []).filter(function (a) {
      if (a.active === false) return false;
      if (a.until && String(a.until) < new Date().toISOString().slice(0, 10)) return false;  /* انتهى الإعلان */
      return true;
    });
    if (!ads.length) return null;

    /* التكرار: always لكل فتح · session مرة لكل جلسة · once مرة لكل زائر */
    var freq = cfg.frequency || 'session';
    var SESSION_KEY = 'tabaani_promo_seen', ONCE_KEY = 'tabaani_promo_seen_once';
    try {
      if (freq === 'session' && sessionStorage.getItem(SESSION_KEY)) return null;
      if (freq === 'once' && localStorage.getItem(ONCE_KEY)) return null;
    } catch (e) {}

    var idx = 0;
    if (cfg.mode === 'rotate') {
      try { idx = (parseInt(localStorage.getItem('tabaani_promo_rotate') || '0', 10) || 0) % ads.length;
            localStorage.setItem('tabaani_promo_rotate', String(idx + 1)); } catch (e) {}
    }
    var ad = ads[idx];
    var band = h('div', { class: 'lp-promo' }, [
      ad.image ? h('img', { src: ad.image, alt: '', class: 'lp-promo-img' }) : null,
      h('div', { class: 'lp-promo-txt' }, [
        h('span', { class: 'lp-tag', text: 'إعلان' }),
        h('h3', { text: ad.title || 'عرض تابعني' }),
        ad.text ? h('p', { text: ad.text }) : null
      ]),
      h('div', { class: 'lp-promo-act' }, [
        ad.link ? h('a', { class: 'btn btn-gold btn-sm', href: ad.link, text: 'التفاصيل' }) : null,
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'استفسر', onClick: function () { App.openSupport({ greet: true }); } })
      ]),
      h('button', { class: 'lp-promo-x', type: 'button', title: 'إغلاق الإعلان', html: '&times;', onClick: function () { hide(); } })
    ]);
    function hide() {
      band.classList.add('is-out');
      try { sessionStorage.setItem(SESSION_KEY, '1'); if (freq === 'once') localStorage.setItem(ONCE_KEY, '1'); } catch (e) {}
      setTimeout(function () { if (band.parentNode) band.remove(); }, 320);
    }
    if (cfg.autoClose > 0) setTimeout(function () { if (band.parentNode) hide(); }, cfg.autoClose * 1000);
    return band;
  }
})(window);
