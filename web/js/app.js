/* 平台外壳：登录、导航、路由、站点切换、实时通道、通知 */
import { api, ApiError, createLive } from './api.js';
import * as ui from './ui.js';

const ROUTES = [
  { id: 'dashboard', title: '综合驾驶舱', section: '总览', icon: 'dashboard', file: 'dashboard.js' },
  { id: 'process', title: '工艺监控', section: '总览', icon: 'process', file: 'process.js' },
  { id: 'monitor', title: '实时监测', section: '总览', icon: 'monitor', file: 'monitor.js' },
  { id: 'alarms', title: '告警中心', section: '运行', icon: 'alarm', file: 'alarms.js', badge: 'alarms' },
  { id: 'control', title: '远程控制', section: '运行', icon: 'control', file: 'control.js' },
  { id: 'params', title: '工艺参数', section: '运行', icon: 'params', file: 'params.js' },
  { id: 'quality', title: '水质与化验', section: '水质与诊断', icon: 'quality', file: 'quality.js' },
  { id: 'diagnosis', title: '智能诊断', section: '水质与诊断', icon: 'diagnosis', file: 'diagnosis.js' },
  { id: 'analysis', title: '数据分析', section: '水质与诊断', icon: 'analysis', file: 'analysis.js' },
  { id: 'reports', title: '报表中心', section: '水质与诊断', icon: 'report', file: 'reports.js' },
  { id: 'workorders', title: '工单管理', section: '运维', icon: 'workorder', file: 'workorders.js', badge: 'workorders' },
  { id: 'inspections', title: '巡检管理', section: '运维', icon: 'inspection', file: 'inspections.js' },
  { id: 'devices', title: '设备台账', section: '运维', icon: 'device', file: 'devices.js' },
  { id: 'admin', title: '系统管理', section: '系统', icon: 'admin', file: 'admin.js' },
  { id: 'kiosk', title: '现场触摸屏', section: '现场', icon: 'kiosk', file: 'kiosk.js', hidden: true },
];

const PAGE_THEME = {};

const DEMO_ACCOUNTS = [
  { username: 'admin', name: '平台管理员', role: 'super', title: '平台超级管理员' },
  { username: 'wang', name: '王敏', role: 'region', title: '区域管理员' },
  { username: 'li', name: '李工', role: 'process', title: '工艺负责人' },
  { username: 'zhao', name: '赵磊', role: 'operator', title: '运维值班人员' },
  { username: 'chen', name: '陈浩', role: 'maintainer', title: '现场维修人员' },
  { username: 'guest', name: '监管访客', role: 'viewer', title: '只读监管' },
  { username: 'sun', name: '孙倩', role: 'operator', title: '运维值班（site-2）' },
];

const state = {
  user: null,
  meta: null,
  settings: null,
  sites: [],
  siteId: null,
  route: null,
  query: {},
  pageCleanup: [],
  pageSubs: new Set(),
  pageTimers: new Set(),
  badges: { alarms: 0, workorders: 0 },
  wsState: 'offline',
  notifOpen: false,
  rendering: false,
  lastTelemetryAt: null,
};

let live = null;
let unlisten = null;
let notifTimer = null;
let badgeTimer = null;

const $ = (sel) => document.querySelector(sel);

/* ---------------- 启动 ---------------- */
async function boot() {
  document.getElementById('boot').hidden = false;
  try {
    const me = await api.me();
    setAppVersion(me && me.version);
    if (me && me.user) {
      await enterShell(me);
    } else {
      // 演示模式：?as=admin 可直接以演示账号进入（仅用于演示与截图，口令仍是公开的演示口令）
      const as = new URLSearchParams(location.search).get('as');
      let entered = false;
      if (as) {
        try {
          await api.login(as, 'water123');
          const again = await api.me();
          if (again && again.user) {
            await enterShell(again);
            entered = true;
            history.replaceState(null, '', location.pathname + location.hash);
          }
        } catch { entered = false; }
      }
      if (!entered) showLogin();
    }
  } catch (err) {
    showLogin(err && err.message ? `无法连接后端服务：${err.message}` : '无法连接后端服务');
  } finally {
    document.getElementById('boot').hidden = true;
  }
}

function setAppVersion(version) {
  if (!version) return;
  document.querySelectorAll('[data-app-version]').forEach((element) => {
    element.textContent = `v${version}`;
  });
}

