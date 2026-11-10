import assert from 'node:assert/strict'
import { test } from 'node:test'
import telemetry from '../telemetry.js'

const { Telemetry, HISTORY_DAYS } = telemetry
const FIVE_MIN = 5 * 60 * 1000
const HOUR = 60 * 60 * 1000
// 取整点毫秒作锚点，5 分钟桶与 1 小时桶都能整除；断言全部相对 BASE，不依赖运行时刻。
const BASE = Math.floor(Date.now() / HOUR) * HOUR

test('getLatest 同时给出 v/value 与 q/quality 两套字段名', () => {
  // 分析页读 v、旧接口读 value；两套名字指向同一个值，否则同一块屏会出现两个数。
  const t = new Telemetry()
  assert.equal(t.getLatest('p'), null)
  t.setLatest('p', 7.5, { t: 111, quality: 'bad', source: 'manual' })
  const l = t.getLatest('p')
  assert.equal(l.v, 7.5)
  assert.equal(l.value, 7.5)
  assert.equal(l.q, 'bad')
  assert.equal(l.quality, 'bad')
  assert.equal(l.t, 111)
  assert.equal(l.at, 111)
  assert.equal(l.source, 'manual')
})

test('pushHist 保持时间升序，重复时间戳覆盖值，乱序点不插队', () => {
  // 曲线与区间积分都假定数组按时间升序；乱序插队会把折线画成回环。
  const t = new Telemetry()
  t.pushHist('p', 1000, 1)
  t.pushHist('p', 2000, 2)
  t.pushHist('p', 1500, 9)
  t.pushHist('p', 2000, 3)
  assert.deepEqual(t.hist.p.map((x) => [x.t, x.v]), [[1000, 1], [2000, 3]])
})

test('pushHist 数值保留 3 位小数，非数值原样存', () => {
  // 历史点 3 位小数足够画曲线；多出来的精度只占内存。
  const t = new Telemetry()
  t.pushHist('p', 1000, 1.23456)
  t.pushHist('p', 2000, 1.23444)
  t.pushHist('p', 3000, 'run')
  assert.deepEqual(t.hist.p.map((x) => x.v), [1.235, 1.234, 'run'])
})

test('pushHist 同时间戳覆盖时质量也换新', () => {
  // 补传的好质量数据必须盖掉坏质量标记，否则曲线一直标灰。
  const t = new Telemetry()
  t.pushHist('p', 1000, 1, 'good')
  t.pushHist('p', 1000, 1, 'bad')
  assert.equal(t.hist.p[0].q, 'bad')
})

test('record 每 5 分钟才落一个历史点', () => {
  // 网关 3 秒一帧；不节流的话 30 天历史会被撑成几十万点。
  const t = new Telemetry()
  assert.equal(t.record('p', 1, 'good', BASE), true)
  assert.equal(t.record('p', 2, 'good', BASE + 1), false)
  assert.equal(t.record('p', 3, 'good', BASE + FIVE_MIN - 1), false)
  assert.equal(t.record('p', 4, 'good', BASE + FIVE_MIN), true)
  assert.deepEqual(t.hist.p.map((x) => [x.t, x.v]), [[BASE, 1], [BASE + FIVE_MIN, 4]])
})

test('range 按 5 分钟桶聚合 measure 取均值，桶键对齐整 5 分钟', () => {
  // 24 小时曲线是 5 分钟粒度；桶边界错位会让同一时段出现两个半桶。
  const t = new Telemetry()
  t.pushHist('p', BASE, 10)
  t.pushHist('p', BASE + 60000, 20)
  t.pushHist('p', BASE + FIVE_MIN - 1, 30)
  t.pushHist('p', BASE + FIVE_MIN, 40)
  const out = t.range(['p'], BASE, BASE + FIVE_MIN, 300)
  assert.deepEqual(out.p, [
    { t: BASE, v: 20, q: 'good' },
    { t: BASE + FIVE_MIN, v: 40, q: 'good' },
  ])
})

