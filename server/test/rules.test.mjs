import assert from 'node:assert/strict'
import { test } from 'node:test'
import rules from '../rules.js'

const { RulesEngine, LEVELS, LEVEL_NAME, thresholdText } = rules

const T0 = 1700000000000 // 固定时钟，测试不依赖运行时刻

function site () { return { id: 's1', name: '一号站' } }
function point (over) {
  return Object.assign({ id: 'pt1', siteId: 's1', code: 'P', name: '压力', unit: 'kPa' }, over || {})
}
function highRule (over) {
  return Object.assign({
    id: 'r-high', siteId: '*', pointCode: 'P', name: '压力偏高',
    op: 'high', high: 10, level: 'minor', durationSec: 60, hysteresis: 1,
    enabled: true, unit: 'kPa', desc: '',
  }, over || {})
}

// 用最小假件驱动规则引擎：只关心状态机与判定，不碰真实 store/遥测。
function makeEngine (ruleList, values, opts) {
  const o = opts || {}
  const events = []
  const store = {
    data: {
      points: o.points || [point()],
      sites: o.sites || [site()],
      alarmRules: ruleList,
      alarms: o.alarms || [],
      auditLogs: [],
      settings: {},
    },
    saveSoon () {},
  }
  const telemetry = {
    getLatest (id) {
      return Object.prototype.hasOwnProperty.call(values, id) ? { v: values[id], t: T0, q: 'good' } : null
    },
  }
  const notifier = { send () {}, sendRoles () {} }
  const engine = new RulesEngine({
    store, telemetry, sim: {}, notifier,
    publish: (e) => events.push(e),
    logger: {},
  })
  return { engine, store, events }
}

test('thresholdText 把四种阈值的口径说成人话', () => {
  // 告警详情直接展示这行字；说反了值班员会按错误方向处置。
  assert.equal(thresholdText({ op: 'low', low: 0.5, unit: 'mg/L' }), '≥ 0.5 mg/L')
  assert.equal(thresholdText({ op: 'high', high: 8.2 }), '≤ 8.2')
  assert.equal(thresholdText({ op: 'outside', low: 5, high: 9, unit: '%' }), '5–9 %')
  assert.equal(thresholdText({ op: 'state', stateValues: [2, 3] }), '阶段 2/3 为异常')
  assert.equal(thresholdText({ op: 'unknown' }), '')
})

test('LEVELS 的顺序就是升级顺序，每级都有中文名', () => {
  // checkEscalations 用 LEVELS.indexOf(level)+1 升一级；顺序错了会降级或越界。
  assert.deepEqual(LEVELS, ['info', 'minor', 'major', 'critical'])
  for (const lv of LEVELS) {
    assert.equal(typeof LEVEL_NAME[lv], 'string')
    assert.ok(LEVEL_NAME[lv].length > 0)
  }
})

test('越限未满 durationSec 不告警，满时长才落一条', () => {
  // 持续时长门槛就是防抖：瞬时尖峰不该叫醒值班员。
  const values = { pt1: 12 }
  const { engine, store, events } = makeEngine([highRule()], values)
  engine.evaluate(T0)
  engine.evaluate(T0 + 59999)
  assert.equal(store.data.alarms.length, 0)
  engine.evaluate(T0 + 60000)
  assert.equal(store.data.alarms.length, 1)
  const a = store.data.alarms[0]
  assert.equal(a.status, 'active')
  assert.equal(a.value, 12)
  assert.equal(a.level, 'minor')
  assert.equal(a.threshold, '≤ 10 kPa')
  // firstAt 是「越限已持续满 durationSec、告警正式生成」的时刻，不是首次越限时刻；
  // 首条时间线与生成时刻一致，之后才靠 lastAt 的 20 秒节流推进。
  assert.equal(a.firstAt, new Date(T0 + 60000).toISOString())
  assert.equal(a.lastAt, new Date(T0 + 60000).toISOString())
  assert.ok(events.some((e) => e.type === 'alarm' && e.action === 'create'))
})

