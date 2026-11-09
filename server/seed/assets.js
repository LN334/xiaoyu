'use strict';
/**
 * 种子数据（一）：站点、工艺单元、设备、点位、账号与角色。
 * 基准严格对应《智赋乡水 · 智慧水处理平台建设方案 V2.2》第 3 章图纸信息：
 * 进水调节池 → 格栅池 → 序批预氧化池 → 配水槽1 → BAF → PAC → PAM → 中间水池 → 自养脱氮 → 清水池 → 废水箱。
 */
const { hashPassword } = require('../util');

const DEMO_PASSWORD = 'water123';

const UNITS = [
  { code: 'raw', name: '进水调节池', short: '进水调节池', kind: 'tank', note: '图纸标出液位测点 L；提升泵与液位计联锁。' },
  { code: 'grit', name: '格栅池', short: '格栅池', kind: 'basin', note: '图纸未标注在线仪表，平台仅呈现单元状态与人工巡检入口。' },
  { code: 'primary', name: '序批预氧化池', short: '序批预氧化池', kind: 'basin', note: '图纸未标注在线仪表，以人工巡检与清理记录为主。' },
  { code: 'dist1', name: '配水槽1', short: '配水槽1', kind: 'basin', note: '图纸未确认独立液位/流量仪表；流量计为演示选配。' },
  { code: 'baf', name: '固液分离池', short: 'BAF', kind: 'filter', note: '图纸标注 pH、DO；DO 与曝气装置联锁；定期反冲洗。' },
  { code: 'pac', name: 'PAC 加药池', short: 'PAC', kind: 'dosing', note: 'PAC 配药/反应单元；加药计量为演示配置。' },
  { code: 'pam', name: 'PAM 加药池', short: 'PAM', kind: 'dosing', note: 'PAM 配药/反应单元，与 PAC 分开管理。' },
  { code: 'dist2', name: '中间水池', short: '中间水池', kind: 'basin', note: '自养脱氮池配水单元。' },
  { code: 'sulfur', name: '自养脱氮池', short: '自养脱氮池', kind: 'filter', note: '图纸标注 pH、DO，反冲洗管路附近标 P；先气冲、后气水联合冲洗。' },
  { code: 'clear', name: '清水池', short: '清水池', kind: 'storage', note: '图纸标明储存用途；液位计为演示选配。' },
  { code: 'waste', name: '废水水箱', short: '废水箱', kind: 'storage', note: '收集反冲洗废水等；液位计为演示选配。' },
  { code: 'plant', name: '公共系统与自控', short: '自控', kind: 'plant', note: 'PLC、边缘网关、配电自控柜与计量。' },
];

const SITES = [
  {
    id: 'site-1',
    name: '安吉·鲁家村示范站',
    shortName: '鲁家村示范站',
    region: '华东 · 浙江',
    area: '湖州市安吉县',
    address: '浙江省湖州市安吉县递铺街道鲁家村',
    lat: 30.6381, lng: 119.6802,
    process: '序批式预氧化 - 固液分离耦合自养深度脱氮',
    capacity: '100 L/h（0.1 m³/h）',
    deviceRef: '100 L/h 污水处理实验展示装置',
    commissionedAt: '2026-08-18',
    contact: '王敏  138****6621',
    status: 'online',
    note: '一期示范站点，按实际装置图纸完成全量点位适配。',
  },
  {
    id: 'site-2',
    name: '黟县·碧山复制试点站',
    shortName: '碧山试点站',
    region: '华东 · 安徽',
    area: '黄山市黟县',
    address: '安徽省黄山市黟县碧阳镇碧山村',
    lat: 29.9326, lng: 117.8721,
    process: '序批式预氧化 - 固液分离耦合自养深度脱氮（复制）',
    capacity: '100 L/h（0.1 m³/h）',
    deviceRef: '100 L/h 装置复制试点',
    commissionedAt: '2026-09-26',
    contact: '陈浩  139****3382',
    status: 'online',
    note: '按同一工艺模板复制，仪表分批接入；部分选配点位尚未安装。',
  },
];

