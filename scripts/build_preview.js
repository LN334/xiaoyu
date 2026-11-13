#!/usr/bin/env node
/**
 * 构建离线静态预览：把 web/index.html + CSS + ES 模块打成一个自包含 HTML，
 * 用真实接口快照（_preview/fixtures.json）替换 fetch/WebSocket，便于在
 * 无本地回环访问权限的宿主 Chrome 中做视觉核验。
 * 用法：node scripts/build_preview.js [--page=dashboard ...] [--login]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, '_preview');
const FIXTURES = path.join(OUT, 'fixtures.json');

const fixtureText = fs.readFileSync(FIXTURES, 'utf8');
const fixtures = JSON.parse(fixtureText);

/* ---------------- 极简 ES 模块打包 ---------------- */

const MODULES = ['api.js', 'ui.js', 'app.js'];
const pagesDir = path.join(WEB, 'js', 'pages');
for (const f of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.js'))) MODULES.push(`pages/${f}`);

function resolveId(fromId, spec) {
  if (!spec.startsWith('.')) return spec;
  if (fromId.startsWith('pages/')) {
    // pages 目录里的模块：../ui.js -> ui.js，./x.js -> pages/x.js
    const cleaned = spec.replace(/^\.\.\//, '').replace(/^\.\//, '');
    return spec.startsWith('../') ? cleaned : `pages/${cleaned}`;
  }
  const cleaned = spec.replace(/^\.\//, '');
  return cleaned;
}

function normId(id) {
  let s = String(id).replace(/^\.\//, '');
  if (!/\.js$/.test(s)) s += '.js';
  return s;
}

function transformModule(src, id) {
  const exported = new Set();
  let out = src;

  // import * as ns from '...'
  out = out.replace(/import\s*\*\s*as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (m, name, spec) => `const ${name} = __req(${JSON.stringify(resolveId(id, spec))});`);
  // import { a, b as c } from '...'
  out = out.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g, (m, names, spec) => {
    const mapped = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const parts = s.split(/\s+as\s+/);
      return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
    }).join(', ');
    return `const { ${mapped} } = __req(${JSON.stringify(resolveId(id, spec))});`;
  });
  // import def from '...'
  out = out.replace(/import\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (m, name, spec) => `const ${name} = __req(${JSON.stringify(resolveId(id, spec))}).default;`);
  // 副作用 import
  out = out.replace(/import\s*['"]([^'"]+)['"]\s*;?/g, '');

  // export 声明
  out = out.replace(/export\s+(async\s+function|function|const|let|var|class)\s+([\w$]+)/g, (m, kw, name) => {
    exported.add(name);
    return `${kw} ${name}`;
  });
  // export { a, b as c }
  out = out.replace(/export\s*\{([\s\S]*?)\}\s*;?/g, (m, names) => {
    const lines = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const parts = s.split(/\s+as\s+/);
      const local = parts[0].trim();
      const remote = (parts[1] || parts[0]).trim();
      exported.add(remote);
      return `exports.${remote} = ${local};`;
    });
    return lines.join(' ');
  });
  // export default
  out = out.replace(/export\s+default\s+/g, 'exports.default = ');

  // 动态 import
  out = out.replace(/\bimport\(/g, '__reqAsync(');

  const tail = exported.size ? `\nObject.assign(exports, { ${[...exported].join(', ')} });\n` : '';
  return out + tail;
}

const defs = [];
for (const id of MODULES) {
  const file = path.join(WEB, 'js', id);
  if (!fs.existsSync(file)) { console.warn('缺少模块', id); continue; }
  const src = fs.readFileSync(file, 'utf8');
  defs.push(`__defs[${JSON.stringify(id)}] = function (exports) {\n${transformModule(src, id)}\n};`);
}

const bundle = `(function () {
'use strict';
var __defs = {}, __cache = {};
function __norm(id) { id = String(id).replace(/^\\.\\//, ''); if (!/\\.js$/.test(id)) id += '.js'; return id; }
function __req(id) {
  id = __norm(id);
  if (__cache[id]) return __cache[id];
  var exp = {};
  __cache[id] = exp;
  if (!__defs[id]) throw new Error('module not found: ' + id);
  __defs[id](exp);
  return exp;
}
function __reqAsync(id) { try { return Promise.resolve(__req(id)); } catch (e) { return Promise.reject(e); } }
${defs.join('\n')}
try { __req('app.js'); } catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="color:#b32d22;padding:20px;font:12px monospace">预览启动失败: ' + (e && e.message) + '</pre>'); }
})();`;

/* ---------------- CSS 内联 ---------------- */

