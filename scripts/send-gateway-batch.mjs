#!/usr/bin/env node
/**
 * 只读网关批次联调工具：把网关/PLC 适配程序已经采集并映射好的 JSON 批次推给小禹。
 * 不读取 PLC、不生成模拟值、不发送任何设备控制命令；用于首站接入和现场排错。
 * 用法：设置 XIAOYU_URL、XIAOYU_GATEWAY_ID、XIAOYU_GATEWAY_TOKEN 后，
 *       node scripts/send-gateway-batch.mjs path/to/batch.json
 */
import fs from 'node:fs';

const [file] = process.argv.slice(2);
const baseUrl = process.env.XIAOYU_URL;
const gatewayId = process.env.XIAOYU_GATEWAY_ID;
const token = process.env.XIAOYU_GATEWAY_TOKEN;

function fail(message) {
  console.error(`[gateway-push] ${message}`);
  process.exit(1);
}

if (!file) fail('请提供 JSON 批次文件路径');
if (!baseUrl || !gatewayId || !token) {
  fail('请设置 XIAOYU_URL、XIAOYU_GATEWAY_ID、XIAOYU_GATEWAY_TOKEN 环境变量');
}
if (token.length < 32) fail('网关 Token 至少需要 32 个字符');

let url;
try {
  url = new URL('/api/ingest/v1/telemetry', baseUrl);
} catch {
  fail('XIAOYU_URL 不是有效 URL');
}
if (!['http:', 'https:'].includes(url.protocol)) fail('XIAOYU_URL 仅支持 HTTP 或 HTTPS');

let batch;
try {
  batch = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`无法读取 JSON 批次：${error.message}`);
}
if (!batch || typeof batch !== 'object' || Array.isArray(batch)) fail('批次内容必须是 JSON 对象');

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-xiaoyu-gateway': gatewayId,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 1000) }; }
  console.log(JSON.stringify({ httpStatus: response.status, ...result }, null, 2));
  if (!response.ok || result.ok === false) process.exitCode = 1;
} catch (error) {
  fail(`发送失败：${error.name === 'TimeoutError' ? '连接超时' : error.message}`);
}
