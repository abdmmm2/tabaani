/* =============================================================================
   staff.js — الموظفون والحسابات (مدير المدرسة)
   ---------------------------------------------------------------------------
   مسارات الوحدة: (أ) إدارة حسابات المدرسة (كل الأدوار ما عدا الطالب) مع اختيار
   فصول المعلم ومواده بقوائم متسلسلة (المرحلة ← الصف ← الشعبة) والمواد بحسب
   مراحل المدرسة فقط — لا تظهر أبدًا مواد أو فصول من مراحل خارج مراحل المدرسة،
   (ب) استيراد المعلمين من كشف نور (Excel/CSV) مع ربط الأعمدة،
   (ج) إسناد المواد بحسب المرحلة، (د) لوحة «فصول ومواد المعلمين» للعرض والمتابعة.
   المدير يختار فقط، والتثبيت النهائي بيد وكيل شؤون الطلاب (S.lockTeacherAssignments).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Store, UI = window.UI, App = window.App, h = UI.h, clear = UI.clear;

  function unique(arr) {
    return (arr || []).filter(function (v, i) { return arr.indexOf(v) === i; });
  }
  function roleTone(id) {
    return { principal: 'brand', deputy: 'mint', guidance: 'amber', volunteer: 'mint', activity: 'amber' }[id] || 'plain';
  }
  /* إصلاح نصوص CSV التي قُرئت بترميز خاطئ (UTF-8 كـ Latin-1): Ø§Ù„Ø§Ø³Ù… ← الاسم */
  function fixMojibake(s) {
    if (typeof s !== 'string' || !/[\u0080-\u00FF]/.test(s)) return s;
    try {
      var fixed = decodeURIComponent(escape(s));
      if (fixed && fixed !== s) return fixed;
    } catch (e) {}
    return s;
  }
  function repairRows(rows) {
    return (rows || []).map(function (r) {
      var out = {};
      Object.keys(r).forEach(function (k) {
        out[fixMojibake(String(k))] = typeof r[k] === 'string' ? fixMojibake(r[k]) : r[k];
      });
      return out;
    });
  }
  function progressBar(n, total) {
    var pct = total ? Math.round((n / total) * 100) : 0;
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' } }, [
      h('div', { style: { flex: '1', height: '8px', background: 'var(--bg-soft)', borderRadius: '999px', overflow: 'hidden', minWidth: '70px' } }, [
        h('div', { style: { width: pct + '%', height: '100%', background: 'var(--grad-brand)' } })
      ]),
      h('span', { class: 'nums', text: n + ' / ' + total })
    ]);
  }

  App.register({
    id: 'staff', label: 'الموظفون والحسابات', icon: '&#128101;', roles: ['principal'],
    render: function (view) {
      var schoolId = S.session.schoolId;
      var school = S.school(schoolId) || {};
      var schoolStages = (school.stages || []).slice();
      var state = {
        tab: 'accounts',
        imp: { rows: [], map: {}, error: '', imported: [], fileName: '' },
        sub: { teacherId: '', stage: '', draft: null, forTeacher: null }
      };

      function teachers() { return S.usersByRole('teacher', schoolId); }
      function accounts() {
        return S.list('users', { schoolId: schoolId }).filter(function (u) { return u.role !== 'student'; });
      }
      function roleName(id) { var r = S.roles.find(function (x) { return x.id === id; }); return r ? r.name : id; }
      function assignableRoles() { return S.roles.filter(function (r) { return r.id !== 'super' && r.id !== 'student'; }); }

      /* -------------------------------------------------- أدوات فصول/مواد المعلم */
      function classesOfSchool() { return S.list('classes', { schoolId: schoolId }); }
      function allowedSubjects() { return unique(S.subjectsFor(schoolStages)); }
      /** فصول المعلم المسموح عرضها: من فصول مدرسته ومراحل مدرسته فقط */
      function planClasses(u) {
        return ((u && u.classIds) || []).map(function (id) { return S.klass(id); })
          .filter(function (k) { return k && k.schoolId === schoolId && schoolStages.indexOf(k.stage) > -1; });
      }
      /** مواد المعلم المسموح عرضها: من مواد مراحل مدرسته فقط */
      function planSubjects(u) {
        var allowed = allowedSubjects();
        return (((u && u.subjects) || [])).filter(function (s) { return allowed.indexOf(s) > -1; });
      }
      function lockBadge(u) {
        return u.locked ? UI.badge('مثبّت من الوكيل', 'mint') : UI.badge('بانتظار تثبيت الوكيل', 'amber');
      }
      function stageOptions(selected) {
        return schoolStages.map(function (id) { return { value: id, label: S.stageName(id) }; });
      }

      /* ------------------------------------------------------------ اللوحة */
      function draw() {
        clear(view);
        var tch = teachers();
        var lockedNow = tch.filter(function (t) { return t.locked; }).length;
        var waitingNow = tch.length - lockedNow;
        var noClassesNow = tch.filter(function (t) { return !(t.classIds && t.classIds.length); }).length;
        var noSubjectsNow = tch.filter(function (t) { return !(t.subjects && t.subjects.length); }).length;
        var admins = S.usersByRole('deputy', schoolId).length + S.usersByRole('guidance', schoolId).length;

        view.appendChild(h('div', { class: 'stat-row' }, [
          UI.statCard('عدد الحسابات', String(accounts().length)),
          UI.statCard('المعلمون', String(tch.length)),
          UI.statCard('الوكلاء والتوجيه', String(admins)),
          UI.statCard('معلمون مثبّتون', String(lockedNow), null, lockedNow ? 'mint' : null),
          UI.statCard('بانتظار التثبيت', String(waitingNow), null, waitingNow ? 'gold' : null),
          UI.statCard('معلمون بلا فصول', String(noClassesNow), null, noClassesNow ? 'gold' : null),
          UI.statCard('معلمون بلا مواد', String(noSubjectsNow), null, noSubjectsNow ? 'gold' : null)
        ]));

        var items = [
          { key: 'accounts', label: 'الحسابات' },
          { key: 'plan', label: 'فصول ومواد المعلمين' },
          { key: 'import', label: 'استيراد المعلمين من نور (Excel)' },
          { key: 'subjects', label: 'إسناد المواد بحسب المرحلة' }
        ];
        var body = h('div');
        function paint() {
          clear(body);
          if (state.tab === 'import') body.appendChild(importPanel());
          else if (state.tab === 'subjects') body.appendChild(subjectsPanel());
          else if (state.tab === 'plan') body.appendChild(teacherPlanPanel());
          else body.appendChild(accountsPanel());
        }
        var bar = UI.tabs(items, function (key) { state.tab = key; paint(); });
        Array.prototype.forEach.call(bar.children, function (b, i) { b.classList.toggle('is-active', items[i].key === state.tab); });

        view.appendChild(UI.panel('الحسابات والمواد', 'المعلمون والوكلاء والمسؤولون في مدرستك.', null, [bar, body]));
        paint();
      }

      /* ====================================================== (أ) الحسابات */
      function addBtn() {
        return h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'إضافة حساب', onClick: function () { accountModal(null); } });
      }

      /* قوائم متسلسلة: المرحلة ← الصف ← الشعبة (فصول المدرسة فقط) */
      function classPicker(draft) {
        var list = classesOfSchool();
        var stage = schoolStages[0] || '';
        var grade = '', section = '';
        var addBtn = null;

        var stageSel = UI.field({
          name: 'pickClassStage', label: 'المرحلة', type: 'select',
          options: stageOptions(), value: stage
        });
        var gradeSel = UI.field({ name: 'pickClassGrade', label: 'الصف', type: 'select', placeholder: 'اختر الصف' });
        var sectionSel = UI.field({ name: 'pickClassSection', label: 'الشعبة', type: 'select', placeholder: 'اختر الشعبة' });
        var chips = h('div', { class: 'cluster', style: { gap: '6px' } });

        function gradesOf(st) { return (S.grades[st] || []).slice(); }
        function classesOf(st, gr) {
          return list.filter(function (k) { return k.stage === st && k.grade === gr; });
        }
        function fit(sel, placeholder, options, value) {
          clear(sel);
          sel.appendChild(h('option', { value: '', text: placeholder }));
          options.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
          sel.value = value || '';
        }
        function paintChips() {
          clear(chips);
          if (!draft.classIds.length) {
            chips.appendChild(h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'لم تُضف فصول بعد.' }));
            return;
          }
          draft.classIds.forEach(function (id) {
            var k = S.klass(id); if (!k) return;
            chips.appendChild(h('span', { class: 'chip chip-brand' }, [
              h('span', { text: k.name + ' · ' + S.stageName(k.stage) }),
              h('button', {
                class: 'btn-link', type: 'button', title: 'إزالة ' + k.name, 'aria-label': 'إزالة ' + k.name,
                style: { padding: '0 2px', lineHeight: '1' }, html: '&#10005;',
                onClick: function () {
                  draft.classIds = draft.classIds.filter(function (x) { return x !== id; });
                  paintChips(); UI.toast('أُزيل الفصل ' + k.name, 'warn');
                }
              })
            ]));
          });
        }
        function rebuildSections() {
          var cls = grade ? classesOf(stage, grade) : [];
          if (!cls.some(function (k) { return k.id === section; })) section = '';
          fit(sectionSel.input, cls.length ? 'اختر الشعبة' : 'لا فصول مطابقة لهذه المرحلة/الصف', cls.map(function (k) {
            return { value: k.id, label: k.section + (k.room ? ' — ' + k.room : '') };
          }), section);
          if (addBtn) addBtn.disabled = !sectionSel.input.value;
        }
        function rebuildGrades() {
          var gs = gradesOf(stage);
          if (gs.indexOf(grade) === -1) grade = '';
          fit(gradeSel.input, gs.length ? 'اختر الصف' : 'لا صفوف لهذه المرحلة', gs.map(function (g) { return { value: g, label: g }; }), grade);
          rebuildSections();
        }

        stageSel.input.addEventListener('change', function () {
          stage = stageSel.input.value; grade = ''; section = '';
          /* لا يبقى مُختارًا إلا ما ينتمي لمرحلة المدرسة الجديدة */
          draft.classIds = draft.classIds.filter(function (id) { var k = S.klass(id); return k && k.stage === stage; });
          rebuildGrades(); paintChips();
        });
        gradeSel.input.addEventListener('change', function () { grade = gradeSel.input.value; section = ''; rebuildSections(); });
        sectionSel.input.addEventListener('change', function () { section = sectionSel.input.value; if (addBtn) addBtn.disabled = !section; });

        addBtn = h('button', {
          class: 'mini-btn is-primary', type: 'button', text: 'إضافة الفصل',
          onClick: function () {
            var id = sectionSel.input.value;
            if (!id) { UI.toast('اختر المرحلة والصف والشعبة أولًا', 'warn'); return; }
            if (draft.classIds.indexOf(id) > -1) { UI.toast('الفصل مُضاف مسبقًا', 'warn'); return; }
            draft.classIds.push(id); paintChips(); UI.toast('أُضيف الفصل إلى القائمة', 'ok');
          }
        });

        rebuildGrades(); paintChips();

        return h('div', { class: 'stack-sm' }, [
          h('h4', { text: 'الفصول المسندة له' }),
          h('div', { class: 'form-grid' }, [stageSel.wrap, gradeSel.wrap, sectionSel.wrap]),
          h('div', { class: 'cluster' }, [addBtn]),
          chips
        ]);
      }

      /* قائمة متسلسلة: المرحلة ← المادة (مواد مراحل المدرسة فقط) */
      function subjectPicker(draft) {
        var stage = schoolStages[0] || '';
        var addBtn = null;
        var stageSel = UI.field({
          name: 'pickSubStage', label: 'المرحلة', type: 'select',
          options: stageOptions(), value: stage
        });
        var subjectSel = UI.field({ name: 'pickSubject', label: 'المادة', type: 'select', placeholder: 'اختر المادة' });
        var chips = h('div', { class: 'cluster', style: { gap: '6px' } });

        function subjectsOf(st) { return S.subjectsFor([st]); }
        function fit(sel, placeholder, options, value) {
          clear(sel);
          sel.appendChild(h('option', { value: '', text: placeholder }));
          options.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
          sel.value = value || '';
        }
        function paintChips() {
          clear(chips);
          if (!draft.subjects.length) {
            chips.appendChild(h('span', { class: 'muted', style: { fontSize: 'var(--fs-xs)' }, text: 'لم تُضف مواد بعد.' }));
            return;
          }
          draft.subjects.forEach(function (s) {
            chips.appendChild(h('span', { class: 'chip chip-mint' }, [
              h('span', { text: s }),
              h('button', {
                class: 'btn-link', type: 'button', title: 'إزالة ' + s, 'aria-label': 'إزالة ' + s,
                style: { padding: '0 2px', lineHeight: '1' }, html: '&#10005;',
                onClick: function () {
                  draft.subjects = draft.subjects.filter(function (x) { return x !== s; });
                  paintChips(); UI.toast('أُزيلت المادة ' + s, 'warn');
                }
              })
            ]));
          });
        }
        function rebuild() {
          var listS = subjectsOf(stage);
          fit(subjectSel.input, listS.length ? 'اختر المادة' : 'لا مواد لهذه المرحلة', listS.map(function (s) { return { value: s, label: s }; }), '');
          if (addBtn) addBtn.disabled = !listS.length;
        }

        stageSel.input.addEventListener('change', function () {
          stage = stageSel.input.value;
          var allowed = subjectsOf(stage);
          /* امسح ما لا ينتمي للمرحلة الجديدة */
          draft.subjects = draft.subjects.filter(function (s) { return allowed.indexOf(s) > -1; });
          rebuild(); paintChips();
        });

        addBtn = h('button', {
          class: 'mini-btn is-primary', type: 'button', text: 'إضافة المادة',
          onClick: function () {
            var s = subjectSel.input.value;
            if (!s) { UI.toast('اختر المرحلة والمادة أولًا', 'warn'); return; }
            if (draft.subjects.indexOf(s) > -1) { UI.toast('المادة مُضافة مسبقًا', 'warn'); return; }
            draft.subjects.push(s); paintChips(); UI.toast('أُضيفت المادة إلى القائمة', 'ok');
          }
        });

        rebuild(); paintChips();

        return h('div', { class: 'stack-sm' }, [
          h('h4', { text: 'المواد' }),
          h('div', { class: 'form-grid' }, [stageSel.wrap, subjectSel.wrap]),
          h('div', { class: 'cluster' }, [addBtn]),
          chips
        ]);
      }

      function teacherAssignSection(draft) {
        return h('div', {
          class: 'mt-4',
          style: { border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', padding: '14px', background: 'var(--bg-soft)' }
        }, [
          h('h4', { text: 'فصول المعلم ومواده' }),
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginBottom: '10px' },
            text: 'المدير يختار فقط — التثبيت بيد وكيل شؤون الطلاب: بعد التثبيت لا يرى المعلم في التحضير إلا فصوله ومواده. لا تظهر إلا فصول ومواد مراحل هذه المدرسة.' }),
          h('div', { class: 'grid-2-app' }, [classPicker(draft), subjectPicker(draft)])
        ]);
      }

      function accountModal(user) {
        var draft = {
          classIds: planClasses(user).map(function (k) { return k.id; }),
          subjects: planSubjects(user)
        };
        var name = UI.field({ name: 'name', label: 'الاسم', required: true, half: true, value: user ? user.name : '' });
        var role = UI.field({
          name: 'role', label: 'الدور', type: 'select', required: true, half: true, placeholder: 'اختر الدور',
          options: assignableRoles().map(function (r) { return { value: r.id, label: r.name }; }),
          value: user ? user.role : ''
        });
        var nid = UI.field({ name: 'nationalId', label: 'رقم الهوية', half: true, value: user ? user.nationalId || '' : '' });
        var phone = UI.field({ name: 'phone', label: 'الجوال', half: true, value: user ? user.phone || '' : '' });
        var email = UI.field({ name: 'email', label: 'البريد الإلكتروني', half: true, value: user ? user.email || '' : '' });

        var teacherBox = teacherAssignSection(draft);
        teacherBox.hidden = !(user && user.role === 'teacher');
        role.input.addEventListener('change', function () { teacherBox.hidden = role.input.value !== 'teacher'; });

        var error = h('p', { class: 'hint hint-error', hidden: true });

        function markRequired(pair, bad) {
          var empty = !pair.input.value.trim();
          pair.wrap.classList.toggle('has-error', empty);
          return bad || empty;
        }

        function submit(close) {
          var d = {
            name: name.input.value.trim(), role: role.input.value,
            nationalId: nid.input.value.trim(), phone: phone.input.value.trim(), email: email.input.value.trim()
          };
          var bad = false;
          bad = markRequired(name, bad);
          bad = markRequired(role, bad);
          if (bad) { error.hidden = false; error.textContent = 'يرجى إكمال الحقول المطلوبة.'; return; }

          var all = S.list('users');
          var dupEmail = d.email && all.some(function (u) { return u.email === d.email && (!user || u.id !== user.id); });
          var dupNid = d.nationalId && all.some(function (u) { return u.nationalId === d.nationalId && (!user || u.id !== user.id); });
          if (dupEmail) { UI.toast('البريد الإلكتروني مستخدم مسبقًا', 'err'); return; }
          if (dupNid) { UI.toast('رقم الهوية مستخدم مسبقًا', 'err'); return; }
          error.hidden = true;

          var isT = d.role === 'teacher';
          var classIds = isT ? draft.classIds.slice() : [];
          var subjects = isT ? draft.subjects.slice() : [];
          var summary = isT ? (' — ' + classIds.length + ' فصل · ' + subjects.length + ' مادة') : '';

          if (user) {
            var patch = { name: d.name, role: d.role, nationalId: d.nationalId, phone: d.phone, email: d.email };
            if (isT) { patch.classIds = classIds; patch.subjects = subjects; patch.qualified = subjects.slice(); }
            S.update('users', user.id, patch);
            UI.toast('حُدّث الحساب' + summary, 'ok');
          } else {
            var row = {
              schoolId: schoolId, role: d.role, name: d.name, nationalId: d.nationalId,
              phone: d.phone, email: d.email, status: 'active', canLogin: true, subjects: []
            };
            if (isT) { row.subjects = subjects; row.qualified = subjects.slice(); row.classIds = classIds; row.locked = false; }
            S.insert('users', row);
            S.notify({ kind: 'staff', title: 'حساب جديد: ' + d.name, body: 'الدور: ' + roleName(d.role) + summary, to: ['principal'] });
            UI.toast('أُضيف الحساب' + summary, 'ok');
          }
          if (isT) UI.toast('الفصول والمواد بانتظار تثبيت وكيل شؤون الطلاب', 'warn');
          close();
          draw();
        }

        UI.modal({
          title: user ? 'تعديل حساب' : 'إضافة حساب', wide: true,
          body: [
            h('p', { class: 'muted', style: { marginBottom: '14px' },
              text: 'يُتحقّق من عدم تكرار البريد الإلكتروني أو رقم الهوية. وعند اختيار دور «معلم» تُختار الفصول والمواد من مراحل المدرسة فقط.' }),
            h('div', { class: 'form-grid' }, [name.wrap, role.wrap, nid.wrap, phone.wrap, email.wrap]),
            teacherBox,
            error
          ],
          actions: [
            { label: 'إلغاء', class: 'btn-outline', onClick: function (close) { close(); } },
            { label: user ? 'حفظ' : 'إضافة', class: 'btn-primary', onClick: function (close) { submit(close); } }
          ]
        });
      }

      function accountActions(u) {
        var actions = [];
        if (u.role === 'teacher') {
          actions.push(h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تعديل الفصول والمواد', onClick: function () { accountModal(u); } }));
        }
        actions.push(h('button', { class: 'mini-btn', type: 'button', text: 'تعديل', onClick: function () { accountModal(u); } }));
        actions.push(h('button', {
          class: 'mini-btn', type: 'button', text: u.status === 'active' ? 'إيقاف' : 'تشغيل',
          onClick: function () {
            var active = u.status === 'active';
            S.update('users', u.id, { status: active ? 'suspended' : 'active', canLogin: !active });
            UI.toast(active ? 'أُوقف الحساب' : 'شُغّل الحساب', 'ok');
            draw();
          }
        }));
        actions.push(h('button', {
          class: 'mini-btn is-danger', type: 'button', text: 'حذف',
          onClick: function () {
            UI.confirm('حذف حساب «' + u.name + '»؟', { ok: 'حذف', danger: true }).then(function (ok) {
              if (!ok) return;
              S.remove('users', u.id);
              UI.toast('حُذف الحساب', 'warn');
              draw();
            });
          }
        }));
        return h('div', { class: 'row-actions' }, actions);
      }

      function countCell(list, names, unit) {
        if (!list.length) return UI.badge('بلا ' + unit, 'amber');
        return h('span', { class: 'nums', title: names.join('، '), text: list.length + ' ' + unit });
      }

      function accountsPanel() {
        var rows = accounts();
        var body = rows.length ? UI.table({
          cols: [
            { label: 'الاسم', render: function (u) { return h('strong', { text: u.name }); } },
            { label: 'الدور', render: function (u) { return UI.badge(roleName(u.role), roleTone(u.role)); } },
            { label: 'الجوال', render: function (u) { return u.phone || '—'; } },
            { label: 'البريد', render: function (u) { return u.email || '—'; } },
            {
              label: 'الحالة', render: function (u) {
                return UI.badge(u.status === 'active' ? 'نشط' : 'موقوف', u.status === 'active' ? 'mint' : 'amber');
              }
            },
            {
              label: 'الفصول', render: function (u) {
                if (u.role !== 'teacher') return null;
                var ks = planClasses(u);
                return countCell(ks, ks.map(function (k) { return k.name; }), 'فصل');
              }
            },
            {
              label: 'المواد', render: function (u) {
                if (u.role !== 'teacher') return null;
                var subs = planSubjects(u);
                return countCell(subs, subs, 'مادة');
              }
            },
            {
              label: 'حالة الإسناد', render: function (u) {
                if (u.role !== 'teacher') return null;
                return lockBadge(u);
              }
            },
            { label: 'إجراءات', render: function (u) { return accountActions(u); } }
          ], rows: rows,
          empty: 'لا توجد حسابات بعد.'
        }) : UI.empty('لا توجد حسابات بعد — أضف أول حساب للمدرسة.', addBtn());

        return h('div', { class: 'stack-sm' }, [
          h('div', { class: 'between' }, [
            h('p', { class: 'muted', text: 'حسابات المدرسة: المدير والوكلاء والمعلمون والمسؤولون (لا تشمل حسابات الطلاب).' }),
            h('div', { class: 'cluster' }, [addBtn()])
          ]),
          body
        ]);
      }

      /* ======================================== (د) فصول ومواد المعلمين */
      function teacherPlanPanel() {
        var tch = teachers();
        var rows = tch.map(function (t) {
          var ks = planClasses(t);
          var subs = planSubjects(t);
          return { t: t, ks: ks, subs: subs, count: S.assignmentsOf(t.id).length };
        });
        var table = UI.table({
          cols: [
            { label: 'المعلم', render: function (r) { return h('strong', { text: r.t.name }); } },
            {
              label: 'الفصول', render: function (r) {
                if (!r.ks.length) return UI.badge('بلا فصول', 'amber');
                return h('div', { class: 'cluster', style: { gap: '6px' } }, r.ks.map(function (k) { return UI.badge(k.name, 'brand'); }));
              }
            },
            {
              label: 'المواد', render: function (r) {
                if (!r.subs.length) return UI.badge('بلا مواد', 'amber');
                return h('div', { class: 'cluster', style: { gap: '6px' } }, r.subs.map(function (s) { return UI.badge(s, 'mint'); }));
              }
            },
            { label: 'الحالة', render: function (r) { return lockBadge(r.t); } },
            { label: 'عدد الإسنادات الفعلية', render: function (r) { return h('span', { class: 'nums', text: String(r.count) }); } },
            {
              label: 'إجراءات', render: function (r) {
                return h('div', { class: 'row-actions' }, [
                  h('button', { class: 'mini-btn is-primary', type: 'button', text: 'تعديل الفصول والمواد', onClick: function () { accountModal(r.t); } })
                ]);
              }
            }
          ], rows: rows,
          empty: 'لا يوجد معلمون بعد — أضف حسابًا أو استورد المعلمين من نور.'
        });
        return h('div', { class: 'stack-sm' }, [
          h('p', { class: 'muted-block', text: 'التثبيت بيد وكيل شؤون الطلاب — بعد التثبيت لا يرى المعلم في التحضير إلا فصوله ومواده.' }),
          table
        ]);
      }

      /* ============================================ (ب) استيراد المعلمين */
      function downloadTemplate() {
        UI.downloadCsv([
          { 'الاسم': 'أ. سعد بن إبراهيم المطيري', 'المادة': 'الرياضيات', 'رقم الهوية': '1023456789', 'الجوال': '+966501234567', 'البريد': 'saad@school.edu.sa' },
          { 'الاسم': 'أ. نورة بنت سالم الغامدي', 'المادة': 'الكفايات اللغوية / التفكير الناقد', 'رقم الهوية': '1098765432', 'الجوال': '+966509876543', 'البريد': 'noura@school.edu.sa' }
        ], 'قالب-المعلمين-نور.csv');
        UI.toast('نُزّل قالب الأعمدة', 'ok');
      }

      function guessMap(keys) {
        function pick(re) { return keys.find(function (k) { return re.test(String(k)); }) || ''; }
        return {
          name: pick(/اسم|name/i),
          subject: pick(/مادة|subject/i),
          id: pick(/هوية|national|id/i),
          phone: pick(/جوال|هاتف|phone|mobile/i),
          email: pick(/بريد|email|mail/i)
        };
      }

      function onFile(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        state.imp.error = '';
        UI.readExcel(file).then(function (res) {
          var rows = repairRows((res && res.rows) || []);
          if (!rows.length) { state.imp.error = 'الملف لا يحتوي صفوفًا قابلة للقراءة.'; draw(); return; }
          state.imp.rows = rows;
          state.imp.fileName = file.name;
          state.imp.map = guessMap(Object.keys(rows[0]));
          state.imp.imported = [];
          UI.toast('قُرئ ' + rows.length + ' صفًا من الملف', 'ok');
          draw();
        }).catch(function (err) {
          state.imp.error = 'تعذّر قراءة الملف: ' + ((err && err.message) ? err.message : 'صيغة غير مدعومة');
          draw();
        });
      }

      function mapField(label, key, cols) {
        var f = UI.field({
          name: 'map-' + key, label: label, type: 'select', half: true, placeholder: '— اختر العمود —',
          options: cols.map(function (c) { return { value: c, label: c }; }),
          value: state.imp.map[key] || ''
        });
        f.input.addEventListener('change', function () { state.imp.map[key] = f.input.value; });
        return f.wrap;
      }

      function runImport() {
        var rows = state.imp.rows, m = state.imp.map;
        if (!m.name) { UI.toast('حدّد عمود الاسم أولًا', 'warn'); return; }
        var existing = S.list('users');
        var added = 0, skipped = 0, imported = [];
        rows.forEach(function (r) {
          var name = String(r[m.name] == null ? '' : r[m.name]).trim();
          if (!name) { skipped++; return; }
          var nid = m.id ? String(r[m.id] == null ? '' : r[m.id]).trim() : '';
          var email = m.email ? String(r[m.email] == null ? '' : r[m.email]).trim() : '';
          var phone = m.phone ? String(r[m.phone] == null ? '' : r[m.phone]).trim() : '';
          var subjects = m.subject ? String(r[m.subject] == null ? '' : r[m.subject]).split(/[,،\/]+/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
          var dup = (nid && existing.some(function (u) { return u.nationalId === nid; })) ||
                    (email && existing.some(function (u) { return u.email === email; }));
          if (dup) { skipped++; return; }
          var u = S.insert('users', {
            schoolId: schoolId, role: 'teacher', name: name, nationalId: nid, phone: phone, email: email,
            status: 'active', canLogin: true, subjects: subjects, qualified: subjects.slice(), source: 'nur'
          });
          existing.push(u); added++; imported.push(u);
        });
        state.imp.imported = imported;
        state.imp.rows = [];
        state.imp.map = {};
        UI.toast('أُضيف ' + added + ' معلمًا · تم تخطّي ' + skipped, added ? 'ok' : 'warn');
        if (added) S.notify({ kind: 'staff', title: 'استيراد معلمين من نور', body: 'أُضيف ' + added + ' حسابًا · تم تخطّي ' + skipped, to: ['principal'] });
        draw();
      }

      function importPanel() {
        var cols = state.imp.rows.length ? Object.keys(state.imp.rows[0]) : [];
        var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
        input.addEventListener('change', onFile);
        var drop = h('label', { class: 'file-drop' }, [
          input,
          h('strong', { text: 'اسحب ملف نور هنا أو اضغط للاختيار' }),
          h('span', { text: 'الصيغ المدعومة: xlsx · xls · csv' + (state.imp.fileName ? ' — الملف الحالي: ' + state.imp.fileName : '') })
        ]);

        var children = [
          h('div', { class: 'between' }, [
            h('p', { class: 'muted', text: 'ارفع كشف المعلمين من نظام نور ثم حدّد أعمدة الاسم والمادة والهوية والجوال والبريد.' }),
            h('button', { class: 'btn btn-outline btn-sm', type: 'button', text: 'تنزيل قالب الأعمدة', onClick: downloadTemplate })
          ]),
          drop
        ];

        if (state.imp.error) {
          children.push(h('p', { class: 'muted-block mt-4', style: { color: '#B3374A' }, text: state.imp.error }));
        }

        if (cols.length) {
          children.push(h('div', { class: 'mt-4' }, [
            h('h4', { text: 'ربط الأعمدة' }),
            h('div', { class: 'form-grid' }, [
              mapField('عمود الاسم', 'name', cols),
              mapField('عمود المادة', 'subject', cols),
              mapField('عمود رقم الهوية', 'id', cols),
              mapField('عمود الجوال', 'phone', cols),
              mapField('عمود البريد', 'email', cols)
            ])
          ]));
          children.push(h('div', { class: 'mt-4' }, [
            h('h4', { text: 'معاينة أول ' + Math.min(8, state.imp.rows.length) + ' صفوف' }),
            h('div', { class: 'import-preview' }, [UI.table({
              cols: cols.map(function (c) { return { label: c, render: function (r) { return String(r[c] == null ? '' : r[c]); } }; }),
              rows: state.imp.rows.slice(0, 8),
              empty: 'لا صفوف.'
            })])
          ]));
          children.push(h('div', { class: 'cluster mt-4' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'استيراد ' + state.imp.rows.length + ' معلمًا', onClick: runImport })
          ]));
        }

        if (state.imp.imported.length) {
          children.push(h('div', { class: 'mt-4' }, [
            h('h4', { text: 'المعلمون المستوردون (' + state.imp.imported.length + ')' }),
            UI.table({
              cols: [
                { label: 'الاسم', key: 'name' },
                { label: 'المواد', render: function (r) { return (r.subjects && r.subjects.length) ? r.subjects.join('، ') : '—'; } },
                { label: 'رقم الهوية', render: function (r) { return r.nationalId || '—'; } },
                { label: 'البريد', render: function (r) { return r.email || '—'; } }
              ], rows: state.imp.imported, empty: '—'
            })
          ]));
        }

        return h('div', { class: 'stack-sm' }, children);
      }

      /* ============================================ (ج) إسناد المواد */
      function loadDraft(teacherId) {
        var t = S.user(teacherId) || {};
        var subs = t.subjects || [];
        var draft = {};
        schoolStages.forEach(function (st) {
          draft[st] = S.subjectsFor([st]).filter(function (s) { return subs.indexOf(s) > -1; });
        });
        state.sub.draft = draft;
        state.sub.forTeacher = teacherId;
      }
      function toggleSubject(stage, subject, checked) {
        if (!state.sub.draft) state.sub.draft = {};
        var arr = state.sub.draft[stage] || (state.sub.draft[stage] = []);
        var i = arr.indexOf(subject);
        if (checked && i === -1) arr.push(subject);
        if (!checked && i > -1) arr.splice(i, 1);
      }

      function subjectsPanel() {
        if (!schoolStages.length) {
          return UI.empty('لا مراحل معرّفة لهذه المدرسة — اضبط المراحل من وحدة «المناطق والمدن والمدارس».');
        }
        var tch = teachers();
        if (!tch.length) {
          return UI.empty('لا يوجد معلمون بعد — أضف حسابًا أو استورد المعلمين من نور.',
            h('button', { class: 'btn btn-primary', type: 'button', text: 'الانتقال إلى الاستيراد', onClick: function () { state.tab = 'import'; draw(); } }));
        }
        if (!state.sub.teacherId || !tch.some(function (t) { return t.id === state.sub.teacherId; })) state.sub.teacherId = tch[0].id;
        if (schoolStages.indexOf(state.sub.stage) === -1) state.sub.stage = schoolStages[0];
        if (state.sub.forTeacher !== state.sub.teacherId) loadDraft(state.sub.teacherId);

        var teachSel = UI.field({
          name: 'subTeacher', label: 'المعلم', type: 'select',
          options: tch.map(function (t) { return { value: t.id, label: t.name }; }), value: state.sub.teacherId
        });
        teachSel.input.addEventListener('change', function () {
          state.sub.teacherId = teachSel.input.value; state.sub.forTeacher = null; draw();
        });

        var stageBar = UI.tabs(schoolStages.map(function (id) { return { key: id, label: S.stageName(id) }; }), function (key) {
          state.sub.stage = key; draw();
        });
        Array.prototype.forEach.call(stageBar.children, function (b, i) { b.classList.toggle('is-active', schoolStages[i] === state.sub.stage); });

        var subjects = S.subjectsFor([state.sub.stage]);
        var draft = state.sub.draft || {};
        var pickList = subjects.length ? h('div', { class: 'pick-list' }, subjects.map(function (s) {
          var cb = h('input', { type: 'checkbox', checked: (draft[state.sub.stage] || []).indexOf(s) > -1 });
          cb.addEventListener('change', function () { toggleSubject(state.sub.stage, s, cb.checked); });
          return h('label', {}, [cb, h('span', { text: s })]);
        })) : UI.empty('لا مواد مُعرّفة لهذه المرحلة.');

        var totalAll = allowedSubjects().length;
        var matrixRows = tch.map(function (t) {
          var subs = t.subjects || [];
          var covered = schoolStages.filter(function (st) {
            return S.subjectsFor([st]).some(function (s) { return subs.indexOf(s) > -1; });
          });
          return { t: t, subs: subs, covered: covered };
        });

        var reportBtn = UI.reportButton(function () {
          var rep = S.registerReport('staff', 'subjects', { title: 'تقرير إسناد المواد' });
          return {
            type: 'staff', refId: 'subjects', code: rep.code,
            title: 'تقرير إسناد المواد بحسب المرحلة', subtitle: school.name || '',
            meta: [
              { label: 'عدد المعلمين', value: tch.length },
              { label: 'مراحل المدرسة', value: schoolStages.map(function (id) { return S.stageName(id); }).join(' · ') },
              { label: 'إجمالي المواد المتاحة', value: totalAll }
            ],
            sections: [{
              heading: 'مصفوفة الإسناد',
              table: {
                cols: ['م', 'المعلم', 'المواد', 'المراحل', 'عدد المواد'],
                rows: matrixRows.map(function (r, i) {
                  return [i + 1, r.t.name, r.subs.join('، ') || '—',
                    r.covered.map(function (id) { return S.stageName(id); }).join(' · ') || '—', r.subs.length];
                })
              }
            }],
            signatures: ['مدير المدرسة']
          };
        }, { label: 'طباعة مصفوفة الإسناد', class: 'btn-outline' });

        var assignCard = h('div', { class: 'stack-sm' }, [
          h('div', { class: 'form-grid' }, [teachSel.wrap]),
          h('div', { class: 'mt-3' }, [stageBar]),
          h('p', { class: 'muted', text: 'المواد المعروضة تخصّ مراحل المدرسة فقط (' + schoolStages.map(function (id) { return S.stageName(id); }).join(' · ') + ').' }),
          pickList,
          h('div', { class: 'cluster mt-4' }, [
            h('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ المواد', onClick: saveSubjects }),
            reportBtn
          ])
        ]);

        var matrixTable = UI.table({
          cols: [
            { label: 'المعلم', render: function (r) { return h('strong', { text: r.t.name }); } },
            {
              label: 'المواد', render: function (r) {
                if (!r.subs.length) return UI.badge('بلا مواد', 'amber');
                return h('div', { class: 'cluster', style: { gap: '6px' } }, r.subs.map(function (s) { return UI.badge(s, 'brand'); }));
              }
            },
            {
              label: 'المرحلة', render: function (r) {
                if (!r.covered.length) return '—';
                return h('div', { class: 'cluster', style: { gap: '6px' } }, r.covered.map(function (id) { return UI.badge(S.stageName(id), 'mint'); }));
              }
            },
            { label: 'عدد المواد', render: function (r) { return progressBar(r.subs.length, totalAll); } }
          ], rows: matrixRows,
          empty: 'لا معلمين.'
        });

        return h('div', { class: 'stack-sm' }, [
          UI.panel('إسناد المواد', 'اختر المعلم ومرحلة المدرسة ثم حدّد المواد.', null, [assignCard]),
          UI.panel('مصفوفة الإسناد', 'المعلم × المواد × المرحلة.', null, [matrixTable])
        ]);
      }

      function saveSubjects() {
        var t = S.user(state.sub.teacherId);
        if (!t) return;
        var all = [];
        schoolStages.forEach(function (st) {
          (state.sub.draft[st] || []).forEach(function (s) { if (all.indexOf(s) === -1) all.push(s); });
        });
        S.update('users', t.id, { subjects: all, qualified: all.slice(), subjectsUpdatedAt: new Date().toISOString() });
        UI.toast('حُفظت مواد ' + t.name + ' (' + all.length + ' مادة)', 'ok');
        state.sub.forTeacher = null;
        draw();
      }

      draw();
    }
  });
})();