/* ---------------- 登录 ---------------- */
function showLogin(message) {
  document.body.dataset.theme = 'light';
  document.getElementById('shell').hidden = true;
  document.getElementById('login').hidden = false;
  if (state.wsState === 'online' && live) { live.close(); live = null; }
  const form = $('#login-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', onLoginSubmit);
  }
  const accounts = $('#demo-accounts');
  ui.clear(accounts);
  for (const a of DEMO_ACCOUNTS) {
    accounts.appendChild(ui.el('button', {
      class: 'demo-account', type: 'button', title: `使用 ${a.username} 登录`,
      onclick: () => {
        $('#login-username').value = a.username;
        $('#login-password').value = 'water123';
        $('#login-submit').focus();
      },
    },
      ui.el('b', {}, a.username),
      ui.el('span', {}, a.title),
    ));
  }
  const err = $('#login-error');
  if (message) { err.textContent = message; err.hidden = false; } else { err.hidden = true; }
  const saved = localStorage.getItem('zf.username');
  if (saved) $('#login-username').value = saved;
  const toggle = $('#login-demo-toggle');
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const list = $('#demo-accounts');
      list.hidden = !list.hidden;
      toggle.textContent = list.hidden ? '演示账号' : '收起演示账号';
    });
  }
  setTimeout(() => $('#login-username').focus(), 50);
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const err = $('#login-error');
  const btn = $('#login-submit');
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  if (!username || !password) { err.textContent = '请输入账号与密码'; err.hidden = false; return; }
  btn.disabled = true;
  btn.textContent = '正在登录…';
  err.hidden = true;
  try {
    await api.login(username, password);
    localStorage.setItem('zf.username', username);
    const me = await api.me();
    await enterShell(me);
    $('#login').hidden = true;
  } catch (ex) {
    err.textContent = ex.message || '登录失败';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

/* ---------------- 进入外壳 ---------------- */
async function enterShell(me) {
  state.user = me.user;
  state.settings = me.settings;
  state.meta = await api.meta();
  const sites = await api.sites();
  state.sites = sites || [];
  const stored = localStorage.getItem('zf.site');
  const valid = state.sites.some((s) => s.id === stored) ? stored : null;
  state.siteId = valid || (state.sites[0] && state.sites[0].id) || null;
  if (state.siteId) localStorage.setItem('zf.site', state.siteId);
  document.getElementById('login').hidden = true;
  document.getElementById('shell').hidden = false;
  renderNav();
  renderSiteSelect();
  renderUser();
  wireShell();
  state.lastTelemetryAt = null;
  startClock();
  connectLive();
  await refreshBadges();
  loadNotifications();
  clearInterval(notifTimer);
  notifTimer = setInterval(loadNotifications, 45000);
  clearInterval(badgeTimer);
  badgeTimer = setInterval(refreshBadges, 60000);
  navigate();
}

/* ---------------- 导航 ---------------- */
function renderNav() {
  const nav = $('#nav');
  ui.clear(nav);
  let lastSection = null;
  for (const route of ROUTES) {
    if (route.hidden) continue;
    if (route.section !== lastSection) {
      lastSection = route.section;
      nav.appendChild(ui.el('div', { class: 'nav-group-label' }, route.section));
    }
    const item = ui.el('a', {
      class: 'nav-item', href: `#/${route.id}`, dataset: { route: route.id },
      onclick: () => { document.body.classList.remove('nav-open'); },
    },
      ui.icon(route.icon),
      ui.el('span', { class: 'nav-text' }, route.title),
    );
    if (route.badge) {
      item.appendChild(ui.el('span', { class: `nav-badge${route.badge === 'workorders' ? ' soft' : ''}`, id: `nav-badge-${route.badge}`, hidden: true }, '0'));
    }
    nav.appendChild(item);
  }
  highlightNav();
}

function highlightNav() {
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === (state.route && state.route.id));
  });
}

function renderSiteSelect() {
  const sel = $('#site-select');
  ui.clear(sel);
  for (const s of state.sites) {
    sel.appendChild(ui.el('option', { value: s.id, selected: s.id === state.siteId }, s.name || s.id));
  }
  sel.disabled = state.sites.length <= 1;
}

