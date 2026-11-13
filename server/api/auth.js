'use strict';
const { ok, fail, ApiError, requireAuth, audit } = require('./common');
const { demoPassword } = require('../seed/assets');

const COOKIE = 'zfs_session';
const MAX_AGE = 12 * 3600;

function cookieHeader(token, maxAge = MAX_AGE) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function register(router, app) {
  router.post('/api/auth/login', async (ctx) => {
    const { username, password } = ctx.body || {};
    if (!username || !password) throw new ApiError(400, '请输入账号与密码', 'BAD_REQUEST');
    const r = app.auth.login(username, password, { ip: ctx.ip, agent: ctx.req.headers['user-agent'] });
    if (r.error) {
      audit(ctx, { actor: null, action: 'user.login.fail', targetType: 'user', targetId: String(username), detail: '登录失败：' + r.error.message, result: 'fail' });
      throw new ApiError(r.error.status, r.error.message, r.error.code);
    }
    ctx.res.setHeader('Set-Cookie', cookieHeader(r.token));
    audit(ctx, { actor: r.user, action: 'user.login', targetType: 'user', targetId: r.user.id, detail: `${r.user.name} 登录平台`, result: 'success' });
    ok(ctx.res, { token: r.token, user: r.user, expiresIn: MAX_AGE });
  });

  router.post('/api/auth/logout', async (ctx) => {
    const raw = app.auth.rawToken(ctx.req);
    if (raw) app.auth.logout(raw);
    ctx.res.setHeader('Set-Cookie', cookieHeader('', 0));
    ok(ctx.res, { loggedOut: true });
  });

  router.get('/api/auth/me', async (ctx) => {
    if (!ctx.user) {
      ok(ctx.res, { user: null, demo: null, settings: null, version: app.version });
      return;
    }
    ok(ctx.res, {
      user: app.auth.sanitize(ctx.user),
      version: app.version,
      demo: { password: demoPassword, accounts: ctx.db.users.map(u => ({ username: u.username, name: u.name, role: u.role, title: u.title })) },
      settings: { platformName: ctx.db.settings.platformName, shortName: ctx.db.settings.shortName, notice: ctx.db.settings.notice, demoMode: ctx.db.settings.demoMode, simulationEnabled: app.simulationEnabled, version: ctx.db.settings.version, docVersion: ctx.db.settings.docVersion, autoRefreshSec: ctx.db.settings.autoRefreshSec },
    });
  });

  router.post('/api/auth/password', async (ctx) => {
    const user = requireAuth(ctx);
    const { oldPassword, newPassword } = ctx.body || {};
    if (!oldPassword || !newPassword) throw new ApiError(400, '请填写原密码与新密码', 'BAD_REQUEST');
    if (String(newPassword).length < 6) throw new ApiError(400, '新密码至少 6 位', 'WEAK_PASSWORD');
    const { verifyPassword, hashPassword } = require('../util');
    if (!verifyPassword(oldPassword, user.password)) throw new ApiError(400, '原密码不正确', 'BAD_OLD_PASSWORD');
    const before = user.password;
    user.password = hashPassword(newPassword);
    ctx.store.saveSoon();
    audit(ctx, { actor: user, action: 'user.password', targetType: 'user', targetId: user.id, detail: '修改本人登录密码', before: '***', after: '***' });
    ok(ctx.res, { changed: true });
  });

  router.delete('/api/auth/sessions', async (ctx) => {
    const user = requireAuth(ctx);
    const raw = app.auth.rawToken(ctx.req);
    const h = require('crypto').createHash('sha256').update(raw || '').digest('hex');
    ctx.db.sessions = ctx.db.sessions.filter(s => s.userId !== user.id || s.tokenHash === h);
    ctx.store.saveSoon();
    audit(ctx, { actor: user, action: 'user.session.revoke', targetType: 'user', targetId: user.id, detail: '注销其他登录会话' });
    ok(ctx.res, { kept: 1 });
  });
}

module.exports = { register, COOKIE };
