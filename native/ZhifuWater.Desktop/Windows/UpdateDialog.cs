using System;
using System.Diagnostics;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;
using ZhifuWater.Desktop.Services;
using ZhifuWater.Desktop.Ui;

namespace ZhifuWater.Desktop.Windows;

/// <summary>软件更新：展示版本与更新说明，下载校验后静默安装并重启。</summary>
public sealed class UpdateDialog : Window
{
    private readonly UpdateInfo _info;
    private readonly UpdateSettings _settings;
    private readonly TextBlock _status;
    private readonly ProgressBar _bar;
    private readonly Button _primary;
    private string? _installer;
    private bool _busy;

    public UpdateDialog(Window? owner, UpdateInfo info, UpdateSettings settings)
    {
        _info = info;
        _settings = settings;
        Title = "软件更新";
        Width = 560;
        SizeToContent = SizeToContent.Height;
        ResizeMode = ResizeMode.NoResize;
        WindowStyle = WindowStyle.None;
        WindowChrome.SetWindowChrome(this, new WindowChrome
        {
            CaptionHeight = 0,
            ResizeBorderThickness = new Thickness(0),
            GlassFrameThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            UseAeroCaptionButtons = false,
        });
        WindowStartupLocation = owner == null ? WindowStartupLocation.CenterScreen : WindowStartupLocation.CenterOwner;
        Background = Pal.Bg;
        ShowInTaskbar = false;
        if (owner != null) Owner = owner;
        FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");

        var root = new Border { Style = Kit.St("DialogCard"), Padding = new Thickness(20, 16, 20, 18) };
        var stack = new StackPanel();

        var head = new Grid { Margin = new Thickness(0, 0, 0, 6) };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var title = Kit.T("软件更新", 15, Pal.Ink, bold: true);
        title.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(title);
        var close = new Button { Content = "\uE8BB", Style = Kit.St("CaptionCloseButton"), Width = 28, Height = 24,
            FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 10, HorizontalAlignment = HorizontalAlignment.Right };
        close.Click += (_, _) => Close();
        Grid.SetColumn(close, 1);
        head.Children.Add(close);
        head.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); };
        stack.Children.Add(head);

        var cur = Kit.T("当前版本 v" + UpdateService.CurrentVersionText + "　→　最新版本 v" +
                        info.Version.ToString(3), 12.5, Pal.Muted,
            wrap: TextWrapping.Wrap, trim: TextTrimming.None);
        cur.Margin = new Thickness(0, 0, 0, 12);
        stack.Children.Add(cur);

        var notesTitle = Kit.T("更新内容", 12, Pal.Ink, true);
        notesTitle.Margin = new Thickness(0, 0, 0, 6);
        stack.Children.Add(notesTitle);
        var notes = new TextBox
        {
            Text = CleanNotes(info.Notes),
            IsReadOnly = true, BorderThickness = new Thickness(0), Background = Pal.Surface2,
            Foreground = Pal.Ink2, FontSize = 12, Padding = new Thickness(10, 8, 10, 8),
            TextWrapping = TextWrapping.Wrap, AcceptsReturn = true, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            MaxHeight = 220, MinHeight = 96,
        };
        stack.Children.Add(new Border
        {
            BorderBrush = Pal.LineSoft, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(2),
            Child = notes, Margin = new Thickness(0, 0, 0, 12),
        });

        _bar = new ProgressBar
        {
            Height = 5, Minimum = 0, Maximum = 100, Value = 0, Foreground = Pal.Accent,
            Background = Pal.Surface2, BorderThickness = new Thickness(0), Visibility = Visibility.Collapsed,
            Margin = new Thickness(0, 0, 0, 6),
        };
        stack.Children.Add(_bar);
        _status = Kit.T("", 11.5, Pal.Muted, wrap: TextWrapping.Wrap, trim: TextTrimming.None);
        _status.Margin = new Thickness(0, 0, 0, 10);
        stack.Children.Add(_status);

        var foot = new Grid();
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var auto = new CheckBox
        {
            Content = "启动时自动检查更新", IsChecked = settings.AutoCheck, VerticalAlignment = VerticalAlignment.Center,
            FontSize = 11.5, Foreground = Pal.Muted,
        };
        auto.Checked += (_, _) => { _settings.AutoCheck = true; UpdateService.SaveSettings(_settings); };
        auto.Unchecked += (_, _) => { _settings.AutoCheck = false; UpdateService.SaveSettings(_settings); };
        foot.Children.Add(auto);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var later = Kit.Btn("稍后", Close, false, true);
        _primary = Kit.Btn("下载并安装", OnPrimaryClick, true);
        _primary.Margin = new Thickness(8, 0, 0, 0);
        actions.Children.Add(later);
        actions.Children.Add(_primary);
        Grid.SetColumn(actions, 1);
        foot.Children.Add(actions);
        stack.Children.Add(foot);

        root.Child = stack;
        Content = root;
        _status.Text = info.Size > 0 ? "更新包 " + (info.Size / 1024.0 / 1024.0).ToString("0.0") + " MB" : "";
    }

    private static string CleanNotes(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "（本次更新没有附加说明）";
        var lines = raw.Replace("\r\n", "\n").Split('\n')
            .Select(x => x.TrimEnd())
            .Where(x => !x.TrimStart().StartsWith('#'))
            .Select(x => x.TrimStart().StartsWith("- ") ? "· " + x.TrimStart().Substring(2) : x)
            .ToList();
        var body = string.Join("\n", lines).Trim();
        return body.Length == 0 ? "（本次更新没有附加说明）" : body;
    }

    private async void OnPrimaryClick()
    {
        if (_busy) return;
        if (_installer != null)
        {
            var installer = _installer;
            _primary.IsEnabled = false;
            _status.Foreground = Pal.Muted;
            _status.Text = "即将退出并安装。系统会弹出「用户账户控制」，请点「是」授权，否则装不上。";
            // 先把上面这句提示画出来，再申请管理员权限；否则 UAC 弹窗出现时用户不知道该点什么
            await Task.Delay(900);
            if (!UpdateService.ApplyAndRestart(installer))
            {
                _status.Text = "没有拿到管理员权限，安装已取消。可稍后以管理员身份运行安装包。";
                _status.Foreground = Pal.ToneFg("danger");
                _primary.IsEnabled = true;
            }
            return;
        }

        _busy = true;
        _primary.IsEnabled = false;
        _bar.Visibility = Visibility.Visible;
        _bar.Value = 0;
        _status.Foreground = Pal.Muted;
        var cts = new CancellationTokenSource(TimeSpan.FromMinutes(20));
        try
        {
            var progress = new Progress<double>(p =>
            {
                _bar.Value = p;
                _status.Text = p >= 100 ? "下载完成，正在校验…" : "正在下载 " + p.ToString("0") + "%";
                _primary.Content = p >= 100 ? "校验中…" : "下载中 " + p.ToString("0") + "%";
            });
            _installer = await UpdateService.DownloadAsync(_info, progress, cts.Token);
            _bar.Value = 100;
            _status.Foreground = Pal.Good;
            _status.Text = "已下载并通过校验。点击「立即安装」，小禹会关闭并在安装完成后自动打开。";
            _primary.Content = "立即安装";
            _primary.IsEnabled = true;
        }
        catch (Exception ex)
        {
            _status.Foreground = Pal.Bad;
            _status.Text = "更新失败：" + ex.Message;
            _primary.Content = "重试";
            _primary.IsEnabled = true;
        }
        finally
        {
            _busy = false;
        }
    }
}
