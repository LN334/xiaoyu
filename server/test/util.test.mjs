import assert from 'node:assert/strict'
import { test } from 'node:test'
import util from '../util.js'

const {
  round, clamp, rng, hashPassword, verifyPassword,
  dayKey, localTime, startOfDay, toCSV, uid, TZ_OFFSET_MIN,
} = util

test('round 按位数四舍五入，而不是截断', () => {
  // 看板数值只保留 1~3 位；截断会把 1.239 显示成 1.23，读数会系统性偏低。
  assert.equal(round(1.2345, 2), 1.23)
  assert.equal(round(1.235, 2), 1.24)
  assert.equal(round(1.234, 0), 1)
  assert.equal(round(2.5, 0), 3)
  assert.equal(round(1.249, 1), 1.2)
  assert.equal(round(1.25, 1), 1.3)
  assert.equal(round(1.2345, 3), 1.235)
})

test('round 默认保留一位，负数不能翻成正数', () => {
  // pH 偏差、水温偏差带符号；符号丢了会让人按反方向调工艺。
  assert.equal(round(46.249), 46.2)
  assert.equal(round(46.25), 46.3)
  assert.equal(round(-1.26, 1), -1.3)
  assert.ok(round(-1.26, 1) < 0)
  assert.ok(round(-0.04, 1) <= 0)
})

test('clamp 只夹越界值，界内原样返回', () => {
  // 边界值必须算「内」：pH 7~9 的 7 和 9 都是合法值，不能被夹跑。
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(0, 0, 10), 0)
  assert.equal(clamp(10, 0, 10), 10)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(clamp(11, 0, 10), 10)
  assert.equal(clamp(7, 7, 7), 7)
  assert.equal(clamp(2.5, 2, 3), 2.5)
})

test('clamp 遇到 NaN 不伪装成 0 或边界', () => {
  // 噪声值若被静默改成 0，曲线会凭空多出一个“真实”的低值，比留空更危险。
  assert.ok(Number.isNaN(clamp(NaN, 0, 10)))
})

test('rng 同种子逐位复现，换种子换序列', () => {
  // 回填的 30 天种子曲线依赖固定种子；复现不了等于每次重启都换一份历史。
  const a = rng(20261025)
  const b = rng(20261025)
  const seqA = Array.from({ length: 64 }, () => a())
  const seqB = Array.from({ length: 64 }, () => b())
  assert.deepEqual(seqA, seqB)
  const c = rng(1)
  const d = rng(2)
  assert.notDeepEqual(Array.from({ length: 16 }, () => c()), Array.from({ length: 16 }, () => d()))
})

test('rng 默认种子就是 20261025', () => {
  // 默认种子换了，历史曲线和告警演示点都会跟旧数据对不上。
  const a = rng()
  const b = rng(20261025)
  assert.deepEqual(Array.from({ length: 8 }, () => a()), Array.from({ length: 8 }, () => b()))
})

test('rng 输出永远落在 [0, 1)', () => {
  // 若能返回 1，Math.floor(rand * n) 会取到 n，抽样索引越界直接崩。
  const r = rng(7)
  for (let i = 0; i < 10000; i++) {
    const v = r()
    assert.ok(v >= 0 && v < 1, '越界样本 ' + v)
  }
})

test('两条 rng 流互不串味', () => {
  // 每个点位各 new 一个 rng；调用顺序一变历史就变，必须只由各自种子的第几个数决定。
  const a = rng(42)
  const b = rng(42)
  const firstA = a()
  b()
  b()
  b()
  const secondA = a()
  const c = rng(42)
  c()
  assert.equal(secondA, c())
  const d = rng(42)
  assert.equal(firstA, d())
})

test('hashPassword 产出的散列串可被 verifyPassword 验证通过', () => {
  // 登录的唯一可信判据；这里坏掉要么所有人登录不上，要么任意口令都能进。
  const stored = hashPassword('P@ssw0rd-测试', '0123456789abcdef0123456789abcdef')
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]{64}$/)
  assert.equal(verifyPassword('P@ssw0rd-测试', stored), true)
})

