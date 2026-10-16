// 我的任務
(function () {
  'use strict';
  const { h, toast, isDone, byDue, dueBadges, $view } = App;

  // 舊的圖文選單連結（?tab=add 等）導到新的獨立頁面
  const oldTab = App.PARAMS.get('tab');
  const redirect = { add: 'add.html', overview: 'overview.html', changes: 'changes.html' }[oldTab];
  if (redirect) {
    location.replace(App.pageHref(redirect));
    return;
  }

  const $editor = document.getElementById('editor');
  let data = null;
  let showDone = false;
  const options = { action: 'me', render: render };

  function render(result) {
    data = result;
    const tasks = data.tasks.filter(t => showDone || !isDone(t));
    const toolbar = h('div', { class: 'toolbar' },
      h('button', { class: 'chip', 'aria-pressed': String(!showDone), onclick: () => { showDone = false; render(data); } }, '未完成'),
      h('button', { class: 'chip', 'aria-pressed': String(showDone), onclick: () => { showDone = true; render(data); } }, '全部'),
      h('span', { class: 'spacer' }),
      h('a', { class: 'chip chip--accent', href: App.pageHref('add.html') }, '＋ 新增任務')
    );
    if (!tasks.length) {
      $view.replaceChildren(toolbar, h('div', { class: 'state' }, showDone ? '還沒有任務' : '目前沒有未完成的任務 🎉'));
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
      list.sort(byDue).forEach(task => sections.push(h('button', {
        class: isDone(task) ? 'card card--done' : 'card',
        onclick: () => openEditor(task)
      },
        h('div', { class: 'card__title' }, task.name),
        h('div', { class: 'card__meta' }, h('span', { class: 'badge' }, task.status || '未設定狀態'), dueBadges(task))
      )));
    });
    $view.replaceChildren(toolbar, ...sections);
  }

  /**
   * ============================================================
   * 編輯任務
   * ============================================================
   */
  function openEditor(task) {
    const statuses = data.statuses.includes(task.status) || !task.status
      ? data.statuses
      : [task.status].concat(data.statuses);
    const $status = h('select', { id: 'f-status' }, statuses.map(s => h('option', { value: s, selected: s === task.status }, s)));
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
    const needsReason = () => Boolean(task.due) && (!$due.value || $due.value > task.due);
    $due.addEventListener('input', () => { $reasonField.hidden = !needsReason(); });

    const form = h('form', {
      class: 'form',
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
          await App.api('updateTask', payload);
          $editor.close();
          toast('已更新');
          App.clearCache('overview');
          App.clearCache('changes');
          await App.refresh(options);
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

  App.boot(options);
})();