const cssFiles = ['app.css', 'pages-dash.css', 'pages-control.css', 'pages-data.css', 'pages-ops.css', 'theme.css'];
let css = '';
for (const f of cssFiles) {
  const p = path.join(WEB, 'css', f);
  if (fs.existsSync(p)) css += `\n/* ${f} */\n` + fs.readFileSync(p, 'utf8');
}

/* ---------------- 模拟环境 ---------------- */

const mockScript = `(function () {
  var FIXTURES = JSON.parse(document.getElementById('zf-fixtures').textContent);
  var byPath = {};
  Object.keys(FIXTURES).forEach(function (k) {
    var i = k.indexOf(' '); var m = k.slice(0, i); var u = k.slice(i + 1);
    try { var p = new URL(u, 'http://local'); var key = m + ' ' + p.pathname; if (!byPath[key]) byPath[key] = k; } catch (e) {}
  });
  function normKey(method, url) {
    var u = new URL(url, 'http://local');
    var pairs = [];
    u.searchParams.forEach(function (v, k) { pairs.push([k, v]); });
    pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    var qs = pairs.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]); }).join('&');
    return method + ' ' + u.pathname + (qs ? '?' + qs : '');
  }
  // 抓取脚本按原始参数顺序存 key，这里统一规范化一份，保证「参数相同、顺序不同」也能精确命中
  Object.keys(FIXTURES).slice().forEach(function (k) {
    var i = k.indexOf(' ');
    if (i < 0) return;
    try {
      var nk = normKey(k.slice(0, i), k.slice(i + 1));
      if (nk !== k && !FIXTURES[nk]) FIXTURES[nk] = FIXTURES[k];
    } catch (e) {}
  });
  window.__previewFetches = [];
  window.__previewMissing = [];
  window.__previewFallback = [];
  // 同路径回退时按常见查询参数做最小过滤，避免把未筛选列表当成筛选结果（曾导致水质曲线串点）
  function applyFilter(payload, u) {
    if (!payload || payload.ok !== true) return payload;
    var p = payload.data;
    var qp = u.searchParams;
    function listFilter(arr) {
      var out = arr;
      if (qp.get('status') === 'open') {
        out = out.filter(function (x) {
          if (!x || !x.status) return true;
          if (x.pointCode || x.level) return x.status === 'active' || x.status === 'acknowledged';
          return ['pending', 'accepted', 'processing', 'done'].indexOf(x.status) >= 0;
        });
      }
      var sp = qp.get('samplePoint');
      if (sp) out = out.filter(function (x) { return x && x.samplePoint === sp; });
      if (qp.get('unread') === '1') out = out.filter(function (x) { return x && !x.read; });
      var assignee = qp.get('assignee');
      if (assignee === 'me') out = out.filter(function (x) { return x && x.mine; });
      var ps = parseInt(qp.get('pageSize'), 10);
      if (ps > 0 && out.length > ps) out = out.slice(0, ps);
      return out;
    }
    if (Array.isArray(p)) return { ok: true, data: listFilter(p), meta: payload.meta };
    if (p && Array.isArray(p.items)) {
      return { ok: true, data: Object.assign({}, p, { items: listFilter(p.items) }), meta: payload.meta };
    }
    if (p && p.series && qp.get('codes')) {
      var keep = qp.get('codes').split(',').map(function (s) { return s.trim(); });
      var series = {};
      keep.forEach(function (c) { if (p.series[c]) series[c] = p.series[c]; });
      return { ok: true, data: Object.assign({}, p, { series: series }), meta: payload.meta };
    }
    return payload;
  }
  window.fetch = function (url, init) {
    init = init || {};
    var method = (init.method || 'GET').toUpperCase();
    var u = new URL(url, 'http://local');
    var k = normKey(method, url);
    var payload = FIXTURES[k];
    if (!payload) {
      var fb = byPath[method + ' ' + u.pathname];
      if (fb) { payload = applyFilter(FIXTURES[fb], u); window.__previewFallback.push(k + ' <- ' + fb); }
    }
    if (!payload) { window.__previewMissing.push(k); payload = { ok: true, data: null }; }
    window.__previewFetches.push(k);
    var body = JSON.stringify(payload);
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: function (n) { var s = String(n).toLowerCase(); if (s === 'content-type') return 'application/json; charset=utf-8'; return null; } },
      json: function () { return Promise.resolve(payload); },
      text: function () { return Promise.resolve(body); },
      blob: function () { return Promise.resolve(new Blob([body], { type: 'application/json' })); }
    });
  };
  function WS(url) {
    var self = this;
    this.url = url; this.readyState = 0; this.listeners = {};
    this.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
    this.removeEventListener = function () {};
    this.send = function () {};
    this.close = function () { this.readyState = 3; };
    setTimeout(function () {
      self.readyState = 1;
      (self.listeners.open || []).forEach(function (f) { f({}); });
      var evt = { data: JSON.stringify({ type: 'hello', at: new Date().toISOString() }) };
      (self.listeners.message || []).forEach(function (f) { f(evt); });
    }, 30);
  }
  window.WebSocket = WS;
  try { window.localStorage.getItem('__probe__'); } catch (e) {
    var store = {};
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: function (k) { return k in store ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    } });
  }
  var patched = false;
  try {
    var d = Object.getOwnPropertyDescriptor(History.prototype, 'replaceState');
    if (d) {
      History.prototype.replaceState = function (a, b, c) { try { return d.value.call(this, a, b, c); } catch (e) { return undefined; } };
      patched = true;
    }
  } catch (e) {}
  window.__previewInfo = { patched: patched };
})();`;

