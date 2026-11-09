using System.Text;
using System.Text.Json.Nodes;
using ZhifuWater.Core;

namespace ZhifuWater.Core.Tests;

/// <summary>
/// 零依赖自测：加载 data/db.json（首次运行复制到临时数据目录），驱动 Simulator/Rules 跑若干 tick，
/// 逐项断言业务规则，最后输出 <c>CORE-TESTS PASS n/n</c>。
/// </summary>
internal static class Program
{
    private static int _total;
    private static readonly List<string> _failures = new();

    /* ---------------- 断言工具 ---------------- */

    private static void Check(string name, bool ok, string? detail = null)
    {
        _total++;
        if (!ok) _failures.Add(detail is null ? name : $"{name} — {detail}");
    }

    private static void Eq(string name, object? expected, object? actual) =>
        Check(name, Equals(expected, actual), $"期望 {expected}，实际 {actual}");

    private static void Throws(string name, int status, string? code, Action act)
    {
        _total++;
        try
        {
            act();
            _failures.Add($"{name} — 期望抛出 {status}/{code}，实际未抛异常");
        }
        catch (CoreException ex)
        {
            if (ex.Status != status || (code is not null && ex.Code != code))
                _failures.Add($"{name} — 期望 {status}/{code}，实际 {ex.Status}/{ex.Code}（{ex.Message}）");
        }
        catch (Exception ex)
        {
            _failures.Add($"{name} — 抛出了非 CoreException：{ex.GetType().Name}: {ex.Message}");
        }
    }

    private static string? Str(JsonNode? node, string key) => J.StrOrNull(node, key);

    private static void Section(string title)
    {
        Console.WriteLine();
        Console.WriteLine($"── {title} " + new string('─', Math.Max(0, 46 - title.Length)));
    }

