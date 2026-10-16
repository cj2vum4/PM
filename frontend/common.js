// 各頁共用：登入、API、快取、畫面小工具
(function () {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const PAGE = document.body.dataset.page;
  const PARAMS = new URLSearchParams(location.search);
  const MOCK = PARAMS.has('mock');
  const SESSION_KEY = 'tt_session_v1';
  const CACHE_PREFIX = 'tt_cache_v1_';
  const DONE_STATUSES = ['已完成', '完成'];
  const LIFF_SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

  const $view = document.getElementById('view');
  const $tabs = document.getElementById('tabs');
  const $user = document.getElementById('user');
  const $sync = document.getElementById('sync');
  const $toast = document.getElementById('toast');

  /**
   * ============================================================
   * 瀏覽器儲存（私密視窗等情況可能無法使用，一律包 try）
   * ============================================================
   */
  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (err) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (err) { /* 略過 */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (err) { /* 略過 */ }
    }
  };

  function readCache(name) {
    try {
      return JSON.parse(store.get(CACHE_PREFIX + name) || 'null');
    } catch (err) {
      return null;
    }
  }

  function writeCache(name, value) {
    store.set(CACHE_PREFIX + name, JSON.stringify(value));
  }

  function clearCache(name) {
    store.remove(CACHE_PREFIX + name);
  }

  /**
   * ============================================================
   * 畫面小工具
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

  let toastTimer = null;
  function toast(message) {
    $toast.textContent = message;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 2600);
  }

  function showState(message, action) {
    $view.replaceChildren(h('div', { class: 'state' }, h('div', null, message), action || null));
  }

  function showError(err) {
    const relogin = err && err.code === 401;
    showState(
      (err && err.message) || String(err),
      relogin ? h('button', { class: 'btn btn--primary', onclick: relogin_ }, '重新登入') : null
    );
  }

  function relogin_() {
    store.remove(SESSION_KEY);
    location.reload();
  }

  function setSyncing(on) {
    if ($sync) {
      $sync.hidden = !on;
    }
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function isDone(task) {
    return DONE_STATUSES.includes(task.status);
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

  // 完成日標籤：顏色規則跟試算表一樣（3 天內黃、逾期 1～3 天淡紅、超過 3 天深紅）
  function dueBadges(task) {
    const badges = [];
    if (!task.due) {
      badges.push(h('span', { class: 'badge' }, '未設定完成日（待確認）'));
    } else {
      let cls = 'badge';
      let suffix = '';
      const d = task.daysLeft;
      if (!isDone(task) && d !== null && d !== undefined) {
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

  /**
   * ============================================================
   * 頁面導覽：主管才看得到全員總覽、異動紀錄
   * ============================================================
   */
  function pageHref(file) {
    return MOCK ? `${file}?${PARAMS.toString()}` : file;
  }

  function renderUser(user) {
    $user.textContent = user.isManager ? `${user.name}（主管）` : user.name;
    const pages = [['mine', 'index.html', '我的任務'], ['add', 'add.html', '新增任務']];
    if (user.isManager) {
      pages.push(['overview', 'overview.html', '全員總覽'], ['changes', 'changes.html', '異動紀錄']);
    }
    $tabs.replaceChildren(...pages.map(([id, file, label]) => h('a', {
      href: pageHref(file),
      'aria-current': id === PAGE ? 'page' : null
    }, label)));
    $tabs.hidden = false;
  }

  /**
   * ============================================================
   * 登入
   * ============================================================
   *
   * 第一次：LIFF 登入取得 ID Token，GAS 驗證後回傳登入憑證（存在本機）
   * 之後：直接帶憑證呼叫 API，不載入 LIFF SDK、不向 LINE 驗證
   *
   * ============================================================
   */
  let idToken = '';
  let liffPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入 LINE 登入元件，請檢查網路'));
      document.head.append(script);
    });
  }

  function liffLogin() {
    if (!liffPromise) {
      liffPromise = (async () => {
        await loadScript(LIFF_SDK);
        await liff.init({ liffId: CONFIG.LIFF[PAGE] });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return new Promise(() => {});   // 轉去 LINE 登入，不會回來
        }
        idToken = liff.getIDToken();
      })();
    }
    return liffPromise;
  }

  async function post(body) {
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async function api(action, payload) {
    if (MOCK) {
      return { data: await window.MOCK_API(action, payload || {}), user: window.MOCK_USER };
    }
    if (!store.get(SESSION_KEY) && !idToken) {
      await liffLogin();
    }
    const send = () => post(Object.assign({}, payload, {
      action: action,
      session: store.get(SESSION_KEY) || '',
      idToken: idToken
    }));
    let json = await send();

    /**
     * 憑證過期：重新用 LINE 登入一次再試
     */
    if (!json.ok && json.code === 401 && !idToken) {
      store.remove(SESSION_KEY);
      await liffLogin();
      json = await send();
    }
    if (!json.ok) {
      const err = new Error(json.error || '發生錯誤，請稍後再試');
      err.code = json.code;
      throw err;
    }
    if (json.session) {
      store.set(SESSION_KEY, json.session);
    }
    return { data: json.data, user: json.user };
  }

  /**
   * ============================================================
   * 頁面啟動：先畫上次的資料，再背景更新
   * ============================================================
   */
  async function boot(options) {
    if (MOCK) {
      await loadScript('mock.js');
    }
    const cached = readCache(options.cacheKey || PAGE);
    if (cached && cached.user) {
      renderUser(cached.user);
      options.render(cached.data, cached.user, true);
    }
    setSyncing(true);
    try {
      const result = await api(options.action, options.payload);
      writeCache(options.cacheKey || PAGE, result);
      renderUser(result.user);
      options.render(result.data, result.user, false);
    } catch (err) {
      if (cached) {
        toast(err.message);
      } else {
        showError(err);
      }
    } finally {
      setSyncing(false);
    }
  }

  // 重新抓資料並更新快取（修改後使用）
  async function refresh(options) {
    setSyncing(true);
    try {
      const result = await api(options.action, options.payload);
      writeCache(options.cacheKey || PAGE, result);
      renderUser(result.user);
      options.render(result.data, result.user, false);
    } finally {
      setSyncing(false);
    }
  }

  window.App = {
    PAGE, PARAMS, MOCK, $view,
    h, toast, showState, showError, todayIso, isDone, byDue, dueBadges,
    api, boot, refresh, clearCache, pageHref
  };
})();
