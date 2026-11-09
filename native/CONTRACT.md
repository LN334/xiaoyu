# ZhifuWater.Core · 公开 API 契约

> **状态：定稿（2026-10-26）** · 目标框架 `net8.0` · **零 NuGet 依赖** · 只依赖 BCL。
> 本契约面向 **WPF 桌面端（native-desktop）**：下表所有 `public` 成员都可以**直接调用**，不需要 HTTP、不需要再包一层。
> 自测：`dotnet run --project native/ZhifuWater.Core.Tests` → `CORE-TESTS PASS 174/174`。

---

## 0. 快速开始

```csharp
using ZhifuWater.Core;
using System.Text.Json.Nodes;

// 数据目录（首次运行自动从 D:\小禹\data\db.json 复制一份作为私有副本）
var core = new CoreServices(new CoreServicesOptions
{
    DataDir    = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZhifuWater"),
    SeedSource = @"D:\小禹\data\db.json",
    AutoStart  = true,     // 构造后自动启动模拟网关与告警规则引擎
    SpeedFactor = 1.0      // >1 加速（调试用），1.0 = 真实 5 秒 tick
});

core.TelemetryUpdated += payload => { /* payload["updates"] 是点位最新值数组 */ };
core.AlarmChanged     += payload => { /* payload["action"] = create|update|ack|resolve|close|escalate */ };

// 登录：返回 LoginResult（唯一非 JsonNode 的返回类型）
var login = core.Auth.Login("admin", "water123", ip: "127.0.0.1", agent: "WPF");
JsonObject user = login.User;          // 已 sanitize（无 password，含 roleName/perms/siteScope）
string token    = login.Token;         // 原生 token（库里只存 SHA-256）

// 之后每个业务方法都收这个 user（或 null = 未登录，会抛 401）
var overview = core.Analytics.Overview(user);
var latest   = core.Analytics.LatestList("site-1");

core.Dispose();   // = Stop() + 落盘 + 释放定时器
```

**一句话**：`CoreServices` 是唯一入口，10 个子服务通过属性暴露；所有数据都是 `System.Text.Json.Nodes.JsonNode`（`JsonObject` / `JsonArray`），与 `data/db.json` 及 Node 版 HTTP 响应的 `data` 段**逐字段一致**。

---

## 1. 生命周期与线程模型

| 成员 | 说明 |
| --- | --- |
| `CoreServices()` | 全部默认值（数据目录 = `%LOCALAPPDATA%\ZhifuWater`，种子 = `D:\小禹\data\db.json`，自动启动） |
| `CoreServices(string dataDir, string? seedSource = null, bool autoStart = true)` | 常用简化构造 |
| `CoreServices(CoreServicesOptions options)` | 完整构造 |
| `Start()` | 幂等。`Simulator.Start()`（含 30 天历史回填）→ `Rules.Start()` → `Commands.Recover()` → `Auth.CleanupSessions()` |
| `Stop()` | 停模拟与规则引擎，`Store.Save(force: true)` 落盘。可再次 `Start()` |
| `RunTicks(int count = 1, double dtSec = 5)` | **手动驱动**：循环 `Simulator.Tick(dtSec)` + `Rules.Evaluate()`。自测/演示用，不受 `SpeedFactor` 影响 |
| `RuntimeSnapshot()` | `{mode,engine,version,startedAt,uptimeSec,dataFile,running,historyDays}` |
| `Dispose()` | `Stop()` + `Store.Dispose()` + `TimerHost.Dispose()` |
| `IsRunning` / `StartedAt` / `DataDir` / `DataFile` / `SpeedFactor` | 只读状态（`SpeedFactor` 可读写，热调整） |

**线程（重要）**：内部定时器（`Timer`）在 **ThreadPool 线程**上跑 tick 并**直接修改同一棵 JsonNode 数据树**，然后触发事件。数据树本身**没有全局锁**。因此：

- 事件回调必须自己切回 UI 线程：`Application.Current.Dispatcher.BeginInvoke(...)`。
- UI 线程上的读写调用与定时器 tick 之间存在**理论上的竞争**。桌面端有两种安全用法：
  1. **事件驱动只读**：tick 只写遥测、告警、命令，UI 只读 `Analytics.*` / `Rules.*`，实践上足够（Node 版同样是单线程事件循环 + 定时器）；
  2. **完全手动驱动**（推荐给 WPF 演示/截屏）：构造时 `AutoStart = false`，在 UI timer 里调 `core.RunTicks(1)`，这样所有数据变更都在 UI 线程上发生，事件也不需要 marshal。
