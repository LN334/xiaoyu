#!/usr/bin/env node
/*
 * 发布门禁：一条命令跑完「这一版能不能发」的全部检查。
 *
 * 为什么写：审计、两端构建、测试、桌面自检本来是四件事，
 * 发版前靠记性一件件敲，漏一件就可能发出去一个版本号不一致、
 * 或者 C# 能编过但 Web 端测试红着的包。这里把它们串成一条命令，
 * 失败即停，最后只回答「可以发 / 先修」。
 *
 * 顺序有讲究：audit 最便宜，先跑；构建次之；测试最后；
 * smoke 要 publish 产物，没有就跳过（并说明怎么生成）。
 *
 * Usage: node scripts/check.mjs [--skip-build] [--json]
 * 退出码：0 全过；1 有失败。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const asJson = args.includes('--json')

function exe(relPath) {
  return path.join(root, relPath)
}

const steps = [
  { name: 'audit', cmd: process.execPath, argv: ['scripts/audit.mjs'] },
]
if (!skipBuild) {
  steps.push(
    { name: 'build:desktop', cmd: 'dotnet', argv: ['build', 'native/ZhifuWater.Desktop/ZhifuWater.Desktop.csproj', '-c', 'Release', '--nologo', '-v', 'q'] },
  )
}
steps.push({ name: 'test', cmd: process.execPath, argv: ['--test', 'server/test/*.test.mjs'] })

const published = exe('native/publish/Xiaoyu.exe')
if (fs.existsSync(published)) {
  steps.push({ name: 'smoke', cmd: published, argv: ['--smoke'] })
} else {
  steps.push({ name: 'smoke', skip: 'native/publish/Xiaoyu.exe 不存在，先 dotnet publish' })
}

function run(step) {
  const startedAt = Date.now()
  const result = spawnSync(step.cmd, step.argv, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60 * 1000,
  })
  const ms = Date.now() - startedAt
  const ok = result.status === 0
  const output = ((result.stdout || '') + (result.stderr || '')).trim()
  return { name: step.name, ok, ms, output }
}

const results = []
for (const step of steps) {
  if (step.skip) {
    results.push({ name: step.name, ok: true, skipped: true, ms: 0, output: step.skip })
    continue
  }
  const r = run(step)
  results.push(r)
  // 失败即停：后面的步骤会基于坏状态跑，结论没意义。
  if (!r.ok) break
}

const failed = results.filter((r) => !r.ok)
const ok = failed.length === 0

if (asJson) {
  console.log(JSON.stringify({ ok, results }, null, 2))
} else {
  console.log('')
  console.log('  check · ' + new Date().toLocaleString('zh-CN'))
  console.log('')
  for (const r of results) {
    const mark = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'
    const time = r.skipped ? '' : '  ' + (r.ms / 1000).toFixed(1) + 's'
    console.log('  ' + mark + '  ' + r.name.padEnd(14) + time)
    if (r.skipped) console.log('         ' + r.output)
  }
  for (const r of failed) {
    console.log('')
    console.log('  --- ' + r.name + ' 输出尾部 ---')
    const lines = r.output.split(/\r?\n/)
    console.log(lines.slice(-40).map((l) => '    ' + l).join('\n'))
  }
  console.log('')
  console.log('  结论：' + (ok ? '通过，可以发布' : '未通过，先修 ' + failed.map((r) => r.name).join(' / ')))
  console.log('')
}

process.exit(ok ? 0 : 1)