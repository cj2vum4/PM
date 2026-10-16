(function () {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const DONE_STATUSES = ['已完成', '完成'];
  const MOCK = new URLSearchParams(location.search).has('mock');

  const state = {
    idToken: '',
    me: null,
    tab: 'mine',
    showDone: false,
    overview: null,
    overviewFilter: 'open',
    changes: null
  };

  const $view = document.getElementById('view');
  const $tabs = document.getElementById('tabs');
  const $user = document.getElementById('user');
  const $editor = document.getElementById('editor');
  const $toast = document.getElementById('toast');

  /**
   * ============================================================
   * 小工具
   * ============================================================
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) {
        return;
      }
      if (key === 'class') {
        el.className = value;
      } else if (key.startsWith('on')) {
        el.addEventListener(key.slice(2), value);
      } else if (key === 'value') {
        el.value = value;
      } else {
        el.setAttribute(key, value === true ? '' : value);
      }
    });
    children.flat().forEach(child => {
      if (child === null || child === undefined || child === false) {
        return;
      }
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function isDone(task) {
    return DONE_STATUSES.includes(task.status);
  }

  let toastTimer = null;
  function toast(message) {
    $toast.textContent = message;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 2500);
  }

  function showState(message, action) {
    $view.replaceChildren(h('div', { class: 'state' }, h('div', null, message), action || null));
  }

  function showFatal(err) {
    const relogin = err && err.code === 401;
    showState(
      (err && err.message) || String(err),
      relogin ? h('button', { class: 'btn btn--primary', onclick: relogin_ }, '重新登入') : null
    );
  }

  function relogin_() {
    if (window.liff && liff.isInClient()) {
      location.reload();
    } else {
      liff.logout();
      liff.login({ redirectUri: location.href });
    }
  }

  /**
   * ============================================================
   * API
   * ============================================================
   */
  async function api(action, payload) {
    if (MOCK) {
      return window.MOCK_API(action, payload || {});
    }
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, idToken: state.idToken }, payload || {}))
    });
    const json = await response.json();
    if (!json.ok) {
      const err = new Error(json.error || '發生錯誤，請稍後再試');
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  /**
   * ============================================================
   * 啟動
   * ============================================================
   */
  async function start() {
    try {
      if (!MOCK) {
        if (!CONFIG.API_URL) {
          throw new Error('尚未設定 API 網址（config.js 的 API_URL）');
        }
        await liff.init({ liffId: CONFIG.LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return;
        }
        state.idToken = liff.getIDToken();
      }
      await loadMe();
    } catch (err) {
      showFatal(err);
    }
  }

  async function loadMe() {
    state.me = await api('me');
    $user.textContent = state.me.isManager ? `${state.me.name}（主管）` : state.me.name;
    renderTabs();
    render();
  }

  function tabsFor(me) {
    const tabs = [['mine', '我的任務'], ['add', '新增任務']];
    if (me.isManager) {
      tabs.push(['overview', '全員總覽'], ['changes', '異動紀錄']);
    }
    return tabs;
  }

  function renderTabs() {
    $tabs.hidden = false;
    $tabs.replaceChildren(...tabsFor(state.me).map(([id, label]) => h('button', {
      role: 'tab',
      'aria-selected': String(state.tab === id),
      onclick: () => {
        state.tab = id;
        renderTabs();
        render();
      }
    }, label)));
  }

  function render() {
    const views = { mine: renderMine, add: renderAdd, overview: renderOverview, changes: renderChanges };
    (views[state.tab] || renderMine)();
    window.scrollTo(0, 0);
  }

  /**
   * ============================================================
   * 共用：日期標籤
   * ============================================================
   */
  function dueBadges(task) {
    const badges = [];
    if (!task.due) {
      badges.push(h('span', { class: 'badge' }, '未設定完成日（待確認）'));
    } else {
      let cls = 'badge';
      let suffix = '';
      const d = task.daysLeft;
      if (!isDone(task) && d !== null) {
        if (d < -3) {
          cls += ' badge--high';
          suffix = `｜逾期 ${-d} 天`;
        } else if (d < 0) {
          cls += ' badge--mid';
          suffix = `｜逾期 ${-d} 天`;
        } else if (d === 0) {
          cls += ' badge--soon';
          suffix = '｜今天到期';
        } else if (d <= 3) {
          cls += ' badge--soon';
          suffix = `｜${d} 天後`;
        }
      }
      badges.push(h('span', { class: cls }, `完成日 ${task.due.replace(/-/g, '/')}${task.time ? ' ' + task.time : ''}${suffix}`));
    }
    if (task.postponeCount > 0) {
      badges.push(h('span', { class: task.postponeCount >= 2 ? 'badge badge--warn' : 'badge' }, `延期 ${task.postponeCount} 次`));
    }
    return badges;
  }

  function byDue(a, b) {
    if (a.due === b.due) {
      return a.row - b.row;
    }
    if (!a.due) {
      return 1;
    }
    if (!b.due) {
      return -1;
    }
    return a.due < b.due ? -1 : 1;
  }

  /**
   * ============================================================
   * 我的任務
   * ============================================================
   */
  function renderMine() {
    const tasks = state.me.tasks.filter(t => state.showDone || !isDone(t));
    const toolbar = h('div', { class: 'toolbar' },
      h('button', {
        class: 'chip',
        'aria-pressed': String(!state.showDone),
        onclick: () => { state.showDone = false; renderMine(); }
      }, '未完成'),
      h('button', {
        class: 'chip',
        'aria-pressed': String(state.showDone),
        onclick: () => { state.showDone = true; renderMine(); }
      }, '全部'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'chip', onclick: refreshMe }, '重新整理')
    );

    if (!tasks.length) {
      $view.replaceChildren(toolbar, h('div', { class: 'state' }, state.showDone ? '還沒有任務' : '目前沒有未完成的任務 🎉'));
      return;
    }

    const groups = new Map();
    tasks.forEach(task => {
      const key = task.project || '未分類';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(task);
    });

    const sections = [];
    groups.forEach((list, project) => {
      sections.push(h('div', { class: 'group' }, project));
      list.sort(byDue).forEach(task => sections.push(taskCard(task)));
    });
    $view.replaceChildren(toolbar, ...sections);
  }

  function taskCard(task) {
    return h('button', {
      class: isDone(task) ? 'card card--done' : 'card',
      onclick: () => openEditor(task)
    },
      h('div', { class: 'card__title' }, task.name),
      h('div', { class: 'card__meta' },
        h('span', { class: 'badge' }, task.status || '未設定狀態'),
        dueBadges(task)
      )
    );
  }

  async function refreshMe() {
    try {
      showState('載入中…');
      await loadMe();
    } catch (err) {
      showFatal(err);
    }
  }

  /**
   * ============================================================
   * 編輯任務
   * ============================================================
   */
  function openEditor(task) {
    const statuses = state.me.statuses.includes(task.status) || !task.status
      ? state.me.statuses
      : [task.status].concat(state.me.statuses);

    const $status = h('select', { id: 'f-status' },
      statuses.map(s => h('option', { value: s, selected: s === task.status }, s)));
    const $due = h('input', { id: 'f-due', type: 'date', value: task.due || '', min: task.start || null });
    const $time = h('input', { id: 'f-time', type: 'text', value: task.time || '', placeholder: '例：13:00 或 09:00-11:00', inputmode: 'numeric' });
    const $note = h('textarea', { id: 'f-note' });
    $note.value = task.note || '';
    const $reason = h('textarea', { id: 'f-reason', placeholder: '例如：等待客戶回覆資料，預計下週才能完成' });
    const $reasonField = h('div', { class: 'field field--required', hidden: true },
      h('label', { for: 'f-reason' }, '延後原因'),
      $reason,
      h('div', { class: 'hint' }, '主管會在每天的 LINE 摘要看到這個原因，也會記在備註裡')
    );
    const $error = h('div', { class: 'error', role: 'alert' });
    const $save = h('button', { class: 'btn btn--primary', type: 'submit' }, '儲存');

    // 延後或清除完成日時才需要原因
    function needsReason() {
      return Boolean(task.due) && (!$due.value || $due.value > task.due);
    }
    function syncReason() {
      $reasonField.hidden = !needsReason();
    }
    $due.addEventListener('input', syncReason);

    const form = h('form', {
      class: 'form',
      method: 'dialog',
      onsubmit: async event => {
        event.preventDefault();
        $error.textContent = '';
        const payload = { row: task.row, name: task.name };
        if ($status.value !== task.status) payload.status = $status.value;
        if ($due.value !== (task.due || '')) payload.due = $due.value;
        if ($time.value.trim() !== (task.time || '')) payload.time = $time.value.trim();
        if ($note.value !== (task.note || '')) payload.note = $note.value;
        if (needsReason()) {
          if (!$reason.value.trim()) {
            $error.textContent = '延後或清除完成日時，請填寫原因';
            $reason.focus();
            return;
          }
          payload.reason = $reason.value.trim();
        }
        if (Object.keys(payload).length === 2) {
          $editor.close();
          return;
        }
        $save.disabled = true;
        try {
          await api('updateTask', payload);
          $editor.close();
          toast('已更新');
          state.overview = null;
          state.changes = null;
          await loadMe();
        } catch (err) {
          $error.textContent = err.message;
        } finally {
          $save.disabled = false;
        }
      }
    },
      h('div', { class: 'field' }, h('label', { for: 'f-status' }, '狀態'), $status),
      h('div', { class: 'field' },
        h('label', { for: 'f-due' }, '預計完成日期'),
        $due,
        h('div', { class: 'hint' }, '清空代表「待確認」，不會有行事曆與 LINE 提醒')
      ),
      $reasonField,
      h('div', { class: 'field' }, h('label', { for: 'f-time' }, '時間（選填）'), $time),
      h('div', { class: 'field' }, h('label', { for: 'f-note' }, '備註'), $note),
      $error,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => $editor.close() }, '取消'),
        $save
      )
    );

    $editor.replaceChildren(
      h('h2', null, task.name),
      h('div', { class: 'sub' }, [task.project, task.category, task.start ? `開始 ${task.start.replace(/-/g, '/')}` : ''].filter(Boolean).join('｜')),
      form
    );
    $editor.showModal();
  }

  /**
   * ============================================================
   * 新增任務
   * ============================================================
   */
  function renderAdd() {
    const projects = state.me.projects;
    if (!projects.length) {
      showState('你的工作表還沒有專案，請先請主管在試算表建立專案');
      return;
    }
    const $project = h('select', { id: 'a-project', required: true }, projects.map(p => h('option', { value: p }, p)));
    const $name = h('input', { id: 'a-name', type: 'text', required: true, maxlength: '100', placeholder: '例如：完成 agent 課程第四堂' });
    const $category = h('select', { id: 'a-category' }, state.me.categories.map(c => h('option', { value: c }, c)));
    const $start = h('input', { id: 'a-start', type: 'date', value: todayIso() });
    const $due = h('input', { id: 'a-due', type: 'date' });
    const $time = h('input', { id: 'a-time', type: 'text', placeholder: '例：13:00 或 09:00-11:00', inputmode: 'numeric' });
    const $note = h('textarea', { id: 'a-note' });
    const $error = h('div', { class: 'error', role: 'alert' });
    const $submit = h('button', { class: 'btn btn--primary', type: 'submit' }, '新增任務');

    $start.addEventListener('input', () => { $due.min = $start.value; });
    $due.min = $start.value;

    const form = h('form', {
      class: 'form',
      onsubmit: async event => {
        event.preventDefault();
        $error.textContent = '';
        if ($start.value && $due.value && $due.value < $start.value) {
          $error.textContent = '完成日不能早於開始日';
          return;
        }
        $submit.disabled = true;
        try {
          await api('addTask', {
            project: $project.value,
            name: $name.value.trim(),
            category: $category.value,
            start: $start.value,
            due: $due.value,
            time: $time.value.trim(),
            note: $note.value
          });
          toast('已新增任務');
          state.tab = 'mine';
          state.overview = null;
          state.changes = null;
          await loadMe();
        } catch (err) {
          $error.textContent = err.message;
        } finally {
          $submit.disabled = false;
        }
      }
    },
      h('div', { class: 'field field--required' }, h('label', { for: 'a-project' }, '專案'), $project),
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
    $view.replaceChildren(form);
  }

  /**
   * ============================================================
   * 全員總覽（主管）
   * ============================================================
   */
  async function renderOverview() {
    if (!state.overview) {
      showState('載入全員任務中…');
      try {
        state.overview = await api('overview');
      } catch (err) {
        showFatal(err);
        return;
      }
      if (state.tab !== 'overview') {
        return;
      }
    }
    const filters = [
      ['open', '全部未完成', () => true],
      ['overdue', '已逾期', t => t.daysLeft !== null && t.daysLeft < 0],
      ['postponed', '延期 2 次以上', t => t.postponeCount >= 2],
      ['nodue', '待確認', t => !t.due]
    ];
    const active = filters.find(f => f[0] === state.overviewFilter) || filters[0];

    const toolbar = h('div', { class: 'toolbar' },
      filters.map(([id, label]) => h('button', {
        class: 'chip',
        'aria-pressed': String(id === active[0]),
        onclick: () => { state.overviewFilter = id; renderOverview(); }
      }, label)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'chip', onclick: () => { state.overview = null; renderOverview(); } }, '重新整理')
    );

    const sections = state.overview.members
      .map(member => ({ member: member, tasks: member.tasks.filter(active[2]).sort(byDue) }))
      .filter(x => x.tasks.length)
      .map(({ member, tasks }) => h('details', { class: 'member', open: true },
        h('summary', null,
          member.name,
          member.overdue ? h('span', { class: 'badge badge--mid' }, `逾期 ${member.overdue}`) : null,
          h('span', { class: 'count' }, `${tasks.length} 項`)
        ),
        tasks.map(task => h('div', { class: 'row' },
          h('div', { class: 'row__title' }, task.name),
          h('div', { class: 'card__meta' },
            task.project ? h('span', null, task.project) : null,
            h('span', { class: 'badge' }, task.status || '未設定狀態'),
            dueBadges(task)
          )
        ))
      ));

    $view.replaceChildren(toolbar, ...(sections.length ? sections : [h('div', { class: 'state' }, '沒有符合條件的任務')]));
  }

  /**
   * ============================================================
   * 異動紀錄（主管）
   * ============================================================
   */
  async function renderChanges() {
    if (!state.changes) {
      showState('載入異動紀錄中…');
      try {
        state.changes = await api('changes');
      } catch (err) {
        showFatal(err);
        return;
      }
      if (state.tab !== 'changes') {
        return;
      }
    }
    const toolbar = h('div', { class: 'toolbar' },
      h('span', { class: 'hint' }, '最近 100 筆'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'chip', onclick: () => { state.changes = null; renderChanges(); } }, '重新整理')
    );
    const items = state.changes.changes.map(c => h('div', { class: 'log' },
      h('div', { class: 'log__head' },
        h('span', null, c.time),
        h('span', { class: 'badge' }, c.sheet),
        h('span', { class: c.action === '延後完成日' || c.action === '清除完成日' ? 'badge badge--warn' : 'badge' }, c.action),
        c.source === '試算表' ? h('span', { class: 'badge' }, '直接改表') : null,
        c.notified ? null : h('span', { class: 'badge badge--soon' }, '尚未通知')
      ),
      h('div', { class: 'log__body' },
        c.task,
        changeDetail(c)
      ),
      c.reason ? h('div', { class: 'log__reason' }, `原因：${c.reason}`) : null
    ));
    $view.replaceChildren(toolbar, ...(items.length ? items : [h('div', { class: 'state' }, '還沒有異動紀錄')]));
  }

  function changeDetail(c) {
    if (c.action === '新增任務') {
      return c.newText ? `（${c.newText}）` : '';
    }
    return c.oldText || c.newText ? `：${c.oldText || '（空）'} → ${c.newText || '（空）'}` : '';
  }

  /**
   * ============================================================
   * 本機預覽：?mock 會載入 mock.js，不連 LINE 與 GAS
   * ============================================================
   */
  if (MOCK) {
    const script = document.createElement('script');
    script.src = 'mock.js';
    script.onload = start;
    document.body.append(script);
  } else {
    start();
  }
})();