function renderUser() {
  const u = state.user;
  $('#user-name').textContent = u.name || u.username;
  $('#user-role').textContent = u.roleName || u.title || u.role;
  $('#user-avatar').textContent = (u.name || u.username || '?').slice(0, 1);
  const head = $('#user-menu-head');
  ui.clear(head);
  head.append(
    ui.el('b', {}, `${u.name || u.username}`),
    ui.el('span', {}, `${u.roleName || u.role} · ${u.siteScope === 'all' ? '全部站点' : '授权站点'}`),
  );
  if (u.mustChangePassword) ui.toast('当前账号需要修改初始密码', 'error', 5000);
}

/* ---------------- 路由 ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const id = (pathPart || 'dashboard').split('/')[0] || 'dashboard';
  const query = {};
  new URLSearchParams(queryPart || '').forEach((v, k) => { query[k] = v; });
  return { id, query };
}

async function navigate() {
  const { id, query } = parseHash();
  let route = ROUTES.find((r) => r.id === id);
  if (!route) route = ROUTES[0];
  state.route = route;
  state.query = query;
  document.body.dataset.theme = PAGE_THEME[route.id] || 'light';
  highlightNav();
  setTitle(route.title, route.section);
  await renderPage(route, query);
}

function setTitle(title, section) {
  $('#page-title').textContent = title || '小禹';
  if (section) $('#crumb-section').textContent = section;
  document.title = `${title} · 小禹`;
}

function cleanupPage() {
  for (const fn of state.pageCleanup.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
  for (const sub of state.pageSubs) { try { sub(); } catch (e) { console.error(e); } }
  state.pageSubs.clear();
  for (const t of state.pageTimers) clearInterval(t);
  state.pageTimers.clear();
}

async function renderPage(route, query) {
  if (state.rendering) return;
  state.rendering = true;
  cleanupPage();
  const view = $('#view');
  ui.mount(view, ui.skeleton(4, 'block'));
  try {
    const mod = await import(`./pages/${route.file}`);
    if (!mod || typeof mod.render !== 'function') throw new Error(`页面模块 ${route.file} 缺少 render 导出`);
    const ctx = buildCtx(query);
    ui.mount(view, ui.el('div', { class: 'page', id: 'page-root' }));
    if (mod.meta && mod.meta.title) setTitle(mod.meta.title, route.section);
    await mod.render(document.getElementById('page-root'), ctx);
    view.scrollTop = 0;
  } catch (err) {
    console.error('[page]', route.id, err);
    if (err instanceof ApiError && err.status === 401) {
      showLogin('登录已过期，请重新登录');
      toastAuthExpired();
      return;
    }
    ui.mount($('#view'), ui.el('div', { class: 'page' },
      ui.pageHead(route.title, '页面加载失败'),
      ui.card({ body: ui.errorState(err, () => renderPage(route, query)) }),
    ));
  } finally {
    state.rendering = false;
  }
}

function toastAuthExpired() {
  ui.toast('登录状态已失效，请重新登录', 'error');
}

function buildCtx(query) {
  const site = state.sites.find((s) => s.id === state.siteId) || null;
  return {
    api,
    ui,
    user: state.user,
    meta: state.meta,
    settings: state.settings,
    site,
    siteId: state.siteId,
    sites: state.sites,
    query,
    go(hash) { location.hash = hash; },
    toast(msg, type) { ui.toast(msg, type); },
    setTitle(title) { setTitle(title, state.route.section); },
    refresh() { return renderPage(state.route, state.query); },
    every(ms, fn) {
      const t = setInterval(fn, ms);
      state.pageTimers.add(t);
      return () => { clearInterval(t); state.pageTimers.delete(t); };
    },
    subscribe(fn) {
      state.pageSubs.add(fn);
      return () => state.pageSubs.delete(fn);
    },
    confirm: ui.confirm,
    modal: ui.modal,
    drawer: ui.drawer,
  };
}

/* ---------------- 实时 ---------------- */
function connectLive() {
  if (live) live.close();
  live = createLive({
    onStatus(status) {
      state.wsState = status;
      updateGateway();
    },
    onEvent(evt) {
      if (!evt || !evt.type) return;
      if (evt.type === 'telemetry') {
        state.lastTelemetryAt = Date.now();
        updateLastUpdated();
        for (const fn of state.pageSubs) { try { fn(evt); } catch (e) { console.error(e); } }
      } else if (evt.type === 'hello') {
        state.wsState = 'online';
        updateGateway();
      } else {
        if (evt.type === 'alarm' && evt.action === 'created' && evt.data && ['critical', 'major'].includes(evt.data.level)) {
          ui.toast(`新告警：${evt.data.title}`, evt.data.level === 'critical' ? 'error' : 'info', 5000);
        }
        if (['alarm', 'workorder', 'command', 'param'].includes(evt.type)) refreshBadges();
        if (evt.type === 'notification') loadNotifications();
        for (const fn of state.pageSubs) { try { fn(evt); } catch (e) { console.error(e); } }
      }
    },
  });
}

