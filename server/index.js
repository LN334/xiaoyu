'use strict';
/**
 * 小禹 · 村镇水处理站智能运维平台 —— 服务入口。
 * 零第三方依赖：Node 内置 http + 静态资源 + WebSocket + JSON 文件存储 + 内置模拟网关。
 *
 * 用法：
 *   node server/index.js                     默认 http://127.0.0.1:8765
 *   node server/index.js --port 9000 --data data-demo
 *   node server/index.js --reset             丢弃本地数据，按种子重建演示库
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { Telemetry } = require('./telemetry');
const { Simulator } = require('./sim');
const { RulesEngine } = require('./rules');
const { CommandEngine } = require('./commands');
const { Notifier } = require('./notify');
const { Diagnosis } = require('./diagnosis');
const { Auth } = require('./auth');
const { buildSeed } = require('./seed');
const { Router, sendJSON, sendText, readBody, serveStatic, WSHub } = require('./http');
const { ApiError, fail } = require('./api/common');
const { iso } = require('./util');

/* ---------------- 命令行参数 ---------------- */
function parseArgs(argv) {
  const out = { port: 8765, host: '127.0.0.1', data: 'data', reset: false, quiet: false, simulation: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') out.port = Number(argv[++i]);
    else if (a === '--host') out.host = argv[++i];
    else if (a === '--data' || a === '-d') out.data = argv[++i];
    else if (a === '--reset') out.reset = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--no-sim') out.simulation = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (/^\d+$/.test(a)) out.port = Number(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`小禹 · 村镇水处理站智能运维平台

用法: node server/index.js [选项]
  --port, -p <端口>   监听端口（默认 8765）
  --host <地址>       监听地址（默认 127.0.0.1）
  --data, -d <目录>   数据目录（默认 data）
  --reset             清空本地数据并按种子重建演示库
  --no-sim             关闭模拟网关，使用真实网关接入模式
  --quiet             减少日志输出
  --help, -h          显示帮助
`);
  process.exit(0);
}
if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
  console.error('端口不合法：', args.port);
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.isAbsolute(args.data) ? args.data : path.join(ROOT, args.data);
const WEB_ROOT = path.join(ROOT, 'web');
const RELEASE_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').replace(/^\uFEFF/, '')
).version;

const logger = {
  info: (...a) => { if (!args.quiet) console.log(`[${iso().slice(11, 19)}]`, ...a); },
  warn: (...a) => console.warn(`[${iso().slice(11, 19)}]`, ...a),
  error: (...a) => console.error(`[${iso().slice(11, 19)}]`, ...a),
};

/* ---------------- 装配 ---------------- */
const store = new Store(DATA_DIR);
store.load(() => buildSeed(Date.now()), { reset: args.reset });
const telemetry = new Telemetry({ journalPath: path.join(DATA_DIR, 'telemetry.jsonl') });
const hub = new WSHub();

const app = {
  dataDir: DATA_DIR,
  store,
  telemetry,
  hub,
  log: logger,
  version: RELEASE_VERSION,
  simulationEnabled: args.simulation,
};
Object.defineProperty(app, 'db', { get: () => store.data, enumerable: true });

const publish = (evt) => {
  try { hub.broadcast({ ...evt, t: evt.t || Date.now() }); } catch (e) { /* 广播失败不影响业务 */ }
};
app.publish = publish;

const notifier = new Notifier(store, publish);
const sim = new Simulator({ store, telemetry, log: logger });
const commands = new CommandEngine({ store, sim, notifier, publish, logger });
const rules = new RulesEngine({ store, telemetry, sim, notifier, publish, logger });
const diagnosis = new Diagnosis({ store, telemetry });
const auth = new Auth(store);

Object.assign(app, { notifier, sim, commands, rules, diagnosis, auth });

function loadGatewayConfig() {
  const raw = process.env.XIAOYU_GATEWAYS_JSON;
  if (!raw) return new Map();
  let entries;
  try { entries = JSON.parse(raw); } catch (error) {
    logger.warn(`[ingest] XIAOYU_GATEWAYS_JSON 无法解析：${error.message}`);
    return new Map();
  }
  const list = Array.isArray(entries) ? entries : Object.entries(entries || {}).map(([id, value]) => ({ id, ...value }));
  const out = new Map();
  for (const item of list) {
    if (!item || !/^[A-Za-z0-9._-]{2,80}$/.test(String(item.id || '')) || typeof item.token !== 'string' || item.token.length < 32) continue;
    if (!store.data.sites.some(site => site.id === item.siteId)) {
      logger.warn(`[ingest] 网关 ${item.id} 配置了不存在的站点，已忽略`);
      continue;
    }
    out.set(item.id, { siteId: item.siteId, token: item.token });
  }
  return out;
}
app.gatewayConfig = loadGatewayConfig();
app.ingestEventIds = new Map();
if (!args.simulation) {
  const restored = telemetry.restore();
  logger.info(`[ingest] 真实网关模式；已恢复 ${restored} 条遥测历史，配置 ${app.gatewayConfig.size} 个网关`);
}

/** 从备份恢复：替换整个业务库，并让所有登录会话失效（备份里的会话可能已过期）。 */
app.restoreDb = (payload) => {
  const settings = store.data.settings;
  store.data = payload;
  store.data.settings = { ...settings, ...(payload.settings || {}) };
  store.data.sessions = [];
  store.migrate();
  store.save(true);
  publish({ type: 'system', action: 'db.restored', data: { at: iso() } });
};

sim.on((evt) => {
  if (evt.type === 'telemetry') publish({ type: 'telemetry', updates: evt.updates, t: evt.t });
});

/* ---------------- 路由 ---------------- */
const router = new Router();
for (const mod of ['./api/auth', './api/overview', './api/alarms', './api/control', './api/ops', './api/analysis', './api/ingest']) {
  require(mod).register(router, app);
}

function buildCtx(req, res, url, params, body) {
  const ctx = {
    req, res, url,
    method: req.method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    params: params || {},
    body: body || {},
    store,
    telemetry,
    sim,
    commands,
    rules,
    notifier,
    diagnosis,
    auth,
    app,
    user: null,
  };
  Object.defineProperty(ctx, 'db', { get: () => store.data, enumerable: true });
  return ctx;
}

const staticServe = serveStatic(WEB_ROOT);

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // 静态资源与前端入口（非 /api）
  if (!pathname.startsWith('/api')) {
    if (staticServe(req, res, pathname)) return;
    sendText(res, 404, '未找到页面。请确认 web/ 目录完整，或使用 npm start 启动。', 'text/plain; charset=utf-8');
    return;
  }

  if (pathname === '/api/ping') {
    sendJSON(res, 200, { ok: true, data: { pong: true, at: iso(), version: app.version } });
    return;
  }

  const match = router.match(req.method, pathname);
  if (!match) {
    sendJSON(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `接口不存在：${req.method} ${pathname}` } });
    return;
  }
  if (match.methodNotAllowed) {
    sendJSON(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: `该接口不支持 ${req.method} 方法` } });
    return;
  }

  if (!app.simulationEnabled && (
    pathname === '/api/actions'
    || (/^\/api\/commands(?:\/|$)/.test(pathname) && req.method !== 'GET')
    || (/^\/api\/params\/[^/]+\/(?:change|rollback)$/.test(pathname) && req.method === 'POST')
    || (/^\/api\/param-requests\/[^/]+\/(?:approve|reject)$/.test(pathname) && req.method === 'POST')
  )) {
    sendJSON(res, 403, { ok: false, error: { code: 'SIMULATION_DISABLED', message: '当前为真实数据接入模式，平台不提供云端设备控制或参数下发。' } });
    return;
  }

  let body = {};
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      body = await readBody(req);
    } catch (e) {
      sendJSON(res, e.status || 400, { ok: false, error: { code: 'BAD_BODY', message: e.message || '请求体解析失败' } });
      return;
    }
  }

  const ctx = buildCtx(req, res, url, match.params, body);
  ctx.user = auth.fromRequest(req);
  try {
    await match.handler(ctx);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch { /* noop */ } return; }
    if (e instanceof ApiError) {
      fail(res, e.status, e.message, e.code || 'ERROR', e.details);
    } else if (e && e.status) {
      fail(res, e.status, e.message || '请求处理失败', e.code || 'ERROR');
    } else {
      logger.error('请求处理异常', req.method, pathname, e && e.stack ? e.stack : e);
      fail(res, 500, '服务器内部错误，请查看服务端日志', 'INTERNAL');
    }
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((e) => {
    logger.error('未捕获异常', e);
    try { sendText(res, 500, '服务器内部错误'); } catch { /* noop */ }
  });
});

hub.attach(server, {
  pathName: '/ws',
  authenticate: (req) => auth.fromRequest(req),
  siteScope: (user) => auth.siteScope(user),
});

/* ---------------- 启停 ---------------- */
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('正在停止服务…');
  try { sim.stop(); } catch { /* noop */ }
  try { rules.stop && rules.stop(); } catch { /* noop */ }
  try { hub.close(); } catch { /* noop */ }
  try { store.stop(); } catch { /* noop */ }
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (e) => { logger.error('uncaughtException', e); });
process.on('unhandledRejection', (e) => { logger.error('unhandledRejection', e); });

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n端口 ${args.port} 已被占用。请换一个端口：node server/index.js --port ${args.port + 1}\n`);
  } else if (e.code === 'EACCES') {
    console.error(`\n没有权限监听端口 ${args.port}，请换一个大于 1024 的端口。\n`);
  } else {
    console.error('服务启动失败：', e.message);
  }
  process.exit(1);
});

