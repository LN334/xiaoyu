# 小禹 · 开发契约（前后端共用）

本文件是页面开发的唯一接口约定。后端实现见 `server/api/*.js`，字段以实际返回为准；本文列出页面必须用到的部分。

## 1. 通用约定

- 所有接口前缀 `/api`，请求/响应均为 JSON（报表导出与备份下载除外）。
- 成功：`{ "ok": true, "data": <any>, "meta": {...可选} }`
- 失败：`{ "ok": false, "error": { "code": "SITE_FORBIDDEN", "message": "无权访问该站点数据", "details": null } }`
- 未登录返回 `401 UNAUTHORIZED`；无功能权限 `403 FORBIDDEN`；数据范围外 `403 SITE_FORBIDDEN`。
- 登录成功写入 HttpOnly Cookie `zfs_session`，前端无需手动带 token（同源 fetch 自动携带）。
- 时间均为 ISO 字符串（UTC），界面统一按浏览器本地时区显示，格式 `MM-DD HH:mm` 或 `HH:mm:ss`。
- 写操作必须给出理由（命令、参数）或结果（工单），后端强校验。

## 2. 演示账号（口令均 `water123`）

| 账号 | 角色 | 数据范围 |
| --- | --- | --- |
| admin | 平台超级管理员 | 全部 |
| wang | 区域管理员 | site-1、site-2 |
| li | 工艺负责人 | site-1 |
| zhao | 运维值班人员 | site-1 |
| chen | 现场维修人员 | site-1、site-2 |
| guest | 只读监管 | site-1 |
| sun | 运维值班人员 | site-2 |
| zhou | 现场维修（已停用） | site-2 |

