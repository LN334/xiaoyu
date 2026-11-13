# 工程工作流

这份文档讲两件事：**发布前跑什么**，以及**为什么这些检查是必需的**。

## 一条命令：`npm run check`

```bash
npm run check            # 全跑：审计 → 桌面构建 ×2 → Web 测试 → 桌面自检
npm run check -- --skip-build   # 只改了 Web 时，跳过 C# 构建
npm run check -- --json  # 给 CI / 脚本读
```

| # | 步骤 | 检查什么 | 失败意味着 |
|---|------|----------|------------|
| 1 | `npm run audit` | 版本号 8 处一致、三端种子逐字段相同、旧品牌只剩兼容代码、文档引用不断链、依赖仍为零、文件开头无双 BOM | 有一处改了没同步 |
| 2 | `dotnet build` | 桌面端能否编过 | 改了 C# 没编译过 |
| 3 | `npm test` | Web 服务端纯函数：规则引擎、命令状态机、遥测聚合、口令校验 | 业务逻辑被改坏 |
| 4 | `Xiaoyu.exe --smoke` | 页面构造、登录、命令链 | 界面层回归 |
| 5 | `Xiaoyu.exe --shots`（可选） | 逐页截图到 `%TEMP%/zhifu-desktop-shots` | 只能人眼看，脚本不替你判断好看 |

任何一步失败即停——在坏状态上继续跑没有意义。

## 为什么需要一致性审计

同一条站点信息散落在**三端六处**：

- `native/seed/db.json`（桌面端种子）
- `native/ZhifuWater.Desktop/Data/Demo*.cs`（`ZHIFU_DEMO=1` 时的演示数据）
- `server/seed/assets.js`（Web 端）
- `android/assets/demo/*.json`（安卓端 9 个文件）
- 两个 `.nsi`（安装包内的版本与品牌）
- `package.json` / 两个 `.csproj` / `AndroidManifest.xml` / 两个窗口 XAML（版本号）

2026-11-10 把示例站点从两个虚构地名改成「中试装置 / 金华·义乌示范站」时，人工改完仍漏了安卓设置页标题与启动脚本横幅——**靠人眼盯这种散落信息必漏**，所以把检查写进 `scripts/audit.mjs`。

## 审计的鉴别力

审计必须能真的报红，否则等于没有。验证方法：故意改坏一处，看它是否精确指出文件与字段，再还原。

```bash
# 改 android/AndroidManifest.xml 的 versionName 后
node scripts/audit.mjs
# FAIL version  · 版本：android/AndroidManifest.xml 是 2.0.99，应为 2.0.21
```

## 编码：双 BOM 是隐形炸弹

2026-11-10 改 `Styles.xaml` 里的一行注释，写入时又加了一遍 BOM，文件开头变成 `EF BB BF EF BB BF`，编译器直接报：

```
Styles.xaml(1,1): error MC3000: "Data at the root level is invalid. Line 1, position 1."
```

而编辑器、`git diff`、`cat` 全都显示正常——只有 XML/JSON 解析器会在第二个 BOM 上撞墙。JSON 解析同理（`JSON.parse` 报 `Unexpected token`）。

规矩：**改已有文件时不要手写 `\uFEFF` 前缀**，要么用编辑器/补丁工具，要么显式检查文件开头三个字节。审计的 `encoding` 项就是为这条兜底。

## 旧品牌白名单

改名后保留了两类旧名字，审计对其放行：

1. **迁移兼容代码**——旧注册表键、旧环境变量、旧凭据路径、旧快捷方式清理。删掉它们会让老用户升级后出现两个图标、凭据丢失。
2. **真实文档名**——《智赋乡水 · 智慧水处理平台建设方案 V2.2》是申报材料的原文标题，属引用而非产品名。

白名单在 `scripts/audit.mjs` 的 `BRAND_ALLOW` 里，按「文件 + 行内特征」匹配。新增例外要写清理由。

## 测试

`server/test/*.test.mjs` 用 Node 自带的 `node:test`，不引入任何依赖：

```bash
npm test                      # 全部
node --test server/test/*.test.mjs   # 也可以直接指定文件
```

写法约定：

- 测试名一句话说不变量（`threshold 判定在迟滞带内不抖动`），而不是「测试 A 函数」；
- 断言旁写清**为什么这条不能坏**；
- 只测纯函数与状态机，不起端口、不读真实用户数据。

## 桌面端自检

`Xiaoyu.exe` 内置两个参数，不需要额外工具：

```bash
native/publish/Xiaoyu.exe --smoke   # 构造全部页面 + 登录 + 命令链，打印 DESKTOP-SMOKE OK pages=16
native/publish/Xiaoyu.exe --shots   # 逐页截图，输出目录 %TEMP%/zhifu-desktop-shots
```

`--smoke` 保证「页面能构造」，不保证「长得对」；视觉验收仍然看 `--shots` 截出来的图。

## 这套工作流的来源

参考了同机 Aurora 项目的工程实践：把「能不能发」变成一条可重复执行的命令，把一次性的人工检查固化成脚本，并在脚本头部写清**为什么写它、初版错在哪**。