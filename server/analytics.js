'use strict';
/** 指标派生：把遥测、化验、设备与告警数据换算成页面需要的口径。 */
const { round } = require('./util');

function pointsOfSite(db, siteId) {
  return db.points.filter(p => p.siteId === siteId);
}

function pointByCode(db, siteId, code) {
  return db.points.find(p => p.siteId === siteId && p.code === code) || null;
}

function reading(telemetry, point) {
  if (!point) return null;
  const l = telemetry.getLatest(point.id);
  const value = l ? (l.v !== undefined ? l.v : l.value) : null;
  const quality = l ? (l.q !== undefined ? l.q : l.quality) : 'missing';
  const ts = l ? (l.t !== undefined ? l.t : l.at) : null;
  return {
    pointId: point.id, code: point.code, name: point.name, unit: point.unit,
    unitCode: point.unitCode, deviceId: point.deviceId, type: point.type,
    value, v: value, t: ts ? new Date(ts).toISOString() : null,
    quality, q: quality, source: l && l.source ? l.source : point.source,
    provenance: point.provenance, writable: point.writable,
    stale: ts ? Date.now() - ts > Math.max(60000, point.intervalSec * 6000) : true,
  };
}

function latestList(ctx, siteId) {
  return pointsOfSite(ctx.db, siteId).map(p => reading(ctx.telemetry, p));
}

function series(ctx, siteId, codes, from, to, bucketSec = 1800) {
  const points = codes.map(c => pointByCode(ctx.db, siteId, c)).filter(Boolean);
  const ids = points.map(p => p.id);
  const types = {};
  for (const p of points) types[p.id] = p.type;
  const raw = ctx.telemetry.range(ids, from, to, bucketSec, types);
  const out = {};
  for (const p of points) {
    out[p.code] = (raw[p.id] || []).map(x => ({ t: x.t, v: x.v, q: x.q }));
  }
  return out;
}

function summarize(arr) {
  if (!arr || !arr.length) return { count: 0, min: null, max: null, avg: null, last: null };
  let min = Infinity, max = -Infinity, sum = 0, n = 0, last = null;
  for (const p of arr) {
    const v = Number(p.v);
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v); max = Math.max(max, v); sum += v; n++; last = v;
  }
  if (!n) return { count: 0, min: null, max: null, avg: null, last: null };
  return { count: n, min: round(min, 3), max: round(max, 3), avg: round(sum / n, 3), last: round(last, 3) };
}

/** 流量曲线积分（m³），首尾取半权重梯形法 */
function integrate(arr) {
  if (!arr || arr.length < 2) return 0;
  let v = 0;
  for (let i = 1; i < arr.length; i++) {
    const dt = (arr[i].t - arr[i - 1].t) / 3600000;
    v += ((Number(arr[i - 1].v) + Number(arr[i].v)) / 2) * dt;
  }
  return round(v, 3);
}

function counterDelta(arr) {
  if (!arr || arr.length < 2) return 0;
  const a = Number(arr[0].v), b = Number(arr[arr.length - 1].v);
  return Number.isFinite(a) && Number.isFinite(b) ? round(b - a, 3) : 0;
}

function deviceHealth(device, now = Date.now()) {
  if (!device) return null;
  const last = new Date(device.lastMaintAt || 0).getTime();
  const cycleMs = (device.maintCycleDays || 90) * 86400000;
  const elapsed = now - last;
  const daysToMaint = Math.round((cycleMs - elapsed) / 86400000);
  let score = 100;
  if (!device.online) score -= 35;
  if (daysToMaint < 0) score -= Math.min(30, 6 + Math.abs(daysToMaint) * 0.8);
  if (device.status === '故障' || device.status === '停机') score -= 30;
  if (device.status === '待机') score -= 2;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 85 ? 'good' : score >= 65 ? 'attention' : 'risk',
    daysToMaint,
    needMaint: daysToMaint <= 7,
    overdue: daysToMaint < 0,
    online: !!device.online,
  };
}

const UNIT_KEY_CODES = {
  raw: ['RAW.LVL', 'RAW.PUMP.RUN', 'RAW.PUMP.MODE'],
  grit: [],
  primary: [],
  dist1: ['FLOW.IN'],
  baf: ['BAF.PH', 'BAF.DO', 'BAF.DP', 'BAF.BW.STATE'],
  pac: ['PAC.LEVEL', 'PAC.DOSE', 'PAC.PUMP.RUN'],
  pam: ['PAM.LEVEL', 'PAM.DOSE', 'PAM.PUMP.RUN'],
  dist2: [],
  sulfur: ['SULFUR.PH', 'SULFUR.DO', 'SULFUR.P', 'SULFUR.BW.STATE'],
  clear: ['CLEAR.LVL'],
  waste: ['WASTE.LVL'],
  plant: ['POWER.KW', 'ENERGY.KWH'],
};

function unitCards(ctx, siteId) {
  const units = ctx.db.units.filter(u => u.siteId === siteId).sort((a, b) => a.order - b.order);
  const alarms = ctx.db.alarms.filter(a => a.siteId === siteId && (a.status === 'active' || a.status === 'acknowledged'));
  const devices = ctx.db.devices.filter(d => d.siteId === siteId);
  return units.map(u => {
    const codes = UNIT_KEY_CODES[u.code] || [];
    const readings = codes.map(c => reading(ctx.telemetry, pointByCode(ctx.db, siteId, c))).filter(Boolean);
    const unitAlarms = alarms.filter(a => a.unitCode === u.code);
    const unitDevices = devices.filter(d => d.unitCode === u.code);
    const installed = unitDevices.filter(d => d.status !== '未安装');
    const offline = installed.filter(d => !d.online);
    const anyStale = readings.some(r => r.stale);
    let status = 'normal';
    if (unitAlarms.some(a => a.level === 'critical' || a.level === 'major')) status = 'alarm';
    else if (unitAlarms.length) status = 'attention';
    else if (installed.length && offline.length === installed.length) status = 'offline';
    else if (installed.length && anyStale) status = 'stale';
    else if (!installed.length) status = 'no-instrument';
    return {
      code: u.code, name: u.name, short: u.short, kind: u.kind, order: u.order, note: u.note,
      status, alarms: unitAlarms.length,
      devices: { total: unitDevices.length, installed: installed.length, online: installed.filter(d => d.online).length },
      readings,
    };
  });
}

module.exports = {
  pointsOfSite, pointByCode, reading, latestList, series, summarize,
  integrate, counterDelta, deviceHealth, unitCards, UNIT_KEY_CODES,
};