- `Store.SaveSoon()` 有 400ms 节流；`Store.Save(true)` 用 `tmp` + `File.Move(overwrite)` 原子替换，崩溃不会写坏 db.json。

---

## 2. 错误模型

所有业务失败都抛 `CoreException`（**不要**用返回值判断成功/失败）：

```csharp
public sealed class CoreException : Exception
{
    public int Status { get; }              // HTTP 语义状态码：400/401/403/404/409/429/500
    public string Code { get; }             // 稳定错误码，如 "BAD_CREDENTIALS" / "BAD_STATUS" / "INCOMPLETE"
    public JsonNode? Details { get; }       // 可选结构化细节（如缺失巡检项 key 列表）
    public JsonObject ToErrorJson();        // {status, code, message, details?} —— 与 Node 版错误体一致
}
```

示例：`catch (CoreException ex) when (ex.Code == "ALARM_NOTE_REQUIRED")`。`message` 是**中文用户文案**，可直接弹给用户；`code` 用于分支判断。

---

## 3. 认证与会话（`CoreServices.Auth` → `Auth`）

```csharp
public sealed record LoginResult(string Token, JsonObject User, JsonObject Session);

public LoginResult Login(string? username, string? password, string? ip = "", string? agent = "");
public void        Logout(string? rawToken);
public void        LogoutAllFor(string userId);
public JsonObject? UserFromToken(string? rawToken, bool touch = true);   // 每次请求取当前用户
public JsonObject? Sanitize(JsonObject? user);                           // 去 password + 补 roleName/perms/siteScope
public JsonObject  RoleOf(JsonObject user);
public List<string> Permissions(JsonObject user);
public List<string> SiteScope(JsonObject user);                          // 可访问站点 id 列表
public bool        Can(JsonObject? user, string perm);
public bool        CanSite(JsonObject? user, string? siteId);
public void        CleanupSessions();
public void        ResetAttempts();
public int         ActiveSessionCount();
public static string RawToken(string? authorization, string? cookie);    // 从 Authorization / Cookie 里提取
```

- **口令**：`scrypt$<salt hex>$<dk hex>`，`N=16384,r=8,p=1,dkLen=32`（RFC 7914 纯 C# 实现，与 Node `crypto.scryptSync` 逐字节一致）。`data/db.json` 里 8 个账号的 `water123` 全部可校验通过。
- **会话**：token = 24 字节随机 → base64url；库里只存 `Sha256Hex(token)`；TTL **12 小时**；`lastSeenAt` 每 5 分钟最多续一次；每账号保留未过期会话，全局上限 200 条。
- **登录保护**：同一用户名连续 5 次失败 → 锁 **60 秒**（`CoreException(429, …, "LOCKED")`）；`status != active` → `403 INACTIVE`。
- 权限码（11 个）：`view, control, alarm.handle, workorder.handle, param.edit, report.export, lab.review, inspection.execute, admin.users, admin.config, admin.audit`。

---

## 4. 门面 `CoreServices`

### 4.1 属性

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `Store` | `Store` | 底层 JSON 存储（`Data`、`FilePath`、`Save(true)`、备份） |
| `Auth` | `Auth` | 登录/会话/权限 |
| `Telemetry` | `Telemetry` | 最新值 + 历史 |
| `Simulator` | `Simulator` | 内置网关（站点状态/曲线/tick/回填/联锁） |
| `Rules` | `RulesEngine` | 告警生命周期（含 `AlarmsApi` 分部的查询/规则 CRUD） |
| `Commands` | `CommandEngine` | 命令状态机（含 `ControlApi` 分部） |
| `Diagnosis` | `DiagnosisService` | 7 类专家诊断 |
| `Analytics` | `AnalyticsService` | KPI / 趋势 / 单元卡 / 设备健康 / 系统信息 |
| `Ops` | `OpsService` | 工单 / 巡检 / 化验 |
| `Params` | `ParamsService` | 工艺参数 / 审批 / 回滚 |
| `Admin` | `AdminService` | 用户 / 角色 / 设置 / 通道 / 备份 / 审计 / 通知 |
| `Reports` | `ReportsService` | 分析汇总 + 报表五段 + CSV |
| `Notifier` | `Notifier` | 站内通知 |
| `Audit` | `AuditService` | 审计写入 |

### 4.2 事件（都在后台线程触发，UI 需 marshal）

