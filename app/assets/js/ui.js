/* =============================================================================
   ui.js — صندوق أدوات الواجهة (جداول، نوافذ، تنبيهات، نماذج، تقارير، باركود)
   ========================================================================== */
(function (global) {
  'use strict';

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ------------------------------------------------------------- التنبيهات */
  function toast(message, tone) {
    var host = document.getElementById('toasts');
    if (!host) { host = h('div', { id: 'toasts', class: 'toasts' }); document.body.appendChild(host); }
    var t = h('div', { class: 'toast toast-' + (tone || 'info') }, [
      h('span', { class: 'toast-dot' }), h('span', { text: message })
    ]);
    host.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 300); }, 4200);
  }

  /* --------------------------------------------------------------- النوافذ */
  function modal(opts) {
    var backdrop = h('div', { class: 'modal-backdrop' });
    var box = h('div', { class: 'modal' + (opts.wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true' });
    var close = function () { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    box.appendChild(h('div', { class: 'modal-head' }, [
      h('h3', { text: opts.title || '' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', onClick: close },
        [h('span', { html: '&times;', style: { fontSize: '20px', lineHeight: '1' } })])
    ]));
    var body = h('div', { class: 'modal-body' });
    [].concat(opts.body || []).forEach(function (n) { if (n) body.appendChild(n); });
    box.appendChild(body);
    if (opts.actions) {
      var foot = h('div', { class: 'modal-foot' });
      opts.actions.forEach(function (a) {
        foot.appendChild(h('button', {
          class: 'btn ' + (a.class || 'btn-outline'), type: 'button', text: a.label,
          onClick: function () { if (a.onClick) a.onClick(close, box); else close(); }   /* بلا onClick ⇒ إغلاق */
        }));
      });
      box.appendChild(foot);
    }
    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    var first = box.querySelector('input, select, textarea, button');
    if (first) setTimeout(function () { first.focus(); }, 60);
    return { close: close, box: box, body: body };
  }

  function confirm(message, opts) {
    return new Promise(function (resolve) {
      var m = modal({
        title: (opts && opts.title) || 'تأكيد',
        body: h('p', { class: 'muted', text: message }),
        actions: [
          { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); resolve(false); } },
          { label: (opts && opts.ok) || 'تأكيد', class: (opts && opts.danger) ? 'btn-danger' : 'btn-primary', onClick: function (close) { close(); resolve(true); } }
        ]
      });
      void m;
    });
  }

  /* ---------------------------------------------------------------- الحقول */
  function field(spec) {
    var id = 'f-' + spec.name + '-' + Math.random().toString(36).slice(2, 6);
    var control;
    if (spec.type === 'select') {
      control = h('select', { class: 'input', id: id, name: spec.name, required: spec.required }, [
        spec.placeholder ? h('option', { value: '', text: spec.placeholder }) : null
      ].concat((spec.options || []).map(function (o) {
        var opt = typeof o === 'string' ? { value: o, label: o } : o;
        return h('option', { value: opt.value, text: opt.label, selected: spec.value === opt.value });
      })));
      if (spec.value != null) control.value = spec.value;
    } else if (spec.type === 'textarea') {
      control = h('textarea', { class: 'textarea', id: id, name: spec.name, required: spec.required, placeholder: spec.placeholder || '', rows: spec.rows || 3 });
      if (spec.value) control.value = spec.value;
    } else {
      control = h('input', {
        class: 'input', id: id, name: spec.name, type: spec.type || 'text',
        required: spec.required, placeholder: spec.placeholder || '', value: spec.value != null ? spec.value : '',
        min: spec.min, max: spec.max, step: spec.step, dir: spec.dir, autocomplete: spec.autocomplete
      });
    }
    if (spec.onInput) control.addEventListener('input', function (e) {
      clearTimeout(control._t); control._t = setTimeout(function () { spec.onInput(e); }, 220);
    });
    if (spec.onChange) control.addEventListener('change', spec.onChange);
    var wrap = h('div', { class: 'field' + (spec.half ? ' half' : '') }, [
      h('label', { for: id, text: spec.label }),
      control,
      spec.help ? h('p', { class: 'hint', text: spec.help }) : null
    ]);
    if (spec.required) wrap.classList.add('is-required');
    return { wrap: wrap, input: control, name: spec.name, spec: spec };
  }

  function formModal(opts) {
    var fields = (opts.fields || []).map(field);
    var grid = h('div', { class: 'form-grid' }, fields.map(function (f) {
      f.wrap.classList.toggle('full', !f.spec.half);
      return f.wrap;
    }));
    var error = h('p', { class: 'hint hint-error', hidden: true });
    var m = modal({
      title: opts.title, wide: opts.wide,
      body: [opts.intro ? h('p', { class: 'muted', style: { marginBottom: '14px' }, text: opts.intro }) : null, grid, opts.extra || null, error],
      actions: [
        { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
        {
          label: opts.submitLabel || 'حفظ', class: 'btn-primary', onClick: function (close, box) {
            var data = {}, ok = true;
            fields.forEach(function (f) {
              var v = f.input.value.trim();
              if (f.spec.required && !v) { ok = false; f.wrap.classList.add('has-error'); }
              else f.wrap.classList.remove('has-error');
              if (f.spec.type === 'number') v = v === '' ? null : Number(v);
              data[f.name] = v;
            });
            if (!ok) { error.hidden = false; error.textContent = 'يرجى إكمال الحقول المطلوبة.'; return; }
            var keep = opts.onSubmit && opts.onSubmit(data, { close: close, box: box });
            if (keep !== false) close();
          }
        }
      ]
    });
    return m;
  }

  /* --------------------------------------------------------------- الجداول */
  function table(opts) {
    var wrap = h('div', { class: 'table-wrap' });
    var t = h('table', { class: 'data-table' });
    var thead = h('thead');
    thead.appendChild(h('tr', {}, (opts.cols || []).map(function (c) {
      return h('th', { text: c.label, style: c.width ? { width: c.width } : null, class: c.class || '' });
    })));
    t.appendChild(thead);
    var tbody = h('tbody');
    var rows = opts.rows || [];
    if (!rows.length) {
      tbody.appendChild(h('tr', {}, [h('td', { colspan: (opts.cols || []).length, class: 'table-empty', text: opts.empty || 'لا توجد بيانات.' })]));
    }
    rows.forEach(function (row, i) {
      tbody.appendChild(h('tr', { class: opts.rowClass ? opts.rowClass(row) : null }, (opts.cols || []).map(function (c) {
        var v = c.render ? c.render(row, i) : row[c.key];
        var td = h('td', { class: c.class || '' });
        if (v == null || v === '') td.textContent = '—';
        else if (typeof v === 'string' || typeof v === 'number') td.textContent = v;
        else td.appendChild(v);
        return td;
      })));
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /* ------------------------------------------------------------ عناصر صغيرة */
  function badge(text, tone) { return h('span', { class: 'chip chip-' + (tone || 'plain'), text: text }); }
  function statCard(label, value, sub, tone) {
    return h('div', { class: 'stat-card' + (tone ? ' stat-' + tone : '') }, [
      h('span', { class: 'stat-label', text: label }),
      h('span', { class: 'stat-value nums', text: value }),
      sub ? h('span', { class: 'stat-sub muted', text: sub }) : null
    ]);
  }
  function sectionHead(title, sub, actions) {
    return h('div', { class: 'panel-head' }, [
      h('div', {}, [h('h3', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null]),
      actions ? h('div', { class: 'cluster' }, [].concat(actions)) : null
    ]);
  }
  function panel(title, sub, actions, children) {
    return h('section', { class: 'panel' }, [
      title ? sectionHead(title, sub, actions) : null,
      h('div', { class: 'panel-body' }, [].concat(children || []))
    ]);
  }
  function empty(msg, action) {
    return h('div', { class: 'empty-state' }, [
      h('div', { class: 'empty-icon', html: '&#128203;' }),
      h('p', { class: 'muted', text: msg }),
      action || null
    ]);
  }
  function timeline(items) {
    return h('ul', { class: 'timeline-list' }, (items || []).map(function (it) {
      return h('li', {}, [
        h('span', { class: 'tl-dot' }),
        h('div', {}, [
          h('div', { class: 'tl-text', text: it.text }),
          h('div', { class: 'tl-meta', text: [it.by, UI.fmtDateTime(it.at)].filter(Boolean).join(' · ') })
        ])
      ]);
    }));
  }
  function tabs(items, onPick) {
    var bar = h('div', { class: 'tabbar' });
    items.forEach(function (it, i) {
      bar.appendChild(h('button', {
        class: 'tab' + (i === 0 ? ' is-active' : ''), type: 'button', text: it.label,
        onClick: function () {
          Array.prototype.forEach.call(bar.children, function (b) { b.classList.remove('is-active'); });
          bar.children[i].classList.add('is-active');
          onPick(it.key);
        }
      }));
    });
    return bar;
  }

  /* -------------------------------------------------------------- التواريخ */
  var HIJRI = null;
  try { HIJRI = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) {}
  var GREG = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: '2-digit', month: 'long', year: 'numeric' });
  /** يحوّل 'YYYY-MM-DD' إلى تاريخ محلي (تجنّب انزياح UTC) */
  function toDate(d) {
    if (d instanceof Date) return d;
    if (d == null || d === '') return new Date();
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    var x = new Date(d); return isNaN(x) ? new Date() : x;
  }
  function hijri(d) { try { return HIJRI ? HIJRI.format(toDate(d)) : ''; } catch (e) { return ''; } }
  function greg(d) { try { return GREG.format(toDate(d)); } catch (e) { return ''; } }
  function fmtDate(d) { if (!d) return '—'; return String(d).slice(0, 10); }
  function fmtTime(d) { if (!d) return '—'; var x = new Date(d); return isNaN(x) ? '—' : x.toTimeString().slice(0, 5); }
  function fmtDateTime(d) {
    if (!d) return '';
    var x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x)) return String(d);
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()) + ' · ' + p2(x.getHours()) + ':' + p2(x.getMinutes());
  }
  /** تاريخ ميلادي + هجري — بلا تكرار «هـ» (صيغة التقويم الهجري تُضمّنها أصلًا) */
  function dateLabel(d) {
    var hj = String(hijri(d) || '').trim().replace(/\s*هـ\s*$/, '');
    var g = String(greg(d) || '').trim().replace(/\s*م\s*$/, '');
    if (hj && g) return hj + ' هـ — ' + g + ' م';      /* الهجري أولًا ثم الميلادي */
    return hj ? (hj + ' هـ') : g;
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------------------------------------------------------------- الباركود */
  function qrSvg(text, cellSize, margin) {
    try {
      var q = global.qrcode(0, 'M');
      q.addData(String(text));
      q.make();
      return q.createSvgTag({ cellSize: cellSize || 2, margin: margin == null ? 1 : margin, scalable: true });
    } catch (e) { return '<div class="qr-fail">تعذّر توليد الباركود</div>'; }
  }
  function qrBox(text, label, size) {
    return h('div', { class: 'qr-box' }, [
      h('div', { class: 'qr-img', html: qrSvg(text, 3, 1), style: { width: (size || 92) + 'px' } }),
      h('div', { class: 'qr-text' }, [
        h('div', { class: 'qr-label', text: label || 'رمز التقرير' }),
        h('code', { text: text })
      ])
    ]);
  }

  /* ------------------------------------------------------------ استيراد Excel */
  function readExcel(file) {
    var isCsv = /\.csv$/i.test(file.name || '');
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb, rows;
          if (isCsv) {
            /* CSV يُقرأ نصًّا بترميز UTF-8 حتى لا تتحطّم العناوين العربية */
            var text = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
            wb = global.XLSX.read(text, { type: 'string' });
          } else {
            wb = global.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          }
          rows = global.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          resolve({ rows: rows, sheetNames: wb.SheetNames });
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  function downloadCsv(rows, filename) {
    if (!rows || !rows.length) return;
    var cols = Object.keys(rows[0]);
    var csv = '\ufeff' + cols.join(',') + '\n' + rows.map(function (r) {
      return cols.map(function (c) { return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename || 'export.csv';
    a.click();
  }

  /* ------------------------------------------------------------- التقارير */
  /** الترويسة الرسمية للتقارير (تُبنى من إعدادات «ترويسة التقارير» لدى مدير المدرسة) */
  function letterhead(school, report) {
    var S = global.Store;
    var lh = S ? S.letterhead(school && school.id) : {};
    if (school && school.__lh) lh = Object.assign(lh, school.__lh);
    var sc = lh._school || school || {};
    var ministryLogo = lh.showMinistryLogo !== false ? (lh.ministryLogo || 'assets/img/ministry-logo.png') : '';
    /* شعار المدرسة اختياري: لا يظهر إلا إذا كانت المدرسة تملك شعارًا فعليًا */
    var schoolLogo = (lh.showSchoolLogo !== false) ? (lh.schoolLogo || sc.logo || '') : '';
    var d = new Date();
    return '' +
      '<header class="lh">' +
        '<div class="lh-head">' +
          (lh.showBasmala !== false ? '<div class="lh-basmala">' + (lh.basmala || '') + '</div>' : '') +
          '<div class="lh-country">' + (lh.country || '') + '</div>' +
          '<div class="lh-ministry">' + (lh.ministry || '') + '</div>' +
          (lh.educationDept ? '<div class="lh-dept">' + lh.educationDept + '</div>' : '') +
          '<div class="lh-school">' + (lh.schoolLine || sc.name || '') + '</div>' +
        '</div>' +
        '<div class="lh-row">' +
          /* المنتصف: شعار وزارة التعليم */
          '<div class="lh-center">' + (ministryLogo ? '<img class="lh-logo-m" src="' + ministryLogo + '" alt="شعار وزارة التعليم">' : '') + '</div>' +
          /* يسار الصفحة: شعار المدرسة فقط (التاريخ والباركود في أسفل التقرير) */
          '<div class="lh-side">' +
            (schoolLogo ? '<img class="lh-logo-s" src="' + schoolLogo + '" alt="شعار المدرسة">' : '') +
          '</div>' +
        '</div>' +
        (report.title ? '<h1 class="lh-title">' + report.title + '</h1>' : '') +
        (report.subtitle ? '<div class="lh-sub">' + report.subtitle + '</div>' : '') +
      '</header>';
  }

  function tableHtml(spec) {
    if (!spec) return '';
    var cols = spec.cols || [], rows = spec.rows || [];
    return '<table class="rp-table"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (rows.length ? rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + (c == null ? '—' : String(c)) + '</td>'; }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + cols.length + '" class="rp-empty">لا توجد بيانات</td></tr>') + '</tbody></table>';
  }


  /* ==========================================================================
     باركود خطي Code 39 (قابل للمسح بأي قارئ باركود) — يرسم كخطوط عمودية SVG
     ========================================================================== */
  var CODE39 = {
    '0':'000110100','1':'100100001','2':'001100001','3':'101100000','4':'000110001',
    '5':'100110000','6':'001110000','7':'000100101','8':'100100100','9':'001100100',
    'A':'100001001','B':'001001001','C':'101001000','D':'000011001','E':'100011000',
    'F':'001011000','G':'000001101','H':'100001100','I':'001001100','J':'000011100',
    'K':'100000011','L':'001000011','M':'101000010','N':'000010011','O':'100010010',
    'P':'001010010','Q':'000000111','R':'100000110','S':'001000110','T':'000010110',
    'U':'110000001','V':'011000001','W':'111000000','X':'010010001','Y':'110010000',
    'Z':'011010000','-':'010000101','.':'110000100',' ':'011000100',
    '$':'010101000','/':'010100010','+':'010001010','%':'000101010','*':'010010100'
  };

  /** يبني SVG لباركود Code 39 — الخيارات: {height, module, showText, color} */
  function barcodeSvg(code, opts) {
    opts = opts || {};
    var txt = String(code || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '-');
    if (!txt) txt = 'TABANI';
    var data = '*' + txt + '*';
    var module = opts.module || 2;
    var height = opts.height || 46;
    var narrow = module, wide = module * 3;   /* نسبة 3:1 = أوضح للمسح */
    var quiet = module * 10;                  /* هامش صامت إلزامي */
    var x = quiet, rects = '';
    for (var i = 0; i < data.length; i++) {
      var pat = CODE39[data.charAt(i)] || CODE39['-'];
      for (var k = 0; k < 9; k++) {
        var w = (pat.charAt(k) === '1') ? wide : narrow;
        if (k % 2 === 0) rects += '<rect x="' + x + '" y="0" width="' + w + '" height="' + height + '" fill="' + (opts.color || '#14100A') + '"/>';
        x += w;
      }
      x += narrow;                             /* مسافة بين الحروف */
    }
    var total = x + quiet;
    var textH = opts.showText === false ? 0 : 14;
    var text = textH ? '<text x="' + (total / 2) + '" y="' + (height + 12) + '" text-anchor="middle" ' +
      'font-family="ui-monospace,monospace" font-size="11" fill="#4A4032" letter-spacing="1">' + txt + '</text>' : '';
    return '<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + (height + textH) + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" aria-label="باركود التقرير ' + txt + '">' + rects + text + '</svg>';
  }

  /** إطار باركود للعرض داخل الصفحة */
  function barcodeBox(code, opts) {
    return h('div', { class: 'barcode-box', html: barcodeSvg(code, opts) });
  }

  var PRINT_CSS = '' +
    '@page{size:A4;margin:12mm 10mm}' +
    'body{font-family:"IBM Plex Sans Arabic",sans-serif;color:#14100A;margin:0;direction:rtl}' +
    /* الترويسة الرسمية */
    '.lh{margin-bottom:10px}' +
    '.lh-head{text-align:center;line-height:1.55}' +
    '.lh-basmala{font-size:14px;font-weight:700;color:#8A5A1E;letter-spacing:.2px}' +
    '.lh-country{font-size:13px;font-weight:700}' +
    '.lh-ministry{font-size:12px;font-weight:600}' +
    '.lh-dept{font-size:11.5px;color:#3A3023}' +
    '.lh-school{font-size:13.5px;font-weight:800;margin-top:2px}' +
    '.lh-row{position:relative;margin-top:9px;padding-top:8px;border-top:1.5px solid #E9E1D2;min-height:86px}' +
    '.lh-center{display:flex;justify-content:center;align-items:flex-start;padding-top:2px}' +
    '.lh-side{position:absolute;left:0;top:8px;width:196px;display:flex;flex-direction:column;gap:4px;align-items:flex-end;text-align:left}' +
    '.lh-logo-m{width:132px;height:auto;display:block}' +
    '.lh-logo-s{width:68px;height:auto}' +
    '.lh-issue{align-items:flex-end;text-align:left}' +
    '.lh-issue{font-size:9.5px;color:#4A4032;display:flex;flex-direction:column;gap:2px;align-items:flex-start}' +
    '.lh-issue strong{color:#14100A}' +
    '.lh-code code{font-family:ui-monospace,monospace;font-size:9.5px;background:#FAF1D8;border:1px solid #D9D1C2;border-radius:5px;padding:1px 6px;direction:ltr;display:inline-block}' +
    '.lh-qr svg{width:74px;height:74px;display:block;margin-top:3px}' +
    '.lh-title{text-align:center;font-size:22px;font-weight:800;margin:12px 0 2px;letter-spacing:-.2px}' +
    '.lh-sub{text-align:center;font-size:11px;color:#5A5044;margin-bottom:6px}' +
    /* جسم التقرير */
    '.rp-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0;font-size:11px;border-top:1px dashed #D9D1C2;border-bottom:1px dashed #D9D1C2;padding:8px 0}' +
    /* رمز QR للتحقق (يُقرأ بكاميرا الحارس) */
    '.rp-qr{display:flex;align-items:center;gap:12px;border:1.5px solid #CE9433;border-radius:8px;padding:10px 12px;margin:10px 0;background:#FCF8F0;break-inside:avoid}' +
    '.rp-qr-img{width:38mm;height:38mm;flex:none;background:#fff;padding:2mm;border-radius:5px}' +
    '.rp-qr-img svg{width:100%;height:100%;display:block}' +
    '.rp-qr-txt{font-size:11px;line-height:1.7}' +
    '.rp-qr-title{font-size:13px;font-weight:800;color:#8A5A1E;margin-bottom:2px}' +
    '.rp-qr-code{font-family:ui-monospace,monospace;font-size:14px;font-weight:800;letter-spacing:1px;direction:ltr;text-align:left}' +
    '.rp-qr-note{color:#4A4033;font-size:10.5px}' +
    '.rp-meta span strong{color:#8A5A1E}' +
    '.rp-section{margin:12px 0}' +
    '.rp-section h4{font-size:12.5px;margin:0 0 6px;border-inline-start:4px solid #CE9433;padding-inline-start:8px}' +
    '.rp-section p{font-size:11px;line-height:1.7;margin:4px 0}' +
    '.rp-table{width:100%;border-collapse:collapse;font-size:10.5px}' +
    '.rp-table th{background:#FAF1D8;border:1px solid #D9D1C2;padding:6px;text-align:start}' +
    '.rp-table td{border:1px solid #D9D1C2;padding:6px}' +
    '.rp-empty{text-align:center;color:#6B6152}' +
    '.rp-chart{margin:6px 0}.rp-chart svg{width:100%;height:auto}' +
    '.rp-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10px;margin-bottom:6px}' +
    '.rp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:5px}' +
    /* تذييل التقرير */
    '.rp-foot{margin-top:16px;border-top:2px solid #CE9433;padding-top:10px}' +
    '.rp-foot-line{display:flex;flex-wrap:wrap;gap:6px 26px;font-size:10.5px;margin-bottom:12px}' +
    '.rp-foot-line span strong{color:#8A5A1E}' +
    '.signs{display:flex;gap:34px;font-size:10.5px;justify-content:flex-start;margin-top:6px}' +
    '.signs div{border-top:1px solid #B4A996;padding-top:4px;min-width:140px;text-align:center}' +
    '.barcode{display:block;height:54px;width:auto}' +
    '.barcode-box{background:#fff;border:1px solid #D9D1C2;border-radius:6px;padding:6px 8px;display:inline-block}' +
    '.rp-foot-top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}' +
    '.rp-foot-bc{text-align:left}' +
    '.rp-foot-bc .barcode{height:52px}' +
    '.rp-note{font-size:9px;color:#5A5044;margin-top:10px;line-height:1.6;border-top:1px dashed #D9D1C2;padding-top:6px}' +
    '.rp-page{font-size:9px;color:#6B6152;text-align:center;margin-top:6px}' +
    '@media print{.no-print{display:none}}';

  /** يطبع تقريرًا كاملًا في إطار مخفي (لا يفتح نوافذ منبثقة). */
  /* ---------------- بيئة آبل: التطبيق المُثبَّت لا يطبع ولا ينزّل كما في سفاري ---------------- */
  function isIOS() {
    try {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    } catch (e) { return false; }
  }
  function isStandalone() {
    try {
      return (window.navigator.standalone === true) ||
        !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }
  /** مشاركة ملف عبر ورقة المشاركة (على آبل: طباعة · حفظ في الملفات · درايف) */
  function shareFile(content, filename, mime, title) {
    try {
      if (!navigator.canShare || !window.File) return false;
      var f = new File([content], filename, { type: mime || 'text/html;charset=utf-8' });
      if (!navigator.canShare({ files: [f] })) return false;
      navigator.share({ files: [f], title: title || filename }).catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  /** عنوان المستند أثناء الطباعة: يجعل اسم ملف PDF/الحفظ = اسم التقرير لا اسم المنصة */
  var _titleTimer = null;
  function withPrintTitle(title) {
    try {
      if (!title) return;
      if (_titleTimer) clearTimeout(_titleTimer);
      if (!withPrintTitle._base) withPrintTitle._base = document.title;
      document.title = String(title).trim();
      _titleTimer = setTimeout(function () { if (withPrintTitle._base) document.title = withPrintTitle._base; }, 6000);
      if (!withPrintTitle._bound) {
        withPrintTitle._bound = true;
        window.addEventListener('afterprint', function () {
          if (withPrintTitle._base) { document.title = withPrintTitle._base; withPrintTitle._base = ''; }
        });
      }
    } catch (e) {}
  }
  /** استخراج عنوان من HTML وثيقة مطبوعة */
  function htmlTitle(html) {
    var m = String(html || '').match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].trim() : '';
  }

  /** شريط إجراءات ظاهر للتقرير: يضمن رؤية النتيجة، ويعطي بدائل حين تُحجب نافذة الطباعة (جوال/تطبيق مثبَّت) */
  function reportActionBar(html, frame, title) {
    var old = document.getElementById('report-bar');
    if (old) old.remove();
    var blobUrl = '';
    function openTab() {
      try {
        if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        var w = window.open(blobUrl, '_blank');
        if (!w) toast('اسمح بالنوافذ المنبثقة لفتح الوثيقة', 'warn');
      } catch (e) { toast('تعذّر فتح الوثيقة في تبويب', 'warn'); }
    }
    var shareable = isIOS();
    var shareBtn = shareable ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'مشاركة / طباعة', onClick: function () {
      var okShare = shareFile(html, (title || 'وثيقة') + '.html', 'text/html;charset=utf-8', title);
      if (!okShare) toast('تعذّرت المشاركة — افتح تابعني من سفاري للطباعة', 'warn');
    } }) : null;
    var bar = h('div', { id: 'report-bar', class: 'report-bar', dir: 'rtl' }, [
      h('span', { class: 'rb-ic', html: '&#128424;&#65039;' }),
      h('span', { class: 'rb-t', text: title || 'الوثيقة جاهزة' }),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'طباعة', onClick: function () {
        withPrintTitle(title);
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch (e) { openTab(); }
      } }),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'فتح في تبويب جديد', onClick: openTab }),
      shareBtn,
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'حفظ PDF', onClick: function () {
        toast('في نافذة الطباعة اختر: الوجهة ← حفظ كـ PDF', 'ok');
        withPrintTitle(title);
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { openTab(); }
      } }),
      h('button', { class: 'icon-btn', type: 'button', title: 'إخفاء', html: '&times;', onClick: function () { bar.remove(); } })
    ]);
    if (shareable) {
      bar.appendChild(h('div', { class: 'rb-hint', text: isStandalone()
        ? 'في التطبيق المُثبَّت على آبل لا تعمل الطباعة/التنزيل مباشرة — اضغط «مشاركة / طباعة» ثم اختر «طباعة» أو «حفظ في الملفات/درايف»، أو افتح تابعني من سفاري.'
        : 'على آبل: استخدم «مشاركة / طباعة» لحفظ الوثيقة PDF أو إرسالها إلى درايف.' }));
    }
    document.body.appendChild(bar);
    setTimeout(function () { if (bar.parentElement) bar.remove(); }, 45000);
    return bar;
  }

  function printReport(report) {
    var school = global.Store ? global.Store.school(global.Store.session.schoolId) : {};
    if (report.school) school = report.school;
    var meta = (report.meta || []).map(function (m) {
      return '<span><strong>' + m.label + ':</strong> ' + (m.value == null ? '—' : m.value) + '</span>';
    }).join('');
    var sections = (report.sections || []).map(function (s) {
      return '<section class="rp-section">' +
        (s.heading ? '<h4>' + s.heading + '</h4>' : '') +
        (s.text ? '<p>' + String(s.text).replace(/\n/g, '<br>') + '</p>' : '') +
        (s.table ? tableHtml(s.table) : '') +
        (s.chart ? '<div class="rp-chart">' + chartSvg(Object.assign({ width: 760, height: 240 }, s.chart)) + '</div>' +
          (s.chart.series && s.chart.series.length > 1 ? '<div class="rp-legend">' + s.chart.series.map(function (se, i) {
            return '<span><i style="background:' + (se.color || PALETTE[i % PALETTE.length]) + '"></i>' + se.name + '</span>';
          }).join('') + '</div>' : '') : '') +
        (s.list ? '<ul style="font-size:11px;line-height:1.7;padding-inline-start:18px">' + s.list.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') +
        '</section>';
    }).join('');
    var signs = (report.signatures || ['المعلم', 'وكيل شؤون الطلاب', 'مدير المدرسة']).map(function (s) { return '<div>' + s + '</div>'; }).join('');
    var lh = (global.Store && global.Store.letterhead) ? global.Store.letterhead() : {};
    var html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<title>' + (report.title || 'تقرير') + '</title><style>' + PRINT_CSS + '</style></head><body>' +
      letterhead(school, report) +
      (meta ? '<div class="rp-meta">' + meta + '</div>' : '') +
      (report.qr ? '<div class="rp-qr">' +
        '<div class="rp-qr-img">' + qrSvg(report.qr, 4, 1) + '</div>' +
        '<div class="rp-qr-txt">' +
          '<div class="rp-qr-title">' + (report.qrTitle || 'رمز التحقق') + '</div>' +
          '<div class="rp-qr-code">' + report.qr + '</div>' +
          '<div class="rp-qr-note">' + (report.qrHint || 'يُقرأ بكاميرا حارس البوابة عند الخروج — لا يحتاج إنترنت.') + '</div>' +
        '</div>' +
      '</div>' : '') +
      sections +
      '<div class="rp-foot">' +
        '<div class="rp-foot-top">' +
          '<div class="rp-foot-line">' +
            '<span>التاريخ: <strong>' + dateLabel(new Date()) + '</strong></span>' +
            '<span>الوقت: <strong>' + fmtTime(new Date()) + '</strong></span>' +
          '</div>' +
          /* الباركود الخطي: أسفل يسار الصفحة */
          (report.code ? '<div class="rp-foot-bc">' + barcodeSvg(report.code, { height: 44, module: 2 }) +
            '<div class="lh-code" style="margin-top:3px">رقم التقرير: <code>' + report.code + '</code></div></div>' : '') +
        '</div>' +
        '<div class="signs">' + signs + '</div>' +
        (lh.footerNote ? '<div class="rp-note">' + lh.footerNote + '</div>' : '') +
      '</div>' +
      '</body></html>';

    var frame = document.getElementById('print-frame');
    if (!frame) {
      frame = h('iframe', { id: 'print-frame', class: 'print-frame', title: 'طباعة' });
      document.body.appendChild(frame);
    }
    var doc = frame.contentDocument || frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    var go = function () {
      withPrintTitle(report.title);
      reportActionBar(html, frame, report.title);
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { toast('تعذّر فتح نافذة الطباعة', 'warn'); }
    };
    setTimeout(function () {
      if (frame.contentDocument && frame.contentDocument.readyState === 'complete') go();
      else if (frame.contentWindow) frame.contentWindow.onload = go;
      else go();
    }, 260);
  }

  /** زر يطبع تقرًا مسجّلًا في مركز التقارير */
  function reportButton(buildReport, opts) {
    var label = (opts && opts.label) || 'تصدير PDF / طباعة';
    return h('button', {
      class: 'btn ' + ((opts && opts.class) || 'btn-soft'), type: 'button', onClick: function () {
        var spec = typeof buildReport === 'function' ? buildReport() : buildReport;
        var ST = global.Store;
        var rep = null;
        if (spec.code && ST) {
          rep = ST.findReport(spec.code) || null;              /* إعادة طباعة تقرير مسجّل */
        } else if (ST) {
          rep = ST.registerReport(spec.type || 'custom', spec.refId || '', { title: spec.title });
          spec.code = rep.code;
        }
        printReport(spec);
        if (rep && ST) ST.markPrinted(rep.id);
        if (global.App) global.App.refreshBadges();
      }
    }, [h('span', { html: '&#128424;&#65039;' }), h('span', { text: ' ' + label })]);
  }

  /* ======================================================================
     المالية — ختم تابعني · الفاتورة الإلكترونية · ضغط الصور
     ====================================================================== */
  /** مجلد التطبيق بمسار مطلق (للاستخدام داخل وثيقة الطباعة) */
  function appBase() {
    var u = String(location.href).split('?')[0].split('#')[0];
    return u.replace(/[^\/]*$/, '');
  }

  /* شعار الختم مضمّن (data URI) — يظهر في الطباعة والتصدير وبلا إنترنت */
  var LOGO_DATA = '';
  (function loadLogo() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'assets/img/logo-mark.png', true);
      xhr.responseType = 'blob';
      xhr.onload = function () {
        if (xhr.status !== 200 && xhr.status !== 0) return;
        var fr = new FileReader();
        fr.onload = function () { LOGO_DATA = String(fr.result || ''); };
        fr.readAsDataURL(xhr.response);
      };
      xhr.send();
    } catch (e) {}
  })();
  /** ختم دائري رسمي (SVG داخل الصفحة — بلا صور ولا إنترنت)
      • الوسط: شعار تابعني   • الأعلى: اسم المنصة (مسار من اليمين لليسار ⇒ عربي غير مقلوب)
      • الأسفل: تاريخ الطباعة هجريًا + الساعة */
  function stampSvg(opts) {
    opts = opts || {};
    var color = opts.color || '#1E7A5A';
    var top = opts.top || 'تابعني للخدمات الذكية';
    var bot = opts.bottom || '';
    var size = opts.size || 190;
    var id = 'st' + Math.random().toString(36).slice(2, 8);
    var logo = (opts.logo === false) ? '' :
      '<image xlink:href="' + (LOGO_DATA || 'assets/img/logo-mark.png') + '" href="' + (LOGO_DATA || 'assets/img/logo-mark.png') + '" x="72" y="72" ' +
      'width="56" height="56" preserveAspectRatio="xMidYMid meet"/>';
    return '<svg viewBox="0 0 200 200" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      /* مسار الأعلى باتجاه اليمين ← اليسار: النص العربي يُرسم بترتيبه الصحيح (غير مقلوب) */
      '<defs><path id="' + id + '" d="M174,100 A74,74 0 0 0 26,100"/></defs>' +
      '<circle cx="100" cy="100" r="95" fill="none" stroke="' + color + '" stroke-width="3.2"/>' +
      '<circle cx="100" cy="100" r="89.5" fill="none" stroke="' + color + '" stroke-width="1.1"/>' +
      '<circle cx="100" cy="100" r="59" fill="none" stroke="' + color + '" stroke-width="1.1" stroke-dasharray="4 3"/>' +
      '<text fill="' + color + '" font-size="14.5" font-weight="700" direction="rtl">' +
        '<textPath xlink:href="#' + id + '" href="#' + id + '" startOffset="50%" text-anchor="middle">' + top + '</textPath>' +
      '</text>' +
      logo +
      (bot ? '<text fill="' + color + '" font-size="9.2" font-weight="700" x="100" y="172" text-anchor="middle" direction="rtl">' + bot + '</text>' : '') +
      '</svg>';
  }

  /** تنسيق المبالغ: 1,500.00 */
  function fmtMoney(n) {
    var x = Number(n) || 0;
    var parts = x.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /** وثيقة طباعة عامة (نفس إطار التقارير المخفي) */
  function printDoc(html) {
    var frame = document.getElementById('print-frame');
    if (!frame) {
      frame = h('iframe', { id: 'print-frame', class: 'print-frame', title: 'طباعة' });
      document.body.appendChild(frame);
    }
    var doc = frame.contentDocument || frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    var go = function () {
      withPrintTitle(htmlTitle(html) || 'الوثيقة جاهزة');
      reportActionBar(html, frame, 'الوثيقة جاهزة');
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { toast('تعذّر فتح نافذة الطباعة', 'warn'); }
    };
    setTimeout(function () {
      if (frame.contentDocument && frame.contentDocument.readyState === 'complete') go();
      else if (frame.contentWindow) frame.contentWindow.onload = go;
      else go();
    }, 300);
  }

  var INVOICE_CSS = '' +
    '@page{size:A4;margin:14mm 12mm}' +
    'body{font-family:"IBM Plex Sans Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;color:#14100A;margin:0;direction:rtl;background:#fff}' +
    '.inv{border:1.4px solid #E3D9C6;border-radius:10px;padding:16px 18px}' +
    '.inv-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid #1E7A5A;padding-bottom:10px}' +
    '.inv-brand{display:flex;align-items:center;gap:10px}' +
    '.inv-brand img{width:64px;height:auto}' +
    '.inv-brand .bn{font-size:19px;font-weight:800;color:#14100A}' +
    '.inv-brand .bs{font-size:11.5px;color:#6B6152}' +
    '.inv-tag{text-align:left;font-size:11.5px;color:#3A3023;line-height:1.7}' +
    '.inv-tag .big{font-size:15px;font-weight:800;color:#1E7A5A}' +
    '.inv-num{background:#F5F1E8;border:1px dashed #C9BFA9;border-radius:8px;padding:6px 10px;display:inline-block;font-weight:700}' +
    '.inv h1{font-size:16px;margin:14px 0 6px;text-align:center}' +
    '.inv-sub{text-align:center;font-size:11px;color:#6B6152;margin-bottom:12px}' +
    '.inv-parties{display:flex;gap:10px;margin-bottom:12px}' +
    '.inv-parties>div{flex:1;border:1px solid #E9E1D2;border-radius:8px;padding:9px 11px;font-size:11.5px;line-height:1.9}' +
    '.inv-parties .k{color:#6B6152}' +
    'table.inv-tbl{width:100%;border-collapse:collapse;font-size:12px}' +
    'table.inv-tbl th,table.inv-tbl td{border:1px solid #E3D9C6;padding:8px 9px;text-align:right}' +
    'table.inv-tbl th{background:#F5F1E8;font-size:11.5px}' +
    'table.inv-tbl td.num{font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.inv-tot{margin-top:10px;display:flex;justify-content:flex-start}' +
    '.inv-tot .box{border:1.6px solid #1E7A5A;border-radius:8px;padding:8px 14px;font-weight:800;font-size:15px;color:#1E7A5A}' +
    '.inv-stamps{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;margin-top:16px;border-top:1px dashed #E3D9C6;padding-top:12px}' +
    '.inv-stamp{text-align:center;font-size:11px;color:#3A3023}' +
    '.inv-stamp .cap{margin-top:4px;font-weight:700}' +
    '.inv-stamp .hint{color:#6B6152;font-size:10px}' +
    '.inv-ph{border:1.4px dashed #C9BFA9;border-radius:8px;width:150px;height:110px;display:flex;align-items:center;justify-content:center;color:#8C8271;font-size:11px;text-align:center;padding:8px}' +
    '.inv-receipt img{max-width:230px;max-height:150px;border:1px solid #E3D9C6;border-radius:6px}' +
    '.inv-foot{margin-top:14px;border-top:1.4px solid #E9E1D2;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:10px}' +
    '.inv-foot .note{font-size:10.5px;color:#6B6152;line-height:1.8}' +
    '.inv-sign{display:flex;gap:26px;font-size:11px;text-align:center;margin-top:14px}' +
    '.inv-sign div{border-top:1px solid #C9BFA9;padding-top:5px;min-width:150px;color:#3A3023}' +
    '.inv-qr{text-align:center;font-size:10px;color:#6B6152}' +
    '.inv-qr svg{width:84px;height:84px}' +
    '.inv-print{text-align:center;margin:16px 0 0}' +
    '.inv-print button{font:inherit;font-size:12px;padding:7px 16px;border-radius:8px;border:1px solid #1E7A5A;background:#1E7A5A;color:#fff;cursor:pointer}' +
    '@media print{.inv-print{display:none}}';

  /** يبني HTML الفاتورة الإلكترونية (منفصل عن الطباعة ليمكن فحصه واختباره) */
  function invoiceHtml(inv) {
    var S = global.Store || {};
    var base = appBase();
    var d = new Date(inv.at || Date.now());
    var planName = S.planDef ? S.planDef(inv.plan).name : 'تابعني';
    var title = S.invoiceTitle ? S.invoiceTitle(inv) : 'اشتراك';
    var amount = Number(inv.amount) || 0;
    var schoolStamp = inv.schoolStamp || '';
    var receipt = inv.receipt || '';
    var bank = S.bank ? S.bank() : {};
    var esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    var html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<base href="' + base + '">' +
      '<title>فاتورة ' + esc(inv.no) + '</title>' +
      '<link rel="stylesheet" href="assets/fonts/fonts.css">' +
      '<style>' + INVOICE_CSS + '</style></head><body>' +
      '<div class="inv">' +
        '<div class="inv-head">' +
          '<div class="inv-brand">' +
            '<img src="assets/img/logo-mark.png" alt="تابعني">' +
            '<div><div class="bn">تابعني للخدمات الذكية</div>' +
            '<div class="bs">تابعني للخدمات الذكية · tabaani.sa</div></div>' +
          '</div>' +
          '<div class="inv-tag">' +
            '<div class="big">فاتورة إلكترونية</div>' +
            '<div class="inv-num">رقم الفاتورة: ' + esc(inv.no) + '</div><br>' +
            '<div>التاريخ: <strong>' + dateLabel(d) + '</strong></div>' +
            '<div>الوقت: <strong>' + fmtTime(d) + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<h1>فاتورة إلكترونية — «تابعني للخدمات الذكية»</h1>' +
        '<div class="inv-sub">صدرت إلكترونيًا من تابعني · ' + esc(inv.seller || 'تابعني للخدمات الذكية') +
          ' · حساب بنكي: ' + esc(bank.bankName || '') + '</div>' +
        '<div class="inv-parties">' +
          '<div><div class="k">المشتري (المدرسة):</div>' +
            '<div><strong>' + esc(inv.schoolName || '—') + '</strong></div>' +
            '<div class="k">' + esc(inv.schoolCity || '') + (inv.schoolCode ? ' · رمز المدرسة: ' + esc(inv.schoolCode) : '') + '</div>' +
            '<div class="k">الباقة: <strong>' + esc(planName) + '</strong></div>' +
          '</div>' +
          '<div><div class="k">البائع (تابعني):</div>' +
            '<div><strong>' + esc(inv.seller || 'تابعني للخدمات الذكية') + '</strong></div>' +
            '<div class="k">طريقة السداد: تحويل بنكي — سند مختوم بختم المدرسة</div>' +
            (inv.paidUntil ? '<div class="k">سريان الاشتراك حتى: <strong>' + esc(inv.paidUntil) + '</strong></div>' : '') +
            (inv.note ? '<div class="k">' + esc(inv.note) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<table class="inv-tbl">' +
          '<thead><tr><th style="width:52%">البند</th><th style="width:12%">الكمية</th><th style="width:18%">السعر</th><th style="width:18%">الإجمالي</th></tr></thead>' +
          '<tbody><tr>' +
            '<td>' + esc(title) + '</td>' +
            '<td class="num">' + (inv.kind === 'setup' ? '1' : String(inv.years || 1)) + '</td>' +
            '<td class="num">' + fmtMoney(inv.kind === 'setup' ? amount : (amount / (inv.years || 1))) + ' ر.س</td>' +
            '<td class="num">' + fmtMoney(amount) + ' ر.س</td>' +
          '</tr></tbody>' +
        '</table>' +
        '<div class="inv-tot"><div class="box">الإجمالي المستحق: ' + fmtMoney(amount) + ' ر.س</div></div>' +
        '<div class="inv-stamps">' +
          '<div class="inv-stamp">' + stampSvg({ mid: 'تابعني', top: 'تابعني للخدمات الذكية', bottom: 'ختم إلكتروني معتمد' }) +
            '<div class="cap">ختم «تابعني للخدمات الذكية»</div>' +
            '<div class="hint">صادر مع الفاتورة إلكترونيًا</div></div>' +
          '<div class="inv-stamp inv-receipt">' +
            (receipt ? '<img src="' + receipt + '" alt="سند التحويل">' : '<div class="inv-ph">لم يُرفق سند تحويل</div>') +
            '<div class="cap">سند التحويل المصرفي</div>' +
            '<div class="hint">مختوم بختم المدرسة</div></div>' +
          '<div class="inv-stamp">' +
            (schoolStamp && schoolStamp !== receipt
              ? '<img src="' + schoolStamp + '" alt="ختم المدرسة" style="max-width:150px;max-height:120px">'
              : '<div class="inv-ph">ختم المدرسة<br>(يرفعه مدير المدرسة مع السند)</div>') +
            '<div class="cap">ختم المدرسة</div></div>' +
        '</div>' +
        '<div class="inv-foot">' +
          '<div class="note">هذه الفاتورة صادرة إلكترونيًا من تابعني، ولا تحتاج توقيعًا أو ختمًا ورقيًا.<br>' +
            'أُصدرت بواسطة: <strong>' + esc(inv.by || 'إدارة تابعني') + '</strong>' +
            (inv.requestId ? ' · على طلب السداد رقم ' + esc(inv.requestId) : '') + '</div>' +
          '<div class="inv-qr">' + qrSvg(inv.no + '|' + Math.round(amount), 3, 1) +
            '<div>رقم الفاتورة: ' + esc(inv.no) + '</div></div>' +
        '</div>' +
        '<div class="inv-sign">' +
          '<div>المحاسب المالي لتابعني</div><div>المشرف العام</div>' +
        '</div>' +
      '</div>' +
      '<div class="inv-print"><button onclick="window.print()">طباعة / حفظ PDF</button></div>' +
      '</body></html>';
    return html;
  }

  /** فاتورة إلكترونية مختومة بختم «تابعني للخدمات الذكية» — تفتح نافذة الطباعة */
  function printInvoice(inv, opts) {
    opts = opts || {};
    var html = invoiceHtml(inv);
    printDoc(html);
    if (opts.after) opts.after();
    return true;
  }

  var PLATFORM_CSS = '' +
    '@page{size:A4;margin:14mm 12mm}' +
    'body{font-family:"IBM Plex Sans Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;color:#14100A;margin:0;direction:rtl;background:#fff}' +
    '.pd{border:1.4px solid #E3D9C6;border-radius:10px;padding:16px 18px}' +
    '.pd-head{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:2px solid #1E7A5A;padding-bottom:10px}' +
    '.pd-brand{display:flex;align-items:center;gap:10px}' +
    '.pd-brand img{width:62px;height:auto}' +
    '.pd-brand .bn{font-size:18px;font-weight:800}' +
    '.pd-brand .bs{font-size:11.5px;color:#6B6152}' +
    '.pd-tag{text-align:left;font-size:11.5px;line-height:1.8;color:#3A3023}' +
    '.pd-tag .big{font-size:15px;font-weight:800;color:#1E7A5A}' +
    '.pd h1{font-size:16px;text-align:center;margin:14px 0 4px}' +
    '.pd-sub{text-align:center;font-size:11px;color:#6B6152;margin-bottom:12px}' +
    '.pd-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}' +
    '.pd-meta>div{border:1px solid #E9E1D2;border-radius:8px;padding:7px 10px;font-size:11.5px;min-width:150px}' +
    '.pd-meta .k{color:#6B6152}' +
    '.pd h3{font-size:13px;margin:14px 0 6px;border-inline-start:4px solid #1E7A5A;padding-inline-start:8px}' +
    'table.pd-tbl{width:100%;border-collapse:collapse;font-size:11.5px}' +
    'table.pd-tbl th,table.pd-tbl td{border:1px solid #E3D9C6;padding:7px 8px;text-align:right}' +
    'table.pd-tbl th{background:#F5F1E8;font-size:11px}' +
    'table.pd-tbl td.num{font-variant-numeric:tabular-nums;white-space:nowrap}' +
    'table.pd-tbl tr.tot td{background:#F5F1E8;font-weight:800}' +
    '.pd-foot{margin-top:14px;border-top:1.4px solid #E9E1D2;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:10px}' +
    '.pd-foot .note{font-size:10.5px;color:#6B6152;line-height:1.8}' +
    '.pd-stamp{text-align:center}' +
    '.pd-stamp .cap{font-size:10.5px;color:#3A3023;margin-top:3px}' +
    '.pd-sign{display:flex;justify-content:flex-start;gap:30px;font-size:11px;margin-top:16px}' +
    '.pd-compact .pd-meta>div{padding:5px 8px;font-size:10.6px;min-width:118px}' +
    '.pd-compact h3{font-size:12.5px;margin:9px 0 5px}' +
    '.pd-compact ul{font-size:10.6px;line-height:1.72;margin:0 0 6px}' +
    '.pd-compact .pd-sign{margin-top:12px;font-size:10.6px}' +
    '.pd-compact .pd-foot{margin-top:10px;padding-top:8px}' +
    '.pd-compact .pd-sub{font-size:10.6px}' +
    '@media print{.pd{page-break-inside:avoid}.pd-compact{font-size:10.8px}}' +
    '.pd-sign div{border-top:1px solid #C9BFA9;padding-top:5px;min-width:160px;text-align:center;color:#3A3023}' +
    '.pd-qr{text-align:center;font-size:10px;color:#6B6152}' +
    '.pd-qr svg{width:80px;height:80px}' +
    '@media print{.pd-print{display:none}}';

  /** يبني وثيقة رسمية بترويسة تابعني (تقارير مالية…) */
  function platformDoc(o) {
    o = o || {};
    var base = appBase();
    var esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var d = new Date();
    var meta = (o.meta || []).filter(Boolean).map(function (m) {
      return '<div><span class="k">' + esc(m.label) + ':</span> <strong>' + esc(m.value) + '</strong></div>';
    }).join('');
    var sections = (o.sections || []).map(function (sec) {
      var body = '';
      if (sec.text) body += '<p style="font-size:11.5px;line-height:1.9">' + String(sec.text).replace(/\n/g, '<br>') + '</p>';
      if (sec.table) {
        var cols = sec.table.cols || [], rows = sec.table.rows || [];
        body += '<table class="pd-tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          (rows.length ? rows.map(function (r) {
            var tot = r && r.__tot;
            return '<tr' + (tot ? ' class="tot"' : '') + '>' + r.filter(function (x, i) { return i !== 0 || true; }).map(function (c) {
              var v = String(c == null ? '—' : c);
              var isNum = /^[\d,.\u0660-\u0669]+/.test(v.replace(/[^\d,.\u0660-\u0669]/g, '')) && /[\d\u0660-\u0669]/.test(v);
              return '<td' + (isNum ? ' class="num"' : '') + '>' + esc(v) + '</td>';
            }).join('') + '</tr>';
          }).join('') : '<tr><td colspan="' + cols.length + '">لا بيانات في هذه الفترة</td></tr>') +
          '</tbody></table>';
      }
      if (sec.list) body += '<ul style="font-size:11.5px;line-height:1.9;padding-inline-start:18px">' +
        sec.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      return (sec.heading ? '<h3>' + esc(sec.heading) + '</h3>' : '') + body;
    }).join('');
    var signs = (o.signatures || []).map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('');
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><base href="' + base + '">' +
      '<title>' + esc(o.title || 'تقرير') + '</title>' +
      '<link rel="stylesheet" href="assets/fonts/fonts.css"><style>' + PLATFORM_CSS + '</style></head><body>' +
      '<div class="pd' + (o.compact ? ' pd-compact' : '') + '">' +
        '<div class="pd-head">' +
          '<div class="pd-brand"><img src="assets/img/logo-mark.png" alt="تابعني">' +
            '<div><div class="bn">تابعني للخدمات الذكية</div>' +
            '<div class="bs">تابعني للخدمات الذكية · tabaani.sa</div></div></div>' +
          '<div class="pd-tag"><div class="big">' + esc(o.title || 'تقرير') + '</div>' +
            '<div>التاريخ: <strong>' + dateLabel(d) + '</strong></div>' +
            '<div>الوقت: <strong>' + fmtTime(d) + '</strong></div>' +
            (o.code ? '<div>الرقم: <strong>' + esc(o.code) + '</strong></div>' : '') +
          '</div>' +
        '</div>' +
        (o.subtitle ? '<div class="pd-sub">' + esc(o.subtitle) + '</div>' : '') +
        (meta ? '<div class="pd-meta">' + meta + '</div>' : '') +
        sections +
        '<div class="pd-foot">' +
          '<div class="note">صدرت هذه الوثيقة إلكترونيًا من تابعني' +
            (o.by ? ' — أعدّها: <strong>' + esc(o.by) + '</strong>' : '') + '</div>' +
          (o.qr ? '<div class="pd-qr">' + qrSvg(o.qr, 3, 1) + '<div>' + esc(o.qrNote || '') + '</div></div>' : '') +
          (o.stamp === false ? '' : '<div class="pd-stamp">' + stampSvg({ size: o.compact ? 116 : 130, bottom: stampDateLine(d) }) + '</div>') +
        '</div>' +
        (signs ? '<div class="pd-sign">' + signs + '</div>' : '') +
      '</div>' +
      '<div class="pd-print" style="text-align:center;margin-top:14px"><button onclick="window.print()" ' +
        'style="font:inherit;font-size:12px;padding:7px 16px;border-radius:8px;border:1px solid #1E7A5A;background:#1E7A5A;color:#fff;cursor:pointer">طباعة / حفظ PDF</button></div>' +
      '</body></html>';
  }
  /** سطر أسفل الختم: اليوم + الشهر + السنة الهجرية + ساعة الطباعة */
  function stampDateLine(d) {
    var hj = String(hijri(d) || '').replace(/\s*هـ\s*$/, '').trim();
    var t = fmtTime(d);
    return (hj ? hj + ' هـ' : '') + (t && t !== '—' ? ' · ' + t : '');
  }
  function printPlatformDoc(o) { printDoc(platformDoc(o)); return true; }

  /** يضغط صورة من ملف إلى dataURL (بلا خادم) — يرجّع {dataUrl,w,h,kb,type} */
  function compressImage(file, opts) {
    opts = opts || {};
    var max = opts.max || 1000, q = opts.quality || 0.62;
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height, sc = Math.min(1, max / Math.max(w, h) || 1);
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * sc));
          c.height = Math.max(1, Math.round(h * sc));
          var g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL('image/jpeg', q);
          resolve({ dataUrl: url, w: c.width, h: c.height, kb: Math.round(url.length * 0.75 / 1024), type: 'JPEG' });
        };
        img.onerror = function () { reject(new Error('صورة غير صالحة')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('تعذّر قراءة الملف')); };
      fr.readAsDataURL(file);
    });
  }

  /** أبعاد صورة dataURL (للفرز الأوّلي في الدعم) */
  function imageMeta(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve({ w: img.width, h: img.height, kb: Math.round(String(dataUrl).length * 0.75 / 1024), type: 'JPEG' });
      };
      img.onerror = function () { resolve({ w: 0, h: 0, kb: Math.round(String(dataUrl).length * 0.75 / 1024), type: '' }); };
      img.src = dataUrl;
    });
  }

  /* ------------------------------------------------------------- الإشعارات */
  function setupTelegram() {
    if (!document.getElementById('tg-dock')) {
      var dock = h('div', { id: 'tg-dock', class: 'tg-dock', hidden: true });
      document.body.appendChild(dock);
    }
  }
  function renderTelegram(el) {
    var rows = global.Store.list('telegram');
    clear(el);
    if (!rows.length) { el.appendChild(empty('لا توجد رسائل مُرسلة بعد.')); return; }
    el.appendChild(h('div', { class: 'tg-list' }, rows.map(function (m) {
      return h('article', { class: 'tg-item' }, [
        h('header', {}, [
          h('span', { class: 'tg-to', text: 'إلى: ' + m.toName }),
          m.private ? badge('خاصة', 'brand') : badge('مجموعة المدرسة', 'plain'),
          h('span', { class: 'tg-at muted', text: fmtDateTime(m.at) })
        ]),
        h('pre', { class: 'tg-text', text: m.text }),
        h('footer', { class: 'tg-foot' }, [
          badge(m.status === 'sent' ? 'أُرسلت إلى تلقرام' : (m.status === 'failed' ? 'فشل الإرسال' : (m.status === 'sending' ? 'يُرسل…' : 'بانتظار البوت')),
            m.status === 'sent' ? 'mint' : (m.status === 'failed' ? 'terra' : 'amber')),
          h('button', {
            class: 'btn-link', type: 'button', text: 'نسخ النص', onClick: function () {
              navigator.clipboard && navigator.clipboard.writeText(m.text);
              toast('نُسخت الرسالة', 'ok');
            }
          })
        ])
      ]);
    })));
  }


  /* ------------------------------------------------------------ الرسوم البيانية */
  var PALETTE = ['#CE9433', '#1E7A5A', '#C2593F', '#8A5A1E', '#EBCB74', '#6B6152'];

  /** يُنتج رسمًا بيانيًا كـ SVG string (يُستخدم في الشاشة والطباعة معًا). */
  function chartSvg(spec) {
    spec = spec || {};
    var escSvg = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var rawSeries = (spec.series && spec.series.length) ? spec.series
      : [{ name: spec.name || '', values: spec.values || [], color: spec.color || PALETTE[0] }];
    spec = Object.assign({}, spec, {
      labels: (spec.labels || []).map(escSvg),
      series: rawSeries.map(function (se) { return Object.assign({}, se, { name: escSvg(se.name), values: se.values || [] }); })
    });
    var labels = spec.labels || [];
    var series = spec.series;
    var W = spec.width || 780, H = spec.height || 260;
    var padT = 24, padB = 46, padR = 46, padL = 14;
    var max = 1;
    series.forEach(function (se) { se.values.forEach(function (v) { if (v > max) max = v; }); });
    max = Math.ceil(max * 1.15);
    var n = labels.length || 1;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var step = innerW / n;
    var y = function (v) { return padT + innerH - (v / max) * innerH; };
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" class="ui-chart" preserveAspectRatio="xMidYMid meet">'];
    /* شبكة وخطوط أفقية */
    for (var g = 0; g <= 4; g++) {
      var gv = Math.round((max / 4) * g);
      out.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="#E9ECF5" stroke-width="1"/>');
      out.push('<text x="' + (W - padR + 6) + '" y="' + (y(gv) + 4) + '" font-size="11" fill="#8C8171">' + gv + '</text>');
    }
    /* الأعمدة / الخطوط: أول عنصر على اليمين (RTL) */
    var xOf = function (i) { return padL + innerW - (i + 0.5) * step; };
    if (spec.type === 'line') {
      series.forEach(function (se, si) {
        var pts = se.values.map(function (v, i) { return xOf(i) + ',' + y(v); }).join(' ');
        out.push('<polyline points="' + pts + '" fill="none" stroke="' + (se.color || PALETTE[si % PALETTE.length]) + '" stroke-width="2.5" stroke-linejoin="round"/>');
        se.values.forEach(function (v, i) {
          out.push('<circle cx="' + xOf(i) + '" cy="' + y(v) + '" r="3.5" fill="' + (se.color || PALETTE[si % PALETTE.length]) + '"/>');
        });
      });
    } else if (spec.type === 'donut') {
      var total = series[0].values.reduce(function (a, b) { return a + b; }, 0) || 1;
      var acc = 0, R = Math.min(innerW, innerH) / 2 - 10, cx = W / 2, cy = padT + innerH / 2;
      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#ECE6DA" stroke-width="26"/>');
      series[0].values.forEach(function (v, i) {
        var frac = v / total, dash = 2 * Math.PI * R * frac;
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="' + (series[0].colors && series[0].colors[i] || PALETTE[i % PALETTE.length]) +
          '" stroke-width="26" stroke-dasharray="' + dash + ' ' + (2 * Math.PI * R - dash) + '" stroke-dashoffset="' + (-acc) +
          '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>');
        acc += dash;
      });
      out.push('<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="20" font-weight="700" fill="#14100A">' + total + '</text>');
    } else {
      var bw = Math.max(6, (step * 0.62) / series.length);
      labels.forEach(function (lb, i) {
        series.forEach(function (se, si) {
          var v = se.values[i] || 0;
          var bx = xOf(i) - (series.length * bw) / 2 + si * bw;
          out.push('<rect x="' + bx + '" y="' + y(v) + '" width="' + (bw - 3) + '" height="' + Math.max(0, padT + innerH - y(v)) +
            '" rx="4" fill="' + (se.color || PALETTE[si % PALETTE.length]) + '"/>');
          if (spec.showValues !== false && v) {
            out.push('<text x="' + (bx + bw / 2 - 1.5) + '" y="' + (y(v) - 5) + '" text-anchor="middle" font-size="10" fill="#5A5044">' + v + '</text>');
          }
        });
      });
    }
    /* التسميات */
    labels.forEach(function (lb, i) {
      var short = String(lb).length > 14 ? String(lb).slice(0, 13) + '…' : lb;
      out.push('<text x="' + xOf(i) + '" y="' + (H - padB + 18) + '" text-anchor="middle" font-size="11" fill="#4A4032">' + short + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  function chart(spec) {
    var box = h('div', { class: 'ui-chart-box' });
    box.innerHTML = chartSvg(spec);   /* آمن: chartSvg يُرمّز كل النصوص والأسماء (escSvg) */
    if (spec.title) {
      return h('div', { class: 'ui-chart-wrap' }, [h('div', { class: 'ui-chart-title', text: spec.title }), box,
        spec.series && spec.series.length > 1 ? legend(spec.series) : null]);
    }
    return h('div', { class: 'ui-chart-wrap' }, [box, spec.series && spec.series.length > 1 ? legend(spec.series) : null]);
  }
  function legend(series) {
    return h('div', { class: 'ui-legend' }, (series || []).map(function (se, i) {
      return h('span', { class: 'ui-legend-item' }, [
        h('i', { style: { background: se.color || PALETTE[i % PALETTE.length] } }),
        h('span', { text: se.name + (se.total != null ? ' · ' + se.total : '') })
      ]);
    }));
  }
  function progressBar(pct, tone) {
    return h('div', { class: 'ui-bar' }, [h('span', { style: { width: Math.max(0, Math.min(100, pct)) + '%' }, class: tone ? 'is-' + tone : '' })]);
  }

  /** يُنزّل نصًا كملف (للإعدادات والتصدير) */
  function downloadText(text, filename, mime) {
    /* آبل: التنزيل داخل التطبيق المُثبَّت غير موثوق ⇒ نستخدم ورقة المشاركة (حفظ في الملفات/درايف) */
    if (isIOS() && shareFile(text, filename || 'file.txt', mime || 'text/plain;charset=utf-8', filename)) {
      toast('اختر «حفظ في الملفات» أو «Drive» لحفظ ' + (filename || ''), 'ok');
      return filename;
    }
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename || 'file.txt';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    toast('نُزّل الملف: ' + a.download, 'ok');
    return a.download;
  }

  /** كشف كلمات المرور المولَّدة (يُسلَّم للمستخدمين) */
  function passwordSheet(rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) { toast('لا حسابات لعرضها', 'warn'); return; }
    var list = rows.map(function (r) {
      var s = global.Store ? (global.Store.school(r.schoolId) || {}) : {};
      return { name: r.name, username: r.username, role: r.role, school: s.name || '—', password: r.password };
    });
    modal({
      title: (opts.title || 'كلمات المرور المولَّدة') + ' (' + list.length + ' حسابًا)',
      wide: true,
      body: [
        h('p', { class: 'muted', text: 'كل حساب له كلمة مرور مختلفة، وسيُطلب من صاحبه تغييرها عند أول دخول. سلّم كل مستخدم بيانته.' }),
        table({
          cols: [
            { key: 'name', label: 'الاسم' }, { key: 'username', label: 'اسم المستخدم' },
            { key: 'role', label: 'الدور' }, { key: 'school', label: 'المدرسة' },
            { key: 'password', label: 'كلمة المرور المؤقتة' }
          ], rows: list
        }),
        h('div', { class: 'callout warn', style: { marginTop: '10px' },
          text: 'احفظ الكشف في مكان آمن — لا يمكن استرجاع هذه الكلمات من تابعني بعد إغلاق النافذة إلا بإعادة التوليد.' })
      ],
      actions: [
        { label: 'تنزيل CSV', class: 'btn-outline', onClick: function () {
          downloadCsv(list.map(function (r) {
            return { 'الاسم': r.name, 'اسم المستخدم': r.username, 'الدور': r.role, 'المدرسة': r.school, 'كلمة المرور': r.password };
          }), 'كلمات-مرور-الحسابات.csv');
        } },
        { label: 'طباعة كشف بالتوقيعات', class: 'btn-soft', onClick: function () {
          printReport({
            type: 'passwords', title: 'كشف كلمات مرور الحسابات',
            subtitle: 'يُسلَّم لجهة التسليم — يُرجى حفظه في مكان آمن',
            meta: [{ label: 'عدد الحسابات', value: String(list.length) }],
            sections: [{
              heading: 'الحسابات وكلمات المرور المؤقتة',
              table: { cols: ['م', 'الاسم', 'اسم المستخدم', 'الدور', 'كلمة المرور'],
                rows: list.map(function (r, i) { return [i + 1, r.name, r.username, r.role, r.password]; }) },
              text: 'ملاحظة: يلزم كل مستخدم تغيير كلمة مروره عند أول دخول.'
            }]
          });
        } }
      ]
    });
  }

  var UI = {
    h: h, clear: clear, toast: toast, modal: modal, confirm: confirm,
    stampSvg: stampSvg, printInvoice: printInvoice, invoiceHtml: invoiceHtml,
    platformDoc: platformDoc, printPlatformDoc: printPlatformDoc, printDoc: printDoc, compressImage: compressImage, imageMeta: imageMeta, fmtMoney: fmtMoney,
    field: field, formModal: formModal, table: table,
    badge: badge, statCard: statCard, sectionHead: sectionHead, panel: panel, empty: empty,
    timeline: timeline, tabs: tabs,
    chart: chart, chartSvg: chartSvg, legend: legend, progressBar: progressBar, palette: PALETTE,
    hijri: hijri, greg: greg, fmtDate: fmtDate, fmtTime: fmtTime, fmtDateTime: fmtDateTime,
    dateLabel: dateLabel, today: today,
    qrSvg: qrSvg, qrBox: qrBox, barcodeSvg: barcodeSvg, barcodeBox: barcodeBox,
    readExcel: readExcel, downloadCsv: downloadCsv, downloadText: downloadText,
    printReport: printReport, reportButton: reportButton, passwordSheet: passwordSheet, withPrintTitle: withPrintTitle,
    env: function () { return { ios: isIOS(), standalone: isStandalone(), canShare: !!(navigator.canShare) }; }, shareFile: shareFile,
    setupTelegram: setupTelegram, renderTelegram: renderTelegram
  };
  global.UI = UI;
})(window);
