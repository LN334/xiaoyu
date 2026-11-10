'use strict';
/**
 * 远程控制命令状态机（方案第 6.3 节）：
 * 待确认 → 待下发 → 已下发 → 执行中 → 成功 / 失败 / 超时 / 取消
 * 高风险动作强制二次确认；每次状态迁移写入时间线与审计日志。
 */
const { iso } = require('./util');
const { nextCode } = require('./codes');
const { writeAudit } = require('./audit');

const ACTIONS = {
  'raw.pump.start': { label: '启动原料罐提升泵', deviceKey: 'raw-pump', risk: 'medium', execMs: 1600, effect: '提升泵启动' },
  'raw.pump.stop': { label: '停止原料罐提升泵', deviceKey: 'raw-pump', risk: 'medium', execMs: 1200, effect: '提升泵停止' },
  'raw.pump.mode.set': { label: '切换提升泵运行模式', deviceKey: 'raw-pump', risk: 'high', execMs: 1000, effect: '运行模式切换' },
  'baf.blower.start': { label: '启动 BAF 曝气风机', deviceKey: 'baf-blower', risk: 'medium', execMs: 1500, effect: '曝气风机启动' },
  'baf.blower.stop': { label: '停止 BAF 曝气风机', deviceKey: 'baf-blower', risk: 'high', execMs: 1500, effect: '曝气风机停止' },
  'baf.backwash.start': { label: '启动 BAF 反冲洗', deviceKey: 'baf-bw-pump', risk: 'high', execMs: 2500, effect: 'BAF 反冲洗启动' },
  'sulfur.backwash.start': { label: '启动硫自养池反冲洗', deviceKey: 'sulfur-bw-pump', risk: 'high', execMs: 2500, effect: '硫自养池反冲洗启动' },
  'baf.backwash.stop': { label: '停止 BAF 反冲洗', deviceKey: 'baf-bw-pump', risk: 'medium', execMs: 1200, effect: 'BAF 反冲洗停止' },
  'sulfur.backwash.stop': { label: '停止硫自养池反冲洗', deviceKey: 'sulfur-bw-pump', risk: 'medium', execMs: 1200, effect: '硫自养池反冲洗停止' },
  'pac.dose.set': { label: '调整 PAC 投加量', deviceKey: 'pac-pump', risk: 'medium', execMs: 1200, effect: 'PAC 投加量调整' },
  'pam.dose.set': { label: '调整 PAM 投加量', deviceKey: 'pam-pump', risk: 'medium', execMs: 1200, effect: 'PAM 投加量调整' },
};

const STATUS_NAME = {
  pending_confirm: '待确认', pending_dispatch: '待下发', sent: '已下发',
  executing: '执行中', success: '成功', failed: '失败', timeout: '超时', cancelled: '取消',
};

class CommandEngine {
  constructor({ store, sim, notifier, publish = () => {}, logger = console }) {
    this.store = store;
    this.sim = sim;
    this.notifier = notifier;
    this.publish = publish;
    this.logger = logger;
    this.timers = new Map();
  }

  get db() { return this.store.data; }

  target(siteId, action) {
    const meta = ACTIONS[action];
    if (!meta) return null;
    return this.db.devices.find(d => d.siteId === siteId && d.key === meta.deviceKey) || null;
  }

