import assert from 'node:assert/strict'
import { test } from 'node:test'
import codes from '../codes.js'

const { nextCode } = codes

// 从返回值反推日期头，避免测试自己依赖「今天」是哪天。
function headOf (id, width) { return id.slice(0, id.length - width) }

test('nextCode 空集合从 001 起', () => {
  // 新库第一天必须能开出合法编号，否则第一条告警/工单就写不进去。
  const id = nextCode({}, 'alarms', 'AL')
  assert.match(id, /^AL-[0-9]{8}-001$/)
})

test('nextCode 在已有最大号上 +1，删过单据也不重号', () => {
  // 按长度或按最后一条取号，删掉中间单据后会撞号，审计链就断了。
  const first = nextCode({}, 'alarms', 'AL')
  const head = headOf(first, 3)
  const db = { alarms: ['001', '005', '003'].map((n) => ({ id: head + n })) }
  assert.equal(nextCode(db, 'alarms', 'AL'), head + '006')
})

test('nextCode 默认补零到 3 位，跨过 999 不截断', () => {
  // 编号长度规则被拦腰截断会让 1000 之后的单号回到 000，直接重号。
  const head = headOf(nextCode({}, 'alarms', 'AL'), 3)
  assert.equal(nextCode({ alarms: [{ id: head + '009' }] }, 'alarms', 'AL'), head + '010')
  assert.equal(nextCode({ alarms: [{ id: head + '099' }] }, 'alarms', 'AL'), head + '100')
  assert.equal(nextCode({ alarms: [{ id: head + '999' }] }, 'alarms', 'AL'), head + '1000')
})

test('nextCode 的 width 只影响补零，不影响计数', () => {
  const first = nextCode({}, 'workorders', 'WO', 5)
  const head = headOf(first, 5)
  assert.equal(first, head + '00001')
  assert.equal(nextCode({ workorders: [{ id: head + '00041' }] }, 'workorders', 'WO', 5), head + '00042')
})

test('不同集合各自计数，互不借号', () => {
  // 告警和命令是两套编号空间；共用一个计数器会让删一类拖另一类跳号。
  const head = headOf(nextCode({}, 'alarms', 'AL'), 3)
  const db = { alarms: [{ id: head + '007' }], commands: [] }
  assert.equal(nextCode(db, 'alarms', 'AL'), head + '008')
  assert.match(nextCode(db, 'commands', 'CMD'), /^CMD-[0-9]{8}-001$/)
})

test('同一集合里不同前缀各算各的', () => {
  // 审计日志集合混有多种前缀（AU/SY 等），前缀必须参与匹配。
  const auHead = headOf(nextCode({}, 'auditLogs', 'AU'), 3)
  const db = { auditLogs: [{ id: auHead + '012' }, { id: 'SY-19990101-099' }] }
  assert.equal(nextCode(db, 'auditLogs', 'AU'), auHead + '013')
  assert.match(nextCode(db, 'auditLogs', 'SY'), /^SY-[0-9]{8}-001$/)
})

test('只认「前缀-日期-数字」，旧日期、近似前缀、脏数据都不参与取号', () => {
  // 这些都是生产库里真实可能出现的值；一条脏数据不能把今天的号顶到 999。
  const head = headOf(nextCode({}, 'alarms', 'AL'), 3)
  const db = {
    alarms: [
      { id: 'AL-19990101-999' },
      { id: 'ALX-' + head.slice(3) + '999' },
      { id: head + 'abc' },
      { id: null },
      { id: 42 },
    ],
  }
  assert.equal(nextCode(db, 'alarms', 'AL'), head + '001')
})

test('集合缺失或为 null 时仍能开号', () => {
  // 启动早期集合尚未初始化，取号不能因此抛错。
  assert.match(nextCode({}, 'missing', 'XX'), /^XX-[0-9]{8}-001$/)
  assert.match(nextCode({ alarms: null }, 'alarms', 'AL'), /^AL-[0-9]{8}-001$/)
})
