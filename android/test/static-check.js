#!/usr/bin/env node
/**
 * 本机模式的静态核对（不需要 Android 设备/模拟器）：
 *   1) LocalDb 建表覆盖需求里的 10 张表；
 *   2) LocalDb / LocalApi / LocalEngine 里出现的 SQL 表名都在建表语句中；
 *   3) ContentValues 写入的列名都在对应表的列里；
 *   4) 页面实际调用的 /api/* 路径，LocalApi.respond 都有对应分支；
 *   5) 引擎确实是 5 秒一次 + HandlerThread；Manifest 版本号已更新。
 *
 * 用法：node test/static-check.js
 * 输出 "STATIC-CHECK pass=N fail=N"，有失败退出码 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'com', 'ln334', 'zhifuwater');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const localDb = read('LocalDb.java');
const localApi = read('LocalApi.java');
const localEngine = read('LocalEngine.java');
const localCore = read('LocalCore.java');
const manifest = fs.readFileSync(path.join(ROOT, 'AndroidManifest.xml'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name) => { pass++; console.log('  ok   ' + name); };
const bad = (name, detail) => { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); };
const check = (name, cond, detail) => cond ? ok(name) : bad(name, detail);

/* ---------------- 1. 建表 ---------------- */

const schema = {};
const createRe = /"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([^"]*)\)"/g;
let m;
while ((m = createRe.exec(localDb)) !== null) {
  const table = m[1];
  const cols = new Set();
  m[2].split(',').forEach((part) => {
    const mm = part.trim().match(/^["`]?([a-z_][a-z0-9_]*)["`]?\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)/i);
    if (mm && !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT)$/i.test(mm[1])) cols.add(mm[1]);
  });
  schema[table] = cols;
}

const REQUIRED = ['sites', 'points', 'telemetry', 'alarms', 'alarm_rules', 'workorders',
  'inspections', 'inspection_items', 'notifications', 'meta'];
const tables = Object.keys(schema);
check('建表数量 ≥ 10（实际 ' + tables.length + '）', tables.length >= 10);
REQUIRED.forEach((t) => check('表 ' + t + ' 存在', !!schema[t]));

/* ---------------- 2. SQL 表名 ---------------- */

const sqlText = [localDb, localApi, localEngine].join('\n');
const sqlTables = new Set();
const tblRe = /\b(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+["`]?([a-z_][a-z0-9_]*)/gi;
while ((m = tblRe.exec(sqlText)) !== null) {
  const name = m[1].toLowerCase();
  if (['select', 'where', 'set', 'values', 'table', 'if', 'not', 'exists', 'group', 'order'].includes(name)) continue;
  sqlTables.add(name);
}
const unknownTables = [...sqlTables].filter((t) => !schema[t]);
check('SQL 引用的表都在 schema 里（' + sqlTables.size + ' 个）', unknownTables.length === 0,
  unknownTables.join(','));

/* ---------------- 3. ContentValues 列名 ---------------- */

const badCols = [];
// ContentValues 变量名，只有这些变量的 put 才是在写列（raw.put("t") 之类是 JSON 字段，不能算）
const cvVars = new Set();
const cvVarRe = /ContentValues\s+(\w+)\s*=/g;
let cvVar;
while ((cvVar = cvVarRe.exec(localDb)) !== null) cvVars.add(cvVar[1]);

const writeRe = /\b(insertWithOnConflict|insert|update)\(\s*"([a-z_]+)"/g;
let w;
while ((w = writeRe.exec(localDb)) !== null) {
  const table = w[2];
  const at = w.index;
  const cvIdx = localDb.lastIndexOf('new ContentValues()', at);
  if (cvIdx < 0) continue;
  const between = localDb.slice(cvIdx, at);
  // 这个 ContentValues 必须就是本次写入用的那一个（中间不能再夹别的写库调用）
  if (/\b(insertWithOnConflict|insert|update)\(\s*"/.test(between.replace(/new ContentValues\(\)/, ''))) continue;
  const putRe = /\b([a-zA-Z_]\w*)\.put\(\s*"([a-z_]+)"/g;
  let p;
  while ((p = putRe.exec(between)) !== null) {
    if (!cvVars.has(p[1])) continue;
    if (!schema[table] || !schema[table].has(p[2])) badCols.push(table + '.' + p[2]);
  }
}
check('ContentValues 列名都存在', badCols.length === 0, badCols.slice(0, 8).join(','));

/* ---------------- 4. 路由覆盖 ---------------- */

const pageFiles = fs.readdirSync(SRC).filter((f) => /Page\.java$|Activity\.java$/.test(f));
const routes = new Set();
pageFiles.forEach((f) => {
  const text = read(f);
  const re = /Api\.(?:get|post)\(\s*\w+\s*,\s*"([^"]+)"/g;
  let r;
  while ((r = re.exec(text)) !== null) {
    routes.add(r[1].split('?')[0]);
  }
});

const apiCalls = [...routes].sort();
const supported = (p) => {
  const seg = p.replace(/^\/+|\/+$/g, '').split('/');
  if (seg[0] !== 'api') return false;
  const t = seg[1];
  if (t === 'auth' && seg[2] === 'me') return true;
  if (t === 'auth' && seg[2] === 'login') return true;
  if (t === 'sites' && seg.length === 2) return true;
  if (t === 'overview' && seg.length === 2) return true;
  if (t === 'alarms' && seg.length === 2) return true;
  if (t === 'alarms' && seg.length === 4 && ['ack', 'resolve', 'close'].includes(seg[3])) return true;
  if (t === 'workorders' && seg.length === 2) return true;
  if (t === 'workorders' && seg.length === 4 && ['accept', 'start', 'finish', 'verify'].includes(seg[3])) return true;
  if (t === 'inspections' && seg.length === 2) return true;
  if (t === 'inspections' && seg.length === 3) return true;
  if (t === 'inspections' && seg.length === 4 && seg[3] === 'submit') return true;
  if (t === 'points' && seg.length === 2) return true;
  if (t === 'telemetry' && (seg[2] === 'latest' || seg[2] === 'history')) return true;
  if (t === 'devices' && seg.length === 2) return true;
  if (t === 'lab' && seg.length === 2) return true;
  if (t === 'lab' && seg[2] === 'stats' && seg.length === 3) return true;
  if (t === 'lab' && seg.length === 4 && seg[3] === 'review') return true;
  if (t === 'diagnosis' && seg.length === 2) return true;
  return false;
};

const unsupported = apiCalls.filter((p) => !supported(p));
check('页面调用的 ' + apiCalls.length + ' 条路径 LocalApi 都能处理', unsupported.length === 0,
  unsupported.join(' '));

// LocalApi 里也要真的出现这些动作字面量，避免 supported() 只是脚本的空想
['"ack"', '"submit"', '"me"', '"overview"', '"sites"', '"alarms"', '"workorders"',
  '"inspections"', '"notifications"', '"points"', '"telemetry"', '"devices"',
  '"lab"', '"diagnosis"'].forEach((lit) => {
  check('LocalApi 含分支字面量 ' + lit, localApi.includes(lit));
});
// 工单动作在 LocalApi 里走 LocalCore 常量 → workorderAction，核对常量与调用都在
['ACTION_ACCEPT', 'ACTION_START', 'ACTION_FINISH', 'ACTION_VERIFY'].forEach((c) => {
  check('LocalCore 定义动作常量 ' + c, localCore.includes('public static final String ' + c));
});
check('LocalApi 调用了 workorderAction', /workorderAction\(/.test(localApi));

/* ---------------- 5. 引擎与版本 ---------------- */

check('引擎 tick 间隔 5000ms', /TICK_MS\s*=\s*5000L/.test(localEngine));
check('引擎使用 HandlerThread', /new HandlerThread\(/.test(localEngine));
check('引擎持久化 last_tick', /"last_tick"/.test(localEngine));
check('引擎写 notifications', /notifications/.test(localEngine));
check('本地库从 assets/demo 导入', /"demo\/"\s*\+\s*name|getAssets\(\)\.open\("demo\//.test(localDb));
const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8').replace(/^\uFEFF/, ''),
).version;
const manifestCode = /android:versionCode="(\d+)"/.exec(manifest);
const manifestName = /android:versionName="([^"]+)"/.exec(manifest);
check('Manifest versionCode 是正整数', !!manifestCode && Number(manifestCode[1]) > 0,
  manifestCode ? manifestCode[1] : 'missing');
check('Manifest versionName 与 package.json 一致（' + pkgVersion + '）',
  !!manifestName && manifestName[1] === pkgVersion, manifestName ? manifestName[1] : 'missing');

check('规则含 5 分钟持续判定', /5 \* MINUTE/.test(localCore));

console.log('STATIC-CHECK pass=' + pass + ' fail=' + fail);
if (fail > 0) process.exit(1);