```csharp
public event Action<JsonObject>? AnyEvent;         // 所有实时事件的原文
public event Action<JsonObject>? TelemetryUpdated;  // {type:"telemetry", t, updates:[{pointId,siteId,code,v,t}]}
public event Action<JsonObject>? AlarmChanged;      // {type:"alarm", action, data}
public event Action<JsonObject>? CommandChanged;    // {type:"command", action, data}
public event Action<JsonObject>? DataChanged;       // 其他变更（param/settings/workorder/…）
public event Action<Exception>? Error;              // 落盘失败等内部异常
```

`action` 取值：告警 `create/update/ack/resolve/close/escalate`；命令 `create/confirm/sent/executing/result`；参数 `update`；设置 `settings`。

### 4.3 配置

```csharp
public sealed class CoreServicesOptions
{
    public string  DataDir { get; set; } = DefaultDataDir();     // %LOCALAPPDATA%\ZhifuWater
    public string? SeedSource { get; set; } = @"D:\小禹\data\db.json";
    public bool    AutoStart { get; set; } = true;
    public double  SpeedFactor { get; set; } = 1.0;
    public bool    CopySeedOnFirstRun { get; set; } = true;
    public Action<Exception>? OnError { get; set; }
    public static string DefaultDataDir();
}
```

首次运行：`DataDir` 下没有 `db.json` → 从 `SeedSource` 复制一份；两者都没有 → `CoreException(500, …, "DATA_MISSING")`。

---

## 5. 遥测（`Telemetry`）

```csharp
public void      SetLatest(string pointId, double value, long? t = null, string quality = "good", string source = "gateway");
public void      SetLatest(string pointId, JsonNode? value, long? t = null, string quality = "good", string source = "gateway");
public JsonObject? GetLatest(string pointId);          // {v,t,q,source}
public bool      HasLatest(string pointId);
public long?     LatestAt(string pointId);
public JsonObject AllLatest();                         // pointId → {v,t,q,source}
public List<string> PointIds();
public void      PushHist(string pointId, long t, JsonNode? v, string q = "good");
public bool      Record(string pointId, JsonNode? value, string quality = "good", long? t = null);  // 5 分钟落桶去重
public void      Trim(string pointId);
public JsonObject Range(IEnumerable<string> pointIds, long from, long to, int bucketSec = 300,
                        Dictionary<string, string>? types = null);   // types: pointId → type（决定取 avg/last/sum）
public int       Count(string pointId, long from, long to);
public int       HistCount(string pointId);
public List<HistPoint> HistOf(string pointId);
```

- 历史保留 **30 天**（`HISTORY_DAYS=30`），实时落桶 **5 分钟**（`LIVE_BUCKET_MS`）。
- `HistPoint` 是一条 `{t, v, q}`。

---

## 6. 内置模拟网关（`Simulator`）

```csharp
public      void Start();  public void Stop();
public      void Tick(double dtSec = 5);                       // 一步推进（两站点）
public      void Backfill(long? nowArg = null);                // 30 天回填（Start 已调用）
public      void WriteTelemetry(long now);
public      bool HasState(string siteId);
public      SiteState? State(string siteId);                   // 实时状态（联锁/桌面端只读；StateOf 同义）
public      JsonObject? Status(string siteId);                 // 给 UI 的站点快照
public      JsonObject Precheck(string siteId, string action, JsonObject? args = null);   // {ok, error}
public      JsonObject Execute(string siteId, string action, JsonObject? args = null);
public      JsonObject StartBackwash(string siteId, string unitCode);                     // unitCode: baf|sulfur
public      JsonObject StopBackwash(string siteId, string unitCode);
public      IDisposable On(Action<JsonObject> fn);             // 订阅模拟器自身的实时事件（等价于 CoreServices.AnyEvent 的 telemetry/alarm 分流）

// 高级/调试
public      void StepSite(string siteId, SiteState s, double dt, long now);
public      void StepBackwash(BafState unit, double dt, long now, Action done);
public      double HistValue(string code, long t, long now, SiteState st, Mulberry32 rand);
public      double? CurrentValue(string siteId, JsonObject point);
public static readonly (int phase, string name, int sec)[] BwPhases;
```

- `Store` 之外的定时器统一由 `TimerHost` 管（`Schedule/Every/Cancel/Dispose` + `SpeedFactor` 缩放），Core 退出时一并释放。

