'use strict';
const { ApiError, ok } = require('./common');
const { iso } = require('../util');

const QUALITY = new Set(['good', 'uncertain', 'bad', 'stale']);
const MAX_READINGS = 1000;
const MAX_AGE_MS = 30 * 86400000;

function sameToken(candidate, expected) {
  const crypto = require('crypto');
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function register(router, app) {
  router.post('/api/ingest/v1/telemetry', async (ctx) => {
    const gatewayId = String(ctx.req.headers['x-xiaoyu-gateway'] || '');
    const gateway = app.gatewayConfig.get(gatewayId);
    if (!gateway || !sameToken(String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, ''), gateway.token)) {
      throw new ApiError(401, '网关身份验证失败', 'GATEWAY_UNAUTHORIZED');
    }

    const body = ctx.body || {};
    const eventId = String(body.eventId || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(eventId)) throw new ApiError(400, 'eventId 必须为 8 至 128 位唯一消息编号', 'BAD_EVENT_ID');
    if (!Array.isArray(body.readings) || body.readings.length < 1 || body.readings.length > MAX_READINGS) {
      throw new ApiError(400, `readings 必须包含 1 至 ${MAX_READINGS} 条数据`, 'BAD_READINGS');
    }

    const seen = app.ingestEventIds.get(gatewayId) || new Set();
    if (seen.has(eventId)) {
      ok(ctx.res, { gatewayId, siteId: gateway.siteId, eventId, duplicate: true, accepted: 0, receivedAt: iso() });
      return;
    }

    const site = ctx.db.sites.find((item) => item.id === gateway.siteId);
    if (!site) throw new ApiError(503, '该网关绑定的站点已不存在', 'GATEWAY_SITE_MISSING');
    const byCode = new Map(ctx.db.points.filter((point) => point.siteId === site.id).map((point) => [point.code, point]));
    const batchTime = body.observedAt == null ? null : Date.parse(body.observedAt);
    if (batchTime != null && !Number.isFinite(batchTime)) throw new ApiError(400, 'observedAt 不是有效时间', 'BAD_TIMESTAMP');

    const prepared = [];
    const codes = new Set();
    for (const item of body.readings) {
      const code = String(item && item.code || '').trim();
      const point = byCode.get(code);
      if (!point) throw new ApiError(422, `站点 ${site.id} 未配置点位 ${code || '(空)'}`, 'UNKNOWN_POINT', { code });
      if (codes.has(code)) throw new ApiError(400, `同一批次点位 ${code} 重复`, 'DUPLICATE_POINT', { code });
      codes.add(code);

      const value = item.value;
      if (!(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.length <= 80)) {
        throw new ApiError(400, `点位 ${code} 的 value 必须是有限数字或短字符串`, 'BAD_VALUE', { code });
      }
      const quality = item.quality || 'good';
      if (!QUALITY.has(quality)) throw new ApiError(400, `点位 ${code} 的 quality 不合法`, 'BAD_QUALITY', { code });
      const t = item.observedAt == null ? batchTime == null ? Date.now() : batchTime : Date.parse(item.observedAt);
      if (!Number.isFinite(t) || t > Date.now() + 5 * 60 * 1000 || t < Date.now() - MAX_AGE_MS) {
        throw new ApiError(400, `点位 ${code} 的采集时间超出允许范围`, 'TIMESTAMP_OUT_OF_RANGE', { code });
      }
      prepared.push({ point, value, quality, t });
    }

    const updates = [];
    for (const item of prepared) {
      const result = app.telemetry.ingest(item.point.id, item.value, { t: item.t, quality: item.quality, source: 'gateway' });
      if (result.latestChanged) updates.push({
        siteId: site.id, pointId: item.point.id, code: item.point.code,
        value: item.value, quality: item.quality, source: 'gateway', t: item.t,
      });
    }

    seen.add(eventId);
    if (seen.size > 2000) seen.delete(seen.values().next().value);
    app.ingestEventIds.set(gatewayId, seen);
    const receivedAt = Date.now();
    if (updates.length) {
      app.hub.broadcast({ type: 'telemetry', updates, t: receivedAt });
      app.rules.evaluate(receivedAt);
    }
    app.log.info?.(`[ingest] ${gatewayId} ${site.id}: ${updates.length} 点位，event ${eventId}`);
    ok(ctx.res, { gatewayId, siteId: site.id, eventId, duplicate: false, accepted: prepared.length, latestUpdated: updates.length, receivedAt: iso(receivedAt) });
  });
}

module.exports = { register };
