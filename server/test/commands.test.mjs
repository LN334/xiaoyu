import assert from 'node:assert/strict'
import { test } from 'node:test'
import commands from '../commands.js'

const { CommandEngine, ACTIONS, STATUS_NAME } = commands

const SITE = { id: 's1', name: '一号站' }
const OTHER = { id: 's2', name: '二号站' }
const USER = { id: 'u1', name: '张三', role: 'operator', siteIds: ['s1'] }
const OUTSIDER = { id: 'u9', name: '李四', role: 'operator', siteIds: ['s2'] }
const ADMIN = { id: 'u0', name: '管理员', role: 'super', siteIds: [] }

// 用假 store/sim/notifier 驱动命令引擎；状态机才是被测对象。
function makeEngine (opts) {
  const o = opts || {}
  const devices = o.devices || Object.keys(ACTIONS).map((action, i) => ({
    id: 'd' + i,
    siteId: 's1',
    key: ACTIONS[action].deviceKey,
    name: ACTIONS[action].label,
    code: 'DEV-' + i,
  }))
  const store = {
    data: {
      sites: [SITE, OTHER],
      devices,
      commands: [],
      alarms: [],
      auditLogs: [],
      settings: {},
    },
    saveSoon () {},
  }
  const sim = {
    precheck: o.precheck || (() => ({ ok: true })),
    execute: () => ({ ok: true, detail: 'ok' }),
    status: () => null,
    writeTelemetry () {},
  }
  const notifier = { send () {}, sendRoles () {} }
  const engine = new CommandEngine({ store, sim, notifier, publish () {}, logger: {} })
  // 测试不启动真实定时器：500ms/800ms 的自动推进会打乱同步断言。
  engine.scheduleDispatch = () => {}
  return { engine, store }
}

test('ACTIONS 每个动作的元数据齐全', () => {
  // label/deviceKey/execMs 任一缺失，控制页会渲染出空按钮或 NaN 倒计时。
  const entries = Object.entries(ACTIONS)
  assert.ok(entries.length >= 10)
  for (const [action, meta] of entries) {
    assert.match(action, /^[a-z]+(\.[a-z]+)+$/)
    assert.equal(typeof meta.label, 'string')
    assert.ok(meta.label.length > 0)
    assert.equal(typeof meta.deviceKey, 'string')
    assert.ok(meta.deviceKey.length > 0)
    assert.ok(meta.risk === 'medium' || meta.risk === 'high')
    assert.ok(Number.isFinite(meta.execMs) && meta.execMs > 0)
    assert.equal(typeof meta.effect, 'string')
    assert.ok(meta.effect.length > 0)
  }
})

test('成对的启停动作指向同一台设备', () => {
  // 启停若指到不同 deviceKey，现场会出现「启动 A、停止 B」的离谱命令。
  for (const key of ['raw.pump', 'baf.blower', 'baf.backwash', 'sulfur.backwash']) {
    assert.equal(ACTIONS[key + '.start'].deviceKey, ACTIONS[key + '.stop'].deviceKey, key)
  }
})

test('STATUS_NAME 覆盖状态机的全部 8 个状态', () => {
  // 前端用 STATUS_NAME[status] 直接上屏；漏一个状态就会显示 undefined。
  assert.deepEqual(Object.keys(STATUS_NAME).sort(), [
    'cancelled', 'executing', 'failed', 'pending_confirm',
    'pending_dispatch', 'sent', 'success', 'timeout',
  ])
  for (const [k, v] of Object.entries(STATUS_NAME)) {
    assert.equal(typeof v, 'string', k)
    assert.ok(v.length > 0, k)
  }
})

test('中风险动作创建后直接待下发，高风险必须停在待确认', () => {
  // 高风险动作没二次确认就下发属于安全事故，状态机必须让它在 pending_confirm 等确认。
  const { engine } = makeEngine()
  const medium = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' })
  assert.equal(medium.command.status, 'pending_dispatch')
  const high = engine.create(USER, { siteId: 's1', action: 'raw.pump.mode.set' })
  assert.equal(high.command.status, 'pending_confirm')
  assert.equal(high.command.timeline.length, 1)
  assert.equal(high.command.timeline[0].status, 'pending_confirm')
})