function updateGateway() {
  const box = $('#gateway-state');
  if (!box) return;
  const online = state.wsState === 'online';
  box.classList.toggle('offline', !online);
  ui.clear(box);
  box.append(ui.dot(online ? 'good' : 'bad', online), ui.el('span', {}, online ? '模拟网关在线' : '网关连接中断'));
  const siteDot = $('#site-dot');
  if (siteDot) siteDot.className = `dot ${online ? 'good' : 'bad'}`;
}

function updateLastUpdated() {
  state.lastTelemetryAt = state.lastTelemetryAt || Date.now();
  const node = $('#last-updated-text');
  if (node) {
    const d = new Date(state.lastTelemetryAt);
    const text = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    node.title = `最近一次数据：${text}`;
  }
}

/* 顶栏时钟：每秒走一次；旁边圆点表示实时通道状态 */
let clockTimer = null;
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const node = $('#last-updated-text');
    if (!node) return;
    const d = new Date();
    const text = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    const online = state.wsState === 'online';
    node.textContent = `${online ? '实时' : '离线'} ${text}`;
    if (state.lastTelemetryAt) {
      const ago = Math.max(0, Math.round((Date.now() - state.lastTelemetryAt) / 1000));
      node.title = `最近一次数据 ${ago} 秒前`;
    }
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

/* ---------------- 徽标与通知 ---------------- */
async function refreshBadges() {
  try {
    const [alarmRes, woRes] = await Promise.all([
      api.getFull('/api/alarms', { siteId: state.siteId, status: 'open', pageSize: 1 }),
      api.getFull('/api/workorders', { siteId: state.siteId, status: 'open', pageSize: 1 }),
    ]);
    const ac = (alarmRes.meta && alarmRes.meta.counts) || {};
    const wc = (woRes.meta && woRes.meta.counts) || {};
    state.badges.alarms = Number(ac.active || 0) + Number(ac.acknowledged || 0);
    state.badges.workorders = Number(wc.open || 0);
    paintBadge('alarms', state.badges.alarms);
    paintBadge('workorders', state.badges.workorders);
  } catch { /* 忽略，保持旧值 */ }
}

function paintBadge(key, count) {
  const node = document.getElementById(`nav-badge-${key}`);
  if (!node) return;
  node.hidden = !count;
  node.textContent = count > 99 ? '99+' : String(count);
}

async function loadNotifications() {
  try {
    const res = await api.getFull('/api/notifications', { pageSize: 12 });
    const unread = (res.meta && res.meta.unread) || 0;
    const bell = $('#bell-count');
    if (bell) { bell.hidden = !unread; bell.textContent = unread > 99 ? '99+' : String(unread); }
    state.notifications = res.data || [];
    if (state.notifOpen) renderNotifPopover();
  } catch { /* ignore */ }
}

function renderNotifPopover() {
  const existing = document.getElementById('notif-popover');
  if (existing) existing.remove();
  if (!state.notifOpen) return;
  const items = state.notifications || [];
  const pop = ui.el('div', { class: 'popover', id: 'notif-popover' },
    ui.el('div', { class: 'popover-head' },
      ui.el('span', {}, '消息通知'),
      ui.el('span', { class: 'spacer' }),
      ui.el('button', { class: 'btn sm ghost', type: 'button', onclick: markAllRead }, '全部已读'),
    ),
    items.length
      ? ui.el('div', { class: 'popover-list' }, ...items.map((n) => ui.el('div', {
        class: `notif${n.read ? '' : ' unread'}`,
        onclick: async () => {
          if (!n.read) { await api.post('/api/notifications/read', { ids: [n.id] }).catch(() => {}); loadNotifications(); }
          if (n.link) location.hash = n.link;
          closeNotif();
        },
      },
      ui.el('span', { class: 'notif-dot', style: { opacity: n.read ? '.25' : '1' } }),
      ui.el('div', { class: 'notif-body' },
        ui.el('div', { class: 'notif-title' }, n.title || n.type || '通知'),
        n.text ? ui.el('div', { class: 'notif-text' }, n.text) : null,
        ui.el('div', { class: 'notif-time' }, ui.fmt.ago(n.at || n.createdAt)),
      ),
      )))
      : ui.empty('暂无通知', '告警、工单和审批动态会出现在这里', 'bell'),
  );
  document.getElementById('topbar').appendChild(pop);
  const scrim = ui.el('div', { style: { position: 'fixed', inset: '0', zIndex: '55' }, onclick: closeNotif });
  scrim.id = 'notif-scrim';
  document.body.appendChild(scrim);
}

