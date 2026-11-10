using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace ZhifuWater.Desktop.Data;

/// <summary>
/// 本地演示数据引擎：在 CoreServices 契约就绪前提供与 Web 演示版一致的数据形态。
/// 全部方法在 UI 线程调用，3 秒由 DispatcherTimer 驱动 <see cref="Tick"/>。
/// </summary>
public sealed partial class DemoDesktopData : IDesktopData
{
    // ---------------- 内部状态 ----------------
    private sealed class PointRuntime
    {
        public PointDef Def = new();
        public double? Value;
        public bool Installed = true;
        public double Base, Min, Max, Wave;
        public string Quality = "good";
        public long T;
        public string Source = "gateway";
    }

    private sealed class BwRuntime
    {
        public int Phase; // 0 待机 1 气冲 2 气水联合 3 漂洗
        public int Remain;
        public int Count;
    }

    private sealed class SiteRuntime
    {
        public SiteInfo Info = new();
        public Dictionary<string, PointRuntime> Points = new();
        public List<AlarmInfo> Alarms = new();
        public List<WorkOrderInfo> WorkOrders = new();
        public List<LabRecord> Labs = new();
        public List<ParamInfo> Params = new();
        public List<ParamRequest> Requests = new();
        public List<CommandRecord> Commands = new();
        public List<InspectionInfo> Inspections = new();
        public List<DeviceInfo> Devices = new();
        public List<DiagnosisInfo> Diagnoses = new();
        public List<ReportInfo> Reports = new();
        public BwRuntime BafBw = new();
        public BwRuntime SulfurBw = new();
        public double TodayVolume = 2.31;
        public double TodayPower = 5.6;
        public double TodayPac = 4.2;
        public double TodayPam = 2.8;
    }

    private readonly DateTime _now0 = DateTime.Now;
    private readonly Dictionary<string, SiteRuntime> _sites = new();
    private readonly List<NotificationInfo> _notifications = new();
    private readonly List<AuditInfo> _audit = new();
    private readonly List<BackupInfo> _backups = new();
    private readonly List<ChannelInfo> _channels;
    private readonly List<KeyValuePair<string, string>> _settings;
    private UserInfo? _user;
    private string _siteId = "site-1";
    private int _tick;
    private long _alarmSeq = 100;
    private DateTime _lastUpdated = DateTime.Now;
    private string _notice = "";

    private static readonly Dictionary<string, (string Name, string Role, string Title, string Phone, string Status)> Accounts = new()
    {
        ["admin"] = ("平台管理员", "super", "平台管理员", "138-0000-0001", "active"),
        ["wang"] = ("王敏", "region", "区域运行主管", "138-0000-0002", "active"),
        ["li"] = ("李工", "process", "工艺工程师", "138-0000-0003", "active"),
        ["zhao"] = ("赵磊", "operator", "现场运维员", "138-0000-0004", "active"),
        ["chen"] = ("陈浩", "maintainer", "设备维修员", "138-0000-0005", "active"),
        ["guest"] = ("监管访客", "viewer", "监管访客", "138-0000-0006", "active"),
        ["sun"] = ("孙倩", "operator", "义乌站运维员", "138-0000-0007", "active"),
        ["zhou"] = ("周涛", "operator", "现场运维员（已停用）", "138-0000-0008", "inactive"),
    };

    private static readonly Dictionary<string, string[]> RolePerms = new()
    {
        ["super"] = new[] { "view", "control", "alarm.handle", "workorder.handle", "param.edit", "report.export", "lab.review", "inspection.execute", "admin.users", "admin.config", "admin.audit" },
        ["region"] = new[] { "view", "alarm.handle", "workorder.handle", "report.export", "admin.audit" },
        ["process"] = new[] { "view", "control", "alarm.handle", "param.edit", "report.export", "lab.review" },
        ["operator"] = new[] { "view", "control", "alarm.handle", "workorder.handle", "inspection.execute" },
        ["maintainer"] = new[] { "view", "alarm.handle", "workorder.handle", "inspection.execute" },
        ["viewer"] = new[] { "view" },
    };

    public DemoDesktopData()
    {
        _settings = DemoCatalog.Settings("site-1");
        _channels = DemoCatalog.Channels();
        foreach (var site in DemoCatalog.Sites(_now0))
        {
            var rt = new SiteRuntime { Info = site };
            BuildPoints(rt);
            BuildAlarms(rt);
            BuildWorkOrders(rt);
            BuildLabs(rt);
            BuildParams(rt);
            BuildDevices(rt);
            BuildInspections(rt);
            BuildDiagnoses(rt);
            rt.Reports = DemoCatalog.Reports(site.Id, _now0);
            BuildInitialCommands(rt);
            _sites[site.Id] = rt;
        }
        BuildNotifications();
        BuildAudit();
        BuildBackups();
        _notice = "演示数据：数据来源为本地演示引擎（CoreServices 契约就绪后由 AppServices 切换为真实业务层）。";
    }