test('等于阈值不算越限（high 是严格大于）', () => {
  // 阈值写 10 表示允许 10；把等号算越限会让正常工况常年挂告警。
  const values = { pt1: 10 }
  const { engine, store } = makeEngine([highRule()], values)
  engine.evaluate(T0)
  engine.evaluate(T0 + 120000)
  assert.equal(store.data.alarms.length, 0)
})

test('迟滞死区内告警不恢复，跌破 high-h 才恢复', () => {
  // 阈值上下反复抖动时不能开关告警，否则值班手机被刷屏。
  const values = { pt1: 12 }
  const { engine, store, events } = makeEngine([highRule()], values)
  engine.evaluate(T0)
  engine.evaluate(T0 + 60000)
  const a = store.data.alarms[0]
  assert.equal(a.status, 'active')

  values.pt1 = 10 // 回到阈值，但仍在死区（10 > 9）
  engine.evaluate(T0 + 120000)
  assert.equal(a.status, 'active')

  values.pt1 = 9.5 // 依旧 > high - hysteresis = 9
  engine.evaluate(T0 + 180000)
  assert.equal(a.status, 'active')

  values.pt1 = 9 // 恰好等于 high - hysteresis，满足恢复条件
  engine.evaluate(T0 + 240000)
  assert.equal(a.status, 'resolved')
  assert.equal(a.resolvedBy, 'system')
  assert.ok(a.closeNote.includes('自动'))
  assert.equal(a.value, 9)
  assert.ok(events.some((e) => e.type === 'alarm' && e.action === 'resolve'))
})

test('连续越限 20 秒内不重复更新时间线，避免每 5 秒刷库', () => {
  // 模拟器 5 秒一跳；每跳都写库会让内存库和审计日志迅速膨胀。
  const values = { pt1: 12 }
  const { engine, store } = makeEngine([highRule()], values)
  engine.evaluate(T0)
  engine.evaluate(T0 + 60000)
  const a = store.data.alarms[0]
  const lastAt = a.lastAt
  values.pt1 = 13
  engine.evaluate(T0 + 65000)
  assert.equal(a.value, 12)
  assert.equal(a.lastAt, lastAt)
  engine.evaluate(T0 + 81000)
  assert.equal(a.value, 13)
  assert.notEqual(a.lastAt, lastAt)
})

test('恢复后再次越限要重新计时，不沿用上一轮的 since', () => {
  // 恢复后立刻再越限若直接复用旧告警，会变成「一闪就报警」。
  const values = { pt1: 12 }
  const { engine, store } = makeEngine([highRule()], values)
  engine.evaluate(T0)
  engine.evaluate(T0 + 60000)
  values.pt1 = 9
  engine.evaluate(T0 + 120000)
  assert.equal(store.data.alarms[0].status, 'resolved')

  values.pt1 = 12
  engine.evaluate(T0 + 130000)
  engine.evaluate(T0 + 189999)
  assert.equal(store.data.alarms.length, 1)
  engine.evaluate(T0 + 190000)
  assert.equal(store.data.alarms.length, 2)
})

test('outside 规则两端越界都告警，回到 low+h..high-h 带内才恢复', () => {
  // 区间规则用于「正常必须夹在中间」的量；只测一端会漏掉反向越界。
  const rule = {
    id: 'r-out', pointCode: 'P', name: '区间异常', op: 'outside',
    low: 5, high: 9, level: 'major', durationSec: 0, hysteresis: 0.5,
    enabled: true, unit: 'mg/L', desc: '',
  }
  const values = { pt1: 10 }
  const { engine, store } = makeEngine([rule], values)
  engine.evaluate(T0)
  assert.equal(store.data.alarms.length, 1)
  const a = store.data.alarms[0]
  values.pt1 = 8.6 // 带内但未越过 high-h，不能恢复
  engine.evaluate(T0 + 1000)
  assert.equal(a.status, 'active')
  values.pt1 = 8.5 // 恰好 high-h
  engine.evaluate(T0 + 2000)
  assert.equal(a.status, 'resolved')

  values.pt1 = 4
  engine.evaluate(T0 + 3000)
  assert.equal(store.data.alarms.length, 2)
  values.pt1 = 5.4
  engine.evaluate(T0 + 4000)
  assert.equal(store.data.alarms[1].status, 'active')
  values.pt1 = 5.5
  engine.evaluate(T0 + 5000)
  assert.equal(store.data.alarms[1].status, 'resolved')
})