- 2 个站点曲线、5 秒 tick；反冲洗三阶段 **气冲 30s → 气水联合 90s → 漂洗 45s**；`BAF dp>24 且距上次 >20h` 自动触发反冲洗。
- `SiteState`（public 类）：`Raw{Level,PumpRun,PumpMode,Fault,Hours,Starts,Refill,Trip?}`、`Baf{Ph,Do,P,Dp,Blower,BwPhase,BwCount,BwAt?,BwRemain}`、`Pac/Pam{Level,Dose,Run,Total,Mixer}`、`Sulfur{…}`、`ClearLevel`、`WasteLevel`、`PowerKw`、`PowerKwh`。
- **联锁在 `Precheck` 里做**（读实时状态，不读遥测）：`raw.pump.start` 液位 <5 拒动、`baf.blower.stop` DO<2.5 拒动等 11 条。

---

## 7. 告警（`Rules` → `RulesEngine` + `AlarmsApi`）

**引擎**（自动运行，也可手动驱动）：

```csharp
public void Start(); public void Stop();
public void Evaluate(long? nowArg = null);                 // 全量评估（Start 内部每 5s 一次）
public void EvaluateRule(JsonObject rule, JsonObject site, long now);
public void AttachActive();
public void RebuildPointIndex();
public JsonObject? Latest(string siteId, string code);
public int OpenCount(string? siteId = null);
public static string ThresholdText(JsonObject rule);
public static bool IsOut(JsonObject rule, double? v);
public static bool IsClear(JsonObject rule, double? v);     // 迟滞带
public static readonly Dictionary<string,string> LEVEL_NAME; // info 提示 / minor 次要 / major 重要 / critical 紧急
```

**查询与处置**（返回给 UI 的视图都已补中文名）:

```csharp
public JsonObject   ListAlarms(JsonObject? user, string? siteId = null, string? status = null,
                               string? level = null, string? unitCode = null, string? from = null,
                               string? to = null, string? q = null, int? page = null, int? pageSize = null);
public JsonObject   AlarmStats(JsonObject? user, string? siteId = null, int? days = null);
public JsonObject   AlarmDetail(JsonObject? user, string id);        // + rule/point/device/reading/workorders/timeline
public JsonObject   AckAlarm(JsonObject? user, string id, string? note = null, string ip = "");
public JsonObject   ResolveAlarm(JsonObject? user, string id, string? note = null, string ip = "");  // note 必填
public JsonObject   CloseAlarm(JsonObject? user, string id, string? note = null, string ip = "");    // note 必填
public JsonObject   AlarmView(JsonObject a);

public JsonArray    ListAlarmRules(JsonObject? user, string? siteId = null);
public JsonObject   UpdateAlarmRule(JsonObject? user, string ruleId, JsonObject body, string ip = "");
public JsonObject   CreateAlarmRule(JsonObject? user, JsonObject body, string ip = "");
public JsonObject   RuleView(JsonObject r);

// 引擎级（user 为 JsonObject，不做 401 检查）
public JsonObject   Acknowledge(JsonObject user, string alarmId, string note = "", string ip = "");
public JsonObject   Resolve(JsonObject user, string alarmId, string note = "", string ip = "");
public JsonObject   Close(JsonObject user, string alarmId, string note, string ip = "");
```

- 生命周期：`active → acknowledged → resolved → closed`；`durationSec` 到点才建告警，`hysteresis` 迟滞带防抖，`escalateSec` 未确认自动升一级；参数回稳自动 `resolved`（`resolvedBy="system"`）。
- 编号 `AL-YYYYMMDD-NNN`；列表返回 `{items,total,page,pageSize,pages,counts{all,active,acknowledged,resolved,closed,critical,major},levels}`。

---

## 8. 控制命令（`Commands` → `CommandEngine` + `ControlApi`）

```csharp
// 面向 UI
public JsonObject ListActions(JsonObject? user, string? siteId = null);   // 11 个动作 + 当前读数 + 约束文案
public JsonObject ListCommands(JsonObject? user, string? siteId = null, string? status = null, string? action = null,
                               string? from = null, string? q = null, int? page = null, int? pageSize = null);
public JsonObject CommandDetail(JsonObject? user, string id);
public JsonObject CreateCommand(JsonObject? user, JsonObject body, string ip = "");
public JsonObject ConfirmCommand(JsonObject? user, string id, string ip = "");
public JsonObject CancelCommand(JsonObject? user, string id, string? reason = null, string ip = "");

// 引擎级（自测/高级用法）
public CreateResult Create(JsonObject user, string siteId, string action, JsonObject? args = null, string reason = "", string ip = "");
public JsonObject? Get(string id);
public JsonObject  Confirm(JsonObject user, string id, string ip = "");
public JsonObject  Cancel(JsonObject user, string id, string reason = "", string ip = "");
public JsonObject  CommandView(JsonObject c);
public void Dispatch(string id); public void Execute(string id); public void Finish(string id);
public void ScheduleDispatch(string id); public int Recover();
public static string StatusName(string status);
public static IReadOnlyDictionary<string, ActionMeta> ACTIONS;   // key → {Label,DeviceKey,Risk,ExecMs,Effect}
public static IReadOnlyDictionary<string, string> STATUS_NAME;   // 8 态中文名
public sealed record CreateResult(JsonObject? Command, bool Blocked, string? Error);
```

