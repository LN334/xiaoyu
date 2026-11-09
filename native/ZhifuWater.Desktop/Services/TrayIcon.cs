using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.IO;
using Microsoft.Win32;
using WF = System.Windows.Forms;

namespace ZhifuWater.Desktop.Services;

/// <summary>托盘常驻：关闭窗口收进通知区，右键弹出应用风格的菜单，双击唤回。</summary>
public static class TrayIcon
{
    private static WF.NotifyIcon? _icon;
    private static Window? _main;
    private static TrayMenuWindow? _menu;

    private static readonly Brush Ink = new SolidColorBrush(Color.FromRgb(31, 35, 41));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(90, 102, 115));
    private static readonly Brush Hover = new SolidColorBrush(Color.FromRgb(243, 245, 247));
    private static readonly Brush Danger = new SolidColorBrush(Color.FromRgb(214, 69, 69));
    private static readonly Brush DangerHover = new SolidColorBrush(Color.FromRgb(253, 241, 241));
    private static readonly Brush Accent = new SolidColorBrush(Color.FromRgb(14, 124, 116));

    public static bool ExitRequested { get; private set; }

    public static void ShowMenuAt(int x, int y)
    {
        try
        {
            _menu ??= new TrayMenuWindow(ShowMain, ToggleAutoStart, IsAutoStartEnabled, Exit);
            _menu.ShowAt(x, y);
        }
        catch { }
    }

    public static void RenderPreview(string path)
    {
        var w = new TrayMenuWindow(ShowMain, ToggleAutoStart, IsAutoStartEnabled, Exit);
        var root = (FrameworkElement)w.Content;
        root.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        root.Arrange(new Rect(new Point(0, 0), root.DesiredSize));
        root.UpdateLayout();
        var bmp = new RenderTargetBitmap((int)Math.Ceiling(root.ActualWidth), (int)Math.Ceiling(root.ActualHeight), 96, 96, PixelFormats.Pbgra32);
        bmp.Render(root);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var fs = File.Create(path);
        enc.Save(fs);
    }

    public static void Ensure(Window main)
    {
        _main = main;
        if (_icon is not null) return;

        _icon = new WF.NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "小禹 · 村镇水处理站智能运维平台",
            Visible = true
        };
        _icon.MouseUp += (_, e) =>
        {
            if (e.Button != WF.MouseButtons.Right) return;
            var p = WF.Cursor.Position;
            ShowMenuAt(p.X, p.Y);
        };
        _icon.DoubleClick += (_, _) => ShowMain();
    }

    private static void ToggleAutoStart()
    {
        var next = !IsAutoStartEnabled();
        try { SetAutoStart(next); }
        catch (Exception ex) { ShowBalloon("设置开机启动失败", ex.Message); }
        _menu?.RefreshAutoStart();
    }

    public static void ShowMain()
    {
        if (_main is null) return;
        try
        {
            if (!_main.IsVisible) _main.Show();
            if (_main.WindowState == WindowState.Minimized) _main.WindowState = WindowState.Normal;
            _main.Activate();
            _main.Topmost = true;
            _main.Topmost = false;
            _main.Focus();
        }
        catch { }
    }

    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "Xiaoyu";
    /// <summary>改名前的自启项名，读到时迁成新名字再清掉。</summary>
    private const string LegacyRunName = "Qingqu";

    public static bool IsAutoStartEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            if (key is null) return false;
            if (!string.IsNullOrEmpty(key.GetValue(RunName) as string)) return true;
            // 老版本（清渠）开过自启：沿用这个设置，换成新名字
            if (!string.IsNullOrEmpty(key.GetValue(LegacyRunName) as string))
            {
                SetAutoStart(true);
                return true;
            }
            return false;
        }
        catch { return false; }
    }

    public static void SetAutoStart(bool enabled)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true) ?? Registry.CurrentUser.CreateSubKey(RunKey);
        if (key is null) return;
        if (enabled)
        {
            var exe = Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exe)) return;
            key.SetValue(RunName, $"\"{exe}\" --tray", RegistryValueKind.String);
        }
        else if (key.GetValue(RunName) is not null)
        {
            key.DeleteValue(RunName, throwOnMissingValue: false);
        }
        // 旧名字的自启项一律清掉，避免重启后同时拉起新旧两个程序
        try { key.DeleteValue(LegacyRunName, throwOnMissingValue: false); } catch { }
    }

    public static void UpdateTooltip(string text)
    {
        if (_icon is null) return;
        try { _icon.Text = text.Length > 63 ? text[..63] : text; } catch { }
    }

    public static void ShowBalloon(string title, string text)
    {
        try { _icon?.ShowBalloonTip(4000, title, text, WF.ToolTipIcon.Info); } catch { }
    }

    public static void Exit()
    {
        ExitRequested = true;
        try { _main?.Close(); } catch { }
        Dispose();
        Application.Current.Shutdown(0);
    }

    public static void Dispose()
    {
        if (_icon is null) return;
        try { _icon.Visible = false; } catch { }
        try { _icon.Dispose(); } catch { }
        _icon = null;
    }

    private static System.Drawing.Icon LoadIcon()
    {
        try
        {
            var path = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(path))
            {
                var ico = System.Drawing.Icon.ExtractAssociatedIcon(path);
                if (ico is not null) return ico;
            }
        }
        catch { }
        return System.Drawing.SystemIcons.Application;
    }

    /// <summary>与主界面同一套视觉：白卡片、圆角、13px 文字、42 行高。</summary>
    private sealed class TrayMenuWindow : Window
    {
        private readonly TextBlock _autoGlyph;
        private readonly Func<bool> _autoOn;

        public TrayMenuWindow(Action open, Action toggleAuto, Func<bool> autoOn, Action exit)
        {
            _autoOn = autoOn;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ShowInTaskbar = false;
            Topmost = true;
            SizeToContent = SizeToContent.WidthAndHeight;
            ResizeMode = ResizeMode.NoResize;

            var panel = new StackPanel { Margin = new Thickness(6, 6, 6, 6) };
            panel.Children.Add(Row("\uE8A7", "打开主界面", Ink, open, out _));
            panel.Children.Add(Row("\uE7E8", "开机自动启动", Ink, toggleAuto, out _autoGlyph));
            panel.Children.Add(Separator());
            panel.Children.Add(Row("\uE711", "退出小禹", Danger, exit, out _, danger: true));

            Content = new Border
            {
                Background = Brushes.White,
                Margin = new Thickness(8),
                Width = 186,
                BorderBrush = new SolidColorBrush(Color.FromRgb(227, 231, 235)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                
                Effect = new DropShadowEffect { BlurRadius = 16, ShadowDepth = 2, Opacity = 0.18, Color = Colors.Black },
                Child = panel
            };

            Deactivated += (_, _) => Hide();
            RefreshAutoStart();
        }

        public void RefreshAutoStart()
        {
            var on = _autoOn();
            _autoGlyph.Text = on ? "\uE73E" : "\uE7E8";
            _autoGlyph.Foreground = on ? Accent : Muted;
        }

        public void ShowAt(int screenX, int screenY)
        {
            if (!IsVisible) Show();
            UpdateLayout();
            var source = PresentationSource.FromVisual(this);
            var sx = source?.CompositionTarget?.TransformFromDevice.M11 ?? 1.0;
            var sy = source?.CompositionTarget?.TransformFromDevice.M22 ?? 1.0;
            Left = screenX * sx - ActualWidth - 6;
            Top = screenY * sy - ActualHeight - 6;
            Activate();
        }

        private Border Row(string glyph, string label, Brush color, Action action, out TextBlock glyphBlock, bool danger = false)
        {
            var g = new TextBlock
            {
                Text = glyph,
                FontFamily = new FontFamily("Segoe MDL2 Assets"),
                FontSize = 12,
                Foreground = danger ? Danger : Muted,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            glyphBlock = g;
            var text = new TextBlock
            {
                Text = label,
                FontFamily = new FontFamily("Microsoft YaHei UI"),
                FontSize = 11.5,
                Foreground = color,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(6, 0, 0, 0)
            };
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(22) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            Grid.SetColumn(g, 0);
            Grid.SetColumn(text, 1);
            grid.Children.Add(g);
            grid.Children.Add(text);

            var row = new Border
            {
                Background = Brushes.Transparent,
                CornerRadius = new CornerRadius(6),
                Height = 28,
                Padding = new Thickness(6, 0, 10, 0),
                Cursor = Cursors.Hand,
                Child = grid,
                Width = 170
            };
            row.MouseEnter += (_, _) => row.Background = danger ? DangerHover : Hover;
            row.MouseLeave += (_, _) => row.Background = Brushes.Transparent;
            row.MouseLeftButtonUp += (_, _) =>
            {
                Hide();
                action();
            };
            return row;
        }

        private static Border Separator() => new()
        {
            Height = 1,
            Background = new SolidColorBrush(Color.FromRgb(230, 234, 239)),
            Margin = new Thickness(8, 2, 8, 2)
        };
    }
}