/** 设备模板 */
function devicesFor(siteId) {
  const full = siteId === 'site-1';
  const list = [
    ['raw-level', 'LT-101', '进水调节池液位计', 'raw', 'METER', '投入式液位计', '0–100 %', '2026-08-18', '在线'],
    ['raw-pump', 'P-101', '进水调节池提升泵', 'raw', 'PUMP', 'CDLF2-40 不锈钢多级泵', '扬程 40 m / 0.75 kW', '2026-08-18', '运行'],
    ['flow', 'FT-101', '配水槽1电磁流量计', 'dist1', 'METER', 'LDG-15 电磁流量计', '0–0.5 m³/h', '2026-09-02', full ? '在线' : '未安装'],
    ['baf-ph', 'pH-201', 'BAF pH 在线分析仪', 'baf', 'METER', 'pH-3000 工业在线 pH', '0–14 pH', '2026-08-18', '在线'],
    ['baf-do', 'DO-201', '预氧化溶解氧仪', 'baf', 'METER', '荧光法 DO 变送器', '0–20 mg/L', '2026-08-18', '在线'],
    ['baf-blower', 'B-201', '预氧化曝气风机', 'baf', 'BLOWER', '回转式鼓风机 HC-30S', '0.75 kW', '2026-08-18', '运行'],
    ['baf-bw-pump', 'P-202', '固液分离反冲泵', 'baf', 'PUMP', '卧式离心泵 IS50-32', '1.5 kW', '2026-08-18', '待机'],
    ['baf-bw-valve', 'V-203', '固液分离反冲排水阀', 'baf', 'VALVE', '电动蝶阀 DN50', 'AC220V', '2026-08-18', '关闭'],
    ['baf-dp', 'DP-201', '固液分离压差变送器', 'baf', 'METER', '差压变送器 3051', '0–50 kPa', '2026-09-02', full ? '在线' : '未安装'],
    ['pac-pump', 'P-301', 'PAC 加药泵', 'pac', 'DOSER', '隔膜计量泵 GM-1', '0–2.5 L/h', '2026-08-18', '运行'],
    ['pac-mixer', 'M-302', 'PAC 搅拌器', 'pac', 'MIXER', '立式搅拌机 0.37 kW', '0.37 kW', '2026-08-18', '运行'],
    ['pam-pump', 'P-401', 'PAM 加药泵', 'pam', 'DOSER', '隔膜计量泵 GM-0.5', '0–1 L/h', '2026-08-18', '运行'],
    ['pam-mixer', 'M-402', 'PAM 搅拌器', 'pam', 'MIXER', '立式搅拌机 0.37 kW', '0.37 kW', '2026-08-18', '运行'],
    ['sulfur-ph', 'pH-501', '自养脱氮池 pH 在线分析仪', 'sulfur', 'METER', 'pH-3000 工业在线 pH', '0–14 pH', '2026-08-18', '在线'],
    ['sulfur-do', 'DO-501', '自养脱氮池溶解氧仪', 'sulfur', 'METER', '荧光法 DO 变送器', '0–20 mg/L', '2026-08-18', '在线'],
    ['sulfur-p', 'PT-501', '反冲洗管路压力变送器', 'sulfur', 'METER', '压力变送器 2088', '0–1.0 MPa', '2026-08-18', '在线'],
    ['sulfur-bw-pump', 'P-501', '自养脱氮池反冲洗泵', 'sulfur', 'PUMP', '卧式离心泵 IS50-32', '1.5 kW', '2026-08-18', full ? '待机' : '未安装'],
    ['sulfur-bw-valve', 'V-502', '自养脱氮池反冲洗排水阀', 'sulfur', 'VALVE', '电动蝶阀 DN50', 'AC220V', '2026-08-18', full ? '关闭' : '未安装'],
    ['sulfur-dp', 'DP-501', '自养脱氮池压差变送器', 'sulfur', 'METER', '差压变送器 3051', '0–50 kPa', '2026-09-02', full ? '在线' : '未安装'],
    ['clear-level', 'LT-601', '清水池液位计', 'clear', 'METER', '投入式液位计', '0–100 %', '2026-09-02', full ? '在线' : '未安装'],
    ['waste-level', 'LT-701', '废水箱液位计', 'waste', 'METER', '投入式液位计', '0–100 %', '2026-09-02', full ? '在线' : '未安装'],
    ['power', 'PM-801', '配电智能电表', 'plant', 'METER', '三相智能电表 DTSU666', '0–10 kW', '2026-08-18', '在线'],
    ['plc', 'PLC-1', 'PLC 控制柜', 'plant', 'PLC', 'S7-1200 CPU 1214C', 'DI/DO/AI 扩展', '2026-08-18', '运行'],
    ['gw', 'GW-1', '边缘网关', 'plant', 'GATEWAY', '智赋 EG-200 边缘网关', 'Modbus RTU/TCP · MQTT', '2026-08-18', '在线'],
  ];
  return list.map(([key, code, name, unit, type, model, spec, installDate, status]) => ({
    id: `dev-${siteId}-${key}`,
    siteId,
    unitCode: unit,
    code,
    key,
    name,
    type,
    model,
    spec,
    vendor: type === 'METER' ? '杭州米科传感' : type === 'PLC' ? '西门子（中国）' : type === 'GATEWAY' ? '小禹' : '南方泵业',
    protocol: type === 'PLC' ? 'S7 协议 / Modbus TCP' : type === 'GATEWAY' ? 'MQTT over TLS' : 'Modbus RTU (RS-485)',
    installDate,
    status,
    online: !(status === '未安装'),
    runtimeHours: 900 + Math.round(Math.random() * 300),
    starts: 40 + Math.round(Math.random() * 60),
    maintCycleDays: type === 'METER' ? 180 : 90,
    // 默认最近保养 9-20；两台泵按真实运维节奏留出「关注」样本（逾期保养）
    lastMaintAt: key === 'baf-bw-pump' ? '2026-06-20' : key === 'pac-pump' ? '2026-06-01' : '2026-09-20',
    warrantyUntil: '2028-08-18',
    plAddress: `%IW${64 + Math.floor(Math.random() * 20)}`,
  }));
}

