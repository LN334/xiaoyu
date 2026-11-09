using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Ui;

namespace ZhifuWater.Desktop.Windows;

/// <summary>现场触摸屏：1920×1080 全屏窗口，大字号、少交互，Esc 退出。</summary>
public sealed class KioskWindow : Window
{
    private static readonly Brush KioskBg = Hex("#0E1A21");
    private static readonly Brush KioskPanel = Hex("#162A34");
    private static readonly Brush KioskLine = Hex("#26424F");
    private static readonly Brush KioskText = Hex("#E8F1F5");
    private static readonly Brush KioskMuted = Hex("#93AAB5");
    private static readonly Brush KioskBgSoft = Hex("#10222B");

    private readonly AppServices _services;
    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _refresh = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer _toast = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly TextBlock _clockText;
    private readonly TextBlock _dateText;
    private readonly TextBlock _siteText;
    private readonly StackPanel _cards = new();
    private readonly UniformGrid _units = new() { Columns = 4 };
    private readonly StackPanel _alarms = new();
    private readonly StackPanel _actions = new();
    private readonly StackPanel _station = new();
    private readonly Border _toastBar;
    private readonly TextBlock _toastText;
    private int _cardCount;
    private int _unitCount;

    public int CardCount => _cardCount;
    public int UnitCount => _unitCount;

    public KioskWindow(AppServices services)
    {
        _services = services;
        Title = "现场触摸屏 · 小禹";
        Width = 1920;
        Height = 1080;
        MinWidth = 1280;
        MinHeight = 720;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowState = WindowState.Maximized;
        Background = KioskBg;
        FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
        UseLayoutRounding = true;

        _clockText = new TextBlock { FontFamily = new FontFamily("Consolas, Microsoft YaHei UI"), FontSize = 40, Foreground = KioskText, VerticalAlignment = VerticalAlignment.Center };
        _dateText = new TextBlock { FontSize = 13, Foreground = KioskMuted, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(14, 0, 0, 0) };
        _siteText = new TextBlock { FontSize = 15, Foreground = KioskMuted, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10, 0, 0, 0) };
        _toastText = new TextBlock { FontSize = 14, Foreground = KioskText, VerticalAlignment = VerticalAlignment.Center };
        _toastBar = new Border
        {
            Background = Hex("#1D3A48"),
            BorderBrush = Hex("#2D5A6E"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(3),
            Padding = new Thickness(18, 9, 18, 9),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 0, 54),
            Visibility = Visibility.Collapsed,
            Child = _toastText,
            IsHitTestVisible = false,
        };

