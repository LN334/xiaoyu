#!/usr/bin/env node
/*
 * 一致性审计：一条命令回答「这一版能不能一起发」。
 *
 * 为什么写：改一次示例站点、升一次版本，要动三端十来处文件——
 *   native/seed/db.json、C# 的 Demo* 与两个窗口 XAML、server/seed、
 *   android/assets/demo/*.json、两个 .csproj、AndroidManifest、两个 .nsi、package.json。
 * 2026-11-10 改站点名时漏了安卓设置页标题和启动脚本横幅，靠人眼盯必漏，
 * 所以把「同一件事散落几处」的检查固化下来。
 *
 * 检查项：
 *   1. version  8 个发行版本号位置必须一致，README 的下载链接也跟同一版本
 *   2. seed     三端种子里的站点必须逐字段相同（安卓与桌面/网页讲同一个站）
 *   3. brand    旧品牌/旧地名只允许出现在白名单的兼容代码里
 *   4. docs     README 与 docs 里引用的本地文件必须存在
 *   5. deps     零依赖：npm 依赖为空、csproj 无 PackageReference、无 Gradle
 *   6. encoding 文件开头不能有两个 BOM（XAML/JSON 会报 root level invalid，编辑器看不出来）
 *
 * Usage: node scripts/audit.mjs [--json]
 * 退出码：0 全过；1 有失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const asJson = process.argv.includes('--json')

const fails = []
const warns = []
const results = []

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/^\uFEFF/, '')
}
function exists(relPath) {
  return fs.existsSync(path.join(root, relPath))
}

/* git ls-files 会把还没 add 的新文件也算进来；不在 git 工作区（例如解压出的副本）
   时退回目录扫描，否则审计在别人机器上会直接崩。 */
function listFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    const out = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else out.push(path.relative(root, full).split(path.sep).join('/'))
      }
    }
    walk(root)
    return out
  }
}

const files = listFiles()

// ---- 1. 版本 ----
const VERSION_SITES = [
  ['package.json', /"version"\s*:\s*"([^"]+)"/],
  ['native/ZhifuWater.Desktop/ZhifuWater.Desktop.csproj', /<Version>([^<]+)<\/Version>/],
  ['native/ZhifuWater.Kiosk/ZhifuWater.Kiosk.csproj', /<Version>([^<]+)<\/Version>/],
  ['android/AndroidManifest.xml', /android:versionName="([^"]+)"/],
  ['native/installer/setup.nsi', /!define APP_VERSION "([^"]+)"/],
  ['native/installer/kiosk.nsi', /!define APP_VERSION "([^"]+)"/],
  ['native/ZhifuWater.Desktop/Windows/LoginWindow.xaml', /Text="v([\d.]+)"/],
  ['native/ZhifuWater.Desktop/Windows/MainWindow.xaml', /Text="v([\d.]+)"/],
]

function checkVersion() {
  const seen = []
  for (const [file, re] of VERSION_SITES) {
    if (!exists(file)) { fails.push('版本：缺文件 ' + file); continue }
    const m = read(file).match(re)
    if (!m) { fails.push('版本：' + file + ' 里找不到版本号'); continue }
    seen.push([file, m[1]])
  }
  const want = seen[0] ? seen[0][1] : '?'
  const odd = seen.filter(([, v]) => v !== want)
  for (const [file, v] of odd) fails.push('版本：' + file + ' 是 ' + v + '，应为 ' + want)
  // README 的下载链接跟着版本走：发版时忘了改 README 是最容易漏的一处。
  if (exists('README.md')) {
    const md = read('README.md')
    const setupNames = [...md.matchAll(/Xiaoyu-Setup-([\d.]+)\.exe/g)].map((m) => m[1])
    const tags = [...md.matchAll(/releases\/(?:download|tag)\/v([\d.]+)/g)].map((m) => m[1])
    for (const v of setupNames) if (v !== want) fails.push('版本：README 的 Setup 文件名是 ' + v + '，应为 ' + want)
    for (const v of tags) if (v !== want) fails.push('版本：README 的 release 链接是 v' + v + '，应为 v' + want)
  }
  results.push({ name: 'version', ok: odd.length === 0, detail: want + ' × ' + seen.length })
  return want
}

