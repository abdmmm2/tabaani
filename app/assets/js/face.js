/* =============================================================================
   face.js — التقاط الوجه والتحقق منه محليًا (نموذج أولي)
   ---------------------------------------------------------------------------
   يستخدم face-api.js (محليًا) للكشف عن الوجه واستخراج 68 معلَمًا، ثم يبني
   "وصفًا هندسيًا" مُعيارًا (مسافات بين المعلَامات مقسومة على المسافة بين العينين)
   ويقارنه بالوصف المسجَّل سابقًا. مناسب للعرض والتجربة فقط — لا يُعتمد كبصمة
   رسمية (يحتاج نظامًا معتمدًا ومضادًا للتحايل).
   ========================================================================== */
(function (global) {
  'use strict';
  var LIB = 'assets/js/vendor/face-api.min.js';
  var MODELS = 'assets/js/vendor/face-models';
  var state = { status: 'idle', error: null, stream: null };

  /* نقاط مرجعية مختارة من 68 معلَمًا: زوايا العينين، الأنف، الفم، الذقن، الفك */
  var PTS = [36, 39, 42, 45, 30, 33, 48, 54, 51, 57, 8, 0, 16, 4, 12];

  function loadLib() {
    return new Promise(function (res, rej) {
      if (global.faceapi) return res(global.faceapi);
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function () { res(global.faceapi); };
      s.onerror = function () { rej(new Error('تعذّر تحميل مكتبة التعرّف على الوجه')); };
      document.head.appendChild(s);
    });
  }

  function load() {
    if (state.status === 'ready') return Promise.resolve(true);
    if (state.loading) return state.loading;
    state.status = 'loading';
    state.loading = loadLib()
      .then(function (fa) {
        if (!fa) throw new Error('مكتبة التعرّف غير متاحة');
        return Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODELS),
          fa.nets.faceLandmark68Net.loadFromUri(MODELS)
        ]);
      })
      .then(function () { state.status = 'ready'; state.error = null; return true; })
      .catch(function (e) {
        state.status = 'error';
        state.error = (e && e.message) || 'فشل تحميل نماذج التعرّف';
        state.loading = null;
        throw e;
      });
    return state.loading;
  }

  function openCamera(video) {
    if (state.stream) return Promise.resolve(state.stream);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('المتصفح لا يدعم الكاميرا، أو الصفحة ليست على اتصال آمن (https أو localhost)'));
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, audio: false })
      .then(function (stream) {
        state.stream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        return video.play().then(function () { return stream; });
      });
  }
  function closeCamera() {
    if (state.stream) { state.stream.getTracks().forEach(function (t) { t.stop(); }); state.stream = null; }
  }

  /** يحوّل معلَامات الوجه إلى وصف مُعيار */
  function descriptorFromPoints(points) {
    var p = PTS.map(function (i) { return points[i]; });
    var eyeDist = dist(points[36], points[45]);
    if (!eyeDist) return null;
    var out = [];
    for (var i = 0; i < p.length; i++) {
      for (var j = i + 1; j < p.length; j++) out.push(dist(p[i], p[j]) / eyeDist);
    }
    return out.map(function (v) { return Math.round(v * 10000) / 10000; });
  }
  function dist(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); }

  /** يلتقط وصفًا من الفيديو الحالي */
  function capture(video) {
    return load().then(function (fa) {
      return fa.detectSingleFace(video, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
        .withFaceLandmarks();
    }).then(function (res) {
      if (!res || !res.landmarks) return { ok: false, reason: 'لم يُعثر على وجه واضح — اقترب من الكاميرا وأضِئ المكان.' };
      var pts = res.landmarks.positions;
      var d = descriptorFromPoints(pts);
      if (!d) return { ok: false, reason: 'تعذّر استخراج ملامح الوجه، أعد المحاولة.' };
      return { ok: true, descriptor: d, score: res.detection ? res.detection.score : null, box: res.detection ? res.detection.box : null };
    });
  }

  /** لوحة التقاط جاهزة للاستخدام في أي شاشة */
  function capturePanel(opts) {
    opts = opts || {};
    var UI = global.UI, h = UI.h;
    var video = h('video', { class: 'face-video', autoplay: true, muted: true, playsinline: true });
    var status = h('p', { class: 'face-status', text: 'جارٍ تجهيز الكاميرا…' });
    var btn = h('button', { class: 'btn btn-primary', type: 'button', text: opts.buttonText || 'التقاط الوجه', disabled: true });
    var retry = h('button', { class: 'mini-btn', type: 'button', text: 'إعادة تشغيل الكاميرا', hidden: true });
    var box = h('div', { class: 'face-capture' }, [video, status, h('div', { class: 'cluster' }, [btn, retry])]);

    function setStatus(t, tone) { status.textContent = t; status.className = 'face-status' + (tone ? ' is-' + tone : ''); }

    var started = false;
    function start() {
      load()
        .then(function () { return openCamera(video); })
        .then(function () { started = true; btn.disabled = false; retry.hidden = true; setStatus('وجّه وجهك نحو الكاميرا ثم اضغط الالتقاط.', 'ok'); })
        .catch(function (e) {
          var msg = (state.error || (e && e.message) || 'تعذّر تشغيل الكاميرا');
          if (/loadFromUri|fetch|Failed to fetch|NetworkError/i.test(msg)) {
            msg = 'تعذّر تحميل نماذج التعرّف — شغّل المنصة عبر خادم محلي (python3 -m http.server) ثم أعد المحاولة.';
          }
          setStatus(msg, 'err');
          retry.hidden = false;
          btn.disabled = true;
        });
    }
    retry.addEventListener('click', start);
    btn.addEventListener('click', function () {
      btn.disabled = true; setStatus('جارٍ التحقق…');
      capture(video).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { setStatus(res.reason, 'err'); return; }
        setStatus('تم التقاط الوجه ✓', 'ok');
        opts.onDescriptor && opts.onDescriptor(res);
      }).catch(function (e) { btn.disabled = false; setStatus('خطأ في التحقق: ' + e.message, 'err'); });
    });
    start();
    return { el: box, stop: function () { closeCamera(); }, setStatus: setStatus };
  }

  global.Face = {
    load: load, capture: capture, capturePanel: capturePanel, openCamera: openCamera, closeCamera: closeCamera,
    status: function () { return state.status; },
    error: function () { return state.error; },
    descriptorFromPoints: descriptorFromPoints
  };
})(window);