if (!fs.existsSync(path.join(WEB_ROOT, 'index.html'))) {
  logger.warn('尚未找到 web/index.html，接口可用但页面会返回 404。');
}

if (args.simulation) sim.start();
rules.start();
commands.recover();
auth.cleanupSessions();

server.listen(args.port, args.host, () => {
  const url = `http://${args.host === '0.0.0.0' ? '127.0.0.1' : args.host}:${args.port}`;
  const users = store.data.users.filter(u => u.status === 'active');
  const accounts = users.map(u => `${u.username}（${u.name}·${(store.data.roles[u.role] || {}).name || u.role}）`).join('、');
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log(`  ║   小禹 · 村镇水处理站智能运维平台   V2.2 ${args.simulation ? '模拟演示模式' : '网关接入模式'}        ║`);
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log(`   访问地址   ${url}`);
  console.log(`   数据目录   ${DATA_DIR}`);
  console.log(`   演示口令   water123`);
  console.log(`   可用账号   ${accounts}`);
  console.log('');
  console.log(args.simulation
    ? '   提示：演示数据由内置模拟网关生成；按 Ctrl+C 停止服务。'
    : '   提示：模拟网关已关闭，等待已配置的现场网关只读上报；按 Ctrl+C 停止服务。');
  console.log('');
});
