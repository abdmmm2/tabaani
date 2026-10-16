/* =============================================================================
   support-config.js — إعداد الدعم الفني وبوت التسجيل (لصفحات الموقع العامة)
   المناوب يُحسب تلقائيًا حسب وقت الزائر (٢٤ ساعة).
   ========================================================================== */
window.TABAANI_SUPPORT = {
  enabled: true,
  title: 'الدعم الفني — تابعني للخدمات الذكية',
  greetingName: 'تابعني',
  agents: [
    { id: 'fares', from: 8, to: 20, name: 'فارس الحربي', role: 'مناوب الآن',
      shift: 'الشفت الأول · ٨ صباحًا – ٨ مساءً',
      img: 'https://abdmmm2.github.io/tabaani/app/assets/img/support-fares.png',
      phone: '', whatsapp: '', telegram: 'Tabaani_bot' },
    { id: 'hind', from: 20, to: 8, name: 'هند المطيري', role: 'مناوبة الآن',
      shift: 'الشفت الثاني · ٨ مساءً – ٨ صباحًا',
      img: 'https://abdmmm2.github.io/tabaani/app/assets/img/support-hind.png',
      phone: '', whatsapp: '', telegram: 'Tabaani_bot' }
  ],
  /* بوت التسجيل: النموذج في نفس الصفحة + قناة تلقرام */
  register: {
    title: 'بوت التسجيل',
    url: 'register.html',
    telegram: 'Tabaani_bot',
    note: 'يسجّل مدرستك ويُرسل بيانات الدخول للمدير.'
  },
  updatedAt: '2026-10-16'
};