- 状态机 8 态：`pending_confirm → pending_dispatch → sent → executing → success|failed|timeout|cancelled`。
- **高风险动作**（`raw.pump.mode.set`、`baf.blower.stop`、`baf.backwash.start`、`sulfur.backwash.start`）必须二次确认；`reason`（操作理由）必填。
- **联锁**：`Create` 先跑 `Simulator.Precheck`，不通过 → 命令直接 `failed` + `failReason`，`Blocked = true`，并给操作人发通知。
- 回执超时 `settings.commandTimeoutSec`（默认 30s）→ `timeout`。时间线 `timeline[]` 记录每步，`audits[]` 记审计。

---

## 9. 分析 / KPI / 驾驶舱（`Analytics`）

```csharp
public JsonObject   Meta(JsonObject? user);
public JsonArray    Sites(JsonObject? user);
public JsonObject   SiteDetail(JsonObject? user, string id);
public JsonObject   Overview(JsonObject? user, string? siteId = null);       // 驾驶舱：9 KPI + 工艺卡 + 6 趋势 + 水质/去除率 + 告警/工单/诊断 + dataHealth
public JsonObject   Process(JsonObject? user, string id);                    // 工艺总览：units/devices/alarms/sequence/interlock
public JsonObject   TelemetryLatest(JsonObject? user, string? siteId = null, string? unitCode = null, string? type = null);
public JsonObject   TelemetryHistory(JsonObject? user, string? siteId = null, string? codes = null,   // codes 逗号分隔；from/to 为 ISO 字符串
                                     string? from = null, string? to = null, int? bucketSec = null);
public JsonObject   TelemetryStats(JsonObject? user, string? siteId = null, string? codes = null, double? hours = null);
public JsonObject   Points(JsonObject? user, string? siteId = null, string? unitCode = null, string? type = null, string? q = null);
public JsonObject   PointDetail(JsonObject? user, string id);
public JsonObject   Devices(JsonObject? user, string? siteId = null, string? unitCode = null, string? status = null, string? q = null);
public JsonObject   DeviceDetail(JsonObject? user, string id);
public JsonObject   AddMaintenance(JsonObject? user, string deviceId, JsonObject? body, string ip = "");
public JsonObject   SystemHealth(JsonObject? user);
public JsonObject   SystemSources(JsonObject? user);

// 纯函数（可直接给图表用）
public JsonArray    LatestList(string siteId);                                 // 每点位一条 reading
public JsonObject   Series(string siteId, IEnumerable<string> codes, long from, long to, int bucketSec = 1800);
public static JsonObject Summarize(IEnumerable<JsonObject>? arr);             // {count,min,max,avg,last}
public static double Integrate(IEnumerable<JsonObject>? arr);                 // 梯形积分（h 权重）
public static double CounterDelta(IEnumerable<JsonObject>? arr);              // 累计量差值
public static JsonObject? DeviceHealth(JsonObject? device, long? now = null);// {score,level,needMaint,daysToMaint,overdue,online}
public JsonArray    UnitCards(string siteId);                                  // 单元卡：normal/attention/alarm/offline/stale/no-instrument
public JsonObject?  Reading(JsonObject? point);                               // {pointId,code,name,unit,unitCode,deviceId,type,value,v,t,quality,q,source,provenance,writable,stale}
public static int    LevelRank(string level);
public static double? Removal(double? a, double? b);
public List<JsonObject> PointsOfSite(string siteId);
public JsonObject?  PointByCode(string siteId, string code);
public static IReadOnlyDictionary<string, string[]> UNIT_KEY_CODES;
```

> 注意：`Overview()` 里的 `trends` 是 **JsonObject**（按 code 索引，每个含 `name/unit/type/points`），不是数组。

---

## 10. 运维（`Ops`）

**工单**（`pending → accepted → processing → done → verified`，另有 `closed`）：