## 3. 页面骨干接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/auth/me` | `{user, demo, settings, version}`；未登录 `user:null`，`version` 为当前平台发布版本 |
| `POST /api/auth/login` `{username,password}` | 登录 |
| `POST /api/auth/logout` | 退出 |
| `GET /api/meta` | 所有枚举字典：`levels/alarmStatus/workorderStatus/workorderTypes/priorities/paramWriteModes/labStatus/samplePoints/labMetrics/commandStatus/actions/inspectionResults/units/demoPassword` |
| `GET /api/sites` | 当前账号可见站点 `[{id,name,shortName,region,area,address,lat,lng,processCapacity,status,...}]` |
| `GET /api/overview?siteId=` | 驾驶舱总览：`kpis, process, trends, waterQuality, alarms, alarmCounts, workorders, diagnosis, dataHealth, resources, notice` |
| `GET /api/sites/:id/process` | 工艺页：`site, units([{code,name,order,status,readings,devices,...}]), devices, alarms, sequence, meta.interlock` |
| `GET /api/telemetry/latest?siteId=&unitCode=&type=` | `{siteId, at, items:[reading]}`；`reading={pointId,code,name,unit,unitCode,deviceId,type,value,t,quality,source,provenance,writable,stale}` |
| `GET /api/telemetry/history?siteId=&codes=A,B&from=&to=&hours=&bucketSec=` | `{series:{CODE:{name,unit,type,pointId,points:[{t,v,q}]}}}` |
| `GET /api/telemetry/stats?siteId=` | 点位数据质量：`[{code,name,count,lastAt,intervalSec,rate}]` |
| `GET /api/points?siteId=` | 点位清单（含 `range/accuracy/intervalSec/writable/provenance/source/desc`） |
| `GET /api/devices?siteId=` | 设备清单（含 `status/online/runtimeHours/starts/maintCycleDays/lastMaintAt/warrantyUntil/plAddress/health`） |
| `GET /api/devices/:id` | 设备详情（含 `points/events/maintenance`） |
| `POST /api/devices/:id/maintenance` `{note,parts,cost}` | 登记保养 |
| `GET /api/alarms?siteId=&status=open&level=&unitCode=&from=&to=&q=&page=` | `data:[alarm]`，`meta.counts` |
| `GET /api/alarms/stats?siteId=&days=` | `byDay/byLevel/byUnit/topRules/mttaMin/mttrMin/ackRate` |
| `GET /api/alarms/:id` | 含 `rule/point/device/reading/workorders/timeline` |
| `POST /api/alarms/:id/ack` `{note}` / `resolve` `{note}` / `close` | 告警处置 |
| `GET /api/alarm-rules?siteId=` / `PATCH /api/alarm-rules/:id` | 规则列表与启停 |
| `GET /api/actions?siteId=` | 可执行动作 `[{action,label,device,reading,needsConfirm,constraints,risk}]` |
| `GET /api/commands?siteId=&page=` | 命令记录 |
| `POST /api/commands` `{siteId,action,args,reason}` | 创建命令；返回 `{blocked,command,needsConfirm}`；联锁阻断时 200 + `blocked:true` |
| `POST /api/commands/:id/confirm` / `cancel` | 二次确认 / 取消 |
| `GET /api/params?siteId=` | 工艺参数（`key/currentValue/min/max/step/unit/group/writeMode/version`） |
| `GET /api/params/:id` | 含 `versions/requests/audits` |
| `POST /api/params/:id/change` `{value,reason}` | cloud 直接生效；approval 生成申请；local 返回 403 `LOCAL_ONLY` |
| `POST /api/params/:id/rollback` `{version,reason}` | 回滚到历史版本 |
| `GET /api/param-requests?siteId=` / `POST /:id/approve` / `reject` | 参数审批 |
| `GET /api/workorders?siteId=&status=open&assignee=me&q=&page=` | 工单列表，`meta.counts` |
| `GET /api/workorders/:id` | 含 `timelineView/audits/candidates` |
| `POST /api/workorders` | 创建工单 |
| `POST /api/workorders/:id/accept|start|finish|verify|assign|close` | 状态流转；finish 必填 `result` |
| `GET /api/inspection-plans?siteId=` / `GET /api/inspections?siteId=&status=` | 巡检 |
| `POST /api/inspections` `{planId,assigneeId,dueAt}` | 生成巡检任务 |
| `POST /api/inspections/:id/submit` `{items:[{key,result,note}],summary}` | `result` 取 `ok/attention/abnormal`；有异常自动建工单 |
| `GET /api/lab?siteId=&samplePoint=&status=&from=&to=` | 化验记录 |
| `GET /api/lab/stats?siteId=&days=` | `series/latestByPoint/removalRates/compliance` |
| `POST /api/lab` `{siteId,samplePoint,metrics,sampledAt,remark}` | 录入，状态 `pending_review` |
| `POST /api/lab/:id/review` `{approved,note}` | 复核 |
| `GET /api/diagnosis?siteId=` | 智能诊断 `[{id,level,title,phenomenon,causes,checks,boundary,basis,suggestion}]` |
| `GET /api/analysis/summary?siteId=&days=` | 水量/能耗/药耗/成本/水质/告警/工单/可用性 + `daily/alarmDaily/notes` |
| `GET /api/analysis/units?siteId=&days=` | 单元维度的读数、告警、健康度 |
| `GET /api/analysis/efficiency?siteId=&days=` | 设备健康与运行效率 |
| `GET /api/reports?siteId=` / `POST /api/reports` `{siteId,type,from?,to?,title?}` | 报表；`GET /api/reports/:id` 含 `sections`；`GET /api/reports/:id/export` 下载 CSV |
| `GET /api/notifications?unread=1` | 当前用户通知；`POST /api/notifications/read` `{ids}` 或 `{all:true}` |
| `GET /api/audit?action=&actor=&from=&to=&page=` | 审计日志（仅 `admin.audit`） |
| `GET /api/users` / `POST` / `PATCH /:id` / `POST /:id/reset-password` | 用户管理（仅 `admin.users`） |
| `GET /api/roles` | 角色与权限 |
| `GET /api/settings` / `PATCH /api/settings` | 系统设置（修改需 `admin.config`） |
| `GET /api/channels` / `PATCH /:id` / `POST /:id/test` | 通知通道 |
| `GET /api/backups` / `POST /api/backups` / `GET /:id/download` / `POST /:id/restore` `{confirm:true}` | 备份恢复（恢复会注销所有会话） |
| `GET /api/system/health` / `GET /api/system/sources` | 系统健康与数据来源声明 |
| WS `/ws` | `{type:'hello'}`、`{type:'telemetry',updates:[{pointId,siteId,code,v,t}]}`、`{type:'alarm'|'command'|'workorder'|'lab'|'report'|'param'|'settings',action,data}` |

## 4. 前端模块契约

每个页面文件 `web/js/pages/<name>.js` 必须导出：

```js
export async function render(root, ctx) { /* 挂载到 root */ }
export const meta = { title: '页面标题' }; // 可选，用于顶栏面包屑
```

`ctx` 由 `web/js/app.js` 注入：

