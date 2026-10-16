// 本機預覽用的假資料：網址加 ?mock（主管視角）或 ?mock=member（成員視角）
(function () {
  const asManager = new URLSearchParams(location.search).get('mock') !== 'member';
  window.MOCK_USER = { name: asManager ? '興煜' : '宜恩', isManager: asManager };

  function iso(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let nextRow = 40;
  const me = {
    name: asManager ? '興煜' : '宜恩',
    isManager: asManager,
    statuses: ['未開始', '進行中', '快完成', '已完成', '延期'],
    categories: ['行政', '開發', '會議'],
    projects: ['課程規劃', '解題小組', '非部門任務'],
    tasks: [
      { row: 3, project: '課程規劃', name: '圖片課程試講', category: '行政', start: iso(-16), due: iso(-9), time: '15:30', status: '已完成', progress: '100%', note: '原定9/30，但因為UIUX一起延後', daysLeft: -9, postponeCount: 1 },
      { row: 4, project: '課程規劃', name: '閉幕式規劃成果回報', category: '行政', start: iso(-14), due: iso(0), time: '', status: '進行中', progress: '33%', note: '10/2規劃了一個看起來像是coding課程結尾的競賽，但是並非結業式', daysLeft: 0, postponeCount: 0 },
      { row: 5, project: '課程規劃', name: 'agent 課程完成第二堂', category: '開發', start: iso(-30), due: iso(5), time: '13:00', status: '未開始', progress: '0%', note: '', daysLeft: 5, postponeCount: 2 },
      { row: 11, project: '解題小組', name: '確認 AI 帳單', category: '行政', start: iso(-160), due: iso(-17), time: '13:00', status: '進行中', progress: '33%', note: '', daysLeft: -17, postponeCount: 3 },
      { row: 12, project: '解題小組', name: '整理企業解題需求', category: '會議', start: iso(-2), due: iso(2), time: '10:00-11:00', status: '快完成', progress: '66%', note: '', daysLeft: 2, postponeCount: 0 },
      { row: 28, project: '非部門任務', name: '問兔子病嬌', category: '行政', start: iso(-13), due: '', time: '', status: '未開始', progress: '0%', note: '', daysLeft: null, postponeCount: 0 }
    ]
  };

  const changes = [
    { time: '2026/10/16 14:20', sheet: '家朗', actor: '家朗', source: '前端', action: '延後完成日', task: 'coding 課程簡報完成', oldText: '2026/10/16', newText: '2026/10/23', reason: '等老大確認課程方向', notified: false },
    { time: '2026/10/16 11:02', sheet: '宜恩', actor: '宜恩', source: '前端', action: '新增任務', task: '整理企業解題需求', oldText: '', newText: '完成日 2026/10/18', reason: '', notified: false },
    { time: '2026/10/16 09:40', sheet: '宜恩', actor: 'yien@example.com', source: '試算表', action: '修改狀態', task: '閉幕式規劃成果回報', oldText: '未開始', newText: '進行中', reason: '', notified: true }
  ];

  window.MOCK_API = async function (action, payload) {
    await new Promise(r => setTimeout(r, 250));
    if (action === 'me') {
      return JSON.parse(JSON.stringify({ statuses: me.statuses, tasks: me.tasks }));
    }
    if (action === 'addOptions') {
      const members = [{ name: me.name, projects: me.projects }];
      if (asManager) {
        members.push({ name: '家朗', projects: ['課程規劃', '解題小組', 'PRD線上部屬'] }, { name: '宜恩', projects: ['課程規劃', '解題小組'] });
      }
      return { self: me.name, categories: me.categories, members: members };
    }
    if (action === 'addTask') {
      if (payload.member && payload.member !== me.name && !asManager) {
        throw Object.assign(new Error('只有主管可以查看'), { code: 403 });
      }
      const project = payload.newProject || payload.project;
      if (payload.newProject && !me.projects.includes(project) && (!payload.member || payload.member === me.name)) {
        me.projects.push(project);
      }
      if (!payload.member || payload.member === me.name) {
        me.tasks.push({ row: nextRow++, project: project, name: payload.name, category: payload.category, start: payload.start, due: payload.due, time: payload.time, status: '未開始', progress: '0%', note: payload.note, daysLeft: null, postponeCount: 0 });
      }
      return { row: nextRow - 1, member: payload.member || me.name, project: project };
    }
    if (action === 'updateTask') {
      const task = me.tasks.find(t => t.row === payload.row);
      if (payload.due !== undefined && task.due && (!payload.due || payload.due > task.due)) {
        if (!payload.reason) throw Object.assign(new Error('延後完成日必須填寫原因'), { code: 400 });
        task.postponeCount += 1;
      }
      ['status', 'due', 'time', 'note'].forEach(k => { if (payload[k] !== undefined) task[k] = payload[k]; });
      return { changed: 1 };
    }
    if (action === 'overview' || action === 'changes') {
      if (!asManager) {
        throw Object.assign(new Error('只有主管可以查看'), { code: 403 });
      }
    }
    if (action === 'overview') {
      const open = me.tasks.filter(t => t.status !== '已完成');
      return {
        members: [
          { name: '興煜', tasks: open, overdue: open.filter(t => t.daysLeft !== null && t.daysLeft < 0).length },
          { name: '家朗', tasks: [{ row: 7, project: '課程規劃', name: 'coding 課程簡報完成', status: '進行中', due: iso(7), time: '18:00', daysLeft: 7, postponeCount: 2 }], overdue: 0 },
          { name: '宜恩', tasks: [], overdue: 0 }
        ]
      };
    }
    if (action === 'changes') {
      return { changes: changes };
    }
    throw new Error('未知的操作');
  };
})();
