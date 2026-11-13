'use strict';
/**
 * 告警规则引擎：持续时长 + 迟滞 + 分级 + 升级 + 自动恢复。
 * 设计要点（对应方案第 6.4 节）：
 *  - 参数持续越限超过规则时长才生成告警，抑制瞬时抖动；
 *  - 迟滞带避免在阈值附近反复开关；
 *  - 未确认告警按升级时长提升等级并通知上级；
 *  - 参数回到安全区后自动标记「已恢复」，保留完整时间线供追溯。
 */
const { iso } = require('./util');
const { nextCode } = require('./codes');
const { writeAudit } = require('./audit');

const LEVELS = ['info', 'minor', 'major', 'critical'];
const LEVEL_NAME = { info: '提示', minor: '次要', major: '重要', critical: '紧急' };

function thresholdText(rule) {
  const u = rule.unit ? ` ${rule.unit}` : '';
  switch (rule.op) {
    case 'low': return `≥ ${rule.low}${u}`;
    case 'high': return `≤ ${rule.high}${u}`;
    case 'outside': return `${rule.low}–${rule.high}${u}`;
    case 'state': return `阶段 ${rule.stateValues.join('/')} 为异常`;
    default: return '';
  }
}

function isOut(rule, v) {
  if (v == null) return false;
  switch (rule.op) {
    case 'low': return v < rule.low;
    case 'high': return v > rule.high;
    case 'outside': return v < rule.low || v > rule.high;
    case 'state': return (rule.stateValues || []).includes(Number(v));
    default: return false;
  }
}

function isClear(rule, v) {
  if (v == null) return true;
  const h = rule.hysteresis || 0;
  switch (rule.op) {
    case 'low': return v >= rule.low + h;
    case 'high': return v <= rule.high - h;
    case 'outside': return v >= rule.low + h && v <= rule.high - h;
    case 'state': return !(rule.stateValues || []).includes(Number(v));
    default: return true;
  }
}

class RulesEngine {
  constructor({ store, telemetry, sim, notifier, publish = () => {}, logger = console }) {
    this.store = store;
    this.telemetry = telemetry;
    this.sim = sim;
    this.notifier = notifier;
    this.publish = publish;
    this.logger = logger;
    this.runtime = new Map();
    this.timer = null;
    this.lastEscalateCheck = 0;
  }

  get db() { return this.store.data; }

  pointIndex() {
    if (!this._pointIdx) {
      this._pointIdx = new Map();
      for (const p of this.db.points) this._pointIdx.set(`${p.siteId}|${p.code}`, p);
    }
    return this._pointIdx;
  }

