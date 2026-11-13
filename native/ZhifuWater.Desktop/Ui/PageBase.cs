using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Windows;

namespace ZhifuWater.Desktop.Ui;

/// <summary>页面基类：统一脚注（数据来源 + 更新时间）、构建/刷新生命周期与表格工具。</summary>
public abstract class PageBase : UserControl
{
    protected readonly AppServices Svc;
    protected readonly MainWindow Host;
    private bool _built;
    private TextBlock _footnote = null!;

    public abstract string Id { get; }
    public abstract string Title { get; }
    public abstract string Group { get; }
    protected virtual string SourceLabel => "CoreServices 业务层";
    protected virtual string ScopeLabel => $"站点：{Svc.Data.Site.Name}（{Svc.Data.Site.Id}）";

    protected PageBase(AppServices services, MainWindow host)
    {
        Svc = services;
        Host = host;
        FontFamily = (FontFamily)Application.Current.Resources["UiFont"];
        Background = Pal.Bg;
    }

    public void RefreshPage()
    {
        if (!_built)
        {
            _built = true;
            Build();
            var dock = new DockPanel { LastChildFill = true };
            _footnote = new TextBlock { FontSize = 11, Foreground = Pal.Muted2, TextTrimming = TextTrimming.CharacterEllipsis };
            dock.Children.Add(new Border { Background = Pal.Bg, Child = _content });
            Content = dock;
        }
        RefreshData();
        UpdateFootnote();
    }

    private UIElement? _content;

    protected abstract void Build();
    protected abstract void RefreshData();

    /// <summary>页面内容装配入口：子类 Build 末尾调用。</summary>
    protected void Install(UIElement content)
    {
        _content = content;
    }

    protected void UpdateFootnote()
    {
        if (_footnote == null) return;
        _footnote.Text = $"数据来源：{Svc.BackendName} · {SourceLabel} · {ScopeLabel} · " +
                         $"最后更新：{Svc.Data.LastUpdated:yyyy-MM-dd HH:mm:ss} · 每 3 秒自动刷新";
    }

    protected void Toast(string message, bool ok = true) => Host.Toast(message, ok);

    // ------------------------------------------------------------------
    // 表格工具
    // ------------------------------------------------------------------
    protected static UiTable Table(string[] headers, double[] widths, Action<UiRow>? onSelect = null)
        => new UiTable(headers, widths, onSelect);

    protected static void Bind(DataGrid grid, IEnumerable<UiRow> rows)
    {
        grid.ItemsSource = rows.ToList();
    }

    protected static void Bind(UiTable table, IEnumerable<UiRow> rows)
    {
        table.ItemsSource = rows.ToList();
    }

    /// <summary>工整的数字：去掉无意义的尾随零（1.00 → 1、1132.50 → 1132.5），极小噪声归零避免出现 -0.00。</summary>
    protected static string Fmt(double v, int digits = 2)
    {
        if (double.IsNaN(v) || double.IsInfinity(v)) return "—";
        digits = Math.Clamp(digits, 0, 3);
        if (Math.Abs(v) < 5 * Math.Pow(10, -(digits + 1))) v = 0;
        return v.ToString("0." + new string('#', digits), CultureInfo.InvariantCulture);
    }

    protected static string Num(double? v, int digits = 2, string suffix = "")
        => v.HasValue ? Fmt(v.Value, digits) + suffix : "待接入";

    /// <summary>点位读数：开关量/状态量翻成文字（运行/停止、正常/故障、自动/手动…），模拟量按仪表精度输出。</summary>
    protected static string ReadingText(Reading? reading, int? digits = null)
    {
        if (reading == null) return "待接入";
        if (!reading.Value.HasValue) return string.IsNullOrEmpty(reading.Text) ? "待接入" : reading.Text;
        var value = reading.Value.Value;
        var type = reading.Point.Type;
        if (type is "run" or "alarm" or "state")
        {
            var index = (int)Math.Round(value);
            var labels = (reading.Point.Range ?? "").Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
            // 「0/1」「0–1」这类范围是数值区间不是状态名，别把 1 读成文字「1」
            if (labels.Length > 1 && index >= 0 && index < labels.Length && !double.TryParse(labels[index], out _))
                return labels[index];
            if (type == "run") return index != 0 ? "运行" : "停止";
            if (type == "alarm") return index != 0 ? "故障" : "正常";
            // state 类型在种子里只带数值区间，具体语义看点位编码
            var stateText = StateTextOf(reading.Code, index);
            if (stateText != null) return stateText;
        }
        var d = digits ?? Math.Max(reading.Point.Digits, 0);
        return Fmt(value, d) + (string.IsNullOrEmpty(reading.Point.Unit) ? "" : " " + reading.Point.Unit);
    }

    /// <summary>把 0/1/2/3 这类型号翻译成现场看得懂的词；未知编码返回 null，按数字显示。</summary>
    private static string? StateTextOf(string code, int index)
    {
        var upper = code.ToUpperInvariant();
        if (upper.EndsWith(".RUN") || upper.EndsWith("_RUN")) return index != 0 ? "运行" : "停止";
        if (upper.Contains("FAULT")) return index != 0 ? "故障" : "正常";
        if (upper.EndsWith(".MODE")) return index != 0 ? "手动" : "自动";
        if (upper.Contains("BW.STATE") || upper.Contains("BACKWASH.STATE"))
            return index switch { 0 => "待机", 1 => "气冲", 2 => "气水联合", 3 => "漂洗", _ => null };
        return null;
    }

    protected static string ValueOf(Reading? reading, int digits = 0)
    {
        if (reading == null) return "待接入";
        return ReadingText(reading, digits > 0 ? Math.Max(reading.Point.Digits, digits) : null);
    }

    protected static Border Section(string title, UIElement body, UIElement? right = null, string? subtitle = null)
        => Kit.Card(title, body, right, subtitle);
}
