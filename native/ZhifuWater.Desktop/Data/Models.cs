using System;
using System.Collections.Generic;

namespace ZhifuWater.Desktop.Data;

// =============================================================================
// 桌面端视图模型（与 Core 的 JSON 结构解耦：页面只认这些类型）
// 字段与 native/CONTRACT.md / web/js/pages 对齐，接线时由 CoreDesktopData 做映射。
// =============================================================================

/// <summary>操作结果（写操作统一返回）。</summary>
public readonly record struct OpResult(bool Ok, string Message)
{
    public static OpResult Fail(string msg) => new(false, msg);
    public static OpResult Done(string msg) => new(true, msg);
}

public sealed class UserInfo
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string RoleName { get; set; } = "";
    public string Title { get; set; } = "";
    public string Phone { get; set; } = "";
    public List<string> Perms { get; set; } = new();
    public List<string> SiteIds { get; set; } = new();
    public string Status { get; set; } = "active";
    public string LastLoginAt { get; set; } = "";

    public bool Can(string perm) => Perms.Contains(perm);
    public string Initial => string.IsNullOrEmpty(Name) ? "?" : Name.Substring(0, 1);
}

public sealed class SiteInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string ShortName { get; set; } = "";
    public string Region { get; set; } = "";
    public string Area { get; set; } = "";
    public string Address { get; set; } = "";
    public string Process { get; set; } = "";
    public string Capacity { get; set; } = "";
    public string DeviceRef { get; set; } = "";
    public string CommissionedAt { get; set; } = "";
    public string Contact { get; set; } = "";
    public string Status { get; set; } = "online";
    public string Note { get; set; } = "";
}

public sealed class UnitInfo
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Short { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Note { get; set; } = "";
}

public sealed class PointDef
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Type { get; set; } = "measure";
    public string Range { get; set; } = "";
    public string Accuracy { get; set; } = "";
    public int IntervalSec { get; set; } = 10;
    public string Writable { get; set; } = "read";
    public string Provenance { get; set; } = "gateway";
    public string Desc { get; set; } = "";
    public int Digits { get; set; } = 2;
}

public sealed class Reading
{
    public PointDef Point { get; set; } = new();
    public double? Value { get; set; }
    public string Text { get; set; } = "—";
    public string Quality { get; set; } = "good";
    public long T { get; set; }
    public string Source { get; set; } = "gateway";
    public string UnitCode { get; set; } = "";
    public bool Stale { get; set; }

    public string Code => Point.Code;
    public string Name => Point.Name;
    public string Unit => Point.Unit;
}

public sealed class UnitSnapshot
{
    public UnitInfo Unit { get; set; } = new();
    public string State { get; set; } = "normal"; // normal/attention/alarm/offline/no-instrument
    public string StateText { get; set; } = "正常";
    public List<Reading> Readings { get; set; } = new();
    public int DeviceCount { get; set; }
    public int OnlineDevices { get; set; }
    public string BwPhase { get; set; } = "";
    public string BwText { get; set; } = "";
    public string BwRemain { get; set; } = "";
    public string Note { get; set; } = "";
}

public sealed class AlarmInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Level { get; set; } = "minor";
    public string Title { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Status { get; set; } = "active"; // active/acknowledged/resolved/closed
    public double? Value { get; set; }
    public string Threshold { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public string UnitName { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string RuleName { get; set; } = "";
    public long At { get; set; }
    public long? AckAt { get; set; }
    public long? ResolvedAt { get; set; }
    public string AckBy { get; set; } = "";
    public string Note { get; set; } = "";
    /// <summary>报警所在点位编码（如 PAC.LEVEL），用于把告警精确落到单台设备。</summary>
    public string PointCode { get; set; } = "";
    public List<TimelineEntry> Timeline { get; set; } = new();
}

public sealed class TimelineEntry
{
    public long At { get; set; }
    public string Actor { get; set; } = "";
    public string Text { get; set; } = "";
}

public sealed class WorkOrderInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Type { get; set; } = "repair";
    public string Priority { get; set; } = "normal";
    public string Status { get; set; } = "pending";
    public string UnitCode { get; set; } = "";
    public string UnitName { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public string Assignee { get; set; } = "";
    public string Creator { get; set; } = "";
    public string Source { get; set; } = "";
    public string AlarmId { get; set; } = "";
    public long CreatedAt { get; set; }
    public long? DueAt { get; set; }
    public long? DoneAt { get; set; }
    public string Desc { get; set; } = "";
    public string Result { get; set; } = "";
    public List<TimelineEntry> Timeline { get; set; } = new();
}

public sealed class DeviceInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public string UnitName { get; set; } = "";
    public string Type { get; set; } = "";
    public string Model { get; set; } = "";
    public string Spec { get; set; } = "";
    public string Status { get; set; } = "";
    public bool Online { get; set; }
    public double RuntimeHours { get; set; }
    public int Starts { get; set; }
    public int MaintCycleDays { get; set; } = 90;
    public string LastMaintAt { get; set; } = "";
    public string WarrantyUntil { get; set; } = "";
    public string PlAddress { get; set; } = "";
    public string InstallDate { get; set; } = "";
    public int Health { get; set; } = 100;
    public string HealthText => Health >= 85 ? "良好" : Health >= 60 ? "关注" : "异常";
}

public sealed class ParamInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Group { get; set; } = "";
    public double Current { get; set; }
    public double Min { get; set; }
    public double Max { get; set; }
    public double Step { get; set; } = 1;
    public string Unit { get; set; } = "";
    public string WriteMode { get; set; } = "cloud";
    public int Version { get; set; } = 1;
    public string UpdatedAt { get; set; } = "";
    public string UpdatedBy { get; set; } = "";
    public string Desc { get; set; } = "";
    public List<ParamVersion> Versions { get; set; } = new();
}