  create(user, { siteId, action, args = {}, reason = '', ip = '' }) {
    const meta = ACTIONS[action];
    if (!meta) return { error: { status: 400, message: '不支持的控制动作' } };
    const site = this.db.sites.find(s => s.id === siteId);
    if (!site) return { error: { status: 404, message: '站点不存在' } };
    const device = this.target(siteId, action);
    const pre = this.sim.precheck(siteId, action, args);

    const cmd = {
      id: nextCode(this.db, 'commands', 'CMD'),
      siteId,
      action,
      actionLabel: meta.label,
      targetName: device ? `${device.name}（${device.code}）` : meta.label,
      deviceId: device ? device.id : null,
      args,
      risk: meta.risk,
      reason: String(reason || '').slice(0, 200),
      status: pre.ok ? (meta.risk === 'high' ? 'pending_confirm' : 'pending_dispatch') : 'failed',
      failReason: pre.ok ? null : pre.error,
      warning: pre.warning || null,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: iso(),
      confirmedAt: null,
      sentAt: null,
      executingAt: null,
      finishedAt: pre.ok ? null : iso(),
      result: pre.ok ? '' : '联锁校验未通过，命令未下发',
      feedback: null,
      timeline: [
        { at: iso(), status: pre.ok ? (meta.risk === 'high' ? 'pending_confirm' : 'pending_dispatch') : 'failed', by: user.name, note: pre.ok ? '命令已创建，等待' + (meta.risk === 'high' ? '确认' : '下发') : `联锁校验失败：${pre.error}` },
      ],
    };
    this.db.commands.push(cmd);
    if (this.db.commands.length > 1000) this.db.commands.splice(0, this.db.commands.length - 1000);
    this.store.saveSoon();
    writeAudit(this.store, {
      actor: user, action: pre.ok ? 'command.create' : 'command.blocked', targetType: 'command', targetId: cmd.id,
      siteId, detail: pre.ok ? `${meta.label}（${cmd.targetName}）；理由：${reason || '未填写'}` : `联锁拒绝：${pre.error}`, ip, result: pre.ok ? 'success' : 'blocked',
    });
    this.publish({ type: 'command', action: 'create', data: cmd });
    if (pre.ok && meta.risk !== 'high') this.scheduleDispatch(cmd.id);
    if (!pre.ok) {
      this.notifier.send([user.id], { type: 'command', title: `命令被拒绝：${meta.label}`, body: pre.error, link: '/control', siteId });
    }
    return { command: cmd, blocked: !pre.ok, error: pre.ok ? null : pre.error };
  }

  get(id) { return this.db.commands.find(c => c.id === id); }

  canOperate(user, cmd) {
    if (!cmd) return false;
    if (user.role === 'super') return true;
    return (user.siteIds || []).includes(cmd.siteId);
  }

  confirm(user, id, ip = '') {
    const cmd = this.get(id);
    if (!cmd) return { error: { status: 404, message: '命令不存在' } };
    if (cmd.status !== 'pending_confirm') return { error: { status: 409, message: `当前状态为「${STATUS_NAME[cmd.status]}」，不能确认下发` } };
    if (!this.canOperate(user, cmd)) return { error: { status: 403, message: '无权操作该站点' } };
    cmd.status = 'pending_dispatch';
    cmd.confirmedAt = iso();
    cmd.timeline.push({ at: iso(), status: 'pending_dispatch', by: user.name, note: '高风险动作已二次确认' });
    this.store.saveSoon();
    writeAudit(this.store, { actor: user, action: 'command.confirm', targetType: 'command', targetId: id, siteId: cmd.siteId, detail: `确认下发：${cmd.actionLabel}`, ip });
    this.publish({ type: 'command', action: 'confirm', data: cmd });
    this.scheduleDispatch(id);
    return { command: cmd };
  }

  scheduleDispatch(id) {
    this.clearTimer(id);
    const t = setTimeout(() => this.dispatch(id), 500);
    if (t.unref) t.unref();
    this.timers.set(id, t);
  }

  dispatch(id) {
    const cmd = this.get(id);
    if (!cmd || cmd.status !== 'pending_dispatch') return;
    cmd.status = 'sent';
    cmd.sentAt = iso();
    cmd.timeline.push({ at: iso(), status: 'sent', by: 'PLC 网关', note: '命令已下发至边缘网关，等待 PLC 回执' });
    this.store.saveSoon();
    this.publish({ type: 'command', action: 'sent', data: cmd });

    const t = setTimeout(() => this.execute(id), 800);
    if (t.unref) t.unref();
    this.timers.set(id, t);

    // 超时保护：30 秒未收到回执
    const to = setTimeout(() => {
      const c = this.get(id);
      if (c && c.status === 'sent') {
        c.status = 'timeout';
        c.finishedAt = iso();
        c.failReason = '命令在 30 秒内未收到 PLC 回执';
        c.timeline.push({ at: iso(), status: 'timeout', by: '系统', note: '超过命令超时时间，已终止等待；请现场确认设备实际状态' });
        this.store.saveSoon();
        this.notifyFinish(c);
        this.publish({ type: 'command', action: 'timeout', data: c });
        writeAudit(this.store, { actor: 'system', action: 'command.timeout', targetType: 'command', targetId: c.id, siteId: c.siteId, detail: c.failReason });
      }
    }, (this.db.settings.commandTimeoutSec || 30) * 1000);
    if (to.unref) to.unref();
    this.timers.set(id + ':timeout', to);
  }