/** 点位定义模板：[key, code, name, unitCode, deviceKey, unit, type, opts] */
function pointDefs(siteId) {
  const full = siteId === 'site-1';
  const defs = [
    ['raw-lvl', 'RAW.LVL', '进水调节池液位', 'raw', 'raw-level', '%', 'measure', { range: [0, 100], acc: '±0.5 %FS', prov: 'drawing', desc: '图纸标注液位测点 L；与提升泵联锁' }],
    ['raw-pump-run', 'RAW.PUMP.RUN', '提升泵运行状态', 'raw', 'raw-pump', '', 'state', { range: [0, 1], prov: 'drawing', writable: 'read' }],
    ['raw-pump-fault', 'RAW.PUMP.FAULT', '提升泵故障信号', 'raw', 'raw-pump', '', 'state', { range: [0, 1], prov: 'drawing' }],
    ['raw-pump-mode', 'RAW.PUMP.MODE', '提升泵运行模式', 'raw', 'raw-pump', '', 'state', { range: [0, 1], prov: 'drawing', desc: '0=自动 1=手动（现场）' }],
    ['raw-pump-hours', 'RAW.PUMP.HOURS', '提升泵累计运行时长', 'raw', 'raw-pump', 'h', 'counter', { prov: 'gateway' }],
    ['raw-pump-starts', 'RAW.PUMP.STARTS', '提升泵启动次数', 'raw', 'raw-pump', '次', 'counter', { prov: 'gateway' }],
    ['flow', 'FLOW.IN', '进水瞬时流量', 'dist1', 'flow', 'm³/h', 'measure', { range: [0, 0.5], acc: '±0.5 %FS', prov: 'optional', desc: '演示选配：图纸未确认在线流量计' }],
    ['baf-ph', 'BAF.PH', '固液分离出水 pH', 'baf', 'baf-ph', 'pH', 'measure', { range: [0, 14], acc: '±0.02 pH', prov: 'drawing' }],
    ['baf-do', 'BAF.DO', '预氧化溶解氧', 'baf', 'baf-do', 'mg/L', 'measure', { range: [0, 20], acc: '±0.1 mg/L', prov: 'drawing', desc: '与曝气装置联锁' }],
    ['baf-blower-run', 'BAF.BLOWER.RUN', '曝气风机运行状态', 'baf', 'baf-blower', '', 'state', { range: [0, 1], prov: 'drawing' }],
    ['baf-blower-current', 'BAF.BLOWER.CURRENT', '曝气风机电流', 'baf', 'baf-blower', 'A', 'measure', { range: [0, 5], prov: 'optional' }],
    ['baf-bw-state', 'BAF.BW.STATE', '固液分离反冲阶段', 'baf', 'baf-bw-pump', '', 'state', { range: [0, 3], prov: 'drawing', desc: '0=空闲 1=气冲 2=气水联合 3=漂洗' }],
    ['baf-bw-count', 'BAF.BW.COUNT', '固液分离反冲累计次数', 'baf', 'baf-bw-pump', '次', 'counter', { prov: 'gateway' }],
    ['baf-dp', 'BAF.DP', '固液分离压差', 'baf', 'baf-dp', 'kPa', 'measure', { range: [0, 50], acc: '±0.1 kPa', prov: 'optional' }],
    ['pac-run', 'PAC.PUMP.RUN', 'PAC 加药泵状态', 'pac', 'pac-pump', '', 'state', { range: [0, 1], prov: 'optional' }],
    ['pac-dose', 'PAC.DOSE', 'PAC 投加设定', 'pac', 'pac-pump', 'L/h', 'setpoint', { range: [0, 0.2], prov: 'optional', writable: 'rw' }],
    ['pac-level', 'PAC.LEVEL', 'PAC 药箱液位', 'pac', 'pac-pump', '%', 'measure', { range: [0, 100], prov: 'optional' }],
    ['pac-total', 'PAC.TOTAL', 'PAC 累计投加量', 'pac', 'pac-pump', 'L', 'counter', { prov: 'optional' }],
    ['pac-mixer', 'PAC.MIXER.RUN', 'PAC 搅拌器状态', 'pac', 'pac-mixer', '', 'state', { range: [0, 1], prov: 'optional' }],
    ['pam-run', 'PAM.PUMP.RUN', 'PAM 加药泵状态', 'pam', 'pam-pump', '', 'state', { range: [0, 1], prov: 'optional' }],
    ['pam-dose', 'PAM.DOSE', 'PAM 投加设定', 'pam', 'pam-pump', 'L/h', 'setpoint', { range: [0, 0.1], prov: 'optional', writable: 'rw' }],
    ['pam-level', 'PAM.LEVEL', 'PAM 药箱液位', 'pam', 'pam-pump', '%', 'measure', { range: [0, 100], prov: 'optional' }],
    ['pam-total', 'PAM.TOTAL', 'PAM 累计投加量', 'pam', 'pam-pump', 'L', 'counter', { prov: 'optional' }],
    ['pam-mixer', 'PAM.MIXER.RUN', 'PAM 搅拌器状态', 'pam', 'pam-mixer', '', 'state', { range: [0, 1], prov: 'optional' }],
    ['sulfur-ph', 'SULFUR.PH', '自养脱氮池 pH', 'sulfur', 'sulfur-ph', 'pH', 'measure', { range: [0, 14], acc: '±0.02 pH', prov: 'drawing' }],
    ['sulfur-do', 'SULFUR.DO', '自养脱氮池溶解氧', 'sulfur', 'sulfur-do', 'mg/L', 'measure', { range: [0, 20], acc: '±0.1 mg/L', prov: 'drawing' }],
    ['sulfur-p', 'SULFUR.P', '反冲洗管路压力', 'sulfur', 'sulfur-p', 'MPa', 'measure', { range: [0, 1], acc: '±0.5 %FS', prov: 'drawing', desc: '图纸 P 符号，类型已按压力变送器配置' }],
    ['sulfur-bw-state', 'SULFUR.BW.STATE', '自养脱氮池反冲洗阶段', 'sulfur', 'sulfur-bw-pump', '', 'state', { range: [0, 3], prov: 'drawing' }],
    ['sulfur-bw-count', 'SULFUR.BW.COUNT', '自养脱氮池反冲洗累计次数', 'sulfur', 'sulfur-bw-pump', '次', 'counter', { prov: 'gateway' }],
    ['sulfur-dp', 'SULFUR.DP', '自养脱氮池压差', 'sulfur', 'sulfur-dp', 'kPa', 'measure', { range: [0, 50], acc: '±0.1 kPa', prov: 'optional' }],
    ['clear-lvl', 'CLEAR.LVL', '清水池液位', 'clear', 'clear-level', '%', 'measure', { range: [0, 100], prov: 'optional' }],
    ['waste-lvl', 'WASTE.LVL', '废水箱液位', 'waste', 'waste-level', '%', 'measure', { range: [0, 100], prov: 'optional' }],
    ['power-kw', 'POWER.KW', '装置实时功率', 'plant', 'power', 'kW', 'measure', { range: [0, 10], prov: 'optional' }],
    ['energy-kwh', 'ENERGY.KWH', '装置累计用电量', 'plant', 'power', 'kWh', 'counter', { prov: 'optional' }],
  ];
  const skipForLite = new Set([
    'raw-pump-fault', 'raw-pump-mode', 'raw-pump-hours', 'raw-pump-starts',
    'baf-blower-current', 'baf-bw-state', 'baf-bw-count', 'baf-dp',
    'pac-level', 'pac-total', 'pac-mixer', 'pam-level', 'pam-total', 'pam-mixer',
    'sulfur-bw-state', 'sulfur-bw-count', 'sulfur-dp', 'clear-lvl', 'waste-lvl',
  ]);
  const rows = full ? defs : defs.filter(d => !skipForLite.has(d[0]));
  return rows.map(([key, code, name, unitCode, deviceKey, unit, type, opts = {}]) => ({
    id: `pt-${siteId}-${key}`,
    siteId,
    unitCode,
    deviceId: `dev-${siteId}-${deviceKey}`,
    key,
    code,
    name,
    unit,
    type,
    range: opts.range || null,
    accuracy: opts.acc || null,
    intervalSec: type === 'counter' || type === 'setpoint' ? 60 : 10,
    writable: opts.writable || 'read',
    provenance: opts.prov || 'gateway',
    source: 'gateway',
    desc: opts.desc || '',
  }));
}