public sealed class ParamVersion
{
    public int Version { get; set; }
    public double Value { get; set; }
    public string At { get; set; } = "";
    public string By { get; set; } = "";
    public string Reason { get; set; } = "";
}

public sealed class ParamRequest
{
    public string Id { get; set; } = "";
    public string ParamId { get; set; } = "";
    public string ParamName { get; set; } = "";
    public double Value { get; set; }
    public string Unit { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Applicant { get; set; } = "";
    public long At { get; set; }
    public string Status { get; set; } = "pending";
}

public sealed class LabRecord
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string SamplePoint { get; set; } = "";
    public string SamplePointName { get; set; } = "";
    public long SampledAt { get; set; }
    public string Status { get; set; } = "pending_review";
    public Dictionary<string, double?> Metrics { get; set; } = new();
    public string Remark { get; set; } = "";
    public string Recorder { get; set; } = "";
    public string Reviewer { get; set; } = "";
}

public sealed class LabMetricDef
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "mg/L";
    public int Digits { get; set; } = 2;
}

public sealed class LabStats
{
    public List<TrendSeries> Series { get; set; } = new();
    public Dictionary<string, double?> LatestByPoint { get; set; } = new();
    public Dictionary<string, double?> RemovalRates { get; set; } = new();
    public int Compliance { get; set; } = 100;
    public int Total { get; set; }
    public int Reviewed { get; set; }
}

public sealed class DiagnosisInfo
{
    public string Id { get; set; } = "";
    public string Level { get; set; } = "attention"; // ok/attention/warning
    public string Title { get; set; } = "";
    public string Phenomenon { get; set; } = "";
    public List<string> Causes { get; set; } = new();
    public List<string> Checks { get; set; } = new();
    public string Boundary { get; set; } = "";
    public string Basis { get; set; } = "";
    public string Suggestion { get; set; } = "";
    public string UnitName { get; set; } = "";
    public long At { get; set; }
}

public sealed class ReportInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Type { get; set; } = "daily";
    public string Title { get; set; } = "";
    public string Status { get; set; } = "ready";
    public long CreatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
    public string RangeText { get; set; } = "";
    public List<ReportSection> Sections { get; set; } = new();
}

public sealed class ReportSection
{
    public string Title { get; set; } = "";
    public List<string> Columns { get; set; } = new();
    public List<List<string>> Cells { get; set; } = new();
    public List<KeyValuePair<string, string>> Rows { get; set; } = new();
}

public sealed class ActionInfo
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Device { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public bool NeedsConfirm { get; set; } = true;
    public string Risk { get; set; } = "normal";
    public List<string> Constraints { get; set; } = new();
    public string Desc { get; set; } = "";
    public string Interlock { get; set; } = "";
    public string Detail { get; set; } = "";
}

public sealed class CommandRecord
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Action { get; set; } = "";
    public string Label { get; set; } = "";
    public string Status { get; set; } = "pending_confirm";
    public string Reason { get; set; } = "";
    public string By { get; set; } = "";
    public long At { get; set; }
    public string Device { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public string FailReason { get; set; } = "";
}

public sealed class AlarmRuleInfo
{
    public string Id { get; set; } = "";
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string PointCode { get; set; } = "";
    public string Level { get; set; } = "minor";
    public string Condition { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public string Desc { get; set; } = "";
}

public sealed class NotificationInfo
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public long At { get; set; }
    public bool Read { get; set; }
    public string Kind { get; set; } = "system";
    public string Link { get; set; } = "";
}

public sealed class UserRowInfo
{
    public UserInfo User { get; set; } = new();
    public bool IsActive => User.Status == "active";
}

public sealed class RoleInfo
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    public List<string> Perms { get; set; } = new();
    public string Sites { get; set; } = "assigned";
    public int UserCount { get; set; }
}