// ---- 2. 三端种子 ----
const SEED_FIELDS = ['name', 'shortName', 'area', 'address', 'capacity', 'note']

function checkSeed() {
  const sources = []
  try {
    const db = JSON.parse(read('native/seed/db.json'))
    sources.push(['native', db.sites || []])
  } catch (e) { fails.push('种子：native/seed/db.json 解析失败 ' + e.message) }
  try {
    const assets = require(path.join(root, 'server/seed/assets.js'))
    sources.push(['server', assets.SITES || []])
  } catch (e) { fails.push('种子：server/seed/assets.js 解析失败 ' + e.message) }
  try {
    const jsonFile = JSON.parse(read('android/assets/demo/sites.json'))
    sources.push(['android', jsonFile.data || []])
  } catch (e) { fails.push('种子：android/assets/demo/sites.json 解析失败 ' + e.message) }

  const byId = new Map()
  for (const [name, sites] of sources) {
    for (const site of sites) {
      if (!byId.has(site.id)) byId.set(site.id, {})
      byId.get(site.id)[name] = site
    }
  }
  let bad = 0
  for (const [id, entry] of byId) {
    const ends = Object.keys(entry)
    if (ends.length < sources.length) { fails.push('种子：' + id + ' 只出现在 ' + ends.join('/')); bad++; continue }
    for (const field of SEED_FIELDS) {
      const values = ends.map((k) => entry[k][field])
      const first = values[0]
      if (values.some((v) => v !== first)) {
        fails.push('种子：' + id + ' 的 ' + field + ' 三端不一致 → ' + ends.map((k, i) => k + '=' + JSON.stringify(values[i])).join(' / '))
        bad++
      }
    }
  }
  results.push({ name: 'seed', ok: bad === 0, detail: byId.size + ' 站 × ' + SEED_FIELDS.length + ' 字段' })
}

// ---- 3. 旧品牌残留 ----
const BRAND_RE = /清渠|Qingqu|QINGQU|智赋乡水|安吉|鲁家|碧山|黟县/

/* 白名单只放两类：
 *   a) 迁移兼容代码——旧注册表键、旧环境变量、旧凭据路径、旧快捷方式清理；
 *   b) 指向真实文档名的引用——《智赋乡水 · 智慧水处理平台建设方案 V2.2》。
 * 其余一律视为漏改。 */
const BRAND_ALLOW = [
  { file: /native\/installer\/(setup|kiosk)\.nsi$/, line: /./ },
  { file: /ZhifuWater\.Kiosk\/App\.xaml\.cs$/, line: /QINGQU_KIOSK/ },
  { file: /Services\/UpdateService\.cs$/, line: /QINGQU_UPDATE_FEED/ },
  { file: /Services\/TrayIcon\.cs$/, line: /LegacyRunName|老版本/ },
  { file: /Services\/CredentialStore\.cs$/, line: /Qingqu|迁移|迁过来|改名前/ },
  { file: /ShortcutGuard\.cs$/, line: /清渠/ },
  { file: /\.md$/, line: /建设方案|方案原文/ },
  { file: /AnalyticsService\.cs$/, line: /建设方案/ },
  { file: /api\/overview\.js$/, line: /建设方案/ },
  { file: /seed\/assets\.js$/, line: /建设方案/ },
]
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|cs|xaml|json|md|nsi|xml|java|html|css|ps1|bat|cmd|txt|yml|yaml|gradle|gitignore)$/i

function checkBrand() {
  let bad = 0
  for (const file of files) {
    if (!TEXT_EXT.test(file)) continue
    // 本脚本自己就写着这些词（正则与白名单），不能审自己。
    if (file === 'scripts/audit.mjs') continue
    let text
    try { text = read(file) } catch { continue }
    if (!BRAND_RE.test(text)) continue
    const rows = text.split(/\r?\n/)
    rows.forEach((line, i) => {
      if (!BRAND_RE.test(line)) return
      const allowed = BRAND_ALLOW.some((rule) => rule.file.test(file) && rule.line.test(line))
      if (allowed) return
      fails.push('品牌：' + file + ':' + (i + 1) + '  ' + line.trim().slice(0, 90))
      bad++
    })
  }
  results.push({ name: 'brand', ok: bad === 0, detail: bad === 0 ? '无残留' : bad + ' 处' })
}

