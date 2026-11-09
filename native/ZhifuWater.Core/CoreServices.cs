using System.Text.Json.Nodes;

namespace ZhifuWater.Core;

/// <summary>门面配置项。</summary>
public sealed class CoreServicesOptions
{
    /// <summary>程序数据目录（读写 <c>db.json</c>）。默认 <c>%LOCALAPPDATA%\ZhifuWater</c>。</summary>
    public string DataDir { get; set; } = DefaultDataDir();

    /// <summary>首次运行时复制的初始快照来源（Node 版 <c>data/db.json</c>）。设为 null 则要求目录里已有数据。</summary>
    public string? SeedSource { get; set; } = @"D:\小禹\data\db.json";

    /// <summary>构造后立即 <see cref="CoreServices.Start"/>。</summary>
    public bool AutoStart { get; set; } = true;

    /// <summary>定时器加速倍率（1 = 真实时间；>1 加速，仅供内部演示/自测）。</summary>
    public double SpeedFactor { get; set; } = 1.0;

    /// <summary>数据目录里没有 db.json 时是否从 <see cref="SeedSource"/> 复制。</summary>
    public bool CopySeedOnFirstRun { get; set; } = true;

    /// <summary>后台异常回调（保存失败、定时器异常等）。</summary>
    public Action<Exception>? OnError { get; set; }

    public static string DefaultDataDir() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZhifuWater");
}

/// <summary>
/// 业务门面：把 Node 服务端（<c>server/</c> + <c>server/api/</c>）的全部业务能力封装成可直接调用的对象。
/// 不监听端口、不走 HTTP；WPF 桌面端直接引用本类库即可。
/// 所有业务数据用 <see cref="JsonNode"/> 表达，字段名与 Node 版 <c>data/db.json</c> 保持一致；
/// 业务错误统一抛 <see cref="CoreException"/>（Status/Code/Message 与 Node 版 HTTP 错误逐字对应）。
/// </summary>
public sealed class CoreServices : IDisposable
{
    private readonly TimerHost _timers;
    private readonly AuditService _audit;
    private readonly object _gate = new();
    private bool _started;
    private bool _disposed;

    /// <summary>启动时间（毫秒时间戳）。</summary>
    public long StartedAt { get; private set; }

    /// <summary>当前数据文件绝对路径。</summary>
    public string DataFile => Store.FilePath;

    /// <summary>数据目录。</summary>
    public string DataDir => Store.Dir;

    /// <summary>定时器加速倍率（修改后对后续定时生效）。</summary>
    public double SpeedFactor
    {
        get => _timers.SpeedFactor;
        set => _timers.SpeedFactor = value <= 0 ? 1.0 : value;
    }

    /// <summary>是否已启动采集/规则。</summary>
    public bool IsRunning
    {
        get { lock (_gate) return _started; }
    }

    /* ---------------- 子服务（桌面端可直接调用） ---------------- */

    public Store Store { get; }
    public Auth Auth { get; }
    public Telemetry Telemetry { get; }
    public Simulator Simulator { get; }
    public RulesEngine Rules { get; }
    public CommandEngine Commands { get; }
    /// <summary>告警查询/规则维护（等价于 <see cref="Rules"/>，桌面端命名习惯）。</summary>
    public RulesEngine Alarms => Rules;
    /// <summary>控制命令（等价于 <see cref="Commands"/>，桌面端命名习惯）。</summary>
    public CommandEngine Control => Commands;
    public DiagnosisService Diagnosis { get; }
    public AnalyticsService Analytics { get; }
    public OpsService Ops { get; }
    /// <summary>自动控制：按监测数据自动下发命令或派发工单。</summary>
    public AutomationService Automation { get; }
    public ParamsService Params { get; }
    public AdminService Admin { get; }
    public ReportsService Reports { get; }
    public Notifier Notifier { get; }
    public AuditService Audit => _audit;

    /* ---------------- 事件（WPF 端订阅后可直接刷新界面） ---------------- */

    /// <summary>全部事件（原始 <c>{type, action, data}</c>）。</summary>
    public event Action<JsonObject>? AnyEvent;

    /// <summary>遥测刷新：<c>{type:"telemetry", t, updates:[{pointId,siteId,code,v,t}]}</c>。</summary>
    public event Action<JsonObject>? TelemetryUpdated;

    /// <summary>告警变化：<c>{type:"alarm", action:"create|ack|resolve|close|escalate|update", data}</c>。</summary>
    public event Action<JsonObject>? AlarmChanged;

    /// <summary>命令变化：<c>{type:"command", action, data}</c>。</summary>
    public event Action<JsonObject>? CommandChanged;

    /// <summary>其它业务数据变化（工单/巡检/化验/参数/报表/设置等）。</summary>
    public event Action<JsonObject>? DataChanged;

    /// <summary>后台异常（保存失败、定时任务异常）。</summary>
    public event Action<Exception>? Error;

    /* ---------------- 构造 ---------------- */

    public CoreServices() : this(new CoreServicesOptions()) { }

    /// <summary>便捷构造：只给数据目录（其余走默认）。</summary>
    public CoreServices(string dataDir, string? seedSource = null, bool autoStart = true)
        : this(new CoreServicesOptions { DataDir = dataDir, SeedSource = seedSource, AutoStart = autoStart })
    {
    }