test('待确认 → 待下发只能由 confirm 完成，并记下确认时间', () => {
  // 确认时间是审计里判断「谁在何时放行高风险动作」的唯一依据。
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'baf.backwash.start' }).command
  const r = engine.confirm(USER, cmd.id)
  assert.equal(r.error, undefined)
  assert.equal(cmd.status, 'pending_dispatch')
  assert.ok(cmd.confirmedAt)
  assert.equal(cmd.timeline.length, 2)
  assert.equal(cmd.timeline[1].status, 'pending_dispatch')
})

test('非高风险动作不能被 confirm，状态也不会被失败调用改坏', () => {
  // 已经越过待确认的命令再确认会重复下发。
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' }).command
  assert.equal(engine.confirm(USER, cmd.id).error.status, 409)
  assert.equal(cmd.status, 'pending_dispatch')
  assert.equal(cmd.timeline.length, 1)
})

test('未确认的高风险命令不得直接 dispatch', () => {
  // dispatch 只接受 pending_dispatch，这是高风险动作的第二道闸。
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.mode.set' }).command
  engine.dispatch(cmd.id)
  assert.equal(cmd.status, 'pending_confirm')
})

test('confirm 对不存在 404、对已下发 409', () => {
  // 已下发电网的命令再确认，会让同一动作在 PLC 上被执行两次。
  const { engine } = makeEngine()
  assert.equal(engine.confirm(USER, 'CMD-NOPE').error.status, 404)
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' }).command
  engine.dispatch(cmd.id)
  assert.equal(cmd.status, 'sent')
  assert.equal(engine.confirm(USER, cmd.id).error.status, 409)
  engine.clearTimer(cmd.id)
})

test('cancel 只允许待确认/待下发，已下发后拒绝', () => {
  // 命令已经到网关再取消，只会让页面状态和现场设备状态不一致。
  const { engine } = makeEngine()
  const pending = engine.create(USER, { siteId: 's1', action: 'raw.pump.mode.set' }).command
  assert.equal(engine.cancel(USER, pending.id, '不需要了').error, undefined)
  assert.equal(pending.status, 'cancelled')
  assert.equal(pending.cancelReason, '不需要了')
  assert.equal(pending.timeline[pending.timeline.length - 1].status, 'cancelled')

  const sent = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' }).command
  engine.dispatch(sent.id)
  assert.equal(engine.cancel(USER, sent.id).error.status, 409)
  assert.equal(sent.status, 'sent')
  engine.clearTimer(sent.id)
})

test('跨站点用户不能确认或取消别的站点的命令', () => {
  // 站点账号只能动自己站点；越权失败也不能推进状态。
  const { engine } = makeEngine()
  const high = engine.create(USER, { siteId: 's1', action: 'baf.backwash.start' }).command
  assert.equal(engine.confirm(OUTSIDER, high.id).error.status, 403)
  assert.equal(high.status, 'pending_confirm')
  const medium = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' }).command
  assert.equal(engine.cancel(OUTSIDER, medium.id).error.status, 403)
  assert.equal(medium.status, 'pending_dispatch')
})

test('super 角色可跨站点确认', () => {
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'baf.backwash.start' }).command
  assert.equal(engine.confirm(ADMIN, cmd.id).error, undefined)
  assert.equal(cmd.status, 'pending_dispatch')
})

test('联锁校验失败的命令直接 failed，并留审计', () => {
  // 联锁拒绝必须留痕，否则事后查不到「为什么没执行」。
  const precheck = () => ({ ok: false, error: '提升泵故障，禁止启动' })
  const { engine, store } = makeEngine({ precheck })
  const r = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' })
  assert.equal(r.blocked, true)
  assert.equal(r.error, '提升泵故障，禁止启动')
  assert.equal(r.command.status, 'failed')
  assert.ok(r.command.finishedAt)
  assert.equal(r.command.result, '联锁校验未通过，命令未下发')
  const audit = store.data.auditLogs[store.data.auditLogs.length - 1]
  assert.equal(audit.action, 'command.blocked')
  assert.equal(audit.result, 'blocked')
})