    /* ---------------- 定位仓库 ---------------- */

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "data", "db.json")) &&
                Directory.Exists(Path.Combine(dir.FullName, "server")))
                return dir.FullName;
            dir = dir.Parent;
        }
        throw new InvalidOperationException("找不到仓库根目录（需要同时包含 data/db.json 与 server/）。");
    }

    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.WriteLine("ZhifuWater.Core 自测 —— 对 Node 版业务规则的移植校验");
        var root = FindRepoRoot();
        var seed = Path.Combine(root, "data", "db.json");
        Console.WriteLine($"仓库根目录：{root}");

        var dataDir = Path.Combine(Path.GetTempPath(), "zhifu-core-tests-" + Guid.NewGuid().ToString("N")[..8]);
        CoreServices? core = null;
        try
        {
            core = new CoreServices(new CoreServicesOptions
            {
                DataDir = dataDir,
                SeedSource = seed,
                AutoStart = false,
            });
            RunAll(core, seed, dataDir, root);
        }
        catch (Exception ex)
        {
            _total++;
            _failures.Add($"未捕获异常终止：{ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");
        }
        finally
        {
            try { core?.Dispose(); } catch { /* 忽略清理异常 */ }
            try { if (Directory.Exists(dataDir)) Directory.Delete(dataDir, true); } catch { /* 忽略 */ }
        }

        Console.WriteLine();
        if (_failures.Count > 0)
        {
            Console.WriteLine("失败项：");
            for (int i = 0; i < _failures.Count; i++) Console.WriteLine($"  {i + 1}. {_failures[i]}");
            Console.WriteLine();
            Console.WriteLine($"CORE-TESTS FAIL {_total - _failures.Count}/{_total}");
            return 1;
        }

        Console.WriteLine($"CORE-TESTS PASS {_total}/{_total}");
        return 0;
    }

    private static void RunAll(CoreServices core, string seed, string dataDir, string root)
    {
        var db = core.Store.Data;
        long now = TimeUtil.Now();

        /* ================= 1. 数据装载 ================= */
        Section("数据装载与首次运行复制");
        Check("初始快照存在", File.Exists(seed), seed);
        Check("数据目录已生成 db.json", File.Exists(Path.Combine(dataDir, "db.json")));
        Check("读写的是自己的副本（非仓库 data/）",
            Path.GetFullPath(dataDir) != Path.GetFullPath(Path.Combine(root, "data")));
        Check("站点数为 2", J.ObjsIn(db, "sites").Count == 2, $"实际 {J.ObjsIn(db, "sites").Count}");
        Check("点位数 ≥ 48", J.ObjsIn(db, "points").Count >= 48, $"实际 {J.ObjsIn(db, "points").Count}");
        Check("用户数 8", J.ObjsIn(db, "users").Count == 8, $"实际 {J.ObjsIn(db, "users").Count}");
        Check("告警规则 15 条", J.ObjsIn(db, "alarmRules").Count == 15);
        Check("_seq 已迁移", db["_seq"] is JsonObject);

        /* ================= 2. 口令与 scrypt ================= */
        Section("scrypt（RFC 7914）与 Node 口令兼容");
        var saltA = Encoding.UTF8.GetBytes("d77e9c5ea11b0f4ae2cd3f17a9686ea5");
        Eq("向量 A：scrypt('water123', db 盐, 32)",
            "cb55bf07495a53ecf7cd7714c032819f7f3cbd3b10578c506f06178c17a18056",
            Convert.ToHexString(Scrypt.DeriveBytes("water123", saltA)).ToLowerInvariant());
        var saltB = Encoding.UTF8.GetBytes("000102030405060708090a0b0c0d0e0f");
        Eq("向量 B：决定性回归（salt=000102...0f）",
            "065895cfc9883e96ba880d1089a5bdcb6c03d1d7871be57b7159147f13168756",
            Convert.ToHexString(Scrypt.DeriveBytes("water123", saltB)).ToLowerInvariant());
        Eq("向量 C：scrypt('password','NaCl',dkLen=64)",
            "a8430d7e581f9ca03c952df506ac66c757899d67a21d71c0f1900bd778ac1d14ca0ed5883f68eb95e16e6513d4d4eadaa144c4f25d6d0caa4f871cf51c6e9cef",
            Convert.ToHexString(Scrypt.DeriveBytes("password", Encoding.UTF8.GetBytes("NaCl"), 16384, 8, 1, 64)).ToLowerInvariant());

        int hashOk = 0;
        foreach (var u in J.ObjsIn(db, "users"))
        {
            _total++;
            if (Scrypt.VerifyPassword("water123", J.Str(u, "password"))) hashOk++;
            else _failures.Add($"db 口令校验失败：{J.Str(u, "username")}");
        }
        Eq("db.json 内 8 个账号口令 water123 全部通过校验", 8, hashOk);
        Check("错误口令被拒绝", !Scrypt.VerifyPassword("Water123", J.Str(J.ObjsIn(db, "users")[0], "password")));
        var newHash = Scrypt.HashPassword("abc123456");
        Check("HashPassword 格式为 scrypt$salt$hex", newHash.Split('$').Length == 3 && newHash.StartsWith("scrypt$"));
        Check("HashPassword → VerifyPassword 往返", Scrypt.VerifyPassword("abc123456", newHash));

        /* ================= 3. 登录与会话 ================= */
        Section("登录、会话、失败锁定与权限");
        var adminLogin = core.Auth.Login("admin", "water123", "127.0.0.1", "core-tests");
        var admin = adminLogin.User;
        Check("登录返回 token", adminLogin.Token.Length >= 20, $"len={adminLogin.Token.Length}");
        Eq("登录用户名", "admin", J.Str(admin, "username"));
        Check("返回用户已脱敏", J.Get(admin, "password") is null);
        Eq("角色名回填", J.Str(J.O(J.O(db, "roles")!, "super")!, "name"), J.Str(admin, "roleName"));
        Check("会话有效期 12h", TimeUtil.Parse(adminLogin.Session, "expiresAt") - TimeUtil.Parse(adminLogin.Session, "createdAt") == Auth.SESSION_TTL_MS);
        Check("会话里不存明文 token", J.Get(adminLogin.Session, "tokenHash") is not null && J.Get(adminLogin.Session, "token") is null);
        var byToken = core.Auth.UserFromToken(adminLogin.Token);
        Check("token 可换回用户", byToken is not null && J.Str(byToken, "id") == J.Str(admin, "id"));

        Throws("密码错误 → 401 BAD_CREDENTIALS", 401, "BAD_CREDENTIALS",
            () => core.Auth.Login("admin", "wrong-pass", "127.0.0.1", "t"));
        Throws("账号不存在 → 401 BAD_CREDENTIALS", 401, "BAD_CREDENTIALS",
            () => core.Auth.Login("nobody_here", "whatever", "127.0.0.1", "t"));
        Throws("停用账号 → 403 INACTIVE", 403, "INACTIVE",
            () => core.Auth.Login("zhou", "water123", "127.0.0.1", "t"));
        for (int i = 0; i < 5; i++)
        {
            try { core.Auth.Login("guest", "bad", "127.0.0.1", "t"); } catch (CoreException) { /* 计入失败次数 */ }
        }
        Throws("连续 5 次失败后锁定 → 429 LOCKED", 429, "LOCKED",
            () => core.Auth.Login("guest", "water123", "127.0.0.1", "t"));

        var operatorLogin = core.Auth.Login("zhao", "water123", "127.0.0.1", "core-tests");
        var operatorUser = operatorLogin.User;
        var processLogin = core.Auth.Login("li", "water123", "127.0.0.1", "core-tests");
        var processUser = processLogin.User;

        Throws("操作员无用户管理权限 → 403 FORBIDDEN", 403, "FORBIDDEN", () => core.Admin.Users(operatorUser));
        Throws("越权访问他站数据 → 403 SITE_FORBIDDEN", 403, "SITE_FORBIDDEN",
            () => core.Analytics.SiteDetail(processUser, "site-2"));
        Throws("未登录 → 401 UNAUTHORIZED", 401, "UNAUTHORIZED", () => core.Admin.Users(null));

        /* ================= 4. 遥测与启动 ================= */
        Section("模拟网关启动 + 遥测采集");
        core.Start();
        Check("Simulator 已启动", core.Simulator.IsRunning);
        Check("Rules 已启动", core.Rules.IsRunning);
        var telemetryEvents = 0;
        JsonArray? lastUpdates = null;
        core.TelemetryUpdated += evt =>
        {
            telemetryEvents++;
            lastUpdates = J.Get(evt, "updates") as JsonArray;
        };
        core.RunTicks(3);
        Check("tick 后收到遥测事件", telemetryEvents >= 3, $"实际 {telemetryEvents}");
        Check("每条事件带点位更新", lastUpdates is not null && lastUpdates.Count >= 20, $"实际 {lastUpdates?.Count}");

        var lvl = core.Telemetry.GetLatest("pt-site-1-raw-lvl");
        Check("进水调节池液位有最新值", lvl is not null);
        var lvlV = J.AsDouble(J.Get(lvl, "v"));
        Check("液位数值在 0–100 之间", lvlV is > 0 and < 100, $"v={lvlV}");
        Check("最新值带时间戳", J.Num(lvl, "t") > now - 60_000);
        Check("历史已回填（进水流量 > 100 点）", core.Telemetry.HistCount("pt-site-1-flow") > 100,
            $"实际 {core.Telemetry.HistCount("pt-site-1-flow")}");
        Check("最新值覆盖全部点位", core.Telemetry.AllLatest().Count >= 48,
            $"实际 {core.Telemetry.AllLatest().Count}");

        var latest = core.Analytics.TelemetryLatest(admin, "site-1");
        Check("TelemetryLatest 返回点位读数", J.Get(latest, "items") is JsonArray a1 && a1.Count >= 20);
        var history = core.Analytics.TelemetryHistory(admin, "site-1", "FLOW.IN,BAF.PH",
            TimeUtil.Iso(now - 6 * 3600_000L), TimeUtil.Iso(now), 1800);
        Check("TelemetryHistory 返回 FLOW.IN 序列", J.Get(history, "series") is JsonObject s1
            && s1["FLOW.IN"] is JsonObject fl1 && J.Get(fl1, "points") is JsonArray flp && flp.Count > 0);
        var stats = core.Analytics.TelemetryStats(admin, "site-1", "FLOW.IN", 6);
        Check("TelemetryStats 有聚合统计", J.Get(stats, "stats") is JsonObject st1 && st1["FLOW.IN"] is JsonObject);
        var range = core.Telemetry.Range(new[] { "pt-site-1-flow" }, now - 3600_000, now, 300);
        Check("Telemetry.Range 按桶聚合", range.Count > 0);

        /* ================= 5. 分析 / KPI / 报表 ================= */
        Section("分析、KPI 与报表");
        var overview = core.Analytics.Overview(admin, "site-1");
        Check("Overview 含 kpis", J.Get(overview, "kpis") is JsonArray kpis && kpis.Count >= 6);
        var volumeKpi = (J.Get(overview, "kpis") as JsonArray)?
            .OfType<JsonObject>().FirstOrDefault(k => J.Str(k, "key") == "volume");
        var volume = J.AsDouble(J.Get(volumeKpi, "value"));
        Check("今日处理水量 KPI 为正数", volume is > 0, $"value={volume}");
        Check("Overview 含工艺单元卡", J.Get(overview, "process") is JsonArray p1 && p1.Count >= 8);
        Check("Overview 含趋势序列", J.Get(overview, "trends") is JsonObject t1 && t1.Count >= 4);
        Check("Overview 含数据健康度", J.Get(overview, "dataHealth") is JsonObject);

        var summary = core.Reports.Summary(admin, "site-1", 7);
        var waterTotal = J.AsDouble(J.Get(J.Get(summary, "water"), "total"));
        Check("7 日汇总水量为正数", waterTotal is > 0, $"total={waterTotal}");
        Check("7 日汇总能耗单位 kWh", Str(J.Get(summary, "energy"), "unit") == "kWh");
        Check("7 日汇总含费用假设", J.Get(J.Get(summary, "cost"), "priceAssumption") is JsonObject);
        Check("7 日汇总含按天序列", J.Get(summary, "daily") is JsonArray d1 && d1.Count >= 1);
        var efficiency = core.Reports.Efficiency(admin, "site-1", 7);
        Check("能效分析含设备健康列表", J.Get(efficiency, "devices") is JsonArray e1 && e1.Count > 0);
        var units = core.Reports.Units(admin, "site-1", 7);
        Check("单元分析含 12 个单元附近", J.Get(units, "items") is JsonArray u1 && u1.Count >= 8);

        Check("POINTS 端点返回点位", J.Get(core.Analytics.Points(admin, "site-1"), "items") is JsonArray pt1 && pt1.Count >= 20);
        var devicesPage = core.Analytics.Devices(admin, "site-1");
        Check("设备端点返回设备", J.Get(devicesPage, "items") is JsonArray dv1 && dv1.Count >= 10);
        Check("设备健康分在 0–100", (J.Get(devicesPage, "items") as JsonArray)!
            .OfType<JsonObject>().All(d => J.Get(d, "health") is JsonObject hh
                && J.Num(hh, "score") is >= 0 and <= 100));
        Check("诊断接口可返回列表", J.Get(core.Admin.Diagnosis(admin, "site-1", core.Diagnosis), "items") is JsonArray dg1);
        var sysHealth = core.Analytics.SystemHealth(admin);
        Check("系统健康含模拟与计数段", J.Get(sysHealth, "simulation") is JsonObject && J.Get(sysHealth, "counts") is JsonObject);

        /* ================= 6. 告警生命周期 ================= */
        Section("告警触发 / 确认 / 自动恢复 / 关闭");
        core.Stop();
        Check("Stop 后模拟器停止", !core.Simulator.IsRunning);
        var alarmEvents = new List<string>();
        core.AlarmChanged += evt => alarmEvents.Add(J.Str(evt, "action"));

        var rule = J.ObjsIn(db, "alarmRules").First(r => J.Str(r, "id") == "rule-1");
        rule["durationSec"] = 0;                    // 去掉持续时长要求，便于确定性触发
        var sulfurPhPoint = J.ObjsIn(db, "points").First(p => J.Str(p, "code") == "SULFUR.PH" && J.Str(p, "siteId") == "site-1");
        var alarmNow = TimeUtil.Now();
        core.Telemetry.SetLatest(J.Str(sulfurPhPoint, "id"), JsonValue.Create(8.6), alarmNow, "good", "gateway");
        core.Rules.Evaluate(alarmNow);

        var created = J.ObjsIn(db, "alarms").FirstOrDefault(a =>
            J.Str(a, "ruleId") == "rule-1" && J.Str(a, "status") == "active");
        Check("超限后规则触发告警", created is not null);
        Check("告警编号形如 AL-YYYYMMDD-NNN",
            created is not null && System.Text.RegularExpressions.Regex.IsMatch(J.Str(created, "id"), @"^AL-\d{8}-\d{3}$"),
            J.Str(created, "id"));
        Check("告警带等级 major", Str(created, "level") == "major");
        Check("告警详情含当前值", created is not null && J.Str(created, "detail").Contains("8.6"));
        Check("告警事件已广播 create", alarmEvents.Contains("create"));

        var alarmId = J.Str(created, "id");
        var ack = core.Rules.Acknowledge(admin, alarmId, "测试确认", "127.0.0.1");
        Eq("确认后状态 acknowledged", "acknowledged", Str(ack, "status"));
        var ackDetail = core.Rules.AlarmDetail(admin, alarmId);
        Eq("确认人回填为姓名", Str(J.ObjsIn(db, "users").First(u => J.Str(u, "id") == "u-1"), "name"),
            Str(ackDetail, "ackByName"));
        Eq("确认人 id 记录为 u-1", "u-1", Str(ackDetail, "ackBy"));
        Throws("重复确认 → 409", 409, null, () => core.Rules.Acknowledge(admin, alarmId, "再确认"));

        var backNow = TimeUtil.Now();
        core.Telemetry.SetLatest(J.Str(sulfurPhPoint, "id"), JsonValue.Create(7.1), backNow, "good", "gateway");
        core.Rules.Evaluate(backNow);
        var afterAuto = J.ObjsIn(db, "alarms").First(a => J.Str(a, "id") == alarmId);
        Eq("参数回稳后自动恢复", "resolved", Str(afterAuto, "status"));
        Eq("自动恢复标记为 system", "system", Str(afterAuto, "resolvedBy"));
        Check("自动恢复写入关闭说明", J.Str(afterAuto, "closeNote").Contains("自动标记恢复"));

        Throws("关闭告警缺说明 → 400 NOTE_REQUIRED", 400, "NOTE_REQUIRED",
            () => core.Rules.Close(admin, alarmId, "  ", "127.0.0.1"));
        var closed = core.Rules.Close(admin, alarmId, "现场已复核，参数恢复正常", "127.0.0.1");
        Eq("关闭后状态 closed", "closed", Str(closed, "status"));
        Throws("已关闭告警再关闭 → 409 ALARM_CLOSED", 409, "ALARM_CLOSED",
            () => core.Rules.Close(admin, alarmId, "重复关闭", "127.0.0.1"));

        var alarmList = core.Rules.ListAlarms(admin, "site-1", null, null, null, null, null, null, 1, 50);
        Check("告警列表返回分页结构", J.Get(alarmList, "items") is JsonArray al1 && J.Num(alarmList, "total") >= 1);
        Check("告警列表含 counts", J.Get(alarmList, "counts") is JsonObject ac1 && ac1["all"] is not null);
        Check("告警列表视图补齐站点名", (J.Get(alarmList, "items") as JsonArray)!.OfType<JsonObject>()
            .All(a => J.Get(a, "siteName") is not null));
        Check("告警统计返回 byDay", J.Get(core.Rules.AlarmStats(admin, "site-1", 7), "byDay") is JsonArray);
        Check("告警详情含时间线", J.Get(core.Rules.AlarmDetail(admin, alarmId), "timeline") is JsonArray tl1 && tl1.Count >= 3);

        /* ================= 7. 命令状态机与联锁 ================= */
        Section("控制命令：联锁 / 二次确认 / 执行成功");
        var commandEvents = new List<string>();
        core.CommandChanged += evt => commandEvents.Add(J.Str(evt, "action"));

        var actions = core.Commands.ListActions(admin, "site-1");
        Check("动作清单 13 个", J.Get(actions, "actions") is JsonArray aa && aa.Count == 13);
        Check("动作清单含联锁状态", J.Get(actions, "status") is JsonObject);

        // 联锁：液位 < 5% 时禁止启泵（联锁读的是模拟网关实时状态，等价 Node 的 sim.state）
        var simState = core.Simulator.State("site-1")!;
        var levelBefore = simState.Raw.Level;
        simState.Raw.Level = 3.0;
        var blocked = core.Commands.Create(admin, "site-1", "raw.pump.start", null, "联锁测试", "127.0.0.1");
        Check("低液位启泵被联锁拦截", blocked.Blocked);
        Check("拦截原因含低液位保护", blocked.Error is not null && blocked.Error.Contains("低液位"),
            blocked.Error);
        Eq("被拦截命令状态为 failed", "failed", Str(blocked.Command, "status"));
        Check("被拦截命令记录联锁原因", J.Str(blocked.Command, "failReason").Contains("低液位"));
        simState.Raw.Level = levelBefore;

        // 高风险：需要二次确认
        var modeArgs = new JsonObject { ["mode"] = 1 };
        var high = core.Commands.Create(admin, "site-1", "raw.pump.mode.set", modeArgs, "切换手动模式演练", "127.0.0.1");
        Check("高风险命令未被拦截", !high.Blocked, high.Error);
        Eq("高风险命令进入待确认", "pending_confirm", Str(high.Command, "status"));
        var highId = J.Str(high.Command, "id");
        var confirmed = core.Commands.Confirm(admin, highId, "127.0.0.1");
        Eq("确认后进入待下发", "pending_dispatch", Str(confirmed, "status"));
        core.Commands.Dispatch(highId);
        Eq("下发后状态 sent", "sent", Str(core.Commands.Get(highId), "status"));
        core.Commands.Execute(highId);
        Eq("回执后状态 executing", "executing", Str(core.Commands.Get(highId), "status"));
        core.Commands.Finish(highId);
        var done = core.Commands.Get(highId);
        Eq("执行完成状态 success", "success", Str(done, "status"));
        Check("成功命令带执行说明", !string.IsNullOrEmpty(J.Str(done, "result")));
        Check("命令时间线 ≥ 4 步", J.Get(done, "timeline") is JsonArray tl2 && tl2.Count >= 4);
        Check("命令视图补齐状态中文名", Str(core.Commands.CommandView(done!), "statusName") == "成功");
        Check("命令事件已广播", commandEvents.Count >= 2);

        // 中风险：直接下发并成功
        var dose = core.Commands.Create(admin, "site-1", "pac.dose.set",
            new JsonObject { ["value"] = 0.05 }, "投加量微调", "127.0.0.1");
        Eq("中风险命令直接进入待下发", "pending_dispatch", Str(dose.Command, "status"));
        var doseId = J.Str(dose.Command, "id");
        core.Commands.Dispatch(doseId);
        core.Commands.Execute(doseId);
        core.Commands.Finish(doseId);
        Eq("PAC 投加命令执行成功", "success", Str(core.Commands.Get(doseId), "status"));

        Throws("重复确认已执行命令 → 409", 409, "COMMAND_CONFIRM_FAILED",
            () => core.Commands.Confirm(admin, doseId, "127.0.0.1"));
        var badDose = core.Commands.Create(admin, "site-1", "pac.dose.set",
            new JsonObject { ["value"] = 9.9 }, "越界测试", "127.0.0.1");
        Check("越界参数被联锁拦截", badDose.Blocked && badDose.Error is not null && badDose.Error.Contains("投加量"));
        var cancelTarget = core.Commands.Create(admin, "site-1", "raw.pump.mode.set",
            new JsonObject { ["mode"] = 0 }, "取消测试", "127.0.0.1");
        var cancelled = core.Commands.Cancel(admin, J.Str(cancelTarget.Command, "id"), "演练取消", "127.0.0.1");
        Eq("待确认命令可取消", "cancelled", Str(cancelled, "status"));
        var cmdList = core.Commands.ListCommands(admin, "site-1", null, null, null, null, 1, 20);
        Check("命令列表含 8 态 counts", J.Get(cmdList, "counts") is JsonObject cc1 && cc1["success"] is not null);

        /* ================= 8. 工单流转 ================= */
        Section("工单：创建 → 接单 → 处理 → 完成 → 验收");
        var wo = core.Ops.CreateWorkorder(admin, new JsonObject
        {
            ["siteId"] = "site-1",
            ["title"] = "自测：预氧化曝气风机异响检查",
            ["type"] = "repair",
            ["priority"] = "high",
            ["unitCode"] = "baf",
            ["description"] = "自测工单，用于验证状态流转。",
        }, "127.0.0.1");
        Eq("新工单状态 pending", "pending", Str(wo, "status"));
        var woId = J.Str(wo, "id");
        Check("工单编号形如 WO…", woId.StartsWith("WO"), woId);
        var accepted = core.Ops.AcceptWorkorder(admin, woId, new JsonObject(), "127.0.0.1");
        Eq("接单后 accepted", "accepted", Str(accepted, "status"));
        Eq("接单人回填", J.Str(admin, "id"), Str(accepted, "assigneeId"));
        var started = core.Ops.StartWorkorder(admin, woId, new JsonObject(), "127.0.0.1");
        Eq("开始处理后 processing", "processing", Str(started, "status"));
        Throws("未填处理结果直接完成 → 400", 400, "RESULT_REQUIRED",
            () => core.Ops.FinishWorkorder(admin, woId, new JsonObject(), "127.0.0.1"));
        var finished = core.Ops.FinishWorkorder(admin, woId, new JsonObject { ["result"] = "更换风机轴承并复测振动正常" }, "127.0.0.1");
        Eq("完成后 done", "done", Str(finished, "status"));
        var verified = core.Ops.VerifyWorkorder(admin, woId, new JsonObject { ["note"] = "验收合格" }, "127.0.0.1");
        Eq("验收后 verified", "verified", Str(verified, "status"));
        Throws("已验收工单再接单 → 409", 409, "BAD_STATUS",
            () => core.Ops.AcceptWorkorder(admin, woId, new JsonObject(), "127.0.0.1"));
        var woDetail = core.Ops.WorkorderDetail(admin, woId);
        Check("工单详情含时间线 5 步", J.Get(woDetail, "timeline") is JsonArray wtl && wtl.Count >= 5,
            $"实际 {(J.Get(woDetail, "timeline") as JsonArray)?.Count}");
        var woList = core.Ops.ListWorkorders(admin, "site-1");
        Check("工单列表含 counts 与分页", J.Get(woList, "counts") is JsonObject wc && J.Num(woList, "total") >= 1);

        /* ================= 9. 巡检 ================= */
        Section("巡检：生成 → 提交（缺项校验 + 异常自动建单）");
        var task = core.Ops.CreateInspection(admin, new JsonObject { ["planId"] = "plan-1" }, "127.0.0.1");
        var taskId = J.Str(task, "id");
        Check("巡检任务编号形如 IN…", taskId.StartsWith("IN"), taskId);
        var taskItems = J.Get(task, "items") as JsonArray;
        Check("巡检任务带计划项", taskItems is not null && taskItems.Count == 5, $"实际 {taskItems?.Count}");
        var firstKey = J.Str(taskItems![0] as JsonObject, "key");
        Throws("只填一项就提交 → 400 INCOMPLETE", 400, "INCOMPLETE",
            () => core.Ops.SubmitInspection(admin, taskId,
                new JsonObject { ["items"] = new JsonArray { new JsonObject { ["key"] = firstKey, ["result"] = "ok" } } },
                "127.0.0.1"));

        var submitItems = new JsonArray();
        int idx = 0;
        foreach (var it in taskItems.OfType<JsonObject>())
        {
            submitItems.Add(new JsonObject
            {
                ["key"] = J.Str(it, "key"),
                ["result"] = idx == 1 ? "abnormal" : "ok",
                ["note"] = idx == 1 ? "泵体渗漏" : "",
            });
            idx++;
        }
        var submitted = core.Ops.SubmitInspection(admin, taskId,
            new JsonObject { ["items"] = submitItems, ["summary"] = "发现一处渗漏" }, "127.0.0.1");
        Eq("提交后巡检完成", "done", Str(J.Get(submitted, "task"), "status"));
        Check("异常项计数为 1", J.Get(submitted, "abnormal") is JsonArray abn && abn.Count == 1, $"实际 {(J.Get(submitted, "abnormal") as JsonArray)?.Count}");
        Check("异常自动生成工单", J.Get(submitted, "workorder") is JsonObject autoWo && J.Str(autoWo, "type") == "inspect");
        Throws("重复提交 → 409 INSPECTION_DONE", 409, "INSPECTION_DONE",
            () => core.Ops.SubmitInspection(admin, taskId, new JsonObject(), "127.0.0.1"));

        /* ================= 10. 化验复核 ================= */
        Section("化验：录入 → 复核 / 退回");
        var lab = core.Ops.CreateLab(operatorUser, new JsonObject
        {
            ["siteId"] = "site-1",
            ["samplePoint"] = "outlet",
            ["metrics"] = new JsonObject { ["COD"] = 38.5, ["NH3N"] = 2.4, ["TN"] = 11.2, ["TP"] = 0.35, ["SS"] = 7.5 },
            ["remark"] = "自测录入",
        }, "127.0.0.1");
        Eq("录入后待复核", "pending_review", Str(lab, "status"));
        var labId = J.Str(lab, "id");
        Check("化验编号形如 LAB…", labId.StartsWith("LAB"), labId);
        Check("取样点名称回填", Str(lab, "samplePointText") == "总出水（清水池）", Str(lab, "samplePointText"));
        Throws("越界指标 → 400 BAD_METRIC", 400, "BAD_METRIC",
            () => core.Ops.CreateLab(operatorUser, new JsonObject
            {
                ["siteId"] = "site-1",
                ["samplePoint"] = "outlet",
                ["metrics"] = new JsonObject { ["COD"] = -1 },
            }, "127.0.0.1"));
        Throws("无复核权限 → 403", 403, "FORBIDDEN", () => core.Ops.ReviewLab(operatorUser, labId,
            new JsonObject { ["approved"] = true }, "127.0.0.1"));
        var reviewed = core.Ops.ReviewLab(processUser, labId, new JsonObject { ["approved"] = true }, "127.0.0.1");
        Eq("复核通过 reviewed", "reviewed", Str(reviewed, "status"));
        Eq("复核人回填为姓名", J.Str(J.ObjsIn(db, "users").First(u => J.Str(u, "id") == "u-3"), "name"), Str(reviewed, "reviewerName"));
        Throws("重复复核 → 409 BAD_STATUS", 409, "BAD_STATUS",
            () => core.Ops.ReviewLab(processUser, labId, new JsonObject { ["approved"] = true }, "127.0.0.1"));
        var lab2 = core.Ops.CreateLab(operatorUser, new JsonObject
        {
            ["siteId"] = "site-1",
            ["samplePoint"] = "baf_out",
            ["metrics"] = new JsonObject { ["COD"] = 44.0 },
        }, "127.0.0.1");
        var rejected = core.Ops.ReviewLab(processUser, J.Str(lab2, "id"),
            new JsonObject { ["approved"] = false, ["note"] = "与质控样偏差过大，请重测" }, "127.0.0.1");
        Eq("退回状态 rejected", "rejected", Str(rejected, "status"));
        Check("化验列表带限值表", J.Get(core.Ops.ListLab(admin, "site-1"), "limits") is JsonObject lm && lm["COD"] is not null);

        /* ================= 11. 参数与审批 ================= */
        Section("工艺参数：变更 / 审批 / 回滚");
        var paramList = core.Params.ListParams(admin, "site-1");
        Check("参数列表非空", J.Get(paramList, "items") is JsonArray pl && pl.Count > 0);
        var editable = (J.Get(paramList, "items") as JsonArray)!.OfType<JsonObject>()
            .FirstOrDefault(p => Str(p, "writeMode") == "cloud" && J.Num(p, "min") is not null && J.Num(p, "max") is not null);
        Check("存在云端可写参数", editable is not null);
        if (editable is not null)
        {
            var pid = J.Str(editable, "id");
            double min = J.Num(editable, "min") ?? 0;
            double max = J.Num(editable, "max") ?? 1;
            double mid = JsMath.Round(min + (max - min) * 0.4, 3);
            Throws("缺理由 → 400 REASON_REQUIRED", 400, "REASON_REQUIRED",
                () => core.Params.ChangeParam(admin, pid, mid, "", "127.0.0.1"));
            var changed = core.Params.ChangeParam(admin, pid, mid, "自测调整", "127.0.0.1");
            Check("云端可写参数直接生效", JsMath.Truthy(J.Get(changed, "applied")), changed["applied"]?.ToJsonString());
            var detail = core.Params.ParamDetail(admin, pid);
            Check("参数版本历史有记录", J.Get(detail, "versions") is JsonArray v1 && v1.Count >= 1);
        }

        /* ================= 12. 报表与 CSV ================= */
        Section("报表生成与 CSV 导出");
        var rep = core.Reports.CreateReport(admin, new JsonObject
        {
            ["siteId"] = "site-1",
            ["type"] = "daily",
            ["format"] = "csv",
            ["note"] = "自测报表",
        }, "127.0.0.1");
        Eq("报表类型为 daily", "daily", Str(rep, "type"));
        Check("报表含五段内容", J.Get(rep, "sections") is JsonArray sec && sec.Count == 5,
            $"实际 {(J.Get(rep, "sections") as JsonArray)?.Count}");
        var (csvName, csvText) = core.Reports.ExportCsv(admin, J.Str(rep, "id"), "127.0.0.1");
        Check("CSV 文件名以 .csv 结尾", csvName.EndsWith(".csv"), csvName);
        Check("CSV 带 UTF-8 BOM", csvText.StartsWith("\uFEFF"));
        Check("CSV 含五段标题", csvText.Contains("一、运行概况") && csvText.Contains("五、工单明细"));
        Check("CSV 行数合理", csvText.Split('\n').Length >= 20, $"{csvText.Split('\n').Length} 行");
        Throws("非法自定义区间 → 400 BAD_RANGE", 400, "BAD_RANGE",
            () => core.Reports.CreateReport(admin, new JsonObject
            {
                ["siteId"] = "site-1",
                ["type"] = "custom",
                ["from"] = TimeUtil.Iso(now),
                ["to"] = TimeUtil.Iso(now - 86400_000),
            }, "127.0.0.1"));

        /* ================= 13. 管理：用户 / 设置 / 备份 ================= */
        Section("管理：用户、设置、审计与备份");
        var usersPage = core.Admin.Users(admin);
        Check("用户列表返回 8 人", J.Num(usersPage, "total") == 8, $"实际 {J.Num(usersPage, "total")}");
        Check("用户列表不含口令", (J.Get(usersPage, "items") as JsonArray)!.OfType<JsonObject>()
            .All(u => J.Get(u, "password") is null));
        var createdUser = core.Admin.CreateUser(admin, new JsonObject
        {
            ["username"] = "selftest",
            ["name"] = "自测账号",
            ["role"] = "viewer",
            ["siteIds"] = new JsonArray("site-1"),
        }, "127.0.0.1");
        Eq("新用户角色名回填", J.Str(J.O(J.O(db, "roles")!, "viewer")!, "name"), J.Str(createdUser, "roleName"));
        Throws("重复账号 → 409 USERNAME_TAKEN", 409, "USERNAME_TAKEN",
            () => core.Admin.CreateUser(admin, new JsonObject { ["username"] = "selftest", ["name"] = "重复", ["role"] = "viewer" }, "127.0.0.1"));
        Throws("非法角色 → 400 BAD_ROLE", 400, "BAD_ROLE",
            () => core.Admin.CreateUser(admin, new JsonObject { ["username"] = "selftest2", ["name"] = "非法角色", ["role"] = "boss" }, "127.0.0.1"));
        var newLogin = core.Auth.Login("selftest", "water123", "127.0.0.1", "t");
        Check("新账号可用默认口令登录", newLogin.Token.Length > 0);
        Throws("停用自己 → 409 SELF_DISABLE", 409, "SELF_DISABLE",
            () => core.Admin.UpdateUser(admin, J.Str(admin, "id"), new JsonObject { ["status"] = "inactive" }, "127.0.0.1"));

        var settings = core.Admin.Settings(admin);
        Check("设置含存储信息", J.Get(settings, "storage") is JsonObject stg && stg["historyDays"] is not null);
        var patched = core.Admin.UpdateSettings(admin, new JsonObject
        {
            ["autoRefreshSec"] = 9,
            ["commandTimeoutSec"] = 45,
            ["platformName"] = "小禹（自测）",
        }, "127.0.0.1");
        Eq("设置已更新", "小禹（自测）", J.Str(patched, "platformName"));
        Eq("数字项被接受", 9, (int)(J.Num(patched, "autoRefreshSec") ?? 0));
        var clamped = core.Admin.UpdateSettings(admin, new JsonObject { ["autoRefreshSec"] = 999 }, "127.0.0.1");
        Eq("超范围数字被夹到上限", 60, (int)(J.Num(clamped, "autoRefreshSec") ?? 0));

        var auditPage = core.Admin.AuditLogs(admin, null, "command", null, null, null, null, null, 1, 100);
        Check("审计日志可按动作前缀查询", J.Get(auditPage, "items") is JsonArray aud && aud.Count >= 1);
        Check("审计日志回填动作中文名",
            (J.Get(auditPage, "items") as JsonArray)!.OfType<JsonObject>().All(a => J.Get(a, "actionName") is not null));

        var backup = core.Admin.CreateBackup(admin, new JsonObject { ["note"] = "自测备份" }, "127.0.0.1");
        Check("备份编号形如 BK…", J.Str(backup, "id").StartsWith("BK"), J.Str(backup, "id"));
        Check("备份文件已落盘", File.Exists(Path.Combine(core.Store.BackupDir, J.Str(backup, "file"))));
        var backups = core.Admin.Backups(admin);
        Check("备份列表含新建项", J.Num(backups, "count") >= 1);
        Throws("恢复备份缺 confirm → 400 CONFIRM_REQUIRED", 400, "CONFIRM_REQUIRED",
            () => core.Admin.RestoreBackup(admin, J.Str(backup, "id"), new JsonObject(), "127.0.0.1"));
        var restored = core.Admin.RestoreBackup(admin, J.Str(backup, "id"),
            new JsonObject { ["confirm"] = true }, "127.0.0.1");
        Check("恢复备份成功并留回滚点", JsMath.Truthy(J.Get(restored, "restored"))
            && J.Str(restored, "rollbackFile").StartsWith("pre-restore-"));
        Check("恢复后数据仍完整", J.ObjsIn(core.Store.Data, "sites").Count == 2 && J.ObjsIn(core.Store.Data, "users").Count >= 8);

        /* ================= 13.5 通知已读 ================= */
        Section("通知：全部标为已读");
        var unreadBefore = J.Num(core.Admin.ListNotifications(admin, false, pageSize: 50), "unread");
        Check("初始存在未读通知", unreadBefore > 0, $"实际 {unreadBefore}");
        var marked = core.Admin.MarkNotificationsRead(admin, new JsonObject { ["all"] = true });
        Eq("标记后 unread=0", "0", J.Num(marked, "unread").ToString());
        Eq("再次查询 unread=0", "0", J.Num(core.Admin.ListNotifications(admin, false, pageSize: 50), "unread").ToString());

        /* ================= 14. 数据持久化 ================= */
        Section("持久化与数据兼容");
        core.Store.Save(true);
        var raw = File.ReadAllText(Path.Combine(dataDir, "db.json"), Encoding.UTF8);
        Check("db.json 已写盘", raw.Length > 10000);
        // 注意：string.StartsWith("\uFEFF") 走区域性比较，ICU 会把这类字符当作可忽略，
        // 因此这里必须按字符（序号）比较。
        Check("db.json 不带 BOM", raw.Length > 0 && raw[0] != '\uFEFF');
        var reparsed = JsonNode.Parse(raw) as JsonObject;
        Check("写回的数据可被重新解析", reparsed is not null);
        Check("结构键与 Node 版一致",
            reparsed!["sites"] is JsonArray && reparsed["users"] is JsonArray &&
            reparsed["alarms"] is JsonArray && reparsed["commands"] is JsonArray &&
            reparsed["_seq"] is JsonObject && reparsed["meta"] is JsonObject);
        Check("新建的告警已持久化", J.ObjsIn(reparsed, "alarms").Any(a => J.Str(a, "id") == alarmId));
        Check("新建的工单已持久化", J.ObjsIn(reparsed, "workorders").Any(w => J.Str(w, "id") == woId));
    }
}