```csharp
public JsonObject ListWorkorders(JsonObject? user, string? siteId = null, string? status = null, string? priority = null,
                                 string? type = null, string? assignee = null, string? q = null,
                                 int? page = null, int? pageSize = null);      // counts{6 态 + open/overdue/mine}
public JsonObject WorkorderDetail(JsonObject? user, string id);
public JsonObject CreateWorkorder(JsonObject? user, JsonObject? body, string ip = "");
public JsonObject AcceptWorkorder(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject StartWorkorder (JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject FinishWorkorder(JsonObject? user, string id, JsonObject? body, string ip = "");   // body.result 必填
public JsonObject VerifyWorkorder(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject AssignWorkorder(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject CloseWorkorder (JsonObject? user, string id, JsonObject? body, string ip = "");
```

**巡检**（提交异常项可自动建单）：

```csharp
public JsonArray  InspectionPlans(JsonObject? user, string? siteId = null);
public JsonObject ListInspections(JsonObject? user, string? siteId = null, string? status = null, string? assignee = null);
public JsonObject InspectionDetail(JsonObject? user, string id);
public JsonObject CreateInspection(JsonObject? user, JsonObject? body, string ip = "");
public JsonObject SubmitInspection(JsonObject? user, string id, JsonObject? body, string ip = "");   // {task,abnormal[],workorder}
```

**化验**（录入 → 复核/退回）：

```csharp
public JsonObject ListLab(JsonObject? user, string? siteId = null, string? samplePoint = null, string? status = null,
                          string? from = null, string? to = null, string? q = null, int? page = null, int? pageSize = null);
public JsonObject LabStats(JsonObject? user, string? siteId = null, int? days = null);
public JsonObject LabDetail(JsonObject? user, string id);
public JsonObject CreateLab(JsonObject? user, JsonObject? body, string ip = "");
public JsonObject ReviewLab(JsonObject? user, string id, JsonObject? body, string ip = "");          // body.approved
public JsonArray  LabPlans(JsonObject? user, string? siteId = null);
public static IReadOnlyDictionary<string,double> LIMITS;   // COD 50 / NH3N 5 / TN 15 / TP 0.5 / SS 10
```

---

## 11. 工艺参数（`Params`）

```csharp
public JsonObject ListParams(JsonObject? user, string? siteId = null, string? group = null, string? q = null);
public JsonObject ParamDetail(JsonObject? user, string id);          // + versions + requests + audits
public JsonObject ChangeParam(JsonObject? user, string id, JsonNode? value, string? reason = null, string ip = "");
public JsonObject RollbackParam(JsonObject? user, string id, JsonNode? version, string? reason = null, string ip = "");
public JsonObject ListRequests(JsonObject? user, string? siteId = null, string? status = null);
public JsonObject ApproveRequest(JsonObject? user, string requestId, string? note = null, string ip = "");
public JsonObject RejectRequest(JsonObject? user, string requestId, string? note = null, string ip = "");
```

- `writeMode`：`cloud` 云端可写（留痕）/ `approval` 审批后生效 / `local` 仅现场可改（远程写 → `403 LOCAL_ONLY`）/ `read` 只读。
- `ChangeParam` 返回 `{applied:true, version, param}` 或 `{applied:false, request, param}`（审批流）。

---

## 12. 管理（`Admin`）

```csharp
// 通知
public JsonObject ListNotifications(JsonObject? user, bool unreadOnly = false, string? type = null, int? page = null, int? pageSize = null);
public JsonObject MarkNotificationsRead(JsonObject? user, JsonObject? body);
public JsonObject DeleteNotification(JsonObject? user, string id);

// 审计
public JsonObject AuditLogs(JsonObject? user, string? siteId = null, string? action = null, string? actor = null,
                            string? result = null, string? from = null, string? to = null, string? q = null,
                            int? page = null, int? pageSize = null);      // 附 actionName / actorName

// 用户与角色
public JsonObject Users(JsonObject? user, string? role = null, string? status = null, string? q = null);
public JsonObject CreateUser(JsonObject? user, JsonObject? body, string ip = "");
public JsonObject UpdateUser(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject ResetPassword(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonArray  Roles(JsonObject? user);

// 设置与通道
public JsonObject Settings(JsonObject? user);                          // + storage{file,size,savedAt,historyDays}
public JsonObject UpdateSettings(JsonObject? user, JsonObject? body, string ip = "");
public JsonArray  Channels(JsonObject? user);
public JsonObject UpdateChannel(JsonObject? user, string id, JsonObject? body, string ip = "");
public JsonObject TestChannel(JsonObject? user, string id, string ip = "");

// 备份
public JsonObject Backups(JsonObject? user);
public JsonObject CreateBackup(JsonObject? user, JsonObject? body, string ip = "");
public (string fileName, byte[] content) DownloadBackup(JsonObject? user, string id);
public JsonObject RestoreBackup(JsonObject? user, string id, JsonObject? body, string ip = "");   // body.confirm 必须为 true
public JsonObject DeleteBackup(JsonObject? user, string id, string ip = "");

```csharp
// 诊断（专家规则）—— 第二个参数传门面里的 core.Diagnosis 即可
public JsonObject Diagnosis(JsonObject? user, string? siteId, DiagnosisService diagnosis);        // {items,note}
public JsonObject DiagnosisItem(JsonObject? user, string id, string? siteId, DiagnosisService diagnosis);