test('未知动作 400、未知站点 404，且不落命令记录', () => {
  // 脏请求不能污染命令表，也不能触发任何调度。
  const { engine, store } = makeEngine()
  assert.equal(engine.create(USER, { siteId: 's1', action: 'nope.nope' }).error.status, 400)
  assert.equal(engine.create(USER, { siteId: 's9', action: 'raw.pump.start' }).error.status, 404)
  assert.equal(store.data.commands.length, 0)
})

test('命令理由截断到 200 字符', () => {
  // 自由文本会原样进审计；不截断会被超长粘贴撑爆记录。
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.start', reason: 'x'.repeat(500) }).command
  assert.equal(cmd.reason.length, 200)
})

test('设备台账缺失时命令仍能创建，targetName 退回动作名', () => {
  // 演示库或新站点可能还没登记设备；拆掉按钮不如让命令照常走、并在目标名上明示。
  const { engine } = makeEngine({ devices: [] })
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.start' }).command
  assert.equal(cmd.deviceId, null)
  assert.equal(cmd.targetName, ACTIONS['raw.pump.start'].label)
})

test('canOperate 只对 super 或本站点用户放行', () => {
  const { engine } = makeEngine()
  const cmd = { siteId: 's1' }
  assert.equal(engine.canOperate(USER, cmd), true)
  assert.equal(engine.canOperate(OUTSIDER, cmd), false)
  assert.equal(engine.canOperate(ADMIN, cmd), true)
  assert.equal(engine.canOperate(USER, null), false)
  assert.equal(engine.canOperate({ id: 'u2', name: '无站点', role: 'operator' }, cmd), false)
})

test('完整合法链路：创建 → 确认 → 下发 → 执行', () => {
  // 时间线要能还原每一步由谁推进；缺步会让事故复盘断链。
  const { engine } = makeEngine()
  const cmd = engine.create(USER, { siteId: 's1', action: 'raw.pump.mode.set' }).command
  assert.equal(cmd.status, 'pending_confirm')
  engine.confirm(USER, cmd.id)
  assert.equal(cmd.status, 'pending_dispatch')
  engine.dispatch(cmd.id)
  assert.equal(cmd.status, 'sent')
  assert.ok(cmd.sentAt)
  engine.execute(cmd.id)
  assert.equal(cmd.status, 'executing')
  assert.ok(cmd.executingAt)
  assert.deepEqual(cmd.timeline.map((x) => x.status), [
    'pending_confirm', 'pending_dispatch', 'sent', 'executing',
  ])
  engine.clearTimer(cmd.id)
})

test('recover 清理悬挂命令，但不误伤刚创建、还在等人确认的命令', () => {
  // 服务重启时下发/执行中的命令回执必丢；待确认是等人操作，给更长的窗口。
  const { engine, store } = makeEngine()
  const ago = (ms) => new Date(Date.now() - ms).toISOString()
  const mk = (id, status, ms) => ({ id, status, siteId: 's1', action: 'baf.backwash.start', actionLabel: '反冲洗', createdAt: ago(ms), timeline: [] })
  store.data.commands = [
    mk('c1', 'pending_confirm', 31 * 60 * 1000),
    mk('c2', 'pending_confirm', 4 * 60 * 1000),
    mk('c3', 'sent', 6 * 60 * 1000),
    mk('c4', 'executing', 60 * 1000),
  ]
  assert.equal(engine.recover(), 2)
  assert.equal(store.data.commands[0].status, 'timeout')
  assert.equal(store.data.commands[1].status, 'pending_confirm')
  assert.equal(store.data.commands[2].status, 'timeout')
  assert.equal(store.data.commands[3].status, 'executing')
})
