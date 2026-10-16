// 異動紀錄（主管）
(function () {
  'use strict';
  const { h, $view } = App;
  const WARN_ACTIONS = ['延後完成日', '清除完成日'];

  function detail(c) {
    if (c.action === '新增任務') {
      return c.newText ? `（${c.newText}）` : '';
    }
    return c.oldText || c.newText ? `：${c.oldText || '（空）'} → ${c.newText || '（空）'}` : '';
  }

  function render(data) {
    const items = data.changes.map(c => h('div', { class: 'log' },
      h('div', { class: 'log__head' },
        h('span', null, c.time),
        h('span', { class: 'badge' }, c.sheet),
        h('span', { class: WARN_ACTIONS.includes(c.action) ? 'badge badge--warn' : 'badge' }, c.action),
        c.actor && c.actor !== c.sheet && c.source === '前端' ? h('span', { class: 'badge' }, `由 ${c.actor}`) : null,
        c.source === '試算表' ? h('span', { class: 'badge' }, '直接改表') : null,
        c.notified ? null : h('span', { class: 'badge badge--soon' }, '尚未通知')
      ),
      h('div', { class: 'log__body' }, c.task, detail(c)),
      c.reason ? h('div', { class: 'log__reason' }, `原因：${c.reason}`) : null
    ));
    $view.replaceChildren(
      h('div', { class: 'toolbar' }, h('span', { class: 'hint' }, '最近 100 筆')),
      ...(items.length ? items : [h('div', { class: 'state' }, '還沒有異動紀錄')])
    );
  }

  App.boot({ action: 'changes', render: render });
})();
