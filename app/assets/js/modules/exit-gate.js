/* =============================================================================
   exit-gate.js — إذن الخروج
   • حارس البوابة: يمسح باركود تصريح الخروج بكاميرا الجوال (jsQR) أو يُدخل الرقم،
     فيُسجَّل الخروج باسمه بالتاريخ والوقت والسبب.
   • مدير المدرسة / وكيل شؤون الطلاب / التوجيه والإرشاد: «قائمة إذن الخروج المنتهية»
     مع التصفية والطباعة الرسمية.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* استخراج رقم التصريح من أي نص مقروء بالباركود */
  function codeFromText(txt) {
    var t = String(txt || '').trim();
    var m = t.match(/EX[-\s]?\d{4,}|P-?\d{4}-\d{3,}/i);
    return (m ? m[0] : t);
  }

  App.register({
    id: 'exit-gate',
    label: 'إذن الخروج',
    icon: '&#128682;',
    roles: ['guard', 'principal', 'deputy', 'guidance'],
    render: function (view) {
      if (S.session.role === 'guard') return renderGuard(view);
      return renderList(view);
    }
  });

  /* ==========================================================================
     واجهة الحارس: كاميرا + إدخال يدوي + سجل اليوم
     ========================================================================== */
  function renderGuard(view) {
    var GATE_KEY = 'tabaani-gate-name';
    var GATES = ['البوابة الرئيسية', 'بوابة الطلاب', 'البوابة الشرقية', 'البوابة الغربية'];
    var state = {
      scanning: false, stream: null, busy: false, result: null, scans: 0,
      gate: (function () { try { return localStorage.getItem(GATE_KEY) || GATES[0]; } catch (e) { return GATES[0]; } })(),
      ignore: '', ignoreUntil: 0, timer: null, manualOpen: false
    };
    var host = h('div');
    var video = h('video', { class: 'gate-video', playsinline: '', autoplay: '', muted: '' });
    var canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    function redraw() { clear(host); draw(); }
    function meName() { return (S.session && S.session.name) || 'حارس البوابة'; }

    function stopCam() {
      state.scanning = false;
      releaseWake();
      if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
      try { if (state.stream) state.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      state.stream = null; state.torch = false; state.canTorch = false;
    }

    /* صوت: سياق واحد يُفتح بلمسة الحارس (شرط iOS/iPadOS لتشغيل الصوت) */
    var audio = { ctx: null };
    function unlockAudio() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        if (!audio.ctx) audio.ctx = new AC();
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
      } catch (e) {}
    }
    function beep(ok) {
      try {
        var ac = audio.ctx; if (!ac) return;
        if (ac.state === 'suspended') ac.resume();
        var o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = ok ? 880 : 220; o.type = 'sine';
        g.gain.setValueAtTime(.18, ac.currentTime);
        o.start(); o.stop(ac.currentTime + (ok ? .16 : .3));
      } catch (e) {}
      if (navigator.vibrate) { try { navigator.vibrate(ok ? 90 : [60, 60, 60]); } catch (e) {} }
    }

    /* إبقاء شاشة الجوال مضاءة أثناء المسح (Wake Lock) */
    var wake = null;
    function lockScreen() {
      try {
        if (navigator.wakeLock && !wake) {
          navigator.wakeLock.request('screen').then(function (w) {
            wake = w; w.addEventListener('release', function () { wake = null; });
          }).catch(function () {});
        }
      } catch (e) {}
    }
    function releaseWake() { try { if (wake) { wake.release(); wake = null; } } catch (e) {} }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.scanning) lockScreen(); });

    /* إطفاء الكاميرا تلقائيًا بعد ٤ دقائق بلا مسح (بطارية الجوال) */
    function idleReset() {
      if (state.idleTimer) clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(function () {
        if (!state.scanning) return;
        stopCam();
        UI.toast('أُوقفت الكاميرا تلقائيًا لتوفير البطارية — اضغط «مسح إذن خروج» للمتابعة', 'warn');
        redraw();
      }, 4 * 60 * 1000);
    }

    /* ---------- تلقائي: يُسجَّل فور قراءة الرمز، بلا أي زر أو تأكيد ---------- */
    function fail(title, code, msg) {
      state.ignore = code; state.ignoreUntil = Date.now() + 8000;   /* لا نكرّر نفس التنبيه */
      beep(false);
      state.result = { ok: false, title: title, code: code, msg: msg };
      hold(3000);
    }
    function hold(ms) {
      state.busy = true;
      if (state.timer) clearTimeout(state.timer);
      redraw();
      state.timer = setTimeout(function () {
        state.result = null; state.busy = false; idleReset();
        redraw();
      }, ms);
    }
    function onCode(txt) {
      if (state.busy) return;
      var code = codeFromText(txt);
      if (!code) return;
      var p = S.findPermitByCode(code);
      if (!p) return fail('باركود غير معروف', code, 'هذا الرمز لا يخص أي تصريح خروج في النظام.');
      if (!p.granted) return fail('طلب لم يُمنح بعد', code, 'الطلب ما زال بانتظار موافقة وكيل شؤون الطلاب.');
      if (p.exited) return fail('التصريح مُستخدم من قبل', code, 'سُجّل خروجه في ' + String(p.exited.at || '').slice(11, 16) + ' — التصريح يُستخدم مرة واحدة.');
      var pst = S.permitState(p);
      if (pst.state === 'expired') return fail('انتهت صلاحية التصريح', code, 'مدته ' + pst.minutes + ' دقيقة من وقت المنح — يلزم تصريح جديد من الوكيل.');

      var r = S.logExit({ permissionId: p.id, reason: p.reason || '', gate: state.gate });
      if (!r.ok) return fail('تعذّر التسجيل', code, r.error);
      state.scans++;
      state.ignore = code; state.ignoreUntil = Date.now() + 60000;  /* يتجاهل نفس التصريح دقيقة */
      state.result = {
        ok: true, name: r.exit.studentName, cls: r.exit.className, time: r.exit.time,
        gate: r.exit.gate, code: r.exit.code, reason: r.exit.reason || '—'
      };
      beep(true);
      hold(3200);
    }
    window.__gateScan = onCode;   /* منفذ للفحص الآلي */

    function draw() {
      var today = S.exitsToday();
      var pending = S.pendingExits();

      /* ------- شريط الحارس ------- */
      host.appendChild(h('div', { class: 'gate-id' }, [
        h('div', { class: 'gate-id-who' }, [
          h('span', { class: 'gate-dot', text: '' }),
          h('strong', { text: 'الحارس: ' + meName() }),
          h('span', { class: 'muted', text: ' · الحساب المسجّل الآن' })
        ]),
        h('span', { class: 'gate-count', text: 'مسح هذه الجلسة: ' + state.scans })
      ]));

      host.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('خروج اليوم', String(today.length), 'طالب', today.length ? 'gold' : null),
        UI.statCard('تصاريح جاهزة', String(pending.length), 'لم تُسجَّل خروجها بعد'),
        UI.statCard('إجمالي السجل', String(S.exitsLog().length), 'منذ البداية')
      ]));

      /* ------- المسح ------- */
      if (state.stream && video.srcObject !== state.stream) {
        video.srcObject = state.stream;
        video.play().catch(function () {});
      }

      function startScan() {
        unlockAudio();                       /* يفتح الصوت بلمسة الحارس (iOS) */
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          UI.toast('الكاميرا غير متاحة في هذا المتصفح — استخدم الإدخال اليدوي', 'warn'); return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
          .then(function (stream) {
            state.stream = stream; state.scanning = true;
            video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
            video.srcObject = stream;
            video.play().catch(function () {});
            try {
              var tr = stream.getVideoTracks()[0];
              var caps = (tr && tr.getCapabilities) ? tr.getCapabilities() : {};
              state.canTorch = !!caps.torch;   /* الكشاف متاح في أندرويد غالبًا، وغير مدعوم في آيفون */
            } catch (e) { state.canTorch = false; }
            lockScreen();
            idleReset();
            redraw();
            scanLoop();
          })
          .catch(function (err) {
            var n = (err && err.name) || '';
            var msg = (n === 'NotAllowedError' || n === 'SecurityError')
              ? 'لم يُسمح بالكاميرا — افتح إعدادات المتصفح وامنح الإذن للموقع، ثم أعد المحاولة'
              : 'تعذّر فتح الكاميرا — افتح تابعني في سفاري/كروم مباشرة (متصفحات واتساب وانستقرام تمنع الكاميرا)، وتأكد من اتصال آمن https';
            UI.toast(msg, 'bad');
          });
      }

      function scanLoop() {
        if (!state.scanning) return;
        if (!window.jsQR) { UI.toast('محرّك قراءة الباركود لم يُحمّل', 'bad'); return; }
        if (!state.busy && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (res && res.data) {
              var same = (res.data === state.ignore && Date.now() < state.ignoreUntil);
              if (!same) { state.ignore = res.data; onCode(res.data); }
            }
          } catch (e) {}
        }
        requestAnimationFrame(scanLoop);
      }

      var gateF = UI.field({
        name: 'exitGate', label: 'البوابة', type: 'select', value: state.gate, options: GATES, half: true, dir: 'rtl',
        onChange: function () {
          state.gate = gateF.input.value;
          try { localStorage.setItem(GATE_KEY, state.gate); } catch (e) {}
        }
      });

      var torchBtn = (state.scanning && state.canTorch) ? h('button', { class: 'btn btn-outline', type: 'button',
        text: state.torch ? 'إطفاء الكشاف' : 'تشغيل الكشاف', onClick: function () {
          try {
            var tr = state.stream && state.stream.getVideoTracks()[0];
            state.torch = !state.torch;
            tr.applyConstraints({ advanced: [{ torch: state.torch }] });
            redraw();
          } catch (e) { UI.toast('الكشاف غير مدعوم في هذا الجهاز', 'warn'); }
        } }) : null;
      var scanPanel = UI.panel('مسح إذن خروج',
        state.scanning ? 'وضع المسح التلقائي: وجّه الباركود داخل الإطار — يُسجَّل الخروج فورًا بلا أي زر.' : 'اضغط «مسح إذن خروج» لتفتح الكاميرا، ثم وجّه الباركود — التسجيل تلقائي.',
        [state.scanning
          ? h('button', { class: 'btn btn-danger', type: 'button', text: 'إيقاف الكاميرا', onClick: function () { stopCam(); redraw(); } })
          : h('button', { class: 'btn btn-primary btn-scan', type: 'button', text: 'مسح إذن خروج', onClick: function () {
              if (state.timer) clearTimeout(state.timer);
              state.busy = false; state.result = null;
              startScan();
            } }),
          torchBtn],
        [
          h('div', { class: 'gate-stage' }, [
            video,
            state.scanning ? h('div', { class: 'gate-frame' }, [
              h('span', { text: 'وجّه الباركود داخل الإطار' }),
              h('span', { class: 'gate-auto', text: 'تلقائي' })
            ]) : null
          ]),

          /* بطاقة النتيجة: تظهر وتُغلق تلقائيًا ثم يعود للمسح */
          state.result ? renderResult(state.result) : null,

          h('div', { class: 'grid-gate' }, [
            gateF.wrap,
            h('div', { class: 'gate-hint' }, [
              h('div', { class: 'callout tip', html: 'المسح يعمل فقط داخل حساب الحارس — كل تسجيل يُحفظ تلقائيًا باسمك ووقتك والبوابة، ويُرسل إشعار للمدير والوكيل والتوجيه.<br>من جوالك: اسمح بالكاميرا مرة واحدة فقط، ثم يعمل المسح بلا إنترنت — والباركود يُقرأ من الورقة أو من شاشة جوال الطالب.' })
            ])
          ]),

          /* الإدخال اليدوي: بديل عند عدم توفر الكاميرا */
          h('div', { class: 'manual-toggle' }, [
            h('button', { class: 'link-btn', type: 'button', text: (state.manualOpen ? '− إخفاء الإدخال اليدوي' : '+ إدخال الرقم يدويًا'), onClick: function () { state.manualOpen = !state.manualOpen; redraw(); } })
          ]),
          state.manualOpen ? manualRow() : null
        ]);
      host.appendChild(scanPanel);

      /* ------- سجل اليوم ------- */
      var rows = today.map(function (e) {
        return { student: e.studentName, cls: e.className, code: e.code, time: e.time, reason: e.reason, gate: e.gate, guard: e.guardName };
      }).reverse();
      host.appendChild(UI.panel('سجل خروج اليوم (' + rows.length + ')', null, null, [
        rows.length ? UI.table({
          cols: [{ key: 'student', label: 'الطالب' }, { key: 'cls', label: 'الفصل' }, { key: 'code', label: 'التصريح' },
                 { key: 'time', label: 'الوقت' }, { key: 'reason', label: 'السبب' }, { key: 'gate', label: 'البوابة' }, { key: 'guard', label: 'الحارس' }],
          rows: rows
        }) : UI.empty('لا خروج مسجّل اليوم.')
      ]));
    }

    /* نتيجة المسح — تُغلق تلقائيًا */
    function renderResult(r) {
      if (!r.ok) {
        return h('div', { class: 'gate-res bad' }, [
          h('div', { class: 'gate-res-icon', html: '&#10007;' }),
          h('div', { class: 'gate-res-body' }, [
            h('div', { class: 'gate-res-title', text: r.title }),
            h('div', { class: 'gate-res-sub', text: r.msg }),
            h('div', { class: 'gate-res-code', text: 'الرمز: ' + r.code })
          ])
        ]);
      }
      return h('div', { class: 'gate-res ok' }, [
        h('div', { class: 'gate-res-icon', html: '&#10003;' }),
        h('div', { class: 'gate-res-body' }, [
          h('div', { class: 'gate-res-title', text: r.name }),
          h('div', { class: 'gate-res-sub', text: r.cls + ' · تصريح ' + r.code }),
          h('div', { class: 'gate-res-meta', text: 'سُجّل الخروج تلقائيًا · ' + r.gate + ' · ' + r.time }),
          h('div', { class: 'gate-res-auto', text: 'حُفظ في السجل وأُرسل إشعار للمدير والوكيل والتوجيه ✓ — يتحضّر للمسح التالي…' })
        ])
      ]);
    }

    function manualRow() {
      var f = UI.field({ name: 'exitCode', label: 'رقم التصريح', placeholder: 'EX-20260001', dir: 'ltr', half: true });
      return h('div', { class: 'manual-row' }, [
        f.wrap,
        h('button', { class: 'btn btn-outline', type: 'button', text: 'تسجيل تلقائي بالرقم', onClick: function () {
          if (!f.input.value.trim()) { UI.toast('اكتب رقم التصريح', 'warn'); return; }
          if (state.timer) clearTimeout(state.timer);
          state.busy = false; state.result = null;
          onCode(f.input.value);
        } })
      ]);
    }

    draw();
    view.appendChild(host);
    window.addEventListener('hashchange', function once() { stopCam(); window.removeEventListener('hashchange', once); });
  }

  /* ==========================================================================
     واجهة المتابعة: قائمة إذن الخروج المنتهية (مدير · وكيل · توجيه)
     ========================================================================== */
  function renderList(view) {
    var state = { range: 'today', q: '' };
    var host = h('div');
    function redraw() { clear(host); draw(); }

    function filtered() {
      var today = new Date().toISOString().slice(0, 10);
      var week = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
      var f = state.range === 'today' ? { date: today } : (state.range === 'week' ? { from: week } : {});
      var rows = S.exitsLog(f);
      if (state.q) {
        var q = state.q.trim();
        rows = rows.filter(function (e) { return (e.studentName + ' ' + e.className + ' ' + e.code + ' ' + e.reason).indexOf(q) >= 0; });
      }
      return rows;
    }

    function draw() {
      var today = S.exitsToday();
      var pending = S.pendingExits();
      var rows = filtered();

      host.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('خروج اليوم', String(today.length), 'إذن خروج منتهٍ', today.length ? 'gold' : null),
        UI.statCard('ممنوحة ولم تُستخدم', String(pending.length), 'تصاريح سارية'),
        UI.statCard('إجمالي المنتهية', String(S.exitsLog().length), 'منذ البداية')
      ]));

      host.appendChild(UI.panel('قائمة إذن الخروج المنتهية', 'كل من خرج فعليًا من البوابة — بالتاريخ والوقت والسبب والحارس.', [
        UI.reportButton(function () {
          var rs = filtered();
          return {
            type: 'exits', title: 'كشف إذن الخروج المنتهية',
            subtitle: state.range === 'today' ? 'اليوم' : (state.range === 'week' ? 'آخر ٧ أيام' : 'كل السجل'),
            code: null,
            meta: [{ label: 'عدد الحالات', value: String(rs.length) }, { label: 'المدرسة', value: (S.school() || {}).name || '' }],
            sections: [{
              heading: 'الحالات',
              table: { cols: ['م', 'الطالب', 'الفصل', 'التاريخ', 'الوقت', 'السبب', 'التصريح', 'الحارس'],
                rows: rs.map(function (e, i) { return [i + 1, e.studentName, e.className, e.date, e.time, e.reason, e.code, e.guardName]; }) }
            }],
            signatures: ['أعدّ الكشف', 'وكيل شؤون الطلاب', 'مدير المدرسة']
          };
        }, { label: 'طباعة الكشف' })
      ], [
        h('div', { class: 'toolbar' }, [
          UI.field({ name: 'range', label: 'الفترة', type: 'select', value: state.range,
            options: [{ value: 'today', label: 'اليوم' }, { value: 'week', label: 'آخر ٧ أيام' }, { value: 'all', label: 'كل السجل' }],
            onChange: function (e) { state.range = e.target.value; redraw(); } }).wrap,
          UI.field({ name: 'q', label: 'بحث (طالب · فصل · تصريح · سبب)', value: state.q,
            onInput: function (e) { state.q = e.target.value; redraw(); } }).wrap
        ]),
        rows.length ? UI.table({
          cols: [{ key: 'student', label: 'الطالب' }, { key: 'cls', label: 'الفصل' }, { key: 'date', label: 'التاريخ' },
                 { key: 'time', label: 'الوقت' }, { key: 'reason', label: 'سبب الخروج' }, { key: 'code', label: 'التصريح' },
                 { key: 'guard', label: 'الحارس' }, { key: 'gate', label: 'البوابة' }],
          rows: rows.map(function (e) { return { student: e.studentName, cls: e.className, date: e.date, time: e.time, reason: e.reason, code: e.code, guard: e.guardName, gate: e.gate }; })
        }) : UI.empty('لا حالات في هذه الفترة.')
      ]));

      if (pending.length) {
        host.appendChild(UI.panel('تصاريح ممنوحة لم يُسجَّل خروجها (' + pending.length + ')', 'سارية — يُنتظر أن يمرّ الطالب من البوابة.', null, [
          UI.table({
            cols: [{ key: 'student', label: 'الطالب' }, { key: 'cls', label: 'الفصل' }, { key: 'code', label: 'التصريح' },
                   { key: 'reason', label: 'السبب' }, { key: 'state', label: 'الصلاحية' }, { key: 'date', label: 'تاريخ المنح' }],
            rows: pending.map(function (p) {
              var st = S.student(p.studentId) || {}, cls = S.klass(p.classId) || {};
              var ps = S.permitState(p);
              var badge = ps.state === 'valid' ? UI.badge('صالح ' + ps.remainingMin + ' دقيقة', 'mint') : UI.badge('انتهت الصلاحية', 'terra');
              return { student: st.name || '—', cls: cls.name || '—', code: p.exitNo || p.number, reason: p.reason || '', state: badge, date: (p.granted && p.granted.at ? p.granted.at.slice(0, 10) : p.date) };
            })
          })
        ]));
      }
    }

    draw();
    view.appendChild(host);
  }
})();
