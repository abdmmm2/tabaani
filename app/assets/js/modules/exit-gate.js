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
    var state = { scanning: false, stream: null, found: null, reason: '', gate: 'البوابة الرئيسية' };
    var host = h('div');
    function redraw() { clear(host); draw(); }

    function stopCam() {
      state.scanning = false;
      try { if (state.stream) state.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      state.stream = null;
    }

    function beep(ok) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        var ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = ok ? 880 : 220; o.type = 'sine';
        g.gain.setValueAtTime(.18, ac.currentTime);
        o.start(); o.stop(ac.currentTime + (ok ? .16 : .3));
      } catch (e) {}
      if (navigator.vibrate) { try { navigator.vibrate(ok ? 90 : [60, 60, 60]); } catch (e) {} }
    }

    function onCode(txt) {
      var code = codeFromText(txt);
      var p = S.findPermitByCode(code);
      if (!p) { beep(false); UI.toast('باركود غير معروف: ' + code, 'bad'); return; }
      if (!p.granted) { beep(false); UI.toast('هذا الطلب لم يُمنح بعد (بانتظار الوكيل)', 'warn'); return; }
      if (p.exited) { beep(false); UI.toast('سبق تسجيل خروج هذا الطالب — ' + (p.exited.at || '').slice(11, 16), 'warn'); return; }
      beep(true);
      state.found = p;
      state.reason = p.reason || '';
      stopCam();
      redraw();
    }

    function draw() {
      var today = S.exitsToday();
      var pending = S.pendingExits();

      host.appendChild(h('div', { class: 'stat-row' }, [
        UI.statCard('خروج اليوم', String(today.length), 'طالب', today.length ? 'gold' : null),
        UI.statCard('تصاريح ممنوحة', String(pending.length), 'لم يُسجَّل خروجها بعد'),
        UI.statCard('إجمالي السجل', String(S.exitsLog().length), 'منذ البداية')
      ]));

      /* ------- لوحة المسح ------- */
      var video = h('video', { class: 'gate-video', playsinline: '', autoplay: '', muted: '' });
      var canvas = document.createElement('canvas');
      canvas.style.display = 'none';

      function startScan() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          UI.toast('الكاميرا غير متاحة في هذا المتصفح — استخدم الإدخال اليدوي', 'warn'); return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
          .then(function (stream) {
            state.stream = stream; state.scanning = true;
            video.srcObject = stream;
            video.play().catch(function () {});
            scanLoop();
            redraw();
          })
          .catch(function () {
            UI.toast('تعذّر فتح الكاميرا (صلاحية أو http) — أدخل رقم التصريح يدويًا', 'bad');
          });
      }

      function scanLoop() {
        if (!state.scanning) return;
        if (!window.jsQR) { UI.toast('محرّك قراءة الباركود لم يُحمّل', 'bad'); return; }
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (res && res.data) { onCode(res.data); return; }
          } catch (e) {}
        }
        requestAnimationFrame(scanLoop);
      }

      var manual = UI.field({ name: 'exitCode', label: 'أو أدخل رقم التصريح يدويًا', placeholder: 'EX-20260001', dir: 'ltr' });

      host.appendChild(UI.panel('تسجيل إذن خروج', 'امسح باركود التصريح بكاميرا الجوال — أو اكتب رقمه.', [
        state.scanning
          ? h('button', { class: 'btn btn-danger', type: 'button', text: 'إيقاف الكاميرا', onClick: function () { stopCam(); redraw(); } })
          : h('button', { class: 'btn btn-primary', type: 'button', text: 'تشغيل الكاميرا والمسح', onClick: startScan })
      ], [
        h('div', { class: 'gate-stage' }, [
          video,
          state.scanning ? h('div', { class: 'gate-frame' }, [h('span', { text: 'وجّه الباركود داخل الإطار' })]) : null
        ]),
        h('div', { class: 'cluster', style: { marginTop: '12px' } }, [
          manual.wrap,
          h('button', { class: 'btn btn-outline', type: 'button', text: 'تسجيل بالرقم', onClick: function () {
            if (!manual.input.value.trim()) { UI.toast('اكتب رقم التصريح', 'warn'); return; }
            onCode(manual.input.value);
          } })
        ])
      ]));

      /* ------- بطاقة التصريح بعد المسح ------- */
      if (state.found) {
        var p = state.found, st = S.student(p.studentId) || {}, cls = S.klass(p.classId) || {};
        var reasonF = UI.field({ name: 'exitReason', label: 'سبب الخروج', type: 'textarea', rows: 2, value: state.reason });
        var gateF = UI.field({ name: 'exitGate', label: 'البوابة', type: 'select', value: state.gate,
          options: ['البوابة الرئيسية', 'بوابة الطلاب', 'البوابة الشرقية', 'البوابة الغربية'] });
        host.appendChild(UI.panel('تأكيد خروج: ' + (st.name || ''), 'التصريح ' + (p.exitNo || '') + ' · ' + (cls.name || ''),
          [h('button', { class: 'btn btn-soft', type: 'button', text: 'إلغاء', onClick: function () { state.found = null; redraw(); } })], [
          h('div', { class: 'grid-2-app' }, [
            h('div', {}, [reasonF.wrap, gateF.wrap]),
            h('div', { class: 'gate-card' }, [
              h('div', { class: 'barcode-wrap', html: UI.barcodeSvg(p.exitNo || p.number, { height: 40, module: 2 }) }),
              h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '6px' }, text: 'التصريح: ' + (p.exitNo || p.number) + ' · مُنح بواسطة: ' + ((p.granted && p.granted.by) || '—') })
            ])
          ]),
          h('div', { class: 'panel-actions' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'تسجيل الخروج الآن', onClick: function () {
              var r = S.logExit({ permissionId: p.id, reason: reasonF.input.value, gate: gateF.input.value });
              if (!r.ok) { UI.toast(r.error, 'bad'); return; }
              UI.toast('سُجّل خروج ' + r.exit.studentName + ' — ' + r.exit.time, 'ok');
              state.found = null; redraw();
            } })
          ])
        ]));
      }

      /* ------- سجل اليوم ------- */
      var rows = today.map(function (e) {
        return { student: e.studentName, cls: e.className, code: e.code, time: e.time, reason: e.reason, gate: e.gate, guard: e.guardName };
      });
      host.appendChild(UI.panel('سجل خروج اليوم (' + rows.length + ')', null, null, [
        rows.length ? UI.table({
          cols: [{ key: 'student', label: 'الطالب' }, { key: 'cls', label: 'الفصل' }, { key: 'code', label: 'التصريح' },
                 { key: 'time', label: 'الوقت' }, { key: 'reason', label: 'السبب' }, { key: 'gate', label: 'البوابة' }, { key: 'guard', label: 'الحارس' }],
          rows: rows
        }) : UI.empty('لا خروج مسجّل اليوم.')
      ]));
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
                   { key: 'reason', label: 'السبب' }, { key: 'date', label: 'تاريخ المنح' }],
            rows: pending.map(function (p) {
              var st = S.student(p.studentId) || {}, cls = S.klass(p.classId) || {};
              return { student: st.name || '—', cls: cls.name || '—', code: p.exitNo || p.number, reason: p.reason || '', date: (p.granted && p.granted.at ? p.granted.at.slice(0, 10) : p.date) };
            })
          })
        ]));
      }
    }

    draw();
    view.appendChild(host);
  }
})();
