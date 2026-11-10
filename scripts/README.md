# scripts/

长期工具与一次性脚本分开放。**新增脚本前先想清楚它属于哪一类**——一次性脚本进 `_archive/`，不要留在根上。

## 长期工具

| 文件 | 用途 | 怎么跑 |
|------|------|--------|
| `audit.mjs` | 一致性审计：版本 / 三端种子 / 旧品牌 / 文档引用 / 零依赖 | `npm run audit` |
| `check.mjs` | 发布门禁：串起审计、两端构建、Web 测试、桌面自检 | `npm run check` |
| `smoke.js` | 接口冒烟（78 项），校验响应结构与权限边界 | 先起服务，再 `node scripts/smoke.js` |
| `build_preview.js` | 把 Web 端打成自包含离线预览 HTML，用于无回环访问时的视觉核验 | `node scripts/build_preview.js` |
| `capture_fixtures.js` | 抓真实接口快照供离线预览替换 fetch/WebSocket | 先起服务，再 `node scripts/capture_fixtures.js` |
| `shot-xiaoyu.ps1` | 截取小禹窗口画面 | `powershell -File scripts/shot-xiaoyu.ps1` |
| `capture-window.ps1` | 截取指定窗口 | 同上，传 `-Out` 指定输出 |

## `_archive/`

54 个一次性脚本：`patch-*`、`fix-*`、`bump-*`、通知功能的临时探针，以及早期的预览脚手架。

它们各自只服务某一次改动，改完就没有再跑的必要。留着是为了「当时为什么这么改」可查——**不再维护，不要在新流程里调用**。

## 约定

1. 脚本头部写清楚：为什么写它、初版错在哪、用法。半年后回来看的人只有注释可依靠。
2. 能进 `npm run check` 的检查，就不要写成人工步骤。
3. 一次性脚本用完就移进 `_archive/`，别让根目录变成补丁堆。