    public CoreServices(CoreServicesOptions options)
    {
        if (options is null) throw new ArgumentNullException(nameof(options));
        var dir = Path.GetFullPath(options.DataDir);
        Directory.CreateDirectory(dir);

        var dbFile = Path.Combine(dir, "db.json");
        if (!File.Exists(dbFile))
        {
            if (options.CopySeedOnFirstRun && !string.IsNullOrEmpty(options.SeedSource) && File.Exists(options.SeedSource))
            {
                File.Copy(options.SeedSource!, dbFile, false);
            }
            else
            {
                throw new CoreException(500,
                    $"数据目录中没有 db.json，且未找到初始数据来源（{options.SeedSource ?? "未配置"}）。",
                    "DATA_MISSING");
            }
        }

        _timers = new TimerHost { SpeedFactor = options.SpeedFactor <= 0 ? 1.0 : options.SpeedFactor };

        Store = new Store(dir) { SaveError = e => RaiseError(e) };
        Store.Load(null);
        _audit = new AuditService(Store);
        Telemetry = new Telemetry();
        Auth = new Auth(Store);
        Notifier = new Notifier(Store, Publish);
        Diagnosis = new DiagnosisService(Store, Telemetry);
        Simulator = new Simulator(Store, Telemetry, _timers) { Publish = Publish };
        Rules = new RulesEngine(Store, Telemetry, Simulator, Notifier, _audit, _timers, Auth)
        {
            Publish = Publish,
            Warn = msg => RaiseError(new Exception(msg)),
        };
        Commands = new CommandEngine(Store, Simulator, Telemetry, Notifier, _audit, Auth, _timers)
        {
            Publish = Publish,
        };
        Analytics = new AnalyticsService(Store, Telemetry, Simulator, Diagnosis, Auth, _audit)
        {
            RuntimeInfo = RuntimeSnapshot,
        };
        Ops = new OpsService(Store, Auth, _audit, Notifier) { Publish = Publish };
        Automation = new AutomationService(Store, Telemetry, Commands, Ops, Notifier, _audit, Rules) { Publish = Publish };
        Params = new ParamsService(Store, Auth, Notifier, _audit) { Publish = Publish };
        Reports = new ReportsService(Store, Telemetry, Analytics, Auth, _audit) { Publish = Publish };
        Admin = new AdminService(Store, Auth, Notifier, _audit)
        {
            Publish = Publish,
            OnRestore = RebuildAfterRestore,
        };

        Rules.RebuildPointIndex();
        Rules.AttachActive();

        if (options.OnError is not null) Error += options.OnError;
        if (options.AutoStart) Start();
    }

    /* ---------------- 生命周期 ---------------- */

    /// <summary>启动：模拟采集（5s tick）+ 规则评估（5s）+ 清理悬挂命令 + 清理过期会话。</summary>
    public void Start()
    {
        lock (_gate)
        {
            if (_disposed) throw new ObjectDisposedException(nameof(CoreServices));
            if (_started) return;
            _started = true;
            StartedAt = TimeUtil.Now();
        }

        Simulator.Start();
        Rules.Start();
        try { Commands.Recover(); }
        catch (Exception ex) { RaiseError(ex); }
        try { Auth.CleanupSessions(); }
        catch (Exception ex) { RaiseError(ex); }
    }

    /// <summary>停止采集与规则（内存态保留，可再次 <see cref="Start"/>）。</summary>
    public void Stop()
    {
        lock (_gate)
        {
            if (!_started) return;
            _started = false;
        }

        try { Simulator.Stop(); } catch (Exception ex) { RaiseError(ex); }
        try { Rules.Stop(); } catch (Exception ex) { RaiseError(ex); }
        try { Store.Save(force: true); } catch (Exception ex) { RaiseError(ex); }
    }

    /// <summary>
    /// 立即推进 <paramref name="count"/> 个采集周期（默认 5s 一步），每步后跑一次规则评估。
    /// 桌面端「立即刷新一次」与自测都用它，不必等真实定时器。
    /// </summary>
    public void RunTicks(int count = 1, double dtSec = 5)
    {
        for (int i = 0; i < count; i++)
        {
            Simulator.Tick(dtSec);
            Rules.Evaluate();
            Automation.Evaluate();
        }
    }

    /// <summary>运行状态摘要（诊断/关于页面用）。</summary>
    public JsonObject RuntimeSnapshot()
    {
        long now = TimeUtil.Now();
        long startedAt = StartedAt == 0 ? now : StartedAt;
        return new JsonObject
        {
            ["mode"] = "native",
            ["engine"] = "ZhifuWater.Core",
            ["version"] = J.StrOrNull(J.Get(Store.Data, "settings"), "version") ?? "1.0.0",
            ["startedAt"] = TimeUtil.Iso(startedAt),
            ["uptimeSec"] = Math.Max(0, (now - startedAt) / 1000),
            ["dataFile"] = Store.FilePath,
            ["running"] = IsRunning,
            ["historyDays"] = Telemetry.HISTORY_DAYS,
        };
    }

    /// <summary>恢复备份后重建内存索引（点位索引 + 活动告警）。</summary>
    private void RebuildAfterRestore(JsonObject data)
    {
        Rules.RebuildPointIndex();
        Rules.AttachActive();
        try { Store.Save(force: true); }
        catch (Exception ex) { RaiseError(ex); }
    }

    /// <summary>把事件广播给订阅者。</summary>
    private void Publish(JsonObject evt)
    {
        var type = J.Str(evt, "type");
        try { AnyEvent?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
        switch (type)
        {
            case "telemetry":
                try { TelemetryUpdated?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                break;
            case "alarm":
                try { AlarmChanged?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                try { DataChanged?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                break;
            case "command":
                try { CommandChanged?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                try { DataChanged?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                break;
            default:
                try { DataChanged?.Invoke(evt); } catch (Exception ex) { RaiseError(ex); }
                break;
        }
    }

    private void RaiseError(Exception ex) => Error?.Invoke(ex);

    public void Dispose()
    {
        if (_disposed) return;
        Stop();
        _disposed = true;
        try { Store.Save(force: true); } catch { /* 忽略 */ }
        Store.Dispose();
        _timers.Dispose();
    }
}