test('state 规则按枚举值判定，没有迟滞', () => {
  // 阶段是离散枚举，值只要不在异常集合里就算恢复。
  const rule = {
    id: 'r-state', pointCode: 'P', name: '阶段异常', op: 'state',
    stateValues: [2, 3], level: 'info', durationSec: 0,
    enabled: true, desc: '',
  }
  const values = { pt1: 2 }
  const { engine, store } = makeEngine([rule], values)
  engine.evaluate(T0)
  assert.equal(store.data.alarms.length, 1)
  assert.equal(store.data.alarms[0].threshold, '阶段 2/3 为异常')
  values.pt1 = 1
  engine.evaluate(T0 + 1000)
  assert.equal(store.data.alarms[0].status, 'resolved')
})

test('前置条件不满足时即便数值越限也不告警', () => {
  // 「提升泵运行才判断断流」；泵停着流量为 0 是正常停机，不是断流。
  const points = [point(), { id: 'pt2', siteId: 's1', code: 'PUMP', name: '泵', unit: '' }]
  const rule = {
    id: 'r-req', pointCode: 'P', name: '断流', op: 'low', low: 0.5,
    level: 'major', durationSec: 0, enabled: true, desc: '',
    requires: [{ code: 'PUMP', value: 1 }],
  }
  const values = { pt1: 0.2, pt2: 0 }
  const { engine, store } = makeEngine([rule], values, { points })
  engine.evaluate(T0)
  assert.equal(store.data.alarms.length, 0)
  values.pt2 = 1
  engine.evaluate(T0 + 1000)
  assert.equal(store.data.alarms.length, 1)
})

test('告警确认：不存在 404、已确认 409、已恢复 409', () => {
  // 前端按钮只在可操作状态亮起；后端也必须挡住重复确认，否则审计里出现两条确认。
  const user = { id: 'u1', name: '张三' }
  const alarm = { id: 'AL-X', siteId: 's1', status: 'active', ackAt: null, title: '压力偏高' }
  const { engine } = makeEngine([], {}, { alarms: [alarm] })
  assert.equal(engine.acknowledge(user, 'NOPE').error.status, 404)
  const ok = engine.acknowledge(user, alarm.id, '已知悉')
  assert.equal(ok.error, undefined)
  assert.equal(alarm.status, 'acknowledged')
  assert.equal(alarm.ackBy, 'u1')
  assert.equal(engine.acknowledge(user, alarm.id).error.status, 409)
  alarm.status = 'resolved'
  assert.equal(engine.acknowledge(user, alarm.id).error.status, 409)
})

test('人工标记恢复后不能再标记一次', () => {
  // 重复处置会覆盖第一次的处置说明，事故复盘就丢了原始信息。
  const user = { id: 'u1', name: '张三' }
  const alarm = { id: 'AL-Y', siteId: 's1', status: 'active', ackAt: null, title: '压力偏高' }
  const { engine } = makeEngine([], {}, { alarms: [alarm] })
  const ok = engine.resolve(user, alarm.id, '现场确认已恢复')
  assert.equal(ok.error, undefined)
  assert.equal(alarm.status, 'resolved')
  assert.equal(alarm.resolvedBy, 'u1')
  assert.equal(alarm.closeNote, '现场确认已恢复')
  assert.equal(engine.resolve(user, alarm.id).error.status, 409)
  assert.equal(engine.resolve(user, 'NOPE').error.status, 404)
})