/* ---------------- 组装 HTML ---------------- */

const indexHtml = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');

function buildHtml({ hash = '#/dashboard', fixturesOverride = null } = {}) {
  let html = indexHtml;
  // 去掉外链 CSS，注入内联样式
  html = html.replace(/[ \t]*<link rel="stylesheet"[^>]*>\s*/g, '');
  html = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
  // 去掉外链入口脚本
  html = html.replace(/[ \t]*<script type="module" src="[^"]*"><\/script>\s*/g, '');
  // 注入 fixture JSON、模拟环境、hash 预设、bundle
  const fixtureForPage = fixturesOverride ? JSON.stringify(fixturesOverride) : fixtureText;
  const inject = `
<script id="zf-fixtures" type="application/json">${fixtureForPage.replace(/<\/script>/gi, '<\\/script>')}</script>
<script>${mockScript}</script>
<script>
window.__previewErrors = [];
function __showErr(kind, msg, stack) {
  window.__previewErrors.push(kind + ': ' + msg);
  try {
    var box = document.getElementById('zf-error-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'zf-error-box';
      box.style.cssText = 'position:fixed;left:0;bottom:0;right:0;max-height:45%;overflow:auto;z-index:99999;background:#2a0d0a;color:#ffd7d2;font:11px/1.5 monospace;padding:10px 14px;white-space:pre-wrap;border-top:2px solid #b32d22';
      document.body.appendChild(box);
    }
    box.textContent += '[' + kind + '] ' + msg + (stack ? '\\n' + stack : '') + '\\n';
  } catch (e) {}
}
window.addEventListener('error', function (e) { __showErr('error', e.message, e.error && e.error.stack); });
window.addEventListener('unhandledrejection', function (e) { var r = e.reason; __showErr('reject', r && r.message ? r.message : String(r), r && r.stack); });
setTimeout(function () {
  try {
    var fb = window.__previewFallback || [];
    if (!fb.length) return;
    var b = document.createElement('div');
    b.id = 'zf-fixture-warn';
    b.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99998;background:rgba(14,34,48,.72);color:#fff;font:11px/1.4 monospace;padding:4px 8px;border-radius:4px;max-width:460px';
    b.textContent = '预览夹具回退 ' + fb.length + ' 项';
    b.title = fb.join('\\n');
    document.body.appendChild(b);
  } catch (e) {}
}, 1200);
</script>
<script>try { location.hash = ${JSON.stringify(hash)}; } catch (e) {}</script>
<script>${bundle}</script>
`;
  html = html.replace('</body>', `${inject}</body>`);
  return html;
}

fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
const routes = [
  'dashboard', 'process', 'monitor', 'alarms', 'control', 'params', 'quality',
  'diagnosis', 'analysis', 'reports', 'workorders', 'inspections', 'devices', 'admin', 'mobile',
];
let n = 0;
for (const id of routes) {
  const file = path.join(OUT, 'pages', `${id}.html`);
  fs.writeFileSync(file, buildHtml({ hash: `#/${id}` }), 'utf8');
  n += 1;
}

// 登录页：把 /api/auth/me 改成未登录响应
const loginFixtures = { ...fixtures };
loginFixtures['GET /api/auth/me'] = {
  ok: true,
  data: {
    user: null,
    demo: { password: 'water123', accounts: [
      { username: 'admin', name: '陈立群', role: 'super', title: '平台超级管理员' },
      { username: 'wang', name: '王工', role: 'process', title: '工艺负责人' },
      { username: 'zhao', name: '赵值班', role: 'operator', title: '运维值班人员' },
    ] },
    settings: null,
  },
};
fs.writeFileSync(path.join(OUT, 'login.html'), buildHtml({ hash: '', fixturesOverride: loginFixtures }), 'utf8');

console.log(`preview pages: ${n} + login.html -> ${path.join(OUT, 'pages')}`);
