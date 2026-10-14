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
          onClick: function () { a.onClick && a.onClick(close, box); }
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
      body: [opts.intro ? h('p', { class: 'muted', style: { marginBottom: '14px' }, text: opts.intro }) : null, grid, error],
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
  var GREG = new Intl.DateTimeFormat('ar-SA', { day: '2-digit', month: 'long', year: 'numeric' });
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
  function fmtDateTime(d) { if (!d) return ''; var x = new Date(d); if (isNaN(x)) return String(d); return fmtDate(x) + ' · ' + fmtTime(x); }
  function dateLabel(d) { return greg(d) + ' — ' + hijri(d) + ' هـ'; }
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
          /* يسار الصفحة: شعار المدرسة (إن وُجد) وتحته تاريخ الإصدار والباركود */
          '<div class="lh-side">' +
            (schoolLogo ? '<img class="lh-logo-s" src="' + schoolLogo + '" alt="شعار المدرسة">' : '') +
            '<div class="lh-issue">' +
              '<span>تاريخ الإصدار: <strong>' + dateLabel(d) + '</strong></span>' +
              (report.code ? '<span class="lh-code">رقم التقرير: <code>' + report.code + '</code></span>' : '') +
              (report.code ? '<div class="lh-qr">' + qrSvg(report.code, 2, 0) + '</div>' : '') +
            '</div>' +
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
    '.rp-note{font-size:9px;color:#5A5044;margin-top:10px;line-height:1.6;border-top:1px dashed #D9D1C2;padding-top:6px}' +
    '.rp-page{font-size:9px;color:#6B6152;text-align:center;margin-top:6px}' +
    '@media print{.no-print{display:none}}';

  /** يطبع تقريرًا كاملًا في إطار مخفي (لا يفتح نوافذ منبثقة). */
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
      sections +
      '<div class="rp-foot">' +
        '<div class="rp-foot-line">' +
          '<span>معد التقرير: <strong>' + (report.by || (global.Store && global.Store.session.name) || '') + '</strong></span>' +
          '<span>التاريخ: <strong>' + dateLabel(new Date()) + '</strong></span>' +
          '<span>الوقت: <strong>' + fmtTime(new Date()) + '</strong></span>' +
        '</div>' +
        '<div class="signs">' + signs + '</div>' +
        (lh.footerNote || report.qrNote
          ? '<div class="rp-note">' + (report.qrNote || lh.footerNote) + '</div>' : '') +
      '</div>' +
      '<div class="rp-page">منصة تابعني للخدمات التعليمية — ' + (report.code || '') + ' — طُبع: ' + dateLabel(new Date()) + ' ' + fmtTime(new Date()) + '</div>' +
      '</body></html>';

    var frame = document.getElementById('print-frame');
    if (!frame) {
      frame = h('iframe', { id: 'print-frame', class: 'print-frame', title: 'طباعة' });
      document.body.appendChild(frame);
    }
    var doc = frame.contentDocument || frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    var go = function () {
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
          h('span', { class: 'tg-at muted', text: fmtDateTime(m.at) })
        ]),
        h('pre', { class: 'tg-text', text: m.text }),
        h('footer', { class: 'tg-foot' }, [
          badge(m.status === 'queued' ? 'بانتظار البوت' : 'مُرسلة', m.status === 'queued' ? 'amber' : 'mint'),
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
    var labels = spec.labels || [];
    var series = spec.series || [{ name: spec.name || '', values: spec.values || [], color: spec.color || PALETTE[0] }];
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
    box.innerHTML = chartSvg(spec);
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
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename || 'file.txt';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    toast('نُزّل الملف: ' + a.download, 'ok');
  }

  var UI = {
    h: h, clear: clear, toast: toast, modal: modal, confirm: confirm,
    field: field, formModal: formModal, table: table,
    badge: badge, statCard: statCard, sectionHead: sectionHead, panel: panel, empty: empty,
    timeline: timeline, tabs: tabs,
    chart: chart, chartSvg: chartSvg, legend: legend, progressBar: progressBar, palette: PALETTE,
    hijri: hijri, greg: greg, fmtDate: fmtDate, fmtTime: fmtTime, fmtDateTime: fmtDateTime,
    dateLabel: dateLabel, today: today,
    qrSvg: qrSvg, qrBox: qrBox,
    readExcel: readExcel, downloadCsv: downloadCsv, downloadText: downloadText,
    printReport: printReport, reportButton: reportButton,
    setupTelegram: setupTelegram, renderTelegram: renderTelegram
  };
  global.UI = UI;
})(window);