  execute(id) {
    const cmd = this.get(id);
    if (!cmd || cmd.status !== 'sent') return;
    cmd.status = 'executing';
    cmd.executingAt = iso();
    cmd.timeline.push({ at: iso(), status: 'executing', by: 'PLC', note: 'PLC 回执已收到，开始执行' });
    this.store.saveSoon();
    this.publish({ type: 'command', action: 'executing', data: cmd });

    const meta = ACTIONS[cmd.action];
    const result = this.sim.execute(cmd.siteId, cmd.action, cmd.args);
    const wait = (meta && meta.execMs) || 1200;
    const t = setTimeout(() => {
      if (!result.ok) {
        cmd.status = 'failed';
        cmd.failReason = result.error || 'PLC 执行失败';
        cmd.result = result.error || '执行失败';
      } else {
        cmd.status = 'success';
        cmd.result = result.detail || (meta ? meta.effect : '执行完成');
        cmd.feedback = {
          pumpRunning: this.sim.status(cmd.siteId)?.raw.pumpRun ?? null,
          note: '模拟 PLC 返回执行完成回执',
        };
      }
      cmd.finishedAt = iso();
      cmd.timeline.push({ at: iso(), status: cmd.status, by: 'PLC', note: cmd.result || cmd.failReason });
      this.store.saveSoon();
      this.notifyFinish(cmd);
      this.publish({ type: 'command', action: cmd.status, data: cmd });
      writeAudit(this.store, {
        actor: 'system', action: 'command.result', targetType: 'command', targetId: cmd.id, siteId: cmd.siteId,
        detail: `${cmd.actionLabel} → ${STATUS_NAME[cmd.status]}：${cmd.result || cmd.failReason}`,
        result: cmd.status === 'success' ? 'success' : 'failed',
      });
      this.sim.writeTelemetry(Date.now());
    }, wait);
    if (t.unref) t.unref();
    this.timers.set(id, t);
  }

  cancel(user, id, reason = '', ip = '') {
    const cmd = this.get(id);
    if (!cmd) return { error: { status: 404, message: '命令不存在' } };
    if (!['pending_confirm', 'pending_dispatch'].includes(cmd.status)) {
      return { error: { status: 409, message: `命令已进入「${STATUS_NAME[cmd.status]}」，不能取消` } };
    }
    if (!this.canOperate(user, cmd)) return { error: { status: 403, message: '无权操作该站点' } };
    this.clearTimer(id);
    cmd.status = 'cancelled';
    cmd.finishedAt = iso();
    cmd.cancelReason = reason || '操作人取消';
    cmd.timeline.push({ at: iso(), status: 'cancelled', by: user.name, note: cmd.cancelReason });
    this.store.saveSoon();
    writeAudit(this.store, { actor: user, action: 'command.cancel', targetType: 'command', targetId: id, siteId: cmd.siteId, detail: `取消命令：${cmd.actionLabel}；${cmd.cancelReason}`, ip });
    this.publish({ type: 'command', action: 'cancel', data: cmd });
    return { command: cmd };
  }

  clearTimer(id) {
    for (const k of [id, id + ':timeout']) {
      const t = this.timers.get(k);
      if (t) clearTimeout(t);
      this.timers.delete(k);
    }
  }

  notifyFinish(cmd) {
    const ok = cmd.status === 'success';
    this.notifier.send([cmd.createdBy], {
      type: 'command',
      title: `${ok ? '命令执行成功' : '命令执行异常'}：${cmd.actionLabel}`,
      body: ok ? `${cmd.targetName}：${cmd.result}` : `${cmd.targetName}：${cmd.failReason || '执行失败'}`,
      link: '/control',
      siteId: cmd.siteId,
    });
  }

  /** 服务重启后清理悬挂命令 */
  recover() {
    let n = 0;
    for (const cmd of this.db.commands) {
      // 待确认是等人操作，给它更长的窗口；超过 30 分钟仍挂在重启点，说明没人跟进
      const waitMs = cmd.status === 'pending_confirm' ? 30 * 60 * 1000 : 5 * 60 * 1000;
      if (['pending_confirm', 'pending_dispatch', 'sent', 'executing'].includes(cmd.status)) {
        const age = Date.now() - new Date(cmd.createdAt).getTime();
        if (age > waitMs) {
          cmd.status = 'timeout';
          cmd.finishedAt = iso();
          cmd.failReason = '服务重启，命令回执丢失；请现场确认设备状态';
          cmd.timeline.push({ at: iso(), status: 'timeout', by: '系统', note: cmd.failReason });
          n++;
        }
      }
    }
    if (n) this.store.saveSoon();
    return n;
  }
}

module.exports = { CommandEngine, ACTIONS, STATUS_NAME };