public sealed class AuditInfo
{
    public string Id { get; set; } = "";
    public long At { get; set; }
    public string Actor { get; set; } = "";
    public string Action { get; set; } = "";
    public string TargetType { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Result { get; set; } = "success";
    public string Ip { get; set; } = "";
}

public sealed class ChannelInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public bool Enabled { get; set; }
    public string Target { get; set; } = "";
    public string LastTestAt { get; set; } = "";
    public string LastResult { get; set; } = "";
}

public sealed class BackupInfo
{
    public string Id { get; set; } = "";
    public long At { get; set; }
    public string Size { get; set; } = "";
    public string By { get; set; } = "";
    public string Note { get; set; } = "";
    public bool IsAuto { get; set; }
}

public sealed class InspectionPlanInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Cycle { get; set; } = "";
    public int ItemCount { get; set; }
    public string Desc { get; set; } = "";
}

public sealed class InspectionItemInput
{
    public string Key { get; set; } = "";
    public string Result { get; set; } = "ok";
    public string Note { get; set; } = "";
}

public sealed class InspectionInfo
{
    public string Id { get; set; } = "";
    public string SiteId { get; set; } = "";
    public string Plan { get; set; } = "";
    public string Status { get; set; } = "pending";
    public string Assignee { get; set; } = "";
    public long DueAt { get; set; }
    public long? DoneAt { get; set; }
    public List<InspectionItem> Items { get; set; } = new();
    public string Summary { get; set; } = "";
    public int Abnormal { get; set; }
}

public sealed class InspectionItem
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Result { get; set; } = "ok";
    public string Note { get; set; } = "";
}

public sealed class MetricPoint
{
    public long T { get; set; }
    public double V { get; set; }
}

public sealed class TrendSeries
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Color { get; set; } = "#0E7C74";
    public List<MetricPoint> Points { get; set; } = new();
}

public sealed class KpiInfo
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Value { get; set; } = "—";
    public string Unit { get; set; } = "";
    public string Delta { get; set; } = "";
    public string Tone { get; set; } = "normal"; // normal/good/warn/bad
    public string Hint { get; set; } = "";
    public string Source { get; set; } = "gateway";
}

public sealed class AlarmStats
{
    public List<KeyValuePair<string, int>> ByDay { get; set; } = new();
    public List<KeyValuePair<string, int>> ByLevel { get; set; } = new();
    public List<KeyValuePair<string, int>> ByUnit { get; set; } = new();
    public Dictionary<string, int> Counts { get; set; } = new();
    public int MttaMin { get; set; }
    public int MttrMin { get; set; }
    public int AckRate { get; set; }
}

public sealed class AnalysisData
{
    public List<KpiInfo> Kpis { get; set; } = new();
    public List<TrendSeries> Daily { get; set; } = new();
    public List<KeyValuePair<string, double>> CostBreakdown { get; set; } = new();
    public List<KeyValuePair<string, int>> AlarmDaily { get; set; } = new();
    public List<UnitEfficiency> Units { get; set; } = new();
    public List<string> Notes { get; set; } = new();
}

public sealed class UnitEfficiency
{
    public string UnitCode { get; set; } = "";
    public string UnitName { get; set; } = "";
    public string Readings { get; set; } = "";
    public int Alarms { get; set; }
    public int Health { get; set; }
    public string Note { get; set; } = "";
}
public sealed class DataHealthInfo
{
    public string Gateway { get; set; } = "connected";
    public int PointsTotal { get; set; }
    public int PointsOnline { get; set; }
    public long LatestAt { get; set; }
    public string Notice { get; set; } = "";
}

/// <summary>自动化规则（桌面端展示用）。</summary>
public sealed class AutoRuleInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Group { get; set; } = "";
    public string UnitCode { get; set; } = "";
    public string Action { get; set; } = "command"; // command / workorder
    public string ActionName { get; set; } = "";
    public string Conditions { get; set; } = "";
    public string Reason { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public int HoldSec { get; set; }
    public int CooldownSec { get; set; }
    public int MaxPerDay { get; set; }
    public int Runs { get; set; }
    public int TodayRuns { get; set; }
    public long LastAt { get; set; }
    public string LastResult { get; set; } = "";
}

/// <summary>自动化执行事件。</summary>
public sealed class AutoEventInfo
{
    public string Id { get; set; } = "";
    public string RuleId { get; set; } = "";
    public string RuleName { get; set; } = "";
    public string Action { get; set; } = "command";
    public string Result { get; set; } = "";
    public long At { get; set; }
}

/// <summary>自动化总览。</summary>
public sealed class AutoSnapshot
{
    public bool Enabled { get; set; } = true;
    public List<AutoRuleInfo> Rules { get; set; } = new();
    public List<AutoEventInfo> Events { get; set; } = new();
    public int TodayRuns { get; set; }
    public int AlarmRuleTotal { get; set; }
    public int AlarmRuleEnabled { get; set; }
    public long LastAt { get; set; }
}
