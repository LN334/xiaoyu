using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Pages;
using ZhifuWater.Desktop.Services;
using ZhifuWater.Desktop.Ui;

namespace ZhifuWater.Desktop.Windows;

public partial class MainWindow : Window
{
    private static readonly (string Group, string Id, string Title)[] NavItems =
    {
        ("监管", "fleet", "多站总览"),
        ("站点", "dashboard", "站点驾驶舱"),
        ("站点", "monitor", "实时数据"),
        ("站点", "process", "工艺流程图"),
        ("监管", "alarms", "告警管理"),
        ("运维", "workorders", "工单管理"),
        ("运维", "inspections", "巡检管理"),
        ("运维", "devices", "设备台账"),
        ("运维", "reports", "报表中心"),
        ("教育与分析", "quality", "水质化验"),
        ("教育与分析", "diagnosis", "运行诊断"),
        ("教育与分析", "analysis", "运行分析"),
        ("仿真实验", "automation", "控制规则实验"),
        ("仿真实验", "control", "设备控制实验"),
        ("仿真实验", "params", "参数实验"),
        ("系统", "admin", "系统管理")
    };

    private readonly AppServices _services;
    private readonly UserInfo _user;
    private readonly Dictionary<string, PageBase> _pages = new();
    private readonly Dictionary<string, Button> _navButtons = new();
    private readonly Dictionary<string, TextBlock> _navLabels = new();
    private readonly Dictionary<string, (Border Box, TextBlock Text)> _navBadges = new();
    private readonly Dictionary<string, System.Windows.Shapes.Path> _navIcons = new();

    /// <summary>左侧导航条目数，供自检与文档口径引用。</summary>
    public static int NavCount => NavItems.Length;

    private static readonly Dictionary<string, string> NavIconData = new()
    {
        ["fleet"] = "M2,3 H7 V7 H2 Z M9,3 H14 V7 H9 Z M2,9 H7 V13 H2 Z M9,9 H14 V13 H9 Z",
        ["dashboard"] = "M2,2 H7 V7 H2 Z M9,2 H14 V7 H9 Z M2,9 H7 V14 H2 Z M9,9 H14 V14 H9 Z",
        ["process"] = "M2,8 H5 M5,4 H10 V12 H14 M5,12 H10",
        ["monitor"] = "M2,10 H5 L7,4 L10,12 L12,8 H14",
        ["alarms"] = "M8,2 A4,4 0 0 1 12,6 V9 L13,11 H3 L4,9 V6 A4,4 0 0 1 8,2 Z M6.5,13 A1.5,1.5 0 0 0 9.5,13",
        ["automation"] = "M4,4 H12 M9,1 L12,4 L9,7 M12,12 H4 M7,9 L4,12 L7,15",
        ["control"] = "M3,5 H13 M3,11 H13 M6,3 V7 M10,9 V13",
        ["params"] = "M3,4 H13 M3,8 H13 M3,12 H13 M6,2 V6 M10,6 V10 M6,10 V14",
        ["quality"] = "M8,2 C8,2 13,8 13,11 A5,5 0 0 1 3,11 C3,8 8,2 8,2 Z",
        ["diagnosis"] = "M7,2 A5,5 0 1 0 7,12 A5,5 0 1 0 7,2 Z M11,11 L14,14",
        ["analysis"] = "M2,14 H14 M4,12 V8 M8,12 V4 M12,12 V6",
        ["reports"] = "M3,2 H10 L13,5 V14 H3 Z M10,2 V5 H13 M5,8 H11 M5,11 H9",
        ["workorders"] = "M4,3 H12 V14 H4 Z M6,1.5 H10 V4 H6 Z M6,7 H10 M6,10 H10",
        ["inspections"] = "M3,8 L6,11 L13,3",
        ["devices"] = "M3,4 H13 V12 H3 Z M6,4 V2 M10,4 V2",
        ["admin"] = "M8,5 A3,3 0 1 0 8,11 A3,3 0 1 0 8,5 Z M8,1 V3 M8,13 V15 M1,8 H3 M13,8 H15",
    };
    private readonly DispatcherTimer _clockTimer;
    private readonly DispatcherTimer _refreshTimer;
    private readonly DispatcherTimer _toastTimer;
    private PageBase? _currentPage;
    private string _currentId = "dashboard";
    private bool _loadingSites;
    private bool _loggingOut;
    private UpdateInfo? _pendingUpdate;
    private bool _updateChecking;