| 字段 | 说明 |
| --- | --- |
| `ctx.api` | `api.get/post/patch/del(path, data)`，已解包 `data`，失败抛 `ApiError{code,message,details,status}` |
| `ctx.ui` | `el/fmt/badge/levelBadge/chart*、toast、modal、confirm、drawer、icon、empty、skeleton、tabs、segmented` 等 |
| `ctx.user` | 当前用户（含 `perms`） |
| `ctx.meta` | `/api/meta` 字典 |
| `ctx.site` | 当前站点对象；`ctx.siteId` |
| `ctx.sites` | 可见站点数组 |
| `ctx.query` | 路由查询参数对象 |
| `ctx.go(hash)` | 跳转页面，如 `ctx.go('#/workorders?id=WO-1')` |
| `ctx.toast(msg, type)` | 轻提示 `success|error|info` |
| `ctx.every(ms, fn)` | 定时器，路由切换自动清理 |
| `ctx.subscribe(fn)` | 订阅实时事件（telemetry/alarm/...），自动清理 |
| `ctx.refresh()` | 重跑当前页面 render |
| `ctx.setTitle(s)` | 修改顶栏标题 |

页面不得直接操作 shell 元素（`#sidebar`、`#topbar`），只渲染自己的 `root`。

## 5. 视觉与交互基线

- 中文界面，术语用方案原文（实时监测、工艺参数、智能诊断、工单闭环……）。
- 颜色只用于强调，状态必须「颜色 + 文字」双通道，不能只靠颜色。
- 每块数据必须能回答「来源 + 最后更新时间」：在线点位显示 `来源：模拟网关 · 12:03:22`；人工化验标「人工化验」；缺失指标标「待接入」，不得编造。
- 页面结构：页头（标题 + 说明 + 操作）→ 关键指标 → 主内容。不要重复顶栏标题。
- 表格在窄屏可横向滚动；手机宽度（≤720px）下卡片单列、按钮可点区域 ≥40px。
- 图表用内联 SVG（`ctx.ui` 已提供折线/柱状/环形/迷你图），禁止引外部 JS/CSS/字体/图标库。
- 所有用户输入渲染进 DOM 时必须转义（用 `ui.el` 的文本节点，不要拼接 innerHTML）。
- 加载态用 `ui.skeleton(n)`，空态用 `ui.empty('说明')`，错误用 `ui.errorState(err, retry)`。
- 危险操作（控制命令、参数下发、恢复备份）必须二次确认，且显示联锁/影响说明。

## 6. 核心 CSS 类（`web/css/app.css` 已实现）

- 布局：`.page` `.page-head` `.page-title` `.page-desc` `.page-actions` `.grid` `.grid.cols-2/3/4` `.stack` `.row` `.spacer`
- 卡片：`.card` `.card-head` `.card-title` `.card-sub` `.card-body` `.card-foot` `.kpi` `.kpi-value` `.kpi-label` `.kpi-delta`
- 表格：`.table-wrap` `table.data` `.num` `.mono` `.sticky`
- 标签：`.badge` + `.badge.good/warn/bad/info/muted` `.dot` `.dot.good/warn/bad/muted`
- 按钮：`.btn` `.btn.primary/ghost/danger/sm` `.btn-group`
- 表单：`.field` `.label` `.input` `.select` `.textarea` `.hint` `.error-text` `.form-grid`
- 其他：`.tabs` `.tab` `.segmented` `.empty` `.skeleton` `.timeline` `.timeline-item` `.kv` `.kv-row` `.toolbar` `.chip` `.progress` `.chart` `.scroll-y`
- 页面专属样式写进各自的 `web/css/pages-*.css`，用页面根类名限定（如 `.p-dashboard ...`），不要改全局。

## 7. 禁止事项

- 不新增 npm 依赖、不引 CDN、不用框架（React/Vue）、不用 innerHTML 拼接用户数据。
- 不伪造实时值：没有在线仪表的指标（TN/TP/SS/COD/氨氮在线值）只能展示人工化验或「待接入」。
- 不改 `server/`、`web/index.html`、`web/css/app.css`、`web/js/{api,ui,app}.js`（这些由集成方维护）。
- 每个页面至少自测：登录 → 打开页面 → 切换站点 → 窄屏 420px → 控制台无报错。

## 8. 现场触摸屏（`#/kiosk`）

- 页面根元素 `class="page p-kiosk"`；样式全部写在 `web/css/pages-kiosk.css`，选择器限定 `.p-kiosk`。
- 进入该路由时外壳用 `body:has(.p-kiosk)` 隐藏 `#sidebar` / `#topbar`，页面占满整屏；页面自己负责退出入口（`ctx.go('#/dashboard')`）。
- 目标分辨率 1920×1080（主）与 1366×768（次）；数字 ≥ 40px、正文 ≥ 16px、触控按钮 ≥ 48px。
- 数据来源与更新时间必须可见；告警确认需要 `alarm.handle`，控制动作需要 `control`，无权限时置灰并写明原因。
- 快捷操作只允许 2 项（BAF 反冲洗启停、刷新），动作理由自动填写并写入审计。
