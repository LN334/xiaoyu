'use strict';
/**
 * 种子数据（二）：告警、规则、工单、巡检、化验、参数、审计、通知、通道、设置。
 * 时间均以首次启动时刻为基准向前回溯，便于演示时看到「最近发生」。
 */
const { round } = require('../util');

const M = 60000;
const H = 3600000;
const D = 86400000;

function seedOps(now, assets) {
  const { sites, devices, users, points } = assets;
  const iso = t => new Date(t).toISOString();
  const site1 = 'site-1';
  const site2 = 'site-2';
  const dev = key => devices.find(d => d.siteId === site1 && d.key === key) || {};
  const user = id => users.find(u => u.id === id) || {};

  /* ---------------- 告警规则 ---------------- */
  const alarmRules = [
    { key: 'sulfur-ph-low', siteId: '*', pointCode: 'SULFUR.PH', name: '硫自养池 pH 低于运行区间', op: 'outside', low: 6.8, high: 7.6, level: 'major', durationSec: 300, hysteresis: 0.1, escalateSec: 1800, unit: 'pH', enabled: true, desc: '硫自养反硝化对 pH 敏感，超出 6.8–7.6 且持续 5 分钟触发；30 分钟未处理升级。' },
    { key: 'baf-ph-high', siteId: '*', pointCode: 'BAF.PH', name: 'BAF 出水 pH 偏高', op: 'high', high: 8.2, level: 'minor', durationSec: 300, hysteresis: 0.05, escalateSec: 3600, unit: 'pH', enabled: true, desc: '硝化过程消耗碱度，pH 持续偏高需核查进水碱度与曝气量。' },
    { key: 'baf-do-low', siteId: '*', pointCode: 'BAF.DO', name: 'BAF 溶解氧不足', op: 'low', low: 2.0, level: 'major', durationSec: 240, hysteresis: 0.2, escalateSec: 900, unit: 'mg/L', enabled: true, desc: 'DO 低于 2.0 mg/L 持续 4 分钟，联动检查曝气风机与曝气头。' },
    { key: 'baf-do-high', siteId: '*', pointCode: 'BAF.DO', name: 'BAF 溶解氧偏高', op: 'high', high: 6.5, level: 'minor', durationSec: 600, hysteresis: 0.2, escalateSec: 3600, unit: 'mg/L', enabled: true, desc: 'DO 长时间偏高说明曝气过量，增加能耗并可能影响反硝化。' },
    { key: 'sulfur-do-low', siteId: '*', pointCode: 'SULFUR.DO', name: '硫自养池溶解氧偏低', op: 'low', low: 0.5, level: 'minor', durationSec: 600, hysteresis: 0.1, escalateSec: 3600, unit: 'mg/L', enabled: true, desc: '硫自养反硝化宜低氧运行，但过低需确认进水与循环。' },
    { key: 'raw-level-low', siteId: '*', pointCode: 'RAW.LVL', name: '原料罐液位偏低', op: 'low', low: 25, level: 'major', durationSec: 120, hysteresis: 2, escalateSec: 900, unit: '%', enabled: true, desc: '液位低于 25% 触发提醒；低于 20% 时由提升泵低液位保护联锁停机，避免空转。' },
    { key: 'raw-level-high', siteId: '*', pointCode: 'RAW.LVL', name: '原料罐液位偏高', op: 'high', high: 90, level: 'minor', durationSec: 300, hysteresis: 2, escalateSec: 3600, unit: '%', enabled: true, desc: '液位高于 90% 提示进水异常或提升泵未启动。' },
    { key: 'pac-level-low', siteId: '*', pointCode: 'PAC.LEVEL', name: 'PAC 药箱液位偏低', op: 'low', low: 20, level: 'minor', durationSec: 60, hysteresis: 2, escalateSec: 1800, unit: '%', enabled: true, desc: '药箱低于 20% 提醒配药，避免计量泵空转。' },
    { key: 'pam-level-low', siteId: '*', pointCode: 'PAM.LEVEL', name: 'PAM 药箱液位偏低', op: 'low', low: 20, level: 'minor', durationSec: 60, hysteresis: 2, escalateSec: 1800, unit: '%', enabled: true, desc: '药箱低于 20% 提醒配药。' },
    { key: 'baf-bw-timeout', siteId: '*', pointCode: 'BAF.BW.STATE', name: 'BAF 反冲洗超时', op: 'state', stateValues: [1, 2, 3], durationSec: 2700, level: 'major', hysteresis: 0, escalateSec: 1800, unit: '', enabled: true, desc: '反冲洗阶段持续超过 45 分钟视为异常，需检查泵与排水阀联锁。' },
    { key: 'sulfur-p-high', siteId: '*', pointCode: 'SULFUR.P', name: '反冲洗管路压力偏高', op: 'high', high: 0.6, level: 'minor', durationSec: 120, hysteresis: 0.02, escalateSec: 1800, unit: 'MPa', enabled: true, desc: '压力偏高可能为阀门未开或管路堵塞。' },
    { key: 'waste-level-high', siteId: '*', pointCode: 'WASTE.LVL', name: '废水箱液位偏高', op: 'high', high: 85, level: 'major', durationSec: 300, hysteresis: 2, escalateSec: 1800, unit: '%', enabled: true, desc: '废水箱高液位，需及时排空避免反冲洗受阻。' },
    { key: 'clear-level-high', siteId: '*', pointCode: 'CLEAR.LVL', name: '清水池液位偏高', op: 'high', high: 95, level: 'info', durationSec: 600, hysteresis: 2, escalateSec: 7200, unit: '%', enabled: true, desc: '提示清水池接近满溢。' },
    { key: 'flow-zero', siteId: '*', pointCode: 'FLOW.IN', name: '进水流量为零', op: 'low', low: 0.02, level: 'major', durationSec: 300, hysteresis: 0.02, escalateSec: 900, unit: 'm³/h', enabled: true, desc: '提升泵运行而流量接近零，可能为管路堵塞或流量计故障。', requires: [{ code: 'RAW.PUMP.RUN', value: 1 }] },
    { key: 'baf-dp-high', siteId: '*', pointCode: 'BAF.DP', name: 'BAF 滤池压差偏高', op: 'high', high: 25, level: 'minor', durationSec: 300, hysteresis: 1, escalateSec: 3600, unit: 'kPa', enabled: true, desc: '压差升高提示滤层截留饱和，应按周期或压差触发反冲洗。' },
  ].map((r, i) => ({ id: `rule-${i + 1}`, ...r, createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-10-10T03:20:00.000Z' }));

  /* ---------------- 告警 ---------------- */
  const alarms = [
    {
      id: 'AL-20261025-001', siteId: site1, pointId: 'pt-site-1-sulfur-ph', pointCode: 'SULFUR.PH', unitCode: 'sulfur',
      level: 'major', title: '硫自养池 pH 低于运行区间', detail: '检测值 6.76 pH，低于下限 6.8 pH 并进入迟滞带，持续 18 分钟。可能原因：进水碱度不足或硫源投加偏高。',
      status: 'active', value: 6.76, threshold: '6.8–7.6 pH', ruleId: 'rule-1',
      firstAt: iso(now - 18 * M), lastAt: iso(now - 1 * M), ackAt: null, ackBy: null, resolvedAt: null, resolvedBy: null,
      count: 6, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261025-002', siteId: site1, pointId: 'pt-site-1-baf-do', pointCode: 'BAF.DO', unitCode: 'baf',
      level: 'major', title: 'BAF 溶解氧不足', detail: '检测值 1.78 mg/L，低于 2.0 mg/L，持续 9 分钟。曝气风机运行电流正常，需检查曝气头堵塞或风量分配。',
      status: 'active', value: 1.78, threshold: '≥ 2.0 mg/L', ruleId: 'rule-3',
      firstAt: iso(now - 9 * M), lastAt: iso(now - 40 * 1000), ackAt: null, ackBy: null, resolvedAt: null, resolvedBy: null,
      count: 4, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261025-003', siteId: site1, pointId: 'pt-site-1-raw-lvl', pointCode: 'RAW.LVL', unitCode: 'raw',
      level: 'minor', title: '原料罐液位偏低', detail: '检测值 22.6 %，低于提醒值 25 %。提升泵处于自动模式，液位降至 20 % 时将触发保护停泵。',
      status: 'acknowledged', value: 22.6, threshold: '≥ 25 %', ruleId: 'rule-6',
      firstAt: iso(now - 42 * M), lastAt: iso(now - 6 * M), ackAt: iso(now - 12 * M), ackBy: 'u-4', resolvedAt: null, resolvedBy: null,
      count: 3, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261025-004', siteId: site1, pointId: 'pt-site-1-pac-level', pointCode: 'PAC.LEVEL', unitCode: 'pac',
      level: 'minor', title: 'PAC 药箱液位偏低', detail: '检测值 18.4 %，低于 20 %。建议本班次完成配药并核对投加量。',
      status: 'active', value: 18.4, threshold: '≥ 20 %', ruleId: 'rule-8',
      firstAt: iso(now - 26 * M), lastAt: iso(now - 2 * M), ackAt: null, ackBy: null, resolvedAt: null, resolvedBy: null,
      count: 2, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261025-005', siteId: site1, pointId: 'pt-site-1-sulfur-p', pointCode: 'SULFUR.P', unitCode: 'sulfur',
      level: 'info', title: '反冲洗管路压力波动', detail: '近 1 小时压力在 0.32–0.58 MPa 间波动，未超过 0.6 MPa 上限，仅作提示。',
      status: 'resolved', value: 0.41, threshold: '< 0.6 MPa', ruleId: 'rule-11',
      firstAt: iso(now - 3 * H), lastAt: iso(now - 2 * H), ackAt: iso(now - 170 * M), ackBy: 'u-4', resolvedAt: iso(now - 2 * H), resolvedBy: 'u-4',
      count: 1, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261024-006', siteId: site1, pointId: 'pt-site-1-baf-dp', pointCode: 'BAF.DP', unitCode: 'baf',
      level: 'minor', title: 'BAF 滤池压差上升', detail: '压差升至 26.8 kPa，超过 25 kPa 提醒值，建议安排反冲洗并检查滤料。',
      status: 'resolved', value: 26.8, threshold: '< 25 kPa', ruleId: 'rule-15',
      firstAt: iso(now - 26 * H), lastAt: iso(now - 25 * H), ackAt: iso(now - 25.6 * H), ackBy: 'u-3', resolvedAt: iso(now - 25 * H), resolvedBy: 'u-3',
      count: 2, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261024-007', siteId: site2, pointId: 'pt-site-2-raw-lvl', pointCode: 'RAW.LVL', unitCode: 'raw',
      level: 'minor', title: '原料罐液位偏低（碧山站）', detail: '检测值 24.1 %，低于 25 % 提醒值，已转交现场值班处理。',
      status: 'acknowledged', value: 24.1, threshold: '≥ 25 %', ruleId: 'rule-6',
      firstAt: iso(now - 6 * H), lastAt: iso(now - 25 * M), ackAt: iso(now - 4 * H), ackBy: 'u-7', resolvedAt: null, resolvedBy: null,
      count: 2, source: 'rule', notifyChannels: ['inapp'],
    },
    {
      id: 'AL-20261023-008', siteId: site1, pointId: 'pt-site-1-baf-blower-run', pointCode: 'BAF.BLOWER.RUN', unitCode: 'baf',
      level: 'critical', title: '曝气风机故障停机', detail: '风机运行反馈丢失，DO 在 8 分钟内由 3.2 降至 1.9 mg/L。已按预案停进水并切换备用风机。',
      status: 'closed', value: 0, threshold: '运行', ruleId: null,
      firstAt: iso(now - 52 * H), lastAt: iso(now - 50 * H), ackAt: iso(now - 51.8 * H), ackBy: 'u-4', resolvedAt: iso(now - 50 * H), resolvedBy: 'u-4',
      count: 1, source: 'rule', notifyChannels: ['inapp', 'sms'], closeNote: '更换风机热继电器后恢复，工单 WO-20261023-002 已闭环。',
    },
    {
      id: 'AL-20261022-009', siteId: site1, pointId: 'pt-site-1-sulfur-do', pointCode: 'SULFUR.DO', unitCode: 'sulfur',
      level: 'info', title: '硫自养池溶解氧短时偏低', detail: 'DO 短时降至 0.42 mg/L，持续 6 分钟后自行恢复，未达告警确认条件，记录留档。',
      status: 'closed', value: 0.42, threshold: '≥ 0.5 mg/L', ruleId: 'rule-5',
      firstAt: iso(now - 80 * H), lastAt: iso(now - 79 * H), ackAt: null, ackBy: null, resolvedAt: iso(now - 79 * H), resolvedBy: 'u-3',
      count: 1, source: 'rule', notifyChannels: ['inapp'], closeNote: '自动恢复，无处置动作。',
    },
  ];

  /* ---------------- 工单 ---------------- */
  const workorders = [
    {
      id: 'WO-20261025-001', siteId: site1, title: '硫自养池 pH 偏低排查与碱度调整', type: 'repair', priority: 'high',
      status: 'processing', source: 'alarm', alarmId: 'AL-20261025-001', unitCode: 'sulfur', deviceId: dev('sulfur-ph').id,
      assigneeId: 'u-4', creatorId: 'u-3', createdAt: iso(now - 16 * M), dueAt: iso(now + 2 * H),
      acceptedAt: iso(now - 14 * M), startedAt: iso(now - 10 * M), finishedAt: null, verifiedAt: null,
      description: '按方案「先确认数据、再判断工艺」顺序处理：①核对 pH 计校准记录与比对样；②检查进水碱度与硫源投加；③必要时小幅调整碱度投加，禁止一次性大幅改动。',
      result: '', parts: '待定', photos: [],
      timeline: [
        { at: iso(now - 16 * M), by: 'u-3', action: 'create', note: '由告警 AL-20261025-001 转工单，指派值班处理。' },
        { at: iso(now - 14 * M), by: 'u-4', action: 'accept', note: '已接单，准备便携 pH 计与碱度试剂。' },
        { at: iso(now - 10 * M), by: 'u-4', action: 'start', note: '到场核对在线表读数 6.76，便携表 6.79，差值在允许范围。' },
      ],
      slaHours: 8,
    },
    {
      id: 'WO-20261025-002', siteId: site1, title: 'BAF 曝气量核查与曝气头检查', type: 'repair', priority: 'high',
      status: 'accepted', source: 'alarm', alarmId: 'AL-20261025-002', unitCode: 'baf', deviceId: dev('baf-blower').id,
      assigneeId: 'u-5', creatorId: 'u-4', createdAt: iso(now - 8 * M), dueAt: iso(now + 4 * H),
      acceptedAt: iso(now - 6 * M), startedAt: null, finishedAt: null, verifiedAt: null,
      description: 'DO 持续低于 2.0 mg/L。检查风机出口压力、曝气支管阀门开度与曝气头堵塞情况；调整后观察 30 分钟并记录。',
      result: '', parts: '', photos: [],
      timeline: [
        { at: iso(now - 8 * M), by: 'u-4', action: 'create', note: '告警升级为工单，指派现场维修。' },
        { at: iso(now - 6 * M), by: 'u-5', action: 'accept', note: '接单，预计 30 分钟内到场。' },
      ],
      slaHours: 8,
    },
    {
      id: 'WO-20261024-003', siteId: site1, title: 'PAC 药箱配药与计量泵标定', type: 'maintain', priority: 'normal',
      status: 'done', source: 'alarm', alarmId: 'AL-20261025-004', unitCode: 'pac', deviceId: dev('pac-pump').id,
      assigneeId: 'u-4', creatorId: 'u-4', createdAt: iso(now - 24 * H), dueAt: iso(now - 20 * H),
      acceptedAt: iso(now - 23.5 * H), startedAt: iso(now - 23 * H), finishedAt: iso(now - 21 * H), verifiedAt: null,
      description: '配置 5% PAC 溶液并标定计量泵流量，记录实际投加量。',
      result: '完成配药 20 L，计量泵标定后 0.8 L/h 对应 16 冲程/分钟，误差 2.1%。',
      parts: 'PAC 药剂 2 kg', photos: ['/files/demo/pac-calibration.jpg'],
      timeline: [
        { at: iso(now - 24 * H), by: 'u-4', action: 'create', note: '按药箱低液位告警创建。' },
        { at: iso(now - 23.5 * H), by: 'u-4', action: 'accept', note: '接单。' },
        { at: iso(now - 21 * H), by: 'u-4', action: 'finish', note: '已完成配药与标定，待班长复核。' },
      ],
      slaHours: 24,
    },
    {
      id: 'WO-20261024-004', siteId: site1, title: '10 月第 4 周仪表巡检与校准', type: 'calibrate', priority: 'normal',
      status: 'pending', source: 'plan', alarmId: null, unitCode: 'plant', deviceId: dev('baf-ph').id,
      assigneeId: null, creatorId: 'u-2', createdAt: iso(now - 6 * H), dueAt: iso(now + 26 * H),
      acceptedAt: null, startedAt: null, finishedAt: null, verifiedAt: null,
      description: '按巡检计划执行 pH、DO、压力变送器零点和量程核查，记录标准液批次与校准结果。',
      result: '', parts: '', photos: [],
      timeline: [{ at: iso(now - 6 * H), by: 'u-2', action: 'create', note: '按周计划自动生成，待认领。' }],
      slaHours: 48,
    },
    {
      id: 'WO-20261023-005', siteId: site2, title: '碧山站液位计通讯间歇排查', type: 'repair', priority: 'normal',
      status: 'done', source: 'manual', alarmId: null, unitCode: 'raw', deviceId: 'dev-site-2-raw-level',
      assigneeId: 'u-7', creatorId: 'u-7', createdAt: iso(now - 30 * H), dueAt: iso(now - 20 * H),
      acceptedAt: iso(now - 29 * H), startedAt: iso(now - 28 * H), finishedAt: iso(now - 22 * H), verifiedAt: null,
      description: '液位计偶发丢包。检查 RS-485 接线与屏蔽接地，必要时更换隔离器。',
      result: '重新压接 A/B 线并单端接地后通讯恢复，观察 6 小时无丢包。',
      parts: '屏蔽双绞线 2 m', photos: [],
      timeline: [
        { at: iso(now - 30 * H), by: 'u-7', action: 'create', note: '巡检发现数据间歇。' },
        { at: iso(now - 22 * H), by: 'u-7', action: 'finish', note: '已处理并观察。' },
      ],
      slaHours: 24,
    },
    {
      id: 'WO-20261023-002', siteId: site1, title: '曝气风机热继电器更换', type: 'repair', priority: 'high',
      status: 'verified', source: 'alarm', alarmId: 'AL-20261023-008', unitCode: 'baf', deviceId: dev('baf-blower').id,
      assigneeId: 'u-5', creatorId: 'u-4', createdAt: iso(now - 52 * H), dueAt: iso(now - 44 * H),
      acceptedAt: iso(now - 51.8 * H), startedAt: iso(now - 51 * H), finishedAt: iso(now - 50 * H), verifiedAt: iso(now - 49 * H),
      description: '风机过载保护动作，排查后确认为热继电器老化，更换同规格元件并测试启停三次。',
      result: '更换热继电器后启停 3 次正常，运行电流 1.6 A，DO 于 40 分钟内恢复至 3.0 mg/L。',
      parts: '热继电器 2.5–4 A ×1', photos: [],
      timeline: [
        { at: iso(now - 52 * H), by: 'u-4', action: 'create', note: '告警确认后转工单。' },
        { at: iso(now - 50 * H), by: 'u-5', action: 'finish', note: '更换完成，已恢复曝气。' },
        { at: iso(now - 49 * H), by: 'u-3', action: 'verify', note: '复核 DO 恢复曲线，工单闭环。' },
      ],
      slaHours: 8,
    },
  ];

  /* ---------------- 巡检 ---------------- */
  const inspectionPlans = [
    {
      id: 'plan-1', siteId: site1, name: '每日运行巡检', cycle: 'daily', timeOfDay: '08:30', enabled: true,
      items: [
        { key: 'i1', label: '核对各池液位与在线仪表读数', standard: '与现场液位标尺一致，偏差 ≤ 2%' },
        { key: 'i2', label: '检查提升泵、加药泵运行与渗漏', standard: '无异常振动、无渗漏' },
        { key: 'i3', label: '查看曝气与反冲洗状态', standard: '风机运行、反冲洗按计划执行' },
        { key: 'i4', label: '核对药箱液位并记录', standard: 'PAC/PAM 液位 ≥ 20%' },
        { key: 'i5', label: '检查出水感官与清水池液位', standard: '出水清澈，液位正常' },
      ],
    },
    {
      id: 'plan-2', siteId: site1, name: '每周仪表校准核查', cycle: 'weekly', weekday: 1, timeOfDay: '09:00', enabled: true,
      items: [
        { key: 'c1', label: 'pH 计标准液核查（4.00 / 6.86 / 9.18）', standard: '偏差 ≤ ±0.05 pH，否则校准' },
        { key: 'c2', label: 'DO 仪零点与空气饱和核查', standard: '偏差 ≤ ±0.2 mg/L' },
        { key: 'c3', label: '压力变送器零点核查', standard: '偏差 ≤ ±0.01 MPa' },
        { key: 'c4', label: '流量计与人工计量比对', standard: '偏差 ≤ ±5%' },
      ],
    },
    {
      id: 'plan-3', siteId: site2, name: '碧山站每日巡检', cycle: 'daily', timeOfDay: '09:00', enabled: true,
      items: [
        { key: 'b1', label: '核对原料罐与清水池液位', standard: '与标尺一致' },
        { key: 'b2', label: '检查加药系统与药箱', standard: '投加正常、液位充足' },
        { key: 'b3', label: '检查硫自养池 pH / DO', standard: 'pH 6.8–7.6，DO 0.2–0.5 mg/L' },
      ],
    },
  ];

  const taskItems = (plan) => plan.items.map(it => ({ ...it, result: '', note: '' }));
  const inspections = [
    {
      id: 'IN-20261025-001', siteId: site1, planId: 'plan-1', title: '每日运行巡检 · 早班', type: 'daily',
      dueAt: iso(now - 2 * H), assigneeId: 'u-4', status: 'pending', createdAt: iso(now - 8 * H),
      items: taskItems(inspectionPlans[0]), doneAt: null, doneBy: null, summary: '',
    },
    {
      id: 'IN-20261025-002', siteId: site2, planId: 'plan-3', title: '碧山站每日巡检 · 早班', type: 'daily',
      dueAt: iso(now - 1 * H), assigneeId: 'u-7', status: 'pending', createdAt: iso(now - 8 * H),
      items: taskItems(inspectionPlans[2]), doneAt: null, doneBy: null, summary: '',
    },
    {
      id: 'IN-20261024-003', siteId: site1, planId: 'plan-1', title: '每日运行巡检 · 晚班', type: 'daily',
      dueAt: iso(now - 14 * H), assigneeId: 'u-4', status: 'done', createdAt: iso(now - 26 * H),
      items: taskItems(inspectionPlans[0]).map((it, i) => ({ ...it, result: i === 4 ? 'attention' : 'ok', note: i === 4 ? '清水池液位 78%，出水清澈。' : '' })),
      doneAt: iso(now - 14.5 * H), doneBy: 'u-4', summary: '整体正常；PAC 药箱液位 24%，已提醒白班配药。',
    },
    {
      id: 'IN-20261024-004', siteId: site1, planId: 'plan-2', title: '每周仪表校准核查', type: 'weekly',
      dueAt: iso(now - 30 * H), assigneeId: 'u-5', status: 'done', createdAt: iso(now - 50 * H),
      items: taskItems(inspectionPlans[1]).map(it => ({ ...it, result: 'ok', note: '' })),
      doneAt: iso(now - 31 * H), doneBy: 'u-5', summary: '全部核查合格，pH 计偏差 +0.02，未触发校准。',
    },
  ];

  /* ---------------- 水质化验（人工） ---------------- */
  const metrics = ['COD', 'NH3N', 'TN', 'TP', 'SS'];
  const samplePoints = [
    { key: 'inlet', name: '进水（原料罐）' },
    { key: 'baf_out', name: 'BAF 出水' },
    { key: 'sulfur_out', name: '硫自养池出水' },
    { key: 'outlet', name: '总出水（清水池）' },
  ];
  const baseValues = {
    inlet: { COD: 156, NH3N: 32.4, TN: 41.2, TP: 4.1, SS: 88 },
    baf_out: { COD: 62, NH3N: 6.8, TN: 28.5, TP: 2.2, SS: 32 },
    sulfur_out: { COD: 38, NH3N: 1.4, TN: 8.6, TP: 0.9, SS: 16 },
    outlet: { COD: 32, NH3N: 0.9, TN: 7.2, TP: 0.7, SS: 12 },
  };
  const labRecords = [];
  let labSeq = 0;
  for (let d = 0; d < 6; d++) {
    for (let si = 0; si < samplePoints.length; si++) {
      const sp = samplePoints[si];
      labSeq++;
      const t = now - d * D - 3 * H;
      const vals = {};
      metrics.forEach((m, mi) => {
        // 平滑漂移：日尺度正弦 + 小幅质检偏差，避免相邻日大幅交替
        const drift = 1
          + 0.032 * Math.sin((5 - d) * 0.85 + mi * 0.7 + si * 1.35)
          + 0.014 * Math.cos((5 - d) * 0.42 + si * 0.8)
          + ((((labSeq * 17 + mi * 7) % 9) - 4) / 900);
        vals[m] = round(baseValues[sp.key][m] * drift, 2);
      });
      const reviewed = d >= 2 || (d === 1 && sp.key !== 'outlet');
      labRecords.push({
        id: `LAB-202610${String(25 - d).padStart(2, '0')}-${String(labSeq).padStart(3, '0')}`,
        siteId: site1,
        samplePoint: sp.key,
        samplePointName: sp.name,
        sampledAt: iso(t),
        recordedAt: iso(t + 40 * M),
        operatorId: d % 2 ? 'u-4' : 'u-5',
        metrics: vals,
        source: 'manual',
        method: 'COD：重铬酸钾法（HJ 828）；氨氮：纳氏试剂法（HJ 535）；总氮：碱性过硫酸钾消解（HJ 636）；总磷：钼酸铵分光光度法（GB 11893）；SS：重量法（GB 11901）',
        status: reviewed ? 'reviewed' : 'pending_review',
        reviewerId: reviewed ? 'u-3' : null,
        reviewedAt: reviewed ? iso(t + 90 * M) : null,
        reviewNote: reviewed ? '数据与质控样一致，复核通过。' : '',
        qc: { duplicate: 'RSD 1.8%', spike: d % 3 === 0 ? '加标回收 96.5%' : '—' },
        remark: '',
      });
    }
  }
  const labPlans = [
    { id: 'lab-plan-1', siteId: site1, name: '每日进出水水质检测', points: ['inlet', 'outlet'], metrics, cycle: 'daily', timeOfDay: '10:00', enabled: true, nextAt: iso(now + 18 * H) },
    { id: 'lab-plan-2', siteId: site1, name: '每周全流程水质检测', points: ['inlet', 'baf_out', 'sulfur_out', 'outlet'], metrics, cycle: 'weekly', weekday: 3, timeOfDay: '10:00', enabled: true, nextAt: iso(now + 2 * D) },
  ];

  /* ---------------- 工艺参数 ---------------- */
  const paramDefs = [
    ['raw.pump.level_on', '提升泵启泵液位', '%', '原料罐', 30, 10, 60, 1, 'cloud', '液位低于该值时允许启泵；与低液位保护联锁。'],
    ['raw.pump.level_off', '提升泵停泵液位', '%', '原料罐', 85, 50, 95, 1, 'cloud', '液位达到该值时停泵，避免溢流。'],
    ['raw.pump.mode', '提升泵运行模式', '', '原料罐', 0, 0, 1, 1, 'local', '0=自动，1=手动；手动模式仅限现场操作并需记录。'],
    ['baf.do.setpoint', 'BAF 曝气溶解氧设定', 'mg/L', '曝气生物滤池', 3.0, 2.0, 5.0, 0.1, 'approval', '调整曝气量以维持 DO；变更需工艺负责人审批。'],
    ['baf.bw.interval', 'BAF 反冲洗周期', 'h', '曝气生物滤池', 168, 24, 336, 1, 'cloud', '按运行压差与周期双条件触发反冲洗。'],
    ['baf.bw.duration', 'BAF 反冲洗时长', 'min', '曝气生物滤池', 30, 10, 60, 1, 'cloud', '先气冲 3–5 min，再气水联合 10–15 min，最后漂洗。'],
    ['pac.dose', 'PAC 投加量设定', 'L/h', 'PAC反应池', 0.06, 0, 0.2, 0.005, 'cloud', '按进水浊度与 COD 调整，单次调整幅度不超过 20%；100 L/h 装置常用 0.03–0.08 L/h。'],
    ['pam.dose', 'PAM 投加量设定', 'L/h', 'PAM反应池', 0.02, 0, 0.1, 0.005, 'cloud', '助凝剂，过量会导致滤池堵塞；常用 0.01–0.03 L/h。'],
    ['sulfur.ph.low', '硫自养池 pH 下限', 'pH', '硫自养反硝化池', 6.8, 6.0, 7.2, 0.1, 'approval', '低于下限触发重要告警，需核查碱度与硫源。'],
    ['sulfur.do.setpoint', '硫自养池溶解氧设定', 'mg/L', '硫自养反硝化池', 0.3, 0.1, 1.0, 0.05, 'approval', '低氧运行是硫自养反硝化的工艺要求，过高会抑制脱氮。'],
    ['sulfur.p.limit', '反冲洗压力上限', 'MPa', '硫自养反硝化池', 0.6, 0.3, 0.9, 0.01, 'cloud', '超过上限触发提示并检查阀门/管路。'],
    ['alarm.delay', '告警确认延时', 's', '告警中心', 300, 30, 1800, 30, 'cloud', '参数持续越限超过该时长才生成告警，抑制瞬时抖动。'],
  ];
  const params = paramDefs.map(([key, name, unit, group, value, min, max, step, writeMode, desc], i) => ({
    id: `param-${i + 1}`, siteId: site1, key, name, unit, group,
    currentValue: value, min, max, step, writeMode, desc,
    updatedAt: iso(now - (i + 2) * 3 * H), updatedBy: 'u-3', version: 2 + (i % 3),
  }));
  const paramVersions = [];
  params.forEach((p, i) => {
    const n = p.version;
    for (let v = n; v >= 1; v--) {
      const delta = (v - n) * p.step;
      paramVersions.push({
        id: `pv-${p.id}-${v}`, siteId: p.siteId, paramId: p.id, paramKey: p.key,
        version: v, value: round(p.currentValue - delta, 2),
        status: v === n ? 'active' : (v === n - 1 ? 'superseded' : 'archived'),
        operatorId: v === n ? 'u-3' : 'u-1',
        reviewerId: p.writeMode === 'approval' ? 'u-2' : null,
        createdAt: iso(now - (n - v + 2) * 6 * H),
        reason: v === n ? '按近期水质与能耗复核后的运行值' : '历史运行调整',
      });
    }
  });

  /* ---------------- 审计日志 ---------------- */
  const auditSeed = [
    ['u-1', 'user.login', 'user', 'u-1', '平台管理员登录', 5 * M],
    ['u-3', 'param.update', 'param', 'param-4', 'BAF 曝气溶解氧设定由 3.2 调整为 3.0 mg/L（审批单 PA-20261024-03）', 22 * H],
    ['u-4', 'alarm.ack', 'alarm', 'AL-20261025-003', '确认原料罐液位偏低告警', 12 * M],
    ['u-4', 'command.execute', 'command', 'CMD-20261025-001', '下发 BAF 反冲洗启动命令（自动联锁校验通过）', 95 * M],
    ['u-2', 'workorder.assign', 'workorder', 'WO-20261025-001', '将工单指派给赵磊', 16 * M],
    ['u-5', 'workorder.accept', 'workorder', 'WO-20261025-002', '接受工单', 6 * M],
    ['u-3', 'lab.review', 'lab', 'LAB-20261024-002', '复核 BAF 出水化验记录', 20 * H],
    ['u-1', 'user.create', 'user', 'u-7', '创建碧山站值班账号', 3 * D],
    ['u-2', 'alarm.rule.update', 'alarmRule', 'rule-1', '硫自养池 pH 告警持续时长由 600 s 调整为 300 s', 2 * D],
    ['u-4', 'command.cancel', 'command', 'CMD-20261024-006', '取消反冲洗命令：排水阀反馈异常', 25 * H],
    ['u-6', 'report.export', 'report', 'daily-20261024', '导出 10 月 24 日运行日报', 18 * H],
    ['u-1', 'system.backup', 'system', 'backup', '手动备份数据库', 26 * H],
  ].map(([actorId, action, targetType, targetId, detail, ago], i) => ({
    id: `AU-20261025-${String(i + 1).padStart(3, '0')}`,
    at: iso(now - ago), siteId: site1, actorId, actorName: user(actorId).name || actorId,
    action, targetType, targetId, detail, ip: '192.168.10.' + (20 + i), result: 'success',
  }));

  /* ---------------- 通知 ---------------- */
  const notifications = [
    ['u-4', 'alarm', '重要告警：硫自养池 pH 低于运行区间', '当前 6.76 pH，持续 18 分钟，请及时研判。', false, '/alarms'],
    ['u-4', 'workorder', '工单已指派：BAF 曝气量核查', 'WO-20261025-002 已指派给陈浩。', false, '/workorders'],
    ['u-3', 'alarm', '告警升级提醒：BAF 溶解氧不足', '已持续 9 分钟，值班已确认到岗。', false, '/alarms'],
    ['u-5', 'workorder', '新工单：BAF 曝气量核查与曝气头检查', '优先级高，要求 4 小时内完成。', true, '/workorders'],
    ['u-7', 'alarm', '原料罐液位偏低（碧山站）', '当前 24.1%，请安排补水。', true, '/alarms'],
    ['u-1', 'system', '数据备份成功', '数据库快照已生成，保留 7 天。', true, '/admin/backup'],
    ['u-2', 'workorder', '周巡检任务待认领', '10 月第 4 周仪表巡检尚未认领。', false, '/inspections'],
    ['u-6', 'system', '账号权限说明', '只读账号仅可查看授权站点数据，不可下发控制命令。', true, '/help'],
  ].map(([userId, type, title, body, read, link], i) => ({
    id: `NT-${i + 1}`, at: iso(now - (i + 1) * 37 * M), userId, siteId: site1,
    type, title, body, read, link,
  }));

  /* ---------------- 通知通道 ---------------- */
  const channels = [
    { id: 'ch-inapp', name: '平台站内', type: 'inapp', enabled: true, target: '全部值班账号', status: '正常', note: '默认通道，告警与工单消息', testedAt: iso(now - 2 * D) },
    { id: 'ch-sms', name: '短信', type: 'sms', enabled: false, target: '值班手机号', status: '未接入', note: '演示环境未接入运营商网关，通知仅记录不真实发送', testedAt: null },
    { id: 'ch-phone', name: '电话语音', type: 'phone', enabled: false, target: '值班手机号', status: '未接入', note: '需外呼平台账号，演示环境不启用', testedAt: null },
    { id: 'ch-wechat', name: '企业微信', type: 'wechat', enabled: false, target: '运维群机器人', status: '待配置', note: '需填写 Webhook 地址后方可启用', testedAt: null },
  ];

  /* ---------------- 系统设置 ---------------- */
  const settings = {
    platformName: '小禹 · 村镇水处理站智能运维平台',
    shortName: '小禹',
    orgName: '小禹（示范项目组）',
    version: '2.0.8',
    docVersion: 'V2.2',
    demoMode: true,
    dataRetentionDays: 7,
    commandTimeoutSec: 30,
    alarmP95TargetSec: 30,
    autoRefreshSec: 5,
    offlineCacheMinutes: 30,
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    backup: { lastAt: iso(now - 26 * H), auto: false, keepDays: 7 },
    notice: '数据由内置模拟网关生成；标注「待接入」「人工化验」的项不是在线实时值。',
    dataSources: {
      gateway: '内置模拟网关（MQTT/Modbus 抽象）',
      lab: '人工化验录入',
      external: '外部接口（未接入）',
    },
  };

  return {
    alarmRules, alarms, workorders, inspectionPlans, inspections,
    labRecords, labPlans, params, paramVersions, auditLogs: auditSeed,
    notifications, channels, settings,
  };
}

module.exports = { seedOps };
