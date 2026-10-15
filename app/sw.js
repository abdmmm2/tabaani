/* =============================================================================
   sw.js — عمل تابعني بدون إنترنت (تطبيق مثبَّت على الجوال/الآيباد)
   يخزّن كل ملفات تابعني محليًا عند أول فتح، ثم يشتغل بلا إنترنت.
   لتحديث النسخة بعد أي تعديل: غيّر رقم CACHE.
   ========================================================================== */
var CACHE = 'tabaani-app-v46';
var FILES = [
  "./index.html",
  "./manifest.webmanifest",
  "./assets/img/apple-touch-icon.png",
  "./assets/img/favicon.png",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",
  "./assets/img/logo-mark.png",
  "./assets/img/support-fares.png",
  "./assets/img/support-hind.png",
  "./assets/img/ministry-logo-placeholder.svg",
  "./assets/img/ministry-logo.png",
  "./assets/img/promo-offer.jpg",
  "./assets/img/promo-offer.webp",
  "./assets/css/app.css",
  "./assets/css/brand.css",
  "./assets/fonts/alexandria-var-arabic.woff2",
  "./assets/fonts/alexandria-var-latin.woff2",
  "./assets/fonts/fonts.css",
  "./assets/fonts/ibm-plex-sans-arabic-400-arabic.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-400-latin.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-500-arabic.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-500-latin.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-600-arabic.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-600-latin.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-700-arabic.woff2",
  "./assets/fonts/ibm-plex-sans-arabic-700-latin.woff2",
  "./assets/js/app.js",
  "./assets/js/cloud.js",
  "./assets/js/landing.js",
  "./assets/js/face.js",
  "./assets/js/store.js",
  "./assets/js/ui.js",
  "./assets/js/modules/accounts.js",
  "./assets/js/modules/activities.js",
  "./assets/js/modules/analytics.js",
  "./assets/js/modules/assignments.js",
  "./assets/js/modules/attendance-reports.js",
  "./assets/js/modules/attendance.js",
  "./assets/js/modules/classes.js",
  "./assets/js/modules/duties.js",
  "./assets/js/modules/exit-gate.js",
  "./assets/js/modules/face-checkin.js",
  "./assets/js/modules/letterhead.js",
  "./assets/js/modules/monitor.js",
  "./assets/js/modules/my-reports.js",
  "./assets/js/modules/permissions.js",
  "./assets/js/modules/entry-permit.js",
  "./assets/js/modules/finance.js",
  "./assets/js/modules/messages.js",
  "./assets/js/modules/subscription.js",
  "./assets/js/modules/support.js",
  "./assets/js/modules/platform.js",
  "./assets/js/modules/promo.js",
  "./assets/js/modules/reports.js",
  "./assets/js/modules/schedule.js",
  "./assets/js/modules/schools.js",
  "./assets/js/modules/settings.js",
  "./assets/js/modules/staff.js",
  "./assets/js/modules/subjects.js",
  "./assets/js/modules/telegram-connect.js",
  "./assets/js/modules/telegram.js",
  "./assets/js/modules/users.js",
  "./assets/js/modules/violations.js",
  "./assets/js/modules/volunteer.js",
  "./assets/js/vendor/face-api.min.js",
  "./assets/js/vendor/jsQR.js",
  "./assets/js/vendor/pdf.min.js",
  "./assets/js/vendor/pdf.worker.min.js",
  "./assets/js/vendor/qrcode.min.js",
  "./assets/js/vendor/xlsx.full.min.js",
  "./assets/js/vendor/face-models/face_landmark_68_model-shard1",
  "./assets/js/vendor/face-models/face_landmark_68_model-weights_manifest.json",
  "./assets/js/vendor/face-models/tiny_face_detector_model-shard1",
  "./assets/js/vendor/face-models/tiny_face_detector_model-weights_manifest.json"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) {
      return c.add(new Request(f, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        try {
          if (res && res.status === 200 && res.type === 'basic') {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
        } catch (err) {}
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