function closeNotif() {
  state.notifOpen = false;
  const p = document.getElementById('notif-popover');
  if (p) p.remove();
  const s = document.getElementById('notif-scrim');
  if (s) s.remove();
}

async function markAllRead() {
  try {
    await api.post('/api/notifications/read', { all: true });
    await loadNotifications();
    renderNotifPopover();
  } catch (e) { ui.toast(e.message, 'error'); }
}

/* ---------------- 外壳交互 ---------------- */
let wired = false;
function wireShell() {
  if (wired) return;
  wired = true;

  window.addEventListener('hashchange', () => navigate());

  $('#site-select').addEventListener('change', (e) => {
    state.siteId = e.target.value;
    localStorage.setItem('zf.site', state.siteId);
    refreshBadges();
    renderPage(state.route, state.query);
  });

  $('#refresh-btn').addEventListener('click', async () => {
    const btn = $('#refresh-btn');
    btn.classList.add('spinning');
    try { await renderPage(state.route, state.query); } finally { setTimeout(() => btn.classList.remove('spinning'), 400); }
  });

  $('#bell-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.notifOpen) closeNotif();
    else { state.notifOpen = true; renderNotifPopover(); loadNotifications(); }
  });

  const chip = $('#user-chip');
  const menu = $('#user-menu');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== chip) menu.hidden = true;
    if (state.notifOpen && !e.target.closest('#notif-popover') && !e.target.closest('#bell-btn')) closeNotif();
  });

  $('#menu-password').addEventListener('click', () => { menu.hidden = true; openPasswordModal(); });
  $('#menu-logout').addEventListener('click', async () => {
    menu.hidden = true;
    const yes = await ui.confirm({ title: '退出登录', message: '退出后需要重新输入账号密码。', confirmText: '退出' });
    if (!yes) return;
    try { await api.logout(); } catch {}
    cleanupPage();
    if (live) { live.close(); live = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    state.user = null;
    location.hash = '';
    showLogin('已退出登录');
  });

  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  const scrim = document.getElementById('nav-scrim');
  if (scrim) scrim.addEventListener('click', () => document.body.classList.remove('nav-open'));

  unlisten = api.on((evt) => {
    if (evt.type === 'auth:required' && state.user) {
      if (live) { live.close(); live = null; }
      state.user = null;
      showLogin('登录已过期，请重新登录');
    }
  });
}

function openPasswordModal() {
  const oldInput = ui.input({ type: 'password', placeholder: '当前密码', autocomplete: 'current-password' });
  const newInput = ui.input({ type: 'password', placeholder: '新密码（至少 6 位）', autocomplete: 'new-password' });
  const err = ui.el('p', { class: 'error-text', hidden: true });
  const m = ui.modal({
    title: '修改密码',
    sub: '修改后当前会话保持有效。',
    body: ui.el('div', { class: 'stack' }, ui.field('当前密码', oldInput), ui.field('新密码', newInput), err),
    footer: ui.el('div', { class: 'row', style: { width: '100%' } },
      ui.el('span', { class: 'spacer' }),
      ui.el('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '取消'),
      ui.el('button', {
        class: 'btn primary', type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          err.hidden = true;
          if (!oldInput.value || !newInput.value) { err.textContent = '请填写完整'; err.hidden = false; return; }
          btn.disabled = true;
          try {
            await api.changePassword(oldInput.value, newInput.value);
            m.close();
            ui.toast('密码已修改', 'success');
          } catch (ex) {
            err.textContent = ex.message; err.hidden = false;
          } finally { btn.disabled = false; }
        },
      }, '保存'),
    ),
  });
}

/* ---------------- 启动 ---------------- */
window.addEventListener('beforeunload', () => { if (live) live.close(); if (unlisten) unlisten(); clearInterval(notifTimer); clearInterval(badgeTimer); });
boot();