// ---- 4. 文档引用 ----
function checkDocs() {
  const mdFiles = files.filter((f) => f.endsWith('.md'))
  let checked = 0
  let bad = 0
  for (const file of mdFiles) {
    let text
    try { text = read(file) } catch { continue }
    const dir = path.posix.dirname(file)
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      let target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      target = target.split('#')[0]
      if (!target) continue
      const decoded = decodeURIComponent(target)
      const resolved = decoded.startsWith('/') ? decoded.slice(1) : path.posix.normalize(path.posix.join(dir, decoded))
      checked++
      if (!exists(resolved)) { fails.push('文档：' + file + ' 引用的 ' + decoded + ' 不存在'); bad++ }
    }
  }
  results.push({ name: 'docs', ok: bad === 0, detail: checked + ' 个本地引用' })
}

// ---- 5. 零依赖 ----
function checkDeps() {
  let bad = 0
  try {
    const pkg = JSON.parse(read('package.json'))
    const deps = Object.keys(pkg.dependencies || {})
    const devDeps = Object.keys(pkg.devDependencies || {})
    if (deps.length) { fails.push('依赖：package.json dependencies 应清空，却有 ' + deps.join(', ')); bad++ }
    if (devDeps.length) { fails.push('依赖：package.json devDependencies 应清空，却有 ' + devDeps.join(', ')); bad++ }
  } catch (e) { fails.push('依赖：package.json 解析失败 ' + e.message); bad++ }
  for (const file of files) {
    if (!file.endsWith('.csproj')) continue
    if (/<PackageReference/.test(read(file))) { fails.push('依赖：' + file + ' 引入了 NuGet 包'); bad++ }
  }
  for (const file of files) {
    if (/(^|\/)build\.gradle(\.kts)?$|(^|\/)gradlew(\.bat)?$/.test(file)) { fails.push('依赖：存在 Gradle 构建文件 ' + file); bad++ }
  }
  results.push({ name: 'deps', ok: bad === 0, detail: 'npm 0 / NuGet 0 / Gradle 0' })
}

// ---- 6. 编码 ----
/* 用 Buffer 读原始字节：read() 只剥一个 \uFEFF，双 BOM 在字符串层看不出来。
   2026-11-10 Styles.xaml 被写入两次 BOM，编译器报 MC3000，肉眼完全不可见。 */
function checkEncoding() {
  let bad = 0
  for (const file of files) {
    if (!TEXT_EXT.test(file)) continue
    let head
    try {
      const fd = fs.openSync(path.join(root, file), 'r')
      head = Buffer.alloc(6)
      fs.readSync(fd, head, 0, 6, 0)
      fs.closeSync(fd)
    } catch { continue }
    if (head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF && head[3] === 0xEF && head[4] === 0xBB && head[5] === 0xBF) {
      fails.push('编码：' + file + ' 开头有两个 BOM')
      bad++
    }
  }
  results.push({ name: 'encoding', ok: bad === 0, detail: bad === 0 ? '无双 BOM' : bad + ' 个文件' })
}

const version = checkVersion()
checkSeed()
checkBrand()
checkDocs()
checkDeps()
checkEncoding()

const passed = results.filter((r) => r.ok).length
const failed = results.length - passed
const summary = { version, results, fails, warns, passed, failed, ok: failed === 0 }

if (asJson) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log('')
  console.log('  audit · ' + version + ' · ' + root)
  console.log('')
  for (const r of results) {
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(8) + ' ' + r.detail)
  }
  if (fails.length) {
    console.log('')
    console.log('  问题：')
    for (const f of fails) console.log('    · ' + f)
  }
  if (warns.length) {
    console.log('')
    console.log('  提醒：')
    for (const w of warns) console.log('    · ' + w)
  }
  console.log('')
  console.log('  结果：' + passed + ' 过 / ' + failed + ' 失 → ' + (failed === 0 ? '可以发布' : '先修上述问题'))
  console.log('')
}

process.exit(failed === 0 ? 0 : 1)