  start() {
    this.attachActive();
    this.timer = setInterval(() => this.evaluate(), 5000);
    if (this.timer.unref) this.timer.unref();
    this.evaluate();
    this.logger.info?.('[rules] 告警规则引擎已启动');
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  attachActive() {
    for (const a of this.db.alarms) {
      if (!['active', 'acknowledged'].includes(a.status) || !a.ruleId) continue;
      const rule = this.db.alarmRules.find(r => r.id === a.ruleId);
      if (!rule) continue;
      this.runtime.set(`${a.siteId}|${rule.id}`, { since: new Date(a.firstAt).getTime(), out: true });
    }
  }

  latest(siteId, code) {
    const p = this.pointIndex().get(`${siteId}|${code}`);
    const latest = p ? this.telemetry.getLatest(p.id) : null;
    return latest && latest.q === 'good' ? latest : null;
  }

  evaluate(now = Date.now()) {
    for (const rule of this.db.alarmRules) {
      if (!rule.enabled) continue;
      const sites = rule.siteId && rule.siteId !== '*' ? this.db.sites.filter(s => s.id === rule.siteId) : this.db.sites;
      for (const site of sites) {
        this.evaluateRule(rule, site, now);
      }
    }
    if (now - this.lastEscalateCheck > 30000) {
      this.lastEscalateCheck = now;
      this.checkEscalations(now);
    }
  }

  evaluateRule(rule, site, now) {
    const point = this.pointIndex().get(`${site.id}|${rule.pointCode}`);
    if (!point) return;
    const latest = this.telemetry.getLatest(point.id);
    if (!latest || latest.q !== 'good') return;
    const v = latest ? latest.v : null;
    const key = `${site.id}|${rule.id}`;
    const rt = this.runtime.get(key) || { since: 0, out: false };

    // 前置条件（如「提升泵运行」才判断断流）
    let reqOk = true;
    for (const req of rule.requires || []) {
      const r = this.latest(site.id, req.code);
      if (!r || Number(r.v) !== Number(req.value)) { reqOk = false; break; }
    }
    const out = reqOk && isOut(rule, v);

    if (out) {
      if (!rt.out) { rt.out = true; rt.since = now; }
      this.runtime.set(key, rt);
      const active = this.findOpen(rule, site.id);
      if (!active) {
        if (now - rt.since >= (rule.durationSec || 0) * 1000) this.createAlarm(rule, site, point, v, now);
      } else if (now - new Date(active.lastAt).getTime() > 20000) {
        active.value = v;
        active.lastAt = iso(now);
        this.store.saveSoon();
        this.publish({ type: 'alarm', action: 'update', data: active });
      }
    } else {
      if (rt.out) {
        this.runtime.set(key, { since: 0, out: false });
      }
      const active = this.findOpen(rule, site.id);
      if (active && isClear(rule, v)) this.autoResolve(active, v, now);
    }
  }

  findOpen(rule, siteId) {
    return this.db.alarms.find(a => a.ruleId === rule.id && a.siteId === siteId
      && ['active', 'acknowledged'].includes(a.status));
  }

  createAlarm(rule, site, point, v, now) {
    const alarm = {
      id: nextCode(this.db, 'alarms', 'AL'),
      siteId: site.id,
      pointId: point.id,
      pointCode: point.code,
      unitCode: point.unitCode,
      level: rule.level,
      title: rule.name,
      detail: `${point.name} 当前 ${v}${point.unit ? ' ' + point.unit : ''}，${rule.desc || ''}`,
      status: 'active',
      value: v,
      threshold: thresholdText(rule),
      ruleId: rule.id,
      firstAt: iso(now),
      lastAt: iso(now),
      ackAt: null,
      ackBy: null,
      resolvedAt: null,
      resolvedBy: null,
      count: 1,
      source: 'rule',
      notifyChannels: ['inapp'],
    };
    this.db.alarms.push(alarm);
    if (this.db.alarms.length > 2000) this.db.alarms.splice(0, this.db.alarms.length - 2000);
    this.store.saveSoon();

    const roles = alarm.level === 'critical' || alarm.level === 'major'
      ? ['operator', 'region', 'process']
      : ['operator'];
    this.notifier.sendRoles(site.id, roles, {
      type: 'alarm',
      title: `${LEVEL_NAME[alarm.level]}告警：${alarm.title}`,
      body: `${site.name} · ${alarm.detail}`,
      link: `/alarms?id=${alarm.id}`,
    });
    writeAudit(this.store, {
      actor: 'system', action: 'alarm.create', targetType: 'alarm', targetId: alarm.id,
      siteId: site.id, detail: `规则「${rule.name}」触发：${alarm.detail}`,
    });
    this.publish({ type: 'alarm', action: 'create', data: alarm });
    this.logger.warn?.(`[rules] ${alarm.id} ${alarm.title} @ ${site.name} = ${v}`);
    return alarm;
  }

  autoResolve(alarm, v, now) {
    alarm.status = 'resolved';
    alarm.resolvedAt = iso(now);
    alarm.resolvedBy = 'system';
    alarm.value = v;
    alarm.closeNote = '参数回到安全区间，由规则引擎自动标记恢复；如需关闭请补充处置说明。';
    this.store.saveSoon();
    writeAudit(this.store, {
      actor: 'system', action: 'alarm.resolve', targetType: 'alarm', targetId: alarm.id,
      siteId: alarm.siteId, detail: `参数恢复正常（当前 ${v}），自动标记已恢复`,
    });
    this.publish({ type: 'alarm', action: 'resolve', data: alarm });
  }

  checkEscalations(now) {
    for (const a of this.db.alarms) {
      if (a.status !== 'active' || !a.ruleId) continue;
      const rule = this.db.alarmRules.find(r => r.id === a.ruleId);
      if (!rule || !rule.escalateSec) continue;
      if (now - new Date(a.firstAt).getTime() < rule.escalateSec * 1000) continue;
      const idx = LEVELS.indexOf(a.level);
      if (idx < 0 || idx >= LEVELS.length - 1) continue;
      a.level = LEVELS[idx + 1];
      a.lastAt = iso(now);
      a.escalatedAt = iso(now);
      this.store.saveSoon();
      this.notifier.sendRoles(a.siteId, ['region', 'process'], {
        type: 'alarm',
        title: `告警升级：${a.title}`,
        body: `未确认超过 ${Math.round(rule.escalateSec / 60)} 分钟，已升级为「${LEVEL_NAME[a.level]}」。请尽快研判。`,
        link: `/alarms?id=${a.id}`,
      });
      writeAudit(this.store, {
        actor: 'system', action: 'alarm.escalate', targetType: 'alarm', targetId: a.id,
        siteId: a.siteId, detail: `告警超时未确认，等级升级为 ${LEVEL_NAME[a.level]}`,
      });
      this.publish({ type: 'alarm', action: 'escalate', data: a });
    }
  }

  /** 人工确认 */
  acknowledge(user, alarmId, note = '', ip = '') {
    const a = this.db.alarms.find(x => x.id === alarmId);
    if (!a) return { error: { status: 404, message: '告警不存在' } };
    if (!['active', 'acknowledged'].includes(a.status)) return { error: { status: 409, message: `当前状态为「${a.status}」，不能确认` } };
    if (a.ackAt) return { error: { status: 409, message: '该告警已确认' } };
    a.status = 'acknowledged';
    a.ackAt = iso();
    a.ackBy = user.id;
    a.ackNote = note;
    this.store.saveSoon();
    writeAudit(this.store, { actor: user, action: 'alarm.ack', targetType: 'alarm', targetId: a.id, siteId: a.siteId, detail: `确认告警：${a.title}${note ? '；备注：' + note : ''}`, ip });
    this.publish({ type: 'alarm', action: 'ack', data: a });
    return { alarm: a };
  }

  /** 人工标记恢复 */
  resolve(user, alarmId, note = '', ip = '') {
    const a = this.db.alarms.find(x => x.id === alarmId);
    if (!a) return { error: { status: 404, message: '告警不存在' } };
    if (!['active', 'acknowledged'].includes(a.status)) return { error: { status: 409, message: '该告警已结束' } };
    a.status = 'resolved';
    a.resolvedAt = iso();
    a.resolvedBy = user.id;
    a.closeNote = note || '人工确认恢复';
    this.store.saveSoon();
    writeAudit(this.store, { actor: user, action: 'alarm.resolve', targetType: 'alarm', targetId: a.id, siteId: a.siteId, detail: `标记恢复：${a.title}${note ? '；' + note : ''}`, ip });
    this.publish({ type: 'alarm', action: 'resolve', data: a });
    return { alarm: a };
  }
}

module.exports = { RulesEngine, LEVELS, LEVEL_NAME, thresholdText };
