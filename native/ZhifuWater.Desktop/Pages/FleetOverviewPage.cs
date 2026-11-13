using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Ui;

namespace ZhifuWater.Desktop.Pages;

/// <summary>多站监管首页。当前桌面版只展示本机模拟数据，不能代表现场网关已接入。</summary>
public sealed class FleetOverviewPage : PageBase
{
    private sealed class SiteBrief
    {
        public SiteInfo Site { get; init; } = new();
        public string Status { get; init; } = "unknown";
        public string StatusText { get; init; } = "暂无数据";
        public int OnlinePoints { get; init; }
        public int TotalPoints { get; init; }
        public int OpenAlarms { get; init; }
        public int OpenWorkOrders { get; init; }
        public long LatestAt { get; init; }
    }

    private Grid _kpiGrid = null!;
    private WrapPanel _siteCards = null!;
    private TextBlock _summary = null!;

    public override string Id => "fleet";
    public override string Title => "多站总览";
    public override string Group => "监管";
    protected override string SourceLabel => "多站运行监管 · 本机模拟数据";
    protected override string ScopeLabel => $"授权站点：{Svc.Data.CurrentUser?.SiteIds.Count ?? 0} 座";

    public FleetOverviewPage(AppServices services, ZhifuWater.Desktop.Windows.MainWindow host) : base(services, host) { }

    protected override void Build()
    {
        var root = new StackPanel();
        root.Children.Add(BuildHeader());
        root.Children.Add(new Border { Height = 12 });

        _kpiGrid = new Grid();
        for (var i = 0; i < 4; i++) _kpiGrid.ColumnDefinitions.Add(new ColumnDefinition());
        root.Children.Add(Kit.Panel(_kpiGrid));
        root.Children.Add(new Border { Height = 12 });

        _summary = Kit.T("站点状态汇总", 12, Pal.Muted);
        _siteCards = new WrapPanel { Orientation = Orientation.Horizontal };
        root.Children.Add(Kit.Card("授权站点", _siteCards, _summary,
            "选择站点进入站点驾驶舱；PLC 本地控制不受平台连接状态影响。", new Thickness(10)));
        Install(Kit.Scroll(root));
    }

