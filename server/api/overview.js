'use strict';
const fs = require('fs');
const path = require('path');
const { ok, ApiError, requireAuth, requirePerm, getSite, scopedSites, audit } = require('./common');
const A = require('../analytics');
const { round, startOfDay, dayKey, iso, uid } = require('../util');
const { ACTIONS } = require('../commands');
const { LEVEL_NAME } = require('../rules');

const M = 60000, H = 3600000;
const TREND_CODES = ['FLOW.IN', 'POWER.KW', 'SULFUR.PH', 'BAF.DO', 'RAW.LVL', 'CLEAR.LVL'];

function levelRank(level) {
  return { critical: 4, major: 3, minor: 2, info: 1 }[level] || 0;
}

function removal(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return round((a - b) / a * 100, 1);
}

function latestLab(db, siteId, pointKey) {
  return db.labRecords
    .filter(r => r.siteId === siteId && r.samplePoint === pointKey)
    .sort((a, b) => new Date(b.sampledAt) - new Date(a.sampledAt))[0] || null;
}

function siteBrief(ctx, site) {
  const devices = ctx.db.devices.filter(d => d.siteId === site.id);
  const points = ctx.db.points.filter(p => p.siteId === site.id);
  const onlinePoints = points.filter(p => {
    const l = ctx.telemetry.getLatest(p.id);
    return l && Date.now() - l.t < 90000;
  });
  const alarms = ctx.db.alarms.filter(a => a.siteId === site.id);
  const active = alarms.filter(a => a.status === 'active' || a.status === 'acknowledged');
  const wos = ctx.db.workorders.filter(w => w.siteId === site.id && !['done', 'verified', 'closed'].includes(w.status));
  const health = devices.filter(d => d.status !== '未安装').map(d => A.deviceHealth(d));
  const avgHealth = health.length ? Math.round(health.reduce((s, h) => s + h.score, 0) / health.length) : 0;
  const top = active.slice().sort((a, b) => levelRank(b.level) - levelRank(a.level))[0] || null;
  const lastDataAt = points.reduce((max, p) => {
    const latest = ctx.telemetry.getLatest(p.id);
    return latest ? Math.max(max, latest.t) : max;
  }, 0);
  const ageSec = lastDataAt ? Math.max(0, Math.floor((Date.now() - lastDataAt) / 1000)) : null;
  return {
    ...site,
    connectionStatus: ageSec == null ? 'unknown' : ageSec <= 90 ? 'online' : 'stale',
    lastDataAt: lastDataAt ? iso(lastDataAt) : null,
    lastDataAgeSec: ageSec,
    counts: {
      devices: devices.length,
      installed: devices.filter(d => d.status !== '未安装').length,
      onlineDevices: devices.filter(d => d.online).length,
      points: points.length,
      onlinePoints: onlinePoints.length,
      activeAlarms: active.length,
      criticalAlarms: active.filter(a => a.level === 'critical').length,
      openWorkorders: wos.length,
    },
    health: avgHealth,
    worstAlarmLevel: top ? top.level : null,
    worstAlarmLevelName: top ? LEVEL_NAME[top.level] : null,
    coverage: points.length ? round(onlinePoints.length / points.length * 100, 1) : 0,
  };
}

