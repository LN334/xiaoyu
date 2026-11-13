'use strict';
/** 极简 HTTP / 静态资源 / WebSocket（零依赖，仅用于本机演示）。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:[A-Za-z0-9_]+/g, (m) => {
      keys.push(m.slice(1));
      return '([^/]+)';
    }).replace(/\*/g, '.*') + '$');
    this.routes.push({ method, re, keys, handler });
  }

  get(p, h) { this.add('GET', p, h); }
  post(p, h) { this.add('POST', p, h); }
  patch(p, h) { this.add('PATCH', p, h); }
  put(p, h) { this.add('PUT', p, h); }
  del(p, h) { this.add('DELETE', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

function sendJSON(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('请求体过大'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = req.headers['content-type'] || '';
      if (type.includes('application/json')) {
        try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON 格式错误'), { status: 400 })); }
      } else if (type.includes('application/x-www-form-urlencoded')) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      } else {
        resolve({ raw });
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 静态文件；未命中时回退 index.html（前端 hash 路由） */
function serveStatic(webRoot) {
  return (req, res, pathname) => {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const full = path.normalize(path.join(webRoot, rel));
    if (!full.startsWith(path.normalize(webRoot))) { sendText(res, 403, 'Forbidden'); return true; }
    let file = full;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      file = path.join(webRoot, 'index.html');
      if (!fs.existsSync(file)) return false;
    }
    const ext = path.extname(file).toLowerCase();
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache',
    });
    res.end(body);
    return true;
  };
}

/** ---------- WebSocket ---------- */
function wsAccept(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function encodeFrame(payload, opcode = 1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const len = data.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, data]);
}

class WSHub {
  constructor() { this.clients = new Set(); }

  attach(server, { authenticate, siteScope = null, pathName = '/ws' }) {
    server.on('upgrade', (req, socket) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== pathName) { socket.destroy(); return; }
        const user = authenticate(req);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        socket.write([
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${wsAccept(key)}`,
          '\r\n',
        ].join('\r\n'));
        socket.setNoDelay(true);
        const client = { socket, user, alive: true, siteScope: siteScope ? siteScope(user) : null };
        this.clients.add(client);
        socket.on('data', (buf) => this.onClientData(client, buf));
        socket.on('close', () => this.clients.delete(client));
        socket.on('error', () => this.clients.delete(client));
        this.send(client, { type: 'hello', t: Date.now(), message: '实时通道已连接' });
        setTimeout(() => { try { socket.destroy(); this.clients.delete(client); } catch { /* noop */ } }, 12 * 3600 * 1000).unref?.();
      } catch {
        try { socket.destroy(); } catch { /* noop */ }
      }
    });
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) { try { c.socket.destroy(); } catch { /* noop */ } this.clients.delete(c); continue; }
        c.alive = false;
        try { c.socket.write(encodeFrame('', 9)); } catch { /* noop */ }
      }
    }, 30000);
    if (this.heartbeat.unref) this.heartbeat.unref();
  }

  onClientData(client, buf) {
    // 只处理 ping/pong/close 与文本；业务命令一律走 REST
    try {
      let offset = 0;
      while (offset + 2 <= buf.length) {
        const opcode = buf[offset] & 0x0f;
        const masked = (buf[offset + 1] & 0x80) !== 0;
        let len = buf[offset + 1] & 0x7f;
        let p = offset + 2;
        if (len === 126) { len = buf.readUInt16BE(p); p += 2; }
        else if (len === 127) { len = Number(buf.readBigUInt64BE(p)); p += 8; }
        if (masked) p += 4;
        const end = p + len;
        if (end > buf.length) break;
        if (opcode === 8) { try { client.socket.end(encodeFrame('', 8)); } catch { /* noop */ } this.clients.delete(client); return; }
        if (opcode === 9) { try { client.socket.write(encodeFrame(buf.slice(p, end), 10)); } catch { /* noop */ } }
        if (opcode === 10) client.alive = true;
        offset = end;
      }
    } catch { /* 忽略无效帧 */ }
  }

  send(client, obj) {
    try { client.socket.write(encodeFrame(JSON.stringify(obj), 1)); } catch { this.clients.delete(client); }
  }

  broadcast(obj) {
    for (const c of this.clients) {
      let visible = obj;
      if (Array.isArray(obj.updates) && obj.updates.some(item => item.siteId)) {
        if (Array.isArray(c.siteScope)) {
          const updates = obj.updates.filter(item => c.siteScope.includes(item.siteId));
          if (!updates.length) continue;
          visible = { ...obj, updates };
        }
      } else {
        const siteId = obj.siteId || (obj.data && obj.data.siteId);
        if (siteId && Array.isArray(c.siteScope) && !c.siteScope.includes(siteId)) continue;
      }
      try { c.socket.write(encodeFrame(JSON.stringify(visible), 1)); } catch { this.clients.delete(c); }
    }
  }

  broadcastScoped(obj, siteId) {
    const text = JSON.stringify(obj);
    for (const c of this.clients) {
      if (siteId && c.siteScope && !c.siteScope.includes(siteId)) continue;
      try { c.socket.write(encodeFrame(text, 1)); } catch { this.clients.delete(c); }
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) { try { c.socket.end(); } catch { /* noop */ } }
    this.clients.clear();
  }
}

module.exports = { Router, sendJSON, sendText, readBody, parseCookies, serveStatic, WSHub };
