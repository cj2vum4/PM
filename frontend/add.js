// 新增任務：主管可以選成員；專案可以從下拉選現有的，也可以直接輸入新名稱
(function () {
  'use strict';
  const { h, toast, $view } = App;
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
    const project = projectCombo();
    const $name = h('input', { id: 'a-name', type: 'text', maxlength: '100', placeholder: '例如：完成 agent 課程第四堂' });
    const $category = h('select', { id: 'a-category' }, data.categories.map(c => h('option', { value: c }, c)));
    const $start = h('input', { id: 'a-start', type: 'date', value: App.todayIso() });
    const $due = h('input', { id: 'a-due', type: 'date' });
    const $time = h('input', { id: 'a-time', type: 'text', placeholder: '例：13:00 或 09:00-11:00', inputmode: 'numeric' });
    const $note = h('textarea', { id: 'a-note' });
    const $error = h('div', { class: 'error', role: 'alert' });
    const $submit = h('button', { class: 'btn btn--primary', type: 'submit' }, '新增任務');

    const currentProjects = () => (members.find(m => m.name === $member.value) || members[0]).projects;

    // 依輸入狀態更新提示與按鈕文字
    function syncState() {
      const value = project.$input.value.trim();
      const exists = currentProjects().includes(value);
      const hasName = Boolean($name.value.trim());
      if (!value) {
        project.$hint.textContent = '可從清單選擇現有專案，或直接輸入新專案名稱';
      } else if (exists) {
        project.$hint.textContent = '加到現有專案';
      } else {
        project.$hint.textContent = `將建立新專案「${value}」`;
      }
      $submit.textContent = !hasName && value && !exists ? '建立專案' : '新增任務';
    }

    $member.addEventListener('change', () => {
      project.setOptions(currentProjects());
      syncState();
    });
    project.$input.addEventListener('input', syncState);
    project.onPick = syncState;
    $name.addEventListener('input', syncState);
    $start.addEventListener('input', () => { $due.min = $start.value; });

    const form = h('form', {
      class: 'form',
      onsubmit: async event => {
        event.preventDefault();
        $error.textContent = '';
        const projectName = project.$input.value.trim();
        const name = $name.value.trim();
        if (!projectName) {
          $error.textContent = '請選擇或輸入專案';
          project.$input.focus();
          return;
        }
        if (!name && currentProjects().includes(projectName)) {
          $error.textContent = `「${projectName}」已經存在，請填寫任務名稱`;
          $name.focus();
          return;
        }
        if (name && $start.value && $due.value && $due.value < $start.value) {
          $error.textContent = '完成日不能早於開始日';
          return;
        }
        $submit.disabled = true;
        try {
          const { data: added } = await App.api('addTask', {
            member: $member.value,
            project: projectName,
            name: name,
            category: $category.value,
            start: $start.value,
            due: $due.value,
            time: $time.value.trim(),
            note: $note.value
          });
          if (added.row === null) {
            toast(`已建立專案「${added.member}／${added.project}」`);
          } else {
            toast(`已新增到「${added.member}／${added.project}」${added.projectCreated ? '（新專案）' : ''}`);
          }
          if (added.member === data.self) {
            App.clearCache('mine');
          }
          App.clearCache('overview');
          App.clearCache('changes');
          [$name, $due, $time, $note].forEach(el => { el.value = ''; });
          draft = { member: added.member, project: added.project, name: '' };
          if (added.projectCreated) {
            await App.refresh(options);   // 下拉清單多了新專案
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
      h('div', { class: 'field field--required' }, h('label', { for: 'a-project' }, '專案'), project.$root, project.$hint),
      h('div', { class: 'field' },
        h('label', { for: 'a-name' }, '任務名稱（選填）'),
        $name,
        h('div', { class: 'hint' }, '只想建立新專案可以留空')
      ),
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

    project.setOptions(currentProjects());
    if (draft.project !== undefined) {
      project.$input.value = draft.project;
    }
    if (draft.name !== undefined) {
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
    syncState();
  }

  /**
   * ============================================================
   * 專案欄：可輸入、也可以下拉選現有專案
   * ============================================================
   *
   * 不用 <datalist>：LINE 內建瀏覽器的支援不一致
   *
   * ============================================================
   */
  function projectCombo() {
    const $input = h('input', {
      id: 'a-project', type: 'text', maxlength: '50', autocomplete: 'off',
      role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'a-project-list',
      placeholder: '選擇或輸入專案名稱'
    });
    const $toggle = h('button', { class: 'combo__toggle', type: 'button', 'aria-label': '顯示所有專案', tabindex: '-1' }, '▾');
    const $list = h('ul', { class: 'combo__list', id: 'a-project-list', role: 'listbox', hidden: true });
    const $hint = h('div', { class: 'hint' });
    const combo = { $root: h('div', { class: 'combo' }, $input, $toggle, $list), $input, $hint, onPick: null, setOptions };
    let all = [];
    let active = -1;

    function setOptions(projects) {
      all = projects.slice();
    }

    function open(showAll) {
      const q = $input.value.trim();
      const items = showAll || !q || all.includes(q) ? all : all.filter(p => p.includes(q));
      active = -1;
      $list.replaceChildren(...(items.length
        ? items.map(p => h('li', {
            role: 'option',
            class: 'combo__item',
            'aria-selected': String(p === q),
            onpointerdown: event => {
              event.preventDefault();   // 不讓輸入框先失焦
              pick(p);
            }
          }, p))
        : [h('li', { class: 'combo__empty' }, q ? `沒有符合的專案，會建立新專案「${q}」` : '目前還沒有專案，直接輸入名稱即可建立')]));
      $list.hidden = false;
      $input.setAttribute('aria-expanded', 'true');
    }

    function close() {
      $list.hidden = true;
      $input.setAttribute('aria-expanded', 'false');
    }

    function pick(value) {
      $input.value = value;
      close();
      if (combo.onPick) {
        combo.onPick(value);
      }
    }

    function move(step) {
      const items = [...$list.querySelectorAll('.combo__item')];
      if (!items.length) {
        return;
      }
      active = (active + step + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('is-active', i === active));
      items[active].scrollIntoView({ block: 'nearest' });
    }

    $input.addEventListener('focus', () => open(false));
    $input.addEventListener('input', () => open(false));
    $input.addEventListener('blur', close);
    $input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if ($list.hidden) {
          open(true);
        }
        move(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Enter' && !$list.hidden && active >= 0) {
        event.preventDefault();
        pick($list.querySelectorAll('.combo__item')[active].textContent);
      } else if (event.key === 'Escape') {
        close();
      }
    });
    $toggle.addEventListener('pointerdown', event => {
      event.preventDefault();
      if ($list.hidden) {
        $input.focus();
        open(true);
      } else {
        close();
      }
    });
    return combo;
  }

  function readForm() {
    const get = id => {
      const el = document.getElementById(id);
      return el && $view.contains(el) ? el.value : undefined;
    };
    if (get('a-name') === undefined) {
      return {};
    }
    const form = {
      member: get('a-member'), project: get('a-project'),
      name: get('a-name'), category: get('a-category'), start: get('a-start'),
      due: get('a-due'), time: get('a-time'), note: get('a-note')
    };
    Object.keys(form).forEach(key => form[key] === undefined && delete form[key]);
    return form;
  }

  App.boot(options);
})();