    public AppServices Services => _services;
    public UserInfo CurrentUser => _user;

    public MainWindow(AppServices services, UserInfo user)
    {
        InitializeComponent();
        NativeChrome.EnableCustomFrame(this);
        _services = services;
        _user = user;

        UserNameText.Text = user.Name;
        MenuName.Text = user.Name + "（" + user.Username + "）";
        MenuRole.Text = user.RoleName + (user.Role == "super" ? " · 全部站点" : " · " + string.Join("、", user.SiteIds));

        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clockTimer.Tick += (_, _) => UpdateClock();
        _clockTimer.Start();

        _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _refreshTimer.Tick += (_, _) => AutoRefresh();
        _refreshTimer.Start();

        // 从托盘唤回后立刻拉一次，别等下一个刷新周期。
        ClockText.Text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        IsVisibleChanged += (_, _) => { if (IsVisible) { UpdateClock(); AutoRefresh(); } };
        StateChanged += (_, _) => { if (WindowState != WindowState.Minimized) { UpdateClock(); AutoRefresh(); } };

        _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3.2) };
        _toastTimer.Tick += (_, _) =>
        {
            _toastTimer.Stop();
            ToastPanel.Visibility = Visibility.Collapsed;
        };

        _services.ToastRequested += OnToastRequested;
        _services.Data.DataChanged += OnDataChanged;

        BuildNav();
        LoadSites();
        UpdateClock();
        UpdateBadges();
        UpdateFooter();
        var startPage = Environment.GetEnvironmentVariable("ZHIFU_START_PAGE");
        ShowPage(string.IsNullOrWhiteSpace(startPage) ? "fleet" : startPage);
        SidebarVersion.Text = "v" + UpdateService.CurrentVersionText;
        CheckUpdateMenu.Content = "检查更新（v" + UpdateService.CurrentVersionText + "）";
        Closed += OnClosed;
        Loaded += (_, _) => { UpdateBadges(); WatchAssignments(); ScheduleStartupUpdateCheck(); };
        WindowFit.Apply(this, 1440, 900);
        TrayIcon.Ensure(this);
    }

    private void OnToastRequested(string message, bool ok) => Toast(message, ok);

    private void OnDataChanged(object? sender, EventArgs e) => UpdateBadges();

    private void BuildNav()
    {
        string? lastGroup = null;
        foreach (var (group, id, title) in NavItems)
        {
            if (group != lastGroup)
            {
                NavPanel.Children.Add(new TextBlock
                {
                    Text = group,
                    FontSize = 9.5,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x7E, 0x92, 0x9B)),
                    Margin = new Thickness(14, lastGroup == null ? 8 : 12, 12, 3),
                });
                lastGroup = group;
            }

            var label = new TextBlock
            {
                Text = title,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = Kit.Br("SidebarText"),
            };
            var icon = new System.Windows.Shapes.Path
            {
                Data = Geometry.Parse(NavIconData.TryGetValue(id, out var d) ? d : NavIconData["dashboard"]),
                Stroke = Kit.Br("SidebarText"),
                StrokeThickness = 1.4,
                Stretch = Stretch.Uniform,
                Width = 15,
                Height = 15,
                Margin = new Thickness(0, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            var badgeText = new TextBlock
            {
                Text = "0",
                FontSize = 9,
                Foreground = System.Windows.Media.Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            var badge = new Border
            {
                Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0xB2, 0x3A, 0x2E)),
                CornerRadius = new CornerRadius(7),
                Height = 14,
                MinWidth = 14,
                Padding = new Thickness(4, 0, 4, 0),
                Margin = new Thickness(6, 0, 0, 0),
                Visibility = Visibility.Collapsed,
                Child = badgeText,
            };
            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(icon, 0);
            Grid.SetColumn(label, 1);
            Grid.SetColumn(badge, 2);
            grid.Children.Add(icon);
            grid.Children.Add(label);
            grid.Children.Add(badge);

            var button = new Button
            {
                Content = grid,
                Style = Kit.St("NavButton"),
                Margin = new Thickness(6, 1, 6, 1),
                CommandParameter = id,
                ToolTip = title,
            };
            button.Click += (_, _) =>
            {
                ShowPage(id);
            };
            NavPanel.Children.Add(button);
            _navButtons[id] = button;
            _navLabels[id] = label;
            _navBadges[id] = (badge, badgeText);
            _navIcons[id] = icon;
        }
    }

    private void LoadSites()
    {
        _loadingSites = true;
        try
        {
            SiteCombo.ItemsSource = _services.Sites;
            SiteCombo.SelectedItem = _services.Sites.FirstOrDefault(s => s.Id == _services.Data.CurrentSiteId)
                                     ?? _services.Sites.FirstOrDefault();
        }
        finally
        {
            _loadingSites = false;
        }
    }

    private void OnSiteChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loadingSites || SiteCombo.SelectedItem is not SiteInfo site) return;
        if (_services.Data.CurrentSiteId == site.Id) return;
        _services.Data.SetSite(site.Id);
        _pages.Clear();
        ShowPage(_currentId);
        Toast("已切换到 " + site.Name + "（" + site.Id + "）");
    }

    public void ShowSiteDashboard(string siteId)
    {
        var site = _services.Sites.FirstOrDefault(s => s.Id == siteId);
        if (site is null) return;
        SiteCombo.SelectedItem = site;
        if (_services.Data.CurrentSiteId == siteId) ShowPage("dashboard");
    }

    /// <summary>页面区当前可视高度，供内容较少的页面把主卡撑到底。</summary>
    public double PageViewportHeight => PageHost.ActualHeight;

    public void ShowPage(string id) => ShowPage(id, null);

    /// <summary>跳转页面，并可指定要聚焦的对象（驾驶舱点某台设备/某个工艺单元时用）。</summary>
    public void ShowPage(string id, string? focus)
    {
        if (!_pages.TryGetValue(id, out var page))
        {
            page = PageFactory.Create(id, _services, this);
            _pages[id] = page;
        }
        if (!string.IsNullOrEmpty(focus) && page is IFocusablePage focusable) focusable.FocusItem(focus);
        _currentPage = page;
        PageHost.Content = page;
        page.RefreshPage();
        _currentId = id;

        foreach (var (key, button) in _navButtons)
            button.Tag = key == id ? "active" : null;
        foreach (var (key, label) in _navLabels)
            label.Foreground = key == id ? Brushes.White : Kit.Br("SidebarText");
        foreach (var (key, icon) in _navIcons)
            icon.Stroke = key == id ? Kit.Br("SidebarText") : Kit.Br("SidebarMuted");

        var nav = NavItems.FirstOrDefault(n => n.Id == id);
        PageTitle.Text = nav.Title ?? id;
        UpdateFooter();
    }
    public void RefreshShell()
    {
        UpdateBadges();
        UpdateFooter();
    }

    /// <summary>收进托盘或最小化时按后台模式跑：照常推进数据与角标，跳过页面重绘。</summary>
    private bool IsBackground => !IsVisible || WindowState == WindowState.Minimized;

    private void AutoRefresh()
    {
        try
        {
            _services.Data.Tick();
            if (!IsBackground) _currentPage?.RefreshPage();
            UpdateBadges();
            if (!IsBackground) UpdateFooter();
        }
        catch (Exception ex)
        {
            Toast("自动刷新失败：" + ex.Message, false);
        }
    }

    private void OnTopBarMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource is DependencyObject d && HasInteractiveParent(d)) return;
        if (e.ClickCount == 2) { ToggleMaximize(); return; }
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            try { DragMove(); } catch (InvalidOperationException) { }
        }
    }

    private static bool HasInteractiveParent(DependencyObject d)
    {
        for (var cur = d; cur is not null; cur = VisualTreeHelper.GetParent(cur))
        {
            if (cur is ButtonBase or ComboBox or TextBox) return true;
        }
        return false;
    }

    private void OnMinimizeClick(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void OnMaximizeClick(object sender, RoutedEventArgs e) => ToggleMaximize();

    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        if (MaxGlyph is not null)
            MaxGlyph.Text = WindowState == WindowState.Maximized ? "" : "";
    }

    private void OnCloseClick(object sender, RoutedEventArgs e) => HideToTray();

    /// <summary>点关闭只收进托盘；真正退出走托盘菜单，登出时也放行。</summary>
    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!_loggingOut && !TrayIcon.ExitRequested)
        {
            e.Cancel = true;
            HideToTray();
            return;
        }
        base.OnClosing(e);
    }

    private void HideToTray()
    {
        // 先收窗口再建托盘：托盘初始化一旦抛异常，也不会把窗口留在屏幕上
        Hide();
        Dispatcher.BeginInvoke(new Action(Hide), DispatcherPriority.Background);
        try
        {
            TrayIcon.Ensure(this);
            TrayIcon.ShowBalloon("小禹仍在后台运行", "双击托盘图标可重新打开窗口；要彻底退出请用托盘菜单。");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("托盘初始化失败：" + ex.Message);
        }
    }

    private DispatcherTimer? _hintTimer;

    /// <summary>状态栏中间的一次性状态提示（如「已刷新」），2.6 秒后自动清空。</summary>
    private void ShowFooterHint(string text)
    {
        FooterHint.Text = text;
        _hintTimer?.Stop();
        _hintTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.6) };
        _hintTimer.Tick += (_, _) =>
        {
            _hintTimer?.Stop();
            FooterHint.Text = "";
        };
        _hintTimer.Start();
    }

    private void OnRefreshClick(object sender, RoutedEventArgs e)
    {
        AutoRefresh();
        ShowFooterHint("已刷新 · " + DateTime.Now.ToString("HH:mm:ss"));
    }

    private void UpdateClock()
    {
        // 后台时不刷时间，省一次文本布局。
        if (IsBackground) return;
        ClockText.Text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
    }

    private void UpdateFooter()
    {
        FooterRight.Text = "最后更新 " + _services.Data.LastUpdated.ToString("HH:mm:ss");
    }

    public void UpdateBadges()
    {
        try
        {
            var alarms = _services.Data.Alarms("open").Count;
            var workorders = _services.Data.WorkOrders("all").Count(w => w.Status is "pending" or "accepted" or "processing");
            SetNavBadge("alarms", alarms);
            SetNavBadge("workorders", workorders);
            var unread = _services.Data.UnreadNotifications;
            BellBadge.Visibility = unread > 0 ? Visibility.Visible : Visibility.Collapsed;
            BellBadgeText.Text = unread > 99 ? "99+" : unread.ToString();
            FooterRight.Text = "最后更新 " + _services.Data.LastUpdated.ToString("HH:mm:ss");
            TrayIcon.UpdateTooltip(alarms > 0
                ? $"小禹 · 运行中 · 待处理告警 {alarms} 条"
                : "小禹 · 运行中 · 无待处理告警");
            CheckNewAlarms();
            WatchAssignments();
        }
        catch
        {
            // 徽标刷新失败不打断主界面
        }
    }

    private readonly HashSet<string> _knownAlarms = new(StringComparer.Ordinal);
    private readonly Queue<AlarmInfo> _alarmQueue = new();
    private DispatcherTimer? _alarmToastTimer;

    /// <summary>新出现的告警弹一条通知；首次加载只记录不弹，避免启动时刷屏。</summary>
    private void CheckNewAlarms()
    {
        var open = _services.Data.Alarms("open");
        var ids = open.Select(a => a.Id).ToHashSet(StringComparer.Ordinal);
        if (_knownAlarms.Count == 0)
        {
            foreach (var id in ids) _knownAlarms.Add(id);
            return;
        }
        var fresh = open.Where(a => !_knownAlarms.Contains(a.Id)).OrderBy(a => a.At).Take(3).ToList();
        foreach (var a in fresh) _alarmQueue.Enqueue(a);
        // 窗口收在托盘时用托盘气泡提醒，避免把窗口硬拉到前台。
        if (fresh.Count > 0 && IsBackground)
            TrayIcon.ShowBalloon($"新告警 · {Pal.AlarmLevelText(fresh[0].Level)}", fresh[0].Title);
        _knownAlarms.IntersectWith(ids);
        foreach (var id in ids) _knownAlarms.Add(id);
        if (AlarmToastPanel.Visibility != Visibility.Visible) ShowNextAlarmToast();
    }

    private void ShowNextAlarmToast()
    {
        if (_alarmQueue.Count == 0)
        {
            AlarmToastPanel.Visibility = Visibility.Collapsed;
            return;
        }
        var a = _alarmQueue.Dequeue();
        var tone = Pal.AlarmLevelTone(a.Level);
        AlarmToastBar.Background = Pal.ToneFg(tone);
        AlarmToastTitle.Text = $"新告警 · {Pal.AlarmLevelText(a.Level)}";
        AlarmToastTitle.Foreground = Pal.ToneFg(tone);
        var at = DateTimeOffset.FromUnixTimeMilliseconds(a.At).LocalDateTime;
        AlarmToastBody.Text = a.UnitName.Length > 0
            ? $"{a.Title}（{a.UnitName} · {at:HH:mm:ss}）"
            : $"{a.Title}（{at:HH:mm:ss}）";
        AlarmToastPanel.Visibility = Visibility.Visible;
        _alarmToastTimer ??= new DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
        _alarmToastTimer.Tick -= AlarmToastTick;
        _alarmToastTimer.Tick += AlarmToastTick;
        _alarmToastTimer.Stop();
        _alarmToastTimer.Start();
    }

    private void AlarmToastTick(object? sender, EventArgs e)
    {
        _alarmToastTimer?.Stop();
        ShowNextAlarmToast();
    }

    private void OnAlarmToastClick(object sender, MouseButtonEventArgs e)
    {
        AlarmToastPanel.Visibility = Visibility.Collapsed;
        _alarmToastTimer?.Stop();
        ShowPage("alarms");
    }

    private void SetNavBadge(string id, int count)
    {
        if (!_navBadges.TryGetValue(id, out var badge)) return;
        badge.Box.Visibility = count > 0 ? Visibility.Visible : Visibility.Collapsed;
        badge.Text.Text = count > 99 ? "99+" : count.ToString();
    }

    private void OnBellClick(object sender, RoutedEventArgs e)
    {
        BuildBellList();
        BellPopup.IsOpen = true;
    }

    private void BuildBellList()
    {
        BellList.Children.Clear();
        var items = _services.Data.Notifications.Take(10).ToList();
        if (items.Count == 0)
        {
            BellList.Children.Add(new TextBlock
            {
                Text = "暂无通知",
                FontSize = 12,
                Foreground = Kit.Br("Muted2"),
                Margin = new Thickness(8, 16, 8, 16),
                HorizontalAlignment = HorizontalAlignment.Center,
            });
            return;
        }
        foreach (var n in items)
        {
            var dot = new Border
            {
                Width = 6, Height = 6, CornerRadius = new CornerRadius(3),
                Background = Pal.ToneFg(n.Read ? "muted" : "accent"), VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 7, 0),
            };
            var text = new TextBlock
            {
                Text = n.Title, FontSize = 12, Foreground = Kit.Br(n.Read ? "Muted" : "Ink2"),
                TextWrapping = TextWrapping.Wrap, MaxWidth = 268, VerticalAlignment = VerticalAlignment.Center,
            };
            var right = new TextBlock
            {
                Text = Kit.FormatTime(n.At), FontSize = 10, Foreground = Kit.Br("Muted2"),
                VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 0, 0),
            };
            var rowGrid = new Grid();
            rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            rowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(dot, 0);
            Grid.SetColumn(text, 1);
            Grid.SetColumn(right, 2);
            rowGrid.Children.Add(dot);
            rowGrid.Children.Add(text);
            rowGrid.Children.Add(right);
            var border = new Border
            {
                Padding = new Thickness(8, 6, 8, 6),
                Background = n.Read ? System.Windows.Media.Brushes.Transparent : Kit.Br("Surface2"),
                Child = rowGrid,
                Cursor = System.Windows.Input.Cursors.Hand,
            };
            System.Windows.Automation.AutomationProperties.SetAutomationId(border, "notif-" + n.Id);
            var item = n;
            border.MouseLeftButtonUp += (_, _) =>
            {
                if (!item.Read)
                {
                    _services.Data.MarkNotificationRead(item.Id);
                    BuildBellList();
                    UpdateBadges();
                }
                var link = item.Link.TrimStart('/');
                if (link.Length > 0)
                {
                    BellPopup.IsOpen = false;
                    ShowPage(link);
                }
            };
            BellList.Children.Add(border);
        }
    }

    private readonly HashSet<string> _seenNotifications = new();
    private bool _assignmentToastSeeded;

    private void WatchAssignments()
    {
        if (!IsLoaded) return;
        try
        {
            var unread = _services.Data.Notifications.Where(n => !n.Read).ToList();
            var fresh = unread.Where(n => !_seenNotifications.Contains(n.Id)).ToList();
            foreach (var n in unread) _seenNotifications.Add(n.Id);
            var orders = unread.Where(n => n.Kind == "workorder").ToList();

            if (!_assignmentToastSeeded)
            {
                _assignmentToastSeeded = true;
                if (orders.Count > 0) ShowAssignmentDialog(orders);
                return;
            }

            if (fresh.Any(n => n.Kind == "workorder") && orders.Count > 0) ShowAssignmentDialog(orders);
        }
        catch
        {
            // 提示失败不影响主界面
        }
    }

    private void ShowAssignmentDialog(IReadOnlyList<NotificationInfo> orders)
    {
        if (orders.Count == 0) return;
        FlashTaskbar();
        var dlg = new AssignmentDialog(this, orders[orders.Count - 1], orders.Count) { Owner = this };
        if (dlg.ShowDialog() == true)
        {
            _services.Data.MarkNotificationRead(orders[orders.Count - 1].Id);
            UpdateBadges();
            ShowPage("workorders");
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private void FlashTaskbar()
    {
        try
        {
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (handle == IntPtr.Zero) return;
            var info = new FLASHWINFO
            {
                cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<FLASHWINFO>(),
                hwnd = handle,
                dwFlags = 0x00000003 | 0x0000000C,
                uCount = 4,
                dwTimeout = 0,
            };
            FlashWindowEx(ref info);
        }
        catch { }
    }

    private void OnAssignmentToastClose(object sender, RoutedEventArgs e)
    {
        AssignmentToast.Visibility = Visibility.Collapsed;
    }

    private void OnAssignmentToastView(object sender, RoutedEventArgs e)
    {
        AssignmentToast.Visibility = Visibility.Collapsed;
        ShowPage("workorders");
    }

    private void OnMarkReadClick(object sender, RoutedEventArgs e)
    {
        _services.Data.MarkNotificationsRead();
        BuildBellList();
        UpdateBadges();
        Toast("已将通知标为已读");
    }

    private void OnUserClick(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = true;
    }

    // ── 版本更新 ────────────────────────────────────────────────
    private void ScheduleStartupUpdateCheck()
    {
        var settings = UpdateService.LoadSettings();
        if (!settings.AutoCheck) return;
        // 1 小时内查过就跳过；这个窗口只用来避免反复弹窗，不能像以前那样把失败也锁 6 小时
        if (DateTime.TryParse(settings.LastCheckUtc, out var last) &&
            (DateTime.UtcNow - last.ToUniversalTime()).TotalHours < 1) return;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(7) };
        timer.Tick += async (_, _) =>
        {
            timer.Stop();
            await CheckUpdatesAsync(false);
        };
        timer.Start();
    }

    private async void OnCheckUpdateClick(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = false;
        await CheckUpdatesAsync(true);
    }

    private void OnUpdateLinkClick(object sender, RoutedEventArgs e)
    {
        if (_pendingUpdate != null) OpenUpdateDialog();
    }

    private async Task CheckUpdatesAsync(bool manual)
    {
        if (_updateChecking) return;
        _updateChecking = true;
        try
        {
            UpdateInfo? info;
            try
            {
                info = await UpdateService.CheckAsync();
            }
            catch (Exception ex)
            {
                // 检查失败不写 LastCheckUtc：否则一次网络抖动就白白锁住后台检查
                UpdateService.Log("检查失败：" + ex.Message);
                if (manual &&
                    Dlg.Confirm(this, "检查更新", "检查更新失败：" + ex.Message + "\n\n要打开发布页手动下载吗？", "打开发布页"))
                {
                    try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(UpdateService.ReleasesPage) { UseShellExecute = true }); }
                    catch { }
                }
                return;
            }

            var settings = UpdateService.LoadSettings();
            settings.LastCheckUtc = DateTime.UtcNow.ToString("O");
            UpdateService.SaveSettings(settings);

            if (info == null)
            {
                UpdateService.Log("检查成功：已是最新 v" + UpdateService.CurrentVersionText);
                _pendingUpdate = null;
                UpdateLink.Visibility = Visibility.Collapsed;
                if (manual) Toast("当前已是最新版本 v" + UpdateService.CurrentVersionText);
                return;
            }

            UpdateService.Log("检查成功：发现新版本 v" + info.Version.ToString(3));
            _pendingUpdate = info;
            UpdateLink.Content = "新版本 v" + info.Version.ToString(3) + " 可用";
            UpdateLink.Visibility = Visibility.Visible;
            if (manual) OpenUpdateDialog();
            else
            {
                Toast("发现新版本 v" + info.Version.ToString(3), true);
                // 启动时的自动检查也直接把更新窗弹出来，避免用户只看到角落里的小字而错过升级。
                OpenUpdateDialog();
            }
        }
        finally
        {
            _updateChecking = false;
        }
    }

    private void OpenUpdateDialog()
    {
        if (_pendingUpdate == null) return;
        var dlg = new UpdateDialog(this, _pendingUpdate, UpdateService.LoadSettings());
        dlg.ShowDialog();
    }

    private void OnChangePasswordClick(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = false;
        var dlg = new FormDialog(this, "修改密码", "原密码为 water123；新密码至少 6 位。");
        var oldBox = dlg.AddPassword("原密码");
        var newBox = dlg.AddPassword("新密码");
        var confirmBox = dlg.AddPassword("确认新密码");
        var ok = dlg.Ask("保存", false, "取消", () =>
        {
            if (oldBox.Password.Length == 0) return "请输入原密码";
            if (newBox.Password.Length < 6) return "新密码至少 6 位";
            if (newBox.Password != confirmBox.Password) return "两次输入的新密码不一致";
            return null;
        });
        if (!ok) return;
        var result = _services.Data.ChangePassword(oldBox.Password, newBox.Password);
        Toast(result.Message, result.Ok);
        if (result.Ok) UpdateBadges();
    }

    private void OnLogoutClick(object sender, RoutedEventArgs e)
    {
        UserPopup.IsOpen = false;
        if (!Dlg.Confirm(this, "退出登录", "确定退出当前账号并返回登录页？", "退出登录", true)) return;
        _loggingOut = true;
        _services.Data.Logout();
        App.ShowLogin();
        Close();
    }

    public void Toast(string message, bool ok = true)
    {
        ToastText.Text = (ok ? "" : "✕ ") + message;
        ToastPanel.Background = new System.Windows.Media.SolidColorBrush(
            ok ? System.Windows.Media.Color.FromRgb(0x1E, 0x2A, 0x31) : System.Windows.Media.Color.FromRgb(0x7F, 0x2B, 0x22));
        ToastPanel.Visibility = Visibility.Visible;
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _clockTimer.Stop();
        _refreshTimer.Stop();
        _toastTimer.Stop();
        _services.ToastRequested -= OnToastRequested;
        _services.Data.DataChanged -= OnDataChanged;
        if (!_loggingOut) Application.Current.Shutdown(0);
    }

    /// <summary>供 --smoke 使用：构造并布局全部页面，验证控件树可构建。</summary>
    internal int SmokeExercisePages(string? shotDir = null)
    {
        var count = 0;
        foreach (var nav in NavItems)
        {
            var page = PageFactory.Create(nav.Id, _services, this);
            PageHost.Content = page;
            page.RefreshPage();
            page.Measure(new Size(1180, 700));
            page.Arrange(new Rect(0, 0, 1180, 700));
            page.UpdateLayout();
            if (shotDir != null)
                Smoke.CaptureElement(page, 1228, 860, Path.Combine(shotDir, "page-" + nav.Id + ".png"));
            count++;
        }
        ShowPage("dashboard");
        return count;
    }
}
