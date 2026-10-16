// 全員總覽（主管）
(function () {
  'use strict';
  const { h, byDue, dueBadges, $view } = App;
  const FILTERS = [
    ['open', '全部未完成', () => true],
    ['overdue', '已逾期', t => t.daysLeft !== null && t.daysLeft < 0],
    ['postponed', '延期 2 次以上', t => t.postponeCount >= 2],
    ['nodue', '待確認', t => !t.due]
  ];
  let filter = 'open';
  let data = null;

  function render(result) {
    data = result;
    const active = FILTERS.find(f => f[0] === filter) || FILTERS[0];
    const toolbar = h('div', { class: 'toolbar' },
      FILTERS.map(([id, label]) => h('button', {
        class: 'chip',
        'aria-pressed': String(id === active[0]),
        onclick: () => { filter = id; render(data); }
      }, label))
    );
    const sections = data.members
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

  App.boot({ action: 'overview', render: render });
})();
