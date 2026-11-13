using System;
using System.Collections.Generic;

namespace ZhifuWater.Desktop.Data;

/// <summary>
/// 桌面端数据门面。页面只依赖本接口，不直接接触 JSON / HTTP / Core 内部类型。
///
/// 接线说明（native-core 契约就绪后）：
///   · 新建 <c>CoreDesktopData : IDesktopData</c>，构造参数为 <c>ZhifuWater.Core.CoreServices</c>；
///   · 每个查询方法把 CoreServices 返回的 JsonNode（JsonObject/JsonArray）映射成本文件的强类型模型；
///   · 写操作捕获 <c>CoreException</c>，转成 <see cref="OpResult"/>；
///   · 在 <c>AppServices.Create()</c> 一处切换实现即可，页面零改动。
/// 当前实现：<see cref="DemoDesktopData"/>（本地演示引擎，行为与 Web 演示版一致）。
/// </summary>
public interface IDesktopData
{
    /// <summary>数据来源说明，显示在每页页脚。</summary>
    string BackendName { get; }

    /// <summary>最近一次成功取数时间（本地时钟）。</summary>
    DateTime LastUpdated { get; }

    /// <summary>数据变化通知（3 秒节拍 / 写操作之后）。</summary>
    event EventHandler? DataChanged;

    string CurrentSiteId { get; }
    IReadOnlyList<SiteInfo> Sites { get; }
    SiteInfo Site { get; }
    void SetSite(string siteId);

    // ---------- 认证与会话 ----------
    OpResult Login(string username, string password);
    UserInfo? CurrentUser { get; }
    void Logout();
    OpResult ChangePassword(string oldPassword, string newPassword);

    // ---------- 3 秒节拍 ----------
    void Tick();

    // ---------- 单元 / 点位 / 读数 ----------
    IReadOnlyList<UnitInfo> Units { get; }
    IReadOnlyList<UnitSnapshot> UnitSnapshots();
    bool RawRefill();
    IReadOnlyList<PointDef> Points { get; }
    IReadOnlyList<Reading> Readings { get; }
    Reading? ReadingOf(string code);
    IReadOnlyList<TrendSeries> Trend(IEnumerable<string> codes, int hours);
    IReadOnlyList<string> UnitWarnings(string unitCode);

    // ---------- 驾驶舱 ----------
    IReadOnlyList<KpiInfo> DashboardKpis();
    DataHealthInfo DataHealth();
    string Notice();

    // ---------- 告警 ----------
    IReadOnlyList<AlarmInfo> Alarms(string status = "all", string level = "all", string keyword = "");

    /// <summary>点位编码对应的设备 Id；取不到时返回空串（调用方回退到单元级判断）。</summary>
    string DeviceIdOfPoint(string pointCode);
    AlarmStats AlarmStatistics(int days);
    OpResult AckAlarm(string id, string note);
    OpResult ResolveAlarm(string id, string note);
    IReadOnlyList<AlarmRuleInfo> AlarmRules { get; }
    OpResult ToggleAlarmRule(string id);

    // ---------- 设备控制 ----------
    IReadOnlyList<ActionInfo> Actions { get; }
    IReadOnlyList<CommandRecord> Commands(int limit = 30);
    OpResult ExecuteAction(string key, string reason);
    OpResult ConfirmCommand(string id);
    OpResult CancelCommand(string id);

    // ---------- 参数设置 ----------
    IReadOnlyList<ParamInfo> Params { get; }
    IReadOnlyList<ParamRequest> ParamRequests { get; }
    OpResult SetParam(string id, double value, string reason);
    OpResult RollbackParam(string id, int version, string reason);
    OpResult ApproveParamRequest(string id, bool approve);

    // ---------- 水质化验 ----------
    IReadOnlyList<LabMetricDef> LabMetrics { get; }
    IReadOnlyList<LabRecord> Labs { get; }
    LabStats LabStatistics(int days);
    OpResult ReviewLab(string id, bool approve);
    OpResult CreateLab(string samplePoint, IReadOnlyDictionary<string, double> metrics, string? method = null);

    // ---------- 诊断 / 分析 / 报表 ----------
    IReadOnlyList<DiagnosisInfo> Diagnoses { get; }
    AnalysisData Analysis(int days);
    IReadOnlyList<ReportInfo> Reports { get; }
    OpResult GenerateReport(string type, string? from = null, string? to = null, string? title = null);
    OpResult ExportReportCsv(string id, string filePath);

    // ---------- 工单 / 巡检 / 设备 ----------
    IReadOnlyList<WorkOrderInfo> WorkOrders(string status = "all");
    OpResult AdvanceWorkOrder(string id, string action, string note);
    OpResult AssignWorkOrder(string id, string userId, string note);
    OpResult CreateWorkOrder(string title, string type, string priority, string unitCode, string? assigneeId, string description, string? alarmId = null);
    IReadOnlyList<InspectionInfo> Inspections { get; }
    OpResult GenerateInspection();
    OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> items);
    IReadOnlyList<InspectionPlanInfo> InspectionPlans { get; }
    OpResult CreateInspection(string planId, string? assigneeId, DateTime? dueAt);
    IReadOnlyList<DeviceInfo> Devices { get; }
    OpResult RegisterMaintenance(string id, string note);

    // ---------- 系统管理 ----------
    IReadOnlyList<UserRowInfo> Users { get; }
    IReadOnlyList<RoleInfo> Roles { get; }
    IReadOnlyList<KeyValuePair<string, string>> Settings { get; }
    OpResult SaveSetting(string key, string value);
    IReadOnlyList<ChannelInfo> Channels { get; }
    OpResult ToggleChannel(string id);
    OpResult TestChannel(string id);
    IReadOnlyList<AuditInfo> AuditLogs(int limit = 200);
    IReadOnlyList<BackupInfo> Backups { get; }
    OpResult CreateBackup();
    OpResult RestoreBackup(string id);
    OpResult AddUser(string username, string name, string role, string phone);
    OpResult ResetPassword(string userId);
    OpResult SetUserStatus(string userId, bool active);

    // ---------- 自动控制 ----------
    AutoSnapshot Automation();
    OpResult SetAutomationEnabled(bool enabled);
    OpResult ToggleAutomationRule(string id, bool enabled);
    OpResult RunAutomationRule(string id);

    IReadOnlyList<NotificationInfo> Notifications { get; }
    int UnreadNotifications { get; }
    void MarkNotificationsRead();
    void MarkNotificationRead(string id);
}
