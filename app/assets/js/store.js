/* =============================================================================
   تابعني — تابعني للخدمات الذكية
   store.js : نموذج البيانات + منطق العمل + التخزين المحلي
   ---------------------------------------------------------------------------
   البروتوتايب يعمل بالكامل في المتصفح: البيانات تُزرَع أول مرة ثم تُحفظ في
   localStorage، فتبقى تغييراتك بعد إعادة التحميل. الإنتاج يستبدل هذا الملف
   بواجهة API (نفس الأسماء والدوال) دون تغيير الوحدات.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'tabaani-school-db-v1';
  var uid = function (p) { return (p || 'id') + '-' + Math.random().toString(36).slice(2, 9); };
  var now = function () { return new Date().toISOString(); };

  /* ---------------------------------------------------------------- المناطق */
  var REGIONS = [
    { id: 'rg-ryd', name: 'منطقة الرياض', cities: ['الرياض', 'الخرج', 'الدرعية', 'المجمعة', 'الزلفي'] },
    { id: 'rg-mkk', name: 'منطقة مكة المكرمة', cities: ['مكة المكرمة', 'جدة', 'الطائف', 'القنفذة'] },
    { id: 'rg-shq', name: 'المنطقة الشرقية', cities: ['الدمام', 'الخبر', 'الأحساء', 'الجبيل', 'حفر الباطن'] },
    { id: 'rg-asr', name: 'منطقة عسير', cities: ['أبها', 'خميس مشيط', 'بيشة', 'محايل عسير'] },
    { id: 'rg-mdn', name: 'منطقة المدينة المنورة', cities: ['المدينة المنورة', 'ينبع', 'العلا', 'بدر'] },
    { id: 'rg-qsm', name: 'منطقة القصيم', cities: ['بريدة', 'عنيزة', 'الرس', 'البكيرية'] }
  ];

  /* فترات المناوبة اليومية */
  var DUTY_SLOTS = [
    { id: 'break', name: 'الفسحة', desc: 'مناوبة الفسحة (الاستراحة الكبرى)' },
    { id: 'transitions', name: 'بين الحصص', desc: 'الدقائق الخمس بين الحصص' },
    { id: 'exit', name: 'نهاية اليوم', desc: 'مناوبة خروج الطلاب نهاية اليوم' }
  ];

  /* ------------------------------------------------------------- المراحل */
  var STAGES = [
    { id: 'kg', name: 'رياض الأطفال', short: 'روضة' },
    { id: 'primary', name: 'المرحلة الابتدائية', short: 'ابتدائي' },
    { id: 'middle', name: 'المرحلة المتوسطة', short: 'متوسط' },
    { id: 'secondary', name: 'المرحلة الثانوية', short: 'ثانوي' }
  ];

  /* ------------------------------------------- المواد بحسب المرحلة (نور) */
  var SUBJECTS = {
    kg: [],
    primary: ['القرآن الكريم', 'لغتي', 'الرياضيات', 'العلوم', 'الدراسات الاجتماعية', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية', 'الدراسات الإسلامية'],
    middle: ['القرآن الكريم', 'لغتي', 'الرياضيات', 'العلوم', 'الدراسات الاجتماعية', 'اللغة الإنجليزية', 'المهارات الرقمية', 'التربية الفنية', 'التربية البدنية', 'الدراسات الإسلامية', 'المهارات الحياتية والأسرية'],
    secondary: ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء', 'الكفايات اللغوية', 'اللغة الإنجليزية', 'الدراسات الاجتماعية', 'المهارات الرقمية', 'التفكير الناقد', 'علم البيئة', 'الحاسب وتقنية المعلومات', 'التربية البدنية']
  };

  var GRADES = {
    kg: ['تمهيدي', 'روضة أول', 'روضة ثاني'],
    primary: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'],
    middle: ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'],
    secondary: ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي']
  };

  var ROLES = [
    { id: 'super', name: 'مشرف تابعني', nameF: 'مشرفة تابعني', desc: 'إنشاء المناطق والمدن والمدارس' },
    { id: 'principal', name: 'مدير المدرسة', nameF: 'مديرة المدرسة', desc: 'إنشاء الحسابات وإسناد المواد والمتابعة' },
    { id: 'deputy', name: 'وكيل شؤون الطلاب', nameF: 'وكيلة شؤون الطالبات', desc: 'الفصول والجدول والإسناد والمخالفات والاستئذان' },
    { id: 'guidance', name: 'موجّه التوجيه والإرشاد', nameF: 'موجّهة التوجيه والإرشاد', desc: 'معالجة المخالفات السلوكية وتوجيه الاستئذان' },
    { id: 'teacher', name: 'معلم', nameF: 'معلمة', desc: 'التحضير والمخالفات وطلبات النشاط' },
    { id: 'teachers_deputy', name: 'وكيل شؤون المعلمين', nameF: 'وكيلة شؤون المعلمات', desc: 'متابعة المناوبة وتوزيع المناوبين وأماكنها والتنبيه الآلي' },
    { id: 'volunteer', name: 'مسؤول ساعات التطوع', nameF: 'مسؤولة ساعات التطوع', desc: 'البرامج التطوعية وتسجيل الطلاب' },
    { id: 'activity', name: 'مسؤول النشاط الطلابي', nameF: 'مسؤولة النشاط الطلابي', desc: 'الأنشطة وطلبات المشاركة' },
    { id: 'absence_monitor', name: 'مراقب الغياب', nameF: 'مراقبة الغياب', desc: 'متابعة غياب الطلاب — تُضاف خصائصه لاحقًا' },
    { id: 'guard', name: 'حارس البوابة', nameF: 'حارسة البوابة', desc: 'مسح تصاريح الخروج بالكاميرا وتسجيل خروج الطلاب بوقته وسببه' },
    { id: 'accountant', name: 'المحاسب المالي لتابعني', nameF: 'المحاسبة المالية لتابعني', desc: 'السدادات والفواتير والمصروفات والتقارير المالية' },
    { id: 'support', name: 'موظف الدعم الفني', nameF: 'موظفة الدعم الفني', desc: 'متابعة تذاكر الدعم والرد على المدارس والزوار' },
    { id: 'student', name: 'طالب', nameF: 'طالبة', desc: 'طلبات النشاط والتطوع والاستئذان' }
  ];

  /* مسمّيات المدرسة بحسب الجنس */
  var GENDER = { boys: 'طلاب', girls: 'طالبات' };

  /* معجم التأنيث: يُطبَّق على النصوص الظاهرة عندما تكون المدرسة للطالبات */
  var FEM_WORDS = [
    ['الطلاب', 'الطالبات'], ['طلاب', 'طالبات'], ['الطالب', 'الطالبة'], ['طالب', 'طالبة'],
    ['المعلمين', 'المعلمات'], ['معلمين', 'معلمات'], ['المعلم', 'المعلمة'], ['معلم', 'معلمة'],
    ['المدير', 'المديرة'], ['مدير', 'مديرة'],
    ['الوكلاء', 'الوكيلات'], ['وكلاء', 'وكيلات'], ['الوكيل', 'الوكيلة'], ['وكيل', 'وكيلة'],
    ['المسؤول', 'المسؤولة'], ['مسؤول', 'مسؤولة'],
    ['الموجّه', 'الموجّهة'], ['موجّه', 'موجّهة'], ['الموجه', 'الموجهة'], ['موجه', 'موجهة'],
    ['المرشد', 'المرشدة'], ['مرشد', 'مرشدة'],
    ['الأولاد', 'البنات'], ['أولاد', 'بنات'], ['الأبناء', 'البنات'], ['أبناء', 'بنات'],
    ['الأستاذ', 'الأستاذة'], ['أستاذ', 'أستاذة'], ['الدكتور', 'الدكتورة'], ['دكتور', 'دكتوره']
  ];

  /* --------------------------------------------------------- مولّد البيانات */
  var FIRST_M = ['عبدالله', 'محمد', 'فيصل', 'سعود', 'خالد', 'ناصر', 'عبدالعزيز', 'تركي', 'ريان', 'يوسف', 'بندر', 'ماجد', 'سلطان', 'عمر', 'إبراهيم'];
  var FIRST_F = ['نورة', 'سارة', 'ريم', 'هند', 'لمى', 'جواهر', 'دانة', 'أمل', 'منى', 'غادة', 'شهد', 'رغد'];
  var FAMILY = ['العتيبي', 'القحطاني', 'الحربي', 'الشهري', 'الغامدي', 'الدوسري', 'الزهراني', 'المطيري', 'السبيعي', 'البلوي', 'العنزي', 'الشمري', 'البقمي', 'الجهني'];

  var pick = function (arr, i) { return arr[i % arr.length]; };
  var person = function (i, female) {
    return pick(female ? FIRST_F : FIRST_M, i) + ' ' + pick(FAMILY, i * 3 + 1) + ' ' + pick(FAMILY, i * 7 + 2);
  };
  var nationalId = function (i) { return '10' + String(23456789 + i * 137).slice(0, 8); };
  var phone = function (i) { return '+9665' + String(10000000 + i * 4321).slice(0, 8); };

  function defaultPeriods() {
    var t = [['07:00', '07:45'], ['07:45', '08:30'], ['08:45', '09:30'], ['09:30', '10:15'], ['10:30', '11:15'], ['11:15', '12:00'], ['12:15', '13:00']];
    return t.map(function (p, i) {
      return { id: 'pd-' + (i + 1), index: i + 1, start: p[0], end: p[1], closeRule: i % 2 === 0 ? 'end' : 'mid', label: 'الحصة ' + (i + 1) };
    });
  }

  function seed() {
    var db = {
      meta: { version: 1, createdAt: now() },
      schools: [], users: [], classes: [], students: [], assignments: [], transfers: [],
      periods: [], sessions: [], violations: [], permissions: [],
      programs: [], programRegs: [], activities: [], activityReqs: [],
      dutyLocations: [], duties: [], terms: [], activityLog: [], checkins: [], faceScans: [],
      reports: [], telegram: [], audit: [], notif: [], exits: [],
      entryPermits: [], messages: [],
      educationDepts: [], letterhead: null, subjects: [],
      promo: {
        enabled: true, mode: 'active', frequency: 'session', autoClose: 0, updatedAt: '2026-10-13',
        ads: [{ id: 'ad-1', title: 'مجانًا ولفترة محدودة', image: 'assets/img/promo-offer.jpg', webp: 'assets/img/promo-offer.webp', link: '', active: true }]
      },
      settings: { hijri: true, ministry: 'المملكة العربية السعودية — وزارة التعليم', mobileNotify: false,
                  deprivationPct: 25, deprivationBySubject: {}, activeTermId: null }
    };

    /* المدرسة الأساسية */
    var school = {
      id: 'sch-1', name: 'ثانوية الأمير سلطان بن عبدالعزيز', code: 'RYD-11024',
      regionId: 'rg-ryd', regionName: 'منطقة الرياض', city: 'الرياض',
      address: 'حي الملقا — شارع الأمير محمد بن سلمان', location: '24.8129, 46.6087',
      phone: '+966112345678', email: 'info@sultan.edu.sa', stages: ['middle', 'secondary'],
      gender: 'boys',   /* boys = طلاب · girls = طالبات — يُحدَّد عند تسجيل المدرسة */
      logo: '', createdBy: 'super', createdAt: now(), status: 'established'
    };
    /* ترخيص العرض: باقة «برو» سارية سنة كاملة (لتجربة تلقرام والتحقق بمرحلتين) */
    school.plan = 'pro';
    school.license = {
      plan: 'pro', annual: 1500, setupFee: 1000, setupPaid: true, setupAt: now(), startedAt: now(),
      paidUntil: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      lastPaymentAt: now(), status: 'active', reason: '', note: '', suspendedAt: ''
    };
    db.schools.push(school);

    /* الحسابات */
    var mk = function (role, name, i, female) {
      var u = {
        id: 'u-' + role + '-' + i, schoolId: school.id, role: role, name: name,
        nationalId: nationalId(i + role.length), phone: phone(i + 3 * role.length),
        email: role + i + '@sultan.edu.sa', status: 'active', telegram: phone(i + 3 * role.length),
        /* محادثة تلقرام تجريبية (حتى يعمل التحقق بمرحلتين في العرض) — تُستبدل بالمعرّف الحقيقي عند التسليم */
        telegramChatId: String(500000000 + i * 1371 + role.length * 1013),
        createdAt: now(), canLogin: true
      };
      db.users.push(u); return u;
    };
    var principal = mk('principal', 'د. فهد بن ناصر الحربي', 1);
    var deputy = mk('deputy', 'أ. مشعل بن سعود العتيبي', 2);
    var guidance = mk('guidance', 'أ. راشد بن محمد القحطاني', 3);
    var teachersDeputy = mk('teachers_deputy', 'أ. ماجد بن فهد المطيري', 6);
    var absenceMonitor = mk('absence_monitor', 'أ. عبدالإله بن سعد الجهني', 7);
    var volunteer = mk('volunteer', 'أ. بدر بن عبدالله الشهري', 4);
    var activity = mk('activity', 'أ. ياسر بن تركي الدوسري', 5);

    /* حسابات تابعني (بلا مدرسة): المحاسب المالي وموظف الدعم الفني */
    var platformUser = function (role, name, i, uname) {
      var u = {
        id: 'u-' + role + '-' + i, schoolId: null, role: role, name: name,
        nationalId: nationalId(i + 71), phone: phone(i + 71), email: role + '@tabaani.sa',
        username: uname, password: 'Tabaani@2026', status: 'active',
        telegramChatId: String(700000000 + i * 2311), createdAt: now(), canLogin: true, subjects: []
      };
      db.users.push(u); return u;
    };
    var accountant = platformUser('accountant', 'أ. سعد بن عبدالله القحطاني', 3, 'accountant');
    var supportAgent = platformUser('support', 'أ. نورة بنت فهد العتيبي', 4, 'support1');

    var teachers = [
      { name: 'أ. سعد بن إبراهيم المطيري', subjects: ['الرياضيات'], female: false },
      { name: 'أ. عبدالعزيز بن خالد الزهراني', subjects: ['الفيزياء', 'الكيمياء'], female: false },
      { name: 'أ. نورة بنت سالم الغامدي', subjects: ['الكفايات اللغوية', 'التفكير الناقد'], female: true },
      { name: 'أ. محمد بن علي البلوي', subjects: ['اللغة الإنجليزية'], female: false },
      { name: 'أ. هند بنت فهد السبيعي', subjects: ['الأحياء', 'علم البيئة'], female: true },
      { name: 'أ. تركي بن سلطان العنزي', subjects: ['الرياضيات', 'المهارات الرقمية'], female: false }
    ].map(function (t, i) {
      var u = mk('teacher', t.name, i + 10, t.female);
      u.subjects = t.subjects;
      u.qualified = t.subjects;
      u.classIds = [];
      u.locked = false;           /* يثبّته وكيل شؤون الطلاب */
      return u;
    });

    /* الفصول */
    var classSeed = [
      { stage: 'secondary', grade: 'الأول الثانوي', section: 'أ', room: 'م-101' },
      { stage: 'secondary', grade: 'الأول الثانوي', section: 'ب', room: 'م-102' },
      { stage: 'secondary', grade: 'الثاني الثانوي', section: 'أ', room: 'م-201' },
      { stage: 'middle', grade: 'الثالث المتوسط', section: 'أ', room: 'ط-105' }
    ];
    classSeed.forEach(function (c, i) {
      var k = {
        id: 'cls-' + (i + 1), schoolId: school.id, stage: c.stage, grade: c.grade, section: c.section,
        room: c.room, name: c.grade + ' / ' + c.section, students: 0, supervisorId: teachers[i % teachers.length].id
      };
      db.classes.push(k);
    });

    /* الطلاب */
    var si = 0;
    db.classes.forEach(function (k) {
      for (var j = 1; j <= 12; j++) {
        si++;
        var female = k.stage === 'middle' && j > 8;
        db.students.push({
          id: 'st-' + si, schoolId: school.id, classId: k.id, name: person(si, female),
          nationalId: nationalId(si + 40), seat: j, guardianPhone: phone(si + 60), status: 'active'
        });
        k.students++;
      }
    });

    /* أسماء المستخدمين وكلمات المرور (بيانات عرض — تُغيَّر قبل أي استخدام حقيقي) */
    var DEFAULT_PASS = 'Tabaani@2026';
    var USERNAMES = {
      'u-principal-1': 'principal', 'u-deputy-2': 'deputy', 'u-guidance-3': 'guidance',
      'u-teachers_deputy-6': 'tdeputy', 'u-absence_monitor-7': 'monitor',
      'u-volunteer-4': 'volunteer', 'u-activity-5': 'activity'
    };
    db.users.forEach(function (u, i) {
      /* الاسم المحدَّد صراحةً (حسابات تابعني) يُحترَم — وإلا يُولَّد بحسب الدور */
      u.username = u.username || USERNAMES[u.id] || (u.role === 'teacher' ? 'teacher' + (i % 100) : u.role + (i + 1));
      u.password = DEFAULT_PASS;
    });

    /* حساب مشرف تابعني + حسابات الطلاب (للنموذج) */
    db.users.push({
      id: 'u-super-1', schoolId: null, role: 'super', name: 'مشرف تابعني — الإدارة العامة',
      username: 'admin', password: DEFAULT_PASS,
      email: 'admin@tabaani.com', phone: '+966500000000', telegram: '+966500000000',
      status: 'active', createdAt: now(), canLogin: true
    });

    /* حارس البوابة (لتجربة إذن الخروج) */
    db.users.push({
      id: 'u-guard-1', schoolId: school.id, role: 'guard', name: 'فهد بن سالم الحربي',
      username: 'guard', password: DEFAULT_PASS,
      email: 'guard@tabaani.com', phone: '+966500001234', telegram: '+966500001234',
      telegramChatId: String(700000000 + 4321),
      status: 'active', createdAt: now(), canLogin: true
    });

    db.students.slice(0, 4).forEach(function (st, i) {
      db.users.push({
        id: st.id, schoolId: school.id, role: 'student', name: st.name, studentId: st.id,
        username: 'student' + (i + 1), password: DEFAULT_PASS,
        nationalId: st.nationalId, phone: st.guardianPhone, email: 'student' + (i + 1) + '@sultan.edu.sa',
        status: 'active', telegram: st.guardianPhone, createdAt: now(), canLogin: true
      });
    });

    /* حالة إسناد جاهزة للعرض: أُسندت الفصول للمعلمين وثُبّت بعضها */
    var teacherPlans = [
      { i: 0, classes: [0], locked: true },
      { i: 1, classes: [0, 2], locked: true },
      { i: 2, classes: [0], locked: false },
      { i: 3, classes: [0], locked: false },
      { i: 4, classes: [2], locked: true },
      { i: 5, classes: [3], locked: false }
    ];
    db.users.filter(function (u) { return u.role === 'teacher'; }).forEach(function (t, i) {
      t.username = 'teacher' + (i + 1); t.password = DEFAULT_PASS;
    });
    teacherPlans.forEach(function (p) {
      var t = teachers[p.i];
      t.classIds = p.classes.map(function (ci) { return db.classes[ci].id; });
      t.locked = p.locked;
      if (p.locked) { t.lockedAt = now(); t.lockedBy = deputy.name; }
    });

    /* طلاب غير مسكّنين (بانتظار الإسكان في فصل) — لواجهة وكيل شؤون الطلاب */
    ['عبدالرحمن فهد الحربي', 'ريم سلطان العتيبي', 'خالد ناصر الشهري'].forEach(function (n, i) {
      db.students.push({
        id: 'st-new-' + (i + 1), schoolId: school.id, classId: null, name: n,
        nationalId: nationalId(i + 900), seat: null, guardianPhone: phone(i + 900),
        status: 'active', stage: 'secondary', grade: 'الأول الثانوي', section: i === 1 ? 'ب' : 'أ'
      });
    });
    db.transfers = [];

    /* جدول الحصص + الإسناد */
    db.periods = defaultPeriods().map(function (p) { return Object.assign({ schoolId: school.id }, p); });

    var assign = function (teacher, subject, cls, periods) {
      db.assignments.push({
        id: uid('as'), schoolId: school.id, teacherId: teacher.id, subject: subject, classId: cls.id,
        periods: periods, weekly: periods.length, createdAt: now()
      });
    };
    assign(teachers[0], 'الرياضيات', db.classes[0], [1, 2, 3, 4, 5]);
    assign(teachers[0], 'الرياضيات', db.classes[1], [1, 2, 3]);
    assign(teachers[1], 'الفيزياء', db.classes[0], [2, 4, 6]);
    assign(teachers[1], 'الكيمياء', db.classes[2], [1, 3, 5]);
    assign(teachers[2], 'الكفايات اللغوية', db.classes[0], [3, 5, 7]);
    assign(teachers[3], 'اللغة الإنجليزية', db.classes[0], [1, 4, 6]);
    assign(teachers[4], 'الأحياء', db.classes[2], [2, 4]);
    assign(teachers[5], 'المهارات الرقمية', db.classes[3], [3, 5, 6]);

    /* تحضير سابق مغلق (لأجل التقارير) */
    var y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    var s1 = {
      id: 'ses-1', schoolId: school.id, classId: db.classes[0].id, subject: 'الرياضيات',
      teacherId: teachers[0].id, periodId: 'pd-1', date: y, status: 'closed',
      openedAt: y + 'T07:00:00', closedAt: y + 'T07:45:00',
      records: db.students.filter(function (s) { return s.classId === db.classes[0].id; }).map(function (s, i) {
        return { studentId: s.id, status: i === 3 ? 'absent' : (i === 7 ? 'late' : 'present'), note: '' };
      })
    };
    db.sessions.push(s1);

    /* مخالفات بثلاث حالات */
    var st1 = db.students.find(function (s) { return s.classId === db.classes[0].id; });
    var st2 = db.students.filter(function (s) { return s.classId === db.classes[0].id; })[5];
    db.violations.push({
      id: 'vi-1', schoolId: school.id, number: 'V-2026-0001', studentId: st1.id, classId: db.classes[0].id,
      subject: 'الرياضيات', teacherId: teachers[0].id, periodId: 'pd-1', date: y,
      type: 'إخلال بالنظام الصفي', degree: 'بسيطة',
      description: 'مقاطعة متكررة للشرح بعد تنبيهين.',
      status: 'guidance_pending', createdAt: y + 'T07:20:00',
      guidance: null, action: null, timeline: [{ at: y + 'T07:20:00', by: teachers[0].name, text: 'تسجيل المخالفة من المعلم' }]
    });
    db.violations.push({
      id: 'vi-2', schoolId: school.id, number: 'V-2026-0002', studentId: st2.id, classId: db.classes[0].id,
      subject: 'الفيزياء', teacherId: teachers[1].id, periodId: 'pd-2', date: y,
      type: 'عدم إحضار الأدوات', degree: 'بسيطة', description: 'لم يحضر الكتاب لمدة ثلاثة أيام.',
      status: 'deputy_pending', createdAt: y + 'T08:00:00',
      guidance: { procedure: 'تنبيه شفهي وتوجيه فردي', options: ['تنبيه شفهي', 'إشعار ولي الأمر', 'التعهد الكتابي'], at: y + 'T09:10:00', by: guidance.name },
      action: null,
      timeline: [
        { at: y + 'T08:00:00', by: teachers[1].name, text: 'تسجيل المخالفة من المعلم' },
        { at: y + 'T09:10:00', by: guidance.name, text: 'الرد على الوكيل: تنبيه شفهي وتوجيه فردي' }
      ]
    });

    /* استئذان */
    db.permissions.push({
      id: 'pm-1', schoolId: school.id, number: 'P-2026-0001', studentId: st1.id, classId: db.classes[0].id,
      periodId: 'pd-3', date: new Date().toISOString().slice(0, 10), reason: 'مراجعة طبية في مستشفى الملك فهد',
      requestedBy: guidance.id, status: 'deputy_pending', createdAt: now(), granted: null, exitNo: ''
    });

    /* إدارات التعليم العامة (يختار منها مدير المدرسة في ترويسة التقارير) */
    db.educationDepts = [
      'الإدارة العامة للتعليم بمنطقة الرياض', 'الإدارة العامة للتعليم بمنطقة مكة المكرمة',
      'الإدارة العامة للتعليم بالمنطقة الشرقية', 'الإدارة العامة للتعليم بمنطقة المدينة المنورة',
      'الإدارة العامة للتعليم بمنطقة القصيم', 'الإدارة العامة للتعليم بمنطقة عسير',
      'الإدارة العامة للتعليم بمنطقة تبوك', 'الإدارة العامة للتعليم بمنطقة حائل',
      'الإدارة العامة للتعليم بمنطقة الحدود الشمالية', 'الإدارة العامة للتعليم بمنطقة جازان',
      'الإدارة العامة للتعليم بمنطقة نجران', 'الإدارة العامة للتعليم بمنطقة الباحة',
      'الإدارة العامة للتعليم بمنطقة الجوف', 'الإدارة العامة للتعليم بمحافظة الطائف',
      'الإدارة العامة للتعليم بمحافظة الأحساء', 'الإدارة العامة للتعليم بمنطقة بيشة'
    ];
    /* ترويسة التقارير الرسمية (يضبطها مدير المدرسة) */
    db.letterhead = {
      schoolId: school.id,
      basmala: 'بسم الله الرحمن الرحيم',
      country: 'المملكة العربية السعودية',
      ministry: 'وزارة التعليم',
      educationDept: 'الإدارة العامة للتعليم بمنطقة الرياض',
      schoolLine: school.name,
      ministryLogo: 'assets/img/ministry-logo.png',
      schoolLogo: '',
      showBasmala: true,
      showMinistryLogo: true,
      showSchoolLogo: true,
      footerNote: 'هذا التقرير صادر من نظام تابعني — للتحقق امسح الباركود أو ابحث برقم التقرير في تابعني.'
    };

    /* الفصول الدراسية (يحدّدها مدير المدرسة: بداية ونهاية كل فصل) */
    var cy = new Date().getFullYear();
    db.terms = [
      { id: 'tm-1', schoolId: school.id, name: 'الفصل الدراسي الأول', from: cy + '-08-23', to: cy + '-12-10',
        active: true, createdAt: now() },
      { id: 'tm-2', schoolId: school.id, name: 'الفصل الدراسي الثاني', from: (cy + 1) + '-01-12', to: (cy + 1) + '-05-28',
        active: false, createdAt: now() },
      { id: 'tm-3', schoolId: school.id, name: 'الفصل الدراسي الثالث', from: (cy + 1) + '-06-15', to: (cy + 1) + '-09-05',
        active: false, createdAt: now() }
    ];
    db.settings.activeTermId = 'tm-1';

    /* أماكن المناوبة + توزيع اليوم والغد */
    ['بجوار المقصف', 'ساحة المقصف', 'الدور الأول', 'الدور الثاني', 'الجهة الجنوبية', 'الجهة الشمالية', 'البوابة الرئيسية', 'المصلى']
      .forEach(function (n, i) {
        db.dutyLocations.push({ id: 'dl-' + (i + 1), schoolId: school.id, name: n, note: '', createdAt: now() });
      });
    var d0 = new Date(), d1 = new Date(Date.now() + 864e5), d2 = new Date(Date.now() + 2 * 864e5);
    var iso = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10); };
    var dutySeed = [
      { date: iso(d0), teacher: teachers[0], loc: 0, shift: 'الفسحة', slots: ['break', 'transitions', 'exit'] },
      // fix
      { date: iso(d0), teacher: teachers[1], loc: 6, shift: 'الفسحة', slots: ['break'] },
      { date: iso(d1), teacher: teachers[2], loc: 2, shift: 'الفسحة', slots: ['break', 'transitions'] },
      { date: iso(d1), teacher: teachers[5], loc: 4, shift: 'الفسحة', slots: ['break'] },
      { date: iso(d2), teacher: teachers[3], loc: 3, shift: 'الفسحة', slots: ['break', 'exit'] }
    ];
    dutySeed.forEach(function (x, i) {
      db.duties.push({
        id: 'du-' + (i + 1), schoolId: school.id, date: x.date, teacherId: x.teacher.id,
        locationId: db.dutyLocations[x.loc].id, shift: x.shift, status: 'scheduled',
        slots: x.slots || ['break', 'transitions'],
        createdBy: teachersDeputy.name, createdAt: now(), reminderAt: null, ackAt: null
      });
    });

    /* التطوع والأنشطة */
    db.programs.push(
      { id: 'pr-1', schoolId: school.id, title: 'تنظيم مكتبة المدرسة', hours: 8, seats: 20, from: '2026-10-20', to: '2026-11-05', officerId: volunteer.id, desc: 'ترتيب وتصنيف الكتب وتدريب على نظام الإعارة.' },
      { id: 'pr-2', schoolId: school.id, title: 'حملة تشجير الساحات', hours: 5, seats: 30, from: '2026-10-25', to: '2026-10-27', officerId: volunteer.id, desc: 'زراعة الشتلات وتنظيم مياه الري.' }
    );
    db.programRegs.push({ id: 'preg-1', programId: 'pr-1', studentId: st2.id, status: 'approved', hours: 4, at: now() });

    db.activities.push(
      { id: 'ac-1', schoolId: school.id, title: 'معرض العلوم السنوي', officerId: activity.id, date: '2026-11-12', place: 'المصلى', desc: 'عرض مشاريع الطلاب العلمية وتحكيمها.' },
      { id: 'ac-2', schoolId: school.id, title: 'دوري كرة القدم', officerId: activity.id, date: '2026-10-29', place: 'الملعب', desc: 'دوري داخلي بين الصفوف.' }
    );
    db.activityReqs.push({
      id: 'ar-1', activityId: 'ac-1', studentId: st1.id, classId: db.classes[0].id, teacherId: teachers[0].id,
      periodId: 'pd-4', duration: 45, reason: 'تحضير المجسم قبل التحكيم', status: 'pending', createdAt: now(), note: ''
    });

    /* ============ بيانات تاريخية (20 يومًا دراسيًا) للتحليلات والتقارير ============ */
    (function seedHistory() {
      var seedN = 987654321;
      var rnd = function () { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
      var iso = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10); };
      var chronicAbsent = {}, chronicLate = {};
      db.students.forEach(function (st, i) {
        if (i % 11 === 0) chronicAbsent[st.id] = true;      /* طلاب كثيرو الغياب (لنسبة الحرمان) */
        if (i % 7 === 3) chronicLate[st.id] = true;
      });
      var days = [], d = new Date();
      while (days.length < 42) {
        if (d.getDay() !== 5 && d.getDay() !== 6) days.push(new Date(d));
        d.setDate(d.getDate() - 1);
      }
      days.reverse();
      var todayIso = new Date().toISOString().slice(0, 10);
      var seq = 0;
      days.forEach(function (day) {
        var date = iso(day);
        db.classes.forEach(function (k, ki) {
          /* نترك الفصل الأول بلا بيانات اليوم ليبقى مسار التحضير قابلاً للتجربة */
          if (date === todayIso && ki === 0) return;
          db.assignments.filter(function (a) { return a.classId === k.id; }).slice(0, 2).forEach(function (a, ai) {
            var pIdx = (a.periods && (a.periods[ai] || a.periods[0])) || (ai + 1);
            var pd = db.periods.find(function (p) { return p.index === pIdx; }) || db.periods[0];
            var records = db.students.filter(function (s) { return s.classId === k.id; }).map(function (s) {
              var status = 'present';
              if (chronicAbsent[s.id] && rnd() < 0.55) status = 'absent';
              else if (chronicLate[s.id] && rnd() < 0.5) status = 'late';
              else if (rnd() < 0.04) status = 'absent';
              else if (rnd() < 0.07) status = 'late';
              else if (rnd() < 0.03) status = 'excused';
              return { studentId: s.id, status: status, note: '' };
            });
            seq++;
            db.sessions.push({
              id: 'ses-h' + seq, schoolId: school.id, classId: k.id, subject: a.subject,
              teacherId: a.teacherId, periodId: pd.id, date: date, status: 'closed',
              openedAt: date + 'T' + pd.start + ':00', closedAt: date + 'T' + pd.end + ':00',
              records: records, seen: true, source: 'seed-history'
            });
          });
        });
        /* نشاط المستخدمين: بعض المعلمين متميّزون وبعضهم لم يفعّل تابعني */
        var ratesByIndex = [0.98, 0.92, 0.86, 0.6, 0.32, 0.04];
        db.users.forEach(function (u, ui) {
          var rate = u.role === 'teacher' ? ratesByIndex[ui % ratesByIndex.length] : 0.8;
          if (rnd() < rate) {
            db.activityLog.push({ id: 'lg-h' + (db.activityLog.length + 1), userId: u.id, role: u.role,
              at: date + 'T07:' + String(ui % 6) + String((ui * 7) % 10) + ':00', type: 'login', meta: {} });
          }
        });
        /* حضور وانصراف المعلمين */
        db.users.filter(function (u) { return u.role === 'teacher'; }).forEach(function (t, ti) {
          if (rnd() < 0.88) {
            db.checkins.push({
              id: 'ck-h' + (db.checkins.length + 1), teacherId: t.id, date: date,
              checkIn: date + 'T06:' + String(40 + (ti % 15)) + ':00',
              checkOut: date + 'T13:' + String(5 + (ti % 25)) + ':00', source: 'platform'
            });
          }
        });
      });
      /* مخالفة تاريخية إضافية للتقارير الشهرية */
      var stx = db.students[3];
      db.violations.push({
        id: 'vi-3', schoolId: school.id, number: 'V-2026-0003', studentId: stx.id, classId: stx.classId,
        subject: 'الكفايات اللغوية', teacherId: teachers[2].id, periodId: 'pd-3',
        date: days[Math.max(0, days.length - 4)] ? iso(days[Math.max(0, days.length - 4)]) : iso(new Date()),
        type: 'التأخر عن الحصة', degree: 'بسيطة', description: 'تأخر متكرر عن الحصة الأولى.',
        status: 'closed', createdAt: now(),
        guidance: { procedure: 'تنبيه شفهي وإشعار ولي الأمر', options: ['إشعار ولي الأمر'], at: now(), by: guidance.name },
        action: { deduct: 0, note: 'تنبيه وتعهد', label: 'تنبيه شفهي', at: now(), by: deputy.name },
        closedAt: now(),
        timeline: [{ at: now(), by: teachers[2].name, text: 'تسجيل المخالفة' }, { at: now(), by: guidance.name, text: 'رد التوجيه' }, { at: now(), by: deputy.name, text: 'إغلاق مع تنبيه' }]
      });
    })();

    /* المالية والدعم — بيانات عرض جاهزة للتقارير */
    (function seedFinanceDemo() {
      var day = function (n) { return new Date(Date.now() - n * 864e5).toISOString(); };
      var yr = new Date().getFullYear();
      db.invoices = [
        { id: 'inv-demo-2', no: 'TBN-' + yr + '-0002', at: day(20), schoolId: school.id, schoolName: school.name,
          schoolCity: school.city, plan: 'pro', kind: 'annual', years: 1, amount: 1500,
          seller: 'تابعني للخدمات الذكية', by: accountant.name, paidUntil: school.license.paidUntil,
          note: 'تحويل بنكي — سند مختوم بختم المدرسة', vat: false },
        { id: 'inv-demo-1', no: 'TBN-' + yr + '-0001', at: day(24), schoolId: school.id, schoolName: school.name,
          schoolCity: school.city, plan: 'pro', kind: 'setup', years: 1, amount: 1000,
          seller: 'تابعني للخدمات الذكية', by: accountant.name, paidUntil: '', note: 'رسم التأسيس والتهيئة', vat: false }
      ];
      db.expenses = [
        { id: 'exp-1', at: day(22).slice(0, 10), category: 'servers', title: 'استضافة السيرفرات — شهري', amount: 450, vendor: 'مزوّد الاستضافة', note: '', by: accountant.name },
        { id: 'exp-2', at: day(18).slice(0, 10), category: 'domain', title: 'تجديد الدومين والشهادة الأمنية', amount: 320, vendor: 'مسجّل النطاقات', note: 'tabaani.sa', by: accountant.name },
        { id: 'exp-3', at: day(12).slice(0, 10), category: 'maintenance', title: 'صيانة تابعني ودورة تحسينات', amount: 1200, vendor: 'فريق التطوير', note: '', by: accountant.name },
        { id: 'exp-4', at: day(6).slice(0, 10), category: 'operations', title: 'تشغيل ومتابعة يومية', amount: 500, vendor: '—', note: '', by: accountant.name }
      ];
      db.tickets = [{
        id: 'tkt-demo-1', no: 'TKT-' + yr + '-0001', at: day(2), updatedAt: day(2),
        status: 'progress', category: 'attendance', priority: 'normal',
        subject: 'ما أقدر أسكّر التحضير', schoolId: school.id, byUser: principal.id,
        byName: principal.name, byRole: 'principal', phone: principal.phone || '',
        viaBot: true, agentId: 'fares', assignee: 'support', lastFrom: 'agent',
        messages: [
          { at: day(2), from: 'bot', name: 'فارس الحربي', text: 'هلا والله ومسهلا! أنا فارس من الدعم الفني في تابعني — وش عندك؟' },
          { at: day(2), from: 'user', name: principal.name, text: 'ما أقدر أسكّر التحضير، الزر مطفّي' },
          { at: day(2), from: 'bot', name: 'فارس الحربي', text: 'أبشر بسعدك! ما يمديك تسكّر الحصة إلا بعد نصّ وقتها — ولو مازال مطفّي فمعناه أن وقت الحصة بالجدول ما بدأ بعد. تأكد من وقت الحصة في الجدول، وإذا فيه لبس كلّم وكيل شؤون الطلاب يضبطه وحنا معك.' }
        ]
      }];
    })();

    return db;
  }

  /* ------------------------------------------------------------------ IO */
  var db = null;
  /* قاعدة بيانات فارغة تمامًا: تُستخدم عند أول تشغيل قبل التهيئة */
  function emptyDb() {
    return {
      meta: { version: 1, createdAt: now(), needsSetup: true, empty: true },
      users: [], schools: [], classes: [], students: [], assignments: [], transfers: [], periods: [],
      sessions: [], violations: [], permissions: [], programs: [], programRegs: [], activities: [],
      activityReqs: [], dutyLocations: [], duties: [], terms: [], activityLog: [], checkins: [],
      faceScans: [], reports: [], telegram: [], audit: [], notif: [], subjects: [], exits: [],
      entryPermits: [], messages: [], paymentRequests: [], invoices: [], expenses: [], tickets: [],
      letterhead: null, settings: { hijri: true, ministry: 'المملكة العربية السعودية — وزارة التعليم',
        mobileNotify: false, deprivationPct: 25, deprivationBySubject: {}, activeTermId: null }
    };
  }

  /* يجعل أي قاعدة بيانات (قديمة أو ناقصة) سليمة البنية: يضيف المجموعات الناقصة بلا مساس بالبيانات */
  var COLLECTIONS = ['users', 'schools', 'classes', 'students', 'assignments', 'transfers', 'periods',
    'sessions', 'violations', 'permissions', 'programs', 'programRegs', 'activities', 'activityReqs',
    'dutyLocations', 'duties', 'terms', 'activityLog', 'checkins', 'faceScans', 'reports', 'telegram',
    'audit', 'notif', 'subjects', 'exits', 'entryPermits', 'messages',
    'paymentRequests', 'invoices', 'expenses', 'tickets'];
  function normalizeDb(d) {
    if (!d || typeof d !== 'object') return emptyDb();
    if (!d.meta) d.meta = { version: 1, createdAt: now() };
    if (!d.settings || typeof d.settings !== 'object') d.settings = { hijri: true };
    COLLECTIONS.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    if (!Array.isArray(d.schools)) d.schools = [];
    return d;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : emptyDb();     /* بلا بيانات تجريبية إلا إذا اختارها المستخدم */
    } catch (e) { db = emptyDb(); }
    db = normalizeDb(db);
    if (!db || !db.schools) db = seed();
    ensureSuper(db);
    return db;
  }
  /* لا تُخزَّن أي كلمة مرور في الكود: إن لم يوجد مشرف عام ⇒ تُطلب التهيئة الأولى */
  function ensureSuper(d) {
    try {
      if (!d || !d.users) return;
      var hasSuper = d.users.some(function (u) { return u.role === 'super' && u.status !== 'deleted'; });
      if (!d.meta) d.meta = { version: 1, createdAt: now() };
      if (!hasSuper) { d.meta.needsSetup = true; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
      else if (d.meta.needsSetup) d.meta.needsSetup = false;
    } catch (e) {}
  }

  function timeOf(d) {
    try { return new Date(d).toTimeString().slice(0, 5); } catch (e) { return ''; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    (global.dispatchEvent) && global.dispatchEvent(new CustomEvent('store:changed'));
  }
  function reset() {
    /* إعادة بيانات العرض: تُبقي حساب المشرف العام الحالي ولا تُنشئ أي حساب أدمن معروف */
    var supers = ((db && db.users) || []).filter(function (u) { return u.role === 'super'; });
    db = seed();
    if (supers.length) {
      db.users = supers.concat(db.users.filter(function (u) { return u.role !== 'super'; }));
      db.meta = Object.assign({}, db.meta, { needsSetup: false, setupAt: (db.meta && db.meta.setupAt) || now() });
    }
    save(); }

  /* يبدأ فارغًا تمامًا: بلا مدرسة ولا طالب ولا معلم —
     تبقى فقط حسابات المشرف العام (وحسابات المالك) ليدخل ويؤسّس مدرسته بنفسه. */
  function resetEmpty() {
    var d = seed();
    var supers = (d.users || []).filter(function (u) { return u.role === 'super'; });
    ['schools', 'classes', 'students', 'assignments', 'transfers', 'periods', 'sessions',
     'violations', 'permissions', 'programs', 'programRegs', 'activities', 'activityReqs',
     'dutyLocations', 'duties', 'terms', 'activityLog', 'checkins', 'faceScans',
     'reports', 'telegram', 'audit', 'notif', 'subjects', 'exits', 'entryPermits',
     'messages'].forEach(function (k) { d[k] = []; });
    d.users = supers;
    d.letterhead = null;
    d.settings = Object.assign({}, d.settings, { deprivationBySubject: {}, activeTermId: null });
    d.meta = { version: 1, createdAt: now(), empty: true };
    db = d; save();
    return db;
  }

  /* -------------------------------------------------------------- المساعدات */
  var store = {
    get db() { return db || load(); },
    load: load, save: save, resetEmptyAll: function () { return resetEmpty(); },
    resetDem: function () { return reset(); },
    reset: reset,
    uid: uid, now: now,
    /* ------------------------------ رمز التحقق (OTP) للإجراءات الخطرة ------------------------------ */
    otpCurrent: function () { return (db.settings && db.settings.otp) || null; },
    /** يرسل رمزًا من ٦ أرقام على تلقرام (أو البريد عبر الوسيط) — صالح ١٠ دقائق */
    otpSend: function (purpose, label, channel) {
      var code = String(Math.floor(100000 + Math.random() * 900000));
      var rec = { code: code, purpose: purpose || 'reset', at: now(),
        expires: new Date(Date.now() + 10 * 60000).toISOString(), attempts: 0, channel: channel || 'telegram', delivered: false, sentTo: '', error: '' };
      if (!db.settings) db.settings = {};
      db.settings.otp = rec;
      var text = '🔐 رمز تأكيد لتابعني\nالرمز: ' + code + '\nصالح ١٠ دقائق — لا تشاركه مع أحد.\n' + (label || '');
      var c = store.telegramConfig();
      if (channel === 'email') {
        var em = store.ownerEmail();
        if (!em) { save(); return Promise.resolve({ ok: false, error: 'لا يوجد بريد للمشرف العام' }); }
        if (!(c.mode === 'relay' && c.relayUrl)) { save(); return Promise.resolve({ ok: false, error: 'البريد يحتاج وسيطًا مُفعّلًا (Apps Script) — استخدم تلقرام الآن' }); }
        return fetch(c.relayUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ key: c.relayKey, type: 'email', to: em, subject: 'رمز تأكيد — تابعني', text: text.replace('<br>', '\n') }) })
          .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
          .then(function (j) { rec.delivered = !!j.ok; rec.sentTo = em; rec.error = j.description || j.error || ''; save(); return { ok: !!j.ok, channel: 'email', error: rec.error }; })
          .catch(function (e) { rec.error = String((e && e.message) || e); save(); return { ok: false, channel: 'email', error: rec.error }; });
      }
      if (!store.telegramReady()) { save(); return Promise.resolve({ ok: false, error: 'تلقرام غير مُفعّل — فعّل الإرسال أو استخدم البديل' }); }
      return store.telegramSend(text, store.session.schoolId).then(function (r) {
        rec.delivered = !!r.ok; rec.sentTo = store.telegramFor(store.session.schoolId).chatId || ''; rec.error = r.ok ? '' : (r.detail || '');
        save();
        return { ok: !!r.ok, channel: 'telegram', error: rec.error };
      });
    },
    ownerEmail: function () {
      var o = store.list('users').filter(function (u) { return u.role === 'super' && u.email; })[0];
      return o ? o.email : '';
    },
    /** يتحقق من الرمز: مرة واحدة · ٥ محاولات كحد أقصى · ١٠ دقائق */
    otpVerify: function (code) {
      var rec = (db.settings && db.settings.otp) || null;
      if (!rec) return { ok: false, error: 'لا يوجد رمز مُرسل — اطلب رمزًا جديدًا' };
      if (new Date(rec.expires).getTime() < Date.now()) return { ok: false, error: 'انتهت صلاحية الرمز — اطلب رمزًا جديدًا' };
      rec.attempts = (rec.attempts || 0) + 1;
      if (rec.attempts > 5) return { ok: false, error: 'محاولات كثيرة — اطلب رمزًا جديدًا' };
      if (String(code || '').trim() !== String(rec.code)) { save(); return { ok: false, error: 'الرمز غير صحيح (' + rec.attempts + '/5)' }; }
      delete db.settings.otp; save();
      return { ok: true };
    },
    otpClear: function () { if (db.settings) delete db.settings.otp; save(); },

    /* ===================== التحقق بمرحلتين عند الدخول =====================
       المرحلة الأولى: اسم المستخدم وكلمة المرور.
       المرحلة الثانية: رمز من ٦ أرقام يُرسل إلى **المحادثة الشخصية** للمستخدم على تلقرام.
       يخضع له كل موظف ربط محادثته الشخصية (ولا يخضع الطلاب).
       ==================================================================== */
    twoFactorConfig: function () {
      var t = (db.settings && db.settings.twoFactor) || {};
      var n = function (v, d) { var x = parseInt(v, 10); return (x && x > 0) ? x : d; };
      return {
        enabled: t.enabled !== false,     /* مفعّل */
        enforce: t.enforce !== false,     /* إلزام كل الموظفين افتراضيًا (كل الحسابات عدا الطلاب) */
        ttl: n(t.ttl, 5),                 /* دقائق صلاحية الرمز */
        attempts: n(t.attempts, 5)        /* أقصى عدد محاولات */
      };
    },
    saveTwoFactorConfig: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.twoFactor = Object.assign({}, store.twoFactorConfig(), patch || {});
      save(); return store.twoFactorConfig();
    },
    /** هل يخضع هذا المستخدم للتحقق بمرحلتين؟ وما حالته؟ */
    twoFactorFor: function (userId) {
      var u = (userId && typeof userId === 'object') ? userId : store.user(userId);
      if (!u) return { applies: false, blocked: false, reason: 'مستخدم غير معروف' };
      if (u.role === 'student') return { applies: false, blocked: false, reason: 'الطلاب لا يخضعون للتحقق بمرحلتين' };
      if (u.schoolId && !store.isPro(u.schoolId)) {
        return { applies: false, blocked: false, pro: false, reason: 'التحقق بمرحلتين يُرسل الرمز عبر تلقرام — متاح في باقة «تابعني برو»' };
      }
      var c = store.twoFactorConfig();
      if (!c.enabled) return { applies: false, blocked: false, reason: 'التحقق بمرحلتين مُعطَّل من الإعدادات' };
      var chat = String(u.telegramChatId || '').trim();
      if (chat) return { applies: true, blocked: false, chat: chat };
      if (c.enforce) {
        /* بوتقة أمان: لا يُحجب المشرف العام أبدًا — وإلا تعذّر إصلاح تابعني */
        if (u.role === 'super' || u.owner) {
          return { applies: false, blocked: false, reason: 'حساب المشرف العام — لا يُحجب (مسار الاسترجاع)' };
        }
        return { applies: false, blocked: true,
          reason: 'حسابك يتطلّب تحقّقًا بمرحلتين، ولم تُربط محادثة تلقرام خاصة بعد — راجع مدير المدرسة.' };
      }
      return { applies: false, blocked: false, reason: 'لا توجد محادثة تلقرام شخصية مربوطة بهذا الحساب' };
    },
    loginOtpPending: function () { return (db.settings && db.settings.login2fa) || null; },
    loginOtpClear: function () { if (db.settings) delete db.settings.login2fa; save(); },
    /** يُنشئ رمز دخول ويرسله إلى المحادثة الشخصية للمستخدم (+ قيد في سجل تلقرام) */
    loginOtpSend: function (userId) {
      var u = store.user(userId);
      if (!u) return Promise.resolve({ ok: false, error: 'مستخدم غير معروف' });
      var chat = String(u.telegramChatId || '').trim();
      if (!chat) return Promise.resolve({ ok: false, error: 'لا توجد محادثة تلقرام شخصية مربوطة بهذا الحساب' });
      var c = store.twoFactorConfig();
      var code = String(Math.floor(100000 + Math.random() * 900000));
      var text = '\uD83D\uDD10 رمز الدخول — تابعني\n' +
        'الرمز: ' + code + '\n' +
        'صالح ' + c.ttl + ' دقائق — لا تشاركه مع أحد.\n' +
        (u.name ? 'الحساب: ' + u.name + ' (' + store.roleLabel(u.role) + ')' : '');
      var rec = {
        userId: u.id, code: code, at: now(),
        expires: new Date(Date.now() + c.ttl * 60000).toISOString(),
        attempts: 0, max: c.attempts, channel: 'telegram',
        sentTo: chat, delivered: false, error: ''
      };
      if (!db.settings) db.settings = {};
      db.settings.login2fa = rec;
      var log = {
        id: uid('tg'), to: u.role, toName: u.name, chat: chat, private: true,
        schoolId: u.schoolId || store.session.schoolId, text: text, at: now(),
        status: 'queued', via: 'queued', error: ''
      };
      db.telegram.unshift(log);
      if (db.telegram.length > 200) db.telegram.length = 200;
      save();
      /* الإرسال الفعلي غير مُفعّل ⇒ يُعرض الرمز للمعاينة (كما في تدفقات النموذج الأخرى) */
      if (!store.telegramSendable()) {
        rec.error = 'الإرسال الفعلي إلى تلقرام غير مُفعّل (وضع المحاكاة)';
        log.error = rec.error;
        save();
        return Promise.resolve({ ok: false, error: rec.error, sentTo: chat, simCode: code });
      }
      return store.telegramSendTo(chat, text).then(function (r) {
        rec.delivered = !!r.ok;
        rec.error = r.ok ? '' : (r.detail || '');
        log.status = r.ok ? 'sent' : 'failed';
        log.via = store.telegramConfig().mode;
        log.error = rec.error; log.sentAt = now();
        save();
        return { ok: !!r.ok, error: rec.error, sentTo: chat, simCode: r.ok ? null : code };
      });
    },
    /** يتحقق من رمز الدخول: يخصّ نفس المستخدم · ساري · ضمن المحاولات · يُستهلك مرة واحدة */
    loginOtpVerify: function (userId, code) {
      var rec = (db.settings && db.settings.login2fa) || null;
      if (!rec) return { ok: false, error: 'لا يوجد رمز مُرسل — اطلب رمزًا جديدًا' };
      if (rec.userId !== userId) return { ok: false, error: 'الرمز لا يخصّ هذا الحساب — اطلب رمزًا جديدًا' };
      if (new Date(rec.expires).getTime() < Date.now()) return { ok: false, error: 'انتهت صلاحية الرمز — اطلب رمزًا جديدًا' };
      rec.attempts = (rec.attempts || 0) + 1;
      if (rec.attempts > (rec.max || 5)) return { ok: false, error: 'محاولات كثيرة — اطلب رمزًا جديدًا' };
      if (String(code || '').trim() !== String(rec.code)) {
        save();
        return { ok: false, error: 'الرمز غير صحيح (' + rec.attempts + '/' + (rec.max || 5) + ')' };
      }
      store.loginOtpClear();
      return { ok: true };
    },

    /** قيمة آمنة للعرض في الرسائل: لا تُظهر undefined أبدًا */
    safe: function (x, dflt) {
      if (x === undefined || x === null || x === '' || (typeof x === 'number' && isNaN(x))) return dflt === undefined ? '—' : dflt;
      return String(x);
    },

    /* ------------------------- التهيئة الأولى (بلا أي كلمة مرور في الكود) ------------------------- */
    needsSetup: function () { return !!(store.db.meta && store.db.meta.needsSetup); },
    /** إنشاء حساب المشرف العام: demo=true يعني الإبقاء على البيانات التجريبية */
    setupOwner: function (data) {
      data = data || {};
      if (!data.username || !data.password) return { ok: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' };
      var uname = String(data.username).trim(), email = String(data.email || '').trim();
      if (uname.length < 3) return { ok: false, error: 'اسم المستخدم قصير (٣ أحرف على الأقل)' };
      if (String(data.password).length < 8) return { ok: false, error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل' };
      if (store.list('users').some(function (u) { return (u.username || '').toLowerCase() === uname.toLowerCase(); })) {
        return { ok: false, error: 'اسم المستخدم مستخدم من قبل' };
      }
      if (email && store.list('users').some(function (u) { return (u.email || '').toLowerCase() === email.toLowerCase(); })) {
        return { ok: false, error: 'البريد مستخدم من قبل' };
      }
      /* بيانات العرض: يحتفظ بها كما هي، ومعها حساب المشرف العام التجريبي (من الحزمة) إن اختاره المستخدم */
      if (data.demo) {
        db = seed();
        if (!data.withDemoAdmin) db.users = db.users.filter(function (u) { return u.role !== 'super'; });
      }
      else { db = emptyDb(); }                          /* مدرسة حقيقية: بلا بيانات تجريبية ولا حسابات */
      var u = store.insert('users', {
        id: 'u-super-owner', schoolId: null, role: 'super', owner: true,
        name: String(data.name || 'مشرف تابعني').trim(), username: uname, password: String(data.password),
        email: email, phone: '', telegram: '', status: 'active', createdAt: now(), canLogin: true, mustChange: false
      });
      store.db.meta = Object.assign({}, store.db.meta, {
        needsSetup: false, setupAt: now(), demo: !!data.demo,
        setupPlan: { plan: data.plan === 'pro' ? 'pro' : 'classic', setupPaid: data.setupPaid !== false }
      });
      save();
      /* في المدرسة الحقيقية: الوحدة الأساسية تعتمد على وجود مدرسة */
      if (!data.demo) store._pendingSetup = true;
      return { ok: true, user: u };
    },

    /* ------------------------------ جنس المدرسة والتأنيث ------------------------------ */
    genders: [{ id: 'boys', name: 'طلاب (بنين)' }, { id: 'girls', name: 'طالبات (بنات)' }],
    /** جنس المدرسة الحالية */
    gender: function (schoolId) {
      var sc = store.school(schoolId || store.session.schoolId);
      return (sc && sc.gender) || 'boys';
    },
    isGirls: function (schoolId) { return store.gender(schoolId) === 'girls'; },
    /** مسمّى الدور بحسب جنس المدرسة */
    roleLabel: function (roleId, schoolId) {
      var r = ROLES.find(function (x) { return x.id === roleId; });
      if (!r) return roleId;
      return store.isGirls(schoolId) ? (r.nameF || r.name) : r.name;
    },
    /** كلمة «طالب/طلاب» بحسب الجنس */
    studentWord: function (plural) {
      var g = store.isGirls();
      if (plural) return g ? 'الطالبات' : 'الطلاب';
      return g ? 'طالبة' : 'طالب';
    },
    /** تأنيث نص كامل (يُستخدم على النصوص الظاهرة) */
    gtext: function (text) {
      var out = String(text == null ? '' : text);
      if (!store.isGirls()) return out;
      FEM_WORDS.forEach(function (pair) {
        out = out.replace(new RegExp('(^|[^\u0621-\u064A]|[وفبلك])' + pair[0] + '(?![\u0621-\u064A])', 'g'),
          function (m, p1) { return p1 + pair[1]; });
      });
      /* جمع المذكر السالم المعرّف: المتميزون → المتميزات · الغائبون → الغائبات · المعلمون → المعلمات */
      out = out.replace(/(ال[\u0621-\u064A]{2,}?)ون(?![\u0621-\u064A])/g, '$1ات');
      out = out.replace(/(ال[\u0621-\u064A]{2,}?)ين(?![\u0621-\u064A])/g, '$1ات');
      return out;
    },
    /** يطبّق التأنيث على شجرة عناصر */
    genderizeDom: function (root) {
      if (!root || !store.isGirls()) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        var t = n.nodeValue;
        if (!t || !/[\u0621-\u064A]/.test(t)) return;
        var g = store.gtext(t);
        if (g !== t) n.nodeValue = g;
      });
    },
    setSchoolGender: function (schoolId, gender) {
      var sc = store.school(schoolId);
      if (!sc) return { ok: false, error: 'المدرسة غير موجودة' };
      sc.gender = gender === 'girls' ? 'girls' : 'boys';
      save();
      store.notify({ kind: 'school', ref: sc.id, title: 'تحديث جنس المدرسة', body: sc.name + ' — ' + (sc.gender === 'girls' ? 'طالبات' : 'طلاب'), to: ['super', 'principal'] });
      return { ok: true, school: sc };
    },

    /* قوائم مرجعية */
    regions: REGIONS, stages: STAGES, roles: ROLES, grades: GRADES,
    citiesOf: function (regionId) { var r = REGIONS.find(function (x) { return x.id === regionId; }); return r ? r.cities : []; },
    subjectsFor: function (stages) {
      var base = (stages || []).reduce(function (acc, s) { return acc.concat(SUBJECTS[s] || []); }, []);
      var custom = (stages || []).reduce(function (acc, s) {
        return acc.concat((store.db.subjects || []).filter(function (x) { return x.stage === s; }).map(function (x) { return x.name; }));
      }, []);
      var out = [];
      base.concat(custom).forEach(function (n) { if (n && out.indexOf(n) < 0) out.push(n); });
      return out;
    },
    /* ------------------------- المواد الدراسية (يضيفها مدير المدرسة) ------------------------- */
    stageNames: { kg: 'رياض الأطفال', primary: 'المرحلة الابتدائية', middle: 'المرحلة المتوسطة', secondary: 'المرحلة الثانوية' },
    stageName: function (st) { return store.stageNames[st] || st || ''; },
    defaultSubjects: function (stage) { return (SUBJECTS[stage] || []).slice(); },
    customSubjects: function (stage) {
      return (store.db.subjects || []).filter(function (x) { return !stage || x.stage === stage; });
    },
    addSubject: function (data) {
      var d = data || {};
      var name = String(d.name || '').trim();
      var stages = [].concat(d.stages || d.stage || []).filter(Boolean);
      if (!name) return { ok: false, error: 'اكتب اسم المادة' };
      if (!stages.length) return { ok: false, error: 'اختر المرحلة' };
      var school = store.school();
      var had = [];
      stages.forEach(function (st) {
        var exists = store.defaultSubjects(st).indexOf(name) >= 0 ||
          (store.db.subjects || []).some(function (x) { return x.stage === st && x.name === name; });
        if (exists) { had.push(store.stageName(st)); return; }
        store.db.subjects.push({
          id: 'sub-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          schoolId: school ? school.id : null, stage: st, name: name, custom: true, createdAt: now()
        });
      });
      if (had.length === stages.length) return { ok: false, error: 'المادة موجودة مسبقًا في: ' + had.join('، ') };
      save();
      store.notify({ kind: 'subjects', title: 'إضافة مادة دراسية', body: name, to: ['deputy', 'principal'] });
      return { ok: true, added: stages.length - had.length, skipped: had };
    },
    removeSubject: function (id) {
      var before = (store.db.subjects || []).length;
      store.db.subjects = (store.db.subjects || []).filter(function (x) { return x.id !== id; });
      if (store.db.subjects.length === before) return { ok: false, error: 'المادة غير موجودة' };
      save();
      return { ok: true };
    },
    stagesOf: function (schoolId) { var s = store.school(schoolId); return (s && s.stages) || []; },
    stageName: function (id) { var s = STAGES.find(function (x) { return x.id === id; }); return s ? s.name : id; },

    /* CRUD عام */
    list: function (entity, filter) {
      var rows = (store.db[entity] || []).slice();
      if (filter) rows = rows.filter(function (r) {
        return Object.keys(filter).every(function (k) { return r[k] === filter[k]; });
      });
      return rows;
    },
    find: function (entity, id) { return store.list(entity).find(function (r) { return r.id === id; }) || null; },
    insert: function (entity, row) {
      if (!db[entity]) db[entity] = [];
      row.id = row.id || uid(entity.slice(0, 3));
      row.createdAt = row.createdAt || now();
      db[entity].push(row); save(); return row;
    },
    update: function (entity, id, patch) {
      var r = store.find(entity, id); if (!r) return null;
      Object.assign(r, patch); save(); return r;
    },
    remove: function (entity, id) {
      var i = (db[entity] || []).findIndex(function (r) { return r.id === id; });
      if (i > -1) { db[entity].splice(i, 1); save(); }
    },

    /* وصول سريع */
    school: function (id) { return store.find('schools', id) || store.db.schools[0]; },
    user: function (id) { return store.find('users', id); },
    usersByRole: function (role, schoolId) { return store.list('users', { role: role, schoolId: schoolId || store.session.schoolId }); },
    klass: function (id) { return store.find('classes', id); },
    student: function (id) { return store.find('students', id); },
    studentsOf: function (classId) { return store.list('students', { classId: classId }); },
    period: function (id) { return store.find('periods', id); },
    assignmentsOf: function (teacherId) { return store.list('assignments', { teacherId: teacherId }); },

    /* ------------------------------------------------------------ الجلسة */
    session: { userId: null, role: null, schoolId: null, name: '' },
    /** حسابات النموذج: user.id للطالب = معرّف ملف الطالب (تبسيط للبروتوتايب) */
    login: function (userId) {
      var u = store.user(userId); if (!u) return null;
      store.session = { userId: u.id, role: u.role, schoolId: u.schoolId, name: u.name };
      try { sessionStorage.setItem('tabaani-session', JSON.stringify(store.session)); } catch (e) {}
      store.log('login', { role: u.role });
      if (u.role === 'teacher') store.checkIn(u.id);      /* أول دخول في اليوم = تسجيل حضور */
      return u;
    },
    restore: function () {
      try {
        var raw = sessionStorage.getItem('tabaani-session');
        if (raw) { store.session = JSON.parse(raw); return store.user(store.session.userId); }
      } catch (e) {}
      return null;
    },
    /** مصادقة باسم المستخدم (أو البريد) وكلمة المرور */
    authenticate: function (username, password) {
      var u = String(username || '').trim().toLowerCase();
      var p = String(password || '');
      if (!u || !p) return { ok: false, error: 'أدخل اسم المستخدم وكلمة المرور' };
      var user = store.list('users').find(function (x) {
        return (x.username || '').toLowerCase() === u || (x.email || '').toLowerCase() === u;
      });
      if (!user) return { ok: false, error: 'اسم المستخدم غير موجود' };
      if (user.status === 'pending') return { ok: false, error: 'حسابك بانتظار اعتماد مدير المدرسة' };
      if (user.status === 'suspended' || user.status === 'disabled' || user.canLogin === false) {
        return { ok: false, error: 'الحساب موقوف — راجع مدير المدرسة' };
      }
      /* بوابة الترخيص: قرار المشرف العام يوقف دخول المدرسة كلها (عدا المشرف العام نفسه) */
      if (user.schoolId) {
        var lic = store.licenseState(user.schoolId);
        if (lic && lic.blocked && user.role !== 'super') {
          return { ok: false, error: lic.reason === 'fees'
            ? 'دخول المدرسة موقوف — الاشتراك السنوي غير مسدَّد. تواصل مع إدارة تابعني.'
            : 'دخول المدرسة موقوف من إدارة تابعني — راجع مدير المدرسة.' };
        }
      }
      if (user.password !== p) return { ok: false, error: 'كلمة المرور غير صحيحة' };
      return { ok: true, user: user };
    },
    /** الحسابات المتاحة للعرض في شاشة الدخول */
    demoAccounts: function () {
      return store.list('users').filter(function (u) { return u.canLogin !== false && u.username; })
        .map(function (u) {
          var r = ROLES.find(function (x) { return x.id === u.role; }) || {};
          return { username: u.username, password: u.password, role: u.role, roleName: r.name || u.role, name: u.name };
        })
        .sort(function (a, b) { return a.role.localeCompare(b.role) || a.username.localeCompare(b.username); });
    },
    /* ===================== الحسابات: تسجيل جديد واستعادة كلمة المرور ===================== */

    /** تحقق من قوة كلمة المرور */
    passwordIssues: function (pw) {
      var issues = [];
      if (!pw || pw.length < 8) issues.push('٨ أحرف على الأقل');
      if (!/[0-9]/.test(pw || '')) issues.push('رقم واحد على الأقل');
      if (!/[A-Za-z\u0600-\u06FF]/.test(pw || '')) issues.push('حرف واحد على الأقل');
      return issues;
    },
    usernameTaken: function (username) {
      var u = String(username || '').trim().toLowerCase();
      return store.list('users').some(function (x) { return (x.username || '').toLowerCase() === u; });
    },
    emailTaken: function (email) {
      var e = String(email || '').trim().toLowerCase();
      return store.list('users').some(function (x) { return (x.email || '').toLowerCase() === e; });
    },

    /** الأدوار المسموح لها بالتسجيل الذاتي */
    selfRegisterRoles: function () {
      return [
        { id: 'student', name: 'طالب', needsApproval: false },
        { id: 'teacher', name: 'معلم', needsApproval: true },
        { id: 'guidance', name: 'موجّه التوجيه والإرشاد', needsApproval: true },
        { id: 'absence_monitor', name: 'مراقب الغياب', needsApproval: true }
      ];
    },

    /**
     * تسجيل حساب جديد. الأدوار الإدارية تحتاج اعتماد مدير المدرسة (status: pending)
     * والطالب يُفعّل مباشرة (status: active).
     */
    registerAccount: function (data) {
      var d = data || {};
      var uname = String(d.username || '').trim().toLowerCase();
      var email = String(d.email || '').trim().toLowerCase();
      if (!String(d.name || '').trim()) return { ok: false, error: 'الاسم الكامل مطلوب' };
      if (!/^[a-z0-9._-]{4,}$/.test(uname)) return { ok: false, error: 'اسم المستخدم: ٤ أحرف إنجليزية على الأقل (حروف/أرقام/._-)' };
      if (store.usernameTaken(uname)) return { ok: false, error: 'اسم المستخدم محجوز — اختر غيره' };
      if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'البريد الإلكتروني غير صحيح' };
      if (store.emailTaken(email)) return { ok: false, error: 'البريد الإلكتروني مسجّل مسبقًا' };
      var issues = store.passwordIssues(d.password);
      if (issues.length) return { ok: false, error: 'كلمة المرور ضعيفة: تحتاج ' + issues.join(' + ') };
      if (d.password !== d.password2) return { ok: false, error: 'كلمتا المرور غير متطابقتين' };
      var role = (store.selfRegisterRoles().find(function (r) { return r.id === d.role; }) || {}).id;
      if (!role) return { ok: false, error: 'اختر الدور' };
      if (!d.schoolId) return { ok: false, error: 'اختر المدرسة' };
      var needsApproval = (store.selfRegisterRoles().find(function (r) { return r.id === role; }) || {}).needsApproval;
      var u = store.insert('users', {
        schoolId: d.schoolId, role: role, name: String(d.name).trim(), username: uname, email: email,
        phone: d.phone || '', password: d.password, status: needsApproval ? 'pending' : 'active',
        canLogin: !needsApproval, selfRegistered: true, createdAt: now(), telegram: d.phone || ''
      });
      if (role === 'student') {
        var st = store.list('students').find(function (x) { return x.status === 'active' && !store.list('users').some(function (uu) { return uu.id === x.id; }); });
        if (st) { st.name = u.name; }
      }
      store.notify({
        kind: 'account', ref: u.id,
        title: (needsApproval ? 'طلب حساب جديد بانتظار الاعتماد: ' : 'تسجيل حساب جديد: ') + u.name,
        body: (store.selfRegisterRoles().find(function (r) { return r.id === role; }) || {}).name + ' — ' + uname,
        to: ['principal', 'deputy']
      });
      if (needsApproval) {
        store.tg({ to: 'principal', text: '🆕 طلب حساب جديد بانتظار اعتمادك\n' + u.name + ' — ' + (role === 'teacher' ? 'معلم' : role) + '\nاسم المستخدم: ' + uname });
      }
      return { ok: true, user: u, needsApproval: !!needsApproval };
    },

    /** اعتماد حسابات الانتظار (للمدير) */
    approveAccount: function (userId) {
      var u = store.user(userId); if (!u) return null;
      u.status = 'active'; u.canLogin = true; u.approvedAt = now(); u.approvedBy = store.session.name || 'مدير المدرسة';
      save();
      store.notify({ kind: 'account', ref: u.id, title: 'اعتُمد حساب ' + u.name, body: u.username, to: ['principal'] });
      return u;
    },

    /* ------------------------------ استعادة كلمة المرور ------------------------------ */
    findAccount: function (idOrEmail) {
      var v = String(idOrEmail || '').trim().toLowerCase();
      return store.list('users').find(function (x) {
        return (x.username || '').toLowerCase() === v || (x.email || '').toLowerCase() === v || (x.phone || '') === v;
      }) || null;
    },
    /** يُنشئ رمز تحقق ويُرسله (في النموذج: يُسجّل في تلقرام + يظهر للمعاينة) */
    requestPasswordReset: function (idOrEmail, channel) {
      var u = store.findAccount(idOrEmail);
      if (!u) return { ok: false, error: 'لا يوجد حساب بهذا اسم المستخدم أو البريد' };
      var code = String(Math.floor(100000 + Math.random() * 900000));
      u.resetCode = code;
      u.resetExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      u.resetChannel = channel || 'telegram';
      save();
      var msg = '🔐 رمز استعادة كلمة المرور: ' + code + '\nصالح ١٥ دقيقة. إن لم تطلبه تجاهله.';
      store.db.telegram.unshift({ id: uid('tg'), to: u.role, toName: u.name, chat: u.telegram || u.phone || '',
        text: msg, at: now(), status: 'queued' });
      store.notify({ kind: 'account', ref: u.id, title: 'طلب استعادة كلمة المرور', body: u.name + ' — أُرسل الرمز', to: ['principal'] });
      return { ok: true, user: u, code: code, channel: u.resetChannel, expiresAt: u.resetExpiresAt };
    },
    verifyResetCode: function (idOrEmail, code) {
      var u = store.findAccount(idOrEmail);
      if (!u) return { ok: false, error: 'الحساب غير موجود' };
      if (!u.resetCode) return { ok: false, error: 'لا يوجد طلب استعادة لهذا الحساب' };
      if (u.resetExpiresAt && new Date(u.resetExpiresAt) < new Date()) return { ok: false, error: 'انتهت صلاحية الرمز — أعد الطلب' };
      if (String(code || '').trim() !== String(u.resetCode)) return { ok: false, error: 'الرمز غير صحيح' };
      return { ok: true, user: u };
    },
    resetPassword: function (idOrEmail, code, newPassword, confirm) {
      var chk = store.verifyResetCode(idOrEmail, code);
      if (!chk.ok) return chk;
      var issues = store.passwordIssues(newPassword);
      if (issues.length) return { ok: false, error: 'كلمة المرور ضعيفة: تحتاج ' + issues.join(' + ') };
      if (newPassword !== confirm) return { ok: false, error: 'كلمتا المرور غير متطابقتين' };
      var u = chk.user;
      u.password = newPassword; u.resetCode = null; u.resetExpiresAt = null;
      u.passwordChangedAt = now();
      save();
      store.notify({ kind: 'account', ref: u.id, title: 'تغيير كلمة المرور', body: u.name + ' — ' + u.username, to: ['principal'] });
      return { ok: true, user: u };
    },
    /* ------------------------- حسابات الطلاب: إيقاف وتفعيل ------------------------- */
    /** كل حسابات الطلاب (مع بيانات الصف) */
    studentAccounts: function (opts) {
      opts = opts || {};
      var users = store.list('users').filter(function (u) { return u.role === 'student'; });
      return users.map(function (u) {
        var st = store.student(u.studentId || u.id) || {};
        var k = st.classId ? store.klass(st.classId) : null;
        return Object.assign({}, u, {
          classId: st.classId || null, className: k ? k.name : 'غير مسكّن',
          studentName: st.name || u.name
        });
      }).filter(function (u) {
        if (opts.schoolId && u.schoolId !== opts.schoolId) return false;
        if (opts.classId && u.classId !== opts.classId) return false;
        if (opts.status && u.status !== opts.status) return false;
        return true;
      }).sort(function (a, b) { return String(a.className).localeCompare(String(b.className)) || a.name.localeCompare(b.name); });
    },
    /** إحصاء حسابات الطلاب على مستوى المنصّة (لكل المدارس) + تفصيل لكل مدرسة */
    studentAccountStats: function (schoolId) {
      var all = store.studentAccounts(schoolId ? { schoolId: schoolId } : {});
      var count = function (st) { return all.filter(function (u) { return u.status === st; }).length; };
      var bySchool = store.list('schools').map(function (sc) {
        var rows = all.filter(function (u) { return u.schoolId === sc.id; });
        return {
          schoolId: sc.id, name: sc.name, total: rows.length,
          active: rows.filter(function (u) { return u.status === 'active'; }).length,
          suspended: rows.filter(function (u) { return u.status === 'suspended'; }).length,
          pending: rows.filter(function (u) { return u.status === 'pending'; }).length
        };
      });
      var homeless = all.filter(function (u) { return !u.schoolId; }).length;
      return {
        scope: schoolId ? 'school' : 'platform',
        total: all.length, active: count('active'), suspended: count('suspended'), pending: count('pending'),
        bySchool: bySchool, withoutSchool: homeless
      };
    },
    /** إيقاف/تفعيل حسابات الطلاب — جماعيًا (لوحة المشرف العام: كل تابعني أو مدرسة محدّدة · أو لصف) */
    setStudentAccounts: function (action, opts) {
      opts = opts || {};
      var targets = opts.ids && opts.ids.length
        ? store.list('users').filter(function (u) { return u.role === 'student' && opts.ids.indexOf(u.id) > -1; })
        : store.studentAccounts({ classId: opts.classId, schoolId: opts.schoolId })
            .map(function (a) { return store.user(a.id); }).filter(Boolean);
      var activate = action === 'activate';
      var changed = 0;
      targets.forEach(function (u) {
        var status = activate ? 'active' : 'suspended';
        if (u.status !== status) {
          u.status = status; u.canLogin = activate;
          u.statusChangedAt = now();
          u.statusChangedBy = store.session.name || '';
          changed++;
        }
      });
      save();
      var sc = opts.schoolId ? (store.school(opts.schoolId) || {}) : null;
      var scopeLabel = opts.classId ? ('الصف: ' + ((store.klass(opts.classId) || {}).name || ''))
        : (sc ? ('مدرسة: ' + (sc.name || '')) : 'كل مدارس المنصّة');
      store.notify({
        kind: 'account',
        title: (activate ? 'تفعيل ' : 'إيقاف ') + changed + ' حساب طالب',
        body: scopeLabel,
        to: ['principal', 'deputy', 'super']
      });
      (db.audit = db.audit || []).unshift({
        id: uid('au'), at: now(), action: activate ? 'students_activated' : 'students_suspended',
        by: store.session.name || '', text: (activate ? 'تفعيل ' : 'إيقاف ') + changed + ' حساب طالب — ' + scopeLabel
      });
      save();
      return { ok: true, action: action, changed: changed, total: targets.length, scope: scopeLabel };
    },

    /* =====================================================================
       المالية — التحويل البنكي · سند التحويل · الفاتورة الإلكترونية · المصروفات
       ---------------------------------------------------------------------
       المسار: المدرسة تحوّل المبلغ بنكيًا ← ترفع صورة سند التحويل مختومة بختم
       المدرسة ← تُراجع (المشرف العام أو المحاسب المالي) ← تُصدر فاتورة إلكترونية
       مختومة بختم «تابعني للخدمات الذكية» ← وتُفعَّل الباقة آليًا.
       ===================================================================== */
    EXPENSE_CATS: [
      { id: 'maintenance', name: 'صيانة تابعني' },
      { id: 'servers', name: 'السيرفرات والاستضافة' },
      { id: 'operations', name: 'التشغيل' },
      { id: 'domain', name: 'الدومين والشهادات' },
      { id: 'support', name: 'الدعم الفني' },
      { id: 'other', name: 'مصروفات أخرى' }
    ],
    expenseCat: function (id) {
      var c = store.EXPENSE_CATS.find(function (x) { return x.id === id; });
      return c ? c.name : 'مصروفات أخرى';
    },
    /* ------------------------------ الحساب البنكي ------------------------------ */
    bank: function () {
      var b = (db.settings && db.settings.bank) || {};
      return {
        beneficiary: b.beneficiary || 'مؤسسة تابعني للخدمات الذكية',
        bankName: b.bankName || 'مصرف الراجحي',
        account: b.account || '000-0000-000000-0',
        iban: b.iban || 'SA00 0000 0000 0000 0000 0000',
        note: b.note || 'حوّل قيمة الاشتراك ثم ارفع صورة سند التحويل مختومًا بختم المدرسة — تصدر لك فاتورة إلكترونية مختومة وتُفعَّل الباقة آليًا.'
      };
    },
    saveBank: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.bank = Object.assign({}, store.bank(), patch || {});
      save(); return store.bank();
    },
    /* ------------------------------- الفواتير ------------------------------- */
    nextInvoiceNo: function () {
      var y = new Date().getFullYear();
      var n = store.list('invoices').filter(function (i) { return String(i.no || '').indexOf('TBN-' + y + '-') === 0; }).length + 1;
      return 'TBN-' + y + '-' + ('000' + n).slice(-4);
    },
    /** بيان البند في الفاتورة */
    invoiceTitle: function (inv) {
      if (inv.kind === 'setup') return 'رسم التأسيس والتهيئة — تابعني';
      return 'اشتراك سنوي — باقة «' + store.planDef(inv.plan).name + '»' +
        ((inv.years || 1) > 1 ? ' (' + inv.years + ' سنوات)' : '');
    },
    invoiceTotal: function (inv) { return Number((inv || {}).amount) || 0; },
    invoices: function (schoolId) {
      var all = store.list('invoices').slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      return schoolId ? all.filter(function (i) { return i.schoolId === schoolId; }) : all;
    },
    invoice: function (id) { return store.list('invoices').find(function (i) { return i.id === id; }) || null; },
    /** إصدار فاتورة إلكترونية مختومة بختم «تابعني للخدمات الذكية» */
    issueInvoice: function (data) {
      data = data || {};
      var sc = store.school(data.schoolId) || {};
      var inv = {
        id: uid('inv'), no: store.nextInvoiceNo(), at: now(),
        schoolId: sc.id || '', schoolName: sc.name || '', schoolCity: sc.city || '', schoolCode: sc.code || '',
        plan: data.plan || store.planOf(sc.id),
        kind: data.kind === 'setup' ? 'setup' : 'annual',
        years: Math.max(1, parseInt(data.years, 10) || 1),
        amount: Number(data.amount) || 0, vat: !!data.vat,
        seller: 'تابعني للخدمات الذكية',
        by: store.session.name || '',
        paidUntil: data.paidUntil || ((store.licenseState(sc.id) || {}).paidUntil || ''),
        note: data.note || '', requestId: data.requestId || '',
        receipt: data.receipt || '', schoolStamp: data.schoolStamp || ''
      };
      db.invoices.unshift(inv);
      save();
      return inv;
    },
    /* --------------------------- طلبات السداد (سند التحويل) --------------------------- */
    paymentRequests: function (opts) {
      opts = opts || {};
      var all = store.list('paymentRequests').slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      if (opts.status) all = all.filter(function (r) { return r.status === opts.status; });
      if (opts.schoolId) all = all.filter(function (r) { return r.schoolId === opts.schoolId; });
      return all;
    },
    /** المدرسة ترفع سند التحويل المختوم بختمها وتطلب التفعيل */
    createPaymentRequest: function (d) {
      d = d || {};
      var sc = store.school(d.schoolId || store.session.schoolId);
      if (!sc) return { ok: false, error: 'مدرسة غير معروفة' };
      var kind = d.kind === 'setup' ? 'setup' : 'annual';
      var plan = (d.plan === 'pro' || d.plan === 'classic') ? d.plan : store.planOf(sc.id);
      var years = Math.max(1, parseInt(d.years, 10) || 1);
      var amount = kind === 'setup' ? store.planFees().setupFee : store.annualFee(plan) * years;
      var rec = (d.receipt || '').slice(0, 400000);
      if (!rec) return { ok: false, error: 'ارفع صورة سند التحويل أولًا' };
      var r = {
        id: uid('prq'), at: now(), schoolId: sc.id, schoolName: sc.name,
        plan: plan, kind: kind, years: years, amount: amount,
        receipt: rec, schoolStamp: (d.schoolStamp || '').slice(0, 400000),
        transferRef: String(d.transferRef || '').trim(), transferDate: d.transferDate || '',
        note: String(d.note || '').trim(), status: 'pending',
        byUser: store.session.userId || '', byName: store.session.name || '',
        decidedAt: '', decidedBy: '', invoiceId: '', rejectReason: ''
      };
      db.paymentRequests.unshift(r);
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'payment_requested', by: store.session.name || '',
        text: 'طلب سداد — ' + sc.name + ' · ' + store.invoiceTitle(r) + ' · ' + amount + ' ر.س' });
      store.notify({ kind: 'finance', title: 'طلب تفعيل باقة — ' + sc.name,
        body: store.invoiceTitle(r) + ' · ' + amount + ' ر.س · سند تحويل مرفق', to: ['super', 'accountant'] });
      save();
      return { ok: true, request: r };
    },
    /** اعتماد السداد: يُسجَّل الدفع (تفعيل آلي للباقة) ثم تُصدار الفاتورة */
    approvePaymentRequest: function (id, opts) {
      opts = opts || {};
      var r = store.paymentRequests().find(function (x) { return x.id === id; }) || null;
      if (!r) return { ok: false, error: 'الطلب غير موجود' };
      if (r.status !== 'pending') return { ok: false, error: 'الطلب مُعالج مسبقًا' };
      var pay = store.recordPayment(r.schoolId, { kind: r.kind, years: r.years, unblock: true });
      var inv = store.issueInvoice({
        schoolId: r.schoolId, plan: r.plan, kind: r.kind, years: r.years, amount: r.amount,
        requestId: r.id, receipt: r.receipt, schoolStamp: r.schoolStamp,
        note: 'تحويل بنكي — سند مختوم بختم المدرسة' + (r.transferRef ? ' · مرجع التحويل: ' + r.transferRef : ''),
        paidUntil: (pay.state || {}).paidUntil || ''
      });
      r.status = 'approved'; r.decidedAt = now(); r.decidedBy = store.session.name || ''; r.invoiceId = inv.id;
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'payment_approved', by: store.session.name || '',
        text: 'اعتماد سداد ' + r.schoolName + ' · ' + r.amount + ' ر.س · فاتورة ' + inv.no });
      var toUsers = store.list('users').filter(function (u) {
        return u.schoolId === r.schoolId && (u.role === 'principal' || u.role === 'deputy');
      }).map(function (u) { return u.id; });
      store.notify({ kind: 'finance', title: 'فُعّلت باقة ' + r.schoolName + ' ✓',
        body: 'فاتورة ' + inv.no + ' صادرة — السريان حتى ' + ((pay.state || {}).paidUntil || '') + '. اطبعها من «الاشتراك والدفع».',
        toUsers: toUsers, to: ['super', 'accountant'] });
      save();
      return { ok: true, invoice: inv, payment: pay, state: pay.state };
    },
    rejectPaymentRequest: function (id, why) {
      var r = store.paymentRequests().find(function (x) { return x.id === id; }) || null;
      if (!r) return { ok: false, error: 'الطلب غير موجود' };
      if (r.status !== 'pending') return { ok: false, error: 'الطلب مُعالج مسبقًا' };
      r.status = 'rejected'; r.decidedAt = now(); r.decidedBy = store.session.name || '';
      r.rejectReason = String(why || '').trim();
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'payment_rejected', by: store.session.name || '',
        text: 'رفض سداد ' + r.schoolName + ' · ' + r.amount + ' ر.س' + (why ? ' — ' + why : '') });
      var toUsers = store.list('users').filter(function (u) {
        return u.schoolId === r.schoolId && (u.role === 'principal' || u.role === 'deputy');
      }).map(function (u) { return u.id; });
      store.notify({ kind: 'finance', title: 'سند التحويل لم يُعتمد — ' + r.schoolName,
        body: (why || 'تحقّق من صورة السند والمبلغ ثم أعد الإرسال.'), toUsers: toUsers, to: ['super', 'accountant'] });
      save();
      return { ok: true, request: r };
    },
    /* ------------------------------ المصروفات ------------------------------ */
    expenses: function (opts) {
      opts = opts || {};
      var all = store.list('expenses').slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      if (opts.category) all = all.filter(function (e) { return e.category === opts.category; });
      return all;
    },
    addExpense: function (d) {
      d = d || {};
      var amount = Number(d.amount) || 0;
      if (!String(d.title || '').trim()) return { ok: false, error: 'اكتب بيان المصروف' };
      if (amount <= 0) return { ok: false, error: 'اكتب مبلغًا صحيحًا' };
      var e = {
        id: uid('exp'), at: d.at || now().slice(0, 10), category: d.category || 'other',
        title: String(d.title).trim(), amount: amount, vendor: String(d.vendor || '').trim(),
        note: String(d.note || '').trim(), by: store.session.name || ''
      };
      db.expenses.unshift(e);
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'expense_added', by: store.session.name || '',
        text: 'مصروف ' + store.expenseCat(e.category) + ' — ' + e.title + ' · ' + amount + ' ر.س' });
      save();
      return { ok: true, expense: e };
    },
    deleteExpense: function (id) {
      var i = store.list('expenses').findIndex(function (e) { return e.id === id; });
      if (i < 0) return { ok: false, error: 'المصروف غير موجود' };
      var e = db.expenses[i];
      db.expenses.splice(i, 1);
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'expense_deleted', by: store.session.name || '',
        text: 'حذف مصروف ' + store.expenseCat(e.category) + ' — ' + e.title + ' · ' + e.amount + ' ر.س' });
      save();
      return { ok: true };
    },
    /* ---------------------- الفترات المالية والتقارير ---------------------- */
    PERIODS: [
      { id: 'daily', name: 'يومي', days: 1 },
      { id: 'weekly', name: 'أسبوعي', days: 7 },
      { id: 'monthly', name: 'شهري', days: 30 },
      { id: 'quarterly', name: 'ربع سنوي (٣ أشهر)', days: 90 },
      { id: 'half', name: 'نصف سنوي (٦ أشهر)', days: 180 },
      { id: 'annual', name: 'سنوي', days: 365 }
    ],
    periodRange: function (kind) {
      var p = store.PERIODS.find(function (x) { return x.id === kind; }) || store.PERIODS[0];
      var from = new Date(Date.now() - (p.days - 1) * 864e5); from.setHours(0, 0, 0, 0);
      var to = new Date(); to.setHours(23, 59, 59, 999);
      return { id: p.id, name: p.name, days: p.days, from: from.toISOString(), to: to.toISOString() };
    },
    /** الملخّص المالي لفترة: إيرادات (تأسيس + اشتراكات) · مصروفات · صافي */
    financeSummary: function (kind) {
      var r = store.periodRange(kind);
      var inR = function (at) { return at && at >= r.from && at <= r.to; };
      var invs = store.list('invoices').filter(function (i) { return inR(i.at); });
      var sum = function (arr) { return arr.reduce(function (a, i) { return a + (Number(i.amount) || 0); }, 0); };
      var setup = sum(invs.filter(function (i) { return i.kind === 'setup'; }));
      var annual = sum(invs.filter(function (i) { return i.kind === 'annual'; }));
      var exps = store.list('expenses').filter(function (e) { return inR(e.at); });
      var expTotal = sum(exps);
      var byCat = {};
      store.EXPENSE_CATS.forEach(function (c) { byCat[c.id] = 0; });
      exps.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
      var pend = store.paymentRequests({ status: 'pending' });
      var lic = store.licenseStats();
      return {
        period: r, invoices: invs, expenses: exps,
        invoiceCount: invs.length, expenseCount: exps.length,
        setup: setup, annual: annual, revenue: setup + annual,
        expensesTotal: expTotal, net: setup + annual - expTotal,
        byCat: byCat,
        pendingCount: pend.length, pendingAmount: sum(pend),
        annualExpected: lic.annualExpected, suspended: lic.suspended, overdue: lic.overdue, schools: lic.total
      };
    },
    /** كل الفترات معًا (للتقرير الجامع) */
    financeAllPeriods: function () {
      return store.PERIODS.map(function (p) { return store.financeSummary(p.id); });
    },

    /* =====================================================================
       الدعم الفني — بوت (فارس الحربي · هند المطيري) بلهجة سعودية + نظام تذاكر
       ---------------------------------------------------------------------
       شفتان: فارس ٨ ص – ٨ م · هند ٨ م – ٨ ص. البوت يفرز الاستفسار ويردّ بلهجة
       سعودية، ويستقبل صورة لقطة الشاشة ويفتح تذكرة تصل «الدعم الفني» و«المشرف العام».
       ===================================================================== */
    AGENTS: [
      { id: 'fares', name: 'فارس الحربي', img: 'assets/img/support-fares.png', from: 8, to: 20,
        shift: 'الشفت الأول · ٨ صباحًا – ٨ مساءً' },
      { id: 'hind', name: 'هند المطيري', img: 'assets/img/support-hind.png', from: 20, to: 8,
        shift: 'الشفت الثاني · ٨ مساءً – ٨ صباحًا' }
    ],
    agentNow: function (d) {
      var h = (d || new Date()).getHours();
      return (h >= 8 && h < 20) ? store.AGENTS[0] : store.AGENTS[1];
    },
    agent: function (id) { return store.AGENTS.find(function (a) { return a.id === id; }) || store.AGENTS[0]; },
    /* قاعدة معرفة البوت — لغة سعودية، مفاتيح بلا تشكيل وتُطبَّع عند البحث */
    BOT_KB: [
      { id: 'attendance', cat: 'attendance', title: 'التحضير وإغلاق الحصة',
        k: ['تحضير', 'الحصة', 'حضور', 'غياب', 'سكر', 'اسكر', 'اغلق', 'قفل', 'طالب غايب'],
        a: 'أبشر بسعدك! التحضير سهل: «التحضير» ← اختر الحصة ← حدّد حالة كل طالب ← إغلاق. وترى ما يمديك تسكّر الحصة إلا بعد نصّ وقتها؛ ولو الزر مطفّي فمعناه أن وقت الحصة بالجدول ما بدأ بعد — تأكد من وقت الحصة وإذا فيه لبس كلّم وكيل شؤون الطلاب يضبط الجدول.' },
      { id: 'login', cat: 'login', title: 'الدخول وكلمة المرور',
        k: ['دخول', 'باسورد', 'كلمة المرور', 'ما ادخل', 'ما يفتح', 'نسيت', 'استعادة'],
        a: 'هلا والله! إذا ما قدرت تدخل: تأكد من اسم المستخدم (بالإنجليزية) وكلمة المرور، وتقدر تضغط «نسيت كلمة المرور» وتوصلك رسالة استرجاع. ولو الحساب جديد، لازم مدير المدرسة يعتمده أول. عطني اسم المستخدم عندك وأنا أتابع معاك.' },
      { id: 'otp', cat: 'otp', title: 'رمز التحقق بمرحلتين',
        k: ['رمز', 'تحقق', 'مرحلتين', 'otp', 'ما وصلني الرمز', 'توثيق'],
        a: 'أبشر! الرمز ينزل على تلقرام في محادثتك الخاصة مع البوت — تأكد أنك مرسل /start للبوت، وأدخل الرمز خلال ٥ دقايق (يُستهلك مرة وحدة). ولو ما وصلك، كلّم مدير المدرسة يربط محادثتك من «الموظفون والحسابات».' },
      { id: 'telegram', cat: 'telegram', title: 'تلقرام والإشعارات',
        k: ['تلقرام', 'تلجرام', 'بوت', 'اشعار', 'إشعار', 'رسالة ما توصل', 'قناة'],
        a: 'تمام! للإشعارات: تابعنا في باقتين — «كلاسيك» كل الوحدات بلا تلقرام، و«برو» فيها تلقرام. ولو باقتك «برو» وما توصل الرسائل: تأكد من التوكن ومعرّف المحادثة في «سجل تلقرام»، وجرّب «إرسال رسالة تجريبية».' },
      { id: 'reports', cat: 'reports', title: 'التقارير والطباعة',
        k: ['تقرير', 'تقارير', 'طباعة', 'اطبع', 'بي دي اف', 'pdf', 'باركود', 'ترويسة'],
        a: 'أبشر! التقارير من «التقارير» ← اختر النوع والفترة ← «تصدير PDF / طباعة»، وتطلع بترويسة الوزارة والباركود. ولو الترويسة مو مضبوطة، مدير المدرسة يعدّلها من «ترويسة التقارير».' },
      { id: 'students', cat: 'students', title: 'الطلاب والاستيراد',
        k: ['طالب', 'طلاب', 'استيراد', 'اكسل', 'excel', 'نور', 'اسكان', 'نقل طالب', 'فصل'],
        a: 'هلا بك! استيراد الطلاب من «الفصول والطلاب» ← استيراد Excel/CSV، وتقدر تسكنهم فصول وتنقلهم فردي أو جماعي. ولو الملف ما قبل، تأكد أن الصفوف فيها الأعمدة المطلوبة (الاسم ورقم الهوية) بلا صفوف فاضية.' },
      { id: 'violations', cat: 'violations', title: 'المخالفات السلوكية',
        k: ['مخالفة', 'مخالفات', 'توجيه', 'لائحة', 'خصم درجة', 'سلوك'],
        a: 'علمًا! المخالفة دورة كاملة: المعلم يسجّلها ← التوجيه يرد ← الوكيل يعتمد الخصم أو اللائحة ← تُغلق. ولو المخالفة واقفة عند أحد، افتح تفاصيلها وبتشوف في أي مرحلة هي.' },
      { id: 'permissions', cat: 'permissions', title: 'الاستئذان وأذون الخروج',
        k: ['استئذان', 'تصريح', 'خروج', 'بوابة', 'حارس', 'باص', 'مغادرة'],
        a: 'هلا! الاستئذان من «الاستئذان»: الطلب يروح للتوجيه ← الوكيل يمنح ← يطلع تصريح خروج بباركود، والحارس يمسحه من «بوابة الخروج». ولو الباركود ما انقرأ، قرّب الجوال وزوّد إضاءة الشاشة.' },
      { id: 'subscription', cat: 'subscription', title: 'الاشتراك والفاتورة',
        k: ['اشتراك', 'فاتورة', 'سداد', 'تحويل', 'بنك', 'سند', 'رسوم', 'باقة', 'برو', 'كلاسيك', 'تجديد'],
        a: 'أبشر! نظامنا: تحويل بنكي ثم ترفع صورة سند التحويل مختوم بختم المدرسة من «الاشتراك والدفع» ← نعتمدها ← تصدر فاتورة إلكترونية مختومة من تابعني وتُفعَّل الباقة على طول، وتقدر تطبع الفاتورة في أي وقت.' },
      { id: 'install', cat: 'install', title: 'تثبيت التطبيق والإنترنت',
        k: ['تثبيت', 'تطبيق', 'ايباد', 'جوال', 'بدون انترنت', 'اوفلاين', 'تحميل', 'كاش'],
        a: 'حياك! التطبيق يُثبَّت من المتصفح: مشاركة ← «إضافة إلى الشاشة الرئيسية» (آيباد) أو «تثبيت التطبيق» (كروم). وبعد أول فتح يشتغل بدون إنترنت. ولو طلعت نسخة قديمة، اطلع من التطبيق وافتحه من جديد أو حدّث الصفحة.' },
      { id: 'camera', cat: 'camera', title: 'الكاميرا وبصمة الوجه',
        k: ['كاميرا', 'بصمة', 'وجه', 'face', 'صلاحية الكاميرا', 'ما يفتح الكاميرا'],
        a: 'هلا! بصمة الوجه تحتاج إذن الكاميرا وموقع آمن (https أو localhost). افتح إعدادات المتصفح ← الأذونات ← الكاميرا ← «سماح»، ثم أعد تحميل الصفحة. ولو الجهاز فيه كاميرا مغطاة، اكشفها وجرّب من جديد.' },
      { id: 'backup', cat: 'backup', title: 'النسخ الاحتياطي والبيانات',
        k: ['نسخة', 'احتياطي', 'باك اب', 'بيانات', 'استرجاع', 'تصفير', 'ضاعت'],
        a: 'انتبه لي: البيانات محفوظة في متصفح الجهاز نفسه (نموذج أولي بلا خادم). خذ نسخة احتياطية دوريًا من «بيانات تابعني ← نسخة احتياطية» واحفظها بمكان آمن — ومنها تقدر تسترجع كل شي.' }
    ],
    /** يطبّع النص العربي للبحث */
    _norm: function (t) {
      return String(t || '').toLowerCase()
        .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[^\u0621-\u064A0-9a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    },
    /** ردّ البوت بلهجة سعودية — يرجّع {agent, text, category, subject, matched, offerTicket} */
    botReply: function (text, ctx) {
      ctx = ctx || {};
      var agent = store.agent(ctx.agentId || store.agentNow().id);
      var q = store._norm(text);
      var best = null, bestScore = 0;
      store.BOT_KB.forEach(function (e) {
        var score = 0;
        e.k.forEach(function (kw) {
          var k = store._norm(kw);
          if (k && q.indexOf(k) > -1) score += (k.length > 3 ? 2 : 1);
        });
        if (score > bestScore) { bestScore = score; best = e; }
      });
      /* الترحيب */
      if (!q && !ctx.image) {
        return { agent: agent, category: 'greeting', matched: '', offerTicket: false, subject: 'ترحيب',
          text: 'هلا والله ومسهلا! أنا ' + agent.name + ' من الدعم الفني في تابعني (' + agent.shift + '). ' +
                'اسألني عن التحضير أو المخالفات أو التقارير أو الاشتراك… وإن حبيت أفتح لك تذكرة ويرد عليك الفريق، قول «افتح تذكرة».' };
      }
      /* صورة مرفقة: فرز أوّلي + عرض فتح تذكرة */
      if (ctx.image) {
        var meta = ctx.imageMeta || {};
        var bits = [];
        if (meta.type) bits.push(meta.type);
        if (meta.w && meta.h) bits.push(meta.w + '×' + meta.h);
        if (meta.kb) bits.push(meta.kb + ' كيلوبايت');
        var info = bits.length ? ' (' + bits.join(' · ') + ')' : '';
        var body = 'وصلتني الصورة' + info + '. ';
        if (best) body += 'وشفت كلامك عن ' + best.title + ' — ' + best.a;
        else body += 'عطيت فريق الدعم الصورة داخل التذكرة عشان يشوفونها بعينهم.';
        return { agent: agent, category: best ? best.cat : 'other', matched: best ? best.id : '', offerTicket: true,
          subject: best ? best.title : 'صورة من المستخدم',
          text: body + ' وحنا نسوّي لك تذكرة متابعة — اكتب لي بجملة وش صار بالضبط وأنا أفتحها فورًا.' };
      }
      if (best) {
        var extra = (q.indexOf('تذكره') > -1 || q.indexOf('تذكرة') > -1 || q.indexOf('مشكله') > -1 || q.indexOf('مشكلة') > -1)
          ? ' وإن حبيت، أفتح لك تذكرة ويرد عليك أحد فريق الدعم.' : '';
        return { agent: agent, category: best.cat, matched: best.id, offerTicket: false, subject: best.title, text: best.a + extra };
      }
      return { agent: agent, category: 'other', matched: '', offerTicket: true, subject: 'استفسار عام',
        text: 'أبشر، ما فهمت عليك عدل. وضّح لي أكثر الله يعافيك — أو عطني كلمة واحدة (مثل: تحضير · فاتورة · تلقرام · تقارير · دخول) وأنا أفهمك. ' +
              'وإذا تبي، أفتح لك تذكرة ويرد عليك أحد فريق الدعم.' };
    },
    /* ------------------------------ التذاكر ------------------------------ */
    openTicket: function (d) {
      d = d || {};
      var yr = new Date().getFullYear();
      var n = store.list('tickets').filter(function (t) { return String(t.no || '').indexOf('TKT-' + yr + '-') === 0; }).length + 1;
      var agent = store.agent(d.agentId || store.agentNow().id);
      var t = {
        id: uid('tkt'), no: 'TKT-' + yr + '-' + ('000' + n).slice(-4), at: now(), updatedAt: now(),
        status: 'open', category: d.category || 'other', priority: d.priority === 'high' ? 'high' : 'normal',
        subject: String(d.subject || 'استفسار من الدعم الفني').trim(),
        schoolId: d.schoolId !== undefined ? (d.schoolId || '') : (store.session.schoolId || ''),
        byUser: d.byUser !== undefined ? d.byUser : (store.session.userId || ''),
        byName: d.byName || store.session.name || 'زائر', byRole: d.byRole || store.session.role || 'visitor',
        phone: String(d.phone || ''), email: String(d.email || ''),
        viaBot: true, agentId: agent.id, assignee: d.assignee || 'support',
        lastFrom: 'user', messages: [].concat(d.messages || [])
      };
      db.tickets.unshift(t);
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'ticket_opened', by: store.session.name || t.byName,
        text: 'تذكرة دعم ' + t.no + ' — ' + t.subject });
      store.notify({ kind: 'support', title: 'تذكرة دعم جديدة: ' + t.no,
        body: t.subject + ' — ' + t.byName + (t.schoolId ? ' · ' + ((store.school(t.schoolId) || {}).name || '') : ' · زائر'),
        to: ['support', 'super'] });
      save();
      return { ok: true, ticket: t };
    },
    tickets: function (opts) {
      opts = opts || {};
      var all = store.list('tickets').slice().sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      if (opts.status) all = all.filter(function (t) { return t.status === opts.status; });
      if (opts.schoolId) all = all.filter(function (t) { return t.schoolId === opts.schoolId; });
      if (opts.mine) all = all.filter(function (t) { return t.byUser === store.session.userId; });
      if (opts.assignee) all = all.filter(function (t) { return t.assignee === opts.assignee; });
      return all;
    },
    ticket: function (id) { return store.list('tickets').find(function (t) { return t.id === id; }) || null; },
    /** إضافة رسالة للتذكرة: من المستخدم أو البوت أو الدعم */
    ticketAdd: function (id, msg) {
      var t = store.ticket(id);
      if (!t) return { ok: false, error: 'التذكرة غير موجودة' };
      msg = msg || {};
      var text = String(msg.text || '').trim();
      if (!text && !msg.image) return { ok: false, error: 'اكتب رسالة أو ارفق صورة' };
      var from = (msg.from === 'agent' || msg.from === 'bot') ? msg.from : 'user';
      var entry = {
        at: now(), from: from,
        name: msg.name || (from === 'agent' ? (store.session.name || 'الدعم الفني') : (from === 'bot' ? store.agent(t.agentId).name : store.session.name || '')),
        text: text, image: (msg.image || '').slice(0, 400000)
      };
      t.messages.push(entry);
      t.updatedAt = now(); t.lastFrom = from;
      if (from === 'user') t.status = t.status === 'closed' ? 'open' : t.status;
      if (from === 'agent' && t.status === 'open') t.status = 'progress';
      if (from === 'agent' || from === 'bot') {
        var toUsers = [t.byUser].filter(Boolean).concat(store.list('users').filter(function (u) {
          return u.schoolId && u.schoolId === t.schoolId && u.role === 'principal';
        }).map(function (u) { return u.id; }));
        store.notify({ kind: 'support', title: 'ردّ على تذكرتك ' + t.no,
          body: (entry.name || 'الدعم الفني') + ': ' + (text || 'أرفق صورة').slice(0, 90),
          toUsers: toUsers, to: ['support', 'super'] });
      } else {
        t.assignee = t.assignee || 'support';
      }
      save();
      return { ok: true, ticket: t, message: entry };
    },
    /** محادثة كاملة مع البوت: ردّه ثم (اختياريًا) فتح تذكرة */
    botChat: function (text, opts) {
      opts = opts || {};
      var r = store.botReply(text, opts);
      return r;
    },
    ticketStatus: function (id, status) {
      var t = store.ticket(id);
      if (!t) return { ok: false, error: 'التذكرة غير موجودة' };
      t.status = ['open', 'progress', 'closed', 'waiting'].indexOf(status) > -1 ? status : t.status;
      t.updatedAt = now();
      if (status === 'closed') { t.closedAt = now(); t.closedBy = store.session.name || ''; }
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: 'ticket_status', by: store.session.name || '',
        text: 'تذكرة ' + t.no + ' → ' + store.ticketStatusName(t.status) });
      save();
      return { ok: true, ticket: t };
    },
    ticketAssign: function (id, to) {
      var t = store.ticket(id);
      if (!t) return { ok: false, error: 'التذكرة غير موجودة' };
      t.assignee = to === 'super' ? 'super' : 'support';
      t.updatedAt = now();
      save();
      return { ok: true, ticket: t };
    },
    ticketStatusName: function (st) {
      return { open: 'جديدة', progress: 'قيد المعالجة', waiting: 'بانتظار المستخدم', closed: 'مغلقة' }[st] || st;
    },
    ticketCatName: function (id) {
      var e = store.BOT_KB.find(function (x) { return x.cat === id; });
      return e ? e.title : 'استفسار آخر';
    },
    ticketStats: function () {
      var all = store.list('tickets');
      var open = all.filter(function (t) { return t.status === 'open'; }).length;
      var prog = all.filter(function (t) { return t.status === 'progress'; }).length;
      var closed = all.filter(function (t) { return t.status === 'closed'; }).length;
      var mine = all.filter(function (t) { return t.byUser === store.session.userId; }).length;
      return { total: all.length, open: open, progress: prog, closed: closed, active: open + prog, mine: mine };
    },

    /* =====================================================================
       الباقات والاشتراكات — «تابعني كلاسيك» و«تابعني برو»
       ---------------------------------------------------------------------
       • الباقة لكل مدرسة: كلاسيك = كل الوحدات بلا تلقرام · برو = كل الخدمات.
       • رسم تأسيس وتهيئة تابعني مرة واحدة، ثم اشتراك سنوي لكل باقة.
       • الإيقاف بيد المشرف العام وحده: عدم سداد الرسوم السنوية أو مشكلة تشغيلية،
         ولا يمسّ حساب المشرف العام نفسه أبدًا (مسار الاسترجاع).
       ===================================================================== */
    PLANS: [
      { id: 'classic', name: 'تابعني كلاسيك', short: 'كلاسيك', telegram: false,
        tagline: 'كل الوحدات — بلا تلقرام',
        features: ['وحدات كل الوحدات و١٠ أدوار', 'التحضير والمخالفات والاستئذان والمناوبة',
                   'التقارير الرسمية بترويسة الوزارة وباركود التحقّق', 'يعمل بلا إنترنت · نسخ احتياطي'] },
      { id: 'pro', name: 'تابعني برو', short: 'برو', telegram: true, best: true,
        tagline: 'كل الخدمات + تلقرام',
        features: ['كل ما في «تابعني كلاسيك»', 'إشعارات تلقرام الفورية للمعلم والوكيل والمدير',
                   'الرسائل الخاصة وتنبيهات أولياء الأمور', 'التحقق بمرحلتين برمز تلقرام',
                   'ربط محادثة تلقرام خاصة لكل مستخدم'] }
    ],
    /** الرسوم: رسم تأسيس + اشتراك سنوي لكل باقة (قابلة للتعديل من إدارة تابعني) */
    planFees: function () {
      var f = (db.settings && db.settings.planFees) || {};
      var num = function (v, d) { var x = Number(v); return isFinite(x) && x >= 0 ? Math.round(x) : d; };
      return { setupFee: num(f.setupFee, 1000), classic: num(f.classic, 1000), pro: num(f.pro, 1500) };
    },
    savePlanFees: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.planFees = Object.assign({}, store.planFees(), patch || {});
      save(); return store.planFees();
    },
    planDef: function (id) { return store.PLANS.find(function (p) { return p.id === id; }) || store.PLANS[0]; },
    planLabel: function (id) { return store.planDef(id).name; },
    annualFee: function (planId) { var f = store.planFees(); return planId === 'pro' ? f.pro : f.classic; },
    /** باقة المدرسة (الافتراضي: كلاسيك) */
    planOf: function (schoolId) {
      var sc = store.school(schoolId || store.session.schoolId);
      var p = sc && (sc.plan || (sc.license && sc.license.plan));
      return p === 'pro' ? 'pro' : 'classic';
    },
    /** هل المدرسة على باقة برو؟ — مشرف تابعني (بلا مدرسة) لا تُحجب عنه أدواته */
    isPro: function (schoolId) {
      var sid = schoolId || store.session.schoolId;
      if (!sid) return true;
      return store.planOf(sid) === 'pro';
    },
    /** ترخيص المدرسة — قيم موحّدة وافتراضات آمنة للمدارس القائمة */
    license: function (schoolId) {
      var sc = store.school(schoolId || store.session.schoolId);
      if (!sc) return null;
      var f = store.planFees(), L = sc.license || {};
      var plan = (sc.plan === 'pro' || L.plan === 'pro') ? 'pro' : 'classic';
      return {
        plan: plan, annual: L.annual || store.annualFee(plan),
        setupFee: L.setupFee === undefined ? f.setupFee : L.setupFee,
        setupPaid: L.setupPaid !== false, setupAt: L.setupAt || '',
        startedAt: L.startedAt || '', paidUntil: L.paidUntil || '', lastPaymentAt: L.lastPaymentAt || '',
        status: L.status === 'suspended' ? 'suspended' : 'active',
        reason: L.reason || '', note: L.note || '', suspendedAt: L.suspendedAt || ''
      };
    },
    saveLicense: function (schoolId, patch) {
      var sc = store.school(schoolId);
      if (!sc) return null;
      sc.license = Object.assign({}, store.license(schoolId), patch || {});
      if (sc.license.plan) sc.plan = sc.license.plan;
      save(); return sc.license;
    },
    /** حالة الترخيص للعرض: الحالة + الأيام المتبقية + هل الدخول محجوب */
    licenseState: function (schoolId) {
      var L = store.license(schoolId);
      if (!L) return null;
      var days = null;
      if (L.paidUntil) days = Math.ceil((new Date(L.paidUntil).getTime() - Date.now()) / 864e5);
      var overdue = days !== null && days < 0;
      var soon = days !== null && days >= 0 && days <= 30;
      var suspended = L.status === 'suspended';
      var state = suspended ? 'suspended' : (overdue ? 'overdue' : (soon ? 'soon' : (L.paidUntil ? 'active' : 'unpaid')));
      var labels = { suspended: (L.reason === 'fees' ? 'موقوفة — عدم سداد الرسوم' : 'موقوفة من إدارة تابعني'),
                     overdue: 'متأخّرة السداد', soon: 'تنتهي قريبًا', active: 'سارية', unpaid: 'بانتظار أول سداد' };
      return Object.assign({}, L, {
        daysLeft: days, overdue: overdue, soon: soon, blocked: suspended,
        state: state, label: labels[state],
        tone: suspended ? 'danger' : (overdue ? 'danger' : (soon ? 'amber' : (state === 'active' ? 'mint' : 'plain'))),
        planName: store.planDef(L.plan).name, planShort: store.planDef(L.plan).short,
        telegram: store.planDef(L.plan).telegram
      });
    },
    /** تهيئة ترخيص مدرسة جديدة (من اختيار التهيئة الأولى) */
    initLicense: function (schoolId, opts) {
      opts = opts || {};
      var sc = store.school(schoolId);
      if (!sc) return null;
      var f = store.planFees();
      var meta = (db.meta && db.meta.setupPlan) || {};
      var plan = (opts.plan || meta.plan) === 'pro' ? 'pro' : 'classic';
      var setupPaid = opts.setupPaid !== undefined ? !!opts.setupPaid : (meta.setupPaid !== false);
      var until = new Date(); until.setFullYear(until.getFullYear() + 1);
      sc.plan = plan;
      sc.license = {
        plan: plan, annual: store.annualFee(plan), setupFee: f.setupFee, setupPaid: setupPaid,
        setupAt: setupPaid ? now() : '', startedAt: now(),
        paidUntil: setupPaid ? until.toISOString().slice(0, 10) : '',
        lastPaymentAt: setupPaid ? now() : '', status: 'active', reason: '', note: '', suspendedAt: ''
      };
      save(); return sc.license;
    },
    /** تسجيل سداد: رسم التأسيس (مرة) أو الاشتراك السنوي (يُمدّد من تاريخ السريان أو اليوم) */
    recordPayment: function (schoolId, opts) {
      opts = opts || {};
      var L = store.license(schoolId), sc = store.school(schoolId);
      if (!L) return { ok: false, error: 'مدرسة غير معروفة' };
      var kind = opts.kind === 'setup' ? 'setup' : 'annual';
      var years = Math.max(1, parseInt(opts.years, 10) || 1);
      var patch, amount;
      if (kind === 'setup') {
        patch = { setupPaid: true, setupAt: now(), setupFee: L.setupFee };
        amount = L.setupFee;
      } else {
        var base = (L.paidUntil && new Date(L.paidUntil).getTime() > Date.now()) ? new Date(L.paidUntil) : new Date();
        base.setFullYear(base.getFullYear() + years);
        amount = store.annualFee(L.plan) * years;
        patch = { setupPaid: true, startedAt: L.startedAt || now(), paidUntil: base.toISOString().slice(0, 10),
                  lastPaymentAt: now(), annual: store.annualFee(L.plan) };
        /* السداد يُرفع به الإيقاف المفروض بسبب الرسوم تلقائيًا */
        if (L.status === 'suspended' && L.reason === 'fees' && opts.unblock !== false) {
          patch.status = 'active'; patch.reason = ''; patch.note = ''; patch.suspendedAt = '';
        }
      }
      store.saveLicense(schoolId, patch);
      var what = kind === 'setup' ? 'رسم التأسيس' : ('الاشتراك السنوي (' + years + ' سنة)');
      store._licenseLog('payment_recorded', 'تسجيل سداد ' + what + ' — ' + (sc ? sc.name : '') + ' · ' + amount + ' ر.س',
        { title: 'سداد مُسجَّل: ' + (sc ? sc.name : ''), body: what + ' — ' + amount + ' ر.س', schoolId: schoolId });
      return { ok: true, kind: kind, amount: amount, license: store.license(schoolId), state: store.licenseState(schoolId) };
    },
    /** إيقاف دخول مدرسة (المشرف العام): عدم سداد الرسوم أو مشكلة تشغيلية */
    suspendSchool: function (schoolId, reason, note) {
      var sc = store.school(schoolId);
      if (!sc) return { ok: false, error: 'مدرسة غير معروفة' };
      var r = reason === 'fees' ? 'fees' : (reason === 'issue' ? 'issue' : 'other');
      store.saveLicense(schoolId, { status: 'suspended', reason: r, note: String(note || ''), suspendedAt: now() });
      var why = r === 'fees' ? 'عدم سداد الرسوم السنوية' : (r === 'issue' ? 'مشكلة تشغيلية' : 'سبب آخر');
      store._licenseLog('school_suspended', 'إيقاف دخول ' + sc.name + ' — ' + why + (note ? ' (' + note + ')' : ''),
        { title: 'إيقاف دخول المدرسة: ' + sc.name, body: why + (note ? ' — ' + note : '') + ' · تواصل مع إدارة تابعني', schoolId: schoolId });
      return { ok: true, reason: r, state: store.licenseState(schoolId) };
    },
    /** رفع الإيقاف */
    activateSchool: function (schoolId, note) {
      var sc = store.school(schoolId);
      if (!sc) return { ok: false, error: 'مدرسة غير معروفة' };
      var L = store.license(schoolId);
      store.saveLicense(schoolId, { status: 'active', reason: '', suspendedAt: '', note: String(note || '') });
      store._licenseLog('school_activated', 'رفع الإيقاف عن ' + sc.name + (L.reason === 'fees' ? ' (بعد السداد)' : ''),
        { title: 'عاد دخول المدرسة: ' + sc.name, body: 'رُفع الإيقاف — يمكن لجميع الحسابات الدخول.', schoolId: schoolId });
      return { ok: true, state: store.licenseState(schoolId) };
    },
    /** تبديل الباقة (كلاسيك ⇄ برو) */
    setPlan: function (schoolId, planId) {
      var sc = store.school(schoolId);
      if (!sc) return { ok: false, error: 'مدرسة غير معروفة' };
      var plan = planId === 'pro' ? 'pro' : 'classic';
      store.saveLicense(schoolId, { plan: plan, annual: store.annualFee(plan) });
      sc.plan = plan; save();
      var was = store.license(schoolId);
      store._licenseLog('plan_changed', 'تغيير باقة ' + sc.name + ' إلى «' + store.planDef(plan).name + '» · ' +
        was.annual + ' ر.س سنويًا',
        { title: 'تغيّرت الباقة: ' + sc.name, body: 'الباقة الحالية «' + store.planDef(plan).name + '» — ' +
          (store.planDef(plan).telegram ? 'كل الخدمات + تلقرام.' : 'كل الوحدات بلا تلقرام.') + ' · الاشتراك السنوي ' + was.annual + ' ر.س',
          schoolId: schoolId });
      return { ok: true, plan: plan, license: store.license(schoolId) };
    },
    /** قيد في سجل التدقيق + إشعار موجَّه لصاحب الشأن (والمشرف العام) */
    _licenseLog: function (action, text, opts) {
      opts = opts || {};
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: now(), action: action, by: store.session.name || '', text: text });
      var toUsers = store.list('users').filter(function (u) {
        return u.schoolId === opts.schoolId && (u.role === 'principal' || u.role === 'deputy');
      }).map(function (u) { return u.id; });
      store.notify({ kind: 'account', title: opts.title || text, body: opts.body || '', toUsers: toUsers, to: ['super'] });
      save();
    },
    /** إحصاء الترخيص: الباقات وحالات الاشتراك والتحصيل المتوقّع */
    licenseStats: function () {
      var fees = store.planFees();
      var rows = store.list('schools').map(function (sc) {
        var st = store.licenseState(sc.id);
        return { schoolId: sc.id, name: sc.name, plan: st.plan, planName: st.planName, planShort: st.planShort,
                 state: st.state, label: st.label, tone: st.tone, daysLeft: st.daysLeft, paidUntil: st.paidUntil,
                 annual: st.annual, setupPaid: st.setupPaid, suspended: st.blocked, overdue: st.overdue,
                 soon: st.soon, reason: st.reason, note: st.note, telegram: st.telegram };
      });
      var n = function (f) { return rows.filter(f).length; };
      var active = rows.filter(function (r) { return !r.suspended; });
      return {
        rows: rows, total: rows.length, fees: fees,
        pro: n(function (r) { return r.plan === 'pro'; }),
        classic: n(function (r) { return r.plan === 'classic'; }),
        suspended: n(function (r) { return r.suspended; }),
        suspendedFees: n(function (r) { return r.suspended && r.reason === 'fees'; }),
        overdue: n(function (r) { return r.overdue && !r.suspended; }),
        soon: n(function (r) { return r.soon && !r.suspended; }),
        unpaidSetup: n(function (r) { return !r.setupPaid; }),
        annualExpected: active.reduce(function (a, r) { return a + (r.annual || 0); }, 0),
        setupExpected: rows.reduce(function (a, r) { return a + (r.setupPaid ? 0 : fees.setupFee); }, 0)
      };
    },

    /* =====================================================================
       النسخة الاحتياطية المجدولة — تذكير أسبوعي (افتراضيًا: الخميس ٤ مساءً)
       ---------------------------------------------------------------------
       المتصفح لا يشغّل المنصة وهي مغلقة (بلا خادم)، لذلك التذكير يظهر
       **عند أول فتح بعد الموعد** — وتحته زر واحد ينزّل النسخة ويسجّل الوقت.
       ===================================================================== */
    WEEKDAYS: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    backupSchedule: function () {
      var b = (db.settings && db.settings.backup) || {};
      var n = function (v, d) { var x = parseInt(v, 10); return (x >= 0 && !isNaN(x)) ? x : d; };
      return {
        enabled: b.enabled !== false,
        weekday: n(b.weekday, 4),        /* 4 = الخميس */
        hour: n(b.hour, 16),             /* ٤ مساءً */
        everyDays: n(b.everyDays, 7),
        snoozeUntil: b.snoozeUntil || ''
      };
    },
    saveBackupSchedule: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.backup = Object.assign({}, store.backupSchedule(), patch || {});
      save(); return store.backupSchedule();
    },
    scheduleLabel: function () {
      var s = store.backupSchedule();
      return store.WEEKDAYS[s.weekday] + ' · ' + (s.hour < 12 ? s.hour + ' صباحًا' : (s.hour === 12 ? '١٢ ظهرًا' : (s.hour - 12) + ' مساءً'));
    },
    /* ---------------- الحفظ السحابي (Google Drive عبر Apps Script) ---------------- */
    driveConfig: function () {
      var d = (db.settings && db.settings.drive) || {};
      return {
        url: d.url || '', enabled: !!d.url && d.enabled !== false, auto: d.auto !== false,
        folder: d.folder || '', lastOk: d.lastOk || '', lastError: d.lastError || '',
        lastTest: d.lastTest || '', count: parseInt(d.count, 10) || 0
      };
    },
    saveDriveConfig: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.drive = Object.assign({}, db.settings.drive || {}, patch || {});
      save(); return store.driveConfig();
    },
    driveConfigured: function () { var c = store.driveConfig(); return !!c.url && c.enabled; },
    driveLog: function () { return ((db.settings && db.settings.driveLog) || []).slice().reverse(); },
    addDriveLog: function (entry) {
      if (!db.settings) db.settings = {};
      if (!db.settings.driveLog) db.settings.driveLog = [];
      db.settings.driveLog.push(entry);
      while (db.settings.driveLog.length > 30) db.settings.driveLog.shift();
      if (db.settings.drive) db.settings.drive.count = (parseInt(db.settings.drive.count, 10) || 0) + (entry.ok ? 1 : 0);
      save(); return entry;
    },
    drivePending: function () { return (db.settings && db.settings.drivePending) || null; },
    saveDrivePending: function (p) {
      if (!db.settings) db.settings = {};
      db.settings.drivePending = p || null; save(); return p;
    },
    clearDrivePending: function () { return store.saveDrivePending(null); },

    lastBackupAt: function () { return (db.meta && db.meta.lastBackupAt) || ''; },
    markBackup: function () {
      if (!db.meta) db.meta = {};
      db.meta.lastBackupAt = now(); save();
      return db.meta.lastBackupAt;
    },
    /** هل حان موعد النسخة؟ */
    backupDue: function (d) {
      d = d || new Date();
      var s = store.backupSchedule();
      if (!s.enabled) return { due: false, reason: 'التذكير مُعطَّل', schedule: s };
      if (s.snoozeUntil && s.snoozeUntil > d.toISOString()) return { due: false, reason: 'مؤجَّل', schedule: s };
      var last = store.lastBackupAt();
      var days = last ? Math.floor((d.getTime() - new Date(last).getTime()) / 864e5) : null;
      var takenToday = days === 0;
      var isSlot = (d.getDay() === s.weekday && d.getHours() >= s.hour);
      var overdue = days !== null && days >= s.everyDays;
      var never = days === null;
      return {
        due: never || (!takenToday && (isSlot || overdue)),
        never: never, slot: isSlot, overdue: overdue, takenToday: takenToday,
        daysSince: days, schedule: s,
        label: never ? 'لم تُؤخذ نسخة على هذا الجهاز بعد' :
               (takenToday ? 'أُخذت نسخة اليوم' : 'آخر نسخة قبل ' + days + ' يومًا'),
        next: store.scheduleLabel()
      };
    },

    /** تغيير كلمة المرور من داخل الحساب */
    changePassword: function (userId, current, next, confirm) {
      var u = store.user(userId); if (!u) return { ok: false, error: 'الحساب غير موجود' };
      if (u.password !== current) return { ok: false, error: 'كلمة المرور الحالية غير صحيحة' };
      var issues = store.passwordIssues(next);
      if (issues.length) return { ok: false, error: 'كلمة المرور ضعيفة: تحتاج ' + issues.join(' + ') };
      if (next !== confirm) return { ok: false, error: 'كلمتا المرور غير متطابقتين' };
      u.password = next; u.passwordChangedAt = now(); save();
      return { ok: true };
    },

    logout: function () {
      store.session = { userId: null, role: null, schoolId: null, name: '' };
      try { sessionStorage.removeItem('tabaani-session'); } catch (e) {}
      store.loginOtpClear();   /* لا يبقى رمز دخول معلّق بعد الخروج */
    },

    /* ------------------------------------------------ جدول الحصص والإغلاق */
    periodsOf: function (schoolId) { return store.list('periods', { schoolId: schoolId }).sort(function (a, b) { return a.index - b.index; }); },
    /** هل يمكن إغلاق التحضير الآن؟ (نهاية الحصة أو منتصفها حسب إعداد الوكيل) */
    closeWindow: function (period, dateISO) {
      var d = dateISO ? new Date(dateISO) : new Date();
      var parts = function (t) { return t.split(':').map(Number); };
      var base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var s = parts(period.start), e = parts(period.end);
      var start = new Date(base); start.setHours(s[0], s[1], 0, 0);
      var end = new Date(base); end.setHours(e[0], e[1], 0, 0);
      var mid = new Date((start.getTime() + end.getTime()) / 2);
      var limit = period.closeRule === 'mid' ? mid : new Date(end.getTime() - 60e3);
      return { start: start, mid: mid, end: end, limit: limit, allowed: d >= limit, limitLabel: period.closeRule === 'mid' ? 'منتصف الحصة' : 'نهاية الحصة' };
    },
    sessionFor: function (classId, periodId, date) {
      return store.list('sessions').find(function (s) { return s.classId === classId && s.periodId === periodId && s.date === date; }) || null;
    },
    openSession: function (data) {
      var s = store.sessionFor(data.classId, data.periodId, data.date);
      if (s) return s;
      return store.insert('sessions', Object.assign({
        id: uid('ses'), schoolId: data.schoolId || store.session.schoolId, status: 'open',
        openedAt: now(), records: [], closedAt: null
      }, data));
    },
    saveAttendance: function (sessionId, records) {
      var s = store.find('sessions', sessionId); if (!s) return null;
      s.records = records; save(); return s;
    },
    closeSession: function (sessionId) {
      var s = store.find('sessions', sessionId); if (!s) return null;
      s.status = 'closed'; s.closedAt = now(); save();
      var absent = s.records.filter(function (r) { return r.status === 'absent'; });
      var late = s.records.filter(function (r) { return r.status === 'late'; });
      var cls = store.klass(s.classId);
      var who = function (r) { return (store.student(r.studentId) || {}).name; };
      var lines = [];
      if (absent.length) lines.push('الغائبون (' + absent.length + '): ' + absent.map(who).join('، '));
      if (late.length) lines.push('المتأخرون (' + late.length + '): ' + late.map(who).join('، '));
      var body = lines.length ? lines.join('\n') : 'لا يوجد غياب أو تأخر.';
      store.telegram && store.telegram();
      store.notify({
        kind: 'attendance', ref: s.id, title: 'تقرير تحضير — ' + (cls ? cls.name : '') + ' / ' + s.subject,
        body: body, to: ['deputy', 'principal'], at: now()
      });
      store.tg([
        { to: 'deputy', text: '📋 تحضير ' + (cls ? cls.name : '') + ' — ' + s.subject + '\n' + body },
        { to: 'principal', text: '📋 تحضير ' + (cls ? cls.name : '') + ' — ' + s.subject + '\n' + body }
      ]);
      return s;
    },

    /* --------------------------------------------------------- الإشعارات */
    notify: function (n) {
      n.id = n.id || uid('nt'); n.at = n.at || now(); n.read = false;
      if (!db.notif) db.notif = [];
      db.notif.push(n); save(); return n;
    },
    /** صندوق الإشعارات: إشعارات الأدوار + الإشعارات الموجَّهة إليّ بالاسم (الرسائل الخاصة) */
    inbox: function (roles) {
      var rs = [].concat(roles || [store.session.role]);
      var me = store.session.userId;
      return (store.db.notif || []).filter(function (n) {
        /* إشعار موجَّه لمستخدم بعينه: لا يراه غيره أبدًا */
        if (n.toUsers && n.toUsers.length) return n.toUsers.indexOf(me) > -1;
        return !n.to || n.to.some(function (r) { return rs.indexOf(r) > -1; });
      }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    },
    /** يعلّم المقروء ما يخصّني فقط (لا يمسّ إشعارات الآخرين) */
    markRead: function () {
      var me = store.session.userId, role = store.session.role;
      (store.db.notif || []).forEach(function (n) {
        if (n.toUsers && n.toUsers.length) { if (n.toUsers.indexOf(me) > -1) n.read = true; return; }
        if (!n.to || n.to.indexOf(role) > -1) n.read = true;
      });
      save();
    },

    /* ------------------------------------- الرسائل الخاصة (من مستخدم إلى مستخدم) */
    sendMessage: function (data) {
      var d = data || {};
      var to = store.user(d.toUserId);
      if (!to) return null;
      var m = store.insert('messages', {
        id: uid('ms'), schoolId: store.session.schoolId,
        toUserId: to.id, toName: to.name, toRole: to.role,
        fromUserId: store.session.userId, fromName: store.session.name, fromRole: store.session.role,
        subject: d.subject || '', body: d.body || '', kind: d.kind || 'note',
        refType: d.refType || '', refId: d.refId || '', at: now(), read: false
      });
      store.notify({
        kind: d.kind || 'message', ref: m.refId || m.id,
        title: d.subject || 'رسالة خاصة جديدة',
        body: (d.body || '').slice(0, 140),
        toUsers: [to.id]
      });
      return m;
    },
    messagesFor: function (userId) {
      var id = userId || store.session.userId;
      return store.list('messages', { toUserId: id }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    },
    sentMessages: function (userId) {
      var id = userId || store.session.userId;
      return store.list('messages', { fromUserId: id }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    },
    unreadMessages: function (userId) {
      return store.messagesFor(userId).filter(function (m) { return !m.read; }).length;
    },
    readMessage: function (messageId) {
      var m = store.find('messages', messageId);
      if (m && !m.read) { m.read = true; m.readAt = now(); save(); }
      return m;
    },
    readAllMessages: function (userId) {
      store.messagesFor(userId).forEach(function (m) { if (!m.read) { m.read = true; m.readAt = now(); } });
      save();
    },

    /* -------------------------------- تلقرام: الإعدادات والإرسال الفعلي ---------------- */
    /* أوضاع الإرسال: sim (محاكاة) · relay (وسيط يخفي التوكن — موصى به) · direct (توكن في المتصفح — تجريبي) */
    telegramConfig: function () {
      var t = (db.settings && db.settings.telegram) || {};
      return {
        mode: t.mode || 'sim', relayUrl: t.relayUrl || '', relayKey: t.relayKey || '',
        botToken: t.botToken || '', chatId: t.chatId || '', perSchool: !!t.perSchool,
        botUsername: t.botUsername || '', botName: t.botName || '',
        lastTest: t.lastTest || null, lastTestOk: !!t.lastTestOk, lastTestMsg: t.lastTestMsg || ''
      };
    },
    saveTelegramConfig: function (patch) {
      if (!db.settings) db.settings = {};
      db.settings.telegram = Object.assign({}, store.telegramConfig(), patch || {});
      save(); return store.telegramConfig();
    },
    /** إيقاف/تشغيل الإرسال مؤقتًا (يتذكر الوضع السابق) */
    telegramPause: function (pause) {
      var c = store.telegramConfig();
      if (pause) return store.saveTelegramConfig({ prevMode: (c.mode === 'sim' ? (c.prevMode || 'direct') : c.mode), mode: 'sim' });
      return store.saveTelegramConfig({ mode: c.prevMode || 'direct' });
    },
    telegramPaused: function () { return store.telegramConfig().mode === 'sim'; },
    /** هل الإرسال الحقيقي جاهز؟ */
    telegramReady: function () {
      var c = store.telegramConfig();
      var dest = store.telegramFor(store.session.schoolId);
      if (c.mode === 'relay') return !!c.relayUrl && !!dest.chatId;
      if (c.mode === 'direct') return !!c.botToken && !!dest.chatId;
      return false;
    },
    /** مجموعة/قناة المدرسة: لكل مدرسة معرّفها، ويُسقط على المعرّف العام عند غيابه */
    schoolChatId: function (schoolId) {
      return store.telegramFor(schoolId).chatId;
    },
    /** وجهة الإرسال الفعلية للمدرسة: مجموعة خاصة إن وُجدت، وبوت خاص إن وُجد، وإلا إعدادات تابعني */
    telegramFor: function (schoolId) {
      var id = schoolId || store.session.schoolId;
      var sc = (db.schools || []).filter(function (x) { return x.id === id; })[0];
      var c = store.telegramConfig();
      var out = { chatId: c.chatId, botToken: c.botToken, school: sc || null, own: false };
      if (sc && sc.telegramChatId) { out.chatId = sc.telegramChatId; out.own = true; }
      if (sc && sc.telegramBotToken) { out.botToken = sc.telegramBotToken; out.own = true; }
      return out;
    },
    setSchoolChatId: function (schoolId, chatId) {
      var sc = (db.schools || []).filter(function (x) { return x.id === schoolId; })[0];
      if (!sc) return null;
      sc.telegramChatId = String(chatId || '').trim();
      save(); return sc.telegramChatId;
    },
    setSchoolBotToken: function (schoolId, token) {
      var sc = (db.schools || []).filter(function (x) { return x.id === schoolId; })[0];
      if (!sc) return null;
      sc.telegramBotToken = String(token || '').trim();
      save(); return sc.telegramBotToken;
    },
    /** إرسال رسالة فعلية حسب الوضع المُعدّ — مع رجوع تلقائي للإرسال المباشر إن فشل الوسيط.
        chatOverride: محادثة بعينها (chat_id شخصي لمعلم) بدلًا من مجموعة المدرسة. */
    telegramSend: function (text, schoolId, chatOverride) {
      var sid = schoolId || store.session.schoolId;
      if (sid && !store.isPro(sid)) {
        return Promise.resolve({ ok: false, pro: false,
          error: 'تلقرام غير مشمول في باقة «تابعني كلاسيك» — رقّي المدرسة إلى «تابعني برو» لتفعيله' });
      }
      var c = store.telegramConfig();
      var dest = store.telegramFor(schoolId);
      var chat = String(chatOverride || dest.chatId || '').trim();
      var token = dest.botToken || c.botToken;
      function direct() {
        if (!token || !chat) return Promise.resolve({ ok: false, detail: 'لا يوجد رمز بوت أو معرّف محادثة' });
        return fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text: text })
        }).then(function (r) { return r.json(); })
          .then(function (j) { return { ok: !!j.ok, detail: j.description || '' }; })
          .catch(function (e) { return { ok: false, detail: String((e && e.message) || e) }; });
      }
      function fallback(reason) {
        if (!token || !chat) return Promise.resolve(reason);
        return direct().then(function (d) { d.viaFallback = true; d.detail = d.detail || ''; return d; });
      }
      if (c.mode === 'relay' && c.relayUrl) {
        return fetch(c.relayUrl, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ key: c.relayKey, chat_id: chat, text: text })
        }).then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
          .then(function (j) {
            var res = { ok: !!j.ok, detail: j.description || j.error || '' };
            return res.ok ? res : fallback(res);          /* الوسيط لم يُرسل ⇒ جرّب المباشر */
          })
          .catch(function (e) { return fallback({ ok: false, detail: String((e && e.message) || e) }); });
      }
      return direct();
    },
    /** فحص وسيط: يقرأ ردّ الوسيط للتأكد أنه منشور ويعمل */
    telegramRelayCheck: function (url) {
      var c = store.telegramConfig();
      var target = (url || c.relayUrl || '').trim();
      if (!target) return Promise.resolve({ ok: false, error: 'لا يوجد رابط وسيط' });
      return fetch(target + (target.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(c.relayKey || '') + '&action=ping', { method: 'GET' })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          if (!j) return { ok: false, error: 'الرد ليس JSON — تأكد أنك نشرت كـ Web app بصلاحية «Anyone»', raw: t.slice(0, 80) };
          return { ok: !!j.ok, app: j.app || '', ready: !!j.ready, error: j.error || '' };
        })
        .catch(function (e) { return { ok: false, error: 'تعذّر الوصول للوسيط: ' + String((e && e.message) || e) }; });
    },
    telegramTest: function (text) {
      return store.telegramSend(text || 'رسالة تجريبية من تابعني — الإرسال يعمل ✓', null).then(function (r) {
        store.saveTelegramConfig({ lastTest: now(), lastTestOk: r.ok, lastTestMsg: r.detail || '' });
        return r;
      });
    },
    /* ------------------------ تلقرام: المحادثة الشخصية لكل معلم ------------------------ */
    /** إرسال خاص إلى chat_id بعينه (يعمل حتى لو لم تُضبط مجموعة المدرسة) */
    telegramSendTo: function (chatId, text) { return store.telegramSend(text, null, chatId); },
    /** يضبط المحادثة الشخصية لمستخدم (chat_id من بوت تلقرام) */
    setTelegramChatId: function (userId, chatId) {
      var u = store.user(userId); if (!u) return null;
      u.telegramChatId = String(chatId || '').trim();
      save(); return u.telegramChatId;
    },
    hasTelegramChat: function (userId) { var u = store.user(userId); return !!(u && String(u.telegramChatId || '').trim()); },
    /** هل الإرسال الفعلي متاح (بوت مباشر أو وسيط منشور)؟ */
    telegramSendable: function () {
      var c = store.telegramConfig();
      return c.mode === 'relay' ? !!c.relayUrl : !!c.botToken;
    },

    /* ------------------------------------- تلقرام: السجل (يُرسل فعليًا إن كان مُعدًّا) */
    tg: function (messages) {
      var ready = store.telegramReady();
      [].concat(messages).forEach(function (m) {
        /* موجَّه لمستخدم بعينه (معلم محدد) وإلا فأول صاحب الدور */
        var chat = m.toUserId ? store.user(m.toUserId) : null;
        if (!chat) chat = store.usersByRole(m.to)[0] || store.usersByRole(m.to, null)[0];
        if (!chat) chat = store.list('users').find(function (u) { return u.role === m.to; });
        /* إن كان للمستخدم محادثة شخصية ⇒ رسالة خاصة إليه، وإلا مجموعة المدرسة */
        var personal = String((chat && chat.telegramChatId) || '').trim();
        var cfg = store.telegramConfig();
        var canSend = personal ? store.telegramSendable() : ready;
        var rec = {
          id: uid('tg'), to: (chat && chat.role) || m.to, toName: chat ? chat.name : m.to,
          chat: personal || (chat ? chat.telegram : ''), private: !!personal,
          schoolId: (chat && chat.schoolId) || store.session.schoolId,
          text: m.text, at: now(), status: canSend ? 'sending' : 'queued', via: canSend ? cfg.mode : 'queued'
        };
        db.telegram.unshift(rec);
        if (canSend) {
          store.telegramSend(m.text, rec.schoolId, personal || null).then(function (r) {
            rec.status = r.ok ? 'sent' : 'failed';
            rec.via = r.viaFallback ? 'fallback' : cfg.mode;
            rec.error = r.ok ? '' : (r.detail || '');
            rec.sentAt = now();
            save();
          });
        }
      });
      if (db.telegram.length > 200) db.telegram.length = 200;
      save();
    },

    /* ----------------------------------------------------- المخالفات السلوكية */
    createViolation: function (data) {
      var seq = store.list('violations').length + 1;
      var v = store.insert('violations', Object.assign({
        id: uid('vi'), schoolId: store.session.schoolId,
        number: 'V-' + new Date().getFullYear() + '-' + String(seq).padStart(4, '0'),
        status: 'guidance_pending', createdAt: now(), guidance: null, action: null,
        timeline: [{ at: now(), by: store.session.name, text: 'تسجيل المخالفة من المعلم' }]
      }, data));
      store.notify({ kind: 'violation', ref: v.id, title: 'مخالفة سلوكية جديدة — ' + store.safe(v.type), body: store.safe((store.student(v.studentId) || {}).name) + ' · ' + store.safe(v.description || v.note, 'بلا وصف'), to: ['guidance', 'deputy'] });
      store.tg([
        { to: 'guidance', text: '⚠️ مخالفة سلوكية جديدة\n' + store.safe((store.student(v.studentId) || {}).name) + ' — ' + store.safe(v.type) + '\n' + store.safe(v.description || v.note, 'بلا وصف') },
        { to: 'deputy', text: '⚠️ مخالفة سلوكية جديدة\n' + store.safe((store.student(v.studentId) || {}).name) + ' — ' + store.safe(v.type) + '\n' + store.safe(v.description || v.note, 'بلا وصف') }
      ]);
      return v;
    },
    guidanceRespond: function (violationId, procedure, options) {
      var v = store.find('violations', violationId); if (!v) return null;
      v.guidance = { procedure: procedure, options: options || [], at: now(), by: store.session.name };
      v.status = 'deputy_pending';
      (v.timeline = v.timeline || []).push({ at: now(), by: store.session.name, text: 'رد التوجيه والإرشاد: ' + procedure });
      save();
      store.notify({ kind: 'violation', ref: v.id, title: 'رد التوجيه على مخالفة ' + (store.student(v.studentId) || {}).name, body: procedure, to: ['deputy'] });
      store.tg({ to: 'deputy', text: '🧭 رد التوجيه والإرشاد\n' + (store.student(v.studentId) || {}).name + '\nالإجراء المقترح: ' + procedure });
      return v;
    },
    /** تنفيذ اللائحة: خصم درجة (اختياري) + ملاحظة */
    applyViolationAction: function (violationId, action) {
      var v = store.find('violations', violationId); if (!v) return null;
      v.action = Object.assign({ at: now(), by: store.session.name }, action);
      v.status = 'closed'; v.closedAt = now();
      (v.timeline = v.timeline || []).push({
        at: now(), by: store.session.name,
        text: 'تنفيذ الإجراء' + (action.deduct ? ' — خصم ' + action.deduct + ' درجة' : '') + (action.note ? ' · ' + action.note : '')
      });
      save();
      var report = store.registerReport('violation', v.id, { title: 'تقرير مخالفة سلوكية — ' + v.number });
      store.notify({ kind: 'violation', ref: v.id, title: 'إغلاق مخالفة ' + v.number, body: 'أُغلق الطلب ونُفّذ الإجراء', to: ['teacher', 'guidance', 'principal'] });
      store.tg([
        { to: 'teacher', text: '✅ أُغلقت المخالفة ' + v.number + '\nالطالب: ' + (store.student(v.studentId) || {}).name + '\nالإجراء: ' + (action.label || '') + (action.deduct ? ' (خصم ' + action.deduct + ' درجة)' : '') },
        { to: 'guidance', text: '✅ أُغلقت المخالفة ' + v.number + ' — تقرير مفصل جاهز للطباعة.' },
        { to: 'principal', text: '✅ أُغلقت المخالفة ' + v.number + ' — تقرير مفصل في مركز التقارير.' }
      ]);
      return { violation: v, report: report };
    },

    /* ------------------------------------------------------------ الاستئذان */
    createPermission: function (data) {
      var seq = store.list('permissions').length + 1;
      var p = store.insert('permissions', Object.assign({
        id: uid('pm'), schoolId: store.session.schoolId,
        number: 'P-' + new Date().getFullYear() + '-' + String(seq).padStart(4, '0'),
        status: 'deputy_pending', createdAt: now(), granted: null, exitNo: ''
      }, data));
      store.notify({ kind: 'permission', ref: p.id, title: 'طلب استئذان جديد ' + p.number, body: 'من التوجيه والإرشاد · ' + ((store.student(p.studentId) || {}).name), to: ['deputy'] });
      store.tg({ to: 'deputy', text: '🕐 طلب استئذان جديد ' + store.safe(p.number) + '\n' + store.safe((store.student(p.studentId) || {}).name) + '\nالسبب: ' + store.safe(p.reason, 'غير مذكور') });
      return p;
    },
    grantPermission: function (permissionId, via) {
      var p = store.find('permissions', permissionId); if (!p) return null;
      p.status = 'granted'; p.granted = { at: now(), by: store.session.name, via: via || 'platform' };
      p.exitNo = 'EX-' + p.number.replace(/\D/g, '');
      save();
      store.telegram && store.telegram();
      store.tg([
        { to: 'guidance', text: '✅ مُنح الاستئذان ' + p.number + ' عبر ' + (via || 'تابعني') + '\nتصريح الخروج: ' + p.exitNo },
        { to: 'teacher', text: 'ℹ️ خروج الطالب ' + ((store.student(p.studentId) || {}).name) + ' — تصريح ' + p.exitNo + ' (الحصة ' + ((store.period(p.periodId) || {}).index || '') + ')' }
      ]);
      store.notify({ kind: 'permission', ref: p.id, title: 'مُنح الاستئذان ' + p.number, body: 'تصريح خروج: ' + p.exitNo, to: ['guidance', 'teacher'] });
      return p;
    },

    /* =======================================================================
       إذن دخول الفصل (الطالب المتأخر)
       يصدره وكيل شؤون الطلاب أو التوجيه والإرشاد لمعلم الحصة، ويصل بثلاث طرق:
       ورقي (مطبوع بترويسة المدرسة وباركود) · رسالة تلقرام · رسالة خاصة في تابعني.
       الحقل الإلزامي فيه: سبب تأخّر الطالب.
       ======================================================================= */
    entryPermitNumber: function () {
      var seq = store.list('entryPermits').length + 1;
      return 'EN-' + new Date().getFullYear() + '-' + String(seq).padStart(4, '0');
    },
    entryPermits: function (f) {
      f = f || {};
      return store.list('entryPermits').filter(function (x) {
        if (f.schoolId && x.schoolId !== f.schoolId) return false;
        if (f.teacherId && x.teacherId !== f.teacherId) return false;
        if (f.studentId && x.studentId !== f.studentId) return false;
        if (f.date && x.date !== f.date) return false;
        if (f.issuedBy && x.issuedBy !== f.issuedBy) return false;
        return true;
      }).sort(function (a, b) { return (b.issuedAt || '').localeCompare(a.issuedAt || ''); });
    },
    findEntryPermit: function (id) { return store.find('entryPermits', id); },
    entryPermitsToday: function () { return store.entryPermits({ date: new Date().toISOString().slice(0, 10) }); },
    /** حالة الإذن: أُصدر · اطّلع عليه المعلم · أقرّ باستلامه */
    entryPermitState: function (x) {
      if (!x) return { id: 'unknown', label: '—', tone: 'plain' };
      if (x.ack) return { id: 'ack', label: 'أقرّ المعلم بالاستلام', tone: 'mint', at: x.ack.at, by: x.ack.by };
      if (x.seen) return { id: 'seen', label: 'اطّلع عليه المعلم', tone: 'gold', at: x.seen.at };
      return { id: 'issued', label: 'لم يطّلع عليه بعد', tone: 'amber' };
    },
    /** يُصدر الإذن ويسلّمه للمعلم (رسالة خاصة + إشعار + تلقرام) */
    createEntryPermit: function (data) {
      var d = data || {};
      var st = store.student(d.studentId);
      var teacher = store.user(d.teacherId);
      if (!st) return { ok: false, error: 'اختر الطالب أولًا' };
      if (!teacher) return { ok: false, error: 'اختر المعلم المستلم للإذن' };
      if (!String(d.reason || '').trim()) return { ok: false, error: 'سبب تأخّر الطالب إلزامي' };
      var cls = store.klass(d.classId || st.classId) || {};
      var prd = store.period(d.periodId) || null;
      var at = new Date();
      var x = store.insert('entryPermits', {
        id: uid('en'), schoolId: store.session.schoolId, kind: 'class_entry',
        number: store.entryPermitNumber(), status: 'issued',
        studentId: st.id, studentName: st.name, classId: cls.id || '', className: cls.name || '',
        subject: String(d.subject || '').trim(),
        periodId: prd ? prd.id : '', periodLabel: prd ? prd.label : '',
        teacherId: teacher.id, teacherName: teacher.name,
        date: d.date || at.toISOString().slice(0, 10),
        arrivalTime: d.arrivalTime || at.toTimeString().slice(0, 5),
        lateMinutes: d.lateMinutes == null || d.lateMinutes === '' ? null : Number(d.lateMinutes),
        reason: String(d.reason).trim(),
        note: String(d.note || '').trim(),
        issuedBy: store.session.userId, issuedByName: store.session.name, issuedByRole: store.session.role,
        issuedAt: at.toISOString(), seen: null, ack: null, printed: null
      });

      /* ١) رسالة خاصة في تابعني للمعلم (+ إشعار باسمه) */
      var lines = [
        'الطالب: ' + st.name + (cls.name ? ' — ' + cls.name : ''),
        x.subject ? 'المادة: ' + x.subject : '',
        x.periodLabel ? 'الحصة: ' + x.periodLabel : '',
        'وقت الوصول: ' + x.arrivalTime + (x.lateMinutes ? ' (تأخّر ' + x.lateMinutes + ' دقيقة)' : ''),
        'سبب التأخّر: ' + x.reason,
        x.note ? 'ملاحظة: ' + x.note : '',
        'رقم الإذن: ' + x.number + ' · صادر من ' + x.issuedByName + ' (' + store.roleLabel(x.issuedByRole) + ')'
      ].filter(Boolean);
      store.sendMessage({
        toUserId: teacher.id, kind: 'entry-permit', refType: 'entryPermit', refId: x.id,
        subject: 'إذن دخول فصل — ' + st.name + ' · ' + x.number,
        body: lines.join('\n')
      });

      /* ٢) تلقرام */
      store.tg({
        to: 'teacher', toUserId: teacher.id,
        text: '\uD83D\uDD13 إذن دخول فصل ' + store.safe(x.number) +
          '\nالطالب: ' + store.safe(st.name) + (cls.name ? ' (' + store.safe(cls.name) + ')' : '') +
          '\nالمعلم: ' + store.safe(teacher.name) +
          (x.periodLabel ? '\nالحصة: ' + store.safe(x.periodLabel) : '') +
          '\nوقت الوصول: ' + store.safe(x.arrivalTime) +
          '\nسبب التأخّر: ' + store.safe(x.reason) +
          '\nصادر من: ' + store.safe(x.issuedByName) + ' (' + store.roleLabel(x.issuedByRole) + ')'
      });

      /* ٣) أثر في سجل التدقيق */
      (db.audit = db.audit || []).unshift({
        id: uid('au'), at: x.issuedAt, action: 'entry_permit_issued', by: x.issuedByName,
        text: 'إذن دخول ' + x.number + ' — ' + x.studentName + ' ← ' + x.teacherName + ' · السبب: ' + x.reason
      });
      save();
      return { ok: true, permit: x };
    },
    /** يُسجّل اطّلاع المعلم على الإذن (يُستدعى عند فتح الوحدة) */
    seenEntryPermit: function (id) {
      var x = store.find('entryPermits', id); if (!x || x.seen) return x;
      x.seen = { at: now(), by: store.session.name }; save(); return x;
    },
    /** إقرار المعلم باستلام الطالب في الحصة */
    ackEntryPermit: function (id) {
      var x = store.find('entryPermits', id); if (!x) return null;
      x.ack = { at: now(), by: store.session.name, userId: store.session.userId };
      if (!x.seen) x.seen = { at: x.ack.at, by: store.session.name };
      save();
      store.notify({
        kind: 'entry-permit', ref: x.id, toUsers: [x.issuedBy],
        title: 'إقرار استلام: ' + x.studentName,
        body: 'أقرّ ' + store.session.name + ' باستلام الطالب في الحصة — ' + x.number
      });
      store.tg({
        to: x.issuedByRole,
        text: '\u2705 إقرار استلام — ' + store.safe(x.studentName) + '\nأقرّ ' + store.safe(store.session.name) + ' بدخوله الحصة (' + store.safe(x.number) + ')'
      });
      return x;
    },

    /* ------------------------------------------------- الطلاب: الإسكان والنقل */
    studentsOf: function (classId) { return store.list('students', { classId: classId }); },
    unhoused: function (schoolId) {
      return store.list('students').filter(function (s) {
        return !s.classId && (!schoolId || s.schoolId === schoolId) && s.status !== 'transferred-out';
      });
    },
    studentClass: function (studentId) {
      var st = store.student(studentId); return st && st.classId ? store.klass(st.classId) : null;
    },
    /** نقل طالب (أو مجموعة) من فصل إلى فصل مع تحديث أعداد الفصول وسجل النقل */
    transferStudent: function (studentId, toClassId, note) {
      var st = store.student(studentId);
      if (!st) return { ok: false, error: 'الطالب غير موجود' };
      var to = store.klass(toClassId);
      if (!to) return { ok: false, error: 'الفصل الهدف غير موجود' };
      var from = st.classId ? store.klass(st.classId) : null;
      if (from && from.id === to.id) return { ok: false, error: 'الطالب في هذا الفصل أصلًا' };
      st.classId = toClassId;
      st.grade = to.grade; st.stage = to.stage; st.section = to.section;
      var seat = store.studentsOf(toClassId).length;
      st.seat = seat;
      if (from) from.students = store.studentsOf(from.id).length;
      to.students = store.studentsOf(toClassId).length;
      var rec = {
        id: uid('tr'), schoolId: st.schoolId, studentId: studentId, studentName: st.name,
        fromClassId: from ? from.id : null, fromName: from ? from.name : 'غير مسكّن',
        toClassId: to.id, toName: to.name, at: now(), by: store.session.name || 'النظام', note: note || ''
      };
      db.transfers.unshift(rec);
      save();
      store.notify({ kind: 'student', ref: rec.id, title: 'نقل طالب: ' + st.name,
        body: (from ? from.name : 'غير مسكّن') + ' ← ' + to.name + (note ? ' · ' + note : ''), to: ['deputy'] });
      return { ok: true, record: rec };
    },
    /** إسكان دفعة من الطلاب في فصل واحد */
    houseStudents: function (studentIds, toClassId, note) {
      var ok = 0, errors = [];
      [].concat(studentIds).forEach(function (id) {
        var r = store.transferStudent(id, toClassId, note);
        if (r.ok) ok++; else errors.push(r.error);
      });
      return { ok: ok, errors: errors };
    },
    transfersOf: function (studentId) {
      return store.list('transfers').filter(function (t) { return !studentId || t.studentId === studentId; });
    },

    /* ================= الإسناد: تثبيت الوكيل + جدول الحصص ================= */

    /** تطبيع النص العربي للمقارنة (تشكيل/همزات/أل التعريف/الألقاب) */
    normalizeAr: function (v) {
      return String(v == null ? '' : v)
        .replace(/[\u064B-\u0652\u0670\u0640\u200f\u200e]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
        .replace(/^[\s\-_.]+/, '')
        .replace(/^(دكتور|دكتوره|استاذ|استاذه|مهندس|الاستاذ|أ|ا|د|م)\s*\.?\s+/u, '')
        .replace(/^ال/, '')
        .replace(/\s+/g, ' ')
        .trim();
    },
    /** مطابقة اسم ضمن قائمة (تطابق تام ثم احتواء) */
    matchByName: function (list, name, getter) {
      var target = store.normalizeAr(name);
      if (!target) return null;
      var g = getter || function (x) { return x.name; };
      var exact = list.find(function (x) { return store.normalizeAr(g(x)) === target; });
      if (exact) return exact;
      return list.find(function (x) {
        var n = store.normalizeAr(g(x));
        return n && (n.indexOf(target) > -1 || target.indexOf(n) > -1);
      }) || null;
    },

    /** الفصول والمواد المُختارة للمعلم (قبل التثبيت) */
    teacherPlan: function (teacherId) {
      var u = store.user(teacherId);
      if (!u) return { classes: [], subjects: [] };
      return {
        classes: (u.classIds || []).map(function (id) { return store.klass(id); }).filter(Boolean),
        subjects: (u.subjects || []).slice()
      };
    },

    /** إسنادات المعلم المثبّتة فقط (لا يرى المعلم غيرها) */
    lockedAssignmentsOf: function (teacherId) {
      var u = store.user(teacherId);
      if (!u || !u.locked) return [];
      return store.assignmentsOf(teacherId);
    },

    /**
     * تثبيت الوكيل: يُنشئ إسنادات (فصل × مادة) من اختيار المدير، ويثبّتها للمعلم.
     * بعد التثبيت لا يصل المعلم إلا إلى فصوله ومواده.
     */
    lockTeacherAssignments: function (teacherId, note) {
      var u = store.user(teacherId);
      if (!u) return { ok: false, error: 'المعلم غير موجود' };
      var classes = (u.classIds || []);
      var subjects = (u.subjects || []);
      if (!classes.length || !subjects.length) {
        return { ok: false, error: 'حدّد فصول المعلم ومواده قبل التثبيت' };
      }
      var created = 0, existing = 0;
      classes.forEach(function (classId) {
        subjects.forEach(function (subject) {
          var dup = store.list('assignments').find(function (a) {
            return a.teacherId === teacherId && a.classId === classId && a.subject === subject;
          });
          if (dup) { existing++; return; }
          store.insert('assignments', {
            schoolId: u.schoolId, teacherId: teacherId, classId: classId, subject: subject,
            periods: [], weekly: 0, source: 'deputy-lock'
          });
          created++;
        });
      });
      u.locked = true;
      u.lockedAt = now();
      u.lockedBy = store.session.name || 'وكيل شؤون الطلاب';
      u.lockNote = note || '';
      save();
      store.notify({
        kind: 'assignment', ref: teacherId, title: 'تثبيت إسناد المعلم: ' + u.name,
        body: classes.length + ' فصول × ' + subjects.length + ' مواد — أُنشئ ' + created + ' إسنادًا',
        to: ['deputy', 'principal', 'teacher']
      });
      store.tg({
        to: 'teacher',
        text: '✅ ثُبّت إسنادك في تابعني\nالفصول: ' + store.teacherPlan(teacherId).classes.map(function (c) { return c.name; }).join('، ') +
          '\nالمواد: ' + subjects.join('، ') + '\nلم يظهر لك في التحضير إلا فصولك.'
      });
      return { ok: true, created: created, existing: existing, classes: classes.length, subjects: subjects.length };
    },
    unlockTeacher: function (teacherId) {
      var u = store.user(teacherId);
      if (!u) return { ok: false, error: 'المعلم غير موجود' };
      u.locked = false; u.unlockedAt = now(); u.unlockedBy = store.session.name || '';
      save();
      return { ok: true };
    },

    /** إسناد حصة (رقم) لمادة وفصل ومعلم — يُنشئ الإسناد إن لم يوجد */
    assignPeriod: function (teacherId, classId, subject, periodIndex) {
      var a = store.list('assignments').find(function (x) {
        return x.teacherId === teacherId && x.classId === classId && store.normalizeAr(x.subject) === store.normalizeAr(subject);
      });
      if (!a) {
        a = store.insert('assignments', {
          schoolId: store.session.schoolId, teacherId: teacherId, classId: classId, subject: subject,
          periods: [], weekly: 0, source: 'schedule-import'
        });
      }
      a.periods = a.periods || [];
      if (periodIndex && a.periods.indexOf(periodIndex) === -1) a.periods.push(periodIndex);
      a.periods.sort(function (x, y) { return x - y; });
      a.weekly = a.periods.length;
      save();
      return a;
    },

    /**
     * استيراد جدول الحصص من ملف: كل صف { day, period, className, subject, teacherName }
     * يربط الفصل والمادة والمعلم الموجودين، ويُسند الحصص، ويُعيد تقرير المطابقة.
     */
    importSchedule: function (rows) {
      var schoolId = store.session.schoolId || (store.db.schools[0] || {}).id;
      var periods = store.periodsOf(schoolId);
      var classes = store.list('classes', { schoolId: schoolId });
      var users = store.list('users', { schoolId: schoolId });
      var subjects = store.subjectsFor(store.stagesOf(schoolId));
      var summary = { total: rows.length, assigned: 0, created: 0, skipped: 0,
        unmatchedClass: [], unmatchedTeacher: [], unmatchedSubject: [], unmatchedPeriod: [] };
      rows.forEach(function (r) {
        if (!r.className && !r.teacherName) { summary.skipped++; return; }
        var k = store.matchByName(classes, r.className);
        var t = store.matchByName(users.filter(function (u) { return u.role === 'teacher'; }), r.teacherName);
        var subj = r.subject ? (store.matchByName(subjects.map(function (s) { return { name: s }; }), r.subject) || {}).name : null;
        if (r.subject && !subj) { subj = r.subject; if (!store.matchByName(subjects.map(function (s) { return { name: s }; }), r.subject)) summary.unmatchedSubject.push(r.subject); }
        var pIdx = null;
        if (r.period) {
          var p = periods.find(function (x) { return String(x.index) === String(r.period) || store.normalizeAr(x.label) === store.normalizeAr(r.period); });
          pIdx = p ? p.index : parseInt(r.period, 10) || null;
          if (!pIdx) summary.unmatchedPeriod.push(r.period);
        }
        if (!k) { summary.unmatchedClass.push(r.className || '—'); summary.skipped++; return; }
        if (!t) { summary.unmatchedTeacher.push(r.teacherName || '—'); summary.skipped++; return; }
        var before = store.list('assignments').filter(function (a) { return a.teacherId === t.id && a.classId === k.id; }).length;
        store.assignPeriod(t.id, k.id, subj || 'غير محددة', pIdx);
        var after = store.list('assignments').filter(function (a) { return a.teacherId === t.id && a.classId === k.id; }).length;
        if (after > before) summary.created++;
        summary.assigned++;
      });
      store.save();
      return summary;
    },

    /* ---------------------------------------------------------- التطوع */
    registerProgram: function (programId, studentId) {
      var exists = store.list('programRegs').find(function (r) { return r.programId === programId && r.studentId === studentId; });
      if (exists) return exists;
      var reg = store.insert('programRegs', { programId: programId, studentId: studentId, status: 'pending', hours: 0, at: now() });
      store.notify({ kind: 'volunteer', ref: reg.id, title: 'تسجيل جديد في برنامج تطوعي', body: ((store.student(studentId) || {}).name) + ' — ' + ((store.find('programs', programId) || {}).title), to: ['volunteer'] });
      return reg;
    },

    /* --------------------------------------------------------- النشاط الطلابي */
    createActivityRequest: function (data) {
      var r = store.insert('activityReqs', Object.assign({ id: uid('ar'), status: 'pending', createdAt: now(), note: '' }, data));
      store.notify({ kind: 'activity', ref: r.id, title: 'طلب مشاركة في نشاط', body: ((store.student(r.studentId) || {}).name) + ' — ' + ((store.find('activities', r.activityId) || {}).title), to: ['teacher'] });
      store.tg({ to: 'teacher', text: '🎯 طلب مشاركة في نشاط\nالطالب: ' + store.safe((store.student(r.studentId) || {}).name) + '\nالمدة خارج الصف: ' + store.safe(r.duration) + ' دقيقة\nالسبب: ' + store.safe(r.reason, 'غير مذكور') });
      return r;
    },
    decideActivityRequest: function (reqId, decision, note) {
      var r = store.find('activityReqs', reqId); if (!r) return null;
      r.status = decision; r.note = note || ''; r.decidedAt = now(); r.decidedBy = store.session.name;
      save();
      store.notify({ kind: 'activity', ref: r.id, title: (decision === 'approved' ? 'قبول' : 'اعتذار') + ' طلب نشاط', body: ((store.student(r.studentId) || {}).name) + (note ? ' · ' + note : ''), to: ['activity', 'student'] });
      return r;
    },

    /* ============================ المناوبة (وكيل شؤون المعلمين) ============================ */
    dutyLocations: function (schoolId) {
      return store.list('dutyLocations').filter(function (l) { return !schoolId || l.schoolId === schoolId; });
    },
    addDutyLocation: function (name, note) {
      var l = store.insert('dutyLocations', { schoolId: store.session.schoolId, name: name, note: note || '', createdAt: now() });
      return l;
    },
    removeDutyLocation: function (id) { store.remove('dutyLocations', id); },
    locationName: function (id) { var l = store.find('dutyLocations', id); return l ? l.name : '—'; },

    /** مناوبات يوم معيّن (YYYY-MM-DD) */
    dutiesOf: function (date, schoolId) {
      return store.list('duties').filter(function (d) {
        return d.date === date && (!schoolId || d.schoolId === schoolId);
      });
    },
    dutiesBetween: function (from, to, schoolId) {
      return store.list('duties').filter(function (d) {
        return d.date >= from && d.date <= to && (!schoolId || d.schoolId === schoolId);
      }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    },
    dutyFor: function (teacherId, date) {
      return store.list('duties').find(function (d) { return d.teacherId === teacherId && d.date === date; }) || null;
    },
    /** مناوبة اليوم للمستخدم الحالي (لأجل اللافتة بعد الدخول) */
    todayDutyFor: function (userId, date) {
      return store.dutyFor(userId, date || new Date().toISOString().slice(0, 10));
    },
    dutySlots: DUTY_SLOTS,
    slotName: function (id) { var s = DUTY_SLOTS.find(function (x) { return x.id === id; }); return s ? s.name : id; },
    slotsLabel: function (slots) { return (slots || []).map(store.slotName).join(' · ') || 'الفترات لم تُحدّد'; },
    /** من يناوب عند خروج الطلاب في يوم معيّن */
    exitDutyOf: function (date) {
      return store.dutiesOf(date).filter(function (d) { return (d.slots || []).indexOf('exit') > -1; });
    },
    setDuty: function (data) {
      var dup = store.list('duties').find(function (d) { return d.teacherId === data.teacherId && d.date === data.date; });
      if (dup) { store.update('duties', dup.id, { locationId: data.locationId, shift: data.shift, slots: data.slots || dup.slots }); return dup; }
      return store.insert('duties', Object.assign({
        schoolId: store.session.schoolId, status: 'scheduled', createdAt: now(),
        createdBy: store.session.name || 'وكيل شؤون المعلمين', reminderAt: null, ackAt: null
      }, data));
    },
    removeDuty: function (id) { store.remove('duties', id); },
    ackDuty: function (id) {
      var d = store.find('duties', id); if (!d) return null;
      d.ackAt = now(); d.status = 'acknowledged'; save(); return d;
    },

    /**
     * توزيع آلي عادل: يوزّع المعلمين على الأيام المطلوبة (بلا تكرار لنفس المعلم في اليوم نفسه)،
     * ويرتّبهم تصاعديًا حسب عدد مناوباتهم السابقة، ثم يعيّن أماكنهم بالتتابع.
     */
    autoDistribute: function (opts) {
      var from = opts.from, to = opts.to;
      var perDay = Math.max(1, opts.teachersPerDay || 2);
      var locIds = opts.locationIds && opts.locationIds.length ? opts.locationIds : store.dutyLocations(store.session.schoolId).map(function (l) { return l.id; });
      var slotIds = (opts.slots && opts.slots.length) ? opts.slots : ['break', 'transitions', 'exit'];
      var teachers = store.usersByRole('teacher', store.session.schoolId).filter(function (t) { return opts.excludeIds ? opts.excludeIds.indexOf(t.id) === -1 : true; });
      if (!teachers.length || !locIds.length) return { ok: false, error: 'لا يوجد معلمون أو أماكن مناوبة' };
      var days = [];
      var d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00');
      while (d <= end) {
        var dow = d.getDay();                      /* 5 = الجمعة، 6 = السبت (نهاية الأسبوع) */
        if (!opts.includeWeekend && (dow === 5 || dow === 6)) { d.setDate(d.getDate() + 1); continue; }
        days.push(new Date(d)); d.setDate(d.getDate() + 1);
      }
      var load = {};
      teachers.forEach(function (t) { load[t.id] = store.list('duties').filter(function (x) { return x.teacherId === t.id; }).length; });
      var placed = 0, skipped = 0;
      days.forEach(function (day) {
        var date = day.toISOString().slice(0, 10);
        var existing = store.dutiesOf(date, store.session.schoolId).map(function (x) { return x.teacherId; });
        var pool = teachers.slice().sort(function (a, b) { return load[a.id] - load[b.id]; })
          .filter(function (t) { return existing.indexOf(t.id) === -1; });
        for (var i = 0; i < perDay; i++) {
          var t = pool[i];
          if (!t) { skipped++; continue; }
          /* كل المنصوبين يغطون الفسحة وبين الحصص، والأول منهم يناوب خروج الطلاب */
          var slots = i === 0 ? slotIds.slice() : (slotIds.indexOf('exit') > -1 ? slotIds.filter(function (x) { return x !== 'exit'; }) : slotIds.slice());
          store.setDuty({ date: date, teacherId: t.id, locationId: locIds[i % locIds.length],
                          shift: opts.shift || 'الفسحة', slots: slots });
          load[t.id]++;
          placed++;
        }
      });
      save();
      store.notify({ kind: 'duty', title: 'توزيع مناوبات جديد', body: placed + ' مناوبة من ' + from + ' إلى ' + to, to: ['teachers_deputy', 'principal'] });
      return { ok: true, placed: placed, skipped: skipped, days: days.length };
    },

    /** تذكير آلي عبر تلقرام قبل المناوبة بيوم — يُستدعى عند تشغيل تابعني وعند الطلب */
    sendDutyReminders: function (date) {
      var target = date || new Date(Date.now() + 864e5).toISOString().slice(0, 10);   /* غدًا افتراضيًا */
      var list = store.dutiesOf(target, store.session.schoolId);
      var sent = 0;
      list.forEach(function (d) {
        if (d.reminderAt) return;
        var t = store.user(d.teacherId);
        var msg = '🔔 تذكير بالمناوبة\nغدًا ' + d.date + '\nالمكان: ' + store.locationName(d.locationId) +
                  '\nالفترات: ' + store.slotsLabel(d.slots) +
                  ((d.slots || []).indexOf('exit') > -1 ? '\n⚠️ عليك مناوبة خروج الطلاب نهاية اليوم' : '');
        store.tg({ to: 'teacher', text: msg });
        d.reminderAt = now(); sent++;
      });
      if (sent) { save(); store.notify({ kind: 'duty', title: 'أُرسلت تذكيرات المناوبة', body: sent + ' رسالة لمناوبات ' + target, to: ['teachers_deputy'] }); }
      return { date: target, sent: sent, total: list.length };
    },

    dutyStats: function (schoolId) {
      var today = new Date().toISOString().slice(0, 10);
      var all = store.list('duties').filter(function (d) { return !schoolId || d.schoolId === schoolId; });
      var thisMonth = today.slice(0, 7);
      var load = {};
      all.forEach(function (d) { load[d.teacherId] = (load[d.teacherId] || 0) + 1; });
      return {
        today: all.filter(function (d) { return d.date === today; }).length,
        week: all.filter(function (d) { return d.date >= today && d.date <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10); }).length,
        month: all.filter(function (d) { return d.date.slice(0, 7) === thisMonth; }).length,
        locations: store.dutyLocations(schoolId).length,
        unreminded: all.filter(function (d) { return d.date > today && !d.reminderAt; }).length,
        loadByTeacher: load
      };
    },

    /* ------------------------------- تنبيهات الجوال ------------------------------- */
    canNotify: function () { return typeof Notification !== 'undefined'; },
    /* ===================== إذن الخروج (حارس البوابة) ===================== */
    /* مدة صلاحية تصريح الخروج: ٢٠ دقيقة افتراضيًا (قابلة للتغيير من إعدادات تابعني) */
    permitMinutes: function () {
      var m = parseInt((store.db.settings || {}).permitMinutes, 10);
      return (m && m > 0) ? m : 20;
    },
    /* حالة التصريح: صالح · منتهي · مُستخدم */
    permitState: function (p) {
      if (!p) return { state: 'unknown' };
      var mins = store.permitMinutes();
      var grantedAt = (p.granted && p.granted.at) ? new Date(p.granted.at) : null;
      var expiresAt = grantedAt ? new Date(grantedAt.getTime() + mins * 60000) : null;
      var nowMs = Date.now();
      var remainingMs = expiresAt ? (expiresAt.getTime() - nowMs) : 0;
      var used = !!p.exited;
      var expired = !!expiresAt && remainingMs <= 0;
      return {
        state: !p.granted ? 'not_granted' : (used ? 'used' : (expired ? 'expired' : 'valid')),
        minutes: mins, expiresAt: expiresAt, remainingMs: Math.max(0, remainingMs),
        remainingMin: Math.max(0, Math.ceil(remainingMs / 60000)),
        usedAt: p.exited && p.exited.at, usedBy: p.exited && p.exited.by,
        grantedAt: p.granted && p.granted.at
      };
    },
    permitExpiryLabel: function (p) {
      var st = store.permitState(p);
      if (st.state === 'valid') return 'صالح ' + st.remainingMin + ' دقيقة (حتى ' + timeOf(st.expiresAt) + ')';
      if (st.state === 'expired') return 'انتهت صلاحية التصريح';
      if (st.state === 'used') return 'مُستخدم — خرج في ' + String(st.usedAt || '').slice(11, 16);
      return 'لم يُمنح بعد';
    },
    validPermits: function () {
      return store.list('permissions').filter(function (p) { return store.permitState(p).state === 'valid'; });
    },
    /* يبحث عن التصريح برقمه: EX-20260001 أو P-2026-0001 أو رقم التقرير */
    findPermitByCode: function (code) {
      var c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!c) return null;
      var perms = store.list('permissions');
      var digits = c.replace(/\D/g, '');
      return perms.filter(function (p) {
        var ex = String(p.exitNo || '').toUpperCase().replace(/\s+/g, '');
        var no = String(p.number || '').toUpperCase().replace(/\s+/g, '');
        if (ex && ex === c) return true;
        if (no && no === c) return true;
        if (digits && ex && ex.replace(/\D/g, '') === digits) return true;
        return false;
      })[0] || null;
    },
    /* يسجّل خروج الطالب باسم الحارس بالتاريخ والوقت والسبب */
    logExit: function (data) {
      var d = data || {};
      var p = d.permissionId ? store.list('permissions').filter(function (x) { return x.id === d.permissionId; })[0] : store.findPermitByCode(d.code);
      if (!p) return { ok: false, error: 'تصريح غير معروف — تأكد من الرقم أو امسح الباركود مرة أخرى' };
      if (!p.granted) return { ok: false, error: 'هذا الطلب لم يُمنح بعد — لا يمكن تسجيل الخروج' };
      if (p.exited) return { ok: false, error: 'سبق استخدام هذا التصريح (' + (p.exited.at || '').slice(11, 16) + ') — التصريح يُستخدم مرة واحدة' };
      var pst = store.permitState(p);
      if (pst.state === 'expired') {
        return { ok: false, error: 'انتهت صلاحية التصريح — مدته ' + pst.minutes + ' دقيقة فقط (' + (pst.grantedAt || '').slice(11, 16) + '). اطلب تصريحًا جديدًا' };
      }
      var st = store.student(p.studentId) || {};
      var cls = store.klass(p.classId) || {};
      var guard = store.user(d.guardId || store.session.userId) || { name: store.session.name, id: store.session.userId };
      var at = new Date();
      var exit = {
        id: uid('ex'), schoolId: p.schoolId, permissionId: p.id, code: p.exitNo || p.number, number: p.number,
        studentId: p.studentId, studentName: st.name || '', classId: p.classId, className: cls.name || '',
        reason: String(d.reason || p.reason || '').trim(), note: String(d.note || '').trim(),
        gate: d.gate || 'البوابة الرئيسية', guardId: guard.id, guardName: guard.name || '',
        date: at.toISOString().slice(0, 10), time: at.toTimeString().slice(0, 5), at: at.toISOString()
      };
      db.exits.unshift(exit);
      p.exited = { at: exit.at, by: exit.guardName, guardId: exit.guardId, reason: exit.reason };
      p.status = 'exited';
      save();
      /* نسخ إلى حسابات: مدير المدرسة · وكيل شؤون الطلاب · التوجيه والإرشاد */
      store.notify({
        kind: 'exit', ref: exit.id, title: 'إذن خروج منتهٍ — ' + exit.studentName,
        body: exit.className + ' · ' + exit.time + ' · ' + exit.reason + ' · الحارس: ' + exit.guardName,
        to: ['principal', 'deputy', 'guidance', 'guard']
      });
      store.tg([
        { to: 'principal', text: '🚪 إذن خروج منتهٍ: ' + store.safe(exit.studentName) + ' (' + store.safe(exit.className) + ') — ' + store.safe(exit.time) + '\nالسبب: ' + store.safe(exit.reason, 'غير مذكور') + '\nالحارس: ' + store.safe(exit.guardName) + '\nالتصريح: ' + store.safe(exit.code) },
        { to: 'deputy', text: '🚪 إذن خروج منتهٍ: ' + exit.studentName + ' — ' + exit.time },
        { to: 'guidance', text: '🚪 إذن خروج منتهٍ: ' + store.safe(exit.studentName) + ' — ' + store.safe(exit.reason, 'غير مذكور') }
      ]);
      (db.audit = db.audit || []).unshift({ id: uid('au'), at: exit.at, action: 'exit_logged', by: guard.name, text: 'خروج ' + exit.studentName + ' بالتصريح ' + exit.code });
      return { ok: true, exit: exit, permit: p };
    },
    exitsLog: function (f) {
      f = f || {};
      return (store.db.exits || []).filter(function (e) {
        if (f.schoolId && e.schoolId !== f.schoolId) return false;
        if (f.date && e.date !== f.date) return false;
        if (f.from && e.date < f.from) return false;
        if (f.to && e.date > f.to) return false;
        if (f.studentId && e.studentId !== f.studentId) return false;
        if (f.guardId && e.guardId !== f.guardId) return false;
        return true;
      }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    },
    exitsToday: function () { return store.exitsLog({ date: new Date().toISOString().slice(0, 10) }); },
    pendingExits: function () {   /* تصاريح ممنوحة ولم يُسجَّل خروجها بعد */
      return store.list('permissions').filter(function (p) { return p.granted && !p.exited; });
    },
    /* ===================== بيانات تابعني: إحصاء · نسخة احتياطية · استرجاع ===================== */
    dataStats: function () {
      var d = store.db;
      return {
        schools: (d.schools || []).length, students: (d.students || []).length,
        users: (d.users || []).length, classes: (d.classes || []).length,
        sessions: (d.sessions || []).length, violations: (d.violations || []).length,
        permissions: (d.permissions || []).length, exits: (d.exits || []).length,
        subjects: (d.subjects || []).length, empty: !!(d.meta && d.meta.empty),
        createdAt: (d.meta && d.meta.createdAt) || ''
      };
    },
    backupJson: function () { return JSON.stringify(store.db); },
    restoreJson: function (text) {
      try {
        var o = JSON.parse(text);
        if (!o || !o.users || !o.schools) return { ok: false, error: 'الملف ليس نسخة صالحة لتابعني' };
        db = o;
        /* استكمال المجموعات الناقصة حتى لا تنكسر أي شاشة بعد الاسترجاع */
        COLLECTIONS.forEach(function (k) { if (!Array.isArray(db[k])) db[k] = []; });
        if (!db.meta) db.meta = { version: 1, createdAt: now() };
        save();
        ensureSuper(db);            /* كان يستدعي دالة غير موجودة فكان الاسترجاع يفشل دائمًا */
        save();
        return { ok: true, stats: store.dataStats() };
      } catch (e) { return { ok: false, error: 'تعذّر قراءة الملف: ' + e.message }; }
    },
    notifyPermission: function () { return store.canNotify() ? Notification.permission : 'unsupported'; },
    requestNotifyPermission: function () {
      if (!store.canNotify()) return Promise.resolve('unsupported');
      return Notification.requestPermission().then(function (p) {
        db.settings.mobileNotify = (p === 'granted'); save(); return p;
      });
    },
    /** تنبيه فوري على الجهاز (يُستخدم للمناوبة وغيرها) */
    pushMobile: function (title, body) {
      var shown = false;
      try {
        if (store.canNotify() && Notification.permission === 'granted') {
          new Notification(title, { body: body, dir: 'rtl', lang: 'ar' }); shown = true;
        }
      } catch (e) {}
      return shown;
    },

    /* ===================== إدارة المستخدمين (مشرف تابعني) ===================== */
    userStatuses: { active: 'نشط', pending: 'بانتظار الاعتماد', suspended: 'موقوف', disabled: 'معطَّل' },
    rolesList: function () { return ROLES.map(function (r) { return { id: r.id, name: r.name, nameF: r.nameF, desc: r.desc }; }); },
    roleNameOf: function (id, schoolId) { return store.roleLabel(id, schoolId); },
    usersQuery: function (f) {
      f = f || {};
      return store.list('users').filter(function (u) {
        if (f.role && u.role !== f.role) return false;
        if (f.status && u.status !== f.status) return false;
        if (f.schoolId && u.schoolId !== f.schoolId) return false;
        if (f.kind === 'staff' && ['student'].indexOf(u.role) >= 0) return false;
        if (f.kind === 'students' && u.role !== 'student') return false;
        if (f.q) {
          var q = String(f.q).trim().toLowerCase();
          var hay = [u.name, u.username, u.email, u.phone].join(' ').toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      }).sort(function (a, b) {
        var ra = ROLES.findIndex(function (r) { return r.id === a.role; });
        var rb = ROLES.findIndex(function (r) { return r.id === b.role; });
        if (ra !== rb) return ra - rb;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });
    },
    userById: function (id) { return store.list('users').filter(function (u) { return u.id === id; })[0] || null; },
    /* كلمة مرور عشوائية قوية (٨+ أحرف، رقم وحرف) */
    randomPassword: function () {
      var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', a = 'abcdefghijkmnpqrstuvwxyz', d = '23456789', sym = '@#$%&*';
      var pick = function (set, n) { var o = ''; for (var i = 0; i < n; i++) o += set.charAt(Math.floor(Math.random() * set.length)); return o; };
      var core = pick(A, 2) + pick(a, 4) + pick(d, 3) + pick(sym, 1);
      return 'Tbn@' + core.split('').sort(function () { return Math.random() - 0.5; }).join('');
    },
    /** تخمين أعمدة ملف الموظفين (نور/Excel) من عناوين الأعمدة */
    guessStaffMap: function (keys) {
      keys = keys || [];
      function pick(re) { return keys.find(function (k) { return re.test(String(k)); }) || ''; }
      return {
        name: pick(/اسم|name/i),
        subject: pick(/مادة|subject/i),
        id: pick(/هوية|national|id/i),
        phone: pick(/جوال|هاتف|phone|mobile/i),
        email: pick(/بريد|email|mail/i),
        role: pick(/دور|وظيفة|مسمى|role/i),
        username: pick(/اسم المستخدم|مستخدم|username|user/i)
      };
    },

    /** اسم مستخدم فريد مقترح من الاسم (أو من الهوية إن كان الاسم عربيًا) */
    suggestUsername: function (name, nid, used) {
      used = used || {};
      var base = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (base.length < 3) base = (nid ? 't' + String(nid).replace(/\D/g, '').slice(-4) : 'teacher');
      base = base.slice(0, 14);
      var u = base, i = 1;
      while (used[String(u).toLowerCase()]) { i++; u = base.slice(0, 12) + i; }
      return u;
    },

    /** استيراد موظفين/معلمين من صفوف ملف (Excel/CSV) — يولّد لكل حساب اسم مستخدم وكلمة مرور */
    importStaff: function (rows, map, opts) {
      map = map || {}; opts = opts || {};
      var schoolId = opts.schoolId || store.session.schoolId || (store.list('schools')[0] || {}).id || null;
      var defaultRole = opts.role || 'teacher';
      var roles = store.rolesList();
      var used = {};
      store.list('users').forEach(function (u) { if (u.username) used[String(u.username).toLowerCase()] = 1; });
      var existing = store.list('users');
      var users = [], creds = [], skipped = 0;
      (rows || []).forEach(function (r) {
        function val(k) { return (map[k] && r[map[k]] != null) ? String(r[map[k]]).trim() : ''; }
        var name = val('name');
        if (!name) { skipped++; return; }
        var nid = val('id'), email = val('email'), phone = val('phone');
        var role = defaultRole;
        var roleTxt = val('role');
        if (roleTxt) {
          var hit = roles.find(function (x) { return x.name === roleTxt || x.id === roleTxt || (x.nameF && x.nameF === roleTxt); });
          if (hit && hit.id !== 'super') role = hit.id;      /* لا يُنشأ مشرف عام من ملف */
        }
        var dup = (nid && existing.some(function (u) { return u.nationalId && u.nationalId === nid; })) ||
                  (email && existing.some(function (u) { return u.email && u.email === email; })) ||
                  (phone && existing.some(function (u) { return u.phone && u.phone === phone; }));
        if (dup) { skipped++; return; }
        var want = val('username').toLowerCase();
        var uname = (want && !used[want]) ? want : store.suggestUsername(name, nid, used);
        used[String(uname).toLowerCase()] = 1;
        var pw = store.randomPassword();
        var subjects = val('subject') ? val('subject').split(/[,،\/]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
        var u = store.insert('users', {
          schoolId: role === 'super' ? null : schoolId, role: role, name: name, nationalId: nid,
          phone: phone, email: email, username: uname, password: pw, mustChange: true, passwordSetAt: now(),
          status: 'active', canLogin: true, subjects: subjects, qualified: subjects.slice(),
          source: opts.source || 'nur', importedAt: now()
        });
        existing.push(u); users.push(u);
        creds.push({ id: u.id, name: u.name, username: uname, role: store.roleLabel(role, schoolId), password: pw, phone: phone, schoolId: schoolId });
      });
      save();
      if (users.length) {
        store.notify({ kind: 'staff', title: 'استيراد من Excel', body: 'أُضيف ' + users.length + ' حسابًا · تُخطّي ' + skipped, to: ['principal', 'super'] });
      }
      return { ok: true, added: users.length, skipped: skipped, users: users, creds: creds };
    },

    addUser: function (data) {
      var d = data || {};
      var name = String(d.name || '').trim();
      var username = String(d.username || '').trim().toLowerCase();
      var role = d.role;
      if (!name) return { ok: false, error: 'اكتب الاسم' };
      if (!username) return { ok: false, error: 'اكتب اسم المستخدم' };
      if (store.usernameTaken(username)) return { ok: false, error: 'اسم المستخدم محجوز: ' + username };
      if (!role || !ROLES.some(function (r) { return r.id === role; })) return { ok: false, error: 'اختر الدور' };
      var pw = d.password || store.randomPassword();
      var issues = store.passwordIssues(pw);
      if (issues.length) return { ok: false, error: 'كلمة المرور ضعيفة — تحتاج: ' + issues.join('، ') };
      var u = {
        id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        schoolId: role === 'super' ? null : (d.schoolId || store.session.schoolId || (store.list('schools')[0] || {}).id),
        role: role, name: name, username: username, password: pw,
        email: String(d.email || '').trim(), phone: String(d.phone || '').trim(), telegram: String(d.phone || '').trim(),
        telegramChatId: String(d.telegramChatId || '').trim(),
        status: d.status || 'active', canLogin: (d.status || 'active') === 'active',
        mustChange: !!d.mustChange, createdAt: new Date().toISOString(), createdBy: store.session.name || 'مشرف تابعني'
      };
      store.db.users.push(u); save();
      return { ok: true, user: u };
    },
    updateUser: function (id, patch) {
      var u = store.userById(id);
      if (!u) return { ok: false, error: 'المستخدم غير موجود' };
      var p = patch || {};
      if (p.username != null) {
        var un = String(p.username).trim().toLowerCase();
        if (un && un !== u.username) {
          if (store.usernameTaken(un)) return { ok: false, error: 'اسم المستخدم محجوز: ' + un };
          u.username = un;
        }
      }
      if (p.role != null && p.role !== u.role) {
        if (u.role === 'super' && store.list('users').filter(function (x) { return x.role === 'super'; }).length < 2) {
          return { ok: false, error: 'لا يمكن تغيير دور المشرف العام الأخير' };
        }
        u.role = p.role;
        if (p.role === 'super') u.schoolId = null;
      }
      ['name', 'email', 'phone', 'telegram', 'telegramChatId', 'schoolId', 'status', 'canLogin', 'mustChange'].forEach(function (k) {
        if (p[k] !== undefined) u[k] = p[k];
      });
      save();
      return { ok: true, user: u };
    },
    setUserStatus: function (id, status) {
      var u = store.userById(id);
      if (!u) return { ok: false, error: 'المستخدم غير موجود' };
      if ((status === 'suspended' || status === 'disabled') && u.role === 'super' &&
          store.list('users').filter(function (x) { return x.role === 'super' && x.status === 'active'; }).length < 2) {
        return { ok: false, error: 'لا يمكن إيقاف المشرف العام الأخير' };
      }
      u.status = status;
      u.canLogin = status === 'active';
      save();
      return { ok: true, user: u };
    },
    removeUser: function (id) {
      var u = store.userById(id);
      if (!u) return { ok: false, error: 'المستخدم غير موجود' };
      if (u.role === 'super' && store.list('users').filter(function (x) { return x.role === 'super'; }).length < 2) {
        return { ok: false, error: 'لا يمكن حذف المشرف العام الأخير' };
      }
      if (u.id === (store.session.userId || '')) return { ok: false, error: 'لا يمكنك حذف حسابك الحالي' };
      store.db.users = store.db.users.filter(function (x) { return x.id !== id; });
      save();
      return { ok: true };
    },
    resetUserPassword: function (id, pass) {
      var u = store.userById(id);
      if (!u) return { ok: false, error: 'المستخدم غير موجود' };
      var pw = pass || store.randomPassword();
      var issues = store.passwordIssues(pw);
      if (issues.length) return { ok: false, error: 'كلمة المرور ضعيفة — تحتاج: ' + issues.join('، ') };
      u.password = pw; u.mustChange = true; u.passwordSetAt = new Date().toISOString();
      save();
      return { ok: true, user: u, password: pw };
    },
    /* توليد كلمات مرور مختلفة لكل حساب حقيقي عند التسليم */
    generatePasswords: function (f) {
      f = f || {};
      var targets = store.usersQuery({ role: f.role, kind: f.kind, schoolId: f.schoolId }).filter(function (u) {
        if (f.excludeSelf && u.id === store.session.userId) return false;
        if (f.onlyActive && u.status !== 'active') return false;
        return true;
      });
      var rows = targets.map(function (u) {
        u.password = store.randomPassword();
        u.mustChange = true;
        u.passwordSetAt = new Date().toISOString();
        return {
          id: u.id, name: u.name, username: u.username, role: store.roleLabel(u.role, u.schoolId),
          roleId: u.role, schoolId: u.schoolId, password: u.password,
          statusLabel: store.userStatuses[u.status] || u.status,
          phone: u.phone || ''
        };
      });
      save();
      store.lastPasswords = rows;
      return rows;
    },
    lastGeneratedPasswords: function () { return store.lastPasswords || []; },

    /* ===================== الإعلان الافتتاحي للموقع ===================== */
    /* ملاحظة: هذا إعداد النموذج في المتصفح. للنشر للزوار صدّر الملف من الوحدة
       وضعه في site/assets/data/promo-config.js */
    promoFreqs: {
      session: 'مرة واحدة في كل جلسة تصفّح',
      always: 'في كل مرة يفتح الزائر الموقع',
      once: 'مرة واحدة فقط لكل زائر (لا يعود بعدها)'
    },
    promoModes: { active: 'الإعلان المحدّد «نشط» فقط', rotate: 'تدوير كل الإعلانات بالتناوب' },
    promoConfig: function () {
      var p = db.promo || {};
      return Object.assign({ enabled: true, mode: 'active', frequency: 'session', autoClose: 0, ads: [] }, p);
    },
    savePromoConfig: function (patch) {
      db.promo = Object.assign(store.promoConfig(), patch || {});
      db.promo.updatedAt = new Date().toISOString().slice(0, 10);
      save();
      store.mirrorPromo();      /* تمرير الإعداد إلى المفتاح المشترك الذي يقرأه الموقع */
      return db.promo;
    },
    /* يُكتب الإعلان في localStorage بمفتاح مشترك 'tabaani_promo_config' ليقرأه
       موقع تابعني فورًا (عند وجود الموقع وتابعني على نفس النطاق)، وللزوار عبر
       ملف promo-config.js المصدَّر. */
    mirrorPromo: function () {
      try { localStorage.setItem('tabaani_promo_config', store.promoConfigJson()); store._promoMirror = true; }
      catch (e) { store._promoMirror = false; }
      return store._promoMirror;
    },
    savePromoAd: function (ad) {
      var ads = store.promoConfig().ads.slice();
      var i = ads.findIndex(function (x) { return x.id === ad.id; });
      var targetId;
      if (i >= 0) { ads[i] = Object.assign({}, ads[i], ad); targetId = ads[i].id; }
      else {
        var fresh = Object.assign({ id: 'ad-' + Date.now().toString(36).slice(-4) }, ad);
        ads.push(fresh); targetId = fresh.id;
      }
      if (ad.active) ads = ads.map(function (x) { return Object.assign({}, x, { active: x.id === targetId }); });
      store.savePromoConfig({ ads: ads });
      return store.promoConfig();
    },
    removePromoAd: function (id) {
      var ads = store.promoConfig().ads.filter(function (x) { return x.id !== id; });
      if (ads.length && !ads.some(function (x) { return x.active; })) ads[0].active = true;
      store.savePromoConfig({ ads: ads });
      return store.promoConfig();
    },
    activatePromoAd: function (id) {
      store.savePromoConfig({ ads: store.promoConfig().ads.map(function (x) { return Object.assign({}, x, { active: x.id === id }); }) });
      store.savePromoConfig({ mode: 'active' });
      return store.promoConfig();
    },
    promoConfigJson: function () {
      var c = store.promoConfig();
      return JSON.stringify({
        enabled: c.enabled, mode: c.mode, frequency: c.frequency, autoClose: c.autoClose, updatedAt: c.updatedAt,
        ads: c.ads.map(function (a) { return { id: a.id, title: a.title || '', image: a.image, webp: a.webp || '', link: a.link || '', active: !!a.active }; })
      }, null, 2);
    },
    promoConfigFile: function () {
      return '/* =============================================================================\n' +
        '   promo-config.js — إعداد الإعلان الافتتاحي لموقع تابعني\n' +
        '   صدّره من: تابعني ← «الإعلان الافتتاحي» ← نشر الإعلان على الموقع\n' +
        '   ضعه في: site/assets/data/promo-config.js\n' +
        '   آخر تحديث: ' + new Date().toISOString().slice(0, 10) + '\n' +
        '   ========================================================================== */\n' +
        'window.TABAANI_PROMO = ' + store.promoConfigJson() + ';\n';
    },

    /* ===================== ترويسة التقارير الرسمية ===================== */
    educationDepts: function () { return store.db.educationDepts || []; },
    letterhead: function (schoolId) {
      var sc = store.school(schoolId);
      var lh = store.db.letterhead || {};
      return Object.assign({
        basmala: 'بسم الله الرحمن الرحيم',
        country: 'المملكة العربية السعودية',
        ministry: 'وزارة التعليم',
        educationDept: store.educationDepts()[0] || '',
        schoolLine: (sc && sc.name) || '',
        ministryLogo: 'assets/img/ministry-logo.png', schoolLogo: '', showBasmala: true, showMinistryLogo: true, showSchoolLogo: true,
        footerNote: ''
      }, lh, {
        schoolLine: lh.schoolLine || (sc && sc.name) || '',
        schoolLogo: lh.schoolLogo || (sc && sc.logo) || '',
        _school: sc
      });
    },
    saveLetterhead: function (patch) {
      db.letterhead = Object.assign(store.letterhead(), patch || {});
      delete db.letterhead._school;
      save();
      store.notify({ kind: 'letterhead', title: 'تحديث ترويسة التقارير', body: db.letterhead.educationDept, to: ['principal', 'deputy', 'guidance'] });
      return store.letterhead();
    },

    /* ===================== الفصول الدراسية ===================== */
    terms: function (schoolId) {
      return store.list('terms').filter(function (t) { return !schoolId || t.schoolId === schoolId; });
    },
    activeTerm: function () {
      var t = store.find('terms', store.db.settings.activeTermId);
      return t || store.list('terms')[0] || null;
    },
    saveTerm: function (data) {
      if (data.id && store.find('terms', data.id)) return store.update('terms', data.id, data);
      return store.insert('terms', Object.assign({ schoolId: store.session.schoolId, active: false }, data));
    },
    setActiveTerm: function (id) {
      store.list('terms').forEach(function (t) { t.active = (t.id === id); });
      db.settings.activeTermId = id; save();
      return store.activeTerm();
    },
    /** نطاق زمني جاهز: يوم / أسبوع / شهر / الفصل الدراسي الحالي */
    rangeOf: function (kind, refDate) {
      var d = refDate ? new Date(refDate + 'T00:00:00') : new Date();
      var iso = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).toISOString().slice(0, 10); };
      if (kind === 'day') return { from: iso(d), to: iso(d), label: 'تقرير يومي' };
      if (kind === 'week') {
        var day = d.getDay();                        /* الأحد = 0 */
        var start = new Date(d); start.setDate(d.getDate() - day);
        var end = new Date(start); end.setDate(start.getDate() + 4);   /* الأحد → الخميس */
        return { from: iso(start), to: iso(end), label: 'تقرير أسبوعي' };
      }
      if (kind === 'month') {
        var s2 = new Date(d.getFullYear(), d.getMonth(), 1), e2 = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return { from: iso(s2), to: iso(e2), label: 'تقرير شهري' };
      }
      if (kind === 'term') {
        var t = store.activeTerm();
        return { from: (t && t.from) || iso(d), to: (t && t.to) || iso(d), label: 'تقرير نهاية الفصل — ' + (t ? t.name : '') };
      }
      return { from: iso(d), to: iso(d), label: 'تقرير' };
    },

    /* ===================== سجل النشاط (لقياس تفعيل تابعني) ===================== */
    log: function (type, meta) {
      if (store.session.userId) {
        store.db.activityLog.push({
          id: uid('lg'), userId: store.session.userId, role: store.session.role,
          at: now(), type: type, meta: meta || {}
        });
        if (db.activityLog.length > 4000) db.activityLog.splice(0, 1000);
        save();
      }
    },
    activities: function (filter) {
      var rows = store.list('activityLog');
      if (!filter) return rows;
      return rows.filter(function (r) {
        if (filter.userId && r.userId !== filter.userId) return false;
        if (filter.type && r.type !== filter.type) return false;
        if (filter.from && r.at.slice(0, 10) < filter.from) return false;
        if (filter.to && r.at.slice(0, 10) > filter.to) return false;
        return true;
      });
    },
    checkIn: function (teacherId, when) {
      var day = (when || new Date()).toISOString().slice(0, 10);
      var rec = store.list('checkins').find(function (c) { return c.teacherId === teacherId && c.date === day; });
      if (rec) return rec;
      return store.insert('checkins', { teacherId: teacherId, date: day, checkIn: now(), checkOut: null, source: 'platform' });
    },
    checkOut: function (teacherId, when) {
      var day = (when || new Date()).toISOString().slice(0, 10);
      var rec = store.list('checkins').find(function (c) { return c.teacherId === teacherId && c.date === day; });
      if (!rec) rec = store.checkIn(teacherId, when);
      rec.checkOut = now(); save();
      store.log('checkout', {});
      return rec;
    },
    checkinsOf: function (teacherId, range) {
      return store.list('checkins').filter(function (c) {
        return (!teacherId || c.teacherId === teacherId) && (!range || (c.date >= range.from && c.date <= range.to));
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    },

    /* ===================== تحليلات الحضور والغياب ===================== */
    sessionsInRange: function (range, filter) {
      return store.list('sessions').filter(function (s) {
        if (range && (s.date < range.from || s.date > range.to)) return false;
        if (filter && filter.classId && s.classId !== filter.classId) return false;
        if (filter && filter.teacherId && s.teacherId !== filter.teacherId) return false;
        return true;
      });
    },
    /** ملخّص حضور الطلاب في نطاق: لكل طالب مجموع حاضر/متأخر/غائب/بعذر ونسبة الغياب */
    attendanceSummary: function (range, filter) {
      var sessions = store.sessionsInRange(range, filter);
      var map = {};
      sessions.forEach(function (s) {
        (s.records || []).forEach(function (r) {
          var st = store.student(r.studentId);
          if (!st) return;
          if (filter && filter.classId && st.classId !== filter.classId) return;
          var row = map[r.studentId] || (map[r.studentId] = {
            studentId: r.studentId, name: st.name, classId: st.classId,
            className: (store.klass(st.classId) || {}).name || 'غير مسكّن',
            present: 0, late: 0, absent: 0, excused: 0, total: 0
          });
          row.total++;
          row[r.status] = (row[r.status] || 0) + 1;
        });
      });
      var rows = Object.keys(map).map(function (k) {
        var r = map[k];
        r.absencePct = r.total ? Math.round((r.absent / r.total) * 100) : 0;
        r.attendancePct = r.total ? Math.round(((r.present + r.late) / r.total) * 100) : 0;
        return r;
      });
      rows.sort(function (a, b) { return b.absent - a.absent || b.late - a.late; });
      return { sessions: sessions.length, students: rows.length, rows: rows };
    },
    /* ---------------- نسب الحرمان (يضبطها وكيل شؤون الطلاب لكل مادة) ---------------- */
    deprivationFor: function (subject) {
      var by = store.db.settings.deprivationBySubject || {};
      if (subject && by[subject] != null) return Number(by[subject]);
      var base = store.db.settings.deprivationPct;
      return base == null ? 25 : Number(base);
    },
    saveSettings: function (patch) {
      db.settings = Object.assign({}, db.settings || {}, patch || {});
      save(); return db.settings;
    },
    setDeprivation: function (subject, pct) {
      if (!db.settings.deprivationBySubject) db.settings.deprivationBySubject = {};
      if (subject) db.settings.deprivationBySubject[subject] = Number(pct);
      else db.settings.deprivationPct = Number(pct);
      save(); return store.db.settings;
    },
    /** غياب كل طالب في كل مادة (أساس حساب الحرمان) */
    absenceBySubject: function (range, filter) {
      var sessions = store.sessionsInRange(range, filter);
      var map = {};
      sessions.forEach(function (s) {
        (s.records || []).forEach(function (r) {
          var st = store.student(r.studentId);
          if (!st) return;
          if (filter && filter.classId && st.classId !== filter.classId) return;
          var key = r.studentId + '|' + s.subject;
          var row = map[key] || (map[key] = {
            studentId: r.studentId, name: st.name, classId: st.classId,
            className: (store.klass(st.classId) || {}).name || 'غير مسكّن', subject: s.subject,
            present: 0, late: 0, absent: 0, excused: 0, total: 0
          });
          row.total++; row[r.status] = (row[r.status] || 0) + 1;
        });
      });
      return Object.keys(map).map(function (k) {
        var r = map[k];
        r.absencePct = r.total ? Math.round((r.absent / r.total) * 100) : 0;
        r.threshold = store.deprivationFor(r.subject);
        r.exceeded = r.total >= 3 && r.absencePct >= r.threshold;
        return r;
      });
    },
    /** الطلاب الذين بلغوا نسبة الحرمان (تحسب لكل مادة بنسبتها) */
    deprivationList: function (range, thresholdPct) {
      var rows;
      var bySubject = store.db.settings.deprivationBySubject || {};
      var hasCustom = Object.keys(bySubject).length > 0;
      if (thresholdPct != null || !hasCustom) {
        var th = thresholdPct == null ? store.db.settings.deprivationPct : thresholdPct;
        rows = store.attendanceSummary(range).rows
          .filter(function (r) { return r.total >= 3 && r.absencePct >= th; })
          .map(function (r) { r.threshold = th; r.subject = 'إجمالي المواد'; r.exceeded = true; return r; });
        return { threshold: th, mode: 'general', rows: rows };
      }
      /* الوضع الافتراضي بعد ضبط الوكيل: تُحتسب كل مادة بنسبتها، ويُدرج الطالب بمادته الأسوأ */
      var per = store.absenceBySubject(range).filter(function (r) { return r.exceeded; });
      var best = {};
      per.forEach(function (r) {
        var cur = best[r.studentId];
        if (!cur || (r.absencePct - r.threshold) > (cur.absencePct - cur.threshold)) best[r.studentId] = r;
      });
      rows = Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return (b.absencePct - b.threshold) - (a.absencePct - a.threshold); });
      return { threshold: store.db.settings.deprivationPct, mode: 'per-subject', rows: rows };
    },

    /* ------------------------------- بصمة الوجه ------------------------------- */
    hasFace: function (userId) { var u = store.user(userId); return !!(u && u.faceDescriptor && u.faceDescriptor.length); },
    saveFace: function (userId, descriptor, meta) {
      var u = store.user(userId); if (!u) return null;
      u.faceDescriptor = descriptor;
      u.faceEnrolledAt = now();
      u.faceMeta = meta || {};
      save();
      store.notify({ kind: 'face', ref: userId, title: 'تسجيل بصمة الوجه', body: u.name, to: ['principal', 'teachers_deputy'] });
      return u;
    },
    clearFace: function (userId) {
      var u = store.user(userId); if (!u) return null;
      u.faceDescriptor = null; u.faceEnrolledAt = null; save(); return u;
    },
    /** مقارنة وصف الوجه مع المرشّحين (مسافة إقليدية مُعيارية) */
    faceMatch: function (descriptor, candidates, threshold) {
      var th = threshold == null ? 0.42 : threshold;
      var best = null;
      [].concat(candidates).forEach(function (u) {
        if (!u || !u.faceDescriptor) return;
        var d = store.faceDistance(descriptor, u.faceDescriptor);
        if (!best || d < best.distance) best = { user: u, distance: d, score: Math.max(0, Math.round((1 - d) * 100)) };
      });
      if (best && best.distance <= th) { best.ok = true; return best; }
      return best ? Object.assign(best, { ok: false }) : { ok: false, distance: null, score: 0 };
    },
    faceDistance: function (a, b) {
      if (!a || !b || a.length !== b.length) return Infinity;
      var sum = 0;
      for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; sum += d * d; }
      return Math.sqrt(sum);
    },
    recordFaceScan: function (data) {
      var row = store.insert('faceScans', Object.assign({
        id: uid('fs'), at: now(), date: new Date().toISOString().slice(0, 10)
      }, data));
      store.log('face-scan', { type: data.type, ok: data.ok });
      return row;
    },
    faceScansOf: function (userId, range) {
      return store.list('faceScans').filter(function (f) {
        return (!userId || f.userId === userId) && (!range || (f.date >= range.from && f.date <= range.to));
      }).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    },
    /** تسجيل حضور المعلم لحصة معيّنة ببصمة الوجه */
    teacherPeriodCheckin: function (teacherId, classId, periodId, score) {
      var date = new Date().toISOString().slice(0, 10);
      var scan = store.recordFaceScan({ userId: teacherId, type: 'period', classId: classId, periodId: periodId, date: date, ok: true, score: score, kind: 'حضور حصة' });
      var rec = store.list('checkins').find(function (c) { return c.teacherId === teacherId && c.date === date; });
      if (!rec) rec = store.checkIn(teacherId);
      rec.periods = rec.periods || [];
      if (rec.periods.indexOf(periodId) === -1) rec.periods.push(periodId);
      rec.lastFaceAt = now(); save();
      return { scan: scan, checkin: rec };
    },
    periodCheckinOf: function (teacherId, date, periodId) {
      return store.list('faceScans').find(function (f) {
        return f.userId === teacherId && f.type === 'period' && f.date === (date || new Date().toISOString().slice(0, 10)) && f.periodId === periodId;
      }) || null;
    },
    /** اتجاه الغياب اليومي لعرض رسوم بيانية */
    attendanceTrend: function (range, filter) {
      var sessions = store.sessionsInRange(range, filter);
      var byDay = {};
      sessions.forEach(function (s) {
        var d = byDay[s.date] || (byDay[s.date] = { date: s.date, present: 0, absent: 0, late: 0, excused: 0, sessions: 0 });
        d.sessions++;
        (s.records || []).forEach(function (r) { d[r.status] = (d[r.status] || 0) + 1; });
      });
      return Object.keys(byDay).sort().map(function (d) { return byDay[d]; });
    },
    /** حضور الفصول في يوم واحد (للأقسام والتقارير اليومية) */
    dailyAttendance: function (date) {
      var sessions = store.sessionsInRange({ from: date, to: date });
      return store.list('classes').map(function (k) {
        var cls = sessions.filter(function (s) { return s.classId === k.id; });
        var recs = cls.reduce(function (a, s) { return a.concat(s.records || []); }, []);
        return {
          classId: k.id, className: k.name, sessions: cls.length, closed: cls.filter(function (s) { return s.status === 'closed'; }).length,
          total: recs.length,
          absent: recs.filter(function (r) { return r.status === 'absent'; }).length,
          late: recs.filter(function (r) { return r.status === 'late'; }).length,
          present: recs.filter(function (r) { return r.status === 'present'; }).length
        };
      });
    },
    /** نسبة تفعيل المعلمين لتابعني: دخول، إغلاق تحضير، مخالفات، قرارات نشاط */
    teacherActivity: function (range) {
      var teachers = store.usersByRole('teacher', store.session.schoolId);
      var log = store.activities({ from: range.from, to: range.to });
      return teachers.map(function (t) {
        var my = log.filter(function (l) { return l.userId === t.id; });
        var logins = my.filter(function (l) { return l.type === 'login'; });
        var sessions = store.sessionsInRange(range, { teacherId: t.id });
        var closed = sessions.filter(function (s) { return s.status === 'closed'; }).length;
        var violations = store.list('violations').filter(function (v) {
          return v.teacherId === t.id && v.date >= range.from && v.date <= range.to;
        }).length;
        var decisions = store.list('activityReqs').filter(function (r) {
          return r.decidedBy === t.name && r.decidedAt && r.decidedAt.slice(0, 10) >= range.from;
        }).length;
        /* لا تُحسب الأيام المستقبلية في نسبة التفعيل */
        var todayIso2 = new Date().toISOString().slice(0, 10);
        var effFrom = range.from, effTo = range.to > todayIso2 ? todayIso2 : range.to;
        var schoolDays = 0;
        for (var dd = new Date(effFrom + 'T00:00:00'); dd <= new Date(effTo + 'T00:00:00'); dd.setDate(dd.getDate() + 1)) {
          if (dd.getDay() !== 5 && dd.getDay() !== 6) schoolDays++;   /* الجمعة والسبت نهاية أسبوع */
        }
        schoolDays = Math.max(1, schoolDays);
        var loginRate = Math.min(100, Math.round((logins.length / schoolDays) * 100));
        var level = loginRate >= 70 ? 'متميّز'
          : (loginRate >= 25 ? 'منتظم'
          : (logins.length > 0 ? 'ضعيف التفعيل' : 'لم يفعّل تابعني'));
        var last = logins.length ? logins[logins.length - 1].at : null;
        return { teacherId: t.id, name: t.name, subjects: (t.subjects || []).join('، '),
                 logins: logins.length, loginRate: loginRate, lastLogin: last,
                 sessions: sessions.length, closed: closed, violations: violations, decisions: decisions, level: level };
      }).sort(function (a, b) { return b.loginRate - a.loginRate; });
    },
    /** ملخّص عام لتابعني في نطاق */
    platformSummary: function (range) {
      var log = store.activities({ from: range.from, to: range.to });
      var sessions = store.sessionsInRange(range);
      var recs = sessions.reduce(function (a, s) { return a.concat(s.records || []); }, []);
      return {
        logins: log.filter(function (l) { return l.type === 'login'; }).length,
        activeUsers: Object.keys(log.reduce(function (a, l) { a[l.userId] = 1; return a; }, {})).length,
        sessions: sessions.length, closedSessions: sessions.filter(function (s) { return s.status === 'closed'; }).length,
        absent: recs.filter(function (r) { return r.status === 'absent'; }).length,
        late: recs.filter(function (r) { return r.status === 'late'; }).length,
        violations: store.list('violations').filter(function (v) { return v.date >= range.from && v.date <= range.to; }).length,
        permissions: store.list('permissions').filter(function (p) { return (p.date || '') >= range.from && (p.date || '') <= range.to; }).length,
        reports: store.list('reports').filter(function (r) { return (r.at || '').slice(0, 10) >= range.from && (r.at || '').slice(0, 10) <= range.to; }).length
      };
    },

    /* ------------------------------------------------------------ التقارير */
    registerReport: function (type, refId, meta) {
      var seq = store.list('reports').length + 1;
      var code = 'TBN-' + type.toUpperCase().slice(0, 3) + '-' + String(seq).padStart(5, '0') + '-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
      var rep = store.insert('reports', Object.assign({
        id: uid('rp'), schoolId: store.session.schoolId, type: type, refId: refId,
        code: code, at: now(), by: store.session.name, prints: 0
      }, meta || {}));
      return rep;
    },
    markPrinted: function (reportId) {
      var r = store.find('reports', reportId); if (!r) return null;
      r.prints = (r.prints || 0) + 1; r.lastPrint = now(); save(); return r;
    },
    findReport: function (code) {
      var q = String(code || '').trim().toUpperCase();
      return store.list('reports').find(function (r) { return r.code.toUpperCase() === q; }) || null;
    }
  };

  global.Store = store;
  load();
})(window);
