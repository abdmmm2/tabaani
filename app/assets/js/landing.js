/* =============================================================================
   landing.js — الصفحة الرئيسية للموقع (واجهة المنصة العامة)
   ---------------------------------------------------------------------------
   واجهة تسويقية احترافية تُفتح على رابط المنصة:
     • اللوغو على اليمين · أيقونة الدخول على اليسار (تفتح نافذة بيانات الدخول).
     • قائمة منسدلة بثلاثة خطوط: الأسعار · عن تابعني · المدارس الذكية ·
       حول مدرستك · مميزاتنا · الدعم الفني · الإعلان · للتواصل.
     • أقسام: البطل · مميزاتنا · المدارس الذكية · مقارنة ذكية/تقليدية ·
       الأسعار · الدعم الفني (فارس/هند) · الإعلان · للتواصل · الحقوق.
   بلا مكتبات خارجية — كل شيء محلّي ويعمل بلا إنترنت.
   ========================================================================== */
(function (global) {
  'use strict';
  var S = global.Store, UI = global.UI, App = global.App, h = UI.h, clear = UI.clear;

  /* ---------------------------------------------------------------- بيانات */
  var NAV = [
    { id: 'features', label: 'مميزاتنا' },
    { id: 'smart', label: 'المدارس الذكية' },
    { id: 'compare', label: 'حول مدرستك' },
    { id: 'pricing', label: 'الأسعار' },
    { id: 'support', label: 'الدعم الفني' },
    { id: 'about', label: 'عن تابعني' },
    { id: 'promo', label: 'الإعلان' },
    { id: 'contact', label: 'للتواصل' }
  ];

  var FEATURES = [
    { ic: '&#127979;', t: 'تأسيس المدرسة والحسابات', d: 'مناطق ومدن بقوائم انزلاقية، تأسيس المدرسة ومراحلها وجنسها، وحساب مدير المدرسة في دقائق.' },
    { ic: '&#128100;', t: '١٣ دورًا مدرسيًا', d: 'مدير · وكيل طلاب · وكيل معلمين · توجيه وإرشاد · معلم · تطوع · نشاط · مراقبة غياب · بوابة · طالب — كل دور يرى ما يخصّه فقط.' },
    { ic: '&#128197;', t: 'جدول الحصص والتحضير', d: 'ضبط الحصص، ورفع الجدول من ملف، وتحضير لكل حصة مع قاعدة الإغلاق وغياب فوري.' },
    { ic: '&#128221;', t: 'المخالفات والاستئذان', d: 'دورة كاملة للمخالفة (معلم ← توجيه ← وكيل)، واستئذان بتصريح خروج بباركود يتحقق منه الحارس بلا إنترنت.' },
    { ic: '&#128273;', t: 'إذن دخول الفصل', d: 'للطالب المتأخر: إذن بسبب إلزامي، يُسلَّم ورقيًا بترويسة وباركود، ويصل رسالة خاصة، مع متابعة إقرار المعلم.' },
    { ic: '&#128202;', t: 'تقارير رسمية بالباركود', d: 'تقارير يومية وأسبوعية وشهرية ونهاية فصل، بترويسة الوزارة واسم المدرسة وشعارها وباركود تحقّق.' },
    { ic: '&#129302;', t: 'بصمة الوجه والتثبيت', d: 'تسجيل حضور الحصة ببصمة الوجه، وتثبيت المنصة كتطبيق على الجوال والآيباد يعمل بدون إنترنت.' },
    { ic: '&#128176;', t: 'مالية وفواتير إلكترونية', d: 'سند تحويل مختوم بختم المدرسة، فاتورة إلكترونية مختومة من تابعني، مصروفات، وتقارير مالية لكل الفترات.' }
  ];

  var COMPARE = [
    ['سجل الطلاب والحضور', 'دفاتر ورقية وجداول Excel متفرقة', 'سجل رقمي واحد موحّد لكل طالب وحصة'],
    ['غياب اليوم', 'يُعرف بعد الحصة الأولى أو بالاتصال', 'يظهر لحظيًا مع قائمة الحرمان تلقائيًا'],
    ['متابعة المخالفات', 'ورقة تنتقل بين التوجيه والوكيل وتضيع', 'دورة موثّقة بإجراء وتاريخ ومسؤول'],
    ['تصاريح الخروج', 'ورقة بتوقيع تُنسى أو تُزوَّر', 'باركود بتحقّق فوري وسجل زمني'],
    ['تقارير رسمية', 'تُجهَّز يدويًا في نهاية الفصل', 'بضغطة، بترويسة الوزارة وباركود تحقّق'],
    ['تواصل مع المعلمين', 'واتساب مجموعات ورسائل متفرقة', 'إشعارات وتذاكر دعم منظّمة'],
    ['البيانات والخصوصية', 'أوراق قابلة للفقدان', 'نسخ احتياطي، وصلاحيات لكل دور'],
    ['تكلفة التشغيل', 'ساعات عمل إداري متكرّرة', 'أتمتة توفّر وقت الفريق وتمنع التكرار']
  ];

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ------------------------------------------------------------ نموذج الدخول */
  App.loginPanel = function () {
    var user = UI.field({ name: 'username', label: 'اسم المستخدم أو البريد', required: true, placeholder: 'principal', autocomplete: 'username' });
    var pass = UI.field({ name: 'password', label: 'كلمة المرور', type: 'password', required: true, placeholder: '••••••••', autocomplete: 'current-password' });
    var err = h('p', { class: 'hint hint-error', hidden: true });
    var form = h('form', { class: 'stack', onsubmit: function (e) {
      e.preventDefault();
      var res = S.authenticate(user.input.value, pass.input.value);
      if (!res.ok) { err.hidden = false; err.textContent = res.error; return; }
      var tf = S.twoFactorFor(res.user);
      if (tf.blocked) { err.hidden = false; err.textContent = tf.reason; return; }
      err.hidden = true;
      function afterAuth() {
        var m = document.querySelector('.modal-backdrop');
        if (m) m.remove();
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
    return form;
  };

  function closeAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal-backdrop'), function (b) { b.remove(); });
  }

  App.openLogin = function () {
    if (S.needsSetup()) {
      UI.modal({
        title: 'تهيئة المنصة', body: [
          h('p', { class: 'muted', text: 'هذه أول مرة تُفتح فيها المنصة على هذا الجهاز — أنشئ حساب المشرف العام أولًا، ثم سجّل دخولك.' }),
          h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'إنشاء حساب المشرف العام',
            onClick: function () { closeAll(); App.setupScreen(); } })
        ]
      });
      return;
    }
    UI.modal({
      title: 'تسجيل الدخول إلى المنصة',
      body: [
        h('div', { class: 'lp-login-note' }, [
          h('strong', { text: 'دخول المدارس والأدوار' }),
          h('span', { text: ' — لكل دور شاشته وصلاحياته (مدير · وكيل · معلم · طالب · محاسب · دعم).' })
        ]),
        App.loginPanel()
      ]
    });
  };

  /* ---------------------------------------------------------------- القشرة */
  App.landing = function (opts) {
    opts = opts || {};
    App._removeSupportFab();
    var root = document.getElementById('app');
    var wrap0 = document.querySelector('.login-wrap');
    if (wrap0) wrap0.remove();
    clear(root);
    document.body.classList.remove('app-body');
    document.body.classList.add('landing-body');

    /* بيانات الإعلان + الرسوم */
    var fees = S.planFees();
    var plans = S.PLANS;
    var agents = S.AGENTS;

    /* ------------------------------ الترويسة ------------------------------ */
    var drawer = h('aside', { class: 'lp-drawer', id: 'lp-drawer' });
    function closeDrawer() { document.body.classList.remove('lp-open'); }
    NAV.forEach(function (n) {
      drawer.appendChild(h('a', {
        class: 'lp-dnav', href: '#lp-' + n.id, onClick: function (e) { e.preventDefault(); closeDrawer(); goTo(n.id); }
      }, [
        h('span', { class: 'lp-dnav-dot' }), h('span', { text: n.label })
      ]));
    });
    drawer.appendChild(h('div', { class: 'lp-dhead' }, [
      h('span', { class: 'lp-dlabel', text: 'ابدأ الآن' })
    ]));
    drawer.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'تسجيل الدخول',
      onClick: function () { closeDrawer(); App.openLogin(); } }));
    drawer.appendChild(h('a', { class: 'btn btn-outline btn-block', href: 'mailto:info@tabaani.sa', text: 'اطلب تفعيل مدرستك' }));
    drawer.appendChild(h('div', { class: 'lp-dfoot' }, [
      h('span', { text: 'تابعني للخدمات التعليمية' }),
      h('span', { class: 'muted', text: 'الإصدار ' + App.version() })
    ]));

    var head = h('header', { class: 'lp-head' }, [
      h('div', { class: 'lp-brand' }, [
        h('img', { src: 'assets/img/logo-mark.png', alt: 'تابعني', class: 'lp-logo' }),
        h('span', { class: 'lp-brand-txt' }, [
          h('span', { class: 'lp-brand-name', text: 'تابعني' }),
          h('span', { class: 'lp-brand-sub', text: 'منصة المدارس الذكية' })
        ])
      ]),
      h('div', { class: 'lp-hact' }, [
        h('button', { class: 'lp-icon-btn lp-support-quick', type: 'button', title: 'الدعم الفني', onClick: function () { App.openSupport({ greet: true }); } },
          [h('img', { src: S.agentNow().img, alt: '', width: '30', height: '30' })]),
        h('button', { class: 'lp-login-btn', type: 'button', 'data-login': '1', onClick: function () { App.openLogin(); } }, [
          h('span', { class: 'lp-ic', html: '&#128274;' }), h('span', { text: 'تسجيل الدخول' })
        ]),
        h('button', { class: 'lp-burger', type: 'button', 'aria-label': 'القائمة', onClick: function () {
          document.body.classList.toggle('lp-open');
        } }, [h('span'), h('span'), h('span')])
      ])
    ]);

    function goTo(id) {
      var el = document.getElementById('lp-' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* -------------------------------- البطل -------------------------------- */
    var hero = h('section', { class: 'lp-hero' }, [
      h('div', { class: 'lp-hero-glow' }),
      h('div', { class: 'lp-hero-inner' }, [
        h('div', { class: 'lp-hero-copy' }, [
          h('span', { class: 'lp-eyebrow', text: 'منصة تشغيل مدرسي · عربي بالكامل · يعمل بلا إنترنت' }),
          h('h1', { class: 'lp-h1' }, [
            h('span', { text: 'مدرستك… ' }),
            h('span', { class: 'lp-grad', text: 'ذكية في كل تفصيلة' })
          ]),
          h('p', { class: 'lp-lead', text: 'تابعني تجمع الحضور والمخالفات والاستئذان والجدول والمناوبة والتقارير الرسمية في منصة واحدة — بتسع أدوار مدرسية، وتعمل من الجوال والآيباد.' }),
          h('div', { class: 'lp-cta' }, [
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'تسجيل الدخول للمنصة', 'data-login': '1', onClick: function () { App.openLogin(); } }),
            h('button', { class: 'btn btn-glass btn-lg', type: 'button', text: 'تحدّث مع الدعم الفني', onClick: function () { App.openSupport({ greet: true }); } })
          ]),
          h('div', { class: 'lp-chips' }, [
            h('span', { class: 'lp-chip' }, [h('b', { text: '13' }), h('span', { text: ' دورًا مدرسيًا' })]),
            h('span', { class: 'lp-chip' }, [h('b', { text: '26' }), h('span', { text: ' وحدة خدمة' })]),
            h('span', { class: 'lp-chip' }, [h('b', { text: '100%' }), h('span', { text: ' عربي RTL' })]),
            h('span', { class: 'lp-chip' }, [h('b', { text: '0' }), h('span', { text: ' إنترنت مطلوب' })])
          ])
        ]),
        /* بطاقة عرض: لوحة المدرسة الذكية */
        h('div', { class: 'lp-mock' }, [
          h('div', { class: 'lp-mock-head' }, [
            h('span', { class: 'lp-mock-dot' }), h('span', { class: 'lp-mock-dot' }), h('span', { class: 'lp-mock-dot' }),
            h('span', { class: 'lp-mock-title', text: 'لوحة قائد المدرسة' })
          ]),
          h('div', { class: 'lp-mock-row' }, [
            h('div', { class: 'lp-mock-card' }, [h('span', { class: 'k', text: 'حضور اليوم' }), h('b', { class: 'v', text: '94%' })]),
            h('div', { class: 'lp-mock-card' }, [h('span', { class: 'k', text: 'غياب' }), h('b', { class: 'v', text: '7 طلاب' })]),
            h('div', { class: 'lp-mock-card' }, [h('span', { class: 'k', text: 'مخالفات مفتوحة' }), h('b', { class: 'v', text: '3' })])
          ]),
          h('div', { class: 'lp-mock-bars' }, [68, 84, 52, 91, 74, 96, 61].map(function (v) {
            return h('span', { class: 'lp-bar', style: { height: v + '%' } });
          })),
          h('div', { class: 'lp-mock-foot' }, [
            h('span', { class: 'lp-mock-pill', text: 'إذن دخول الفصل ✓' }),
            h('span', { class: 'lp-mock-pill', text: 'تصريح خروج بباركود' }),
            h('span', { class: 'lp-mock-pill', text: 'تقرير رسمي جاهز' })
          ])
        ])
      ])
    ]);

    /* ----------------------------- مميزاتنا ----------------------------- */
    var features = h('section', { class: 'lp-sec lp-sec-light', id: 'lp-features' }, [
      secHead('مميزاتنا', 'كل ما تحتاجه المدرسة في نظام واحد', 'من تأسيس المدرسة إلى التقرير الرسمي المختوم — بلا أوراق متفرّقة ولا مجموعات واتساب.'),
      h('div', { class: 'lp-grid lp-grid-4' }, FEATURES.map(function (f, i) {
        return h('article', { class: 'lp-card lp-card-feat', style: { animationDelay: (i * 40) + 'ms' } }, [
          h('span', { class: 'lp-tile', html: f.ic }),
          h('h3', { text: f.t }),
          h('p', { text: f.d })
        ]);
      }))
    ]);

    /* -------------------------- المدارس الذكية -------------------------- */
    var smart = h('section', { class: 'lp-sec lp-sec-dark', id: 'lp-smart' }, [
      secHead('المدارس الذكية', 'ما معنى «مدرسة ذكية»؟', 'ليست أجهزة فخمة — بل قرار يُتخذ من بيانات لحظية: من غاب؟ من تأخّر؟ من يحتاج دعمًا؟ أين المخالفة الآن؟'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        pillar('&#128200;', 'بيانات لحظية لا أوراق', 'كل تسجيل يحدث وقت حدوثه: الحضور، الغياب، المخالفة، الاستئذان، المناوبة — فيُبنى القرار على اللحظة لا على الذاكرة.'),
        pillar('&#128274;', 'صلاحيات مضبوطة', 'كل دور يرى ما يخصّه فقط: المعلم فصوله، الوكيل مدرسته، الطالب كشوفه — والبيانات محفوظة بنسخ احتياطي.'),
        pillar('&#9889;', 'سرعة توفّر الوقت', 'أذون وإشعارات وتقارير تُنجَز بضغطة بدل ساعات من التجميع اليدوي في نهاية الفصل.')
      ]),
      h('div', { class: 'lp-stat-row' }, [
        statBig('٧', 'تقارير رسمية جاهزة'),
        statBig('١٣', 'أدوار وصلاحيات'),
        statBig('٢٤/٧', 'عمل بلا إنترنت'),
        statBig('٠', 'ريال للطلاب'),
      ].map(function (x) { return x; }))
    ]);

    /* --------------------------- حول مدرستك --------------------------- */
    var compare = h('section', { class: 'lp-sec lp-sec-light', id: 'lp-compare' }, [
      secHead('حول مدرستك', 'المدرسة التقليدية… والمدرسة الذكية', 'نفس المدرسة، نفس الفريق — والفرق كله في طريقة إدارة المعلومة.'),
      h('div', { class: 'lp-compare-wrap' }, [
        h('table', { class: 'lp-compare' }, [
          h('thead', {}, [h('tr', {}, [
            h('th', { text: 'المجال' }),
            h('th', { class: 'is-old', text: 'المدرسة التقليدية' }),
            h('th', { class: 'is-smart', text: 'المدرسة الذكية مع تابعني' })
          ])]),
          h('tbody', {}, COMPARE.map(function (r) {
            return h('tr', {}, [
              h('td', {}, [h('strong', { text: r[0] })]),
              h('td', { class: 'is-old' }, [h('span', { class: 'lp-x', html: '&times;' }), h('span', { text: r[1] })]),
              h('td', { class: 'is-smart' }, [h('span', { class: 'lp-v', html: '&#10003;' }), h('span', { text: r[2] })])
            ]);
          }))
        ])
      ])
    ]);

    /* ------------------------------ الأسعار ------------------------------ */
    var pricing = h('section', { class: 'lp-sec lp-sec-dark', id: 'lp-pricing' }, [
      secHead('الأسعار', 'باقتان لمدرستك… ورسوم واضحة', 'باقة واحدة تغطّي المدرسة كلها — بلا حدّ للحسابات ولا للطلاب.'),
      h('div', { class: 'lp-plans' }, plans.map(function (p) {
        var fee = p.id === 'pro' ? fees.pro : fees.classic;
        return h('article', { class: 'lp-plan' + (p.id === 'pro' ? ' is-best' : '') }, [
          p.id === 'pro' ? h('span', { class: 'lp-ribbon', text: 'كل الخدمات' }) : null,
          h('h3', { text: p.name }),
          h('p', { class: 'lp-plan-tag', text: p.tagline }),
          h('div', { class: 'lp-price' }, [h('b', { class: 'nums', text: UI.fmtMoney(fee) }), h('span', { text: ' ر.س / سنويًا' })]),
          h('ul', { class: 'lp-list' }, p.features.map(function (f) { return h('li', {}, [h('span', { class: 'lp-v', html: '&#10003;' }), h('span', { text: f })]); })),
          h('button', { class: 'btn ' + (p.id === 'pro' ? 'btn-primary' : 'btn-glass') + ' btn-block', type: 'button',
            text: 'اطلب تفعيل مدرستك', onClick: function () { App.openSupport({ greet: true }); } })
        ]);
      })),
      h('div', { class: 'lp-setup' }, [
        h('div', {}, [
          h('span', { class: 'lp-eyebrow', text: 'مرة واحدة عند البدء' }),
          h('h3', { text: 'رسم التأسيس والتهيئة: ' + UI.fmtMoney(fees.setupFee) + ' ر.س' }),
          h('p', { text: 'تهيئة المنصة للمدرسة: الحسابات والأدوار، الفصول والطلاب، بيانات السنة الدراسية، وتدريب فريقك مع دليل تشغيل.' })
        ]),
        h('div', { class: 'lp-setup-note' }, [
          h('strong', { text: 'كيف يُسدَّد؟' }),
          h('p', { text: 'تحويل بنكي ← ترفع المدرسة صورة سند التحويل مختومة بختم المدرسة ← يُعتمد ← تصدر فاتورة إلكترونية مختومة من «تابعني للخدمات التعليمية» وتُفعَّل الباقة آليًا.' })
        ])
      ])
    ]);

    /* --------------------------- الدعم الفني --------------------------- */
    var support = h('section', { class: 'lp-sec lp-sec-dark lp-sec-support', id: 'lp-support' }, [
      secHead('الدعم الفني', 'فريق يرد عليك… وبوت يفهمك', 'شفتان يغطّيان اليوم كاملًا — بلهجة سعودية، وبصورة واسم لكل موظف.'),
      h('div', { class: 'lp-agents' }, agents.map(function (a) {
        var on = S.agentNow().id === a.id;
        return h('article', { class: 'lp-agent' + (on ? ' is-on' : '') }, [
          h('img', { src: a.img, alt: a.name, class: 'lp-agent-img' }),
          h('div', { class: 'lp-agent-txt' }, [
            h('h3', { text: a.name }),
            h('p', { class: 'lp-agent-shift', text: a.shift }),
            h('span', { class: 'lp-agent-state', text: on ? 'متصل الآن — يرد فورًا' : 'يستلم الشفت التالي' })
          ])
        ]);
      })),
      h('div', { class: 'lp-support-cta' }, [
        h('div', {}, [
          h('strong', { text: 'يفتح تذكرة متابعة تلقائيًا' }),
          h('p', { text: 'اسأل، ارفع صورة لقطة للمشكلة، ويُفتح لك رقم تذكرة يتابعه قسم الدعم والمشرف العام حتى الإغلاق.' })
        ]),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', text: 'ابدأ المحادثة الآن', onClick: function () { App.openSupport({ greet: true }); } })
      ])
    ]);

    /* ------------------------------ عن تابعني ------------------------------ */
    var about = h('section', { class: 'lp-sec lp-sec-light', id: 'lp-about' }, [
      secHead('عن تابعني', 'نبني نظام تشغيل المدرسة العربية', 'تابعني منصة سعودية للخدمات التعليمية: صُمّمت من داخل المدرسة — بحاجات الوكيل والمعلم والحارس وولي الأمر، لا من خلف مكتب.'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        pillar('&#127760;', 'عربي RTL بالكامل', 'كل الشاشات والتقارير والنماذج بالعربية، مع مسمّيات تتأنّث تلقائيًا في مدارس البنات.'),
        pillar('&#128241;', 'يعمل كتطبيق', 'ثبّته على الجوال أو الآيباد من المتصفح، ويفتح بملء الشاشة بلا شريط، وبلا إنترنت بعد أول فتح.'),
        pillar('&#128221;', 'قابل للتخصيص', 'ترويسة التقارير، أيام الأسبوع، فترات المناوبة، أذون الدخول، والإعلانات — تُضبط من داخل المنصة.')
      ])
    ]);

    /* ------------------------------- الإعلان ------------------------------- */
    var promoSlot = h('div', { class: 'lp-promo-slot' });
    var promo = h('section', { class: 'lp-sec lp-sec-promo', id: 'lp-promo' }, [
      secHead('الإعلان', 'عروض تابعني', 'الإعلان الحالي للمنصة — يُدار من «الإعلان الافتتاحي» في لوحة المشرف العام.'),
      promoSlot
    ]);

    /* ------------------------------ للتواصل ------------------------------ */
    var contact = h('section', { class: 'lp-sec lp-sec-light', id: 'lp-contact' }, [
      secHead('للتواصل', 'نحن قريبون منك', 'أسرع طريقة: محادثة الدعم الفني — تفتح لك تذكرة متابعة برقم.'),
      h('div', { class: 'lp-grid lp-grid-3' }, [
        contactCard('&#128172;', 'محادثة الدعم الفني', 'فارس الحربي وهند المطيري — شفتان على مدار اليوم، وردّ فوري بلهجة سعودية.', 'ابدأ المحادثة', function () { App.openSupport({ greet: true }); }),
        contactCard('&#128231;', 'البريد الإلكتروني', 'للطلبات الرسمية وعروض التفعيل والترقيات.', 'info@tabaani.sa', null, 'mailto:info@tabaani.sa'),
        contactCard('&#127970;', 'تفعيل مدرسة جديدة', 'نُهيّئ المنصة لمدرستك وننشئ حساب مدير المدرسة وندرّب فريقك.', 'اطلب التفعيل', function () { App.openSupport({ greet: true }); })
      ])
    ]);

    /* ------------------------------- الحقوق ------------------------------- */
    var foot = h('footer', { class: 'lp-foot' }, [
      h('div', { class: 'lp-foot-main' }, [
        h('div', { class: 'lp-foot-brand' }, [
          h('img', { src: 'assets/img/logo-mark.png', alt: '', class: 'lp-logo-sm' }),
          h('div', {}, [
            h('strong', { text: 'تابعني للخدمات التعليمية' }),
            h('span', { class: 'muted', text: 'منصة الخدمات التعليمية للمدارس' })
          ])
        ]),
        h('nav', { class: 'lp-foot-nav' }, NAV.slice(0, 6).map(function (n) {
          return h('a', { href: '#lp-' + n.id, onClick: function (e) { e.preventDefault(); goTo(n.id); }, text: n.label });
        })),
        h('div', { class: 'lp-foot-nav' }, [
          h('a', { href: '../d21448/index.html', text: 'الأدلة (PDF · Word)' }),
          h('a', { href: '../screens/index.html', text: 'معرض الشاشات' }),
          h('button', { class: 'btn-link', type: 'button', text: 'تسجيل الدخول', 'data-login': '1', onClick: function () { App.openLogin(); } })
        ])
      ]),
      h('div', { class: 'lp-foot-base' }, [
        h('span', { text: '© ' + new Date().getFullYear() + ' تابعني للخدمات التعليمية — جميع الحقوق محفوظة.' }),
        h('span', { class: 'muted', text: 'الإصدار ' + App.version() + ' · بياناتك محفوظة على جهازك في هذا النموذج' })
      ])
    ]);

    /* --------------------------- تركيب الصفحة --------------------------- */
    /* شريط تهيئة: يظهر فقط إذا كان هذا الجهاز غير مُهيّأ */
    var setupBar = S.needsSetup() ? h('div', { class: 'lp-setupbar' }, [
      h('span', { html: '&#9888;&#65039;' }),
      h('span', { text: 'هذا الجهاز غير مُهيّأ بعد — أنشئ حساب المشرف العام لتبدأ (مرة واحدة).' }),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تهيئة المنصة الآن', onClick: function () { App.setupScreen(); } })
    ]) : null;
    var page = h('div', { class: 'lp' }, [setupBar, head, h('div', { class: 'lp-veil', onClick: closeDrawer }), drawer, hero, features, smart, compare, pricing, support, about, promo, contact, foot]);
    root.appendChild(page);
    renderPromo(promoSlot);

    if (opts.login) App.openLogin();
    global.addEventListener('hashchange', function () {});
    return page;
  };

  /* ------------------------------------------------------------- مكوّنات */
  function secHead(eyebrow, title, sub) {
    return h('div', { class: 'lp-sec-head' }, [
      h('span', { class: 'lp-eyebrow', text: eyebrow }),
      h('h2', { text: title }),
      sub ? h('p', { class: 'lp-sec-sub', text: sub }) : null
    ]);
  }
  function pillar(ic, t, d) {
    return h('article', { class: 'lp-card lp-card-pillar' }, [
      h('span', { class: 'lp-tile lp-tile-lg', html: ic }),
      h('h3', { text: t }), h('p', { text: d })
    ]);
  }
  function statBig(v, l) {
    return h('div', { class: 'lp-stat' }, [h('b', { class: 'nums', text: v }), h('span', { text: l })]);
  }
  function contactCard(ic, t, d, label, onClick, href) {
    return h('article', { class: 'lp-card lp-card-contact' }, [
      h('span', { class: 'lp-tile', html: ic }),
      h('h3', { text: t }), h('p', { text: d }),
      href ? h('a', { class: 'btn btn-outline btn-sm', href: href, text: label })
           : h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: label, onClick: onClick })
    ]);
  }

  /** الإعلان: من إعدادات المنصة، أو إعداد المتصفح المشترك، أو ملف الموقع */
  function renderPromo(slot) {
    var cfg = null;
    try { if (S && S.promoConfig) cfg = S.promoConfig(); } catch (e) {}
    if (!cfg || !cfg.ads || !cfg.ads.length) {
      try {
        var raw = localStorage.getItem('tabaani_promo_config');
        if (raw) cfg = JSON.parse(raw);
      } catch (e) {}
    }
    if (!cfg && global.TABAANI_PROMO) cfg = global.TABAANI_PROMO;
    var ads = (cfg && cfg.ads) ? cfg.ads.filter(function (a) { return a.active !== false; }) : [];
    if (!cfg || cfg.enabled === false || !ads.length) {
      slot.appendChild(h('div', { class: 'lp-promo-empty' }, [
        h('strong', { text: 'لا يوجد إعلان منشور حاليًا' }),
        h('p', { text: 'تُدار الإعلانات من: المنصة ← «الإعلان الافتتاحي» — وتظهر هنا للزوار تلقائيًا.' })
      ]));
      return;
    }
    var ad = ads[0];
    slot.appendChild(h('div', { class: 'lp-promo-card' }, [
      ad.image ? h('img', { src: ad.image, alt: ad.title || 'إعلان', class: 'lp-promo-img' }) : null,
      h('div', { class: 'lp-promo-txt' }, [
        h('span', { class: 'lp-eyebrow', text: 'إعلان نشط' }),
        h('h3', { text: ad.title || 'عرض تابعني' }),
        ad.text ? h('p', { text: ad.text }) : h('p', { text: 'تفاصيل العرض متاحة عبر الدعم الفني.' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'استفسر عن العرض', onClick: function () { App.openSupport({ greet: true }); } })
      ])
    ]));
  }
})(window);