    // ---------------- 基础 ----------------
    public string BackendName => "演示数据";
    public DateTime LastUpdated => _lastUpdated;
    public event EventHandler? DataChanged;

    public string CurrentSiteId => _siteId;
    public IReadOnlyList<SiteInfo> Sites => _sites.Values.Select(s => s.Info).ToList();
    public SiteInfo Site => _sites[_siteId].Info;
    public void SetSite(string siteId)
    {
        if (!_sites.ContainsKey(siteId)) return;
        _siteId = siteId;
        Touch();
    }

    private SiteRuntime Rt => _sites[_siteId];

    private static long Ms(DateTime d) => new DateTimeOffset(d).ToUnixTimeMilliseconds();
    private static DateTime FromMs(long ms) => DateTimeOffset.FromUnixTimeMilliseconds(ms).LocalDateTime;

    private void Touch()
    {
        _lastUpdated = DateTime.Now;
        DataChanged?.Invoke(this, EventArgs.Empty);
    }

    // ---------------- 认证 ----------------
    public UserInfo? CurrentUser => _user;

    public OpResult Login(string username, string password)
    {
        username = (username ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            return OpResult.Fail("请输入账号与密码");
        if (!Accounts.TryGetValue(username, out var acc))
            return OpResult.Fail("账号或密码错误（演示口令 water123）");
        if (acc.Status != "active")
            return OpResult.Fail("该账号已停用，请联系平台管理员");
        if (password != "water123")
            return OpResult.Fail("账号或密码错误（演示口令 water123）");

        var siteIds = acc.Role switch
        {
            "super" => new List<string> { "site-1", "site-2" },
            "region" => new List<string> { "site-1", "site-2" },
            "viewer" => new List<string> { "site-1", "site-2" },
            "maintainer" => new List<string> { "site-1", "site-2" },
            "operator" when username == "sun" => new List<string> { "site-2" },
            _ => new List<string> { "site-1" },
        };

        _user = new UserInfo
        {
            Id = "U-" + username,
            Username = username,
            Name = acc.Name,
            Role = acc.Role,
            RoleName = RoleName(acc.Role),
            Title = acc.Title,
            Phone = acc.Phone,
            Status = acc.Status,
            Perms = RolePerms[acc.Role].ToList(),
            SiteIds = siteIds,
            LastLoginAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm"),
        };
        if (!_user.SiteIds.Contains(_siteId)) _siteId = _user.SiteIds[0];
        RecordAudit("auth.login", "user", _user.Id, "登录成功", "success");
        Touch();
        return OpResult.Done("登录成功");
    }

    public void Logout()
    {
        if (_user != null) RecordAudit("auth.logout", "user", _user.Id, "退出登录", "success");
        _user = null;
        Touch();
    }

    public OpResult ChangePassword(string oldPassword, string newPassword)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (oldPassword != "water123") return OpResult.Fail("当前密码不正确");
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 6)
            return OpResult.Fail("新密码至少 6 位");
        if (newPassword == oldPassword) return OpResult.Fail("新密码不能与当前密码相同");
        RecordAudit("auth.password", "user", _user.Id, "修改密码", "success");
        return OpResult.Done("密码已修改（演示环境不持久化）");
    }

    public static string RoleName(string role) => role switch
    {
        "super" => "平台管理员",
        "region" => "区域管理员",
        "process" => "工艺工程师",
        "operator" => "运维操作员",
        "maintainer" => "维修工程师",
        "viewer" => "监管访客",
        _ => role,
    };

    // ---------------- 单元 / 点位 ----------------
    public IReadOnlyList<UnitInfo> Units => DemoCatalog.Units();

    public bool RawRefill() => false;

    public IReadOnlyList<UnitSnapshot> UnitSnapshots()
    {
        var rt = Rt;
        var result = new List<UnitSnapshot>();
        foreach (var unit in Units)
        {
            var snap = new UnitSnapshot { Unit = unit };
            snap.Readings = rt.Points.Values.Where(p => p.Def.UnitCode == unit.Code && p.Installed)
                .Select(ToReading).OrderBy(r => r.Point.Code).ToList();
            snap.DeviceCount = rt.Devices.Count(d => d.UnitCode == unit.Code);
            snap.OnlineDevices = rt.Devices.Count(d => d.UnitCode == unit.Code && d.Online);
            var unitAlarms = rt.Alarms.Where(a => a.UnitCode == unit.Code && IsOpen(a)).ToList();
            if (unitAlarms.Any(a => a.Level is "critical" or "major")) snap.State = "alarm";
            else if (unitAlarms.Count > 0) snap.State = "attention";
            else if (snap.DeviceCount > 0 && snap.OnlineDevices == 0) snap.State = "offline";
            else if (snap.Readings.Count == 0) snap.State = "no-instrument";
            snap.StateText = StateText(snap.State);
            snap.Note = unit.Note;
            if (unit.Code == "baf") { ApplyBw(snap, rt.BafBw, "固液分离"); }
            if (unit.Code == "sulfur") { ApplyBw(snap, rt.SulfurBw, "自养脱氮"); }
            result.Add(snap);
        }
        return result;
    }

    private static void ApplyBw(UnitSnapshot snap, BwRuntime bw, string name)
    {
        snap.BwPhase = BwPhaseText(bw.Phase);
        snap.BwText = bw.Phase == 0 ? $"{name} 反冲洗待机" : $"{name} 反冲洗 · {snap.BwPhase}";
        snap.BwRemain = bw.Phase == 0 ? "" : $"剩余 {bw.Remain} s";
        if (bw.Phase > 0 && snap.State == "normal") snap.State = "attention";
        if (bw.Phase > 0 && snap.StateText == "正常") snap.StateText = "反冲洗";
    }

    private static string BwPhaseText(int phase) => phase switch
    {
        1 => "气冲",
        2 => "气水联合",
        3 => "漂洗",
        _ => "待机",
    };

    public static string StateText(string state) => state switch
    {
        "normal" => "正常",
        "attention" => "关注",
        "alarm" => "告警",
        "offline" => "离线",
        "no-instrument" => "无仪表",
        _ => state,
    };

    public IReadOnlyList<PointDef> Points => Rt.Points.Values.Where(p => p.Installed).Select(p => p.Def).OrderBy(p => p.Code).ToList();

    public IReadOnlyList<Reading> Readings => Rt.Points.Values.Where(p => p.Installed).Select(ToReading).OrderBy(r => r.Point.Code).ToList();

    public Reading? ReadingOf(string code)
    {
        if (!Rt.Points.TryGetValue(code, out var p) || !p.Installed) return null;
        return ToReading(p);
    }

    private static Reading ToReading(PointRuntime p)
    {
        var r = new Reading
        {
            Point = p.Def,
            Value = p.Value,
            T = p.T,
            Quality = p.Quality,
            Source = p.Source,
            UnitCode = p.Def.UnitCode,
            Stale = p.Quality is "stale" or "offline",
        };
        r.Text = FormatReading(r);
        return r;
    }

    private static string FormatReading(Reading r)
    {
        if (r.Value == null) return "—";
        var v = r.Value.Value;
        var code = r.Point.Code;
        if (r.Point.Type == "run") return v >= 0.5 ? "运行" : "停止";
        if (r.Point.Type == "alarm") return v >= 0.5 ? "故障" : "正常";
        if (code.EndsWith(".MODE")) return v >= 0.5 ? "自动" : "手动";
        if (code.EndsWith(".BW.STATE"))
        {
            var phase = (int)Math.Round(v);
            return BwPhaseText(phase);
        }
        var digits = r.Point.Digits;
        return v.ToString("F" + digits);
    }

    public IReadOnlyList<TrendSeries> Trend(IEnumerable<string> codes, int hours)
    {
        var list = new List<TrendSeries>();
        var rt = Rt;
        var end = DateTime.Now;
        var start = end.AddHours(-hours);
        var steps = Math.Max(12, hours * 6); // 10 分钟一个点
        foreach (var code in codes)
        {
            if (!rt.Points.TryGetValue(code, out var p) || !p.Installed) continue;
            var series = new TrendSeries
            {
                Code = code,
                Name = p.Def.Name,
                Unit = p.Def.Unit,
                Color = SeriesColor(list.Count),
            };
            var rnd = new Random(code.GetHashCode() ^ 20261026);
            for (var i = 0; i <= steps; i++)
            {
                var t = start.AddMinutes((end - start).TotalMinutes * i / steps);
                double v;
                if (p.Def.Type == "run") v = (i > steps * 0.25 && i < steps * 0.32) ? 0 : 1;
                else if (p.Def.Type == "counter") v = p.Base * (0.9 + 0.1 * i / steps);
                else
                {
                    var wave = Math.Sin((i / (double)steps) * Math.PI * 2 * (hours / 12.0) + rnd.NextDouble() * 0.4);
                    v = p.Base + wave * p.Wave + (rnd.NextDouble() - 0.5) * p.Wave * 0.7;
                }
                v = Math.Clamp(v, p.Min, p.Max);
                series.Points.Add(new MetricPoint { T = Ms(t), V = Math.Round(v, p.Def.Digits) });
            }
            if (p.Value != null) series.Points[^1] = new MetricPoint { T = p.T, V = p.Value!.Value };
            list.Add(series);
        }
        return list;
    }

    public static string SeriesColor(int index) => (index % 4) switch
    {
        0 => "#0E7C74",
        1 => "#1C6B45",
        2 => "#8A5A12",
        3 => "#2A5F8A",
        _ => "#0E7C74",
    };

    public IReadOnlyList<string> UnitWarnings(string unitCode) => Rt.Alarms
        .Where(a => a.UnitCode == unitCode && IsOpen(a))
        .OrderByDescending(a => a.At)
        .Select(a => $"{LevelText(a.Level)} · {a.Title}")
        .ToList();

    // ---------------- 驾驶舱 ----------------
    public IReadOnlyList<KpiInfo> DashboardKpis()
    {
        var rt = Rt;
        var activeAlarms = rt.Alarms.Count(IsOpen);
        var openOrders = rt.WorkOrders.Count(w => w.Status is "pending" or "accepted" or "processing");
        var online = rt.Points.Values.Count(p => p.Installed && p.Quality == "good");
        var total = rt.Points.Values.Count(p => p.Installed);
        var latestCod = LatestLabValue("outlet", "COD");
        var latestNh3 = LatestLabValue("outlet", "NH3N");
        var energyPerM3 = rt.TodayVolume <= 0 ? 2.42 : rt.TodayPower / rt.TodayVolume;
        var dosePerM3 = rt.TodayVolume <= 0 ? 0.12 : (rt.TodayPac + rt.TodayPam) / rt.TodayVolume;
        return new List<KpiInfo>
        {
            new() { Key = "volume", Label = "今日处理水量", Value = rt.TodayVolume.ToString("F2"), Unit = "m³", Delta = "较昨日 +1.3%", Tone = "good", Source = "流量计量 FLOW.IN", Hint = "按进水瞬时流量积分，10 分钟聚合" },
            new() { Key = "cod", Label = "出水 COD（人工化验）", Value = latestCod?.ToString("F1") ?? "待接入", Unit = "mg/L", Delta = "较昨日 -0.6", Tone = "good", Source = "人工化验室 · 日检", Hint = "实验记录，非在线仪表" },
            new() { Key = "devices", Label = "运行设备", Value = $"{rt.Devices.Count(d => d.Online)}/{rt.Devices.Count}", Unit = "台", Delta = "在线率 " + Pct(rt.Devices.Count(d => d.Online), rt.Devices.Count), Tone = "normal", Source = "设备台账 MODBUS", Hint = "在线为通信正常且无故障" },
            new() { Key = "points", Label = "点位在线率", Value = Pct(online, total), Unit = "", Delta = "共 " + total + " 个点位", Tone = online == total ? "good" : "warn", Source = "边缘网关 GW-1", Hint = "连续 3 个周期无刷新判为离线" },
            new() { Key = "alarms", Label = "活动告警", Value = activeAlarms.ToString(), Unit = "条", Delta = rt.Alarms.Count(a => a.Level == "critical" && IsOpen(a)) > 0 ? "含紧急" : "无紧急", Tone = activeAlarms > 0 ? "bad" : "good", Source = "规则引擎 RulesEngine", Hint = "未恢复告警（含已确认未恢复）" },
            new() { Key = "orders", Label = "待处理工单", Value = openOrders.ToString(), Unit = "单", Delta = "今日新增 1 单", Tone = openOrders > 0 ? "warn" : "good", Source = "工单系统", Hint = "待接单 / 处理中" },
            new() { Key = "power", Label = "吨水电耗", Value = energyPerM3.ToString("F2"), Unit = "kWh/m³", Delta = "较昨日 -0.03", Tone = "good", Source = "电能表 PM-801", Hint = "今日电量 ÷ 今日处理水量" },
            new() { Key = "dose", Label = "吨水药耗", Value = dosePerM3.ToString("F3"), Unit = "L/m³", Delta = "PAC+PAM 合计", Tone = "normal", Source = "计量泵累计量", Hint = "按今日累计投加量 ÷ 处理水量" },
        };
    }

    private double? LatestLabValue(string point, string metric)
    {
        var lab = Rt.Labs.Where(l => l.SamplePoint == point && l.SampledAt > 0)
            .OrderByDescending(l => l.SampledAt).FirstOrDefault();
        return lab != null && lab.Metrics.TryGetValue(metric, out var v) ? v : null;
    }

    private static string Pct(int a, int b) => b <= 0 ? "—" : (a * 100.0 / b).ToString("F0") + "%";

    public DataHealthInfo DataHealth()
    {
        var rt = Rt;
        var total = rt.Points.Values.Count(p => p.Installed);
        var online = rt.Points.Values.Count(p => p.Installed && p.Quality == "good");
        var latest = rt.Points.Values.Where(p => p.T > 0).Select(p => p.T).DefaultIfEmpty(0).Max();
        return new DataHealthInfo
        {
            Gateway = "connected",
            PointsTotal = total,
            PointsOnline = online,
            LatestAt = latest,
            Notice = rt.Info.Id == "site-2" ? "义乌站为复制试点，进水流量 / 电能点位未安装，相关指标标「待接入」。" : _notice,
        };
    }

    public string Notice() => Rt.Info.Id == "site-2"
        ? "义乌站为复制试点：选配点位未装，数据按已安装点位统计。"
        : "中试装置运行正常；自养脱氮 pH 与 预氧化溶解氧为当前重点盯防指标。";

    // ---------------- 节拍 ----------------
    public void Tick()
    {
        _tick++;
        var rnd = new Random(_tick * 7919 + 13);
        foreach (var rt in _sites.Values)
        {
            var now = DateTime.Now;
            foreach (var p in rt.Points.Values)
            {
                if (!p.Installed) continue;
                p.T = Ms(now);
                p.Quality = "good";
                if (p.Def.Type == "measure")
                {
                    var target = p.Base + Math.Sin(_tick / 37.0 + p.Def.Code.Length) * p.Wave;
                    var v = (p.Value ?? p.Base) * 0.82 + target * 0.18 + (rnd.NextDouble() - 0.5) * p.Wave * 0.35;
                    p.Value = Math.Round(Math.Clamp(v, p.Min, p.Max), p.Def.Digits);
                }
                else if (p.Def.Type == "counter")
                {
                    if (p.Def.Code == "ENERGY.KWH")
                    {
                        var kw = rt.Points.TryGetValue("POWER.KW", out var pk) ? pk.Value ?? 2.35 : 2.35;
                        p.Value = Math.Round((p.Value ?? 0) + kw * 5.0 / 3600.0, 1);
                        rt.TodayPower += kw * 5.0 / 3600.0;
                    }
                    else if (p.Def.Code == "RAW.PUMP.HOURS")
                    {
                        var run = rt.Points.TryGetValue("RAW.PUMP.RUN", out var rp) && rp.Value >= 0.5;
                        if (run) p.Value = Math.Round((p.Value ?? 0) + 5.0 / 3600.0, 1);
                    }
                }
            }
            if (rt.Points.TryGetValue("FLOW.IN", out var flow) && flow.Value != null)
            {
                rt.TodayVolume += flow.Value.Value * 5.0 / 3600.0 / 1000.0 * 1000.0 / 1000.0; // L→m³
            }
            ProgressBackwash(rt, "baf", "固液分离", rt.BafBw, rnd);
            ProgressBackwash(rt, "sulfur", "自养脱氮", rt.SulfurBw, rnd);
            AdvanceCommands(rt);
            EvaluateAlarms(rt);
        }
        _lastUpdated = DateTime.Now;
        DataChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ProgressBackwash(SiteRuntime rt, string unit, string name, BwRuntime bw, Random rnd)
    {
        if (!rt.Points.TryGetValue(unit.ToUpperInvariant() + ".BW.STATE", out var state)) return;
        if (bw.Phase == 0)
        {
            if (rnd.NextDouble() < 0.006)
            {
                bw.Phase = 1;
                bw.Remain = 40;
                state.Value = 1;
            }
        }
        else
        {
            bw.Remain -= 5;
            if (bw.Remain <= 0)
            {
                if (bw.Phase < 3) { bw.Phase++; bw.Remain = bw.Phase == 2 ? 60 : 50; }
                else
                {
                    bw.Phase = 0;
                    bw.Remain = 0;
                    bw.Count++;
                    if (rt.Points.TryGetValue(unit.ToUpperInvariant() + ".BW.COUNT", out var count))
                        count.Value = (count.Value ?? bw.Count) + 1;
                    AddNotification($"反冲洗完成", $"{name}滤池完成一次反冲洗，累计 {bw.Count} 次。", "process");
                }
            }
            state.Value = bw.Phase;
        }
    }

    private void AdvanceCommands(SiteRuntime rt)
    {
        foreach (var cmd in rt.Commands.Where(c => c.Status == "sent"))
        {
            cmd.Status = "executing";
        }
        foreach (var cmd in rt.Commands.Where(c => c.Status == "executing"))
        {
            if (cmd.At + 5000 < Ms(DateTime.Now))
            {
                cmd.Status = "success";
                AddNotification("指令执行成功", $"{cmd.Label} 已执行完成（{cmd.Device}）。", "command");
            }
        }
    }

    // ---------------- 告警 ----------------
    private static bool IsOpen(AlarmInfo a) => a.Status is "active" or "acknowledged";

    public IReadOnlyList<AlarmInfo> Alarms(string status = "all", string level = "all", string keyword = "")
    {
        IEnumerable<AlarmInfo> q = Rt.Alarms;
        if (status == "active") q = q.Where(IsOpen);
        else if (status == "unack") q = q.Where(a => a.Status == "active");
        else if (status == "history") q = q.Where(a => !IsOpen(a));
        if (level != "all") q = q.Where(a => a.Level == level);
        if (!string.IsNullOrWhiteSpace(keyword))
            q = q.Where(a => a.Title.Contains(keyword) || a.UnitName.Contains(keyword) || a.Id.Contains(keyword));
        return q.OrderByDescending(a => a.At).ToList();
    }

    public string DeviceIdOfPoint(string pointCode) => "";

    public AlarmStats AlarmStatistics(int days)
    {
        var rt = Rt;
        var stats = new AlarmStats();
        var today = DateTime.Today;
        for (var i = days - 1; i >= 0; i--)
        {
            var day = today.AddDays(-i);
            var count = rt.Alarms.Count(a => FromMs(a.At).Date == day);
            stats.ByDay.Add(new(day.ToString("MM-dd"), count));
        }
        foreach (var level in new[] { "critical", "major", "minor", "info" })
            stats.ByLevel.Add(new(LevelText(level), rt.Alarms.Count(a => a.Level == level && IsOpen(a))));
        foreach (var group in rt.Alarms.Where(IsOpen).GroupBy(a => a.UnitName).OrderByDescending(g => g.Count()).Take(6))
            stats.ByUnit.Add(new(group.Key, group.Count()));
        stats.Counts["active"] = rt.Alarms.Count(IsOpen);
        stats.Counts["unack"] = rt.Alarms.Count(a => a.Status == "active");
        stats.Counts["critical"] = rt.Alarms.Count(a => a.Level == "critical" && IsOpen(a));
        stats.Counts["resolved"] = rt.Alarms.Count(a => !IsOpen(a));
        var acked = rt.Alarms.Where(a => a.AckAt != null).ToList();
        stats.MttaMin = acked.Count == 0 ? 0 : (int)acked.Average(a => (a.AckAt!.Value - a.At) / 60000.0);
        var closed = rt.Alarms.Where(a => a.ResolvedAt != null).ToList();
        stats.MttrMin = closed.Count == 0 ? 0 : (int)closed.Average(a => (a.ResolvedAt!.Value - a.At) / 60000.0);
        stats.AckRate = rt.Alarms.Count == 0 ? 100 : (int)(rt.Alarms.Count(a => a.AckAt != null) * 100.0 / rt.Alarms.Count);
        return stats;
    }

    public static string LevelText(string level) => level switch
    {
        "critical" => "紧急",
        "major" => "重要",
        "minor" => "次要",
        "info" => "提示",
        _ => level,
    };

    public OpResult AckAlarm(string id, string note)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (!_user.Can("alarm.handle")) return OpResult.Fail("当前账号无告警处理权限");
        var alarm = Rt.Alarms.FirstOrDefault(a => a.Id == id);
        if (alarm == null) return OpResult.Fail("告警不存在");
        if (alarm.Status != "active") return OpResult.Fail("该告警已确认或已恢复");
        alarm.Status = "acknowledged";
        alarm.AckAt = Ms(DateTime.Now);
        alarm.AckBy = _user.Name;
        alarm.Note = note;
        alarm.Timeline.Add(new TimelineEntry { At = alarm.AckAt.Value, Actor = _user.Name, Text = "确认告警：" + (string.IsNullOrWhiteSpace(note) ? "已确认" : note) });
        RecordAudit("alarm.ack", "alarm", alarm.Id, $"{alarm.Title}（{alarm.Id}）");
        AddNotification("告警已确认", $"{alarm.Title} 已由 {_user.Name} 确认。", "alarm");
        Touch();
        return OpResult.Done("告警已确认");
    }

    public OpResult ResolveAlarm(string id, string note)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (!_user.Can("alarm.handle")) return OpResult.Fail("当前账号无告警处理权限");
        var alarm = Rt.Alarms.FirstOrDefault(a => a.Id == id);
        if (alarm == null) return OpResult.Fail("告警不存在");
        if (!IsOpen(alarm)) return OpResult.Fail("该告警已恢复");
        alarm.Status = "resolved";
        alarm.ResolvedAt = Ms(DateTime.Now);
        alarm.Timeline.Add(new TimelineEntry { At = alarm.ResolvedAt.Value, Actor = _user.Name, Text = "恢复：" + (string.IsNullOrWhiteSpace(note) ? "现场确认恢复正常" : note) });
        RecordAudit("alarm.resolve", "alarm", alarm.Id, $"{alarm.Title}（{alarm.Id}）");
        AddNotification("告警已恢复", $"{alarm.Title} 已恢复。", "alarm");
        Touch();
        return OpResult.Done("告警已恢复");
    }

    public IReadOnlyList<AlarmRuleInfo> AlarmRules => DemoCatalog.AlarmRules();

    public OpResult ToggleAlarmRule(string id)
    {
        if (_user?.Can("param.edit") != true) return OpResult.Fail("当前账号无配置权限");
        RecordAudit("alarm.rule.toggle", "rule", id, "切换规则启用状态");
        Touch();
        return OpResult.Done("规则状态已切换（演示环境不持久化）");
    }

    // ---------------- 设备控制 ----------------
    public IReadOnlyList<ActionInfo> Actions => DemoCatalog.Actions();

    public IReadOnlyList<CommandRecord> Commands(int limit = 30) => Rt.Commands.OrderByDescending(c => c.At).Take(limit).ToList();

    public OpResult ExecuteAction(string key, string reason)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (!_user.Can("control")) return OpResult.Fail("当前账号无设备控制权限");
        var action = Actions.FirstOrDefault(a => a.Key == key);
        if (action == null) return OpResult.Fail("未知动作");
        if (key is "baf.backwash" or "sulfur.backwash")
        {
            var bw = key == "baf.backwash" ? Rt.BafBw : Rt.SulfurBw;
            if (bw.Phase > 0) return OpResult.Fail("当前已在反冲洗阶段，请等待完成");
        }
        var now = DateTime.Now;
        var cmd = new CommandRecord
        {
            Id = "CMD-" + now.ToString("yyyyMMdd-HHmmss") + "-" + (++_alarmSeq),
            SiteId = Rt.Info.Id,
            Action = action.Key,
            Label = action.Label,
            Device = action.Device,
            UnitCode = action.UnitCode,
            Status = "sent",
            Reason = reason,
            By = _user.Name,
            At = Ms(now),
        };
        Rt.Commands.Add(cmd);
        ApplyActionEffect(action.Key);
        RecordAudit("control.execute", "command", cmd.Id, $"{action.Label}（{action.Device}）原因：{reason}");
        AddNotification("远程指令已下发", $"{action.Label} · {action.Device}，待设备回执。", "command");
        Touch();
        return OpResult.Done($"指令已下发：{action.Label}");
    }

    private void ApplyActionEffect(string key)
    {
        var rt = Rt;
        void Set(string code, double value)
        {
            if (rt.Points.TryGetValue(code, out var p)) { p.Value = value; p.T = Ms(DateTime.Now); }
        }
        switch (key)
        {
            case "raw.pump.start": Set("RAW.PUMP.RUN", 1); break;
            case "raw.pump.stop": Set("RAW.PUMP.RUN", 0); break;
            case "baf.blower.start": Set("BAF.BLOWER.RUN", 1); break;
            case "baf.blower.stop": Set("BAF.BLOWER.RUN", 0); break;
            case "pac.pump.start": Set("PAC.PUMP.RUN", 1); break;
            case "pac.pump.stop": Set("PAC.PUMP.RUN", 0); break;
            case "pam.pump.start": Set("PAM.PUMP.RUN", 1); break;
            case "pam.pump.stop": Set("PAM.PUMP.RUN", 0); break;
            case "baf.backwash": rt.BafBw.Phase = 1; rt.BafBw.Remain = 40; break;
            case "sulfur.backwash": rt.SulfurBw.Phase = 1; rt.SulfurBw.Remain = 40; break;
        }
    }

    public OpResult ConfirmCommand(string id)
    {
        var cmd = Rt.Commands.FirstOrDefault(c => c.Id == id);
        if (cmd == null) return OpResult.Fail("指令不存在");
        cmd.Status = "success";
        RecordAudit("control.confirm", "command", id, "人工确认命令完成");
        Touch();
        return OpResult.Done("命令已确认完成");
    }

    public OpResult CancelCommand(string id)
    {
        var cmd = Rt.Commands.FirstOrDefault(c => c.Id == id);
        if (cmd == null) return OpResult.Fail("指令不存在");
        if (cmd.Status is "success" or "cancelled") return OpResult.Fail("该命令已结束，无法取消");
        cmd.Status = "cancelled";
        RecordAudit("control.cancel", "command", id, "人工取消命令");
        Touch();
        return OpResult.Done("命令已取消");
    }

    // ---------------- 参数 ----------------
    public IReadOnlyList<ParamInfo> Params => Rt.Params.ToList();
    public IReadOnlyList<ParamRequest> ParamRequests => Rt.Requests.OrderByDescending(r => r.At).ToList();

    public OpResult SetParam(string id, double value, string reason)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (!_user.Can("param.edit")) return OpResult.Fail("当前账号无参数编辑权限");
        var param = Rt.Params.FirstOrDefault(p => p.Id == id);
        if (param == null) return OpResult.Fail("参数不存在");
        if (value < param.Min || value > param.Max)
            return OpResult.Fail($"取值需在 {param.Min}–{param.Max} {param.Unit} 之间");
        if (string.IsNullOrWhiteSpace(reason)) return OpResult.Fail("请填写变更原因");
        if (param.WriteMode == "cloud")
        {
            var req = new ParamRequest
            {
                Id = "PR-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"),
                ParamId = param.Id, ParamName = param.Name, Value = value, Unit = param.Unit,
                Reason = reason, Applicant = _user.Name, At = Ms(DateTime.Now), Status = "pending",
            };
            Rt.Requests.Add(req);
            RecordAudit("param.request", "param", param.Id, $"{param.Name} → {value}{param.Unit}，原因：{reason}");
            AddNotification("参数变更待审批", $"{_user.Name} 提交「{param.Name}」变更申请：{value}{param.Unit}。", "param");
            Touch();
            return OpResult.Done("已提交审批，待工艺工程师核准后生效");
        }
        ApplyParam(param, value, reason);
        Touch();
        return OpResult.Done("参数已下发（本地写模式，即时生效）");
    }

    private void ApplyParam(ParamInfo param, double value, string reason)
    {
        param.Current = value;
        param.Version++;
        param.UpdatedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
        param.UpdatedBy = _user?.Name ?? "系统";
        param.Versions.Add(new ParamVersion { Version = param.Version, Value = value, At = param.UpdatedAt, By = param.UpdatedBy, Reason = reason });
        RecordAudit("param.apply", "param", param.Id, $"{param.Name} 修改为 {value}{param.Unit}，原因：{reason}");
    }

    public OpResult RollbackParam(string id, int version, string reason)
    {
        if (_user?.Can("param.edit") != true) return OpResult.Fail("当前账号无参数编辑权限");
        var param = Rt.Params.FirstOrDefault(p => p.Id == id);
        if (param == null) return OpResult.Fail("参数不存在");
        var ver = param.Versions.FirstOrDefault(v => v.Version == version);
        if (ver == null) return OpResult.Fail("版本不存在");
        ApplyParam(param, ver.Value, "回滚到 v" + version + "：" + reason);
        Touch();
        return OpResult.Done($"已回滚到 v{version}（{ver.Value}{param.Unit}）");
    }

    public OpResult ApproveParamRequest(string id, bool approve)
    {
        if (_user?.Can("param.edit") != true) return OpResult.Fail("当前账号无审批权限");
        var req = Rt.Requests.FirstOrDefault(r => r.Id == id);
        if (req == null) return OpResult.Fail("申请不存在");
        if (req.Status != "pending") return OpResult.Fail("该申请已处理");
        var param = Rt.Params.FirstOrDefault(p => p.Id == req.ParamId);
        if (param == null) return OpResult.Fail("参数不存在");
        req.Status = approve ? "approved" : "rejected";
        if (approve)
        {
            ApplyParam(param, req.Value, "审批通过：" + req.Reason);
            RecordAudit("param.approve", "request", req.Id, $"{param.Name} → {req.Value}{param.Unit}");
        }
        else RecordAudit("param.reject", "request", req.Id, $"{param.Name} 申请被驳回");
        Touch();
        return OpResult.Done(approve ? "已批准并生效" : "已驳回");
    }
}