        var root = new Grid { Background = KioskBg };
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(96) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) });
        var header = BuildHeader();
        var body = BuildBody();
        var footer = BuildFooter();
        Grid.SetRow(header, 0);
        Grid.SetRow(body, 1);
        Grid.SetRow(footer, 2);
        root.Children.Add(header);
        root.Children.Add(body);
        root.Children.Add(footer);
        var overlay = new Grid { Background = KioskBg };
        overlay.Children.Add(root);
        overlay.Children.Add(_toastBar);
        Content = overlay;

        KeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) Close();
        };
        Loaded += (_, _) => RefreshKiosk();
        Closed += (_, _) =>
        {
            _clock.Stop();
            _refresh.Stop();
            _toast.Stop();
        };
        _clock.Tick += (_, _) => UpdateClock();
        _refresh.Tick += (_, _) => RefreshKiosk();
        _toast.Tick += (_, _) =>
        {
            _toast.Stop();
            _toastBar.Visibility = Visibility.Collapsed;
        };
        _clock.Start();
        _refresh.Start();
        UpdateClock();
        RefreshKiosk();
    }

    private UIElement BuildHeader()
    {
        var header = new Grid { Background = Hex("#12232C") };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(6) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var accent = new Border { Background = Hex("#3D9BDC") };
        Grid.SetColumn(accent, 0);
        header.Children.Add(accent);

        var title = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(24, 0, 0, 0) };
        title.Children.Add(new TextBlock { Text = "小禹", FontSize = 28, FontWeight = FontWeights.SemiBold, Foreground = KioskText, VerticalAlignment = VerticalAlignment.Center });
        title.Children.Add(new TextBlock { Text = "现场触摸屏", FontSize = 18, Foreground = Hex("#5FB4EC"), Margin = new Thickness(14, 4, 0, 0), VerticalAlignment = VerticalAlignment.Center });
        _siteText.Text = _services.Data.Site.Name;
        title.Children.Add(_siteText);
        Grid.SetColumn(title, 1);
        header.Children.Add(title);

        var right = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 20, 0) };
        right.Children.Add(_clockText);
        right.Children.Add(_dateText);
        var close = new Button
        {
            Content = new TextBlock { Text = "退出 (Esc)", Foreground = KioskText, FontSize = 12 },
            Style = Kit.St("SmallButton"),
            Margin = new Thickness(22, 0, 0, 0),
            MinWidth = 92,
            Background = Hex("#22414F"),
            BorderBrush = Hex("#335C6D"),
            Height = 34,
            FontSize = 12,
        };
        close.Click += (_, _) => Close();
        right.Children.Add(close);
        Grid.SetColumn(right, 2);
        header.Children.Add(right);
        return header;
    }

    private UIElement BuildBody()
    {
        var body = new Grid { Margin = new Thickness(18, 14, 18, 10) };
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(16) });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(372) });

        var left = new Grid();
        left.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        left.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        left.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

        var cardsTitle = new TextBlock { Text = "实时状态", FontSize = 15, Foreground = KioskMuted, Margin = new Thickness(2, 0, 0, 8) };
        left.Children.Add(cardsTitle);
        _cards.Orientation = Orientation.Horizontal;
        Grid.SetRow(_cards, 1);
        left.Children.Add(_cards);

        var lower = new Grid { Margin = new Thickness(0, 18, 0, 0) };
        lower.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        lower.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        var unitTitle = new TextBlock { Text = "工艺单元", FontSize = 15, Foreground = KioskMuted, Margin = new Thickness(2, 0, 0, 8) };
        lower.Children.Add(unitTitle);
        _units.Margin = new Thickness(-4, 0, -4, 0);
        Grid.SetRow(_units, 1);
        lower.Children.Add(_units);
        Grid.SetRow(lower, 2);
        left.Children.Add(lower);
        Grid.SetColumn(left, 0);
        body.Children.Add(left);

        var right = new StackPanel();
        right.Children.Add(Panel("最近告警", _alarms));
        var actionCard = Panel("快捷操作", _actions);
        actionCard.Margin = new Thickness(0, 14, 0, 0);
        right.Children.Add(actionCard);
        var stationCard = Panel("站点信息", _station);
        stationCard.Margin = new Thickness(0, 14, 0, 0);
        right.Children.Add(stationCard);
        Grid.SetColumn(right, 2);
        body.Children.Add(right);
        return body;
    }

    private Border Panel(string title, UIElement content, double height = 0)
    {
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock
        {
            Text = title, FontSize = 14, Foreground = Hex("#5FB4EC"), FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 10),
        });
        stack.Children.Add(content);
        return new Border
        {
            Background = KioskPanel,
            BorderBrush = KioskLine,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(2),
            Padding = new Thickness(16, 13, 16, 14),
            Height = height > 0 ? height : double.NaN,
            Child = stack,
        };
    }

    private UIElement BuildFooter()
    {
        var footer = new Grid { Background = KioskBgSoft };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var notice = _services.Data.Notice();
        var left = new TextBlock
        {
            Text = string.IsNullOrEmpty(notice)
                ? "数据来源：" + _services.BackendName + " · 每 3 秒自动刷新"
                : notice,
            FontSize = 12, Foreground = KioskMuted, VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(20, 0, 0, 0), TextTrimming = TextTrimming.CharacterEllipsis,
        };
        footer.Children.Add(left);
        var right = new TextBlock
        {
            Text = "v2.0 · 原生 WPF · .NET 8",
            FontSize = 12, Foreground = KioskMuted, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 20, 0),
        };
        Grid.SetColumn(right, 1);
        footer.Children.Add(right);
        return footer;
    }

    private void UpdateClock()
    {
        var now = DateTime.Now;
        _clockText.Text = now.ToString("HH:mm:ss");
        _dateText.Text = now.ToString("yyyy-MM-dd dddd", new System.Globalization.CultureInfo("zh-CN"));
    }

    private void RefreshKiosk()
    {
        try { RefreshKioskCore(); }
        catch (Exception ex)
        {
            ShowToast("刷新失败：" + ex.Message, true);
        }
    }

    private void RefreshKioskCore()
    {
        var data = _services.Data.Kiosk();
        _siteText.Text = _services.Data.Site.Name;

        _cards.Children.Clear();
        _cardCount = data.StatusCards.Count;
        foreach (var card in data.StatusCards) _cards.Children.Add(StatusCard(card));

        _units.Children.Clear();
        _unitCount = data.Units.Count;
        foreach (var unit in data.Units) _units.Children.Add(UnitCard(unit));

        _alarms.Children.Clear();
        foreach (var alarm in data.RecentAlarms.Take(5))
        {
            var line = new StackPanel { Margin = new Thickness(0, 0, 0, 9) };
            line.Children.Add(new TextBlock
            {
                Text = alarm.Title, FontSize = 14, Foreground = KioskText, TextTrimming = TextTrimming.CharacterEllipsis,
            });
            var meta = new StackPanel { Orientation = Orientation.Horizontal };
            meta.Children.Add(new Border
            {
                Background = KioskToneBg(alarm.Level),
                CornerRadius = new CornerRadius(2),
                Padding = new Thickness(6, 1, 6, 1),
                Margin = new Thickness(0, 3, 6, 0),
                Child = new TextBlock { Text = Pal.AlarmLevelText(alarm.Level), FontSize = 11, Foreground = KioskToneFg(alarm.Level) },
            });
            meta.Children.Add(new TextBlock
            {
                Text = alarm.UnitName + " · " + Kit.FormatTime(alarm.At), FontSize = 11, Foreground = KioskMuted,
                Margin = new Thickness(0, 3, 0, 0), VerticalAlignment = VerticalAlignment.Center,
            });
            line.Children.Add(meta);
            _alarms.Children.Add(line);
        }
        if (data.RecentAlarms.Count == 0) _alarms.Children.Add(new TextBlock { Text = "当前没有活动告警", FontSize = 13, Foreground = KioskMuted });

        _actions.Children.Clear();
        foreach (var action in data.QuickActions)
        {
            var backwash = action.Key.Contains("backwash", StringComparison.OrdinalIgnoreCase);
            var button = new Button
            {
                Content = new TextBlock
                {
                    Text = action.Label + (backwash ? "  · 一键执行" : ""),
                    Foreground = KioskText,
                    FontSize = 15,
                    HorizontalAlignment = HorizontalAlignment.Center,
                },
                Height = 46,
                Background = backwash ? Hex("#1B4E66") : Hex("#1D3A48"),
                BorderBrush = backwash ? Hex("#3D9BDC") : Hex("#2A4B5A"),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 0, 8),
                HorizontalContentAlignment = HorizontalAlignment.Center,
                Style = Kit.St("BaseButton"),
            };
            button.Click += (_, _) => RunAction(action);
            _actions.Children.Add(button);
        }

        _station.Children.Clear();
        var site = _services.Data.Site;
        AddKioskInfo("站点", site.Name);
        AddKioskInfo("工艺", site.Process);
        AddKioskInfo("规模", site.Capacity);
        AddKioskInfo("投运", site.CommissionedAt);
        AddKioskInfo("地址", site.Address);
        AddKioskInfo("在线点位", _services.Data.Readings.Count(r => r.Quality == "good") + " / " + _services.Data.Readings.Count);

    }

    private void AddKioskInfo(string key, string value)
    {
        var grid = new Grid { Margin = new Thickness(0, 0, 0, 5) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var k = new TextBlock { Text = key, FontSize = 12, Foreground = KioskMuted };
        var v = new TextBlock { Text = string.IsNullOrEmpty(value) ? "待接入" : value, FontSize = 12, Foreground = KioskText, TextWrapping = TextWrapping.Wrap };
        Grid.SetColumn(v, 1);
        grid.Children.Add(k);
        grid.Children.Add(v);
        _station.Children.Add(grid);
    }

    private void RunAction(ActionInfo action)
    {
        if (!Dlg.Confirm(this, "确认操作", "执行「" + action.Label + "」？\n设备：" + action.Device, "执行", action.Risk == "high")) return;
        var result = _services.Data.ExecuteAction(action.Key, "现场触摸屏操作");
        if (result.Ok && action.Key.Contains("backwash", StringComparison.OrdinalIgnoreCase))
        {
            var cmd = _services.Data.Commands(1).FirstOrDefault();
            if (cmd != null && cmd.Status == "pending_confirm") _services.Data.ConfirmCommand(cmd.Id);
        }
        ShowToast(result.Message, !result.Ok);
        RefreshKiosk();
    }

    private Border StatusCard(KpiInfo kpi)
    {
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock { Text = kpi.Label, FontSize = 13, Foreground = KioskMuted, TextTrimming = TextTrimming.CharacterEllipsis });
        var valueRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 0) };
        valueRow.Children.Add(new TextBlock { Text = kpi.Value, FontSize = 38, FontWeight = FontWeights.SemiBold, Foreground = KioskToneFg(kpi.Tone) });
        if (!string.IsNullOrEmpty(kpi.Unit)) valueRow.Children.Add(new TextBlock { Text = kpi.Unit, FontSize = 13, Foreground = KioskMuted, Margin = new Thickness(5, 16, 0, 0) });
        stack.Children.Add(valueRow);
        stack.Children.Add(new TextBlock { Text = kpi.Delta, FontSize = 11, Foreground = KioskMuted, TextTrimming = TextTrimming.CharacterEllipsis });
        var border = new Border
        {
            Background = KioskPanel,
            BorderBrush = KioskLine,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(2),
            Padding = new Thickness(14, 10, 12, 10),
            Margin = new Thickness(4, 0, 4, 0),
            Child = stack,
            ToolTip = kpi.Hint,
        };
        return border;
    }

    private Border UnitCard(UnitSnapshot unit)
    {
        var tone = Pal.UnitStateTone(unit.State);
        var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        var title = new StackPanel { Orientation = Orientation.Horizontal };
        title.Children.Add(new Border { Width = 10, Height = 10, CornerRadius = new CornerRadius(5), Background = KioskToneFg(tone), Margin = new Thickness(0, 6, 9, 0), VerticalAlignment = VerticalAlignment.Top });
        title.Children.Add(new TextBlock { Text = unit.Unit?.Name ?? unit.Unit?.Code ?? "单元", FontSize = 17, Foreground = KioskText, TextWrapping = TextWrapping.Wrap, MaxWidth = 210 });
        stack.Children.Add(title);
        stack.Children.Add(new TextBlock { Text = Pal.UnitStateText(unit.State), FontSize = 12, Foreground = KioskToneFg(tone), Margin = new Thickness(19, 3, 0, 0) });

        var reading = unit.Readings.FirstOrDefault();
        if (reading == null)
        {
            stack.Children.Add(new TextBlock { Text = "待接入", FontSize = 15, Foreground = KioskMuted, Margin = new Thickness(19, 16, 0, 0) });
        }
        else
        {
            stack.Children.Add(new TextBlock { Text = reading.Name, FontSize = 12, Foreground = KioskMuted, Margin = new Thickness(19, 16, 0, 2) });
            var valueRow = new StackPanel { Orientation = Orientation.Horizontal };
            var parts = reading.Text.Trim().Split(' ');
            var number = parts.Length > 0 ? parts[0] : reading.Text;
            var unitText = parts.Length > 1 ? string.Join(" ", parts.Skip(1)) : "";
            valueRow.Children.Add(new TextBlock { Text = number, FontSize = 30, FontWeight = FontWeights.SemiBold, Foreground = KioskText });
            if (!string.IsNullOrEmpty(unitText))
                valueRow.Children.Add(new TextBlock { Text = unitText, FontSize = 13, Foreground = KioskMuted, Margin = new Thickness(6, 13, 0, 0) });
            stack.Children.Add(valueRow);
        }
        if (!string.IsNullOrEmpty(unit.BwText))
            stack.Children.Add(new TextBlock { Text = unit.BwText, FontSize = 12, Foreground = Hex("#E3B15E"), Margin = new Thickness(19, 6, 0, 0) });
        return new Border
        {
            Background = KioskPanel,
            BorderBrush = KioskLine,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(2),
            Padding = new Thickness(12, 10, 12, 10),
            Margin = new Thickness(4, 4, 4, 4),
            MinHeight = 112,
            Child = stack,
        };
    }

    private void ShowToast(string message, bool error)
    {
        _toastText.Text = (error ? "✕  " : "✓  ") + message;
        _toastBar.Background = error ? Hex("#4A2320") : Hex("#163B2E");
        _toastBar.BorderBrush = error ? Hex("#8B3B33") : Hex("#2C6B51");
        _toastBar.Visibility = Visibility.Visible;
        _toast.Stop();
        _toast.Start();
    }

    private static Brush KioskToneFg(string tone) => Hex(tone switch
    {
        "good" => "#63C994",
        "warn" => "#E5B45F",
        "bad" => "#EC8377",
        "info" or "accent" => "#5FB4EC",
        _ => "#C9D9E0",
    });

    private static Brush KioskToneBg(string tone) => Hex(tone switch
    {
        "good" => "#1B3B2E",
        "warn" => "#43351C",
        "bad" => "#4A2320",
        _ => "#24333B",
    });

    private static Brush Hex(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        return brush;
    }
}