test('近 24 小时用 5 分钟桶、更早用 1 小时桶，聚合边界不能互相串', () => {
  // 这是 sim.backfill 的铺法：不按查询窗口选桶宽，会把 30 天摊成 5 分钟曲线，
  // 或者把最近 24 小时压成 24 个点，曲线细节全丢。
  const t = new Telemetry()
  const start = BASE - 2 * HOUR
  for (let i = 0; i < 24; i++) t.pushHist('p', start + i * FIVE_MIN, i)
  const near = t.range(['p'], start, BASE - 1, 300)
  const far = t.range(['p'], start, BASE - 1, 3600)
  assert.equal(near.p.length, 24)
  assert.equal(near.p[1].t - near.p[0].t, FIVE_MIN)
  assert.equal(far.p.length, 2)
  assert.equal(far.p[1].t - far.p[0].t, HOUR)
  // 小时桶里 0..11 与 12..23 各取均值，不能只留末值。
  assert.equal(far.p[0].v, 5.5)
  assert.equal(far.p[1].v, 17.5)
})

test('range 的 from/to 是闭区间，窗口外一个点都不进来', () => {
  // 边界差 1ms 就会把相邻窗口的数据重复算进两天的汇总。
  const t = new Telemetry()
  t.pushHist('p', BASE - 1, 1)
  t.pushHist('p', BASE, 2)
  t.pushHist('p', BASE + HOUR, 3)
  t.pushHist('p', BASE + HOUR + 1, 4)
  const out = t.range(['p'], BASE, BASE + HOUR, 300)
  assert.deepEqual(out.p.map((x) => x.v), [2, 3])
})

test('state/counter 桶内取末值，measure 取均值', () => {
  // 运行状态取均值会出现「0.37 台泵在运行」这种荒唐值。
  const t = new Telemetry()
  t.pushHist('p', BASE, 0)
  t.pushHist('p', BASE + 60000, 1)
  t.pushHist('p', BASE + 120000, 0)
  const asMeasure = t.range(['p'], BASE, BASE + 299999, 300, { p: 'measure' })
  const asState = t.range(['p'], BASE, BASE + 299999, 300, { p: 'state' })
  const asCounter = t.range(['p'], BASE, BASE + 299999, 300, { p: 'counter' })
  assert.equal(asMeasure.p[0].v, 0.333)
  assert.equal(asState.p[0].v, 0)
  assert.equal(asCounter.p[0].v, 0)
})

test('range 对没有历史的点位返回空数组', () => {
  // 前端直接 .map 曲线点；undefined 会让整页白屏。
  const t = new Telemetry()
  const out = t.range(['nope', 'also-nope'], BASE, BASE + HOUR, 300)
  assert.deepEqual(out, { nope: [], 'also-nope': [] })
})

test('count 只数闭区间内的点', () => {
  const t = new Telemetry()
  t.pushHist('p', BASE - 1, 1)
  t.pushHist('p', BASE, 2)
  t.pushHist('p', BASE + HOUR, 3)
  t.pushHist('p', BASE + HOUR + 1, 4)
  assert.equal(t.count('p', BASE, BASE + HOUR), 2)
  assert.equal(t.count('nope', BASE, BASE + HOUR), 0)
})

test('trim 砍掉超过 30 天的历史点', () => {
  // 不裁剪的话常驻进程内存会随运行时长单调增长。
  const t = new Telemetry()
  const now = Date.now()
  t.pushHist('p', now - 31 * 86400000, 1)
  t.pushHist('p', now - 29 * 86400000, 2)
  t.pushHist('p', now - 1000, 3)
  t.trim('p')
  assert.equal(HISTORY_DAYS, 30)
  assert.deepEqual(t.hist.p.map((x) => x.v), [2, 3])
})

test('range 的 measure 桶遇到非数值样本不产出 NaN 点', () => {
  // 旧实现 Math.round('run' * 1000) 得到 NaN，JSON 序列化后变 null，前端曲线断点还带个 undefined。
  const t = new Telemetry()
  t.pushHist('p', BASE, 'run')
  t.pushHist('p', BASE + FIVE_MIN, 2.5)
  t.pushHist('p', BASE + 2 * FIVE_MIN, 'stop')
  const out = t.range(['p'], BASE, BASE + 3 * FIVE_MIN, 300)
  assert.deepEqual(out.p.map((x) => [x.t - BASE, x.v]), [[FIVE_MIN, 2.5]])
  for (const x of out.p) assert.ok(Number.isFinite(x.v))
})

test('state 桶的非数值末值原样保留，不被抹成 null', () => {
  // 泵状态是 'run'/'stop' 这类枚举；当成数字取整会丢掉状态名。
  const t = new Telemetry()
  t.pushHist('p', BASE, 'run')
  const out = t.range(['p'], BASE, BASE + 299999, 300, { p: 'state' })
  assert.equal(out.p[0].v, 'run')
})