function register(router, app) {
  /* ---------------- 元数据 ---------------- */
  router.get('/api/meta', async (ctx) => {
    requireAuth(ctx);
    ok(ctx.res, {
      platform: ctx.db.settings.platformName,
      version: app.version,
      docVersion: ctx.db.settings.docVersion,
      demoMode: ctx.db.settings.demoMode,
      simulationEnabled: app.simulationEnabled,
      levels: Object.keys(LEVEL_NAME).map(k => ({ key: k, name: LEVEL_NAME[k], rank: levelRank(k) })),
      alarmStatus: [
        { key: 'active', name: '未确认' }, { key: 'acknowledged', name: '已确认' },
        { key: 'resolved', name: '已恢复' }, { key: 'closed', name: '已关闭' },
      ],
      workorderStatus: [
        { key: 'pending', name: '待接单' }, { key: 'accepted', name: '已接单' },
        { key: 'processing', name: '处理中' }, { key: 'done', name: '待验收' },
        { key: 'verified', name: '已验收' }, { key: 'closed', name: '已关闭' },
      ],
      workorderTypes: [
        { key: 'repair', name: '维修' }, { key: 'maintain', name: '保养' },
        { key: 'calibrate', name: '校准' }, { key: 'inspect', name: '巡检异常' },
      ],
      priorities: [
        { key: 'urgent', name: '紧急' }, { key: 'high', name: '高' },
        { key: 'normal', name: '普通' }, { key: 'low', name: '低' },
      ],
      paramWriteModes: [
        { key: 'cloud', name: '云端可写（留痕）' }, { key: 'approval', name: '审批后生效' },
        { key: 'local', name: '仅现场可改' }, { key: 'read', name: '只读' },
      ],
      labStatus: [
        { key: 'pending_review', name: '待复核' }, { key: 'reviewed', name: '已复核' },
        { key: 'draft', name: '草稿' }, { key: 'rejected', name: '退回' },
      ],
      samplePoints: [
        { key: 'inlet', name: '进水（原料罐）' }, { key: 'baf_out', name: 'BAF 出水' },
        { key: 'sulfur_out', name: '硫自养池出水' }, { key: 'outlet', name: '总出水（清水池）' },
      ],
      labMetrics: [
        { key: 'COD', name: 'COD', unit: 'mg/L' }, { key: 'NH3N', name: '氨氮', unit: 'mg/L' },
        { key: 'TN', name: '总氮', unit: 'mg/L' }, { key: 'TP', name: '总磷', unit: 'mg/L' },
        { key: 'SS', name: '悬浮物', unit: 'mg/L' },
      ],
      commandStatus: [
        { key: 'pending_confirm', name: '待确认' }, { key: 'pending_dispatch', name: '待下发' },
        { key: 'sent', name: '已下发' }, { key: 'executing', name: '执行中' },
        { key: 'success', name: '成功' }, { key: 'failed', name: '失败' },
        { key: 'timeout', name: '超时' }, { key: 'cancelled', name: '取消' },
      ],
      actions: Object.entries(ACTIONS).map(([key, v]) => ({ key, label: v.label, risk: v.risk, effect: v.effect, deviceKey: v.deviceKey })),
      inspectionResults: [
        { key: 'ok', name: '正常' }, { key: 'attention', name: '需关注' }, { key: 'abnormal', name: '异常' },
      ],
      units: ctx.db.units.filter(u => u.siteId === ctx.db.sites[0].id).sort((a, b) => a.order - b.order).map(u => ({ code: u.code, name: u.name, short: u.short, kind: u.kind })),
      demoPassword: 'water123',
    });
  });

  /* ---------------- 站点 ---------------- */
  router.get('/api/sites', async (ctx) => {
    requireAuth(ctx);
    const list = scopedSites(ctx).map(s => siteBrief(ctx, s));
    ok(ctx.res, list, { total: list.length });
  });

  router.get('/api/sites/:id', async (ctx) => {
    requireAuth(ctx);
    const site = getSite(ctx, ctx.params.id);
    const brief = siteBrief(ctx, site);
    const units = ctx.db.units.filter(u => u.siteId === site.id).sort((a, b) => a.order - b.order);
    const devices = ctx.db.devices.filter(d => d.siteId === site.id);
    const points = ctx.db.points.filter(p => p.siteId === site.id);
    const params = ctx.db.params.filter(p => p.siteId === site.id);
    ok(ctx.res, {
      ...brief,
      units,
      stats: {
        units: units.length,
        devices: devices.length,
        points: points.length,
        params: params.length,
        onlineRate: brief.coverage,
        gateway: ctx.sim.state[site.id] ? 'connected' : 'unknown',
      },
      dataNote: site.note,
      docs: [
        { name: '《智赋乡水 · 智慧水处理平台建设方案 V2.2》', note: '本平台按方案第 3–15 章建设，演示数据由内置模拟网关生成。' },
      ],
    });
  });

  /* ---------------- 驾驶舱 ---------------- */
  router.get('/api/overview', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    const site = getSite(ctx, siteId);
    const now = Date.now();
    const dayStart = startOfDay(now);
    const points = ctx.db.points.filter(p => p.siteId === siteId);
    const byCode = new Map(points.map(p => [p.code, p]));
    const read = code => A.reading(ctx.telemetry, byCode.get(code));
    const flow = byCode.get('FLOW.IN') ? A.series(ctx, siteId, ['FLOW.IN'], dayStart, now, 300)['FLOW.IN'] || [] : [];
    const todayVolume = byCode.has('FLOW.IN') ? A.integrate(flow) : null;
    const energy = byCode.has('ENERGY.KWH') ? A.counterDelta(A.series(ctx, siteId, ['ENERGY.KWH'], dayStart, now, 300)['ENERGY.KWH'] || []) : null;
    const pacTotal = byCode.has('PAC.TOTAL') ? A.counterDelta(A.series(ctx, siteId, ['PAC.TOTAL'], dayStart, now, 300)['PAC.TOTAL'] || []) : null;
    const pamTotal = byCode.has('PAM.TOTAL') ? A.counterDelta(A.series(ctx, siteId, ['PAM.TOTAL'], dayStart, now, 300)['PAM.TOTAL'] || []) : null;
    const flowRead = read('FLOW.IN');
    const powerRead = read('POWER.KW');
    const labOut = latestLab(ctx.db, siteId, 'outlet');
    const labIn = latestLab(ctx.db, siteId, 'inlet');
    const activeAlarms = ctx.db.alarms.filter(a => a.siteId === siteId && (a.status === 'active' || a.status === 'acknowledged'));
    const openWos = ctx.db.workorders.filter(w => w.siteId === siteId && !['done', 'verified', 'closed'].includes(w.status));
    const onlinePoints = points.filter(p => {
      const l = ctx.telemetry.getLatest(p.id);
      return l && now - l.t < 90000;
    });
    const lastTs = points.reduce((max, p) => {
      const l = ctx.telemetry.getLatest(p.id);
      return l ? Math.max(max, l.t) : max;
    }, 0);

    const kpis = [
      {
        key: 'volume', label: '今日处理水量', value: todayVolume, unit: 'm³', digits: 2,
        display: todayVolume == null ? '待接入' : null,
        hint: todayVolume == null ? '本站未安装进水流量计（选配点位），水量由人工记录或外部接口补充' : '按进水流量对时间积分（5 分钟粒度）',
        source: 'gateway', status: todayVolume == null ? 'unavailable' : 'ok',
      },
      {
        key: 'flow', label: '进水流量', value: flowRead ? flowRead.value : null, unit: 'm³/h', digits: 3,
        display: flowRead && flowRead.value != null ? null : '待接入', hint: '电磁流量计 FT-101（演示选配）', source: 'gateway',
        status: flowRead && flowRead.value != null ? 'ok' : 'unavailable', at: flowRead ? flowRead.t : null,
      },
      {
        key: 'power', label: '当前功率', value: powerRead ? powerRead.value : null, unit: 'kW', digits: 2,
        display: powerRead && powerRead.value != null ? null : '待接入', hint: '配电智能电表 PM-801', source: 'gateway',
        status: powerRead && powerRead.value != null ? 'ok' : 'unavailable', at: powerRead ? powerRead.t : null,
      },
      {
        key: 'energy', label: '今日能耗', value: energy, unit: 'kWh', digits: 2,
        display: energy == null ? '待接入' : null, hint: '累计电能表差值', source: 'gateway', status: energy == null ? 'unavailable' : 'ok',
      },
      {
        key: 'cod', label: '出水 COD', value: labOut ? labOut.metrics.COD : null, unit: 'mg/L', digits: 1,
        display: labOut ? null : '人工化验', hint: labOut ? `人工化验 · ${labOut.samplePointName} · ${labOut.sampledAt.slice(0, 16).replace('T', ' ')}` : '暂无化验记录',
        source: 'manual', status: labOut ? 'ok' : 'unavailable',
        trend: labIn && labOut ? { label: '去除率', value: removal(labIn.metrics.COD, labOut.metrics.COD), unit: '%' } : null,
      },
      {
        key: 'nh3n', label: '出水氨氮', value: labOut ? labOut.metrics.NH3N : null, unit: 'mg/L', digits: 2,
        display: labOut ? null : '人工化验', hint: labOut ? `人工化验 · ${labOut.status === 'reviewed' ? '已复核' : '待复核'}` : '暂无化验记录',
        source: 'manual', status: labOut ? (labOut.status === 'reviewed' ? 'ok' : 'pending') : 'unavailable',
        trend: labIn && labOut ? { label: '去除率', value: removal(labIn.metrics.NH3N, labOut.metrics.NH3N), unit: '%' } : null,
      },
      {
        key: 'online', label: '数据在线率', value: points.length ? round(onlinePoints.length / points.length * 100, 1) : 0, unit: '%', digits: 1,
        hint: `${onlinePoints.length}/${points.length} 个点位 90 秒内有数据`, source: 'system', status: 'ok',
      },
      {
        key: 'alarms', label: '活动告警', value: activeAlarms.length, unit: '条', digits: 0,
        display: null, hint: activeAlarms.filter(a => a.level === 'critical' || a.level === 'major').length + ' 条重要/紧急',
        source: 'system', status: activeAlarms.some(a => a.level === 'critical') ? 'risk' : activeAlarms.length ? 'attention' : 'ok',
      },
      {
        key: 'workorders', label: '待处理工单', value: openWos.length, unit: '单', digits: 0,
        hint: openWos.filter(w => w.priority === 'urgent' || w.priority === 'high').length + ' 单高优先级', source: 'system',
        status: openWos.length ? 'attention' : 'ok',
      },
    ];

    const trend = A.series(ctx, siteId, TREND_CODES, now - 24 * H, now, 1800);
    const trends = {};
    for (const code of TREND_CODES) {
      const p = byCode.get(code);
      if (!p) continue;
      trends[code] = { name: p.name, unit: p.unit, type: p.type, points: trend[code] || [] };
    }

    const samplePoints = ['inlet', 'baf_out', 'sulfur_out', 'outlet'];
    const latestByPoint = {};
    for (const sp of samplePoints) {
      const r = latestLab(ctx.db, siteId, sp);
      if (r) latestByPoint[sp] = { id: r.id, sampledAt: r.sampledAt, status: r.status, metrics: r.metrics };
    }
    const removalRates = {};
    if (latestByPoint.inlet && latestByPoint.outlet) {
      for (const m of ['COD', 'NH3N', 'TN', 'TP', 'SS']) {
        removalRates[m] = removal(latestByPoint.inlet.metrics[m], latestByPoint.outlet.metrics[m]);
      }
    }

    const alarms = activeAlarms
      .sort((a, b) => levelRank(b.level) - levelRank(a.level) || new Date(b.lastAt) - new Date(a.lastAt))
      .slice(0, 6)
      .map(a => ({ id: a.id, level: a.level, levelName: LEVEL_NAME[a.level], title: a.title, value: a.value, unit: (ctx.db.points.find(p => p.id === a.pointId) || {}).unit || '', firstAt: a.firstAt, lastAt: a.lastAt, status: a.status, siteId: a.siteId }));

    const workorders = openWos
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(w => ({ id: w.id, title: w.title, status: w.status, priority: w.priority, assigneeId: w.assigneeId, dueAt: w.dueAt, type: w.type }));

    const diag = app.diagnosis.list(siteId);

    ok(ctx.res, {
      site: { id: site.id, name: site.name, shortName: site.shortName, region: site.region, area: site.area, process: site.process, capacity: site.capacity, status: site.status, deviceRef: site.deviceRef, contact: site.contact },
      generatedAt: iso(now),
      dayKey: dayKey(now),
      kpis,
      process: A.unitCards(ctx, siteId),
      trends,
      waterQuality: { latest: latestByPoint, removal: removalRates, note: '人工化验结果，在线 TN/COD/氨氮/总磷未接入，不使用估算值代替。' },
      alarms,
      alarmCounts: {
        active: activeAlarms.length,
        critical: activeAlarms.filter(a => a.level === 'critical').length,
        major: activeAlarms.filter(a => a.level === 'major').length,
        minor: activeAlarms.filter(a => a.level === 'minor').length,
        info: activeAlarms.filter(a => a.level === 'info').length,
      },
      workorders,
      workorderCounts: { open: openWos.length, pending: openWos.filter(w => w.status === 'pending').length },
      diagnosis: diag.slice(0, 3),
      diagnosisCount: diag.filter(d => d.level !== 'none').length,
      dataHealth: {
        gateway: ctx.sim.state[site.id] ? 'connected' : 'unknown',
        pointsTotal: points.length,
        pointsOnline: onlinePoints.length,
        latestAt: lastTs ? iso(lastTs) : null,
        delaySec: lastTs ? Math.max(0, Math.round((now - lastTs) / 1000)) : null,
        quality: lastTs && now - lastTs < 90000 ? 'good' : 'degraded',
      },
      resources: {
        energyTodayKwh: energy, pacTodayL: pacTotal, pamTodayL: pamTotal,
      },
      notice: ctx.db.settings.notice,
      dataSources: ctx.db.settings.dataSources,
    });
  });

  /* ---------------- 工艺流程图 ---------------- */
  router.get('/api/sites/:id/process', async (ctx) => {
    requireAuth(ctx);
    const site = getSite(ctx, ctx.params.id);
    const units = A.unitCards(ctx, site.id);
    const devices = ctx.db.devices.filter(d => d.siteId === site.id).map(d => ({
      id: d.id, code: d.code, name: d.name, unitCode: d.unitCode, type: d.type, status: d.status, online: d.online,
    }));
    const active = ctx.db.alarms.filter(a => a.siteId === site.id && (a.status === 'active' || a.status === 'acknowledged'));
    ok(ctx.res, {
      site: { id: site.id, name: site.name, shortName: site.shortName, process: site.process, capacity: site.capacity, note: site.note },
      units,
      devices,
      alarms: active.map(a => ({ id: a.id, level: a.level, title: a.title, unitCode: a.unitCode, status: a.status })),
      sequence: units.filter(u => u.code !== 'plant').map(u => ({ code: u.code, name: u.name, short: u.short, kind: u.kind })),
      meta: {
        note: '图形按方案第 3 章图纸顺序绘制：原料罐 → 格栅池 → 初沉池 → 配水槽1 → BAF → PAC → PAM → 配水槽2 → 硫自养池 → 清水池；反冲洗废水进入废水水箱。',
        interlock: [
          { from: 'RAW.LVL', text: '原料罐低液位与提升泵联锁，低于 5% 禁止启泵' },
          { from: 'BAF.DO', text: 'BAF 溶解氧与曝气风机联锁，DO < 2.5 mg/L 禁止停风机' },
          { from: 'WASTE.LVL', text: '废水箱高液位（≥92%）禁止启动反冲洗，避免排水受阻' },
          { from: 'SULFUR.P', text: '反冲洗管路压力超 0.6 MPa 提示检查阀门与管路' },
        ],
      },
    });
  });

  /* ---------------- 遥测 ---------------- */
  router.get('/api/telemetry/latest', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    getSite(ctx, siteId);
    let items = A.latestList(ctx, siteId);
    if (ctx.query.unitCode) items = items.filter(i => i.unitCode === ctx.query.unitCode);
    if (ctx.query.type) items = items.filter(i => i.type === ctx.query.type);
    ok(ctx.res, { siteId, at: iso(), items }, { total: items.length });
  });

  router.get('/api/telemetry/history', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    getSite(ctx, siteId);
    const codes = String(ctx.query.codes || TREND_CODES.join(',')).split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
    const to = ctx.query.to ? new Date(ctx.query.to).getTime() : Date.now();
    const from = ctx.query.from ? new Date(ctx.query.from).getTime() : to - 24 * H;
    const bucketSec = Math.min(86400, Math.max(60, parseInt(ctx.query.bucketSec, 10) || 1800));
    const series = A.series(ctx, siteId, codes, from, to, bucketSec);
    const out = {};
    for (const code of codes) {
      const p = ctx.db.points.find(x => x.siteId === siteId && x.code === code);
      if (!p) continue;
      out[code] = { name: p.name, unit: p.unit, type: p.type, pointId: p.id, points: series[code] || [] };
    }
    ok(ctx.res, { siteId, from: iso(from), to: iso(to), bucketSec, series: out });
  });

  router.get('/api/telemetry/stats', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    getSite(ctx, siteId);
    const hours = Math.min(24 * 7, Math.max(1, parseFloat(ctx.query.hours) || 24));
    const codes = String(ctx.query.codes || TREND_CODES.join(',')).split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    const to = Date.now(), from = to - hours * H;
    const s = A.series(ctx, siteId, codes, from, to, 300);
    const out = {};
    for (const code of codes) {
      const p = ctx.db.points.find(x => x.siteId === siteId && x.code === code);
      if (!p) continue;
      out[code] = { name: p.name, unit: p.unit, ...A.summarize(s[code] || []) };
    }
    ok(ctx.res, { siteId, hours, stats: out });
  });

  router.get('/api/points', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    getSite(ctx, siteId);
    let items = A.latestList(ctx, siteId);
    if (ctx.query.unitCode) items = items.filter(i => i.unitCode === ctx.query.unitCode);
    if (ctx.query.type) items = items.filter(i => i.type === ctx.query.type);
    if (ctx.query.q) {
      const q = String(ctx.query.q).toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    ok(ctx.res, items, { total: items.length });
  });

  router.get('/api/points/:id', async (ctx) => {
    requireAuth(ctx);
    const p = ctx.db.points.find(x => x.id === ctx.params.id);
    if (!p) throw new ApiError(404, '点位不存在', 'POINT_NOT_FOUND');
    getSite(ctx, p.siteId);
    const r = A.reading(ctx.telemetry, p);
    const to = Date.now(), from = to - 24 * H;
    const series = A.series(ctx, p.siteId, [p.code], from, to, 300)[p.code] || [];
    const alarms = ctx.db.alarms.filter(a => a.pointId === p.id).slice(-10);
    ok(ctx.res, { ...p, reading: r, history: series, stats: A.summarize(series), alarms });
  });

  /* ---------------- 设备 ---------------- */
  function deviceView(ctx, d) {
    const h = A.deviceHealth(d);
    const points = ctx.db.points.filter(p => p.deviceId === d.id);
    const online = points.filter(p => {
      const l = ctx.telemetry.getLatest(p.id);
      return l && Date.now() - l.t < 90000;
    });
    return {
      ...d,
      health: h,
      unitName: (ctx.db.units.find(u => u.siteId === d.siteId && u.code === d.unitCode) || {}).name || d.unitCode,
      pointCount: points.length,
      pointsOnline: online.length,
      openWorkorders: ctx.db.workorders.filter(w => w.deviceId === d.id && !['done', 'verified', 'closed'].includes(w.status)).length,
      activeAlarms: ctx.db.alarms.filter(a => a.siteId === d.siteId && a.unitCode === d.unitCode && (a.status === 'active' || a.status === 'acknowledged')).length,
    };
  }

  router.get('/api/devices', async (ctx) => {
    requireAuth(ctx);
    const siteId = ctx.query.siteId || scopedSites(ctx)[0].id;
    getSite(ctx, siteId);
    let items = ctx.db.devices.filter(d => d.siteId === siteId).map(d => deviceView(ctx, d));
    if (ctx.query.unitCode) items = items.filter(d => d.unitCode === ctx.query.unitCode);
    if (ctx.query.status) items = items.filter(d => d.status === ctx.query.status);
    if (ctx.query.q) {
      const q = String(ctx.query.q).toLowerCase();
      items = items.filter(d => `${d.name} ${d.code} ${d.model}`.toLowerCase().includes(q));
    }
    const summary = {
      total: items.length,
      installed: items.filter(d => d.status !== '未安装').length,
      online: items.filter(d => d.online).length,
      needMaint: items.filter(d => d.health && d.health.needMaint).length,
      risk: items.filter(d => d.health && d.health.level === 'risk').length,
      byType: {},
    };
    for (const d of items) summary.byType[d.type] = (summary.byType[d.type] || 0) + 1;
    ok(ctx.res, items, { total: items.length, summary });
  });

  router.get('/api/devices/:id', async (ctx) => {
    requireAuth(ctx);
    const d = ctx.db.devices.find(x => x.id === ctx.params.id);
    if (!d) throw new ApiError(404, '设备不存在', 'DEVICE_NOT_FOUND');
    getSite(ctx, d.siteId);
    const view = deviceView(ctx, d);
    const points = ctx.db.points.filter(p => p.deviceId === d.id).map(p => A.reading(ctx.telemetry, p));
    const workorders = ctx.db.workorders.filter(w => w.deviceId === d.id).slice(-10);
    const maintenance = (ctx.db.maintenance || []).filter(m => m.deviceId === d.id).sort((a, b) => new Date(b.at) - new Date(a.at));
    const alarms = ctx.db.alarms.filter(a => a.pointId && points.some(p => p.pointId === a.pointId)).slice(-10);
    ok(ctx.res, {
      ...view,
      points,
      workorders,
      maintenance,
      alarms,
      lifecycle: {
        installDate: d.installDate,
        warrantyUntil: d.warrantyUntil,
        runtimeHours: d.runtimeHours,
        starts: d.starts,
        maintCycleDays: d.maintCycleDays,
        lastMaintAt: d.lastMaintAt,
        nextMaintAt: d.lastMaintAt ? iso(new Date(d.lastMaintAt).getTime() + d.maintCycleDays * 86400000) : null,
      },
    });
  });

  router.post('/api/devices/:id/maintenance', async (ctx) => {
    const user = requirePerm(ctx, 'param.edit');
    const d = ctx.db.devices.find(x => x.id === ctx.params.id);
    if (!d) throw new ApiError(404, '设备不存在', 'DEVICE_NOT_FOUND');
    getSite(ctx, d.siteId);
    const { type = '保养', note = '', parts = '', cost = 0, runtimeHours = 0 } = ctx.body || {};
    if (!note.trim()) throw new ApiError(400, '请填写维护内容', 'BAD_REQUEST');
    if (!ctx.db.maintenance) ctx.db.maintenance = [];
    const rec = {
      id: 'MT-' + uid(8).toUpperCase(), siteId: d.siteId, deviceId: d.id, deviceName: d.name,
      type, note: String(note).slice(0, 500), parts: String(parts).slice(0, 200), cost: Number(cost) || 0,
      runtimeHours: Number(runtimeHours) || 0, at: iso(), by: user.id, byName: user.name,
    };
    ctx.db.maintenance.push(rec);
    d.lastMaintAt = rec.at;
    if (type === '维修' || type === '更换') {
      d.status = '在线';
      d.online = true;
    }
    ctx.store.saveSoon();
    audit(ctx, { actor: user, action: 'device.maintenance', targetType: 'device', targetId: d.id, siteId: d.siteId, detail: `${type}：${rec.note}`, after: rec });
    ok(ctx.res, rec);
  });

  /* ---------------- 系统信息 ---------------- */
  router.get('/api/system/health', async (ctx) => {
    requireAuth(ctx);
    const mem = process.memoryUsage();
    const points = ctx.db.points;
    let latestTs = 0;
    for (const p of points) {
      const l = ctx.telemetry.getLatest(p.id);
      if (l && l.t > latestTs) latestTs = l.t;
    }
    ok(ctx.res, {
      status: 'ok',
      platform: ctx.db.settings.platformName,
      version: app.version,
      docVersion: ctx.db.settings.docVersion,
      demoMode: ctx.db.settings.demoMode,
      startedAt: app.startedAt,
      uptimeSec: Math.round((Date.now() - new Date(app.startedAt).getTime()) / 1000),
      node: process.version,
      pid: process.pid,
      port: app.port,
      wsClients: app.wsClients ? app.wsClients() : 0,
      dataFile: app.dataFile,
      dataFileKB: app.dataFile && fs.existsSync(app.dataFile) ? Math.round(fs.statSync(app.dataFile).size / 1024) : 0,
      memoryMB: Math.round(mem.rss / 1048576),
      counts: {
        sites: ctx.db.sites.length,
        devices: ctx.db.devices.length,
        points: points.length,
        alarms: ctx.db.alarms.length,
        workorders: ctx.db.workorders.length,
        labRecords: ctx.db.labRecords.length,
        commands: ctx.db.commands.length,
        auditLogs: ctx.db.auditLogs.length,
      },
      telemetry: { latestAt: latestTs ? iso(latestTs) : null, delaySec: latestTs ? Math.round((Date.now() - latestTs) / 1000) : null },
      simulation: { tickSec: 5, historyDays: 7, mode: '内置模拟网关（可选接入真实 MQTT/Modbus）' },
    });
  });

  router.get('/api/system/sources', async (ctx) => {
    requireAuth(ctx);
    const points = ctx.db.points;
    const byProvenance = {};
    for (const p of points) {
      byProvenance[p.provenance] = byProvenance[p.provenance] || { count: 0, codes: [] };
      byProvenance[p.provenance].count++;
      if (byProvenance[p.provenance].codes.length < 40) byProvenance[p.provenance].codes.push(p.code);
    }
    ok(ctx.res, {
      gateways: ctx.db.sites.map(s => ({ siteId: s.id, name: s.shortName, protocol: 'Modbus RTU → 边缘网关 → MQTT（演示为内置模拟）', status: ctx.sim.state[s.id] ? 'connected' : 'unknown' })),
      provenance: byProvenance,
      lab: { source: '人工化验录入', metrics: ['COD', 'NH3N', 'TN', 'TP', 'SS'], status: 'active', note: '人工化验数据与在线数据分列展示，复核后方可用于报表。' },
      external: { source: '外部接口（未接入）', items: ['在线 TN / COD / 氨氮 / 总磷分析仪', '区域监管平台数据报送', '短信 / 电话语音通道'], note: '方案第 3 章图纸未确认上述在线仪表，平台不以估算值冒充实时值。' },
      disclaimer: '演示环境的数据由内置模拟网关按工艺曲线生成；标注「待接入」「人工化验」「选配」的内容不冒充在线实测。',
    });
  });
}

module.exports = { register };