test('错误口令一律 false，且不抛异常', () => {
  // false 必须干净返回：抛错会把登录接口打成 500，看起来像服务挂了。
  const stored = hashPassword('correct-horse', 'salt')
  assert.equal(verifyPassword('wrong-horse', stored), false)
  assert.equal(verifyPassword('', stored), false)
  assert.equal(verifyPassword('correct-horse ', stored), false)
  assert.equal(verifyPassword('CORRECT-HORSE', stored), false)
})

test('散列串被篡改、换算法或截断时一律 false', () => {
  // 数据库里坏一条记录不能让该账号绕过校验。
  const stored = hashPassword('secret', 'salt')
  const parts = stored.split('$')
  const salt = parts[1]
  const hash = parts[2]
  const flipped = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0')
  assert.equal(verifyPassword('secret', 'scrypt$' + salt + '$' + flipped), false)
  assert.equal(verifyPassword('secret', 'bcrypt$' + salt + '$' + hash), false)
  assert.equal(verifyPassword('secret', 'scrypt$onlysalt'), false)
  assert.equal(verifyPassword('secret', ''), false)
  assert.equal(verifyPassword('secret', null), false)
  assert.equal(verifyPassword('secret', undefined), false)
  assert.equal(verifyPassword('secret', stored.slice(0, -1)), false)
})

test('随机盐让同一口令两次散列不同，但都能登录', () => {
  // 固定盐会暴露「两个用户口令相同」；随机盐不能影响验证结果。
  const a = hashPassword('same-pw')
  const b = hashPassword('same-pw')
  assert.notEqual(a, b)
  assert.equal(verifyPassword('same-pw', a), true)
  assert.equal(verifyPassword('same-pw', b), true)
})

test('dayKey 按 UTC+8 分日，跨 UTC 午夜的记录归到本地次日', () => {
  // 业务编号与日汇总都按站点本地日期；按 UTC 分日会让 08:00 前的数据落错一天。
  assert.equal(TZ_OFFSET_MIN, 480)
  assert.equal(dayKey(Date.UTC(2026, 9, 25, 15, 59, 0)), '2026-10-25')
  assert.equal(dayKey(Date.UTC(2026, 9, 25, 16, 0, 0)), '2026-10-26')
  assert.equal(dayKey(Date.UTC(2026, 0, 1, 0, 0, 0)), '2026-01-01')
})

test('localTime 与 startOfDay 用同一条 +8 时区线', () => {
  // 曲线横轴与日报区间若一个用 UTC 一个用本地时间，首尾各错 8 小时。
  assert.equal(localTime(0), '1970-01-01 08:00:00')
  const localMidnight = Date.UTC(2026, 9, 25, 16, 0, 0)
  assert.equal(startOfDay(localMidnight), localMidnight)
  const noonLocal = Date.UTC(2026, 9, 26, 4, 0, 0)
  assert.equal(startOfDay(noonLocal), localMidnight)
})

test('toCSV 带 BOM 与 CRLF，并把逗号、引号、换行包进单元格', () => {
  // 运维要直接双击用 Excel 打开导出；转义坏了整张表会错列。
  const csv = toCSV(['a', 'b'], [[1, 'x,y'], ['say "hi"', 'line1\nline2']])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"x,y"'))
  assert.ok(csv.includes('"say ""hi"""'))
  assert.ok(csv.includes('"line1\nline2"'))
  assert.ok(csv.includes('\r\n'))
  assert.ok(csv.includes('a,b'))
})

test('uid 有序号时补零到 4 位，无序号时是随机 hex', () => {
  assert.equal(uid('P', 7), 'P0007')
  assert.equal(uid('P', 1234), 'P1234')
  assert.match(uid('P'), /^P[0-9a-f]{8}$/)
  assert.notEqual(uid('P'), uid('P'))
})
