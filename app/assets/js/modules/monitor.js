/* =============================================================================
   monitor.js — لوحة مراقب الغياب
   ---------------------------------------------------------------------------
   لوحة متابعة لمراقب الغياب (وأيضًا الوكيل والمدير) بثلاثة تبويبات:
     • غياب اليوم : بطاقات اليوم، جدول S.dailyAttendance لكل فصل، منتقي تاريخ،
                    تصدير CSV، وتقرير «غياب اليوم» بترويسة المدرسة وباركود TBN-MON.
     • الأكثر غيابًا: منتقي فترة (يومي · أسبوعي · شهري · نهاية الفصل) وتصفية بالفصل،
                    أعلى 20 من S.attendanceSummary مع نسبة الغياب وشريط، وطباعة الكشف.
     • الحرمان    : بطاقات + S.deprivationList + جدول الغياب حسب المادة
                    (S.absenceBySubject) + إشعار ولي الأمر + طباعة القائمة.
   الخصائص المتقدّمة (التكليفات والمخاطبات) مؤجّلة إلى قسم «قادم لاحقًا».
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  /* نسبة غياب الفصل التي تُعدّ «مرتفعة» في بطاقات اليوم */
  var HIGH_ABSENCE = 10;

  var KINDS = [
    { key: 'day', label: 'يومي' },
    { key: 'week', label: 'أسبوعي' },
    { key: 'month', label: 'شهري' },
    { key: 'term', label: 'نهاية الفصل' }
  ];
  var TABS = [
    { key: 'today', label: 'غياب اليوم' },
    { key: 'top', label: 'الأكثر غيابًا' },
    { key: 'deprivation', label: 'الحرمان' }
  ];

  function pct(part, total) { return total ? Math.round((part / total) * 100) : 0; }
  function num(v) { return h('span', { class: 'nums', text: String(v) }); }

  App.register({
    id: 'monitor',
    label: 'مراقبة الغياب',
    icon: '&#128065;&#65039;',
    roles: ['absence_monitor', 'deputy', 'principal'],
    render: function (view) {
      var state = { tab: 'today', date: UI.today(), kind: 'month', ref: UI.today(), classId: '' };

      function range() { return S.rangeOf(state.kind, state.ref); }
      function rangeLabel() {
        var r = range();
        return r.label + ' — ' + UI.fmtDate(r.from) + ' إلى ' + UI.fmtDate(r.to);
      }
      function paint() { clear(view); build(); }

      /* ------------------------------------------------ مساعدات غياب اليوم */
      function dailyRows(date) {
        return S.dailyAttendance(date).map(function (r) {
          return Object.assign({}, r, {
            attendancePct: pct(r.present + r.late, r.total),
            absencePct: pct(r.absent, r.total)
          });
        }).sort(function (a, b) { return (b.absent - a.absent) || (b.sessions - a.sessions); });
      }
      function dailyTotals(rows) {
        return (rows || []).reduce(function (a, r) {
          a.sessions += r.sessions; a.closed += r.closed; a.present += r.present;
          a.absent += r.absent; a.late += r.late; a.total += r.total;
          return a;
        }, { sessions: 0, closed: 0, present: 0, absent: 0, late: 0, total: 0 });
      }
      function highAbsenceClasses(rows) {
        return (rows || []).filter(function (r) { return r.total > 0 && r.absencePct >= HIGH_ABSENCE; });
      }

      /* ------------------------------------------------ زر طباعة مسجّل + toast */
      function printButton(build, label, cls) {
        return h('button', {
          class: 'btn ' + (cls || 'btn-soft'), type: 'button',
          onClick: function () {
            var spec = build();
            var rep = S.registerReport(spec.type || 'monitor', spec.refId || '', { title: spec.title });
            spec.code = rep.code;
            UI.printReport(spec);
            S.markPrinted(rep.id);
            UI.toast('طُبع «' + spec.title + '» — رقم التقرير ' + rep.code, 'ok');
          }
        }, [h('span', { text: label })]);
      }

      /* ============================================== التبويب ١: غياب اليوم */
      function buildDailyReport() {
        var date = state.date;
        var rows = dailyRows(date);
        var withData = rows.filter(function (x) { return x.sessions > 0; });
        var t = dailyTotals(rows);
        var high = highAbsenceClasses(rows);
        return {
          type: 'monitor', refId: 'mon-daily-' + date,
          title: 'تقرير غياب اليوم', subtitle: 'اليوم: ' + UI.fmtDate(date),
          meta: [
            { label: 'التاريخ', value: UI.fmtDate(date) },
            { label: 'عدد الفصول', value: withData.length },
            { label: 'إجمالي الحصص', value: t.sessions },
            { label: 'الحصص المغلقة', value: t.closed + ' / ' + t.sessions },
            { label: 'نسبة الحضور', value: pct(t.present + t.late, t.total) + '٪' },
            { label: 'الغائبون', value: t.absent },
            { label: 'المتأخرون', value: t.late },
            { label: 'فصول بها غياب مرتفع', value: high.length }
          ],
          sections: [
            {
              heading: 'غياب اليوم بحسب الفصل',
              table: {
                cols: ['الفصل', 'الحصص', 'المغلقة', 'حاضر', 'غائب', 'متأخر', 'الإجمالي', 'نسبة الحضور'],
                rows: rows.map(function (x) {
                  return [x.className, x.sessions, x.closed, x.present, x.absent, x.late, x.total, x.attendancePct + '٪'];
                })
              }
            },
            {
              heading: 'رسم بياني: الغياب والتأخر لكل فصل',
              chart: {
                type: 'bars',
                labels: withData.map(function (x) { return x.className; }),
                series: [
                  { name: 'غائب', values: withData.map(function (x) { return x.absent; }), color: '#C2593F' },
                  { name: 'متأخر', values: withData.map(function (x) { return x.late; }), color: '#CE9433' }
                ]
              }
            },
            {
              heading: 'ملاحظة',
              text: 'الحصص المغلقة: ' + t.closed + ' من ' + t.sessions + ' · الغائبون: ' + t.absent +
                ' من ' + t.total + ' حالة · نسبة الحضور: ' + pct(t.present + t.late, t.total) + '٪'
            }
          ],
          signatures: ['مراقب الغياب', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function exportDaily() {
        var rows = dailyRows(state.date).map(function (r) {
          return {
            'الفصل': r.className, 'الحصص': r.sessions, 'المغلقة': r.closed,
            'حاضر': r.present, 'غائب': r.absent, 'متأخر': r.late,
            'الإجمالي': r.total, 'نسبة الحضور': r.attendancePct + '%'
          };
        });
        if (!rows.length) { UI.toast('لا يوجد كشف للتصدير', 'warn'); return; }
        UI.downloadCsv(rows, 'غياب-اليوم-' + state.date + '.csv');
        UI.toast('صُدِّر كشف غياب اليوم بصيغة CSV', 'ok');
      }

      function todayTab() {
        var out = h('div');
        var rows = dailyRows(state.date);
        var t = dailyTotals(rows);
        var high = highAbsenceClasses(rows);

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('غياب اليوم', String(t.absent), pct(t.absent, t.total) + '٪ من ' + t.total + ' حالة', t.absent ? 'brand' : null),
          UI.statCard('تأخر اليوم', String(t.late), pct(t.late, t.total) + '٪ من الحالات'),
          UI.statCard('حصص مُحضّرة اليوم', t.closed + ' / ' + t.sessions, 'مغلقة / الإجمالي', t.sessions ? 'gold' : null),
          UI.statCard('فصول بها غياب مرتفع', String(high.length),
            high.length ? high.map(function (x) { return x.className; }).join(' · ') : 'لا فصل بلغ ' + HIGH_ABSENCE + '٪')
        ]));

        var dateField = UI.field({ name: 'date', label: 'تاريخ اليوم', type: 'date', value: state.date });
        dateField.input.addEventListener('change', function () {
          state.date = dateField.input.value || UI.today();
          paint();
        });

        out.appendChild(UI.panel('غياب اليوم بحسب الفصل', 'اليوم: ' + UI.fmtDate(state.date) + ' — بيانات مباشرة من S.dailyAttendance.', [
          h('div', { class: 'cluster' }, [
            h('button', { class: 'btn btn-soft btn-sm', type: 'button', text: 'تحديث', onClick: function () {
              paint();
              UI.toast('حُدّثت بيانات غياب اليوم', 'ok');
            } }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تصدير CSV', onClick: exportDaily }),
            printButton(buildDailyReport, 'طباعة تقرير غياب اليوم', 'btn-primary btn-sm')
          ])
        ], [
          h('div', { class: 'form-grid' }, [dateField.wrap]),
          h('div', { class: 'mt-4' }, [UI.table({
            cols: [
              { label: 'الفصل', key: 'className' },
              { label: 'حصص', render: function (r) { return num(r.sessions); } },
              { label: 'مغلقة', render: function (r) { return num(r.closed); } },
              { label: 'حاضر', render: function (r) { return num(r.present); } },
              { label: 'غائب', render: function (r) { return num(r.absent); } },
              { label: 'متأخر', render: function (r) { return num(r.late); } },
              { label: 'الإجمالي', render: function (r) { return num(r.total); } },
              {
                label: 'نسبة الحضور', render: function (r) {
                  return h('div', { class: 'cluster' }, [
                    h('span', { class: 'nums', text: r.attendancePct + '٪' }),
                    UI.progressBar(r.attendancePct, r.attendancePct < 90 ? 'danger' : 'mint')
                  ]);
                }
              }
            ],
            rows: rows, empty: 'لا توجد حصص مُحضّرة في هذا التاريخ.'
          })])
        ]));

        return out;
      }

      /* ============================================ التبويب ٢: الأكثر غيابًا */
      function topRows() {
        var f = state.classId ? { classId: state.classId } : {};
        return S.attendanceSummary(range(), f);
      }

      function buildTopReport() {
        var sum = topRows();
        var rows = sum.rows;
        var r = range();
        var byLate = rows.slice().sort(function (a, b) { return (b.late - a.late) || (b.absent - a.absent); });
        var cols = ['م', 'الطالب', 'الفصل', 'غياب', 'تأخر', 'حضور', 'الإجمالي', 'نسبة الغياب'];
        function mapRows(list) {
          return list.slice(0, 20).map(function (x, i) {
            return [i + 1, x.name, x.className, x.absent, x.late, x.present, x.total, x.absencePct + '٪'];
          });
        }
        return {
          type: 'monitor', refId: 'mon-top-' + r.from + '-' + r.to,
          title: 'كشف الأكثر غيابًا وتأخرًا',
          subtitle: rangeLabel() + (state.classId ? ' — ' + ((S.klass(state.classId) || {}).name || '') : ''),
          meta: [
            { label: 'من', value: UI.fmtDate(r.from) },
            { label: 'إلى', value: UI.fmtDate(r.to) },
            { label: 'عدد الطلاب', value: rows.length },
            { label: 'إجمالي حالات الغياب', value: rows.reduce(function (a, x) { return a + x.absent; }, 0) },
            { label: 'إجمالي حالات التأخر', value: rows.reduce(function (a, x) { return a + x.late; }, 0) }
          ],
          sections: [
            { heading: 'أعلى 20 طالبًا في الغياب', table: { cols: cols, rows: mapRows(rows) } },
            { heading: 'أعلى 20 طالبًا في التأخر', table: { cols: cols, rows: mapRows(byLate) } }
          ],
          signatures: ['مراقب الغياب', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function topTab() {
        var out = h('div');
        var sum = topRows();
        var rows = sum.rows.slice(0, 20);
        var all = sum.rows;
        var maxAbsent = all.slice().sort(function (a, b) { return b.absent - a.absent; })[0];

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الطلاب في النطاق', String(sum.students), sum.sessions + ' جلسة تحضير'),
          UI.statCard('إجمالي حالات الغياب', String(all.reduce(function (a, x) { return a + x.absent; }, 0)), 'خلال ' + rangeLabel()),
          UI.statCard('إجمالي حالات التأخر', String(all.reduce(function (a, x) { return a + x.late; }, 0)), 'خلال الفترة'),
          UI.statCard('أعلى غياب', maxAbsent ? String(maxAbsent.absent) : '0',
            maxAbsent ? maxAbsent.name + ' — ' + maxAbsent.absencePct + '٪' : 'لا يوجد', maxAbsent ? 'brand' : null)
        ]));

        var classField = UI.field({
          name: 'class', label: 'تصفية بالفصل', type: 'select', value: state.classId, placeholder: 'كل الفصول',
          options: S.list('classes').map(function (c) { return { value: c.id, label: c.name }; })
        });
        classField.input.addEventListener('change', function () {
          state.classId = classField.input.value;
          paint();
        });

        out.appendChild(UI.panel('الأكثر غيابًا', 'أعلى 20 طالبًا — ' + rangeLabel(), [
          h('div', { class: 'cluster' }, [
            printButton(buildTopReport, 'طباعة كشف الأكثر غيابًا/تأخرًا', 'btn-primary btn-sm')
          ])
        ], [
          h('div', { class: 'form-grid' }, [classField.wrap]),
          h('div', { class: 'mt-4' }, [UI.table({
            cols: [
              { label: 'الطالب', key: 'name' },
              { label: 'الفصل', key: 'className' },
              { label: 'غياب', render: function (x) { return num(x.absent); } },
              { label: 'تأخر', render: function (x) { return num(x.late); } },
              { label: 'حضور', render: function (x) { return num(x.present); } },
              { label: 'الإجمالي', render: function (x) { return num(x.total); } },
              {
                label: 'نسبة الغياب', render: function (x) {
                  return h('div', { class: 'cluster' }, [
                    h('span', { class: 'nums', text: x.absencePct + '٪' }),
                    UI.progressBar(x.absencePct, x.absencePct >= 25 ? 'danger' : 'amber')
                  ]);
                }
              }
            ],
            rows: rows, empty: 'لا يوجد غياب أو تأخر في هذه الفترة.'
          })])
        ]));

        return out;
      }

      /* ================================================ التبويب ٣: الحرمان */
      function deprivationReport() {
        var r = range();
        var dep = S.deprivationList(r);
        var rows = dep.rows;
        return {
          type: 'monitor', refId: 'mon-dep-' + r.from + '-' + r.to,
          title: 'قائمة الحرمان بالغياب',
          subtitle: 'الحد المعتمد ' + dep.threshold + '٪ — ' + rangeLabel(),
          meta: [
            { label: 'الحد المعتمد', value: dep.threshold + '٪' },
            { label: 'عدد الطلاب', value: rows.length },
            { label: 'من', value: UI.fmtDate(r.from) },
            { label: 'إلى', value: UI.fmtDate(r.to) },
            { label: 'أعلى نسبة', value: rows[0] ? rows[0].absencePct + '٪ — ' + rows[0].name : '—' }
          ],
          sections: [
            {
              heading: 'الطلاب الذين بلغوا نسبة الحرمان',
              table: {
                cols: ['م', 'الطالب', 'الفصل', 'المادة', 'الغياب', 'الإجمالي', 'نسبة الغياب', 'الحد'],
                rows: rows.map(function (x, i) {
                  return [i + 1, x.name, x.className, x.subject || 'إجمالي المواد', x.absent, x.total, x.absencePct + '٪', (x.threshold != null ? x.threshold : dep.threshold) + '٪'];
                })
              }
            }
          ],
          signatures: ['مراقب الغياب', 'وكيل شؤون الطلاب', 'مدير المدرسة']
        };
      }

      function notifyGuardian(row, threshold) {
        var subject = row.subject || 'إجمالي المواد';
        var defaultMsg = 'حضرة ولي أمر الطالب/ة ' + row.name + ' (' + row.className + '):\n' +
          'نفيدكم بأن نسبة الغياب في ' + subject + ' بلغت ' + row.absencePct + '٪ (' + row.absent + ' من ' + row.total + ' حصة) خلال ' + rangeLabel() + '، ' +
          'وهي عند حد الحرمان المعتمد (' + threshold + '٪). نأمل التعاون بمتابعة الحضور ومراجعة مراقب الغياب.';
        UI.formModal({
          title: 'إشعار ولي الأمر — ' + row.name,
          intro: 'اختر قناة الإبلاغ وحرّر نص الرسالة، ثم أرسل. يُسجَّل الإشعار في سجل المنصة وسجل تلقرام.',
          fields: [
            {
              name: 'channel', label: 'قناة الإبلاغ', type: 'select', required: true, value: 'telegram',
              options: [{ value: 'platform', label: 'منصة' }, { value: 'telegram', label: 'تلقرام' }, { value: 'sms', label: 'جوال' }]
            },
            { name: 'message', label: 'نص الرسالة', type: 'textarea', rows: 6, required: true, value: defaultMsg }
          ],
          submitLabel: 'إرسال الإشعار',
          onSubmit: function (data) {
            var chLabel = { platform: 'منصة', telegram: 'تلقرام', sms: 'جوال' }[data.channel] || 'منصة';
            S.tg({
              to: 'deputy',
              text: 'إشعار ولي أمر (' + chLabel + ')\n' + row.name + ' — ' + row.className +
                '\nالمادة: ' + subject + ' · نسبة الغياب: ' + row.absencePct + '٪ (' + row.absent + '/' + row.total + ')\n' + data.message
            });
            S.notify({
              kind: 'attendance', ref: row.studentId,
              title: 'إشعار ولي أمر — ' + row.name,
              body: data.message, to: ['deputy', 'principal', 'absence_monitor']
            });
            UI.toast('أُرسل إشعار ولي الأمر عبر ' + chLabel, 'ok');
            paint();
          }
        });
      }

      function subjectStats() {
        var map = {};
        S.absenceBySubject(range()).forEach(function (r) {
          var row = map[r.subject] || (map[r.subject] = { subject: r.subject, absent: 0, total: 0, threshold: r.threshold, exceeded: 0 });
          row.absent += r.absent; row.total += r.total;
          if (r.exceeded) row.exceeded++;
        });
        return Object.keys(map).map(function (k) {
          var row = map[k];
          row.absencePct = pct(row.absent, row.total);
          return row;
        }).sort(function (a, b) { return b.absencePct - a.absencePct; });
      }

      function deprivationTab() {
        var out = h('div');
        var r = range();
        var dep = S.deprivationList(r);
        var rows = dep.rows;
        var maxRow = rows.slice().sort(function (a, b) { return b.absencePct - a.absencePct; })[0];
        var subs = subjectStats();
        var exceededSubjects = subs.filter(function (x) { return x.exceeded > 0; }).length;

        out.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('الحد المعتمد', dep.threshold + '٪', dep.mode === 'per-subject' ? 'محسوب لكل مادة' : 'نسبة إجمالية عامة', 'gold'),
          UI.statCard('بلغوا نسبة الحرمان', String(rows.length), 'طالب خلال ' + r.label, rows.length ? 'brand' : null),
          UI.statCard('أعلى نسبة غياب', maxRow ? maxRow.absencePct + '٪' : '0٪', maxRow ? maxRow.name + ' — ' + maxRow.className : 'لا يوجد'),
          UI.statCard('مواد بها متجاوزون', String(exceededSubjects) + ' / ' + subs.length, 'من ' + subs.length + ' مادة')
        ]));

        out.appendChild(UI.panel('قائمة الحرمان', 'الطلاب الذين بلغوا الحد المعتمد — ' + rangeLabel(), [
          h('div', { class: 'cluster' }, [
            printButton(deprivationReport, 'طباعة قائمة الحرمان', 'btn-primary btn-sm')
          ])
        ], [
          UI.table({
            cols: [
              { label: 'الطالب', key: 'name' },
              { label: 'الفصل', key: 'className' },
              { label: 'المادة', render: function (x) { return x.subject || 'إجمالي المواد'; } },
              { label: 'الغياب / الإجمالي', render: function (x) { return h('span', { class: 'nums', dir: 'ltr', text: x.absent + ' / ' + x.total }); } },
              {
                label: 'النسبة', render: function (x) {
                  return h('div', { class: 'cluster' }, [
                    h('span', { class: 'nums', text: x.absencePct + '٪' }),
                    UI.progressBar(x.absencePct, 'danger')
                  ]);
                }
              },
              { label: 'الحد', render: function (x) { return h('span', { class: 'nums', text: (x.threshold != null ? x.threshold : dep.threshold) + '٪' }); } },
              {
                label: 'إجراء', render: function (x) {
                  return h('button', {
                    class: 'mini-btn is-primary', type: 'button', text: 'إخطار ولي أمر',
                    onClick: function () { notifyGuardian(x, x.threshold != null ? x.threshold : dep.threshold); }
                  });
                }
              }
            ],
            rows: rows, empty: 'لا يوجد طلاب بلغوا نسبة الحرمان في هذه الفترة.'
          })
        ]));

        out.appendChild(UI.panel('الغياب حسب المادة', 'مجمّع من S.absenceBySubject خلال ' + rangeLabel(), null, [
          UI.table({
            cols: [
              { label: 'المادة', key: 'subject' },
              { label: 'الغياب', render: function (x) { return num(x.absent); } },
              { label: 'الإجمالي', render: function (x) { return num(x.total); } },
              {
                label: 'نسبة الغياب', render: function (x) {
                  return h('div', { class: 'cluster' }, [
                    h('span', { class: 'nums', text: x.absencePct + '٪' }),
                    UI.progressBar(x.absencePct, 'amber')
                  ]);
                }
              },
              { label: 'الحد', render: function (x) { return num((x.threshold != null ? x.threshold : dep.threshold) + '٪'); } },
              { label: 'طلاب متجاوزون', render: function (x) { return num(x.exceeded); } }
            ],
            rows: subs, empty: 'لا توجد بيانات مواد في هذه الفترة.'
          })
        ]));

        return out;
      }

      /* --------------------------------------------------- منتقي الفترة */
      function periodPanel() {
        var kindBar = h('div', { class: 'cluster' }, KINDS.map(function (k) {
          return h('button', {
            class: 'mini-btn' + (state.kind === k.key ? ' is-primary' : ''), type: 'button', text: k.label,
            onClick: function () { state.kind = k.key; paint(); }
          });
        }));
        var refField = UI.field({ name: 'ref', label: 'تاريخ المرجع', type: 'date', value: state.ref });
        refField.input.addEventListener('change', function () { state.ref = refField.input.value || UI.today(); paint(); });
        return UI.panel('منتقي الفترة', rangeLabel(), null, [
          h('div', { class: 'between' }, [
            kindBar,
            h('span', { class: 'muted nums', text: range().from + ' → ' + range().to })
          ]),
          h('div', { class: 'form-grid mt-4' }, [refField.wrap])
        ]);
      }

      /* --------------------------------------------------- قادم لاحقًا */
      function comingSoon() {
        return UI.panel('قادم لاحقًا', 'خصائص متقدّمة تُضاف حسب طلب الإدارة.', null, [
          UI.empty('تكليف مراقب لكنترول أو بوابة، إشعارات فورية عند تجاوز حد الغياب، وتكامل مباشر مع أولياء الأمور عبر قنوات المدرسة.')
        ]);
      }

      /* ============================================================== البناء */
      function build() {
        view.appendChild(h('div', { class: 'muted-block' }, [
          h('strong', { text: 'مراقب الغياب: ' }),
          h('span', { text: 'لوحة متابعة للغياب والتأخر والحرمان. الخصائص المتقدّمة (التكليفات والمخاطبات) تُضاف لاحقًا حسب طلب الإدارة.' })
        ]));

        var bar = UI.tabs(TABS, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) {
          b.classList.toggle('is-active', TABS[i].key === state.tab);
        });
        view.appendChild(bar);

        if (state.tab !== 'today') view.appendChild(periodPanel());

        var body = h('div');
        if (state.tab === 'top') body.appendChild(topTab());
        else if (state.tab === 'deprivation') body.appendChild(deprivationTab());
        else body.appendChild(todayTab());
        view.appendChild(body);

        view.appendChild(comingSoon());
      }

      build();
    }
  });
})();