function makeUsers() {
  const h = hashPassword(DEMO_PASSWORD);
  return [
    { id: 'u-1', username: 'admin', name: '平台管理员', role: 'super', title: '平台超级管理员', phone: '138****0001', siteIds: ['site-1', 'site-2'], status: 'active', password: h, createdAt: '2026-08-01T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-2', username: 'wang', name: '王敏', role: 'region', title: '区域管理员 · 华东', phone: '138****6621', siteIds: ['site-1', 'site-2'], status: 'active', password: h, createdAt: '2026-08-02T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-3', username: 'li', name: '李工', role: 'process', title: '工艺负责人', phone: '137****2140', siteIds: ['site-1'], status: 'active', password: h, createdAt: '2026-08-03T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-4', username: 'zhao', name: '赵磊', role: 'operator', title: '运维值班人员', phone: '136****7782', siteIds: ['site-1'], status: 'active', password: h, createdAt: '2026-08-05T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-5', username: 'chen', name: '陈浩', role: 'maintainer', title: '现场维修人员', phone: '139****3382', siteIds: ['site-1', 'site-2'], status: 'active', password: h, createdAt: '2026-08-06T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-6', username: 'guest', name: '监管访客', role: 'viewer', title: '只读 / 监管查看', phone: '135****9008', siteIds: ['site-1'], status: 'active', password: h, createdAt: '2026-08-08T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-7', username: 'sun', name: '孙倩', role: 'operator', title: '运维值班人员 · 碧山', phone: '135****2287', siteIds: ['site-2'], status: 'active', password: h, createdAt: '2026-09-26T02:00:00.000Z', lastLoginAt: null },
    { id: 'u-8', username: 'zhou', name: '周涛', role: 'maintainer', title: '现场维修人员 · 碧山', phone: '137****5531', siteIds: ['site-2'], status: 'inactive', password: h, createdAt: '2026-09-26T02:00:00.000Z', lastLoginAt: null },
  ];
}

