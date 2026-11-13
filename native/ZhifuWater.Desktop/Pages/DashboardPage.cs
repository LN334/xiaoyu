using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Ui;

namespace ZhifuWater.Desktop.Pages;

public sealed class DashboardPage : PageBase
{
    private Grid _kpiGrid = null!;
    private StackPanel _chainPanel = null!;
    private LineChart _trend = null!;
    private StackPanel _trendPanel = null!;
    private StackPanel _diagPanel = null!;
    private UiTable _alarmTable = null!;
    private UiTable _workTable = null!;
    private TextBlock _workEmpty = null!;
    private UiTable _deviceTable = null!;
    private TextBlock _healthText = null!;
    private TextBlock _deviceSummary = null!;
    private TextBlock _alarmSummary = null!;
    private TextBlock _workSummary = null!;

    public override string Id => "dashboard";
    public override string Title => "站点驾驶舱";
    public override string Group => "总览";

    public DashboardPage(AppServices services, ZhifuWater.Desktop.Windows.MainWindow host) : base(services, host) { }

    protected override void Build()
    {
        var root = new StackPanel();
        root.Children.Add(BuildHeader());
        root.Children.Add(Gap(14));
        root.Children.Add(BuildMetrics());
        root.Children.Add(Gap(14));

        var columns = new Grid { Margin = new Thickness(0, 0, 0, 0) };
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.62, GridUnitType.Star) });
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
        columns.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var left = new StackPanel();
        left.Children.Add(BuildProcessCard());
        left.Children.Add(Gap());
        left.Children.Add(BuildTrendCard());
        left.Children.Add(Gap());
        left.Children.Add(BuildDiagnosisCard());

        var right = new StackPanel();
        right.Children.Add(BuildAlarmCard());
        right.Children.Add(Gap());
        right.Children.Add(BuildWorkOrderCard());
        right.Children.Add(Gap());
        right.Children.Add(BuildDeviceCard());

        Grid.SetColumn(left, 0);
        Grid.SetColumn(right, 2);
        columns.Children.Add(left);
        columns.Children.Add(right);
        root.Children.Add(columns);

        Install(Kit.Scroll(root));
    }

    private UIElement BuildHeader()
    {
        var site = Svc.Data.Site;
        var text = new StackPanel();
        text.Children.Add(Kit.Row(10,
            Kit.T(site.Name, 19, Pal.Ink, bold: true),
            Kit.Badge(Pal.SiteStatusText(site.Status), "good"),
            Kit.T(site.Id, 11, Pal.Muted2)));
        text.Children.Add(Kit.T($"{site.Process} · 设计规模 {site.Capacity} · 投运 {site.CommissionedAt} · {site.Address}",
            11.5, Pal.Muted, wrap: TextWrapping.Wrap));

        var health = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right };
        _healthText = Kit.T("数据健康检查中…", 11.5, Pal.Ink2, bold: true);
        health.Children.Add(_healthText);

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(text, 0);
        Grid.SetColumn(health, 1);
        grid.Children.Add(text);
        grid.Children.Add(health);
        return grid;
    }

    private UIElement BuildMetrics()
    {
        _kpiGrid = new Grid();
        for (var i = 0; i < 4; i++)
            _kpiGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        _kpiGrid.RowDefinitions.Add(new RowDefinition());
        _kpiGrid.RowDefinitions.Add(new RowDefinition());
        return new Border
        {
            Style = Kit.St("Card"),
            Padding = new Thickness(0),
            Child = _kpiGrid,
        };
    }

    private static Border Gap(double height = 10) => new() { Height = height };
    private readonly System.Collections.Generic.HashSet<string> _trendPicked = new() { "RAW.LVL" };
    private readonly List<(string Code, Button Btn, string Label, string Hex)> _trendChips = new();
    private static readonly (string Code, string Label, string Hex)[] TrendDefs =
    {
        ("RAW.LVL", "进水调节池液位", "#0E7C74"),
        ("BAF.DO", "预氧化溶解氧", "#1C6B45"),
        ("SULFUR.PH", "自养脱氮 pH", "#8A5A12"),
        ("FLOW.IN", "进水流量", "#2A5F8A"),
    };

    private UIElement BuildProcessCard()
    {
        _chainPanel = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        var scroll = new ScrollViewer
        {
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
            Content = _chainPanel,
        };
        return Kit.Card("11 单元工艺链", scroll, null, null, new Thickness(10, 9, 10, 10));
    }

    private UIElement BuildTrendCard()
    {
        _trend = new LineChart { Height = 190, YUnit = "", NormalizePerSeries = false, ShowYLabels = true, EnablePan = true, ViewWindow = TimeSpan.FromHours(24), ToolTip = "左右拖动查看历史 · 滚轮缩放 · 双击回到最新" };
        _trendPanel = new StackPanel();
        _trendPanel.Children.Add(_trend);
        var chips = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        foreach (var (code, label, hex) in TrendDefs)
        {
            var key = code;
            var button = Kit.Btn(label, () => ToggleTrend(key), small: true);
            button.Margin = new Thickness(0, 0, 5, 0);
            button.Tag = hex;
            button.ToolTip = "显示 / 隐藏 " + label;
            _trendChips.Add((code, button, label, hex));
            chips.Children.Add(button);
        }
        var trendBody = new Border { Padding = new Thickness(0, 0, 12, 0), Child = _trendPanel };
        return Kit.Card("24 小时关键趋势", trendBody, chips, null, new Thickness(8, 4, 8, 4));
    }

    private void ToggleTrend(string code)
    {
        if (_trendPicked.Contains(code))
        {
            if (_trendPicked.Count == 1) return; // 至少保留一条主线
            _trendPicked.Remove(code);
        }
        else
        {
            _trendPicked.Add(code);
        }
        RefreshTrend();
    }

    private void RefreshTrend()
    {
        var codes = TrendDefs.Select(d => d.Code).Where(_trendPicked.Contains).ToArray();
        _trendPanel.Children.Clear();
        if (codes.Length <= 1)
        {
            // 单指标：一张大图，带 Y 轴刻度
            var single = Svc.Data.Trend(codes, 24);
            _trend.Series.Clear();
            _trend.Series.AddRange(single);
            _trend.NormalizePerSeries = false;
            _trend.YUnit = single.Count == 1 ? single[0].Unit : "";
            _trend.Height = 190;
            _trendPanel.Children.Add(_trend);
        }
        else
        {
            // 多指标：各自一张小图，各带自己的刻度与单位，高度不可比的问题就不存在了
            foreach (var code in codes)
            {
                var one = Svc.Data.Trend(new[] { code }, 24);
                if (one.Count == 0) continue;
                var s = one[0];
                var chart = new LineChart
                {
                    Height = 84,
                    NormalizePerSeries = false,
                    ShowLegend = false,
                    ShowYLabels = true,
                    YUnit = s.Unit,
                    ViewWindow = TimeSpan.FromHours(24),
                    Margin = new Thickness(0, 0, 0, 2),
                };
                chart.Series.Add(s);
                _trendPanel.Children.Add(chart);
            }
        }
        foreach (var (code, btn, _, hex) in _trendChips)
        {
            var active = _trendPicked.Contains(code);
            btn.Background = active ? Pal.AccentSoft : Pal.Surface;
            btn.BorderBrush = active ? Pal.FromHex(hex) : Pal.Line;
            btn.Foreground = active ? Pal.FromHex(hex) : Pal.Muted;
        }
    }

    private UIElement BuildDiagnosisCard()
    {
        _diagPanel = new StackPanel();
        return Kit.Card("诊断摘要", _diagPanel,
            Kit.Link("全部诊断", () => Host.ShowPage("diagnosis")), null, new Thickness(10, 8, 10, 10));
    }

    private UIElement BuildAlarmCard()
    {
        _alarmTable = Table(new[] { "时间", "级别", "告警", "状态" }, new double[] { 100, 58, 0, 62 },
            row => Host.ShowPage("alarms"));
        _alarmSummary = Kit.T("", 10, Pal.Muted2);
        return Kit.Card("未关闭告警", _alarmTable,
            Kit.Row(8, _alarmSummary, Kit.Link("告警管理", () => Host.ShowPage("alarms"))),
            null, new Thickness(8, 6, 8, 8));
    }

    private UIElement BuildWorkOrderCard()
    {
        _workTable = Table(new[] { "工单", "单元", "类型", "状态" }, new double[] { 0, 96, 52, 62 },
            row => Host.ShowPage("workorders"));
        _workSummary = Kit.T("", 10, Pal.Muted2);
        _workEmpty = Kit.T("暂无待处理工单", 12, Pal.Muted2);
        _workEmpty.HorizontalAlignment = HorizontalAlignment.Center;
        _workEmpty.Margin = new Thickness(0, 18, 0, 18);
        _workEmpty.Visibility = Visibility.Collapsed;
        var host = new Grid();
        host.Children.Add(_workTable);
        host.Children.Add(_workEmpty);
        return Kit.Card("待处理工单", host,
            Kit.Row(8, _workSummary, Kit.Link("工单管理", () => Host.ShowPage("workorders"))),
            null, new Thickness(8, 6, 8, 8));
    }

    private UIElement BuildDeviceCard()
    {
        _deviceTable = Table(new[] { "设备", "单元", "健康", "状态" }, new double[] { 0, 92, 78, 58 },
            row => Host.ShowPage("devices", row.Key));
        _deviceSummary = Kit.T("", 10, Pal.Muted2);
        return Kit.Card("设备健康", _deviceTable,
            Kit.Row(8, _deviceSummary, Kit.Link("设备台账", () => Host.ShowPage("devices"))),
            null, new Thickness(8, 6, 8, 8));
    }

    protected override void RefreshData()
    {
        _kpiGrid.Children.Clear();
        var kpis = Svc.Data.DashboardKpis();
        for (var i = 0; i < kpis.Count; i++)
        {
            var row = i / 4;
            var col = i % 4;
            var cell = Kit.KpiCell(kpis[i]);
            var box = new Border
            {
                BorderBrush = Pal.Line,
                BorderThickness = new Thickness(col > 0 ? 1 : 0, row > 0 ? 1 : 0, 0, 0),
                Child = cell,
            };
            Grid.SetRow(box, Math.Min(row, 1));
            Grid.SetColumn(box, col);
            _kpiGrid.Children.Add(box);
        }

        var health = Svc.Data.DataHealth();
        var rate = health.PointsTotal == 0 ? 0 : health.PointsOnline * 100 / health.PointsTotal;
        _healthText.Text = $"数据健康 · 点位在线 {health.PointsOnline}/{health.PointsTotal}（{rate}%）";

        var snapshots = Svc.Data.UnitSnapshots().ToDictionary(s => s.Unit.Code, s => s);
        _chainPanel.Children.Clear();
        var units = Svc.Data.Units;
        for (var i = 0; i < units.Count; i++)
        {
            var unit = units[i];
            snapshots.TryGetValue(unit.Code, out var snap);
            var state = snap?.State ?? "no-instrument";
            var box = new Border
            {
                Width = 58,
                MinHeight = 64,
                Padding = new Thickness(3, 4, 3, 4),
                Background = Pal.Surface2,
                BorderBrush = Pal.LineSoft,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(2),
                Cursor = System.Windows.Input.Cursors.Hand,
                ToolTip = unit.Name + " · " + unit.Note + (snap?.Readings.FirstOrDefault() is { } r ? " · " + r.Text : ""),
            };
            var stack = new StackPanel();
            stack.Children.Add(Kit.T(string.IsNullOrEmpty(unit.Short) ? unit.Name : unit.Short, 10, Pal.Ink2, bold: true, wrap: TextWrapping.Wrap));
            static int Rank(string code)
            {
                if (code.EndsWith(".LEVEL")) return 0;
                if (code.EndsWith(".PH")) return 1;
                if (code.EndsWith(".DO")) return 2;
                if (code.Contains("FLOW")) return 3;
                return 4;
            }
            var first = snap?.Readings
                            .Where(r => r.Value is double && !string.IsNullOrEmpty(r.Point.Unit))
                            .OrderBy(r => Rank(r.Point.Code))
                            .FirstOrDefault()
                        ?? snap?.Readings.FirstOrDefault();
            stack.Children.Add(Kit.T(first is null ? "—" : (first.Value is double dv ? Fmt(dv, Math.Max(0, first.Point.Digits)) : first.Text), 9, Pal.Muted));
            var stateRow = Kit.Row(3,
                new Border { Width = 5, Height = 5, CornerRadius = new CornerRadius(2.5), Background = Pal.ToneFg(Pal.UnitStateTone(state)) },
                Kit.T(Pal.UnitStateText(state), 9, Pal.ToneFg(Pal.UnitStateTone(state))));
            stateRow.Margin = new Thickness(0, 2, 0, 0);
            stack.Children.Add(stateRow);
            box.Child = stack;
            box.Margin = new Thickness(0, 0, 3, 0);
            box.MouseLeftButtonUp += (_, _) => Host.ShowPage("process", unit.Code);
            _chainPanel.Children.Add(box);
        }

        RefreshTrend();

        _diagPanel.Children.Clear();
        var diagAll = Svc.Data.Diagnoses.Where(d => d.Level != "ok").ToList();
        var diagnoses = diagAll.Take(3).ToList();
        if (diagnoses.Count == 0) diagnoses = Svc.Data.Diagnoses.Take(2).ToList();
        foreach (var d in diagnoses)
        {
            _diagPanel.Children.Add(BuildDiagnosisRow(d));
        }
        // 家页只放最要紧的 3 条，其余条数明确写出来，避免「诊断 4 项但首页只看到 3 条」的错觉
        if (diagAll.Count > diagnoses.Count)
            _diagPanel.Children.Add(Kit.Link($"还有 {diagAll.Count - diagnoses.Count} 条，查看全部诊断",
                () => Host.ShowPage("diagnosis")));

        var openAlarms = Svc.Data.Alarms("all").Where(a => a.Status is "active" or "acknowledged").OrderByDescending(a => a.At).ToList();
        Bind(_alarmTable, openAlarms.Take(6).Select(a => Kit.R(
            Kit.C(Kit.FormatTime(a.At), "muted"),
            Kit.C(Pal.AlarmLevelText(a.Level), Pal.AlarmLevelTone(a.Level)),
            Kit.C(a.Title, "normal"),
            Kit.C(Pal.AlarmStatusText(a.Status), Pal.AlarmStatusTone(a.Status)))));
        _alarmSummary.Text = $"未关闭 {openAlarms.Count} 条 · 未确认 {Svc.Data.Alarms("active").Count} 条";

        var works = Svc.Data.WorkOrders("all").Where(w => w.Status is "pending" or "accepted" or "processing").OrderByDescending(w => w.CreatedAt).ToList();
        Bind(_workTable, works.Take(6).Select(w => Kit.R(
            Kit.C(w.Title, "normal"),
            Kit.C(w.UnitName, "muted"),
            Kit.C(Pal.WorkOrderTypeText(w.Type), "normal"),
            Kit.C(Pal.WorkOrderStatusText(w.Status), Pal.WorkOrderStatusTone(w.Status)))));
        _workSummary.Text = $"待处理 {works.Count} 单";
        _workTable.Visibility = works.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
        _workEmpty.Visibility = works.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var devices = Svc.Data.Devices;
        var risky = devices.Where(d => !d.Online || d.Health < 85).OrderBy(d => d.Health).ToList();
        var ranked = devices.OrderBy(d => d.Online ? 1 : 0).ThenBy(d => d.Health).Take(5).ToList();
        Bind(_deviceTable, ranked.Select(d => Kit.R(d.Id,
            Kit.C(d.Code + " " + d.Name, "normal"),
            Kit.C(d.UnitName, "muted"),
            Kit.C(d.Health + " · " + d.HealthText, d.Health >= 85 ? "good" : d.Health >= 60 ? "warn" : "bad"),
            Kit.C(d.Online ? "在线" : "离线", d.Online ? "good" : "bad"))));
        _deviceSummary.Text = $"在线 {devices.Count(d => d.Online)}/{devices.Count} · 关注 {risky.Count} 台";
    }

    private UIElement BuildDiagnosisRow(DiagnosisInfo d)
    {
        var tone = d.Level switch { "ok" => "good", "warning" => "bad", _ => "warn" };
        var border = new Border
        {
            Background = Pal.ToneBg(tone),
            BorderBrush = Pal.LineSoft,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(9, 6, 9, 6),
        };
        var stack = new StackPanel();
        stack.Children.Add(Kit.Row(8,
            Kit.Badge(d.Level == "ok" ? "正常" : d.Level == "warning" ? "预警" : "关注", tone),
            Kit.T(d.Title, 12, Pal.Ink2, bold: true),
            Kit.T(d.UnitName, 10, Pal.Muted2)));
        stack.Children.Add(Kit.T(d.Suggestion, 11, Pal.Muted, wrap: TextWrapping.Wrap));
        border.Child = stack;
        return border;
    }
}