public static IReadOnlyDictionary<string,string> AUDIT_ACTIONS;
```

`Settings()` 里的可写键：`platformName/shortName/orgName/version/docVersion/demoMode/dataRetentionDays/commandTimeoutSec/alarmP95TargetSec/autoRefreshSec/offlineCacheMinutes/quietHours/backup/notice/dataSources`（越界数值自动夹取，不报错）。

---

## 13. 报表（`Reports`）

```csharp
public JsonObject SiteMetrics(string siteId, long from, long to);     // water/energy/chemicals/cost/quality/alarms/workorders/availability
public JsonObject Summary(JsonObject? user, string? siteId = null, int? days = null);
public JsonObject Units(JsonObject? user, string? siteId = null, int? days = null);      // {siteId,days,items:[…]}
public JsonObject Efficiency(JsonObject? user, string? siteId = null, int? days = null);

public JsonObject   ListReports(JsonObject? user, string? siteId = null, string? type = null, int? page = null, int? pageSize = null);
public JsonObject   ReportDetail(JsonObject? user, string id);
public JsonObject   CreateReport(JsonObject? user, JsonObject? body, string ip = "");     // 返回报表对象本身（含 id/title/periodFrom/periodTo/format）+ sections(5 段)
public (string fileName, string content) ExportCsv(JsonObject? user, string id, string ip = "");   // UTF-8 带 BOM，CRLF
public JsonObject   DeleteReport(JsonObject? user, string id, string ip = "");
public JsonArray    Sections(JsonObject rep);                          // 五段：一、运行概况 … 五、工单明细
public static string SafeName(string? s);
public static IReadOnlyDictionary<string,string> REPORT_TYPES;         // daily/weekly/monthly/custom
```

---

## 14. 数据兼容

- **文件**：`{DataDir}\db.json`，UTF-8 **无 BOM**，结构/字段名/取值与 Node 版 `data/db.json` 完全一致；`meta.version=1`。
- **编号**：`_seq` 计数器 + `NextId(kind, prefix)` → `prefix + 5 位十进制`（与 Node 的 `nextId` 规则一致）。
- **原子写**：先写 `db.json.tmp` 再 `File.Move(overwrite)`；`SaveSoon()` 400ms 节流。
- **备份**：`{DataDir}\backups\backup-*.json`；恢复前自动留 `pre-restore-*.json` 回滚点，恢复时保留 `settings`、清空 `sessions`。
- **时间**：全平台固定 UTC+8；ISO 形如 `2026-10-26T15:04:05.123Z`；日界按 `TZ_OFFSET_MIN=480`。
- **口令格式**：`scrypt$<salt>$<hex>`；`scrypt` 参数固定 `N=16384,r=8,p=1,dkLen=32`。
  已核对的参考向量：
  - `scryptSync('water123','d77e9c5ea11b0f4ae2cd3f17a9686ea5',32)` = `cb55bf07495a53ecf7cd7714c032819f7f3cbd3b10578c506f06178c17a18056`
  - `scryptSync('water123','000102030405060708090a0b0c0d0e0f',32)` = `065895cfc9883e96ba880d1089a5bdcb6c03d1d7871be57b7159147f13168756`
  - `scryptSync('password','NaCl',64)` = `a8430d7e581f9ca03c952df506ac66c757899d67a21d71c0f1900bd778ac1d14ca0ed5883f68eb95e16e6513d4d4eadaa144c4f25d6d0caa4f871cf51c6e9cef`

---

## 15. 从 WPF 接线（给 native-desktop）

1. `AppServices.Create()` 里把 `DemoDesktopData` 换成自己写的 `CoreDesktopData(ZhifuWater.Core.CoreServices)` 适配器即可，全部页面不动。
2. 页面需要的几类数据与 Core 的对应：

| 页面能力（`IDesktopData`） | Core 调用 |
| --- | --- |
| `Login/Logout` | `Auth.Login/Logout` |
| `ReadingOf / Trend` | `Analytics.LatestList` / `Analytics.Series` |
| `DashboardKpis / DataHealth` | `Analytics.Overview(user)` 的 `kpis` / `dataHealth` |
| `Alarms / AlarmStatistics / Ack / Resolve` | `Rules.ListAlarms` / `AlarmStats` / `AckAlarm` / `ResolveAlarm` |
| `Commands / ExecuteAction / Confirm / Cancel` | `Commands.ListCommands` / `CreateCommand` / `ConfirmCommand` / `CancelCommand` |
| `SetParam / Rollback / ApproveRequest` | `Params.ChangeParam` / `RollbackParam` / `ApproveRequest` |
| `WorkOrders / AdvanceWorkOrder` | `Ops.ListWorkorders` / `Accept/Start/Finish/Verify/Close` |
| `GenerateInspection / SubmitInspection` | `Ops.CreateInspection` / `SubmitInspection` |
| `LabStatistics / ReviewLab` | `Ops.LabStats` / `ReviewLab` |
| `Analysis / GenerateReport / ExportReportCsv` | `Reports.Summary(…)/Units/Efficiency`、`CreateReport`、`ExportCsv` |
| `SaveSetting / ToggleChannel / TestChannel` | `Admin.UpdateSettings` / `UpdateChannel` / `TestChannel` |
| `CreateBackup / RestoreBackup` | `Admin.CreateBackup` / `RestoreBackup` |
| `AddUser / ResetPassword / SetUserStatus` | `Admin.CreateUser` / `ResetPassword` / `UpdateUser` |
| `AuditLogs` | `Admin.AuditLogs` |
| `MarkNotificationsRead` | `Admin.MarkNotificationsRead` |
| `Tick`（演示推进） | `CoreServices.RunTicks(1)` |

3. **失败一律转 `OpResult(false, ex.Message)`**：`CoreException.Message` 就是可以直接展示的中文文案。
4. 事件里拿到的 `JsonObject` 是**共享节点**，如需缓存请 `DeepClone()`（JsonNode 有单父约束，不能把同一节点挂到两棵树上）。

---

## 16. 自测

```
cd D:\小禹
dotnet build native/ZhifuWater.Core/ZhifuWater.Core.csproj        # 0 警告 0 错误
dotnet run --project native/ZhifuWater.Core.Tests                 # CORE-TESTS PASS 174/174
```

174 条断言 / 14 组，覆盖：数据装载与首次复制、scrypt 三参考向量 + 8 账号口令、登录 12h 会话 + 5 次锁 60s + 权限/站点范围、模拟器 tick 与遥测 latest/history/range/stats、驾驶舱 KPI、告警全生命周期、命令 8 态 + 联锁 + 二次确认、工单 5 态流转、巡检缺项校验与异常建单、化验复核/退回、参数云写/审批/回滚、报表五段 + CSV BOM、用户/设置/审计/备份/恢复、持久化结构兼容。

---

## 17. 已知边界（未覆盖，需后续补）

1. **真实设备接入**：`Simulator` 是内置模拟网关；MQTT/Modbus/OPC-UA 采集适配器未实现（`settings.dataSources` 只是描述性配置）。
2. **外发通道**：`Admin.TestChannel` / `Notifier` 只做站内通知与"已受理"模拟，没有真的发短信/邮件/微信公众号；`channels[].target` 未接真实网关。
3. **报表文件生成**：只产出 CSV 文本与文件名，PDF/Excel 渲染留给桌面端（Core 不引第三方库）。
4. **并发**：数据树无全局锁（见 §1），高频并发写需调用方串行化。
5. **多进程**：同一 `DataDir` 只允许一个进程使用（无文件锁）。
6. **`data/db.json` 之外的迁移**：只兼容 `meta.version=1`；更高版本会按"结构不符"重新 load 并保留原文件不动（不自动升级）。
7. **HTTP 层**：Core 不提供任何 HTTP 端点，Node 的 `server/index.js` 路由未移植（按任务要求"不走 HTTP"）。
8. **密码策略**：仅"至少 6 位"，没有复杂度/历史口令限制（与 Node 版一致，未加强）。
