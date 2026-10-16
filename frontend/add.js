// 新增任務：主管可以選成員，也可以直接新增專案
(function () {
  'use strict';
  const { h, toast, $view } = App;
  const NEW_PROJECT = '__new__';
  const options = { action: 'addOptions', render: render };
  let data = null;
  let draft = {};   // 背景更新重畫表單時保留已輸入的內容

  function render(result, user, stale) {
    if (stale === false && data) {
      draft = Object.assign(readForm(), draft);
    }
    data = result;
    const members = data.members;
    const memberName = draft.member && members.some(m => m.name === draft.member) ? draft.member : data.self;

    const $member = h('select', { id: 'a-member' }, members.map(m => h('option', { value: m.name, selected: m.name === memberName }, m.name === data.self ? `${m.name}（自己）` : m.name)));
    const $project = h('select', { id: 'a-project', required: true });
    const $newProject = h('input', { id: 'a-new-project', type: 'text', maxlength: '50', placeholder: '例如：Q4 教育訓練' });
    const $newProjectField = h('div', { class: 'field field--required', hidden: true }, h('label', { for: 'a-new-project' }, '新專案名稱'), $newProject);
    const $name = h('input', { id: 'a-name', type: 'text', required: true, maxlength: '100', placeholder: '例如：完成 agent 課程第四堂' });
    const $category = h('select', { id: 'a-category' }, data.categories.map(c => h('option', { value: c }, c)));
    const $start = h('input', { id: 'a-start', type: 'date', value: App.todayIso() });
    const $due = h('input', { id: 'a-due', type: 'date' });
    const $time = h('input', { id: 'a-time', type: 'text', placeholder: '例：13:00 或 09:00-11:00', inputmode: 'numeric' });
    const $note = h('textarea', { id: 'a-note' });
    const $error = h('div', { class: 'error', role: 'alert' });
    const $submit = h('button', { class: 'btn btn--primary', type: 'submit' }, '新增任務');

    function fillProjects(selected) {
      const member = members.find(m => m.name === $member.value) || members[0];
      $project.replaceChildren(
        ...member.projects.map(p => h('option', { value: p, selected: p === selected }, p)),
        h('option', { value: NEW_PROJECT, selected: selected === NEW_PROJECT || !member.projects.length }, '＋ 新增專案…')
      );
      syncNewProject();
    }
    function syncNewProject() {
      const isNew = $project.value === NEW_PROJECT;
      $newProjectField.hidden = !isNew;
      $newProject.required = isNew;
    }
    $member.addEventListener('change', () => fillProjects());
    $project.addEventListener('change', syncNewProject);
    $start.addEventListener('input', () => { $due.min = $start.value; });

    function readForm() {
      const get = id => {
        const el = document.getElementById(id);
        return el && $view.contains(el) ? el.value : undefined;
      };
      if (get('a-name') === undefined) {
        return {};
      }
      const form = {
        member: get('a-member'), project: get('a-project'), newProject: get('a-new-project'),
        name: get('a-name'), category: get('a-category'), start: get('a-start'),
        due: get('a-due'), time: get('a-time'), note: get('a-note')
      };
      Object.keys(form).forEach(key => form[key] === undefined && delete form[key]);
      return form;
    }

    const form = h('form', {
      class: 'form',
      onsubmit: async event => {
        event.preventDefault();
        $error.textContent = '';
        if ($start.value && $due.value && $due.value < $start.value) {
          $error.textContent = '完成日不能早於開始日';
          return;
        }
        const isNew = $project.value === NEW_PROJECT;
        $submit.disabled = true;
        try {
          const { data: added } = await App.api('addTask', {
            member: $member.value,
            project: isNew ? '' : $project.value,
            newProject: isNew ? $newProject.value.trim() : '',
            name: $name.value.trim(),
            category: $category.value,
            start: $start.value,
            due: $due.value,
            time: $time.value.trim(),
            note: $note.value
          });
          toast(`已新增到「${added.member}／${added.project}」`);
          if (added.member === data.self) {
            App.clearCache('mine');
          }
          App.clearCache('overview');
          App.clearCache('changes');
          [$name, $due, $time, $note, $newProject].forEach(el => { el.value = ''; });
          draft = { member: added.member, project: added.project };
          if (isNew) {
            await App.refresh(options);   // 專案清單多了新專案
          } else {
            render(data);
          }
        } catch (err) {
          $error.textContent = err.message;
        } finally {
          $submit.disabled = false;
        }
      }
    },
      members.length > 1 ? h('div', { class: 'field' },
        h('label', { for: 'a-member' }, '成員'),
        $member,
        h('div', { class: 'hint' }, '主管可以替成員新增任務')
      ) : null,
      h('div', { class: 'field field--required' }, h('label', { for: 'a-project' }, '專案'), $project),
      $newProjectField,
      h('div', { class: 'field field--required' }, h('label', { for: 'a-name' }, '任務名稱'), $name),
      h('div', { class: 'field' }, h('label', { for: 'a-category' }, '類別'), $category),
      h('div', { class: 'field' }, h('label', { for: 'a-start' }, '開始日期'), $start),
      h('div', { class: 'field' },
        h('label', { for: 'a-due' }, '預計完成日期'),
        $due,
        h('div', { class: 'hint' }, '還不確定可以先留空（待確認），之後再補')
      ),
      h('div', { class: 'field' }, h('label', { for: 'a-time' }, '時間（選填）'), $time),
      h('div', { class: 'field' }, h('label', { for: 'a-note' }, '備註（選填）'), $note),
      $error,
      h('div', { class: 'actions' }, $submit)
    );

    fillProjects(draft.project);
    if (draft.name !== undefined) {
      $newProject.value = draft.newProject || '';
      $name.value = draft.name || '';
      $category.value = draft.category || data.categories[0];
      $start.value = draft.start || App.todayIso();
      $due.value = draft.due || '';
      $time.value = draft.time || '';
      $note.value = draft.note || '';
    }
    $due.min = $start.value;
    draft = {};
    $view.replaceChildren(form);
  }

  App.boot(options);
})();