    private static UIElement BuildHeader()
    {
        var title = Kit.Col(4,
            Kit.T("多站运行监管", 20, Pal.Ink, bold: true),
            Kit.T("汇总查看站点数据新鲜度、在线点位、未关闭告警和待处理工单。", 11.5, Pal.Muted, wrap: TextWrapping.Wrap));
        var badge = Kit.Badge("本机模拟 · 未连接现场网关", "warn");
        var grid = new Grid { Margin = new Thickness(0, 2, 0, 0) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(title, 0);
        Grid.SetColumn(badge, 1);
        grid.Children.Add(title);
        grid.Children.Add(badge);
        return grid;
    }

    protected override void RefreshData()
    {
        var previousSite = Svc.Data.CurrentSiteId;
        var allowedIds = Svc.Data.CurrentUser?.SiteIds.ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>();
        var sites = Svc.Sites.Where(s => allowedIds.Contains(s.Id)).ToList();
        var briefs = new List<SiteBrief>();
        try
        {
            foreach (var site in sites)
            {
                Svc.Data.SetSite(site.Id);
                if (Svc.Data.CurrentSiteId != site.Id) continue;
                var health = Svc.Data.DataHealth();
                var age = health.LatestAt <= 0 ? (long?)null : Math.Max(0, (DateTimeOffset.Now.ToUnixTimeMilliseconds() - health.LatestAt) / 1000);
                var openAlarms = Svc.Data.Alarms("all").Count(a => a.Status is "active" or "acknowledged");
                var openOrders = Svc.Data.WorkOrders("all").Count(w => w.Status is "pending" or "accepted" or "processing");
                briefs.Add(new SiteBrief
                {
                    Site = site,
                    Status = age is null ? "unknown" : age <= 90 ? "online" : "stale",
                    StatusText = age is null ? "暂无数据" : age <= 90 ? "数据更新正常" : "数据已超时",
                    OnlinePoints = health.PointsOnline,
                    TotalPoints = health.PointsTotal,
                    OpenAlarms = openAlarms,
                    OpenWorkOrders = openOrders,
                    LatestAt = health.LatestAt,
                });
            }
        }
        finally
        {
            if (!string.IsNullOrEmpty(previousSite)) Svc.Data.SetSite(previousSite);
        }

        var online = briefs.Count(s => s.Status == "online");
        var alarmTotal = briefs.Sum(s => s.OpenAlarms);
        var workTotal = briefs.Sum(s => s.OpenWorkOrders);
        var totalPoints = briefs.Sum(s => s.TotalPoints);
        var onlinePoints = briefs.Sum(s => s.OnlinePoints);
        var kpis = new[]
        {
            new KpiInfo { Label = "监管站点", Value = briefs.Count.ToString(), Unit = "座", Delta = "当前账号授权范围", Tone = "normal", Hint = "不含无权访问的站点" },
            new KpiInfo { Label = "数据更新正常", Value = online.ToString(), Unit = "座", Delta = $"数据超时 {briefs.Count(s => s.Status == "stale")} 座", Tone = online == briefs.Count && briefs.Count > 0 ? "good" : "warn", Hint = "按最新遥测时间判定；90 秒内视为新鲜" },
            new KpiInfo { Label = "未关闭告警", Value = alarmTotal.ToString(), Unit = "条", Delta = "待确认或已确认未恢复", Tone = alarmTotal > 0 ? "bad" : "good", Hint = "跨授权站点汇总" },
            new KpiInfo { Label = "待处理工单", Value = workTotal.ToString(), Unit = "单", Delta = "待接单 / 已接单 / 处理中", Tone = workTotal > 0 ? "warn" : "good", Hint = "跨授权站点汇总" },
        };
        _kpiGrid.Children.Clear();
        for (var i = 0; i < kpis.Length; i++)
        {
            var cell = Kit.KpiCell(kpis[i]);
            cell.BorderBrush = Pal.Line;
            cell.BorderThickness = new Thickness(i == 0 ? 0 : 1, 0, 0, 0);
            Grid.SetColumn(cell, i);
            _kpiGrid.Children.Add(cell);
        }

        _summary.Text = $"点位在线 {onlinePoints}/{totalPoints} · 汇总时间 {DateTime.Now:HH:mm:ss}";
        _siteCards.Children.Clear();
        foreach (var brief in briefs)
            _siteCards.Children.Add(BuildSiteCard(brief));
        if (briefs.Count == 0)
            _siteCards.Children.Add(Kit.T("当前账号没有可监管的站点。", 12, Pal.Muted2));
    }

    private UIElement BuildSiteCard(SiteBrief brief)
    {
        var tone = brief.Status switch { "online" => "good", "stale" => "bad", _ => "muted" };
        var status = Kit.Badge(brief.StatusText, tone);
        var title = Kit.T(brief.Site.Name, 14, Pal.Ink, bold: true);
        var nameRow = Kit.Row(8, title, status);
        var details = new StackPanel();
        details.Children.Add(nameRow);
        details.Children.Add(Kit.T($"{brief.Site.Region} · {brief.Site.Area} · {brief.Site.Id}", 10.5, Pal.Muted2, wrap: TextWrapping.Wrap));
        details.Children.Add(new Border { Height = 10 });

        var metrics = new Grid();
        for (var i = 0; i < 3; i++) metrics.ColumnDefinitions.Add(new ColumnDefinition());
        AddMetric(metrics, 0, "点位在线", $"{brief.OnlinePoints}/{brief.TotalPoints}");
        AddMetric(metrics, 1, "未关闭告警", brief.OpenAlarms.ToString());
        AddMetric(metrics, 2, "待处理工单", brief.OpenWorkOrders.ToString());
        details.Children.Add(metrics);
        details.Children.Add(new Border { Height = 8 });
        var lastText = brief.LatestAt <= 0 ? "最近数据：暂无" : "最近数据：" + DateTimeOffset.FromUnixTimeMilliseconds(brief.LatestAt).LocalDateTime.ToString("MM-dd HH:mm:ss");
        details.Children.Add(Kit.Row(8, Kit.T(lastText, 10.5, Pal.Muted), Kit.Spacer(), Kit.Btn("进入站点", () => Host.ShowSiteDashboard(brief.Site.Id), primary: true, small: true)));

        var card = new Border
        {
            Width = 440,
            Margin = new Thickness(0, 0, 10, 10),
            Padding = new Thickness(12),
            Background = Pal.Surface,
            BorderBrush = Pal.Line,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(3),
            Child = details,
            ToolTip = "数据来自当前桌面端本机模拟引擎，不代表现场站点已联网。",
        };
        return card;
    }

    private static void AddMetric(Grid grid, int column, string label, string value)
    {
        var stack = Kit.Col(2, Kit.T(label, 10, Pal.Muted2), Kit.T(value, 15, Pal.Ink2, bold: true));
        Grid.SetColumn(stack, column);
        grid.Children.Add(stack);
    }
}