const ROLES = {
  super: {
    name: '平台超级管理员',
    desc: '全平台数据、配置与账号权限；关键变更可按流程复核。',
    perms: ['view', 'control', 'alarm.handle', 'workorder.handle', 'param.edit', 'report.export', 'lab.review', 'inspection.execute', 'admin.users', 'admin.config', 'admin.audit'],
    sites: 'all',
  },
  region: {
    name: '区域管理员',
    desc: '授权区域内的派单、复核、参数申请与账号管理。',
    perms: ['view', 'control', 'alarm.handle', 'workorder.handle', 'param.edit', 'report.export', 'lab.review', 'inspection.execute', 'admin.users'],
    sites: 'assigned',
  },
  process: {
    name: '工艺负责人',
    desc: '工艺参数审核、告警研判与水质报表，不管理账号。',
    perms: ['view', 'alarm.handle', 'param.edit', 'report.export', 'lab.review'],
    sites: 'assigned',
  },
  operator: {
    name: '运维值班人员',
    desc: '值班范围内确认告警、派单、处理反馈与授权设备控制。',
    perms: ['view', 'control', 'alarm.handle', 'workorder.handle', 'report.export', 'inspection.execute'],
    sites: 'assigned',
  },
  maintainer: {
    name: '现场维修人员',
    desc: '接单、维修与上传证据；原则上不开放云端控制。',
    perms: ['view', 'workorder.handle', 'inspection.execute', 'report.export'],
    sites: 'assigned',
  },
  viewer: {
    name: '只读 / 监管查看',
    desc: '授权站点只读查看与授权范围内报表。',
    perms: ['view'],
    sites: 'assigned',
  },
};

function seedAssets(now) {
  const sites = SITES.map(s => ({ ...s }));
  const units = [];
  for (const site of sites) {
    UNITS.forEach((u, i) => {
      units.push({
        id: `unit-${site.id}-${u.code}`,
        siteId: site.id,
        code: u.code,
        name: u.name,
        short: u.short,
        kind: u.kind,
        order: i + 1,
        note: u.note,
      });
    });
  }
  const devices = sites.flatMap(s => devicesFor(s.id));
  const points = sites.flatMap(s => pointDefs(s.id));
  return { sites, units, devices, points, users: makeUsers(), roles: ROLES, demoPassword: DEMO_PASSWORD };
}

module.exports = { seedAssets, UNITS, SITES, ROLES, DEMO_PASSWORD };
